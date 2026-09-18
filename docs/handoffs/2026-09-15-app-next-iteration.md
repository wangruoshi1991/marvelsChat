# 妙讯项目交接：开始下一轮 App 调整

编制日期：2026-09-15。用途：交给新的 Codex 会话，接续 `marvelsChat` 的开发。

本文整理了长期会话中仍有效的决定、当前本地代码状态、最近审查结果和后续入口。它不是逐条聊天记录，也不代表全部功能已经完成或当前线上服务已经重新验收。后续需求以用户新指令为准；代码、部署和发布状态必须核对实际版本。

## 1. 接手时先确认

| 项目 | 本次交接快照 |
| --- | --- |
| 本地仓库 | `/Users/gary/Desktop/myproject/marvelsChat` |
| 当前分支 | `codex/offsite-database-backups` |
| 当前 HEAD | `e70270f9da99034d2a9b04c0278b66287fbb0adb` |
| HEAD 内容 | `fix(ci): avoid obsolete Android SDK tools package` |
| 本地状态 | 有本轮审查修复、恢复手册和本文等未提交修改；不要清理或覆盖 |
| 正式 App | `MiaoxunRN/`，React Native + TypeScript |
| 本轮审查发布情况 | 尚未提交、推送、部署后端或上传 TestFlight |
| 用户下一阶段目标 | 根据近期用户反馈重新调整 App；具体新需求尚未提供 |

先运行 `git status --short --branch` 和 `git log -5 --oneline`，再阅读当前差异。上表是交接时快照，不要强行把后续分支或提交改回这里的值。

**优先在上述本地目录接手。** 重新克隆 GitHub 或从已提交版本创建另一个 worktree，不会自动包含这些未提交修改和未跟踪文档。需要换工作区时，先明确保存并迁移当前成果；不要从旧版本重新实现一遍。当前本地分支及远端跟踪关系也不能证明 `main` 已包含这些修复。

建议把审查修复作为独立提交保存，再承载新需求，便于复查和回退。本次交接没有执行该提交。

## 2. 建议阅读顺序

1. 本文和[2026-09-15 仓库审查报告](../reviews/2026-09-15-repository-audit.md)。
2. [项目总说明](../../README.md)、[项目结构](../project-structure.md)、[架构](../architecture.md)、[开发规范](../development-standards.md)。
3. [移动端说明](../../MiaoxunRN/README.md)，随后按用户新需求读取对应页面、session action、API 和后端实现。
4. 涉及内容管理时读[小站能力闭环](../station-feature-closure.md)；涉及 Agent 时读[Agent 说明](../agents.md)。
5. 涉及发布或外部服务时才读[生产运维入口](../production-operations.md)、[部署](../deployment.md)、[iOS](../ios.md)、[数据库](../database.md)和[备份恢复](../database-backup.md)。

部分长文档保留了早期版本的日期记录，个别功能描述也可能滞后。旧域名、旧 Build、旧数据库部署和旧 UI 不能直接当成当前配置；本轮明确的限制见第 6 节。

## 3. 用户的持续要求

- 这是准备上线的平台应用。先理解现有调用链和数据边界，再修改；用证据说明完成度，不承诺“所有代码绝对没有问题”。
- 保留用户和伙伴的工作。未经对应授权，不改伙伴分支，不删除未知修改，不自动合并功能分支。伙伴曾以 `avatar-3d-web-v1` 指代 3D 分支，历史部署记录出现过 `feat/avatar-3d-web-v1`；需要操作远端时重新核实名称和归属。
- 不使用假数据、静默兼容、假成功或供应商兜底掩盖功能缺失。配置错误、接口契约错误、权限拒绝和真实请求失败应明确显示。
- 采用已有 feature、service、repository 和样式组织方式。按职责控制复杂度，避免无关拆分、重复实现和为通过测试而降低要求。
- 每次功能或结构变更同步相关文档。提交信息使用清晰的 `fix:`、`feat:`、`refactor:`、`docs:` 等前缀。
- 设计必须对照用户当前提供的浏览器设计稿、图片和现有资源，细查颜色、间距、字号、图标及交互。不假定旧浏览器标签页仍代表最新要求。
- 页面要自适应，考虑安全区、键盘、长文本、空数据和奇数项。不要把设计稿标注的 pt 数值未经比例核对直接照搬成 RN 尺寸。
- UI 修改完成后，用户希望能在模拟器看到实际更新。需要说明构建、安装和打开的是哪个版本；只重启模拟器并不等于刷新代码。
- 对真机崩溃先取证：版本、复现步骤、崩溃日志、符号化调用栈和相关代码。不要反复猜测、加延时或隐藏错误后上传。后端日志能帮助关联请求失败，不能代替原生崩溃调用栈。
- 域名仍在办理，暂不处理。用户希望把精力转回 App，避免重复开展已经完成的运维操作或新增不必要的服务。
- 不在回复、文档、日志或 Git 中输出密码、Token、AccessKey 或私钥。生产清理只限经过确认的妙讯资源，不能全局清理共享服务器。
- 历史授权针对当时的具体提交、部署、迁移、发送或删除任务。接手新需求应核对当前授权及实际版本，不能因旧会话曾经批准过发布就自动发布新版本。

## 4. 项目组成及调用边界

| 目录 | 作用与边界 |
| --- | --- |
| `MiaoxunRN/` | 唯一正式移动端；业务在 TypeScript，iOS/Android 原生层只适配系统能力 |
| `backend/` | Express API、鉴权、数据库访问、Agent 编排、3D 生命周期与媒体业务 |
| `agents/` | 动态注册的 Agent 定义及 CLI/评估工具；App 不直接 import 这些源码 |
| `avatar-web/` | 伙伴的 3D 工作台及 Three.js 查看器源码；不是正式 App 页面 |
| `media-retrieval-web/` | 私有媒体检索测试工具；不是正式 App |
| `admin/` | 管理后台前端，使用同一个后端的管理 API |
| `shared/` | 后端及 Web 共用契约；运行镜像必须包含 |
| `backend/database/` | 顺序执行、记录 checksum 的 SQL 迁移；001-029 是本轮已验证基线 |
| `deploy/`、`scripts/` | 部署模板、质量检查、备份和恢复工具 |

主要路径为 App -> API -> 鉴权/领域业务 -> PostgreSQL、OSS 或模型供应商。PostgreSQL 存业务数据、任务状态和资源元数据；图片、视频、GLB 二进制存在私有 OSS。

这是有领域边界的单体后端，不是各 Agent 都能独立部署的微服务系统。媒体检索 worker 是独立进程，但与后端共享代码版本和数据库；3D runner 仍在 HTTP 进程内运行。目录独立不等于运行时、权限和部署完全独立。

## 5. 已做过的主要工作与当前产品决定

下列内容说明已有实现和需要保留的方向，不代表本轮逐项重新完成了真机验收。

### 5.1 妙讯、聊天与搜索

- 妙讯包含真实聊天和通知。已接入注册登录、Keychain 会话、真实 bootstrap、好友关系、公开主页、未读、通知和 WebSocket 增量事件。
- 已有好友聊天发送、失败重试、回复、复制、单侧删除及发送后 1 分钟内撤回。在线状态、通知已读和免打扰应使用真实后端数据；群聊入口不能被理解为群聊产品已完整交付。
- 搜索已改为全屏页面，包含搜索记录和按拼音首字母分组的通讯录；搜索及聊天返回图标使用统一资源。
- 搜索记录后端最多保存 12 条，支持单条删除和清空确认。折叠根据实际标签换行布局判断，不固定只显示 6 条或 8 条，也不是横向滚动标签栏。
- 当前聊天正文搜索由 `searchDirectory.ts` 对已加载的 `threads[].messages` 匹配，过滤已删除或撤回消息。它不是独立的服务端全历史搜索；以后增加消息分页时必须同时考虑搜索范围，不能让搜索只剩最近一页而不说明。
- 历史设计曾多次调整未读、在线状态和标签样式，下一轮以当前设计及实际组件为起点，不要恢复早期废弃排列。

入口：[消息模块](../../MiaoxunRN/src/features/messages/MessagesScreen.tsx)、[搜索页](../../MiaoxunRN/src/features/search/SearchScreen.tsx)、[搜索目录逻辑](../../MiaoxunRN/src/features/search/searchDirectory.ts)、[会话状态](../../MiaoxunRN/src/features/session/useMiaoxunSession.ts)。

### 5.2 小站、动态、日记和相册

- 小站顶部已调整为“第一面 / 生活 / 成果 / 生态 / 其他”。代码值依次为 `station / posts / outcomes / agents / social`。
- 底部只保留“妙讯 / 小站”。中央发布按钮已移除，动态发布入口放在“生活”。悬浮“妙”球也已移除，不要按旧需求重新加回。
- 当前小站只有一个主内容 ScrollView，仅挂载所选面板。用户曾多次报告切换小站、生活或成果时崩溃；修改导航/列表/原生容器时必须保留这一回归场景。
- 已调整个人资料、AI ID 复制、二维码、定位、妙点明细和模块入口。AI ID 采用点击复制并给出提示，旧的复制按钮弹窗不再是目标。妙点明细的进一步视觉调整曾被用户暂缓。
- 浅色设计主要使用页面 `#F8F7FD`、板块 `#FFFFFF`、辅助底色 `#F4F6FF`、分隔 `#F0EBFD`、标签边框 `#DBE2FF`、强调色 `#2012D9`。3D 舞台当前另用 `#F7F8FC`。新设计变更时对应修改主题和组件，不机械全局替换。
- 个人日记首页最多 4 条，两列；个人相册最多 3 个，三列；AI 伙伴最多 6 个，两列。无内容显示真实空状态，奇数项末尾靠左，不用空白卡片补位，也不让第三项撑满整行。
- 日记和相册的创建、详情、编辑已改为全屏工作区。首页创建应返回首页，从更多页创建应返回更多页。日记采用纯文本编辑；相册创建先选 1-9 张照片，再创建和上传，上传失败有对应清理流程。
- 模块的 Agent 入口用于相关对话，“更多”进入常规内容管理，列表左滑进入编辑。日记可生成漫画分镜，但最终漫画图片尚未交付。
- 动态发布、日记、相册、媒体资产已有真实表和 API；不能因存在页面、Tab 或 Agent 注册就宣称音乐、群组、收藏、最终视频/漫画生成等全部完成。
- “更多”页面存在历史分页缺口，详见第 6 节，不能把它称为可访问全部历史数据的完整列表。

入口：[小站容器](../../MiaoxunRN/src/features/station/StationScreen.tsx)、[面板分发](../../MiaoxunRN/src/features/station/StationPanels.tsx)、[首页模块](../../MiaoxunRN/src/features/station/StationHomeModules.tsx)、[动态发布](../../MiaoxunRN/src/features/station/StationPostComposerScreen.tsx)、[内容列表](../../MiaoxunRN/src/features/station/StationContentListScreen.tsx)、[小站主题](../../MiaoxunRN/src/features/station/stationTheme.ts)。

### 5.3 3D 建模与内容 AI 交互

- 用户要求迁移和接入伙伴已经实现的建模能力，不照搬 Web 外观，也不擅自改变模型供应商、参数语义和生成流程。
- App 可独立操作原生生成流程：选照片、质量检查、参数和授权、参考四视图生成与确认、建模任务、模型管理。用户不需要另外打开 Web 工作台配合操作。
- 当前伙伴流程使用 Wan 参考视图和 Tripo 建模，后端负责状态、费用与权限。具体上传数量和参数以真实契约及伙伴实现为准，不能凭 UI 想象增加或删减步骤。
- `model-3d` Agent 是形象顾问；现有 3D 生成工具链不由该聊天 Agent 调用或控制。将来若要联动，需要明确任务/API/授权契约。
- App 只通过受限 WebView 嵌入单模型 Three.js 查看器。源码在 `avatar-web/src/app-viewer/` 和 `avatar-web/src/viewer/`，产物为 `MiaoxunRN/src/assets/avatar-viewer/avatar-viewer.html`，不能手工维护两套实现。
- 原始高精模型和移动端派生 GLB 有各自用途，App 使用移动端资产、缩略图和私有缓存。不要为解决加载慢而回退读取大体积原始文件，也不要修改伙伴分支。
- 历史问题包括方形底色、背景闪烁、模型朝向、长时间刷新和不显示。当前代码对背景、正面视角、资源标识和缓存做过调整，但本轮没有重新验收真实生成或手机渲染。
- “生成形象”按钮是否可用取决于真实服务状态。当前入口在 `avatar3dStatus === 'ready'` 时启用；灰色时先查环境、鉴权、开关、白名单和 readiness，不应先假定模拟器不支持或直接强行启用。
- 内容级 AI 辅助先以 3D 模块实现长按拖拽。有效布局决定是以模块边界布局：左右窄面板纵向对称，上下面板位于两侧之间并留间隔，不再围绕触点缩成很小的框。
- 拖入目标时有目标放大反馈。用户明确不要复制一份 3D 板块、中心拖拽图标或放大镜。取消后应保持一个正常查看器，拖拽不得仅变成模型旋转。
- 当前四向动作是右侧 3D Agent、上方今日穿搭、左侧 AI 伙伴、下方漫画日记；用户说明这些能力映射以后可能调整。手势和动作契约应分离，且不要因为旧方案曾支持拖入悬浮球而恢复悬浮球。

入口：[3D 舞台](../../MiaoxunRN/src/features/station/StationAvatarSpace.tsx)、[原生生成页](../../MiaoxunRN/src/features/station/Avatar3DCreateScreen.tsx)、[查看器](../../MiaoxunRN/src/features/station/Avatar3DViewer.tsx)、[辅助交互](../../MiaoxunRN/src/features/assist/AIAssistGestureSurface.tsx)、[交互类型](../../MiaoxunRN/src/features/assist/aiAssistTypes.ts)、[App 3D API](../../backend/src/routes/avatar-3d-app-routes.js)。

### 5.4 图标及头像来源

- 用户提供的图标已经整理到 `MiaoxunRN/src/assets/icons/`，统一入口是[图标索引](../../MiaoxunRN/src/assets/icons/index.ts)。其中有消息/底栏、返回、通知、发布、动态、伙伴和妙点素材，妙点 banner 在 `points/banner.png`。
- 先检查全部相关素材及 active/inactive 状态，再决定是否使用现有 `lucide-react-native` 图标；不要有设计素材却随意替换。
- 妙讯管家可使用确认的专属图标。动态 Agent 从注册层 `identity` 获得身份标记，用户小头像由头像配置生成；不要把设计示例头像当成真实 Agent 身份，也不要将资料头像和 3D 模型混为同一数据。

## 6. 最近审查修复、证据与未完成项

完整内容以[审查报告](../reviews/2026-09-15-repository-audit.md)为准。报告结论是 **BLOCKED：尚不能据此发布或宣称整个项目没有问题**，但可开展新需求分析和局部 App 开发。

### 本地已修复，尚未提交

| 范围 | 变更 |
| --- | --- |
| App 会话隔离 | 避免退出/切换账号后旧 bootstrap、领域请求或通知回写新会话；凭据保存成功后才发布认证数据 |
| HTTP 错误 | 对标量/无效 JSON envelope 做明确校验，保留状态码和 request ID |
| Agent 模型调用 | 超时覆盖响应体读取，无效响应明确失败 |
| PostgreSQL | 处理连接池空闲连接错误事件，日志不泄露凭据 |
| 增量同步 | 查询开始前固定游标，避免越过查询期间的更新 |
| Docker | 补 `shared/`，新增镜像实际启动、健康和 worker 导入检查 |
| 检查工具与 CI | 递归逐文件语法检查、Agent lint、真实 API 集成测试接入 CI |
| 清理 | 删除无调用的 `backend/src/media-retrieval-identity-safety.js`、`avatar-web/src/workspace/uploadQueue.ts` 及其专属测试 |
| 文档 | 更新架构、结构、部署、闭环说明和恢复手册 |

新增核心文件包括 `useSessionSetter.ts`、`scripts/check-source-syntax.mjs`、`scripts/check-backend-image.sh`、`backend/scripts/check-api-integration.js` 及相关回归测试。通过 Agent CLI 动态加载的 evaluation、manifest、smoke 模块不是死代码，历史 SQL 迁移也不能因旧而删除。

`docs/production-operations.md` 的恢复手册链接和未跟踪的 `docs/database-recovery-owner-guide.md` 在本轮审查前已有工作；本轮继续修正了恢复手册。提交或整理时不要将它们当成未知垃圾删除。

### 本轮已有验证

- `./scripts/check-repository.sh` 通过，覆盖语法、lint、App 格式/类型/测试、前端构建及内嵌查看器产物一致性。
- RN 18 组/72 测试、Avatar Web 9 组/24 单元测试、Agent 33 测试、Admin 5 测试、媒体检索 Web 2 测试及后端测试通过。
- Avatar Web 在 desktop、iPhone SE、iPhone Pro Max 尺寸的 Playwright 21 项通过；使用拦截的测试 API，不等于真实付费生成或原生 App 验收。
- 临时 PostgreSQL 18.4 / pgvector 0.8.6 重放 001-029；再次执行为 0 applied / 29 unchanged。测试数据库已停止并清理。
- 真实 API 集成测试覆盖注册登录、bootstrap、日记/动态读写、跨用户拒绝、好友、聊天同步、免打扰、退出失效和注销。不连接生产库，不调用付费模型。
- 后续新增集成脚本及文档后，又检查了相关语法、全仓 lint 和 diff 空白。

历史 CI [run 34938776824](https://github.com/wangruoshi1991/marvelsChat/actions/runs/34938776824) 在 `e70270f` 上通过了 5 个 job。**该绿色结果不包含本地未提交修复。** 本次编写交接文档没有重新运行上述整套测试。

### 必须保留的待办

1. **小站历史分页。** bootstrap 只加载最近 20 条日记、20 个相册和 40 个媒体；“全部/本月/更早”目前仅过滤已传入数组。应实现带归属校验的分页 API、列表加载、月份过滤和详情/编辑联动，不能简单取消 LIMIT。
2. **聊天历史分页与搜索。** `listMessagesForThreads` 在 bootstrap/sync 读取匹配线程的完整消息历史。需要最近消息摘要、历史分页和增量更新契约，并覆盖删除、撤回、断线补偿及搜索范围。
3. **Docker 完整运行验证。** 本机先遇 Docker Hub 超时，取得官方 Node 镜像后又遇 Debian 包源 HTTP 502，`ffmpeg` 安装失败。新镜像启动检查尚未对完整镜像运行；不要删除依赖或降低门禁来算通过。
4. **原生 App 回归。** 本轮没有重新构建安装。至少验收登录/退出/切换账号、妙讯与小站切换、小站五个 Tab、键盘、相册、3D 取消和恢复。
5. **真实外部链路及产品范围。** 本轮未重复触发付费建模、真实 OSS 上传或生产媒体检索；域名和未完成产品能力仍按已记录状态处理。

不必无目标地重新审查全仓每一行。按新需求检查受影响调用链，保留上述待办，发布前补齐相应证据。

## 7. 服务器、数据库与备份交接

以下是现有运维文档的最后记录，**本文编写时未重新登录服务器、检查计费或读取生产凭据**。执行运维任务前再验证现状。

- 已从持续计费的 PolarDB 迁到阿里云 ECS 上的自建 PostgreSQL。这里的“本机”指 ECS 服务器，不是开发 Mac；App 经公网 HTTPS API 使用数据库。
- 后端和媒体检索 worker 使用 systemd；当前生产不是 Docker 部署。仓库保留 Docker 构建及检查，不应把它们误当成当前线上启动命令。
- 当前记录的 HTTPS API origin 为 `https://8.153.167.11`；数据库仅监听 ECS 的 `127.0.0.1:5432`，数据库名 `marvels_chat`，人工访问走 SSH 隧道。
- `pize` 用于人工只读查看；后端业务和数据库备份各用独立受限角色。历史消息里提出过密码调整，不能把当时文本直接当作当前有效凭据。
- 业务媒体 Bucket 是 `marvels-chat`；数据库异地备份 Bucket 是 `miaoxun-chats`，使用 `postgresql/v1/` 前缀。不要把用户早期提及的相近名称视为同一个资源并删除。
- 备份每六小时运行：本机 custom dump 校验后加密，再上传私有 OSS。恢复私钥留在服务器之外，业务与备份机器账号分开。既有角色、密钥和 Bucket 不需要因更换会话而重建。
- 2026-09-15 运维记录包含真实 OSS 下载、解密及 PostgreSQL 隔离恢复演练。详情、账号用途和凭据位置只从[运维入口](../production-operations.md)及[恢复手册](../database-recovery-owner-guide.md)读取，不复制秘密到交接文本。
- 用户已手动把 PDF 和恢复资料发送到自己的手机。后来恢复手册更新为“2026-09-15 修订 2”，修复新电脑目录创建和隔离恢复连接方式；之前发送的手册可能仍是旧版。密钥和原 ZIP 未改变，不需要重新生成。新版 PDF 位于本机 `output/pdf/Miaoxun-Database-Recovery-Owner-Guide.pdf`，属于本地生成物，不能假定新 checkout 会包含它。

生产迁移历史不得重写。后续迁移以备份校验、维护窗口、发布版本、checksum 账本及 `/api/ready` 为依据；只回退代码不能撤销数据库迁移。服务器清理只能针对逐项确认的项目文件，不能进行全局 Docker prune 或未知目录删除。

## 8. 模拟器与发布验证的关键点

- 交接时 iOS 工程的 `CURRENT_PROJECT_VERSION` 是 42。它只是源码配置，不证明 App Store Connect 或用户手机正在运行 Build 42；发布前必须读取实际分发版本。
- 当前 Debug API 为 `http://127.0.0.1:4390`，Release 为 `https://8.153.167.11`。模拟器和真机联调需要明确是否连同一后端，不要无意混用本地和生产账号数据。
- `AppDelegate.swift` 的 Debug 和 Release 都读取包内 `main.jsbundle`。修改 JS 后只开 Metro、点 Reload 或重启模拟器不能保证更新；需要重新构建并安装 App。
- 先确认模拟器和后端目标，再按 [RN 运行说明](../../MiaoxunRN/README.md)构建。模拟器 UDID、设备可用性和依赖状态动态变化，不复用旧会话里过期的设备标识。
- 查看器源码变更后执行 `npm --prefix avatar-web run build:app-viewer`，核对生成 HTML 一致，再构建 App。
- 普通业务改动运行相关类型检查和测试；较大改动/准备发布执行 `./scripts/check-repository.sh`。只改本文无需重跑 App 测试。
- API 集成测试命令为 `npm --prefix backend run test:api-integration`，必须显式连接专用测试数据库，名称以 `_migration_test` 结尾；不可改成生产连接来通过检查。
- TestFlight 上传是独立发布步骤，要有对应版本授权、构建/签名和验证证据。最后一次审查没有替用户更新手机安装包。

## 9. 给新会话的开场提示

以下提示可直接发送；其后的需求由用户补充。

```text
请接续妙讯 App 开发，使用当前本地项目：
/Users/gary/Desktop/myproject/marvelsChat

先完整阅读交接文档：
/Users/gary/Desktop/myproject/marvelsChat/docs/handoffs/2026-09-15-app-next-iteration.md
并阅读它链接的 2026-09-15 仓库审查报告。

先核对 git status、当前分支和未提交修改。不要从主分支另建一个缺少本地修复的工作区，也不要覆盖用户或伙伴的改动。交接时的分支是 codex/offsite-database-backups，但请以实际状态为准。

告诉我你理解的当前状态、剩余问题和接下来要修改的范围，然后根据我提供的新需求继续实现。正式 App 是 MiaoxunRN，图标资源在 src/assets/icons。域名暂不处理；不得用假数据或静默兼容掩盖缺失。保留审查待办，UI 更新后实际构建安装到模拟器验证。

新的需求如下：
```

读完后应能回答：当前有哪些未提交成果，哪些旧设计已废弃，3D 工具与 Agent 如何区分，接下来哪些缺口仍需处理，以及怎样让模拟器真正显示新代码。不需要用户重新讲完全部历史，也不要因为有交接文档就跳过相关代码核对。
