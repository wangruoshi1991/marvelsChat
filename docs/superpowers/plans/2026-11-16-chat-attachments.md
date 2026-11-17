# Ordinary Chat Attachments Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close the ordinary direct/group chat flow for static images and supported UTF-8 text files, including upload, message persistence, private rendering, preview, save, exact retry, and explicit failure states.

**Architecture:** Reuse the existing backend attachment and lifecycle contracts. Keep attachment selection, state, DTO validation, message composition, and retries in shared RN TypeScript; use thin iOS/Android adapters only for file picking/streaming and system photo-library writes. Ordinary chat attachments remain separate from Agent `contextRefs`.

**Tech Stack:** React Native 0.87, TypeScript, Express/Zod, PostgreSQL migrations 053/054, Swift/UIKit/PhotoKit, Kotlin/Android SAF/MediaStore, Jest, Node test runner.

**Spec:** `docs/superpowers/specs/2026-11-16-chat-attachments-design.md`

## Global Constraints

- Ordinary chat accepts static JPEG, PNG, and WebP images up to 8 MiB before server normalization.
- Text files are UTF-8 TXT, MD, JSON, CSV, or TSV up to 256 KiB and 50,000 characters.
- One message carries at most 6 distinct attachments; empty text is valid only when at least one attachment ID is present.
- Reuse authenticated owner/thread checks, idempotency, existing private content routes, and the 24-hour unreferenced-draft cleanup.
- Agent conversations keep the existing selected-resource/reference flow; they must reject ordinary attachment IDs before specialist dispatch or model execution.
- No database migration or dependency is expected; add either only if an isolated integration test proves the current contract cannot support the design.
- Android uses MediaStore; Android 10+ requests no media permission, and Android API 24–28 requests bounded write permission only after the user taps Save.
- Do not log attachment bytes, text, or authenticated media URLs. Never forward a bearer token to a redirected origin.
- No production deployment, TestFlight upload, production write, user authorization, or paid provider call is in scope.
- Preserve every pre-existing dirty file and change; do not commit or clean the shared worktree.

---

## File Map

- `backend/src/schemas.js`: require message text or attachments while preserving all workflow-context constraints.
- `backend/src/routes/message-routes.js`: reject ordinary attachments on Agent conversations before specialist dispatch.
- `backend/test/chat-content-contract.test.js`, `backend/test/message-route-contract.test.js`, `backend/test/specialist-message-integration.test.js`: schema, route-order, and Agent-boundary regression coverage.
- `MiaoxunRN/src/models/api.ts`, `MiaoxunRN/src/features/session/sessionTypes.ts`: canonical attachment DTO and message metadata types.
- `MiaoxunRN/src/services/api/http.ts`, new `MiaoxunRN/src/services/api/chatAttachmentApi.ts`: bounded binary upload/content reads and response validation.
- `MiaoxunRN/src/services/stationMediaPicker.ts`, `MiaoxunRN/src/services/stationFilePicker.ts`: existing native selection contracts reused without turning Agent media into chat attachments.
- `MiaoxunRN/src/features/messages/ChatComposer.tsx`, `MessagesScreen.tsx`, `MiaoxunRN/src/App.tsx`: target-aware picker dispatch, attachment draft state, upload status, and send gating.
- `MiaoxunRN/src/services/api/messageApi.ts`, `MiaoxunRN/src/features/session/useMessageActions.ts`: attachment ID payload and stable exact retry.
- New `MiaoxunRN/src/features/messages/ChatMessageAttachments.tsx`: inline image/file content, private loading/errors, image viewer, and text preview.
- `ChatMessageItem.tsx`, `ChatMessageMenu.tsx`, and `MessagesScreen.tsx`: attachment presentation and message-type-specific actions.
- `MiaoxunRN/ios/MiaoxunRN/MiaoxunDocumentPickerModule.swift` and bridge: stream a selected bounded text file to the fixed chat upload route.
- Android app package registration plus a matching SAF/file upload adapter: use the same JS method contract, no business rules in Kotlin.
- Existing iOS media library module plus Android media library adapter: save by attachment ID from the configured API origin only.
- `MiaoxunRN/android/app/src/main/AndroidManifest.xml`: declare legacy write permission with `maxSdkVersion="28"` only if required by the adapter.
- `MiaoxunRN/__tests__/chatAttachmentApi.test.ts`, `chatAttachmentTools.test.tsx`, `chatMessageAttachments.test.tsx`, message/retry tests: transport, state, presentation, and retry behavior.
- New `docs/api/chat-attachments.md`, `docs/README.md`, and `docs/handoffs/CURRENT.md`: final API/platform contract and verified stage evidence.

## Task 1: Backend Message Contract

**Files:**
- Modify: `backend/src/schemas.js`
- Modify: `backend/src/routes/message-routes.js`
- Test: `backend/test/chat-content-contract.test.js`
- Test: `backend/test/message-route-contract.test.js`
- Test: `backend/test/specialist-message-integration.test.js`

**Interfaces:**
- `messageSchema` keeps `content` as a required trimmed string up to 2,000 characters and accepts it empty only when `attachmentIds` contains at least one UUID.
- `POST /api/threads/:threadId/messages` rejects `attachmentIds` on any Agent thread before the specialist dispatch path can persist a message or call a model.

- [x] **Step 1: Add failing schema tests** for text-only, text-plus-attachment, attachment-only, empty-without-attachment, six IDs, seven IDs, and malformed UUIDs. Add a route-level test that duplicate IDs are rejected by the existing attachment resolver.
- [x] **Step 2: Run the focused schema tests** with `cd backend && node --test test/chat-content-contract.test.js`; confirm attachment-only messages are currently rejected by the nonempty-content rule.
- [x] **Step 3: Add failing route tests** proving specialist Agent attachment IDs fail before `sendSpecialistMessage`, user-message persistence, or mocked runtime invocation; preserve UI-Agent and workspace-context rejection tests.
- [x] **Step 4: Implement only the Zod refinement and early Agent guard**; do not change `resolveChatAttachmentsForMessage`, permissions, or product contracts.
- [x] **Step 5: Run `node --test test/chat-content-contract.test.js test/message-route-contract.test.js test/specialist-message-integration.test.js`** from `backend/`; all existing Agent, UI, and context boundaries must still pass.
- [x] **Step 6: Run the isolated `RUN_CHAT_ATTACHMENTS_POSTGRES=1` integration test** after an isolated loopback `*_migration_test` database is available; assert attachment-only direct and group messages persist empty content and canonical attachment metadata without a new migration.

## Task 2: Typed RN Attachment Transport

**Files:**
- Modify: `MiaoxunRN/src/models/api.ts`
- Modify: `MiaoxunRN/src/features/session/sessionTypes.ts`
- Modify: `MiaoxunRN/src/services/api/http.ts`
- Create: `MiaoxunRN/src/services/api/chatAttachmentApi.ts`
- Create: `MiaoxunRN/__tests__/chatAttachmentApi.test.ts`

**Interfaces:**
```ts
export type ChatAttachmentDTO = {
  id: string;
  kind: 'image' | 'file';
  filename: string;
  title: string;
  mimeType: string | null;
  byteSize: number;
  durationMs: null;
  downloadPath: string | null;
  data: Record<string, never>;
};

export function uploadChatImage(args: {
  threadId: string; token: string; uri: string; filename: string; mimeType: string;
  idempotencyKey: string;
}): Promise<ChatAttachmentDTO>;
export function uploadChatFile(args: {
  threadId: string; token: string; nativeKey: string; filename: string; mimeType: string;
  idempotencyKey: string;
}): Promise<ChatAttachmentDTO>;
export function readChatAttachmentText(args: {
  attachment: ChatAttachmentDTO; token: string;
}): Promise<string>;
```

- [x] **Step 1: Write request-envelope tests** that inspect the exact POST path, raw body, authorization, idempotency, encoded filename, attachment kind/MIME headers, app build header, accepted JSON envelope, non-2xx API error, malformed success response, and absence of body/content logging.
- [x] **Step 2: Run `cd MiaoxunRN && npm test -- --runInBand __tests__/chatAttachmentApi.test.ts`**; confirm the new API module and transport behavior are missing.
- [x] **Step 3: Add `ChatAttachmentDTO` and typed `attachments` to `MessageDTO`/`ChatMessage` metadata.** Validate response UUID, kind, file/image MIME, byte size, canonical `/api/chat-attachments/:id/content` path, and safe `data` shape before returning it.
- [x] **Step 4: Add a raw binary upload/content helper to `http.ts`** that uses `buildApiUrl`, the configured origin, AbortController timeout, bearer auth, app build/request headers, and bounded error parsing without serializing/logging file content.
- [x] **Step 5: Implement image upload and authenticated text download** with the exact interfaces above; preserve idempotency key across explicit retries and never follow authenticated redirects.
- [x] **Step 6: Run the focused Jest test and `npm run typecheck`** from `MiaoxunRN/`; verify no unrelated formatter churn.

## Task 3: Platform File Picker and Binary Upload Adapter

**Files:**
- Modify: `MiaoxunRN/ios/MiaoxunRN/MiaoxunDocumentPickerModule.swift`
- Modify: `MiaoxunRN/ios/MiaoxunRN/MiaoxunDocumentPickerModuleBridge.m`
- Create: `MiaoxunRN/android/app/src/main/java/com/wangruoshi/miaoxun/MiaoxunDocumentPickerModule.kt`
- Create: matching Android ReactPackage registration and add it to `MainApplication.kt`
- Modify: `MiaoxunRN/src/services/stationFilePicker.ts`
- Test: `MiaoxunRN/__tests__/stationFilePicker.test.ts`

**Interfaces:**
```ts
NativeModules.MiaoxunDocumentPickerModule = {
  pick(): Promise<PickedStationFile | null>;
  release(key: string): Promise<void>;
  uploadChatAttachment(
    key: string, threadId: string, token: string, mimeType: string,
    encodedFilename: string, idempotencyKey: string,
  ): Promise<{ status: number; body: string }>;
};
```

- [x] **Step 1: Extend JS native-module mocks** to assert pick/cancel, release, and upload arguments for the chat route while keeping station-file upload compatibility unchanged.
- [x] **Step 2: Run `cd MiaoxunRN && npm test -- --runInBand __tests__/stationFilePicker.test.ts`**; confirm the chat upload method is not present.
- [x] **Step 3: Add the iOS chat upload method** using the module-owned temporary file, exact `/api/threads/{UUID}/attachments/upload` route, bearer auth, raw octet stream, encoded filename, kind=file, MIME, idempotency key, and existing no-redirect delegate.
- [x] **Step 4: Add the Android SAF module** with one-file selection, app-private temporary copy, 256 KiB bound, cleanup method, same fixed-origin route/header contract, and redirect rejection; register it through the existing manual package list.
- [ ] **Step 5: Run Jest and platform build checks**: iOS checks are covered by the existing build evidence; Android `./gradlew :app:assembleDebug` remains blocked because this machine has no Java Runtime.

## Task 4: Composer Attachment Draft State

**Files:**
- Modify: `MiaoxunRN/src/features/messages/ChatComposer.tsx`
- Modify: `MiaoxunRN/src/features/messages/MessagesScreen.tsx`
- Modify: `MiaoxunRN/src/App.tsx`
- Create: `MiaoxunRN/src/features/messages/useChatAttachments.ts`
- Create: `MiaoxunRN/__tests__/chatAttachmentTools.test.tsx`
- Modify: `MiaoxunRN/__tests__/chatContentActions.test.tsx`

**Interfaces:**
```ts
export type ChatAttachmentDraft = {
  id?: string;
  clientKey: string;
  kind: 'image' | 'file';
  filename: string;
  mimeType: string;
  byteSize: number;
  localUri?: string;
  idempotencyKey: string;
  status: 'uploading' | 'ready' | 'failed';
  error?: string;
};
```

- [x] **Step 1: Add failing tests** for 1–6 items, photo selection bounded by remaining slots, cancel, individual removal, same-key upload retry, failed-item retention, stale thread/token results, and no state leakage across two open threads.
- [x] **Step 2: Run the focused test**; confirm no attachment draft state/dispatch exists.
- [x] **Step 3: Implement `useChatAttachments`** keyed by `{userId, threadId, tokenEpoch}`; upload selection immediately, retain stable client key/idempotency key for retries, cap at six, and discard late responses after scope changes.
- [x] **Step 4: Pass the target thread ID/kind/agent ID through `onPrepareComposerTool`.** In Agent conversations preserve current station-resource uploads and `contextRefs`; in direct/group conversations route album/camera/file to ordinary chat attachments.
- [x] **Step 5: Add an accessible compact draft strip above the composer action row** with image thumbnails/file rows, uploading/failure state, remove, and retry controls; disable send while any item is uploading/failed and show a precise reason.
- [x] **Step 6: Release native temporary file copies after success, removal, scope change, or unmount; retain a failed upload's copy only while its explicit retry remains available.** Verify cleanup failures are surfaced and are not silently swallowed.
- [x] **Step 7: Run `chatAttachmentTools`, `chatContentActions`, `chatComposerEditing`, and typecheck.** Verify keyboard/voice mode, draft text, reply target, and existing Agent context chips remain unchanged.

## Task 5: Message Send and Exact Retry

**Files:**
- Modify: `MiaoxunRN/src/services/api/messageApi.ts`
- Modify: `MiaoxunRN/src/features/session/useMessageActions.ts`
- Modify: `MiaoxunRN/src/features/messages/MessagesScreen.tsx`
- Modify: `MiaoxunRN/src/features/session/sessionTypes.ts`
- Test: existing message send/retry tests and `MiaoxunRN/__tests__/chatAttachmentTools.test.tsx`

**Interfaces:**
```ts
sendMessage(...existingArgs, contentPreviewContext?, attachmentIds?: string[])
```

- [x] **Step 1: Add failing tests** showing text-plus-attachment and attachment-only requests send the exact `attachmentIds`; attachment uploads that are not `ready` block sends; repeated tap during send dispatches once.
- [x] **Step 2: Add failure/retry tests** proving the retry keeps the original ordered attachment IDs and `clientMessageId`, and a changed attachment list is rejected as a different request rather than silently reusing the receipt.
- [x] **Step 3: Run focused message and retry tests** to confirm failure before implementation.
- [x] **Step 4: Extend the message API payload** and local send receipt with attachment IDs; allow `draft.trim()===''` only when ready attachments exist.
- [x] **Step 5: On success, clear only the submitted attachment snapshot**; retain items added while the request was in flight. On known or unknown failure, preserve the exact snapshot, disable composer resubmission with a clear retry instruction, and expose the existing explicit retry flow without automatic resubmission.
- [x] **Step 6: Run relevant RN tests and typecheck.** Confirm Agent/UI/workspace sends cannot inherit attachment IDs and ordinary text retry behavior remains byte-for-byte stable.

## Task 6: Attachment Message Presentation and Actions

**Files:**
- Create: `MiaoxunRN/src/features/messages/ChatMessageAttachments.tsx`
- Modify: `MiaoxunRN/src/features/messages/ChatMessageItem.tsx`
- Modify: `MiaoxunRN/src/features/messages/ChatMessageMenu.tsx`
- Modify: `MiaoxunRN/src/features/messages/MessagesScreen.tsx`
- Modify: `MiaoxunRN/src/services/comicMediaLibrary.ts` or add a focused chat-media save service
- Modify: existing iOS PhotoKit module and bridge
- Create: Android Photo Library module and register it in `MainApplication.kt`
- Create: `MiaoxunRN/__tests__/chatMessageAttachments.test.tsx`

**Interfaces:**
```ts
type ChatMessageAttachmentsProps = {
  attachments: ChatAttachmentDTO[];
  token: string;
  palette: Palette;
  language: Language;
  onActionMessage(message: string): void;
};

saveChatImageToLibrary({ attachmentId, token }): Promise<{ status: 'saved'; attachmentId: string }>;
```

- [x] **Step 1: Add failing component tests** for canonical empty/text/media messages, one/six image grids, image fetch 401/404/error, tap-to-fullscreen, paging, file loading/content/error preview, and accessibility labels.
- [x] **Step 2: Add menu tests** proving text-only actions stay available as before, image actions show view/save, file actions show preview, and recall/reply/delete state gates continue to apply.
- [x] **Step 3: Implement compact inline image/file views** using fixed layout dimensions and authenticated content paths; do not make arbitrary URLs renderable.
- [x] **Step 4: Implement fullscreen multi-image viewer and in-app text preview** with loading, empty, unauthorized, expired/deleted, and retryable network error states; previews fetch only on explicit open.
- [x] **Step 5: Extend iOS PhotoKit and add Android MediaStore save adapters** keyed only by a validated attachment UUID; both download from the configured API origin, reject redirects, use short-lived memory/disk buffers, request legacy Android write permission only on API 24–28 after Save is tapped, and return explicit saved/denied/failed results.
- [x] **Step 6: Wire menu callbacks** and map actions to the same viewer/preview state; save prompts for platform authorization only after the user selects Save.
- [ ] **Step 7: Run presentation/menu tests and native builds.** Presentation tests passed; Android native build remains blocked by missing Java Runtime.

## Task 7: Vertical Integration, Docs, and Device Verification

**Files:**
- Create: `docs/api/chat-attachments.md`
- Modify: `docs/README.md`
- Modify: `docs/handoffs/CURRENT.md`
- Update all focused tests touched by Tasks 1–6

- [x] **Step 1: Run focused RN tests** for transport, picker, draft state, composer, message send/retry, attachments presentation, and existing Agent/chat flows.
- [x] **Step 2: Run isolated PostgreSQL tests** with disposable loopback `*_migration_test` databases: `RUN_CHAT_ATTACHMENTS_POSTGRES=1`, `RUN_CHAT_ATTACHMENT_LIFECYCLE_POSTGRES=1`, and `RUN_GROUP_CHAT_POSTGRES=1`; record exact pass/skip counts and confirm no production database is used.
- [ ] **Step 3: Run iOS Simulator acceptance** with non-sensitive synthetic images and text files: multi-image upload, file upload/preview, image paging/save, pure-media send, per-item retry/removal, failed message exact retry, and navigation during upload. Inspect keyboard/composer layout at normal and multiline heights. New attachment/sticker simulator acceptance remains pending.
- [ ] **Step 4: Run Android build and available emulator acceptance** for SAF selection, attachment upload/preview, and MediaStore save; the Android build is blocked by the missing Java Runtime.
- [x] **Step 5: Update API documentation** with exact endpoints, headers, MIME/size/count limits, owner/thread and Agent boundary, retention, retry behavior, and no-video scope.
- [x] **Step 6: Update `docs/handoffs/CURRENT.md`** with code, API/database, simulator, Android, production, TestFlight, and real-device statuses kept separate; link the stage record from `docs/README.md`.
- [x] **Step 7: Run `./scripts/check-repository.sh` and `git diff --check`**; report existing environment-gated PostgreSQL skips separately from actual isolated PG results.

## Self-Review Coverage

- Upload, selection, limits, and stale scope: Tasks 2–4.
- Pure attachment messages, Agent boundary, fingerprint/retry, and database compatibility: Tasks 1, 5, 7.
- Private media rendering, file preview, photo save, and typed message actions: Task 6.
- Lifecycle, backend/security regression, platform verification, API documentation, and current handoff: Tasks 1, 3, 6, 7.
- Production/TestFlight/user-consent boundaries: global constraints and Task 7 reporting.
- No database migration or dependency is introduced unless the specified tests demonstrate a contract gap.
