# 妙讯文档索引

`README.md` 是仓库入口；本页说明各文档的用途。现行行为以代码、数据库迁移、运行配置和最近
一次验证为准。带日期的交接、审查和发布记录是当时证据，不是当前操作指令。

新对话先读 [当前交接入口](handoffs/CURRENT.md) 和仓库根目录的 `AGENTS.md`，再核对 Git 与运行环境。

## 当前工程

- [架构说明](architecture.md)：运行单元、调用链与数据边界。
- [项目结构说明](project-structure.md)：目录与关键文件职责。
- [开发规范](development-standards.md)：真实数据、错误状态和变更要求。
- [React Native 工程说明](../MiaoxunRN/README.md)、[iOS 配置与历史](ios.md)：客户端构建和原生边界。
- [Agent 接入](agents.md)、[Agent SOP](agent-sop/README.md)：注册、授权与能力交付。
- [社交关系](social-graph.md)、[小站能力](station-feature-closure.md)：业务状态与未闭环能力。
- [媒体检索产品合同](media-retrieval-product-handoff.md)：后端、RN 和运营控制的接口边界。

## 发布与运维

- [移动端上线清单](mobile-launch-checklist.md)：功能分级与发布门槛。
- [部署说明](deployment.md)：部署顺序、运行目录和按日期记录的发布证据。
- [生产运维入口](production-operations.md)：负责人入口与凭据位置，不记录凭据值。
- [数据库说明](database.md)、[迁移指南](database-migration.md)、[备份与恢复](database-backup.md)：数据库运行与回滚边界。
- [数据库恢复负责人手册](database-recovery-owner-guide.md)：隔离恢复和保管流程。
- [管理后台](admin.md)：内部账号、权限和管理 API。

## 历史材料

- [早期产品需求草稿](../开发需求.md)：保留产品愿景，不作为现行技术栈或功能完成状态的依据。
- `handoffs/`：跨对话和跨人员交接，按文件日期解释当时状态。
- `reviews/`：一次性审查、发布证据和未闭环问题；后续修复不重写历史结论。
- `superpowers/`：已执行或待执行的设计与计划，不作为当前上线状态证明。
- `agents/media-retrieval/`：媒体检索专项评估和安全证据。

早期 Demo 迁移计划已不再描述正式 App，其历史内容仍可从 Git 追溯；正式移动端只有
`MiaoxunRN/`。迁移 SQL、App 内嵌查看器和 iOS 资源中看似重复的文件可能参与校验或构建，
清理前须核对其运行入口与发布合同。
