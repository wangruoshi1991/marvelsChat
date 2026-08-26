# Agent 工具命令规范 v0.2

本文定义未来 Agent 工具必须实现的命令接口。v0.2 SOP 文档包先固定契约；CLI 实现必须另行经过代码设计、测试和发布。

## 通用规则

- 从仓库根目录运行。
- 不接受密码、Token、API Key 或 OSS Secret 作为命令行参数。
- 默认不访问生产环境，不触发付费调用，不部署代码。
- 所有命令支持 `--format text|json`，默认 `text`。
- JSON 输出必须符合：

```json
{
  "command": "agent:check",
  "sopVersion": "0.2.0",
  "agentKey": "example-agent",
  "status": "passed",
  "gates": [],
  "evidence": [],
  "warnings": [],
  "errors": []
}
```

退出码：

| 退出码 | 含义 |
| --- | --- |
| 0 | 全部适用门禁通过 |
| 1 | 一个或多个门禁失败 |
| 2 | 参数、Manifest 或工具配置无效 |
| 3 | 外部环境不可用，无法形成有效结论 |
| 4 | 操作需要明确的人类批准 |

## `agent:new`

```bash
npm run agent:new -- \
  --key example-agent \
  --name "Example Agent" \
  --profiles conversational,external-provider \
  --owner-team example-team
```

必须：

- 校验 key 未被 registry、数据库迁移或路由占用。
- 生成 Manifest、AgentCard、RuntimeStatus、AgentEvent、EvaluationSuite fixture、测试文件和证据目录。
- 按 profile 生成必要的 Capability 骨架。
- 对 `asynchronous-generation` 或 `event-driven` 生成 Checkpoint、事件回放和进度测试骨架。
- 不生成示例密钥、假 Provider 响应或可误认为真实数据的 UI 内容。
- 不覆盖现有文件。

## `agent:check`

```bash
npm run agent:check -- --agent example-agent --format json
```

必须执行：

- JSON Schema 校验。
- Manifest 到 AgentCard 的投影校验，并拒绝 Provider、密钥、环境名、内部 endpoint、原始错误字段进入 Card。
- registry key、版本和 identity 唯一性。
- profile、risk、permissions、entrypoint、execution、Checkpoint 和 EvaluationSuite 一致性。
- RuntimeStatus 路由资格、public availability reason code 和最低 App build 一致性。
- paid/sensitive/high-risk 的追加字段检查。
- 禁止密钥、裸 Provider 错误和客户端直连配置扫描。
- migration、route、audit event 和测试声明一致性检查。
- 评测 fixture、质量 rubric、最低分数、Artifact digest 和 release evidence 引用一致性检查。

## `agent:test`

```bash
npm run agent:test -- --agent example-agent
```

必须：

- 运行 G1-G4、确定性 EvaluationSuite 和 profile 追加测试。
- 不连接生产数据库、生产 OSS 或真实付费 Provider。
- 输出测试命令、耗时、通过数、失败数和证据路径。
- 无适用测试时判定失败，而不是静默通过。

## `agent:eval`

```bash
npm run agent:eval -- --agent example-agent --suite default --format json
```

必须：

- 读取版本化 EvaluationSuite、fixture 引用和质量 rubric，不读取生产个人数据或密钥。
- 执行预期状态、公开错误、事件、Artifact、时延、调用次数和成本上限断言。
- 记录 suite/fixture/模型/Provider 版本、每例结果、总分、人工判断是否待完成和证据摘要。
- 默认只使用 mock 或 sandbox。真实付费校准仅允许由 `agent:smoke --allow-approved-paid-calibration` 明确触发。
- 任何关键案例缺失、未执行、低于阈值或需要人工判断但没有结论时返回失败。

## `agent:smoke`

```bash
npm run agent:smoke -- \
  --agent example-agent \
  --environment sandbox \
  --account-ref MIAOXUN_SMOKE_ACCOUNT
```

必须：

- 仅允许 `local`、`sandbox`、`staging`；生产 smoke 由发布流程单独授权。
- 凭据从安全环境或 Secret Store 读取。
- 测试注册、授权、创建、状态、取消、恢复、Artifact 和删除。
- 测试 AgentCard/public availability、路由拒绝、事件按 sequence 回放、deliveryKey 去重和 Checkpoint 恢复。
- 默认使用 Provider Mock 或供应商沙箱。
- 真实付费调用必须同时提供人类批准记录、调用上限和预算上限；失败不自动重试。

## `agent:release`

```bash
npm run agent:release -- \
  --agent example-agent \
  --environment staging \
  --format json
```

必须：

- 确认工作区、Git SHA、锁文件和 Manifest。
- 汇总 G0-G7 证据、EvaluationSuite 报告、AgentCard 投影快照、RuntimeStatus 摘要、迁移账本、兼容矩阵和批准记录。
- 生成只读 ReleaseEvidence 目录和摘要哈希。
- 检查目标环境 readiness，不打印密钥值。
- 仅生成发布证据，不 SSH、上传 TestFlight 或部署生产。

## 待实现代码的最低测试

- 每个命令的参数、成功和失败测试。
- JSON 输出 Schema 测试。
- Manifest 到 AgentCard 字段投影和禁止字段泄漏测试。
- 事件乱序、重复、回放和 Checkpoint 版本不兼容测试。
- EvaluationSuite、评分阈值和人工质量结论测试。
- 付费与生产保护测试。
- 路径遍历和覆盖保护测试。
- dirty worktree、缺失 Git、缺失依赖和中断恢复测试。
- Windows 不作为 v0.1 阻塞平台；macOS 和 Linux 必须通过。
