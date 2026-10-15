# 妙讯文档索引

现状只维护在[当前交接](handoffs/CURRENT.md)。开始工作先读仓库`AGENTS.md`、根`README.md`和该交接，再核对Git与运行环境。带日期的记录只证明当时发生的事，不代表现在已验收或新操作授权。

## 产品与实现

当前为Build48配套、039和合同1/2/3；2026-10-15只读运行核验正常，整体产品仍有协作续作、成果展示和设计一致性缺口。详细结论、清理结果及后续完成标准见[当前交接](handoffs/CURRENT.md)。

- **[项目地图](project-map.md)**：页面/模块清单、Agent功能现状、设计对照、清理候选及改动范围估计。完整了解项目从这里开始。
- [架构与项目结构](architecture.md)、[开发规范](development-standards.md)：目录职责、服务边界与真实数据原则。
- [Agent工作空间](agent-workspace-architecture.md)：动态选人、授权、交接及尚未实现的能力。
- [统一AI交互](ai-interaction-system.md)：消息、持久任务、澄清、成果预览和确认合同。
- [Agent接入](agents.md)、[Agent SOP](agent-sop/README.md)、[模型配置代码入口](agent-model-configuration.md)：能力声明、执行器与共享供应商配置。
- [相册Agent](agents/album-assistant.md)、[媒体检索合同](media-retrieval-product-handoff.md)、[检索验证记录](agents/media-retrieval/release-evidence.md)：素材权限、索引、对话检索及验收边界。
- [社交关系](social-graph.md)、[小站能力与缺口](station-feature-closure.md)：真实接口及尚未完成的功能。
- [设计资产映射](app-design-assets.md)：资产来源与缺口；有日期的映射不代表当前全App已还原设计。

## 开发与运维

- [固定iPhone17联调](local-development-preview.md)、[React Native说明](../MiaoxunRN/README.md)、[iOS配置](ios.md)：唯一日常App、构建和设备验收边界。
- [部署说明](deployment.md)、[生产运维入口](production-operations.md)：当前运行入口、制品与服务操作；先核对当前交接，旧发布段落按日期解释。
- [数据库与迁移](database.md)、[备份恢复](database-backup.md)、[恢复负责人手册](database-recovery-owner-guide.md)。
- [管理后台](admin.md)、[移动端上线清单](mobile-launch-checklist.md)。

## 历史证据

- [Build48及此前实施、恢复与验证](handoffs/2026-10-14-build48-history.md)：由旧CURRENT迁出，保留证据；其中“下一步”均为当时安排。
- [Build47上传与模型验证](reviews/2026-10-13-butler-live-release.md)、[038配套与Build46](reviews/2026-10-13-testflight-46.md)、[Build45](reviews/2026-10-10-testflight-45.md)：历史制品与发布记录，不代表当前分发状态。
- [旧测试账号清理](reviews/2026-10-12-test-account-cleanup.md)、[旧冗余清理](reviews/2026-10-10-redundancy-cleanup.md)：仅覆盖各次明确范围，不代表全项目已清理。
- `reviews/`、`handoffs/`、`superpowers/`：保留已有审查、历史交接和实施计划，具体结论须结合日期与当前代码。
- [早期产品需求](../开发需求.md)：愿景材料，不是现行技术栈或完成状态。

迁移SQL、构建依赖、App内嵌查看器、签名制品及恢复资料不能仅因文件多或看似重复而删除。已不再使用的缓存、进程、代码路径应先核对引用和来源，再按明确范围清理。
