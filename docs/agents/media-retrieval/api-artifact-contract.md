# 媒体检索 Agent API 与事件契约

## 鉴权和幂等

所有端点使用已认证用户，服务端重新校验素材、运行和事件的 `user_id` 归属。所有写操作接受 `Idempotency-Key`；客户端不得提交用户 ID、对象路径、密钥或模型配置。受限 Web 试点只在当前页面内存保留 Bearer 会话，刷新页面必须重新登录，且不得写入 `localStorage` 或 `sessionStorage`。

## 领域 API

| 方法 | 路径 | 行为 |
| --- | --- | --- |
| `POST` | `/api/station/media-retrieval/enable` | 验证 `media-retrieval-consent-v1`，创建回填运行。 |
| `GET` | `/api/station/media-retrieval/status` | 返回安全的启用、进度、额度和最近运行摘要。 |
| `POST` | `/api/station/media-retrieval/search` | 在已启用的私有索引中检索。 |
| `POST` | `/api/station/media-retrieval/reindex` | 对 `stale` 或 `all` 范围创建重建运行。 |
| `DELETE` | `/api/station/media-retrieval/index` | 停用索引并创建清除运行。 |
| `GET` | `/api/agent-runs/:runId/events` | 回放当前用户自己的脱敏事件。 |

## 生命周期和事件

运行遵循 `accepted -> queued -> running -> awaiting_user | succeeded | failed | cancelled | blocked`。索引使用 `enumerating`、`reading-asset`、`extracting-frames`、`describing`、`embedding`、`committing` 与 `purging` 阶段。当前不提供用户主动取消接口，公开 AgentCard 的 `cancellable` 为 `false`；撤回同意会进入独立的清除流程。事件以 `runId + attempt + sequence` 单调排序，`deliveryKey` 去重，断线后用 `afterSequence` 续读。

Checkpoint 只保存游标、阶段、已处理数量、跳过数量、最近已完成素材标识和处理版本。未知计费、授权撤回和预算耗尽不自动恢复为外部调用。

## 无 Artifact

本 Agent 不创建可分享 Artifact。搜索命中只引用用户已有受保护媒体，客户端继续通过既有受鉴权媒体接口读取缩略图或文件。

## 稳定公开错误

`retrieval_not_enabled`、`retrieval_consent_required`、`retrieval_budget_exhausted`、`retrieval_service_unavailable`、`asset_not_indexable`、`run_not_found`、`retrieval_policy_unverifiable`、`retrieval_request_invalid`。

公开响应不得包含向量、对象路径、签名 URL、模型配置、原始错误、原始搜索文本或其他用户信息。
