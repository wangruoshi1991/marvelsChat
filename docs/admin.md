# 后台管理

后台管理页面位于：

```text
http://127.0.0.1:5175
```

后台管理系统前端位于独立的 `admin/` 工程。后台 token 只保存在当前标签会话的 `sessionStorage` 中，不复用 App 的 Keychain 登录态；关闭标签后需要重新登录。App 登录页不提供后台入口，后台也不提供返回 App 的入口。

后台管理系统的后端接口仍在 `backend/` 中，通过 `/api/admin/*` 提供；不单独拆一个后台后端，避免重复鉴权、数据库连接和审计逻辑。

本地开发默认代理到 `http://127.0.0.1:4390`。如果需要管理 TestFlight 正在使用的线上后端，启动后台时显式指定：

```sh
MIAOXUN_ADMIN_API_TARGET=https://8.153.167.11 npm run dev
```

也可以直接使用固定脚本：

```sh
npm run dev:prod-api
```

Vite 代理必须开启 `changeOrigin`，否则本地后台代理 HTTPS 线上域名时可能出现 502。默认管理员只用于开发或生产环境的一次性初始化，初始化密码不能常驻服务器环境文件。

后台登录页会显示“当前连接”，用于确认正在管理本机后端还是线上后端。账号不存在和密码错误统一提示“账号或密码不正确”，避免泄露账号是否存在；网络失败单独提示“无法连接后台服务”。

开发默认管理员：

```text
账号：admin
密码：使用后端环境变量 `DEFAULT_ADMIN_PASSWORD`
显示名：妙讯管理员
```

完成数据库迁移后执行 `DEFAULT_ADMIN_ENABLED=true npm run admin:bootstrap` 创建或更新该账号；`db:migrate` 不再隐式创建管理员。

生产初始化流程见 [数据库说明](database.md#管理员)。生产环境禁止 `CREATE_FIRST_USER_AS_ADMIN=true` 和非空 `ADMIN_EMAILS`。

## 当前能力

- 概览：总用户数、24 小时活跃用户数、总会话数、今日消息、今日事件、今日 Agent 调用。
- 账号管理：创建账号、搜索筛选账号、启用/停用账号、设置管理员/普通用户、重置用户密码、撤销目标用户登录态。
- 账号详情：查看 AI ID、会话、最近事件、最近 Agent 调用，并编辑小站昵称、简介、社区和活动区域。
- Agent 授权：按用户启用或停用 `agents/` 中注册的 Agent；启用后会创建或恢复对应 Agent 会话。
- Agent 注册：读取 `agents/` 中已注册的 Agent，并统计近期调用。
- 模型服务：显示当前 `NEW_API_*` 配置状态、实际 chat completions endpoint，并可发起一次管理员连通测试。
- 事件流：读取 `usage_events`，包含登录、退出、消息和后台管理动作。
- Agent 调用记录：读取 `agent_runs`。

## 对应 API

```text
GET /api/admin/overview
GET /api/admin/users
POST /api/admin/users
GET /api/admin/users/:userId
PATCH /api/admin/users/:userId/status
PATCH /api/admin/users/:userId/role
PATCH /api/admin/users/:userId/profile
POST /api/admin/users/:userId/revoke-sessions
PATCH /api/admin/users/:userId/agents/:agentId
POST /api/admin/users/:userId/reset-password
GET /api/admin/events
GET /api/admin/agent-runs
GET /api/admin/agents
GET /api/admin/model-status
POST /api/admin/model-test
```

登出接口：

```text
POST /api/auth/logout
```

这些接口都需要：

```text
Authorization: Bearer <token>
```

## 保护规则

- 后端禁止管理员停用自己的当前账号。
- 后端禁止管理员移除自己的管理员权限。
- 后端禁止管理员通过撤销会话接口踢下线自己；当前管理员应使用“退出后台”。
- 后台重置密码会撤销目标用户已有登录会话。
- 后台管理动作会写入 `usage_events`，用于后续审计。

后台只展示和操作数据库真实记录。没有数据时显示空表，不使用模拟图表或前端假统计；概览数字来自 PostgreSQL 聚合查询。

## 妙讯管家模型测试

后台“模型服务”面板读取后端运行时配置，不读取或展示明文密钥。

- `GET /api/admin/model-status`：返回是否已配置、缺失的环境变量、模型名、provider 和最终请求 endpoint。
- `POST /api/admin/model-test`：使用当前 `NEW_API_BASE_URL`、`NEW_API_KEY`、`NEW_API_MODEL` 发起一次 OpenAI-compatible chat completions 请求，并返回回复、耗时和 token 用量。

妙讯管家真实消息链路仍通过 `POST /api/threads/:threadId/messages` 触发。线程绑定 `agent_id = 'miaoxun-butler'` 时，后端会调用 `runAgent`，成功后在消息 metadata 和 `agent_runs` 中记录 provider 与 token 用量。
