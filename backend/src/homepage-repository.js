import crypto from "crypto";
import { query, withTransaction } from "./db.js";
import { HttpError } from "./http-error.js";
import { assertHomepageRevision } from "./homepage-service.js";
import {
  mapHomepageJob,
  mapStationSiteDraft,
  parseJson,
  sqlLimit,
  toIso,
} from "./repository-mappers.js";

const mapHomepageJobRecord = (row) => ({
  ...mapHomepageJob(row),
  prompt: row.prompt || "",
  idempotencyKey: row.idempotency_key || "",
});

const mapHomepageRelease = (row) => ({
  id: row.id,
  userId: row.user_id,
  draftId: row.draft_id,
  revision: Number(row.revision || 1),
  snapshot: parseJson(row.snapshot, {}),
  selectedMediaAssetIds: parseJson(row.selected_media_asset_ids, []),
  visibility: row.visibility || "private",
  createdAt: toIso(row.created_at),
});

const mapHomepageSite = (row) => row ? ({
  userId: row.user_id,
  currentDraftId: row.current_draft_id || null,
  publishedReleaseId: row.published_release_id || null,
  visibility: row.visibility || "private",
  shareToken: row.share_token || null,
  publishedAt: toIso(row.published_at),
  unpublishedAt: toIso(row.unpublished_at),
  createdAt: toIso(row.created_at),
  updatedAt: toIso(row.updated_at),
}) : null;

export function createHomepageRepository({
  queryFn = query,
  transactionFn = withTransaction,
  randomUUID = crypto.randomUUID,
} = {}) {
  const createGenerationJob = async ({
    userId,
    prompt,
    mediaAssetIds,
    idempotencyKey,
  }) => {
    const id = randomUUID();
    const inserted = await queryFn(
      `INSERT INTO station_site_generation_jobs
        (id, user_id, idempotency_key, prompt, selected_media_asset_ids)
      VALUES (?, ?, ?, ?, ?::jsonb)
      ON CONFLICT (user_id, idempotency_key) DO NOTHING
      RETURNING *`,
      [id, userId, idempotencyKey, prompt, JSON.stringify(mediaAssetIds)],
    );
    if (inserted.length) {
      return { created: true, job: mapHomepageJob(inserted[0]) };
    }

    const existing = await queryFn(
      `SELECT * FROM station_site_generation_jobs
      WHERE user_id = ? AND idempotency_key = ?
      LIMIT 1`,
      [userId, idempotencyKey],
    );
    if (!existing.length) {
      throw new HttpError(409, "Homepage generation request could not be recovered.");
    }
    return { created: false, job: mapHomepageJob(existing[0]) };
  };

  const listGenerationJobs = async ({ userId, limit = 10 }) => {
    const safeLimit = sqlLimit(limit, 10, 30);
    const rows = await queryFn(
      `SELECT * FROM station_site_generation_jobs
      WHERE user_id = ?
      ORDER BY created_at DESC
      LIMIT ${safeLimit}`,
      [userId],
    );
    return rows.map(mapHomepageJob);
  };

  const requeueStaleGenerationJobs = async ({ staleBefore }) => {
    const rows = await queryFn(
      `UPDATE station_site_generation_jobs
      SET status = 'queued', progress = 0, error_message = NULL
      WHERE status = 'running' AND updated_at < ?
      RETURNING id, user_id`,
      [staleBefore],
    );
    return rows.map((row) => ({ id: row.id, userId: row.user_id }));
  };

  const listQueuedGenerationJobs = async ({ limit = 4 } = {}) => {
    const safeLimit = sqlLimit(limit, 4, 20);
    const rows = await queryFn(
      `SELECT id, user_id
      FROM station_site_generation_jobs
      WHERE status = 'queued'
      ORDER BY created_at ASC
      LIMIT ${safeLimit}`,
    );
    return rows.map((row) => ({ id: row.id, userId: row.user_id }));
  };

  const getGenerationJob = async ({ userId, jobId, includePrivate = false }) => {
    const rows = await queryFn(
      `SELECT * FROM station_site_generation_jobs
      WHERE id = ? AND user_id = ?
      LIMIT 1`,
      [jobId, userId],
    );
    if (!rows.length) return null;
    return includePrivate ? mapHomepageJobRecord(rows[0]) : mapHomepageJob(rows[0]);
  };

  const claimGenerationJob = async ({ userId, jobId }) => {
    const rows = await queryFn(
      `UPDATE station_site_generation_jobs
      SET status = 'running', progress = 10, error_message = NULL
      WHERE id = ? AND user_id = ? AND status = 'queued'
      RETURNING *`,
      [jobId, userId],
    );
    return rows[0] ? mapHomepageJobRecord(rows[0]) : null;
  };

  const completeGenerationJob = async ({
    userId,
    jobId,
    prompt,
    mediaAssetIds,
    draft,
    source,
    model = {},
  }) => {
    const draftId = randomUUID();
    let result;
    await transactionFn(async (connection) => {
      const [jobRows] = await connection.execute(
        `SELECT * FROM station_site_generation_jobs
        WHERE id = ? AND user_id = ?
        LIMIT 1 FOR UPDATE`,
        [jobId, userId],
      );
      if (!jobRows.length) throw new HttpError(404, "Homepage generation job not found.");
      if (jobRows[0].site_draft_id) {
        const [existingRows] = await connection.execute(
          "SELECT * FROM station_site_drafts WHERE id = ? AND user_id = ? LIMIT 1",
          [jobRows[0].site_draft_id, userId],
        );
        result = {
          job: mapHomepageJob(jobRows[0]),
          siteDraft: existingRows[0] ? mapStationSiteDraft(existingRows[0]) : null,
        };
        return;
      }

      const [draftRows] = await connection.execute(
        `INSERT INTO station_site_drafts
          (id, user_id, prompt, draft, revision, selected_media_asset_ids, source,
           model_provider, model_missing, model_error)
        VALUES (?, ?, ?, ?::jsonb, 1, ?::jsonb, ?, ?, ?::jsonb, ?)
        RETURNING *`,
        [
          draftId,
          userId,
          prompt,
          JSON.stringify(draft),
          JSON.stringify(mediaAssetIds),
          source === "model" ? "model" : "fallback",
          model.provider || "",
          JSON.stringify(Array.isArray(model.missing) ? model.missing : []),
          model.error || "",
        ],
      );
      const [completedRows] = await connection.execute(
        `UPDATE station_site_generation_jobs
        SET status = ?, progress = 100, site_draft_id = ?, source = ?,
          error_message = NULL, finished_at = CURRENT_TIMESTAMP
        WHERE id = ? AND user_id = ?
        RETURNING *`,
        [source === "model" ? "succeeded" : "fallback", draftId, source, jobId, userId],
      );
      await connection.execute(
        `INSERT INTO station_sites (user_id, current_draft_id, visibility)
        VALUES (?, ?, 'private')
        ON CONFLICT (user_id) DO UPDATE SET current_draft_id = EXCLUDED.current_draft_id`,
        [userId, draftId],
      );
      result = {
        job: mapHomepageJob(completedRows[0]),
        siteDraft: mapStationSiteDraft(draftRows[0]),
      };
    });
    return result;
  };

  const failGenerationJob = async ({ userId, jobId, errorMessage = "" }) => {
    const rows = await queryFn(
      `UPDATE station_site_generation_jobs
      SET status = 'failed', progress = 100, error_message = ?, finished_at = CURRENT_TIMESTAMP
      WHERE id = ? AND user_id = ?
      RETURNING *`,
      [String(errorMessage || "").slice(0, 500), jobId, userId],
    );
    return rows[0] ? mapHomepageJob(rows[0]) : null;
  };

  const getDraft = async ({ userId, draftId }) => {
    const rows = await queryFn(
      `SELECT * FROM station_site_drafts
      WHERE id = ? AND user_id = ? AND deleted_at IS NULL
      LIMIT 1`,
      [draftId, userId],
    );
    return rows[0] ? mapStationSiteDraft(rows[0]) : null;
  };

  const replaceDraft = async ({ userId, draftId, expectedRevision, draft }) => {
    let updated;
    await transactionFn(async (connection) => {
      const [rows] = await connection.execute(
        `SELECT * FROM station_site_drafts
        WHERE id = ? AND user_id = ? AND deleted_at IS NULL
        LIMIT 1 FOR UPDATE`,
        [draftId, userId],
      );
      if (!rows.length) throw new HttpError(404, "Homepage draft not found.");
      assertHomepageRevision(rows[0].revision, expectedRevision);
      const [updatedRows] = await connection.execute(
        `UPDATE station_site_drafts
        SET draft = ?::jsonb, revision = revision + 1, status = 'draft'
        WHERE id = ? AND user_id = ?
        RETURNING *`,
        [JSON.stringify(draft), draftId, userId],
      );
      await connection.execute(
        `INSERT INTO station_sites (user_id, current_draft_id, visibility)
        VALUES (?, ?, 'private')
        ON CONFLICT (user_id) DO UPDATE SET current_draft_id = EXCLUDED.current_draft_id`,
        [userId, draftId],
      );
      updated = mapStationSiteDraft(updatedRows[0]);
    });
    return updated;
  };

  const savePreviewToken = async ({ tokenHash, userId, draftId, draftRevision, expiresAt }) => {
    await queryFn(
      `INSERT INTO station_site_preview_tokens
        (token_hash, user_id, draft_id, draft_revision, expires_at)
      VALUES (?, ?, ?, ?, ?)`,
      [tokenHash, userId, draftId, draftRevision, expiresAt],
    );
    return { expiresAt: toIso(expiresAt) };
  };

  const getPreviewRecord = async ({ tokenHash }) => {
    const rows = await queryFn(
      `SELECT
        t.expires_at, t.revoked_at, t.draft_revision,
        d.id AS draft_id, d.user_id, d.draft AS draft_json,
        d.revision, d.selected_media_asset_ids,
        p.nickname, p.avatar_text, p.bio
      FROM station_site_preview_tokens t
      JOIN station_site_drafts d ON d.id = t.draft_id AND d.user_id = t.user_id
      JOIN user_profiles p ON p.user_id = t.user_id
      WHERE t.token_hash = ? AND t.revoked_at IS NULL AND t.expires_at > CURRENT_TIMESTAMP
        AND d.deleted_at IS NULL
      LIMIT 1`,
      [tokenHash],
    );
    if (!rows.length) return null;
    const row = rows[0];
    return {
      userId: row.user_id,
      draftId: row.draft_id,
      tokenRevision: Number(row.draft_revision),
      revision: Number(row.revision),
      draft: parseJson(row.draft_json, {}),
      selectedMediaAssetIds: parseJson(row.selected_media_asset_ids, []),
      expiresAt: toIso(row.expires_at),
      profile: {
        nickname: row.nickname || "",
        avatarText: row.avatar_text || "",
        bio: row.bio || "",
      },
    };
  };

  const publishDraft = async ({
    userId,
    draftId,
    expectedRevision,
    visibility,
    shareToken,
  }) => {
    const releaseId = randomUUID();
    let result;
    await transactionFn(async (connection) => {
      const [draftRows] = await connection.execute(
        `SELECT * FROM station_site_drafts
        WHERE id = ? AND user_id = ? AND deleted_at IS NULL
        LIMIT 1 FOR UPDATE`,
        [draftId, userId],
      );
      if (!draftRows.length) throw new HttpError(404, "Homepage draft not found.");
      assertHomepageRevision(draftRows[0].revision, expectedRevision);
      const draftRow = draftRows[0];

      const [releaseRows] = await connection.execute(
        `INSERT INTO station_site_releases
          (id, user_id, draft_id, revision, snapshot, selected_media_asset_ids, visibility)
        VALUES (?, ?, ?, ?, ?::jsonb, ?::jsonb, ?)
        RETURNING *`,
        [
          releaseId,
          userId,
          draftId,
          draftRow.revision,
          JSON.stringify(parseJson(draftRow.draft, {})),
          JSON.stringify(parseJson(draftRow.selected_media_asset_ids, [])),
          visibility,
        ],
      );
      await connection.execute(
        `UPDATE station_site_drafts SET status = 'draft'
        WHERE user_id = ? AND status = 'applied' AND id <> ?`,
        [userId, draftId],
      );
      await connection.execute(
        `UPDATE station_site_drafts SET status = 'applied'
        WHERE id = ? AND user_id = ?`,
        [draftId, userId],
      );
      await connection.execute(
        `UPDATE user_profiles
        SET station_config = COALESCE(station_config, '{}'::jsonb)
          || jsonb_build_object('siteLayout', ?::jsonb, 'siteDraftId', ?::text)
        WHERE user_id = ?`,
        [JSON.stringify(parseJson(draftRow.draft, {})), draftId, userId],
      );
      const [siteRows] = await connection.execute(
        `INSERT INTO station_sites
          (user_id, current_draft_id, published_release_id, visibility, share_token,
           published_at, unpublished_at)
        VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP, NULL)
        ON CONFLICT (user_id) DO UPDATE SET
          current_draft_id = EXCLUDED.current_draft_id,
          published_release_id = EXCLUDED.published_release_id,
          visibility = EXCLUDED.visibility,
          share_token = EXCLUDED.share_token,
          published_at = CURRENT_TIMESTAMP,
          unpublished_at = NULL
        RETURNING *`,
        [
          userId,
          draftId,
          releaseId,
          visibility,
          visibility === "link" ? shareToken : null,
        ],
      );
      result = {
        site: mapHomepageSite(siteRows[0]),
        release: mapHomepageRelease(releaseRows[0]),
        siteDraft: mapStationSiteDraft(draftRow),
      };
    });
    return result;
  };

  const unpublish = async ({ userId }) => {
    const rows = await queryFn(
      `UPDATE station_sites
      SET published_release_id = NULL, visibility = 'private', share_token = NULL,
        unpublished_at = CURRENT_TIMESTAMP
      WHERE user_id = ?
      RETURNING *`,
      [userId],
    );
    return mapHomepageSite(rows[0]);
  };

  const getSite = async ({ userId }) => {
    const rows = await queryFn("SELECT * FROM station_sites WHERE user_id = ? LIMIT 1", [userId]);
    return mapHomepageSite(rows[0]);
  };

  const getShareRecord = async ({ shareToken }) => {
    const rows = await queryFn(
      `SELECT
        s.user_id, s.visibility, s.published_at,
        r.id AS release_id, r.snapshot, r.selected_media_asset_ids,
        p.nickname, p.avatar_text, p.bio
      FROM station_sites s
      JOIN station_site_releases r ON r.id = s.published_release_id AND r.user_id = s.user_id
      JOIN user_profiles p ON p.user_id = s.user_id
      WHERE s.share_token = ? AND s.visibility = 'link'
      LIMIT 1`,
      [shareToken],
    );
    if (!rows.length) return null;
    const row = rows[0];
    return {
      userId: row.user_id,
      releaseId: row.release_id,
      draft: parseJson(row.snapshot, {}),
      selectedMediaAssetIds: parseJson(row.selected_media_asset_ids, []),
      visibility: "link",
      publishedAt: toIso(row.published_at),
      profile: {
        nickname: row.nickname || "",
        avatarText: row.avatar_text || "",
        bio: row.bio || "",
      },
    };
  };

  const listReleases = async ({ userId, limit = 10 }) => {
    const safeLimit = sqlLimit(limit, 10, 10);
    const rows = await queryFn(
      `SELECT * FROM station_site_releases
      WHERE user_id = ?
      ORDER BY created_at DESC
      LIMIT ${safeLimit}`,
      [userId],
    );
    return rows.map(mapHomepageRelease);
  };

  const restoreRelease = async ({ userId, releaseId }) => {
    const draftId = randomUUID();
    let restored;
    await transactionFn(async (connection) => {
      const [releaseRows] = await connection.execute(
        `SELECT * FROM station_site_releases
        WHERE id = ? AND user_id = ?
        LIMIT 1 FOR UPDATE`,
        [releaseId, userId],
      );
      if (!releaseRows.length) throw new HttpError(404, "Homepage release not found.");
      const release = releaseRows[0];
      const [draftRows] = await connection.execute(
        `INSERT INTO station_site_drafts
          (id, user_id, prompt, draft, revision, selected_media_asset_ids, source)
        VALUES (?, ?, '从历史版本恢复', ?::jsonb, 1, ?::jsonb, 'fallback')
        RETURNING *`,
        [draftId, userId, JSON.stringify(parseJson(release.snapshot, {})), JSON.stringify(parseJson(release.selected_media_asset_ids, []))],
      );
      await connection.execute(
        `INSERT INTO station_sites (user_id, current_draft_id, visibility)
        VALUES (?, ?, 'private')
        ON CONFLICT (user_id) DO UPDATE SET current_draft_id = EXCLUDED.current_draft_id`,
        [userId, draftId],
      );
      restored = mapStationSiteDraft(draftRows[0]);
    });
    return restored;
  };

  return {
    createGenerationJob,
    listGenerationJobs,
    requeueStaleGenerationJobs,
    listQueuedGenerationJobs,
    getGenerationJob,
    claimGenerationJob,
    completeGenerationJob,
    failGenerationJob,
    getDraft,
    replaceDraft,
    savePreviewToken,
    getPreviewRecord,
    publishDraft,
    unpublish,
    getSite,
    getShareRecord,
    listReleases,
    restoreRelease,
  };
}

export const homepageRepository = createHomepageRepository();
