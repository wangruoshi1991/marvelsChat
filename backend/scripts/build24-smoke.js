import crypto from "node:crypto";

const baseUrl = String(process.env.SMOKE_BASE_URL || "").replace(/\/+$/, "");
const email = String(process.env.SMOKE_EMAIL || "").trim().toLowerCase();
const policyVersion = String(
  process.env.SMOKE_POLICY_VERSION || "2026-07-15",
).trim();
const destructiveSmokeAllowed =
  process.env.ALLOW_DESTRUCTIVE_SMOKE === "true";

if (!baseUrl) {
  throw new Error("SMOKE_BASE_URL is required.");
}
if (!/^build24-smoke-[a-z0-9-]+@example\.com$/.test(email)) {
  throw new Error(
    "SMOKE_EMAIL must be a dedicated build24-smoke-* account at example.com.",
  );
}
if (!destructiveSmokeAllowed) {
  throw new Error("ALLOW_DESTRUCTIVE_SMOKE=true is required.");
}

const password = `${crypto.randomBytes(18).toString("base64url")}Aa`;
const suffix = email.slice("build24-smoke-".length, email.indexOf("@"));
const displayName = `Build24 Smoke ${suffix}`.slice(0, 40);
const png = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9ZQmcAAAAASUVORK5CYII=",
  "base64",
);

let token = "";
let accountCreated = false;
let accountDeleted = false;

class SmokeError extends Error {
  constructor(step, status = null, requestId = "") {
    super(step);
    this.name = "SmokeError";
    this.step = step;
    this.status = status;
    this.requestId = requestId;
  }
}

const report = (step, fields = {}) => {
  console.log(JSON.stringify({ step, ...fields }));
};

const sleep = (milliseconds) =>
  new Promise((resolve) => setTimeout(resolve, milliseconds));

async function apiRequest(
  step,
  path,
  {
    method = "GET",
    body,
    expected = [200],
    authenticate = true,
  } = {},
) {
  const response = await fetch(`${baseUrl}${path}`, {
    method,
    headers: {
      ...(body === undefined ? {} : { "content-type": "application/json" }),
      ...(authenticate && token
        ? { Authorization: `Bearer ${token}` }
        : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(30_000),
  });
  const requestId = response.headers.get("x-request-id") || "";
  const contentType = response.headers.get("content-type") || "";
  const payload = contentType.includes("application/json")
    ? await response.json()
    : null;

  report(step, { status: response.status, requestId });
  if (!expected.includes(response.status)) {
    throw new SmokeError(step, response.status, requestId);
  }
  return payload?.data ?? null;
}

async function deleteSmokeAccount({ cleanup = false } = {}) {
  if (!accountCreated || accountDeleted || !token) return;
  const step = cleanup ? "cleanup.accountDelete" : "accountDelete";
  await apiRequest(step, "/api/account", {
    method: "DELETE",
    body: { password, confirmation: "DELETE" },
  });
  accountDeleted = true;
  token = "";
}

async function createUploadedPhoto(index) {
  const asset = await apiRequest(`media.${index}.create`, "/api/station/media-assets", {
    method: "POST",
    expected: [201],
    body: {
      kind: "image",
      originalFilename: `build24-smoke-${index}.png`,
      mimeType: "image/png",
      byteSize: png.byteLength,
      width: 1,
      height: 1,
      caption: `Build 24 smoke photo ${index}`,
      tags: ["build24-smoke"],
      metadata: { purpose: "build24-smoke" },
    },
  });
  const prepared = await apiRequest(
    `media.${index}.prepare`,
    `/api/station/media-assets/${encodeURIComponent(asset.id)}/upload-url`,
    {
      method: "POST",
      body: { mimeType: "image/png", byteSize: png.byteLength },
    },
  );
  const upload = await fetch(prepared.upload.url, {
    method: prepared.upload.method,
    headers: prepared.upload.headers,
    body: png,
    signal: AbortSignal.timeout(30_000),
  });
  report(`media.${index}.upload`, { status: upload.status });
  if (!upload.ok) {
    throw new SmokeError(`media.${index}.upload`, upload.status);
  }
  const completed = await apiRequest(
    `media.${index}.complete`,
    `/api/station/media-assets/${encodeURIComponent(asset.id)}/upload-complete`,
    {
      method: "POST",
      body: { storageKey: prepared.upload.objectKey },
    },
  );
  if (completed.status !== "uploaded") {
    throw new SmokeError(`media.${index}.complete-status`);
  }
  return asset.id;
}

async function run() {
  const registered = await apiRequest("register", "/api/auth/register", {
    method: "POST",
    expected: [201],
    authenticate: false,
    body: {
      contactType: "email",
      email,
      password,
      displayName,
      consent: {
        privacyPolicyVersion: policyVersion,
        termsVersion: policyVersion,
        privacyAccepted: true,
        termsAccepted: true,
      },
    },
  });
  token = registered?.session?.token || "";
  accountCreated = true;
  if (!token) throw new SmokeError("register.session");

  const bootstrap = await apiRequest("bootstrap", "/api/app/bootstrap");
  if (bootstrap?.features?.homepageV1?.enabled !== true) {
    throw new SmokeError("bootstrap.homepage-disabled");
  }

  const mediaAssetIds = [];
  for (let index = 1; index <= 3; index += 1) {
    mediaAssetIds.push(await createUploadedPhoto(index));
  }

  const idempotencyKey = `build24-smoke:${suffix}`;
  const generationPayload = {
    prompt: "为内部验收创建一个简洁的中文个人主页。",
    mediaAssetIds,
    idempotencyKey,
  };
  const created = await apiRequest("homepageJob.create", "/api/station/homepage-jobs", {
    method: "POST",
    expected: [202],
    body: generationPayload,
  });
  const duplicate = await apiRequest(
    "homepageJob.idempotent",
    "/api/station/homepage-jobs",
    { method: "POST", expected: [202], body: generationPayload },
  );
  if (
    !created?.created ||
    duplicate?.created !== false ||
    created?.job?.id !== duplicate?.job?.id
  ) {
    throw new SmokeError("homepageJob.idempotency");
  }

  let job = created.job;
  const pollingDeadline = Date.now() + 45_000;
  while (["queued", "running"].includes(job.status)) {
    if (Date.now() >= pollingDeadline) {
      throw new SmokeError("homepageJob.timeout");
    }
    await sleep(1_000);
    job = await apiRequest(
      "homepageJob.poll",
      `/api/station/homepage-jobs/${encodeURIComponent(job.id)}`,
    );
  }
  report("homepageJob.result", {
    status: job.status,
    source: job.source || null,
  });
  if (job.status !== "completed" || !job.siteDraftId) {
    throw new SmokeError("homepageJob.result");
  }

  const draftPath = `/api/station/site-drafts/${encodeURIComponent(job.siteDraftId)}`;
  const initialDraft = await apiRequest("homepageDraft.read", draftPath);
  const stalePreview = await apiRequest(
    "homepagePreview.createStale",
    `${draftPath}/preview-token`,
    { method: "POST", expected: [201] },
  );
  const stalePreviewToken = new URL(stalePreview.previewUrl).pathname
    .split("/")
    .filter(Boolean)
    .at(-1);
  await apiRequest(
    "homepagePreview.readStale",
    `/api/homepage-previews/${encodeURIComponent(stalePreviewToken)}`,
    { authenticate: false },
  );

  const updatedDraft = await apiRequest("homepageDraft.update", draftPath, {
    method: "PATCH",
    body: { revision: initialDraft.revision, draft: initialDraft.draft },
  });
  await apiRequest(
    "homepagePreview.invalidated",
    `/api/homepage-previews/${encodeURIComponent(stalePreviewToken)}`,
    { authenticate: false, expected: [410] },
  );
  await apiRequest("homepageDraft.conflict", draftPath, {
    method: "PATCH",
    body: { revision: initialDraft.revision, draft: initialDraft.draft },
    expected: [409],
  });

  const preview = await apiRequest(
    "homepagePreview.create",
    `${draftPath}/preview-token`,
    { method: "POST", expected: [201] },
  );
  const previewPage = await fetch(preview.previewUrl, {
    signal: AbortSignal.timeout(30_000),
  });
  report("homepagePreview.page", { status: previewPage.status });
  if (!previewPage.ok) throw new SmokeError("homepagePreview.page", previewPage.status);

  const published = await apiRequest("homepage.publish", `${draftPath}/publish`, {
    method: "POST",
    body: { revision: updatedDraft.revision, visibility: "link" },
  });
  const shareUrl = published?.site?.shareUrl || "";
  const shareToken = new URL(shareUrl).pathname.split("/").filter(Boolean).at(-1);
  await apiRequest(
    "homepageShare.read",
    `/api/homepage-shares/${encodeURIComponent(shareToken)}`,
    { authenticate: false },
  );
  const sharePage = await fetch(shareUrl, {
    signal: AbortSignal.timeout(30_000),
  });
  report("homepageShare.page", { status: sharePage.status });
  if (!sharePage.ok) throw new SmokeError("homepageShare.page", sharePage.status);

  await apiRequest("homepage.unpublish", "/api/station/site/unpublish", {
    method: "POST",
  });
  await apiRequest(
    "homepageShare.revoked",
    `/api/homepage-shares/${encodeURIComponent(shareToken)}`,
    { authenticate: false, expected: [404] },
  );

  const releases = await apiRequest(
    "homepageReleases.list",
    "/api/station/site/releases?limit=10",
  );
  if (!Array.isArray(releases) || releases.length !== 1) {
    throw new SmokeError("homepageReleases.count");
  }
  await apiRequest(
    "homepageRelease.restore",
    `/api/station/site/releases/${encodeURIComponent(releases[0].id)}/restore`,
    { method: "POST", expected: [201] },
  );

  await deleteSmokeAccount();
  await apiRequest("account.deletedLogin", "/api/auth/login", {
    method: "POST",
    authenticate: false,
    expected: [404],
    body: { identifier: email, password },
  });
  report("complete", { ok: true });
}

try {
  await run();
} catch (error) {
  report("failed", {
    errorName: error?.name || "Error",
    failedStep: error?.step || "unknown",
    status: error?.status || null,
    requestId: error?.requestId || "",
  });
  process.exitCode = 1;
} finally {
  if (accountCreated && !accountDeleted) {
    try {
      await deleteSmokeAccount({ cleanup: true });
    } catch (error) {
      report("cleanup.failed", {
        errorName: error?.name || "Error",
        failedStep: error?.step || "cleanup",
        status: error?.status || null,
        requestId: error?.requestId || "",
      });
      process.exitCode = 1;
    }
  }
}
