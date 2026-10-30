# 后台管理

后台管理页面位于：

```text
http://127.0.0.1:5175
```

## 后台架构与参考

本后台采用资源型运营控制台，而不是把所有功能平铺成一个页面。左侧只保留五个一级工作域：工作台、账户中心、发布中心、运营中心、系统中心；进入工作域后，主内容区提供二级页签、筛选工具栏、完整数据表、详情面板和动作区。摘要指标只用于定位，明细和可追溯操作始终保留在表格、详情和审计中。

信息架构和交互模式参考了以下开源项目的公开实现与文档，未复制其代码或品牌：

- [Ant Design Pro / ProLayout](https://github.com/ant-design/ant-design-pro) 与 [ProTable](https://procomponents.ant.design/components/table)：侧栏、页面容器、资源列表、筛选和详情动作区。
- [Tabler](https://github.com/tabler/tabler)：紧凑侧栏、状态语义、表格密度和响应式空态。
- [Grafana](https://github.com/grafana/grafana)：大屏时间窗口、运行趋势、聚合明细、数据新鲜度和从监控下钻运营资源。
- [React-admin](https://github.com/marmelab/react-admin)：resource/data provider/auth provider 的模块边界和权限驱动操作思路；实现采用 Vite + React + TypeScript/JSX，并由 Refine 提供资源、鉴权和权限边界。

当前主内容的完整信息范围如下：

- **工作台**：窗口摘要、每日 Agent/task 趋势、每日运行明细、最近账号和数据新鲜度。趋势和表格只消费 `/api/admin/overview` 返回的 `daily` 与 `recentUsers`，没有前端假数据。
- **账户中心**：账号列表包含联系方式、角色、状态、会话、消息、Agent 和最近登录；详情展开资料、管理员权限、Agent 授权投影、会话、最近运行和审计摘要。
- **发布中心**：Agent release 展示完整 identity、contract hash、声明 scopes、readiness、registry 版本和上线流程；产品列表展示依赖 release 的发布/就绪/registry 门禁，并提供合同草稿、审核、发布和暂停动作。
- **运营中心**：任务列表展示类型、阶段、Agent 版本、用户、创建/更新时间和失败原因；使用监控按窗口展示 Agent、产品、用户和任务状态的完整聚合表，成本/token 缺失时保持未知。
- **系统中心**：审计记录和脱敏模型/运行配置仍由服务端权限控制，所有写操作保留请求 ID 和审计事件。

后台管理系统前端位于独立的 `admin/` 工程。后台 token 只保存在当前标签会话的 `sessionStorage` 中，不复用 App 的 Keychain 登录态；关闭标签后需要重新登录。App 登录页不提供后台入口，后台也不提供返回 App 的入口。

当前工作区使用 `admin/src/main.jsx` 的 React/Refine 运营壳：固定侧栏按工作台、用户与权限、Agent 与产品、任务与监控、审计与系统分组；每个模块有独立 `/admin/<module>` 路由、Ant Design 数据表、详情抽屉、分页、加载/错误/空态和响应式侧栏。旧 `admin/src/app-shell.js` 与 `admin/admin.js` 仍保留给历史测试和可追溯资产，生产入口由 `admin/index.html` 单独加载 `main.jsx`，不会同时渲染两套后台。

后台管理系统的后端接口仍在 `backend/` 中，通过 `/api/admin/*` 提供；不单独拆一个后台后端，避免重复鉴权、数据库连接和审计逻辑。

本地开发默认代理到官方开发运行器使用的 `http://127.0.0.1:4391`。如果需要管理其他本地后端（例如仍运行在 `4390`）或 TestFlight 正在使用的线上后端，启动后台时显式指定：

```sh
MIAOXUN_ADMIN_API_TARGET=http://127.0.0.1:4390 npm run dev
# 或
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
- Agent 授权：后台只能撤销用户已有的产品 entitlement；不能替用户启用 Agent。用户必须在 App 对已发布产品完成 consent，服务端再按产品依赖写入 `user_agents` 和 Agent 会话。
- Agent 发布中心：代码注册只生成待审核的 Agent release；管理员在后台核对版本、完整 identity、声明权限、就绪检查和合同哈希后审核/发布。产品版本再绑定已发布 release，产品发布后才进入 App 目录。手机端没有全局目录管理入口，只读取已发布产品、release identity 和用户 entitlement；后台发布不代替用户授权。
- Agent 注册：代码 registry 会在 release 页面生成待审核版本；后台只通过 release/product 流程审核和发布，不再提供直接编辑旧目录的上架入口。
- 媒体检索：独立的运行诊断页面读取 Worker 可用性、队列、预算、最近运行和脱敏失败诊断；管理员可在服务端预算校验和审计保护下切换 Agent、Provider 调用和索引队列。页面不展示素材、查询内容或模型原文，也不使用前端示例数据。
- 使用监控：按 7/30/90 天从 `agent_runs` 全量聚合运行次数、成功/失败、Token、成本和平均耗时；不再用最近 500 条记录估算总量。
- 任务运营：读取 `ai_tasks` 和 Agent workspace 的真实任务状态，按 Agent、用户、状态和时间窗口筛选；失败任务只允许在服务端确认合同仍有效后重试，运行中任务不会被强制重放，取消与重试均写入审计事件。
- 产品发布：创建产品版本时必须提供完整产品 identity、平台和具体 `agent_release_id + agent_key + version + scopes` 依赖；提交/发布会重新校验 release 状态、就绪状态、identity 和合同哈希。用户启用产品必须显式同意声明权限，服务端原子写入 entitlement、`user_agents` 和 Agent 会话。
- 模型服务：只显示脱敏的 `NEW_API_*` 配置状态和实际 chat completions endpoint。当前后台不提供直接模型连通测试按钮，避免未确认的供应商调用和费用；需要测试时使用受控的后端运维流程。
- 事件流：读取 `usage_events`，包含登录、退出、消息和后台管理动作。
- Agent 调用记录：读取 `agent_runs`。

## 对应 API

```text
GET /api/admin/overview
GET /api/admin/operations/overview?days=7|30|90
GET /api/admin/users?page=1&pageSize=50&query=&status=&role=&sortBy=createdAt&sortOrder=desc
POST /api/admin/users
GET /api/admin/users/:userId
PATCH /api/admin/users/:userId/status
PATCH /api/admin/users/:userId/role
PATCH /api/admin/users/:userId/profile
POST /api/admin/users/:userId/revoke-sessions
PATCH /api/admin/users/:userId/agents/:agentId（仅撤销产品 entitlement；`enabled:true` 返回 `USER_CONSENT_REQUIRED`）
POST /api/admin/users/:userId/reset-password
GET /api/admin/events?page=1&pageSize=50&query=&sortBy=createdAt&sortOrder=desc
GET /api/admin/agent-runs?page=1&pageSize=50&query=&agentId=&userId=&status=&sortBy=createdAt&sortOrder=desc
GET /api/admin/agent-releases?page=1&pageSize=50&query=&status=&sortBy=updatedAt&sortOrder=desc
PATCH /api/admin/agent-releases/:id/identity
POST /api/admin/agent-releases/:id/review
POST /api/admin/agent-releases/:id/publish
GET /api/admin/products?page=1&pageSize=50&query=&status=&sortBy=updatedAt&sortOrder=desc
POST /api/admin/products
POST /api/admin/products/:id/submit
POST /api/admin/products/:id/publish
POST /api/admin/products/:id/pause
GET /api/admin/agent-usage?days=30
GET /api/admin/tasks?agentId=&userId=&status=&from=&to=&limit=
POST /api/admin/tasks/:taskId/retry
POST /api/admin/tasks/:taskId/cancel
GET /api/admin/monitoring?days=7|30|90
GET /api/admin/media-retrieval/overview
GET /api/admin/media-retrieval/runs?limit=
PATCH /api/admin/media-retrieval/controls
GET /api/admin/model-status
```

登出接口：

```text
POST /api/auth/logout
```

这些接口都需要：

```text
Authorization: Bearer <token>
```

上述五个列表接口在传入 `page` 或 `pageSize` 时统一返回 `data: { items, total, page, pageSize }`。`query`、状态/角色/Agent/用户筛选和排序均在 PostgreSQL 查询中执行；`pageSize` 最大为 200。为兼容旧后台调用，不传分页参数时保留原数组响应，并接受 `limit` 作为 `pageSize` 的别名。

任务运营接口需要 `tasks:read`；任务取消和重试还需要 `tasks:write`。产品接口使用 `products:read` 和 `products:write`。监控和审计接口需要 `audit:read`。时间窗口只接受 7、30 或 90 天，成本和 Token 没有账单证据时返回 `null` 或“未知”，不使用估算值。

## 保护规则

- 后端禁止管理员停用自己的当前账号。
- 后端禁止管理员移除自己的管理员权限。
- 后端禁止管理员通过撤销会话接口踢下线自己；当前管理员应使用“退出后台”。
- 后台重置密码会撤销目标用户已有登录会话。
- 后台管理动作会写入 `usage_events`，用于后续审计。

后台只展示和操作数据库真实记录。没有数据时显示空表，不使用模拟图表或前端假统计；概览数字来自 PostgreSQL 聚合查询。

已发布产品暂停或下架不会删除历史 entitlement；既有授权会按当前合同标记为不可用或需重新同意，新的推荐和启用会被服务端拒绝。新加入 `agents/` 的注册文件首次生成 draft release，必须完成 identity、就绪检查、审核和产品发布后才能进入 App。旧的直接 PATCH 目录上架入口已移除，避免绕过 release 合同。

## 妙讯管家模型状态

后台“服务配置”页面只读取脱敏的运行配置，不读取或展示明文密钥，也不提供直接供应商连通测试按钮。`GET /api/admin/model-status` 返回是否已配置、缺失的环境变量、模型名、provider 和最终请求 endpoint；真实消息链路仍通过受控的 Agent 会话触发并记录运行用量。

妙讯管家真实消息链路仍通过 `POST /api/threads/:threadId/messages` 触发。线程绑定 `agent_id = 'miaoxun-butler'` 时，后端会调用 `runAgent`，成功后在消息 metadata 和 `agent_runs` 中记录 provider 与 token 用量。
