# Agent 类型与风险判定

- Agent key: `REQUIRED_AGENT_KEY`
- Manifest version: `REQUIRED_VERSION`
- 评审日期: `YYYY-MM-DD`

## 类型配置档

对每项填写 `yes/no` 并给出证据：conversational、synchronous-tool、asynchronous-generation、orchestrator、event-driven、external-provider、artifact-producing、paid、sensitive-data、high-risk-action。

## 数据分类

列出 public、internal、private、sensitive、credential 数据；说明来源、目的、Provider 去向、存储位置、保留和删除方式。

## 权限

逐项列出 scope、使用位置、最小化理由、用户确认点和撤销方式。

## 费用

说明预计单次费用、扣费时点、用户配额、全局预算、告警阈值、未知计费处理和退款规则。

## 副作用

说明写入、发布、外发、删除、持续执行和不可逆操作及其补偿方式。异步/事件型 Agent 还要说明 Checkpoint、事件回放、重复投递、恢复与未知计费状态的风险和止损方式。

## 风险结论

- 风险等级: `R0 | R1 | R2 | R3`
- 用户确认: `required | not-required`
- 人工审核: `required | not-required`
- 判定理由: `REQUIRED_REASON`

## 审批

- Agent Owner: `REQUIRED_APPROVAL`
- Security Reviewer: `REQUIRED_APPROVAL_FOR_R2_R3`
- Release Owner: `REQUIRED_APPROVAL`
