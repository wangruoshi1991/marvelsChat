# Agent Checkpoint、进度与事件契约

- Agent key / version: `REQUIRED_AGENT_VERSION`
- Profiles: `asynchronous-generation | event-driven | orchestrator`
- Checkpoint schema: `REQUIRED_SCHEMA_PATH`
- Event schema: `schemas/agent-event.schema.json`
- Replay window / retention: `REQUIRED_DURATION`

## 安全状态边界

列出每一个允许保存 Checkpoint 的阶段、最小字段、数据分类、加密/访问控制、最大存活时间和删除规则。

禁止保存完整原始会话、密码、Token、API Key、签名 URL、未脱敏照片/文件正文和无法在恢复时重新授权的数据。

## 恢复策略

| 失败位置 | Checkpoint 是否可用 | 恢复动作 | 版本条件 | 用户可见结果 | 人工介入 |
| --- | --- | --- | --- | --- | --- |
| REQUIRED | yes/no | resume / restart-safe-boundary / manual-recovery | REQUIRED | REQUIRED | REQUIRED |

恢复前必须校验 Agent key、Agent version、Checkpoint schema、状态 schema、所有权、授权、计费处置和 compatibility policy。任何校验失败均不得盲目恢复。

## 事件与进度

记录：

- `runId + attempt + sequence` 的顺序和单调递增策略。
- `deliveryKey` 去重规则、重复投递行为和客户端确认点。
- `afterSequence` 回放接口、保留期、乱序重同步和死信处理。
- 各 stage 可展示的产品文案、是否可取消、是否需要用户输入。
- `traceId` 在控制面、worker、Provider Adapter 和审计中的传播方式。

禁止把模型思维链、Provider 原文、隐私输入或内部诊断放入客户端可见事件。

## 验证

必须包含：进程重启、worker 领取失败、重复事件、乱序事件、断线回放、版本不兼容 Checkpoint、取消后恢复和未知计费状态。
