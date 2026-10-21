# 妙讯文档索引

现状只维护在[当前交接](handoffs/CURRENT.md)。开始工作先读仓库`AGENTS.md`、根`README.md`和该交接，再核对Git与运行环境。带日期的记录只证明当时发生的事，不代表现在已验收或新操作授权。

## 产品与实现

- **[项目地图](project-map.md)**：工程职责、页面模块与源码入口。
- **[设计状态清单](design-state-checklist.md)**：原型 33 个状态的逐条对照（状态名 / 现有实现文件 / 一致·不一致·缺失），后续按设计逐项验收的依据。
- [架构与项目结构](architecture.md)、[开发规范](development-standards.md)：目录职责、服务边界与真实数据原则。
- [Agent工作空间](agent-workspace-architecture.md)：动态选人、授权、交接及尚未实现的能力。
- [统一AI交互](ai-interaction-system.md)：消息、持久任务、澄清、成果预览和确认合同。
- [Agent接入](agents.md)、[Agent SOP](agent-sop/README.md)、[模型配置代码入口](agent-model-configuration.md)：能力声明、执行器与共享供应商配置。
- [相册Agent](agents/album-assistant.md)、[媒体检索合同](media-retrieval-product-handoff.md)、[检索验证记录](agents/media-retrieval/release-evidence.md)：素材权限、索引、对话检索及验收边界。
- [文件上传与专业摘要](file-processing.md)：UTF-8文本格式、上传幂等、完整正文、文件引用及撤权边界。
- [社交关系](social-graph.md)、[小站能力与缺口](station-feature-closure.md)：真实接口及尚未完成的功能。
- [设计资产映射](app-design-assets.md)：资产来源与缺口；有日期的映射不代表当前全App已还原设计。

## 开发与运维

- [固定iPhone17联调](local-development-preview.md)、[React Native说明](../MiaoxunRN/README.md)、[iOS配置](ios.md)：唯一日常App、构建和设备验收边界。
- [部署说明](deployment.md)、[生产运维入口](production-operations.md)：服务配置、制品与操作步骤；先核对当前交接，旧发布段落按日期解释。
- [数据库与迁移](database.md)、[备份恢复](database-backup.md)、[恢复负责人手册](database-recovery-owner-guide.md)。
- [管理后台](admin.md)、[移动端上线清单](mobile-launch-checklist.md)。

## 历史证据

- [文件与专业任务发布准备记录](reviews/2026-10-21-contract6-release-preparation.md)、[模型真人复核材料](reviews/2026-10-21-contract6-human-review.md)：评估、恢复演练、构建证据及人工复核材料。
- [Build48前后阶段实施、恢复与验证](handoffs/2026-10-14-build48-history.md)：由旧CURRENT迁出，含10月15–19日整理证据；其中“下一步”均为当时安排。
- [Build47上传与模型验证](reviews/2026-10-13-butler-live-release.md)、[038配套与Build46](reviews/2026-10-13-testflight-46.md)、[Build45](reviews/2026-10-10-testflight-45.md)：历史制品与发布记录，不代表当前分发状态。
- [旧测试账号清理](reviews/2026-10-12-test-account-cleanup.md)、[旧冗余清理](reviews/2026-10-10-redundancy-cleanup.md)：仅覆盖各次明确范围，不代表全项目已清理。
- `reviews/`、`handoffs/`、`superpowers/`：保留已有审查、历史交接和实施计划，具体结论须结合日期与当前代码。
- [早期产品需求](../开发需求.md)：愿景材料，不是现行技术栈或完成状态。

迁移SQL、构建依赖、App内嵌查看器、签名制品及恢复资料不能仅因文件多或看似重复而删除。已不再使用的缓存、进程、代码路径应先核对引用和来源，再按明确范围清理。
