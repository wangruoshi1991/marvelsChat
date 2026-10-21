# Build48 及前后阶段实施与验证历史

重复阶段文档已移出工作区；详细原文保存在仓库外受限归档 `~/Library/Application Support/MiaoxunReleasePreparations/repository-cleanup-20261014/superseded-documentation-20261015.tar.gz`。本文保留历史汇总和原始运行证据路径。

本文件于2026-10-15从 CURRENT 迁出，2026-10-21补入10月15—19日实施与整理记录，复用现有档案保留证据。下文的“当前”“下一步”“候选”和操作范围均指各段发生时，不是现在的部署状态或执行指令。现状仅见 [CURRENT](CURRENT.md)。

## Build48同步故障与前向恢复

- 用户报告48无法同步账号空间。即时原因已实证：升级中线上入口返回503 `MAINTENANCE`，三服务已停止；没有证据表明账号数据损坏。另确认旧038后端草稿DTO含prompt/draft等字段，而48客户端只接六字段metadata；账号有草稿时旧DTO会触发`STATION_CONTENT_CONTRACT_MISMATCH`。新runtime已带六字段mapper，不为旧DTO增加兼容路径。用户本轮确认真机Build48同步恢复并可进入妙页；草稿/任务内容与其他页面未逐项验收。
- 首轮activate停在`harden-release`，039已经提交、停写dump实际恢复通过，app仍指旧runtime。前向续跑发现runtime根目录继承暂存目录0700，服务账号无法遍历；加固脚本仅去写权限，没有补可遍历权限。新runtime改为root:root0755后重新加固并实测代码/父目录/env不可写、env可读、storage可写。主工作区加固脚本已把runtime纳入显式0755目录，`bash -n`及禁网一次性容器0700回归通过；没有改动已部署的227文件内容。
- 038停写恢复证据为`/opt/projects/marvels-chat/backups/dynamic-agents-20261014-48/`，dump SHA256 `3e81170ecda75a6c049371dabf5c64828b4cc689002cbd3f14222eb9fc771da9`。实际恢复的56张表/3序列/38迁移、schema/owner/ACL/数据完全匹配，临时库已删除。039仅1 applied/38 unchanged，重复0 applied/39 unchanged；续跑只读核实039与四项约束、账户/授权/资料/草稿正文/序列保持、队列全部0，不重跑迁移、不用旧dump覆盖新库。
- 新runtime逐文件227项SHA核验通过，manifest SHA256 `dd12523ceddb4b8261ef72c371ffdbce0a2fed26fb6ec3fd7f74afb99ec8b044`，归档SHA256 `eab54d43de940bc6b208c868a87b5ebd6b543c0c2fdd41e6f6b5489d947db95b`。前向恢复脚本SHA256 `7af27fd30a41eeee2b50aecc01f24071e87f12ec0ded268265783b0edaabe230`；完整受限报告在服务器准备目录`reports/activate-report.json`及`reports/resume-report.json`，本机受限目录为`~/Library/Application Support/MiaoxunReleasePreparations/contract3-release-20261014/`。恢复脚本没有供应商付费调用、生产dump恢复、再次迁移或自动回滚。
- 此前所谓“下载Linux”实际是现有Ubuntu服务器隔离暂存目录里的Node依赖安装，未下载/替换Linux系统；本次权限回归使用本机已缓存镜像`--pull=never --network none --rm`，无系统下载、无残留容器。旧runtime已逐文件归档并经`tar --compare`校验后清理，不能作为039数据库的可在线回滚版本；数据库恢复材料和报告仍受限保留。

## Build48固定iPhone17模拟器验收（2026-10-14）

- 使用`node scripts/miaoxun-development.mjs ios`原位安装并启动，正式Bundle/origin，Debug `1.0(48)`，设备`iPhone 17 / iOS 26.5`；记录`~/Library/Application Support/MiaoxunDevelopment/69e1bb93ddda/builds/2026-10-14T11-42-34-947Z/build.json`，JS SHA256 `00ce4f7fc4b13e6927015c2a018fd7fdb1e4435a35bd9ae1b0e6887262179601`。模拟器显示已登录内容，未发送消息、创建任务、授权或保存。
- 实看默认妙页；妙与讯的共用菜单均为上/左/下布局，触发后可展开，关闭后辅助功能树移除菜单。真长按尝试后系统明确提示模拟器不支持稳定语音识别，未接受麦克风权限或提交音频；因此不能把方向滑选/松手选中报告为设备通过。
- 二楼辅助功能树显示六个入口，截图中前五项完整、第六项露出；选择信息海可显示现有通知。当前自动化拖动未能证实横向吸附与底柄上滑回讯，仍须真机触摸验收。相关Jest复跑通过：`voiceShortcutDock`、`aiAssistGesture`、`secondFloor`、`appWorkspaceNavigation`，4套/95项。
- 真机Build48账号空间恢复由用户确认，不等同于Simulator手势或素材闭环通过；真实素材→多Agent→页面预览→确认保存继续作为独立待验。

## 发布前核验记录（历史）

发布前只读核对生产后端及三个服务进程，`NEW_API_TIMEOUT_MS=45000`实际生效；该时限不足以容纳T02观测到的约120秒专业贡献。此后仅`coordinate`/`contribute`改用独立`NEW_API_WORKSPACE_TIMEOUT_MS`默认180000毫秒，普通对话仍使用既有45秒，节点仍受20分钟总期限约束；现已随48配套部署。未知回执保持不重试。

制品白名单已改为精确运行边界：包含后端源码/迁移、顶层Agent定义及运行helper、两个共享JS合同、5个后端运维命令入口、生产加固脚本、部署模板和重新构建的管理台/3D viewer；排除测试、评测、Agent CLI、备份/恢复与开发启动器。runtime中的后端`package.json`只保留API、双Worker及随包运维命令，Agent包投影只留ESM边界和注册器导出；manifest记录投影规则。前端仍从HEAD临时树执行锁文件`npm ci`和构建，不读本地dist、`.env`或`VITE_*`。隔离包测试验证必要文件、排除项、命令路径闭合和全部manifest SHA。

2026-10-14续审：任务详情现在在App离开前台时以不含用户内容的底色替代页面；未注册Agent使用通用名称，不显示内部ID。未知授权scope不再原样显示，添加含未知scope的Agent会停止并提示更新，不能误确认。聊天消息长按的径向菜单保留“复制”，“更多”面板移除重复的复制入口。运行时制品不再携带Agent CLI、评测输入或其它项目测试；部署文档说明显式白名单及包内命令投影。

独立候选工作树的`MIAOXUN_DOTENV_ENABLED=false ./scripts/check-repository.sh`退出0：backend773 passed、167项因专用PostgreSQL环境未启用而跳过；RN64组699项、Agents41、Admin15、avatar-web29、media-web3通过，格式/lint/类型检查及构建通过。运行时制品回归1/1通过。039专用隔离PostgreSQL测试在主树和候选树各9/9通过，包含双连接锁顺序反转、真实死锁检测/事务回滚、排空后成功迁移及重复no-op；两次只使用`127.0.0.1`绑定的PostgreSQL16 tmpfs一次性容器，均停止并自动删除。候选来源清单的1051个现存非忽略文件逐项SHA与主工作区一致，候选相对653ad85保留一个旧Agent目录页删除；Build 48默认版本/下限两平台一致。候选本地提交实际生成runtime：227文件逐项manifest SHA匹配、7条后端命令路径闭合、无测试/评测/开发文件；来源SHA及归档SHA在受限准备目录的manifest/归档文件中。整仓门禁中的167项需要代表性038恢复快照、真实HTTP/Worker环境的其它集成测试仍未被本次回归覆盖。

后端路由复审现已完成，发现并修复两项：同一消息幂等重放会重新返回已删除的用户输入/Agent回复；现在已删除输入明确返回`MESSAGE_DELETED`，已删除输出不返回，但内部终态记录保留，不触发模型重跑。新增同步聊天和异步任务的真实HTTP/PG回归覆盖删除两端、终态不变和零额外模型调用。媒体检索工作区回执原来只记请求模型，现从供应商响应读取受限长度的实际模型标识并传到解析、向量和重排回执；缺失或无效时为`null`。媒体检索套件187通过，1项专用迁移集成按环境开关跳过；后端路由审查报告覆盖授权、漫画素材、公开消息、检索结果归属/版本与迁移CLI。`git diff --check`通过。

清理结论：主工作区仍约137个已修改跟踪文件及203个未跟踪路径，索引为空；主体为本轮源码、迁移、测试和证据，不因数量删除。候选分支工作树干净；仅保留该候选门禁所需的忽略依赖目录。两工作树整仓检查产生的`admin/dist`、`avatar-web/dist`、`media-retrieval-web/dist`在检查后精确删除；`ios/build`、Android build、`avatar-web/test-results`、`output/test-evidence`与恢复资料保留。临时PG容器及本轮打包临时目录均确认删除；最终runtime归档与检查日志保存在权限0700/0600的本机准备目录。2026-10-14又清除了准备目录的Finder `.DS_Store`，以及无引用、可由受限归档逐文件重建的旧打包临时副本；保留唯一未能找到同SHA归档的历史中间副本、当前候选归档和所有验收证据。正式环境与工作区不一致：线上仍为c04385e/038/合同1/2/2及旧Agent版本；此前只核过线上健康、进程cwd与少量版本，完整manifest、环境差异及备份恢复尚未验证。

2026-10-14恢复演练：经用户授权只读取回服务器留存的`post038-live.dump`，本机权限0600、423295字节，SHA256 `09063990804b1bda21c30067f89399438e15b3ebdbc18d859704b9301f60a3cb`与服务器记录一致。一次性loopback PostgreSQL 18.4恢复验证了038的56张公共表、3个序列、38条迁移记录和vector扩展；在恢复库运行039，结果为1 applied/38 unchanged，约束、外键、唯一键和6条历史草稿状态通过；重复运行0 applied/39 unchanged。临时数据库和集群将在本轮结束时删除，备份仅保留在受限准备目录；该演练不修改生产。

下一步已不再是恢复演练：038→039隔离恢复、约束/历史数据和重复迁移已通过，接下来在候选工作树配套构建同源API、两个Worker和Build48 App。固定设备构建入口当前仍访问生产readiness，线上合同2不支持合同3，不能用它验收当前候选。配套门禁完成后，再按已有TestFlight更新授权给出准确制品证据并更新TestFlight，用固定iPhone17验收连续触摸、完整授权及真实素材→动态多Agent→用户可见成果→页面预览→确认保存。正式后端切换仍须单独确认范围；TestFlight47仍旧、TestFlight46继续暂缓。本轮候选仅本地提交/归档，未推送、生产切换或TestFlight上传。


## 需求驱动文字协作实现与发布证据（2026-10-14）

本阶段回应“冻结是什么意思、协作为何固定相册/建站、是否需要算法”。冻结仅指发布快照与配套核对，不限制产品演进。现有模型规划与确定性依赖调度已经动态；本轮补专业执行和交接，复用同一API、AI Worker及PostgreSQL，不新增Agent服务、模型Key或编排框架。

- 注册8项真实专业能力：相册选材、建站、文件文字摘要、漫画文字分镜、视频脚本、形象建议、3D准备建议及管家显式汇总。显式`contribute`不以chat/plan兜底，多个能力逐一匹配真实执行器。按需求支持单Agent、并行、顺序依赖与汇总；文字可独立交付或交给建站，不强制相册或页面。普通咨询仍一次分派模型调用。漫画成图、视频成片、设备文件/PDF解析和协作3D生成尚未接入，文字方案不冒充媒体成品。
- 共同goal只来自服务器校验的用户需求及澄清原文链，内部`requestMessageIds`覆盖所有接纳的用户轮次，逐次及提交事务重验owner/thread/未撤回/顺序；模型workspace决策不再含goal，旧模型goal明确拒绝，不做去字段兼容。超2000明确提示整理，不截断。管家普通回复可使用已授权的私有上下文，但私有资料、Agent回复及模型改写不会成为共享目标。协调者只见目标、节点状态、引用类型/索引/ID/版本、成果类型/来源类型及素材数量，不接收自由标题、步骤摘要或正文。需要整合正文时显式汇总。
- 每个节点只接选中的引用及明确依赖，保留完整原始来源并用接收Agent自己的能力范围与任务原快照重验。执行先重载数据库claim，不信caller传来的goal/权限/依赖；调用前、保存和最终交付重验，撤权或资料变化明确失败。来源省略、冲突、伪造调用和缺权不能进入模型调用或留下成果。
- 内部`text_result`保存自由正文与来源；公共所有DTO仅`{kind,id:<产出节点ID>,title}`。正文仅`GET /api/agent-workspaces/:workspaceId/text/:nodeId`返回`{id,title,content}`，重新鉴权；列表、取消、详情与提交重放不带正文。RN复用`ChatMessageText`，换号、关页、后台清正文，迟到请求无效，回前台/主动重试重新读取。普通revision轮询不重复拉正文；旧inline成果明确拒绝。
- 039 `workspace_site_draft_ownership`给未确认协作页面绑定owner节点，严格回填、复合owner外键、唯一与级联删除；确认与私有保存同事务解绑，随后旧页面被替换为draft也仍是用户独立内容。完整document读取复用`validateDelivery`且锁顺序与确认一致，禁止从独立apply绕过workspace确认。页面列表、bootstrap与刷新统一六字段metadata，无prompt、正文或模型后台字段；完整预览自身跟随AppState清正文与审阅状态。成果列表使用中性“页面草稿”，不把旧保存页误标未确认。**039只绑定协作产出；既有独立建站task的未确认document仍按owner/文内资源读取，confirm重验原Agent与来源，不能宣称所有页面已采用协作来源门禁。**
- 本轮实现验收时曾处于协作合同3、039尚待配套阶段；当前已随Build48/039上线，真实运行基线见文首。已有不完整Agent授权仍按用户决定移除后重新添加，不自动补权。管家/相册/建站源码版本记录为0.3.1/0.3.2/0.3.4，3D顾问1.0.1；原工作区修改与空索引状态以当前Git核验为准。
- 本轮再次运行`MIAOXUN_DOTENV_ENABLED=false ./scripts/check-repository.sh`退出0：backend772 passed、164项因未提供专用PostgreSQL集成变量而门控跳过、0fail；RN64组699项，Agents41、Admin15、media web3；语法、格式、lint、类型、构建与内嵌viewer一致性通过。运行时打包回归1/1通过，覆盖提交源、锁文件构建、前端忽略素材/环境变量排除与manifest SHA。此前同阶段的隔离PostgreSQL真实回归170项通过、0skip，日志在`output/test-evidence/20261014-dynamic-collaboration/`。结构规划合同评测包含10条新增文字组合案例，仍不证明真实模型质量。
- 隔离PG真实回归170项通过、0skip（独立site suite另2项路由单测）：新文字HTTP链29、分派23、迁移约束8、原能力5/仓储24/service21/提交9/相册任务14/微秒历史1/漫画16/独立建站20。覆盖并行和显式汇总、文字→页面→预览/确认、撤权/来源变化拒读、任务清理与保存独立、metadata早于确认的并发时序。主隔离库038→039为1 applied/38 unchanged，重复0/39；另全新库由独立site套创建39项，后续重复0/39。迁移8项在独立事务schema验证回填、歧义和跨owner原子拒绝，schema回滚清理。日志在同一证据目录。
- 固定iPhone17最终候选`ios --build-only`构建/严格签名通过，正式Bundle/HTTPS、Debug1.0(47)，`installed:false`、`launched:false`、`officialUnchanged:true`。证据`~/Library/Application Support/MiaoxunDevelopment/76237d6f8986/builds/2026-10-14T04-59-45-353Z/build.json`；构建前后source均`7bcbcc593ba28442bc1e152169eefe6c031767ae64a1f431279ffe34b72b8330`，JS`46f0ced2eb89f576738bf62d88665201b7fcc302889a13f99a20f8fa5defd432`。此后仅同步交接与架构文档，不改实施代码。当时Simulator安装仍为“47反馈后的产品修正”节所记03:45的旧反馈候选，不能当作新协作3已验收；同Build号不代表同源码。
- 先核对本轮PG归属，清空两套一次性库的fixture/无owner审计，业务/审计均0、迁移均39，再删除仅本轮`miaoxun-collab-review-20261014`容器及其具标签卷；产品数据库未动。整仓再生的三个Web dist精确清除，源码、依赖、当前构建和恢复资料保留。证据`isolated-db-cleanup.json`与`cleanup-completed.json`。没有本轮付费模型调用、生产写入/切换、新TestFlight上传或Git推送。

本阶段当时判定为`COMPLETE WITH CONDITIONS`（仅本地候选）；Build48配套部署随后完成。隔离真实规划与专业贡献证据已通过；当前仍待纯文字成果转页面预览/确认验收，以及固定iPhone17和用户真机核对。此前8/8模型分派、B02素材链与本日反馈阶段106项不能代替新提示/新执行器质量。连续触摸、真机语音及完整真实设备素材链仍未标通过，TestFlight46继续暂缓。

## 需求驱动协作真实模型验收（2026-10-14，候选）

- 新增并保留旧v1默认集不变：真实规划公开集合6例（注册目录5例＋来自本轮隔离账户真实`user_agents`行的缺视频授权快照1例），管家文字分派6例。浮生vip使用同一指定模型和端点，不写入正式模型环境；用户已取消本轮测试费用上限。planning 12/12通过，全部实际返回模型`gpt-6.1-sol`且usage完整，未知0。逐条人工复核确认：单一任务只选一个专业Agent；分镜到脚本按依赖顺序；独立分镜/形象建议汇总；缺权请求精确；未接漫画成图不伪装成分镜。它们是公开文字初始规划/分派样本，不证明任意需求泛化、真实素材质量或成片能力。
- T01首次真实执行中，管家规划成功并选出comic.storyboard→video.script→text.synthesize。分镜Agent在隔离运行设定的60秒客户端超时，抛AbortError/504；是否收到响应头、是否完成生成、用量与是否计费均未知。runner立即停止且没有重试，持久节点标`interrupted/AI_PROVIDER_RESULT_UNKNOWN`，后续节点取消。该未知结果保持原样，不能重放，也不能说成未计费。
- T02使用全新隔离PostgreSQL、新owner、新合成故事与完整授权快照。浮生vip的5次请求均HTTP 200，响应头、受限数据块、served model及完整usage与数据库持久回执一致；合计17,577 tokens，unknown/retry均0。真实规划选择comic.storyboard和character.advise两个独立专业节点，真实claim相差约12–15ms，执行重叠约42.3秒；两份贡献成功接收后，管家明确调用`text.synthesize`，workspace最终成功，`text_result`与持久正文一致。计划没有多余或重复专业Agent，脱敏扫描未发现后台字段或流程信息泄漏。没有生产写入、设备操作或额外素材访问。
- T02的character.advise调用耗时119.732秒，距离本次120秒客户端观察上限仅0.268秒。该次成功证明真实并行和汇总路径可运行，但单次样本不足以证明响应稳定；需把接近超时作为真机验收关注项，不重试T01未知请求。审计位于本机受限目录`~/Library/Application Support/MiaoxunReleasePreparations/dynamic-live-20261014/parallel-text-execution/audit-redacted.md`；原始响应只在同目录权限0600文件中。精确标记的T02容器/数据卷已删除，合成账户、授权、消息、workspace、节点与草稿相关表清零，临时DB凭据已移除。T01证据未触碰。
- 新增provider profile与回归、两组合同3案例/grade、CLI调用边界；完整整仓脚本于上述runner测试完成后再次通过：backend日志、Agents/RN等见私有`repository-check.log`，RN64组699项。`backend/test/live-eval-provider.test.js`等新用例覆盖空价估算、真实模型/usage、unknown停止、授权精确集合、顺序依赖、并行汇总与不必要选人拒绝。实际浮生输出及隔离合成执行证据位于仓库外`~/Library/Application Support/MiaoxunReleasePreparations/dynamic-live-20261014/`，权限0600；不包含凭据。一次性PostgreSQL容器/卷已确认仅含合成数据后清除，连接凭据已清理；生产库、App与线上Worker均未触碰。
- 当前仍未部署/安装/上传，候选合同3/039不能在旧47上验收。下一步是核对本地候选App、API、双Worker、模型配置和039迁移的同源性，完成发布级整仓/迁移/运行边界检查；通过后先配套候选后端与固定iPhone17，再实际验证Agent授权、用户可见成果、纯文字→页面预览/确认、连续触摸、真机语音及真实照片素材链。用户此前已授权在配套可用后更新TestFlight；上传前仍要给出准确制品与门禁结果。旧T01 unknown不重放，TestFlight46继续暂缓。

## 47反馈后的产品修正（2026-10-14，工作区）

- Agent添加只在“我 → AI伙伴”一次展示全部声明范围与必要云端说明，确认后原子添加/授权；取消零写入，移除撤权。二楼改为隐私，只打开账号设置。后端App/admin启用、相册同意、聊天、异步任务、协作能力目录与执行/成果读取都要求当前授权与声明完整一致；旧不完整授权拒绝并要求移除后重新添加，不自动补权、重置生产账号或保留更新授权页面。专业Agent不能借管家权限，任务自己的原范围快照继续约束执行。
- 妙页任务卡以目标、真实进展、状态/参与者分层，去重复说明、取消后的重复摘要、额外分隔和单列叠加间距。妙/讯共享`VoiceShortcutDock`，入口同幅上移16pt、三向距离56pt且54pt真实按钮命中；触区边缘原地松手不会误选。内容卡、消息、相册、3D共用`AIAssistGestureSurface`，3D重载移出长按对象避免嵌套控件竞争，去掉叠加按压透明度突变。
- 普通Agent正文/对话列表预览共用段落、标题、列表、强调和代码识别，不在列表露出Markdown强调符号；用户原文和未知JSON保留。真实相册素材走已鉴权的图片/视频查看组件，协作素材复用同一预览。不会把模型写出的图片URL/HTML当可执行媒体。已知历史漫画/页面草稿只投影用户内容，普通聊天提示与结构生成分离；不做通用JSON清洗或编造替代答复。当前尚无通用生图/成片执行器。
- 统一消息公开DTO用于bootstrap、history、sync、好友开会话、发送/重放、撤回及实时事件；删除owner、供应商、token、指纹和内部任务/检索关联，保留真实回复/引用/重试/澄清/成果导航。管家原输入ID只留数据库，公开快照无需另加持久来源标记；公开任务合同及成果关联保留。
- 漫画分镜旧接口曾仅鉴权账号并默认取全库媒体/文件，存在绕过Agent授权及过量发送上下文的问题。本轮收紧到漫画Agent完整声明授权及本次明确选定的日记/媒体窄字段；无选择不读全库，未声明文件来源明确拒绝，客户端移除无用文件输入。模型调用前和保存事务再次校验原声明/来源快照与当前授权，撤权/内容变化不保存；成功草稿与两类审计同事务提交，非法模型素材引用明确拒绝。漫画公共DTO从统一mapper删除未消费的metadata，模型/供应商审计仍保留数据库，不发送到bootstrap/列表/创建结果。该接口交付仍只是可读文本分镜，不是成图或协作执行器。
- 相册异步任务与同步Agent共用按输入消息ID查询的先前历史，数据库内精确比较时间/id，不经JS毫秒截断；不再按最后一条同文用户消息删除“当前输入”，更早重复请求完整保留。
- 删除仅测试仍引用的旧`AgentDirectoryScreen`及其私有`AgentAccessCard`，共825行产品代码；完整授权、取消、换号、卸载、声明变化和重复添加保护转移到真实`StationAgentsPanel`测试。移动端211个源码/声明文件中，209个从App入口可达，另外两份是必要`.d.ts`；限定backend/agents的157个生产模块均有静态、注册或运维入口引用，未发现可直接删除的供应商或旧UI残留。该引用审查不代表每个导出函数都已全面裁剪。
- 本地删除四个可重建路径约454.1MiB（按已分配文件块统计）；六份旧xcarchive、Build38导出目录及39配置共507文件/约313.8MiB完整移到仓库外受限恢复目录，逐文件SHA/权限/mtime清单一致，迁移归档不等于释放磁盘。当前依赖、素材、数据库、凭据和8768预览保留。报告位于`~/Library/Application Support/MiaoxunReleasePreparations/repository-cleanup-20261014/rebuildable-cache-cleanup-report.json`。
- 生产只读清理核对确认releases仅当前一份，三服务运行路径一致；backups约434.79MiB。两套47失败runtime的2914个非敏感普通文件相同，但各自恢复/失败报告独立，现场归档为原子重命名而非另一压缩副本，因此保留整套。两套评测材料尚未证实完整替代归档。当前未发现可直接删除的额外生产目录，未操作业务数据或恢复点；有限证据见`output/test-evidence/20261014-production-inventory/SUMMARY.md`。
- 本反馈修正阶段的多Agent专业执行器当时只有相册选材与建站页面。注册漫画、文件、视频Agent或配置浮生文本模型不能替代其工作空间执行器；独立部署边界、通用多模态、真机素材→协作→完整预览→确认链仍待实现/验收。这一反馈修正阶段未扩展执行器或调用付费模型；随后本日文字扩展见上节。
- 最终`MIAOXUN_DOTENV_ENABLED=false ./scripts/check-repository.sh`退出0：backend716 passed/121环境门控skip/0fail，RN63组640项，Agents40、Admin15、media web3；格式、lint、类型、构建及内嵌3D viewer一致性通过，日志`/tmp/miaoxun-product-final-20261014.log`。全量无act、teardown或dispatchEvent警告；环境门控skip不算PG通过。
- 全新loopback临时PG16/pgvector应用38/38迁移；严格授权、消息/任务/撤回、微秒历史、管家、协作、提交、建站与漫画真实HTTP/事务集成106/106通过、0skip；漫画service另4/4。覆盖完整声明、零副作用拒绝、子Agent自身授权、撤权/声明及来源变化、保存锁与审计故障回滚。前轮公开消息证据保留在`output/test-evidence/20261014-public-message-integration/`，最终复验见`20261014-final-authorization/`与`20261014-comic-access/`。先核对并清空一次性库所有fixture及残留无owner审计，业务/审计均0、迁移38，再删除仅本轮容器和副库；产品数据库未动。
- 固定iPhone17最终构建、严格签名、原位安装与启动成功：正式Bundle/HTTPS、Debug1.0(47)、原登录保留。证据`~/Library/Application Support/MiaoxunDevelopment/76237d6f8986/builds/2026-10-14T03-45-31-222Z/build.json`，构建前后source均`bb5f588c80e8abe40359fea1781fbf6064814b5a20e8d1e07cc51bab3084f5e6`，JS`12425c48be1dd11a0216206cf1469eea98e702ab72baead2999f8503e1cda8ff`。随后只补交接及相关状态文档，实施代码未变；不把后补文档冒称已在该source快照中。
- 最终安装实看默认妙、取消卡去重复、妙/讯上左下同间距菜单、关闭恢复导航、二楼隐私仅账号设置。850ms原地语音长按释放后无菜单残留，Simulator语音错误明确可取消；任务卡原地长按松手无残留。前一同产品阶段已实看二楼前五项完整及我页添加全部权限确认（取消零写）。观测摘要在`output/test-evidence/20261014-product-review/simulator-observations.json`；没有保存私人会话截图/正文。Debug仍可见未定位的LogBox开发警告，未屏蔽；连续滑选/二楼拖动、首次权限、真机语音、新Release及真实素材协作链未标通过。
- 最终检查再生的三个Web dist已按原核准精确路径删除；依赖、外部当前DerivedData、原数据、恢复制品和8768预览保留。移动端源码依赖图、生产模块入口和只读生产目录是本轮有限审查证据，不宣称全项目每个函数或所有服务器文件均已完成裁剪。

本反馈阶段下一步当时为：整仓与固定设备上述显示/原地长按验证已完成，整理新候选后按具体制品范围推进API/两个Worker/App配套与用户真机链；连续触摸与完整素材链仍待验收，47旧包不会随工作区自动更新。本轮没有推送、新TestFlight上传或生产切换。

本次恢复证据位于受限 `~/Library/Application Support/MiaoxunReleasePreparations/butler-live-release-20261013/`：final03旧服务恢复包 SHA256 `ce1f9e508d9172e6aa2ead2d2446cfb0313f6a0cca3bdc9e0a15db14f6b30cb0`，独立审查及18/18离线测试通过；恢复报告 SHA256 `2b4771c2c409c1dc6d51ec8639adc82cfca81a62378029cc35906123e332326a`。失败stage与backup归档SHA分别为 `804638582997b8d0116a082caac81a84be8024e7cc44889ef9d20294c5fa65f7` 和 `ac3fbb854a0bef0da3cea1a4e3e6a86b3ee0620f8985391e916611ede8ca461c`；归档apply报告 SHA256 `2b3a3b155bd0fea559d5880272b734aab385d08b2fc02df11e291dbbbfe0ef53`；原final03失败报告与激活锁保留。final04 prepare 报告在服务器 `butler-unified-20261013-47-cutover-final04/prepare-report.json`，SHA256 `2d38c275132b90f130a45f841308e79885794be15eeb468805400fc8bf304c87`，确认旧451/候选462文件、38/38迁移、队列0及四项保护摘要一致；没有模型调用、数据库写入、迁移或切换。

## Build47冻结、上传与初始ASC门禁（2026-10-13，历史状态）

本节保留首次上传时的 ASC 与生产证据；后续处理状态以[CURRENT](CURRENT.md)为准，不把本节历史门禁当作现状。

- 最终freeze05为1030源文件，manifest SHA256 `652ddd6f09228aa1a4efcf142678ed44bc6f5574a3ff95794531e6dce75c7dd8`。隔离发布树本地commit `653ad85a95e7cc9b3c0c4d05dc7e1f915300c687`、tree `0f5b29927a5f20f813a0ef898b81c406fae4900e`；工作树clean、未push，主树原修改及空索引保留。939产品文件与最终整仓及266个B02产品文件逐项一致，38SQL与正式一致；完整扫描无未审阅secret匹配。
- 最终runtime462文件（455源+7构建）已在隔离Linux全新npmci/官方audit0、backend91/91与registry12/12及原生媒体依赖检查通过。制品`butler-unified-20261013-47.tar.gz` SHA256 `095c7b5b063731ca9494244360677a69cb19796e11681a28edc4979a75c0fded`，manifest SHA256 `9a179a32715b1e777f7d877bb0a652025ff45de077f449bb1da9e41a7291592c`；内容检查前后一致，未部署。freeze04只属中间制品，不得部署。
- 47全新Release归档、导出exit0，source前后匹配freeze05；正式Bundle/HTTPS、App Store分发签名及主App dSYM匹配。Release JS SHA256 `070b34a7514ba465735145d824979a2878bea5e840fc1a134f7607ae35fd7814`；IPA SHA256 `0d02395d0142720e44695a92175916750e124bc164d4f761d4d7e8fc423e5c6f`。18:07:42 CST上传exit0/Upload succeeded，不重复上传。React/ReactNativeDependencies/Hermes三项第三方dSYM警告仍在。
- ASC登录刷新后实际47已处理并显示“缺少出口合规证明”。出口合规表单已打开供账户负责人处理，不代填或提交；47详情群组(0)/独立测试员(0)，尚未关联既有群组，尚不可安装。上传成功不证明可测试、新后端已切换或设备验收。最新正式只读证据仍为17:49–17:50 CST的c04385e/451文件/三服务/双心跳/038/合同1/2/2，模型DeepSeek。
- 19:03:31 CST服务器切换脚本final01只读prepare在环境校验处以`ENV_FILE_RUNTIME_MISMATCH`拒绝；未进入维护、停服、正式runtime/env切换或生产数据库写入。19:10 CST精确只读诊断确认三服务MainPID的全部文件声明值一致，业务Node除PATH外逐项一致；PATH完整等于npm9.2.0按实际backend目录添加的有序命令目录及原PATH，属于正常启动转换。仓库外脚本已改为文件全键匹配Main、业务Node只允许实证的完整npm PATH转换，其余值及进程身份仍严格匹配；66/66回归、7项语法与schema自检通过，独立审查`READY_FOR_READONLY_PREPARE`。原失败和诊断完整保留，不改正式配置或冻结产品源码。
- 19:23:44–19:23:45 CST在新的服务器final02目录执行只读prepare成功：旧451/新462/tar/38SQL与四脚本SHA匹配，三服务active、零重启及Main/Node身份稳定，038完整、全部非终态0、4条媒体unknown/400分及页面/授权摘要保留。19:24:31 CST公网health/ready200。没有转运Key、维护、停服、正式runtime/env切换、生产SQL或模型调用；真实排空、停写038恢复及切换仍须在47可安装后现场执行。受限证据为`cutover-47/prepare-passed-final02.json`、`public-readonly-final02.json`、`offline-review.json`与`independent-cutover-review.json`。后续activate前须刷新同脚本SHA、同env的新鲜prepare；本次通过不代替实际切换或设备验收。
- 历史首次门禁当时只收到处理意向；用户随后已明确“已经处理了”，47出口合规完成。此处不再待用户重复声明；后续ASC/安装状态仍须现场核验。
- 下一步：完成声明、关联测试群组并只读核实47可安装 → 切换前新鲜停写/平滑排空检查和038备份实际隔离恢复 → 同源API/两个Worker及浮生配置配套 → 固定iPhone17原位更新保留登录 → 用户真机验收。排空包括awaiting_user及pending；SQL无任务不代替API在途排空。Agent版本变化后新增任务不能交旧Agent继续，优先同版本前向修复，不以旧dump覆盖新增数据。
- 证据在受限butler-live-release-20261013目录：`release-readonly/source-freeze-05`、`release-readonly/final-release-05/RELEASE-READY.md`、`ios47-final-05/upload-status.json`与归档/签名/上传日志。本节及其他最新状态为制品冻结后只补主树的文档，不在653ad85a/freeze05中，不以旧manifest冒称包含这些补记。完整说明见[本轮47上传记录](../reviews/2026-10-13-butler-live-release.md)。

## 本轮真实模型验收与47准备（2026-10-13，冻结前历史记录）

- 用户已同意先沿用现有模型真实验收，再准备新的API/两个Worker/App配套；新TestFlight可安装后切后端，随后真机验收。当前工程默认47，ASC只读最高46正在测试、未见47；47尚未归档或上传，正式没有切换。
- 当前管家dispatch公开8案例首轮6/8：普通咨询与未接能力请求返回自然语言而非JSON，严格合同拒绝。修复dispatch/coordinate OpenAI请求显式json_object；复验8份真实回执最终8/8。原7/8报告中的唯一误报为grader把“可下载……不在已接入”当正向授权建议，独立人工核对后用修订2离线重评原回执，未额外调用；不弱化业务schema或真实权限。
- 两批16次DeepSeek调用，无unknown，实际servedModel为deepseek-flash；本会话累计43次、逐次峰值保守估计¥0.44，非账单实扣。官方中文Flash峰值输入¥2/输出¥8每百万tokens本轮GET确认，旧deepseek-v4-flash是退役别名。预算只在独立验收器，不写正式限制。
- 显式截断/过滤/未知结束原因、非法content和空后台测试已修：已知模型回执先记录，再明确502；截断回复不会执行工具。旧供应商缺finish reason保留既有合同，不作为真实完整性证明。相关80/80、整仓backend692 passed/98门控skip、Agents36、Admin14、RN62组634项通过；grader最终修订另25/25通过。PG沿用上一阶段55/55，新的真实素材隔离链正在准备，不把skip或分派规划当专业链通过。
- 用户提供https://api.cicadas.top；Key在仓库外受限文件，不写Git/文档/日志。GET /v1/models200共23个Claude模型，无6.1 sol。按用户指示只读CC Switch，当前Codex连接为gpt-5.5/Responses/high，凭据匹配；本机代理无该连接的模型调用记录。妙讯当前Chat Completions，不支持Responses，不能只填地址切换。公开模型广场要求登录，尚无该Key准确GPT价格/端点/协议样本；追加最小Responses实测：gpt-6.1-sol两地址、gpt-6.1及CC Switch的gpt-5.5均明确404 model_not_found（当前Key账号组不支持）；无生成/usage回执，不当作账单零费用。用户确认6.1 sol来自Codex桌面App；后续本机config也指cicadas/custom/Responses，撤回连接完全独立判断，未读改Codex认证；没有成功中转生成调用，生产env仍DeepSeek。视觉与1024维向量仍北京原生qwen3.6-flash/qwen3-vl-embedding，3D独立；生图执行器未实现，不以补Key冒充完成。
- 用户随后换浮生云算/v1；Key仓库外0600，旧cicadas凭据已移除/4份公共临时网页归档清理。模型列表明确gpt-6.1-sol/Chat Completions；最小调用200、同名回执、OK/stop、17+5=22tokens、3308ms。用户指定vip（公开倍率0.25）并取消本轮测试10元价格上限；保留使用/价格参考回执，未知不重放，正式不引入评测限制。用户澄清集中的是模型调用代码配置文件，不新增后台/App页面。结构分派/工具/专业链继续验证，生产模型未切。
- 公开真实素材B首轮12调用、估计13分、无unknown，完整typed狗素材→页面/双hash及未保存通过；人工发现相册账号计数误说选中范围、页面流程文字泄漏，未confirm。已精确cleanup/业务表空，修提示与内部工具后用新源码新run，不以技术断言冒充质量通过。
- 15:34CST生产只读451文件同源/三服务active/038/合同1/2/2/双心跳及无非终态任务通过，4条历史媒体unknown/400分保留、不重放；当天12:17本地/异地备份摘要及038TOC通过，没有重做恢复。相同SQL不等于可在线回退：管家/建站版本变更后须排空旧非终态；新工作空间回旧Agent版本会停止，优先同版本前向修复、保留新增数据。
- 47接旧服务可读取与聊天，但旧后端没有统一分派；butlerContextReset在旧schema被剥除，跨切换同key重试安全409。新后端对旧46首次管家消息426，已接受同key重放保留。因此47可安装后尽快切三个服务，配套后才验收新业务。
- 证据见[本轮真实验收与发布准备](../reviews/2026-10-13-butler-live-release.md)，受限目录`~/Library/Application Support/MiaoxunReleasePreparations/butler-live-release-20261013/`。原工作区/空索引保留，不推送；源码冻结、真实公开图片专业链、47制品与实际设备链继续完成。

## 浮生专业链完成与最终47候选（2026-10-13，冻结前历史记录）

- 用户指定浮生/v1、vip并取消本轮测试费用上限。集中模型代码backend/src/agent-model-config.js已完成，chat/planning均推荐gpt-6.1-sol，实际env须显式应用；正式仍DeepSeek。旧cicadas本轮受限凭据、公共临时材料与已归档远端评测runtime已精确清理，未改Codex/CC Switch连接。
- 浮生真实分派8/8通过，8份同名/stop/usage/request_id回执，unknown/残留预留0；参考估算16分，非账单。B02公开素材链13调用（7浮生文本、6原生Qwen）完成视觉/向量/PG检索、相册选材→建站→主管→完整预览→零模型确认保存；同decision重放revision不增。指定相册仅狗，另一相册相机排除；typed版本/同意epoch/真实检索run/依赖/双hash独立复核通过，完整JSON/HTML/图片人工审阅及两项内容质量门禁通过。参考15分、unknown/残留0；不证明生产OSS、真实HTTP、RN或用户真机确认。
- 最终整仓exit0：backend698 passed/98环境门控skip、Agents36、Admin14、avatar29、media-web3、RN62组634、packager1与各工程检查通过；939非Markdown产品文件前后不变，与真实分派/B02源逐项一致。源停写后仅补文档，非新增产品实现。候选相册0.3.1修全账号计数歧义，建站0.3.2修终稿流程文字；无新SQL，仍038。
- 用户追加“添加Agent直接弹授权”已核实候选现行入口满足：我→生态添加立即展示共享范围确认，首次相册云端同意合并；确认后单次原子添加/授权，取消不写入，不先添加再弹第二次。二楼管理只留后续查看/修改/撤回。五组75项授权/换号/生命周期回归通过，无需重复新增代码；实际46尚未包含本轮统一流程，47设备视觉另验。
- 三Web锁source-map-js1.2.2与Agents fast-uri3.1.8最小修复通过五工作区隔离Linux clean npmci/audit0；其他依赖不扩大调整。17:49–17:50CST正式只读仍c04385e/451文件/三服务active零重启/双心跳/038/合同1/2/2、非终态0、health/ready200；现有页面/授权/四历史媒体unknown保留。
- B02确认独立复核通过：完整profile与预览相等，revision18→19、重放不增；合成owner精确清理后users/workspaces/assets/runs/jobs均0。本次55582集群按system_identifier/PID/data目录核对后准确停止并删除，远端评测Key已移除，其他数据库不动。原始预览、回执、账本和清理报告保留。
- 下一步：冻结最终源/secret scan/同步发布worktree，仅该树本地提交不push；全新47归档/IPA验证并上传。实际47可安装后才切同源API/两个Worker及浮生配置，再原位更新固定iPhone17保留登录，真机验收。freeze04为中间准备制品，不能部署或复用为最终。用户既定配套授权继续有效；出口合规法律声明如出现由账户负责人处理，不代填。
- 证据仍位于butler-live-release-20261013；material-chain-run-02含全文预览、独立DB/质量/确认。正式未新部署、47未上传，原主树全部修改与空索引保留。

## 妙管家统一入口、授权与中转配置（2026-10-13，本地候选）

- 已核实没有逐相册持久授权；首次相册范围确认与云端AI同意合为一次确认，已有同意复用、撤回重验，手机权限独立。外部启用API必须显式范围，禁用写空范围。
- 草稿统一“交给妙管家”，保留用户主动发送；普通答复/待续澄清/交办由严格模型决策区分，交办真正创建既有持久协作，由原Worker执行并在妙展示真实参与者。消息可精确打开任务，旧未知提交只保留原key恢复。
- 原输入锁及既有回执检查先于任务创建，任务与回复同事务；重试、过期修复、撤回或写入失败无隐藏重复任务。待续澄清保存并重验原输入、引用版本和来源，部分丢引用及失败续答不扩大为全库；用户明确更改选择才重置。
- 补齐处理中续答A/B不同消息ID的范围保护，App恢复服务器已持久user快照，临时/显式重置消息不继承。管家客户端强制当前账号AI1/协作2，消息双头已接通；已发布46原仅AI1，新后端将对旧46管家新消息明确426，必须API/两个Worker/新客户端配套，已接受无引用同key保留重放。
- 新增可选NEW_API_PLANNING_MODEL，分派/协调与结构生成用规划模型，留空明确继承NEW_API_MODEL；共享NEW_API后端凭据、真实模型回执及三份样例已同步。用户选择中转地址/清单/Key稍后提供；视觉/1024维图文向量仍需协议核对，3D独立，实际env未改。
- 目前只有相册选材、建站页面为专业协作执行器；漫画分镜、文件预处理、视频镜头草稿有独立能力但未接工作空间，最终生图/成片未接入。不能把添加Agent或填模型名当成已交付。
- 最终整仓通过：backend663 passed/98环境门控skip、Agents36、Admin14、RN62组634项及各工程质量/构建检查；隔离PG18.4/038四套真实HTTP/事务/Worker测试55/55、0skip，供应商为替身。52272本次临时集群核对业务表空及fixture审计后精确停止/删除，证据保留，其他数据库未动。
- 官方最终安装`builds/2026-10-13T06-34-46-149Z/build.json`，source前后均`c62a4f8da7c6ce3aa256e769483531865d685888434add06ec52353c4c2a2026`，安装JS复核`1f30d2f4bf26027f4eaa429f7f9b14c62a4afbd6c52cc08cddd91e310da67855`。固定iPhone17原登录/默认妙、三方向菜单、单入口空值门禁、草稿及真实相册引用→管家审阅、二楼五完整卡通过；文字及引用已清空，回到妙页，没有发送、创建任务、授权或保存页面。连续CUA拖动仍未证实，真机语音/首次同意另验；Debug提示保留。构建后只补文档。
- 本轮证据见统一入口记录（详细原文已归档），受限目录`~/Library/Application Support/MiaoxunReleasePreparations/butler-unified-entry-20261013/`。14:22 CST公网health/ready200，仅为只读探针；正式c04385e/038/TestFlight46保持。新范围未部署、上传或推送，无付费调用与生产消息/任务/授权写入。新提示词模型质量、真实素材设备链及真机语音仍需验收。

## 最新反馈修复与清理（2026-10-13）

- 已修相册引用缺权时的通用失败：发送前说明所需读取范围，失败消息保留安全错误状态与原key/引用/来源；授权往返保存文字及回复目标，空妙管家快捷入口不覆盖旧草稿，账号/token/会话隔离。实际确认仍由用户操作，无自动扩权/发送。
- 普通Agent消息改从可执行注册定义选择自然语言chat，结构化生成继续使用plan；补漫画/建站等聊天提示词。已知历史Agent JSON仅做可读展示，正文、读屏、复制分享、更多菜单、回复和匹配会话预览一致；用户JSON/未知结构及存储原文不改。新正文不追加“发起位置/所在模块”工程块，原结构来源和鉴权引用保留；旧用户原文中的工程文字不批量删。
- 妙/讯共用 `VoiceShortcutDock`，保留三个方向按钮并缩短至64pt，140ms收起，关闭即禁交互/读屏；原地松手取消、结束位置与迟到音频回调有回归。默认妙，二楼自适应前五张完整工具卡、六项横向吸附与缩放，原保存/上传保护保留。
- 全仓通过：backend646 passed/81环境门控skip、Agents36、Admin14、RN60组568项及各工程格式/lint/类型/构建。另隔离PG18.4/038真实HTTP10/10，覆盖缺权无写入/调用、授权后同key重放、漫画/建站chat、撤权和资源变化。无真实供应商调用；测试库业务表为空、12条fixture审计记录核对后准确停止/删除55443临时集群，其他数据库保留。
- 最终官方安装 `builds/2026-10-13T04-59-49-987Z/build.json`；source前后均 `e291a646b8cf5aa051273f26a4fb2a74c98549f4c4da93200f2cadbbff5f9a6a`，JS `ac0fd42cf693664cc4a9f275a340285644af4bfb85a1bbaed4f486876f148ad2`，正式Bundle/HTTPS/1.0(46)。保留登录、默认妙、妙/讯1000ms原地长按松手无残留、旧漫画视觉/读屏、五完整卡及权限入口通过；草稿和引用已清空，回到妙页，没有业务发送/模型调用。后续仅补文档。
- 当前设备管家已有资料/对话/调用Agent/小站/相册五范围，本轮只读查看，没有缺权提示；不能沿用早前“三范围”的判断，也不自动将这个账号结果推广到其他用户。新提示词实际模型质量、连续方向滑选/二楼上下横向拖动、真机语音和完整素材链仍未验收。Debug LogBox统一警告已定位为开发框架通知，但原始warn未恢复，不关闭全局警告或据此宣称无问题。
- 生产12:21–12:33只读审查：451文件同源、三服务active/零重启、双心跳推进、038及合同1/2/2、health/ready200，无积压/未知/提交错配；12:17本地/异地自动备份摘要及038 TOC通过，没有重做该dump恢复。旧4xx日志不带错误码，403/426聚合不能证明具体原因；未发现Build46请求头遗漏。
- 合并重复语音组件/测试；移除可重建旧Intermediates/模块/SDK/编译缓存 **约1.56GiB、7,845文件**。遗留同名 `albumqa` 45/4395入口先完整受限归档并实际恢复/逐文件/签名验证，再仅卸载QA Bundle；正式App/数据在清理时未变，无Keychain读取。归档/IPA/dSYM、Pods、源码/SQL、媒体/数据库、证据与日常构建缓存保留。632项静态代码审查未确认其他可删业务文件；旧数据库/其他项目服务不凭文件多而清理。
- 完整记录见46反馈修复与冗余审查（详细原文已归档），受限证据在 `~/Library/Application Support/MiaoxunReleasePreparations/testflight46-feedback-20261013/`。新生产部署、TestFlight及Git推送仍按新的明确配套范围执行。

## 最新配套升级与TestFlight46（2026-10-13）

- 正式维护窗口11:10:04–11:10:44 CST。停写037备份实际恢复55表1125行；临时库038升级、重复执行、退回037及元数据核对通过。正式038执行1项/37 unchanged，重复0；54旧业务表、3序列、账户和授权指纹保留。在线038备份另实际恢复56表1127行，临时库均清理。
- API/媒体Worker/AI Worker同一runtime，451文件一致、三服务active且0重启；合同aiTasks:1/siteDocuments:2/agentWorkspaces:2，双Worker推进，非终态任务、未知调用和提交错配0。6草稿/3当前页面/15未接通动作保留，公网health/ready200，匿名受保护接口401。旧runtime验证归档后移出releases。
- 官方命令原位安装固定iPhone17，1.0(46)、正式Bundle/HTTPS、已有登录保留；安装JS `ff69255f0a587f693bd0b1a232f414d2e9f72194e63c410aaad418d0e1e42f80`。已实看妙/讯/二楼权限、授权差异及相册草稿→关闭→语音入口→键盘续接保留来源/对象/引用；本次草稿清空，无业务提交或扩权。连续拖动、真实语音及完整素材链仍未据此标通过。
- Release arm64归档/严格分发签名/409项源码一致性通过，App主dSYM匹配；Release JS `047dbf077f4899d66a7e3376d86647043a49910ee73cfbb6d8f8c8280a978ef3`。11:17:28 CST上传成功；ASC已显示1.0(46)“正在测试”，详情确认既有内部、外部两群组。React/ReactNativeDependencies/Hermes三项第三方dSYM上传警告仍在，不阻断安装但影响对应崩溃符号化。
- TestFlight beta判定 **READY WITH CONDITIONS**：允许用户安装真机验收；不等于完整素材链、真机语音、Android或App Store正式发布已验收。没有新模型调用、Git推送、新账号或授权变化。
- 发布及验收步骤见[TestFlight46与038配套记录](../reviews/2026-10-13-testflight-46.md)。聚合证据在 `~/Library/Application Support/MiaoxunReleasePreparations/paired-testflight46-20261013/`。入口已开放，保留038新增任务/提交回执并优先前向修复；不可用037旧dump覆盖新数据，受控恢复需先解出匹配旧runtime。

## 配套前设备接续与预览修复（2026-10-13历史证据）

- 正式设备长按1000ms成功触发语音入口，明确提示Simulator限制；键盘草稿编辑、关闭续接与空值禁提交通过。本次输入已清空，回到妙首页。连续下拉/底柄上滑的CUA拖动未形成可确认触摸效果，不标通过、不认定产品故障。
- 当前设备建站Agent已有四项授权（含album:read），不能沿用历史缺权结论。管家仅显示资料/对话/调用Agent范围，素材引用入口及云端AI同意仍须重新核对；没有扩权或业务提交。
- 图片必须实际加载后才能审阅；失败/重试/不可用撤销，旧回调隔离。限定3个预览组件及测试，前三项修复保留。全仓通过：backend644 passed/79环境skip、RN59组536项；独立5组59项复核通过。后端/SQL未改，沿用前轮038 PG证据。
- 新候选构建及严格签名通过，JS `ff69255f0a587f693bd0b1a232f414d2e9f72194e63c410aaad418d0e1e42f80`；构建前后与构建后source摘要一致，正式App未安装或改变。设备尚未验收此新预览修复。
- 同一干净审查工作树冻结为c04385e；451项runtime内容与58a3b85完全相同，仅来源manifest更新，iOS归档181项及严格签名通过。制品与源码/产品摘要已归档，原工作区与空暂存区保留，没有推送。
- 10:34–10:35 CST生产只读445文件/037/三服务/双心跳/队列及备份摘要通过；未重新执行恢复。本轮无付费调用、生产写入、部署、Git推送或TestFlight上传。完整记录见设备接续与图片预览（详细原文已归档），聚合证据在 `~/Library/Application Support/MiaoxunReleasePreparations/agent-device-acceptance-20261013/`。

## 前轮已完成候选58a3b85（2026-10-13）

- 已完成协作卡统一长按上下文、当前待办/历史分离、结构化缺权请求及我/二楼共享授权确认；新任务草稿保留目标、全部补充及原引用，不自动扩权。候选协作合同2，正式仍为037/合同1。
- 038持久提交结果用于严格区分已接受、已拒绝和结果未知，038下57项协作PG、5项运维检查和实际API/Worker启停通过；最终全仓backend644 passed/79环境skip、RN59组524项及其他工程检查通过。实现和证据见本轮候选（详细原文已归档）。
- 真实规划8/8通过，本会话累计27次调用、保守估计¥0.28，非账单实扣；没有把测试预算放进产品配置。模型评测临时目录已清理，无生产业务写入/授权变化。
- 固定iPhone17仅候选构建与严格签名通过，JS `a384c015046213880963ff7b58b362001df21e920b746b86e61bccfcc32bef47`，构建前后源码摘要相同。已有App/data及JS摘要不变；正式构建入口支持 `ios --build-only`，不再复制临时构建脚本。草稿关闭后的语音续接丢引用已补修及7项组合回归。临时PG、验证API/Worker及评测临时目录已清理。
- 同一审查工作树已冻结候选 `58a3b85`，制品 `agent-interaction-20261013-01` 的451文件摘要及iOS归档181项全部核对。证据集中于 `~/Library/Application Support/MiaoxunReleasePreparations/agent-interaction-followup-20261013/`；正式生产仍f10495d，原工作区与空暂存区保留，未推送。
- 10:03 CST生产只读复核继续通过：445文件、37迁移、同源3服务零重启、双Worker推进、队列无积压。候选尚未部署/安装；TestFlight仍45，固定iPhone17保留旧配套46。

## 实施前接续审查（2026-10-13）

- 09:18 CST 生产只读复核通过：445文件/来源f10495d、三服务零重启、037及三个AI合同一致，双Worker持续推进，任务/协作无积压及未知调用。今天两次自动本地/异地备份成功，最新本地dump校验和及两张协作表TOC通过；未重新做恢复演练。
- 新发现协作任务卡未接入旧单任务的统一长按/上下文；缺授权仍显示通用补充输入，且“我”和二楼授权确认方式不同。连同重复澄清、取消旧summary，下一轮先收敛这些交互，再做真实素材协作链及物理手势/语音验收。
- 当前Agent记录为20条，上轮19条的权限快照已不代表当前状态。联调前重新读取授权，不自动扩权；已有任务也不能自动继承后来授予的范围。
- 本轮只读审查及文档更新，无业务代码修改、生产写入、模型调用、部署、推送或上传。具体遗漏、代码依据及优先级见协作接续审查（详细原文已归档）。

## Build48部署前统一基线快照（2026-10-14历史记录）

本节记录本次配套切换前的基线，不代表当前运行版本；当前状态以[CURRENT](CURRENT.md)为准。

- 正式服务器仅运行 `agent-preview-20261013-02`，来源 `c04385eb2583cd710735648b0380a9a67cb28ba1`；API、媒体Worker、AI Worker共用同一runtime。38项迁移，合同aiTasks:1/siteDocuments:2/agentWorkspaces:2；三个服务active、NRestarts=0、health/ready200，双Worker实际轮询/心跳通过。见[最新配套发布](../reviews/2026-10-13-testflight-46.md)。
- 已安装日常客户端固定使用现有 iPhone 17 Simulator（`7E81531F-02AE-40FC-98DA-A575CEC9930F`）上的“妙讯”，`com.wangruoshi.miaoxun` / `1.0(47)` Debug / `https://8.153.167.11`。2026-10-14最终构建已原位安装并沿用生产登录；Simulator迁移了数据容器路径，不能用容器UUID不变作为保留数据的依据，没有读取或搬运Keychain。
- iOS Debug/Release与Android工程默认版本为47、正式origin；固定Simulator当前JS SHA256为`12425c48be1dd11a0216206cf1469eea98e702ab72baead2999f8503e1cda8ff`，对应`2026-10-14T03-45-31-222Z/build.json`，与已上传TestFlight47不是同一制品。具体设备实看与未验范围见本页2026-10-14修正节。日常使用`node scripts/miaoxun-development.mjs ios`；不启动日常本地API/PG、不安装第二个App。
- 原工作区仍为 `codex/testflight-44` / `a4d90c3`加已有修改，暂存区保持空；生产源码为c04385e。隔离发布工作树现为 `codex/butler-unified-release-20261013-47` / `653ad85a`，clean、未推送、未部署；1030源与freeze05一致。原工作区继续保留实现与冻结后交接，不强制重置或清除已有修改。
- TestFlight最新上传为1.0(47)，来源653ad85a/freeze05旧冻结制品；用户已完成出口合规并反馈47使用问题。本轮未重新核验ASC群组或可安装状态，不沿用首次上传时的门禁结论。2026-10-14修正须重新冻结新App/API/两个Worker并完成配套后再做真机验收；Simulator Debug通过不能代替真机Release验证。

## 已完成产品范围

- 底栏“妙 / 讯 / 我”：用户最新明确妙应按任务组织参与 Agent。本地客户端已移除妙目录，改为真实任务卡与事件详情；Agent添加管理留我，讯和小站本轮保留。长按菱形语音入口配合三个方向快捷项、顶部转写条和隐藏底栏，文字先入草稿。二楼六个紧凑工具面板保持空白落地层、横向工具栏和底柄，保存/上传保护保留。见本轮布局纠偏（详细原文已归档）。
- 相册对话与建站共用目标、引用、持久任务、确认和成果。服务端声明 AI 合同1，客户端按当前会话接受；后端仍独立检查权限/同意/版本。建站需预览确认，结果未知不重放；旧接口不作兼容兜底。
- 妙与二楼的按钮、面板、状态、字号间距及任务文案已收敛到共享组件；任务卡和相册卡复用既有长按引擎，支持查看、理解与规划。本轮本地草稿只显示所选内容与必要任务快照，工程位置由结构字段随发送/重试保留；带入管家不自动发送。基础实现见上下文与组件统一（详细原文已归档），最新反馈增量见上节。
- 当前配套已把建站页面作为结构文档保存：复用JSONB，页面/模块有服务端稳定ID，严格schemaVersion=2、不可变revision=1、私有范围、有限主题、资源查看动作及未接通的交互意图。完整草稿及当前保存页面共用RN渲染器，专用API精确读取全部绑定，双hash匹配才允许确认。后端事务重验并保存，公开站点不返回生成正文；我页整体布局保留。旧version=1仅经独立受控迁移转换，新预览/确认仍不接收旧格式。新增交互意图保留链接/消息/关注原始目标，展示尚未接通；siteDocuments:2及建站Agent0.3.1已配套部署，详见[结构页面闭环](../reviews/2026-10-12-structured-pages.md)。
- 当前配套已实现动态主管协作：独立专业Agent能力、工作空间/节点、无环依赖、真实素材交接、问询、逐模型调用登记与回执、执行时限及取消。不设固定累计步骤/调用/规划次数上限。所有节点共用原AI Worker、API和PG，新增037；原ai_tasks单Agent流程保留。通用递归委派、完整财务预算、外部发送和可管理长期记忆未实现，普通非相册Agent对话仍同步执行。详见[协作闭环](../reviews/2026-10-12-agent-collaboration.md)。
- 历史11个测试账号及其关联数据清理已完成，生产保留6个既有账号；本轮不新建生产测试身份、不上传私人素材。早期¥10模型验收范围是历史，用户后来已取消本轮价格上限；临时库的隔离夹具验证后清除。

## 前轮正式配套验证（2026-10-12历史证据）

- 用户明确确认本轮正式升级范围。HTTP/HTTPS停写503后建立新的036恢复点，实际恢复53表1119行及owner/ACL/locale/序列；037与6页面/3副本/15动作迁移保留原内容，重复apply无写入；账户和授权全行指纹相同。
- 三服务同源、37合同、全部页面/资源DTO、备份角色和双Worker心跳通过后恢复入口。升级后另做在线同快照备份及实际恢复，55表1121行/schema/ACL/序列通过，临时恢复库清理；私密dump/plan留服务器。
- 固定iPhone17正式App中验证需求草稿、来源、真实提交、缺建站授权诊断和取消。仅公开项目说明产生1次模型调用，1187输入/476输出tokens；连同前期18次累计19次，估计上界¥0.20，非账单实扣。未扩权/上传私人素材/修改主页。
- 本次一个验收工作空间及节点取消后精确清理，受限恢复及用量记录保留；最终协作/AI队列与waiting_input均为0。二楼相册的统一上下文草稿来源/模块/对象正确，未发送；通过无障碍入口/返回操作验收，物理下拉/上滑手势未证实。
- 服务器releases仅当前版本；旧制品完整归档并解压核对后移除，临时候选目录清理。保留036/037备份及成功/失败证据。日常只用同一App和同一API/PG/两个Worker，不上传TestFlight46、不推送Git。
- 后续先补实际授权后的素材→建站多专业链；协作详情澄清重复展示、取消后历史summary的语义需收敛，物理手势与用户暂缓的真机/Android/大库/视频仍未完整验收。Debug的Metro探测警告已定位，业务API正常，不能因此宣称Release已验收。完整证据见[正式配套升级](../reviews/2026-10-12-production-agent-workspaces.md)。

## 配套升级前验证（历史证据）

- 用户已明确选择“保留页面和动作，完善统一结构后迁移”。统一v2增补严格的未接通交互意图，保留原名称、目标文本、重复项和顺序，不推断目标、不自动执行。迁移工具逐字段验证后同步草稿和当前profile副本，事务复核/回滚和精确恢复，旧接口仍拒绝。详见[页面迁移](../reviews/2026-10-12-site-document-migration.md)。
- 最新生产只读预检确认6份草稿、3份当前副本、15个旧动作全部可保留转换；没有保存生产原文计划或执行数据变更。临时PG37迁移后10/10测试通过，CLI文件保护另1项通过；完成后users/drafts为0，临时库停止并删除。
- 移除正式协作/相册的固定累计调用/步骤/规划次数上限，保留超时、取消、权限、幂等及真实回执。真实规划15次调用最终5目标全部通过，保守估计¥0.16；专业协作纯文字页面另3次模型调用走完规划→建站→检查→完整预览→确认保存，原回执比较的JSONB键序误判经原始数据离线复评通过，3条回执及摘要一致；本会话累计18次、估计上界¥0.19，不是账单实扣。详见[模型验收](../reviews/2026-10-12-agent-live-verification.md)。
- 全仓检查通过：backend626 passed/65环境门控skip、RN58组474项、Agents36、Admin14及各工程格式/lint/类型/构建；日志`/tmp/miaoxun-agent-collaboration-release-final-20261012.log`。与本次变更相关PG已另启用，未把skip算作通过。父目录同步补充后的对应CLI复验通过。
- 固定iPhone17最新候选编译/严格签名通过，正式Bundle/origin与1.0(46)；JS SHA256 `6e74fd3fceff7f6e75d811545be63431e0751870bfe1d6181b64c46ba894d74a`，构建期间source摘要`de34a4d7b6f77abbc11b3402c4b1bddce67e3fc8830e65b650c6cab908af9eb0`一致。记录`~/Library/Application Support/MiaoxunDevelopment/76237d6f8986/builds/2026-10-12T10-20-39-620Z-candidate-only/build.json`；未安装，日常App摘要前后不变。
- 协作运维汇总补齐可执行节点/依赖等待/不活跃父任务/未知回执，在临时PG以只读身份4/4通过并清理；正式候选已冻结为f10495d/445文件，生产只读快照在临时库完整恢复、037及6页面/3副本/15动作迁移与全库回退演练通过；53表1118行及权限一致，临时库/私密dump已清理。生产仍为036和现有服务，正式切换范围见[候选与升级边界](../reviews/2026-10-12-agent-workspace-release-readiness.md)；不把临时service/PG模型链路等同于正式HTTP、设备视觉或全素材协作验收。

## 前轮候选验证（动态协作）

- PostgreSQL18.4临时loopback数据库从036升级037；仓库24项、专业能力5项、service/真实HTTP12项共41项通过。完整同源页面预览与确认、幂等恢复、source变化、当前撤权、检索同意写锁、无素材拒绝、取消/租约/未知响应均有验证。fixture仅在模型/检索供应商测试边界，没有产品测试账号或数据写入。日志 `/tmp/miaoxun-workspace-repository-capabilities-pg-final.log`、`/tmp/miaoxun-workspace-service-integration.log`。
- 规划输出合同32项通过；它只验证结构、授权、依赖与限额，不证明真实模型规划质量。数据与grader见 `agents/evals/workspace/` 和 `backend/test/agent-workspace-plan-eval.test.js`。
- 实际API与同进程双队列AI Worker在临时PG中启动，health/ready200，任务/协作轮询推进，SIGTERM均以0退出；运维摘要新表检查通过，重复迁移0 applied/37 unchanged。测试users/workspaces/agent_runs均为0。证据 `/tmp/miaoxun-workspace-runtime-smoke.json` 及对应API/Worker日志。
- 最终 `./scripts/check-repository.sh`通过：backend594 passed/61环境门控skip、RN58组459项、Agents36及全部工程lint/类型/打包检查通过。日志 `/tmp/miaoxun-agent-workspaces-repository-check.log`。新增PG已单独启用验证；既有单Agent任务仓库12项与建站套件22项另在空库复验通过，不以skip当通过。日志 `/tmp/miaoxun-workspace-existing-tasks-pg.log`、`/tmp/miaoxun-workspace-existing-site-pg.log`。
- 固定iPhone17候选编译及严格签名校验通过：正式Bundle/origin、1.0(46)，构建前后source SHA256 `a5259425bb49f1b4aa1804837ef3fd0952b4115f2effe99ba6ea9f109bf60669`一致，仅后续更新文档。记录 `~/Library/Application Support/MiaoxunDevelopment/76237d6f8986/builds/2026-10-12T08-30-49-317Z-candidate-only/build.json`，JS SHA256 `4e9439bcf40833bce0140569ada8e98a9ebdfc5b548b2c5eb0b253a61f162587`。没有安装；已安装App的JS/Info.plist摘要前后不变，日常仍是上轮已配套客户端。
- 生产只读ready于2026-10-12 08:27 UTC复核200，不表示新合同已部署。未做真实模型调用、有内容设备视觉验收、生产写入、Git推送或TestFlight上传。临时API/Worker已停止，测试PG数据与账号已清理；日志保留。

## 前轮候选验证（结构化页面）

- `./scripts/check-repository.sh`通过：RN53组420项，backend526 passed/20环境门控skip，Agents33、Admin14及其他工程检查通过。日志 `/tmp/miaoxun-site-documents-20261012-check.log`。
- PostgreSQL18.4一次性loopback空库应用全部36项迁移，22项建站集成测试通过，包含稳定ID、完整引用读取、owner隔离、引用变化、旧格式拒绝、重复确认及事务回滚。日志 `/tmp/miaoxun-site-documents-20261012-pg.log`。没有生产测试身份或数据写入。
- 预览/API专项42项，渲染器14项及既有媒体预览2项通过；加载前不能确认，重载撤销旧审阅状态，账号/文档切换隔离迟到响应。全仓结果已包含这些测试。独立复核未发现确认绕过或跨账号路径。
- 固定iPhone17候选xcodebuild与严格签名校验通过，仅构建未安装；仍为1.0(46)、正式Bundle与origin。记录 `~/Library/Application Support/MiaoxunDevelopment/76237d6f8986/builds/2026-10-12T07-03-21-462Z-candidate-only/build.json`，JS SHA256 `969c6bc96dc5533d49e8d08ad18a2bf92a6acd3487ee229ad2776c8909bf59fe`，构建前后源码摘要 `691bb9591680dce933d9a19fb9d86d85295c33d88892a1a56ee96997e56c29a0` 一致。已安装App的JS/Info.plist摘要均未改变，继续使用上轮版本。构建后只补文档。
- 首次原生打包暴露共享代码的Babel运行库解析缺口，已统一Metro依赖查找路径；修正后配置格式/lint及原生构建通过。生产 `/api/ready` 只读复核200（2026-10-12 07:04 UTC），不表示支持新合同。未做真实生成、付费调用或新页面设备视觉验收，没有将测试夹具写入产品供演示。临时PG数据已停止并清理，诊断日志保留。

## 上轮已安装客户端验证（上下文与组件统一）

- `./scripts/check-repository.sh`通过，日志 `/tmp/miaoxun-context-unification-20261012-check.log`，RN50组360项、backend507 passed/20环境门控skip、Agents33、Admin14及其他检查通过。最终引用标题长度修复后RN格式/lint/类型及完整50组361项通过，日志 `/tmp/miaoxun-context-unification-20261012-rn-final.log`。本轮无后端/迁移变更，未重复PG或付费验收。
- 固定iPhone17正式App原位构建安装成功，记录 `~/Library/Application Support/MiaoxunDevelopment/76237d6f8986/builds/2026-10-12T06-16-12-688Z/build.json`，JS SHA256 `af7f4060e6a0c1e5ef507a9d066dcd805fb09f4d9ec46fdd1b1470aebe1528d7`；仍为本地46、正式HTTPS与原登录。构建后仅更新文档，没有再次部署或上传。
- 最终版本实测真实相册卡长按、规划草稿来源/对象/引用、软件键盘布局、移除对象与关闭返回；同轮前一构建实测带入管家保留来源及引用，未发送消息。文件列表与妙任务空态检查通过。截图在 `/tmp/miaoxun-context-unification-20261012/device/`，验证草稿已清空，App回到妙首页。
- 组件集成测试覆盖长按至实际发送回调、发送前零调用、下一条清理、失败重试、账号/token隔离、工具切换过期菜单和2000字符请求上限；引用标题单独遵守服务端160字符限制，完整目标不被静默截断。
- 当前账号无任务，未造数据验收任务有内容状态；真实模型/真机语音/Android及连续拖动仍未验收。既有Debug通用warning来源未定位，未屏蔽。详细范围见本轮验证记录（详细原文已归档）。

## 前轮客户端验证（妙与二楼纠偏）

- `./scripts/check-repository.sh`通过，日志 `/tmp/miaoxun-miao-redesign-20261012-check.log`；当时RN45组316项，backend507 passed/20门控skip、Agents33、Admin14及其他工程检查通过。设备反馈修复后完整重跑RN格式/lint/类型及测试，最终45组325项通过，日志 `/tmp/miaoxun-miao-redesign-20261012-rn-final.log`。没有后端或迁移变更。
- 最终官方Simulator App原位更新，构建记录 `~/Library/Application Support/MiaoxunDevelopment/76237d6f8986/builds/2026-10-12T05-07-22-004Z/build.json`，JS SHA256 `7231daf989ad29c32ef1181dba33de843bc2023da537ae70f7fd764b5ac34440`。原登录保留，本地版本仍46。另完成无签名iOS真机目标编译，日志 `/tmp/miaoxun-miao-redesign-20261012-device-compile.log`；未安装真机或上传。
- 固定iPhone17实看妙任务空态、径向语音入口、软件键盘/草稿保留及二楼六面板。修复弹窗安全区、轮询导致刷新跳动、相册封面加载反馈与文件键盘偏移；键盘弹出时工具栏/底柄完整，滚动可达保存按钮，封面真实加载正常。语音权限准备独立于录音，授权后需重新长按。
- 本轮未新增任务、发送消息、注册、授权或上传。当前账号任务为空，未验收有内容任务的设备效果；二楼通过无障碍入口及返回动作检查，不代表连续触摸手势已验收。真机语音、首次系统权限和Android仍待验证。
- `/api/ready`只读复核200；服务器仍为既有版本。Debug的React Native通用warning提示仍未定位来源，没有代码屏蔽。具体证据与边界见本轮布局纠偏（详细原文已归档）。

## 前轮部署与恢复证据（本轮未重做）

- 最终 runtime 415 个文件逐一核验，SHA256 `0fd5c946a92d35b62afa2f63bb9fae41dfaa2b9441e8c622dc8432dbfc56105e`；Linux lockfile安装、sharp、ffmpeg/ffprobe及源码语法检查通过，官方npm审计0漏洞。
- Nginx HTTP/HTTPS维护503生效后停API/Worker并确认无数据库连接，生成新停写dump。实际恢复到临时数据库，51张表摘要完全一致，原应用角色可读且旧35迁移账本通过；临时库已删除。036耗时25ms，1 applied/35 unchanged，重复0 applied；50张旧非账本表摘要一致，新任务/事件为空。
- 受限恢复资料：`/opt/projects/marvels-chat/backups/ai-tasks-20261012-01/`。旧03不能连接36直接回滚；已开放新写入后保留36和任务数据，优先同合同前向修复，不能覆盖为旧dump。
- 加固脚本保护项目及releases父目录，服务用户不能替换app入口或代码，仍可读受限env、写storage；Linux隔离权限测试和生产有效权限复核通过。新任务表备份读取权限有效，已有备份timer正常。
- 升级时全仓检查：RN40组267项、backend507 passed/20环境门控skip、Agents33、Admin14及Web/类型/lint/构建通过；日志 `/tmp/miaoxun-production-unified-20261012-check.log`。相关PG集成45项、迁移/锁冲突/恢复和只读运维测试当时通过。
- 升级时原生46构建、冻结归档及严格签名通过，JS SHA256 `0ae828cb29244b27264cabfbbe2cd6e7e0d00f317a43edb5329245b5265674e6`。该旧归档保留在 `~/Library/Application Support/MiaoxunReleasePreparations/ai-tasks-20261012-01/`，不包含本轮任务页重排；当前Simulator证据以上节为准。模拟器不代替真机/Android/真实模型验收。

## 清理与日常规则

- 服务器releases仅保留当前版本。旧02/03完整压缩归档，4612文件内容验证；备份、密钥和真实素材保留，旧归档只用于匹配35的受控恢复。
- 重复的“妙讯开发”App及数据已逐文件验证归档后卸载，固定iPhone17仅保留官方妙讯46；旧开发46制品及安装暂存另清理约208MiB，官方46归档保留。
- 本机4390的自动启动服务已卸载并归档plist；4391/API/AI Worker/PG55441正常停止，原有本地数据库及固定账号保留。空的旧QA PostgreSQL容器及匿名卷删除；其他有业务数据或归属未证实的数据库保留。
- 已核对的旧DerivedData与旧缓存清理约21.4GiB；有效TestFlight归档、IPA、dSYM、SDK和当前依赖保留。不要以“统一”删除恢复证据或包含独有工作的分支。
- 操作与源码入口见[日常联调](../local-development-preview.md)、[正式升级记录](../reviews/2026-10-12-production-ai-upgrade.md)、[部署说明](../deployment.md)。

## Build48配套部署前的下一步与边界（历史快照）

以下计划形成于正式切换和真机同步复验之前，不再作为当前状态或操作指令；当前待验收范围见[CURRENT](CURRENT.md)。

用户已授权并完成此前TestFlight46配套发布；前轮真实模型验收与47上传已完成，用户已完成47出口合规。正式仍为agent-preview-20261013-02/038/协作合同2/DeepSeek；47为旧冻结制品，不包含2026-10-14反馈修正。固定iPhone17本轮安装的是当前工作区1.0(47) Debug，不能当作TestFlight新包或后台已配套。后续发布必须重新冻结并核对新App/API/两个Worker、权限声明、模型配置和任务状态，再验收真实设备素材链；此前47切换范围不证明本轮新候选已发布。妙负责目标、参与Agent、进展与成果，Agent添加授权留在我。

协作卡统一长按/上下文、当前状态、授权操作和持久提交结果均已发布，继续真实素材检索→选材交接→建站完整专业链。本轮设备只读确认管家已有小站/相册读取；建站此前也已有album:read，执行前仍须重新核对所有实际参与者范围与云端同意，不能沿用历史缺权或授权快照。需要新增权限时由用户明确授予后新建任务，不自动扩权。公开纯文字专业链已有隔离PG证据；当前Simulator通过草稿/引用及展示，尚未执行完整真实素材预览/保存。

当前正式版本已收敛协作重复问询与取消状态；物理下拉/上滑、真机语音与首次权限仍须实际触摸验证。通用模块/整页选择、结构差异确认随后扩展，不把当前四类资源、最多6项引用包装成读取任意页面。通用递归委派、可管理长期记忆、定时任务和外部发送仍待实现。

真机/Android、代表性大库/视频质量、供应商实扣账单、第三方崩溃符号及OSS/异地完整灾难恢复仍未验收。此前DeepSeek43次估计¥0.44是历史参考，用户后来已取消本轮测试10元价格上限并指定浮生vip；浮生分派与B02分别参考16分/15分，不是账单，正式不引入评测次数/费用限制。47上传和后续同源配套切换已有本轮授权，Git推送未授权；历史记录不授权其他新增操作。

历史过程保存在[升级前完整交接](2026-10-12-before-production-ai-tasks.md)及各日期审查中，不作为当前版本入口或操作指令。

## 2026-10-15—19 实施与整理补记

本节于2026-10-21从CURRENT迁入；“本轮”“尚未部署”与后续安排均限定当时阶段，不代表后来的客户端或当前工作区。各项删除、缓存量及测试计数也仅按原范围解释，实际下一步见[CURRENT](CURRENT.md)。

### 2026-10-15 线上只读核验快照

| 对象 | 当时证据 |
| --- | --- |
| 正式后端 | 10:17–10:19 CST只读核验：`dynamic-agents-20261014-48`，来源`232a1428eab9c4616a42d2eb5b2f5bfee523a41c`；227个manifest文件全部匹配，releases仅此版本 |
| 数据库与进程 | 039、合同`aiTasks:1/siteDocuments:2/agentWorkspaces:3`；API和两个Worker同runtime、active/running、零重启；本机HTTP、公网HTTP/HTTPS readiness200；AI数据库心跳正常，媒体仅1个活跃Worker |
| 队列与备份 | 只读汇总无在途、积压、过期租约或未知回执；备份timer活跃，最近任务06:16 CST成功。当轮未重新做备份恢复或完整用户链测试 |
| 模型配置 | 已部署记录为浮生/vip `gpt-6.1-sol`，视觉/向量Qwen，3D独立；2026-10-21的本地合成评估未修改此线上配置，密钥仅在仓库外受限配置 |

2026-10-21仅补做未认证HTTPS health/readiness检查，不能据此确认上述runtime、账本、进程或备份状态仍未变化。

### 2026-10-15 产品实施与隔离验证（当时尚未部署）

- **删除关键词动作。** `appActions.ts`、`useButlerActions.ts`及其透传已删除；所有消息走`session.sendMessage`。移除`localActionResult`请求和后端合同，旧字段明确拒绝；“英文/深色/设置/建站”等原文不再触发偏好修改或预先报告本地执行成功。有意义的回归并入消息重试测试。
- **删除固定视频生成。** 移除`buildVideoDraft`服务、POST创建接口、移动端创建面板及会话回调、无引用样式。旧视频记录保留只读；新`video.script`使用真实模型文字执行器。就绪状态按文字模型判断，明确未接入成片及渲染。
- **统一相册动作。** 我页和二楼使用同一`AlbumContextActions`，包含查看、妙管家、编辑和更多；已接上真实相册编辑。移除固定“理解/规划”双入口和预填需求，选择内容后由用户填写目标。共享现有色值，保留语音与内容手势各自必要生命周期。
- **接通成果打开。** 成果页读取真实页面、分镜、视频旧记录、穿搭及最近30个协作工作区的成功成果，页面去重并按更新时间排序。只有当前approval指定页面显示待确认并进入所属任务，其他页面打开现有全量预览，文字成果打开鉴权工作区；分页外页面不猜当前保存状态。穿搭显示真实保存的形象与鉴权关联图片/视频；保存返回和重进成果页会刷新实际内容，失败可重试；换号/离页/后台及并发读取均隔离迟到结果。删除旧成果计数、奖章、虚构精选式呈现和无引用样式。
- **收紧模型协议。** 非流式响应缺结束原因不再算成功；空Anthropic输入不补“请继续”。普通聊天不再回落结构化`plan`，未声明`chat`在写消息与调用模型前明确拒绝；虚拟人物声明真实`chat`。这一早期阶段相册保留旧持久任务；10月20日后续阶段已将新相册交办接入direct，旧已接受任务仍保留原执行与回放路径。
- **去掉漫画输出修补。** 保存分镜只接受完整合法JSON，显式非法参数、缺字段、缺标题、混合文字/围栏、超长内容和越界素材都明确失败，不抽JSON、补标题或截断后保存。普通聊天和协作文字不套此结构。
- **删除相册固定规则与后台重复映射。** 移除按文件名和关键词猜标签、伪置信度、自动分组建议及三条旧接口；仅保留真实元信息文字搜索、用户显式标签和独立视觉索引。后台不再维护手写Agent→模块/接口对照表，直接展示注册器声明的执行方式与协作能力。公开文件信息只提供类型和真实字符/行数，不再公开旧规则摘要和标签。
- **删除规则式文件理解。** 移除固定关键词标签、首句摘要、语言猜测和估计词数；文件登记只保留真实原文预览、类型、哈希、大小与字符/行数。删除重复预处理接口及全部无引用调用，输入不再预填示例。2026-10-21后续阶段已补设备UTF-8文本文件上传到专业摘要的本地闭环；PDF/Word/OCR仍未接入，见[文本文件处理阶段记录](../reviews/2026-10-21-contract6-release-preparation.md#2026-10-21-文本文件处理本地实现尚未发布)。
- **改善真实协作信息和文字排版。** 妙页从当前节点展示真实执行者、工作目标、待处理事项及最终/最新成功成果。聊天与成果共用标题、引用、列表、表格、代码、手动HTTP/HTTPS链接呈现；不会因Markdown自动加载远端图片或执行HTML。浅色基础主题也统一到现有产品色值，深色未重新设计。

本轮验证（2026-10-15）：

- `MIAOXUN_DOTENV_ENABLED=false ./scripts/check-repository.sh`退出0：后端808通过、172项专用环境门控跳过；RN66组763项；Agent42、Admin15、avatar-web29、media-web3及制品测试通过。格式、lint、类型检查、Web构建和内嵌viewer一致性通过，最终日志无act警告。证据在仓库外`MiaoxunReleasePreparations/repository-cleanup-20261015/repository-check-final.log`。
- 本机PostgreSQL18/pgvector一次性空库完整执行39个迁移。普通聊天、漫画授权、管家分派、工作区文字和能力五套集成共78个不同用例通过：首轮77通过、1个漫画夹具错误，修正后漫画整组17/17复验；其余61项首轮通过。没有把mock或跳过项算作PG验证。结束核对users=0、其它连接=0后删除本轮临时库；4391/55441/8768均无监听。
- 首次新构建已安装固定iPhone17，实看默认妙、妙/讯同一三向菜单、二楼前五项完整、相册动作→空需求草稿且发送禁用、真实页面预览/返回、穿搭保存形象。任务卡850ms原地长按释放后无菜单残留；语音返回模拟器能力限制，可关闭。未发送消息、调用模型、保存成果或修改授权；不能代表真实素材→协作→确认完成。
- 实看发现内嵌bundle的Debug仍探测不存在的Metro，已用RN公开API关闭无用探测，不屏蔽LogBox。需求页同时删除重复上下文标题/摘要和冗长说明；最终增量构建、签名、原位安装和启动全部成功，新进程Metro/调试器/其它JS警告及React错误均0；最终界面确认素材只标识一次、需求仍为空且发送禁用。

- 最终构建前后全仓source SHA256均为`4a28f0a1f14c44329c35e0587571d8d5148f985571faeed9d285d1ac870c681a`，JS为`67c2d1f63aed928f3b3f13c5d08b68d849ae91d35d3fbc549c9b4a221b5aea1a`。构建后只补本文证据，未继续修改产品源码。二楼无私人内容截图保存在仓库外同证据目录`iphone17-second-floor-final.png`。
- 上述设备结果只覆盖已安装客户端读取正式48数据及不写入的交互。新后端逻辑以隔离HTTP/PG测试验证，没有把模拟器连接旧后端称为新前后端完整验收；本轮未部署、上传或做真实供应商复验。

### 2026-10-15—19 清理记录（当时快照）

**2026-10-19 本轮代码清理**（经 `MIAOXUN_DOTENV_ENABLED=false ./scripts/check-repository.sh` 退出 0 验证）：

- 删除 6 个零引用源文件：`StationSocialPanel.tsx`(261 行)、`StationCapabilityWorkspace.tsx`(121 行)、`stationModuleStatus.ts`(35 行)，以及被它们删除后失去唯一引用方的 `StationShared.tsx`(49 行)、`StationMetricBox.tsx`(35 行)、`StationAlbumAgentPanel.tsx`(36 行)。
- 删除 5 个零引用导出：`assistPageLabel`、`isAssistantAgent`（连同只为它存在的两个 Set）、`workspaceIsTerminal`、`messageIconAssets`、`stationPartnerIconAssets`。
- 删除 16 张零引用 PNG（5 张 Agent 角色头像、5 张 settings 图标、2 张 tab 图标等），并移除因此变空的 `assets/icons/settings`、`assets/icons/messages`、`assets/icons/station/partners` 三个目录。
- 合并两处完全相同的头像白环样式：`AgentGlyphAvatar` 的 `ring` 改为引用 `shared/styles.ts` 的 `avatarRing`。
- 重新生成过期的 `MiaoxunRN/src/assets/avatar-viewer/avatar-viewer.html`；它此前使 `check-repository.sh` 的 `cmp` 步骤失败。
- 当时引用核验未再发现该次范围内可删除的源码或图片；原“全仓零死源码、零死图片”表述过强，不作为今天或全仓的保证。

- 已删除主树旧Build47 `MiaoxunDevelopment/76237d6f8986/DerivedData`：2,107,432 KiB，约2.01 GiB；删除前确认无构建进程、缓存App为47。保留当前构建缓存、构建记录、签名制品、日志、数据库和备份。
- 新构建安装后，已删除被替代的`MiaoxunDevelopment/69e1bb93ddda/DerivedData`（1,114,824 KiB，约1.06 GiB）和本轮重新生成的三个Web dist；先确认无xcodebuild进程、新App来自76237d6f8986且安装摘要一致，dist均为无跟踪可重建输出。精确清单为仓库外同证据目录`final-cache-cleanup.json`。当前新DerivedData保留；不能将旧47缓存删除量当作重建后的净节省。
- 已停止8768旧B02静态预览服务器。该页面是历史验证结果，不代表当前RN App；原验证材料保留。
- 13份过时/重复Markdown已删除，约94.6KB、1054行；有效工程结构与迁移内容归并到`architecture.md`和`database.md`，引用同步更新。删除前逐文件归档验证，归档位于仓库外`MiaoxunReleasePreparations/repository-cleanup-20261014/superseded-documentation-20261015.tar.gz`（0600，SHA256 `65528be0aa002d25e37313e034cd16d97f7c3699b5d316db500e71a4f09555b4`）。不另增加本轮一次性审查报告。
- 39个脚本均有执行、测试、迁移或恢复入口；引用存在不等于工具有效，收尾已修正两项真实相册验收脚本的旧同步/授权合同，共用202任务轮询和幂等结果读取；另修正相册评估的工具operationKey/完整索引统计及检索smoke未真正到达调度检查的问题。前两者分别承担真实OSS上传链和独立服务链，本轮只验证离线合同，未重跑云端验收。CURRENT旧阶段记录仍保留单份历史证据；不将“全项目已清理”作为结论。
- 主仓库约2GB主要为Pods/node_modules，RN业务源码约2.9MB；不能按文件数量删除依赖、迁移、测试或备份。
- 两个旧活动工作树、旧分支及主树未整理的Git基线仍待收拢。它们不属于本轮可直接归档的当前聊天附件；保留独有提交，不能盲删。
- `ai_tasks`和`agent_workspaces`均仍承载真实功能；存在重复状态/轮询/取消/预览逻辑，应在统一任务模型与数据迁移后删旧路径，不能直接删库或伪装兼容完成。
- 本机其它数据库和独立new-api容器未证明无用，本轮保留；日常App没有另起本地API/Worker。
