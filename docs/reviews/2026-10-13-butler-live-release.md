# 妙管家真实验收与 Build47 上传记录

2026-10-13。本轮承接用户确认的真实模型验收→47上传并可安装→API与两个Worker配套→真机验收；保留原工作区全部修改。真实分派与公开素材B02已通过，最终freeze05/653ad85a已归档，47于18:07:42 CST上传。ASC于20:06:02 CST复核显示1.0(47)“正在测试”，已关联既有内部、外部群组（外部6名测试员）。正式API/两个Worker尚未切换：final02激活在维护探针阶段失败，恢复后原Nginx/旧服务/旧env及公网HTTP/HTTPS ready均通过；final03 fresh prepare仍有stage/backup遗留门禁，已精确归档，尚待新鲜prepare。固定iPhone17与真机专业链尚未验收。下文冻结前检查保留当时结论；发布与切换更新见[冻结后补记](#最终冻结与47上传冻结后文档补记)及本文末尾的最新现场记录。

## 已确认修复与真实分派

公开八案例覆盖咨询、相册到页面、必要澄清与真实短续答、缺建站授权、未接最终漫画/3D能力、英文文字页面和素材指令注入。没有真实用户正文、照片或生产授权进入评测；生成目录仅为测试夹具，不授予权限。

首批真实DeepSeek分派6/8，普通咨询与未接能力返回自然语言。生产严格JSON决策拒绝，未创建任务。为dispatch/coordinate显式发送json_object后再验八例；复验原7/8中的最后一项为grader误报：“可下载的3D模型都不在已接入”被匹配为“可……接入”建议。独立人工核对后修订2只排除形容词误匹配，保留“可以/可通过”虚构恢复建议检查；对原八份回执离线复評8/8，没有追加调用或修改原报告。回复末尾条件性建议已有成图做页面仍显多余，作为文案质量观察保留。

两批合计16调用、估计上界16分，无unknown；实际servedModel为deepseek-flash。本会话累计43调用、估计上界44分，非供应商账单实扣。官方中文Flash峰值人民币输入2元/输出8元每百万tokens本轮再次确认，旧请求model是退役别名。评测各自200分/8调用、4096输出及字节上界只存在独立脚本，正式没有固定调用次数或测试预算。

另修明确截断/过滤/未知完成原因不得交付或执行工具。已取得的工作空间回执先记录，然后明确失败；非法content和usage:null不再触发TypeError，空后台测试不再ok:true。缺finish reason维持既有供应商合同，不能称已证明完整；真实验收要求stop。普通消息、独立相册任务及admin失败调用完整持久计费回执仍需后补。

整仓通过：backend692 passed/98环境门控skip、Agents36、Admin14、RN62组634项及格式/lint/类型/构建。相关响应消费者80/80，grader修订后25/25。上一阶段PG038真实事务/HTTP/Worker55/55；本轮新的公开图片专业链待独立执行，不把供应商替身、规划或skip算作该链完成。

## 中转连接的实值

https://api.cicadas.top 根页与带凭据GET模型列表200，默认urllib UA曾403，显式产品UA可读。模型列表23项均Claude，没有6.1 sol。用户授权读取CC Switch后核实当前Codex配置gpt-5.5、Responses、high、根地址；凭据匹配，不复制CC Switch其他凭据或会话。只读usage确认Key有效，但未取得GPT计价/准确Responses endpoint/响应样本；本机CC Switch无该连接的代理模型回执记录。

妙讯现用Chat Completions，单填cicadas地址不能完成Responses迁移。追加最小Responses探测：gpt-6.1-sol两地址、gpt-6.1和CC Switch中的gpt-5.5均明确404 model_not_found，说明所测Key账号组没有该模型配置；无生成/usage回执，不能据此宣称账单零费用。用户确认当前6.1 sol来自Codex桌面App；后续复核本机Codex config也使用cicadas/custom/Responses（默认gpt-6-astra），因此先前“App连接完全独立”的说法撤回。未读取或更改Codex认证配置，UI模型标识不能替代特定Key实测。

用户随后改用浮生云算`https://fushengyunsuan.cn/v1`。Bearer模型列表明确包含gpt-6.1-sol并标记Chat Completions；最小调用200、返回同名、OK、stop，17输入/5输出/22总tokens，3308ms。该回执证明此Key可调用该站此标识，不独立证明上游模型身份。公开计价输入/输出/缓存读取/写入为$2/$10/$0.1/$2.5每百万tokens，再乘Key分组倍率；用户指定vip（公开倍率0.25），并明确取消此前本轮测试10元价格上限。价格估算按vip与站配置汇率6.8记录，仅为参考；不当作账单实扣或跨组计价证明。测试仍保持确定案例、有限响应、超时及未知不自动重放，正式不引入评测次数/费用限制。正式配置仍DeepSeek，没有切生产中转；后续真实分派与专业链结果见下文，实际扣费未核实。

浮生Key在仓库外受限目录/0600文件，不在版本控制、文档或日志。按用户新指示已移除本轮cicadas凭据，4份临时公共网页/JS校验归档后清理，保留无Key的拒绝回执摘要。规划与普通聊天可分模型名，共用地址/凭据；用户要求集中到单个模型调用代码配置文件，保持各Agent权限与独立会话，仅通过获准任务交接素材/成果。视觉与1024维图文向量仍北京原生qwen3.6-flash/qwen3-vl-embedding，3D保持独立。最终生图/成片执行器尚未接入，暂不索要额外Key冒充可用。

## 配套顺序与尚待证据（冻结前历史记录）

工程默认47，最低AI任务Release门禁仍46；ASC目前最高46正在测试。新47接旧backend能读取与聊天，但不能验统一分派；旧schema剥除butlerContextReset，跨切换同key重试可能安全409。新backend对旧46首次管家消息要求更新426，已接受同key回放保留。必须47可安装后尽快切同源三服务，并在配套后才做新功能验收。

没有新SQL；仍038及合同1/2/2。管家0.3.0/建站0.3.2与正式旧版本不同，升级前须排空旧非终态任务。新任务出现后回旧Agent版本会停止，优先同版本前向修复；同SQL不代表可无损在线回滚，禁止用旧dump覆盖新增任务、回执或素材。

15:34CST只读生产451文件同源、三服务active/零重启、双Worker推进，无非终态任务/未知工作空间/提交错配。4条历史媒体unknown/400分保留、不重放或结算；当天12:17备份本地/异地摘要及038TOC通过，未重做恢复。本轮源码冻结、公开图片完整专业链、独立47归档/签名/上传/可安装状态、固定iPhone17与真机验收继续完成。

受限证据目录：`~/Library/Application Support/MiaoxunReleasePreparations/butler-live-release-20261013/`，含原始两批回执、离线复评、源码清单、仓库检查及只读审查；不纳入Git。原索引空、已有修改保留，未推送。

## 公开真实素材B首轮人工质量审查

首轮真实caption/图文向量/PG召回/原图复核/相册→建站→主管到awaiting_confirmation，12调用、峰值计价估计13分、无unknown/残留预留。选中相册仅狗，未选相册相机也真实索引；完整页面与typed资产都只引用狗。独立DB导出确认64位素材版本、真实检索run、site依赖、双hash及profile={}，资源hash用PG原精度时间重算相符。公开本地字节仅替换OSS运输，不证明生产OSS、HTTP或RN加载。

完整HTML/JSON/图片人工审阅发现相册把账号就绪2项误写所选相册，页面正文反复写草稿/待确认等流程说明。此轮没有confirm，不把技术断言通过当最终质量通过；合成owner精确cleanup后业务表核对均0，保留回执/成本/预览/原DB证据。修复内部工具accountIndexCoverage/searchScope与终稿文案提示后继续新源码新run，不能自动重放旧任务或修改原回执。

## 浮生真实分派及公开素材B02

浮生gpt-6.1-sol八例真实分派8/8通过，八份同名模型/stop/usage/request_id回执，无unknown/残留预留；独立全文复核包括未接能力不虚构授权入口。参考估算16分，非实际扣费。chat/planning均显式采用同一模型，代码集中于backend/src/agent-model-config.js，不增加后台或App配置页面、不自动覆盖实际env。

B02使用最终质量修复源码、浮生文本与北京原生Qwen完成13次真实调用（7文本、3视觉、3向量），无unknown/残留预留，参考估算15分。独立PG18.6/038、loopback55582；两张公开图片均真实索引，检索仅选指定相册的一张巴哥犬，未选相册相机排除。typed64位version、同意epoch、真实检索run、建站对选材节点的依赖、document/resources双hash均独立重算相符。隔离库两预算列NULL读回成立，不改生产预算；16调用上限仅本次固定实验，正式不设该限制。

完整JSON/HTML所有模块、动作及原图片人工审阅通过；相册回执明确1张，页面终稿不再混入草稿/待确认/检索过程文字。质量门禁绑定原模型回执和预览摘要，不剥离或改写生成内容。reviewed-preview绑定文档、资源、完整JSON、HTML四hash，零模型确认保存通过；profile保存完整文档，同decision重放revision不增。独立确认后DB复核和清理证据与原始回执均在material-chain-run-02。公开本地字节仅替代OSS运输，不是生产OSS、真实HTTP、RN渲染或用户真机实际点击确认验收。

集中模型模块与两处质量修复后最终整仓exit0：backend698 passed/98环境门控skip、Agents36、Admin14、avatar29、media-web3、RN62组634、packager1及格式/lint/type/build通过。939非Markdown产品文件在检查期间不变，与浮生分派和B02对应源逐项一致。依赖最小修复为三Web锁source-map-js1.2.2与Agents fast-uri3.1.8；五工作区隔离Linux clean npmci/官方audit全0。新源码无新SQL，仍038；候选album-manager0.3.1、管家0.3.0、建站0.3.2，升级前排空旧非终态，保留新增数据并优先同版本前向修复。

17:49–17:50 CST生产只读复核仍451文件同源c04385e、三服务active/零重启、双心跳、038/合同1/2/2、health/ready200、匿名受保护401。非终态任务和提交错配0；既有页面、授权及四条历史媒体unknown保留。当时尚未归档/上传47或切生产；随后已冻结、归档并上传，最新结果见冻结后补记，正式后台仍未切换。

## 添加Agent时的授权流程

用户要求添加后直接展示相应授权，减少再进管理的步骤。现行候选可达入口“我→生态”点击添加直接调用共享授权确认，展示具体范围后主动确认；首次相册云端同意在同一框内，有效同意复用。确认后后端原子保存Agent、授权和线程；取消不写入，不先添加再弹第二次授权。二楼权限只列现有授权用于查看、修改、撤回，不是首次添加的必经步骤。该候选尚未进入正式46，不把真机旧版表现当候选接线缺失。

授权入口独立复核五组75项通过（范围确认、工作区、范围合同、会话同步、页面生命周期），覆盖取消、失败、同意复用/变化、晚到响应和账号切换。本次未为该反馈重复修改产品代码；固定iPhone17实际点击另验。

B02独立确认复核：workspace succeeded、revision18→19、profile完整相等、重放不增。合成owner清理后五类业务表均0；本次55582临时cluster核对唯一身份/PID/data目录后停止并精确删除，远端评测凭据移除。其他数据库/正式服务未动，完整回执、预览、账本和清理证据保留。

## 最终冻结与47上传（冻结后文档补记；上传时点状态，后续见文末）

最终freeze05包含1030源文件，manifest SHA256 `652ddd6f09228aa1a4efcf142678ed44bc6f5574a3ff95794531e6dce75c7dd8`。隔离发布树`codex/butler-unified-release-20261013-47`仅本地提交`653ad85a95e7cc9b3c0c4d05dc7e1f915300c687`，tree `0f5b29927a5f20f813a0ef898b81c406fae4900e`；Git blob/bytes/mode逐项匹配，工作树clean，未push。主树a4d90c3及已有修改、空暂存区保留。939最终整仓产品文件和266个B02产品源分别逐项一致，38SQL与正式相同；仅删除此前核准的4个重复语音组件/测试。954文本/76二进制扫描的26匹配逐项核对为不变baseline占位/夹具/变量，无未审阅匹配；扫描不代表绝对无secret。

最终runtime462文件为455源与7构建文件，准确记录commit/tree。制品`butler-unified-20261013-47.tar.gz` SHA256 `095c7b5b063731ca9494244360677a69cb19796e11681a28edc4979a75c0fded`，release-manifest SHA256 `9a179a32715b1e777f7d877bb0a652025ff45de077f449bb1da9e41a7291592c`。隔离Linux Node22.22.1/npm9.2.0全新backend/Agents npmci及官方audit0；backend91/91、registry12/12且0skip，sharp/vips、ffmpeg/ffprobe、fast-uri及6模块断网import通过。三Web沿用精确源码/锁对应的clean安装、audit与构建证据。462内容与manifest检查前后一致，无实际env、storage空，未连接DB或调用模型。freeze04仅中间制品，不能部署。

47全新arm64 Release归档与IPA导出均exit0，source前后匹配freeze05；版本1.0(47)、正式Bundle `com.wangruoshi.miaoxun`与HTTPS `https://8.153.167.11`。严格签名、App Store profile、get-task-allow=false、beta-reports-active=true；主App UUID `03C81167-723E-3798-AF41-01C96E2E2DCF`与dSYM匹配。Release JS SHA256 `070b34a7514ba465735145d824979a2878bea5e840fc1a134f7607ae35fd7814`，IPA 9,692,130 bytes/SHA256 `0d02395d0142720e44695a92175916750e124bc164d4f761d4d7e8fc423e5c6f`。React/ReactNativeDependencies/Hermes三项第三方dSYM警告仍在，影响对应崩溃符号化，不制造符号或据此大改依赖。

2026-10-13 18:07:42 CST上传exit0，日志明确Upload succeeded/Uploaded MiaoxunRN/EXPORT SUCCEEDED，`upload-status.json`记录uploaded=true，legalDeclarationChanged=false，productionSwitched=false。不再上传相同47。上传后的较早ASC快照来自过期网页会话/缓存，不能证明当时或当前可安装；重新登录后的首个fresh AX快照见当时47“缺少出口合规证明”、详情群组(0)/独立测试员(0)。当时合规表单已打开供账户负责人亲自处理，自动化未代填`ITSAppUsesNonExemptEncryption`或提交声明；该阻塞后来已由账户负责人处理，最新状态见文末20:06:02 CST复核。

生产保持c04385e/agent-preview-20261013-02/038/合同1/2/2及DeepSeek，尚未切本轮runtime或浮生配置。下一步完成出口合规、关联测试群组并只读确认47可安装，然后执行新鲜停写503、平滑排空（含awaiting_user与pending）和038备份实际隔离恢复，再配套切同源API/两个Worker及浮生配置；核对合同/心跳/匿名权限/manifest后开放。SQL队列全0不能替代普通chat在途排空，须确认API平滑退出无超时/强杀/剩余连接。版本变化后不把新任务交旧Agent执行，不用旧dump覆盖新增数据；优先同版本前向修复。之后原位更新固定iPhone17保留登录，并由用户验收真机语音/长按/授权和生产真实素材→多Agent→完整预览确认链。

受限证据：`release-readonly/source-freeze-05`、`release-readonly/final-release-05/RELEASE-READY.md`、`ios47-final-05`的archive/export/signature/upload证据与日志，及受限`asc47-encryption-form.png`。此小节及入口文档最新状态是冻结后只补主树的文档，不属于653ad85a/freeze05，不重写已冻结源或用旧manifest冒称补记同源。本次文档补记没有新增产品代码、Git推送或生产写入。

## 切换脚本只读预检与PATH诊断（冻结后历史记录）

19:03:31 CST，仓库外已审查脚本在服务器独立root0700的final01准备目录执行只读prepare。旧451文件、新462文件、最终tar与Linux证据已核对；随后文件环境与业务Node校验返回`ENV_FILE_RUNTIME_MISMATCH`。报告maintenance/linkChanged/startedNewServices/writesOpened均false，没有生产SQL、模型调用、停服、正式env或app链接变更；失败报告已下载受限保存，不覆盖原证据。

19:10 CST，精确只读诊断确认三unit仍active、零重启且Main/Node启动身份稳定。文件全部声明值与MainPID一致；业务Node非PATH声明全部一致。其PATH完整等于从真实backend cwd逐级至根目录的node_modules/.bin、有序node-gyp-bin目录和原MainPATH。服务器npm9.2.0的set-path.js SHA256为`bf86a1c1976d631c8012369e66362f12c03f0c0295c3ad572e79f43a1ff9f0f2`，说明此前失败是脚本未识别正常npm启动转换，不是正式配置漂移。已为这一转换实现精确匹配与npm来源校验，其他声明仍严格逐项对照；不简单排除PATH，不改生产配置或产品源码。

修正版66/66离线回归（环境/切换16、postdeploy27、实际进程环境VM23）、7项语法检查和schema自检通过；独立复核同样通过，结论`READY_FOR_READONLY_PREPARE`。修正接入旧环境、排空前、信号前、最终环境及postdeploy首末检查；同时复核Main/Node启动时间、读取前后MainPID/Invocation/重启状态，不接受身份漂移或npm实现改变。四脚本SHA分别为deploy `34f36be57095e416d35a7833130ef7ee72ac3e78db6bb6d692c25d8f1dbec85f`、policy `ec04c297c9cdebf5b0c0836dc9a08db870b0c6c46a9dbead45a3d4f9b9ef0e9d`、postdeploy `371dc0b0dd3d51367eec55c81ae9a3ff7f2ce1da92637f6e7de560b7a8465136`、backup `0ac12f0ebfe9df4610afcdd39a0d41fa8a9ee35b16d0b6a066f3979185aecee4`；原final01脚本和审查保留。

新服务器目录`/root/miaoxun-release-prep/butler-unified-20261013-47-cutover-final02`为root0700，脚本/审查root0600、传输SHA逐项一致，没有转运Key。19:23:44–19:23:45 CST实际只读prepare exit0/passed=true：旧451、新462、tar、Linux证据和全部38SQL匹配；三服务active、零重启，文件与Main/Node精确环境及启动身份通过；038无待迁移，全部非终态/提交错配0，四条历史媒体unknown/400分、页面与用户授权摘要保持。受限`prepare-passed-final02.json` SHA256 `195ee4e2dd7a6a861b329cb661d4b584484d1862169911a1f88954d47e6fe378`。19:24:31 CST公网health/ready200，数据库连接与迁移就绪；没有维护、停服、生产SQL、runtime/env切换或供应商调用。

在该只读预检时点，账户负责人尚未回复完成声明，47不能据此判定可安装，后台继续旧配套。随后ASC与现场切换状态有更新，见下节。该时点现场排空、新停写038真实恢复、runtime/浮生切换、双周期健康和设备链均未执行；只读通过不替代发布门禁。

本次新增受限证据位于`cutover-47/`：原失败/精确PATH诊断、最终offline-review/independent-cutover-review、传输摘要、prepare-passed-final02及public-readonly-final02。源码939产品文件仍与freeze05一致，主树仅既有4份冻结后Markdown补记不同、暂存区0；发布树保持clean且未push。冻结的脚本审查文件和预案保留执行前状态；本节prepare通过仅是只读预检，不表示已切换，现场后续状态见下节。

## ASC47可测试与final02恢复（2026-10-13，20:06 CST复核）

20:06:02 CST对App Store Connect作新鲜只读观察：1.0(47)显示“正在测试”，详情已关联两个既有测试群组，内部群组及外部群组（外部6名测试员）。账户负责人已处理出口合规并完成群组关联；未由本轮自动化代提交声明或改动群组。此前ASC缓存/过期会话所见缺出口合规、群组0是较早状态，以本次实际详情为准。此状态证明47现已提供测试入口，不证明后台已升级或设备链已验收。证据摘要`cutover-47-recovery01/asc47-installable-observation.json`；受限AX/截图不含于仓库。

final02于19:42:32 CST进入activate，在维护探针阶段因`HTTP_HTTPS_STATUS_NOT_CONFIRMED`失败并按fail-closed路径保持维护。恢复阶段首轮19:51:10 CST启动旧服务时遇Node进程枚举竞态；没有启动新runtime。02续接恢复于19:59:47 CST完成，原Nginx配置、旧服务和旧环境均恢复；随后两轮双周期心跳推进，公网HTTP与HTTPS的health/ready检查通过。整段失败与恢复材料均受限留存。未启用47 runtime或切换app link/env，没有生产SQL/迁移、数据库恢复或供应商调用；完成恢复不等于Build47配套成功。

针对Nginx reload后旧/新worker接管存在时序差异，recovery01只修正部署脚本`webCheck`探针：以15秒单调时限，每轮检查HTTP与TLS，两种协议必须连续两轮同时符合状态、响应内容及相应响应头；TLS校验和loopback resolve保留。离线用例79/79通过，含状态切换、瞬时传输失败、重置、内容/header错误及证据安全；独立复核通过。该修复只用于新鲜预检，不绕过其他发布门禁，也没有对生产发信号或调用供应商。

final03的新鲜prepare尚未通过：失败尝试留下的stage/backup制品触发目录门禁，须先对这些确切制品做受限精确归档，再用修订后的脚本和新鲜环境证据重新prepare。只读prepare之前不启动新runtime；prepare通过仍不等于部署。之后才按原授权执行新的停写排空、038备份/隔离恢复及同源API/双Worker/浮生配置切换门禁。当前生产维持旧的c04385e/agent-preview-20261013-02/038/合同1/2/2/DeepSeek；固定iPhone17尚未安装47，设备完整素材→多Agent→预览确认链、长按/语音与授权验收均未完成。

本节是对冻结后现场结果的追加记录；不改freeze05、final02/final03制品或原失败/恢复报告，不代表现场切换成功。后续最终prepare/切换及设备结果另行追加；本次仅修改本文档，无产品代码、其他文档、生产配置或Git提交变更。
