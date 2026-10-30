# 相册对话检索

更新：2026-10-20。以下产品/API说明对应本地工作区；正式部署、模型配置及设备验收见[当前交接](../handoffs/CURRENT.md)。带日期的证据仅说明当时结果。

## 产品行为

正式入口是相册管理 Agent 的会话。专业分派先区分普通咨询、需要澄清的需求和可执行选材；咨询与澄清只保存回复，不创建任务。需求明确后，服务端以当前用户的原消息及已补充要求建立固定由相册 Agent 执行的 direct workspace。用户可从会话中的“查看任务”进入详情，也可在妙页查看进展和真实素材结果。执行阶段由模型决定如何列相册及调用检索工具，不能用分派回复表示已经找到素材。RN 已移除个人相册的独立“找素材”页面及规则整理工作台，旧检索线程保留在数据库但不再出现在主聊天列表。

澄清期间可补充“只要视频”“换成全部相册”等条件；完成后的相册选材目前不支持基于已有成果续作。需要修改选材时，返回原会话准备一条新需求并明确提交；不会静默接入其他能力或重复执行旧任务。没有找到匹配素材时，workspace 明确失败并返回 `WORKSPACE_MEDIA_NOT_FOUND`，不会生成成功的空素材成果。

首次添加相册管理 Agent 时，统一说明已上传图片、视频代表帧和查询描述的云端 AI 处理，再由用户同意。已有 `media-retrieval-consent-v1` 同意直接复用，搜索不重复确认。手机系统相册访问与云端 AI 处理是不同数据流；系统相册权限不会自动上传本机照片。移除 Agent 会撤回并清理派生索引，原素材保留。

当前可执行工具只有列相册、查询素材；整理、移动、删除和跨 Agent 生成尚未接成模型写工具，助手不得声称已执行这些操作。后续实现写工具时仍需具体操作确认与事务验证。

当前工具明确区分可检索、排队处理中和暂不可检索的素材。全部素材暂不可检索且没有活动任务时，
返回 `index-unavailable`，不再提示继续等待；部分素材可用时仍可查询，并明确未覆盖的数量。
没有任务、任务取消或当前内容版本没有有效索引，也不能据此声称任务仍在运行或一定是供应商失败。
这项边界的早期验证见[接续检查](../reviews/2026-10-10-release-followup.md)，不以旧版本记录代替当前发布状态。

## 调用与数据边界

- 对话模型使用统一的 `NEW_API_*` 配置，模式与供应商入口见[模型配置](../agent-model-configuration.md)。OpenAI-compatible 与 Anthropic 工具协议均有合同测试。
- `list_albums` 只查询服务端会话 owner，最多 50 项；指定相册搜索必须使用本轮列表返回的 ID。
- `search_media` 调用现有检索服务：解析视觉描述、owner 范围 pgvector 召回、验证候选重排、按素材合并视频帧。不按前端固定关键词查询。
- 检索查询角色解析复用管家的 `NEW_API_*` 对话模型；图片描述、视觉/文本 embedding 和真实画面判定使用独立的百炼多模态配置。不能把视觉索引模型说成对话模型。一次任务中的检索调用沿用稳定幂等键，按真实工具结果交付；执行时限、权限、租约和未知调用结果仍是停止边界，不以固定三轮模型请求判断完成。
- 工具每次执行重新校验 Agent 权限；模型不能传 owner、SQL 或任意业务字段。专业分派按权限使用同一会话最近10条有权读取且未撤回的真实消息，当前输入及澄清链另行传入，不自动附加整站资料。选材执行使用任务中固定的真实需求和所选相册范围；工具文本视为数据而非指令。
- 对话工具仅返回本次执行的 `matchedQuery`、匹配状态、素材引用、类型和视频时间，不把不完整的展示摘要交给对话模型重新判定画面。新任务的素材从 workspace 鉴权接口读取；历史助手回复不是当前素材事实，以本次检索结论为准。
- 素材主体只有 `station_media_assets` 与 OSS 原文件。相册移动只更新关系，检索段是可删除的派生索引。聊天 metadata 只存运行引用和结果状态，不复制原文件或检索结果描述。
- 新 workspace 成果读取重新检查 owner、原会话及需求消息、固定 Agent 版本与完整 scope、云端同意、当前索引 epoch、检索来源和素材版本；来源变化时明确拒绝，不发布过期成果。旧消息结果接口仍按原合同移除原文件版本晚于搜索完成时间的素材并保留排名。图片与视频预览使用鉴权文件接口，视频加载后 seek 到匹配时间。换账号、换消息或卸载组件会使旧读取和预览失效。
- 同一素材版本、重复上传完成通知、并发通知复用已有任务/ready 索引；文件内容改变失效旧索引。不同资产 ID 的相同字节文件尚未实现哈希合并，不能称为全库重复文件去重。

当前查询 schema v3 只分类原文片段，拼接必须完整还原输入，不接受旧 schema、改写、空解析或低置信度；身份只作 owner 数据中的完整值精确约束。视觉路径不使用固定词表、关键词 SQL 或本地词汇排序。召回后对最多 20 个候选逐张读取当前原图片或精确视频帧，每次只让模型看一张图，且全部视觉条件都须明确支持才返回。每张画面单独预留费用和核验权限；后续判定失败会阻断整个查询，不能返回部分成功。仅在请求内存中规范化原画面，不持久化第二份素材。

用户每日次数与费用上限按当前开发联调控制保持 NULL，搜索仍限制 30 次/分钟。此限流为单进程内存实现，多实例前需要共享限流。调用账本是供应商操作预留/估计及待核对记录，不是用户扣款；充值和余额链路未交付。超时或未知费用不自动重试。

## API

`PATCH /api/me/agents/album-manager` 启用时必须显式提交 `enabled: true` 和与当前已发布产品依赖完全一致的 `grantedScopes`；不能省略、只传部分范围或由服务端替用户补权。首次云端处理还需 `albumAIConsentVersion: "media-retrieval-consent-v1"`，已有有效同意可复用，但完整权限仍必须明确传入。启用和移除均传 `Idempotency-Key`；服务端先解析唯一已发布产品并写入 entitlement，再重建 Agent 投影；移除统一清空权限。非法 scope 在任何索引副作用之前拒绝。

同意记录、索引任务、Agent access 与聊天线程在同一数据库事务中保存；任一步失败全部回滚。按用户行加锁串行化并发添加/移除，避免创建重复线程。移除的索引清理请求与停用 Agent 也在同一事务中保存；实际异步清理保持原有状态机。已有云端同意直接复用。工具还必须取得已启用Agent的完整当前声明权限，不能只凭profile或单个 `album:read` 执行会话检索。

本地新专业消息使用 `POST /api/threads/:threadId/messages`，必须携带 `X-Miaoxun-AI-Contract: 1`、`X-Miaoxun-Agent-Workspace: 5` 和稳定 `clientMessageId`。首次完成分派返回201及已保存的消息；公开回复 metadata 的 `agentDispatch` 为 `{version: 1, kind: "reply" | "clarify" | "workspace"}`。`reply` 与 `clarify` 不创建任务；只有 `workspace` 同时返回 `agentWorkspace: {id}`。201表示分派已完成，不代表素材检索已成功。

新选材任务通过 `GET /api/agent-workspaces/:workspaceId` 轮询，`executionMode` 为 `direct`，`origin` 固定原会话、输入消息、相册 Agent、版本与 `media.select` 能力。成功成果为带素材版本、匹配视频时间和真实检索来源的 `media_selection`；逐项使用 `GET /api/agent-workspaces/:workspaceId/media/:assetId` 鉴权读取。两个接口同样要求 AI 1 和 workspace 5。空检索只接受 `status: "failed"`、`error.code: "WORKSPACE_MEDIA_NOT_FOUND"` 且 `result: null`；其他失败或不确定调用不能当成空结果。

相同 `clientMessageId` 与相同内容重放返回200及原分派消息和同一 workspace 引用，不再次分派。检索操作使用服务端生成的稳定 workspace/节点标识；轮询和重放不得另发一条新需求。请求超时不能证明任务失败，也不能自动新建付费操作。

切换前已接受并绑定旧 `ai_tasks` 的相册消息仍走原路径：相同 key 重放返回200、原 `task` 和已有回复，进展仍从 `GET /api/tasks/:taskId` 读取，不改建 workspace。旧回复的 `GET /api/threads/:threadId/messages/:messageId/media-results` 继续返回 `{data: MediaRetrievalSearchResult[]}`；不接受客户端提交的运行引用，结果来自持久化的 Agent 消息 metadata。该兼容路径不再接收新选材任务。

状态接口仍使用现有 `backfill` 字段：`indexedAssets` 统计当前内容的可用索引，`skippedAssets` 统计当前无可用索引、
也无当前 epoch/内容版本活动任务的素材；`totalAssets - indexedAssets - skippedAssets` 为真正排队或处理中的素材。
计数来自当前用户全部未删除、已上传图片/视频，不根据最近运行记录推算。`backfill.lifecycleStatus` 仅描述选中的运行。
会话工具将这些计数投影为 `accountIndexCoverage`（`indexedAssets`、`pendingAssets`、`unavailableAssets`、`totalAssets`），
始终表示整个账号；`searchScope` 独立说明本次是指定相册（`kind: "album"`、`albumId`）还是全部账号素材（`kind: "account"`）。
回复只用 `results.length` 说明本次返回的匹配数量，不能把账号覆盖计数或返回条数当作所选相册总数，不能把账号其他相册的排队/失败状态归到所选相册。
这些内部工具计数不授予检索权限。旧公开消息只保留命中提示，旧空结果从其鉴权结果接口验证；新公开消息保留分派类型及 workspace 引用，实际结果和明确失败状态从 workspace 读取，不能依赖内部消息 metadata 推断执行成功。

## 当前验证入口

- 无付费合同检查：`MIAOXUN_DOTENV_ENABLED=false NODE_ENV=test DEFAULT_ADMIN_ENABLED=false node --test backend/test/album-assistant-e2e.test.js backend/test/ai-client-contract.test.js backend/test/album-assistant-eval.test.js`。共享验收客户端覆盖 AI 1/workspace 5、201分派、原 workspace 轮询、真实成果后同键重放、明确空检索失败、其他失败/中断/超时停止、错误来源与成果拒绝；不会调用模型或启动CLI。原工具、授权与旧结果读取边界仍分别由 `album-assistant-tools.test.js`、`album-assistant-access-service.test.js` 和 `album-assistant-result-access.test.js` 覆盖。
- 在迁移至042的隔离 loopback `*_migration_test` PostgreSQL 测试库，分别设置 `RUN_SPECIALIST_MESSAGE_INTEGRATION=1` 执行 `backend/test/specialist-message-integration.test.js`，以及 `RUN_AGENT_WORKSPACE_DIRECT_INTEGRATION=1` 执行 `backend/test/agent-workspace-direct-integration.test.js`，串行验证新专业分派、任务持久化、执行、来源与授权复验、重放及账号隔离。旧已接受相册任务由 `RUN_AI_TASK_INTEGRATION=1` 下的 `backend/test/ai-task-integration.test.js` 继续覆盖。这里的模型由夹具替代，不证明供应商或真实视觉质量。
- `backend/scripts/album-assistant-eval.js --allow-paid`：真实对话模型、合成工具响应的路由评测；JSONL含中英文、指定相册、多轮、模糊、未上传本机素材、越权与SQL注入。不能当作真实召回质量评测。
- `backend/scripts/album-assistant-e2e.js --base http://127.0.0.1:<QA端口> --bicycle <公开图片> --car <公开图片> --allow-paid`：对已启动的隔离API执行真实OSS上传、独立媒体Worker索引和AI Worker中的 workspace 执行。权限读取服务端Agent目录并完整提交；先核对201专业分派及 direct 来源，再轮询任务并从 workspace 素材接口读取图片和视频。覆盖新选材、视频匹配时间、同键重放、跨账号、鉴权预览及明确空检索失败。成功后保留QA素材供设备验收，凭据仅存0600临时session；`--cleanup <session.json>`撤回并注销账号、清理对象。这是唯一覆盖真实上传及两个独立Worker的此类入口，不能用纯模型评测替代。
- `backend/scripts/media-retrieval-service-e2e.js --allow-paid --fixtures <公开素材目录> --report <新报告路径>`：对loopback上以 `_migration_test` 结尾的空测试库，运行真实图片/视频模型和检索服务；包含完整授权、专业消息HTTP、workspace 路由及进程内 workspace 执行器。它共享上述201分派和 direct 任务轮询实现，并将原检索服务注入能力执行器；storage使用公开本地文件适配器，readiness使用注入的service gate，不证明真实OSS、独立Worker或生产readiness。素材目录须含固定SHA的 `fresh-dog.jpg`、`fresh-camera.jpg` 和CC0 `public-flower.mp4`，派发前核对；报告拒绝覆盖，结束清理测试用户及关联运行。
- `backend/scripts/album-assistant-query-plan.js`：仅针对loopback、以 `_migration_test` 结尾的隔离库，在回滚事务中验证owner范围及查询计划；无OSS/模型调用，不能证明大库质量或并发性能。

两项真实供应商脚本均不自动重放未知调用；除负例明确期待的 `WORKSPACE_MEDIA_NOT_FOUND` 外，任务失败、取消、中断或等待超时即停止验收。2026-10-20 本轮仅修正脚本合同并完成离线检查：共享 helper、API 合同和工具评测夹具共29项通过，另有原相册工具10项回归及脚本语法检查通过，没有调用付费模型、生产服务或重新执行OSS/Worker真实全链。下方旧成功记录不构成本轮新专业任务流程的付费或云端验收证据。

## 迁移035及当时发布约束（历史）

迁移 `035_album_assistant_content_revision.sql` 增加 `content_revision_at`，仅 storage key、字节数、MIME、kind 或 upload ETag 改变时更新。元数据修改与相册移动不再重复调用视觉模型。删除素材同步取消任务并清除 segments、staging 和事件内的结果引用，费用账本保留原审计状态。

迁移前没有独立内容版本，无法证明旧 `updated_at` 修改只是改说明。因此回填保守使用 `updated_at`；早于该边界的旧索引要求显式重建，不用历史 segment 时间推断原文件没变。历史搜索事件没有 epoch 的结果不再复用，重新查询使用新运行；不补一个绕过撤回边界的兼容读取。

回填期间会在同一迁移事务内暂时停用并恢复素材表的 `updated_at` 自动更新时间触发器，避免 schema 回填把所有素材伪装成刚刚修改。集成测试从 034 schema 和已有素材执行真实升级，验证 `content_revision_at` 与原 `updated_at` 均保留。

部署前备份与恢复点核对；停止 API/Worker 写入，执行 035，再同时更新 API/Worker，确认 ready 与模型/OSS/worker状态，最后分发新客户端。035 会更新整张素材表并安装触发器，需先在实际数据规模副本测量锁时间。回滚应用前恢复配套数据库或制定前向修复；不得删除已进迁移账本的 SQL。

图片描述默认超时 90 秒，`MEDIA_RETRIEVAL_CAPTION_TIMEOUT_MS` 允许 10–120 秒；查询请求仍 30 秒，Worker 租约 5 分钟并在阶段检查续期。增大超时没有增加重试或取消待核对记录。

RN 0.87.1 已移除旧独立 assets registry，`react-native-svg@15.15.5` 仍导入它。仓库使用固定版本 patch 改为公共 `Image.resolveAssetSource`，源码、CommonJS 和 ESM 一致；postinstall 强制失败退出，避免两个 registry 与错误资产 ID。上游版本采用该公开 API 后移除 patch，不加入静默 alias。

## 2026-10-09至10日历史证据与边界

2026-10-10 部署前本地候选已移除原文角色的固定词汇启发式和 B7 关键词排序。解析真实模型评测 24/24；逐张原画面判定后，旧图片回归 30/30、冻结配置后的全新六图首次独立评测 30/30（18 正例、12 负例、其中 6 个组合负例）。真实运动花朵视频此前六例通过；最终逐帧版本的真实服务验收覆盖图片、指定相册、视频精确时间、对话工具、幂等重放、跨账号、空结果和撤回，7 项通过、43 次调用，隔离数据残留为零。当前服务测试的 storage 是公开本地文件适配器、readiness 是注入的 service gate，不能当作生产 OSS/Worker readiness 或新的 Simulator 验收。来源引用校验不等于模型语义确定性保证。失败批次和旧 25/30 结果均保留在 [发布证据](media-retrieval/release-evidence.md) 中；此段为部署前验证；当前生产已更新，见末尾状态及发布证据。

- 当时完整E2E已通过一次授权、指定相册图片、多轮视频3–6秒定位、消息重放、其他账号404、鉴权预览、空负例及已有同意复用。前两批真实图片描述发生30秒超时，保留未知费用并清理测试素材；90秒配置后新批次成功，未重放未知调用。这批证据使用旧同步会话合同，不替代当前异步任务脚本验收。
- SE3 已现场验证图片预览、视频 4 秒定位、软件键盘和 App 发起请求。模型把测试用户昵称误当相册范围的问题已定位，移除提示词中的用户昵称并增加多轮范围用例。
- 最终 iPhone 17 实测 App 发起的英文视频检索返回 0:04 卡片；两机检查软件键盘和卡片布局。SE3 的键盘隐藏 frame 保留高度造成底部空白，已按窗口相交范围修复，显示/隐藏再测通过。两机均为独立 Debug bundle，不改正式 App 登录态。
- `backend/scripts/album-assistant-query-plan.js` 仅允许 loopback、以 `_migration_test` 结尾的隔离数据库；2,005 条合成段中，当前 owner 的 5 条全部返回，查询使用带 `user_id` 条件的段索引。所有合成记录在事务中回滚，没有 OSS/模型调用。此检查验证 owner 范围及实际执行计划，不证明大库性能。
- PostgreSQL 集成覆盖添加/移除失败的事务回滚与并发添加单线程；结果读取回归覆盖跨账号 404、消息撤回、云端同意撤回、Agent/scope 撤回、失效 epoch 和素材删除/类型变更。
- 最终全仓门禁通过：后端 451 passed / 4 门控 skipped，RN 30 组/178 项；独立 pgvector 集成 9/9，正常签名 Release Simulator 构建通过。隔离 API 实测撤回后旧结果 403；两名临时账号已注销、三个测试 OSS 原对象 HEAD 404，隔离业务数据残留 0。没有将单测或 Simulator 验证当作真机/生产验收。

2026-10-09 已部署到生产 runtime `album-assistant-20261009-01`，来源提交 `a634fc45ba3551577598e337d44e682192b6ba95`，迁移 035 已应用；生产 readiness 200，API 与 Worker active。停写备份 `marvels_chat-20261009T092124Z.dump` 的本地 SHA 与从 OSS 下载、解密后的明文 SHA 一致。此部署没有读取生产用户素材，也没有触发生产模型调用。

2026-10-09 当时Build 45 App Store archive 成功，包含正式 API origin，且 RN 构建期 `braces`/Metro 工具依赖未出现在归档 JS bundle；但 archive 使用 Development provisioning（`get-task-allow=true`），导出因缺少 iOS Distribution 证书而失败，日志提示 `PLA Update available`，当时尚未上传。该历史阻塞已于2026-10-10解除，最终状态见下方当前记录。

部署完成时本机访问 Wikimedia Commons API 超时，因此当时没有创建生产临时账号、上传测试素材或调用对话/检索模型；该状态已由下方后续最小 smoke 更新。隔离 QA E2E 仍只代表有限公开图片/合成视频闭环。大库 held-out 检索质量、代表性视频、实际账单、真机/Android 和 TestFlight 分发仍须分别验证；不可将有限 QA 素材、Simulator 或服务 readiness 当成这些验收的替代。

### 2026-10-09 生产对话最小 smoke

- 后续使用先前校验过的公开自行车 JPEG（与 `/tmp/miaoxun-retrieval-public-bicycle.jpg` SHA-256 相同）和两个随机临时账号，在精确生产 HTTPS origin 完成注册、素材上传至 OSS、首次云端 AI 同意、Worker 索引、指定相册对话检索和幂等重放。Agent 返回 `found`，结果包含预期素材；第二账号读取该结果为 404。
- 两个临时账号均通过注销 API 删除，注销后原 token 访问 bootstrap 返回 401；相册 Agent 在账号注销前撤权。此次没有读取或搜索其他用户的生产素材。
- smoke 脚本只在 `/tmp` 临时创建，限定生产 origin 且要求显式 `--production --allow-paid`；未改变 loopback-only 的隔离库 E2E 脚本。
- smoke 后公网 `/api/health` 与 `/api/ready` 均为 200。随后通过专用生产 SSH 运维入口，在显式只读事务中核对临时用户名、测试文件名和测试相册标题计数均为 0；全库 `station_media_assets` 与相册/索引 profile、job、segment、staging 的 orphan owner 计数均为 0。账号注销服务依次删除其登记的私有存储对象，再删除账号；没有另行对本次 OSS 对象执行 HEAD。实际供应商账单也未核验。
- 该最小图像 smoke 不是 held-out 质量评估。大库召回率、代表性视频、真实账单核对、真机/Android、Build 45 TestFlight 分发及完整隔离恢复演练仍未完成；项目不可标为完整上线就绪。

### 2026-10-10 发布状态（历史）

生产runtime为retrieval-visual-20261010-03、来源3b001b4、相册Agent0.2.2、迁移35。
原画面检索与匹配结论投影均已部署；真实公开图片/运动视频的对话、权限、幂等、预览、时间点、空结果及撤回通过。
同一Simulator旧聊天在03再次发送图片/视频查询，正常确认匹配并更正之前的摘要否定；16组真实对话模型回归通过。
临时账号、OSS对象、凭据和测试设备已清理。前两轮回复修复未完全通过、第一批视频未知故障、费用及质量限制均保留在
[专项发布证据](media-retrieval/release-evidence.md)，不把开发联调完成写成完整移动端上线就绪。

TestFlight 1.0(45)已于2026-10-10正式签名导出并上传，Apple处理完成后显示“正在测试”，关联已有内部/外部测试群组，现有测试用户可更新。归档的MiaoxunRN子树与上传时仓库相同，正式包get-task-allow=false，API为正式HTTPS origin。三项第三方framework崩溃符号待补；完整来源与验证见[Build45发布记录](../reviews/2026-10-10-testflight-45.md)。真机/Android及其他完整上线门槛仍须分别验收。
