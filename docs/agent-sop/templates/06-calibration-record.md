# 真实供应商校准记录

- Agent key: `REQUIRED_AGENT_KEY`
- Agent version: `REQUIRED_VERSION`
- Provider / model: `REQUIRED_PROVIDER_MODEL`
- 环境: `sandbox | staging`
- 批准人及时间: `REQUIRED_APPROVAL`
- 最大调用次数: `REQUIRED_INTEGER`
- 最大预算（分）: `REQUIRED_INTEGER`
- 失败是否允许重试: `no`（默认且推荐）或附批准记录

## 输入

只记录脱敏摘要、输入类别、测试资产 ID 和授权状态，不粘贴隐私原文或签名 URL。

## 执行

记录 requestId、runId、traceId、attempt、私有 Provider task reference、提交时间、结束时间、状态、事件 sequence 范围和重试次数。

## 费用

记录预计费用、实际费用、币种、计费状态和账单证据引用。

## 质量

记录 EvaluationSuite/fixture/rubric 版本、自动指标、人工验收、Artifact 格式/大小/内容摘要/可用性、客户端展示和已知缺陷。

## 结论

- `accepted | rejected | inconclusive`
- 生产调用建议: `enable-limited | keep-disabled`
- 条件与负责人: `REQUIRED_CONDITIONS`
