# 聊天与漫画续修配套发布

2026-11-11。用户在已说明“配套发布后端、漫画Release/Product及新客户端”后回复“可以”，本轮按该范围推进；包含生成可追溯制品所需的精确本地提交，不推送。模型付费验收、代用户授权、Apple出口合规声明不在本轮执行范围。保留所有既有工作树内容。

## 已核实基线

- 所有49项dirty文件与上阶段最终SHA清单逐项一致，未有未解释增量。源码/测试见[实现记录](2026-11-11-build61-chat-comic-followup.md)，本轮新增本发布记录并更新CURRENT/索引；在固定清单后本地提交，不使用reset/clean/checkout或临时覆盖。
- 正常SSH只读复核：生产`app`仍指向`agent-lifecycle-20261111-171a01d/runtime`，sourceHead`171a01d2ca8bd1d854a032b079bd7dd6dc82c375`、tree`ef2d743e9b2ec74351ef4d31331781ac8abb1178`，299项manifest及全部文件SHA匹配；58迁移与checksum全匹配。三服务active、同源、0重启，备份timer正常，Nginx原字节和共享路由完整，health/ready/Admin及静态资源检查通过。证据`/Users/gary/Library/Application Support/MiaoxunReleasePreparations/chat-comic-release-20261111/production-baseline.json`。
- 正常Chrome原生AX实读TestFlight：最高上传1.0(61)已完成，61“正在测试”且显示两个既有yunzhi组；下一候选62。浏览器扩展连接仍报timeoutMs错误，原生页面方式成功；未用受保护接口或会话提取绕过登录。未更改原Build61分组/通知。回执同目录`apple-build-observation.json`，准确读时未单独采集，observedAt=null、recordedAt仅补记时间。
- Podfile.lock与Pods/Manifest.lock一致，RN package/lock一致，Release显式正式HTTPS/API，磁盘工程仍1.0(58)，归档使用独立参数62而不改工程。`xcodebuild -showBuildSettings`和API校验通过；bundle check缺8个锁定gem、CLI仅Development身份均如实保留，不安装依赖、不把此状态称上传就绪。

## 发布合同

运行时真实代码增量只有`agents/comic-diary.agent.js`、`backend/src/agent-workspace-service.js`、`backend/src/ai-client-contract.js`、`backend/src/routes/agent-workspace-routes.js`；无新迁移、配置、依赖锁、shared/Admin/Avatar源变更。仍需从clean committed HEAD由正式打包器构建完整API/双Worker/Admin制品，不能复制dirty文件上服务器。

贡献合同2/3显式保持旧shape，4严格增加四类不可读原因；新RN只发4。因此后端先于新客户端分发。漫画0.1.5部署后，从正常后台“当前代码注册”创建新Release草稿、审核并发布，再为既有产品创建精确绑定新releaseId/0.1.5/原七scope的新版本，核对实际hash、目录诊断及公开目录。不得用0.1.4的“身份修订”跨版本代替新Release，不同号来源或业务hash不可复制。

runtime manifest SHA绑定真实JS来源；Release contractHash绑定key/version/permissions/identity，Product另绑定精确依赖，不能互相替代。最终业务hash以真实保存/审核/发布回执为准。旧0.1.4用户consent不会自动扩大为0.1.5；新版本发布后用户本人原位确认，保留原聊天，不要求解绑。

停写切换前重新核对任务排空，保存并验证独立恢复点；保持原env字节与共享Nginx边界，完整API/双Worker同源切换。无SQL增量不重放迁移、不合并配置。维护、校验、开放为独立可审计步骤。

## 回滚与当前门槛

尚未生成本轮正式制品、切换生产、发布0.1.5或归档/上传62。本轮整仓复核退出0：RN103套1328项、Backend1140通过/376环境门控跳过、Agents58、Admin52、Avatar29、检索Web4及类型/lint/格式/Web构建通过；数据库环境跳过不计作PG验收。上一阶段隔离PG14/14与模拟器保护限制按实现记录保留。后续结果逐阶段补记，不写预期成功。

新客户端分发前且未产生新版本业务/consent时才可评估回旧完整runtime；一旦合同4客户端已分发，直接退171a01d会使其贡献请求426。0.1.5发布/用户确认/任务写入后，旧runtime亦不兼容新版本授权；优先前向修复，不能用旧数据库恢复点覆盖开放后的新业务。新包真机、真实模型及用户scope分别验收；Simulator关闭的构建保护限制仍按实现记录保留。
