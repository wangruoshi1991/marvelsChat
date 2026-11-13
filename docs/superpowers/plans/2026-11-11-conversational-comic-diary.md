# Conversational Comic and Diary Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** 原 Agent 聊天中讨论、选素材、一次确认生成漫画，查看紧凑画格和详情，再由本人编辑发布；日记独立保存。

**Architecture:** 扩展现 specialist message 的严格输出合同与完成事务，以持久内容预览衔接原058漫画队列。RN只消费受保护引用及真实任务状态，发布沿现小站API增加稳定回执；不新建聊天、队列、供应商或权限系统。

**Tech Stack:** React Native/TypeScript、Node.js/Express/Zod、PostgreSQL、现有媒体存储与AI Worker。

**Spec:** `docs/superpowers/specs/2026-11-11-conversational-comic-diary-design.md`（用户已批准本地实现首版）

## Global Constraints

- 工作目录 `/Users/gary/.codex/worktrees/admin-lifecycle-release/marvelsChat`；保留全部既有修改。
- 不提交、推送、部署、后台发布、TestFlight上传、追加付费模型调用或代用户授权。
- 新内容合同 `X-Miaoxun-Chat-Content: 1`；漫画新消息在模型调用前检查，其他Agent不变。
- 默认4格/生活漫画，pending24小时，来源累计最多6份，每格最多4张参考图，触点至少44pt。
- Agent源码0.1.6，现七scope不扩大。058 task source约束与未知结果不自动重试保持。
- 不重复文字模型调用；漫画不写日记；仅明确保存日记才校验diary:write。
- 已生成本人作品独立于源消息/执行授权读取，不返回失效来源正文。
- 无新依赖/供应商/环境开关；显式失败、私有归属、事务和审计不可省略。

## Shared Interfaces

```ts
type ContentPreviewRef = { version: 1; id: string };
type ContentPreviewContext = { id: string; revision: number };
// Message metadata only contains the ref, never private snapshot/media URLs.
type ContentPreview = {
  id: string; version: 1; revision: number; snapshotHash: string;
  kind: 'comic' | 'diary'; status: 'pending' | 'confirmed' | 'rejected' |
    'expired' | 'superseded' | 'revoked';
  threadId: string; inputMessageId: string; outputMessageId: string;
  snapshot: ComicSnapshot | DiarySnapshot;
  sources: { type: string; id: string; title: string; mediaAssetId?: string }[];
  allowedActions: ('confirm' | 'reject')[]; expiresAt: string;
  result: { comicDiaryId: string; comicRenderTaskId: string } |
    { diaryEntryId: string } | null;
};
type ComicSnapshot = { title: string; summary: string; style: string;
  frameCount: number; frames: ComicFrame[] };
type DiarySnapshot = { title: string; body: string; mood: string };
// Confirm/reject return the current ContentPreview. Task is read via existing API.
POST /api/chat-content-previews/:id/confirm
  { revision: number, snapshotHash: string, idempotencyKey: string }
POST /api/chat-content-previews/:id/reject { revision: number }
GET /api/chat-content-previews/:id
GET /api/station/comic-diaries/:comicDiaryId
// Comic detail: { comicDiary: existing ComicDiaryDTO, tasks: ComicRenderTaskDTO[] }
// Agent output: { type: 'content_preview', kind: 'comic'|'diary', reply: string,
//   snapshot: ComicSnapshot|DiarySnapshot }. Only comic-diary may return this.
// Publishing: existing POST /api/station/posts adds optional clientRequestId(UUID).
GET /api/station/post-submissions/:clientRequestId
// returns { status:'submitted', post:StationPostDTO } | { status:'not_submitted' }.
POST /api/station/post-submissions/:clientRequestId/resolve
// Same response, but atomically closes a missing intent before reporting not_submitted.
```

### Task 1: Protected preview, strict Agent output and atomic confirmation

**Files:** `backend/database/059_chat_content_previews.sql`, new `backend/src/chat-content-*.js`, `backend/src/routes/chat-content-preview-routes.js`; modify specialist dispatch/message service, message request/schema/public projection/client contract, route registration, comic render repository, station comic/library repositories; `agents/comic-diary.agent.js`, `agents/specialist-dispatch.js`; corresponding backend/agents tests.

**Interfaces:** consumes current message admission/completion, queryFn-enabled comic save,058 executor; produces Shared Interfaces above. New helper accepts an existing connection rather than nesting transactions. Execution provenance checks read immutable association without locking preview after task.

- [x] Add failing contract tests for comic-only structured output, cross-branch rejection, old-client426 before provider, message fingerprint and public metadata.
  ```js
  assert.throws(() => validateSpecialistDispatch(proposal, {agentId:'ui-agent',capabilities:[]}), /有效答复/);
  assert.equal(validateSpecialistDispatch(proposal, {agentId:'comic-diary',capabilities:[]}).type, 'content_preview');
  ```
- [x] Run scoped tests and observe missing-contract failures: `node --test backend/test/chat-content-*.test.js agents/test/specialist-dispatch.test.js`.
- [x] Implement strict schema, model prompt, source/history snapshots and pre/post-provider checks. On every comic message admission supersede same-thread pending immediately; continuation uses the complete submitted selection, preserves retained source revisions, and never restores removed refs; canonical refs cannot exceed6. Complete reply/run/audit/preview atomically. Persist source versions actually used by the model.
- [x] Add PG tests: two concurrent confirms and changed-key replay return one comic/task; confirmed replay survives expiry/revocation; diary only creates diary; source change/recall/cross-owner rejects; rollback on task/audit failure. Assert counts, IDs and provider count, not mock calls alone.
  ```sql
  SELECT count(*) FROM ai_tasks WHERE kind='comic_render' AND comic_diary_id=$1;
  -- exactly 1 after both successful HTTP confirmations
  ```
- [x] Implement059 ownership/status/check constraints and service. Lock thread/message before pending preview, never hold preview then lock existing task. First confirm invokes readiness and scoped authority, saves target/task/audit in one transaction; success replays use accepted revision/hash before pending expiry/source checks.
- [x] Revalidate chat provenance before each frame and output binding; owner comic detail/list remains readable after source removal or Agent revoke. Return only safe selected source labels, never deleted text.
- [x] Run backend/agents scoped suites plus PG concurrency and rollback tests. Supply exact DTO example and final changed file list to RN/integration worker.

### Task 2: RN conversation creation, materials and retained history

**Files:** new typed preview API/models/hook/card/grid/detail/library/picker under `MiaoxunRN/src`; modify `MessagesScreen`, `ChatMessageItem`, `App.tsx`, session send/types/mappers and API headers; share existing frame rendering; remove unused `ComicCreationScreen` wiring/file and update its obsolete test; retain explicit station diary conversion. RN tests in `MiaoxunRN/__tests__`.

**Interfaces:** consumes Shared Interfaces and existing media upload/contextRefs, comic task API; exposes publish callback `(draft: {body:string;mediaAssetIds:string[]})=>void` to App; publish composer accepts optional `initialDraft` with that shape and private visibility. Task3 owns composer files, coordinate App wiring through Task2.

- [x] Write failing API/card tests for strict response IDs/hash/kind, pending single confirm, ordered2×2 and failed placeholders, reject/expired, metadata across bootstrap/sync/realtime and recall suppression.
  ```ts
  expect(screen.getByLabelText('第1格')).toBeTruthy();
  expect(onConfirm).toHaveBeenCalledTimes(1); // blocked while awaiting result
  ```
- [x] Run RN targeted Jest to observe missing components/contract failures, then implement typed request/parse/ref mapping and centralized active task polling. Scope all pending returns to token/user/thread/epoch; ignore revision rollback, stop background polling.
- [x] Render actual preview summary, paid-generation copy, selected materials and single confirm; confirmation reads existing task, never invokes text generation. Diary has separate save operation. Shared result grid keeps frame order/placeholders, authenticated private thumbnails, image failure text, 44pt targets and accessible labels.
- [x] Add shared details and read-only 我的漫画 covering old standalone drafts/finished works; remove old chat form entry only after library is reachable. Return preserves chat/draft. Add cancel queued-only and partial-results publishing with explicit image count.
- [x] Wire phone upload/photo refs and existing album-photo selection. Require explanatory text; show metadata-only limitation. Enforce6 refs with explicit error; guard delayed native picker/upload after account/thread change.
- [x] Wire publish callback to existing editor with successful uploaded IDs in frame order. Verify RN targeted tests, TypeScript and lint. Do not claim device validation from Jest.

### Task 3: Atomic, recoverable post publication and borrowed media

**Files:** `backend/database/060_station_post_submissions.sql`, `backend/src/station-post-submission-repository.js`, modify station post routes/repository/schema; RN `stationApi`, `useStationActions`, `useStationPostComposer`, composer screen/content, new publication recovery storage helper; tests and API docs.

**Interfaces:** optional stable clientRequestId for POST, owner GET receipt above; `initialDraft?:{body:string;mediaAssetIds:string[]}` to RN composer. Existing requests explicitly retain legacy contract. Attachment union distinguishes borrowed existing media from picked local files; no borrowed media is deleted.

- [x] Add failing PG/API tests for same-request replay, hash conflict, foreign owner invisibility, media order and atomic audit rollback; optional old POST remains functional.
  ```js
  assert.equal(first.id, replay.id);
  assert.equal((await postsFor(userId)).length, 1);
  ```
- [x] Implement060 owner+UUID receipt and canonical ordered payload hash. Serialize owner/request key; create post/media/receipt/audit using one connection. GET reports submitted/not_submitted read-only. Explicit POST resolve atomically closes missing intents under the same lock; late original POST rejects409. Test resolve racing a late POST, as well as GET waiting an active transaction.
- [x] Add RN failing tests for cancel borrowed assets, mixed local uploads, stable ID restore across remount, unknown result freezing and no cleanup while unknown.
- [x] Implement account-scoped durable prepared request before first network POST; after uncertain transport resolve original intent, no new ID/retry. Submitted→success; atomically closed not_submitted→explicit editable state; lookup failure retains frozen payload and clear recovery action. A read-only GET absence alone cannot unlock editing. Never silently discard errors or delete possibly posted new assets.
- [x] Pass initial comic draft privately; allow editing/removing selected images before publishing and retain explicit visibility. Picker late returns must check session/epoch. Run scoped backend/RN tests and pass exact props to Task2.

### Task 4: End-to-end integration, review and handoff

**Files:** integration tests/scripts as existing patterns, API/architecture/database/Agent docs, `.env.example` notes only if needed, `docs/handoffs/CURRENT.md`, review evidence and docs index.

- [x] Apply all migrations to a fresh isolated PG database. Run message→preview→confirm→real worker with explicit fixture provider→private image reads→owner details→post receipt. Record fixture-only provider boundary, cross-user404/anonymous401 and once-only counts.
- [x] Exercise confirm/worker, recall/confirm and media-delete/store concurrently with finite statement/lock timeouts; fix any cross-layer defect, rerun affected tests.
- [x] Independent review compares actual changes to spec, permissions, unknown-result handling, runtime wiring and accessible UI. Resolve actionable findings before completion.
- [x] Run `MIAOXUN_DOTENV_ENABLED=false ./scripts/check-repository.sh` and `git diff --check`; run appropriate PG integrations and documented fixed-device iOS build gate. Do not boot/bypass a shutdown device gate or call Simulator a real device.
- [x] Update CURRENT with actual implemented files, exact verification,059/060 deployment order, source0.1.6 needing release/product publication, new-client distribution and all unverified real-device/model/production conditions. No change to production is implied.

## Preflight review

Task1→Task2 share ContentPreview DTO and message context; names/branch return shapes agree. Task2→Task3 share initialDraft and publish callback; Task2 alone edits App.tsx, Task3 alone edits composer/station post files. Task1 and Task3 use distinct059/060 migrations; both preserve existing transaction helpers. Task4 owns common docs/checks and reviews cross-layer integration. Each task's tests exercise its stated runtime path; no task requires external deployment or paid calls.

## Execution evidence

本地实现与独立交叉审查已收口。具体测试数量、整仓门禁和设备限制见 `docs/reviews/2026-11-11-conversational-comic-implementation.md`。复选框表示该步骤已实际执行，不表示生产发布、真实模型或设备验收通过；固定iPhone17的build-only在容器只读预检查因Shutdown中止，未编译或启动。
