# 媒体检索 Agent 威胁模型

## 资产和边界

受保护资产包括账户会话、私有媒体、派生描述、OCR、向量、运行事件、预算和管理控制。信任边界依次为客户端、妙讯 API、Worker、数据库、私有对象存储、外部模型和管理端。只有 Worker 可读取处理所需的媒体字节；客户端只接收受控 DTO。

## 主要威胁和控制

| 威胁 | 控制 | 自动验证 |
| --- | --- | --- |
| 跨用户读取 | 每个素材、段、运行和事件查询均强制 `user_id`。 | `authorization-*` 评测与仓储测试。 |
| 身份推断 | 身份词只对已有 caption、tags 或 OCR 做精确匹配，绝不进入向量文本。 | `privacy-identity-isolation`。 |
| 恶意模型输出 | 描述使用 JSON Schema、字段白名单、长度限制和未知字段丢弃。 | `privacy-descriptor-allowlist`。 |
| 对象存储泄露 | 临时对象只在 Worker 内存中使用短期内部访问，事件和响应不保存 URL 或路径。 | Worker 清理测试。 |
| 重复扣费 | 预算预留、幂等键、未知计费不重试、全局熔断。 | `cost-*` 评测。 |
| 删除后残留 | 删除或停用先撤销可查询状态，再异步物理清除。 | `deletion-*` 评测。 |
| 事件重放 | 单调 sequence、deliveryKey 唯一和 checkpoint 兼容策略。 | `recovery-*` 评测。 |
| 日志泄露 | 只记录追踪标识、数量、耗时和稳定错误码。 | 安全与日志测试。 |

## 事故响应

先关闭 `MEDIA_RETRIEVAL_PROVIDER_CALLS_ENABLED`，必要时再关闭 `MEDIA_RETRIEVAL_ENABLED` 和队列消费。撤销受影响会话，轮换服务端凭据，执行派生索引清除，并在恢复前重新进行安全和成本复核。

当前不存在可接受的真实生产风险，因为 Agent 尚未离开 `draft`。
