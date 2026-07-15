# Miaoxun Homepage V1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the Build 24 private/link-only personal homepage loop from explicit photo selection through resilient AI drafting, exact Web preview, publishing, sharing, and revocation.

**Architecture:** Extend the existing Express/PostgreSQL backend with dedicated homepage jobs, revisioned drafts, immutable releases, site state, preview tokens, consent records, and account deletion. Add a `station-web` Vite/React renderer served from the same origin, then replace the React Native station-first experience behind a server feature flag while preserving Build 23 APIs for rollback compatibility.

**Tech Stack:** Node.js 20+, Express 4, PostgreSQL, Zod, Aliyun OSS signed URLs, React 19, Vite, React Native 0.86, TypeScript, Jest, Node test runner, Playwright.

## Global Constraints

- Keep iOS deployment target at 15.1 and support iPhone SE through Pro Max in portrait.
- Preserve every existing Build 23 API and the realtime bootstrap-loop fix.
- Ordinary UI must not expose Agent registry, provider names, environment variable names, raw provider errors, tokens, or credentials.
- Build 24 enables only `private` and `link`; `public` remains disabled by server feature flag.
- Initial generation uses only profile fields and the 3-9 media asset IDs explicitly selected in this flow.
- Model work has a 20-second deadline and falls back to an editable deterministic draft.
- OSS remains private; browser image access uses short-lived signed GET URLs.
- Analytics and logs never include prompt text, photo contents, diary bodies, passwords, session tokens, or signed URLs.
- Backend deploys before Web and mobile; all Build 24 behavior is allowlisted until acceptance.
- Domain remains a runtime setting; temporary HTTPS is used while `miaoxun.pizelife.com` is under review.

---

### Task 1: Homepage Persistence Contract

**Files:**
- Create: `backend/database/013_homepage_v1.sql`
- Modify: `backend/src/schemas.js`
- Modify: `backend/src/repository-mappers.js`
- Test: `backend/test/homepage-schemas.test.js`

**Interfaces:**
- Produces `station_site_generation_jobs`, draft revision/media fields, `station_sites`, `station_site_releases`, `station_site_preview_tokens`, and `user_consents`.
- Produces Zod schemas for generation, draft replacement, refinement, preview, publishing, release restore, consent, analytics events, and account deletion.

- [ ] **Step 1: Write failing schema tests**

```js
assert.deepEqual(homepageGenerateSchema.parse({
  prompt: "记录我的夏天",
  mediaAssetIds: [uuid1, uuid2, uuid3],
  idempotencyKey: "build24-attempt-1",
}), {
  prompt: "记录我的夏天",
  mediaAssetIds: [uuid1, uuid2, uuid3],
  idempotencyKey: "build24-attempt-1",
});
assert.throws(() => homepageGenerateSchema.parse({ prompt: "x", mediaAssetIds: [uuid1] }));
assert.throws(() => homepagePublishSchema.parse({ revision: 1, visibility: "public" }));
```

- [ ] **Step 2: Run `node --test test/homepage-schemas.test.js` and verify missing exports fail**
- [ ] **Step 3: Add additive SQL tables/columns, constraints, indexes, triggers, schemas, and mappers**
- [ ] **Step 4: Run the focused test and `npm run check`**
- [ ] **Step 5: Commit `feat(backend): add homepage persistence contract`**

### Task 2: Homepage Domain Services

**Files:**
- Create: `backend/src/homepage-service.js`
- Create: `backend/src/homepage-repository.js`
- Modify: `backend/src/site-builder-service.js`
- Modify: `backend/src/oss-service.js`
- Test: `backend/test/homepage-service.test.js`
- Test: `backend/test/oss-service.test.js`

**Interfaces:**
- Produces `createHomepageJob`, `processHomepageJob`, `replaceHomepageDraft`, `refineHomepageSection`, `publishHomepage`, `unpublishHomepage`, `restoreHomepageRelease`, `issuePreviewToken`, `getPreviewPage`, and `getSharedPage`.
- Page views use `{ mode, owner, page, media, visibility, publishedAt }` and never include user email or storage credentials.

- [ ] **Step 1: Write failing tests for explicit media filtering, deterministic fallback, revision conflicts, link revocation, token expiry, and signed-media projection**
- [ ] **Step 2: Run `node --test test/homepage-service.test.js` and verify behavior failures**
- [ ] **Step 3: Implement repository operations and pure page-view normalization**
- [ ] **Step 4: Add the 20-second model deadline and background job processor with idempotency**
- [ ] **Step 5: Implement immutable release creation, current-site switching, preview token hashing, and share-token revocation**
- [ ] **Step 6: Add OSS DELETE signing and keep all signed URLs out of logs**
- [ ] **Step 7: Run focused and full backend tests**
- [ ] **Step 8: Commit `feat(backend): implement homepage lifecycle`**

### Task 3: Homepage, Consent, Account, and Observability HTTP APIs

**Files:**
- Create: `backend/src/routes/homepage-public-routes.js`
- Create: `backend/src/routes/account-routes.js`
- Create: `backend/src/request-observability.js`
- Modify: `backend/src/routes/station-site-routes.js`
- Modify: `backend/src/routes/station-routes.js`
- Modify: `backend/src/routes/app-routes.js`
- Modify: `backend/src/routes/auth-routes.js`
- Modify: `backend/src/repositories.js`
- Modify: `backend/src/config.js`
- Modify: `backend/src/server.js`
- Modify: `backend/.env.example`
- Test: `backend/test/homepage-route-contract.test.js`
- Test: `backend/test/request-observability.test.js`
- Test: `backend/test/account-deletion.test.js`

**Interfaces:**
- Authenticated routes: `POST/GET /api/station/homepage-jobs`, `PATCH /api/station/site-drafts/:draftId`, `POST .../refine`, `POST .../preview-token`, `POST .../publish`, `GET/POST /api/station/site/releases`, `POST /api/station/site/unpublish`.
- Public routes: `GET /api/homepage-previews/:token`, `GET /api/homepage-shares/:token`, `GET /preview/:token`, `GET /s/:token`, and legal pages.
- Account routes: `GET /api/legal/policies`, `POST /api/me/consents`, and `DELETE /api/account` with password confirmation.
- Every response includes `X-Request-ID`; error JSON includes the same safe diagnostic ID.

- [ ] **Step 1: Write failing route-contract and request-ID tests**
- [ ] **Step 2: Run focused tests and verify missing routes/middleware fail**
- [ ] **Step 3: Register backward-compatible authenticated and public routes**
- [ ] **Step 4: Add allowlisted `homepageV1` bootstrap feature state and configurable daily quotas**
- [ ] **Step 5: Add consent recording and password-confirmed account deletion with OSS cleanup**
- [ ] **Step 6: Add request IDs, structured status/latency logs, safe errors, and optional Sentry hooks**
- [ ] **Step 7: Run backend checks and tests**
- [ ] **Step 8: Commit `feat(backend): expose Build 24 homepage APIs`**

### Task 4: Shared Web Homepage Renderer

**Files:**
- Create: `station-web/package.json`
- Create: `station-web/package-lock.json`
- Create: `station-web/index.html`
- Create: `station-web/vite.config.ts`
- Create: `station-web/tsconfig.json`
- Create: `station-web/src/main.tsx`
- Create: `station-web/src/HomepageApp.tsx`
- Create: `station-web/src/homepageTypes.ts`
- Create: `station-web/src/homepageView.ts`
- Create: `station-web/src/styles.css`
- Create: `station-web/src/legal.tsx`
- Create: `station-web/src/homepageView.test.ts`
- Create: `station-web/e2e/homepage.spec.ts`
- Modify: `backend/src/homepage-web-service.js`
- Modify: `.gitignore`

**Interfaces:**
- Consumes the page-view JSON from Task 2 or `window.__MIAOXUN_HOMEPAGE__` injected by Express.
- Produces `/site-assets/*`, `/preview/:token`, `/s/:token`, `/legal/privacy`, and `/legal/terms` from one renderer.

- [ ] **Step 1: Write failing unit tests for section ordering, hidden sections, cover selection, and both themes**
- [ ] **Step 2: Run `npm test` and verify missing renderer failures**
- [ ] **Step 3: Scaffold Vite/React with base `/site-assets/` and typed bootstrap loading**
- [ ] **Step 4: Implement `gallery` and `clean` full-width responsive themes with real media, loading, expired-link, and unavailable states**
- [ ] **Step 5: Add legal pages and safe metadata injection without `dangerouslySetInnerHTML` for user content**
- [ ] **Step 6: Add Playwright mobile/desktop tests, screenshot assertions, and nonblank image checks**
- [ ] **Step 7: Run typecheck, unit tests, build, and Playwright**
- [ ] **Step 8: Commit `feat(web): add shared homepage renderer`**

### Task 5: Mobile API Contract and Session Safety

**Files:**
- Modify: `MiaoxunRN/src/models/api.ts`
- Modify: `MiaoxunRN/src/services/api/http.ts`
- Create: `MiaoxunRN/src/services/api/homepageApi.ts`
- Modify: `MiaoxunRN/src/services/api/appApi.ts`
- Modify: `MiaoxunRN/src/services/api/authApi.ts`
- Modify: `MiaoxunRN/src/services/apiClient.ts`
- Modify: `MiaoxunRN/src/features/session/sessionDefaults.ts`
- Modify: `MiaoxunRN/src/features/session/useMiaoxunSession.ts`
- Modify: `MiaoxunRN/src/features/session/useStationActions.ts`
- Test: `MiaoxunRN/__tests__/sessionSync.test.tsx`
- Test: `MiaoxunRN/__tests__/homepageApi.test.ts`

**Interfaces:**
- Produces typed client methods matching Task 3 and a session-level `homepageV1` feature flag.
- `incrementalSync` clears the expired token once, stops polling/realtime work, and retains local homepage draft data.

- [ ] **Step 1: Add a failing regression test proving a sync `401` clears token storage once and does not poll again**
- [ ] **Step 2: Add failing URL, request-ID, and body-log redaction tests**
- [ ] **Step 3: Implement safe session expiry and request diagnostics**
- [ ] **Step 4: Add typed homepage, consent, and account-deletion API methods**
- [ ] **Step 5: Run TypeScript, focused Jest, and ESLint**
- [ ] **Step 6: Commit `feat(mobile): add safe homepage API contract`**

### Task 6: Mobile Homepage Creation, Editing, Preview, and Publishing

**Files:**
- Create: `MiaoxunRN/src/features/homepage/HomepageScreen.tsx`
- Create: `MiaoxunRN/src/features/homepage/HomepageCreateFlow.tsx`
- Create: `MiaoxunRN/src/features/homepage/HomepageEditor.tsx`
- Create: `MiaoxunRN/src/features/homepage/HomepagePreview.tsx`
- Create: `MiaoxunRN/src/features/homepage/homepageTypes.ts`
- Create: `MiaoxunRN/src/features/homepage/homepageStyles.ts`
- Create: `MiaoxunRN/src/services/homepageDraftStore.ts`
- Modify: `MiaoxunRN/src/services/stationMediaPicker.ts`
- Modify: `MiaoxunRN/src/services/stationMediaUpload.ts`
- Modify: `MiaoxunRN/src/App.tsx`
- Modify: `MiaoxunRN/src/shared/ui.tsx`
- Modify: `MiaoxunRN/package.json`
- Modify: `MiaoxunRN/package-lock.json`
- Test: `MiaoxunRN/__tests__/HomepageScreen.test.tsx`
- Test: `MiaoxunRN/__tests__/homepageDraftStore.test.ts`

**Interfaces:**
- Consumes homepage APIs and feature state from Task 5.
- Produces station-first navigation, 3-9 photo selection/reuse, per-item upload state, job polling, exact WebView preview, constrained editing, module refinement, link publishing, sharing, and unpublishing.

- [ ] **Step 1: Write failing component tests for empty onboarding, photo count validation, fallback result, revision conflict, publish confirmation, and revoked-link state**
- [ ] **Step 2: Write failing draft-store and upload retry tests**
- [ ] **Step 3: Install `react-native-webview`, add mocks, and implement secure local draft persistence using the existing Keychain dependency**
- [ ] **Step 4: Implement multi-photo selection, explicit existing-photo reuse, individual upload progress, and retry**
- [ ] **Step 5: Implement job polling and the 20-second fallback status UX without provider terminology**
- [ ] **Step 6: Implement exact WebView preview, two-theme switch, text/cover/photo/section editing, module refinement, and undo**
- [ ] **Step 7: Implement publish/share/unpublish and default the app to `My Homepage` with Messages second**
- [ ] **Step 8: Run focused tests, TypeScript, ESLint, and the full Jest suite**
- [ ] **Step 9: Commit `feat(mobile): complete homepage creation loop`**

### Task 7: Consent, Legal Links, and Account Deletion UI

**Files:**
- Modify: `MiaoxunRN/src/features/auth/AuthScreen.tsx`
- Modify: `MiaoxunRN/src/features/settings/SettingsScreen.tsx`
- Modify: `MiaoxunRN/src/app/AppModals.tsx`
- Modify: `MiaoxunRN/src/app/appTypes.ts`
- Create: `MiaoxunRN/src/features/settings/DeleteAccountSheet.tsx`
- Test: `MiaoxunRN/__tests__/AccountSafety.test.tsx`

**Interfaces:**
- Consumes policy metadata, consent, account deletion, and Web-base helpers from Task 5.
- Produces explicit policy agreement, accessible legal links, password reauthentication, destructive confirmation, and local cleanup after deletion.

- [ ] **Step 1: Write failing tests for blocked registration without consent and password-confirmed account deletion**
- [ ] **Step 2: Implement policy links and versioned consent submission**
- [ ] **Step 3: Implement a dedicated deletion sheet and clear all local session state only after server success**
- [ ] **Step 4: Run mobile checks and tests**
- [ ] **Step 5: Commit `feat(mobile): add consent and account deletion`**

### Task 8: Release Configuration, Documentation, and Acceptance

**Files:**
- Modify: `README.md`
- Modify: `docs/architecture.md`
- Modify: `docs/deployment.md`
- Modify: `docs/ios.md`
- Create: `docs/build24-acceptance.md`
- Create: `docs/legal/privacy-policy-draft.md`
- Create: `docs/legal/terms-draft.md`
- Modify: `deploy/*` only where current deployment scripts require Web artifacts or environment variables.

**Interfaces:**
- Produces exact environment variables, migration order, build commands, feature-flag rollback, temporary HTTPS setup, formal-domain cutover, Sentry DSN placeholders, and the App-owner handoff contract.

- [ ] **Step 1: Document migration, backend-first deploy, station-web build, allowlist, HTTPS, and rollback commands**
- [ ] **Step 2: Add privacy/terms drafts with explicit legal-review status and policy versions matching the API**
- [ ] **Step 3: Run every backend, Agent, admin, station-web, and RN check from a clean dependency install**
- [ ] **Step 4: Start local backend/Web services and run API smoke tests without logging secrets**
- [ ] **Step 5: Capture Playwright screenshots at iPhone SE, iPhone Pro Max, and desktop widths and inspect for blank/overlapping content**
- [ ] **Step 6: Deploy additive migration, backend, and Web artifacts to the test server with homepage allowlisted only**
- [ ] **Step 7: Run server health, authenticated generation/publish, anonymous link, revoke, account-safe non-destructive test, and two-minute network checks**
- [ ] **Step 8: Tag the verified commit and produce the commit-specific App-owner Archive/TestFlight prompt**

