# Agent EvaluationSuite

- Agent key / version: `REQUIRED_AGENT_VERSION`
- Suite / fixture version: `REQUIRED_VERSION`
- Schema: `schemas/evaluation-suite.schema.json`
- 最低总分: `REQUIRED_0_TO_100`
- 是否需要人工质量判断: `yes/no`

## Fixture Policy

写明 fixture 存储引用、版本、授权来源、是否为合成数据、保留期和删除策略。禁止把生产个人数据、密码、Token、API Key、签名 URL 或原始私有文件写进 suite。

## Case Matrix

| Case ID | 类别 | Fixture | 预期公开状态/错误 | 事件 | Artifact | 时延/费用/调用上限 | 自动断言 | 人工 rubric | 结果 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| REQUIRED | success/quality/failure/etc. | REQUIRED | REQUIRED | REQUIRED | REQUIRED | REQUIRED | REQUIRED | REQUIRED_OR_NONE | pending |

至少覆盖成功、失败、边界、超时、取消、幂等、越权、恢复和兼容；适用 Agent 还必须覆盖费用、敏感数据和高风险操作。

## Scoring and Quality

列出指标、权重、阈值、方向和总分计算。图像、3D、视频或主观文本质量不得只依赖字符串匹配；必须记录自动指标、人工 rubric、评审人和结论。

## Report Requirements

每次结果必须输出：Git SHA、Manifest/Suite/fixture 版本、模型/Provider 版本、每例状态、得分、失败原因、耗时、成本、人工判断状态和证据摘要。关键案例未执行、低于阈值或需要人工判断但未完成时，发布门禁失败。
