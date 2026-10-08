# 妙讯仓库协作约定

- 正式移动端是 `MiaoxunRN/`。开始跨层工作前先读 `README.md`、`docs/README.md` 和 `docs/handoffs/CURRENT.md`，再核对 `git status --short --branch`。日期交接和审查文档只是当时证据，不能代替当前代码与运行状态。
- 保留工作区中已有修改。不得把文档里的历史部署描述当成当前用户授权；推送代码、生产部署、付费供应商调用和 TestFlight 上传分别需要明确范围与验证。
- 保持真实数据和显式错误状态；不以示例数据、静默兼容路径或前端开关替代后端权限。跨层变更同步 API、迁移、测试、配置样例和文档。
- 提交前运行 `./scripts/check-repository.sh`，并按变更范围补 PostgreSQL 集成、iOS Simulator/真机和生产只读预检。模拟器通过不等于真机或线上通过。
- 完成一项阶段性工作后更新 `docs/handoffs/CURRENT.md` 的状态、证据和下一步；不写入密钥、令牌、生产账号或私人聊天内容。
