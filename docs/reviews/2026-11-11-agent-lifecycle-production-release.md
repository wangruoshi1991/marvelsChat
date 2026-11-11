# Agent生命周期修复生产发布与用户确认安装Build61

2026-11-11。本次在明确的精确本地提交、部署修复、发布既有漫画产品及新客户端分发范围内执行。生产新runtime和漫画产品0.1.4已发布，Build61已通过正常Xcode Organizer上传并由Apple接收。**最新用户确认手机已安装1.0（61），此前TestFlight下载问题已解决；代理未独立读取设备版本或验收功能。** 较早提交结果待核、AX已批准及通知按钮的记录按历史时点保留，手动通知不再作为当前阻塞；不据用户手机的结果推断所有测试者均可下载。未推送、未代用户同意、未执行新模型生成或付费供应商调用。

本记录更新[较早发布前预检](2026-11-11-agent-lifecycle-release-preflight.md)的后续阶段，保留其历史BLOCKED结论及原始失败证据。外部证据目录为 `/Users/gary/Library/Application Support/MiaoxunReleasePreparations/agent-lifecycle-20261111/`，下文简称 `P`；仓库内不保存凭据或私人内容。本页与同期交接更新属于发布后的文档增量，未改变171a01d的业务源码或已发行制品，未另行commit/amend。

## 来源与制品

| 对象 | 身份及边界 |
| --- | --- |
| 本地提交 | `171a01d2ca8bd1d854a032b079bd7dd6dc82c375`，父提交 `b0860449c9e46edc1d647d32154cb4c86b41b89b`，未push |
| 源码tree | `ef2d743e9b2ec74351ef4d31331781ac8abb1178` |
| 审核范围 | 49文件：RN源码10/测试9，Backend源码11/测试5，Admin源码2/测试1，文档11；逐项范围及SHA在 `candidate-scope.json`、`candidate-SHA256SUMS`、`local-commit.json` |
| runtime | `agent-lifecycle-20261111-171a01d`，299文件；旧制品298文件，新含目录诊断模块；Admin和avatar-web由正式打包器重建 |
| tar.gz SHA256 | `37b0db0af3e816dc0b9cd4c0567f9c83665a1930b113d888273aec6c34b8e315` |
| manifest SHA256 | `bd40191855555baa86d05fb3b76baf66ebc64d83da616c0b018d87c6a6848816` |
| SQL/配置边界 | 58项迁移及checksum一致；无新增迁移、Agent声明/scope、shared、配置、原生或依赖锁增量 |

正式包从clean committed HEAD生成，传输SHA匹配；runtime不包含RN，客户端独立归档。授权修复统一展示、确认和提交的精确产品解析，历史失效授权不再混入有效投影而误报身份冲突，撤销绑定真实历史productVersionId；歧义明确拒绝。客户端原位重新同意保留已有会话，不自动授权。交互修复保留回弹当前位移、拒绝旧异步回执，并让入口/展开/参与者弹窗尊重减少动态效果。实现及隔离验证见[授权复核](2026-11-11-agent-product-reconsent.md)和[交互审查](2026-11-11-gesture-flow-audit.md)。

## 生产执行、失败与恢复

旧生产为 `/opt/projects/marvels-chat/releases/comic-image-20261110-510df0d/runtime`、源码 `510df0de6946fc63d196be95a31ec64b4655f514`。执行前15类活跃队列及6类等待用户队列为零，六条历史媒体费用unknown数量/摘要固定保留，未重试或清除。候选复制原受限环境字节，不合并新键。

首次候选准备因运维全局 `umask 077` 使解包代码和npm依赖目录0700/文件0600，服务用户无法import，在维护、停服务或切app前失败；旧生产保持。`production-deploy-initial-failure.json`、`production-deploy.log`及服务器原执行目录原样保留。

修订工具为解包/npm安装分别限定 `umask 022` 并finally恢复077。新 `resume-staged-before-maintenance` 绑定原五份执行文件SHA/模式/状态、316项候选代码记录与2465项依赖记录，仅给精确manifest代码/node_modules增加读/遍历，不改字节、属主、链接或写权限，排除env/storage；实际服务用户import通过后才进入维护。resume另建证据目录，不覆盖失败记录。修订 `deploy.py` SHA256为 `e4e6d1f184ca51680e3b8e75888f8637e76f310ef0ae7655daaacf39b46d2229`，独立23/23安全测试通过。

维护只作用于12个妙讯Nginx location，保留共享根页、`/suanming/`和HelloRose包含项。排空HTTP/WebSocket，停API/双Worker和备份timer，确认无其他数据库客户端/prepared事务后创建停写恢复点。`stopped-write-058.dump` 为971644字节，SHA256 `f34e335cf3d41a54c4502b2b874ad9af0bb8a9f1c6cd33b994bddf2ea4b1827b`，保留owner/ACL。在独立PG18专用0700 socket目录、无TCP实例恢复验证78表摘要、7序列状态、角色/成员、owner/ACL及逻辑schema；物理attnum差异由pg_dump省略已删除列解释，索引/CHECK差异在隔离库事务内重解析证明等价。没有放宽序列或真实schema差异，隔离实例已停止，未对生产执行restore/drop。

无新SQL，因此未运行迁移mutator。刷新storage、硬化候选、原子切换app后，三服务从新runtime启动；维护下先验证ready、58账本、manifest、AI/工作区poll跨时间推进与媒体心跳。单独open于 `2026-11-11T04:04:39.845213Z`（北京时间12:04:39）记录traffic_opened并恢复原Nginx字节。

`final-production-readonly.json` 在 `2026-11-11T04:27:03.399175Z` 独立复核16项全部通过：299/299文件SHA、58 ledger/checksum、三服务active/0重启且cwd同源、备份timer active/waiting、无维护marker、原Nginx字节及共享location保持、health/ready200且数据库/迁移ready、Admin首页/深链及新CSS/JS200且SHA匹配、安全头存在、公开9 Agent含漫画0.1.4。根页200及`/suanming/`401与原状态一致。该观察不构成长时间稳定性证明。首轮复核导入运维模块时在独立工具目录生成一个Python缓存，原样保留；后续改用 `python3 -B`，二轮确认其mtime未变，未改生产业务、运行配置或数据库。

恢复点保留在 `/opt/projects/marvels-chat/backups/agent-lifecycle-20261111-171a01d/`；新执行证据在同级 `agent-lifecycle-20261111-171a01d-resume-staged-before-maintenance-execution/`。旧runtime、原失败和resume记录均保留。开放且发布新产品后，回滚必须重新评估新业务数据和授权语义，不能直接切回旧授权代码或用旧数据库覆盖当前业务，优先前向修复。

## 漫画产品发布

经正常已登录后台，在既有漫画产品“创建新版本”，使用0.1.4并精确绑定已发布/ready的 `comic-diary 0.1.4` Release，保留既有身份及iOS/Android平台，正常保存draft、详情复核、审查并发布。没有新建重复key、改旧用户consent或触发模型。

产品hash为 `915827fea2db9779902319a39fcd38f1ea2a630fd32aafe65c1abcfc4da8a4ee`，发布时间 `2026-11-11T04:12:14.011Z`（北京时间12:12:14）。七scope为 `messages:read`、`diary:read`、`diary:write`、`album:read`、`station:read`、`station:write`、`media:image:generate`。该版本页面显示尚无用户授权记录，本次未代为同意。

`comic-publication-ui-observation.json`、`comic-product-published.png`及`comic-release-catalog-visible.png`记录正常后台状态；12:16:57新Admin Release详情明确显示“所选 release 已进入 App 目录”，关联产品0.1.4为已发布/当前目录候选。`post-publish-public.json` 在12:12:37实际返回9项及漫画0.1.4/七scope，最终生产复核再次确认。公开Release contractHash `d88aa434730db91dbe1fc8f45c42cc92659e92ad759068150e0e9b5ba8e2f59a`与后台product hash属于不同对象。目录可见、Release ready、用户同意和实际成图分别验收。

## Build61归档与上传

正常Apple页面先核实最高已接收Build60、处理完成且正在测试，见 `apple-build-observation.json`；没有用磁盘工程58或历史归档推算Apple号。本次从171a01d冻结506项提交源码及本地构建输入，以 `CURRENT_PROJECT_VERSION=61`、`MARKETING_VERSION=1.0`、`MIAOXUN_API_BASE_URL=https://8.153.167.11` 参数归档，磁盘工程不改。

Xcode archive退出0，但原完整输入前后门禁失败；原 `ios-build61/archive-verification.json` 保留 `completed=false/sourceInputsUnchanged=false`、错误及日志。独立审计确认506项提交源码、本地配置、HEAD/tree及clean状态未变；3551项依赖差异全部是RNCore/RNDeps/Hermes Debug→Release转换，3510项仅模式、41项内容、未解释路径0。前后字节/类型/链接及 `umask 077` 预期模式逐项匹配构建前冻结的相应压缩包，三个配置标记精确Debug→Release。未重跑归档或修改原产物，另写 `dependency-transition-verification.json`，SHA256 `ee4c3486b588fbfb45a9d2e90a07bae40b782a01aa73368de1190bfc3e172121`，没有把原门禁改成通过。

完整输入摘要从 `0e6390bbf100ec731f5b444c90066fe093ff210b62214e75a39b20787f2f7b4f` 变为 `69a9d8cb4f608ba8192cd1bb99362713ef0ef4c7a455d1b5a65ce5565bfa7acd`，不能写“所有输入未变”。三个框架以LC_UUID绑定冻结Release制品和新归档；Xcode会strip/签名，不声称框架二进制字节全等。

独立 `reviewed-existing-archive-verification.json` 完成正式Bundle `com.wangruoshi.miaoxun`、API `https://8.153.167.11`、1.0(61)、Team `R8K5DUTWB6`、严格codesign及App/三个框架dSYM核验。原 `MiaoxunRN-build61.xcarchive` 保持，独立 `MiaoxunRN-build61-symbols.xcarchive` 仅加三个UUID精确匹配的框架dSYM；App dSYM来自本次归档。JS bundle SHA为 `cec22c8752cb2cfcf0c8009c067aee047c84b5dac4a95409fab4c5cd595833cb`。原profile为Development/get-task-allow=true，归档验签本身不证明分发或上传；这份较早独立回执的 `uploaded=false/distributionOrUploadVerified=false` 原样保留。

随后沿正常Xcode Organizer进行App Store Connect分发；`apple-build61-upload-observation.json` 在 `2026-11-11T04:31:26.949591Z` 记录明确完成提示：**“App upload complete: MiaoxunRN 1.0 (61) uploaded”**。截图 `apple-build61-organizer-uploaded.png` SHA256为 `3ebc40cc63a255a39e74b1c06e8a322d77b0b933589f7106a9c21f6c4f6df3b4`。上传成功与较早归档回执是两个时间点，不回写原回执。此后Chrome读取先超时，经用户将现有TestFlight页面前台刷新后恢复。正常Apple列表已接收Build61，buildId为 `72062f5b-28d0-4871-accb-e3e86403ea41`，12:35时为“缺少出口合规证明”、无测试组，截图 `apple-build61-export-compliance.png`。加密分类弹窗四项均未选择、未保存；用户明确“我自行处理出口合规”，保持弹窗交给用户，没有代填。正常页面结构化观察为 `apple-build61-testflight-observation.json`，观察时间 `2026-11-11T04:35:38.877193Z`。这份缺合规/无组观察为历史时点，后续用户完成合规见下段；Build60正在测试且有两组不能代替Build61。

用户自行处理出口合规后，正常Apple页面实读Build61为“准备提交”，缺合规警告不再显示。`apple-build61-beta-submit-observation.json` 记录 `2026-11-11T04:44:04.567756Z`：从既有组picker选择外部 `yunzhi`，填写本次Agent授权、UI预览和二楼/妙页回弹的实质测试说明，取消默认自动通知，点击“提交以供审核”一次，最后观察为“正在提交”。随后原生Chrome读取30秒/60秒超时，没有再次提交，最终是否进入等待审核/正在测试尚未确认；不能写成外部审核成功或可测试。内部 `yunzhi` 选项禁用、未操作，既有关联关系未核。该提交动作关闭了自动通知，不证明设备已安装。用户随后明确“不用管了，我自行处理吧”，全部Apple浏览器操作已停止；后续审核、分组和核验交由用户，不再尝试或重复提交。

后续用户询问为何一直“已批准”且真机无法下载，正常Chrome页面再次只读核验：Build61行明确“已批准”，有“通知测试员”按钮、两处 `yunzhi` 组，邀请7、安装“–”；Build60显示“正在测试”。证据为正常Chrome AX实读及结构化回执 `apple-build61-approved-readonly.json`；该回执未记录精确观察时间（observedAt=null），recordedAt只是补记时间；用户随后已切换页面，后取截图不作为TestFlight已批准证据。这是提交后的新状态，较早“正在提交/结果待核”回执按历史时点保留。此前提交已关闭自动通知，本轮未执行手动通知；本轮没有点击“通知测试员”、发送通知或更改测试组，后续仍由用户自行处理。已批准及可见组字段不等同于设备安装，也不能据此断言全部内部测试者均可下载。

本轮用户随后明确回复手机已安装1.0（61），并确认此前TestFlight下载问题已解决。安装版本及下载问题解决的证据来源为用户确认，代理没有独立读取设备清单、版本或验证功能。该结果更新当前分发结论，原AX“已批准/安装–”观察和未点击通知的操作边界保留；不扩大为全部内部或外部测试者均可下载。

后续用户已确认漫画Agent可见、显示绑定且无重新同意入口；二楼退出到讯页瞬间有卡顿/跳动/闪白，体验未通过。沿Build61源码进一步定位并本地修复UI-Agent权限标签缺失和二楼退出链路，新增修复尚未进入Build61或生产发布范围；新结果及限制见[真机验收记录](2026-11-11-build61-device-acceptance.md)，不以本地测试改写该版本的真机结论。

上传后另有只读 `ios-build61/post-upload-local-verification.json`：Organizer官方归档与已选symbols副本的157项payload内容/模式全相同，仅Info.plist增加分发元数据；正式Bundle/API/JS摘要、严格签名和四组dSYM再次匹配。官方归档分发事件记录04:29:14Z Uploaded/success、零错误/警告；1156项业务源码blob仍逐项匹配171a01d。未重归档或再次上传。该本地核验与正常UI互相绑定，不替代Apple合规、测试组或设备验收。

## 验证、后续与证据索引

冻结修复的 `MIAOXUN_DOTENV_ENABLED=false ./scripts/check-repository.sh` 退出0，`repository-check.log` 保留RN99套1289项、Backend1136通过/376环境门控跳过、Agents57、Admin52、Avatar29、检索Web4，类型/lint/格式、脚本及Web构建通过；既有act和Web大chunk提示保留，未放宽门禁。PG门控跳过不算集成验收；前阶段两个新隔离空库001–058后原位同意/撤销4项及既有生命周期10项全过零跳过，见授权复核。Simulator build-only只证明编译、签名和身份，不代表本次设备体验通过。

下一步按独立门槛继续：

1. 用户在已安装的Build61真机确认漫画目录可见，核对准确产品、版本及完整scope；用户亲自决定是否同意，代理不代勾选或写授权账本。
2. 核UI-Agent添加的真实结果、原位重新同意与保留会话、精确撤销；仍有失败时保留实际错误响应再定位。
3. 用实体手指验二楼入口、短页退出、回弹再抓、妙页同卡S1/S2、连续滑动、Modal及减少动态效果；真实workspace须来自正常业务，不造任务/摘要充当验收。
4. 漫画新模型生成须另明确环境、次数、格数及费用范围。本阶段无新生成或付费调用，11月10日隔离环境真实成图、当前目录与心跳不算Build61功能通过。

主要外部回执：来源/制品为 `local-commit.json`、`artifact-verification.json`、`archive-transfer.json`；生产为 `server-plan.json`、`server-resume-plan.json`、`production-deploy-initial-failure.json`、`pre-open-verification.json`、`production-open.log`、`final-production-readonly-initial.json`和`final-production-readonly.json`；运维代码/测试在 `ops-tools/`。漫画正常UI及公开回执见上节；iOS原失败、输入清单、依赖转换、框架来源、符号副本和独立完成回执均保留在 `ios-build61/`，Organizer上传另以 `apple-build61-upload-observation.json`/PNG证明，Apple接收及较早缺合规状态见 `apple-build61-testflight-observation.json`/`apple-build61-export-compliance.png`，用户完成合规及本次外部审核提交动作见 `apple-build61-beta-submit-observation.json`，本地上传后复核见 `ios-build61/post-upload-local-verification.json`。
