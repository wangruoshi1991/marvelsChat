# 妙讯当前交接入口

更新：2026-10-29。先读 AGENTS、README、docs/README，再核对 Git 与实际运行。日期记录只证明当时状态，不延续部署、上传或付费授权；保留已有修改，不写入密钥、生产身份或私人内容。

### 2026-10-29 Agent 目录与后台线上部署（最新）

- 已按维护窗口部署后台目录与 Agent 展示链路到阿里云 ECS `8.153.167.11`。线上 runtime 为 `/opt/projects/marvels-chat/releases/agent-catalog-admin-20261029/runtime`，制品包含 backend、Admin 静态资源、avatar-web 和 迁移 044/045；服务器运行制品文件哈希与本地发布制品一致。服务器 manifest 记录来源提交 `2cc75b12c01fc888e7ea39b73eb3b5fbcc5d0096`；随后本地将同一已审查内容及其新增 RN 资源、回归测试整理为提交 `3784b06ebded16fde2b963d07ce9a6343026a323`，runtime 白名单文件内容未改变。
- 停写备份 `/opt/projects/marvels-chat/database/backups/marvels_chat-20261029T082200Z.dump` 的 SHA-256 为 `3a33087b7e1d98860275b5bea4e50eaee67b2ec34d7de8b8267042a3ad90f132`，`pg_restore --list` 共 518 项；迁移账本现为 45 条，最新为 `045_agent_alias_source.sql`。迁移使用维护窗口执行，未调用模型供应商。
- 部署后 `marvels-chat-backend`、`marvels-chat-ai-task-worker`、`marvels-chat-media-retrieval-worker` 均 active；本机和公网 HTTPS `/api/health`、`/api/ready` 均返回 200，ready 报告数据库已连接且 `migrationsCurrent=true`；`marvels-chat-database-backup.timer` active。后台 `/api/admin/agent-catalog` 已由线上服务返回 200，线上管理台可使用目录配置与使用监控模块。
- 本次部署未上传 TestFlight、未推送 Git、未创建生产测试账号、未触发付费模型调用。当前仍需用户在后台浏览器刷新后复核目录表单，并在实体真机复验 App 对线上目录变更的同步；域名/DNS 的既有 4 项 readiness 警告仍未改变。

### 2026-10-29 Agent 目录隔离验证与别名边界（最新）

- 完成全新 loopback PostgreSQL 隔离库迁移 `001–045`（45/45），验证 `agent_catalog` 首次种入当前 9 个已部署 Agent 且默认上架；新增未登记 Agent 通过目录同步默认未上架；后台目录改名、描述/身份颜色合并、上架/下架和 App 目录投影均按真实数据库返回。
- 使用真实 `agent_runs` 夹具验证 7/30/90 天窗口的运行、生命周期成功/失败、Token、成本和延迟聚合：排队/未知字段不会被伪装成成功或已知成本，空统计保留空态/null。临时 55443 集群已停止；本地开发数据库随后重启到迁移 45，`/api/ready` 200、`sourceMatchesCheckout=true`。
- 增加 `user_agents.alias_source` 迁移：后台目录重命名只更新仍等于旧系统默认名的已有授权和会话标题；用户自定义别名保持不变。后台目录仓储已使用事务行锁，避免目录改名与别名迁移读取旧值。
- 进一步收敛目录消费边界：新账号默认妙讯管家、普通聊天用户上下文、相册任务上下文和后台用户 Agent 详情均读取目录展示元数据；执行器能力仍来自代码注册表，目录不会改变权限或运行合同。
- 后台审查通过：六模块导航、目录编辑、真实使用监控空态/错误态与权限隐藏；admin 测试 15/15、语法检查和 Vite 构建通过。固定 iPhone 17 已由当前源码成功构建、安装、启动，截图证据 `/tmp/miaoxun-check/catalog-current.png`；当前讯页显示统一 V20 妙讯管家头像。此次只做本地/模拟器验证，未部署、未上传 TestFlight、未推送 Git、未调用模型供应商。
- 最终整仓检查在上述补充后再次通过：backend 876 通过、268 项 PostgreSQL 环境门控跳过且 0 失败；RN 73 套 / 986 项通过；Agent 50、Admin 15、avatar-web 29、media-retrieval-web 3 通过，`git diff --check` 通过。后台目录配置的实际入口是 Admin Web，不是手机端；手机端只消费 bootstrap/sync 并保留用户自己的授权/移除。当前线上浏览器仍是未包含本轮目录表单的旧部署版本；要让线上后台出现新表单，需要另行授权部署后端、迁移 045 和 Admin 静态资源。

### 2026-10-29 Agent 目录与全链路整理（当前工作区）

- 补齐 Agent 目录链路：新增 `agent_catalog` 迁移与目录仓储；后台提供 `GET/PATCH /api/admin/agent-catalog`，可维护已部署 Agent 的展示名称、描述、头像标识/颜色和 App 推荐上架状态。新注册文件首次同步默认为未上架，后台上架不创建执行器，也不代替用户授权；下架不撤销已有 `user_agents`。
- App bootstrap 将目录元数据合并到所有已注册执行项；已授权但下架的 Agent 仍保留在 owned/已有会话展示，推荐添加过滤未上架项，添加接口拒绝未上架 Agent。App 前台恢复、进入“我”页或切换小站子页会刷新 bootstrap，使后台目录变更在合理时机到达 App。
- Agent 身份展示继续统一使用 `AgentGlyphAvatar`；我的 Agent、AI伙伴、动态 Agent 标签和发动态 Agent 选择项均消费真实 identity，讯页 V20 人物头像/任务卡特殊视觉保持。后台使用监控新增按 7/30/90 天从 `agent_runs` 全量聚合的运行、成功/失败、Token、成本和平均延迟，并补齐模块导航与目录编辑控件。
- 文档同步更新 `docs/admin.md`、`docs/agents.md`、`docs/architecture.md`，说明目录发布、授权和统计口径。已运行 `MIAOXUN_DOTENV_ENABLED=false ./scripts/check-repository.sh`：后端 876 项通过、RN 73 套 / 986 项通过、Agent 50 项、后台 15 项、avatar-web 29 项、media-retrieval-web 3 项；268 项 PostgreSQL 环境门控跳过。未部署、未上传 TestFlight、未调用模型供应商。
- 尚待隔离 PostgreSQL 迁移后的目录 API/统计集成验证，以及在固定 iPhone 17 模拟器和实体真机复核后台改名/上架后“我 → 我的 Agent”、下架已授权 Agent、动态 Agent 标签头像。当前工作区保留所有既有未提交修改。

### 2026-10-29 Agent 目录动态同步与后台配置边界

- Agent 展示已统一走后端注册表 identity 与后台 `agent_catalog` 元数据。后台可维护名称、描述、标识、形状、三种身份颜色和上架状态；它只改变已部署执行器的展示/可发现性，不创建执行器、不替用户授权。既有授权的 Agent 下架后仍保留在“我的 Agent”和旧会话中，新推荐与新授权过滤未上架项。
- `/api/app/bootstrap` 和 `/api/app/sync` 均返回 `agents.registered/owned`。增量同步现在也会读取最新目录，所以 App 长时间停留时能看到后台新上架或身份修改；客户端只替换目录快照，不根据目录变化自动新增授权。目录颜色补丁按 JSONB 合并，避免部分编辑破坏统一身份。
- 后台已拆分总览、账号、Agent、使用监控、审计记录和服务配置模块。使用监控来自真实 `agent_runs` 聚合运行次数、成功/失败、token、成本和延迟；没有运行记录时显示空态，不生成演示统计。
- 本轮验证（已由上方最新记录补充）：RN `npm run typecheck` 与目录增量同步定向测试通过；原记录中“迁移 044 尚未执行”已被本页最新的隔离 PostgreSQL 001–045 验证覆盖。未部署后端、未上传 TestFlight、未推送 Git、未调用模型。

### 2026-10-29 Agent 头像一致性修正

- 定位到讯页会话列表使用 V20 人物头像，而聊天详情仍使用旧线性 glyph；同一妙讯管家在两个页面因此不一致。现在讯页列表、搜索和聊天详情统一使用同一套 V20 人物头像，聊天详情按原型使用 45pt / 13pt 圆角，列表继续使用 44pt / 17pt 圆角；内嵌头像素材自身已有边框，不再叠加 RN 外框。
- 讯页任务卡按 V20 使用 31pt 圆形浅色 glyph，不复用会话人物头像；妙页任务流和我页 Agent 卡继续使用各自的深色 glyph 体系。V20 的第 6 张“接单助理”头像暂不映射，因为当前后端 Agent 注册表没有对应 key，不用它冒充现有 Agent。
- `chatContentActions`、`aiTaskInbox`、`miaoTaskWorkspace` 定向 37 项通过，随后全仓 `MIAOXUN_DOTENV_ENABLED=false ./scripts/check-repository.sh` 以 RN 73 套 / 984 项通过收尾，TypeScript、ESLint、Prettier 与 `git diff --check` 通过。最新模拟器构建证据为 `/Users/gary/Library/Application Support/MiaoxunDevelopment/76237d6f8986/builds/2026-10-29T05-44-54-859Z/build.json`；已覆盖并启动固定 iPhone 17，实看讯页列表与聊天详情头像一致。

### 2026-10-29 V20 细节差异修正（覆盖此前长按态结论）

- 最新依据为用户提供的 V20 Butler Immersive Entry HTML。两页长按时保留底栏；妙页仅将任务内容弱化至 `.72`，不叠加黑色遮罩；讯页遮罩止于底栏上方。主按钮保留青色外环，子菜单不叠加青色光晕。根页 89pt 底栏不再额外追加底部安全区，妙/讯悬浮按钮统一使用 191pt 锚点，避免下方选项压住导航；聊天、二楼继续保留自己的安全区。主 shell 显式使用当前页面底色，避免妙页内容透明度叠在白色父层上导致整页变灰。
- 妙页恢复「任务实时动态」标题。任务卡正文和业务状态在前，33pt Agent 头像 footer 在后，默认叠放且隐藏名称，展开显示真实名称并换行；普通任务和协作任务使用相同展开语义。窄双列状态独立成行，头像可以横向滚动，展开按钮阻止冒泡。无任务时继续显示真实空态，不填原型演示任务。
- 讯页 Tab 按 V20 使用 16pt，自定义底栏和 AI 图标保持 V20 线框；有明确设计对应的讯页头像改用原型内嵌资源，显式设置 Image 尺寸，避免原始 80px 图片被 44pt 容器裁切；其他 Agent 保留原有真实身份图标，不借用管家或其他角色头像。
- 聊天输入区补齐语音、妙猜猜、表情、更多及附件图标。工具面板在输入行下方，聚焦输入框会关闭面板；自动折行不再被压回 44pt。妙猜猜入口使用无持久 ID 的 `chat-draft` 快照，线程 ID 只作 metadata，不冒充消息 ID；附件未接通时明确提示，不把「相册/文件」名称写进草稿。妙猜猜完整建议、语音意图提取/执行、未读总结与规划仍未形成原型完整链路。
- 最终 `MIAOXUN_DOTENV_ENABLED=false ./scripts/check-repository.sh` 退出 0：RN 73 套 / 984 项、后端 876 项通过，268 项 PostgreSQL 环境门控跳过；TypeScript、ESLint、Prettier 和 `git diff --check` 通过。日志 `/tmp/miaoxun-v20-repository-check.log`。
- 最新源码已覆盖并启动固定 iPhone 17 / iOS 26.5，证据为 `/Users/gary/Library/Application Support/MiaoxunDevelopment/76237d6f8986/builds/2026-10-29T05-13-21-067Z/build.json`（Debug 1.0(54)，`installed:true`、`launched:true`）。最新构建实看妙页深色长按态、讯页三向菜单、底栏和下方选项间距；同构建目录 `screenshots/miao-long-press.png` 与 `screenshots/xun-long-press.png` 保存截图，当前模拟器停留讯页菜单展开态。展开态经无障碍动作查看，不计作真实手指连续长按滑选验收。
- 模拟器账号当前没有任务，任务卡展开/窄布局只有组件回归证据；语音识别在模拟器显式报不可稳定使用，不能据此声称真机通过。未调用模型、未上传 TestFlight。

### 2026-10-29 妙页与讯页长按态最终模拟器复核

- 按 V20 原型复核两页长按样式：妙页长按进入语音输入并展开“键盘 / 妙管家 / 瀑布”，讯页长按先展开“语音 / 未读 / 规划”，选择“直接说”后才进入语音确认卡。
- 两页均使用背景弱化层，主按钮显示青色高亮和独立外环光晕；子菜单保持浅色平面，不附加光晕。讯页语音识别阶段不显示妙页脉冲环。
- `MIAOXUN_DOTENV_ENABLED=false ./scripts/check-repository.sh` 退出 0：RN 73 套 / 978 项、后端 876 项通过，268 项 PostgreSQL 环境门控跳过；TypeScript、ESLint、Prettier 和 `git diff --check` 通过。
- 最新源码已覆盖并启动固定 iPhone 17 模拟器，证据为 `/Users/gary/Library/Application Support/MiaoxunDevelopment/76237d6f8986/builds/2026-10-29T03-10-59-505Z/build.json`。实看两页菜单、背景弱化、主按钮外环和讯页确认卡；模拟器语音识别仍提示无法稳定使用，未调用模型。实体真机仍需复验，未上传 TestFlight。

### 2026-10-29 讯页语音菜单交互顺序修复

- 修复讯页长按后立即出现语音识别卡的问题：长按现在只展开“直接说 / 总结未读 / 替我规划”三向菜单；选择“直接说”后才收起菜单并启动真实语音识别，识别卡再显示。妙页仍保持长按即进入语音输入的既有交互。
- 语音菜单的无障碍长按动作同步改为打开菜单；打开菜单时清理上一张卡片残留的草稿、错误和权限状态，避免菜单与旧状态卡重叠。语音卡的确认按钮仍只把真实转写带入妙讯管家草稿，不冒充后端意图解析或任务执行。
- `voiceShortcutDock` 36 项、关联 `assistContextFlow` / `appWorkspaceNavigation` / `workspaceUi` 58 项通过；RN 全套 73 套 / 978 项、后端 876 项通过，268 项 PostgreSQL 环境门控跳过；TypeScript、ESLint、Prettier 与 `git diff --check` 均通过，`MIAOXUN_DOTENV_ENABLED=false ./scripts/check-repository.sh` 退出 0。
- 已覆盖并启动固定 iPhone 17 模拟器，证据为 `/Users/gary/Library/Application Support/MiaoxunDevelopment/76237d6f8986/builds/2026-10-29T02-06-20-661Z/build.json`。实看讯页长按后只有三向菜单，选择“直接说”后才出现语音卡；模拟器仍提示无法稳定使用语音识别，未调用模型。该证据不替代实体真机验收，也未上传 TestFlight。
- 追加视觉修正：讯页子菜单取消自身阴影/光晕，语音卡识别阶段不再显示妙页脉冲环；主按钮展开态光晕保留。同步补上识别中状态卡的持续显示，并增加无光晕回归断言。`voiceShortcutDock` 36 项、TypeScript、ESLint、Prettier 和 `git diff --check` 通过；最终模拟器证据为 `/Users/gary/Library/Application Support/MiaoxunDevelopment/76237d6f8986/builds/2026-10-29T02-22-58-271Z/build.json`。

### 2026-10-28 聊天输入区与提示条最终复核

- 聊天输入框继续按 44–132pt 动态增高，达到上限后在输入框内部滚动；聊天列表尾部按 composer 实际高度留白，避免多行内容遮挡最后一条消息。
- 快捷提示从依赖 `ScrollView` 的手动滚动改为外层裁剪 `View` + 内层横向位移：父层在水平位移超过 8pt 后接管 responder，按真实内容宽度计算边界；轻点仍只写入草稿，不自动发送，重复指令仍去重。
- 快捷胶囊增加 180ms 持续触摸保护，长按或滑动不会提交指令；定向 `chatContentActions` 13/13、TypeScript、ESLint、Prettier 均通过。完整 `MIAOXUN_DOTENV_ENABLED=false ./scripts/check-repository.sh` 退出 0（RN 73 套/976 项、后端 876 项通过，PostgreSQL 环境门控 268 项跳过）；`git diff --check`通过。
- 最新源码已覆盖并启动固定 iPhone 17 模拟器，证据为 `/Users/gary/Library/Application Support/MiaoxunDevelopment/76237d6f8986/builds/2026-10-28T10-13-44-462Z/build.json`（Debug 1.0(54)，正式 HTTPS API，`installed:true`、`launched:true`）。模拟器持续 300ms 触摸验证输入框保持空白；当前 CUA 的 `drag` 通道会将拖动压缩为点击，不能作为连续位移证据，实体真机仍需复验提示条实际横向位移与长文本输入滚动。
- 语音识别卡审计确认“重新说”当前实际关闭卡片、识别完成后的遮罩不能点外部关闭；这两项可在不引入演示数据的前提下继续修复。语音意图解析、确认执行、总结未读和规划仍需真实后端合同，未伪造实现。相册页仍保留诚实的单一上传入口，不模拟手机相册同步。

### 2026-10-29 讯页语音确认卡收尾

- 讯页“直接说”识别完成后现在停留在 V15 风格确认卡，显示真实转写内容；“确认执行”继续把转写带入妙讯管家草稿，未冒充后端任务执行。
- “重新说”会清理旧转写并重新启动语音识别，卡片保持打开；ready 状态下点击卡片外的半透明遮罩可关闭，卡片内部点击不冒泡。
- `voiceShortcutDock` 定向 36 项、RN 全套 73 套/978 项通过；TypeScript、ESLint、Prettier 和 `MIAOXUN_DOTENV_ENABLED=false ./scripts/check-repository.sh` 均通过。仓库后端 876 项通过，268 项 PostgreSQL 环境门控跳过。
- 语音意图解析、动作预览和真实确认执行仍需要后端合同；当前确认按钮的行为已如实保持为进入草稿，不写入原型演示动作或数字。

### 2026-10-28 聊天详情输入区与快捷提示修复

- 修复聊天输入框多行内容被裁切：输入框按内容在 44–132pt 内增长，达到上限后启用内部滚动，清空草稿恢复最小高度并保持顶部对齐。
- 顶部快捷提示使用独立横向提示行，三条真实快捷指令按唯一行去重；重复点按同一指令不会重复写入草稿。消息列表尾部按实际 composer 高度预留空间，避免最后一条消息被输入区覆盖。
- 聊天返回左滑手势限定在标题和消息区域，输入区快捷提示滑动不再与返回手势竞争。定向 `chatContentActions` 11 项通过，RN TypeScript、Prettier、全仓 `MIAOXUN_DOTENV_ENABLED=false ./scripts/check-repository.sh` 均通过（RN 73 套 / 974 项、后端 876 项通过，PostgreSQL 环境门控 268 项跳过）。
- 固定 iPhone 17 模拟器已重新覆盖并启动，证据：`/Users/gary/Library/Application Support/MiaoxunDevelopment/76237d6f8986/builds/2026-10-28T08-13-17-464Z/build.json`。已实际进入妙讯管家聊天页查看快捷提示、输入区和消息尾部布局；多行输入的自动高度由定向测试覆盖，实体真机仍需复验软键盘下的输入滚动体验。
- 搜索页沿用同一固定底栏规则：底栏 89pt、语音入口偏移 153pt，移除动态测量造成的挂载跳动。搜索任务维度仍需后端全局任务查询、结果路由和生命周期支持，暂不以对话或本地示例拼接。

### 2026-10-28 V15 语音卡、聊天详情与任务详情补充

- `VoiceShortcutDock` 的讯页语音识别状态卡已按 V15 对齐：浅灰标题区、灰色麦克风圆片、真实语音草稿转写区、执行前说明、等待动作卡、重新说/确认执行双按钮与底部遮罩；识别失败和权限状态继续显式反馈。确认按钮只在真实识别结果 ready 时启用，不写入原型示例意图。
- 妙讯管家聊天详情的输入区上方增加三条真实快捷指令胶囊（生成今日待办、今晚只提醒紧急事项、同步相关 Agent）。点击只把指令写入当前草稿，不自动发送或调用模型；对应主题与触控回归已补。
- 讯页任务列表继续按真实任务状态分为待你确认、正在跟进、历史任务和其他任务；任务卡使用 V15 白底圆角、轻阴影、状态与真实 Agent/成果字段。任务详情头部在讯页浅色主题下使用紧凑布局和线框返回图标，未改变任务取消、刷新、事件轮询和成果合同。
- 相关定向测试 105 项通过（含语音卡、聊天详情、任务列表/详情和 AI 上下文）；`npm run typecheck`、Prettier 已通过。完整仓库检查和新的固定 iPhone 17 模拟器候选待本轮收尾后补入本节。
- V15 尚未接入的真实链路仍保持明确缺口：语音意图提取与确认执行、总结未读、替我规划、妙猜猜弹层、6 个 Agent 沉浸详情，以及关系评分/资产累计/信息海多来源等后端数据；不得用 HTML 演示数字或假 Agent 结果填充。蓝湖分享画布当前仍可读取并放大设计状态，但顶部要求重新登录；本轮未把未登录状态当作完整逐页验收。

### 2026-10-28 详情页设计审计与收尾门禁

- 重新对照 V15 HTML 的语音识别卡、讯页聊天详情、任务列表和任务详情：语音卡的标题区、转写区、执行说明、动作卡及双按钮已对齐；聊天详情的讯页浅色头部、返回线框箭头、气泡和快捷指令胶囊已对齐；任务列表按真实状态分组，任务卡和任务详情保持真实 Agent、成果、错误、授权和取消链路。
- 审计未发现可以在不伪造后端数据的前提下继续安全补齐的视觉错位。聊天详情仍缺原型中的“沉浸 ↗”入口、妙猜猜底部弹层和六种 Agent 沉浸页面；这些需要真实接口与路由，继续保持缺口，不填入 HTML 演示内容。总结未读、替我规划、语音意图解析与确认执行同样未宣称已完成。
- 固定 iPhone 17 模拟器已覆盖并启动当前详情页候选，证据为 `/Users/gary/Library/Application Support/MiaoxunDevelopment/76237d6f8986/builds/2026-10-28T07-31-36-026Z/build.json`（Debug 1.0(54)，`installed:true`、`launched:true`，正式 HTTPS API）。已查看聊天详情、快捷指令胶囊和语音识别状态卡；模拟器语音识别继续显示系统限制提示，未调用模型。当前模拟器停留在语音识别卡，便于继续手动查看。
- 收尾门禁：`MIAOXUN_DOTENV_ENABLED=false ./scripts/check-repository.sh` 退出 0；RN 73 套/971 项通过，后端 876 项通过/268 项 PostgreSQL 环境门控跳过，agents 50、admin 15、avatar-web 29、media-retrieval-web 3 及各构建检查通过；`git diff --check`通过。讯页 V15 返回图标断言已同步为线框左箭头，未改变运行时代码。

### 2026-10-28 页面状态与刷新生命周期补充

- 修复妙页/讯页长按菜单的跨路由残留：`VoiceShortcutDock` 在 `active=false`、AppState 离开前台、组件卸载和进入管家/任务/其他覆盖页时取消语音会话、计时器、动画和草稿；路由父层同步清除 `miaoVoiceExpanded`。路由离开时立即清空快捷入口退出动画，返回页面从收起状态开始。
- 修复讯页保留页面的交互快照：切换页面或对话/任务标签时停止并归零下拉动画与打开锁，重建对话列表以清除行滑动偏移；刷新后的消息行变化也会收起旧操作状态。二楼关闭、任务入口、Agent 管理和账号切换统一清理二楼入口状态。
- 修复“我”页数据刷新：重新进入我页、从覆盖页面返回以及切换“动态/我的 Agent”时重新请求当前账号的 bootstrap，避免 Agent 所有权和列表停留在首次进入快照。内容保存、删除、互动等已确认写入会使并发中的旧 station 刷新失效，防止迟到响应覆盖最新结果。
- 回归证据：RN 全套 73 套/968 项通过；新增 `sessionSync` 回归覆盖“旧 bootstrap 返回晚于 Station mutation 时不得覆盖新内容”，并验证账号切换和刷新竞态；语音、App 导航、我页生命周期、成果刷新定向用例通过（本轮定向 59 项，后续语音补充 33 项）；`npx tsc --noEmit`、ESLint、Prettier 和 `git diff --check`通过。
- Station 刷新保护位于 `useMiaoxunSession` 与 `useStationActions` 的共享 setter：每次确认写入、删除、互动、上传、刷新或退出账号都会推进内容版本，旧 bootstrap 只更新仍有效的非 Station 字段，避免迟到快照恢复旧帖子/Agent 内容。对应 `sessionSync.test.tsx` 的 25 项测试通过。
- 最新固定 iPhone 17 模拟器候选已覆盖并启动，证据为 `/Users/gary/Library/Application Support/MiaoxunDevelopment/76237d6f8986/builds/2026-10-28T05-42-28-658Z/build.json`（Debug 1.0(54)，正式 HTTPS API，`installed:true`、`launched:true`）。实际复核了妙页长按进入管家再返回后菜单已收起，以及我页 Agent 页离开后再次进入仍展示当前真实 Agent 数据。模拟器不替代实体真机验收；本轮未上传 TestFlight、未部署后端、未调用模型。
- 收尾门禁：`MIAOXUN_DOTENV_ENABLED=false ./scripts/check-repository.sh` 退出 0；仓库脚本、后端 876 项通过/268 项 PostgreSQL 环境门控跳过、agents 50、admin 15、avatar-web 29、media-retrieval-web 3、RN 73 套/968 项及各构建检查均通过。环境门控跳过不计作 PostgreSQL 集成或真机验收。

### 2026-10-28 底部导航高度修复

- 真机反馈的“底部会随着切换高度变化”已定位为 Miao/我页底部栏 76pt、讯页 89pt，且 App 通过 `onLayout` 动态测量导航高度，导致切换 Tab 时导航和浮动助手一起跳动。
- 按 V15 HTML 的 `.nav { height: 89px; }` 统一三个根 Tab 为固定 89pt，移除运行时高度测量，语音/AI 浮动入口统一使用 153pt 底部偏移。
- 第二轮复核发现 tab 子项仍沿用两组间距：Miao/我页水平内距12pt、图标文字6pt，而讯页水平内距0、图标文字3pt。已移除讯页专属样式，三种主题现在共用水平内距0、gap 3pt、上内距10pt、下内距20pt；回归测试直接比较 base/v6/xun 三种主题的导航布局。
- `appWorkspaceNavigation`、`workspaceUi` 定向 15 项和 RN 全套 73 套/969 项通过；TypeScript、ESLint、Prettier、`git diff --check`通过。实体真机仍需复验切换妙/讯/我时的视觉稳定性。
- 修复后源码已重新覆盖并启动固定 iPhone 17 模拟器，证据为 `/Users/gary/Library/Application Support/MiaoxunDevelopment/76237d6f8986/builds/2026-10-28T06-11-32-815Z/build.json`（Debug 1.0(54)，`installed:true`、`launched:true`）。这是本地模拟器候选，不是新的 TestFlight 上传。
- 统一内部间距后的源码再次覆盖并启动固定 iPhone 17 模拟器，证据为 `/Users/gary/Library/Application Support/MiaoxunDevelopment/76237d6f8986/builds/2026-10-28T06-22-21-827Z/build.json`（Debug 1.0(54)，`installed:true`、`launched:true`）。这是本地模拟器候选，不是新的 TestFlight 上传。

## 2026-10-28 真机反馈修复与模拟器复核

- 用户在真机反馈进入二楼后向上滑动不能退出，只能点击。根因是二楼页面把触摸结束坐标从事件根对象读取；iOS React Native 的释放点在 `changedTouches[0]`，导致位移为 `NaN`，同时子页内的 `Pressable` 会让父层 PanResponder丢失释放事件。
- `SecondFloorScreen` 现在由各页面自己的 `ScrollView` 捕获触摸起止事件，使用 `changedTouches[0]`、真实内容尺寸/视口尺寸和底部状态判断；落地页和短内容页无需先产生滚动事件即可识别“已在底部”，底部返回区保留点击与无障碍操作。保存中的文件草稿仍禁止退出，旧页面和迟到原生回调按激活周期隔离。
- 后续审计发现「发布」和「设置」两个子页没有透传统一滚动回调；现已接入，设置页改为二楼专用外层 `ScrollView`，发布页进入「写日记」后的编辑 ScrollView 也接入同一回调。落地页、全部八个入口和写日记状态现在使用一致的上滑退出判据；定向回归当前为38/38通过。
- 当前固定 iPhone 17 模拟器已覆盖并启动最终源码，证据为 `/Users/gary/Library/Application Support/MiaoxunDevelopment/76237d6f8986/builds/2026-10-28T04-07-48-707Z/build.json`（Debug 1.0(54)，正式 HTTPS API，`installed:true`、`launched:true`）。实际拖动确认二楼落地页内容上滑可返回讯页，底部固定返回区也可返回；二楼各有内容子页的真机触摸仍需用户在 Build54 上复验，模拟器不替代真机。
- 修复后的源码已重新覆盖并启动固定 iPhone 17，证据为 `/Users/gary/Library/Application Support/MiaoxunDevelopment/76237d6f8986/builds/2026-10-28T04-23-37-996Z/build.json`（Debug 1.0(54)，`installed:true`、`launched:true`，正式 HTTPS API）。这是本地模拟器候选，不是重新上传的 TestFlight 包；当前 Build54 真机仍需用户复验发布、设置和写日记状态的上滑退出。
- 我页 Agent 卡已按 V15 state33 更新：23pt 圆角、20/17pt 内距、12pt 卡距、45pt 圆角方头像、标题下真实添加日期、真实描述和整宽“进入对话”入口；保留授权范围提示与移除确认。后端没有等级、协作次数、匹配率、星标和原创字段，因此没有写入原型演示值。推荐添加卡的名称和描述取消单行截断。
- 讯页对话置顶背景改用真实 `ThreadDTO.pinned`；搜索入口文案改为实际支持的“搜索对话、联系人或Agent”，没有宣称任务可搜索；任务页按真实状态分为“待你确认 / 正在跟进 / 历史任务 / 其他任务”，保留真实错误、成果、权限和30项范围。
- `MIAOXUN_DOTENV_ENABLED=false ./scripts/check-repository.sh` 退出0：RN73套/961项通过，后端876通过/268项PostgreSQL环境门控跳过，其他工程检查通过；`git diff --check`通过。未上传TestFlight、未部署后端、未调用模型。

### 2026-10-28 设置页滚动链路收尾

- 真机反馈的二楼“无法上滑退出”已继续收敛：发布页、设置页和发布页“写日记”编辑器均接入统一的 `ScrollView` 触摸/内容尺寸回调；iOS 释放点从 `changedTouches[0]` 读取，只有当前页面在底部且手势为垂直上滑时才退出二楼。
- 设置页额外改为二楼专用的单一外层 `ScrollView`。`SettingsScreen` 增加 `scrollable={false}` 的内容模式，嵌入二楼时不再产生嵌套滚动容器；外层明确 `flex: 1`、`minHeight: 0`、内容增长和底部留白，普通上滑留在设置列表，滚到底部后才进入二楼返回判据。
- 二楼回归测试新增“设置页真实滚动视口”用例，验证普通上滑不退出、底部上滑才返回；定向 `__tests__/secondFloor.test.tsx` 当前 38/38 通过。审计代理在模拟器使用原生滚动目标确认设置内容可继续看到“通知、空间与权限、账户”区域；CUA 坐标拖动在 Simulator 宿主偶有误点，不能把单次坐标拖动当作实体真机证据。
- 最新本地 Debug 1.0(54) 已覆盖并启动固定 iPhone 17，证据为 `/Users/gary/Library/Application Support/MiaoxunDevelopment/76237d6f8986/builds/2026-10-28T05-02-58-063Z/build.json`；正式 HTTPS API，仅用于本地 UI 复核，未上传 TestFlight、未替换实体设备、未部署后端或调用模型。
- 本轮最终 `MIAOXUN_DOTENV_ENABLED=false ./scripts/check-repository.sh` 退出 0：RN 73 套、962 项通过；后端 876 项通过、268 项 PostgreSQL 环境门控跳过；agents 50、admin 15、avatar-web 29、media-retrieval-web 3 及各构建检查通过；`git diff --check`通过。跳过项不计作 PostgreSQL 集成或真机验收。

## 2026-10-27 V15 设计复核与当前实现边界

- 用户提供的最新可操作原型为 V15 Plan3：`/Users/gary/Library/Containers/com.tencent.xinWeChat/Data/Documents/xwechat_files/wxid_2t2ckgwc74ud22_c27e/msg/file/2026-10/Miao-App-Prototype-V15-Plan3.html`，SHA-256 为 `1d238634577f652f4e6cc97f935cfbdce3ca555b449cfa27ba17a7d3d43ff802`。V6 HTML 只作为上一版视觉证据，不再代表讯页或二楼的全局主题。
- 当前主题边界：妙页和我页保持深色；讯页、对话、任务、二楼及讯内页面使用 V15 浅色画布。RN 已按路由分支 `v6Palette` 与 `xunPalette`，讯页搜索栏、对话列表、未读徽章、二楼工具栏和 Safe Area 均随路由切换。
- 用户明确保留我页上滑折叠、资料卡缩小/恢复，以及长按菜单三向布局和语音链路；按最新模拟器复核，妙页/讯页入口改为仅长按展开，轻点不展开（已展开时可轻点关闭），三向按钮中心距约80pt以匹配 V15 的视觉间隙。
- 已操作 V15 原型的妙页任务动态、长按语音、讯页对话/任务/新建/搜索、AI 菜单、未读总结、二楼和沉浸页，用于确认可实现的结构与状态；原型演示数据、账号、统计数字和未接入能力不进入产品数据。
- 用户提供的新图标 `/Users/gary/Library/Containers/com.tencent.qq/Data/Downloads/logo2.0-05.png`（源 SHA-256 `6f4444185546ded741591f248ae15055e83900e4f7526db8d8f4a585ea43f86b`）已铺白底合成为不透明 1024 master，并生成 `AppIcon.appiconset` 全部 18 个 iPhone/iPad/营销尺寸；master SHA-256 `0379487eb5611af2bb7ac01a1b7bf39bac24c06ae629bd35579156a93616b36d`，所有 PNG `hasAlpha=no`。2026-10-27 已从 App Store Connect 确认 Build53 正在测试、内外部群组均已关联；最新 Build54 沿用此图标，发布结果见下方同日记录。
- 2026-10-26 固定 iPhone 17 模拟器已覆盖并启动当前源码，构建证据为 `/Users/gary/Library/Application Support/MiaoxunDevelopment/76237d6f8986/builds/2026-10-26T02-32-48-336Z/build.json`（Debug 1.0(51)，正式 API，`installed:true`、`launched:true`）。实际查看了讯页空态、讯页新建菜单、讯页快捷语音菜单、妙页空态、我页资料卡和二楼相册；模拟器语音识别按预期提示“模拟器无法稳定使用语音识别”，未调用模型。
- 本轮 RN 视觉调整后的全仓检查已通过：`MIAOXUN_DOTENV_ENABLED=false ./scripts/check-repository.sh` 退出 0；RN 72 套/922 项通过，后端 1144 项中 876 通过、268 项 PostgreSQL 环境门控跳过，其他工程检查通过。环境门控跳过不计作 PostgreSQL 集成或真机/生产验收。
- 2026-10-26 追加复核修正：讯内对话、搜索、通知和任务卡改为显式使用 `xunPalette` 角色；搜索 Modal 底部 Safe Area 不再残留旧淡紫色；讯页双 Tab 居中为自然宽度；账号切换会重置到“对话”；讯页语音状态卡改为 V15 灰底深色麦克风。新构建已覆盖固定 iPhone 17，证据为 `/Users/gary/Library/Application Support/MiaoxunDevelopment/76237d6f8986/builds/2026-10-26T03-07-58-623Z/build.json`，Debug 1.0(51)，已安装并启动。
- 本次模拟器复核实际查看了讯页对话/任务、搜索、讯页长按语音状态卡、妙页快捷菜单、我页资料卡和二楼相册；正式 API 仅用于读取真实空态，未发送消息、创建任务或调用模型。V15 新建菜单的“发起聊天 / 创建群聊”以及总结未读、替我规划流程仍是已记录的功能缺口。
- 2026-10-26 最新验证：`MIAOXUN_DOTENV_ENABLED=false ./scripts/check-repository.sh` 退出 0（RN 72 套/923 项、后端 1144 项中 876 通过、268 项 PostgreSQL 环境门控跳过）；RN `typecheck`、`lint`、`format:check` 和语音/二楼定向 47 项均通过。该阶段的模拟器构建证据为 `/Users/gary/Library/Application Support/MiaoxunDevelopment/76237d6f8986/builds/2026-10-26T04-49-38-517Z/build.json`，Debug 1.0(51)，已安装并启动固定 iPhone 17；实际操作确认新建菜单已有「发起聊天 / 创建群聊 / 扫码」，发起聊天复用搜索，创建群聊显示明确未接入提示，未创建示例数据。该检查早于同日 AppIcon 和 Build53 处理，后续结果见“Build53 TestFlight 上传”。
- 2026-10-26 06:19 最新模拟器复核：重新覆盖并启动固定 iPhone 17，证据为 `/Users/gary/Library/Application Support/MiaoxunDevelopment/76237d6f8986/builds/2026-10-26T06-19-31-439Z/build.json`（Debug 1.0(51)，正式 API，已安装并启动）。验证讯页新建面板与二楼入口、妙/讯语音入口短点不展开且长按进入语音状态；模拟器语音识别提示为设备限制，未调用模型。最后停留在“我”页；空态无真实动态/Agent，因此未把手势截图当作有内容滚动验收，有内容折叠由 `stationHeaderCollapse`、`stationTabLifecycle` 回归覆盖。全仓检查 72 套 / 924 项 RN、后端 876 通过 / 268 项 PostgreSQL 环境门控跳过，退出 0。
- 2026-10-26 16:55 最新模拟器复核：修正 `stationScrollContent` 的 `flexGrow` 为 `0`，避免 iOS 将空面板内容强行拉伸到视口而失去真实滚动范围；固定 iPhone 17 已重新覆盖并启动，证据为 `/Users/gary/Library/Application Support/MiaoxunDevelopment/76237d6f8986/builds/2026-10-26T08-30-31-411Z/build.json`。真实拖动确认“我”页资料卡可折叠，折叠后动态/Agent 标签和空态卡仍完整可见；继续下拉可恢复资料卡。未调用模型或写入示例数据。`stationTabLifecycle` 与 `stationHeaderCollapse` 14 项、RN 四件套及全仓检查（RN 72 套/924 项、后端 876 通过/268 项 PostgreSQL 环境门控跳过）均通过。
- 2026-10-27 按 V15 逐项复核讯页、搜索和二楼：讯页双 Tab 使用 17pt 字号；任务态隐藏搜索框；新建面板按原型的尺寸、圆角、分隔和右上锚点显示；搜索页返回箭头改为原型线框并校正到 16pt 左边距；二楼补齐个人空间落地页、六入口托盘和浅色子页，底部提示同时支持轻点和上滑返回，重复点击当前入口不再退出子页。二楼顶栏固定“二楼 · 个人空间”、子页内容区显示功能名，与 V15 层级一致。原型任务徽章为硬编码演示值，当前 API 没有真实的未读或待确认总数，因此未填入假数字。
- 2026-10-27 最终检查 `MIAOXUN_DOTENV_ENABLED=false ./scripts/check-repository.sh` 退出 0：RN 72 套/931 项通过，后端 1144 项中 876 通过、268 项 PostgreSQL 环境门控跳过，其他工程通过；完整日志为 `/tmp/miaoxun-check-repository-20261027-v15-detail.log`。最终源码已构建、覆盖并启动固定 iPhone 17，证据为 `/Users/gary/Library/Application Support/MiaoxunDevelopment/76237d6f8986/builds/2026-10-27T05-15-17-685Z/build.json`（Debug 1.0(53)，正式 API，`installed:true`、`launched:true`）。实际操作确认新建面板、搜索返回、二楼六入口、相册入口重复点击和底部轻点返回；未发送消息、创建任务或调用模型。该结果仍是模拟器证据，本轮未重新进行真机验收、生产部署或 TestFlight 上传。
- 2026-10-27 追加细节复核：校准搜索结果分组、二楼子页标题与卡片、关系页渐变说明区、来源图标和权限页分区。第三方授权与支付能力仍显示未接入、控件禁用，关系评估仍明确未开放，不以原型评分或授权状态代替真实数据。蓝湖仍提示重新登录，本轮依据可操作的 V15 HTML；尚未完成登录后的蓝湖逐页核对。
- 二楼底部上滑返回的滚动状态按页面及激活周期隔离，隐藏页、未激活页和上一轮激活迟到的事件不会影响当前页；同页上一轮迟到的惯性结束回调不会清除新拖动状态。相关回归位于 `MiaoxunRN/__tests__/secondFloor.test.tsx`，33 项通过。CUA 连续拖动事件仍不稳定，回归和静态截图不能替代真实手指手势验收。
- 2026-10-27 最新全仓检查 `MIAOXUN_DOTENV_ENABLED=false ./scripts/check-repository.sh` 退出 0：RN 73 套/953 项通过，后端 1144 项中 876 通过、268 项 PostgreSQL 环境门控跳过，其他工程通过；日志 `/tmp/miaoxun-check-repository-20261027-v15-final.log`。最新源码已覆盖并启动固定 iPhone 17 / iOS 26.5，构建证据 `/Users/gary/Library/Application Support/MiaoxunDevelopment/76237d6f8986/builds/2026-10-27T10-28-33-301Z/build.json`：Debug 1.0(53)，正式 Bundle 与 HTTPS API，`installed:true`、`launched:true`，构建前后源码摘要一致，内嵌 JS SHA-256 为 `afc9bdb02a02cf1de4af193b8227c2b42d227b52b2117ee9c596d6e37629d55b`。实际复核讯页、新建面板、二楼落地页及关系子页，最后停留在二楼关系页；本轮未重新上传 TestFlight、部署生产或完成实体真机验收，未触发模型调用。

## 2026-10-23 现状清理与检查修复

- 本轮以当前源码、运行证据和本页为事实基线，更新了 RN README、架构/部署/数据库/联调/iOS、Agent 工作空间、社交关系、文件处理和媒体检索说明；保留发布、迁移、恢复和历史审查证据，没有删除可追溯材料。旧 Build、合同和“尚未部署”描述已在可复用文档中标为历史或改为指向本页。
- 设计状态清单现在以用户提供的蓝湖页面和 V6 HTML 作为最新视觉依据；V6 仍在仓外微信文件目录并记录 SHA-256，演示数据和未接入能力不作为产品事实。历史“待确认”项不再冒充当前决定。
- 2026-10-23 复核将设计清单更新日期改为当前日期，并把原型 CSS 参数段明确标为历史证据；同时清掉 RN、文件处理、统一 AI 和数据库说明中的过时“当前/尚未部署”措辞。随后重新运行 `MIAOXUN_DOTENV_ENABLED=false ./scripts/check-repository.sh`，退出 0（后端 1144 项中 876 通过、268 项 PostgreSQL 环境门控跳过；RN 72 套件/921 项通过）。
- `scripts/check-backend-image.sh` 的生产 smoke 容器现在显式传入隔离的 `CORS_ORIGIN=https://smoke.invalid`，新增 fake-Docker 回归测试。密码哈希校验拒绝非整数、低于 1 或高于 1,000,000 的 PBKDF2 迭代次数，并要求解码后的 key 长度匹配当前 32 字节格式，防止污染存储值造成异常 CPU 消耗或错误认证；现有 310,000 次生成参数不变。
- 本轮尚未处理媒体检索临时对象的账号删除清理策略、Worker 停止窗口与供应商处理超时之间的运维取舍；这些需要独立数据保留/部署验证，不以文档清理代替决定。

## 2026-10-23 V6 妙页与长按语音视觉对齐（历史，已被 V15 覆盖）

- 用户确认 V6 HTML 与蓝湖「妙3.0」「妙3.0-左滑卡片」「妙3.0-长按语音」是最新设计，并明确两条范围：我页向上滑动及资料卡缩小交互保留当前实现；长按菜单继续使用现有上/左/下三向布局与语音链路，只更新菜单背景、图标和激活入口视觉。
- `MiaoxunRN/src/features/agents/VoiceShortcutDock.tsx` 保留 `keyboard(0,-56)`、`butler(-56,0)`、`feed(0,56)` 的历史命中几何、长按/取消/转写/权限状态机和讯页文案；妙页三个入口使用 V6 对应的 22px 线框 SVG，讯页按“直接说 / 总结未读 / 替我规划”使用麦克风、摘要、箭头图标。共用按钮使用 `#F6F8FF → #E1E7F1` 圆形渐变与设计阴影，命中项以青色边框提示。该历史阶段仍允许轻点打开菜单；当前实现以本节顶部 V15 复核记录为准。
- 主语音入口改为 52px 圆角方形，普通态使用 V6 浅色渐变，展开态使用青色表面与光晕；语音状态卡的麦克风图标改为 44px 青色圆标。未改“我”页收缩逻辑，也未把 V6 演示数据或缺失后端能力写入产品。
- 模拟器预览后发现妙页仍显示旧薄荷渐变和白色任务卡。本轮补齐 V6 颜色：妙页与安全区底色 `#11121e`、任务卡 `#292e3f`、文本 `#f6f7fa/#a4a8b5`、青色 `#00c7cb`，卡片圆角 19px 且无边框；语音菜单展开时仅任务流降至 `.72` 透明度，三向菜单保留清晰。未改“我”页、底部导航样式、菜单几何与语音链路。
- 妙页深色顶栏改用浅色系统状态栏文字；退出妙页后恢复当前主题的状态栏色。最终检查 `MIAOXUN_DOTENV_ENABLED=false ./scripts/check-repository.sh` 退出0：RN72套/922项，backend876通过/268项PG环境门控跳过；新增任务流颜色/透明度及根页状态栏断言通过，`git diff --check`通过。
- 该轮最终候选已覆盖固定 iPhone17 并启动，构建证据 `/Users/gary/Library/Application Support/MiaoxunDevelopment/76237d6f8986/builds/2026-10-23T09-36-40-757Z/build.json`，安装包与候选JS SHA256均为 `503f4555e1081bf4c3933013ef19d7ca512a9a1652c0b939dbe05132be86bfc3`。界面核验为真实空任务态、菜单展开、浅色状态栏；没有任务卡可供模拟器实图验收，不用原型示例任务补齐。此次仅查看界面，未触发模型调用。
- 在该阶段记录时尚未完成整套 V6 视觉对齐；后续工作与最新证据见下方“V6 全局色板与二楼/我页复核”，该历史判断不再代表当前源码状态。
- 定向验证：RN Prettier、ESLint（零警告）、TypeScript 通过；`npm test -- --runInBand __tests__/voiceShortcutDock.test.tsx` 29 项通过。`MIAOXUN_DOTENV_ENABLED=false ./scripts/check-repository.sh` 退出0：RN 72套/921项、backend 1144项中876通过/268项PG环境门控跳过，其他仓库检查通过。`git diff --check` 通过。
- 固定 iPhone 17 模拟器 `--build-only` 成功，证据 `/Users/gary/Library/Application Support/MiaoxunDevelopment/76237d6f8986/builds/2026-10-23T08-30-45-867Z/build.json`。用户随后明确授权覆盖主用 iPhone 17 模拟器；候选以正式 Bundle `com.wangruoshi.miaoxun` 安装并启动，当前停留在妙页、快捷菜单展开。安装包 `main.jsbundle` SHA-256 与构建候选一致；原数据容器路径已变化且旧路径不再存在，当前模拟器数据状态可能已重置。只核对了容器路径与哈希，没有读取旧容器内容。该构建仍指向正式 API，查看菜单未触发模型调用；后续若在该模拟器登录或执行真实Agent操作会访问线上服务。此次是模拟器预览，不是真机验收。

## 2026-10-23 V6 全局色板与二楼/我页复核（历史，已被 V15 覆盖）

- 在 V6 妙页和语音菜单的基础上，统一 `讯`、`我`、二楼、共享工作区、站点页和消息页使用 V6 深色角色：画布 `#11121e`、卡片 `#292e3f`、辅助底 `#202636`、正文 `#f6f7fa`、次级文字 `#a4a8b5`、强调色 `#00c7cb`。共用映射集中在 `MiaoxunRN/src/shared/v6Palette.ts`，不把 HTML 原型演示数据写入产品。
- `我` 页资料卡外层在 V6 下改为画布色，保留现有上滑折叠、资料卡缩小、详情测量和恢复逻辑；二楼去掉旧的大圆角边框，工具栏改为 V6 深色托盘和青色选中态。未修改长按菜单的布局、命中几何、语音状态机或后端链路。
- 固定 iPhone 17 已按用户授权重新覆盖并启动当前源码，最新证据 `/Users/gary/Library/Application Support/MiaoxunDevelopment/76237d6f8986/builds/2026-10-23T11-04-21-588Z/build.json`。逐页查看了讯页空态、我页资料/动态空态、二楼相册空态和妙页快捷菜单；背景、卡片、导航选中态和三向菜单按钮均为 V6 深色/青色视觉。模拟器仍使用正式 API，仅做界面查看，未触发模型调用；不能替代真机验收。
- 最新全量检查 `MIAOXUN_DOTENV_ENABLED=false ./scripts/check-repository.sh` 退出 0：RN 72 套/922 项通过，backend 1144 项中 876 通过、268 项 PostgreSQL 环境门控跳过，其他工程检查通过；二楼定向 17 项、站点/导航定向 20 项通过，`git diff --check`通过。
- 仍保留范围外的真实业务能力和设备边界：后端缺少的等级/星标/关系评分等不使用假数据补齐，真机触控流畅度和完整业务链路仍需独立验收。

## 2026-10-26 Build53 TestFlight 上传

- 当前工作树分支为 `feature/redesign-by-prototype`，保留所有既有未提交修改。本轮将 Debug/Release `CURRENT_PROJECT_VERSION` 从51同步到53，并同步更新 `backend/test/release-network-config.test.js` 中对应的版本门禁断言；Marketing version 仍为 `1.0`，Bundle ID 为 `com.wangruoshi.miaoxun`，Release API 为 `https://8.153.167.11`。
- 新图标写入 `MiaoxunRN/ios/MiaoxunRN/Images.xcassets/AppIcon.appiconset/` 的18个PNG，`Contents.json`和`ASSETCATALOG_COMPILER_APPICON_NAME=AppIcon`保持不变。`sips`逐张确认尺寸及无Alpha，`xcrun actool --platform iphoneos --app-icon AppIcon`编译通过。
- 发布门禁 `MIAOXUN_DOTENV_ENABLED=false ./scripts/check-repository.sh` 退出0：RN 72套/924项通过，后端876通过/268项PostgreSQL环境门控跳过，其他工程检查通过；`git diff --check`通过。
- Release archive `/tmp/miaoxun-release-20261026/MiaoxunRN-1.0.53.xcarchive` 已成功生成。归档内核对 `CFBundleIdentifier=com.wangruoshi.miaoxun`、`CFBundleShortVersionString=1.0`、`CFBundleVersion=53`，包含 `main.jsbundle`（5.2MB）和 `Assets.car`（236KB）；`codesign --verify --deep --strict`通过。
- 2026-10-26通过Xcode Organizer选择 `App Store Connect` 上传当前归档，Xcode显示“Upload completed with warnings”。App Store Connect接受上传但当前浏览器会话刷新后认证失效，尚未从网页确认处理完成/群组状态；Build53页面确认前不要把它当作“正在测试”。上传警告仅为 `React.framework`、`ReactNativeDependencies.framework`、`hermesvm.framework` 缺少对应dSYM，影响这些依赖的崩溃符号化，不阻止上传。

## 2026-10-27 Build54 TestFlight 上传

- 用户明确要求更新 TestFlight。本次只发布 iOS 客户端，不部署后端、不执行数据库迁移、不推送 Git、不调用付费模型，也未安装或替换实体设备 App。Debug/Release 构建号从53同步至54，对应版本门禁断言同步更新，版本仍为 `1.0`。
- 包含今天的讯页双 Tab 字号/新建浮层/搜索返回、二楼落地页/六入口/各子页视觉与滚动状态修复；保留我页折叠和长按菜单布局。新图标18张复核尺寸匹配且无Alpha，源图和master哈希与上次一致。客户端复用合同6现有接口，没有新增后端或迁移依赖。
- `MIAOXUN_DOTENV_ENABLED=false ./scripts/check-repository.sh` 退出0：RN73套/953项通过，后端876通过/268项PostgreSQL环境门控跳过/0失败，其他工程检查通过；日志 `/tmp/miaoxun-check-repository-20261027-build54.log`。`git diff --check`通过。发布只读预检退出0、0失败/4警告，日志 `/tmp/miaoxun-launch-readiness-20261027-build54.log`；警告为域名clientHold、两个公网子域DNS为空及无Java而跳过Android，正式IP HTTPS健康、后端readiness、TLS续期及iOS Release配置通过。
- Release归档 `/tmp/miaoxun-release-20261027-build54/MiaoxunRN-1.0.54.xcarchive` 成功；归档前后源码SHA-256均为 `c044d6217974cd3fce742b43ed50321fe7e1dd4fe632f676b7abad370f30da81`，证据同目录 `source-before.json`、`source-after.json`、`archive-validation.json` 与 `xcodebuild-archive.log`。核对正式Bundle `com.wangruoshi.miaoxun`、版本 `1.0 (54)`、API `https://8.153.167.11`；内嵌JS SHA-256为 `2373c2bccbc62e88e0f12081eeffffa3e7562c3923e10fb3fbbc92556aeba8c4`，`Assets.car`与Build53一致。`codesign --verify --deep --strict`通过，App dSYM UUID与可执行文件一致。
- Xcode Organizer使用现有云托管分发证书和正式Store profile，关闭自动管理版本号，保留 `1.0 (54)`；分发摘要确认 `get-task-allow=false`、`beta-reports-active=true`。2026-10-27 18:57 显示“Upload completed with warnings”，Organizer记录“Uploaded to Apple”及Build Number54；截图 `/tmp/miaoxun-release-20261027-build54/upload-completed.png`。警告仍仅为React、ReactNativeDependencies、Hermes缺少对应dSYM，影响这些依赖的崩溃符号化，不阻止上传。
- App Store Connect 已实读确认 [1.0 (54)](https://appstoreconnect.apple.com/teams/f5083324-f212-4392-ad27-dcbc8402fe74/apps/6783301943/testflight/ios/d5269f7c-8c41-4c1a-86c9-4f7cfa34870f)“正在测试”，构建元数据“已验证”、“App使用非豁免类加密：否”；测试信息页显示内部 `yunzhi` 与外部 `yunzhi`（6人）均已关联。归档未预填 `ITSAppUsesNonExemptEncryption`，网页合规状态已核对。测试说明刷新后仍保留讯页字号/新建/搜索、二楼六入口与子页/滚动、保留我页与菜单及沿用新图标的说明；最终截图 `/tmp/miaoxun-release-20261027-build54/testflight-build54.png`。模拟器证据沿用今天最终源码构建，不等于Build54实体真机验收；蓝湖逐页对照仍未完成。

## 当前制品与判断

**合同6后端已部署，2026-10-27 已确认 TestFlight 1.0 (54)“正在测试”。** Build54 已关联内部及外部 `yunzhi` 群组，外部群组6人，构建元数据已验证、“App使用非豁免类加密：否”，测试说明已持久化。实体 iPhone 14 Pro 最后直接核验为 Build52，2026-10-22 取得部分无模型 UI 截图；今天未安装或替换实体设备 App，Build54 真机细节仍待用户复验。分支 `feature/redesign-by-prototype`，HEAD `739320d6c95a9fb72f69d11ab33decf4ee02fece`，所有既有未提交修改保留，实际状态以 Git 实读为准。

| 对象 | 最后核验的状态与边界 |
| --- | --- |
| 本地源码 | HEAD `739320d6`，工作树保留 V15 UI、AppIcon、测试、文档及既有跨层修改；合同 `aiTasks:1 / siteDocuments:2 / agentWorkspaces:6`，迁移截至043。当前源码状态以 `git status` 和本页 2026-10-27 检查为准，不再沿用“与候选来源完全一致”的旧判断 |
| TestFlight | 2026-10-27 网页确认 1.0(54)“正在测试”、元数据已验证、非豁免类加密为否；内部 `yunzhi` 与外部 `yunzhi`（6人）均已关联，测试说明刷新后保留。Build54 实体真机安装与验收待用户复验。 |
| 线上后端 | 2026-10-22切到 `contract6-candidate-20261022-b8da29b`，来源 `b8da29b6ebe5d04d106c7599a32ef24f5df2e761`，运行manifest 238/238哈希通过，迁移账本043/43项。API、AI Task Worker、媒体Worker使用同一runtime；本机与公网HTTPS health/ready均为200，AI Worker合同6且idle |
| 固定模拟器 | 2026-10-27 按用户要求，iPhone 17 / iOS 26.5 的正式 Bundle 已覆盖为当前本地 Debug 1.0(53) 预览候选，最新证据为 `/Users/gary/Library/Application Support/MiaoxunDevelopment/76237d6f8986/builds/2026-10-27T10-28-33-301Z/build.json`；已操作讯页新建、搜索和二楼入口/子页/轻点返回，最新复核停留在关系页，连续拖动仍待真实手指验收。HTTPS API仍为正式地址，安装时数据容器已迁移；这不是 TestFlight 或生产发布状态 |
| 物理设备 | 实体iPhone 14 Pro最后直接核验为正式Bundle `com.wangruoshi.miaoxun` Build52及原旧版Bundle，本次未安装或替换实体设备App。Build52已观察登录保留、妙/讯/我、我的Agent默认管家与授权不匹配提示、二楼默认相册和文件页、picker取消及前后台恢复；用户反馈我页短内容上滑会卡顿、展开资料不完整。Xcode UI账号已登录且选中项目Team `R8K5DUTWB6`（Admin）；本机有该Team有效开发身份，正式Bundle开发profile覆盖该设备，但独立QA Bundle仍无匹配profile。真机QA构建退出65且CLI报告`No Accounts`，不能据此否认GUI账号。Build52不含本地修复，真实手指流畅度和修复后的真机布局仍未验。 |

## 2026-10-22 本地发布候选

从干净 HEAD `b8da29b6ebe5d04d106c7599a32ef24f5df2e761` 生成了本地合同6候选，证据目录为 `/Users/gary/Library/Application Support/MiaoxunReleasePreparations/contract6-candidate-20261022-b8da29b/`。runtime 共238个文件，SHA256 为 `82d23c514f880f0c5fa9e6e2a7a23bb719a270f788492e5d8de418c4777b1c46`，`sourceTree` 为 `1af970d1179cab15c9b799a2e4a265266d4627ad`，且不含工作区修改。实际生产切换与TestFlight上传结果见本页末尾的2026-10-22状态记录及[候选发布记录](../reviews/2026-10-21-contract6-release-preparation.md#2026-10-22-testflight52与合同6后端生产切换)。

同一源码生成 iOS Release archive `MiaoxunRN-build52.xcarchive`，Bundle `com.wangruoshi.miaoxun`，版本 `1.0 (52)`，正式 API `https://8.153.167.11`，内嵌 `main.jsbundle` SHA256 为 `22e4d8b389857c4e2f2c4e5819d8bc98f10df7221386559df97d0078564a7706`。原archive使用Development签名；随后Organizer用现有云托管分发证书成功导出 `ios/MiaoxunRN-build52-distribution/MiaoxunRN.ipa`，SHA256为 `a18a081d3ace217fbfd9c7bf31c1c4ef271c0da1228e9ff50937101a7d42fb91`。IPA深度严格签名校验通过，`get-task-allow=false`、`beta-reports-active=true`，版本/Bundle及内嵌JS与归档一致。

先前CLI导出退出70（`No Accounts`及`No signing certificate "iOS Distribution" found`），不能推断Xcode账号/证书缺失；Organizer使用现有登录及云托管分发证书成功导出IPA。原CLI日志与Organizer导出文件均保留。App dSYM匹配，React/ReactNativeDependencies/Hermes匹配符号仍缺失；本次上传警告也仅涉及这三个dSYM。候选生成时全仓检查退出0（RN72套915项，backend874通过/268环境跳过），部署后launch-readiness退出0且有4项环境警告。实际上传、后端部署和生产验证见后续状态记录；未新增付费模型调用。

Build48同步故障、前向恢复、227项manifest和备份证据保存在[历史恢复记录](2026-10-14-build48-history.md#build48同步故障与前向恢复)。2026-10-15的队列、备份timer与进程详情也仅为历史快照，发布前重新核验。

## 已实现与验证入口

详细实施、数据库、模型、构建、截图和环境收尾证据统一见[合同6发布准备记录](../reviews/2026-10-21-contract6-release-preparation.md)，其“前序实施与客户端证据”保留Build49–51及各阶段的独有原始记录。

- **UI与默认管家**：根页渐变、安全区、二楼默认相册、我页3D空态/日记卡/空内容收缩、聊天输入区清理已随Build51分发；服务端默认启用管家及完整当前权限已由040部署。生产检查确认现有账号均有启用的妙讯管家和会话入口；其他Agent不会自动恢复撤权。
- **同任务续作与讨论**：041保留轮次、历史成果、来源和审批；Keychain保存未决请求，重进页面须明确核对。任务卡带回管家仅讨论，明确“继续修改此任务”才进入原任务续作，旧版本须核对。
- **专业Agent与文本文件**：042将专业交办接入direct工作空间；043接通TXT/Markdown/JSON/CSV/TSV UTF-8上传、全文核对、鉴权引用、专业摘要与原任务修改。格式和限额见[文件处理合同](../file-processing.md)，删除/撤权/版本变化使旧成果不可继续使用，不伪造旧预览全文。
- **前后台与登记边界**：文件页旧正文响应在后台及返回前台后均不能触发旧导航，新操作可恢复；兼容JSON登记与原始上传共用文件名、扩展名及MIME校验，合法空正文仍为不可引用的 `pending_upload`。
- **隔离验证**：各阶段整仓、真实HTTP/PostgreSQL、升级恢复演练及固定iPhone17独立副本证据已记录。文本文件阶段67个不同PG/HTTP用例及后续专业消息18/讨论19项分别列出，不简单累计；替身供应商只证明数据与任务链路。
- **最近产品修复检查**：兼容登记补强后全仓退出0，backend874通过/0失败/268环境跳过、RN72套915项，Agent50、Admin15、avatar-web29、media3通过。日志 `contract6-release-preparation-20261021-120344/file-placeholder-validation-20261021-083658/repository-check.log` 位于仓库外 `MiaoxunReleasePreparations`；环境跳过不算PG或生产通过。本次整理的检查见下节。
- **模型证据**：首轮12例自动通过、AI语义11/12；保存指引修复后获准3例讨论复测，自动及两次独立AI审阅均通过。另9例沿用提示hash未变的首轮证据，不能称12例全部重跑。两批15次付费调用授权均已耗尽，金额未知。产品供应商配置未由此改变。

## 文档与引用整理（2026-10-21，前阶段）

- 原位收敛根README、文档索引和项目地图：状态指向本页，地图按真实源码导航，移除RN0.76、旧分支与不存在路径等过时内容。历史过程移入已有发布记录及[Build48前后阶段历史](2026-10-14-build48-history.md)，不新增报告、依赖或清理框架。
- 六份本轮文档的173个本地链接及目标锚点通过核验；旧CURRENT中14个唯一SHA256全部保留，错误的候选审查目录按实际文件位置纠正。历史“上方/下一节”指向与跨日期状态已明确，源码导航不代表功能或设计验收通过。
- 有限引用核验仅确认并删除 `backend/src/specialist-message-service.js` 末尾无人使用的预创建单例；实际工厂及路由不变。989个非文档文件的内容摘要核对确认除此一行外均未改变。相关现有测试7通过、0失败、18项PG环境门控跳过；本轮全仓检查退出0：backend874通过/0失败/268环境跳过、RN72套915项及其他工程检查通过。完整日志位于已有发布准备证据根目录的 `repository-cleanup-20261021.log`；跳过项不算PG或生产通过。本轮未改RN或数据库逻辑，未重做构建、设备或PG集成。
- 没有证明可删的源码文件或图片；动态Agent注册、原生桥接、类型声明和040–043迁移保留。两套 `ai_tasks` / `agent_workspaces` 均仍被Worker使用；历史 `agentReplyPresentation.ts` 也仍有消息及引用消费者。
- 本地未发现属于本项目的遗留API/QA监听；5173属于其他项目。Pods/node_modules、当前DerivedData、发布归档、备份、停机验收库及 `output/` 未证明无用，保留。本机其他数据库和new-api容器归属未证明可清理；本轮未访问或清理线上。
- 前阶段保留两个旧工作树及旧分支，后续Git核验与本地提交结果见下节。
- 该阶段没有新建仓库文件、供应商调用、生产变更、TestFlight上传、Git提交或推送；这是已核实范围的整理，不能称“全仓零死代码”。

## Git基线与夹具修正（2026-10-21）

- 194个既有变更文件按真实依赖整理为默认管家、完整UI/合同6功能、文档三组本地提交。第一组6个源码/测试文件在原HEAD临时快照独立单测24/24通过，快照已移除；未为拆分强建中间架构。
- 隔离PG复现两处旧测试错误后，仅将管家成功路径合同5改6、旧合同拒绝列表6改5；同步修正默认管家授权例外说明，并清掉新增服务末尾空行。完整service21/21、butler23/23通过，零跳过；业务合同与授权校验未放宽。
- PG18执行43项迁移，应用角色非superuser；结束users/sessions/messages/workspaces/ai_tasks均0，37条测试审计不冒充0。PG已fast stop、59366无监听，本轮临时集群已移除。前后日志及全仓 `repository-git-cleanup-20261021-091746.log` 保存在原发布准备证据目录。全仓退出0：backend874通过/268环境跳过、RN72套915项及其他工程通过；未改RN或迁移逻辑，未重做设备验收或付费调用。
- 8个本地分支已核对；汇总基线5429eb6吸收过旧功能，不能因git cherry的“+”重复合并。保留合同3来源232a142及旧Build24独有实现。两个旧工作树干净，无独有未受Git保护数据；约262MB为checkout/依赖，但不在本聊天附件中，保留待原所属聊天归档，分支及提交未删。
- 收尾核对10份文档的203个本地链接及目标锚点，修正Agent说明中协作合同3指向合同6标题的失效链接；产品目录与功能提交`4eb5254`无差异，未新增仓库工具或报告。
- [既有发布记录](../reviews/2026-10-21-contract6-release-preparation.md#git基线整理与合同夹具修正2026-10-21)保留提交边界、分支判断和44项PG证据。Git基线整理完成不构成发布批准。

## 尚未闭环

| 项目 | 影响与边界 |
| --- | --- |
| TestFlight可测试性 | Build54“正在测试”，内部 `yunzhi` 与外部 `yunzhi`（6人）均已关联，合规及测试说明已核对；Build54 真机安装与10月28日二楼各子页手势、我页 Agent 视觉细节待用户复验。实体iPhone 14 Pro最后直接核验为Build52，登录提交、有效文件上传、真实任务、续作等仍未完整验收 |
| 生产切换后观察 | 合同6后端健康、ready、Worker与备份验证通过；域名仍clientHold且公网子域DNS未解析，客户端继续使用IP HTTPS。需观察真实用户流程和错误率，不做付费模型冒烟 |
| 真机与产品发布 | Build52实体设备安装及部分无模型UI已验；Build54需复验二楼落地/子页上滑退出、我页 Agent 卡片及短内容折叠。真实Agent业务、本轮登录提交和完整真机验收未完成。能力缺口和发布范围仍须单独判断 |
| 模型复核豁免 | [复核材料](../reviews/2026-10-21-contract6-human-review.md)记录首轮12例与修复后3例的AI复审结论。用户于2026-10-22明确接受AI复审并豁免本批真人复核；原始报告仍保留`humanReviewStatus=NOT_RUN`、`releaseApproved=false`，该豁免不等于发布批准 |
| 真实执行能力 | 漫画成图、视频成片、PDF/Word/OCR、协作3D生成未接入；协调器可见成果元信息，任务成功不证明全部需求满足 |
| 设计与设备 | 33状态清单是日期快照，尚未全面逐页重验；Codex Computer Use录屏权限已显示开启且Mac窗口截图可读，QuickTime查询仍超时，真机改用Xcode截图。二楼进出已有用户手指操作和终态截图，连续长按/滑选、语音及更多边缘状态未验。后端缺少的等级/星标、关系评分、妙点累计等不能用假数据补齐 |
| 历史消息与双任务 | 旧聊天未可靠记录调用mode，JSON形状展示器仍在用；先明确历史数据治理和旧任务迁移，再移除，不能隐藏正常JSON或直接删旧路径 |

## 下一步（2026-10-28）

1. 在 Build54 真机复验二楼落地页和各子页的上滑退出、讯页双 Tab/新建/搜索，以及我页 Agent 卡片和既有折叠/菜单布局。
2. 蓝湖当前需要重新登录，恢复访问后补齐与设计稿的逐页核对；本轮模拟器与 HTML 对照不作为整套设计或真机已验收的结论。
3. Build54 已在 TestFlight 正在测试，合规、测试说明及内外部群组状态已核对；由用户更新后继续复验10月28日修复，上传和分发完成不代替真机验收。

## 2026-10-22 设备与模型验收历史待办（执行前重新核实）

1. 真机UI修复复验暂被签名阻塞：Xcode Accounts页面可见`R8K5DUTWB6`团队Admin账号；本机有一张该Team有效Apple Development身份，正式Bundle开发profile匹配此证书并包含当前iPhone 14 Pro，但独立QA Bundle没有开发profile。指定Bundle的`xcodebuild -allowProvisioningUpdates`仍退出65并报`No Accounts`及缺少QA profile，CLI账户发现差异尚未定位。用户已授权为`com.wangruoshi.miaoxun.stationQA20261022`创建隔离QA签名资源，并回复门户已打开；但共享Chrome目前仍只有Apple登录加载标签，尚未观察到Identifiers列表。门户状态可见或CLI账号发现恢复后，继续为QA Bundle建立所需资源并签名构建、安装独立合成QA Bundle，验短动态/少量Agent下连续折叠展开、资料恢复和真实触控流畅度；不替换Build52、不登录业务账号、不读取私人会话。随后再补专用合成空TXT错误态、键盘及可访问性。
2. 按[现有发布审查中的Agent矩阵](../reviews/2026-10-21-contract6-release-preparation.md#build52接手验收矩阵2026-10-22)逐项验收。咨询、澄清、交办、讨论、续作和相册检索均可能调用模型；相册启用/媒体上传还可能排队索引，不能列为纯UI操作。
3. 真实模型操作先确定样例、供应商实际请求数和token/费用上限，再取得本轮明确授权。当前生产OpenAI兼容路径没有统一输出token硬上限，审计计数不是预算配额，价格未核实，不能承诺客户端发几次就最多付费几次。此前15次授权已耗尽。

## 2026-10-22 生产切换与TestFlight上传

- 生产目标由 `dynamic-agents-20261014-48`（039/合同3）切换到 `contract6-candidate-20261022-b8da29b`（043/合同6）；部署包SHA256与本地候选一致，远端manifest 238/238文件哈希匹配。storage及root:marvels0640正式环境文件沿用并经权限加固；API、AI Task Worker、媒体Worker实际进程cwd均指向同一新runtime。
- 维护期间公网HTTPS API实际返回503及 `Retry-After: 120`；三个服务平滑停止，数据库应用连接数归零。此前任务统计显示没有queued/running工作；既有媒体任务均为终态。维护恢复点 `/opt/projects/marvels-chat/database/backups/marvels_chat-20261022T023539Z.dump`，明文SHA256 `b0e85b3436f8d1b44ec1a84a2a5b4a3b802c3b024cf29e359a00d505ffa19e66`；加密异地备份服务退出0，OSS归档ciphertext SHA256 `5f0bc0fafdc1e837ee6f6e6c3f52427cc0650832c6a43dd3d0e419505a4e4c44`。从同一dump恢复到隔离临时库成功，核验39项账本、业务表和vector扩展后删除该临时库。
- 新候选通过显式 `lock_timeout=10s` / `statement_timeout=60s` 执行040、041、042、043，4项成功，ledger从39增至43；迁移前后users、agent_runs、agent_workspaces、agent_workspace_nodes、file_assets行数分别保持7、83、2、2、7。新的 `agent_workspace_rounds` 为2行，所有现有账号均有启用的妙讯管家和会话入口。备份角色对agent_workspace_rounds、agent_workspace_continuations、agent_workspaces、agent_workspace_nodes、file_assets均具SELECT权限。
- 公网恢复后，Nginx配置校验通过；本机及公网HTTPS `/api/health`、`/api/ready`均为200，readiness确认数据库迁移当前。API与两个Worker为active、NRestarts=0；AI Worker新启动日志报告合同6、数据库连接正常、无活动任务并持续heartbeat。备份timer active。未登录/创建正式测试账号，也未调用模型供应商。
- 部署后 `MIAOXUN_DOTENV_ENABLED=false ./scripts/check-launch-readiness.sh` 退出0、0失败、4警告：主域名clientHold、两个公网子域DNS当前无解析、本机无Java因此Android检查跳过。当前App API仍为IP HTTPS；警告不代表本次API TLS/readiness失败。
- Xcode Organizer对Build52选择App Store Connect上传，显示“Uploaded to Apple”；App Store Connect已创建1.0(52)，上传记录状态“完成”（2026-10-22 10:49）。上传警告为React、ReactNativeDependencies、Hermes dSYM缺失，影响对应framework崩溃符号化。Build详情提示出口合规待提交，群组数0；未分配测试员、未发送通知。App Store Connect记录：[Build52](https://appstoreconnect.apple.com/teams/f5083324-f212-4392-ad27-dcbc8402fe74/apps/6783301943/testflight/ios/3befceb9-7e87-49b2-ab80-e09eb239e22f)。
- 本轮未推送Git。上传时Build52尚未开放测试；后续App Store Connect状态及设备复核见下节。整体产品可上线性和真机验收仍未确认。

## 2026-10-22 App Store Connect状态复核

- 后续实读Build52详情页显示构建状态“正在测试”，测试信息中已关联内部 `yunzhi` 群组和外部 `yunzhi` 群组；外部群组显示6人。构建元数据“App使用非豁免类加密”为“否”。这与上传当时记录的群组数0不同，按当前页面更新状态，不改写上传时快照。
- 外部群组详情显示已有2条Build52安装记录，设备分别为iPhone 14 Pro和iPhone 16 Pro；这只证明安装，不代表关键产品流程已验收。本次只读查看，没有修改群组、向测试员发送通知或提交合规声明。
- 此前 `xcrun xcdevice list --timeout 10` 曾显示实体iPhone 14 Pro `available=false`。用户随后重连并解锁，本轮Xcode已连续取得Build52静态截图并完成部分用户手指导航；固定iPhone17只能提供模拟器证据，不能替代真机验收。

## 2026-10-22 我页短内容与资料卡本地修复

- Build52实体验收中，用户反馈动态或我的Agent内容较少时上滑折叠卡顿，并指出3D空态右侧只见名称。Build52截图记录为资料详情未显示。按设计状态，折叠时仅保留名称是预期；展开后应恢复“我的信息”、AI ID、简介和地区。
- `StationScreen` 现在只使用有效的正尺寸建立滚动余量，预留折叠后视口加72pt；尺寸变化后重测，折叠动画期间不逐帧改内容高度，并在原生滚动事件滞后时保留当前offset。完全收缩时若窗口仅改变高度，资料卡固定64pt且原生可能不再发`onLayout`；此时以已知64pt和新视口重建预算。`StationHeader` 忽略短暂的零高度详情测量，首次自然测量后保持可重新展开的完整内容高度。
- 隔离iPhone17外部合成fixture对旧HEAD复现目标offset72实际回弹到65、返回顶部后“我的信息”消失；冻结修复源码下，空动态与单Agent各做两轮原生 `72→0` 程序滚动，偏移稳定且展开后资料行恢复；长简介完整换行并可收缩/恢复。最终报告与截图10–16保存在 `/Users/gary/Library/Application Support/MiaoxunReleasePreparations/contract6-release-preparation-20261021-120344/station-ui-qa-3cdi2mfk/qa-results.md`。网络拒绝请求计数为0，正式Bundle元数据、JS和数据容器保持不变。
- 该fixture的QA钩子调用真实原生 `ScrollView.scrollTo`，但CUA拖动没有送达 `touchMove`。因此上述是布局、原生滚动范围与资料恢复证据，不证明手指拖动响应或主观流畅度；真机Build52仍未包含修复。
- RN四件套通过：TypeScript、ESLint、Prettier，Jest 72套／921项。新增高度单独变化回归不发送资料卡的新`onLayout`，验证视口事件将预算从758更新到958，并在展开后的自然测量完成后保持正确。`MIAOXUN_DOTENV_ENABLED=false ./scripts/check-repository.sh`退出0；仓库级各工程检查通过，隔离PostgreSQL环境门控用例未运行、不计作PG实测。`git diff --check`通过。最新源码的固定iPhone17 `--build-only`成功，Debug 1.0(51)，`installed=false`、`launched=false`、`officialUnchanged=true`；证据 `/Users/gary/Library/Application Support/MiaoxunDevelopment/76237d6f8986/builds/2026-10-22T09-10-22-097Z/build.json`。
- 用户指出Xcode已登录；在 Xcode Settings → Apple Accounts 实看`Rose Wang Developer Team`账号、Admin角色及Certificates/Identifiers/Profiles权限。项目与Build52 archive使用Team `R8K5DUTWB6`；本机3个有效代码签名身份中有一张Apple Development身份属于该Team，且与正式Bundle开发profile内的证书匹配。该正式开发profile覆盖当前iPhone 14 Pro；本机缓存profile均只覆盖正式Bundle `com.wangruoshi.miaoxun`，没有独立QA Bundle `com.wangruoshi.miaoxun.stationQA20261022`的profile。
- 再次以命令行Bundle ID覆盖并启用`-allowProvisioningUpdates`执行完整合成fixture真机构建，仍退出65并报告`No Accounts`和缺少QA Bundle profile；这与GUI账号可见状态并存，CLI账户发现差异尚未定位。独立Metro bundle编译成功。fixture位于`/Users/gary/Library/Application Support/MiaoxunReleasePreparations/contract6-release-preparation-20261021-120344/station-ui-qa-physical-20261022/`，直接导入当前工作区`StationScreen`、全部拦截网络、无账号，并移除程序化滚动钩子以便后续真手指操作；未改仓库源码。该次未产出签名QA App，设备安装清单仍只有正式Build52及原旧版Bundle；未观察到创建QA App ID/profile。本轮未在Developer Portal手动修改资源。用户回复已打开Developer Portal，但本轮共享Chrome读取仍是`idmsa.apple.com`登录加载页，未见Identifiers列表，需先对齐当前浏览器页面。已配对设备当前available，Build52和旧版Bundle仍在。本地修复尚不能算真机验收通过。
- 本轮未安装候选到实体设备、未上传TestFlight、未部署生产、未调用真实模型或供应商。文件本地错误态仍未验：没有专用无私人内容的空TXT样例；未选择私人文件。文档更新后重跑`MIAOXUN_DOTENV_ENABLED=false ./scripts/check-repository.sh`退出0，RN 72套／921项通过；环境门控的隔离PostgreSQL用例未运行、不计作PG实测。`git diff --check`通过。
