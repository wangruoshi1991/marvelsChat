# 妙讯语音消息、聊天能力与一对一通话研究

日期：2026-11-23。正式树：`/Users/gary/.codex/worktrees/admin-lifecycle-release/marvelsChat`，分支 `codex/ui-agent-candidate-20261105`。记录开源源码调研、当前聊天能力边界、语音消息的本地修改及一对一通话方案。验证证据见本文末尾和 [当前交接](../handoffs/CURRENT.md)。

## 并行续修前的聊天能力盘点

本表保留续修前的源码状态。已补齐的送达回执、多选转发、视频和转写翻译见[当前交接](../handoffs/CURRENT.md#2026-11-23-语音转写翻译播放反馈与普通聊天续修)。

| 能力 | 当前源码结论 | 依据 |
| --- | --- | --- |
| 文字发送与失败重试 | 已有乐观消息、发送中、失败点按重试、稳定 clientMessageId、服务端回执合并。不能把服务器接受等同于对方设备收到或读过 | `MiaoxunRN/src/features/session/useMessageActions.ts:72,238,325`。`ChatMessageItem.tsx:632`。`backend/src/schemas.js:57` |
| 本人未读数与已读位置 | 已实现按本人会话 readThrough 更新，保护新到消息。不是对方已读回执 | `backend/database/068_thread_read_positions.sql`。`backend/src/routes/message-routes.js:287`。`backend/src/message-repository.js:793,809` |
| 对方送达/已读标识、正在输入 | 当前未找到收件设备 ACK、peer read/typing 事件和对应 UI。属于新合同 | `backend/src/realtime-gateway.js:99` 仅注册 close。`MiaoxunRN/src/features/session/useRealtimeChannel.ts:103` 消费 connection/message/notification/relationship/presence |
| 草稿 | 普通聊天文字与回复目标关闭后重开可恢复，按账号/会话隔离。存放 App 内存 state，不能宣称杀进程或跨设备持久化 | `MiaoxunRN/src/App.tsx:171,1077`。`MessagesScreen.tsx:605,1296` |
| 回复、搜索、转发 | 已有单条引用回复、当前会话正文搜索分页与跳转、单条消息转发至一个目标会话。后端检查可读源消息和目标好友/群成员资格 | `schemas.js:67`。`ChatHistorySearch.tsx:43`。`chat-forward-routes.js:6,21`。`chat-forward-repository.js:38,55` |
| 多选消息、批量转发/删除 | 当前未实现。附件最多六项不等于消息多选 | 转发 schema 只有单 `messageId`、单 `targetThreadId`，消息菜单使用单 `selectedMessage` |
| 语音消息录制 | 已有 M4A/AAC、麦克风授权、按住录音、上滑取消、左滑锁定、松手试听和明确发送。支持无障碍点按、发送失败重试和 60 秒上限 | `ChatVoiceInput.tsx:17,21,58,108`。`useChatVoice.ts:136,170`。`MiaoxunChatVoiceModule.swift:60,78`。`chat-attachment-service.js:108,131` |
| 语音消息播放 | 支持播放、暂停、续播、真实波形、进度拖动与 1×/1.5×/2×。下载失败可重试，离页释放 | `ChatVoiceMessage.tsx:40,53,83`。`services/chatVoiceAudio.ts`。双端 `MiaoxunChatVoiceModule` |
| 图片 | 已有选择/拍摄、待发预览、私有鉴权下载、查看与保存。真机保存不能仅用 UI 成功文本证明 | `useChatAttachments.ts`。`ChatMessageAttachments.tsx`。`chat-attachment-routes.js:13,29` |
| 文件 | 当前限有效 UTF-8 TXT/Markdown/JSON/CSV/TSV，256 KiB、50,000 字符。不是任意文件或 Office/PDF 通用附件 | `backend/src/file-content.js:5–12,24–31`。`chat-attachment-service.js:134` |
| 普通聊天视频 | 未实现上传类型与聊天播放合同。小站视频和 react-native-video 依赖不能代替聊天视频 | `chat-attachment-routes.js:20` 仅 image/audio/file。`ChatComposerPanels.tsx:109` 无视频工具 |
| 撤回、本人删除 | 已实现。撤回有发送人/时间窗等校验并更新会话副本与引用，删除只针对本人消息视图 | `message-routes.js:316,329`。`message-repository.js:711–788` |
| 文字翻译、已发语音转文字 | 有服务端与客户端合同，必须后端能力明确开放。CURRENT 记录生产仍关闭。设备 Speech 识别输入框是另一条能力 | `backend/src/chat-message-ai.js:87,114,164`。`useChatMessageText.ts`。CURRENT |
| 实时一对一语音/视频通话 | 未实现。搜索 JS/Swift/Kotlin、package/Pod 锁、后台 schema/迁移/实时网关/部署，没有 WebRTC/SDP/ICE/STUN/TURN、CallKit/PushKit/Android Telecom 或通话信令实现 | `MiaoxunRN/package.json`。`backend/src/realtime-gateway.js`。双端原生目录。`MessageActionSheet.tsx:98` 的 phone 图形实际是“创建群聊” |

## 已查证的开源参考

由主代理从公开仓库读取固定提交和 Git tree，再下载源码到 `/private/tmp/miaoxun-voice-reference-20261123/`。本研究读取这些本地文件，未运行外部代码。三份 tree 均 `truncated=false`。Signal 两端 LICENSE 为 AGPL v3，tweb 为 GPL v3。本轮参考交互与状态边界，按妙讯现有模块独立实现，没有复制它们的实现代码或视觉资产。

### Signal iOS

提交：`45372289a9387cd4271a2f7a47dba8ba92951e41`。

- [CVAudioPlayback.swift：播放身份、位置及状态](https://github.com/signalapp/Signal-iOS/blob/45372289a9387cd4271a2f7a47dba8ba92951e41/Signal/ConversationView/CVAudioPlayback.swift#L9)。9–18 用消息和附件共同标识一次播放。72–90 将进度、时长和速率分别建模。127–145 恢复位置并通知旧播放器状态。294–320 区分暂停保留位置、结束归零。妙讯应把原生回执绑定到当前账号和播放实例，避免列表复用或晚回执串到另一条语音。
- [AudioMessageView.swift：真实波形与播放进度](https://github.com/signalapp/Signal-iOS/blob/45372289a9387cd4271a2f7a47dba8ba92951e41/Signal/ConversationView/CellViews/AudioMessageView.swift#L91)。真实波形不可用时不制造另一份音量数据。妙讯在下载前用明确中性的等高短条，下载播放后由实际 PCM 计算 32 条。不能从附件 ID 或随机数生成“真实声纹”。
- [ConversationViewController+VoiceMessage.swift：录制与草稿](https://github.com/signalapp/Signal-iOS/blob/45372289a9387cd4271a2f7a47dba8ba92951e41/Signal/ConversationView/ConversationViewController%2BVoiceMessage.swift#L10)。10–43 开始录制前停止已有播放，麦克风授权回调复验当前录制身份。74–101 结束后区分立即发送与保存草稿。可指导下一阶段试听/锁定设计，不代表本轮已经加入。

### Signal Android

提交：`8959dc6e1329f882951b16ae87e22e60d1c11516`。

- [VoiceNotePlayerView.kt：播放暂停、位置与读屏](https://github.com/signalapp/Signal-Android/blob/8959dc6e1329f882951b16ae87e22e60d1c11516/app/src/main/java/org/thoughtcrime/securesms/components/voice/VoiceNotePlayerView.kt#L95)。95–105 暂停后从已有位置继续，已到结尾才从零开始。143–144 来自实际位置/时长/速率。199–202 辅助功能文本随播放状态改变。适用于妙讯圆形播放/暂停按钮、真实进度和读屏标签。
- [VoiceNoteMediaController.kt：操作必须命中当前音轨](https://github.com/signalapp/Signal-Android/blob/8959dc6e1329f882951b16ae87e22e60d1c11516/app/src/main/java/org/thoughtcrime/securesms/components/voice/VoiceNoteMediaController.kt#L221)。221–258 拖动、停止、变速都核对当前媒体 URI。妙讯同样不能让旧消息按钮控制新消息的播放器。
- [VoiceMessageRecordingDelegate.kt：发送、丢弃、保存分支](https://github.com/signalapp/Signal-Android/blob/8959dc6e1329f882951b16ae87e22e60d1c11516/app/src/main/java/org/thoughtcrime/securesms/conversation/v2/VoiceMessageRecordingDelegate.kt#L124)。132–147 有草稿快照及三个明确结束分支。可供后续长录制和被打断恢复参考。

### Telegram Web K / tweb

提交：`2e4bbb52b6aec5e95ee32e5c2882c1f05de32200`。

- [audio.tsx：波形来源及播放着色](https://github.com/morethanwords/tweb/blob/2e4bbb52b6aec5e95ee32e5c2882c1f05de32200/src/components/audio.tsx#L258)。258–261 解码附件实际波形元数据。321–335 用 `currentTime/duration` 推动已播放区域，暂停时停止 ticker。名称中的 fake 图层只是波形着色副本，不是造一段音频数据。
- [mediaProgressLine.ts：拖动恢复原播放状态](https://github.com/morethanwords/tweb/blob/2e4bbb52b6aec5e95ee32e5c2882c1f05de32200/src/components/mediaProgressLine.ts#L98)。98–105 先初始化真实总时长再绘制。110–125 拖动前记住是否播放，松手只恢复原本在播放的媒体。469–499 对称注销媒体监听与 ticker。后续做拖动时应验暂停拖动后不擅自开始播放。
- [voiceRecordingPanel.ts：录音与试听分态](https://github.com/morethanwords/tweb/blob/2e4bbb52b6aec5e95ee32e5c2882c1f05de32200/src/components/chat/voiceRecording/voiceRecordingPanel.ts#L29)。29–36 将取消、暂停录音、试听、拖动分开。127–165 按录制/暂停/试听切换标签和真实峰值。适合下一阶段录制面板，不能只增加几个按钮而没有底层能力。

## 本轮与后续优先级

1. **本轮已实现的语音播放体验**：圆形播放/暂停。由播放器位置驱动进度，暂停后续播。按用户点播下载，真实 PCM 聚合 32 条。未播放前为等高刻度，不做列表批量预取。验收目标包括下载、暂停、续播、结束与重播、切换消息、迟到回执、鉴权失败、退出页面和切换账号。实际测试结果见下节。
2. **第二阶段录制交互已实现**。普通松手进入本机待发录音，上滑取消，左滑锁定。待发时可试听、丢弃或明确发送。录制中退到后台会取消，离开会话会释放录音文件。已经完成的草稿可在短暂离开前台期间保留，账户或会话切换时释放。
3. **第二阶段播放控制已实现**。波形支持点按或拖动，松手只提交一次定位，竖向移动、手势中断和多指取消定位。辅助功能可前后调整五秒。播放或暂停时可切换 1×、1.5×、2×，每次开始播放重置到 1×，定位和倍速均保留暂停态。
4. **另立聊天需求**：对方送达/已读、typing、多选、普通聊天视频。送达需定义“服务器接受/某设备收到/用户看到”。已读与 typing 需要隐私开关、对端授权、离线/多设备语义和服务器事件。多选需批量授权/部分失败合同。视频需上传格式/额度/转码/缩略图/私有播放及保存完整链路。
5. **一对一通话独立里程碑**：采用下面的阶段方案。在音频消息优化中不预留一个可点击但没有真实能力的电话入口。

## 一对一语音通话分阶段方案

已开始交付前台隔离版。当前实现使用显式配置的单个 API 进程、PostgreSQL 通话状态和有界内存信令，客户端轮询传输信令。后续阶段仍按系统来电和中继网络分开验收。 [当前接口与部署边界](../../backend/VOICE_CALLS.md)

### 目标和架构

首版限定普通好友一对一音频，不包含 Agent、群通话或视频。复用现有 Express、PostgreSQL、认证会话及 WebSocket 下发，无需先拆一个信令微服务。新增 `calls` 业务域。RN TypeScript 拥有呼叫流程、页面和状态。一个共享 JS 通话 API 对接双端 WebRTC、系统音频路由和系统来电适配。原生代码只负责平台能力，不复制好友权限或呼叫业务。

- **控制面**：建议新增认证 `/api/calls` 及接受、拒绝、取消、挂断、查询接口（只是方案，不是现有 API）。POST 用稳定幂等键。服务端生成 callId，记录参与账号/被选设备、revision、到期、接通与结束时间、结束原因。既有 WS 广播白名单 call 事件。重连后先读服务端状态，再处理未过期事件。
- **状态机**：`ringing → connecting → active → ended`。拒绝、取消、未接、忙线、失败均为终态原因。状态由事务比较 revision 驱动。双方同时呼叫及同一用户多个终端抢答时仅一个胜出。结束后拒绝迟到 answer/ICE，重复挂断返回同一回执。UI 本地还可有 preparing/reconnecting，但不能由 UI 擅自写服务器接通。
- **权限**：双方账号 active、有效好友且无阻止规则，发起、接受与信令转发都查参与者和认证设备。不接受客户端指定任意 recipient。认证注销/撤销后终止该设备通话。离开聊天页面是否继续通话需有明确的持续通话 UI。频率/并发/最长响铃/未接过期由服务端控制。
- **媒体面**：WebRTC 传音频。STUN/TURN 从正式配置取得。TURN 用后端签发的短效凭据，核对账号和呼叫资格，限制中继范围、过期与额度。默认直连还是强制 relay 的 IP 隐私/成本取舍需要在设计中定下。不能塞公共默认 TURN 或将静态服务密钥放 App。DTLS-SRTP 是传输基础，不把它自动称为已完成独立身份验证的端到端加密产品。
- **数据边界**：默认不录音。数据库保存必要通话状态与最少审计元数据。原始 SDP、ICE 地址和媒体内容不进一般日志/审计。信令负载大小、速率、生命周期要有上限。冷启动通过 callId 读最新授权状态，已结束的来电不得重新响铃。

### 分阶段交付及验收

| 阶段 | 交付 | 验收 |
| --- | --- | --- |
| 1. 隔离前台垂直链路 | RN 0.87 兼容 WebRTC 接入验证。共享 JS API。双端前台音频。Express/PG 信令状态机。仅隔离账号开放 | 两部设备双向真实听音。接听/拒绝/取消/超时/忙线。同时呼叫、多设备抢答、重复请求和乱序。未授权账号不能探知/接听/转发信令。麦克风拒绝、解码/连接失败显式显示。退出账号和撤销会话立即失效 |
| 2. 原生系统与后台 | iOS CallKit/PushKit/APNs 真实来电。Android Telecom/通知/适配版本的前台通话服务及推送。扬声器/听筒/蓝牙、音频焦点 | 两端实体机锁屏、后台、冷启动、系统电话/其他音频打断、耳机拔插/蓝牙切换。过期推送、取消后推送、多终端只接一次。挂断后麦克风、系统来电 UI、通知全部回收。前台模拟器通话不能代替这些通过 |
| 3. 网络与正式开放 | 明确 STUN/TURN/证书/防火墙配置、运行监控及成本上限。迁移/发布/回退文档。经授权部署后小范围开放 | 不同网络和 NAT、强制 relay、UDP 受限、Wi-Fi↔移动网、短断网恢复/超时结束、服务器重启、长时间通话。记录建连时间、丢包/抖动、失败原因及 TURN 中继出口字节。上线与真机回归分别留证 |

费用按实际中继出口 GB、主机资源和选定托管/推送服务计算，不先假设固定单价或免费。新增依赖选型、TURN/推送基础设施、生产配置/防火墙部署和付费服务使用需要明确范围。本研究没有创建基础设施、调用供应商、部署或上传客户端。先通过隔离原型和设备验收形成可评审候选，再由用户授权相应发布与费用动作。


## 本轮验证

- iPhone 17、iOS 26.5 隔离模拟器对正式 RN 语音组件和原生音频桥使用合成 AAC。XCUITest 通过加载、首次播放、暂停与续播、切换语音、切换会话、播放结束、失败入口和深浅色检查。暂停期间 16 次采样均为 2,463 ms，恢复后的第一笔播放位置为 2,556 ms。原生波形返回 32 段。另以 macOS AVFoundation 的 PCM/AAC 合成夹具通过十项波形检查，覆盖响度差异、静音、损坏、上限、取消和临时文件清理。
- 同一 iPhone 17 隔离模拟器安装使用正式入口的独立 Bundle，连接临时 Express 和 PostgreSQL 18 数据库。空库应用 70 份迁移至 071，初始化管家夹具后，两名合成账号建立好友并发送 12.051 秒 AAC。上传与发送各返回 201，收件方下载返回 200、字节一致，匿名读取返回 401。App 从登录连接到同一合成会话，点播、暂停与继续通过。该轮登录表单修复补了键盘避让、可滚动表单和回车提交。XCUITest 定位到会话行后用其中心坐标点入。
- Pixel 7、Android 16 隔离模拟器用 Debug APK 和正式 RN 语音组件实测。原生返回 32 段实际波形。暂停位置连续 16 次为 1,145 ms，续播后推进到 2,381 ms。切换语音、切换会话和 503 显示重试通过。两端实体机的扬声器、蓝牙、系统音频打断及实际读屏播报继续待验。
- 上次审查的聊天缩略图重试和 3D Web 工作区刷新修复已应用正式树。聊天定向测试覆盖断网后手动重试、按图隔离和拒绝旧会话回调。3D Web 真实 Chromium 用合成 API 覆盖 320、1440、1920 三种宽度的成功和取消终态。两次失败后只读刷新恢复，创建按钮在状态待同步时禁用，零意外请求与页面异常。
- `MIAOXUN_DOTENV_ENABLED=false ./scripts/check-repository.sh` 和 `git diff --check` 通过，RN 132 套 1,628 项，Avatar Web 11 套 44 项。后台 438 个环境门控用例在整仓检查跳过。上述 PostgreSQL 音频链路另有实际验证。
- 公网 health、ready、后台首页和公开 Agent 目录只读返回 200。精确的线上账本号、Worker 心跳及 Build 69 装机状态沿此前交接。本轮改动在正式工作树，客户端待后续构建分发。

生成截图及本轮测试工作目录位于本机 `/private/tmp/miaoxun-voice-ui-20261123`。XCUITest 回执 `real-chat-direct.xcresult` 和 `voice-ui.xcresult` 使用隔离合成数据。Chromium 证据位于 `/private/tmp/miaoxun-avatar-refresh-browser`。

## 第二阶段录音与播放控制

- iPhone 17（iOS 26.5）使用独立 Bundle 进入完整聊天界面，后端为回环 Express 与隔离 PostgreSQL。XCUITest 实测暂停后横拖到约 8 秒、1.5× 时保持暂停、恢复并播完。上滑录音取消后仍为原消息数，左滑锁定继续录音，结束后试听、暂停，再点发送。隔离 API 记录一次附件上传 201 与一次消息创建 201。
- Pixel 7（Android 16）用独立 Debug APK 进入同一隔离聊天，实测暂停后由 1 秒拖到 6 秒，切 1.5× 再切 2× 仍保持暂停，恢复播放后回到 1×。录音上滑取消、左滑锁定、本地试听与丢弃均通过。普通松手保留本地待发录音，点发送新增一条消息。两端的待发试听期间均未触发上传。
- `MIAOXUN_DOTENV_ENABLED=false ./scripts/check-repository.sh` 通过，RN 132 套 1,631 项。独立手势夹具 8 项通过。两端构建和 `git diff --check` 通过。模拟器使用普通字体。实体设备的麦克风、扬声器、蓝牙、锁屏及真实读屏仍待验。公网 health 和 ready 只读返回 200。
- 本机证据目录 `/private/tmp/miaoxun-voice-stage2` 包含 `ios-interaction-v2.xcresult`、双端构建与 UI 回执。本轮改动仍在本地候选。
