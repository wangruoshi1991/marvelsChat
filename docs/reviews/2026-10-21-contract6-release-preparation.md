# 合同6配套发布准备

2026-10-21的准备与后续模型验收快照，及2026-10-22本地发布候选记录。实时状态仍以[CURRENT](../handoffs/CURRENT.md)、Git和发布时实际运行核对为准。准备阶段没有付费模型调用；随后获准的12次真实合成评估发现1例语义失败，本地修复后另获3次授权复测并通过AI语义审阅。准备与模型验收期间没有Git提交，后续本地提交见文末Git整理节；各阶段均无生产变更、TestFlight上传或Git推送。

## 范围与结论

目标是把默认管家、同任务续作、原任务讨论、专业Agent统一任务和UTF-8文本文件处理配套发布。当前本地合同为`aiTasks:1 / siteDocuments:2 / agentWorkspaces:6`，迁移截至043；最后已核验的分发版本仍为TestFlight 1.0(51)、合同3。2026-10-22已从干净HEAD生成本地合同6候选、Build52 archive及App Store签名IPA；尚未上传，不能与旧后端作为可混用版本。

**发布结论：BLOCKED（本地候选准备完成，配套发布尚未闭环）。** 可定位源码、本地runtime及分发签名IPA已建立；用户已于2026-10-22接受既有AI复审并豁免本批真人复核，但Apple服务器验收、生产恢复点、第三方符号处理决定和真机证据仍未齐备。不能由小样本AI审阅、本地编译或模拟器样例通过推断可上线。

## 门禁与证据

证据根目录：`/Users/gary/Library/Application Support/MiaoxunReleasePreparations/contract6-release-preparation-20261021-120344/`。2026-10-22 候选证据另见 `/Users/gary/Library/Application Support/MiaoxunReleasePreparations/contract6-candidate-20261022-b8da29b/`。

| 门禁 | 状态 | 已知证据与实际限制 |
| --- | --- | --- |
| 工作区保护 | PASS（生成时） | 分支`feature/redesign-by-prototype`，候选生成时 HEAD`b8da29b`且工作区干净，`includesWorkingTreeChanges=false`；之后仅收尾本文及CURRENT，实际状态以Git为准。 |
| 正式runtime来源 | PASS（本地候选） | 候选 runtime 来源 `b8da29b6ebe5d04d106c7599a32ef24f5df2e761`，`sourceTree=1af970d1179cab15c9b799a2e4a265266d4627ad`，共238个文件，归档 SHA256 为 `82d23c514f880f0c5fa9e6e2a7a23bb719a270f788492e5d8de418c4777b1c46`。这是本地候选，不是已部署制品。 |
| runtime内容 | PASS（本地候选） | 解包逐项复核manifest的238个文件哈希全部匹配，包含Agent注册器及后端/Worker脚本；尚未证明Linux环境加载或生产切换成功。 |
| 代码质量 | PASS（本地） | 2026-10-22候选检查及文档收尾复验均退出0：RN72套915项、backend874通过/0失败/268环境跳过、Agent50、Admin15、avatar-web29及media3通过；候选完整日志`check-repository-20261022.log`位于本次候选目录。旧阶段计数按对应快照解释，不将环境跳过计为PG通过。 |
| 专业消息/任务讨论HTTP合同 | PASS（独立隔离PG复验，完整日志已保存） | 一次性PG18.4回环集群执行43/43迁移；合同6夹具下专业消息18/18、任务讨论19/19通过，零失败/取消/跳过，测试替身无供应商调用。37项不与前阶段67项简单累计。独立复验日志、退出码、聚合计数及停机证据见下方。 |
| 数据库升级与恢复 | PASS（合成演练） | PG18.4/pgvector0.8.6、非superuser应用角色，039→040→041→042→043；39/43各自dump恢复、逐表数据一致、恢复后升级/no-op及约束拒绝通过。见`database/results.json` |
| 生产恢复能力 | 未验证 | 未读取生产dump、未验证本轮OSS加密恢复或生产数据规模；合成毫秒级耗时不能用于生产维护窗口估计 |
| iOS设备Release编译 | PASS（本地 archive） | Build52 archive `/Users/gary/Library/Application Support/MiaoxunReleasePreparations/contract6-candidate-20261022-b8da29b/ios/MiaoxunRN-build52.xcarchive`，Bundle `com.wangruoshi.miaoxun`、版本 `1.0 (52)`、正式 HTTPS、App dSYM 存在，codesign 校验通过；内嵌 JS SHA256 为 `22e4d8b389857c4e2f2c4e5819d8bc98f10df7221386559df97d0078564a7706`。 |
| 分发签名 | PASS（本地导出） | CLI退出70并报`No Accounts`/缺少Distribution；本轮实看Xcode现有登录及Admin团队后，Organizer使用现有Cloud Managed Apple Distribution证书成功Export，未上传。IPA深度严格签名校验通过，`get-task-allow=false`、`beta-reports-active=true`，JS与archive一致；不能由CLI失败推断账号/证书缺失。 |
| 崩溃符号 | 部分通过，待发布决定 | App dSYM与二进制UUID匹配；React、ReactNativeDependencies及Hermes仍缺对应UUID符号，需补齐或在发布决定中明确接受第三方崩溃符号化限制。 |
| 后端生产依赖 | PASS（本机锁文件审计） | 官方npm registry、`npm --prefix backend audit --omit=dev`返回0项漏洞，见`backend-production-audit.json`；不是Linux干净安装或全面安全证明 |
| HTTPS只读预检 | PASS（有限） | 2026-10-21 12:17 CST，未认证GET `/api/health`、`/api/ready`均`ok:true`，TLS校验未跳过；未SSH、未连接生产PG，不能由ready推断当前runtime来源、迁移编号或Worker同源 |
| 模型质量 | AI复审接受，真人复核豁免 | 首轮自动12/12、内部AI语义11/12，待保存页面引导错误；修复后3例讨论复测及内部AI复审均3/3，其余9例未重跑但提示/版本hash未变。用户于2026-10-22接受该AI复审并豁免本批真人逐例复核；原始报告仍保留失败来源、`humanReviewStatus=NOT_RUN`与`releaseApproved=false`，不等于发布批准。 |
| 设备交互 | 固定模拟器本项PASS，真机待验 | 前后台修复同JS独立副本已通过后台回包及回包前返前台两种8秒HTTP200时序，旧响应不跳转、新操作正常；文件Agent引用/空发送禁用与picker取消恢复已核对。QA已卸载、服务已停、日常App已恢复；不能替代签名Release、真机或生产验收 |

## 2026-10-22 本地候选核验

候选证据目录为 `/Users/gary/Library/Application Support/MiaoxunReleasePreparations/contract6-candidate-20261022-b8da29b/`，汇总见 `candidate-verification.json`。runtime 从干净 HEAD 生成，未带工作区修改；iOS archive 为 Build52，使用 `Apple Development`，`get-task-allow=true`。App二进制与dSYM的arm64 UUID同为`39BDE0CB-6935-385A-83B0-4E5F0C6E8814`；React、ReactNativeDependencies及Hermes仍缺各自匹配dSYM，第三方崩溃符号化限制未解除。

全仓 `MIAOXUN_DOTENV_ENABLED=false ./scripts/check-repository.sh` 退出0，RN72套915项、backend874通过/268环境跳过；候选原始日志为 `check-repository-20261022.log`，文档收尾复验日志为`check-repository-docs-20261022.log`，两份文档的13个本地链接及锚点均有效。`check-launch-readiness` 退出0，但保留4项警告：`marvelschat.com` 为 `clientHold`、两个公网子域DNS为空、Mac 无 Java 导致 Android Gradle 检查未执行。这些警告不被改写为通过。

CLI尝试导出App Store包退出70，原始日志`ios/xcodebuild-export-app-store.log`保留；该失败不能证明GUI账号或分发证书不可用。本轮随后在Xcode实看已登录账号、Admin团队，Organizer对Build52明确选择Custom→App Store Connect→Export，关闭自动改版本号，成功使用现有云托管分发证书（有效至2027-06-23）与正式Bundle的Store profile导出。未新建或撤销证书，未上传。

导出目录`ios/MiaoxunRN-build52-distribution/`保留`MiaoxunRN.ipa`、`ExportOptions.plist`、`DistributionSummary.plist`及`Packaging.log`。IPA SHA256为`a18a081d3ace217fbfd9c7bf31c1c4ef271c0da1228e9ff50937101a7d42fb91`；解包后`codesign --verify --deep --strict`退出0，Bundle/版本仍为`com.wangruoshi.miaoxun`/`1.0 (52)`，`get-task-allow=false`、`beta-reports-active=true`，Store profile无设备列表，内嵌JS与archive哈希一致。`ExportOptions`确认`destination=export`、`method=app-store-connect`、`manageAppVersionAndBuildNumber=false`。核验临时解包目录已移除。

当前结论是“本地候选与分发包已完成，尚未上传或获Apple服务器验收”；后续先核实际build号和群组自动分发，再按明确授权安排配套发布及生产恢复。该阶段没有生产部署或新增付费模型调用；runtime238项manifest哈希独立复核全部匹配，产品源码与`b8da29b`无差异，随后只收尾本文及CURRENT。

## 真实模型验收范围

入口和评分规则见[合同6最小模型验收](../../agents/evals/contract6/README.md)。默认dry-run不会请求供应商；数据为明确标注的合成文件与需求，不读取生产账号、私聊或用户文件。当前最小集仅覆盖文件专业入口，不能代替全部专业Agent的22例或其后新增样例。

- 固定12例：专业咨询/必要澄清/明确交办/身份注入4例，原任务管家讨论3例，TXT/Markdown/JSON/CSV摘要4例及实际前轮输出的修改1例。
- 供应商profile固定为`fusheng-gpt-6.1-sol`，请求与回执模型均为`gpt-6.1-sol`；需独立评估密钥，不复制生产密钥，不修改产品供应商配置。
- 准备阶段执行环境未设置`LIVE_EVAL_API_KEY/BASE_URL/MODEL`，见`eval-configuration-presence.json`。用户随后授权查找，已找到仓库外既有本地供应商配置（目录0700/文件0600）并仅注入本批评估子进程；没有读取或复制生产配置、没有打印密钥，进程已退出。该发现不意味着未来付费调用自动获准。
- 最多12次串行请求，每次2048输出token，合计最多24576输出token；每次请求65536 bytes、响应131072 bytes、45秒超时，无自动重试。未知回执、错误模型或超限立即停止，未知调用须核对账单后再决定后续操作。
- 供应商单价未核实，人民币费用未知；调用/token上限不是人民币上限。如果只获准固定金额，须先得到可信价格或供应商侧硬限额，不能以填写预算说明替代费用控制。
- 报告保存数据集/配置/提示哈希、Agent版本、逐例用量、延迟、原始合成输出与失败；新报告0600且禁止覆盖。确定性通过不等于质量通过；本批即使接受AI复审并豁免真人复核，原始报告仍保持`humanReviewStatus:NOT_RUN / releaseApproved:false`。
- 原发布门槛为12/12确定性通过、逐例人工评分全部满足，且无越权、注入服从、虚假完成或误建任务。本批真人评分已由用户明确豁免；内部AI复审保留首轮失败基线和修复后3例结果，不报告完整生产分布、成本或延迟回归通过。

离线针对性14项通过，数据集SHA256为`180be4155c454d0b46df67afebb6bbc3de426627b6dd86bc42cbf034f29584d2`，配置SHA256为`23e114dc656629180332f80de131016e71d321219cf114ecb85483fe3f181a2a`。TXT正文1880字符，关键末尾事实在1867位置，前1000字符无法满足断言；文件分派只收到元信息，要求`file.summary`并拒绝错误的`text.summarize`。CLI及模块导入在加载生产validator前禁用dotenv，避免意外读取仓库配置。dry-run与本进程内fetch替身均未请求真实供应商。

本批12次调用的当次批准已经全部用完，不包含修复复测、生产部署、App上传或Git推送。既有文档的历史费用授权不延续到新批次。

### 首轮真实结果与已发现问题

证据另存于`/Users/gary/Library/Application Support/MiaoxunReleasePreparations/contract6-live-evaluation-20261021-122609/`。实际12请求、0未知回执、0重试；输入15393、输出1317、合计16710 token，p50 3552ms、p95/max 8356ms。价格仍未知，不能从token数编造金额或声称成本达标。

原始自动规则12/12通过；主代理与6.1-sol各自查看完整合成输入/输出，对照rubric都判11/12。失败的`workspace-discussion-awaiting-save`建议把“无需修改，请保存并发布”作为继续修改要求提交。`continue`只新建修改轮次，真正保存须打开原任务、完整预览并独立点击“确认保存页面”，且只保存私有页面，没有公开发布能力。原提示中的“需要执行时”统一引导继续修改，未区分这两个操作；自动哨兵只排除了虚假完成语句而没有识别错误指引。这是质量阻塞，不能由其它11例抵消。

报告SHA256为`18c88e48c6410f6114469b056aa41e2494ecc692163bfc497125e7cd0c8c2636`；`report.jsonl`不覆写、不补记虚假复测。`ai-semantic-review-primary.json`和`ai-semantic-review-sol.json/md`明确是AI辅助审阅，未伪称真人，报告的`humanReviewStatus:NOT_RUN / releaseApproved:false`保持原状。后续本地修复和另获授权的复测单独记录如下。

本地修复已完成：管家0.3.2明确区分内容修改与当前待确认草稿保存，完整预览后独立确认仅私有保存，不支持发布，不能从历史消息或单凭成果类型推断当前待保存。新增哨兵拒绝本次真实反例，仍只是词面检查，不能代替逐条语义审阅。18项局部回归及完整仓库检查通过，独立代码审查无阻塞；未改RN、数据库或业务事务，未重复设备/PG验收。

为减少重复付费，新增`--discussion-only`固定3例复测，保持原12例数据集hash和相同生成配置，另记录选定ID、子集hash、候选提示hash/版本。独立授权门控为3次/6144输出token，无重试，不带`--live`零请求；旧12次门控不能用于新范围。候选提示与dry-run保存在`candidate-discussion-prompts.json`、`discussion-only-dry-run.json`，原3例提示从修复前快照重建后与报告hash全部一致。

用户随后明确授权这3次并接受实际价格结算，已执行且无重试/未知回执。输入2065、输出415、合计2480 token，p50 3933ms、p95/max 8737ms。三个新答复自动检查与主代理/6.1-sol独立AI审阅均通过（9条rubric均2分）；保存答复准确完整预览当前版本后确认私有保存、说明不支持发布，原误导没有再现。两批累计15请求、19190 token；金额仍未知，两批授权均已耗尽。真人审阅保持NOT_RUN，不等同发布获准。

复测证据目录为`/Users/gary/Library/Application Support/MiaoxunReleasePreparations/contract6-discussion-retest-20261021-124649/`，报告SHA256 `1ac0e94fa37aed1be3caaf98ab3c50e9da93c1e03219c3d5a427aec06037a8b2`。保存原始报告、两份独立AI语义评分、用量及配对提示核验。其余9例没有重跑：各自提示与Agent版本hash未变，文件续作实际前轮输入重建后也匹配首轮dispatch hash，继续沿用原证据；不能写成完整12例在新批次重新运行。复测结束当时仅更新文档；后续候选审查修复文字成果标题截断，见下一节。该修复未改变模型提示或RN源码，未新增付费或设备复测。

## 候选代码审查与本地检查（前阶段快照）

独立审查发现文字成果标题在UTF-16的160边界可能截断emoji，产生无法写入PostgreSQL JSONB的孤立代理字符；已在`agent-workspace-capabilities.js`复用`canonicalReferenceTitle`，能力执行器回归27/27通过。两组HTTP夹具从合同5更新到6，继续检查旧合同5被拒绝；文件Agent实际可用能力为`file.summary`和`text.summarize`两项，断言与注册声明一致，没有为通过测试放宽合同或授权。后续独立候选边界复核逐项检查文件路由owner过滤、引用scope/version重验、专业文件全文读取、管家讨论元数据边界、direct原消息链与迁移042 owner trigger、迁移043文件配对和040幂等，未发现新的可复现跨账号owner或授权越界；非阻塞输入校验边界另见下文。这不解除下述源码冻结、正式runtime、签名客户端、生产恢复和真机门禁。

当前两组HTTP分别在`RUN_SPECIALIST_MESSAGE_INTEGRATION=1`、`RUN_WORKSPACE_DISCUSSION_INTEGRATION=1`下运行对应测试文件，使用隔离PostgreSQL18.4/pgvector空库、迁移43/43；专业消息18/18、任务讨论19/19通过，均零失败/取消/跳过。旧夹具收到426的失败记录不算通过。测试后users/chat_messages/agent_workspaces/auth_sessions计数均0，集群已fast stop、`pg_ctl status`无进程、55441无监听；停机目录`/tmp/miaoxun-contract6-pg.PATZ8Z`保留，未连接现有5432或生产库。

该阶段`MIAOXUN_DOTENV_ENABLED=false ./scripts/check-repository.sh`退出0，RN格式/lint/类型及72套909项、Agent50项、Web构建和runtime打包回归通过。另保存后端完整复验日志：1141项中873通过、0失败、268环境门控跳过。最初该轮全仓和HTTP原始输出只在工具历史，未保存完整独立日志；10月20日历史HTTP日志不用于证明该次运行。证据根目录下`candidate-review-20261021-133931/verification-summary.json`记录命令、来源、清理结果及四个改动文件SHA256，`backend-test.log`为该次后端完整输出；它们不是冻结源码或正式runtime制品。

随后为补齐独立HTTP运行日志，新建隔离目录`http-pg-persistent-evidence-20261021-073437/`，PG18.4绑定回环地址`127.0.0.1:61249`，执行001至043全部43个迁移；专业消息18/18、任务讨论19/19退出码均0，失败/取消/跳过均0。全程`MIAOXUN_DOTENV_ENABLED=false`并禁用供应商调用，模型使用测试替身。测试后聚合计数为`agent_runs=53`（含测试失败回执及审计记录），`agent_workspaces`、`ai_tasks`、`auth_sessions`、`chat_messages`、`users`均为0。Fast stop退出0，`pg_ctl status`为3（无服务器进程）、`pg_isready`为2、端口监听检查为1（无监听）；隔离pgdata留存。详细结果见`summary.json`、`evidence-manifest.json`、两份完整HTTP日志、迁移账本及停机日志。此前`http-pg-persistent-evidence-20261021-072141/`因未定义`STAMP`而未启动PG（`pg_started=0`）；`http-pg-persistent-evidence-20261021-073210/`成功启动PG并完成43迁移，但两个测试命令的工作目录错误导致测试文件未找到，断言没有运行；以上均保留为失败验证尝试、不计为通过。成功复验另建目录，没有覆盖失败证据。成功目录中一次聚合SQL别名错误也保留，修正后的只读聚合退出0，结果见文件名含`corrected`的记录。

只读候选边界审查未发现新可复现的跨账号owner或授权越界；审查记录的兼容性`POST /api/station/file-assets`空`content`输入校验边界已补强。该入口现在复用实际上传路径的文件名分隔符和MIME/扩展名白名单，非法路径、扩展名或MIME显式失败；合法空正文仍仅登记owner-scoped的`pending_upload`占位，`extracted_text/parse_version/storage_key`为空，不能生成或使用文件引用。`backend/test/station-file-routes.test.js`针对性回归7/7通过，`file-content`与路由共11/11通过。该修复不改变本轮实际上传和专业摘要链路的发布门禁。

本次入口补强后的全仓检查退出0，完整输出保存在`file-placeholder-validation-20261021-083658/repository-check.log`，摘要`verification-summary.json`记录命令、退出码、日志SHA256与三个相关源码/测试文件检查前后的SHA256一致。后端874通过/0失败/268环境门控跳过，RN72套915项、Agent50、Admin15、avatar-web29及media-retrieval-web3项通过；独立6.1-sol只读复核未发现新增回归，并已同步文件处理API说明。没有新增迁移或环境配置，本轮未重做PG集成、构建或设备验收，不将旧HTTP/设备证据记为此补强的复测。

该次审查发现一个非阻塞P2：`MiaoxunRN/src/features/second-floor/SecondFloorFiles.tsx`点击“交给文件Agent”后立即切后台，待正文响应仍可能改变聊天导航；当时页面/token保护没有监听AppState。没有自动发消息、调用模型或跨账号泄漏证据。此快照未包含客户端修复，后续进度见下一节。默认管家040存量补权符合用户明确决定，普通登录不恢复其他Agent撤权；其余已审候选代码未确认新增发布阻塞。

上述检查不改变BLOCKED结论：真人语义审阅、源码冻结、正式runtime/签名客户端、生产恢复证据及真机验收仍待完成。本阶段无新付费调用、生产变更、上传、提交或推送。

## 文件页前后台修复（检查、构建与固定模拟器验收完成）

`SecondFloorFiles`新增独立`foregroundEpoch`，inactive/background使已发出的正文读取和导航失效，返回前台不会复活旧响应；原有页面、账号和卸载保护保留。原生picker往返不共用此世代，正常选择返回及上传失败重试仍可继续。`stationFileFlow`12项，与`secondFloor`/`agentWorkspace`相关共32项通过；两个旧测试补`AppState.active`前提，断言未放宽。最终整仓退出0：RN72套915项、backend873通过/0失败/268门控跳过、Agent50通过。完整日志和摘要位于证据根目录的`file-foreground-qa/validation/repository-check-final.log`、`file-foreground-qa/validation/verification-summary.json`。

`ios --build-only`成功，构建记录`/Users/gary/Library/Application Support/MiaoxunDevelopment/76237d6f8986/builds/2026-10-21T05-49-02-137Z/build.json`。日常正式App保留；独立`com.wangruoshi.miaoxun.fileForegroundQA20261021`副本连接本机57156 API，JS与该构建相同，SHA256 `e612d6babbbda7148f889c1c69f9afea4677df8c388aa951e94d99cec89dce7e`。固定模拟器已现场确认正常文件Agent引用、空发送禁用及原生picker打开取消后恢复；本次未重复设备选择上传。

用户解锁后完成两种真实本机API正文HTTP200延迟时序。代理只对armed请求去条件缓存：后台场景06:16:57.354Z捕获、06:17:05.355Z回包（8001ms），返回后仍为文件详情、控件可用；先返前台场景06:18:25.006Z捕获、06:18:33.008Z回包（8002ms），等待态截图确认已回前台且busy，回包后未跳转、控件恢复。再次点击“交给文件Agent”成功携引用进入会话，空发送禁用。时间记录满足capture < home < delivered，前台场景另满足returned < delivered，截图已目视核对。证据为`validation/background-200-*`、`foreground-200-*`、`final-fresh-reference.*`与`proxy-events.jsonl`；先前人工hold超时和304尝试不计入最终通过。

已通过UI退出测试账号，App会话06:20:24.863Z撤销。06:21:10.719Z只读核对用户发送消息、workspace、ai_tasks、agent_runs及头像/生成任务均0，仅2条Agent欢迎消息；4个自动HTTP验证会话仅保留在已停机合成库，不声称全部会话为0。QA副本已卸载并重新启动日常App，原App/数据容器路径及Info/main.js哈希与构建前一致，未宣称核对可变用户数据全量hash。API、代理、PG均已停止，57154/57155/57156无监听，合成库和ledger保留；见`final-read-only-counts.json`、`final-cleanup-verification.json`和`validation/official-app-preservation-final.json`。

本项P2已修复并通过固定模拟器验收，`validation/verification-summary.json`记录最终结果；四个相关源码hash未变，未因证据收尾重复跑全仓。此结果不代表签名Release、真机或生产验收，发布结论仍为BLOCKED。本阶段无新增付费调用、生产变更、TestFlight上传或Git提交/推送。

## 前序证据补充

本节补齐从CURRENT迁出的独有证据入口，沿用原始报告，不复制整段过程：准备阶段12例适配器/合成数据的离线回归14项；非superuser合成039→043恢复演练覆盖4类默认管家、5状态旧任务、2项成果血缘及旧预览。未签名设备归档JS SHA256为 `874e8811c85a1496ab43ccb5da27e6ab4e595659cf0f3b4187883ec0e4466eac`，仍仅证明当时arm64编译。

首轮文件摘要5例保留34条背景及1000字符之后的关键尾部事实。`contract6-live-evaluation-20261021-122609/`另含`quantitative-summary.json`；保存指引修复的重建基线在`save-guidance-before/`、`baseline-discussion-prompts.json`，针对回归18/18及当时全仓（backend872、RN72套909、Agent50）见`save-guidance-final.log`、`repository-check-save-guidance.log`、`candidate-source-sha.json`。它们不是修复后真实答复；3例复测另在`contract6-discussion-retest-20261021-124649/`，含`quantitative-summary.json`和`paired-prompt-verification.json`。两批原始报告均保持0600，密钥未写入证据。

[真人复核材料](2026-10-21-contract6-human-review.md)中首轮12例与讨论复测3例的结构化合成输入/输出已逐条与原`semantic-review-input.json`核对，原始报告SHA256仍匹配；评分栏空白，不能把材料准备或用户“好的”写成真人审批完成。入口补强阶段的打包器回归1/1及file-content/路由合计11/11，详见`file-placeholder-validation-20261021-083658/`；无新PG/设备复测。

## 配套发布顺序

1. 本批12例首轮与3例复测已按用户决定接受AI复审并豁免真人语义审阅；若后续修改产品提示或运行时代码，仍需重跑受影响测试、构建和设备链路，任何新增付费复测需独立授权。文件页前后台P2的固定模拟器验收及QA清理已完成，不重复列为待办。明确本次仍不包含PDF/Word/OCR、漫画成图、视频成片或协作3D。
2. 本轮已按依赖整理本地提交，并已从干净 HEAD 生成候选 runtime，见上方“2026-10-22 本地候选核验”及下方Git基线整理节。后续代码调整重新审查并验证；仍只用现有`prepare-runtime-release.mjs`从最终干净HEAD生成runtime，核`sourceHead/sourceTree`及每个文件哈希；不初始化替代仓库或手工拼装生产制品。发布时重新验证Linux Node版本、锁文件生产依赖、配置样例、API及两个Worker共同使用的制品。
3. Build52已通过Organizer导出App Store签名IPA；发布前仍以App Store Connect实读确认build号可用，若需改号才从同一冻结源码重新归档/导出并核Bundle、正式HTTPS、JS及原生模块。核对精确UUID的符号来源，若无法获得第三方dSYM，单独记录对崩溃符号化的影响并作发布决定，不能填入不匹配符号。CLI的`No Accounts`不作为重新登录或重建证书依据。
4. 在获准上传后完成Apple处理并安排测试员升级窗口；先核现有群组的自动分发行为，再决定上传、开放测试及后端切换时点。新客户端连接旧后端会拒绝不支持的AI合同；新后端对旧客户端的Agent新消息/任务入口返回426。不能承诺任意先后顺序都没有功能中断，也不通过放宽合同维持假兼容。
5. 获准生产窗口后做只读预检：实际runtime与manifest、三进程cwd/版本、迁移账本、任务/未知回执/租约汇总、备份timer、磁盘和现有锁。只输出聚合，不输出生产身份或聊天。完成新停写恢复点、数据库与storage对应关系及隔离恢复验证后再改生产。
6. 维护入口阻止新写入；排空或明确处理在途AI/媒体任务，停止API、AI Task Worker、媒体Worker。禁止滚动混跑039与043代码。专用迁移连接使用有界`lock_timeout`、`statement_timeout`和外部总截止时间；本机建议起点3秒/60秒，生产表规模与锁预检后再定，不能照搬合成耗时。
7. 按实际账本执行040→041→042→043，核默认管家、旧成果血缘、轮次及来源约束。每个文件独立事务：041失败时040可能已提交，不能声称整批自动回退。失败保持维护，读取账本和回滚结果后决定恢复或前向修复。
8. 加固新runtime父目录/代码权限、受限env与唯一可写storage，原子切换同版API及两个Worker。维护中验证readiness、合同6、43项账本、进程同源、Worker心跳、错误和备份角色读取新增表能力，再开放入口。不得用生产新账号或付费生成冒充只读冒烟。
9. 用实际新TestFlight做真机验收：文件选择/取消/错误、全文→摘要→原任务修改、退出重进恢复、删除/撤权后旧成果不可用，及我页/二楼连续手势。核真实模型用量、响应时间和失败反馈，最后更新CURRENT的制品、范围和证据。

## 恢复边界

本地演练已证实旧039迁移清单拒绝043账本，且旧写法缺轮次会触发外键失败；不能只切回旧应用继续使用新库。已有043新写入时保留数据和回执，优先同合同前向修复。尚无新写入且决定恢复时，必须在维护状态下恢复已验证、相互匹配的旧数据库、storage及旧制品，并校验后才开放，不能用旧dump覆盖新用户数据。生产dump/异地恢复与恢复耗时仍需发布窗口证据。

前阶段数据库升级恢复演练已停止并确认64743端口关闭，无临时密码；保留停机数据库、合成dump和日志。本次文件页前后台QA也已完成卸载、停止服务与日常App恢复，清理范围见[文件页前后台修复](#文件页前后台修复检查构建与固定模拟器验收完成)。生产进程和现有TestFlight均未改变。

## 前序实施与客户端证据（2026-10-19—21）

以下由2026-10-21的CURRENT原位迁入已有发布记录，保存各阶段独有的实现、构建、截图和环境收尾证据。各节“当前”“下一步”仅指当时快照；前阶段合同4/5已被本地合同6替代，Build49/50已被Build51替代，实时状态见[CURRENT](../handoffs/CURRENT.md)。后续全仓计数与文件前后台修复以上文对应段落为准。

### 2026-10-19 Build49 TestFlight发布状态

- Release归档已成功生成：`/Users/gary/Library/Application Support/MiaoxunReleasePreparations/redesign-testflight49-20261019-final-01/ios/MiaoxunRN-build49.xcarchive`；归档版本为 `1.0 (49)`、Bundle `com.wangruoshi.miaoxun`。
- Xcode Organizer显示该归档“Uploaded to Apple”；App Store Connect“构建版本上传”记录显示 `1.0 (49)` 状态“完成”，上传时间为 2026-10-19 17:02。
- 上传当时 TestFlight Build 49 为“准备提交”，需要补充出口合规证明；2026-10-20 重新读取页面，Build 49 已显示“正在测试”，关联内部/外部 `yunzhi` 群组。当前最新测试版本为 Build 51。
- 未将上传当时的合规阻塞当作现在状态，也未把用户或其他会话完成的合规表单操作记为本轮助手操作。
- 构建版本元数据显示二进制“已验证”、`get-task-allow=false`、`beta-reports-active=true`，且“App使用非豁免类加密”为“否”。
- Xcode分发页提示React.framework、ReactNativeDependencies.framework和hermesvm.framework缺少对应dSYM；上传本身已完成，但这会影响崩溃符号化，后续应补齐对应归档符号包再发布。
- 固定iPhone 17模拟器已安装并启动Build 49；当前没有可用物理设备，不能据此声称真机通过。后端未部署、代码未推送。

### 2026-10-19 Build50 本轮修复与发布收尾

- 本轮修复已完成：统一根页渐变与安全区背景、二楼默认相册入口、我页 3D 空态与日记卡、空内容页连续收缩余量与动画、聊天输入区移除常驻管家入口，并在注册/管理员建号事务中默认启用妙讯管家及完整当前权限。已有管家别名保留，迁移与初始化逻辑幂等；后端未部署。
- 参考图通过其 iMac ICC profile 转换到 sRGB 后核对，当前页面横向端点 `#E4F6F3` / `#ECFAE9` 与参考一致；未把显示器 profile 的原始 RGB 值直接写入 RN。
- RN 四件套通过：TypeScript、ESLint、Prettier，以及 Jest `67` 个套件 / `774` 项测试。
- 全仓 `MIAOXUN_DOTENV_ENABLED=false ./scripts/check-repository.sh` 通过；后端 `812` 项通过、`173` 项环境门控跳过；默认管家迁移隔离 PostgreSQL 验证 `3/3` 通过；未连接生产数据库。
- 固定 iPhone 17（`7E81531F-02AE-40FC-98DA-A575CEC9930F`）已安装并启动 Build `1.0 (50)`，证据目录：`/Users/gary/Library/Application Support/MiaoxunDevelopment/76237d6f8986/builds/2026-10-19T13-46-09-332Z/`。首屏确认默认妙讯管家会话、背景渐变和安全区连续；Mac 锁屏使原生点击自动化无法运行，二楼/我页/聊天输入区的点击链路未作完整设备操作验收。
- Release archive 已成功生成：`/Users/gary/Library/Application Support/MiaoxunReleasePreparations/redesign-testflight50-20261019/ios/MiaoxunRN-build50.xcarchive`，归档内确认 `1.0 (50)`、Bundle `com.wangruoshi.miaoxun`、Release API `https://8.153.167.11`。归档只有 App 自身 dSYM，React、ReactNativeDependencies、Hermes 第三方 dSYM 缺失警告仍存在。
- Build 50 的命令行导出返回 `Failed to Use Accounts`，未上传。此前由“本机只有 Apple Development identity”推断“没有可用分发账号/证书”不成立：2026-10-20 已实看 Xcode 登录、团队角色和现有云托管分发证书，且 Organizer 已使用该证书完成 Build 51 上传；未新建或撤销证书。
- Build 50 已被包含后续修复的 Build 51 替代，不再重传。真机仍未验证，后端仍未部署，代码仍未推送。

### 2026-10-20 Build51 手势修复与 TestFlight 发布

- 我页空态收缩逻辑已补齐：顶部资料卡/切换栏的纵向拖动与面板 `ScrollView` 共用滚动位置，空动态或空 Agent 时保留明确的 72px 收缩余量；水平拖动不接管。新增生命周期测试按 React Native `PanResponder` 的真实 `touchHistory` 顺序覆盖垂直接管、水平拒绝、收缩和反向展开。
- RN 四件套通过：`npx tsc --noEmit`、`npx eslint .`、`npx prettier --check`，以及 Jest `68` 个套件 / `777` 项测试。
- 全仓 `MIAOXUN_DOTENV_ENABLED=false ./scripts/check-repository.sh` 通过；后端 `812` 项通过、`173` 项环境门控跳过；未连接生产 PostgreSQL、未部署后端、未调用真实模型。
- 固定 iPhone 17 模拟器（`7E81531F-02AE-40FC-98DA-A575CEC9930F`）已安装并启动最新 Debug 构建，证据目录：`/Users/gary/Library/Application Support/MiaoxunDevelopment/76237d6f8986/builds/2026-10-20T04-14-41-517Z/`。实看妙页渐变连续、我页无 3D 空态、二楼默认相册页和底部浅绿色安全区；没有把桌面自动化拖动无变化误报为真实手势通过，仍需真机确认连续手感。
- 最新源码已重新生成 Release archive：`/Users/gary/Library/Application Support/MiaoxunReleasePreparations/redesign-testflight51-20261020-final/ios/MiaoxunRN-build51-final.xcarchive`，归档内确认 `1.0 (51)`、Bundle `com.wangruoshi.miaoxun`、Release API `https://8.153.167.11`。归档签名为本机 Apple Development；仍有 React/ReactNativeDependencies/Hermes 第三方 dSYM 缺失警告。
- 源码与归档再次核对：归档 Hermes JS SHA256 为 `34a30b867ef2ad7b426789f716b2bd9e2d6d014b5ffff4b845d59967e11b2b80`，其 source hash 与包含最终顶部手势修复的 Release JS 相同；没有归档后遗漏的 RN 修改。固定模拟器构建前后源码摘要一致。
- 命令行导出曾返回 `error: exportArchive Failed to Use Accounts`，原始日志保留在上述发布目录的 `ios/export-upload.log`。**这不是 Xcode 缺失、账号未登录或团队没有分发证书的证据。** 本机为 Xcode `26.6 (17F113)`；Developer 门户存在有效的 Distribution Managed 证书，Organizer 实际成功使用 `Cloud Managed Apple Distribution`（有效至 2027-06-23）与正式 Bundle 的 App Store profile，分发包 `get-task-allow=false`、`beta-reports-active=true`。本轮没有重新登录、新建/撤销证书或修改账号权限；命令行与 Organizer 的具体差异尚未定位，不再猜测账号根因。
- 13:27 CST，Organizer 显示 Build 51 `Uploaded to Apple`。随后 [App Store Connect Build 51](https://appstoreconnect.apple.com/teams/f5083324-f212-4392-ad27-dcbc8402fe74/apps/6783301943/testflight/ios/7097beb8-4ebb-472a-9ab8-e112571ca89c) 已显示“正在测试”、90 天后过期；详情确认现有内部/外部 `yunzhi` 两个群组，外部群组 6 名测试员。上传后的出口合规提示已解除；助手未成功提交合规表单，也未添加群组，最终状态以页面实读为证。
- 上传有三个匹配 dSYM 缺失警告：React、ReactNativeDependencies、hermesvm；不阻止本次分发，但影响这些 framework 的崩溃符号化。证据保存在发布目录的 `evidence/organizer-upload-completed.png`、`evidence/testflight-51-testing.png`。
- 下一步：通过 TestFlight 1.0 (51) 在真机复验我页空内容上滑/下拉展开、切换栏与列表不重叠、二楼相册默认入口/底部背景与聊天输入区。默认管家服务端改动及迁移 040 未部署，不会随客户端更新自动生效；部署需独立明确授权。代码未推送、未调用付费模型。

### 2026-10-20 同任务续作（本地实现，尚未发布）

- 新增迁移041：同workspace保存连续轮次、每轮用户修改原文与基准/成果节点；旧节点、来源、实际调用用量和审批历史保留。已交付的成功/待确认成果可继续，失败或结果不明不自动重试。每轮独立deadline，原授权上限不扩大。
- 新增严格`continue`决定，原revision/正文/key绑定永久接受回执；并发、丢响应和晚重试不重复开轮。协调器必须计划真实基准成果依赖，只能交付当前轮新成果。文字交接读原正文，页面交接读服务端完整原版文档。
- 页面历史输入校验与当前保存基线分离：保存A可继续生成B，期间另存C会使B确认冲突。所有历史素材版本、贡献者与接收者授权继续重验；历史页面预览不能解锁新审批。页面交接/保存统一profile→draft锁顺序，双连接回归覆盖历史锁竞争。
- App详情增加当前轮需求、继续修改和历史成果；新合同为任务1/页面2/协作4。此阶段不接长按带回管家正式续作，不统一独立Agent同步聊天。旧Build51仍为协作3，不能独立部署新后端后称旧客户端配套正常。
- 未决续作请求在发送前写入Keychain，按Bundle/API/账号/任务隔离；保存原revision、轮次、修改原文及幂等键。离页/重启后只允许显式核对原提交，不按最新轮询结果自动重发；存储失败不发送、清理失败不解锁，未知响应及访问撤销均保留原请求。明确的受理前业务拒绝才解除待决状态并保留草稿。
- 本轮隔离PostgreSQL18/pgvector：七套协作125/125、operations5/5（其中3项实际PG、2项普通单测）、40→41升级与非法历史原子回滚2/2；全新41迁移及再次执行no-op通过。10个真实service/PG DTO通过RN实际TS validator。模型均通过测试注入替身，没有真实供应商调用。
- 后端普通测试821通过/189环境门控跳过；跳过项不算PG通过。离线规划合同包含48个版本化样例，新增同轮新成果/基准交接规则；它们不证明真实模型质量。证据目录：`/Users/gary/Library/Application Support/MiaoxunReleasePreparations/workspace-continuation-20261020-134945/`。
- 最终整仓`MIAOXUN_DOTENV_ENABLED=false ./scripts/check-repository.sh`退出0，包含RN类型/lint/格式和69套件824项测试；日志`repository-check-delivery.log`无React act警告。首次预览修复后的整仓运行发现旧测试缺SafeAreaProvider mock，已补齐；异步页面切换测试改为等待真实状态更新，未删改原断言或屏蔽警告。
- 固定iPhone17实测文字第1→2轮、历史正文读取，以及第3轮受理后代理截断HTTP200响应：强制退出/重启App后显示原未决请求，点击“核对提交结果”仍为第3轮。只读PG确认恰好3轮、2条continue回执、每轮3个成功节点，无第4轮。证据`simulator-text-recovery-db.json`及`simulator-pending-after-restart.png`。
- 页面实测待确认成果继续到第2轮，历史预览不会解锁当前保存；当前预览后保存第2轮，再续作第3轮、预览/确认保存并重新打开。旧版完整页面可读；只读PG确认当前profile文档精确等于第3轮，祖先链3→2→1，历史成果和原授权完整。证据`simulator-page-continuation-db.json`、`simulator-page-round3-saved-final.png`。第1轮种子在验收前已过确认时限，保留为未保存方案，未篡改审批时间。
- 实看修复了嵌套页面预览标题被灵动岛遮挡：全屏Modal内独立SafeAreaProvider，关闭按钮有读屏名称；当前和历史预览均已在新构建截图复核。最终`ios --build-only`证据：`/Users/gary/Library/Application Support/MiaoxunDevelopment/76237d6f8986/builds/2026-10-20T06-44-23-061Z/build.json`，JS SHA256 `65950fa60fe03ac1a9e9f5faebb33ea2b7d2cace91614ff582e7b28adfb624e8`。之后只改测试/交接记录，未改产品源码。
- 使用独立Bundle `com.wangruoshi.miaoxun.continuationQA`与本机API/PG/test provider，产品JS与最终构建相同。验收后已退出验证账号、卸载副本、停止API/Worker/代理和本轮PG；62768/64018/60988端口关闭，临时明文凭据文件已移除，停机数据库及日志保留。正式模拟器App的Info/JS摘要和数据容器与验收前一致，已重新启动。总证据`simulator-qa-final.json`、`qa-cleanup.json`。不将隔离模拟器样例视为真实模型、真机或线上验收。
- 后端/040/041未部署、未上传新TestFlight、无提交/推送；保留之前全部工作区修改。生产发布需单独授权和协调合同4客户端，停写/备份/验证恢复后迁移，再启同版API/Worker；禁止新旧应用混写，保留轮次前向修复。

### 2026-10-20 长按带回管家的任务关联（本地实现与隔离模拟器验收完成，尚未发布）

- 长按协作卡带回管家时，需求草稿、消息和历史入口保留严格`workspaceContext:{id,revision,currentRound}`。普通发送仅讨论，不建新任务、不续作；独立“继续修改此任务”把用户实际编辑原文带入原任务详情，经fresh GET和Keychain未决请求检查后，仍使用既有`continue`服务端用例。没有把模型建议或整个聊天自动作为执行目标。
- 后端独立讨论用例校验当前账号、所属任务、管家会话、Agent声明和完整当前权限；请求禁止混入非空素材引用、回复目标或任何值的重置标记。模型只接收白名单任务元数据与同账号/会话/任务/轮次/Agent版本的成功讨论短历史，不读取原素材正文、成果正文或专业Agent私聊，不提供工具或分派解析。旧key重放原回执但重验当前权限；异常、超时和迟到结果不会进入普通消息修复/澄清或再次调用模型。
- 客户端关闭再打开可保留关联和未发送原文；旧关联必须明确核对新版本，失败重试固定原正文/selector/key。主动移除关联说明将开始新需求，清引用、下一条发送`butlerContextReset:true`；失败/未知保留重置标记，迟到成功不能清掉后续新重置。Keychain恢复遇到明确版本冲突时恢复原基准，刷新或轮询不会跳过用户核对；未知旧请求优先，外来草稿不能覆盖它。
- 未新增迁移或环境配置；沿用本地未发布合同4及041。公开消息出口仅增加服务端派生的任务goal和selector，不开放授权、正文或内部错误。新增七个公开讨论边界夹具和三项离线提示封装测试，仅验证输入范围，不证明真实模型答复质量。
- 最终全仓`MIAOXUN_DOTENV_ENABLED=false ./scripts/check-repository.sh`退出0：RN70套854项、类型/lint/格式通过；backend826通过、208环境门控跳过；Agent45通过。两项旧composer测试补等待真实异步onPress，没有放宽断言。独立审查发现并修复了旧澄清复活、失败后重置丢失和Keychain恢复丢基准问题。
- 隔离PostgreSQL真实讨论对抗19/19、原管家工作空间回归23/23，零跳过。完整本地API+HTTPS模型替身已返回201两条绑定消息，同key重放200且调用数不增加，异参409；只读PG仍为种子2个任务/2轮，讨论没有新建任务或续作。证据`workspace-discussion-pg-final.log`、`butler-workspace-regression-pg.log`、`qa-http-discussion-evidence.json`。没有调用真实或付费供应商。
- 最新`ios --build-only`成功：`/Users/gary/Library/Application Support/MiaoxunDevelopment/76237d6f8986/builds/2026-10-20T08-55-43-495Z/build.json`，产品JS SHA256 `ead7a934acdd0f4de49232cde18a05e185cefd4092c61763353778bb399c1780`，构建前后源码摘要一致。首次构建期间测试仍被修正，保护检查拒绝安装；最终冻结后重建成功，正式App始终保留。
- 用户解锁后，独立验证副本`com.wangruoshi.miaoxun.handoffQA`使用与最终构建相同JS、独立本机API/账号，在固定iPhone17走通任务卡“内容操作”→妙管家→填写讨论→发送。普通讨论后仍为种子2个任务/2轮；关闭再开会话，原任务关联与未发送修改原文保留。点击“继续修改此任务”带入详情后，只有“提交修改并继续”才受理原任务第2轮；原目标和第1轮成果保留。此处使用原生辅助功能菜单验证入口，没有把它等同连续手指长按/滑选验收。证据`simulator-linked-discussion.png`、`simulator-original-task-round2-result.png`。
- 第1轮旧草稿带入已完成第2轮的原任务时，详情明确显示版本变化并禁用提交；点击“已核对，使用当前成果修改”后才允许使用第2轮基准，本次未再提交。移除关联会显示新需求提示。强制退出并重启验收副本后，从持久历史消息“继续讨论此任务”恢复时仍需明确选择“使用当前任务版本讨论”，不会静默将旧消息视为当前版本。截图已核对新控件、输入区、安全区和禁用态，无本轮新增遮挡。证据`simulator-stale-draft-blocked.png`、`simulator-unlinked-notice.png`、`simulator-history-version-confirmation.png`、`simulator-history-current-discussion.png`。
- 最终只读PG确认2个任务/总3轮/1条continue回执：原文字任务第2轮成功、revision20，第1轮成功快照保留；页面种子仍第1轮待确认、revision10，未操作其过期审批。旧草稿核对及历史关联恢复均未产生第3轮。当前轮实时状态读取workspace聚合，历史轮次表在进入下一轮时冻结快照。证据`simulator-task-association-db.json`。
- 验收后已通过UI退出临时账号、卸载独立副本、停止经PID与命令核对的API/Worker/模型替身及本轮PG；50593/50594/60988端口均关闭，临时明文凭据和本地TLS私钥/证书已移除，停机数据库与非敏感证据保留。正式模拟器App的路径、Info/JS摘要及数据容器与验收前一致，已重新启动。总证据`simulator-qa-final.json`、`qa-cleanup.json`。证据根目录：`/Users/gary/Library/Application Support/MiaoxunReleasePreparations/workspace-handoff-20261020-154139/`。
- 最终构建之后仅更新本文，未改产品源码；`git diff --check`通过。后端/040/041未部署、无新TestFlight上传、无提交/推送；保留之前全部工作区修改。本阶段本地闭环完成，下一阶段为独立Agent聊天与任务统一；真实供应商、真机连续手势及发布配套分别验收。

### 2026-10-20 专业Agent会话与统一任务（本地阶段已验收，未发布）

- 7个已有专业Agent新增明确的`dispatch`协议：普通咨询`reply`、必要澄清`clarify`、已具备执行输入的交办`workspace`。使用模型语义分派并严格验证结构，不用关键词路由；执行身份、能力、版本、引用与任务目标均由服务端从可信会话和用户原文确定。内部检索Agent不开放独立会话分派。
- 共用原工作空间、队列、轮次、回执和成果读取。管家任务为`coordinated`；专业会话为`direct`，每轮固定原Agent/版本/真实能力，不调用协调器、不依赖管家授权。直接任务保留鉴权的原会话/输入消息来源，执行前、交付、读取及续作均复验来源和授权。页面继续要求完整预览与明确确认；选材执行器不能消费上一轮素材成果，因此不显示不受支持的续作入口。
- 本地配套升级为`aiTasks:1/siteDocuments:2/agentWorkspaces:5`及迁移042。迁移保留旧任务为coordinated，约束direct来源身份与模式；040/041/042均未部署。API/Worker/客户端需同合同配套，不能将当前源码直接部署后称旧TestFlight51仍能完整使用。
- 专业消息以同一key持久准入/分派/完成或失败；重复请求不再次调用模型，未知结果与迟到答复不能补建任务。任务和消息回执同事务完成。只把当前请求及明确连续澄清中的用户原文变成目标；普通历史仅供原专业Agent咨询，不自动转成共享目标。新请求可明确清除待续需求；旧相册已接受key、ai_tasks及素材回放仍走原路径，新相册交办创建direct工作空间，不重复执行。
- RN专业消息带精确任务入口，详情可返回原会话；妙页与讯页任务列表共用真实工作空间，旧单任务继续独立读取。已结束且服务端未提供`continue`的直接任务可回原专业会话准备新草稿，保留历轮修改与引用，用户发送前不执行。新标记JSON答复在正文、复制、分享和预览中保持原文；旧未标记漫画/页面历史展示器仍保留，未宣称历史数据整治完成。成果列表纳入真实选材结果，已保存页面分别提供预览和查看原任务入口。
- 新增22个公开合成分派用例、严格协议及数据最小化测试；这是离线输入/协议验证，不是模型生成结果的准确率。两个相册端到端验收脚本同步改用workspace5、直接任务轮询与鉴权素材读取，保留明确空结果、回执重放、越权和撤权断言；仅跑离线脚本测试，未调用付费检索/模型或真实OSS。
- 最终整仓`MIAOXUN_DOTENV_ENABLED=false ./scripts/check-repository.sh`退出0：后端852通过、257项专用环境门控跳过，Agent48，RN70套/893项；TypeScript、ESLint零警告、Prettier及Web/制品检查通过。早轮失败为已变更能力的旧模式断言，按真实支持目录更新并保留严格断言；最终日志`repository-check-handoff.log`。独立隔离PG共200项零跳过通过：工作空间旧路径88+direct27（合并115，`workspace-pg-delivery.log`）、042迁移4、专业消息18、旧专业会话5、旧相册任务16、管家23、任务讨论19。离线相册脚本回归29/29。
- 最终固定iPhone17正式Bundle `--build-only`成功，未覆盖日常App。构建记录`/Users/gary/Library/Application Support/MiaoxunDevelopment/76237d6f8986/builds/2026-10-20T10-26-31-990Z/build.json`，构建前后源码摘要相同，JS为`85195230cebedff3504e1e7635e42463bf52642b21635e448d0662b5c8cadca9`。独立Bundle `com.wangruoshi.miaoxun.specialistQA`使用相同JS及本机API/PG/HTTPS分派替身/执行器替身，无产品测试开关。构建之后只修验证脚本、测试与文档，RN产品源码未再改动。
- 实际模拟器验收：停用管家的隔离账号先咨询，DB仍为0任务；明确交办后进入原专业任务，同一任务完成第2轮；重启后原会话入口、讯页任务和妙页指向同一记录。模糊“按刚才方案”返回澄清，清除关联后独立请求不带旧需求。受控执行失败显示明确失败，准备新草稿不自动建任务。建站任务完整预览后才能保存，成果页既能重新打开页面也能返回原任务。数据库终态为3个direct工作空间/4轮（2成功、1受控失败）、1个独立保存页面、0个旧ai_tasks、0个管家节点，管家保持停用。未在模拟器验证真实媒体检索或连续滑选手感。
- 已退出临时账号（服务端活跃会话0）、卸载副本、核对PID后停止本轮API/Worker/模型替身与PG；52564/52565/50333端口关闭，临时明文凭据与TLS私钥/证书已移除，停机数据库及证据保留。正式App的路径、Info/JS摘要和数据容器与验收前一致，并已重新启动。总证据`simulator-qa-final.json`、`qa-database-evidence.json`、`qa-cleanup.json`；截图包含`simulator-direct-round2.png`、`simulator-failed-task-restart.png`、`simulator-page-outcomes.png`。证据目录：`/Users/gary/Library/Application Support/MiaoxunReleasePreparations/specialist-workspace-20261020-180242/`。
- 本轮无生产部署、真实模型调用、新TestFlight上传、Git提交或推送。下一阶段进入真实执行能力补齐；建议先明确文件上传/解析及其鉴权素材合同，再分别处理漫画成图、视频成片与协作3D。真实模型分派评估、真机与发布配套各自验证，不把本地测试替身通过当作可上线产品结论。

### 2026-10-21 文本文件处理（本地实现，尚未发布）

- 用户选择本阶段先支持UTF-8的TXT、Markdown、JSON、CSV等文本文件；实际扩展为`.txt/.md/.markdown/.json/.csv/.tsv`，后两类按完整文字读取，不宣称结构化表格解析。PDF、Word、图片与OCR仍明确未接入。单文件最大256 KiB/50000个Unicode字符，同任务文件合计最多50000字符；实际上传或含正文登记时，非法编码、空白、NUL、格式/MIME不符或超限均显式失败，不截断后假报成功。
- 二楼文件页接通iOS系统选择、原生URLSession文件上传、全文核对、删除及交给文件Agent。选择文件只生成空需求草稿和引用，必须用户发送才创建任务。失败重试复用原文件/幂等键，放弃清临时副本；离页/后台/换号撤去旧正文并隔离迟到结果。原生模块限制固定API来源和路径、拒绝重定向，不把文件转为Base64传JS。
- 迁移043保存可靠全文与解析版本、上传幂等回执；旧1000字预览不伪造回填。并发同key仅一资产，异参409、删后同key410且不复活；删除清除正文、预览和附属内容。修复了SQL CHECK对NULL三值逻辑的漏洞，并在新库重跑43个迁移与重复no-op、42→43升级验证。
- 新增`station-file`引用及`file.summary`能力，沿用持久direct任务、原任务续作和全文成果读取；协作合同升为6，任务1/页面2不变。版本绑定原字节、全文哈希和解析版，执行/交付/读取/续作重验来源及完整授权。分派仅接收文件元信息，全文仅进专业执行节点；没有新增管家`files:read`或自动扩大既有授权。长emoji文件名不再截断Unicode字符，旧JSON登记孤立surrogate明确拒绝。
- 实际删除态验收发现并修复跨层缺陷：公开DTO显式返回`readAccess`来源失效标记，保留两轮成功历史及节点关系，隐藏所有成果并关闭继续修改；RN仅对这一严格状态允许成果节点ID仍存在。旧continue回执重放同样返回受保护DTO，不新建轮次。失效来源的新管家讨论明确409，受理/调用前/交付前锁定复验，禁止通过旧讨论历史继续引用失效结果；原成功历史回执保留。
- RN四件套及全仓`MIAOXUN_DOTENV_ENABLED=false ./scripts/check-repository.sh`最终退出0：RN72套909项、backend859项通过/268项环境门控跳过、Agent48项通过。真实HTTP两轮删除态DTO通过RN实际validator与界面回归；正常状态断言未放宽。日志`rn-final.log`、`repository-check-file-final.log`。
- 独立真实PostgreSQL/HTTP累计67个不同用例通过、零跳过：文件全文/权限/幂等/升级、direct与文字工作区回归、Unicode边界及失效讨论；其中重复执行不重复计数。覆盖执行中删源/撤权、续作重放、讨论调用前后删除及旧预览不可引用。见`validation-summary.json`和`file-decision-discussion-final.log`；未连接生产数据库。
- 最新`ios --build-only`成功，源码前后摘要一致，正式已安装App未改变。构建证据`/Users/gary/Library/Application Support/MiaoxunDevelopment/76237d6f8986/builds/2026-10-21T03-35-25-359Z/build.json`，JS SHA256 `f95f753bd9cfa9e491cefb29b2669e0fc712bf009603d380acb5edbabcd384b7`。同JS独立副本`com.wangruoshi.miaoxun.fileQA`连接本机API/PG/明确标注的模型替身，正式Bundle及HTTPS配置保留。
- 固定iPhone17已实际走通系统picker取消、完整1671字符Markdown上传、专业任务第1→2轮、强退重启恢复；两轮执行均接收到1000字预览之外的尾部核验文字。非法UTF-8重试与50001字符文件均明确失败，不新增资产，放弃后原生临时副本为0；源文件已通过UI确认删除。最终新构建实看文件与成果空态无格式错误，原任务第2轮及第1轮历史仍可读、明确显示文件内容不可用、没有成果正文或继续修改入口。截图`simulator-file-deleted-list-final.png`、`simulator-file-deleted-history-final.png`、`simulator-file-deleted-history-bottom-final.png`；此前格式错误截图保留为失败证据。
- 最终只读数据库核对：1个文件已软删且正文/预览为0，1个direct任务/2轮、2个成功节点、0个管家节点与活动租约；本机替身执行2次、分派1次。已通过产品UI退出临时账号，活跃会话0；卸载独立副本，核PID停止API/Worker/替身与本轮PG，64003/64694/64695端口关闭，临时明文凭据和TLS密钥/证书已删除、内存变量已清理，停机数据库与日志保留。正式模拟器App的路径、Info/JS摘要及数据容器与验收前相同，已重新启动。见`qa-database-evidence.json`、`qa-cleanup.json`、`simulator-file-deletion-final.json`及`simulator-qa-final.json`；最终构建之后只更新交接文档，`git diff --check`通过。
- 本阶段模型分工为主代理审查、`gpt-6.1-sol`协作实施与验证，没有修改产品后端供应商。证据根目录：`/Users/gary/Library/Application Support/MiaoxunReleasePreparations/file-workspace-20261021-103232/`。本地替身仅证明数据与任务链路，真实摘要质量、真机与Release配套仍未验证；040–043未部署、无真实/付费模型调用、新TestFlight上传、Git提交或推送。

## Git基线整理与合同夹具修正（2026-10-21）

从`9ec03a2`、142个已跟踪修改及52个未跟踪文件开始，原有内容均保留入Git：默认管家`b75767d`含6个源码/测试文件及3份局部合同说明；完整功能`4eb5254`含UI、041–043、原生文件选择、评估、runtime白名单与功能文档；入口和历史证据由本次文档提交收尾。没有新增业务文件、依赖、检查框架或独立报告。`App.tsx`、消息链路、仓库和测试混合多个功能，不为提交外观重建未经验证的中间版本。无推送、生产操作、付费调用或TestFlight上传。

默认管家独立性使用原HEAD的`git archive`临时源码快照，仅覆盖6文件并以链接复用既有依赖，`node --test test/agent-access.test.js test/default-admin-bootstrap.test.js`为24/24、零跳过，快照已移除。授权说明同步澄清040只补默认管家，其他Agent及已有任务快照不自动扩权。

提交审查发现两处普通全仓门控未执行的旧HTTP夹具：管家默认合同5令成功路径426而非201；service拒绝列表误含6，实际202而非预期426。独立PG18完整43迁移库先复现两项失败，再仅更正上述版本值；故意覆盖legacy回放的合同4保留。完整service21/21、butler23/23通过，零失败/取消/跳过，不放宽业务合同或测试断言。

本记录既有证据根目录保存`git-cleanup-before-*-20261021-091746.log`、`git-cleanup-after-*-20261021-091746.log`、`git-cleanup-migrations-20261021-091746.log`、`git-cleanup-pg-counts-20261021-091746.log`及`git-cleanup-pg-stop-20261021-091746.log`。应用角色非superuser；结束users/auth_sessions/chat_messages/agent_workspaces/ai_tasks均0，agent_runs37（测试审计）。Fast stop退出0、pg_ctl status3、59366无监听后，仅移除本轮新建临时集群，已有5432及停机证据库未动。模型全部为测试内替身。

全仓`MIAOXUN_DOTENV_ENABLED=false ./scripts/check-repository.sh`退出0，完整日志`repository-git-cleanup-20261021-091746.log`：backend874通过/0失败/268环境跳过、RN72套915项、Agent50、Admin15、avatar-web29、media3及打包/构建检查通过；环境跳过不算PG通过。新增服务入库时另清掉末尾空行；未改RN、迁移或业务执行，未重跑设备/真实模型验收。

8个本地分支已核对：main与codex/testflight-44为当前祖先；旧agent-workspaces/butler分支的3/4个HEAD外提交均被候选232a142历史包含。保留合同3发布来源232a142；其workspace核心、036–039及页面契约已进入9ec03a2，后续升级纳入本批功能提交。生产分支be87306/5cbc27c的正式origin/Bundle、固定模拟器和发布保护已由基线承接，不能覆盖后来的build-only/0755修复。Build24的646a576及17个HEAD外提交保留，其中旧homepage/station-web路径并未等价合并，现行site-document体系不直接恢复这些历史实现。`git cherry`的“+”不证明缺功能，5429eb6是汇总基线；按文件补丁与最终状态核对后，未发现需直接合入的遗漏。

两个旧活动工作树均干净，无子模块、嵌套Git、App/签名工件或打开文件。release树11MB的ignored均为主树依赖链接，production树251MB的ignored仅Web依赖/dist，未发现独有未受Git保护数据。它们不在本聊天`list_artifacts`中，保留checkout待原所属聊天归档；所有旧分支/提交未删除。

Git整理为`COMPLETE WITH CONDITIONS`：源码基线已可定位，旧checkout归档留有明确后续；产品发布仍`BLOCKED`，真人评分NOT_RUN/不批准发布、正式runtime、签名Release、生产恢复和真机门禁未解除。
