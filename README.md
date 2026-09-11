# marvelsChat / 妙讯

这是妙讯的正式仓库基础，采用单仓库多目录独立工程结构。移动端、后台管理系统、后端、Agent 和 3D Web 工具各自维护业务依赖；根目录依赖只用于跨项目质量检查。

## 目录结构

```text
marvelsChat/
  MiaoxunRN/       # React Native 正式移动端
  admin/           # 后台管理系统前端
  backend/         # Node.js API，承接登录、数据库、管理、Agent 调用
  avatar-web/      # 3D 流程工具与 App 内嵌查看器源码
  agents/          # 独立 Agent 注册目录
  docs/            # 架构、迁移计划、接口和 Agent 文档
```

## 技术栈边界

- 移动端：`MiaoxunRN/` 是唯一正式 App 主线，采用 React Native + TypeScript；钥匙串、推送、文件权限等系统能力通过 iOS / Android 薄原生层接入。
- 后台管理前端：独立 `admin/` 工程，当前为 Vite + 原生 JavaScript/CSS，后续也可迁 Vue。它只调用 `/api/admin/*` 和认证接口，不单独拥有后端服务。
- 后端：Node.js + Express + 数据库层。当前实现使用 PostgreSQL。后端负责 API、鉴权、数据读写、后台管理、Agent 注册、Agent 调用编排、模型供应商适配和审计记录。
- Agent：独立放在 `agents/` 工程。Agent 以声明式文件注册能力、权限和提示词计划，由后端运行时加载。前端只消费后端返回的 Agent 列表、授权状态和消息结果。
- Python：当前主工程尚未接入 Python 服务；只有当后续需要独立 AI 任务队列、视频/图片/3D 模型处理、文件解析等 Node.js 不适合长期承载的能力时，再作为独立 worker/service 引入，并通过后端 API 或队列调用。

React Native 是当前正式移动端主线，iOS 上线能力通过 `MiaoxunRN/ios` 原生工程接入。Agent 接入复杂度主要在后端编排、权限、任务状态、流式输出和审计，不在移动端框架本身。后续 iOS 和后台管理都应优先保持现有 `/api` 合约稳定。

## 当前状态

- React Native 正式实现目录为 `MiaoxunRN/`，旧 SwiftUI 原型目录已从主工程移除。
- `MiaoxunRN` 通过自有原生配置桥接 `MiaoxunConfigModule` 显式读取 API 地址；iOS 来源是 `Info.plist` 的 `MiaoxunAPIBaseURL`，Android 来源是 `BuildConfig.MIAOXUN_API_BASE_URL`。该值必须是无路径、查询或片段的 HTTP(S) origin，业务请求必须显式使用 `/api/*` 路径；配置缺失或格式错误会直接报错。
- 未登录状态只展示登录/注册页，不展示原型账号、预览聊天或前端假会话。
- 移动端注册使用唯一昵称作为用户名；用户可用昵称、手机号或邮箱登录。注册或改名时如果昵称已存在，后端返回“名称已使用”。
- 消息页只展示数据库中的真实会话；不会为了贴近 Demo 继续补前端假聊天，也不再额外插入解释性统计卡。
- App 已补齐设置页退出登录；退出会调用后端撤销当前会话，成功后再清理本机 Keychain token。
- App 默认使用新版小站浅色视觉，设置中可切换深色模式；小站浅色页面统一使用 `#F8F7FD` 页面底色、`#FFFFFF` 内容板块、`#F4F6FF` 辅助底色和 `#2012D9` 主强调色。底部导航为“妙讯 / 小站”两栏整条底栏，动态发布入口位于小站“生活”页，不占用底栏中央位置，也不再提供悬浮“妙”入口。
- 后端已提供健康检查、认证、应用启动数据、消息、事件采集和后台管理 API。
- 后台管理系统位于 `admin/`，用于创建账号、管理用户状态/角色/资料/登录态/Agent 授权、重置密码，并查看活跃、消息、事件和 Agent 调用记录。
- 后台管理页使用独立登录态，不复用 App 本地登录缓存；App 登录页也不再提供后台跳转。
- Agent 已独立成 `agents/`，当前包含妙讯管家和建站、文件预处理、相册整理、漫画日记、视频制作等功能类 Agent；3D 形象顾问只提供准备建议，不调用或控制 3D 生成流程。
- `NEW_API_BASE_URL`、`NEW_API_KEY`、`NEW_API_MODEL` 配置完整时，妙讯管家会走 OpenAI-compatible 模型接口；当前本地测试使用 Z.AI GLM。未配置时不会伪造 token 或假装已接入模型。
- 扫码看主页、关注、好友申请、好友通过通知和通知未读已接入真实后端表与 API；扫码结果必须经后端解析 AI ID 后才打开用户主页。
- 小站社交页已展示真实关注、粉丝和好友列表；搜索页已接入真实用户搜索和最近搜索记录；设置页已接入主页展示开关，公开主页会按后端可见性策略隐藏字段。
- 动态、相册、搜索、好友申请拒绝/取消和主页展示开关已接入真实链路；音乐、文件、长期记忆、收藏列表和群组等尚未完整接入的模块保留入口，但不会填充假数据；后续按真实数据表和权限策略逐个完善。
- 妙讯页左上角 `+` 菜单已改成手机壳级浮层，避免压住顶部内容；聊天抽屉也已按 demo 式头部 / 消息区 / 输入栏三段结构重排，头像和消息气泡保持固定网格。
- 小站页的 AI ID 支持复制，并可打开按当前 AI ID 和两分钟有效期生成的标准 QR 动态码；二维码本体保持标准模块形态，外观装饰只允许放在二维码外框。妙讯管家只保留明确的会话入口，不通过悬浮球覆盖页面内容。
- 小站页已接入位置建议。定位坐标来自 iOS CoreLocation / Android LocationManager，社区和活动区域由后端显式配置的 Nominatim-compatible 或高德 Web 服务解析；当前线上使用高德逆地理编码，后端负责把 WGS84 定位坐标转换为高德需要的 GCJ-02 坐标。用户只从真实候选中确认保存，不提供地图选点、默认位置或手输位置绕过；服务未配置或解析失败时会显示明确错误。
- 小站“我的模样”已接入独立的 App 原生 3D 形象流程：照片选择、质量检查、参数、授权、任务状态、四视图确认和模型管理均在 React Native 内完成；Web 工具不嵌入 App，只有 Three.js 单模型画布通过受限 WebView 展示私有 GLB。该流程不调用 Agent，也不保留旧 Meshy、`generation_jobs` 或 `station_model_assets` 兼容接口。
- 妙讯页保留点击进入聊天，同时支持会话项左滑进入、聊天页左滑返回；聊天实时连接按登录 token 管理，增量游标保存在 ref 中，游标前进或在线状态事件都不会重建连接。`connection.ready` 只触发一次增量补偿，不再重新请求完整 bootstrap；在线状态变化通过 `presence.changed` 事件增量更新聊天列表和社交列表。
- 登录/注册页和设置页已按独立移动端页面重排：账号面板、表单、偏好、权限、数据和账户操作分区展示。
- 小站页的日记、相册、音乐、可调用 Agent 和文件区块只保留模块位置和真实空状态；未补 schema/API/权限/审核前不展示示例列表、示例封面或示例文件。
- 小站内容已开始按真实闭环接入：个人日记写入 `station_diary_entries`，相册元数据写入 `station_albums`，今日穿搭写入 `station_outfits`，媒体资产元数据写入 `station_media_assets`；照片拍摄/选图、OSS 上传凭证、上传完成回写、相册封面读取和动态聚合已接入，媒体审核和公开主页读取按 [小站能力闭环方案](docs/station-feature-closure.md) 继续实现。

## 启动

```bash
cp backend/.env.example backend/.env
cd backend
npm install
npm run db:migrate
DEFAULT_ADMIN_ENABLED=true npm run admin:bootstrap
npm run dev
```

另开终端启动后台管理系统：

```bash
cd admin
npm install
npm run dev
```

需要让本地后台直接管理 TestFlight 正在使用的线上服务时：

```bash
cd admin
npm run dev:prod-api
```

后台管理地址：

```text
http://127.0.0.1:5175
```

后端存活与就绪检查：

```text
http://127.0.0.1:4390/api/health
http://127.0.0.1:4390/api/ready
```

`MiaoxunRN` iOS API 地址来自 Xcode build setting，并通过 `MiaoxunConfigModule` 暴露给 JS。当前 Debug 指向本机后端，Release 使用 ECS 的受信任 IP HTTPS origin：

```text
MIAOXUN_API_BASE_URL=https://8.153.167.11
```

正式发布要求是公网 HTTPS、有效证书和稳定 API，不强制使用域名。域名审核完成后可把 origin 切换为 `https://api.marvelschat.com`，数据库和业务路径不需要迁移。

需要本地后端调试时，必须显式新建或修改 Debug 配置为 Mac 局域网 IP 或本机测试后端地址；不能让同一次扫码联调里一端连本地、一端连线上。

移动端普通 API 请求超时为 20 秒，生成类长请求为 45 秒；网络不可达或后端无响应时必须提示错误，不允许让页面无限等待。

当前 iOS 真机调试使用 `MiaoxunRN/ios/MiaoxunRN.xcworkspace` 构建，项目已配置 Apple Development 自动签名；首次安装到个人设备后，需要在 iPhone 的“设置 -> 通用 -> VPN 与设备管理”中信任开发者证书，之后才能由 Mac 启动 App。真机命令和签名要求见 [iOS 客户端规划](docs/ios.md)。

Agent 注册列表：

```text
http://127.0.0.1:4390/api/agents
```

开发环境可通过显式的一次性命令创建管理员账号：

```text
账号：admin
密码：使用 backend/.env 中的 DEFAULT_ADMIN_PASSWORD
显示名：妙讯管理员
```

生产环境禁止首个注册用户自动成为管理员，也禁止在邮箱尚未验证时通过 `ADMIN_EMAILS` 提权。首次部署先执行 `npm run db:migrate`，再临时设置 `DEFAULT_ADMIN_ENABLED=true` 和至少 16 位的非占位强密码执行 `npm run admin:bootstrap`。命令完成后立即恢复 `DEFAULT_ADMIN_ENABLED=false` 并清空密码；不要在常驻生产配置中保留初始化密码。

妙讯管家模型配置：

```text
NEW_API_BASE_URL=https://api.z.ai/api/paas/v4
NEW_API_KEY=
NEW_API_MODEL=glm-4.5-air
```

这些值配置在 `backend/.env`，密钥只保存在本地环境文件。三项为空时，消息仍会真实入库，`agent_runs.provider` 会记录为 `not-configured`，token 字段保持空值。配置后，后端会调用 OpenAI-compatible chat completions 接口，并写入真实 token 用量。文本测试默认使用 `glm-4.5-air`；需要视觉能力时可切换为 `glm-4.6v`。

定位建议需要额外配置：

```text
GEOCODING_PROVIDER=nominatim
GEOCODING_REVERSE_URL=https://<your-nominatim-compatible-host>/reverse
GEOCODING_USER_AGENT=marvelsChat/0.1 contact@example.com
GEOCODING_EMAIL=contact@example.com
```

公共 `nominatim.openstreetmap.org` 有使用限制，不应作为 App 内置通用生产服务；上线应使用自建或明确采购的 Nominatim-compatible 服务。也可以切换 `GEOCODING_PROVIDER=amap`，并配置 `AMAP_WEB_SERVICE_KEY` 与可选 `AMAP_REVERSE_URL` 使用高德 Web 服务逆地理编码。

## 开发原则

1. 前端、后端、Agent 分目录独立维护；根目录 `package.json` 只承载跨项目质量工具，不承载业务运行依赖。
2. `MiaoxunRN/` 是唯一正式移动端方向；历史原型不再保留在主工程。
3. 关键业务数据必须来自 `backend` 和数据库；数据库不可用时 API 返回明确错误，不回退到前端假数据。
4. 每次新增能力时，同步更新 `README.md` 和 `docs/`。
5. Agent 独立放在 `agents/`，由后端注册和调用，客户端只消费 API。
6. 涉及外部发送、发布、长期记忆、用户授权的数据流，需要保留确认机制。

## 文档

- [项目结构说明](docs/project-structure.md)
- [架构说明](docs/architecture.md)
- [iOS 客户端规划](docs/ios.md)
- [社交关系流程](docs/social-graph.md)
- [数据库说明](docs/database.md)
- [后台管理](docs/admin.md)
- [Demo 迁移计划](docs/demo-migration.md)
- [Agent 接入说明](docs/agents.md)
- [部署说明](docs/deployment.md)
- [移动端上线功能实施清单](docs/mobile-launch-checklist.md)
