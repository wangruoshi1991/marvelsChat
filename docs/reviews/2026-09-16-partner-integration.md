# 伙伴代码、模型与新版设计范围核对

核对日期：2026-09-16。基线：本地 `codex/offsite-database-backups`，HEAD `e70270f`，包含已有未提交修改。伙伴分支采用本地已获取的远端引用；本轮未 fetch，不声明这是远端最新提交。保留所有协作修改，不覆盖伙伴分支。

## 1. 对话模型与配置归属

只读核对当前服务器运行进程，妙讯管家的模型为 `deepseek-v4-flash`，endpoint 为 `https://api.deepseek.com/chat/completions`，Key 已配置。iPhone 17 模拟器已安装包连接 `https://8.153.167.11`，因此使用服务器模型。数据库最近七天有 6 条管家成功调用；通用 `provider=new-api` 标签不能证明历史每次调用的具体模型，也不表示一定经过 New API 网关。

没有找到 DeepSeek 切换的仓库变更或操作者审计，无法判断是否由伙伴设置。配置存在和文件所有者不能证明谁操作过。本轮没有修改生产配置、重启生产服务或调用模型。

本地 `backend/.env` 的旧 GLM endpoint、模型名和 Key 已清理：endpoint/模型名按当前线上更新，Key 留空；同时更新两个环境模板与 README。未复制生产密钥。连接正式 API 的 App 不受本地 Key 留空影响；独立开发后端需要单独配置开发 Key。除三项模型配置外，本地 `.env` 其他内容保持原样。

本地开发后端已重启以加载清理后的配置；存活检查通过，数据库连接成功，但 `/api/ready` 报告迁移未齐，未擅自执行数据库迁移。当前 App 仍使用正式 API，不使用此本地后端。模型配置解析确认只缺开发 `NEW_API_KEY`，相关后端配置/运行时 10 项测试通过。

管家运行链为 RN 消息 API → 后端鉴权/Agent 授权 → `agents/miaoxun-butler.agent.js` 组装上下文 → `backend/src/agent-runtime.js` → 配置的模型 → 消息与调用记录。当前没有模型工具调用循环、子 Agent 执行器或图片/3D 内容解析。客户端 `features/butler/appActions.ts` 的关键词导航不属于模型工具调度。长按草稿含正文和内容引用，不能声称模型已看见原始私有媒体。

## 2. 分支、源码与运行边界

Git 分支是一条开发版本线，不是 App 可以请求的运行服务，也不是天然独立的插件/SDK。伙伴提交进入集成版本后，运行的是该版本中的源码与构建产物；后续伙伴分支变化不会自动影响已部署版本。

这两个分支本来就把运行代码放在同仓的 `backend/`、数据库迁移、Web 工程与公共合同中。未发现要求另建独立服务/SDK或禁止集成源码的约定。按 Git 提交引入、保留作者与来源、核对契约后复用后端，符合当前交付结构。不能维护两份会独立漂移的生成/检索核心，也不能用每次覆盖目录代替有记录的集成。

后续协作应冻结源提交，记录来源与集成提交对应关系、迁移调整、公开合同变化和验证证据；伙伴新增内容通过审查提交/PR集成。同一公开 API 供 RN、Web 和未来管家工具调用，领域算法、权限、成本与任务状态由后端维护。

## 3. 3D 来源与使用矩阵

来源引用：`origin/feat/avatar-3d-web-v1@5040e1283f1ccf987c79d717ac66d4484dd99707`。集成提交 `ae387bc` 保留原作者 Jiacheng Zhang 和 AuthorDate；后续 `7f006c4` 接入 RN，`2814684` 增加移动模型优化，`a2aab02` 清理旧路径，`8cf1b88` 拆分任务与仓储。

核验命令 `git diff 5040e12 ae387bc -- backend/src/avatar-3d* avatar-web` 为空；引入时 3D 核心和 Web 工程与伙伴版本一致。当前 Wan 多视图、Tripo、照片质量检查、Provider registry 四个核心文件与来源引用仍一致。源分支 tip 不是当前 HEAD 的祖先，不能称为整个分支原样 merge；可证实的是按提交引入并适配。

| 伙伴交付流程 | 当前使用与适配 | 代码入口 |
| --- | --- | --- |
| 正面照片、授权、体型/服装/描述 | RN 原生界面；后端共用 `face_first_multiview` 契约 | `MiaoxunRN/src/features/station/useAvatar3dWorkflow.ts`、`backend/src/schemas.js` |
| 照片校验、Wan 四视图 | 复用伙伴 Provider 与质量检查 | `backend/src/avatar-3d-photo-quality.js`、`avatar-3d-wan-multiview.js` |
| 四视图人工确认/拒绝 | RN 确认，后端事务控制状态；不跳过确认直接建模 | `avatar-3d-reference-repository.js` |
| Tripo 建模与任务恢复 | 复用伙伴适配器、轮询与持久化生命周期 | `avatar-3d-tripo.js`、`avatar-3d-job-processing-service.js` |
| 费用确认、限额、幂等 | 保留成本预估/版本、日额度、单一活动任务；不等于用户支付结算系统 | `avatar-3d-lifecycle-service.js`、`avatar-3d-feature.js` |
| 模型列表、取消、删除与私有存储 | 原流程复用，删除扩展到移动 GLB/缩略图；保留账号清理 | `avatar-3d-lifecycle-service.js`、`account-repository.js` |
| Three.js 查看器 | 复用 `createModelScene`；增加 App 入口并构建内嵌 HTML；App 读取移动派生 GLB，原模型保留 | `avatar-web/src/app-viewer/main.ts`、`src/viewer/modelScene.ts` |

App 没有嵌入整个 Web 工作台；Web 使用 Cookie/CSRF，RN 使用 Bearer 与 `/api/avatar-3d/app`，二者共用领域服务。旧 Wanx 卡通预览、直接多图路径已清理；伙伴 tip 的 schema 和最新 Web UI 本身也已只接受 `face_first_multiview`，这些旧路径不是漏接当前正式流程。

结论：已接通伙伴当前主要生成流程，核心没有重写；不等于整个分支每行代码原样使用，也不证明所有真机、供应商效果和上线运营场景已验收。3D runner 仍在 API 进程内，未变成独立微服务。完整 3D 后台任务/成本/失败治理界面仍需补齐。

## 4. 媒体检索：伙伴已有定义

来源引用：`origin/feat/media-retrieval-product-integration@1365e69`，产品合同冻结提交 `9b89699`。当前历史通过 `1b25713`、`f6b03cb`、`35d0268` 等移植，汇入 `2446809`。原持久化提交 `99b2b8d` 与 `1b25713` 补丁等价；`b2ad0c5` 与 `f6b03cb` 核心服务一致，worker 有集成适配。迁移由原 025–027 调整为 027–029，以避免覆盖主线已执行迁移。

伙伴明确交付 [RN handoff](../media-retrieval-product-handoff.md)、[manifest](../../agents/media-retrieval/manifest.json)、`shared/media-retrieval-*` 公共合同及测试 fixture。当前主线的 manifest、公开合同、用户/后台检索路由与来源引用一致；正式 RN 页面不在伙伴交付范围。

| 已定义的业务 | App 应遵守的契约 |
| --- | --- |
| 素材范围 | 仅搜索当前用户已上传到妙讯的私有图片/视频；不扫描手机相册，不搜索他人资源，不生成媒体 |
| 同意与启用 | 明确说明用途，用户确认后 `POST /enable`，同意版本 `media-retrieval-consent-v1`，幂等键绑定一次操作 |
| 索引进度 | `GET /status` 与 `/api/agent-runs/:runId/events` 按 sequence 续拉、按事件 ID 去重；202 是受理，不是完成 |
| 自然语言搜索 | `POST /search`，query 1–240 字，可按类型/相册过滤，最多 20 项；空结果正常展示 |
| 结果打开 | 以 `mediaAssetId` 请求现有鉴权文件接口；图片预览，视频定位 `matchedFrameTimestampMs`；不拼 OSS 地址 |
| 重建/撤回 | `POST /reindex`、`DELETE /index` 使用幂等键；撤回期间禁用搜索，服务端物理清除完成后才显示完成 |
| 运营与发布 | 用户限额、月预算、全局预算、Provider/queue/operator 开关、生命周期、worker心跳及 App 发布开关共同决定可用性 |

现有正式 RN 不调用上述检索 API；相册建议仍是文件名、说明、标签的规则分组。上传完成后有尝试自动索引的后端接点，但受用户同意和运行开关约束。伙伴开发 Web 是验证工具；来源分支后两次提交增加的 `/media-retrieval` 托管入口未移植，不影响 RN 直接按既有 API 对接。

2026-09-16 生产只读状态：环境层总开关和 Provider 开关为 true；数据库 operator 为 true，Provider/queue 为 false，生命周期 `sandbox`。worker 心跳正常，ready segment 为 0；1 个启用索引 profile，保留 2 条失败的 `media-index` 记录，没有 `media-search` 记录。这证明运行基础存在，但业务尚未开放且没有可用索引；不能只看环境变量或 worker active 就宣布检索可用。此次未诊断历史索引失败原因。

伙伴 manifest 定义 `workspace`、`admin` 入口，没有妙讯管家聊天工具协议。`synchronous-tool` 分类也不等于已有 function calling 实现。

推荐实施顺序（集成方建议）：在现有相册/素材场景加入“找素材”工作区，不增加无设计依据的顶层 Tab；一次实现同意→索引进度→搜索→预览/视频定位→重建/撤回，并复用现有后台控制。真实服务、质量/延迟/成本通过验收后再开放发布状态。之后可先让管家显式打开同一工作区；若要自动工具调用和会话结果卡片，另定义受控工具输入、授权、审计与展示契约，复用原领域服务。

## 5. 新版设计纠正与剩余工作

已查看蓝湖项目 `906737d2-3f7b-4cbc-98ca-c725c4cca7f6`：第一面图 `064bd189-53ad-4627-a8e9-05e953e3e2b3`，聊天图 `ba1911df-7692-4bcf-92f5-5c117c46d4e3`。页面显示设计稿 2.0 分组下的 3.0 小站画面，不能仅凭分组名恢复旧布局。

| 设计内容 | 当前差异/下一步 |
| --- | --- |
| 管家聊天人物头像 | 已恢复现有 `messages/avatar-butler.png`；小站机器人资源保留待按入口核对 |
| 第一面音乐 | 旧默认模块已移除；不属于本次新版实施范围 |
| 粉丝、合作伙伴、综合评分 | 当前仍是旧统计，未验收；粉丝可复用关注关系聚合，合作伙伴不能拿 Agent 数或关注数替代；评分不能拿获赞数替代 |
| 职业身份、简介、经验/语言标签 | `bio` 编辑已接入；职业标题与经验/语言标签没有完整结构化编辑/展示契约，不用社区/妙点硬套设计标签 |
| 形象档案：3D、日常自拍、视频形象 | 3D 已有真实资产；其余需要选择已有素材、封面/排序/可见性、预览与后台治理闭环，不能复制设计样图作用户内容 |
| 生活、成果、生态、其他 | 逐页记录文字/字号/间距/状态/操作对应，保留发布上传、图片加载与后台内容治理待办 |

用户后续已确认：合作伙伴和综合评分按完成的合作及评价计算。[合作生命周期契约](2026-09-16-cooperation-lifecycle.md)定义双方确认、五分制、去重伙伴数、无评价 null、后台审核和申诉；尚未实现/落库，不构成交易或支付系统。职业身份、主动展示城市、经验年限、语言则已完成单独的[资料闭环](2026-09-16-profile-identity.md)，依赖迁移 031 与新后端，尚未生产发布。

继续实施以一个页面/完整业务流程为单位，同时核对数据源、用户输入、权限、空/加载/失败状态和后台操作。UI通过需要设计画面与模拟器/真机证据；构建和测试通过不能代替设计还原。上线、生产迁移及付费检索启用仍需在具体可审查版本和预算条件下执行。

## 6. 本轮验证与边界

聊天头像与音乐纠正通过 RN typecheck、ESLint、4 suites / 20 tests、iOS Debug build。新包安装到 iPhone 17 模拟器，实际观察聊天列表人物头像、第一面滚动到底部无音乐板块。未发送聊天、索引、生成或其他测试业务写入，未上传 TestFlight。

第一面统计/整体布局仍不符合设计；Debug 出现通用 warning 条，尚未据此定位原因。以上是局部修正证据，不能扩展为完整上线结论。
