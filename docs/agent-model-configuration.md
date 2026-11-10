# Agent 模型配置代码入口

后台 [Agent 接入与上架](agent-onboarding.md) 的 key 是代码标识，供应商 API Key 继续由服务端受限环境配置。后台只读缺项和脱敏状态；改名、上传头像、创建产品不会生成执行器或自动测试供应商。

`backend/src/agent-model-config.js` 集中管理文本模型环境读取、chat/planning 选择与 Agent 执行模式映射。`config.js`、Agent runtime 和媒体检索原文解析均消费此入口；配置缺失仍明确报错，调用失败不改模型、协议或供应商。这里不是后台或 App 页面，也不改变 Agent 授权与执行能力。

所有文本角色共享 `NEW_API_BASE_URL` 和 `NEW_API_KEY`。`NEW_API_MODEL` 用于显式`chat`与媒体检索原文解析；`NEW_API_PLANNING_MODEL` 用于`plan/dispatch/coordinate/contribute`，缺省或空值明确继承 `NEW_API_MODEL`。角色只按执行模式选择，不再按有无chat方法猜测plan用途；普通会话不回落生成方法。普通聊天使用`NEW_API_TIMEOUT_MS`；持久工作区的coordinate/contribute使用独立`NEW_API_WORKSPACE_TIMEOUT_MS`，默认180000毫秒，且仍受20分钟工作区总期限约束。超时记录未知结果，不自动重放。视觉/图文向量继续使用独立MEDIA_RETRIEVAL配置，3D继续使用独立供应商。

文件导出的浮生推荐profile只有非密钥配置：`https://fushengyunsuan.cn/v1`、chat/planning均为`gpt-6.1-sol`，以及所需环境变量名。三份环境样例也列出该地址和普通模型，planning留空明确继承同一模型。profile与样例不会自动覆盖实际环境；Key只放受限运行配置，不进入代码。当前正式环境的实际配置与验证边界统一见[CURRENT](handoffs/CURRENT.md)，不再在多份文档重复维护部署状态。

用户指定vip；正式Agent不引入评测批次的调用次数或费用限制。独立评测保留有限案例和超时；按2026-11-05最新开发要求，token/费用上限暂不启用，只在仓库外验收配置 `budget.maxOutputTokens` / `budget.maxCostFen` 留可选入口（显式null关闭）。这是验收工具设置，不是Admin可编辑预算页。未知回执不重放，不虚构费用或上游身份。此前真实调用与部署证据保留在[Build48历史](handoffs/2026-10-14-build48-history.md)，不代表任意需求、延迟或当前版本已经验收。旧cicadas项目凭据和临时材料已清理，用户Codex或CC Switch连接不属于项目配置。

当前仍为同一 API 与 Worker 加载独立 Agent 模块。本文件可作为将来拆分部署时复用的配置入口；独立进程、鉴权、队列与部署隔离尚未因此实现。


## 独立漫画图片 Provider

图片配置只在 API 与 AI Task Worker 服务端环境中设置：`MEDIA_GENERATION_ENABLED`、`MEDIA_GENERATION_PROVIDER`、`MEDIA_GENERATION_API_BASE_URL`、`MEDIA_GENERATION_API_KEY`、`MEDIA_GENERATION_IMAGE_MODEL`、`MEDIA_GENERATION_TIMEOUT_MS`。样例保持关闭/空值，不复用文本、3D、检索或OSS凭据；客户端/Agent定义/管理后台不保存或显示Key。不设置token或费用上限，Provider未报告的用量和价格保持未知。

已核验并注册 `cicadas-openai-images`：固定基址 `https://api.cicadas.top/v1`、型号 `gpt-image-2`、尺寸 `1024x1024`。无参考图调用 `/images/generations` JSON；显式选图调用 `/images/edits` multipart `image[]`。两者使用 Bearer 认证，要求单张 `b64_json` 返回，直接解码图片，不接受结果URL或跨域下载。2026-11-10真实调用均成功，证据见[真实生图验收](reviews/2026-11-10-cicadas-comic-live.md)。模型目录里的其他别名尚未验证，不能仅凭目录名称启用。

供应商没有经核实的幂等重放/远程取消合同；任务ID仅用于本地去重，超时、5xx或不完整响应标为结果未知，不自动重试。单张原图上限16MiB、JSON响应上限24MiB；真实 token 用量可记录，未报告价格保持未知。固定host、base、model与图片协议均为执行门槛，不能用环境变量任意替换成其他接口。

本机单次真实验收使用受限 `0600` secret 文件，路径不进入源码。运行入口（从仓库根目录，示意路径需替换）：

```sh
node -- backend/scripts/comic-image-live-smoke.js \
  --env-file /absolute/private/media-generation.env \
  --output-dir /absolute/new-output-directory
```

必须保留 `node --`，避免 Node 原生 `--env-file` 解析抢先加载。脚本只读取指定文件的独立媒体配置，不继承其他凭据；输出目录必须不存在，生成 `receipt.jsonl` 与 `frame-1.webp`。正式 API/AI Worker 仍须各自在受限运行环境显式加载相同 `MEDIA_GENERATION_*`；此次本地secret与验证脚本不会配置生产服务。客户端、Agent发布、数据库、OSS和Worker仍有各自就绪及授权条件。

058迁移提供逐格输出与独立的Worker能力心跳；仅近期ready且注册实际可用执行器的Worker构成就绪证据。功能关闭或未核实Provider时，API返回明确不可用且不排队，Worker不claim漫画任务。`comic_render_cleanup_journal`在账号删除后保留对象清理意图；同一OSS bucket的AI Worker维护流程仅删除无有效资产/无活租约的孤儿，删除失败保留记录重试。
