# 项目地图

本页用于定位工程、模块职责与源码入口。运行版本、迁移、发布进度、验证结论和下一步统一见[当前交接](handoffs/CURRENT.md)；设计逐项对照见[设计状态清单](design-state-checklist.md)，原型与资产来源见[设计资产映射](app-design-assets.md)。源码入口的存在不代表功能闭环或设计验收通过。

## 工程边界

| 工程 | 职责与入口 |
| --- | --- |
| [MiaoxunRN](../MiaoxunRN/) | 唯一正式移动端；React Native 0.87.1 + TypeScript，版本以 [package.json](../MiaoxunRN/package.json) 为准 |
| [backend](../backend/) | Node.js + Express API、鉴权、PostgreSQL、Agent 编排；HTTP 入口 [server.js](../backend/src/server.js) |
| [agents](../agents/) | Agent 声明、权限与执行计划；[registry.js](../agents/registry.js) 动态加载同目录的 Agent 定义 |
| [admin](../admin/) | Vite + React + Refine + Ant Design 管理前端；入口 [main.jsx](../admin/src/main.jsx)，调用后端管理 API |
| [avatar-web](../avatar-web/) | 3D Web 工作台；App 内嵌单模型查看器源码位于 [src/app-viewer](../avatar-web/src/app-viewer/) |
| [media-retrieval-web](../media-retrieval-web/) | 私有媒体检索测试工具；入口 [main.js](../media-retrieval-web/src/main.js) |
| [shared](../shared/) | 后端与 Web 共用的媒体检索公开契约，以及结构页面契约 |
| [scripts](../scripts/)、[deploy](../deploy/) | 仓库检查、构建、备份恢复与部署模板；操作边界见[生产运维入口](production-operations.md) |

分层与依赖约束见[架构说明](architecture.md)；各业务工程独立维护依赖，根目录 `package.json` 只承载仓库质量工具。

## 移动端入口

以下源码路径相对 `MiaoxunRN/src/`。页面切换与跨页面交接由 [App.tsx](../MiaoxunRN/src/App.tsx) 组合，底栏位于 [shared/ui.tsx](../MiaoxunRN/src/shared/ui.tsx)。

| 模块 | 职责与源码入口 |
| --- | --- |
| 妙 | [miao/MiaoTaskFeed.tsx](../MiaoxunRN/src/features/miao/MiaoTaskFeed.tsx) 组合任务与工作空间信息流；[MiaoTaskWorkspace.tsx](../MiaoxunRN/src/features/miao/MiaoTaskWorkspace.tsx) 显示持久任务详情 |
| 讯 | [messages/ThreadListScreen.tsx](../MiaoxunRN/src/features/messages/ThreadListScreen.tsx) 展示对话列表；[MessagesScreen.tsx](../MiaoxunRN/src/features/messages/MessagesScreen.tsx) 提供列表包装与聊天详情，输入和消息项拆在同目录 |
| 我 | [station/StationScreen.tsx](../MiaoxunRN/src/features/station/StationScreen.tsx) 组合资料头部和小站内容；[StationPanels.tsx](../MiaoxunRN/src/features/station/StationPanels.tsx) 切换动态与我的 Agent |
| 二楼 | [second-floor/SecondFloorScreen.tsx](../MiaoxunRN/src/features/second-floor/SecondFloorScreen.tsx) 组合相册、文件、关系、资产、信息海、权限、发布与设置；各工具组件位于同目录 |
| AI 输入与任务 | [ai/AIRequestComposer.tsx](../MiaoxunRN/src/features/ai/AIRequestComposer.tsx)、[AITaskInbox.tsx](../MiaoxunRN/src/features/ai/AITaskInbox.tsx)；语音快捷入口位于 [agents/VoiceShortcutDock.tsx](../MiaoxunRN/src/features/agents/VoiceShortcutDock.tsx) |
| 专业任务与协作 | [workspaces/AgentWorkspaceScreen.tsx](../MiaoxunRN/src/features/workspaces/AgentWorkspaceScreen.tsx) 展示参与者、轮次与成果；[workspacePresentation.ts](../MiaoxunRN/src/features/workspaces/workspacePresentation.ts) 处理展示规则 |
| 上下文辅助 | [assist/AIAssistProvider.tsx](../MiaoxunRN/src/features/assist/AIAssistProvider.tsx) 与同目录的引用、手势及请求构造模块 |
| 会话与业务状态 | [session/useMiaoxunSession.ts](../MiaoxunRN/src/features/session/useMiaoxunSession.ts) 组合登录、同步与领域动作；[auth/AuthScreen.tsx](../MiaoxunRN/src/features/auth/AuthScreen.tsx) 提供登录注册界面 |
| 文件 | [second-floor/SecondFloorFiles.tsx](../MiaoxunRN/src/features/second-floor/SecondFloorFiles.tsx) 处理文件列表、详情与 Agent 交接；[services/stationFilePicker.ts](../MiaoxunRN/src/services/stationFilePicker.ts) 适配系统选择与上传 |
| 结构页面 | [site-document/SiteDocumentPreview.tsx](../MiaoxunRN/src/features/site-document/SiteDocumentPreview.tsx) 与 [SiteDocumentRenderer.tsx](../MiaoxunRN/src/features/site-document/SiteDocumentRenderer.tsx) 处理完整预览和渲染 |
| 独立 3D 流程 | [station/Avatar3DCreateScreen.tsx](../MiaoxunRN/src/features/station/Avatar3DCreateScreen.tsx)、[Avatar3DViewer.tsx](../MiaoxunRN/src/features/station/Avatar3DViewer.tsx)；流程状态由 [useAvatar3dWorkflow.ts](../MiaoxunRN/src/features/station/useAvatar3dWorkflow.ts) 管理 |
| API 与类型 | [services/api](../MiaoxunRN/src/services/api/) 按领域拆分请求，[apiClient.ts](../MiaoxunRN/src/services/apiClient.ts) 聚合；公开类型位于 [models](../MiaoxunRN/src/models/)，客户端合同校验入口为 [aiContract.ts](../MiaoxunRN/src/services/aiContract.ts) |
| 共享界面 | [shared/theme.ts](../MiaoxunRN/src/shared/theme.ts)、[PageGradient.tsx](../MiaoxunRN/src/shared/PageGradient.tsx) 及 [shared/stationStyles](../MiaoxunRN/src/shared/stationStyles/) |

系统桥接位于 [ios](../MiaoxunRN/ios/) 与 [android](../MiaoxunRN/android/)，业务侧统一从 `src/services/` 调用。构建与设备命令见 [RN 说明](../MiaoxunRN/README.md)、[日常联调](local-development-preview.md)和 [iOS 配置](ios.md)。

## 后端与 Agent 入口

| 模块 | 职责与源码入口 |
| --- | --- |
| HTTP 路由 | [backend/src/routes](../backend/src/routes/) 按领域注册；[app-routes.js](../backend/src/routes/app-routes.js) 提供启动数据、Agent 列表与授权入口，[message-routes.js](../backend/src/routes/message-routes.js) 处理会话消息 |
| 持久任务与工作空间 | [ai-task-routes.js](../backend/src/routes/ai-task-routes.js)、[agent-workspace-routes.js](../backend/src/routes/agent-workspace-routes.js) 提供任务 API；[agent-workspace-service.js](../backend/src/agent-workspace-service.js) 组织工作空间业务 |
| Agent 调用 | [agent-runtime.js](../backend/src/agent-runtime.js) 调用 Agent；[agent-workspace-capabilities.js](../backend/src/agent-workspace-capabilities.js) 实现能力执行器；[agent-model-config.js](../backend/src/agent-model-config.js) 选择模型配置 |
| 后台 Worker | [ai-task-worker.js](../backend/src/ai-task-worker.js) 消费持久任务与协作节点；[media-retrieval-worker.js](../backend/src/media-retrieval-worker.js) 消费媒体索引任务 |
| 小站与文件 | [station-routes.js](../backend/src/routes/station-routes.js) 组合小站子路由；[station-file-routes.js](../backend/src/routes/station-file-routes.js)、[file-content.js](../backend/src/file-content.js)、[file-asset-repository.js](../backend/src/file-asset-repository.js) 分别处理文件接口、内容校验与持久化 |
| 数据与迁移 | [db.js](../backend/src/db.js) 管理 PostgreSQL 连接与事务；领域 repository 负责查询；SQL 账本位于 [backend/database](../backend/database/)，迁移入口为 [db-migrate.js](../backend/scripts/db-migrate.js) |
| Agent 定义 | [agents/registry.js](../agents/registry.js) 校验身份、权限与能力声明；[管家](../agents/miaoxun-butler.agent.js)及其他 Agent 定义与 [workspace-contribution.js](../agents/workspace-contribution.js) 位于同目录，CLI 与评测入口见 [Agent SOP](agent-sop/README.md) |

## 按问题查专文

- 产品能力与执行边界：[Agent 工作空间](agent-workspace-architecture.md)、[Agent 接入](agents.md)、[小站能力与缺口](station-feature-closure.md)、[社交关系](social-graph.md)。
- API 与确认规则：[统一 AI 交互](ai-interaction-system.md)、[文件上传与专业摘要](file-processing.md)、[相册 Agent](agents/album-assistant.md)、[媒体检索合同](media-retrieval-product-handoff.md)。
- 配置与数据运维：[模型配置](agent-model-configuration.md)、[数据库与迁移](database.md)、[备份恢复](database-backup.md)、[部署说明](deployment.md)。
- 设计与上线核对：[设计状态清单](design-state-checklist.md)、[移动端上线清单](mobile-launch-checklist.md)。测试源码位于 [RN 测试](../MiaoxunRN/__tests__/)、[后端测试](../backend/test/)和 [Agent 测试](../agents/test/)；检查要求以 [AGENTS.md](../AGENTS.md) 为准。
