# Agent Test Matrix

- Agent key: `REQUIRED_AGENT_KEY`
- Version: `REQUIRED_VERSION`
- Applicable profiles: `REQUIRED_PROFILES`

| Gate | Test ID | Scenario | Layer | Environment | Paid | Expected | Evidence | Result |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| G0 | REQUIRED | Manifest invalid field | static | local | no | rejected | REQUIRED | pending |

必须增加：成功、失败、超时、取消、重复、恢复、越权、删除和旧版本兼容用例。

必须同时覆盖：Manifest 到 AgentCard 投影、禁止字段泄漏、RuntimeStatus/route eligibility、事件顺序/重复/回放、Checkpoint 兼容与恢复、Artifact 内容摘要，以及版本化 EvaluationSuite 的分数和人工质量结论。

按 profile 增加 `quality-gates.json` 中所有 requirements。`pending`、`skipped` 或缺少证据的阻塞用例均不能发布；明确不适用时填写 `not-applicable` 和理由。

## 覆盖结论

- 适用门禁: `REQUIRED_GATES`
- 通过门禁: `REQUIRED_GATES`
- 失败门禁: `NONE_OR_GATE_IDS`
- 例外批准: `NONE_OR_APPROVAL_REFERENCE`
- EvaluationSuite / fixture 版本: `REQUIRED_VERSION`
- 及格分 / 实际分: `REQUIRED_SCORE`
