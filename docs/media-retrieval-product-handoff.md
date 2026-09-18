# AI 相册检索产品后端与 React Native 交接

原交付冻结日期：2026-08-26；下文冻结提交保留为伙伴交付基线。公共合同与 RN 接入约定已于
2026-09-18 正式修订，修订后的搜索请求必须携带幂等键，不能继续按旧合同接入。

9/16 晚间发布更新：新后端/管理台已上线 `app-integration-20260916-04`，RN 1.0(43)
已分发至现有内外部 TestFlight 群组。检索服务开关和预算未改，仍不可发起真实付费检索。
实际证据见[发布记录](reviews/2026-09-16-production-and-testflight-43.md)；下段为此前准备快照。

9/18 合同修订更新：已在当前工作区补齐搜索幂等重放、空索引任务终态、Provider 响应大小
上限和 Android 显式构建号约束。这些修复尚未部署，也没有进入已分发的 TestFlight 43；
线上 Provider/queue 数据库控制仍关闭、lifecycle 仍为 `sandbox`、ready 索引仍为 0，因而
手机端当前无法完成真实检索是明确的运行条件阻断。启用付费 Provider、调整预算、部署后端及
分发新 TestFlight 都是后续独立审批和验收步骤，不能因本次代码闭环而自动执行。

集成状态更新（2026-09-16）：产品后端已通过 `2446809` 进入当前历史并部署；正式 RN 已实现个人相册中的“找素材”，包括明确同意、启用/补建/撤回、运行事件、图片预览和视频命中时间播放，尚未安装到正式模拟器或通过真实供应商验收。新后端/管理台候选 `app-integration-20260916-03` 已暂存，尚未激活。生产 worker 存活，但数据库 Provider/queue 控制关闭、生命周期为 `sandbox`，没有 ready 索引。不能把代码和后端部署等同于 App 检索可用。本地保留开发验证 Web，伙伴分支后续增加的 `/media-retrieval` 托管入口未移植。来源、运行边界和下一步见 [伙伴集成核对](reviews/2026-09-16-partner-integration.md)及[当前线上候选记录](reviews/2026-09-16-online-retrieval-readiness.md)。

生命周期请求先将账号隔离的操作编号存入 Keychain，不保存搜索词、素材或令牌，网络中断/重启后由用户重试并复用原编号，不自动重复付费请求。搜索请求在一次 App 运行期间遇到网络结果不确定时复用同一编号；成功或确定失败后，用户再次搜索生成新编号。费用待核对时禁止索引和搜索，仍允许撤回/物理清除及原编号重试。新增原素材元信息 API 为鉴权 owner-only，只返回 `id/kind/status`；检索结果 DTO 不变。管理台新增脱敏供应商失败诊断，提示词补齐现有 schema，描述提示词 provenance 升至 v2；历史待核对预留、预算和线上开关未更改。

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

2026-09-18 正式 RN/API 合同修订 SHA-256：

```text
6b92a6df290730d279809a8c64173a5c1258c718f7b912e14125acdfd33851a8
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
| 数据库 | 当前主线 `backend/database/027_*`、`028_*`、`029_*`（伙伴原编号为 025–027） | pgvector、运行/事件、索引、预算、lease、provenance；以 `agents/media-retrieval/integration.json` 为当前映射 |
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
| `POST` | `/api/station/media-retrieval/search` | `200` | 必须提供 `Idempotency-Key` |
| `POST` | `/api/station/media-retrieval/reindex` | `202` | 必须提供 `Idempotency-Key` |
| `DELETE` | `/api/station/media-retrieval/index` | `202` | 必须提供 `Idempotency-Key` |
| `GET` | `/api/agent-runs/:runId/events?afterSequence=N` | `200` | 不需要；owner scoped |

`Idempotency-Key` 必须匹配 `[A-Za-z0-9._-]{8,160}`。enable、search、reindex 和 delete
同一次用户操作重试必须复用原 key；用户主动再次执行必须生成新 key。四类 key 均与规范化后的
请求 SHA-256 绑定，同一 key 携带不同操作或参数会返回 `retrieval_request_invalid`。搜索原文
不会进入 run 的持久化输入摘要。并发中的
同 key 重放返回 `retrieval_request_in_progress`；已完成的同 key 重放返回原公共响应，不再次
调用 Provider 或占用预算。建议 RN 使用 UUID。

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
  | "retrieval_request_in_progress"
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
| `retrieval_request_in_progress` | 409 | true | 保留输入并复用原 key，稍后由用户重试 |
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
3. 收到 `202` 后检查 run 状态；有新任务时进入 indexing 并轮询事件，没有新任务时服务端直接
   返回 `succeeded`，客户端刷新 status，不得永久停在 accepted/queued。
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
- 没有新 job（无目标素材或任务均已存在）时 run 立即进入 `succeeded`，不等待不存在的 worker 任务。

删除后再次启用必须重新同意并产生新的 epoch；旧 job 即使稍后返回也不能重新提交 segment。

## 10. Feature flag 和服务不可用行为

- 服务端总开关：`MEDIA_RETRIEVAL_ENABLED`。
- Provider 调用总开关：`MEDIA_RETRIEVAL_PROVIDER_CALLS_ENABLED`。
- Admin 数据库控制：operator、queue、provider、lifecycle、预算与预留额。
- RN 需增加自己的发布开关，例如 `mediaRetrievalV1`，并只对 Build 26 及以上展示入口。
- 服务端当前不读取 App build header；最低 Build 由 Agent/Admin 合同和 RN 发布开关共同执行。
- App 启动后同时检查注册 Agent、readiness/availability 和 status；任一不可用时不进入可搜索状态。
- 旧 Build、关闭 flag 或服务不可用时隐藏入口或展示“暂不可用”，不得回退到跨用户搜索、自由 lexical 搜索或外部生成。

伙伴冻结基线中的 Agent lifecycle 为 `draft`；最近一次线上只读核验（2026-09-16）显示数据库
lifecycle 为 `sandbox`，Provider/queue 控制关闭且没有 ready 索引。部署本次修订后仍必须完成
真实环境配置和发布审核，再由管理员进入经批准的 `limited_release` 或 `available`，不能把
mock 合同或 worker 存活当作真实检索可用。

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
  -H "Idempotency-Key: $(uuidgen)" \
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

- [ ] 最低能力门禁仍为 Build 26+ 和 RN feature flag；实际发布使用新的唯一构建号。
- [ ] 所有请求带登录 Authorization；enable、search、reindex、delete 四类运行/费用操作带正确 idempotency key。
- [ ] 搜索网络结果不确定时复用原 key；成功或确定失败后的主动搜索使用新 key。
- [ ] 同意版本严格使用 `media-retrieval-consent-v1`。
- [ ] enable/reindex 的 `202` 按返回状态展示；零新 job 的 `succeeded` 不显示 indexing。
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
- Provider HTTP 响应的声明长度和实际读取均限制为 512 KiB；超限立即取消读取并返回脱敏的
  `retrieval_service_unavailable`，不得保留原始响应 body。
- Android 每次构建都必须显式提供正整数 `MIAOXUN_VERSION_CODE`；Release 且启用当前检索能力时
  不得低于 26。示例和 CI 当前使用 43 只用于构建合同，不代表 9/18 修订已进入 TestFlight 43。

开发验证 Web 的目录是 `media-retrieval-web`。它没有同步 2026-09-18 搜索幂等请求合同，不能
连接新后端作为正式能力验收入口，也不应作为移动端发布物或对外产品入口。正式验收只使用
同步新合同的 RN 客户端和受控 API 流程。

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

- 2026-09-18 修订仅存在于当前工作区，尚未部署，也未进入已分发的 TestFlight 43；新后端与
  新 RN 必须协同发布，不能先部署强制搜索幂等键的后端再用旧客户端验收。
- 线上 Provider/queue 控制关闭、lifecycle 为 `sandbox`、ready 索引为 0；未调用真实或付费
  Provider，因此没有真实可用性、质量、延迟和成本结论。
- 未使用真实用户媒体或正式论文数据。
- B0-B6/U1 仍不可用；P1/P2/C9 不是本产品分支的运行时能力。
- 预算、同意范围、Provider/queue/lifecycle 开关、少量授权素材、监控阈值、部署和新 TestFlight
  均需独立审批。只有协同发布并进入批准的 `limited_release` 后，才能进行真实端到端验收。
