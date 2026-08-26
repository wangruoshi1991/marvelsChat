# Agent API、事件与 Artifact 契约

- Agent key: `REQUIRED_AGENT_KEY`
- Contract version: `REQUIRED_VERSION`

## AgentRun 创建

记录 endpoint、鉴权、权限、Idempotency-Key、输入 Schema、确认版本、成功响应、`requestId/runId/traceId` 和稳定错误码。

## AgentCard 与可用性

记录 Manifest 到 AgentCard 的字段投影、禁止字段、最低 App build、public availability 和 route eligibility 的映射。源 Manifest、Provider 配置、环境变量和原始错误不得成为客户端 DTO。

## 状态机

列出每个公共状态、detailStatus、允许来源、允许目标、触发条件、超时、取消和恢复行为。

## 领域 API

列出专用 endpoint，以及其 CapabilityJob 如何绑定 `agentRunId`。

## 事件

列出事件名称、`schemas/agent-event.schema.json`、`runId + attempt + sequence` 顺序保证、`deliveryKey` 重复处理、`afterSequence` 断线恢复、死信处理和保留期。说明哪些 stage/进度字段可对用户展示。

## Checkpoint

列出 Checkpoint schema、最小状态、最大存活期、加密/访问控制、恢复边界、兼容策略、版本迁移、取消和未知计费时的行为。

## Artifact

逐类列出类型、MIME、大小、格式版本、内容摘要/校验、所有权、默认可见性、查看器、移动端版本、保留、分享和删除。

## 错误

逐项定义公开错误 `code`、产品文案、是否可重试、用户动作和内部运维映射。公开字段禁止包含 Provider 原文。

## 兼容

说明最低 App build、最低后端契约、旧任务读取和 major 版本迁移策略。
