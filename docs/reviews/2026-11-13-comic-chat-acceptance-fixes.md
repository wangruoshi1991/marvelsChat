# 2026-11-13 漫画聊天真机反馈续修

第一阶段仅修复本地源码并验证，保留原有iOS Build63和发布文档修改，正式工作区为 `admin-lifecycle-release/marvelsChat`，当时HEAD为 `79e91dd`。随后获用户明确授权，已精确本地提交 `15e7269`、完成后端60→60更新及Build64上传，详见后文；未推送、重新发布Agent、代用户授权或调用付费模型。Build64当前待本人处理出口合规及分发，真机效果仍待验收。

后续用户要求实际模拟器输入，已在固定iPhone17原位构建、安装并完成验证，具体见[键盘模拟器实测与修复](2026-11-13-chat-keyboard-simulator.md)。实测进一步发现全局layout animation导致最新回复遮挡、固定输入高度阻止自动换行增高，已以局部动画/真实视口偏移和原生自然增高替换本记录初修方案；新修复未进入Build64。该后续轮次另获一次管家文字发送授权并收到真实回复。本记录下方“Shutdown/没有模拟器视觉证据”及“未付费调用”为第一阶段历史边界，不能覆盖后续实测结果，也不表示漫画真实生成已经通过。

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

## 获授权后的精确提交、制品与 Build64

后续用户回复“可以”允许配套后端和新测试包更新；正式打包器要求clean committed HEAD，而用户原要求未经要求不提交，因此对具体30文件清单另行询问。用户明确批准“允许精确本地提交，不推送”。批准清单SHA256为 `8782b559bc95a0667d6f82ab16bf084090b2d96c24e387514c3612e0a86d9990`；提交前核对旧HEAD、原空暂存区、路径集合及全部文件字节，再精确提交 `15e72691b02dead20777b77b00f3846adc48d55d`，tree `a5959a147214d37386513637d29a1b7887a4e0a1`、父 `79e91dd`。30个提交blob全部匹配，提交与打包时工作树干净，未推送。

正式 `scripts/prepare-runtime-release.mjs` 退出0，生成 `comic-chat-feedback-20261113-15e7269`，306项runtime文件；tar SHA256 `b255a4aad288ab4c2f575e2c98874359837f55df3debca000db896a84a561a0a`、manifest SHA256 `e5c1e28df7e1c5f5fe2a879b78cdb885534ea6f176d1ba110b7e0cefc7828789`。独立核对tar安全、完整集合和每项字节通过；对保存的正式79e91dd基线只有两份Backend源码变化，其余304项不变，无增删、迁移、声明、权限、依赖或配置变化。制品保存在仓库外本轮目录 `runtime-artifact/`，独立审查在 `frozen-candidate-review-20261113T050631Z/`。

正常已登录App Store Connect页面实际展开版本及上传区后，确认最高为63、正在测试，最新上传63已完成，随后选择64。Build64命令参数覆盖 `CURRENT_PROJECT_VERSION=64`，没有再改源码中Build63；Release archive使用正式API、Bundle和Team。归档退出0，包内1.0(64)、arm64、codesign deep strict与主App dSYM匹配；507项RN/共享/校验输入在构建期间不变且与新提交blob一致。Metro生成源重新编译Hermes与归档内JS逐字节匹配，并确认不同于Build63。

通过正常Xcode Organizer的App Store Connect分发上传成功：最终 `Uploaded to Apple`、`Submission Status: Uploaded`、`Build Number: 64`。上传仍有React、ReactNativeDependencies和hermesvm三项缺匹配dSYM警告，未声称无警告；本地归档Development签名不作为分发签名证明，上传使用Organizer正常分发流程。证据为 `build64/archive-verification.json`、`source-commit-binding.json`、`upload-observation.json`、`uploaded-to-apple.png` 与 `upload-warnings.png`。

上传后刷新正常TestFlight页面，实际看到Build64“缺少出口合规证明”、群组栏为空，构建详情链接为 `testflight/ios/4b29d054-e85f-4810-86f5-76add5027a2f`；只读观察在 `build64/testflight-observation.json`。未填写出口合规、改变测试组或发送测试通知；可安装性与真机交互仍待用户后续处理与验证。后续本节和CURRENT更新为打包后文档，不在上述冻结提交或runtime内。此前测试日志能证明实际通过及文件时间一致，未记录测试前source hash，不将其描述为密码学字节绑定证据。

## 获授权后的生产60→60更新

新部署工具独立绑定旧79e91dd与新15e7269，不导入或执行原058→060部署器，无迁移执行入口。只允许306文件精确集合、两份源码delta、60项相同SQL，固定tar/manifest/source及registry/product/catalog/用户授权摘要；异常恢复只在开流前使用同schema旧runtime，保留当前生产数据库和存储，绝不自动恢复生产数据库。独立审查指出的合法但不同来源绑定缺口已补：每个入口包括执行回执加载均要求与工具包内冻结binding对象完全一致。25项本地安全fixture独立通过，包含成功切换、排空拒绝、精确绑定、开流前恢复与开流后失败维持维护。六工具清单SHA256 `7cd9a2097d3b63001bc79fe265c104b0026a377c6d0e5ae2910d98e5fa8bd244`。

通过正常SSH/SCP仅运输正式tar与六份工具/绑定清单至本项目受限准备目录；远端hash、root归属与0600文件/0700目录核验通过。新鲜只读plan确认旧306项与60账本全部匹配，所有active/passive队列、专业Agent在途消息与pending内容预览为0，既有六条媒体费用unknown摘要保持。API/双Worker/备份timer、配置hash与共享路由均符合冻结基线，再执行已获授权的部署。

维护窗口内先准备独立候选、按原lockfile安装生产依赖、字节不变复制当前env，并以实际服务用户验证导入；仅本项目预期Nginx locations临时503，共享路由保持。排空并停止本项目三个服务与备份timer，确认无其他DB连接/预备事务后制作新停写备份。备份恢复到Unix socket隔离PG18核验：全部表摘要、序列、角色/成员、元数据及逻辑约束全部一致，60项迁移，隔离库已停止。存储checksum复制通过，生产DB冻结快照在切换前保持不变。

原子切换 `app` 到 `/opt/projects/marvels-chat/releases/comic-chat-feedback-20261113-15e7269/runtime`，启动原API/双Worker。核对真实进程cwd、服务无重启、两次推进心跳与Worker当前子进程轮询、ready和60账本、306项hash、配置/权限/产品/目录及队列摘要后到 `awaiting_open`。root读取恢复与候选验证回执通过，再调用显式open重复验证并恢复原Nginx字节、移除维护、恢复备份timer；命令退出0，最终 `traffic_opened`。公有health/ready/admin及共享路由检查通过。没有执行迁移、改产品、代用户授权、提交模型任务或生产数据库恢复。

执行日志为仓库外 `production-plan.json`、`production-deploy.log`、`production-open.log`；脱敏回执在 `production-execution/`，服务器完整受限证据在本项目 `backups/comic-chat-feedback-20261113-15e7269-execution/`，数据库备份保留相邻同名目录。这个结果仅证明新runtime已部署并通过运维检查；旧失效消息应使用明确“编辑为新消息”入口，Build64安装后的新消息、键盘、历史成果折叠和作品布局仍待真机复验，不将空队列/health视为真实模型验收。

开流后另一代理独立只读终验PASS：实际app指向15e7269，306项线上hash及精确两源码delta、60项账本、API/双Worker真实cwd与0重启、当前AI子进程两次轮询及AI/media数据库心跳推进、timer active/waiting全部通过。全部active/passive、专业Agent在途与预览仍0，六条历史unknown摘要及registry/release/product/consent/publiccatalog指纹不变；原Nginx字节/元数据、env字节/权限不变。health/ready/admin200，共享路由 `/`200、`/suanming/`401；公开9项包含漫画0.1.6和UI-Agent0.1.0，本机到公网HTTPS另采health/ready/agents200。新恢复checks全true、隔离cluster已停。证据新建在 `production-execution/independent-post-open-20261113T052309Z/`，未覆盖维护前回执；`report.json` SHA256 `17a5ab61ae85918615355e49ea3362d6a0f5788e87af03c9f089d83365ae16f9`。
