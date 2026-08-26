# Agent Release Evidence

- Agent key / version: `REQUIRED_AGENT_VERSION`
- Git SHA: `REQUIRED_FULL_SHA`
- Release environment: `staging | production`
- Evidence digest: `GENERATED_DIGEST`
- Generated at: `REQUIRED_TIMESTAMP`

## Source and Build

记录分支、clean worktree、锁文件、Node/平台版本、制品摘要和构建命令。

## Gate Results

逐项记录 G0-G7 状态、命令、证据路径和时间。附 Manifest、AgentCard、RuntimeStatus 和 EvaluationSuite 的版本/摘要。适用阻塞门禁必须全部通过。

## Database and Storage

记录 migration ledger、全量重放、向后兼容、OSS/队列 readiness 和清理任务。

## Compatibility

记录最低 App build、后端契约、AgentCard schema、Artifact 查看器版本、旧任务读取、事件回放和 Checkpoint 恢复验证。

## Configuration

只记录配置项名称及 `configured/missing`，禁止记录值。明确 Provider、新任务、allowlist 和预算开关预期状态，以及 public availability 与 route eligibility 预期。

## Deployment and Rollback

记录不可变制品、部署步骤、健康/readiness/smoke、监控链接、回滚步骤和数据库限制。

## Approvals

记录 Agent Owner、Security Reviewer（R2/R3）和 Release Owner 的批准及时间。
