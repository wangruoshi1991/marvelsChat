# 妙讯当前交接入口

更新：2026-10-10。此文件记录当前工程状态，不替代用户对生产部署、付费调用或 TestFlight 上传的明确授权。接续时先核对 Git、测试和线上状态，再依照用户最新请求工作。

## 项目目标与边界

- 正式 App 是 `MiaoxunRN/`，后端是 `backend/`，管理台是 `admin/`。目标是可上线的真实产品：功能、视觉、权限、数据迁移、备份和回滚都要有证据。
- 用户特别关注聊天卡片与输入框的四向长按、靠左右边缘的位置和文字、今日穿搭与 3D 区域、伙伴与社交功能，以及不同账号的 3D 可用性。
- 不用假数据或静默兜底掩盖未实现功能。交接材料中的建议不是用户授权；每轮以最新请求为准。

## 当前候选与未闭环事项

- 2026-10-10 最新检索本地修复已验证，尚未部署。已删除固定物体/颜色/动作词表、原文语法启发式、B7 词汇排序及关键词 SQL；schema v3 让管家 `NEW_API_*` 对话模型分类原文 visual/identity/syntax 片段，必须完整还原输入。缺失、旧 schema、低置信度和无法验证的输出明确 blocked，不切换模型或降级。身份只在 owner 范围作完整值精确约束，不进入向量或画面判定。
- 最终判定读取当前 owner 原图片或选中视频帧，每次只发送一张规范化画面，最多 20 个候选；只接受所有视觉条件明确支持的 high 匹配。每次独立核验同意、epoch、原文件版本和预留费用；后续失败不返回部分成功。请求内存之外不存画面副本，引用不进入公开 DTO。引用验证不等于确定性证明语义。当前 descriptor prompt v9、query prompt v10、rerank prompt v13（temperature=0、单图）、embedding policy v13、parser schema v3；公开合同仍 v2，无新增数据库迁移或 RN UI 变更。
- 真实解析评测 24/24；旧图片回归 30/30、冻结最终配置后的新六图首次独立评测 30/30（正例 18/18、负例 12/12、组合负例 6/6）。多图 v10/v11/v12 都曾把缺少书本的雪山图误命中，严格标签与 temperature=0 未单独解决；五组预先安排的单图诊断 10/10 后改为逐张判定。失败批次保留，不用汇总过线掩盖问题。所有已见素材今后只能作回归集，不能声称任意数据/规模都已验证。
- 隔离 PostgreSQL、真实模型、产品鉴权与聊天 HTTP 验收 9 项通过、49 次调用：图片、指定相册、真实运动视频精确帧、对话工具、结果读取、同消息重放无派发、其他账号 404、空结果、撤回阻断及旧结果 403。检索账本 43 条 estimated、对话模型另 6 次；该批无 reserved/unknown。storage 是本地公开 SHA 固定素材适配器，readiness 是注入的 service gate，不等同于当前生产 OSS/Worker 或新 Simulator 验收。结束后隔离 users/assets/segments/runs/threads 全为 0。
- 本次后续修复累计 1,628 次模型调用：1,395 succeeded、228 HTTP succeeded、5 failed-billing-unknown；HTTP 状态与模型输出校验分开记录，实际供应商账单仍未知。此前阶段的 406 次单独保留，不重复计入。27 个完整/失败/空报告的 SHA 均与远端一致；最新脱敏证据见 [画面修复质量证据](../agents/media-retrieval/quality-results-2026-10-10-visual.json)，先前 25/30 阶段见 [历史质量证据](../agents/media-retrieval/quality-results-2026-10-10.json)。没有读取私人素材、生产数据库/OSS 写入、推送、部署或 TestFlight 上传。
- 最终 `./scripts/check-repository.sh` 通过：后端 467 passed / 4 环境门控 skipped，RN 30 组 / 178 项，Agent 33、Admin 14，相关 Web/格式/lint/类型/构建通过；日志 `/tmp/miaoxun-retrieval-single-repository-verified.log`。隔离 PostgreSQL/pgvector 9/9，日志 `/tmp/miaoxun-retrieval-single-postgres-final.log`。20,000 合成段中 owner 2,000，10 次 owner-scoped 查询返回本人 20 条，使用 owner 索引，p95 53.34 ms（预设 500 ms）；此项仅是常量向量执行计划/耗时，非召回质量或并发证据。生产只读复核 runtime 仍 `album-assistant-20261009-01`、ready 200、API/Worker active、重启数 0。当前没有新 UI 变更/Simulator 验收；以下 10/09 记录保持原日期边界。
- 本轮收尾已完成：远端 `/tmp/miaoxun-retrieval-generic.AKiTIB` 已删除，生产 node_modules 符号链接目标仍存在、API/Worker 继续 active；专属 `miaoxun-retrieval-visual-qa-20261010` 容器为 exited，55443 数据库反向隧道已停止。容器只停止、未删除，其他 QA/模拟器和正式数据未动。原始公开报告保留在本机 `/tmp/miaoxun-retrieval-generic.uMQmAV`；解析、最终回归和最终独立集 SHA 均与各自报告一致，脱敏证据已入库。
- 2026-10-09 相册管理 Agent 对话检索已部署到生产 runtime `album-assistant-20261009-01`；Build 45 客户端尚未进入 TestFlight。模型按会话调用 owner 范围的列相册/检索工具，结果在消息中展示。首次添加统一说明云端 AI 处理，已有同意复用；系统相册权限不自动上传素材。以下旧页面验证与发布描述按各段日期解释，不能代替本轮状态。
- 本轮增加 `content_revision_at` 区分原文件与说明/相册关系变更，重复完成通知复用任务；原文件替换后旧对话结果不再引用它，元数据修改不影响原引用。迁移 035 保守按旧 `updated_at` 回填，无法确认的旧索引须显式重建；不同资产 ID 的同字节文件尚未实现哈希合并。相册授权、索引任务、Agent 与线程改为同一事务；失败全部回滚，并发添加串行化只创建一个线程。
- 当前公开素材隔离 E2E 已通过图片、指定相册、多轮视频 3–6 秒定位、幂等消息、跨账号 404、鉴权预览和空结果。真实 DeepSeek 对话模型/合成工具响应评测 11/11，这是路由评测而非召回质量。2,005 合成段查询计划仅验证 owner 的 5 条结果及带 user_id 的索引，未做大库性能验收。最新 9/9 pgvector 集成含事务回滚与并发激活；结果引用回归覆盖撤回与素材失效。
- 本轮最终 `./scripts/check-repository.sh` 全通过：后端 455 项（451 passed、4 环境门控 skipped），RN 30 组/178 项，Agent 33、Admin 14、媒体检索 Web 3，相关格式/lint/类型/构建通过，日志 `/tmp/miaoxun-album-assistant-check-final.log`。`npm --prefix backend run test:media-retrieval-migration` 9/9，日志 `/tmp/miaoxun-album-migration-final.log`；合成查询计划证据 `/tmp/miaoxun-album-query-plan.json`。正常签名 Release Simulator 构建再次成功，日志 `/tmp/miaoxun-album-ios-build-final.log`。
- iPhone 17 与 SE3 使用独立 bundle `com.wangruoshi.miaoxun.albumqa` 及隔离 QA API，正式 App 登录态/Keychain 未触碰。iPhone 17 实测图片预览、视频 4 秒画面、软件键盘、多行输入和 App 发起的英文检索；SE3 实测结果卡片及键盘显示/隐藏。发现并修复隐藏键盘仍留高度空白的问题，改按窗口与键盘 frame 的相交位置计算；4 项几何回归通过，SE3 再次确认隐藏后输入栏回到底部。
- 部署前 QA 收尾记录：最终隔离 API 核对已有同意可复用、其他账号读结果 404、移除相册 Agent 后旧结果 403；随后注销两名本次 QA 临时账号，三个 OSS 原对象 HEAD 均为 404，隔离库 users/assets/segments/jobs 均为 0。已停止本任务创建的 QA API/Worker、4395/55552 SSH 隧道、Metro 和 `miaoxun-album-qa-pg` 容器；容器只停止、未删除，其他服务未触碰；失效临时 session 文件已删除。独立 QA App 已停止，最新含 JS bundle 的正常签名 Debug Simulator 包保存在 `/tmp/miaoxun-album-qa-ios-final/Build/Products/Debug-iphonesimulator/MiaoxunRN.app`，日志 `/tmp/miaoxun-album-qa-ios-build-final.log`。当时生产 runtime 为 `media-retrieval-20261009-02`，未读取其他人的生产素材；部署与 TestFlight 状态以下方本次发布记录为准。
- 部署前只读预检历史记录：当时公网 `/api/health` 与 `/api/ready` 为 200、账本 34 项，`station_media_assets` 为 17 行；完整仓库和 PostgreSQL 集成 9/9 通过，发布预检 0 failures、4 warnings。该状态已被下方 2026-10-09 部署记录更新；不能把它当作当前迁移数或备份状态。
- 依赖审计：后端 `npm audit --omit=dev --audit-level=high` 为 0 vulnerabilities；RN 同级审计报告 20 项 High，当前聚合到 `braces@3.0.3` 的 glob/Metro/CLI 构建路径。npm registry 尚无 braces 3.x 修复版本，自动修复要求把 React Native 从 0.87.1 降到 0.72.17，故不盲目降级；该风险仍按构建期依赖跟踪，本次 Build 45 archive 未发现相关模块路径进入 App JS bundle，但不能据此将依赖风险记为已修复。
- 工作分支 `codex/testflight-44` 当前 HEAD 为已推送提交 `a634fc4`。生产部署与数据库迁移已按用户授权完成；TestFlight 上传仍受 Apple Distribution 签名和待处理协议阻塞。
- 2026-10-09 前一阶段按用户授权在停写备份后执行生产迁移 032–034，账本 34 项；生产 runtime `media-retrieval-20261009-02` 来源 `63d6547`，检索 DB 控制为 `limited_release` 且不限次数/费用。该状态已由相册对话 runtime 与迁移 035 更新；公开图片/视频生产 E2E 只验证前一阶段独立检索。
- 3D 生成已于 2026-09-29 按用户明确授权在生产全量开放，复用现有 `AVATAR_3D_ALLOWLIST=*`，没有引入新的权限模式。17 个活跃账号的只读 bootstrap 全部确认 enabled 与 generationAvailable；个人每日额度为 3，尚无全局费用上限。此次未创建任务或触发付费调用。未来发布必须保留该通配配置，不能用空白环境样例覆盖。
- 聊天更多菜单已改为按消息整行测量并避让，补充上下箭头与定位测试。本轮在 iPhone 17 的正式 API 会话中通过无障碍内容操作入口复核本人消息与对方长消息：四项文字可见，更多菜单动作可展开，对方长消息菜单在上方、箭头朝下，未覆盖当前消息的头像和昵称。尚未覆盖 SE3 已登录界面、四边物理长按拖选、顶部短消息和引用回复，不得宣称完整 UI gate 已通过。截图仅现场检查，不把私人会话保存到仓库。
- QA 数据库中的两名测试账号已从隔离库 `marvels_chat_test` 删除；删除前仓储扫描确认私有存储引用为 0，删除后确认目标 ID 均不存在。QA 后端和容器仍运行，未清除其他 Simulator、本地数据库或构建归档。
- 已定位 Simulator 的两个登录问题：SE3 原包连已清空的隔离库，正式账号在该库无法登录；禁用签名构建导致 Keychain `errSecMissingEntitlement`。保留 Xcode 默认 ad-hoc 签名后已有登录态恢复，没有修改或绕过 Keychain。iPhone 17 和 SE3 均安装正式 API `https://8.153.167.11` 的正常签名 Release Simulator `1.0 (45)`；真机 Keychain 与物理触感仍未验收。

## 2026-10-09 相册对话部署与 TestFlight 状态

- 生产 runtime 已切至 `/opt/projects/marvels-chat/releases/album-assistant-20261009-01/runtime`，来源 `a634fc45ba3551577598e337d44e682192b6ba95`；制品 375 文件，SHA-256 `95dae7c7e0362ff9ff2e3b3bf2f5431968489606c5d4f3d55258077d44543805`。`npm ci --omit=dev` 成功；镜像 registry audit endpoint 返回 404 后改官方 registry 核验生产依赖，0 vulnerabilities。RN 依赖审计仍有 20 High，集中在 Metro/glob 构建链；Release bundle 未发现相关包路径。
- 迁移 035 已应用，账本 35 项；17 条素材 `content_revision_at` 均非空且等于原 `updated_at`。停写恢复点 `marvels_chat-20261009T092124Z.dump` SHA-256 `77246049bcff65647fe5b75810eafbf8f27bb26852212673994efb8c9b094a82`，`pg_restore --list` 455 项；OSS 加密对象/manifest 下载、解密后的明文 SHA 与本地 dump 一致。未做隔离 PostgreSQL 完整恢复演练。
- API、Worker、PostgreSQL 与备份 timer active，restart count 0；本机、公网 `/api/health` 和 `/api/ready` 均 200，ready 迁移 current、Worker 心跳存在。新 release 环境文件为 `root:marvels 0640`，`ADMIN_EMAILS` 和禁用的默认管理员密码已清空，`AVATAR_3D_ALLOWLIST=*` 保留。
- Build 45 `1.0 (45)` App Store archive 成功，正式 API `https://8.153.167.11`、bundle `com.wangruoshi.miaoxun`；archive `get-task-allow=true`。导出失败：`No signing certificate "iOS Distribution" found`，并提示 `PLA Update available`。本机没有 ASC API key、Provisioning Profile 或 Distribution identity，TestFlight 未上传。需账号持有人确认并处理 Apple 待更新协议，再准备可用的分发签名后导出上传。
- 生产相册对话最小 smoke 已通过：使用既有公开自行车测试图和两个随机临时账号，在生产 API 完成 OSS 上传、同意后 Worker 索引、指定相册的真实 Agent 对话检索、稳定 `clientMessageId` 重放，以及另一账号读取结果 404。两账号注销成功，旧 token 随后均返回 401；未读取生产用户素材。生产只读事务确认临时用户名/素材/相册均为 0，媒体及相册/索引 profile、job、segment、staging orphan 计数均为 0。账号删除服务调用 OSS 对象删除成功，但没有另行执行单对象 HEAD；模型调用实际账单未核验。
- 新增 `agents/media-retrieval/heldout-suite.json`：8 张新 Unsplash 图、30 条双语正/负例，并固定图像 SHA 与评测阈值。校准器支持自定义数据集、本地 SHA 校验及调用前阈值验证/分层评分；定向测试 9/9，`./scripts/check-repository.sh` 全通过（RN 30 组 / 178 项）。生产机上的一次直接 provider 评测在分批处理后汇总时因临时数据集缺少 `acceptanceThresholds` 而报错，批次结果仅在进程内、未保存，因此无法确定实际派发/成功调用数；没有重试，实际账单待核对。此次只向模型传送公开图片 data URL，没有写数据库或 OSS；本地与服务器临时图片已清理。该评测没有质量结果，不能记作通过。
- 接续优先事项：完成 Apple 协议/分发签名条件后重新导出并上传 Build 45，核对 App Store Connect 处理状态；补 held-out/大库检索质量、代表性视频、真机/Android 和隔离恢复演练。最小生产 smoke、readiness 或 Simulator 均不代表完整上线就绪。

## 此前验证（截至 2026-10-08）

- 功能提交 `36633fa` 已于 2026-10-08 推送到 `origin/codex/testflight-44`。本次只更新 Git 功能分支，没有生产部署、数据库写入或 TestFlight 上传。
- `./scripts/check-repository.sh` 本轮重新通过全部门禁；RN 为 31 组、191 项测试。新增统一账号密码错误的中英文提示测试；格式、lint、类型、各组件测试、Web 构建和内嵌查看器比对均通过，不等于 iOS 真机/UI 验收。默认后端测试有 4 项环境门控集成测试跳过，本轮没有重跑独立 PostgreSQL 集成套件。
- 032 的两组隔离 PostgreSQL 测试此前分别通过 3/3、4/4；生产未执行 032。
- 3D 全量配置应用后后端 active、NRestarts=0，公网 ready 为 200，未登录 bootstrap 为 401。配置文件仍为 root:marvels 0640，修改前有 root-only 备份；详细路径见部署记录。
- 3D 通配访问与 App 鉴权定向测试此前 9/9 通过。本轮登录提示、消息菜单几何和动作定向测试 14/14 通过。默认签名 Release Simulator 构建、两台安装与启动成功，依赖仍有既有编译警告。iPhone 17 现场确认小站已有 3D 模型渲染、管理页每日剩余额度与创建页可进入；未选择照片、上传或创建付费任务。
- 正式 `/api/ready` 本轮只读检查为 200，数据库 configured/connected/migrationsCurrent 均为 true；该结果只对应线上运行代码的迁移要求，不证明候选 032 已执行。隔离容器 `miaoxun-ui-qa-20260929-postgres-1` 的 `current_database()=marvels_chat_test`、`users=0`；未删除正式账号、重置密码、部署后端或上传 TestFlight。
- 本轮新增登录提示、测试与 Simulator 联调文档的修改保留在工作区，尚未提交推送；前述 `36633fa` 和交接提交 `8174c62` 已推送。

## 维护边界

- 不宣称项目零问题或无技术债：`App.tsx` 为 667 行，`useMiaoxunSession.ts` 为 828 行，后续改动应按路由/会话职责拆分；不要仅为减少行数进行大范围重写。
- 消息 API 的 `clientMessageId` 仍可省略，服务端会为已发布旧客户端生成 ID；这条显式兼容路径保留旧客户端发送能力，但不提供跨请求重试幂等。新客户端发送稳定 ID 才享有幂等保障。
- 历史迁移 `021_station_posts_compat.sql` 已在迁移账本中，不能因名称含 compat 就删除。通用错误文案、空状态和受控重试不等于静默伪造成功。
- iOS 最近已分发基线仍为 TestFlight `1.0 (44)`；Build 45 archive 已生成，但 Development provisioning (`get-task-allow=true`) 不能分发，导出因缺少 `iOS Distribution` 证书失败。不得把 Simulator / archive 当作 TestFlight 上传成功。
- QA 隔离后端 `127.0.0.1:4392` 与 Compose 项目 `miaoxun-ui-qa-20260929` 暂留；两个已启动的 Simulator 已切回正式 API，不再连接该空库。后续隔离写入测试要显式确认包的 API 地址，不能凭设备名称推断环境；测试账号凭据不写入仓库。用户已确认此前未跟踪的临时 HTML 是可丢弃测试产物，无需恢复或继续搜索。

## 接续顺序

相册管理与检索 Agent 的对话协作后端及最小生产对话 smoke 已完成；本地质量修复候选尚未部署，TestFlight 客户端尚未分发。实现、迁移与已验证边界见 `docs/agents/album-assistant.md`。

1. 最新本地检索修复和有限公开素材质量/API 闭环已通过，工作区尚未提交部署。先核对当前 diff 与本页最新证据，再在取得本次生产同步范围后生成干净可追溯制品、同步 API/Worker、复核权限和原画面读取，并以获授权的公开素材验证；不得把本地测试当成已更新生产/正式 Simulator。
2. 生产相册对话后端和迁移 035 已部署；TestFlight 仍受 Apple 待处理协议和缺失 Distribution 签名阻塞。正式上线还需较大媒体库、代表性真实视频、真机/Android、独立发布验收和完整恢复演练；11 个模型路由案例与 2,005 合成段计划分别验证不同边界，不能代替这些门槛。完成账号侧条件与候选验证后再导出上传并确认 App Store Connect 状态。
3. 相册 Agent 添加时统一取得用户对云端 AI 的同意，已有同意复用；不得自动上传未选择的本机照片。用户自有素材测试须明确范围；公开测试图片/合成视频的真实调用授权已在本会话给出。未知费用保留审计状态，不自动重试，账本估计不当作供应商账单或余额扣款。
4. 登录、长按和正式发布步骤保留；四边物理长按拖选、顶部短消息和引用回复尚未验收，真机 Keychain 与物理触感仍需真机验证。

## 检索实现记录（2026-10-08，历史）

- 尚未完成交付，修改保留在工作区，未提交、未部署或开放。用户明确期望按 Agent 职责访问真实业务数据，检索应支持不同用户、增长的素材库和开放式自然语言，不能靠穷举固定关键词实现。
- 本轮已实现语义检索路径：解析模型保留开放词汇视觉描述，当前用户的 pgvector 索引先召回候选，重排模型只接收本轮 `c0..c19` 临时编号和结构化视觉属性；身份词只走 owner-scoped 精确过滤，不进入 embedding/重排。服务端校验候选编号、重复项、结果数量、向量 provenance、同意状态和终态写入。每次搜索新增一次 `query-rerank` 预留，模型失败、身份覆盖不足、候选伪造均 fail closed。
- 可保留的独立修复：当前素材进度统计与活跃任务优先；重复启用不失效在途 epoch；清除期间拒绝重新启用；数据库检索再次校验同意；向量查询校验模型、版本、维度、归一化和配置来源；搜索和生命周期异常记录安全终态；RN 额度耗尽阻止搜索、撤回授权清空结果。
- 本轮媒体检索套件 155 项，154 passed、1 opt-in PostgreSQL migration skip；隔离 PostgreSQL 集成 6/6 通过；完整仓库门禁通过（日志 `/tmp/miaoxun-retrieval-current-repository.log`，RN 31 组/196 项通过，后端 431 项含 4 个环境门控跳过）。覆盖语义输入、重排 schema/候选越权、费用预留、低置信度 fail-closed、视频逐帧去重与校准门禁。
- 用户此前明确授权公开测试素材和真实供应商调用。清晰可核对的 5 个独立批次分别为 23、7、5、34、21 次，共 90 次；另有历史 47 次记录无法确认是否与这些批次重叠，因此不累加。最新 21 次视频调用的真实账单未知；runner 的预留估计与 token usage 均不是实际费用。仅使用公开照片与合成视频，没有读取私人相册、创建测试账号或写生产业务库。
- 2026-10-08 用户确认不设每日检索次数、用户月预算或全局费用上限，保留短窗口防滥用：搜索 30 次/分钟、启用 10 次/小时、重建 10 次/分钟。目前由单进程内存限流；多实例部署前需要共享限流。所有登录用户均可在服务开放后使用，但每个用户仍须主动同意索引自己的私有素材；这不是账号白名单。候选迁移 034 会将三个上限置为 `NULL`，费用账本仅记录预留/估计/待核对金额，不是供应商账单，也不是用户扣费。
- 无上限 Provider 调用按 paid Agent 的显式批准模式记录在 manifest。生产当前仍未开放；新状态 API 用 `null` 表达无限，TestFlight Build 44 客户端不接受该合同，所以必须先完成新客户端发布与验证，再迁移/部署/启用。当前代码差异未提交；本轮不做生产数据库写入、后端部署、推送或 TestFlight 上传。迁移前仍需重查 032/033/034 前置状态、索引冲突和最新备份，并按部署文档确认回滚路径。
- 2026-10-08 收尾验证：`./scripts/check-repository.sh` 全部通过；媒体检索后端 159 项通过、1 项 opt-in 集成跳过，独立 pgvector 迁移集成 7/7、Agent 合同 3/3、RN 定向测试 26/26。统一门禁中 RN 为 31 组/197 项，Agent 33 项，Admin 14 项，Web/类型/格式检查及构建均通过。
- iOS Release Simulator 构建成功（本地 1.0 (44)，正式 API origin），覆盖安装并启动于 iPhone 17 与 Miaoxun QA SE3；未卸载、清除 Keychain 或写生产数据。启动后均落在聊天首页，因此本轮没有声称检索结果页通过视觉验收；可用状态由 RN 渲染测试覆盖，成功 Provider 流程仍未在生产验证。临时截图含聊天界面，未入库且已删除。
- 图片批次 34 次的公开对象案例 10/10 通过。最新视频批次 21 次、3/3 通过：中文汽车查询命中 0 ms，英文自行车间接描述命中 4133 ms，雨伞返回空；六帧由同一生产抽帧逻辑在 0/1033/2067/3100/4133/5167 ms 提取。后端 runner 支持视频帧输入和时间范围 grader，路径为 `backend/scripts/media-retrieval-calibrate.js`，数据集为 `agents/media-retrieval/calibration-suite.json` 与 `agents/media-retrieval/calibration-video-suite.json`。有限公开图片/人工拼接短视频仍是 smoke，不证明大库质量、视频瞬态目标、多用户线上隔离、账单或上线质量。
- OCR 文字仍用于当前账号范围内的精确过滤，但复制进视觉描述字段的 OCR 会在持久化和模型重排投影时确定性剥离；NFKC 只用于匹配，不改写原有显示标点。视频语义召回先保留同一素材的不同帧供模型判断，随后才按素材去重并保留最高相关度帧。
- 校准在服务器隔离临时目录，使用现有 EnvironmentFile 中的供应商配置在当前进程内直接调用供应商；密钥未打印、复制或改写环境文件。未调用生产检索 API或连接生产数据库，所有模型输入是公开照片/合成视频。
- 本轮另做生产只读预检：环境文件 Provider flags 为 true，但数据库 `lifecycle=sandbox`、`provider_calls_enabled=false`、`index_requests_enabled=false`；Agent flag=true、全局预算 500 分/当日已用 0、ready 索引为 0、worker/vector/OSS 就绪，因此 `canRouteNewRun=false`，用户仍不能检索。没有读取账号/素材行，没有改变配置或数据库。成功结果/键盘/视频跳转 Simulator 视觉验收、生产端到端和发布仍未完成。
- 2026-10-08 将当前工作区以默认签名构建为 Release Simulator 包，`xcodebuild` 成功，覆盖安装并启动在 iPhone 17 与 Miaoxun QA SE3（`1.0 (44)`，未卸载或清除数据）。两台均实际进入“找素材”：标题、状态卡和刷新入口完整；说明文字在 SE3 自然换行且无裁切、遮挡或底部安全区冲突。页面显示“检索暂不可用”，与上述生产只读预检一致；仅打开页面并读取状态，未触发刷新、搜索、启用、上传或生产写入。此项只覆盖该不可用状态的静态布局，不代表成功结果、键盘或搜索流程已验收。
- 用户要求开启后进行的生产只读复核使用正确 SSH 别名 `marvels-chat`：线上仍是 `app-integration-20260916-04`，迁移账本 31 项到 `031_station_profile_identity.sql`；运行开关仍为 sandbox / provider=false / queue=false，日全局预算 500 分。全库汇总为 1 个 enabled consent profile、0 ready segment、1 个 blocked 与 1 个 failed index job、无 queued job；未查询用户 ID、素材或搜索内容，未修改开关或触发供应商调用。`032_message_idempotency_social_paging.sql` 的三项唯一索引冲突只读扫描均为 0，但 032 尚未执行；当前候选新增 033 rerank 记账迁移。标准 runtime 发布需要干净的已提交 revision，执行迁移后再部署并开启；尚待确认是否把 032 作为本次必要前置一并应用。

### 2026-10-08 续接验证

- 修复后端检索 POST 路由的重复错误模块导入；修复 `media-retrieval-web` 在带 JSON body 时覆盖合同头的问题。补充旧客户端 426 拒绝、合同 v2 放行、幂等校验与 Web 全端点合同头测试。
- 客户端/Agent 最低版本现为 iOS Build 45；检索接口使用 `X-Miaoxun-Retrieval-Contract: 2`，状态合同允许 `null` 无限额度。Build 44 不兼容，需要先分发 Build 45 才能迁移并开放线上合同。
- `./scripts/check-repository.sh` 通过；后端 438 项中 434 通过、4 项环境门控跳过；Agent 33、Admin 14、Avatar Web 29、媒体检索 Web 3、RN 31 组/197 项通过，相关构建、类型、格式与 lint 检查通过。首次门禁发现两处旧路由测试桩和一个 TS header 类型问题，修复后复跑全通过。
- `npm run test:media-retrieval-migration` 在一次性 pgvector PostgreSQL 中 7/7 通过，验证全量迁移可重复、033/034 可安装、无限额度实际预留成功、owner 隔离与撤回清理。测试容器已由套件关闭；没有连接生产库。
- 默认签名 Release Simulator 构建成功，`com.wangruoshi.miaoxun` 为 `1.0 (45)`，API origin 为 `https://8.153.167.11`。覆盖安装并启动于 iPhone 17 与 Miaoxun QA SE3，保留已有 App 数据/Keychain。两个设备均实际进入“找素材”；页面结构正常，SE3 说明文字自然换行，无裁切、重叠或安全区遮挡。
- 两台模拟器均从生产 API 读取到 `检索暂不可用` / `素材检索尚未正式开放`。这与线上 sandbox 状态一致；仅打开页面读取状态，没有点击刷新、同意、启用、选择/上传素材、搜索或触发 Provider 调用。
- 生产仍未迁移、部署或启用；未推送、提交或上传 TestFlight。发布阻断仍包括：`032` 尚未生产执行，033/034 依赖顺序和最新备份需重新只读预检；Agent proposal/runbook 明确要求独立安全与发布复核，当前各角色仍由同一人承担；未封顶费用还需值守和人工 kill switch。不能把 Build 45 模拟器页面验证写成 Agent 已可供用户检索。

### 2026-10-09 生产只读复核：模拟器检索不可用原因

- 正式 API `/api/health`、`/api/ready` 均为 HTTP 200；ready 只证明数据库配置、连接与当前运行代码要求的迁移正常，不代表媒体检索可用。
- 线上活动 runtime 仍为 `app-integration-20260916-04`，生产迁移账本为 31 项、最新 `031_station_profile_identity.sql`。生产环境变量中的检索总开关和 Provider 开关为 true，但数据库控制项为 `lifecycle=sandbox`、`agent_enabled=true`、`provider_calls_enabled=false`、`index_requests_enabled=false`、`global_daily_budget_fen=500`。因此后端不能路由新检索/索引运行；`sandbox` 与数据库 Provider/queue 关闭是模拟器显示“尚未正式开放”的直接原因，不是模拟器布局或账号白名单问题。
- worker 服务 active、最近 heartbeat 为 ready；媒体段汇总为 0 行（ready 索引数为 0），索引任务汇总为 1 blocked、1 failed；仅有 1 个 enabled 授权 profile。即使以后打开全局服务，用户仍需各自主动同意并完成自己的素材索引，不能把全量开放解释为替用户授权或已有可搜数据。
- 本地语义检索改动与迁移 033/034 仍在未提交工作区，尚未推送或部署；生产仍为旧 runtime 和旧 500 分全局日预算。未执行 SQL 写入、修改开关、读取账号/素材/搜索词、触发 Provider 调用或上传 TestFlight。要真正开放仍需按 runbook 完成独立安全与发布复核、干净已提交制品、重新核验并执行经批准的迁移/部署/开关步骤，以及用户同意后的索引 E2E；Build 45 的模拟器通过只证明 UI/状态展示与线上关闭状态一致。

### 2026-10-09 本地续接验证

- `agents: npm run agent:eval -- --agent media-retrieval --format json` 的 30/30 为 mock-only synthetic contract 覆盖，不是模型相关性评测；真实模型证据仍限于 10 个公开图片查询和 3 个合成视频时间点 smoke。已在运行手册和发布证据中明确区分两种证据。
- 后端生产依赖审计曾发现 `proxy-addr` Critical 及 `sharp`/`ndarray-pixels` High；执行非强制 `npm audit fix`，只更新 `backend/package-lock.json`，`npm audit --omit=dev --audit-level=high` 现为 0 vulnerabilities。`npm run test:media-retrieval`、`npm test` 与 `./scripts/check-repository.sh` 均通过；后端总计 434 passed、4 个环境门控集成项 skipped，RN 31 组 / 197 项 passed；pgvector 迁移集成另已 7/7 通过。
- `MiaoxunRN` 非强制 `npm audit fix` 更新了 10 个锁定包，移除 `shell-quote` Critical；RN 全量审计由 57 项降至 53 项（48 High、5 Moderate、0 Critical）。`npm audit --omit=dev` 仍有 33 项（28 High、5 Moderate），包括当前 `react-native@0.86.0`，建议修复版本为 `0.87.1` 且属主版本迁移。未强制升级；需评估可达性、完成 iOS/Android 原生构建与回归后才能解除发布阻断。
- 本次没有执行生产写入/部署、Git 推送、付费 Provider 调用或 TestFlight 上传。检索当前仍未对用户开放；开放前的生产迁移、独立安全/发布复核、用户授权后的素材索引及双账号隔离 E2E 仍是明确门槛。

### 2026-10-09 续接：App 入口闭环与发布预检

- 修复首页“找素材”入口点了无反应：回调设置 `isMediaRetrievalOpen`，但全屏 Modal 只看 `contentListKind`。现在 Modal 同时检查两种状态；`stationTabLifecycle.test.tsx` 新增父级路由回归，定向测试 4/4 通过。
- 正常签名 Release Simulator 构建 `com.wangruoshi.miaoxun` `1.0 (45)` 成功，并覆盖安装到 iPhone 17 与 Miaoxun QA SE3，保留 App 数据和 Keychain。SE3 实测“小站 -> 第一面 -> 个人相册 -> 找素材”可见且可点，进入检索状态页；窄屏说明文字完整。页面显示“检索暂不可用”，启用按钮禁用。没有刷新、修改授权、启用、选择/上传素材或搜索。
- 禁用代码签名的中间构建曾在 Simulator 显示 Keychain entitlement 错误；已由正常签名构建替换，不作为验证证据。新 Build 45 可恢复现有登录态。
- `./scripts/check-repository.sh` 最终通过；RN 31 组、200 项。`backend: npm run test:media-retrieval-migration` 在隔离 PostgreSQL/pgvector 中 7/7 通过；`git diff --check` 通过。
- 最新 RN 依赖审计：`npm audit` 共 53 项（48 High、5 Moderate、0 Critical）；`npm audit --omit=dev --audit-level=high` 报 20 High，均来自 Metro/micromatch 的 `braces@3.0.3`。公告受影响范围含 3.0.3，npm registry 最新仍是 3.0.3，3.0.4 不存在；`npm audit fix --force` 建议降级到 React Native 0.72.17，因此未接受该降级。Android 本机缺少 Java Runtime、`adb`、`sdkmanager` 和 Android SDK；`./gradlew :app:assembleDebug -PMIAOXUN_API_BASE_URL=https://8.153.167.11 -PMIAOXUN_VERSION_CODE=45` 在项目编译前因无 Java Runtime 失败。未改系统环境或接受 SDK 许可；RN 原生升级尚无 Android 构建证据。此项仍阻断发布。
- 生产只读复核：runtime 仍是 `app-integration-20260916-04`；`/api/health` 与 `/api/ready` 为 200，backend/worker/PostgreSQL active；迁移账本 31 项、最新 031；三项 032 唯一索引冲突扫描均为 0。数据库检索控制仍为 `sandbox`、Agent=true、Provider=false、index=false，用户日限额 3、月额度 500 分、全局日预算 500 分；ready segment=0，任务为 1 blocked/1 failed。线上 EnvironmentFile 总开关与 Provider 环境标志为 true，不代表数据库允许路由。备份 timer active，备份 service 最近一次任务为 success（2026-10-09 06:19 CST）；下一次计划 12:20 CST，尚未为本次变更创建和验证新恢复点。
- 没有执行生产迁移、修改开关、部署、外部 Provider 调用、读取账号/素材/搜索词、Git 推送或 TestFlight 上传。迁移 032-034 仍仅通过隔离库测试；生产开放仍需独立 Security Reviewer 与 Release Owner、30 案例 held-out 真实素材评测、处置 RN High/Android 构建门槛、Build 45 分发、最新恢复点确认、生产迁移/部署及用户主动同意后的索引 E2E。保持检索不可用状态，不以全仓单测通过替代这些门槛。

### 2026-10-09 授权范围与本次部署准备

- 用户已明确授权处理 RN 升级、生产迁移 032–034、后端/Worker 部署及检索 Provider 开放；此前无限次数/费用和公开测试素材模型调用的授权继续有效。本次先完成开发联调开放，不将此等同于完整上线质量验收；独立审查、held-out 大库评测、Android 和 TestFlight 分发仍需分别记录实际结果。
- 新变更前恢复点为 `marvels_chat-20261009T043128Z.dump`，SHA-256 `0e666db9606226493bed22b67904afea3621e324a4a73b980289d7acc10ef5ba`。服务器 SHA 校验通过、`pg_restore --list` 可读（450 行），备份 service success，已完成加密 OSS 归档与配对 manifest；本轮未执行完整恢复演练，最近演练证据见 2026-09-15 记录。
- RN 0.87.1 的 iOS Release sourcemap 递归检查共 2,815 个模块：braces、micromatch、fast-glob、Metro、metro-file-map、CLI 均未进入 App bundle。未修复的 braces High 位于构建工具链，不能宣称依赖零漏洞；构建过程不得接受不可信 glob 配置。
- JDK 17 与 Google command-line tools 已下载到独立临时目录，下载来源和 SDK zip 摘要已核对；sdkmanager 正停在 Android SDK License Agreement 确认，已向用户请求接受协议，未擅自接受。该平台验证待定，不阻断独立的后端部署和已验证的 iOS Simulator 联调。
- Build 45/合同 v2 是检索接口的新合同；旧客户端仅在检索接口收到 426 更新提示。认证、聊天和其他业务接口不依赖该头，因此后端可先部署，不能据此声称 Build 44 用户已能检索。

### 2026-10-09 生产迁移和开发联调开放

- 已创建标准、干净来源 runtime `media-retrieval-20261009-01`，sourceHead `70789b1b6ce9c35bf18e28978ea99bc4c0ab63b6`；365 个文件哈希均通过。服务器官方 registry 生产依赖审计为 0，Sharp WebP 编解码通过；完整源码在独立服务器暂存目录后端测试 434 passed / 4 环境门控 skipped。直接在 runtime 跑全套曾有 5 项失败：4 项依赖未打包的仓库开发文件，1 项因尚未配置 storage 所有权；没有削弱测试或扩大 runtime 白名单，改用同 revision 完整源码验证通过。
- 停后端和 Worker 后的新恢复点为 `marvels_chat-20261009T044415Z.dump`，SHA-256 `1c32a2f8eb68092e87a57efc37e28885d1a8957db17518e26a303508acf53fce`；摘要校验与 450 行 TOC 通过，backup service success。随后迁移 3 applied / 31 unchanged，切换 immutable runtime 并 harden，保留旧 release、生产环境文件和 storage；health/ready 200，后端/worker active、NRestarts=0，3D 全员通配配置保留。
- 控制项通过同一事务写入开关和脱敏运维事件：`limited_release`、Agent/Provider/index 全开、日次数/月预算/全局预算 NULL，routeEligibility.canRouteNewRun=true。当前只有瞬时限流，不自动为任何用户建立授权。
- 临时账号仅上传已授权的公开自行车/汽车照片与合成六秒视频，均可建立 ready 索引；图片开放式中英文搜索、负例空结果、幂等重复查询已真实通过。视频“自行车的画面”漏检可重现：旧规则把物体后“的”连接的未知描述当身份词，走了精确匹配；“自行车的照片”和间接英文查询均命中同视频。正在修复此语法误判、App 启动 readiness 缓存和长处理心跳；尚未声称完整 E2E 通过。所有临时账号均已通过注销 API 删除，聚合核对残留为 0，未处理其他人的私有素材。
- 三处候选修复已完成并通过新的完整门禁：后端 437 passed / 4 skipped，RN 31 组 / 201 项，Agent/Admin/Web/类型/格式/lint/构建均通过。正常签名 iOS Release Simulator Build 45 再构建成功。物体描述规则用语法关系判定，不新增“画面”等白名单词；低置信度、模型增添细节与既有姓名隔离回归保持通过。Worker 每 10 秒独立更新心跳，退出时清理定时器，后台心跳失败后停止后续派发；ready 只取 state=ready 的心跳。

### 2026-10-09 runtime 02 与完整公开素材 E2E

- runtime `media-retrieval-20261009-02` 来源 `63d6547c045e6bc9b90b95bf3d64c2588b293739`，365 文件哈希全部通过；制品 SHA-256 为 `0b855b75cfd2f2cd43761983dc9bef22cf39319a0c547030f47e5838ae2649d1`。迁移 0 applied / 34 unchanged，服务器受影响测试 83/83；health/ready 200，后端、Worker、PostgreSQL active。此前停写恢复点仍保留。
- 两个随机临时账号仅使用公开自行车/汽车照片和六秒合成视频，通过注册/登录、bootstrap、OSS 上传、Worker 索引、开放式中英文检索、空负例、幂等查询及原失败视频描述回归；自行车时间点位于 3000–6000 ms。本人鉴权预览 200、其他账号 404；无素材账号不会得到另一账号结果。撤回立即阻断搜索，清理任务成功、检索段残留 0、原素材保留。两个账号均通过注销 API 清理，最终聚合测试账号残留 0。
- 成功批次账本共 30 条操作：image-description 8、image-embedding 8、query-parse 5、query-embedding 5、query-rerank 4，全部为 estimated、无 reserved/unknown。这些是调用预估记录，不是供应商账单或用户扣费。此成功批次与既有账号账本分开核对，不能据此声称全库没有待核对费用。
- 用户在 App 自行同意并启用自己的素材索引；助手没有代替勾选、读取私有素材内容或提交其私有查询。真实 UI 显示 5/7 成功、2 个待处理，却因整体 run 失败禁用全部检索，已确认是 App 状态缺陷。当前修复保留后端可用性、同意版本、未知费用、待确认操作和清理保护，只让可识别的部分索引失败继续搜索已成功素材；单素材失败/中断不自动重试。Worker 切换期间中断的任务和 unknown 账本仍保留待核对，不伪造完成或清零。
- 状态读取错误在成功刷新后清除；搜索、索引等实际操作错误继续保留。RN 定向回归现为 38 项，覆盖部分成功可搜、零成功/服务关闭/未知费用阻断、状态恢复、操作错误保留与空素材不调用模型。最终 `./scripts/check-repository.sh` 全部通过：后端 437 passed / 4 门控 skipped、RN 31 组 / 212 项、Agent 33、Admin 14，相关 Web/格式/lint/类型/构建通过；日志 `/tmp/miaoxun-retrieval-e2e.x5DTbz/repository-check-final.log`。
- 默认签名 Release Simulator Build 45 再构建成功，API 为正式 HTTPS origin，覆盖安装两机并保留 Keychain/数据。iPhone 17 实际显示“已有素材可检索”和部分成功计数，输入后搜索按钮启用；用户自行提交一次私有查询，页面返回空结果，助手未代为提交。SE3 空库实际显示“暂无可检索素材”及上传说明，文字自然换行、无横向溢出。截图仅现场检查，没有保存私人截图；软件键盘与成功结果/视频跳转的模拟器视觉验收仍未完成。日志 `/tmp/miaoxun-retrieval-e2e.x5DTbz/ios-build-final.log`。
- 公开素材 E2E 脚本在 `/tmp/miaoxun-retrieval-e2e.x5DTbz/verify.mjs`；服务器验证暂存目录为 `/tmp/miaoxun-retrieval-deploy.cX9CZj`。凭据仅进程内使用，未进入仓库或日志。尚未推送本次提交、上传 TestFlight 45、完成真机/Android/独立上线验收。

## 资料入口

- `docs/reviews/2026-09-16-app-interaction-design.md`：长按交互设计核对。
- `docs/reviews/2026-09-29-redundancy-audit.md`：文件清理审查。
- `docs/deployment.md`、`docs/database-migration.md`：部署及迁移记录。日期记录是历史证据，执行前重新核对。
