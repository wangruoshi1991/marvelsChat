# Agent Operations Runbook

- Agent key: `REQUIRED_AGENT_KEY`
- Owner / on-call: `REQUIRED_CONTACT`
- Last verified: `YYYY-MM-DD`

## Health and Readiness

列出 lifecycle、operator enabled、liveness、readiness、capacity、route eligibility、Provider、数据库、队列、OSS、事件回放、Checkpoint 和 Artifact 查看器检查方式。

## Dashboards and Alerts

列出成功率、P50/P95、失败码、队列、事件回放/死信、Checkpoint 恢复、费用、预算、评测漂移和存储监控及阈值。

## Safe Controls

记录 Provider kill switch、新 AgentRun kill switch、limited release、用户授权撤销和事件订阅暂停方式。记录每个操作的权限、审计和恢复条件。禁止在本文件记录密钥值。

## Common Incidents

为 Provider 超时、未知计费、队列堆积、Artifact 损坏、权限错误、跨用户风险、预算超限和 App 不兼容分别写诊断、止损、恢复和验证步骤。

## Data Cleanup

记录用户删除、Artifact 删除、过期清理、失败重试和部分删除恢复。

## Recovery Approval

写明从 suspended 恢复到 limited release，再恢复 available 的审批和验证要求。
