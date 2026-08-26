# AgentCard、目录、路由与后台控制清单

- Agent key / version: `REQUIRED_AGENT_VERSION`
- Manifest source: `REQUIRED_MANIFEST_PATH`
- AgentCard schema: `schemas/agent-card.schema.json`
- RuntimeStatus schema: `schemas/runtime-status.schema.json`

## AgentCard Projection

填写并验证：展示名、短说明、公开能力、输入/输出摘要、适用/不适用情形、限制、入口、交互方式、Artifact 查看器、最低 App build 和 public availability。

Card 必须由控制面从 Manifest 和运行状态生成。禁止直接读取源 Manifest，禁止暴露 Provider、环境变量、内部 endpoint、数据库对象、签名 URL、原始错误、密钥或未脱敏事件。

## Availability and Routing

| 生命周期 | 运维启用 | readiness | 容量 | 用户授权/App 版本 | `canStartRun` | 用户文案/reason code |
| --- | --- | --- | --- | --- | --- | --- |
| REQUIRED | REQUIRED | REQUIRED | REQUIRED | REQUIRED | true/false | REQUIRED |

明确 `registered`、`canList` 和 `canRouteNewRun` 的区别。客户端缓存只能用于展示；每次创建 AgentRun 前必须由后端重新判定。

## App/Web Interaction

说明 bootstrap/增量同步字段、创建/确认/取消/恢复入口、事件订阅和断线回放、Artifact 查看/删除、不可用/升级/未授权状态和无障碍/移动端要求。

## Admin Minimum Controls

列出可见性与路由资格、当前/最近 AgentRun、P50/P95/失败码、队列与 Artifact 错误、预计/实际费用、预算、Calibration/Evaluation 结果、kill switch、操作权限和审计记录。

## Projection Tests

必须验证 Manifest 与 Card 的名称/版本/能力/兼容性映射一致；所有禁止字段不存在；RuntimeStatus 不会把 `registered` 误映射为可用；禁用、未就绪、无容量、App 过旧和未授权均无法创建 AgentRun。
