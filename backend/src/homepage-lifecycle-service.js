import { config } from "./config.js";
import { homepageRepository } from "./homepage-repository.js";
import {
  assertHomepageRevision,
  buildHomepagePageView,
  createHomepageAccessToken,
  generateHomepageDraft,
  hashHomepageAccessToken,
  normalizeHomepageDraft,
  selectExplicitHomepageMedia,
} from "./homepage-service.js";
import { HttpError } from "./http-error.js";
import { createOssGetSignedUrl } from "./oss-service.js";
import { buildSiteDraftResponse } from "./site-builder-service.js";
import {
  getProfileForUser,
  listStationMediaAssetsByIdsForUser,
} from "./station-repository.js";

const trimTrailingSlash = (value) => String(value || "").trim().replace(/\/+$/, "");

const requireRecord = (record, message) => {
  if (!record) throw new HttpError(404, message);
  return record;
};

const publicSite = (site, webBaseUrl) => {
  if (!site) return null;
  const { shareToken, ...safeSite } = site;
  return {
    ...safeSite,
    shareUrl:
      safeSite.visibility === "link" && shareToken
        ? `${webBaseUrl}/s/${shareToken}`
        : null,
  };
};

const publicDraft = (draft) => {
  if (!draft) return null;
  const {
    modelProvider: _modelProvider,
    modelMissing: _modelMissing,
    modelError: _modelError,
    ...safeDraft
  } = draft;
  return safeDraft;
};

export function createHomepageLifecycleService({
  repository = homepageRepository,
  getProfile = getProfileForUser,
  listMedia = listStationMediaAssetsByIdsForUser,
  runSiteBuilder = buildSiteDraftResponse,
  mediaUrl = (asset) => createOssGetSignedUrl({ objectKey: asset.storageKey }),
  accessTokenFactory = createHomepageAccessToken,
  tokenHasher = hashHomepageAccessToken,
  now = () => new Date(),
  deadlineMs = 20_000,
  previewTtlMs = config.homepage?.previewTtlMs || 5 * 60 * 1000,
  webBaseUrl = config.homepage?.webBaseUrl || config.publicApiBaseUrl,
} = {}) {
  const normalizedWebBaseUrl = trimTrailingSlash(webBaseUrl);

  const loadSelectedMedia = async ({ userId, mediaAssetIds }) => {
    const assets = await listMedia({ userId, mediaAssetIds });
    return selectExplicitHomepageMedia({ mediaAssetIds, mediaAssets: assets });
  };

  const createGenerationJob = async ({ user, payload }) => {
    await loadSelectedMedia({ userId: user.id, mediaAssetIds: payload.mediaAssetIds });
    return repository.createGenerationJob({
      userId: user.id,
      prompt: payload.prompt,
      mediaAssetIds: payload.mediaAssetIds,
      idempotencyKey: payload.idempotencyKey,
    });
  };

  const processGenerationJob = async ({ user, jobId }) => {
    const claimed = await repository.claimGenerationJob({ userId: user.id, jobId });
    if (!claimed) {
      const existing = await repository.getGenerationJob?.({ userId: user.id, jobId });
      requireRecord(existing, "Homepage generation job not found.");
      return { job: existing };
    }

    try {
      const profile = (await getProfile(user.id)) || {
        nickname: user.displayName || "我",
        avatarText: "",
        bio: "",
        stationConfig: {},
      };
      const assets = await loadSelectedMedia({
        userId: user.id,
        mediaAssetIds: claimed.selectedMediaAssetIds,
      });
      let model = {};
      const generation = await generateHomepageDraft({
        prompt: claimed.prompt,
        profile,
        mediaAssets: assets,
        deadlineMs,
        runModel: async () => {
          const result = await runSiteBuilder({
            prompt: claimed.prompt,
            user,
            profile,
            mediaAssets: assets,
            stationContent: { mediaAssets: assets },
          });
          model = result?.model || {};
          return result;
        },
      });

      const completed = await repository.completeGenerationJob({
        userId: user.id,
        jobId,
        prompt: claimed.prompt,
        mediaAssetIds: claimed.selectedMediaAssetIds,
        draft: generation.draft,
        source: generation.source,
        model,
      });
      return { ...completed, siteDraft: publicDraft(completed.siteDraft) };
    } catch (error) {
      await repository.failGenerationJob({
        userId: user.id,
        jobId,
        errorMessage: "Homepage generation could not be saved.",
      });
      throw error;
    }
  };

  const issuePreviewToken = async ({ userId, draftId }) => {
    const draft = requireRecord(
      await repository.getDraft({ userId, draftId }),
      "Homepage draft not found.",
    );
    const { token, hash } = accessTokenFactory();
    const expiresAt = new Date(now().getTime() + previewTtlMs);
    await repository.savePreviewToken({
      tokenHash: hash,
      userId,
      draftId,
      draftRevision: draft.revision,
      expiresAt,
    });
    return {
      previewUrl: `${normalizedWebBaseUrl}/preview/${token}`,
      expiresAt: expiresAt.toISOString(),
    };
  };

  const getPreviewPage = async ({ token }) => {
    const record = requireRecord(
      await repository.getPreviewRecord({ tokenHash: tokenHasher(token) }),
      "Homepage preview is unavailable or expired.",
    );
    if (record.tokenRevision !== record.revision) {
      throw new HttpError(410, "Homepage preview expired because the draft changed.");
    }
    const assets = await listMedia({
      userId: record.userId,
      mediaAssetIds: record.selectedMediaAssetIds,
    });
    return buildHomepagePageView({
      mode: "preview",
      profile: record.profile,
      draft: record.draft,
      mediaAssets: assets,
      visibility: "private",
      mediaUrl,
    });
  };

  const replaceDraft = async ({ userId, draftId, revision, draft }) => {
    const current = requireRecord(
      await repository.getDraft({ userId, draftId }),
      "Homepage draft not found.",
    );
    assertHomepageRevision(current.revision, revision);
    const assets = await loadSelectedMedia({
      userId,
      mediaAssetIds: current.selectedMediaAssetIds,
    });
    const normalized = normalizeHomepageDraft(draft, {
      prompt: current.prompt,
      profile: await getProfile(userId),
      mediaAssets: assets,
    });
    return publicDraft(await repository.replaceDraft({
      userId,
      draftId,
      expectedRevision: revision,
      draft: normalized,
    }));
  };

  const refineSection = async ({ user, draftId, revision, sectionId, instruction }) => {
    const current = requireRecord(
      await repository.getDraft({ userId: user.id, draftId }),
      "Homepage draft not found.",
    );
    assertHomepageRevision(current.revision, revision);
    const target = current.draft.sections.find((item) => item.id === sectionId);
    if (!target) throw new HttpError(404, "Homepage section not found.");

    const profile = (await getProfile(user.id)) || {};
    const assets = await loadSelectedMedia({
      userId: user.id,
      mediaAssetIds: current.selectedMediaAssetIds,
    });
    const generation = await generateHomepageDraft({
      prompt: instruction,
      profile,
      mediaAssets: assets,
      deadlineMs,
      runModel: () => runSiteBuilder({
        prompt: `只修改个人主页模块 ${sectionId}：${instruction}`,
        user,
        profile,
        mediaAssets: assets,
        stationContent: {
          mediaAssets: assets,
          homepageDraft: current.draft,
          targetSectionId: sectionId,
        },
      }),
    });
    if (generation.source !== "model") {
      throw new HttpError(503, "Homepage refinement is temporarily unavailable.");
    }

    const candidate = generation.draft.sections.find((item) => item.id === sectionId)
      || generation.draft.sections.find((item) => item.type === target.type);
    if (!candidate) {
      throw new HttpError(422, "Homepage refinement did not return the requested section.");
    }
    const nextDraft = normalizeHomepageDraft({
      ...current.draft,
      sections: current.draft.sections.map((item) =>
        item.id === sectionId
          ? { ...candidate, id: item.id, type: item.type }
          : item),
    }, {
      prompt: current.prompt,
      profile,
      mediaAssets: assets,
    });
    const siteDraft = publicDraft(await repository.replaceDraft({
      userId: user.id,
      draftId,
      expectedRevision: revision,
      draft: nextDraft,
    }));
    return { source: "model", siteDraft };
  };

  const publish = async ({ userId, draftId, revision, visibility }) => {
    const draft = requireRecord(
      await repository.getDraft({ userId, draftId }),
      "Homepage draft not found.",
    );
    assertHomepageRevision(draft.revision, revision);
    await loadSelectedMedia({ userId, mediaAssetIds: draft.selectedMediaAssetIds });
    const shareToken = visibility === "link" ? accessTokenFactory().token : null;
    const result = await repository.publishDraft({
      userId,
      draftId,
      expectedRevision: revision,
      visibility,
      shareToken,
    });
    return {
      ...result,
      site: publicSite(result.site, normalizedWebBaseUrl),
      siteDraft: publicDraft(result.siteDraft),
    };
  };

  const unpublish = async ({ userId }) => ({
    site: publicSite(await repository.unpublish({ userId }), normalizedWebBaseUrl),
  });

  const getSharedPage = async ({ token }) => {
    const record = requireRecord(
      await repository.getShareRecord({ shareToken: token }),
      "Homepage share is unavailable.",
    );
    const assets = await listMedia({
      userId: record.userId,
      mediaAssetIds: record.selectedMediaAssetIds,
    });
    return buildHomepagePageView({
      mode: "share",
      profile: record.profile,
      draft: record.draft,
      mediaAssets: assets,
      visibility: record.visibility,
      publishedAt: record.publishedAt,
      mediaUrl,
    });
  };

  return {
    createGenerationJob,
    processGenerationJob,
    listGenerationJobs: ({ userId, limit }) => repository.listGenerationJobs({ userId, limit }),
    getGenerationJob: ({ userId, jobId }) => repository.getGenerationJob({ userId, jobId }),
    getDraft: async ({ userId, draftId }) => publicDraft(
      await repository.getDraft({ userId, draftId }),
    ),
    replaceDraft,
    refineSection,
    issuePreviewToken,
    getPreviewPage,
    publish,
    unpublish,
    getSite: async ({ userId }) => ({
      site: publicSite(await repository.getSite({ userId }), normalizedWebBaseUrl),
    }),
    getSharedPage,
    listReleases: ({ userId, limit }) => repository.listReleases({ userId, limit }),
    restoreRelease: async ({ userId, releaseId }) => publicDraft(
      await repository.restoreRelease({ userId, releaseId }),
    ),
  };
}

export const homepageLifecycleService = createHomepageLifecycleService();
