# 妙讯漫画成图架构设计

状态：用户已回复“通过”。本地实现与隔离测试进度见 `docs/handoffs/CURRENT.md`；本文描述设计依据，不代表真实图片 Provider 已配置或服务已发布。

## 目标与边界

让已保存的漫画分镜可以由漫画日记 Agent 按格生成图片，并在妙讯内以异步任务显示排队、进度、逐格结果和失败状态。图片进入当前用户的私有媒体资产，供该用户在漫画稿中查看；不自动发布、分享或加入检索索引。

第一阶段只接漫画图片生成。视频 Agent 继续只生成脚本和镜头表，直到视频供应商的 API、任务查询、结果下载和取消合同经过核实。Agent 头像不是成图任务的一部分，继续使用设计中注册的 Agent 标识；本功能不生成头像。

本轮获准范围是代码和隔离验收，不包括生产部署、生产供应商调用、Agent 产品发布或 TestFlight。真实 Provider 隔离验收要等 API 合同核实并安全轮换凭据后执行；本设计阶段尚未调用供应商。

## 设计前的实现依据

- `agents/comic-diary.agent.js` 的唯一执行能力是 `comic.storyboard`，结果是文字分镜。
- `backend/src/routes/station-comic-routes.js` 同步校验 Agent 授权与用户选定素材，再保存 `station_comic_diaries` 草稿。
- `backend/database/036_ai_tasks.sql` 和 `backend/src/ai-task-runner.js` 提供持久队列与租约，但只允许 `agent_message`、`site_draft`；现有 Worker 也没有图片执行器。现状不可直接把图片结果塞进通用任务 artifacts。
- `station_media_assets` 已保存用户拥有的图片；`backend/src/oss-service.js` 提供服务端私有 OSS 写入，现有媒体 API 负责用户所有权校验和授权读取。
- `backend/src/agent-readiness-service.js` 目前把漫画 readiness 绑定到文本模型，不能据此声称已具备图片生成能力。

## 方案选择

选择扩展现有持久任务生命周期并增加逐格结果子表。这样复用统一的用户任务列表、事件、幂等、租约和断线恢复边界，同时明确扩大数据库与 RN 任务合同。

不选择同步图片 API：供应商运行时间不可预测，HTTP 请求不应阻塞漫画页面。

不另造一套独立媒体任务队列：它会重复实现 claim、lease、事件、幂等与用户查询逻辑，且与已有 `ai_tasks` 状态体验分裂。若后续视频任务的状态合同明显不同，再单独评估专用队列。

## 组件与数据流

1. 用户先按现有流程生成并保存文字分镜。漫画草稿卡新增明确的“生成漫画画面”动作；保存分镜不会自动触发图片调用。用户可在提交前看到将按多少格发起生成，避免无意触发供应商请求。
2. RN 使用新的漫画渲染 API，并发送客户端生成的幂等键。API 校验漫画稿属于当前用户、漫画 Agent 当前已发布版本、用户对该 Agent 的有效产品授权，以及独立图片生成 scope。API 重新核验分镜版本和用户明确选定的照片来源后，仅创建持久任务，不调用供应商。
3. API 在独立 `comicRenders: 1` 合同下返回专用 `ComicRenderTaskDTO` 和逐格排队状态。RN 通过专用任务查询/事件接口刷新状态；卡片按原分镜逐格显示排队、生成中、已完成、失败或结果未知，并用现有私有媒体 API 读取完成图片。通用 `aiTasks: 1` 列表继续只返回聊天/建站任务。
4. AI Task Worker 新增 `comic_render` executor。它按帧读取任务快照，只使用已授权且明确选中的照片；不读取整本相册。每次调用前重验任务租约、Agent 版本/授权和来源版本。第一版按格顺序生成，避免在供应商并发语义未经核验前并发派发。
5. 独立图片 Provider 把内部标准请求映射到已核验的供应商合同。Provider 只接收服务端配置和已验证输入，返回规范化图片字节、MIME、尺寸、供应商请求 ID、模型标识和可选的真实用量。供应商 URL 不作为产物地址保存；如供应商只返回 URL，适配器必须通过严格的 HTTPS 主机校验、不跟随不受信任重定向并立即取回图片。
6. Worker 校验图片文件签名、MIME、尺寸和响应大小，再用现有私有存储写入流程创建用户所属 `station_media_assets`。每格成功的 asset ID 与漫画稿/任务帧通过数据库外键关联。成功资产不触发媒体检索索引，不向客户端暴露 OSS key、签名 URL以外的存储细节或供应商原始响应。
7. 所有格完成后任务进入 `succeeded`；至少一格保存成功且其他格确定性失败或因来源/授权变化未派发时进入 `partially_succeeded`；所有格均确定性失败时进入 `failed`。供应商请求已发出但结果不能确认时进入 `interrupted`，保留已安全保存的图片和逐格未知状态，不自动重放任何不确定调用。

## 数据与任务合同

新增有序迁移 `058_comic_image_generation.sql`：

- 将 `ai_tasks.kind` 扩展为 `comic_render`，并扩展源记录约束，使漫画任务绑定 `comic_diary_id` 而不伪造聊天消息。
- 为漫画任务增加终态 `partially_succeeded` 和媒体渲染阶段。其他 AI 任务现有状态及行为保持不变。
- 数据库内部漫画任务使用任务合同版本 2，并新增独立 `comicRenders: 1` API 合同。现有聊天/建站任务仍为合同 1；通用 AI Task 列表默认不混入漫画图片任务，避免旧的聊天任务 DTO 误解析。RN 漫画面板通过专用漫画任务 API 读取这些状态。
- 新增逐帧结果表 `comic_task_outputs`，按 `(task_id, frame_index)` 唯一，使用 `task_id + user_id` 和 `media_asset_id + user_id` 复合外键。记录安全状态、输出资产 ID、供应商请求 ID、错误代码和时间；不记录密钥、base64、外部图片 URL、原始供应商 body 或不必要的完整私人 prompt。
- 更新 `ai_task_events` 的受限进度合同，只新增总帧数、已保存帧数和失败帧数等整数计数；事件接口不返回私有任务输入或对象存储路径。
- AI Task Worker 写入能力心跳，包含实例状态、已注册执行器和最后存活时间；Readiness 只有在近期心跳确认 `comic_render` executor 存在时才报告 Worker 就绪，避免仅凭 API 进程内的静态代码把未运行的 Worker 显示为可用。
- 任务 `request_hash` 覆盖漫画稿版本、帧文本快照、显式素材引用、Agent 版本和用户选择的输出选项。同一幂等键与同一 hash 返回原任务；键相同但请求不同返回 409。

逐帧记录保留部分成果：已保存的图片继续可读，即使后续帧失败或结果未知。用户明确重新生成时创建新任务；不会静默覆盖旧图，也不会重发状态未知的请求。

## 授权与 Provider 配置

- 漫画 Agent registry 增加独立 `comic.render` 能力与 `media:image:generate` scope。素材读取仍分别受 `album:read` 等现有 scope 控制；图片生成权限不从这些权限推导，也不自动加到既有用户授权中。
- 现有产品发布/版本快照/用户 consent 流程承载新 scope。未发布、未同意、撤权或 Agent 版本改变时，任务创建或 Worker 二次校验明确失败；后台的 Agent 定义、产品 release 和用户授权必须同步更新后，能力才算可用。
- 后端配置独立使用 `MEDIA_GENERATION_ENABLED`、`MEDIA_GENERATION_PROVIDER`、`MEDIA_GENERATION_API_BASE_URL`、`MEDIA_GENERATION_API_KEY`、`MEDIA_GENERATION_IMAGE_MODEL` 和 `MEDIA_GENERATION_TIMEOUT_MS`。功能默认关闭；配置缺失或 Provider 合同未知时 fail closed。
- API 和 AI Worker 通过受限的服务端 secret 环境读取同一配置。密钥不写入 Agent manifest、数据库、客户端、Admin 表单、日志或文档；Admin 只显示配置变量名和脱敏 readiness。
- 不复用 `NEW_API_*` 文本模型配置、`DASHSCOPE_*` 的 3D Wan/Tripo 配置、`MEDIA_RETRIEVAL_DASHSCOPE_*` 检索配置，也不把 `OSS_*` 当作模型 Provider 配置。
- 不增加 token 或费用上限。服务端仅记录供应商实际返回的模型、请求 ID和可验证用量；未知费用保持未知，不伪造价格或 token 数。帧数继续由现有 2–8 格分镜选择约束。
- 漫画 readiness 分开报告文字模型、图片 Provider、近期 Worker executor 心跳和私有存储状态。只有每项运行依赖真实就绪时才报告图片生成可用。视频 readiness 继续明确缺少已核验的视频 Provider 和执行器。

## 失败、取消和数据清理

- 只允许取消尚未 claim 的 queued 任务。任务进入 running 后，除非未来供应商合同明确提供并验证取消语义，不显示“已取消”；应用离开页面也不推断任务失败。
- 已确认的供应商拒绝、内容策略拒绝或格式错误记为确定性失败；网络超时、连接断开、worker 租约丢失等可能已发生计费的情况记为结果未知，并中断该格及整项自动派发。
- 图片写 OSS 与 PostgreSQL 不能构成单事务。先写临时/待确认媒体记录，PUT 后核验对象，再在一个数据库事务里标记 asset 可读、关联帧输出并更新任务。事务失败时尝试删除孤儿对象；删除失败保留无敏感内容的可审计清理记录。
- 删除漫画稿不会自动公开或删除用户仍拥有的已生成相册资产；用户删除素材或账号时沿用现有资产删除和账号级级联策略。任务输出外键在素材删除后保持明确删除状态，不返回失效资源。

## Provider 合同前置条件

目前没有已核验的图片 endpoint、model ID、认证头、请求体、异步 job 查询方式、响应体、图片下载语义和供应商幂等/取消能力。因此不能把通用文本 API 或其他 Agent 的配置当作图片接口，也不能仅凭 Key 声称已接通。

编码前需要针对用户选择的中转站确认其官方/服务端文档：HTTPS base URL、图片接口路径、模型 ID、输入图片格式、请求字段、返回 base64 或 job ID/下载 URL、成功与失败响应、限流和超时行为、可返回的请求 ID/用量字段，以及费用/用量字段是否可信。若目前只实现同步图片接口，worker 应在有界超时内等待结果；若接口是异步 job，Provider 必须定义不重放的轮询状态合同。

用户此前在聊天中粘贴过 API Key；该值按已暴露凭据处理，应先在中转站撤销/轮换。新凭据应由用户或受控运维流程放入后端/AI Worker secret 环境，不在聊天中发送。真实 Provider 端到端验收应使用隔离账号、隔离数据库和新凭据；当前批准允许此类隔离验收，但不包含生产调用或部署。

## 隔离验证与完成标准

- Agent registry/release/permission 测试覆盖 scope 独立、未发布、未同意、撤权和版本变化。
- 配置/readiness 测试覆盖功能默认关闭、缺失配置、非 HTTPS/不允许的 host、Worker 缺席与存储不可用；日志和响应中不出现 Key。
- 数据库与 API 测试覆盖 058 迁移、用户所有权、来源变化、幂等重放/冲突、queued 取消、逐帧输出、部分成功、任务事件计数和跨用户 404。
- Worker/存储测试覆盖 lease 丢失、已知失败与未知结果、没有自动重试、有效图片校验、上传成功后事务失败的孤儿清理，以及不自动进入检索索引。
- RN 测试覆盖明确触发生成、任务刷新/后台恢复、逐帧进度、部分成功、未知结果提示、生成图读取、授权失效及无 Provider 时明确不可用。
- 受控本地 HTTP fixture 仅用于 Provider 序列化、响应解析和错误合同单元测试，不作为产品成功结果。真实端到端图片验收须在合同核实且轮换的新 Key 配置后，使用隔离环境明确执行，并据实记录请求与返回；生产不参与。
- 最终运行 backend/Agents/RN/Admin 定向测试、隔离 PostgreSQL 集成测试、TypeScript/ESLint/Prettier、`./scripts/check-repository.sh` 和 `git diff --check`。

## 实施顺序

1. 本设计已获用户通过；真实适配器接入仍需补齐中转站图片 API 合同资料和安全替换凭据的配置方式。
2. 写实现计划，再实现 task/migration、Provider interface/readiness、worker/storage、Agent scope/product、RN 逐格任务体验。
3. 在全新隔离 PostgreSQL 与本地受控 Provider 合同测试中验证代码；若用户提供了已轮换密钥及服务端地址，再单独做隔离真实图片验收。
4. 交接完成的文件、迁移、测试与剩余生产部署/发布/设备验收事项。本轮明确不部署、不发布、不上传 TestFlight。
