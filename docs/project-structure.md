# 项目结构说明

妙讯当前是单仓库多目录独立工程。移动端、后台管理、后端、Agent 和文档分别维护自己的边界。

## 根目录

```text
.gitignore
```

声明不需要进入 Git 的文件，例如各目录的 `node_modules/`、`dist/`、`.env`、日志和系统文件。

```text
README.md
```

项目总说明，包含启动方式、技术栈边界和文档入口。

根目录不放 `package.json`、`package-lock.json` 或 `node_modules/`。依赖安装必须进入对应工程目录执行。
根目录也不放 `.env`，后端环境变量放在 `backend/.env`。

## MiaoxunRN/

正式移动端主线，当前重点适配 iOS。

```text
MiaoxunRN/README.md
```

React Native 技术路线、工程边界和本地开发说明。

```text
MiaoxunRN/src/
```

正式 App 的 TypeScript 业务代码，包含页面、会话、API 服务、模型类型和主题。

当前移动端采用功能分层：

- `src/features/station/`：我的小站、小站内容、Agent 能力入口和位置设置。
- `src/features/session/`：登录后的会话状态、bootstrap 同步、消息/小站/社交动作。
- `src/services/`：token、定位、语音、二维码和媒体上传服务。
- `src/services/api/`：按领域拆分的 HTTP API 客户端，包含网络底座、认证、应用同步、社交、通知、消息、资料、小站内容和小站 Agent 能力；`src/services/apiClient.ts` 是面向调用方的领域 API facade 与聚合出口。
- `src/models/api.ts`：前后端 DTO 类型边界。
- `src/shared/`：主题、通用样式和 UI 基础组件；小站样式按 `src/shared/stationStyles/` 模块拆分，并由 `stationStyles.ts` 聚合导出。

小站里的 Agent 面板只负责用户侧交互；接口调试、provider readiness 和运维字段应放在后台管理系统，不放进普通用户 App 页面。

```text
MiaoxunRN/ios/
```

iOS 原生工程。`Info.plist` 通过 `MiaoxunAPIBaseURL` 读取 Xcode build setting `MIAOXUN_API_BASE_URL`，Debug/Release 必须显式配置 API 地址。

```text
MiaoxunRN/package.json
MiaoxunRN/package-lock.json
```

移动端自己的依赖和锁定文件。根目录不安装移动端依赖。

## admin/

后台管理系统前端。它是独立工程，但没有独立后端服务。

```text
admin/package.json
admin/package-lock.json
admin/node_modules/
```

后台管理前端自己的依赖、锁定文件和安装目录。当前只依赖 Vite。

```text
admin/vite.config.js
```

后台管理前端开发服务器和生产构建配置。开发端口是 `5175`，并把 `/api` 代理到后端 `4390`。

```text
admin/index.html
```

后台管理系统 HTML 入口。

```text
admin/admin.js
```

后台管理系统界面逻辑，包括管理员登录、账号管理、用户详情、Agent 授权、事件流和调用记录。

```text
admin/admin.css
```

后台管理系统样式。

## backend/

Node.js + Express + PostgreSQL 后端。

```text
backend/package.json
backend/package-lock.json
backend/node_modules/
```

后端自己的依赖、锁定文件和安装目录。Express、PostgreSQL、Zod、Helmet、CORS、dotenv 都归这里。

```text
backend/.env
backend/.env.example
```

后端环境变量和模板。数据库、默认管理员、模型服务密钥都属于后端配置，不放在根目录。

```text
backend/src/server.js
```

后端 HTTP 入口，定义健康检查、认证、App API、消息 API、事件 API 和后台管理 API。

```text
backend/src/config.js
```

读取 `backend/.env` 并整理配置，包括端口、CORS、PostgreSQL、默认管理员和模型服务。

```text
backend/src/db.js
```

PostgreSQL 连接池、查询和事务工具。

```text
backend/src/auth.js
```

密码哈希、登录 session、鉴权中间件和管理员权限检查。

```text
backend/src/repositories.js
```

数据库读写层。用户、资料、会话、消息、事件、Agent 授权和后台管理查询都在这里。

```text
backend/src/station-repository.js
backend/src/routes/station-routes.js
backend/src/routes/station-content-routes.js
backend/src/routes/station-profile-routes.js
backend/src/routes/station-site-routes.js
backend/src/routes/station-file-routes.js
backend/src/routes/station-comic-routes.js
backend/src/routes/station-video-routes.js
backend/src/routes/station-diary-routes.js
backend/src/routes/station-album-routes.js
backend/src/routes/station-media-routes.js
backend/src/routes/station-outfit-routes.js
```

小站数据访问和 API 路由。`station-routes.js` 只负责注册小站子路由，不再承载具体业务实现；内容读取、资料/定位、建站 Agent、文件预处理、漫画日记、视频制作、日记、相册整理、媒体上传和穿搭都按领域拆到独立 route 模块。3D 形象不属于 Station Agent 路由，由下方独立领域负责。

```text
backend/src/avatar-3d-lifecycle-service.js
backend/src/avatar-3d-repository.js
backend/src/routes/avatar-3d-app-routes.js
backend/src/routes/avatar-3d-routes.js
backend/src/avatar-3d-web-service.js
```

3D 形象领域。App 使用 Bearer API 完成原生生成流程；`avatar-3d-routes.js` 和 `avatar-3d-web-service.js` 保留伙伴 Web 工具及 App 单模型 Three.js 查看器所需的 Cookie 会话。两套入口共享生命周期、私有存储、幂等和任务状态，不共享产品 UI。

```text
backend/src/site-builder-service.js
backend/src/album-management-service.js
backend/src/file-preprocessing-service.js
backend/src/comic-diary-service.js
backend/src/video-production-service.js
```

功能类 Agent 的业务服务层。这里负责把用户输入转成草稿、任务、整理建议或脚本结构；不直接处理普通 App 的页面状态。

```text
backend/src/agent-runtime.js
```

Agent 运行时。它从 `agents/` 读取 Agent 计划，再调用模型供应商，并返回回复、耗时和 token 用量。

```text
backend/src/http-error.js
```

统一 HTTP 错误对象。

```text
backend/database/*.sql
```

PostgreSQL 表结构和迁移 SQL。

```text
backend/scripts/db-migrate.js
backend/scripts/admin-bootstrap.js
```

前者只执行迁移账本内的数据库变更；后者由 `npm run admin:bootstrap` 显式执行一次管理员初始化。两者不共享隐式数据修补副作用。

## agents/

Agent 注册和定义目录。

```text
agents/package.json
agents/package-lock.json
```

Agent 工程的依赖和锁定文件。当前没有额外依赖，所以不会生成实质依赖包。

```text
agents/registry.js
```

扫描并加载 `*.agent.js` 文件，向后端提供 Agent 列表和单个 Agent 定义。

```text
agents/*.agent.js
```

每个文件声明一个 Agent 的 key、名称、能力、权限、identity 和提示词计划；后端 `agents/registry.js` 会动态加载这些文件，App 和后台通过后端 API 获取注册结果。

## docs/

项目文档。

```text
docs/project-structure.md
```

说明每个目录和关键文件的用途。

```text
docs/architecture.md
```

架构、技术栈边界和多 Agent 接入方向。

```text
docs/agents.md
```

Agent 文件格式、运行链路和后续多 Agent 接入原则。

```text
docs/ios.md
```

iOS 客户端规划、API 边界和后续后端能力要求。

```text
docs/admin.md
```

后台管理系统功能和 API。

```text
docs/database.md
```

数据库初始化、关键表和管理员配置。

```text
docs/demo-migration.md
```

从原 Demo 到当前真实数据链路的迁移记录。

## 生成目录

```text
admin/dist/
```

运行 `admin` 的 `npm run build` 后生成的前端产物目录。它是构建结果，不需要提交，必要时可以删除后重新构建。
