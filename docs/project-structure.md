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
- `src/services/`：HTTP API、token、定位、语音、二维码和媒体上传服务。
- `src/models/api.ts`：前后端 DTO 类型边界。
- `src/shared/`：主题、通用样式和 UI 基础组件。

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

## MiaoxunApp/

SwiftUI 原型目录，保留历史实现和设计参考，不作为当前正式移动端主线。

```text
MiaoxunApp/Models/
MiaoxunApp/Services/
MiaoxunApp/Theme/
MiaoxunApp/Views/
```

iOS 原型的模型、API/Keychain 服务、主题和页面视图。

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
```

小站内容和功能类 Agent 的数据访问/API 路由。包括日记、相册、媒体、穿搭、建站草稿、3D 生成任务、文件预处理、漫画日记和视频草稿。

```text
backend/src/site-builder-service.js
backend/src/model-generation-service.js
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
```

数据库初始化/迁移脚本。在 `backend/` 目录执行 `npm run db:migrate` 会调用它。

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
agents/miaoxun-butler.agent.js
```

当前第一个真实 Agent：妙讯管家。

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
