# AI 相册检索产品后端与 React Native 交接

状态：本地集成冻结，尚未 push、merge 或部署
更新日期：2026-08-26

## 1. 冻结基线

| 项目 | 冻结值 |
| --- | --- |
| GitHub 基线 | `origin/main@7d0a7f75bf1fba565844f7f471c3bc36d946c5fb` |
| 产品代码与测试冻结提交 | `9b89699c0a3911f19c81dc9a94a7f5b54dbdc036` |
| 集成分支 | `feat/media-retrieval-product-integration` |
| 本地 worktree | `/Users/I772673/Workspace/mx/marvelsChat/.worktrees/media-retrieval-product-integration` |
| Agent key | `media-retrieval` |
| 产品检索方法 | `b7-product-baseline` |
| 同意版本 | `media-retrieval-consent-v1` |
| 最低 App Build | `26` |

冻结合同 SHA-256：

```text
bb3ca7619bf84169fb503dbe58a36de7bdd4acc2e63e5763633f37a1d86fba59
```

计算规则：按下列相对路径排序，依次写入 `path + NUL + file bytes + NUL`，最后计算 SHA-256：

```text
agents/media-retrieval/contracts/input.schema.json
agents/media-retrieval/contracts/output.schema.json
agents/media-retrieval/contracts/public-error.schema.json
shared/media-retrieval-public-contract.fixture.json
shared/media-retrieval-public-contract.js
shared/media-retrieval-public-error.schema.json
shared/media-retrieval-search-response.schema.json
```

后续任何请求、响应、错误或 schema 变更都必须更新合同 SHA、兼容版本和本文件，不能静默改变 RN 行为。

## 2. 产品边界

本分支包含：

- 用户启用、状态、搜索、重建、撤回并清除索引 API。
- AgentRun 和增量事件 API。
- B7 产品检索：caption、tags、OCR、metadata 和向量候选的本地排序及素材级去重。
- Provider 最终安全边界：身份词仅作本地精确约束；embedding 只接受闭合视觉属性序列化。
- parser 畸形、遗漏或不可验证时 fail closed。
- 用户隔离、同意版本、index epoch、lease、heartbeat、checkpoint、恢复和物理 purge。
- 用户日限额、用户月预算、全局日预算、单次调用预留额和 Admin 控制。
- 独立 worker、pgvector migration、mock smoke、合同测试及开发验证 Web。

明确不包含：

- P1、P2、C9、PrivSearch formal evaluator、formal receipt、实验 manifest 或论文阈值。
- B0-B6/U1 论文 baseline adapter 和任何正式实验结果。
- `paper/privsearch` 旧快照或 `/Users/I772673/Workspace/IEEE` 中的内容。
- 正式移动端界面；`media-retrieval-web` 仅是开发验证工具。
- Provider 真实调用、真实用户素材、正式质量/延迟/成本/隐私结论。

产品 HTTP 请求的 import graph 不经过论文 formal harness。B7 不依赖论文数据、manifest、receipt 或 evaluator 才能运行。

## 3. 文件分类

| 分类 | 位置 | 用途 |
| --- | --- | --- |
| 产品运行时 | `backend/src/media-retrieval-*.js`、`backend/src/routes/station-media-retrieval-routes.js`、`backend/src/routes/agent-run-routes.js` | API、B7、安全策略、worker、生命周期和持久化 |
| 数据库 | `backend/database/025_*`、`026_*`、`027_*` | pgvector、运行/事件、索引、预算、lease、provenance |
| 公共合同 | `shared/media-retrieval-*`、`agents/media-retrieval/contracts` | RN、API 和 Agent 共用的安全 DTO/schema |
| 产品测试 | `backend/test/media-retrieval-*`、`agents/media-retrieval/tests` | 合同、安全、生命周期、真实 pgvector 和 mock smoke |
| 运维/Admin | `backend/src/routes/admin-media-retrieval-routes.js`、`admin` 中媒体检索面板 | readiness、预算、限额、运行与开关 |
| 开发验证工具 | `media-retrieval-web` | 后端联调，不是正式 App |
| 部署准备 | `deploy/docker-compose.prod.yml`、`deploy/miaoxun-prod.env.example`、`backend/Dockerfile` | API 和独立 worker |
| 论文研究代码 | 未移植 | P1/P2/C9/formal evaluator 保留在产品分支之外 |
| 旧论文快照 | 未移植 | `paper/privsearch` 不属于产品代码 |

## 4. 移动端 API

API Base 由 App 环境配置提供。下表路径均已包含 `/api`。所有接口都要求当前登录用户的：

```http
Authorization: Bearer <access-token>
Content-Type: application/json
```

| Method | Path | 成功 | Idempotency |
| --- | --- | --- | --- |
| `POST` | `/api/station/media-retrieval/enable` | `202` | 必须提供 `Idempotency-Key` |
| `GET` | `/api/station/media-retrieval/status` | `200` | 不需要 |
| `POST` | `/api/station/media-retrieval/search` | `200` | 不使用；每次搜索创建独立 run |
| `POST` | `/api/station/media-retrieval/reindex` | `202` | 必须提供 `Idempotency-Key` |
| `DELETE` | `/api/station/media-retrieval/index` | `202` | 必须提供 `Idempotency-Key` |
| `GET` | `/api/agent-runs/:runId/events?afterSequence=N` | `200` | 不需要；owner scoped |

`Idempotency-Key` 必须匹配 `[A-Za-z0-9._-]{8,160}`。同一次用户操作重试必须复用原 key；用户主动再次执行必须生成新 key。建议 RN 使用 UUID。

### 4.1 请求体

```ts
export type MediaRetrievalEnableRequest = {
  consentVersion: "media-retrieval-consent-v1";
};

export type MediaRetrievalSearchRequest = {
  query: string;                 // trim 后 1..240
  kind?: "image" | "video" | null;
  albumId?: string | null;       // UUID
  limit?: number;                // 1..20，默认 10
};

export type MediaRetrievalReindexRequest = {
  scope?: "stale" | "all";      // 默认 all
  mediaAssetIds?: string[];      // UUID，最多 100 个
};
```

`DELETE /index` 和 `GET` 接口没有 JSON 请求体。

### 4.2 可直接使用的响应类型

```ts
export type MediaRetrievalLifecycleStatus =
  | "accepted"
  | "queued"
  | "running"
  | "awaiting_user"
  | "purging"
  | "succeeded"
  | "failed"
  | "cancelled"
  | "blocked"
  | "idle";

export type ApiSuccess<T> = { data: T };

export type MediaRetrievalErrorCode =
  | "retrieval_not_enabled"
  | "retrieval_consent_required"
  | "retrieval_budget_exhausted"
  | "retrieval_service_unavailable"
  | "retrieval_request_invalid"
  | "asset_not_indexable"
  | "run_not_found"
  | "retrieval_policy_unverifiable"
  | "retrieval_provider_transport_unavailable"
  | "retrieval_purge_incomplete"
  | "retrieval_unknown_charge_no_retry"
  | "retrieval_temporary_cleanup_pending"
  | "retrieval_index_enqueue_failed"
  | "retrieval_repository_write_failed"
  | "retrieval_job_lease_lost"
  | "retrieval_staging_missing";

export type ApiFailure = {
  error: {
    code: MediaRetrievalErrorCode;
    message: string;
    retryable: boolean;
  };
};

export type QueueSummary = {
  totalAssets: number;
  enqueued: number;
  reused: number;
};

export type MediaRetrievalAccepted = {
  agentRunId: string;
  lifecycleStatus: MediaRetrievalLifecycleStatus;
  reused: boolean;
  backfill?: QueueSummary;
  jobs?: QueueSummary;
};

export type MediaRetrievalAvailability = {
  state: "available" | "temporarily-unavailable";
  canStartRun: boolean;
  reasonCodes: string[];
};

export type AgentRun = {
  id: string;
  agentId: "media-retrieval";
  runType: string;
  status: "success" | "error" | "pending";
  lifecycleStatus: Exclude<MediaRetrievalLifecycleStatus, "idle">;
  traceId: string | null;
  attempt: number;
  failureCode: MediaRetrievalErrorCode | string | null;
  createdAt: string | null;
  finishedAt: string | null;
};

export type MediaRetrievalStatus = {
  enabled: boolean;
  consentVersion: "media-retrieval-consent-v1" | null;
  backfill: {
    agentRunId: string | null;
    lifecycleStatus: MediaRetrievalLifecycleStatus;
    indexedAssets: number;
    skippedAssets: number;
    totalAssets: number;
  };
  quota: {
    dailyRemaining: number;
    monthlyRemainingFen: number;
  };
  availability: MediaRetrievalAvailability;
  recentRuns: AgentRun[];
};

export type MediaRetrievalSearchResult = {
  mediaAssetId: string;
  kind: "image" | "video";
  matchedFrameTimestampMs: number | null;
  summary: string;               // 最多 160 字符
  matchReasons: string[];        // 最多 6 项，每项最多 64 字符
  scoreBucket: "high" | "medium" | "low";
};

export type MediaRetrievalSearchResponse = {
  agentRunId: string;
  lifecycleStatus: "succeeded";
  method: "b7-product-baseline";
  results: MediaRetrievalSearchResult[];
};

export type AgentRunEvent = {
  id: string;
  sequence: number;
  lifecycleStatus: Exclude<MediaRetrievalLifecycleStatus, "idle">;
  eventType: string;
  visibility: "client";
  payload: Record<string, unknown>;
  createdAt: string | null;
};

export type AgentRunEventsResponse = {
  run: AgentRun;
  events: AgentRunEvent[];
};
```

对应 envelope：

```ts
type EnableResponse = ApiSuccess<MediaRetrievalAccepted>;
type StatusResponse = ApiSuccess<MediaRetrievalStatus>;
type SearchResponse = ApiSuccess<MediaRetrievalSearchResponse>;
type ReindexResponse = ApiSuccess<MediaRetrievalAccepted>;
type DeleteIndexResponse = ApiSuccess<MediaRetrievalAccepted>;
type EventsResponse = ApiSuccess<AgentRunEventsResponse>;
```

RN 不得读取 Provider、descriptor、embedding、对象存储 key、原始 score 或内部错误。这些字段不属于公共合同。

## 5. 客户端状态机

RN 建议使用以下六个产品状态。`enable` 是客户端 CTA/提交中状态，不是数据库枚举。

| RN 状态 | 判定 | UI 行为 |
| --- | --- | --- |
| `disabled` | `status.enabled=false`，且没有活跃 purge | 展示同意说明和“启用检索” |
| `enable` | enable 请求发送中，尚未拿到 `202` | 禁止重复提交；保留同一 idempotency key |
| `indexing` | 已启用，backfill/run 为 accepted/queued/running | 显示已索引/总数并轮询事件；可允许搜索已 ready 素材 |
| `ready` | 已启用，availability 可用，且没有活跃索引 run | 展示搜索入口 |
| `blocked` | availability 不可用，或最后 run 为 blocked/failed | 展示安全产品文案；按 `retryable` 决定是否给重试 |
| `purging` | delete 已接受，或 run lifecycle 为 purging/queued/running 的 purge | 禁止搜索和重建；轮询到 terminal 后刷新 status |

数据库 profile 状态为 `disabled | enabled | purging | purged`。Run 状态为 `accepted | queued | running | awaiting_user | purging | succeeded | failed | cancelled | blocked`。不要把 `HTTP 202` 当成任务完成。

## 6. AgentRun 事件轮询

1. enable/reindex/delete 返回 `agentRunId` 后，从 `afterSequence=0` 开始请求事件。
2. 每次只追加 `sequence > lastSequence` 的事件，并用 event `id` 去重。
3. active 状态下建议 1.5 秒轮询；连续可重试网络错误按 1.5、3、5 秒退避。
4. run 进入 `succeeded | failed | cancelled | blocked` 后停止轮询并刷新 status。
5. App 回到前台时先刷新 status，再从本地 last sequence 补事件。
6. `404 run_not_found` 同时代表不存在或不属于当前用户，不能据此推断其他用户 run。
7. `retrieval_unknown_charge_no_retry` 必须停止自动重试，等待运维确认。

事件 payload 已经过 allowlist；客户端仍应只展示已知 event type 和已知数值字段，未知事件作为“状态已更新”处理。

## 7. 搜索结果和素材展示

- `mediaAssetId` 是跳转主键。优先与 App 当前 station media 列表缓存匹配。
- 原图/视频字节使用既有受保护接口 `GET /api/station/media-assets/:mediaAssetId/file`。
- 不得从检索响应拼 OSS URL，也不得依赖 storage key 或签名 URL。
- 图片进入既有素材预览页；视频在播放器打开后 seek 到 `matchedFrameTimestampMs / 1000` 秒。
- `matchedFrameTimestampMs=null` 表示整张图片或未指定视频帧。
- 素材接口返回 `404` 或 `409` 时，从当前结果移除并刷新搜索/素材列表。
- `scoreBucket` 只用于轻量排序/提示，不显示原始分数，不宣称身份识别概率。
- `matchReasons` 是安全、有限的匹配原因标签；未知标签不得直接作为用户文案。

## 8. 公共错误合同

实际错误 envelope 为 `{ "error": { "code", "message", "retryable" } }`。普通用户界面展示产品文案，不展示原始 Provider body、身份词、query、API key、数据库或 endpoint。

| code | HTTP | retryable | 客户端处理 |
| --- | ---: | :---: | --- |
| `retrieval_not_enabled` | 503 | false | 返回 disabled/联系管理员 |
| `retrieval_consent_required` | 409 | false | 重新展示同意流程 |
| `retrieval_budget_exhausted` | 503 | true | 稍后重试，不循环重试 |
| `retrieval_service_unavailable` | 503 | true | 保留输入，显示服务暂不可用 |
| `retrieval_request_invalid` | 400 | false | 本地校验或修正请求 |
| `asset_not_indexable` | 409 | false | 提示该素材不可建立索引 |
| `run_not_found` | 404 | false | 停止该 run 轮询并刷新状态 |
| `retrieval_policy_unverifiable` | 422 | false | 请求无法安全验证；允许用户改写 |
| `retrieval_provider_transport_unavailable` | 503 | true | 稍后重试 |
| `retrieval_purge_incomplete` | 503 | true | 保持 purging，继续状态轮询 |
| `retrieval_unknown_charge_no_retry` | 409 | false | 禁止自动重试，等待人工处理 |
| `retrieval_temporary_cleanup_pending` | 503 | true | 保持处理中，稍后检查 |
| `retrieval_index_enqueue_failed` | 503 | true | 保留素材并提供手动重建 |
| `retrieval_repository_write_failed` | 503 | true | 不假定操作成功，刷新 status |
| `retrieval_job_lease_lost` | 409 | true | worker 会恢复；客户端刷新事件 |
| `retrieval_staging_missing` | 503 | true | 等待安全恢复或重建 |

`retryable=true` 表示允许用户稍后重试，不代表 RN 应立即无限自动重试。

## 9. 同意、撤回、重建和删除

### 启用

1. 展示明确同意说明。
2. 用户确认后调用 enable，传当前固定 consent version 和新 idempotency key。
3. 收到 `202` 后进入 indexing 并轮询 run events。
4. 上传新素材仍走现有上传 API；上传完成后后端会尝试自动入队，失败有审计事件且可通过 reindex 恢复。

### 撤回与清除

1. 用户二次确认后调用 `DELETE /index`，传新 idempotency key。
2. 后端立即提升 index epoch、停止新 Provider dispatch、取消旧 job 并进入 purge。
3. worker 物理删除 staging、ready descriptor/OCR/embedding，数据库确认 residue 为 0 后 run 才可 succeeded。
4. RN 在成功前保持 purging，不能恢复搜索。

### 重建

- `scope=stale`：仅补没有 active ready 版本的素材。
- `scope=all`：对当前可用素材创建重建任务。
- `mediaAssetIds` 非空时只处理这些、且必须属于当前用户的素材。
- 重复请求必须复用同一 idempotency key；新的主动重建使用新 key。

删除后再次启用必须重新同意并产生新的 epoch；旧 job 即使稍后返回也不能重新提交 segment。

## 10. Feature flag 和服务不可用行为

- 服务端总开关：`MEDIA_RETRIEVAL_ENABLED`。
- Provider 调用总开关：`MEDIA_RETRIEVAL_PROVIDER_CALLS_ENABLED`。
- Admin 数据库控制：operator、queue、provider、lifecycle、预算与预留额。
- RN 需增加自己的发布开关，例如 `mediaRetrievalV1`，并只对 Build 26 及以上展示入口。
- 服务端当前不读取 App build header；最低 Build 由 Agent/Admin 合同和 RN 发布开关共同执行。
- App 启动后同时检查注册 Agent、readiness/availability 和 status；任一不可用时不进入可搜索状态。
- 旧 Build、关闭 flag 或服务不可用时隐藏入口或展示“暂不可用”，不得回退到跨用户搜索、自由 lexical 搜索或外部生成。

Agent lifecycle 目前仍为 `draft`，因此部署前必须完成真实环境配置和发布审核，再由管理员切到 `limited_release` 或 `available`。这不阻止 RN 依据 mock 合同开发，但阻止当前默认环境发起真实运行。

## 11. Mock fixture 与 curl

冻结 mock：`shared/media-retrieval-public-contract.fixture.json`。它只证明合同，不是检索质量证据。

```bash
export API_BASE=http://127.0.0.1:4390/api
export TOKEN='<login token>'

curl -i -X POST "$API_BASE/station/media-retrieval/enable" \
  -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' \
  -H "Idempotency-Key: $(uuidgen)" \
  -d '{"consentVersion":"media-retrieval-consent-v1"}'

curl -sS "$API_BASE/station/media-retrieval/status" \
  -H "Authorization: Bearer $TOKEN"

curl -sS -X POST "$API_BASE/station/media-retrieval/search" \
  -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{"query":"yellow dress on a beach","kind":"image","limit":10}'

curl -i -X POST "$API_BASE/station/media-retrieval/reindex" \
  -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' \
  -H "Idempotency-Key: $(uuidgen)" \
  -d '{"scope":"stale","mediaAssetIds":[]}'

curl -sS "$API_BASE/agent-runs/<run-id>/events?afterSequence=0" \
  -H "Authorization: Bearer $TOKEN"

curl -i -X DELETE "$API_BASE/station/media-retrieval/index" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Idempotency-Key: $(uuidgen)"
```

默认配置关闭 Provider；未完成 Admin 配置时，上述写入/搜索返回安全的 unavailable 是预期行为，不应改成假成功。

## 12. Admin API

以下接口不是 RN 用户接口，要求管理员身份和 `agents:manage` 权限：

| Method | Path | 用途 |
| --- | --- | --- |
| `GET` | `/api/admin/media-retrieval/overview` | readiness、队列、成本、控制和最低 Build 26 |
| `GET` | `/api/admin/media-retrieval/runs?limit=80` | 最近运行；limit 1..200 |
| `PATCH` | `/api/admin/media-retrieval/controls` | 更新开关、生命周期、限额、预算和调用预留 |

启用 Provider 前，`globalDailyBudgetFen`、`userDailyRequestLimit`、`userMonthlyBudgetFen`、`captionReserveFen` 和 `embeddingReserveFen` 都必须为正数。更新会写入审计事件，不得把密钥放入 PATCH body。

## 13. React Native 验收清单

- [ ] 未修改 Build 25；入口只对 Build 26+ 和 RN feature flag 开放。
- [ ] 所有请求带登录 Authorization；只有三类写操作带正确 idempotency key。
- [ ] 同意版本严格使用 `media-retrieval-consent-v1`。
- [ ] enable 的 `202` 显示 indexing，不显示“已完成”。
- [ ] 前后台切换后 status 和 events 能续拉，不重复事件。
- [ ] terminal run 停止轮询；unknown-charge 不自动重试。
- [ ] 搜索空数组显示“未找到”，不当作错误。
- [ ] `422 policy_unverifiable` 允许用户改写查询，不外显内部规则。
- [ ] 图片和视频都按 `mediaAssetId` 打开；视频跳到匹配时间戳。
- [ ] 结果页不读取 OSS key、Provider 字段、raw score 或 descriptor。
- [ ] 撤回后立即禁用搜索，保持 purging 到服务端确认完成。
- [ ] disabled、indexing、ready、blocked、purging 和网络离线状态均有明确 UI。
- [ ] 401 进入现有登录恢复；404 run 不泄漏其他用户信息。
- [ ] 使用共享 fixture 完成 API mock 测试；不把 fixture 命中率当质量结果。

## 14. 数据库、worker 和部署

迁移是 forward-only：

| dirty worktree 旧编号 | 产品编号 | 文件 |
| --- | --- | --- |
| `014` | `027` | `027_media_retrieval_agent.sql` |
| `015` | `028` | `028_media_retrieval_lifecycle_hardening.sql` |
| `016` | `029` | `029_media_retrieval_embedding_provenance.sql` |

集成保留主线现有的 `014..026`，不修改任何可能已经执行的历史 migration。媒体检索只使用连续的新编号 `027..029`。

运行要求：

- Node.js 20+。
- PostgreSQL，已安装 `vector` extension，embedding 列为 `vector(1024)`。
- HNSW cosine index。
- 与 backend 相同数据库/OSS 配置的独立 `media-retrieval-worker` 服务。
- worker 容器需要 `ffmpeg`/`ffprobe`，并保持心跳；优雅停止时间 30 秒。
- API 和 worker 都必须使用 `deploy/miaoxun-prod.env`，但密钥只能在部署 secret 中提供。
- 部署前运行 `cd backend && npm run db:migrate`，再启动 API 和 worker。
- Provider 默认关闭；先配置 Admin 正额度和 `sandbox` 验证，再进入 `limited_release`。

开发验证 Web 的目录是 `media-retrieval-web`。它只用于本地合同和状态验证，不应作为移动端发布物或对外产品入口。

## 15. 回滚和数据清理

1. 先在 Admin 将 provider calls、queue 和 operator 关闭，并将 lifecycle 设为 `suspended`。
2. 设置 `MEDIA_RETRIEVAL_PROVIDER_CALLS_ENABLED=false`；必要时再设置 `MEDIA_RETRIEVAL_ENABLED=false`。
3. 等待在途 lease 结束或被安全回收后停止 worker；不要在调用结果未知时自动重试。
4. 回滚 API/worker 发布物，但保留 `027..029` schema。迁移没有 destructive down migration。
5. 用户级数据清理必须走认证的 `DELETE /api/station/media-retrieval/index` 并轮询到 succeeded。
6. 清理验收必须确认该用户 staging segment、ready/superseded segment 和 embedding residue 均为 0，且旧 epoch job 不能复活。
7. 全局批量清理没有公共 HTTP 接口；只能按经批准的运维流程执行并保留审计记录。

关闭开关不会自动代表派生数据已删除；只有 purge 完成并通过 residue 检查才可向用户声明删除完成。

## 16. 当前限制

- 未调用真实或付费 Provider，因此没有真实可用性、质量、延迟和成本结论。
- 未使用真实用户媒体或正式论文数据。
- B0-B6/U1 仍不可用；P1/P2/C9 不是本产品分支的运行时能力。
- Agent lifecycle 仍为 draft；真实部署、密钥、额度、有限发布审核和监控阈值尚待运维批准。
- 本文件冻结后，RN 可以开始按合同开发；只有后端部署并进入 `limited_release` 后才可进行真实端到端验收。
