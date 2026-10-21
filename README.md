# marvelsChat / 妙讯

这是妙讯的正式仓库基础，采用单仓库多目录独立工程结构。移动端、后台管理系统、后端、Agent 和 3D Web 工具各自维护业务依赖；根目录依赖只用于跨项目质量检查。

## 目录结构

```text
marvelsChat/
  MiaoxunRN/       # React Native 正式移动端
  admin/           # 后台管理系统前端
  backend/         # Node.js API，承接登录、数据库、管理、Agent 调用
  avatar-web/      # 3D 流程工具与 App 内嵌查看器源码
  media-retrieval-web/ # 私有媒体检索测试工具
  agents/          # 独立 Agent 注册目录
  shared/          # 后端与 Web 共用的公开数据契约
  scripts/         # 仓库检查、数据库备份与恢复工具
  deploy/          # systemd、PostgreSQL 与 Docker 部署模板
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

当前源码、线上服务、客户端分发、验证证据和下一步统一维护在[当前交接](docs/handoffs/CURRENT.md)。开始工作先读 [AGENTS.md](AGENTS.md)、[文档索引](docs/README.md)和当前交接，再核对 Git 与实际运行；日期记录不代表当前状态或新的操作授权。

## 日常客户端

```sh
node scripts/miaoxun-development.mjs ios
```

固定iPhone17、正式Bundle、正式HTTPS；无需本地API或数据库。以下独立后端启动仅用于明确的隔离验证，不是日常App运行步骤。

## 隔离后端验证

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

`MiaoxunRN` iOS API 地址来自 Xcode build setting，并通过 `MiaoxunConfigModule` 暴露给 JS。当前 Debug 与 Release 默认均使用 ECS 的受信任 IP HTTPS origin：

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

模型环境变量与执行模式见 [Agent 模型配置代码入口](docs/agent-model-configuration.md)及 `backend/.env.example`。开发密钥只保存在被 Git 忽略的环境文件；配置缺失或调用失败时必须返回明确错误并保留真实用量状态。模拟器/真机连接正式 HTTPS API 时使用服务器配置，不读取开发 Mac 的 `.env`；开发后端单独配置开发 Key。

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
4. 能力和接口变化同步更新对应专文，阶段状态与证据更新 `docs/handoffs/CURRENT.md`。
5. Agent 独立放在 `agents/`，由后端注册和调用，客户端只消费 API。
6. 涉及外部发送、发布、长期记忆、用户授权的数据流，需要保留确认机制。

## 文档

- [文档索引](docs/README.md)：区分现行说明、上线检查和历史记录
- [生产运维入口](docs/production-operations.md)
- [架构与项目结构](docs/architecture.md)
- [部署说明](docs/deployment.md)
- [移动端上线功能实施清单](docs/mobile-launch-checklist.md)
