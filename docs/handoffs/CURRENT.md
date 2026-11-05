# 妙讯当前交接入口

更新：2026-11-05。先读 AGENTS、README、docs/README，再核对 Git 与实际运行。日期记录只证明当时状态，不延续部署、上传或付费授权；保留已有修改，不写入密钥、生产身份或私人内容。

#### 2026-11-05 已授权本地发布提交与正式制品（未部署）

- 用户明确批准候选清单中的163个文件创建本地发布提交并生成正式后端制品；逐文件核对原清单和SHA后提交为 `cebc1e6d5c7848fc630f1e8453b0c3bfbad774f3`，tree为 `9c187fd8a495edaf92ce0b9b48f94cfff95487ae`。仅额外清除新增测试 `backend/test/ui-preference-preflight.test.js` 一处行尾空格，未扩大文件范围；对应5项测试通过。未执行checkout/reset/clean或覆盖其他工作。
- 提交前重新运行 `MIAOXUN_DOTENV_ENABLED=false ./scripts/check-repository.sh` 退出0：RN86套/1093项、Agents55项、Admin48项通过；Backend1355项中1049通过、306项专用数据库门控跳过。语法、构建、RN TypeScript/ESLint/Prettier和release-package测试通过。暂存后 `git diff --cached --check` 通过；门控数据库的独立实测证据见前述发布前记录，不能把跳过计为通过。
- 在干净提交上执行 `node scripts/prepare-runtime-release.mjs ui-agent-candidate-20261105-cebc1e6` 退出0。后台和avatar-web用锁文件从临时干净源码重新安装并构建；正式归档含284个运行文件、UI-Agent/shared合同、055/056迁移、API/双Worker及运维入口。归档SHA-256为 `a385f6a054d2ffd2abe2631ba2b0550d94870343ad73ba594f21b00655b1114e`，1264231字节。
- 制品已保存到 `/Users/gary/Library/Application Support/MiaoxunReleasePreparations/ui-agent-candidate-20261105-cebc1e6/`，含归档、校验文件、manifest、工具链与逐文件验证记录、批准清单及完整检查/构建日志。核验manifest来源、完整文件集合、所有文件哈希、运行源码与提交一致、lockfile原字节、包投影和无敏感文件路径；`includesWorkingTreeChanges=false`。构建环境macOS arm64/Node26.5.0/npm11.17.0；不是Linux生产服务启动证明。
- 独立只读归档复核同样通过：276个非前端文件对应Git blob或明确package投影，另8个为构建产物；56迁移、10 Agent定义、10条runtime脚本均完整，792个相对导入闭合。未解包落盘或重复安装依赖，未连接任何服务。
- 制品封存后仅更新本交接及两份发布审查文档，再跑相同整仓检查退出0（日志 `/tmp/miaoxun-20261105-post-artifact-docs-check.log`）；26个本地文档链接有效。三份文档作为独立留证提交保存，不重打包、不改变制品来源；固定目录同时保存此前脱敏的备份恢复、UI-Agent生命周期和Linux依赖证据。
- 后续仅补交接与发布证据文档，不改变已封存制品的sourceHead；制品来源始终为 `cebc1e6`，不能把后续文档提交称作制品源码。细节见 [发布前证据](../reviews/2026-11-05-release-preflight-evidence.md)。历史下方“尚未提交/无制品/待提交授权”均是本节完成之前的状态。
- 当前本地提交/制品阶段已完成，生产发布仍为 `BLOCKED`：需单独授权正式维护、停写新备份及owner/ACL恢复核验、055/056迁移和同制品API/双Worker切换；正式UI-Agent上架、用户独立同意、真实模型和新版客户端/实体设备验收仍待各自执行。没有推送、生产部署/迁移、正式产品发布、付费供应商调用或TestFlight上传。Build58仍不包含本轮修改。

#### 2026-11-05 发布前真实备份与干净依赖验证（未提交/未部署）

- 通过已有SSH身份只读复核：生产仍为 `app-collaboration-20261103`、276文件、001–054迁移；API/AI Worker/媒体Worker/备份timer均active，ready正常。已有备份最近任务成功，备份角色有pg_read_all_data。没有停写、重启、创建新生产备份或变更生产数据库。详细版本、命令及边界见 [发布前证据](../reviews/2026-11-05-release-preflight-evidence.md)。
- 已将服务器已有 `marvels_chat-20261104T221908Z.dump` 复制到本机受限目录并校验SHA，在仅Unix socket的独立PostgreSQL18.4恢复；8份真实资料通过当前偏好预检，054→055/056成功且资料JSON摘要一致，重复迁移0项。056在7节点真实副本约1.56ms；额外持有写锁时150ms超时按预期返回55P03，055保留、056未登记且无索引残留，释放锁后重试成功。敏感明文、副本数据库及集群目录已清理。该演练忽略owner/ACL，毫秒值不代表生产高负载，且不能替代未来正式窗口的新停写恢复点。
- 本地UI-Agent发布与授权验证已补：独立PG的publishing lifecycle10/10、054升级集成1/1；实际ui-agent0.1.0经真实release/product服务发布，独立scope同意、默认授权/锁/复验、确认持久化及撤权/暂停/撤回/换号/过期/CAS均通过。模型run和发布readiness使用测试注入，不能标成真实模型或生产上架。三个精确测试库和自建集群已删除。
- Linux生产依赖证据已补：临时普通源码复制及真实lock，分别在arm64与x86_64容器干净安装112个生产依赖；断网导入API、双Worker和8个服务模块，10个Agent含ui-agent、055/056和Sharp实际PNG处理均通过。锁文件字节未变，临时源码/node_modules/容器已清理。探针Node22.23.4与生产22.22.1有补丁差异，且未启动完整服务；正式runtime仍未生成。
- 发布脚本现有测试1/1通过，204个运行JS文件792条相对import静态核对无白名单缺项。修正文档把开发依赖链接测试误称为完整生产依赖证明的表述；新增 [发布执行草稿](../reviews/2026-11-05-ui-agent-release-plan.md)，明确API/AI停止模板90秒、媒体Worker30秒、迁移逐文件提交、锁超时和开放新写入后的前向修复。
- 本轮只新增/修订发布文档：`docs/reviews/2026-11-05-ui-agent-release-plan.md`、`docs/reviews/2026-11-05-release-preflight-evidence.md`、`docs/deployment.md`、`docs/README.md` 和本交接。`git diff --check`及文档链接检查通过；业务源码未改，因此沿用上一节已通过的整仓86套/1093项及iOS构建证据，不重复把相同测试当新增成果。
- 当前唯一进入正式制品流程前的操作阻塞是用户第18条“不执行…提交或推送”：打包要求clean committed HEAD，当前仍dirty detached，不能绕过。可审查文件清单为 `/tmp/miaoxun-candidate-scope-20261105.json`。下一步先明确批准本地发布提交的范围，再生成正式制品；推送、生产部署、付费模型、正式Agent发布/用户同意和TestFlight仍按各自授权执行。未对线上做写操作，未提交或上传。

#### 2026-11-05 UI-Agent 能力与页面效果收口（当前工作区，未部署）

- 修复合同接受但 RN 未消费的配置：按组件限制属性与插槽，新增建议不再接受讯/妙虚拟模块排序、未实现模块显隐或单上传按钮顺序。Agent 提示词直接引用共享能力目录；不支持的请求须给出明确范围说明。当前可执行能力矩阵见 [AI 交互文档](../ai-interaction-system.md#ui-ai-界面偏好架构合同1迁移055)。
- 讯页隐藏对话/任务模块时显示恢复说明，不再误显示通知；必要 tabs 保留。新建按钮消费真实文案、图标与受限尺寸，点击区至少44。进入二楼仅支持下拉或右滑；禁用进入手势时显示独立可点按钮，不依赖新建按钮或 VoiceOver。组件显隐只控制按钮/无障碍入口，不会关闭独立手势，服务端拒绝关闭最后一个入口。
- 妙页隐藏 taskFeed 后停止任务流轮询；参与/详情按钮消费实际图标、文案、同槽顺序、位置和尺寸。详情按钮进入本卡 S2，不跳到整个 workspace；默认卡片不额外增加该按钮。参与入口可在顶部右侧或卡片底部，按钮合成缩放统一限制0.8–1.3，保留至少44点击区与退出/返回。
- 二楼相册/文件消费上传入口、字号、密度、间距及圆角；卡片采用同一确认的 cardRadius（默认16），未特殊保留旧静态圆角。内容区仅在已测量底部继续上滑时退出，直接使用合同距离和有效原生时间戳速度；其他方向仅固定手柄响应，并使用相应动画轴。文件详情不继承退出触摸处理。headerRight 返回位置用真实反向行布局换侧。
- 修复“确认了但没有可见变化”：二楼顺序按实际可见工具比较，忽略虚拟 toolTray、隐藏项顺序；妙按钮只比较同槽实际顺序。全局字号/密度必须声明三页影响，历史待确认预览漏报范围也在确认前返回409，不写入偏好。新建无变化建议返回422，历史不支持位置/属性的预览和撤销基线返回明确409。
- 历史 schema1 原样读取；只读迁移预检新增 unsupportedPreferences 汇总，不支持的历史字段/位置/手势/不可达入口将阻止升级。真实054→055/056 PostgreSQL预检回归1/1通过，覆盖原始 JSON 不被改写与迁移前后均拒绝；专用库已删除。独立审查的合同/服务/预检定向50/50通过，未发现新的实质回归。
- 最终 `MIAOXUN_DOTENV_ENABLED=false ./scripts/check-repository.sh` 退出0：RN 86 suites/1093 tests，Backend 1355项中1049通过、306项专用数据库门控跳过，Agents55、Admin48通过；各工程语法/构建、RN TypeScript/ESLint/Prettier通过。RN有既存 VoiceShortcutDock/ChatScreen 的 act 警告。日志 `/tmp/miaoxun-20261105-repository-check-final.log`。初次整仓检查曾因本轮两处RN静态inline style警告失败，移入StyleSheet后重跑通过，没有降低max-warnings门禁。
- 在另一空 loopback `_migration_test` 库实跑 `RUN_UI_PREFERENCE_MIGRATION_INTEGRATION=1 node --test test/ui-preference-migration-integration.test.js`，先复现测试仍仅预期055的过时断言，再仅修正预期包含所有>054的现行迁移，重建空库后1/1通过；随后 `RUN_AGENT_WORKSPACE_SERVICE_INTEGRATION=1 node --test test/agent-workspace-service-integration.test.js` 22/22通过、零跳过。均使用 `MIAOXUN_DOTENV_ENABLED=false NODE_ENV=test DEFAULT_ADMIN_ENABLED=false` 和专用 DATABASE_URL，专用库已删除。加上预检共24项真实数据库回归；模型调用使用测试注入，不是付费真实模型验收。未修改历史迁移SQL。
- 当前源码 iPhone17/iOS26.5 Simulator Debug 构建 `xcodebuild -workspace MiaoxunRN/ios/MiaoxunRN.xcworkspace -scheme MiaoxunRN -destination 'platform=iOS Simulator,id=7E81531F-02AE-40FC-98DA-A575CEC9930F' -derivedDataPath /tmp/miaoxun-current-20261105-simulator CODE_SIGNING_ALLOWED=NO build -quiet` 退出0，包含RN bundle。日志 `/tmp/miaoxun-20261105-simulator-build-final.log`，有第三方编译警告；不代表签名制品或实体设备交互。`git diff --check`通过。
- 本轮业务入口：`shared/ui-preferences.js`；`agents/ui-agent.agent.js`；`backend/src/ui-preference-service.js`；`backend/scripts/check-ui-preference-upgrade.js`；RN `features/ui/uiPreferences.ts`、`features/messages/ThreadListScreen.tsx`、`features/miao/MiaoTaskCard.tsx` 与 `MiaoTaskFeed.tsx`、`features/second-floor/SecondFloorScreen.tsx`、`SecondFloorAlbums.tsx`、`SecondFloorAlbumList.tsx`、`SecondFloorFiles.tsx`。
- 本轮测试入口：`agents/test/ui-agent.test.js`；Backend 的 `ui-preference-capabilities/contract/service/preflight/preflight-postgres/migration-integration` 测试；RN 的 `threadUIPreferences`、`miaoCardState`、`miaoTaskFeed`、`secondFloorPreferences`、`secondFloor` 测试。同步文档为本交接、`docs/database.md` 与 `docs/ai-interaction-system.md`。
- 发布判定仍为 `BLOCKED`：需正式可追溯 clean revision、生产备份恢复副本预检及056索引真实规模测量，再部署后端/迁移、创建并发布 UI-Agent release/product、取得独立用户授权，之后用新构建做真实模型与实体设备验收。当前工作区仍 dirty detached HEAD；本轮没有提交、推送、生产写入、付费调用或 TestFlight 上传。Build58 不包含这些修改。只读公网 health/ready返回200、公开列表8个Agent且没有ui-agent，只证明旧线上服务可访问；iPhone 14 Pro现显示available，尚未安装候选构建或执行交互验收，设备可连接不等于本轮真机通过。依用户第17/18条约束，提交、部署、付费调用和上传分别待明确授权。

#### 2026-11-04 协作贡献与 UI-Agent 位置合同复核（当前工作区，未部署）

- 参与 Agent 聊天页读取所属用户的真实 workspace 节点贡献，按权限重新验证来源；进行中的任务约 3 秒刷新，完成后降到 15 秒，切换账号或进入后台会清除旧数据。展示范围最近 50 条并明确分页未提供。隔离 PostgreSQL 应用迁移 001–056 后，workspace service integration 22/22 通过；贡献路由定向 4/4；055/056 迁移预检 PostgreSQL 回归 1/1。临时库已删除。生产规模 P95 与多 workspace 权限复验成本尚未测量。
- 修正 UI-Agent 位置合同与 RN 实际渲染不一致：新建入口仅 `headerRight/topRight`、妙页参与入口仅 `topRight/cardFooter`、二楼返回入口仅 `headerRight`；其他固定组件暂不接受位置调整。UI-Agent 指令、共享服务端校验和测试同步。历史已保存配置仍按旧 schema 读取，不做静默重写；新的非法位置在预览阶段拒绝，历史待确认预览在确认阶段返回明确 409。
- `MIAOXUN_DOTENV_ENABLED=false ./scripts/check-repository.sh` 最终退出 0；RN 84 suites/1070 tests 通过、TypeScript/ESLint/Prettier 通过，Admin/Agents/Backend/avatar-web/media-retrieval-web 检查、测试和对应构建通过。RN 测试有 `VoiceShortcutDock` 与聊天任务读取相关 `act(...)` 警告。整仓 Backend 中需专用 PostgreSQL 环境的门控测试仍跳过，不计为通过；隔离迁移证据见本节上文。
- 当前源码 iPhone 17 / iOS 26.5 Simulator Debug 构建（`CODE_SIGNING_ALLOWED=NO`）退出 0，包含 RN bundle；有第三方依赖编译警告。仅证明构建，未安装或执行模拟器交互。线上只读 health/ready 返回 200，公开 Agent 列表仍无 `ui-agent`；这只反映线上旧版状态。
- UI 偏好其他属性仍需逐组件核对：注册合同目前接受的 `visible/order/sizeScale/icon/label` 并非每个固定组件都实际消费，不应对所有组件宣称已支持这些属性。恢复副本预检及真实设备验证前不能把配置预览等同于用户看到了对应效果。
- `docs/database.md` 已补 056 预检及锁说明：迁移中的普通 `CREATE INDEX` 会阻塞 `agent_workspace_nodes` 写入。生产前必须在备份恢复副本按真实表规模测耗时并安排停写/锁超时；空隔离库结果不能代替生产规模测量。
- 本节继续只记录本地/隔离证据：没有生产部署、提交、推送、TestFlight 上传或付费模型调用。工作区仍为 dirty detached HEAD（154 个已修改/未跟踪路径），正式 runtime 制品门禁仍会拒绝。UI-Agent 仍未在生产创建/发布 release/product、配置独立授权或取得目标用户同意；真实付费模型验收未做；`xcrun devicectl list devices` 中 iPhone 14 Pro 为 `unavailable`，不能完成实体真机验收。Build58 不含当前代码。

#### 2026-11-04 管家预览、授权竞态与协作创建修复（当前工作区，未部署）

- 管家通过严格 `ui_preference` 决策将用户已持久化原文交给 UI-Agent 生成预览；消息与预览在同一事务绑定，客户端按登录账号读取并展示前后差异，由用户确认后再应用。旧客户端、未授权、过期和版本冲突给出明确状态；原消息撤回或删除后不能读取或确认对应预览。同一输入消息只保存一条预览，但并发重试仍可能重复产生模型调用。
- 预览、确认、重置和撤销在持久化前重新检查授权与版本；产品暂停、撤权或 release 下架竞争时使用锁和可重试 409。聊天卡显示历史“曾应用”及“已撤销”，不把历史预览当作当前配置。相关入口为 `backend/src/ui-preference-service.js`、`backend/src/routes/message-routes.js`、`backend/src/routes/ui-preference-routes.js`、`MiaoxunRN/src/features/messages/UIPreferenceChatCard.tsx`。
- 修复真实协作创建失败：Worker 的 `maxConcurrent` 不再被传入只允许 `deadlineSeconds` 的 workspace 持久化 limits；并发设置仍由 Worker 使用。真实管家消息隔离 PostgreSQL 回归 28/28（UI 预览服务采用注入替身），实际 UI 授权并发 10/10，055 迁移及原消息撤回/删除验证通过；专用测试库已删除。上述竞态测试不代表对全部仓库锁序的证明。
- 最终 `MIAOXUN_DOTENV_ENABLED=false ./scripts/check-repository.sh` 退出 0，包含 RN 82 套件/1061 项、TypeScript、ESLint、Prettier、各工程测试和构建；默认整仓 PostgreSQL 门控仍有跳过，不能计作通过。RN 有既存 VoiceShortcutDock `act(...)` warning。`git diff --check` 通过。
- 当前源码以 iPhone 17 / iOS 26.5 Simulator、Debug、`CODE_SIGNING_ALLOWED=NO` 执行 `xcodebuild ... build -quiet` 退出 0，包含 RN bundle；第三方原生依赖有编译警告。此项只验证构建，未安装或执行模拟器交互，也不是签名制品或真机验收。
- 真实付费模型、线上数据和实体设备均未用于本轮验收。当前 dirty detached worktree 不满足正式 runtime 制品来源门禁；未提交、推送、部署、上传 TestFlight 或更改生产。Build58 不包含本轮后续修改，需新后端制品与新版 TestFlight 才能验收本轮代码；UI-Agent 还需正式 release/product、独立授权及用户同意。生产恢复点、迁移预检、双 Worker 和不同屏幕/无障碍设备验证仍待完成。

#### 2026-11-04 生产合同恢复与重新授权（当前工作区，未部署）

- 找回与既有发布记录对应的生产快照，恢复线上群聊、聊天附件、附件生命周期、原有 UI 偏好合同、Agent 指标与管家运行逻辑；生产 051–054 迁移文件与快照逐项校验一致，新 UI 预览迁移为 055。新版偏好保存在 `user_profiles.station_config.uiPreferences`，与生产已有 `user_ui_preferences` 合同隔离；下方较早的 `app_preferences/app_revision` 记载是当时的临时状态。
- Agent 产品授权需要重新同意且旧投影已停用时，推荐列表允许重新发起确认；弹窗期间授权状态变化会使确认失效。隔离 PostgreSQL 产品生命周期测试 9/9，覆盖旧授权重同意、范围不足拒绝与重新授权后恢复执行；RN 定向测试 41/41 和 TypeScript 通过。
- 管家 UI 调整预览正在联调：RN 已增加服务端预览卡、确认与旧客户端能力协商；确认仍由服务端授权和 CAS 控制。当前正在核对消息事务、授权撤回和产品状态切换的并发锁序；尚不能认定完整链路可发布。
- 以上均为本地或隔离数据库证据；未触碰生产或调用付费模型。Build58 不包含此后的本地修改；本轮代码仍需正式制品来源、后端部署和新版 TestFlight 后才能真机验收。

#### 2026-11-04 UI preference 本地迁移与事务复核（未部署）

- 在当前工作区保留原生产 051–054 顺序，并将本地预览表设为 055；App 扩展偏好存于 `user_ui_preferences.app_preferences/app_revision`，与既有偏好字段分开。`ui-preference-service.js` 的确认、重置和撤销统一先锁用户并在事务内重验 Agent 授权；过期预览先提交 expired 状态再返回错误。bootstrap、站点任务和 workspace 的资料查询读取同一偏好及 revision。
- 定向测试：UI preference 合同、路由、服务、存储及 workspace/site 共 50/50 通过。新建 loopback 专用 `_migration_test` 数据库实测 001–054 首次迁移、055 升级、重复迁移、confirm/reset 并发及过期状态持久化；1/1 通过，测试库已删除。授权重验单元测试使用替身，尚未完成真实产品暂停/撤权并发集成。
- 仍不能部署：当前 worktree 缺少线上 051–054 对应的完整运行时代码和旧 UI preference 合同整合；迁移文件需与生产账本校验和逐项比对。055 迁移的历史 `station_config.uiPreferences` 数据形状与超大 revision 需在生产备份恢复库做预检；不可凭此本地新库结果认定线上升级安全。生产未改动，真机和发布仍待完成。

#### 2026-11-04 当前工作区继续验证（未部署/未上传）

- 重新运行 `MIAOXUN_DOTENV_ENABLED=false ./scripts/check-repository.sh` 退出 0：Backend 1270 项中 991 通过、279 个隔离 PostgreSQL 门控跳过；Agents 51、Admin 48、avatar-web 29、media-retrieval-web 3，RN 81 套件/1054 项通过；各工程检查、构建、RN TypeScript/ESLint/Prettier 均通过。RN 仍只有既有 `VoiceShortcutDock` React `act(...)` warning，没有失败。
- UI-Agent、UI preference、动态多 Agent workspace 定向测试重新通过；`git diff --check` 通过。`./scripts/check-launch-readiness.sh` 退出 0，生产 health/ready 与数据库连接正常，保留 RDAP/public DNS 和本机 Java 不可用的 4 项 warning。
- 生产只读 `/api/agents` 当前返回 8 个已发布 Agent，过滤 `ui-agent` 为空；线上仍未包含本轮 UI-Agent release/product/entitlement 或迁移 051/API。当前 worktree 仍为 dirty detached HEAD，不能绕过 `prepare-runtime-release` 的 clean revision 门禁打包或部署。
- 本阶段没有提交、推送、生产写入、迁移、TestFlight 操作或付费模型调用。剩余工作是通过已授权运维终端完成 051/API 与 UI-Agent 发布门禁，并在实体 iPhone 14 Pro 上复验 Build58 的真机交互。

#### 2026-11-04 我页 Agent 信息与资料标签补齐（当前工作区，未部署）

- `StationProfileHeader` 现在展示由真实 `ProfileDTO` 字段生成的资料标签：公开地区、经验年限和已选语言。没有对应字段时保持空，不写入原型演示标签；标签沿用折叠详情的可访问性与隐藏行为。
- `OwnedAgentDTO.collaborationCount` 由服务端统计该用户该 Agent 的成功 `agent_runs` 与成功 `agent_workspace_nodes`，仅显示真实完成次数；等级和偏好匹配仍未建立产品合同，继续不填演示值。
- 变更入口：`MiaoxunRN/src/features/station/StationHeader.tsx`、`StationScreen.tsx`、`stationProfileStyles.ts`、`StationAgentCards.tsx`、`models/api.ts`，以及 `backend/src/repositories.js` 的 bootstrap owned Agent 查询。
- 定向验证已通过：`stationHeaderCollapse` 与 `stationModuleManagement` 12/12，RN typecheck/lint/format 通过；未部署后端、未执行迁移、未修改生产数据或 TestFlight 制品。

#### 2026-11-04 发布前验证环境恢复与 Release archive 预检（当前工作区，未部署/未上传）

- 为避免跨 checkout 依赖污染，已在当前 worktree 按 `package-lock.json` 分别执行根目录、`MiaoxunRN` 和 `backend` 的 `npm ci`；原有桌面 checkout 符号链接已移到 `/tmp/miaoxun-dependency-link-backups-20261104-1793771561/`，可恢复，未改锁文件。`MiaoxunRN` 的 CocoaPods 已按现有 `Podfile.lock` 执行 `pod install`，`Pods-MiaoxunRN.release.xcconfig` 已恢复。
- 使用真实当前依赖执行未签名 Release device archive 预检，结果 `** ARCHIVE SUCCEEDED **`。归档证据目录为 `/tmp/miaoxun-release-20261104-worktree-1793771254/`；归档内核对 `CFBundleIdentifier=com.wangruoshi.miaoxun`、`CFBundleShortVersionString=1.0`、`CFBundleVersion=54`、`MiaoxunAPIBaseURL=https://8.153.167.11`，`main.jsbundle` 5,577,908 bytes，SHA-256 `285cbf360554dda2425a1cfddd2311b2c371f25dc6a53d8d5a520f8473157413`。
- `MIAOXUN_DOTENV_ENABLED=false ./scripts/check-repository.sh` 已退出 0：Backend 1270 项（991 passed、279 个 PostgreSQL 环境门控 skipped）、Agents 51、Admin 48、avatar-web 29、media-retrieval-web 3、RN 81 套件/1053 项通过；Admin/avatar-web/media build、RN TypeScript/ESLint/Prettier 均通过。RN 仅有既存 VoiceShortcutDock 的 React `act(...)` warning，无失败；Admin Vite 仅有 chunk 大小提示。
- 本次只恢复本地验证依赖并生成未签名预检归档，没有提交、推送、生产部署、迁移 051、UI-Agent release/product/entitlement、TestFlight 上传或付费模型调用。工作区仍 dirty，正式 runtime 制品和分发归档仍必须从可定位 clean revision 生成；生产 runtime/迁移/双 Worker/备份和实体 iPhone 14 Pro 仍待后续授权与验收。
- 新建隔离数据库 `miaoxun_publish_closure_20261104_migration_test` 实际应用 51 项迁移后，Agent workspace repository 集成 32/32、service/HTTP 集成 21/21 通过；覆盖多个独立 Agent 并行领取、依赖顺序、动态 workspace、授权撤回、失败/取消/lease 和真实贡献持久化。UI preference contract/service/routes 定向 18/18 通过。测试库已删除，未触碰共享开发库或生产库。
- 继续补跑独立门控：Agent release/product/entitlement 生命周期 PostgreSQL 8/8、042 direct migration 4/4、041 workspace rounds migration 2/2 通过。rounds 首次因错误地对已完整迁移库运行“空库迁移”测试而退出，随后按契约重建空隔离库重跑通过；所有临时库已删除。
- `node scripts/prepare-runtime-release.mjs ui-preferences-20261104-build55` 按发布保护明确拒绝当前 dirty detached worktree（`Runtime releases require a clean, committed Git worktree.`）。没有绕过该门禁生成 runtime，也没有提交或推送来制造不可追溯来源。
- 在不修改 Xcode 工程文件的前提下，以 `CURRENT_PROJECT_VERSION=55` 做下一版本地 Release archive 预检，结果 `** ARCHIVE SUCCEEDED **`。证据目录 `/tmp/miaoxun-release-20261104-build55-preflight-1793772341/`；归档内确认 Bundle `com.wangruoshi.miaoxun`、版本 `1.0 (55)`、API `https://8.153.167.11`，内嵌 JS SHA-256 仍为 `285cbf360554dda2425a1cfddd2311b2c371f25dc6a53d8d5a520f8473157413`。这是未签名本地预检，不是 TestFlight 制品。

#### 2026-11-04 Metro 依赖路径诊断与临时 bundle 验证（当前工作区，未上传）

- 重新复现 Release bundle 失败后确认根因不是 `@babel/runtime` 缺文件或版本不一致：`MiaoxunRN/node_modules` 和 `MiaoxunRN/node_modules.local/node_modules` 都是指向桌面主 checkout 的符号链接，实际包为锁定的 `@babel/runtime@7.29.7`，`helpers/interopRequireDefault.js` 存在且 Node 可解析。
- Metro 0.87.1 的文件树不会把该符号链接的真实目标目录纳入 roots；把符号链接路径本身加入 `watchFolders` 会触发 TreeFS 冲突。临时 Metro 配置使用 `fs.realpathSync(node_modules)` 作为 `watchFolders` 和 `nodeModulesPaths` 后，bundle 成功生成并复制 31 个资源，证据为 `/tmp/miaoxun-metro-realpath-20261104.log`。
- 该配置只用于诊断，未写入仓库，也没有把绝对路径提交到 `metro.config.js`。正式制品仍需要在当前可定位 revision 中用 `npm ci` 生成真实依赖目录，并恢复完整 Pods 后再做 Release archive；当前 worktree 仍 dirty，不能据此上传 TestFlight。
- 继续执行 `MIAOXUN_DOTENV_ENABLED=false ./scripts/check-repository.sh` 已退出 0：Backend 1270 项（991 passed、279 个 PostgreSQL 门控 skipped）、Agents 51、Admin 48、avatar-web 29、media-retrieval-web 3、RN 81 套件/1053 项通过；日志为 `/tmp/miaoxun-repository-check-20261104-continued.log`。这证明源码和隔离验证仍通过，不改变制品来源、生产部署或真机验收边界。

#### 2026-11-04 发布前只读复核（当前工作区，未部署/未上传）

- `./scripts/check-launch-readiness.sh` 继续返回健康与就绪 200；生产只读 `https://8.153.167.11/api/health`、`/api/ready` 仍返回 200，数据库连接和迁移就绪状态正常，但这不证明当前工作区已部署。
- 当前 iOS Release 设置再次核对为 `com.wangruoshi.miaoxun`、Team `R8K5DUTWB6`、版本 `1.0 (54)`、iOS 15.1、API `https://8.153.167.11`；Xcode 26.6、CocoaPods 1.16.2。配置证据为 `/tmp/miaoxun-xcode-settings-20261104.log`。
- `npm ci --ignore-scripts --dry-run` 仅验证锁定依赖解析，不修改依赖或锁文件。当前工作区仍没有 `Pods-MiaoxunRN.release.xcconfig`，且 App Store Connect 会话、ECS Workbench 登录态和可定位 clean revision 仍未恢复，因此不生成 archive、不上传、不部署。

#### 2026-11-04 发布前审计（当前工作区，未部署/未上传）

- 公网 `https://8.153.167.11/api/health` 与 `/api/ready` 实读均为 200，ready 报告数据库已连接且迁移当前；这只能证明线上接口可用，不能证明线上已包含当前工作区代码、迁移 051 或新的并发配置。
- 生产只读 SSH（root 与 marvels）均因当前机器没有可用服务器密钥返回 `Permission denied (publickey,password)`；未触碰生产。迁移账本、实际 runtime 路径、备份/恢复点、双 Worker 状态和 `AGENT_WORKSPACE_MAX_CONCURRENT` 仍需在已有授权运维终端/FinalShell 中核对后才能部署。
- 当前工作区仍有既有未提交和未跟踪修改，`scripts/prepare-runtime-release.mjs` 按设计拒绝 dirty worktree；因此没有生成或部署未经定位来源的 runtime 制品。UI-Agent/051 的隔离 PostgreSQL 与 HTTP 证据不等于生产发布。
- TestFlight 只读准备发现本工作区 iOS 项目版本为 `1.0 (54)`；锁定 CocoaPods 依赖已由 Homebrew 提供 pod 1.16.2，`pod install --deployment` 因当前锁文件与本地生成的 ReactCodegen/Hermes checksum 不一致而停止，未改写受跟踪锁文件。App Store Connect 浏览器会话当前跳回登录页，无法在本轮读取最新构建或上传状态；TestFlight 授权仍保留，但需要重新登录后才能继续账号级操作。
- 本轮只更新运维文档中的历史并发说明，明确 037 的“并发 2 / SKIP LOCKED”不代表当前动态 1–20、默认 4 合同；未提交、未推送、未部署、未调用付费供应商。

#### 2026-11-04 生产 Agent 目录只读核对（当前工作区，未部署）

- 生产 `GET /api/agents` 与后台 Agent 发布目录均未发现 `ui-agent`；后台搜索 `ui-agent` 返回“暂无 Agent release”，产品目录也没有对应 UI-Agent 产品。线上现有目录与当前工作区注册状态不同，不能把本地注册文件当成已上线能力。
- 生产后台监控当前显示 0 次运行、0 个 Agent、0 个任务；系统配置页没有暴露 Worker、备份或并发上限，因此仍不能据此确认迁移 051、双 Worker、`AGENT_WORKSPACE_MAX_CONCURRENT` 或恢复点。
- 本次只读核对未执行任何发布、产品、entitlement、consent 或数据写入。下一步仍需在 ECS Workbench 重连后核对 runtime、迁移账本、Worker 与备份，再按单独授权发布 UI-Agent；目标用户 consent 必须由用户本人在 App 内完成。

#### 2026-11-04 iOS 制品编译边界复核（当前工作区，未上传）

- 直接使用 worktree 的 Pods 执行 Release device build 失败，因为 `MiaoxunRN/ios/Pods/Target Support Files/Pods-MiaoxunRN/Pods-MiaoxunRN.release.xcconfig` 不存在；`MiaoxunRN/node_modules` 和 `node_modules.local/node_modules` 仍指向桌面主 checkout，不能把另一 checkout 的依赖目录当成当前制品来源。
- 用同一 `Podfile.lock` 对应的完整 Pods 做可逆编译探针后，原生 targets 可继续编译，但 React Native bundle 又因当前依赖目录缺少 `@babel/runtime/helpers/interopRequireDefault` 失败。探针结束后已恢复 worktree 原有 Pods，未改写锁文件、依赖或业务源码。
- 该结果进一步确认 TestFlight 不能从当前环境直接生成可追溯制品；需要先恢复当前 worktree 的锁定依赖，再由可定位的 clean revision 生成 Build 号递增的 archive。

#### 2026-11-04 UI-Agent readiness 与隔离发布链路回归（当前工作区，未部署）

- 修复真实发布阻塞：`agents/ui-agent.agent.js` 已注册，但 `backend/src/agent-readiness-service.js` 原先没有 `ui-agent` 条目，导致发布服务读取到未定义 readiness 并返回 `AGENT_NOT_READY`。现在 UI-Agent 与其他模型 Agent 复用 `NEW_API_BASE_URL`、`NEW_API_KEY`、`NEW_API_MODEL` 门槛，并声明 `ui_preference_preview` 能力；未配置模型时继续显式不可发布。
- `backend/test/agent-readiness.test.js` 新增 UI-Agent 的 provider 未配置、provider 已配置和能力声明回归；定向 readiness、publishing service、registry 测试通过。
- 在一次性 loopback `miaoxun_ui_agent_20261104_migration_test` 中实际应用迁移 001–051，并将 HTTP publishing integration 的目标临时切换为真实 `ui-agent` 注册项：registry 只读、release draft/review/published、身份 revision、product create/submit/publish、显式 consent/idempotency、bootstrap/sync、`user_agents` 投影、撤权与版本升级门禁全部通过；临时数据库和脚本副本已清理。
- 本节只证明当前工作区和隔离环境的发布合同；尚未创建/发布生产 UI-Agent release/product、尚未给目标生产账号写入 consent、尚未部署后端或迁移 051、尚未上传 TestFlight，也未调用付费模型。

#### 2026-11-04 发布前验证环境恢复与制品回归（当前工作区，未部署）

- 按计划恢复根目录、Agents、Admin、avatar-web 和 media-retrieval-web 的锁定依赖；没有修改业务依赖版本，也没有调用供应商。整仓 `MIAOXUN_DOTENV_ENABLED=false ./scripts/check-repository.sh` 现已退出 0：Backend 1270 项中 991 通过、279 个 PostgreSQL 环境门控跳过；Agents 51、Admin 48、avatar-web 29、media-retrieval-web 3、RN 81 套件/1053 项通过；Admin/avatar-web/media build、RN TypeScript/ESLint/Prettier 均通过。
- 根 lint 暴露并修复共享 UI 合同的运行时全局声明：`eslint.config.cjs` 为 `shared/**/*.js` 声明 Node/Web API globals；运行时制品回归暴露并修复 `scripts/prepare-runtime-release.mjs` 未打包 `shared/ui-preferences.js` 的真实遗漏，新增断言后发布制品测试 1/1 通过。`git diff --check` 通过。
- 全新 loopback 数据库 `miaoxun_ui_preferences_20261104_migration_test` 已实际执行迁移 001–051（51 applied），确认 `ui_preference_previews` 存在后删除测试库；共享开发库和生产库未触碰。
- 这一步已完成；后续仍按计划进入 UI-Agent release/product/entitlement 与正式 API 的发布前审查。当前未部署后端、未发布 UI-Agent、未上传 TestFlight、未调用付费供应商。

#### 2026-11-04 动态多 Agent 任务图与并发边界（当前工作区，未部署）

- 后端协作计划继续由协调 Agent 返回真实 `steps` 决定参与数量，任务图最多保存 20 个节点；仓储领取只放行依赖全部为 `succeeded` 的节点，因此无依赖节点可并行，有依赖节点按图顺序执行，不固定为两个 Agent。
- `AGENT_WORKSPACE_MAX_CONCURRENT` 默认保持 4，但显式配置范围扩展为 1–20；Worker 仍有明确并发上限，超过上限的真实节点分批领取，不把参与数量静默截断或伪造成已执行。
- 新增计划回归覆盖 1/2/3/4 个动态参与数、20 个独立节点上限，以及 4 个独立 specialist 加 1 个依赖 synthesis；配置/runner 回归同步覆盖 20 并发上限。当前 workspace/plan/runner/routes 定向 66/66 通过，相关源码语法通过。
- 本轮可运行验证：Backend 全量 1269 项中 990 通过、0 失败、279 个 PostgreSQL 环境门控跳过；RN 协作/妙页/UI 定向 26/26，TypeScript 与 Prettier 通过，`git diff --check` 通过。新增隔离 PostgreSQL 迁移 051 后 workspace 集成 32/32 通过，覆盖同一 workspace 的两个独立节点并行领取、真实 Runner 并发、依赖顺序、失败/取消/lease/未知结果；修复聚合锁查询的 `SKIP LOCKED`，避免第二个 Worker 因同一 workspace 行被跳过而无法领取第二个独立节点。测试库和临时 PG 已清理。
- Agent 全量与根整仓依赖已恢复；默认整仓 PostgreSQL 门控仍按约定跳过，必须由隔离 `_migration_test` 运行器单独覆盖，不能把 skipped 记作通过。
- 当前未部署后端、未启用新并发配置、未上传 TestFlight；需在隔离 PostgreSQL 与真机上继续验证真实授权、失败/部分完成/取消和妙页参与列表。

#### 2026-11-04 UI 偏好预览基线与撤销收口（当前工作区，未部署）

- UI 偏好预览现在由服务端返回并持久化 `beforePreferences` 基线快照；RN 预览卡从服务端快照展示真实“调整前 → 调整后”值，避免请求期间会话 revision 变化时显示过期本地值。对比覆盖 token、按钮/组件槽位与顺序、模块显隐/顺序和四条注册手势。
- 确认会在同一事务保存确认前快照与 `confirmed_revision`；新增受同一合同头保护的 `POST /api/ui/preferences/undo`，携带当前 `baseRevision`，用 CAS 恢复最近一次尚未撤销的确认、递增 revision、标记 `undone_at` 并写入 `ui.preferences.undo` 审计。重复撤销、无快照、授权撤回和版本冲突显式失败。迁移051同时兼容已有开发表结构。
- RN `useMiaoxunSession`、`uiPreferencesApi`、全屏设置和二楼设置均已接入撤销入口；恢复默认与撤销上一次确认是两个独立操作，预览仍需用户明确确认后才写入。
- 新鲜验证：后端 UI preference contract/routes/service 18/18 通过；RN UI diff/contract/API 35/35 通过，RN TypeScript 与 Prettier 通过，后端相关源码 `node --check` 通过；随后整仓检查和完整 RN 回归已通过，迁移 001–051 已在隔离库实际应用。当前未部署后端、未发布 UI-Agent、未上传 TestFlight、未调用付费模型。

#### 2026-11-04 P2/P3 合同收口（当前工作区，未部署）

- UI 偏好合同补充四条固定手势的动作绑定校验：`messages.pullToSecondFloor` 只能绑定 `openSecondFloor`，`secondFloor.swipeToExit` 只能绑定 `goBack`，妙页参与/详情手势分别只能绑定对应动作；RN `UIPreferencePreviewDTO.status` 同步包含 `reset`。未知组件、动作、任意坐标、代码和越界值仍在共享合同层拒绝。
- 页面语义 Token 已补充有界 `buttonScale`（0.8–1.3），共享合同、RN DTO/默认偏好与 `ui-agent` 输出约束保持一致；讯页新建、妙页参与 Agent 操作、二楼相册/文件上传入口会消费该值，并与组件级 `sizeScale` 相乘。
- RN 已消费二楼相册/文件上传组件的可见性、标签、图标、尺寸和固定槽位；妙页卡片消费参与/详情手势的 enabled、direction、distance、velocityThreshold、animationMs，隐藏对应组件时入口同步禁用。新增回归覆盖手势阈值、隐藏组件和 UI 合同，二楼定向 39/39，UI/Miao 定向 14/14。
- P2 真实能力边界保持显式：相册、拍摄、文件和位置通过真实 picker、上传、定位与后端引用进入聊天；联系人、任务、文件库和创建群聊当前没有完整后端合同，App 显示明确“暂未接通/未开放”，不伪造成功。语音点按、长按、权限和识别确认沿现有 Speech bridge 真实链路执行；Agent 重授权仍经过当前产品版本、范围和 consent 校验。
- 当前验证：上一阶段的按钮尺寸、P0–P2 和 UI 合同回归已通过；本轮新增的 UI 偏好基线/撤销定向结果见上方；整仓检查、Agents 套件和迁移 051 隔离应用已完成。UI-Agent release/product entitlement、后端部署、真实模型和 TestFlight 均未执行。

#### 2026-11-03 P0 讯页与二楼交互收口（当前工作区，未部署）

- 移除讯页顶部“下拉进入二楼”文字提示，保留真实下拉手势并缩短进入动画；二楼相册只保留上传/新建入口，删除连接手机相册卡片；文件页删除 App 生成文件/Agent 成果区域及 workspace 回调；文件详情阅读不会把纵向滑动误判为退出二楼。
- 定向验证：二楼、文件、相册和工作区导航回归 4 套件 83 项通过；加入妙页状态、聊天贡献、UI 合同后最终为 8 套件 118 项通过。未做实体真机手感验收。

#### 2026-11-03 UI-AI 偏好架构与 UI Agent（当前工作区，未部署）

- 新增 `shared/ui-preferences.js` 作为后端与 RN 共用的严格偏好合同：密度、字号、页面 token、固定模块顺序、按钮槽位、隐藏模块和妙/讯二楼手势均有白名单与边界；UI Agent 只生成 JSON 补丁，禁止模型输出或执行 CSS、React、Swift、JavaScript、URL 和任意组件代码。
- 新增 `agents/ui-agent.agent.js`，运行时通过现有 registry/catalogue/产品 entitlement 链路接入。代码注册不代表可用；仍需迁移051、Agent release、产品版本依赖、用户 consent 和匹配 RN 合同头后才能执行。
- 新增 `backend/database/051_ui_preference_previews.sql` 与 `backend/src/ui-preference-service.js`：预览有效10分钟，绑定用户和基准 revision；确认在事务内锁定预览/资料、重新校验授权与补丁并递增 revision，重置恢复默认并使 pending 预览失效，过期/重复/竞争均明确返回错误。最终配置写入 `user_profiles.station_config.uiPreferences`，不走通用站点配置 PATCH。
- 新增受合同头 `X-Miaoxun-UI-Preferences: 1` 保护的 `POST /api/ui/preferences/preview|confirm|reset|undo`，以及后端服务、注册路由、schema、profile mapper、审计事件和 Agent 合同测试。后端服务级测试覆盖预览、非法模型 JSON、未发布/未授权 Agent、确认、过期、revision 冲突、重置和最近一次确认撤销。
- 本阶段验证：UI 偏好合同/路由/服务共 12 项通过；`node scripts/check-source-syntax.mjs backend/src backend/test agents shared` 通过（当前文件集）；根整仓检查尚未重跑，RN 合同头与 UI 渲染、后台 Agent release/product 发布、迁移应用、真实模型和真机视觉验收仍未完成。当前未部署后端、未上传 TestFlight、未调用付费模型。
- RN 已接入 `/api/ui/preferences/preview|confirm|reset|undo`，请求带 `X-Miaoxun-UI-Preferences: 1` 并校验 bootstrap 合同；会话从 bootstrap 消费真实 `uiPreferences/revision`，设置页和二楼设置提供预览、应用、撤销预览、撤销上一次确认与恢复默认入口。讯页下拉和二楼上滑阈值、妙页协作卡圆角已消费已确认配置；组件槽位、显隐、按钮文案/图标和全部手势动作仍需逐页接入，当前不能宣称 P3 全部完成。
- 最终定向证据：RN 8 套件 118/118 通过，RN typecheck、定向 ESLint（0 errors，保留现有 warning）、Prettier 和 `git diff --check` 通过；backend `npm test` 1257 项中 978 通过、0 失败、279 项 PostgreSQL 环境门控跳过；UI/Agent 合同与服务测试 16/16、源码语法 387 文件通过。`./scripts/check-repository.sh` 在仓库 lint 阶段因当前工作树未安装 `eslint` 退出127，不能记为整仓通过。

#### 2026-11-03 妙页协作卡片三态与 Agent 并发修复（当前工作区，未部署）

- 妙页协作卡片按设计 PDF 实现 S0 摘要、右滑 S1 参与 Agent、左滑 S2 当前结果详情；S1/S2 反向滑动返回 S0，卡片横向手势增加 capture、230ms 内容转场和回弹动画，且在转场短暂抑制点按，避免 `Pressable`/`FlatList` 抢走真机滑动。
- S1 只读取当前轮 `agent_workspace_nodes` 的真实节点摘要，按 Agent 合并重复节点，隐藏重复头像条，补充职责、最近结果和更新时间；单个 Agent 的“详情”打开底部详情面板，不伪造或写入 Agent 私聊消息。S2 只保留当前卡片的一条成果标题和最多三行摘要，不在展开态跳转大协作详情页；完整工作空间仍从 S0 的明确打开动作进入。
- 参与 Agent 的聊天页增加只读 `WorkspaceContributionCard`：从真实 workspace step 展示目标、状态、摘要和成果标题，放在聊天时间线底部，避免被自动滚到底部逻辑推到列表头部；不写入 `chat_messages`，从 S1 详情底部操作进入对应 Agent 会话。
- 协作 Worker 的独立节点并发上限改为显式 `AGENT_WORKSPACE_MAX_CONCURRENT`，默认 4、合法范围 1–20；有依赖的节点仍按依赖顺序执行。配置样例、测试和 `docs/ai-interaction-system.md` 已同步。
- 验证：RN 定向协作/聊天/妙页测试 87/87、RN TypeScript、相关 ESLint、Prettier、后端 workspace/worker/routes 16/16、后端源码语法363个文件、`node --check` 和 `git diff --check` 通过；另有需 `RUN_AGENT_WORKSPACE_INTEGRATION=1` 的真实 PG barrier 测试，验证独立节点可同时领取和执行。最后一次 `MIAOXUN_DOTENV_ENABLED=false ./scripts/check-repository.sh` 已执行：backend 1245 项中 966 通过、0 失败、279 个PG环境门控跳过；agents 阶段因工作树未安装 `ajv` 而停止，不能宣称整仓通过。测试使用主工作区依赖的临时只读链接，未安装新包。
- 当前仅完成源码修复和本地验证，未部署后端、未上传 TestFlight；需要实体真机复验 S0/S1/S2 的手势手感和底部详情层后再进入发布流程。

#### 2026-11-02 后台响应式、运营动作与新版部署（已部署，窄屏导航补修中）

- 用户本轮明确授权修复自适应和后台操作后部署新版，并确认允许在独立发布 worktree 创建一次仅本地源码快照；主工作区不提交、不推送。发布候选 worktree 为 `/Users/gary/.codex/worktrees/admin-lifecycle-release/marvelsChat`，此前发布快照与所有未提交修改保留。
- 固定后台 shell 的视口高度，主内容区、侧栏与长表格各有明确滚动边界；同时适配无 `scroll.y` 的表格、固定表头、窄屏筛选与抽屉、用户表格横向滚动。真实浏览器在 1440×900 和 390×844 对发布、产品、任务、审计、监控、用户六模块做 100 行 DOM 压力夹具与每项 50 轮滚动：旧发布表页面高度分别 8652/8922，新布局始终为 900/844，滚动前后内容高度稳定且表底/分页可达。压力数据仅浏览器 DOM，不写 API/数据库，不作为生产数据。证据 `/tmp/miaoxun-responsive-ui-20261102/http-ui.log`。
- 新增精确产品版本 pause→幂等重放→resume→重新 consent 的真实 HTTP 验收：暂停后 entitlement unavailable、user_agents 移除，其他仍有效版本保留；恢复发布不自动恢复用户授权。普通用户/只读管理员发布与暂停均 403，遗漏 productVersionId 为 400。001–050 首次及重复迁移、发布 HTTP/通用 API HTTP 均通过，专库已清理；证据 `/tmp/miaoxun-admin-actions-http-20261102.log`。
- 修复审计页顶栏“刷新”空操作，使其重新请求真实列表并保留筛选；运营表格按真实资源键标识行，不依赖已弃用的 index 参数；用户表单改用当前 Ant Design destroyOnHidden。
- 发布前只读生产确认：旧 runtime 仍为 operations-r2、48 迁移，API/双 Worker active；049/050 待应用。现有每产品仅一个版本，050 展示快照回填不改变既有合同 hash/consent。Build54 图片合同门禁继续 false；新头像存储随 backend/storage 同步。迁移后旧 runtime 不再满足严格 ledger/新版本写入，维护窗口开放新写入后应前向修复；不能仅切旧 runtime 或旧 dump 覆盖新增数据。
- 已按本轮授权部署 `admin-console-20261102-lifecycle`：独立发布 worktree 本地快照 `6a0811fa13157c51826faf4dc250f80b63a6ea0c`，sourceTree `ac6bd6cd18984c36410b18144a9b53642fd75c9e`，制品 SHA-256 `8d119fae3b4c8e8f067f370728a9daac2ccb97b601934c041d2b4b95d042ea43`。服务器 262/262 清单摘要通过，Linux 锁文件安装、官方 registry 生产审计 0 vulnerabilities，服务用户实际加载 sharp/pg 通过；主目录 HEAD 和已有修改保留，无推送。
- 正式维护窗口 2026-11-02 12:48:48–12:49:01 CST。停 API/双 Worker、应用连接归零并再次确认无排队/运行任务后生成新 dump；实际恢复到相同 owner/UTF8/libc/en_US.UTF-8 隔离库，68 张表完整数据摘要、逻辑列/owner/实际 ACL/约束及 7 条序列匹配。候选库和生产库均 `2 applied / 48 unchanged`，重复回放均 `0 applied / 50 unchanged`；产品/release/hash、26 项 entitlement（7 enabled）和 user_agents 不变。新头像表备份角色 SELECT 及完整 pg_dump 探针通过。恢复库已删除。
- 首次维护在迁移前因恢复校验脚本误比较物理列号/等价数组 cast 表示而中止，旧服务和 48 项账本已恢复；修正逻辑列顺序、ACL 排序、固定序列化及纯常量 ANY 数组 cast 的精确等价规范后，全量数据比对通过，没有豁免会话/心跳或任何业务表。两次证据均保留，不能将首次中止写为迁移失败或数据丢失。
- 停写恢复点与隔离迁移/生产迁移报告位于服务器 root-only `/opt/projects/marvels-chat/backups/admin-console-20261102-lifecycle-r2/`；本地部署日志 `/tmp/miaoxun-admin-lifecycle-deploy-final-20261102.log`、生产核对 `/tmp/miaoxun-admin-lifecycle-production-verification-20261102.log`。API/双 Worker 同源 active/NRestarts=0，公网严格 TLS health/ready 200，Nginx 仅两处后台 img-src 增加 blob:，备份 timer active。
- 正式后台九模块已逐项只读打开、无 error Alert/控制台错误，1710×875 页面高度/宽度均为视口；产品版本详情与产品/Agent 草稿表单可打开，没有对真实产品执行发布/暂停或为真实用户修改授权。390×844 复验发现侧栏 zero-width trigger 被外层 overflow 裁掉，已把滚动移入 sider children，并在 lg 以下固定覆盖主区。隔离 390×520 实际展开→任务→审计→产品→收起、导航独立滚动与 1440×450 短高侧栏均通过；展开不改变主区宽度。补修证据 `/tmp/miaoxun-sidebar-ui-run-20261102-final.log`，生产补修制品与最终核验另记。

- 本轮最终源码整仓复核 `MIAOXUN_DOTENV_ENABLED=false ./scripts/check-repository.sh` 退出 0，完整日志 `/tmp/miaoxun-repository-check-20261102-production-final.log`；RN 77 suites/1024 tests、Admin 48 tests/build、全部工程静态/单测/构建通过。默认 PG 门控仍有 277 skipped，已有独立 32 套/348 项全通过证据，二者分别记录。`git diff --check` 通过。

#### 2026-11-02 代码 Agent 接入、身份配置与产品版本（本轮源码，尚未生产发布）

- 用户明确选择先完善已有代码 Agent 的接入、配置和上架；不新增在线提示词平台。唯一后台继续使用 React / Refine / Ant Design。开发负责运行能力与部署，后台负责创建草稿、展示身份、审核 release 和发布产品；供应商 API Key 仍由服务端受限配置，Agent key 不等于密钥。
- 新增只读实际 registry 与显式 Agent 草稿创建；列表 GET 不再同步建草稿。后台可改名称、简介、颜色、shape、mark，并从已发布 release 创建同运行版本身份修订；review 可退回，历史已发布身份不能编辑。提交/发布检查实际 runtime、当前配置、合同与并发 hash；创建/编辑有幂等与审计。
- 新增受管头像上传、认证草稿预览、发布后公共读取；真实解码 PNG/JPEG/WebP（2 MB、64–4096 像素、单帧），重编码去元数据 512×512 WebP，SHA-256 与数据库记录核验。统一 shared/API/RN/Admin 的 agent-image 合同；图片失败显式报错，不回退标记。049 保存资源及目录图片投影；持久化 `MIAOXUN_AGENT_AVATAR_ROOT` 默认 `backend/storage/agent-avatars`。后台 CSP 图片预览增加 blob:，不放宽脚本规则。
- Build54 不支持图片身份，`AGENT_IMAGE_PUBLICATION_ENABLED` 缺省 false；可上传编辑草稿，图片身份审核/发布被服务端明确阻止。配套 RN 通过本地验证后仍需真实设备与分发，不能直接在生产开启门禁。
- 产品 JSON 编辑器已改结构化表单，支持新产品、草稿编辑、新增版本、版本选择、精确版本历史/授权汇总。050 为产品版本保存名称、简介和 identity 快照；一次性回填后所有写入显式提供。新 draft 不遮蔽正式版，发布不迁移 consent；App 确认绑定看到的 productVersionId，旧用户保持仍有效旧合同。显式升级事务重建新旧依赖并集，清理被移除 Agent 的授权和生命周期投影。
- 后台登录、侧栏和 favicon 复用正式 iOS AppIcon（原样复制），不改用户头像或原生资产。Ant Design 5 对 React 19 使用公开 render adapter，发布页使用上下文 modal/message。
- 账户详情改运营安全 DTO，默认 SQL 不读取消息正文/自定义会话标题；响应白名单不带 lastContent、用户/供应商原文、审计任意 payload。详情乱序、关闭、失败与 ID 错配不会复开旧账号，错误保留 request ID。普通客户端 `/api/events` 禁止写入 admin 保留命名空间冒充管理审计。
- 完整流程与边界见 [代码 Agent 接入与上架](../agent-onboarding.md)；其它模块的真实运营差距见 [本轮审查](../reviews/2026-11-02-admin-operational-gaps.md)。监控大屏/告警、任务真实分页、媒体完整运行管理和跨模块联查仍不等于完成。
- 本轮验证已收口：001–050 首次及重复回放、真实发布 HTTP 图片/修订/多版本/旧授权保留与显式升级、后台浏览器流程、执行授权门禁和账号注销回归均有新鲜证据。32 个隔离 PostgreSQL 套件共 348 项通过（0 failed、0 skipped），另有发布 HTTP 与通用 API HTTP 集成通过；执行门禁另外覆盖 134 项，产品发布生命周期 8 项，账号授权删除 1 项，全部通过。普通 Agent 在消息提交、模型前、工具/provider 前、结果写入、历史结果和任务续作均重新核验精确 productVersion/release/version/scopes/consent；默认管家仍仅保留明确系统初始化特例。账号删除会在事务中锁定并清理本人 entitlement history、entitlement 和 user_agents 投影，保留其他用户授权及产品/release 审计历史。整仓最终检查仍需以本次最后修改后的完整输出为准。
- 最终整仓检查已完成：`MIAOXUN_DOTENV_ENABLED=false ./scripts/check-repository.sh` 退出 0，日志为 `/tmp/miaoxun-repository-check-20261102-agent-lifecycle-final2.log`；RN 77 suites/1024 tests、Admin 48 tests/build、backend syntax 363 files、lint、各工程检查均通过。默认整仓仍报告 277 个 PostgreSQL 环境门控 skipped；它们已在本轮独立 loopback runner 中由 32 个套件覆盖并全部通过，不能把默认 skip 计作整仓内置执行。
- 工作仍在 `/Users/gary/Desktop/myproject/marvelsChat` 原分支与未提交修改上推进；未 reset/clean、未提交/推送、未部署本轮生产、未上传 TestFlight、未调用付费模型。旧发布 worktree 与历史资产均保留。

#### 2026-11-02 后台运营控制台完善与生产替换（已完成本轮发布）

- 已完成后台 React 入口的第二轮运营化改造：侧栏按工作台、账户中心、发布中心、运营中心、系统中心分组；资源子导航同步当前工作域；保留每个模块独立 URL、权限过滤和响应式布局。
- 工作台现在并行读取真实 `/api/admin/overview`、待审核 Agent release 和运行中任务，显示指标、趋势、待办表格、数据来源和部分读取错误；指标卡只作摘要，管理数据通过表格进入资源模块。
- 任务中心新增 `GET /api/admin/tasks/:taskId` 只读详情接口，仅返回 AI task 或 Agent workspace 的状态元数据、格式受限的失败代码及最多 200 条事件/节点；不返回用户输入、目标正文、审批内容或供应商原始错误。`eventKind` 明确区分状态事件和节点当前状态，`eventsTruncated` 标明截断；接口受 `tasks:read` 保护，不改变用户 consent 或执行权限。
- 清理了 React 入口中未使用的旧总览/用户/发布/分页实现，避免两套前端逻辑继续漂移；历史原生后台文件仍保留为审计资产，没有删除或覆盖。
- 新增设计与实施记录：`docs/superpowers/specs/2026-11-02-admin-operations-console-completion-design.md`、`docs/superpowers/plans/2026-11-02-admin-operations-console-completion-plan.md`。
- 已补充 `GET /api/admin/agent-releases/:id` 和 `GET /api/admin/products/:id`：详情返回状态历史、关联产品/Agent、产品 entitlement 状态汇总；发布中心详情抽屉已展示这些真实关联数据。服务配置页继续只读脱敏状态，不自动触发供应商连通测试。
- 发布审查补强：任务按钮由服务端 `allowedOperations` 和前端权限共同控制；工作台请求和二级导航按资源权限过滤；release 关联产品按 `products:read` 裁剪并统一 camelCase；详情校验 UUID，错误时不冒充零/空记录，抽屉按 ID 隔离旧状态；模块错误边界保留导航，顶栏显示实际 API host。现有 release 列表 GET 会同步 registry，验收须与纯只读详情区分。
- 首次候选暂存时，官方 npm 最新审计发现既有 body-parser/Zod 高危漏洞和 qs 中危漏洞，未切换生产；已升级 Express 4.22.3、body-parser 1.20.9、qs 6.17.1、Zod 4.6.7，审计为 0 vulnerabilities。Zod 兼容修复保留 avatar 内部默认版本、日记/相册 PATCH 不注入创建默认值和空 PATCH 拒绝，校验错误保持脱敏 400；补压缩 JSON 正常/非法尾随/解压超限回归。新候选已完成隔离 PostgreSQL、HTTP 和整仓复验，并按本轮明确授权切换。
- 最终代码验证：`MIAOXUN_DOTENV_ENABLED=false ./scripts/check-repository.sh` 退出 0，日志 `/tmp/miaoxun-repository-check-20261102-admin-security.log`：backend 1207 项（938 passed、269 个默认 PostgreSQL 环境门控 skipped、0 failed），RN 76 suites/1008 tests，Agent 50，Admin 39，avatar-web 29，media-retrieval-web 3；各构建、静态检查和 diff-check 通过。收尾同命令完整输出记录于 `/tmp/miaoxun-repository-check-20261102-admin-production-final.log`。
- 隔离 PostgreSQL 18 扩展验收：30 suites、333 tests 全部 passed，0 failed/0 skipped；同一专库依次完成 48 项首次迁移、48 项重复回放、`npm --prefix backend run test:agent-publishing`、`npm --prefix backend run test:api-integration`。汇总 `/tmp/miaoxun-postgres-gates-security-20261102.log`，分项 `/tmp/miaoxun-pg-gates-security-20261102/`。已清理本轮专库、集群、容器和监听。初轮失败证据保留：迁移测试按随机 UUID 排序却固定数组下标，现已按草稿 ID 定位且不放宽断言；API 空库缺显式管家初始化，CI 已补发布链路→API 的正确顺序，没有注册 fallback。
- 实际浏览器隔离验收：九模块连续切换、三类详情抽屉、深链刷新和受限管理员工作台均通过；无白屏、pageerror 或失败 API。日志 `/tmp/miaoxun-admin-ui-20261102.log`。此处使用真实隔离 API/数据库，非 mock 数据。
- 生产运行已从 `admin-console-20261030-blank-fix2` 原子切换到 `/opt/projects/marvels-chat/releases/admin-console-20261102-operations-r2/runtime`。发布来源为独立 clean worktree 快照提交 `b8b3c7692dbd32411362847dd08aeae5b528a6fe`，归档 SHA-256 `db90b41caaf5b86a1246b1a37e60f746036922133eeda82a2691a5a2aeb2e77d`；manifest 256/256 哈希一致、`includesWorkingTreeChanges=false`。主工作区仍为原 HEAD `ca9925dfc72f6de694a024020a52a9661f1c92de`，保留全部未提交修改，未提交主工作区或推送。
- 维护窗口 2026-11-02 10:34:54–10:34:57 CST（API 503/Retry-After），停止 API/两个 Worker 后同步既有 storage，环境文件逐字一致，生产权限加固完成；本轮无数据库迁移，账本仍 48。Nginx 原配置已恢复，代码 root 只读、环境 root:marvels 0640。Linux 锁文件安装和官方生产依赖 audit 为 0 vulnerabilities。阶段日志：`/tmp/miaoxun-admin-stage-security-20261102.log`、`/tmp/miaoxun-admin-deploy-20261102.log`。
- 正式 Chrome 原登录态完成九模块连续切换，账号详情、release 发布历史/关联产品、产品依赖/授权统计/状态历史、workspace 任务详情及产品深链刷新均通过，console error 为 0。对应后台 API 返回 200/304；访问 release 列表执行了其既有 registry 同步，未执行发布、暂停、撤权、任务重试/取消或模型供应商测试。服务端另有一条浏览器 `/favicon.ico` 404，与后台 API 无关。生产截图 `output/playwright/miaoxun-admin-production-20261102.png`。
- 生产只读复核 `/tmp/miaoxun-admin-production-verification-20261102.log`：公网 health/ready/admin 深链 200、安全头和 no-cache 完整；API/两个 Worker active、NRestarts=0，实际进程 cwd 均指向同一新 runtime；AI 两条队列轮询推进，媒体 Worker ready 心跳正常，备份 timer active。未部署移动端、上传 TestFlight 或调用付费模型。
- 回滚保留旧 runtime `admin-console-20261030-blank-fix2/runtime`；配置备份位于 `/opt/projects/marvels-chat/backups/admin-console-20261102-operations-r2/nginx.conf.before`。同 schema 回滚需维护停写、同步最新 storage、整体切回三个服务再验 health/ready；禁止恢复旧 dump 覆盖新写入。首次被依赖审计拦住的未激活候选 `admin-console-20261102-operations` 也保留，没有清理历史资产。

#### 2026-11-02 下一阶段执行顺序

- 用户可直接查看正式后台 `https://8.153.167.11/admin/`；本轮后台替换和真实数据冒烟已完成。后续运营增强按需求继续：任务列表的真实翻页（当前 limit 最大 200）、监控大屏/告警闭环、完整跨模块跳转及统一 request ID 交互尚未全部实现，不能把当前聚合表称作完整告警平台。
- 由负责人在 TestFlight Build54 的实体 iPhone 14 Pro 上复验：二楼落地和各子页上滑退出、讯页双 Tab/新建/搜索/返回、妙页和讯页长按菜单、语音入口与识别卡、我页 Agent 卡片/折叠恢复/头像、聊天/任务详情、输入框和提示条滑动。模拟器、组件测试和本次后台部署不能替代此步骤。
- 默认整仓仍保留环境门控 skip；本轮独立 333 项数据库验证已有新鲜证据，后续改动按影响范围复跑，无须把已完成组重新记为未验证。继续保留各组日志，数据库资源仅按确切归属清理。
- 生产发布/暂停/撤权/密码重置等运营写操作仍需明确具体范围；本次验收没有以真实用户写入或供应商调用代替测试。工作区继续保留，未推送；不自行上传 TestFlight 或部署移动端。

#### 2026-10-30 正式后台切换模块白屏已修复

- 根因是 `admin/src/ResourcesPage.jsx` 的总览页把会返回 Promise 的 `load` 直接传给 `useEffect(load, [])`。React 19 在切换侧边栏卸载总览页时把该 Promise 当作清理函数，抛出 `destroy is not a function`，导致整个 `admin-root` 变空白；这不是 API 数据缺失或权限绕过。
- 已改为 `useEffect(() => { load(); }, [])`，并新增 `admin/test/react-effect-contract.test.js` 防止再次把 Promise 返回值当作 React cleanup。另将 `admin/src/platform.js` 的 `readAuth()` 规范为始终返回对象，避免旧标签把 JSON `null` 当作认证对象时在用户、任务或运营页访问 `.user` 崩溃；`admin/test/platform-session.test.js` 覆盖该状态。修复前本地真实 Vite/React 页面可复现 `destroy is not a function`，修复后 Admin 33/33 通过、构建通过。
- 最终正式环境制品 `admin-console-20261030-blank-fix2` 已由隔离 clean worktree 临时提交 `e6ebf1372eab91752532a0338c6560aeb219f5c3` 生成，归档 SHA-256 为 `e72fd38e7384aff5c1eeadf491339b2c585e86eb1138c969d7a18c3db0371f29`；运行 manifest 256 文件、`includesWorkingTreeChanges=false`。上一份 `admin-console-20261030-blank-fix` 和原 `admin-console-20261030-fixed` runtime 均保留未删除。
- 线上 `app` 已原子切换到 `/opt/projects/marvels-chat/releases/admin-console-20261030-blank-fix2/runtime`，保留原有 storage/env 并完成生产权限加固；Nginx 配置检查和 reload 通过。backend、AI Task Worker、media retrieval Worker、Nginx 均 active，公网 `/api/health`、`/api/ready` 均 200，数据库迁移账本保持 current。
- 使用同一正式 Chrome 登录态复验最终制品侧边栏九个模块：运营总览、用户与权限、Agent 发布、产品目录、任务管理、运行监控、媒体检索、审计记录、服务配置，均等待到对应标题且 `blank=false`；最终复验窗口没有新增 console error/warning。用户刷新正式后台后即可继续使用。
- 最终整仓命令 `MIAOXUN_DOTENV_ENABLED=false ./scripts/check-repository.sh` 退出 0，完整输出记录于 `/tmp/miaoxun-repository-check-20261030-admin-blank-fix-final.log`：backend 1192 项（923 passed、269 个 PostgreSQL 环境门控 skipped、0 failed），agents 50、Admin 33、avatar-web 29、media-retrieval-web 3，RN 76 suites / 1008 tests；各构建、RN format/lint/typecheck 和 `git diff --check` 均通过。

#### 2026-10-30 正式环境后台替换已完成

- 线上 `/admin/` 已从旧 `agent-catalog-admin-20261029` 原子切换到 `/opt/projects/marvels-chat/releases/admin-console-20261030-fixed/runtime`；旧 runtime 保留作为回滚候选，没有删除历史制品。
- 发布制品来源为隔离 clean worktree 提交 `61150720f397a6d60b3cc28d625bfd866f8a3b27`，制品 `admin-console-20261030-fixed.tar.gz` SHA-256 为 `dbdbbb0ecca66132cf025ed40e25caad7f23c8f53a8fe75448bce63a8c23b43e`。制品解包后 backend 依赖安装、权限加固、storage 同步和 `release-manifest.json` 校验均通过；当前工作区仍未提交、未推送。
- 维护窗口内 Nginx 先返回 503/`Retry-After: 120`，API 与两个 Worker 停止后生成停写备份 `/opt/projects/marvels-chat/database/backups/marvels_chat-admin-console-20261030T104159Z.dump`，SHA-256 `6e6e40d1336c8d24a3759a8e52197b11fe93511b573b4679e0e86ec3799fdaf9`，`pg_restore --list` 522 项。迁移前账本为 45 项，迁移 046–048 后为 48 项。
- 生产 backfill 首次执行为 `9 releases / 9 products / 26 entitlements`，其中 `enabled 7`、`reconsent_required 16`、`disabled 3`；旧 `user_agents` projection 为 `enabled 7`、`disabled 19`。`media-retrieval` 因当前生产能力未就绪保持 `review`/产品 `draft`，没有静默上架。重复执行新增 entitlement 为 0；稳定时间戳修复及回归测试已纳入发布制品。
- 线上 `/api/health`、`/api/ready` 均为 200；backend、AI Task Worker、media retrieval Worker、Nginx 均 active。`/admin/`、`/admin/login`、`/admin/products` 深链均返回新 React shell；未携带凭据的 `/api/me` 返回 401，符合管理员认证边界。线上 CSP 已同步 `style-src 'self' 'unsafe-inline'`，并核对 HSTS、nosniff、DENY、Referrer Policy、Permissions Policy、COOP。
- 回滚依据为旧 runtime `/opt/projects/marvels-chat/releases/agent-catalog-admin-20261029/runtime` 和 Nginx 备份 `/opt/projects/marvels-chat/backups/admin-console-20261030/nginx.before-maintenance.conf`；数据库回滚先保留新写入并按同合同前向修复，不能直接用旧 dump 覆盖线上库。
- 尚未使用管理员密码完成线上登录后的页面操作冒烟，也未上传 TestFlight、部署移动端或调用付费模型；下一步由负责人使用现有管理员账号验证用户、release、产品、任务、监控、审计和媒体页面，以及旧用户 bootstrap/sync。
- 最后一次当前工作区检查 `MIAOXUN_DOTENV_ENABLED=false ./scripts/check-repository.sh` 退出 0：backend 1192 项（923 passed、269 个 PostgreSQL 环境门控 skipped、0 failed）、agents 50、Admin 32、avatar-web 29、media-retrieval-web 3、RN 76 suites / 1008 tests；各构建、RN format/lint/typecheck 和 `git diff --check` 均通过。工作区仍保持既有未提交修改，未提交或推送。
- 后续浏览器验收发现旧标签页仍显示部署前的单页后台，原因是浏览器缓存了旧 HTML/脚本；正式 Nginx 已为 `/admin/` 和资源补充 `Cache-Control: no-store, no-cache` 与 `Pragma: no-cache`，刷新原标签后已进入新版 `/admin/releases` 侧边栏后台。配置备份保留在 `/opt/projects/marvels-chat/backups/admin-console-20261030/nginx.before-cache-control.conf`。

#### 2026-10-30 React/Refine 后台统一入口（当前工作区，未部署）

- 后台前端已切换为 Vite + React + Refine + Ant Design 资源型架构，入口为 `admin/index.html` → `admin/src/main.jsx`；旧线上 `/admin/` 仍是历史 runtime，尚未替换。
- 已接入真实 React 页面：运营总览、用户与权限、Agent release、产品目录、任务、运行监控、审计、媒体检索和系统配置。用户列表、事件、Agent runs、release 和产品列表支持服务端分页/搜索/筛选；详情、创建、资料语言、权限、会话撤销、Agent 撤权和发布动作均由后端权限及幂等接口校验。
- 新后台不提供模型供应商连通测试按钮，不替管理员启用普通 Agent；发布、暂停、撤权、任务取消/重试和媒体预算/Provider 控制均有确认并保留审计。CSP 示例已允许 Ant Design 运行时样式注入（`style-src 'unsafe-inline'`），上线时必须随制品同步。
- Admin 当前验证：`npm --prefix admin run check` 30 files、`npm --prefix admin test` 32/32、`npm --prefix admin run build` 通过；`npm audit --omit=dev` 0 vulnerabilities。React 页面已在本地 Vite `http://127.0.0.1:5175/admin/login` 渲染，真实本机 backend `http://127.0.0.1:4391` 的管理员 API smoke 通过（`/api/me`、users/releases/products/events 分页、tasks、monitoring、media overview、model status 均 200）。
- 新增服务端分页实现 `backend/src/admin-list-repository.js`，真实 Docker 隔离 PostgreSQL 集成测试覆盖 users/events/runs/releases/products 的分页、总数、搜索和 `%` 转义并通过；测试容器已清理。当前生产仍是旧 001–045 runtime，工作区含未提交 046–048 与后台改动，不能直接部署。
- 生产预检：SSH、备份、systemd 服务、`/api/health`/`/api/ready` 均正常；`scripts/prepare-runtime-release.mjs` 因 dirty worktree 正确拒绝打包。正式替换仍需审查后的 clean commit、停写备份、迁移 046–048、原子切换和线上 smoke，当前未部署/未提交/未推送。

### 2026-10-30 当前工作区实读边界（优先于历史段落）

- 当前分支为 `feature/redesign-by-prototype`，工作区保留大量未提交修改和新增文件；未执行 reset、clean、覆盖、删除、提交或推送。实际文件状态以 `git status --short --branch`、`git diff --stat` 和 `git diff --check` 为准。
- 本机官方开发 backend 当前监听 `127.0.0.1:4391` 并由 `/api/health` 返回 200；旧端口 `4390` 无监听。共享 PostgreSQL 的 `marvels_chat` 账本实读到迁移 `026_agent_granted_scopes.sql`。不能把历史生产040–045、隔离 `_migration_test` 或旧 HEAD/Build42 记录当作当前本机或线上状态。
- 本轮 046–048 发布合同、产品目录、consent、entitlement、bootstrap/sync 及暂停/撤权门禁必须使用全新的 loopback `_migration_test` 数据库串行验证；隔离日志与 HTTP 日志只证明对应隔离环境，不证明生产已部署。268 个 PostgreSQL 环境门控测试的 skipped 必须单独记录，不能写成通过。
- Build54 已在 TestFlight 历史页面显示“正在测试”，但本轮没有上传或替换实体设备 App。Build54 真机验收仍需逐项执行：二楼落地页与各子页上滑退出；讯页对话/任务、新建、搜索和返回；妙页与讯页长按菜单；语音入口与识别卡；我页 Agent 卡片、折叠恢复和头像一致性；聊天详情、任务详情、输入框、提示条滑动及各种状态切换。模拟器、组件测试和 TestFlight 页面状态不能代替实体 iPhone 结论。
- 本轮不部署生产、不上传 TestFlight、不调用付费模型。真实 health/ready、迁移、Worker、生产用户流程和第三方模型费用需要另行获得范围明确的现场/只读证据；下一阶段负责人按本页“尚未闭环”执行。

#### 2026-10-30 后台管理系统 P0/P1 重构（当前工作区，未部署）

- 已修复“所有能力集中在一个页面”的前端信息架构问题：`admin/src/app-shell.js`、`admin/src/router.js` 和 `admin/admin.css` 现在提供按工作台、用户与权限、Agent 与产品、任务与监控、审计与系统分组的固定侧栏；每个模块拥有独立 `/admin/<module>` 路由、中文导航说明、面包屑、页面容器、`aria-current`、刷新状态和移动端抽屉。
- 账号页已接入真实账号搜索/状态/角色筛选、详情、创建账号、资料编辑、角色/状态变更、会话撤销和密码重置；Agent 页支持 release 搜索/状态筛选、审核和发布；产品页支持状态/关键字筛选、显式 JSON 合同草稿、提交/发布/暂停；任务页支持状态、Agent、用户、时间窗口筛选和服务端幂等取消/重试。
- 监控页支持 7/30/90 天窗口；审计页支持真实事件搜索；系统页展示脱敏模型配置；媒体检索已拆成独立诊断页，读取 Worker 可用性、队列、预算和脱敏失败诊断，并通过服务端审计控制 Agent、Provider 调用和索引队列。后台不生成示例记录，权限和生命周期仍由后端最终校验。
- Admin 验证：`npm --prefix admin test` 29/29、`npm --prefix admin run check` 27 files、`npm --prefix admin run build` 通过，`git diff --check` 通过；本地 mock API 渲染验收确认登录后工作台、账号页、产品页和独立路由可见。该 mock 只用于本地 UI 检查，不代表隔离数据库或生产通过。
- 当前仍未部署本轮工作区后台到线上，未触碰生产后台；旧线上 044/045 后台不能当作本轮模块化版本。用户已明确暂缓第三项实体 iPhone 验收，待后台系统完成后再由用户进行真机验证。下一步是启动隔离 backend + Admin 做真实管理员登录、发布/产品/任务/媒体操作验收，再单独评估部署范围。

#### 2026-10-30 Admin 本地登录端口修复

- 定位到后台“点击进入后台无法登录”的真实原因：官方开发运行器使用 `127.0.0.1:4391`，而 Vite 代理、`file:` 页面 API fallback 仍写死 `4390`；修复后由 `admin/src/runtime-config.js` 统一默认地址，`MIAOXUN_ADMIN_API_TARGET` 仍可显式覆盖。
- 修复后重启本地 Vite 5175 实例，`GET http://127.0.0.1:5175/api/health` 与后端 `GET http://127.0.0.1:4391/api/health` 均返回 200；浏览器登录页当前显示 `API：http://127.0.0.1:4391`，不再把请求发往旧端口。
- Admin 验证已更新为 `npm --prefix admin test` 31/31、`npm --prefix admin run check` 通过、`npm --prefix admin run build` 通过，`git diff --check` 通过。未使用或记录任何用户密码；未提交、推送或部署生产。

#### 2026-10-30 Admin 登录继续修复

- 进一步复现发现旧进程虽然返回 `/api/ready` 200，但运行来源不是当前工作区，数据库账本只有 001–045；`node scripts/miaoxun-development.mjs verify-local-restart` 已保留本地数据并补齐 046–048，当前状态为 `schemaMigrations=48`、`sourceMatchesCheckout=true`。
- 当前隔离开发库原本只有普通开发账号，没有管理员账号；按本地 `backend/.env` 的既有管理员配置创建了 `admin` 管理员身份和 `*` 后台权限，没有写入管家 entitlement、伪造模型配置或调用供应商。密码未写入文档或日志。
- 通过 `http://127.0.0.1:5175` 实际登录后已进入“运营总览”，页面可见账户中心、发布中心、运营中心和系统中心；这证明端口、迁移、管理员身份、登录接口和前端会话链路均已闭环。未提交、推送或部署生产。

#### 2026-10-30 PostgreSQL 门控审计增补

- 修复后的隔离 PostgreSQL 门控已重新串行执行并保留新鲜日志：`/tmp/miaoxun-pg-gates-20261030/fresh_ai_task.log`（16/16）、`fresh_butler_workspace.log`（23/23）、`fresh_workspace_discussion.log`（19/19）、`fresh_ai_message_recall.log`（6/6）；每组对应的 `fresh_*.migrate.log` 均显示 48 项迁移已执行，测试数据库随后删除。默认管家迁移使用 `default_butler_migration_fixture3.log`（3/3）。这些结果取代同目录中修复前的 stale 日志。
- 当前可执行的 PostgreSQL 门控已在本轮审计中通过：共 29 个 suite、332 个测试，覆盖 Agent workspace continuation/direct/repository/service/submission/text、任务与站点、消息历史、专业 Agent、文件来源、站点所有权、迁移回放、pgvector 媒体检索和消息幂等，均有对应逐文件日志。四组修复后的核心日志为 `/tmp/miaoxun-pg-gates-20261030/fresh_ai_task.log`、`fresh_butler_workspace.log`、`fresh_workspace_discussion.log`、`fresh_ai_message_recall.log`；Docker 门控为 `fresh_media_retrieval_migration_fixed.log`（12/12）和 `fresh_message_idempotency_postgres_fixed.log`（3/3）。
- 两项 Docker 门控修复均只改测试：媒体检索夹具显式传入 `grantedScopes: ["album:read"]`；消息幂等测试在 Compose 发布临时端口后同步更新已加载的测试 `config.db`。生产授权和数据库运行时代码没有放宽。共享 `marvels_chat` 未触碰；临时门控数据库和本次测试创建的 Docker 资源已清理，其他既有 Docker 容器未操作。

#### 2026-10-30 发布撤权链路补审

- 复核发现产品级 `DELETE /api/me/products/:productId/enable` 之前直接调用 repository，绕过相册产品生命周期 hook；已改为统一经过 `agentPublishingService.disableProduct`，确保产品撤权和 Agent 级撤权使用同一 entitlement projection / 媒体索引清理路径。
- 新增 `backend/test/agent-product-access.test.js` 的直接产品撤权回归；定向发布合同、幂等、配置和网络 origin 测试共 33/33 通过。新鲜隔离 HTTP 验收 `/tmp/miaoxun-release-revoke-http-20261030.log` 已覆盖 release review/publish、product submit/publish、用户 consent、bootstrap/sync、projection、幂等重放和产品撤权。

#### 2026-10-30 收尾边界

- `xcrun xcdevice list --timeout 10` 当前可见并配对实体 iPhone 14 Pro（`available: true`），但本轮没有替换设备上的 TestFlight Build54，也没有把静态设备可见性写成真机 UI 验收。二楼手势、语音识别、长按菜单、输入滚动、聊天/任务详情和头像一致性仍需在 Build54 上由人工逐项复验。
- 本轮没有生产部署、Git 提交/推送、TestFlight 上传或付费模型调用。实体设备复验仍需单独完成。

#### 2026-10-30 最终整仓检查

- `MIAOXUN_DOTENV_ENABLED=false ./scripts/check-repository.sh` 于本轮最后重新执行并退出 0，完整输出：`/tmp/miaoxun-repository-check-20261030-final7.log`。backend 1185 项中 917 passed、268 个 PostgreSQL 环境门控 skipped、0 failed；RN 76 suites / 1008 tests；Agent、Admin、avatar-web、media-retrieval-web 检查与构建均通过，RN format/lint/typecheck 通过，仓库检查最终打印 `All repository checks passed.`。
- RN 测试日志仍有既存 React `act(...)` console warning，但没有失败测试；这不改变退出码或通过计数，后续可单独收敛测试异步包装。
- 文档与移动端配置漂移复核已补齐：`MiaoxunRN/README.md`、`docs/mobile-launch-checklist.md`、`docs/ios.md`、`docs/ai-interaction-system.md`、`docs/agents.md`、`docs/file-processing.md` 和 `docs/deployment.md` 均明确区分合同6/043历史部署、工作区046–048隔离验证与未部署生产状态；Android 示例显式传入 `MIAOXUN_API_BASE_URL`，不再保留 Build42/Build52 当前描述。`backend/test/release-network-config.test.js` 11/11 通过，`git diff --check` 通过。

#### 2026-10-30 隔离验收最终证据

- `/tmp/miaoxun-migration-replay-20261030.log`：全新 loopback `_migration_test` 首次执行迁移 001–048 为 48/48，重复回放为 0/48 unchanged，检查通过。
- `/tmp/miaoxun-release-http-20261030.log`：真实 HTTP 链路覆盖 registry sync → release review/publish → product submit/publish → explicit consent → entitlement、`user_agents`、bootstrap/sync 和 chat thread projection。
- `/tmp/miaoxun-pause-revoke-old-session-20261030.log`：撤权、产品暂停和旧 session 门禁通过；旧 session 对重新启用返回 409，暂停后 entitlement、目录和 projection 均按预期失效。
- `/tmp/miaoxun-repository-check-20261030-final.log`：backend 1184 项（916 passed、268 PostgreSQL 环境门控 skipped、0 failed），RN 76 suites / 1008 tests，其他工程检查通过。
- 上述验证使用临时隔离库，临时库已清理；共享 `marvels_chat` 数据库未触碰。本轮日志只证明隔离环境和当前工作区检查结果，不代表生产部署或实体 iPhone 验收。

#### 2026-10-30 PostgreSQL 门控 fixture 收口与最终整仓检查

- 原先门控失败已按当前产品合同修正测试夹具，而不是放宽生产授权：`ai-task-integration.test.js` 为 album-manager、site-builder、miaoxun-butler 建立 registry/release/catalog、published product、dependency 和 explicit entitlement；`butler-workspace-integration.test.js` 建立三组相同的发布链路；`workspace-discussion-integration.test.js` 补齐 Butler 当前 identity contract；`ai-message-recall.test.js` 按当前 specialist dispatch 合同加入 workspace contract，并覆盖 model gate 前后 recall 阻止迟到结果；`default-butler-migration.test.js` 补齐 044→048 升级所需的发布身份夹具。
- 新鲜隔离 PostgreSQL 结果：ai-task 16/16、butler-workspace 23/23、workspace-discussion 19/19、ai-message-recall 6/6、default-butler-migration 3/3；每组均使用 loopback `*_migration_test`，测试后临时库已删除。完整门控审计及逐文件日志保留在 `/tmp/miaoxun-postgres-gates-20261030.log` 和 `/tmp/miaoxun-pg-gates-20261030/`；共享 `marvels_chat` 未触碰。
- 最终整仓命令 `MIAOXUN_DOTENV_ENABLED=false ./scripts/check-repository.sh` 退出 0，完整输出记录于 `/tmp/miaoxun-repository-check-20261030-final.log`：backend 1184 项中 916 passed、268 个 PostgreSQL 环境门控 skipped、0 failed；agents 50、Admin 23、avatar-web 29、media-retrieval-web 3；RN 76 suites / 1008 tests；Admin/Vite、avatar-web、media-retrieval-web 构建及 RN format/lint/typecheck 全通过；`git diff --check` 通过。
- 这些门控与整仓结果只证明当前工作区和隔离数据库；本机 backend 仍未启动，生产 046–048、真实模型调用、Build54 实体 iPhone/TestFlight 验收仍未闭环。

### 2026-10-29 标准化 Agent 发布链路与后台运营（当前工作区，未部署）

- 已完成并验证迁移 046–048 的 Agent release、产品版本、依赖合同、用户 entitlement 与状态历史；合同哈希包含 Agent key、版本、权限和标准化 identity，审计历史使用 `RESTRICT` 保护。全新隔离 PostgreSQL 已完成 001–048 首次迁移和第二次幂等回放，证据为 `/tmp/miaoxun-migration-replay-20261029.log`；当前开发数据库仍以实际 `schema_migrations` 为准，不能把隔离库证据当作本地或线上已迁移。
- 后端新增 release/product repository、发布服务和路由：代码注册 -> release draft/review/published -> 产品版本绑定具体 release -> 产品发布 -> 用户显式 consent -> entitlement、`user_agents` 和 Agent 会话同事务写入。发布、启用、重复请求和合同不一致返回显式错误码，不使用旧目录上架或前端兜底。
- `/api/app/bootstrap` 与真实增量 `/api/app/sync` 返回已发布产品、目录 revision 和用户 entitlement；已移除重复的全量 sync 路由及旧的直接 PATCH 目录上架入口。运行前继续校验 release 状态、版本、合同和用户授权。
- 当前普通 Agent 授权入口只接受已发布产品 entitlement；`user_agents` 仅作为 entitlement projection。新账号和管理员初始化中的 `ensureDefaultButlerAccess`/迁移 040 是明确的系统默认妙讯管家初始化边界，不是通用授权兜底；若要完全统一，需另行执行“先发布 Butler 产品、再批量回填历史 entitlement、最后移除直写路径”的迁移窗口。
- 后台任务运营和监控已接入真实 `ai_tasks`、`agent_workspaces`、`agent_runs`、产品 entitlement 聚合：总览支持 7/30/90 天，任务筛选/取消/失败重试带幂等审计，未知 token/成本/耗时保留为空。后台产品、release、任务和监控模块已按真实接口数据形状更新。
- 文档已同步 `docs/admin.md`、`docs/agents.md`、`docs/architecture.md` 和数据库说明，旧的“直接编辑 agent_catalog 即上架”描述已删除；此前重复注册的 `/api/app/sync` 已收口到 App 路由并按 `chat_threads.updated_at` 返回增量线程。Admin 测试、Admin build、backend syntax 和发布/运营定向测试均通过；当前总证据仍以本节及命令输出为准。
- 当前阶段最新验证证据：整仓 `MIAOXUN_DOTENV_ENABLED=false ./scripts/check-repository.sh` 通过，backend 1178 项（910 passed、268 PostgreSQL 环境门控 skipped、0 failed），RN 74 suites / 991 tests，Admin 23 tests，Agent 50 tests，avatar-web 29 tests，media-retrieval-web 3 tests；RN TypeScript、ESLint、Prettier、各 Web build 和 `git diff --check` 均通过。全新 loopback `_migration_test` PostgreSQL 已完成 001–048 首次迁移及重复回放，证据为 `/tmp/miaoxun-migration-replay-20261029.log`；API HTTP 集成在显式执行一次性 `admin:bootstrap` 初始化默认妙讯管家发布合同后通过，证据为 `/tmp/miaoxun-api-http-20261029.log`。新增 `backend` 的 `npm run test:agent-publishing` 通过，覆盖完整发布、consent、幂等、bootstrap/sync 与数据库投影，证据为 `/tmp/miaoxun-release-http-20261029.log`；验证库均已清理。这些均为本地或隔离库证据，不代表生产或实体真机验收。
- 隔离 HTTP 验证已通过 registry sync -> release review/publish -> product create/submit/publish -> user consent -> entitlement/`user_agents`/`chat_threads` -> App bootstrap/sync，证据为 `/tmp/miaoxun-release-http-20261029.log`；未发布依赖和篡改 contract hash 均按预期返回 409，证据为 `/tmp/miaoxun-release-gates-20261029.log`。
- 本轮仍未生产部署、未上传 TestFlight、未推送 Git、未调用付费模型。当前工作区的 046–048 变更必须在另行授权后，使用干净制品、停写备份、迁移和同源 API/Worker 配套部署；隔离验证不能替代线上验收。

#### 当前工作区后续审查修复（2026-10-29）

- 修复发布身份合同在重复 registry sync 后被降级的问题：同一 Agent、运行版本和声明权限范围下，后台 `source=admin` 的运营 identity/release 会被保留；代码版本或权限变化仍生成新的 release。管理员提交 identity 时由服务端写入 `source=admin`、`published=false` 和当前时间，不接受客户端伪造来源或时间。
- 发布与启用门禁现在区分执行合同和展示合同：运行时版本、声明 scopes、readiness 必须与 registry 当前事实一致；展示 identity 和 release contract 由已审核 release 提供，允许运营者维护标准化展示身份。发布 release 还会拒绝 registry 权限范围已变化的旧 release。
- 禁止同一个 `Idempotency-Key` 跨产品启用和停用复用；重复请求返回原状态，跨动作复用返回明确 `IDEMPOTENCY_CONFLICT`。
- Agent release identity 修改现在也要求 `Idempotency-Key`；服务端把 identity 合同 hash 写入状态历史，重试返回原 release，同键不同 identity 返回 `IDEMPOTENCY_CONFLICT`。
- RN session 已将 bootstrap/sync 的 `products`、`entitlements`、`catalogRevision` 作为必填发布合同保存、刷新和登出清理；Admin identity 卡片严格校验 `avatarKind`、形状和三项六位颜色，并对运营文本统一 HTML 转义。Admin 数据表、发布卡片、监控、总览和系统状态均不再直接插入未转义服务端值。
- 新鲜定向验证：发布/幂等测试 21/21，identity 幂等回归 7/7，RN sessionSync 27/27；上述整仓检查与隔离 PostgreSQL/HTTP 证据均已在本轮重新执行，未使用生产数据库或供应商调用。

本节是当前状态的优先来源。下面带有“历史”或“当时”的段落保留原始部署、测试和设计证据；其中 044–045 的旧目录投影部署记录不能解释为当前 046–048 发布链路已部署。

### 2026-10-29 Agent 目录与后台线上部署（历史，已被当前工作区链路取代）

- 已按维护窗口部署后台目录与 Agent 展示链路到阿里云 ECS `8.153.167.11`。线上 runtime 为 `/opt/projects/marvels-chat/releases/agent-catalog-admin-20261029/runtime`，制品包含 backend、Admin 静态资源、avatar-web 和 迁移 044/045；服务器运行制品文件哈希与本地发布制品一致。服务器 manifest 记录来源提交 `2cc75b12c01fc888e7ea39b73eb3b5fbcc5d0096`；随后本地将同一已审查内容及其新增 RN 资源、回归测试整理为提交 `3784b06ebded16fde2b963d07ce9a6343026a323`，runtime 白名单文件内容未改变。
- 停写备份 `/opt/projects/marvels-chat/database/backups/marvels_chat-20261029T082200Z.dump` 的 SHA-256 为 `3a33087b7e1d98860275b5bea4e50eaee67b2ec34d7de8b8267042a3ad90f132`，`pg_restore --list` 共 518 项；迁移账本现为 45 条，最新为 `045_agent_alias_source.sql`。迁移使用维护窗口执行，未调用模型供应商。
- 部署后 `marvels-chat-backend`、`marvels-chat-ai-task-worker`、`marvels-chat-media-retrieval-worker` 均 active；本机和公网 HTTPS `/api/health`、`/api/ready` 均返回 200，ready 报告数据库已连接且 `migrationsCurrent=true`；`marvels-chat-database-backup.timer` active。后台 `/api/admin/agent-catalog` 已由线上服务返回 200，线上管理台可使用目录配置与使用监控模块。
- 本次部署未上传 TestFlight、未推送 Git、未创建生产测试账号、未触发付费模型调用。当前仍需用户在后台浏览器刷新后复核目录表单，并在实体真机复验 App 对线上目录变更的同步；域名/DNS 的既有 4 项 readiness 警告仍未改变。

### 2026-10-29 Agent 目录隔离验证与别名边界（历史，044–045）

- 完成全新 loopback PostgreSQL 隔离库迁移 `001–045`（45/45），验证 `agent_catalog` 首次种入当前 9 个已部署 Agent 且默认上架；新增未登记 Agent 通过目录同步默认未上架；后台目录改名、描述/身份颜色合并、上架/下架和 App 目录投影均按真实数据库返回。
- 使用真实 `agent_runs` 夹具验证 7/30/90 天窗口的运行、生命周期成功/失败、Token、成本和延迟聚合：排队/未知字段不会被伪装成成功或已知成本，空统计保留空态/null。临时 55443 集群已停止；本地开发数据库随后重启到迁移 45，`/api/ready` 200、`sourceMatchesCheckout=true`。
- 增加 `user_agents.alias_source` 迁移：后台目录重命名只更新仍等于旧系统默认名的已有授权和会话标题；用户自定义别名保持不变。后台目录仓储已使用事务行锁，避免目录改名与别名迁移读取旧值。
- 进一步收敛目录消费边界：新账号默认妙讯管家、普通聊天用户上下文、相册任务上下文和后台用户 Agent 详情均读取目录展示元数据；执行器能力仍来自代码注册表，目录不会改变权限或运行合同。
- 后台审查通过：六模块导航、目录编辑、真实使用监控空态/错误态与权限隐藏；admin 测试 15/15、语法检查和 Vite 构建通过。固定 iPhone 17 已由当前源码成功构建、安装、启动，截图证据 `/tmp/miaoxun-check/catalog-current.png`；当前讯页显示统一 V20 妙讯管家头像。此次只做本地/模拟器验证，未部署、未上传 TestFlight、未推送 Git、未调用模型供应商。
- 最终整仓检查在上述补充后再次通过：backend 876 通过、268 项 PostgreSQL 环境门控跳过且 0 失败；RN 73 套 / 986 项通过；Agent 50、Admin 15、avatar-web 29、media-retrieval-web 3 通过，`git diff --check` 通过。后台目录配置的实际入口是 Admin Web，不是手机端；手机端只消费 bootstrap/sync 并保留用户自己的授权/移除。当前线上浏览器仍是未包含本轮目录表单的旧部署版本；要让线上后台出现新表单，需要另行授权部署后端、迁移 045 和 Admin 静态资源。

### 2026-10-29 Agent 目录与全链路整理（历史基础，已被 046–048 链路取代）

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
## 2026-10-30 后台资源型架构与完整运营信息

- 用户明确指出后台不能把所有内容平铺在侧栏，也不能只用卡片显示数据。本轮将 Admin 主架构收敛为五个一级工作域：工作台、账户中心、发布中心、运营中心、系统中心；原有 `/admin/overview`、`/admin/accounts`、`/admin/agents`、`/admin/products`、`/admin/media-retrieval`、`/admin/tasks`、`/admin/monitoring`、`/admin/audit`、`/admin/system` 路由和服务端权限保留，进入工作域后由主区二级页签切换资源。
- 工作台新增真实 `daily` 趋势、每日运行明细、最近账号和窗口/数据新鲜度显示；账号中心列表补充联系方式、presence、消息量，详情补充登录名、会话摘要、Agent 授权、会话、最近 Agent runs 与审计摘要；Agent 中心补充完整上线流程、contract/readiness/scopes/registry 门禁和 identity 编辑入口；产品中心补充依赖 release 的状态、就绪、registry 版本和合同门禁；运营中心补充任务阶段/版本/失败原因和完整监控聚合表（Agent、产品、用户、任务状态）。
- 参考并在 `docs/admin.md` 记录了 Ant Design Pro/ProTable、Tabler、Grafana、React-admin 的公开信息架构和交互模式，未复制代码或品牌。后台仍只显示真实服务端数据，未知成本/token 保持未知，不使用假统计。
- 本轮 Admin 验证：`npm --prefix admin test` 31 项通过；`npm --prefix admin run check` 27 文件通过；`npm --prefix admin run build` 通过；`git diff --check` 通过。Playwright 本地 mock 浏览器截图已确认五项一级导航、主区工作台明细和浅色运营控制台；mock API 与本地开发服务器未作为生产上线证据。
- 真机验收按用户要求暂缓；未部署生产、未上传 TestFlight、未提交或推送。线上仍需在工作区后台完成隔离 PostgreSQL/HTTP 全链路验收后再决定部署。

## 2026-10-30 后台隔离验收与展示

- 隔离 PostgreSQL 门控已补跑：29 个 suite，共 332 tests，332 passed、0 failed、0 skipped。覆盖任务恢复/续作、Agent workspace direct/service/repository/continuation/text/submission、专业 Agent、文件来源、站点 ownership、消息历史/幂等、Agent 授权撤销、pgvector media retrieval、默认 Butler、迁移相关。汇总日志：`/tmp/miaoxun-postgres-gates-20261030.log`；各 suite 使用独立 loopback `*_migration_test` 数据库，未触碰共享 DB/生产。
- 后台到 App 隔离 HTTP 全链路已通过：独立数据库 `niaoxun_admin_http_20261030_migration_test` 完成 48 项迁移；验证 registry sync、release identity/review/publish、product submit/publish、用户明确 consent、幂等 replay/conflict、bootstrap/sync、entitlement、`user_agents`、chat thread projection、product revoke，以及 readiness、注册/登录、profile、privacy/ownership、管理员授权/编辑和非管理员 403、消息 sync、logout/account deletion。日志：`/tmp/miaoxun-admin-http-e2e-20261030.log`、`/tmp/miaoxun-api-http-e2e-20261030.log`；隔离数据库已删除。
- Admin 当前本地预览已打开：`http://127.0.0.1:5175/admin/`。截图证据：`output/playwright/miaoxun-admin-current.png`、`output/playwright/miaoxun-admin-mobile-final.png`。浏览器 mock session 只用于展示五个一级工作域、主区二级导航和完整工作台布局，不代表生产数据。
- 部署只读审计完成：`admin/vite.config.js` 使用 `/admin/` base，构建产物由 `scripts/prepare-runtime-release.mjs` 从干净已提交源码生成并复制到 runtime；Nginx 模板已提供 `/admin` 重定向、SPA 深链 fallback 和安全头。当前工作区未提交，不能作为生产制品；线上后台仍可能是旧 runtime。生产部署前必须在服务器执行 `nginx -t`、reload 和 `/admin/`、`/admin/products` 深链 curl 验证。未部署、未提交、未推送。

## 2026-11-04 P0-P3 妙讯协作与 UI-Agent 阶段交接

- 本阶段在保留工作区既有修改的前提下完成 P0/P1/P2/P3 主链路实现：二楼手势与内容收口、多 Agent workspace 并发执行与真实贡献、妙页 S0/S1/S2 卡片状态、聊天贡献卡片、UI-Agent 白名单合同及预览/确认/重置 API。
- UI preference 已接入讯页、妙页和二楼部分组件；组件 ID、布局插槽、注册手势和注册动作均由共享合同校验，手势与动作错绑、未知字段、任意坐标、代码/URL 等会显式拒绝。设备端保留退出动画，测试 renderer 使用同步关闭契约。
- 证据：RN 全量 Jest 80 suites/1045 tests 通过；RN typecheck、lint（0 errors）、format:check 通过；UI preference/backend contract、service、routes 共15项通过；共享源码语法检查387文件通过；Admin tests 48项通过、Admin syntax 39文件通过；`git diff --check` 通过。RN 测试仅有既存 VoiceShortcutDock 的 act 警告，无失败。
- 当前未部署后端、未上传 TestFlight、未发布 UI-Agent、未调用付费供应商。迁移051与正式 API 切换需单独后端部署授权；真实模型、真实数据库和实体真机视觉/触控验收仍未完成。
- 已知环境阻塞：Agent 全量测试缺少 `ajv`；整仓检查工作树可能缺少 eslint；PostgreSQL 门控不能以 skipped 视为真实通过。Agent 等级/协作次数/偏好匹配仍因后端缺少真实字段而保持未接入，不填演示数据。
- 整仓 `./scripts/check-repository.sh` 仍被环境阻塞：根工作树缺少 `eslint`；Admin build 亦因缺少 `vite` 无法运行；Agents 全量测试有2项因缺少 `ajv` 失败，其余32项通过。未安装依赖。
- P2 审计结论：重授权链路、真实 picker/上传/定位、点按与长按语音、权限页显式未开放和群聊显式未接通均保持真实边界；Agent 等级、协作次数、偏好匹配没有后端字段，继续显示真实可用信息/不填演示数据。下一步仅剩后端迁移/发布、实体真机验收和必要环境依赖补齐。

## 2026-11-04 P2/P3 合同收口复核

- P2 复核确认：相册、拍摄、文件、位置、语音点按/长按和 Agent 重授权都走现有真实 API/原生能力与授权链路；联系人、任务、文件库和创建群聊没有完整后端合同，界面保持明确“未接通/未开放”状态，不伪造成功。等级、协作次数和偏好匹配没有服务端字段，继续不填演示值。
- P3 合同补齐：`shared/ui-preferences.js`、RN UI preference 类型/默认值和 `ui-agent` 声明现已包含 `surfaces.*.buttonScale`（0.8–1.3 边界）；讯页新建按钮、妙页 Agent 操作、二楼相册/文件上传入口实际消费该 token。后端 preview/confirm/reset 仍以白名单、授权、previewId/baseRevision CAS 和审计为准。
- 本轮复核证据：`MiaoxunRN` typecheck 通过；RN Jest 80 suites/1045 tests 全通过；backend syntax 368 文件通过；agents syntax 35 文件通过；UI preference contract/service/routes 15 项通过；Agent registry 定向 16 项通过；`git diff --check` 通过。
- 仍未部署迁移051或正式 API、未发布/启用 `ui-agent` 产品权限、未上传 TestFlight、未调用付费供应商。实体真机手势/视觉验收仍需在候选构建上执行；整仓检查的 `eslint`、Admin 的 `vite` 和 Agents 全量测试的 `ajv` 缺失属于当前工作环境阻塞，未自行安装依赖。

## 2026-11-04 UI 偏好与二楼手势集成复核

- 共享 UI preference 合同现在拒绝妙页参与 Agent 与详情手势使用相同方向，并保护二楼 `toolTray` 与 `permissions` 必要入口；RN 渲染层对旧状态也强制保留这两个入口。
- 二楼页面上滑退出改为直接使用合同允许的 `distance`（40–240），不再无条件将 40–99 的合法配置放大为100；新增回归覆盖配置为60时的61px上滑。
- RN 预览卡现在展示服务器返回的 `beforePreferences` 与确认后的前后变化，包括 token、模块显隐/顺序、按钮插槽、组件插槽/顺序及手势方向/距离；后端 undo 链路和 RN 撤销入口已接通。
- 定向验证：`MiaoxunRN` 二楼、UI 偏好与预览差异测试 50/50 通过；后端 UI preference contract/service/routes 18/18 通过；TypeScript、Prettier、`git diff --check` 通过。
- UI preference 合同仍比 RN 实际渲染覆盖更宽：`fontScale`、`density`、`rowGap`、`layout.buttonSlots` 与 `components.order` 当前用于合同校验/预览差异，尚未在各页面全面改变布局。继续补齐前需单独评估不同屏幕与无障碍风险；本轮未扩大到这些高风险渲染改动。

## 2026-11-04 UI 偏好运行时消费补齐

- RN 新增受限消费辅助：`uiDensityFactor`、`uiRowGap`、`uiFontSize`、`uiButtonSlot` 和 `orderedUIComponents`。这些函数只读取服务端已确认的语义偏好，并将密度、字号、间距、固定插槽和已注册组件顺序映射到 RN 样式；不接受任意坐标、脚本或模型生成代码。
- 讯页接入列表间距、标签字号和新建入口固定插槽；妙页接入任务间距、标题/卡片字号、参与 Agent 与详情动作的固定顺序和卡片底部/顶部插槽；二楼接入工具间距、入口字号和返回入口的固定插槽。组件注册表和受保护入口仍由既有合同控制。
- 新增 `MiaoxunRN/__tests__/uiPreferences.test.ts` 的密度、字号、行距、插槽和固定组件顺序覆盖。定向测试 58/58 通过；RN 全量 Jest 81 suites/1052 tests、TypeScript、ESLint、Prettier 通过，`git diff --check` 通过。
- 仍未部署迁移051或正式 API、未发布/启用 `ui-agent`、未上传 TestFlight、未调用付费供应商；实体真机视觉/触控验收和缺失的根 `eslint`、Admin `vite`、Agents `ajv` 环境依赖仍按上节记录处理。

## 2026-11-04 Build58 本地发布前预检与 ASC 会话恢复

- App Store Connect 当前登录态已恢复。只读核对显示 1.0(55)、1.0(56)、1.0(57) 均为“正在测试”；最新 Build57 的二进制状态为“已验证”，Bundle `com.wangruoshi.miaoxun`，外部 `yunzhi` 群组 7 人、内部 `yunzhi` 群组已关联。Build57 测试信息页面当前内容为 `1111`，本轮未修改测试说明或测试组。
- 使用当前工作区源码和锁定 Pods 进行未签名 Release device archive 预检，命令通过并输出 `** ARCHIVE SUCCEEDED **`。证据目录：`/tmp/miaoxun-release-20261104-build58-preflight-1793773445/`；临时覆盖 `CURRENT_PROJECT_VERSION=58`，归档内 Bundle `com.wangruoshi.miaoxun`、版本 `1.0 (58)`，内嵌 `main.jsbundle` SHA-256 为 `285cbf360554dda2425a1cfddd2311b2c371f25dc6a53d8d5a520f8473157413`。
- 该预检使用 `CODE_SIGNING_ALLOWED=NO CODE_SIGNING_REQUIRED=NO`，没有改 Xcode 工程版本、没有生成签名上传制品、没有上传 TestFlight，也没有改变测试组。当前工作区仍为 dirty detached worktree；正式上传仍必须从可定位 clean revision 生成签名 archive，并在真实设备上复验本轮 UI/手势。

## 2026-11-04 登录恢复后的生产只读复核（未部署）

- ECS Workbench 登录态已恢复并完成只读核对。生产目录 `/opt/projects/marvels-chat/app` 当前链接到 `releases/app-collaboration-20261103/runtime`，manifest 为 `app-collaboration-20261103-build54`、来源 `80d700945becdfa25b98ccad79f96dd2c038c17f8`、276 个文件；`marvels-chat-backend.service`、`marvels-chat-ai-task-worker.service`、`marvels-chat-media-retrieval-worker.service` 均 active，匹配运行服务共 3 个且只有 1 个 AI task worker unit。
- 生产环境脱敏核对显示 `PORT=4390`、`NODE_ENV=production`，未设置 `AGENT_WORKSPACE_MAX_CONCURRENT`。迁移账本实际为 54 项；当前线上 `051` 是 `051_user_ui_preferences.sql`，`to_regclass('public.ui_preference_previews')` 无结果，说明本轮 `051_ui_preference_previews.sql` 尚未部署。备份目录存在 `app-collaboration-20261103-schema54`、`ui-preferences-20261102-build55-schema51` 等恢复资料；本轮未执行迁移、停写、备份或恢复。
- 公网只读探针 `https://8.153.167.11/api/health` 与 `/api/ready` 均返回 `200`，ready 报告数据库已连接且迁移 current；这只证明旧生产版本健康，不证明本轮 workspace 并发、UI-Agent 或 UI preference API 已上线。
- 由于当前 worktree 仍为 dirty detached HEAD，`scripts/prepare-runtime-release.mjs` 按设计拒绝生成正式 runtime（`Runtime releases require a clean, committed Git worktree.`）。本轮没有绕过门禁手工打包、没有部署后端或迁移、没有发布 UI-Agent、没有上传 Build58，也没有修改 App Store Connect 测试组。
- 继续尝试以 `CODE_SIGNING_ALLOWED=YES CODE_SIGNING_REQUIRED=YES CURRENT_PROJECT_VERSION=58 -allowProvisioningUpdates` 生成正式签名 archive 时，`xcodebuild` 退出 65；当前钥匙串实读只有 3 个 Apple Development 身份，没有可用 Apple Distribution 身份或本地分发 profile，日志包含 Pods 的空签名身份和缺少 development team 错误。未修改 Xcode 工程文件，也未产生可上传归档。公网 `/api/agents` 只读结果中未发现 `ui-agent` 条目。

## 2026-11-04 Build58 Xcode Organizer 上传复核

- Xcode GUI 已使用 `Rose Wang Developer Team`（Team ID `R8K5DUTWB6`）成功归档 Build 58：`~/Library/Developer/Xcode/Archives/2026-11-04/MiaoxunRN 2026-11-4, 14.59.xcarchive`。归档 Bundle 为 `com.wangruoshi.miaoxun`，版本 `1.0 (58)`，`main.jsbundle` SHA-256 为 `285cbf360554dda2425a1cfddd2311b2c371f25dc6a53d8d5a520f8473157413`。
- Organizer 选择 App Store Connect 后显示 `Upload completed with warnings`，Build 58 已出现在 App Store Connect。警告仅为 React.framework、ReactNativeDependencies.framework、hermesvm.framework 缺少 dSYM，不是上传失败；这些 framework 的崩溃符号化仍不完整。
- 归档签名实际为 `Apple Development: Rose Wang (H867LX9BP6)`，TeamIdentifier 为 `R8K5DUTWB6`；工程 Debug/Release 均为 `CODE_SIGN_STYLE = Automatic`、`DEVELOPMENT_TEAM = R8K5DUTWB6`。钥匙串命令行当前只有 3 个 Apple Development 身份，没有 Apple Distribution 身份，但 GUI Organizer 已接受该归档并完成上传，故不能把命令行 distribution 身份缺失误报成 Build58 上传失败。
- App Store Connect 当前显示 Build 58 状态为“缺少出口合规证明”，尚未进入“正在测试”；现有内部/外部 `yunzhi` 群组仍关联旧构建，未修改群组或测试信息。出口合规声明需在 App Store Connect 的“App 加密文稿”页面由账号持有人确认后提交，本轮未代填或提交。
- 上传复核后未改业务代码；只读验证仍通过：RN UI 偏好/妙页/聊天贡献定向测试 3 suites、20 tests，后端 UI preference contract/service/routes 18 tests，workspace dynamic/runner/routes 16 tests，相关 JS syntax 与 `git diff --check` 均通过。
- 账号持有人确认后，Build 58 已提交出口合规选项“不属于上述的任意一种算法”。为保持现有 TestFlight 发布范围，复用旧构建测试内容 `1111`，将 Build 58 关联到内部 `yunzhi` 与外部 `yunzhi` 两个现有群组；外部群组当前显示 7 名测试员。App Store Connect 列表已更新为“正在测试”，本轮未创建新群组或修改群组成员。
- 合规处理后运行 `MIAOXUN_DOTENV_ENABLED=false ./scripts/check-repository.sh`，最终退出 0 并报告 `All repository checks passed`：仓库语法 42 文件、后端语法 369 文件；Backend 1270 项中 991 passed、0 failed、279 项 PostgreSQL 环境门控跳过；Agents 51、Admin 48、RN 81 suites/1053 tests 全部通过；Admin、avatar-web、media-retrieval-web 构建通过；`git diff --check` 通过。RN 仅保留既有 `VoiceShortcutDock` 的 React `act(...)` 警告，不影响测试结果。
- 为匹配已授权上传的 Build58，`backend/test/release-network-config.test.js` 的 Xcode 构建号断言由旧 Build54 更新为 Build58；这是测试基线同步，不改变 API origin 或 ATS 配置。
