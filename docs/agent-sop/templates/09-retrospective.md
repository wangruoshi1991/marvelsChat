# Agent SOP v0.2 试行复盘

- Pilot Agent: `REQUIRED_AGENT_KEY`
- 开始 / 结束日期: `REQUIRED_DATES`
- 参与角色: `REQUIRED_PARTICIPANTS`

## 阶段数据

逐项记录 S0-S10 实际耗时、等待时间、返工次数、自动化程度和阻塞原因。

## 人类可读性

记录首次执行者误解、需要口头解释和重复查找的信息。

## Agent 可执行性

记录开发 Agent 无法判断的字段、非确定性规则、缺少的命令和错误的自动推断。

## 运行与质量

记录 AgentCard/RuntimeStatus 是否发生漂移、事件回放和 Checkpoint 恢复是否可用、EvaluationSuite 是否识别了真实质量问题，以及人工 rubric 是否可重复执行。

## 门禁效果

记录发现真实问题的门禁、没有价值的门禁、缺失门禁和被申请绕过的门禁。

## 工具效果

评估 `agent:new/check/test/smoke/release` 的覆盖、速度、错误文案和证据质量。

## v1.0 决策

列出保留、修改、新增和删除的规则；安全、权限、费用、数据归属、审计和发布一致性规则不得仅因不方便而删除。

## 批准

- SOP Owner: `REQUIRED_APPROVAL`
- Agent Owner: `REQUIRED_APPROVAL`
- Security Reviewer: `REQUIRED_APPROVAL`
- Release Owner: `REQUIRED_APPROVAL`
