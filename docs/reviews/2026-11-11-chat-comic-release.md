# 聊天与漫画续修配套发布

2026-11-11。用户在已说明“配套发布后端、漫画Release/Product及新客户端”后回复“可以”，本轮按该范围推进；包含生成可追溯制品所需的精确本地提交，不推送。模型付费验收、代用户授权、Apple出口合规声明不在本轮执行范围。保留所有既有工作树内容。

## 已核实基线

- 所有49项dirty文件与上阶段最终SHA清单逐项一致，未有未解释增量。源码/测试见[实现记录](2026-11-11-build61-chat-comic-followup.md)，本轮新增本发布记录并更新CURRENT/索引；在固定清单后本地提交，不使用reset/clean/checkout或临时覆盖。
- 正常SSH只读复核：生产`app`仍指向`agent-lifecycle-20261111-171a01d/runtime`，sourceHead`171a01d2ca8bd1d854a032b079bd7dd6dc82c375`、tree`ef2d743e9b2ec74351ef4d31331781ac8abb1178`，299项manifest及全部文件SHA匹配；58迁移与checksum全匹配。三服务active、同源、0重启，备份timer正常，Nginx原字节和共享路由完整，health/ready/Admin及静态资源检查通过。证据`/Users/gary/Library/Application Support/MiaoxunReleasePreparations/chat-comic-release-20261111/production-baseline.json`。
- 正常Chrome原生AX实读TestFlight：最高上传1.0(61)已完成，61“正在测试”且显示两个既有yunzhi组；下一候选62。浏览器扩展连接仍报timeoutMs错误，原生页面方式成功；未用受保护接口或会话提取绕过登录。未更改原Build61分组/通知。回执同目录`apple-build-observation.json`，准确读时未单独采集，observedAt=null、recordedAt仅补记时间。
- Podfile.lock与Pods/Manifest.lock一致，RN package/lock一致，Release显式正式HTTPS/API，磁盘工程仍1.0(58)，归档使用独立参数62而不改工程。`xcodebuild -showBuildSettings`和API校验通过；bundle check缺8个锁定gem、CLI仅Development身份均如实保留，不安装依赖、不把此状态称上传就绪。

## 发布合同

运行时真实代码增量只有`agents/comic-diary.agent.js`、`backend/src/agent-workspace-service.js`、`backend/src/ai-client-contract.js`、`backend/src/routes/agent-workspace-routes.js`；无新迁移、配置、依赖锁、shared/Admin/Avatar源变更。已从clean committed HEAD由正式打包器构建完整API/双Worker/Admin制品，未复制dirty文件上服务器。

贡献合同2/3显式保持旧shape，4严格增加四类不可读原因；新RN只发4。因此后端先于新客户端分发。漫画0.1.5部署后，从正常后台“当前代码注册”创建新Release草稿、审核并发布，再为既有产品创建精确绑定新releaseId/0.1.5/原七scope的新版本，核对实际hash、目录诊断及公开目录。不得用0.1.4的“身份修订”跨版本代替新Release，不同号来源或业务hash不可复制。

runtime manifest SHA绑定真实JS来源；Release contractHash绑定key/version/permissions/identity，Product另绑定精确依赖，不能互相替代。最终业务hash以真实保存/审核/发布回执为准。旧0.1.4用户consent不会自动扩大为0.1.5；新版本发布后用户本人原位确认，保留原聊天，不要求解绑。

停写切换前重新核对任务排空，保存并验证独立恢复点；保持原env字节与共享Nginx边界，完整API/双Worker同源切换。无SQL增量不重放迁移、不合并配置。维护、校验、开放为独立可审计步骤。

## 源码与制品

以下`P`均为仓库外证据目录`/Users/gary/Library/Application Support/MiaoxunReleasePreparations/chat-comic-release-20261111/`。本轮精确50文件本地提交`f1a6c8fc5c2b0aea2852e0f626d2ef82e68e72e7`，tree`2619a46b97d7fa9b9c3415c3b64b9ce0a13c8414`，parent`171a01d2ca8bd1d854a032b079bd7dd6dc82c375`；制品及归档时Git干净，未推送。发布完成后的本记录、CURRENT及索引为后补证据，不冒充已打包源码。

正式runtime为`chat-comic-20261111-f1a6c8f`，299项manifest和完整文件集合逐项SHA验证通过，295文件字节不变、实际增量仅上列4项。archive SHA`e6e049a37d16fb8e330e49dde73a2cc2eeb3a584400719931025d660c385bc59`，manifest SHA`97bcd71f24a5ac8de51465328635f3c6d2f156ed4a66feb91234342a00ef9d3d`。来源、增量及传输回执为`P/source-commit.json`、`runtime-artifact.json`、`runtime-delta.json`、`transfer-verification.json`。

本轮整仓`./scripts/check-repository.sh`退出0：RN103套1328项、Backend1140通过/376环境门控跳过、Agents58、Admin52、Avatar29、检索Web4及类型/lint/格式/Web构建通过，日志`P/repository-check.log`；数据库环境跳过不计作PG验收。上一阶段隔离PG058后漫画队列14/14零跳过、测试库已删除。Simulator固定iPhone17为Shutdown，build-only在构建前被只读保护中止，未boot/install/绕过，不算模拟器编译或交互通过。

## 生产切换及独立恢复开放

生产`app`已指向`/opt/projects/marvels-chat/releases/chat-comic-20261111-f1a6c8f/runtime`。无SQL增量，58项账本及每项checksum保持，未执行迁移或生产restore；env及共享Nginx保持原字节。停写备份已在独立PG18恢复核验78表、7序列、960列、273索引及角色/权限/函数。原严格校验对物理列编号/索引表达差异的失败回执保留，独立逻辑等价复核`report-final.json`通过，未用修订回执覆盖原结果。

原部署器在切换后将journal中真实Node子进程PID硬等于systemd的npm MainPID，误报`worker_heartbeats_or_poll_not_advancing`并保持维护。原执行目录`backups/chat-comic-20261111-f1a6c8f-execution`的15文件保持原字节，state仍`stage=failed / failedFromStage=awaiting_validation / trafficOpened=false`，SHA`51cc32667899f3cabdccd3aadb871fc71ee9a781d03d3ededc82b70d1b3f1c52`，没有改写为成功。原工具SHA`246765ddc87681ee172b9a3324f44d8ae12274dd871af8b1f182c76753f6abe7`及30项测试、失败日志留存。

另行冻结恢复工具`recovery-open.py`（SHA`7cd50923f059235f656f28d8a5f3f94e5d88666eb194ec202835f0b1073afa9e`），12项测试与独立复审通过。先只读`validate`，再显式执行`prepare-open`和`open`，每步完整重验；严格绑定真实unit/cgroup/boot/startticks、Node子进程归属及cwd，取得两次新心跳和两类poll进展，复核三服务、manifest/账本、配置与排空；不新增退库路径。开放先设置固定维护标记阻断旧回退，再持久化新state、恢复原Nginx。

北京时间15:23:44新恢复目录`backups/chat-comic-20261111-f1a6c8f-execution-post-switch-validation`保存独立`traffic_opened / trafficOpened=true / maintenanceActive=false`，state SHA`4b97b26a548b574f0fb8dafa05ac5dcf75a5386e62728925f11237ab06427730`。API/AI/检索三服务同源active/running、0重启；备份timer恢复，health/ready/Admin/资源正常，共享根页200和`/suanming/`401保持。六条历史媒体费用unknown未重试或清除；未写生成任务或调用付费模型。部署、原失败、新恢复证据并列见`P/production-deploy.log`、`post-switch-failed-validation.json`、`recovery-readonly-validation.json`、`recovery-open-observation.json`及`ops-tools/RECOVERY-EXECUTION.md`。

## 漫画Release与产品发布

全部从已登录的正常后台页面完成，未提取token或调用受保护接口伪造操作：以新代码注册创建独立Release0.1.5，审核并发布；再为既有`comic-diary`产品创建0.1.5新版本，精确替换旧依赖，经正常审核发布。未创建重复产品，未以身份修订冒充跨源码版本发布。

- Release ID`3cce7270-9c70-4eed-8c05-1b20f1da6e11`，版本0.1.5、published/ready；contractHash`5316c2a0311ad702af5edc41151708060091755d11d2965991c6699d0c1eb964`，发布时间`2026-11-11T07:28:01.568Z`。
- Product0.1.5，hash`f3bc34e449a579b41dae9d236ffe52109214611b6b45bf437c7f9eaf50f426d8`，发布时间`2026-11-11T07:36:36.245Z`；Android/iOS、唯一依赖为上述漫画Release0.1.5。保留原七scope：`messages:read`、`diary:read`、`diary:write`、`album:read`、`station:read`、`station:write`、`media:image:generate`，未扩权。
- 正常UI实见该版本无用户授权记录；用户仍须本人在App原位确认精确产品与scope。代理未代同意，不要求解绑。证据`P/comic-product-015-ui-observation.json`及`comic-product-015-published.png`。

北京时间15:45:18独立只读终验30/30通过，真实公开目录9项、漫画0.1.5的`permissions`精确为原七项、公开Release hash与发布记录一致；数据库Product hash、唯一Release ID/版本/七scope全部精确匹配，从已存合同快照调用纯函数重算Release/Product双hash一致。runtime299/58账本、三服务同PID/0重启、配置、备份、公开路由、贡献合同4及2/3支持再次通过。未写生产、无受保护HTTP。新回执`P/final-production-published-identity-readonly.json`，SHA`86e4834a98b4f06d31e544e59e593b2e4e1a2186a9f53656781b1745b278c7b4`；审计工具SHA`1cf6796725f95144a88170480806bfda92c99d7a7cebbd13e33586f5d407024a`，34项只读安全检查和21项合同检查、独立复审均通过。

两份较早审计回执保留原结果：`production-post-open-before-comic.json`在后台发布前因registry尚0.1.4而未全过；`final-production-readonly.json`在发布后已实际读到9项/漫画0.1.5，但错误比较registry默认身份hash与运营发布身份hash，并读取公开合同不存在的`requiredScopes`而误判。新审计依据实际公开`permissions`字段与精确运营合同验证，不修改旧false、不改变产品权限或生产实现；三份结果不得合并成一次无失败执行。

## Build62归档与上传

同一clean HEAD/tree以独立参数归档1.0(62)，磁盘工程58未修改。`archive-verification.json`的`archiveExitCode=0/completed=true/sourceInputsUnchanged=true`；512源码输入及43220依赖文件、7056链接前后冻结核验通过，源码输入SHA`140eff1ed05d439104e7ff1ef5291cd2f14b1322e586b65c6e288d8164fc87ff`。App正式Bundle/API、`NSAllowsArbitraryLoads=false`、严格签名及四组App/框架UUID全部匹配；JS SHA`c291b8ed4293e843acf590f719ccf0884cad044354b51b17dc7bbf47915fb831`，与Build61不同。

原归档149文件保持，独立symbols副本158文件只多三个框架dSYM的9个文件；App dSYM来自本次归档。独立复核`P/ios-build62/independent-local-archive-review.json`全项通过。归档本身为Development签名/get-task-allow=true，归档验证不等同分发签名或Apple接收；不安装缺失gem、不重跑归档。

北京时间15:38:15正常Xcode Organizer明确显示“App upload complete: MiaoxunRN 1.0 (62) uploaded”，关闭完成页后列表和Submission Status均显示Uploaded/62。证据`P/apple-build62-upload-observation.json`、`apple-build62-organizer-uploaded.png`。**本轮上传成功；不等同TestFlight已可安装。** 后续两次正常Chrome原生读取均30秒超时，未拿到Build62处理/合规/测试组状态；未借受保护接口绕过，未重复上传。用户此前要求合规与TestFlight后续自行处理，本轮未填出口合规、改组、提交Beta审核或通知。

## 回滚与待验边界

新客户端分发前且未产生新版本业务/consent时才可评估回旧完整runtime；一旦合同4客户端已分发，直接退171a01d会使其贡献请求426。0.1.5发布/用户确认/任务写入后，旧runtime亦不兼容新版本授权；优先前向修复，不能用旧数据库恢复点覆盖开放后的新业务。新包真机、真实模型及用户scope分别验收；Simulator关闭的构建保护限制仍按实现记录保留。

下一步先由用户完成Build62的Apple处理/合规/测试分发并安装，保留现有绑定和聊天；核对UI-Agent添加、漫画原位重新同意及独立图片scope、制作漫画入口→分镜→用户确认后的真实任务、长输入/表情和二楼退出。真实模型调用范围（环境/次数/格数）尚未授权，本轮不代做；其他Agent实际可用性、妙页真实多卡与实体手势、群聊/普通附件客户端缺口仍按CURRENT逐项验收，不能凭本次发布宣称已通过。

后续用户明确确认手机已安装1.0（62），因此该用户的安装不再是当前阻塞；来源仅为用户回复，代理未独立读设备版本或Apple分发页面，也不推断全体测试者已可下载。首项UI-Agent权限弹窗用户实测正常显示“修改界面偏好”、不再提示无法识别的权限，并已取消；随后由用户本人确认添加，明确反馈“添加成功，显示已添加或可进入聊天”。权限展示及实际添加真机通过，未发送消息、调用模型或代用户授权；UI偏好执行、漫画原位同意及真实生图仍待验。

随后漫画原位同意/入口真机复验：用户先查看并取消，确认有“重新同意”、v0.1.5及“生成图片”权限；再由用户本人接受完整范围确认，反馈“授权成功，原聊天保留，制作页能打开”。本次无解绑，已证明该用户升级授权、保留聊天和制作入口通过；未独立读授权账本、不推断全体用户。未点击生成按钮，完整真实文字/图片生成及其余交互仍待验。

后续用户明确授权一次真实生成验收：当前手机账号、非私人“小猫与小狗放纸船”测试故事、1份四格分镜加1份四格图片任务（最多4张），不选日记/相册、不手动重试。代理已提供手机选择4格并点一次“生成并保存分镜”的步骤，等待分镜结果后再按同一授权进入图片确认，不在终端/API重复发起。当前尚无模型成功证据；授权本身不当作已提交或已生成。

用户随后反馈分镜已生成，并描述点击生成漫画后出现图片，同时明确指出当前流程繁琐且名称/显示不符：期望在Agent聊天中沟通、使用明确选定的照片、单次确认生成，消息显示紧凑四格与详情并可发布动态。代理未独立核对图片任务/数量/质量/费用，不据此声明四格生成闭环验收；**Build62整体漫画创作交互未通过**。不再追加表单测试或付费调用，最新[对话创作草案](../superpowers/specs/2026-11-11-conversational-comic-diary-design.md)仅为设计，不属于已发布功能。用户已选择消息内展示格数/素材、点一次生成的确认方式，完整方案待评审实现。
