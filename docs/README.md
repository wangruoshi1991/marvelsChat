# 妙讯文档索引

现状只维护在[当前交接](handoffs/CURRENT.md)。开始工作先读仓库`AGENTS.md`、根`README.md`和该交接，再核对Git与运行环境。带日期的记录只证明当时发生的事，不代表现在已验收或新操作授权。移动端 API origin 必须由 iOS build setting 或 Android 构建参数显式提供；缺失/非法配置直接失败，具体示例见[移动端上线清单](mobile-launch-checklist.md)。

## 产品与实现

- **[项目地图](project-map.md)**：工程职责、页面模块与源码入口。
- **[设计状态清单](design-state-checklist.md)**：原型 33 个状态的逐条对照（状态名 / 现有实现文件 / 一致·不一致·缺失），后续按设计逐项验收的依据。
- [11月6日协作与原Agent会话贯通](reviews/2026-11-06-workspace-conversation-integration.md)：讯页协作预览/sync、聊天贡献时间线、精确成果续聊、派生正文保护和隔离验收。
- [11月6日UI偏好与检索入口续验](reviews/2026-11-06-ui-preference-retrieval-followup.md)：旧响应覆盖、reset/undo历史与顺序修复，隔离HTTP/PG证据及仍待设备的完整链路；[检索入口专录](reviews/2026-11-06-retrieval-entry-followup.md)。
- [11月6日模拟器布局与协作计数验收](reviews/2026-11-06-simulator-layout-acceptance.md)：实际三态/瀑布/图片头像/系统选择器证据，当前轮统计修复、整仓检查和仍待真机的手势边界。
- [架构与项目结构](architecture.md)、[开发规范](development-standards.md)：目录职责、服务边界与真实数据原则。
- [Agent工作空间](agent-workspace-architecture.md)：动态选人、授权、交接及尚未实现的能力。
- [11月5日晚卡片布局与滑动连续性](reviews/2026-11-05-miao-card-layout-continuity.md)、[二楼手势](reviews/2026-11-05-second-floor-gesture-continuity.md)、[头像上传验证](reviews/2026-11-05-avatar-upload-acceptance.md)、[Agent能力整理](reviews/2026-11-05-agent-capability-closure.md)、[聊天语音生命周期](reviews/2026-11-05-chat-speech-lifecycle.md)：本地修复、真实入口与未完成设备验收。
- [11月5日协作客户端验收](reviews/2026-11-05-collaboration-client-acceptance.md)：真实任务卡三态/专业聊天正文、菜单与无障碍修复、动态人数调度证据和待真机项。
- [统一AI交互](ai-interaction-system.md)：消息、持久任务、澄清、成果预览和确认合同。
- [Agent接入](agents.md)、[后台接入与上架](agent-onboarding.md)、[Agent SOP](agent-sop/README.md)、[模型配置代码入口](agent-model-configuration.md)：代码能力、身份修订、产品版本与共享供应商配置。
- [相册Agent](agents/album-assistant.md)、[媒体检索合同](media-retrieval-product-handoff.md)、[检索验证记录](agents/media-retrieval/release-evidence.md)：素材权限、索引、对话检索及验收边界。
- [文件上传与专业摘要](file-processing.md)：UTF-8文本格式、上传幂等、完整正文、文件引用及撤权边界。
- [社交关系](social-graph.md)、[小站能力与缺口](station-feature-closure.md)：真实接口及尚未完成的功能。
- [设计资产映射](app-design-assets.md)：资产来源与缺口；有日期的映射不代表当前全App已还原设计。

## 开发与运维

- [固定iPhone17联调](local-development-preview.md)、[React Native说明](../MiaoxunRN/README.md)、[iOS配置](ios.md)：唯一日常App、构建和设备验收边界。
- [部署说明](deployment.md)、[生产运维入口](production-operations.md)：服务配置、制品与操作步骤；先核对当前交接，旧发布段落按日期解释。
- [UI-Agent 配套发布方案](reviews/2026-11-05-ui-agent-release-plan.md)、[发布前证据](reviews/2026-11-05-release-preflight-evidence.md)、[11月5日后端生产切换](reviews/2026-11-05-ui-agent-production-deployment.md)、[正式上架与Build59](reviews/2026-11-05-ui-agent-published-build59.md)：055/056、恢复与API/双Worker、真实release/product和本地客户端归档证据；独立用户授权、模型和设备验收仍待续。
- [11月5日模拟器阶段验收](reviews/2026-11-05-simulator-acceptance.md)：固定日常 App 签名恢复、媒体选择器真实错误提示、手势回归测试与尚待真机/模型验收边界；后续修复不在 Build59 内。
- [11月5日真实协作验收](reviews/2026-11-05-real-collaboration-eval.md)：单次真实模型三路并行、单份成果持久化、未知结果中断、供应商用量与收尾证据；整体闭环未通过，未重试。
- [11月5日协作跟进](reviews/2026-11-05-collaboration-followup.md)：验收等待窗口差异、妙页S2真实正文修复、整仓与模拟器编译，第二个隔离样例，以及按最新开发要求关闭token/费用限制后的真实应用/API闭环通过。
- [数据库与迁移](database.md)、[备份恢复](database-backup.md)、[恢复负责人手册](database-recovery-owner-guide.md)。
- [管理后台](admin.md)、[移动端上线清单](mobile-launch-checklist.md)。

- [11月10日漫画图片生成本地实现](reviews/2026-11-10-comic-image-generation.md)：独立媒体Provider、058队列/逐格私有产物、RN任务体验和43项隔离PG验收。
- [11月10日漫画真实生图接入](reviews/2026-11-10-cicadas-comic-live.md)：Cicadas固定型号、文字/参考图真实成图、正式Provider验证与App联合验收边界。
- [11月10日漫画配套发布](reviews/2026-11-10-comic-production-release.md)：真实队列/私有OSS隔离验收、生产备份迁移与Build60发布进度，后台上架按用户指示后续处理。

## 历史证据

- [文件与专业任务发布准备记录](reviews/2026-10-21-contract6-release-preparation.md)、[模型真人复核材料](reviews/2026-10-21-contract6-human-review.md)：评估、恢复演练、构建证据及人工复核材料。
- [Build48前后阶段实施、恢复与验证](handoffs/2026-10-14-build48-history.md)：由旧CURRENT迁出，含10月15–19日整理证据；其中“下一步”均为当时安排。
- [Build47上传与模型验证](reviews/2026-10-13-butler-live-release.md)、[038配套与Build46](reviews/2026-10-13-testflight-46.md)、[Build45](reviews/2026-10-10-testflight-45.md)：历史制品与发布记录，不代表当前分发状态。
- [旧测试账号清理](reviews/2026-10-12-test-account-cleanup.md)、[旧冗余清理](reviews/2026-10-10-redundancy-cleanup.md)：仅覆盖各次明确范围，不代表全项目已清理。
- `reviews/`、`handoffs/`、`superpowers/`：保留已有审查、历史交接和实施计划，具体结论须结合日期与当前代码。
- [早期产品需求](../开发需求.md)：愿景材料，不是现行技术栈或完成状态。

迁移SQL、构建依赖、App内嵌查看器、签名制品及恢复资料不能仅因文件多或看似重复而删除。已不再使用的缓存、进程、代码路径应先核对引用和来源，再按明确范围清理。
