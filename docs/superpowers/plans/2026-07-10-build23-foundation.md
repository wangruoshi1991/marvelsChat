# Build 23 Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stop build 22's realtime synchronization loop and restore the station content APIs required by the existing mobile UI.

**Architecture:** The mobile session hook keeps synchronization cursors and in-flight promises in refs so network callbacks remain stable across renders. The backend restores owner-scoped repository operations and routes, while OSS upload policy and object verification remain in a focused storage service.

**Tech Stack:** React Native 0.86, React 19, TypeScript, Jest, Node.js ESM, Express, Zod, PostgreSQL, Aliyun OSS signed URLs.

## Global Constraints

- Preserve all existing mobile route paths and JSON response envelopes.
- Never log or return API keys, bearer tokens, passwords, or OSS credentials.
- Use soft deletion for station content.
- A user may only read or mutate rows owned by that same authenticated user.
- Do not require a database migration for this recovery.

---

### Task 1: Mobile Synchronization Regression

**Files:**
- Create: `MiaoxunRN/__tests__/sessionSync.test.tsx`
- Modify: `MiaoxunRN/src/features/session/useMiaoxunSession.ts`
- Modify: `MiaoxunRN/src/features/session/useRealtimeChannel.ts`

**Interfaces:**
- Consumes: `apiClient.bootstrap(token)`, `apiClient.sync(updatedAfter, token)`, `useRealtimeChannel(options)`.
- Produces: a stable `incrementalSync(showError?: boolean): Promise<void>` and one realtime connection per token/user pair.

- [ ] **Step 1: Write the failing test**

  Mount a hook harness with mocked token storage, API client, and WebSocket. Resolve bootstrap, emit `connection.ready`, resolve incremental sync with a newer `serverTime`, and assert `WebSocket` was constructed once and bootstrap was called once.

- [ ] **Step 2: Run the regression test and verify failure**

  Run: `cd MiaoxunRN && npm test -- --runInBand __tests__/sessionSync.test.tsx`

  Expected before the fix: more than one WebSocket construction or repeated bootstrap requests.

- [ ] **Step 3: Make synchronization callbacks stable**

  Add `lastSyncAtRef`, `bootstrapPromiseRef`, and `syncPromiseRef`. Update the ref whenever bootstrap or sync advances the cursor. Remove `lastSyncAt` from the `incrementalSync` dependency list and deduplicate overlapping calls by returning the existing promise.

- [ ] **Step 4: Replace realtime bootstrap with incremental catch-up**

  Remove `refreshBootstrap` from `RealtimeChannelOptions`. Handle `connection.ready` with `incrementalSync(false)` and keep the realtime effect dependent only on stable callbacks, token, and user identity.

- [ ] **Step 5: Verify and commit**

  Run: `cd MiaoxunRN && npx tsc --noEmit && npm run lint -- --max-warnings=0 && npm test -- --runInBand`

  Commit: `fix(mobile): stop realtime bootstrap loop`

### Task 2: Station CRUD Contract Recovery

**Files:**
- Create: `backend/test/station-route-contract.test.js`
- Create: `backend/test/station-schemas.test.js`
- Modify: `backend/package.json`
- Modify: `backend/src/schemas.js`
- Modify: `backend/src/station-repository.js`
- Modify: `backend/src/routes/station-routes.js`

**Interfaces:**
- Produces: PATCH/DELETE routes for `/api/station/diary/:entryId`, `/api/station/albums/:albumId`, and `/api/station/media-assets/:assetId`.
- Produces: repository functions `updateStationDiaryEntry`, `deleteStationDiaryEntry`, `updateStationAlbum`, `deleteStationAlbum`, `updateStationMediaAsset`, and `deleteStationMediaAsset`.

- [ ] **Step 1: Write failing route and schema tests**

  Register routes on a fake Express app and assert all required method/path pairs exist. Assert update schemas reject empty objects and accept valid partial values, and UUID parameter schemas reject malformed IDs.

- [ ] **Step 2: Verify the tests fail**

  Run: `cd backend && node --test test/station-route-contract.test.js test/station-schemas.test.js`

  Expected before the fix: missing exports and missing PATCH/DELETE routes.

- [ ] **Step 3: Restore validation and owner-scoped repository operations**

  Add partial update schemas with a non-empty refinement and UUID parameter schemas. Restore SQL updates with both `id` and `user_id` predicates. Soft-delete album media in the same transaction when deleting an album.

- [ ] **Step 4: Register CRUD routes and usage events**

  Parse both params and body, call the owner-scoped repository functions, return 404 for absent rows, preserve `{ data }` envelopes, and return 204 for successful deletes.

- [ ] **Step 5: Verify and commit**

  Run: `cd backend && npm run check && npm test`

  Commit: `fix(backend): restore station content lifecycle routes`

### Task 3: Secure OSS Media Lifecycle

**Files:**
- Create: `backend/test/oss-service.test.js`
- Modify: `backend/src/oss-service.js`
- Modify: `backend/src/schemas.js`
- Modify: `backend/src/station-repository.js`
- Modify: `backend/src/routes/station-routes.js`

**Interfaces:**
- Produces: `inspectOssObject({ objectKey }): Promise<{ contentType: string, contentLength: number | null }>`.
- Produces: POST upload preparation/completion and GET file routes for station media assets.

- [ ] **Step 1: Write failing policy and signing tests**

  Assert image MIME values are limited to 25 MiB, video MIME values to 250 MiB, object keys remain under the authenticated user's asset prefix, and HEAD signing uses the same canonical resource as GET/PUT signing.

- [ ] **Step 2: Verify the tests fail**

  Run: `cd backend && node --test test/oss-service.test.js test/station-schemas.test.js`

  Expected before the fix: missing HEAD inspection and missing MIME/size policy.

- [ ] **Step 3: Implement upload preparation and verification**

  Generate the object key server-side, persist it only for a pending owner-scoped asset, and return a 10-minute signed PUT URL. On completion, require the submitted key to equal the persisted key, issue a signed HEAD request, validate content type and length, then mark the row uploaded.

- [ ] **Step 4: Implement authenticated streaming reads**

  Fetch OSS with the signed GET URL, forward `Range`, response status, content headers, and stream the Web body through `Readable.fromWeb` and `pipeline` without loading the entire asset into memory.

- [ ] **Step 5: Verify and commit**

  Run: `cd backend && npm run check && npm test`

  Commit: `feat(backend): secure station media uploads`

### Task 4: Full Verification and Delivery

**Files:**
- Modify: `docs/deployment.md`
- Modify: `docs/ios.md`

**Interfaces:**
- Produces: deployable backend source and build 23 mobile handoff notes.

- [ ] **Step 1: Run all repository checks**

  Run mobile TypeScript, lint, Jest; backend syntax and tests; Agent syntax and tests; admin build.

- [ ] **Step 2: Deploy the backend-only changes**

  Back up each replaced server file, copy only tested backend files, run `npm run check && npm test`, restart `marvels-chat-backend`, and verify `/api/health` before external smoke tests.

- [ ] **Step 3: Run authenticated smoke tests**

  Log in with the supplied test account without printing its token, confirm bootstrap remains 200, verify restored routes no longer return 404, and complete a disposable create/update/delete lifecycle.

- [ ] **Step 4: Record the App handoff**

  Document that the iOS owner must build and upload build 23 from this commit, confirm the archive API base, then test login, idle realtime behavior, diary/album editing, and photo upload on device.

- [ ] **Step 5: Commit documentation**

  Commit: `docs: record build 23 verification and handoff`

