# 妙讯漫画图片生成 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a user explicitly queue per-frame comic image generation, track real asynchronous results, and read completed images from their private Miaoxun media library.

**Architecture:** Add a `comic_render` task kind to the durable AI queue while keeping it out of the legacy AI Task v1 DTO/list. A versioned comic-render API exposes a dedicated DTO and per-frame results. The AI Task Worker invokes an injected, independently configured image Provider, validates image bytes, and stores output through private OSS-backed `station_media_assets`. Registry scopes, readiness, consent, RN UI, migrations, tests, and handoff docs move together. No production provider adapter is guessed before its actual API contract is verified.

**Tech Stack:** Node.js 20+, Express, PostgreSQL migrations, Zod, existing `sharp` and OSS helpers, React Native TypeScript/Jest, Agent registry and product entitlements.

**Spec:** `docs/superpowers/specs/2026-11-10-comic-image-generation-design.md`

## Global Constraints

- The feature is off until a verified image Provider contract, server configuration, worker executor, and private storage are all ready.
- Do not reuse `NEW_API_*`, `DASHSCOPE_*`, `MEDIA_RETRIEVAL_DASHSCOPE_*`, or `OSS_*` as image-model credentials/configuration.
- Never place provider credentials in Agent files, PostgreSQL task input, RN/Admin forms, logs, or docs.
- Only render a comic when its owner explicitly starts a task; saving a storyboard never calls an image Provider.
- Only use the owner’s selected storyboard and selected media references; revalidate owner, consent, scopes, Agent version, and source revision before each provider request.
- Persist image outputs to the owner’s private `station_media_assets`; do not store provider URLs as assets or automatically enqueue media retrieval indexing.
- Treat a dispatched request with unknown outcome as `interrupted`; never automatically replay it. Running cancellation is unavailable unless a verified Provider contract proves safe cancellation.
- Do not enable token or cost caps; record only actual provider-reported usage and keep unknown pricing/usage unknown.
- This execution scope allows local code and isolated QA only; do not call production providers, deploy, publish a product/release, or upload TestFlight.
- Keep video production at script-only readiness until a separate video API contract and executor are verified.

---

## File map

| File | Responsibility |
|---|---|
| `backend/database/058_comic_image_generation.sql` | Version-2 render tasks, safe task progress events, per-frame output ownership, status constraints, and AI worker capability heartbeats. |
| `backend/src/ai-task-repository.js` | Keep legacy queue mechanics while excluding comic-render rows from legacy v1 reads; accept the new internal task terminal phase. |
| `backend/src/comic-render-repository.js` | Create/idempotently look up render tasks, list/read per-frame outputs, append safe progress events and complete/cancel render rows. |
| `backend/src/comic-render-service.js` | Validate storyboard snapshot and current Agent access; create render task and map safe API DTOs. |
| `backend/src/routes/comic-render-routes.js` | Versioned, authenticated render submission, task/events reads, list-by-storyboard, and queued-only cancellation. |
| `backend/src/ai-client-contract.js` | Register `comicRenders: 1` and its dedicated request header/middleware. |
| `backend/src/comic-image-provider.js` | Provider-neutral image generation port, configuration readiness and explicit fail-closed behavior until a verified adapter exists. |
| `backend/src/comic-render-executor.js` | Sequential frame execution with lease/auth/source checks, output persistence, safe partial/unknown outcome semantics. |
| `backend/src/comic-render-storage.js` | Validate image bytes and store verified outputs as private station media assets. |
| `backend/src/ai-task-worker.js` | Inject the comic-render executor into the existing durable queue. |
| `backend/src/ai-task-worker-status-repository.js` | Record worker instance state/capabilities and return recent live capability status to API readiness. |
| `backend/src/agent-readiness-service.js` | Report separate text, image Provider, worker heartbeat/executor, and storage readiness. |
| `backend/src/config.js`, `backend/.env.example`, `deploy/miaoxun-prod.env.example` | Independent disabled-by-default media generation configuration and empty sample values. |
| `agents/comic-diary.agent.js` | Declare `comic.render` and separate `media:image:generate` scope. |
| `agents/test/registry.test.js` | Assert the new capability and unique declared scope without expanding unrelated Agents. |
| `backend/test/comic-render-*.test.js` | Contract, route, provider, executor, storage, and isolated PostgreSQL behavior. |
| `MiaoxunRN/src/services/aiContract.ts`, `src/models/api.ts` | Accept the additive comic render contract from bootstrap. |
| `MiaoxunRN/src/models/comicRender.ts`, `src/services/api/comicRenderApi.ts` | Strict comic task DTO/event validation and dedicated versioned APIs. |
| `MiaoxunRN/src/features/station/StationComicDiaryPanel.tsx` | Explicitly start rendering and show per-frame progress/results in the existing comic panel. |
| `MiaoxunRN/__tests__/comicRender*.test.ts(x)` | Dedicated contract, API, state refresh, and comic panel coverage. |
| `docs/agents.md`, `docs/agent-model-configuration.md`, `docs/handoffs/CURRENT.md` | Describe the real execution boundary, secret location, test evidence, and outstanding provider/consent/release gates. |

## Task 1: Version the queue schema and preserve the legacy AI Task contract

**Files:**
- Modify: `backend/database/058_comic_image_generation.sql`
- Modify: `backend/src/ai-task-repository.js`
- Modify: `backend/src/ai-client-contract.js`
- Modify: `backend/src/routes/ai-task-routes.js`
- Test: `backend/test/ai-task-repository.test.js`
- Test: `backend/test/ai-client-contract.test.js`
- Create: `backend/test/comic-render-contract.test.js`

**Interfaces:**
- Legacy `/api/tasks` remains `X-Miaoxun-AI-Contract: 1` and exposes only `agent_message` and `site_draft`.
- New internal kind is `comic_render`; its row uses `contract_version = 2`, `comic_diary_id`, and empty generic artifacts.
- New public header is `X-Miaoxun-Comic-Renders: 1`; it does not change `aiTasks` or any existing contract number.
- Add `partially_succeeded` as an internal terminal state and `rendering` as an internal render phase. Public comic events use a dedicated schema in Task 2. Add `comicRenders: 1` to bootstrap while keeping all existing contract values unchanged.

- [x] **Step 1: Add failing tests for contract isolation and transition values**

```js
test("comic render contract is additive and legacy task contract remains v1", () => {
  assert.equal(aiClientContracts.aiTasks, 1);
  assert.equal(aiClientContracts.comicRenders, 1);
});

test("legacy task reads never project comic render rows", async () => {
  // Use the disposable PostgreSQL fixture with both task kinds seeded.
  // A query stub must assert the SQL predicate rather than return unfiltered rows.
  const tasks = await repository.listAITasks({ userId: ownerId, limit: 30 });
  assert.deepEqual(tasks.map(task => task.id), [messageTaskId]);
});
```

- [x] **Step 2: Run the tests and confirm the missing contract/read filter fails**

Run: `node --test backend/test/comic-render-contract.test.js backend/test/ai-client-contract.test.js backend/test/ai-task-repository.test.js`
Expected: FAIL because the comic contract and legacy exclusion are not implemented.

- [x] **Step 3: Add migration 058 with constrained comic task and frame output schema**

Create a forward-only migration that alters the existing `ai_tasks` CHECK constraints to include `comic_render`, `partially_succeeded`, `rendering`, `contract_version = 2`, and a comic-diary source branch. Add owner-scoped `comic_task_outputs` with one row per frame, safe states (`queued`, `running`, `succeeded`, `failed`, `unknown`), composite owner FKs, and a unique `(task_id, frame_index)` constraint. Add `ai_task_worker_heartbeats` with instance ID, state, registered executor names, and `last_seen_at`; `comic_render` is ready only when a `ready` heartbeat is newer than 90 seconds and includes that executor. Extend the event JSON CHECK only for bounded integer output counters. Do not add a provider URL, image bytes, or API key column.

```sql
ALTER TABLE ai_tasks ADD COLUMN comic_diary_id CHAR(36)
  REFERENCES station_comic_diaries(id) ON DELETE CASCADE;

CREATE TABLE comic_task_outputs (
  task_id CHAR(36) NOT NULL,
  user_id CHAR(36) NOT NULL,
  frame_index INTEGER NOT NULL CHECK (frame_index BETWEEN 1 AND 8),
  status TEXT NOT NULL CHECK (status IN ('queued','running','succeeded','failed','unknown')),
  media_asset_id CHAR(36),
  safe_error_code TEXT,
  provider_request_id TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY (task_id, frame_index),
  FOREIGN KEY (task_id, user_id) REFERENCES ai_tasks(id, user_id) ON DELETE CASCADE
);
```

Add the composite station media owner foreign key after confirming the existing `(id,user_id)` unique constraint. The migration also adds explicit named CHECK constraints for comic task ownership, contract version, status, phase, and safe event counters; migration tests assert rejection of cross-owner references and out-of-range frame values.

- [x] **Step 4: Keep legacy task projection and mutation strict**

Modify `listAITasks` and `getAITask` to add `kind IN ('agent_message','site_draft')`; reject `comic_render` in the legacy query schema and prevent generic task routes from returning comic rows. Extend internal `advanceAITask` and `finishAITask` validation to include `rendering` and `partially_succeeded` without widening legacy artifact kinds.

- [x] **Step 5: Add the dedicated contract middleware and test the wrong-version response**

```js
export function requireComicRenderContract(req, _res, next) {
  if (req.get(comicRenderContractHeader) !== String(aiClientContracts.comicRenders)) {
    throw new HttpError(426, "当前客户端不支持漫画生成任务，请更新应用。", {
      code: "COMIC_RENDER_CLIENT_UPDATE_REQUIRED",
      requiredContract: aiClientContracts.comicRenders,
    });
  }
  next?.();
}
```

Run: `node --test backend/test/comic-render-contract.test.js backend/test/ai-client-contract.test.js backend/test/ai-task-repository.test.js`
Expected: PASS; existing AI task contract tests remain unchanged and pass.

## Task 2: Add owner-scoped comic render task persistence and APIs

**Files:**
- Create: `backend/src/comic-render-repository.js`
- Create: `backend/src/comic-render-service.js`
- Create: `backend/src/routes/comic-render-routes.js`
- Modify: `backend/src/routes/station-routes.js`
- Modify: `backend/src/agent-readiness-service.js` (only to keep route readiness wiring consistent)
- Test: `backend/test/comic-render-routes.test.js`
- Test: `backend/test/comic-render-repository.integration.test.js`
- Test: `backend/test/comic-diary-access.integration.test.js`

**Interfaces:**
- `createComicRenderTask({ userId, comicDiaryId, idempotencyKey, assertReady }) -> { task, reused }`
- `getComicRenderTask({ userId, taskId }) -> ComicRenderTaskDTO | null`
- `listComicRenderTasks({ userId, comicDiaryId, limit }) -> ComicRenderTaskDTO[]`
- `listComicRenderEvents({ userId, taskId, afterSequence, limit }) -> ComicRenderEventPage`
- `cancelQueuedComicRenderTask({ userId, taskId, revision }) -> ComicRenderTaskDTO`
- `ComicRenderTaskDTO` includes task identity/status/revision, safe progress counts, frame index/status and nullable owner-scoped `mediaAssetId`; it never includes task input, storage keys, provider bodies, or external URLs.

- [x] **Step 1: Write failing tests for task creation, cross-owner 404, and idempotency**

```js
test("same idempotency key and snapshot reuses the task; changed snapshot conflicts", async () => {
  const first = await service.createComicRenderTask({ userId, comicDiaryId, idempotencyKey });
  const replay = await service.createComicRenderTask({ userId, comicDiaryId, idempotencyKey });
  assert.equal(replay.task.id, first.task.id);
  await assert.rejects(() => service.createComicRenderTask({
    userId, comicDiaryId: changedComicDiaryId, idempotencyKey,
  }), error => error.details.code === "COMIC_RENDER_IDEMPOTENCY_CONFLICT");
});
```

- [x] **Step 2: Run the new route/repository tests and verify they fail before implementation**

Run: `node --test backend/test/comic-render-routes.test.js backend/test/comic-render-repository.integration.test.js`
Expected: FAIL because the render repository and routes do not exist.

- [x] **Step 3: Create a task from a locked, owned comic storyboard snapshot**

Call the injected readiness guard before opening the enqueue transaction. In one transaction, load the current `comic-diary` Agent, call `assertCurrentAgentAccess`, verify the distinct `media:image:generate` grant and current product version, lock the owner’s non-deleted storyboard, validate its selected uploaded image references, compute a canonical SHA-256 request hash from Agent version + storyboard revision/frame text + selected source IDs + output options, then insert a v2 `comic_render` row and one queued output row per frame. Repeated `(user_id, kind, agent_id, idempotency_key)` with same hash returns the existing task; a different hash returns HTTP 409. If the image Provider or recent Worker heartbeat is not ready, return an explicit 503 and insert no task.

- [x] **Step 4: Add private reads, event paging, and queued-only cancellation**

Implement user-scoped task/detail/event queries. Return 404 for an unknown or other user’s task. Apply expected-revision CAS for queued cancellation. Return 409 when a task is already running or terminal; never claim a dispatched Provider request was cancelled.

- [x] **Step 5: Register the versioned routes and run their unit tests**

Use `POST /api/station/comic-diaries/:comicDiaryId/render-tasks`, `GET` on the same collection, `GET /api/station/comic-render-tasks/:taskId`, `GET /api/station/comic-render-tasks/:taskId/events`, and `POST /api/station/comic-render-tasks/:taskId/cancel`. Apply authentication and `requireComicRenderContract` before route work. Run: `node --test backend/test/comic-render-routes.test.js backend/test/comic-diary-agent.test.js backend/test/comic-diary-access.integration.test.js`. Expected: all non-PostgreSQL cases pass; the integration suite must be run separately against a disposable loopback database, not counted as passed when skipped.

## Task 3: Add closed-by-default media configuration and Provider port

**Files:**
- Modify: `backend/src/config.js`
- Create: `backend/src/comic-image-provider.js`
- Modify: `backend/.env.example`
- Modify: `deploy/miaoxun-prod.env.example`
- Test: `backend/test/comic-image-provider.test.js`
- Test: `backend/test/server-config.test.js`

**Interfaces:**
- `createComicImageProvider({ config, fetchImpl }) -> { readiness(), generateFrame(input) }`
- `readiness() -> { configured, provider, missing, contractVerified }`
- `generateFrame({ prompt, selectedImages, width, height, idempotencyKey }) -> { bytes, mimeType, width, height, providerRequestId, model, usage }`
- With no verified adapter or complete config, `readiness().configured === false` and `generateFrame()` throws `COMIC_IMAGE_PROVIDER_UNAVAILABLE` before network access.

- [x] **Step 1: Add failing tests for disabled, incomplete, and secret-safe readiness**

```js
test("media image generation defaults disabled and makes no provider request", async () => {
  const requests = [];
  const provider = createComicImageProvider({ config: emptyMediaConfig, fetchImpl: async (...args) => requests.push(args) });
  assert.equal(provider.readiness().configured, false);
  await assert.rejects(provider.generateFrame({ prompt: "x" }), /COMIC_IMAGE_PROVIDER_UNAVAILABLE/);
  assert.deepEqual(requests, []);
});
```

- [x] **Step 2: Add independent config parsing and validation**

Read `MEDIA_GENERATION_ENABLED`, `MEDIA_GENERATION_PROVIDER`, `MEDIA_GENERATION_API_BASE_URL`, `MEDIA_GENERATION_API_KEY`, `MEDIA_GENERATION_IMAGE_MODEL`, and `MEDIA_GENERATION_TIMEOUT_MS` independently. Default disabled. Validate a configured endpoint as HTTPS and reject credentials/query/fragment in the base URL. Do not include the secret in readiness, thrown public errors, or logs. Add only blank values/comments to example env files.

- [x] **Step 3: Add a provider port with no guessed HTTP protocol**

Keep protocol serialization in a provider-specific adapter selected only by a verified provider enum and its fixed HTTPS host allowlist. While provider docs are absent, the factory returns an explicit unconfigured provider and performs zero network I/O. Unit tests may inject an adapter/fetch fixture to test error classification and response-size limits, but never pretend the fixture is product output.

- [x] **Step 4: Run config/provider tests and confirm no unrelated provider changed**

Run: `node --test backend/test/comic-image-provider.test.js backend/test/server-config.test.js backend/test/agent-model-config.test.js backend/test/media-retrieval-config.test.js`
Expected: PASS; text, 3D and retrieval config contracts remain unchanged.

## Task 4: Execute sequential frame jobs and persist private image assets

**Files:**
- Create: `backend/src/comic-render-storage.js`
- Create: `backend/src/comic-render-executor.js`
- Create: `backend/src/ai-task-worker-status-repository.js`
- Modify: `backend/src/ai-task-worker.js`
- Modify: `backend/src/ai-task-runner.js`
- Modify: `backend/src/ai-task-repository.js`
- Test: `backend/test/comic-render-storage.test.js`
- Test: `backend/test/comic-render-executor.test.js`
- Test: `backend/test/ai-task-worker.test.js`

**Interfaces:**
- `createComicRenderExecutor({ provider, repository, storage, authorize, logger }) -> executeComicRenderTask(record)`
- `storeComicFrame({ userId, taskId, frameIndex, bytes, mimeType, width, height, providerRequestId, model, usage }) -> { mediaAssetId }`
- Executor processes frames in order and persists every output transition before moving to the next frame.

- [x] **Step 1: Write failing byte-validation and OSS cleanup tests**

```js
test("rejects HTML mislabeled as image and does not mark an asset uploaded", async () => {
  await assert.rejects(() => storage.storeComicFrame({
    userId, taskId, frameIndex: 1, bytes: Buffer.from("<html>"), mimeType: "image/png",
  }), error => error.details.code === "COMIC_IMAGE_BYTES_INVALID");
  assert.equal(uploadedAssetCount, 0);
});
```

- [x] **Step 2: Validate bounded image bytes before storage**

Use existing `sharp` to decode the response, enforce a 16 MiB byte limit and 16-megapixel pixel limit, compare decoded format with the Provider MIME, and re-encode to WebP with metadata stripped and a 2048-pixel maximum edge. Reject malformed images before creating an uploaded asset.

- [x] **Step 3: Store output through private OSS and existing station media ownership**

Create a pending owner-scoped `station_media_assets` row, prepare its private object key, call `putOssObject` server-side, verify stored object metadata, then transactionally mark the media uploaded, bind it to `comic_task_outputs`, and append safe task progress. On DB failure, attempt private object deletion; if cleanup fails, preserve a non-sensitive orphan cleanup record and fail/interruption status without exposing its object key.

- [x] **Step 4: Implement lease, authorization, partial, and unknown handling**

Before each provider dispatch, verify task claim token/lease, Agent version and entitlement/scope, comic owner, source revision, and media ownership. Deterministic provider/image validation failures mark that frame failed and may continue other frames. A timeout, connection loss, or lease loss after dispatch marks that frame unknown and the task interrupted; stop dispatching later frames and never retry. Successful frames remain readable on partial/interrupted tasks.

- [x] **Step 5: Persist worker capability heartbeats and inject the executor**

Register `comic_render` through explicit dependency injection. The worker status repository upserts `starting`, `ready`, and `stopped` states plus registered executor names; a missing adapter must omit `comic_render` from the ready capability set. Expose testable `getRecentComicRenderWorkerStatus({ now, maxAgeMs: 90000 })` and reject stale/stopped heartbeats. Production startup reports image generation unavailable if config/adapter is absent. Run: `node --test backend/test/comic-render-storage.test.js backend/test/comic-render-executor.test.js backend/test/ai-task-runner.test.js backend/test/ai-task-worker.test.js backend/test/agent-readiness.test.js`. Expected: all tests pass, including no automatic second dispatch after an unknown result and stale worker readiness false.

## Task 5: Add Agent scope and accurate operational readiness

**Files:**
- Modify: `agents/comic-diary.agent.js`
- Modify: `agents/test/registry.test.js`
- Modify: `backend/src/agent-readiness-service.js`
- Modify: `backend/src/ai-task-worker.js`
- Test: `backend/test/agent-readiness.test.js`
- Test: `backend/test/agent-release-contract.test.js`
- Test: `backend/test/comic-render-routes.test.js`

- [x] **Step 1: Add failing registry/readiness tests**

```js
test("comic image readiness is false without a verified image adapter and worker executor", async () => {
  const readiness = await buildAgentReadiness({
    modelStatus: { configured: true, provider: "new-api", missing: [] },
    ossStatus: { configured: true, provider: "oss", missing: [] },
    mediaImageStatus: { configured: false, provider: "unconfigured", missing: ["MEDIA_GENERATION_API_KEY"] },
    aiTaskWorkerStatus: { state: "stopped", capabilities: [] },
    mediaRetrievalStatus: { readiness: { state: "ready" }, routeEligibility: { reasonCodes: [] } },
  });
  assert.equal(readiness["comic-diary"].configured, false);
  assert.equal(readiness["video-production"].providers.image, undefined);
});
```

- [x] **Step 2: Declare the new Agent capability and separate scope**

Increment `comic-diary` version from `0.1.3` to `0.1.4`, add `comic.render` to its capability declaration, and add only `media:image:generate` to the declared permissions. Keep `video-production` script-only. Add registry assertions for unique, valid scopes and unchanged video capability.

- [x] **Step 3: Report readiness as the conjunction of model, image provider, worker, and storage**

Expose separate provider readiness objects and missing environment variable names. A configured text model alone must not mark comic rendering ready. Worker startup/health must report whether the `comic_render` executor is registered; storage readiness comes from the existing OSS runtime status. Do not add a key-editing or key-echo UI.

- [x] **Step 4: Verify release scope snapshots and consent behavior remain explicit**

Run: `node --test agents/test/registry.test.js backend/test/agent-readiness.test.js backend/test/agent-release-contract.test.js backend/test/agent-access.test.js`. Expected: PASS; existing users are not silently granted the new scope and a release snapshot becomes stale if registry scopes differ.

## Task 6: Add RN contract, dedicated API, and per-frame experience

**Files:**
- Modify: `MiaoxunRN/src/services/aiContract.ts`
- Modify: `MiaoxunRN/src/models/api.ts`
- Create: `MiaoxunRN/src/models/comicRender.ts`
- Create: `MiaoxunRN/src/services/api/comicRenderApi.ts`
- Modify: `MiaoxunRN/src/services/api/stationAgentApi.ts`
- Modify: `MiaoxunRN/src/features/station/StationComicDiaryPanel.tsx`
- Create: `MiaoxunRN/__tests__/comicRenderContract.test.ts`
- Create: `MiaoxunRN/__tests__/comicRenderPanel.test.tsx`

- [x] **Step 1: Add strict task/event DTO tests before wiring the UI**

```ts
it('rejects a task with an external provider URL or unknown frame state', () => {
  expect(() => parseComicRenderTask({ ...validTask, providerUrl: 'https://example.invalid/x' })).toThrow();
  expect(() => parseComicRenderTask({ ...validTask, frames: [{ ...validFrame, status: 'completed-ish' }] })).toThrow();
});
```

- [x] **Step 2: Parse the additive bootstrap contract without changing `aiTasks: 1`**

Accept `contracts.comicRenders === 1`; keep all existing `aiTasks`, site-document, workspace, contribution, and UI-preference contract checks intact. Store the session capability only when the server advertises the exact supported version.

- [x] **Step 3: Implement the dedicated authenticated comic task API**

Send `X-Miaoxun-Comic-Renders: 1` on submission, list/detail/events/cancel calls. Parse every response with strict DTO validators. Build private image paths only from returned `mediaAssetId` using the existing `stationMediaUrl` helper; do not accept arbitrary URLs.

- [x] **Step 4: Add explicit generation action and honest per-frame states**

Keep storyboard creation unchanged and free of render side effects. Add a user-triggered “生成漫画画面” action that confirms the frame count before enqueue. Show queued/running/succeeded/failed/unknown per frame and a distinct partial-success task state. Poll/resume using server task revisions; do not fabricate placeholders as generated images. Disable running cancellation and show the server’s unknown-result message when dispatch outcome is uncertain.

- [x] **Step 5: Run focused RN tests, typecheck, lint, and formatting**

Run: `npm --prefix MiaoxunRN test -- --runInBand __tests__/comicRenderContract.test.ts __tests__/comicRenderPanel.test.tsx __tests__/stationContentContract.test.ts`
Then run `npm --prefix MiaoxunRN run typecheck`, `npm --prefix MiaoxunRN run lint -- --max-warnings=0`, and `npm --prefix MiaoxunRN run format:check`. Expected: all pass with current unrelated suites untouched.

## Task 7: Isolated database/API/worker verification and documentation handoff

**Files:**
- Modify: `docs/agents.md`
- Modify: `docs/agent-model-configuration.md`
- Modify: `docs/handoffs/CURRENT.md`
- Test: `backend/test/comic-render-repository.integration.test.js`
- Test: `backend/test/comic-diary-access.integration.test.js`
- Test: `backend/test/comic-render-executor.test.js`

- [x] **Step 1: Create a dedicated loopback PostgreSQL database ending in `_migration_test`**

Use the repository’s disposable PostgreSQL harness and a fresh database name such as `miaoxun_comic_render_<run-id>_migration_test`. Do not point `DATABASE_URL` to production or the shared development database. Run the full ordered migrations through 058 and assert the migration ledger and new constraints.

- [x] **Step 2: Run PostgreSQL integration coverage with an injected test Provider**

Verify submission, idempotency replay/conflict, user ownership, selected-source revision change, consent revocation before dispatch, multiple frame outputs, partial deterministic failure, unknown interruption, event counts, asset read ownership, queued cancellation, and no Provider call after authorization revocation. Test Provider returns generated fixture bytes only inside tests; no mock row is presented as real product success.

- [x] **Step 3: Verify provider-unconfigured production behavior and the adapter contract gate**

With all media-generation env values absent, assert readiness false, task submission returns a stable `COMIC_IMAGE_PROVIDER_UNAVAILABLE` or `COMIC_RENDER_NOT_READY` response before queueing any work, and no network request occurs. Add a separate checklist in the handoff naming the exact missing upstream API contract items; do not record any key.

- [x] **Step 4: Run the full repository checks and record exact evidence**

Run `MIAOXUN_DOTENV_ENABLED=false ./scripts/check-repository.sh` and `git diff --check`. Run isolated PostgreSQL suites separately and state skipped default-gated tests separately from executed integration tests. Update `docs/handoffs/CURRENT.md` with changed files, migration 058 status, test output, provider contract/key-rotation blocker, and the explicit fact that no deployment/product publication/TestFlight occurred.

## Implementation clarifications

- Extend scope syntax in `agents/registry.js` and backend publication/consent schemas to accept hierarchical scope segments such as `media:image:generate`, while rejecting empty/invalid segments. Exact scope matching remains unchanged; this introduces no wildcard grant.
- Worker claim/advance/finish/recovery must use an internal record projection for v2 comic rows. Every public legacy read, event and decision route must retain v1-only filtering.
- Persist storage cleanup intent before OSS upload, retain it on failed deletion, and make cleanup retryable. Account deletion must preserve the cleanup intent until private objects are removed. Deleting a storyboard does not delete independently owned generated assets.
- `buildAgentReadiness` explicitly accepts `mediaImageStatus` and `aiTaskWorkerStatus`; static executor registration is insufficient without a recent ready heartbeat.
- Contract DTO agreed for implementation: `{ id, contractVersion: 1, comicDiaryId, status, phase, revision, progress: { total, succeeded, failed, unknown }, frames: [{ frameIndex, status, mediaAssetId, errorCode }], error, allowedActions, createdAt, updatedAt }`. Frame states add `skipped` for outputs not dispatched after interruption. No external URLs or Provider data are public.
- Each implementation task supplies concrete fixtures in its tests, not unresolved illustrative identifiers. No commits, pushes or publishing are included in this execution.

## External integration gate

The upstream image API contract is not currently known. Before adding a live adapter or making an isolated real-image call, obtain the provider’s HTTPS base URL, endpoint path, model identifier, authentication scheme, request/response schema, input image semantics, polling/download behavior, usage fields, and retry/idempotency/timeout guarantees from its documentation. Treat the key already exposed in chat as compromised and rotate it. Do not infer an image API from text-model settings. Until that contract is provided and verified, the implementation remains explicitly unavailable; the local injected Provider fixture is test infrastructure only.

## Execution note

Complete dependency-ordered Tasks 1–7; independent configuration and RN work may run in parallel once interfaces are agreed, with the repository’s TDD and review rules. Task 3/4 may build only a provider-neutral port and injected contract tests until the external integration gate is satisfied. No production API, worker, database, Agent release/product, or TestFlight changes are authorized by this plan.


## Execution result (2026-11-10)

Tasks1–7 implemented and reviewed locally. Exact commands, changed-file inventory, executed PostgreSQL suites and outstanding external gates are recorded in `docs/reviews/2026-11-10-comic-image-generation.md` and `docs/handoffs/CURRENT.md`. Checkboxes cover local code/testing only. Real Provider adapter and image calls remain unavailable pending verified upstream contract and rotated credentials. No deployment, publication, commit, push or TestFlight upload occurred.
