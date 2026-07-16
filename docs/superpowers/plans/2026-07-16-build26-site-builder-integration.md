# Build 26 Site Builder Integration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Put the complete personal-homepage Agent behind the existing Build 25 Station layout and ship the resulting code as Build 26.

**Architecture:** Merge the immutable Build 25 source commit into the existing homepage branch, preserve the Build 25 root navigation, and expose the existing `HomepageScreen` lifecycle through the Station page-sheet. Add one focused Station status component and redirect the legacy Site Builder capability panel to the shared flow.

**Tech Stack:** React Native 0.83, TypeScript, Jest, React Native WebView, Express, PostgreSQL, Vite, Playwright, OSS.

## Global Constraints

- Preserve Messages as the default first tab and Station as the second tab.
- Preserve all Build 25 message search, Station, diary, album, social, and Agent behavior.
- Use structured homepage sections only; never accept generated HTML/CSS/JavaScript.
- Require one prompt and 3 to 9 explicitly selected photos.
- Support only private and revocable link visibility.
- Do not expose provider names, environment variables, secrets, or raw errors to users.
- Use Build 26 for the next TestFlight Archive.

---

### Task 1: Establish the Build 26 integration baseline

**Files:**
- Modify through merge: Build 25 changed files
- Resolve: `MiaoxunRN/ios/MiaoxunRN.xcodeproj/project.pbxproj`

**Interfaces:**
- Consumes: immutable Build 25 commit `7d0a7f75bf1fba565844f7f471c3bc36d946c5fb`
- Produces: one branch containing Build 25 search changes and the homepage backend/Web/RN implementation

- [ ] Merge `origin/build/ios-25-source` with `--no-ff`.
- [ ] Resolve the only expected project-version conflict to `CURRENT_PROJECT_VERSION = 26` for Debug and Release.
- [ ] Verify both source commits are ancestors of `HEAD`.
- [ ] Confirm the worktree contains no unresolved paths.

### Task 2: Preserve Build 25 root navigation and open one builder modal

**Files:**
- Modify: `MiaoxunRN/src/App.tsx`
- Modify: `MiaoxunRN/src/app/AppModals.tsx`
- Modify: `MiaoxunRN/src/app/appTypes.ts`
- Test: `MiaoxunRN/__tests__/App.test.tsx`

**Interfaces:**
- Consumes: `HomepageScreen`, `useMiaoxunSession`, existing `site-builder` modal route
- Produces: `openSiteBuilder()` and a modal-close refresh version while retaining `selectedTab = 'messages'`

- [ ] Add a failing App test that asserts the Build 25 root still selects Messages and that the Station builder route is available only when `homepageV1.enabled`.
- [ ] Run the focused Jest test and confirm the new assertion fails.
- [ ] Restore `StationScreen`, `FloatingMiaoButton`, and Messages-first navigation in `App.tsx`; pass the builder callback and refresh version to Station.
- [ ] Pass session, toast, and safe error callbacks from `AppModals` into `SiteBuilderScreen`.
- [ ] Run the focused Jest test and confirm it passes.

### Task 3: Turn the placeholder Site Builder sheet into the full homepage flow

**Files:**
- Modify: `MiaoxunRN/src/features/site/SiteBuilderScreen.tsx`
- Modify: `MiaoxunRN/src/features/homepage/HomepageScreen.tsx`
- Modify: `MiaoxunRN/src/features/homepage/homepageTypes.ts`
- Test: `MiaoxunRN/__tests__/HomepageScreen.test.tsx`

**Interfaces:**
- Consumes: `HomepageSession`, existing homepage lifecycle methods
- Produces: modal-compatible `HomepageScreen` with a back action and no root-tab replacement

- [ ] Add a failing component test that renders the builder sheet and expects the real homepage empty state plus a working back button.
- [ ] Run the focused Jest test and confirm it fails against the placeholder screen.
- [ ] Replace placeholder capability copy with a thin `HomepageScreen` wrapper.
- [ ] Add a modal header mode to `HomepageScreen` while preserving existing lifecycle tests.
- [ ] Run homepage tests and confirm they pass.

### Task 4: Add the Station homepage status and shared entry

**Files:**
- Create: `MiaoxunRN/src/features/station/StationHomepageStatus.tsx`
- Modify: `MiaoxunRN/src/features/station/StationHome.tsx`
- Modify: `MiaoxunRN/src/features/station/StationPanels.tsx`
- Modify: `MiaoxunRN/src/features/station/StationScreen.tsx`
- Test: `MiaoxunRN/__tests__/StationHomepageStatus.test.tsx`

**Interfaces:**
- Consumes: `homepageV1.enabled`, `homepageSite()`, `homepageRefreshVersion`, `onOpenSiteBuilder`
- Produces: compact status values `not-created`, `draft`, `private`, `link`, `unavailable`

- [ ] Write failing tests for hidden feature, empty site, draft, private publish, link sharing, load failure, and retry.
- [ ] Run the focused test and confirm it fails because the component does not exist.
- [ ] Implement `StationHomepageStatus` with stable dimensions, safe copy, and retry.
- [ ] Thread the shared open callback and refresh version through Station components and render the status above the existing avatar.
- [ ] Run the focused test and confirm it passes.

### Task 5: Remove the duplicate legacy builder workflow from AI Partners

**Files:**
- Modify: `MiaoxunRN/src/features/station/StationSiteBuilderPanel.tsx`
- Modify: `MiaoxunRN/src/features/station/StationCapabilityWorkspace.tsx`
- Modify: `MiaoxunRN/src/features/station/StationAgentsPanel.tsx`
- Modify: `MiaoxunRN/src/features/station/StationPanels.tsx`
- Test: `MiaoxunRN/__tests__/StationSiteBuilderPanel.test.tsx`

**Interfaces:**
- Consumes: `homepageV1.enabled`, readiness display, `onOpenSiteBuilder`
- Produces: one compact capability entry targeting the same builder modal

- [ ] Add a failing test that asserts the Agent panel opens the shared builder and no longer creates legacy structure drafts.
- [ ] Run the focused test and confirm it fails.
- [ ] Replace the prompt/apply draft panel with a compact product entry and remove unused legacy callbacks from the component chain.
- [ ] Run the focused test and confirm it passes.

### Task 6: Verify all merged application and server behaviour

**Files:**
- Update only when verification finds a scoped defect

**Interfaces:**
- Consumes: merged Build 26 branch
- Produces: verified candidate ready for server deployment and native Archive

- [ ] Run backend `npm run check`, tests, and production audit.
- [ ] Run Agent checks and tests.
- [ ] Run RN install, TypeScript, ESLint, Jest, and production audit without forced major upgrades.
- [ ] Run Station Web typecheck, unit tests, build, and Playwright tests.
- [ ] Run Admin check and build.
- [ ] Confirm `CURRENT_PROJECT_VERSION = 26`, WebView dependency, API base, and ATS exception.

### Task 7: Deploy the merged backend and perform destructive isolated smoke

**Files:**
- Deploy: `backend/`, `agents/`, `station-web/dist/`, and migrations from the verified branch
- Do not modify: production secrets or real acceptance-account data

**Interfaces:**
- Consumes: verified Build 26 branch and existing production environment
- Produces: server supporting both Build 25 search and Build 26 homepage APIs

- [ ] Create a timestamped server backup.
- [ ] Deploy code and apply idempotent migrations.
- [ ] Restart the backend and verify `/api/health` returns 200 with database connected.
- [ ] Run `npm run smoke:build24` using a disposable allowlisted account and `ALLOW_DESTRUCTIVE_SMOKE=true`.
- [ ] Verify disposable account/media cleanup and restore the one-entry acceptance allowlist.
- [ ] Verify the Build 25 single-search-history delete route no longer returns 404 at route discovery.

### Task 8: Publish the integration and hand off Build 26

**Files:**
- Modify: `docs/ios.md`
- Modify: `docs/deployment.md`
- Modify: `docs/build24-acceptance.md` only to identify the Build 26 package target while preserving the homepage acceptance cases

**Interfaces:**
- Consumes: deployed and verified Build 26 candidate
- Produces: traceable branch/PR and exact native handoff

- [ ] Commit scoped documentation and code changes.
- [ ] Push the integration branch without force.
- [ ] Retarget or replace PR #2 against current `main` and record the exact head SHA.
- [ ] Provide App owner commands for `npm ci`, `bundle install`, `bundle exec pod install`, workspace Archive, and Archive inspection.
- [ ] Require TestFlight `1.0 (26)` device acceptance before tagging the release.

