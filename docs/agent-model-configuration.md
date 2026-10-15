# Agent 模型配置代码入口

`backend/src/agent-model-config.js` 集中管理文本模型环境读取、chat/planning 选择与 Agent 执行模式映射。`config.js`、Agent runtime 和媒体检索原文解析均消费此入口；配置缺失仍明确报错，调用失败不改模型、协议或供应商。这里不是后台或 App 页面，也不改变 Agent 授权与执行能力。

所有文本角色共享 `NEW_API_BASE_URL` 和 `NEW_API_KEY`。`NEW_API_MODEL` 用于显式`chat`与媒体检索原文解析；`NEW_API_PLANNING_MODEL` 用于`plan/dispatch/coordinate/contribute`，缺省或空值明确继承 `NEW_API_MODEL`。角色只按执行模式选择，不再按有无chat方法猜测plan用途；普通会话不回落生成方法。普通聊天使用`NEW_API_TIMEOUT_MS`；持久工作区的coordinate/contribute使用独立`NEW_API_WORKSPACE_TIMEOUT_MS`，默认180000毫秒，且仍受20分钟工作区总期限约束。超时记录未知结果，不自动重放。视觉/图文向量继续使用独立MEDIA_RETRIEVAL配置，3D继续使用独立供应商。

文件导出的浮生推荐profile只有非密钥配置：`https://fushengyunsuan.cn/v1`、chat/planning均为`gpt-6.1-sol`，以及所需环境变量名。三份环境样例也列出该地址和普通模型，planning留空明确继承同一模型。profile与样例不会自动覆盖实际环境；Key只放受限运行配置，不进入代码。当前正式环境的实际配置与验证边界统一见[CURRENT](handoffs/CURRENT.md)，不再在多份文档重复维护部署状态。

用户指定vip；正式Agent不引入评测批次的调用次数或费用限制。独立评测保留有限案例、输出和超时，未知回执不重放，不虚构费用或上游身份。此前真实调用与部署证据保留在[Build48历史](handoffs/2026-10-14-build48-history.md)，不代表任意需求、延迟或当前版本已经验收。旧cicadas项目凭据和临时材料已清理，用户Codex或CC Switch连接不属于项目配置。

当前仍为同一 API 与 Worker 加载独立 Agent 模块。本文件可作为将来拆分部署时复用的配置入口；独立进程、鉴权、队列与部署隔离尚未因此实现。
