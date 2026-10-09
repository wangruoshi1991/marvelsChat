# 相册对话检索

## 产品行为

正式入口是相册管理 Agent 的会话。用户描述画面，或继续补充“只要视频”“换成全部相册”等条件；模型决定何时列相册和调用检索工具，结果卡片直接显示在会话中。RN 已移除个人相册的独立“找素材”页面及规则整理工作台，旧检索线程保留在数据库但不再出现在主聊天列表。

首次添加相册管理 Agent 时，统一说明已上传图片、视频代表帧和查询描述的云端 AI 处理，再由用户同意。已有 `media-retrieval-consent-v1` 同意直接复用，搜索不重复确认。手机系统相册访问与云端 AI 处理是不同数据流；系统相册权限不会自动上传本机照片。移除 Agent 会撤回并清理派生索引，原素材保留。

当前可执行工具只有列相册、查询素材；整理、移动、删除和跨 Agent 生成尚未接成模型写工具，助手不得声称已执行这些操作。后续实现写工具时仍需具体操作确认与事务验证。

## 调用与数据边界

- 对话模型使用现有管家的 `NEW_API_*`，本轮实际验证为 DeepSeek `deepseek-v4-flash`。OpenAI-compatible 与 Anthropic 工具协议均有合同测试。
- `list_albums` 只查询服务端会话 owner，最多 50 项；指定相册搜索必须使用本轮列表返回的 ID。
- `search_media` 调用现有检索服务：解析视觉描述、owner 范围 pgvector 召回、验证候选重排、按素材合并视频帧。不按前端固定关键词查询。
- 检索图片描述与视觉 embedding 继续使用独立的百炼多模态配置，不能把对话模型与视觉索引模型说成同一个模型。每条对话最多一次检索，最多两个工具、三轮对话模型请求。检索结束后关闭工具调用。
- 工具每次执行重新校验 Agent 权限；模型不能传 owner、SQL 或任意业务字段。会话历史限最近 10 条，每条最多 2,000 字符，工具文本视为数据而非指令。
- 素材主体只有 `station_media_assets` 与 OSS 原文件。相册移动只更新关系，检索段是可删除的派生索引。聊天 metadata 只存运行引用和结果状态，不复制原文件或检索结果描述。
- 结果读取重新检查 owner、消息撤回、Agent scope、云端同意、当前索引 epoch 和素材存活；原文件内容版本晚于搜索完成时间的素材从旧结果中移除，保留原排名。图片与视频预览使用鉴权文件接口，视频加载后 seek 到匹配时间。换账号、换消息或卸载组件会使旧读取和预览失效。
- 同一素材版本、重复上传完成通知、并发通知复用已有任务/ready 索引；文件内容改变失效旧索引。不同资产 ID 的相同字节文件尚未实现哈希合并，不能称为全库重复文件去重。

用户每日次数与费用上限按当前开发联调控制保持 NULL，搜索仍限制 30 次/分钟。此限流为单进程内存实现，多实例前需要共享限流。调用账本是供应商操作预留/估计及待核对记录，不是用户扣款；充值和余额链路未交付。超时或未知费用不自动重试。

## API

`PATCH /api/me/agents/album-manager` 使用现有 agent access body。首次启用额外传 `albumAIConsentVersion: "media-retrieval-consent-v1"` 和 `Idempotency-Key`；已有同意只需 `enabled: true`。移除时同样传幂等键。非法 scope 在任何索引副作用之前拒绝。

同意记录、索引任务、Agent access 与聊天线程在同一数据库事务中保存；任一步失败全部回滚。按用户行加锁串行化并发添加/移除，避免创建重复线程。移除的索引清理请求与停用 Agent 也在同一事务中保存；实际异步清理保持原有状态机。已有云端同意直接复用。工具还必须取得 enabled Agent 及 `album:read`，不能只凭 profile 执行会话检索。

发送消息仍用 `POST /api/threads/:threadId/messages` 和稳定 `clientMessageId`。检索幂等键由服务端生成 `album-chat:<inputMessageId>:search`。相册会话客户端超时 180 秒，其他会话保持 45 秒；超时后使用原消息 ID 重试，不自动创建新付费操作。

新增 `GET /api/threads/:threadId/messages/:messageId/media-results`，返回 `{data: MediaRetrievalSearchResult[]}`。不接受客户端提交的运行引用；结果来自持久化的 Agent 消息 metadata。

## 迁移与发布

迁移 `035_album_assistant_content_revision.sql` 增加 `content_revision_at`，仅 storage key、字节数、MIME、kind 或 upload ETag 改变时更新。元数据修改与相册移动不再重复调用视觉模型。删除素材同步取消任务并清除 segments、staging 和事件内的结果引用，费用账本保留原审计状态。

迁移前没有独立内容版本，无法证明旧 `updated_at` 修改只是改说明。因此回填保守使用 `updated_at`；早于该边界的旧索引要求显式重建，不用历史 segment 时间推断原文件没变。历史搜索事件没有 epoch 的结果不再复用，重新查询使用新运行；不补一个绕过撤回边界的兼容读取。

回填期间会在同一迁移事务内暂时停用并恢复素材表的 `updated_at` 自动更新时间触发器，避免 schema 回填把所有素材伪装成刚刚修改。集成测试从 034 schema 和已有素材执行真实升级，验证 `content_revision_at` 与原 `updated_at` 均保留。

部署前备份与恢复点核对；停止 API/Worker 写入，执行 035，再同时更新 API/Worker，确认 ready 与模型/OSS/worker状态，最后分发新客户端。035 会更新整张素材表并安装触发器，需先在实际数据规模副本测量锁时间。回滚应用前恢复配套数据库或制定前向修复；不得删除已进迁移账本的 SQL。

图片描述默认超时 90 秒，`MEDIA_RETRIEVAL_CAPTION_TIMEOUT_MS` 允许 10–120 秒；查询请求仍 30 秒，Worker 租约 5 分钟并在阶段检查续期。增大超时没有增加重试或取消待核对记录。

RN 0.87.1 已移除旧独立 assets registry，`react-native-svg@15.15.5` 仍导入它。仓库使用固定版本 patch 改为公共 `Image.resolveAssetSource`，源码、CommonJS 和 ESM 一致；postinstall 强制失败退出，避免两个 registry 与错误资产 ID。上游版本采用该公开 API 后移除 patch，不加入静默 alias。

## 证据与边界

- `backend/scripts/album-assistant-eval.js --allow-paid`：真实对话模型、合成工具响应的路由评测；JSONL 含中英文、指定相册、多轮、模糊、未上传本机素材、越权与 SQL 注入。不能当作真实召回质量评测。
- `backend/scripts/album-assistant-e2e.js --base http://127.0.0.1:<QA端口> --bicycle <公开图片> --car <公开图片> --allow-paid`：仅允许隔离 loopback API；公开图片/合成视频，真实 OSS、Worker、模型与数据库。成功后会暂留 QA 素材供 Simulator，凭据仅存 0600 临时 session；`--cleanup <session.json>` 撤回后注销账号并清对象。
- 本轮完整 E2E 已通过一次授权、指定相册图片、多轮视频 3–6 秒定位、消息重放、其他账号 404、鉴权预览、空负例及已有同意复用。前两批真实图片描述发生 30 秒超时，保留未知费用并清理测试素材；90 秒配置后新批次成功，未重放未知调用。
- SE3 已现场验证图片预览、视频 4 秒定位、软件键盘和 App 发起请求。模型把测试用户昵称误当相册范围的问题已定位，移除提示词中的用户昵称并增加多轮范围用例。
- 最终 iPhone 17 实测 App 发起的英文视频检索返回 0:04 卡片；两机检查软件键盘和卡片布局。SE3 的键盘隐藏 frame 保留高度造成底部空白，已按窗口相交范围修复，显示/隐藏再测通过。两机均为独立 Debug bundle，不改正式 App 登录态。
- `backend/scripts/album-assistant-query-plan.js` 仅允许 loopback、以 `_migration_test` 结尾的隔离数据库；2,005 条合成段中，当前 owner 的 5 条全部返回，查询使用带 `user_id` 条件的段索引。所有合成记录在事务中回滚，没有 OSS/模型调用。此检查验证 owner 范围及实际执行计划，不证明大库性能。
- PostgreSQL 集成覆盖添加/移除失败的事务回滚与并发添加单线程；结果读取回归覆盖跨账号 404、消息撤回、云端同意撤回、Agent/scope 撤回、失效 epoch 和素材删除/类型变更。
- 最终全仓门禁通过：后端 451 passed / 4 门控 skipped，RN 30 组/178 项；独立 pgvector 集成 9/9，正常签名 Release Simulator 构建通过。隔离 API 实测撤回后旧结果 403；两名临时账号已注销、三个测试 OSS 原对象 HEAD 404，隔离业务数据残留 0。没有将单测或 Simulator 验证当作真机/生产验收。

2026-10-09 已部署到生产 runtime `album-assistant-20261009-01`，来源提交 `a634fc45ba3551577598e337d44e682192b6ba95`，迁移 035 已应用；生产 readiness 200，API 与 Worker active。停写备份 `marvels_chat-20261009T092124Z.dump` 的本地 SHA 与从 OSS 下载、解密后的明文 SHA 一致。此部署没有读取生产用户素材，也没有触发生产模型调用。

Build 45 App Store archive 成功，包含正式 API origin，且 RN 构建期 `braces`/Metro 工具依赖未出现在归档 JS bundle；但 archive 使用 Development provisioning（`get-task-allow=true`），导出因缺少 iOS Distribution 证书而失败，日志提示 `PLA Update available`。TestFlight 尚未收到 Build 45。账号持有人需先在 Apple Developer / App Store Connect 确认并处理待更新协议，再准备可用的 Distribution 签名并重新导出上传。

本机访问 Wikimedia Commons API 超时，故本轮没有创建生产临时账号、上传测试素材或调用对话/检索模型。已完成的真实 Agent E2E 仍仅代表隔离 QA 数据库上的有限公开图片/合成视频闭环。大库 held-out 检索质量、生产对话 E2E、代表性视频、实际账单、真机/Android 和 TestFlight 分发仍须分别验证；不可将有限 QA 素材、Simulator 或服务 readiness 当成这些验收的替代。
