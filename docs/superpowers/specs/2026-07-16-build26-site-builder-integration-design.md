# Build 26 Site Builder Integration Design

## Goal

Integrate the existing personal-homepage generation lifecycle into the exact iOS Build 25 layout without replacing Messages, Station, diary, album, social, or Agent surfaces.

## Product Decisions

- Build 25 commit `7d0a7f75bf1fba565844f7f471c3bc36d946c5fb` is the mobile baseline.
- The next TestFlight upload is Build 26 because Build 25 is already distributed.
- Messages remains the first and default bottom tab. Station remains the second tab.
- The native Station remains the authenticated content-management surface.
- The generated homepage is the shareable Web representation of explicitly selected Station content.
- Users provide one natural-language instruction and explicitly select 3 to 9 photos.
- The Agent never reads chats, contacts, social relationships, or unselected private content.
- Generation produces a structured draft. It never produces arbitrary HTML, CSS, or JavaScript.
- Users edit, preview, and explicitly publish. Generation never publishes automatically.
- Build 26 supports private pages and revocable link sharing. Public discovery stays disabled.
- AI-generated content remains visibly labelled.

## Navigation

The root navigation remains:

1. `妙讯` / Messages
2. `小站` / Station

The Station page gains a compact homepage status band above the existing avatar and modules. It reports one of `未创建`, `草稿`, `仅自己可见`, or `链接分享中`, and opens the builder.

The existing floating `妙` button opens the same builder. The Site Builder capability card in `AI伙伴` also opens the same builder instead of maintaining a second legacy draft workflow.

The builder is presented as the existing page-sheet modal. It owns the complete create, generation, edit, exact WebView preview, publish, share, unpublish, and release-restore flow. Closing it returns to the unchanged Station page and refreshes the status band.

## Architecture

`HomepageScreen` remains the single owner of the homepage lifecycle and uses the existing `homepageApi`, draft store, upload helpers, and Web preview. It receives a modal back action instead of being mounted as a root tab.

`SiteBuilderScreen` becomes a thin product wrapper around `HomepageScreen`. `AppModals` provides the current session and safe toast/error callbacks.

`StationHomepageStatus` is a focused Station component. It reads `homepageV1` and `homepageSite()` from the session, renders a compact state, retries safe load failures, and opens the shared builder. A refresh version changes when the builder closes so publication state is not stale.

The legacy `StationSiteBuilderPanel` no longer creates the older `station_site_drafts` workflow in the App. It becomes a capability entry that opens the shared builder. Existing legacy APIs and stored records remain untouched for compatibility.

## Feature Gating

When `features.homepageV1.enabled` is false:

- The Station status band is absent.
- The floating builder button is absent.
- The Site Builder capability entry shows that the feature is not currently available and cannot open the modal.
- Existing Messages and Station features continue normally.

## Failure Behaviour

- Network failures preserve the login token and show retryable product copy.
- Generation jobs persist locally and resume after backgrounding or relaunch.
- After 20 seconds, the UI explains that generation is continuing instead of spinning without context.
- Model failure returns the editable structured fallback draft.
- Revision conflicts never overwrite a newer draft.
- Expired preview and revoked share links fail closed.
- No raw provider, key, database, or endpoint details appear in ordinary-user UI.

## Verification

- Component tests cover the Station status states and shared entry routing.
- Existing homepage tests continue covering photo count, fallback, revision conflicts, preview isolation, publish confirmation, and revocation.
- RN TypeScript, ESLint, and Jest must pass.
- Backend checks/tests, Agent tests, Web tests/build, and Playwright renderer tests must pass.
- The Build 26 server smoke must pass against a disposable account and remove it afterward.
- Archive verification must confirm version `1.0 (26)` and API base `http://8.153.167.11/api`.

