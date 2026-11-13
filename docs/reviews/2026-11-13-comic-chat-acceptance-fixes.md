# 2026-11-13 漫画聊天真机反馈续修

本轮只修复本地源码和验证，不提交、推送、部署、后台发布、上传新包、代用户授权或调用付费模型。保留进入本轮时已有的 iOS Build63 和发布文档修改。正式工作区为 `admin-lifecycle-release/marvelsChat`，HEAD 仍为 `79e91dd`。

## 用户反馈与已定位原因

用户报告已安装最新包；此前 Build63 正常上传 Apple。用户已看到漫画 0.1.6 并本人同意权限，但新消息仍报“Agent 声明已更新”，失败消息重试也无法恢复。本轮未读取用户私人聊天或独立核验手机实际包号。

当前精确产品授权通过后，`specialist-message-service` 又拿上一版澄清的保存快照对比当前声明，新输入因此在 admission 阶段被旧记录阻断。该错误与“我的 Agent”当前授权有效可以同时成立；不是必须解绑重绑，也不是要重复给用户扩大权限。

另有三个独立界面问题：历史失效贡献一律显示重试且放在最新消息 footer；iOS 在键盘动画完成后才调整聊天位置，并在正常 flex 布局之外重复预留 composer 高度；“我的漫画”自建按钮/长分镜缺少现有妙讯卡片与导航层级。

## 本地结果

- 新消息先验证当前精确授权。旧澄清声明、能力或漫画产品快照过期时结束旧链，以公开 `agentDispatch.contextResetReason=agent_updated` 标记新需求；旧需求、引用、来源和旧聊天历史不进入这次模型。后续历史以持久重置输入为下界，删除或撤回该输入也不复活之前的需求。
- 原 `clientMessageId` 重试仍复核原版本与授权，不换 ID 或重复调用模型。RN 对声明/产品快照失效提供“编辑为新消息”，仅恢复文字，素材需重新选择且本人再次点发送；已有草稿或关联内容时拒绝覆盖。服务端公开澄清版本，客户端只自动恢复与当前 Agent 版本相同的待续素材。
- 去除漫画聊天顶部常驻“选参考图”和流程说明。参考素材完全可选：“更多功能 → 相册/拍摄”沿用本机选图、真实上传和引用；“更多功能 → 小站素材”使用已有受限范围选择器，不扫描全库。其图片元数据/原图读取边界仍明确显示在选择页。
- 历史失效成果归入列表头部折叠的“历史协作成果”，展开才显示精确原因；只有暂不可用允许重新核验，授权失效可查看授权，来源/版本变化不再诱导反复重试。当前聊天结果单独展示，真实失败和历史不可读计数仍保留。
- “我的漫画”复用现有 Header、WorkspacePanel/State/Button、间距和字体 token；作品整卡可点。详情默认紧凑画格，可放大，分镜文字按需展开，发布区域独立；私有图片读取、逐格真实状态、排队取消和只带入成功图片的规则保留。共享 Header 扩大返回按钮触控区，不改变视觉尺寸。
- iOS 使用 `keyboardWillChangeFrame` 与系统 layout animation 同步位置；列表只在跟随最新消息时随可见区域变化滚到底部，浏览旧消息时保留位置。去除重复 composer 底部留白与重复定时滚动，收敛输入区额外 padding。用户有效发送后立即收起键盘，不等模型结束；延迟到达的旧文本测量不能撑高已清空输入框。

没有新数据库迁移、权限、Agent 声明、版本、依赖或配置开关。现有 JSONB metadata 承载公开边界字段；API/RN 类型与行为合同同步更新。不需要靠再发布 Agent 产品或代用户授权修复这个后台消息错误。

## 验证证据

- 真实 loopback 专用 PostgreSQL 执行全部 60 项迁移；specialist dispatch/HTTP 32 项、内容预览/确认合同 20 项通过，0 跳过。新增回归先复现版本 409 和历史串用，再修复通过；包括旧素材删除、版本/能力/产品变更、新需求边界、原 ID 不重跑及重置输入删除/撤回；同一毫秒内不同微秒的旧消息也不能穿透重置边界。模型使用隔离 fixture，未调用真实供应商。
- PG 原始日志保留 `/tmp/miaoxun-specialist-20261113.w3Kogk/`：`microsecond-regression-final.log`、`content-microsecond-regression.log`；专库已确认无其他连接后停止，数据保留。
- RN 定向 6 套 115 项通过，覆盖原生附件迟回隔离、版本澄清、键盘提前动画、浏览位置、有效发送收键盘、失效原请求禁止重试、历史成果折叠、长文本与表情输入；作品列表/详情另有对应定向测试。
- 整仓检查发现原 release-network-config 测试把构建号固定为58，已改为校验正整数、既有最低版本及 Debug/Release 一致；没有更改 Build63、API origin 或 ATS。该项 11/11 通过。
- 最终 `MIAOXUN_DOTENV_ENABLED=false ./scripts/check-repository.sh` 退出0，`All repository checks passed`：RN 111套1381项、Backend 1149项通过/408项默认环境门控跳过、Agents59、Admin52、Avatar Web29、媒体检索Web4；包括类型、ESLint零警告、Prettier、runtime打包校验和各Web构建。408项环境跳过不算PG验收，上面的52项是真实隔离专库结果。
- 最后新增的ChatScreen级测试确认：已有草稿拒绝覆盖；旧失败记录的正文可明确编辑后发送，原记录保留，不带原refs、reply、preview或retry ID，不自动发消息。`git diff --check`通过。
- 日志已复制到仓库外 `~/Library/Application Support/MiaoxunReleasePreparations/comic-chat-feedback-20261113/`，其中 `repository-check.log` 为最终整仓证据；只读状态存于 `readonly-status.json`，不含生产账号或私聊。

## 线上与设备边界

本轮只读 `GET /api/health`、`/api/ready` 均 200，数据库 connected/migrationsCurrent；`GET /api/agents` 返回9项，漫画日记 `version/releaseVersion=0.1.6`、published=true、catalogStatus=published。公开接口正常不证明发送或生图已修复；本轮修复尚未进入生产与用户手机。

固定 iPhone17 Simulator 当前为 Shutdown。正式 `node scripts/miaoxun-development.mjs ios --build-only` 在读取现有 App 保护检查时明确报 `Unable to lookup in current state: Shutdown`，没有构建、替换或启动现有 App，也没有模拟器视觉或真机流畅度验收结论。日志 `/tmp/miaoxun-chat-ux-ios.log`。不以组件测试代替设备体验。

下一阶段需要配套后端 runtime 和新客户端分发，在正常授权范围内执行；无迁移或 Agent 产品重新发布需求。随后用真机复验：保留绑定后新发消息、旧失败文字编辑为新请求、无需参考图创作、按需本机/小站选图、长文/表情/键盘、历史成果展开、作品列表/详情和本人动态发布。真实模型、生图、用户授权与生产数据写入仍各自核对授权。

## 本轮文件

- Backend：`src/specialist-message-service.js`、`src/public-message.js`；测试 `test/specialist-message-integration.test.js`、`test/specialist-dispatch.test.js`、`test/release-network-config.test.js`。
- RN聊天：`src/features/messages/MessagesScreen.tsx`、`ChatComposer.tsx`、`ChatMessageItem.tsx`、`WorkspaceContributionNotice.tsx`、`butlerClarification.ts`。
- RN漫画：`src/features/messages/MyComicsScreen.tsx`、`ComicDetailScreen.tsx`。
- RN合同与共享：`src/models/api.ts`、`src/features/session/sessionTypes.ts`、`src/shared/messageStyles.ts`、`src/shared/ui.tsx`。
- RN测试：`__tests__/assistContextFlow.test.tsx`、`butlerClarification.test.ts`、`chatComposerEditing.test.tsx`、`chatContentActions.test.tsx`、`comicSourceAndDetail.test.tsx`、`myComicsScreen.test.tsx`、`workspaceContributionNotice.test.tsx`。
- 文档：本记录、`docs/handoffs/CURRENT.md`、`docs/README.md`、`docs/agent-workspace-architecture.md`、`docs/conversational-comic.md`。
- 本轮进入时已修改的 `MiaoxunRN/ios/MiaoxunRN.xcodeproj/project.pbxproj` 和 `docs/reviews/2026-11-13-conversational-comic-release-preflight.md` 保留，本轮未再次编辑。`docs/README.md` 与 CURRENT 在保留原改动的基础上补本轮状态。
