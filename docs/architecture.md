# 架构说明

妙讯采用单仓库多目录独立工程结构，当前阶段不拆多个 Git 仓库。

根目录不承载统一依赖包。具体依赖分别放在：

- `MiaoxunRN/package.json`：正式移动端 React Native 工程依赖。
- `admin/package.json`：后台管理系统前端构建和界面依赖。
- `backend/package.json`：Node.js API、PostgreSQL、鉴权、Agent 编排依赖。
- `agents/package.json`：Agent 注册和定义。
- `station-web/package.json`：个人主页预览、分享和法律页面渲染器。

## 分层

```text
MiaoxunRN / station-web / admin -> backend -> PostgreSQL / OSS / agents / model provider
```

- `MiaoxunRN`：正式移动端主线。采用 React Native，并通过 iOS 原生工程接入 Keychain、权限、启动配置和后续推送能力。
- `admin`：后台管理系统前端。当前为 Vite + 原生 JavaScript/CSS，调用 `/api/admin/*`，但不单独拥有后台后端服务。
- `backend`：Node.js + Express API、鉴权、PostgreSQL、运营管理、Agent 编排、New API 中转。
- `backend/database`：PostgreSQL schema，当前包含用户、资料、会话、消息、事件、Agent 运行记录、社交关系、好友申请、通知和搜索历史。
- `agents`：每个 Agent 独立声明能力、权限、提示词计划和 fallback。
- `station-web`：接收后端安全投影的主页 JSON，同一渲染器服务 App WebView 预览和匿名分享页。
- `python`：当前没有 Python 工程；后续如接入媒体生成、文件解析、模型处理或长任务队列，应作为独立 worker/service 引入，不混入 RN 或 Node API 进程。
- `docs`：任何结构和接口变化都要同步记录。

## 移动端技术栈

正式移动端当前采用 React Native：

- `React Native`：页面、导航状态和移动端交互。
- `TypeScript`：业务类型、API DTO 和前端状态逻辑。
- `react-native-keychain`：保存登录 token。
- `react-native-safe-area-context`：处理 iOS 安全区。
- `Info.plist` / Xcode build settings：显式注入 `MiaoxunAPIBaseURL` 等原生配置。
- `NativeModules` 薄桥接：相机扫码、推送、相册、文件和分享等系统能力按平台实现，业务层只调用 `src/services` 中的统一接口。
- `CoreLocation` / Android `LocationManager`：只负责获取用户授权后的坐标；社区和活动区域解析由后端完成。

iOS 和后台管理前端都不直接访问 PostgreSQL，不直接 import `agents/`，不保存 Agent 私钥或模型供应商密钥。它们只通过 `/api` 使用后端能力；需要实时回复时，优先由后端提供 SSE 或 WebSocket。

## Build 24 个人主页架构

```text
用户明确选择 3-9 张照片
  -> 私有 OSS 上传 / 已有素材 ID
  -> POST /api/station/homepage-jobs
  -> 可恢复异步任务 + 20 秒模型截止时间
  -> revision 草稿
  -> PATCH 编辑 / refine
  -> 短期 preview token
  -> station-web 同源精确预览
  -> immutable release
  -> private 或可撤销 link
```

关键边界：

- 后端只接受当前用户拥有且状态为 uploaded 的显式素材 ID。
- 模型上下文只包含必要的资料和素材元数据，不发送 OSS 存储键、原始文件名或照片二进制。
- 模型结果只能进入固定 schema，不接受任意 HTML、CSS 或 JavaScript。
- 草稿用 revision 做乐观并发控制；发布版本不可变，恢复会创建新草稿。
- 预览令牌只保存哈希并短期有效；分享令牌可撤销，停止分享后旧 URL 失效。
- OSS 保持私有，浏览器只获得短期签名 GET URL。
- 主页普通 UI 不显示 provider、模型错误、环境变量或数据库信息。
- 分享页和编辑页显示“AI 生成内容”。

`station-web` 的静态资源由后端在 `/site-assets/*` 提供。`/preview/:token` 和 `/s/:token` 返回相同 shell，再分别读取 `/api/homepage-previews/:token` 与 `/api/homepage-shares/:token`。这保证 App WebView 和浏览器分享没有第二套渲染逻辑。

Build 24 在生产环境必须同时满足 `HOMEPAGE_V1_ENABLED=true` 和 allowlist 命中。关闭 flag 只隐藏新闭环，不删除增量数据库表，也不破坏 Build 23 API。

## 移动端原生桥接原则

跨平台业务必须优先放在 `MiaoxunRN/src`，原生层只负责系统 API 适配。
React Native 项目允许存在必要的 iOS / Android 薄桥接，但桥接不能承载聊天、小站、Agent 编排等业务逻辑。

当前扫码桥接：

```text
src/services/qrScanner.ts
  -> iOS QRCodeScannerModule.swift / QRCodeScannerViewController.swift
  -> Android QRCodeScannerModule.kt / QRCodeScannerActivity.kt
```

iOS 使用 `AVFoundation`，Android 使用 CameraX + ML Kit bundled barcode-scanning。两个平台都暴露同一个 `QRCodeScannerModule.scan()` Promise 接口，返回真实二维码文本；权限拒绝、用户取消和设备不可用都返回明确错误状态。
扫码从 RN 菜单触发时，必须先关闭 RN Modal，并由关闭完成事件触发原生相机页。iOS 必须在 present 前确认存在可用视频设备；`AVCaptureSession` 的 start/stop 必须在专用 session 队列执行，不能阻塞主线程或和页面 dismiss 动画竞争。
如果产品后续不使用 QR Code 或不需要实时相机识别，应移除对应原生扫码桥接和权限声明，改为纯 RN 输入、链接打开或后端校验流程。

小站展示的码必须是标准 QR Code，本体不得使用随机形状、手绘模块或遮挡静区；视觉风格只能放在外框、贴纸、标题等不影响识别的位置。

API 地址通过 `MiaoxunConfigModule.apiBaseURL` 统一暴露给 JS：iOS 从 `Info.plist` 的 `MiaoxunAPIBaseURL` 读取，Android 从 `BuildConfig.MIAOXUN_API_BASE_URL` 读取。配置缺失或格式错误必须直接失败，不允许回退到示例地址或本地默认地址。

当前定位桥接：

```text
src/services/location.ts
  -> iOS MiaoxunLocationModule.currentLocation()
  -> Android MiaoxunLocationModule.currentLocation()
```

定位桥接只返回 `latitude`、`longitude` 和 `horizontalAccuracy`。`POST /api/location/resolve` 在后端调用显式配置的 Nominatim-compatible 反向地理编码服务，提取社区和活动区域候选；后端写入和返回 `community`、`activity_area` 时会清洗 Nominatim 多语言分号别名，只保留一个正式展示标签。`GET /api/map/style` 返回 MapLibre 样式，`GET /api/map/tiles/:z/:x/:y.png` 由后端代理显式配置的地图瓦片服务。没有 `GEOCODING_REVERSE_URL`、`GEOCODING_USER_AGENT`、`MAP_TILE_URL_TEMPLATE`、`MAP_TILE_USER_AGENT` 或 `PUBLIC_API_BASE_URL` 时直接返回 503，不使用公共服务或本地默认值。地图样式里的瓦片 URL 必须由 `PUBLIC_API_BASE_URL` 生成，线上必须是 `https://api.marvelschat.com`，不能从反向代理请求协议推断，避免 iOS 真机拿到 `http` 瓦片地址。客户端位置入口在小站页，使用开源 `@maplibre/maplibre-react-native` 提供可拖动缩放地图，用户点选位置后重新解析该点，再从候选中选择社区和活动区域，点击保存后才写入 `user_profiles`。线上如果使用高德 Web 服务和高德瓦片，客户端必须明确处理 WGS84 与 GCJ-02 坐标转换：原生定位和后端解析使用 WGS84，地图展示和地图点选使用 GCJ-02。高德地图属于商业 SDK/服务，不是开源替代；如采用高德，必须补正式 Key、平台 SDK 配置和上线合规说明。

## 后端技术栈

后端采用 Node.js + Express + PostgreSQL。当前没有 Python 后端；Python 只作为后续 AI/媒体/文件处理 worker 的候选技术，不作为现阶段主 API 技术栈。

- `Express`：提供 REST API、鉴权中间件、后台管理接口。
- `PostgreSQL`：保存用户、资料、会话、消息、授权、事件和 Agent 运行记录。
- `Zod`：校验请求输入。
- `agents/registry.js`：注册 Agent 元数据和执行计划。
- `backend/src/agent-runtime.js`：统一调用模型供应商，写入运行记录，不让客户端直接碰模型调用。

## 当前真实数据链路

```text
用户注册/登录 -> users/auth_sessions
App 启动 -> /api/app/bootstrap -> user_profiles/chat_threads/chat_messages/user_agents
聊天发送 -> chat_messages -> agent runtime -> chat_messages/agent_runs
扫码主页 -> /api/scan/resolve -> users/user_profiles/social_relationships/social_requests
定位建议 -> CoreLocation/LocationManager -> /api/location/resolve -> configured geocoder
资料保存 -> /api/me/profile -> user_profiles/avatar_config/community/activity_area
注册形象 -> backend avatar-service deterministic seed -> user_profiles.avatar_config v2
Agent 身份 -> agents/*.agent.js identity -> /api/app/bootstrap agents.registered -> 客户端 AgentAvatar
关注/好友 -> social_relationships/social_requests -> notification-service -> notifications
好友通过 -> social_relationships -> chat_threads(peer_user_id)
好友聊天 -> current chat_messages -> peer chat_messages + unread_count
在线好友聊天 -> /api/realtime WebSocket -> thread.message
妙讯聊天入口 -> 点击或右滑会话进入 ChatScreen / 左滑 ChatScreen 或点击 < 返回妙讯页
客户端行为 -> /api/events -> usage_events
后台管理 -> /api/admin/* -> PostgreSQL 聚合查询/账号管理
```

数据库未配置、未迁移或连接失败时，后端返回明确错误。App 不展示原型账号、静态聊天、静态 Agent 或静态内容流作为真实数据；未登录时只进入登录/注册流程。

启动动画只表达“AI 不只问答 / 找人，找东西 / 就上妙讯小站”。登录和注册页不展示未上线的忘记密码、短信或邮件验证说明；对应能力接入后再补真实入口，不在客户端放提前说明。`MiaoxunRN/scripts/patch-react-native-filament.js` 是 React Native 0.86 / React 19 下的依赖适配脚本：安装后移除 `react-native-filament` 的旧 `defaultProps` 写法，让 `FilamentView` 直接读取 Fabric public instance 的 `__nativeTag`、`_nativeTag` 或 `canonical.nativeTag`，把 `withCleanupScope` 的清理调度从已废弃的 `InteractionManager.runAfterInteractions` 改为 `requestIdleCallback`，并将原生 `PointerHolder::release()` 调整为幂等释放，避免 Release/TestFlight 生命周期里同一 Filament 资源被 JS cleanup 和原生 GC 重复释放时抛异常崩溃，不再触发 RN DevTools warning。App 不使用 `LogBox.ignoreLogs` 兜底隐藏 warning。

后台管理系统与 App 使用不同的本地登录态。后台可以创建账号、启用/停用用户、调整角色、编辑资料、管理 Agent 授权、撤销登录态、重置密码；这些动作会写入 `usage_events`。

## Agent 运行时

`agents/` 与前后端分离。后端通过 `agents/registry.js` 注册 Agent，再由 `backend/src/agent-runtime.js` 调用。

- 配置 `NEW_API_BASE_URL`、`NEW_API_KEY`、`NEW_API_MODEL` 后，妙讯管家会走 OpenAI-compatible `/v1/chat/completions`。
- 未配置模型服务时，后端仍保存消息和运行记录，但 `provider` 标记为 `not-configured`，不会伪造 token。

后续多 Agent 接入建议分三层推进：

1. 注册层：每个 Agent 声明 `key`、能力、权限、可见范围、不可编辑的 `identity` 头像标识和默认提示词计划；registry 对 identity 做结构校验，缺失配置时拒绝注册。
2. 编排层：由后端根据用户授权、会话上下文和任务类型选择单 Agent 或多 Agent 协作。
3. 交互层：客户端展示 Agent 列表、授权状态、调用进度和结果，不关心底层模型供应商。

需要长任务、流式输出或多 Agent 协作时，优先扩展后端接口，例如：

- `GET /api/agents`：注册 Agent 列表。
- `PATCH /api/admin/users/:userId/agents/:agentId`：授权管理。
- `POST /api/threads/:threadId/messages`：当前消息入口。`agent_id` 线程触发 Agent runtime；`peer_user_id` direct 线程写入当前线程并镜像到对方线程。
- `DELETE /api/threads/:threadId/messages/:messageId`：单侧删除当前用户线程里的消息，写入 `deleted_at`，不删除对方线程。
- `POST /api/threads/:threadId/messages/:messageId/recall`：发送者在发送后 1 分钟内撤回消息；后端用 PostgreSQL `created_at` 和 `CURRENT_TIMESTAMP` 判断撤回窗口，再按 `client_message_id` 更新双方 direct 消息的 `recalled_at`，并通过 WebSocket 推送对方消息更新。历史消息缺少 `client_message_id` 或超过撤回窗口时直接返回明确错误。
- `POST /api/social/friends/:friendUserId/thread`：校验双方为 active 好友后返回或创建 direct 好友线程。
- `PATCH /api/me/presence`：保存当前用户 `presenceMode`，只允许 `online / offline / hidden`。公开资料、搜索、好友/关注列表和 direct 线程只输出 `presenceStatus`，规则为 `presenceMode=online` 且当前 WebSocket 在线时显示 `online`，否则显示 `offline`；仅本人接口可看到自己的 `presenceMode`。后端在 WebSocket 首次连接、最后一个连接断开和本人切换在线模式时向好友、关注关系和 direct 聊天相关用户推送 `presence.changed`，客户端收到后重新读取真实 bootstrap 数据，保证列表和主页状态及时一致。
- `PATCH /api/me/profile`：保存当前用户昵称、头像文字、简介、社区、活动区域和形象配置。
- `POST /api/location/resolve`：按坐标调用配置好的 Nominatim-compatible 反向地理编码服务，返回附近社区候选和活动区域候选。
- `GET /api/map/style`：返回 MapLibre 样式，样式中的瓦片 URL 由 `PUBLIC_API_BASE_URL` 指向后端代理并携带当前登录 token。
- `GET /api/map/tiles/:z/:x/:y.png`：通过后端代理地图瓦片，客户端不直接依赖第三方瓦片域名。
- `GET /api/realtime`：WebSocket 实时通道。登录用户通过 session token 建立连接，direct 消息写入对方线程后立即推送 `thread.message` 给在线对方；关注、好友申请、好友通过、通知已读会推送 `notification.changed`，关注关系和好友关系变化会推送 `relationships.changed`，在线状态变化会推送 `presence.changed`。客户端收到事件后只重新读取真实通知/增量同步或 bootstrap，不把通知、关系或在线状态复制成第二套状态。客户端按 token 生命周期保持连接，异常断开后只重连同一个 WebSocket 通道，并明确展示未连接/连接中状态，不做短轮询兜底。
- 客户端发送状态是 UI 内存态，不是后端消息状态；只有 `POST /api/threads/:threadId/messages` 成功返回的 `chat_messages` 记录才表示真实已保存消息。后续如需已送达、已读、正在输入，必须新增后端字段或事件表并通过 API/WebSocket 发布。
- `GET /api/app/sync`：按 `chat_threads.updated_at` 做增量同步。
- `POST /api/threads/:threadId/read`：将当前线程未读数清零。
- `POST /api/agent-runs`：后续可新增的显式任务入口。
- `GET /api/agent-runs/:runId/events`：后续可新增的 SSE 事件流。

## 未接入模块的处理

动态、相册、文件、社交评分、长期记忆、收藏列表、签名动态码、好友拒绝/取消和内容级可见性当前没有完整数据表或业务 API，因此 App 保留模块入口和真实空状态，不填充客户端假数据。后续接入时先补 PostgreSQL schema 和 API，再把空状态替换为真实列表、内容和操作。

扫码主页、关注、好友申请、好友通过通知、好友 direct 聊天线程、通知未读、用户搜索、搜索历史、在线/离线/隐藏、主页展示开关、好友列表、关注列表、粉丝列表、用户资料编辑和地图点选定位已进入前后端闭环。公开主页是用户关系动作的统一入口，可由扫码、搜索、好友列表、关注列表、粉丝列表和好友聊天页进入；好友列表中头像/资料区域进入主页，消息图标进入聊天，聊天页右上角资料按钮进入同一公开主页。好友聊天已支持真实发送中、失败、重试、回复、复制、单侧删除、发送后 1 分钟内撤回和 WebSocket 在线接收；长按操作浮层由客户端贴近被选消息展示。真实用户和 Agent 聊天正文按发送时内容保存和展示，客户端不自动翻译历史消息；切换语言只影响 UI、状态、操作提示和本地妙讯管家动作结果。

小站页承载位置、本人在线状态和 3D 形象展示，设置页不承载这些个人主页内容编辑。“我的小站”面板按原型结构保留 3D 形象舞台、个人日记、个人相册、喜欢的音乐菜单、可调用能力 Agent 和我的文件的位置；未接入内容模块只展示真实空状态，不展示示例列表、示例封面、示例数量或示例文件，补后端 schema/API 后再接真实列表。

`avatar_config` 只用于人类用户的小站展示和用户小头像，当前不提供正式编辑入口。小站主舞台已接入 `react-native-filament@1.9.0` 渲染真实 GLB，iOS 使用 Metal，Android 后续使用同一 RN 渲染层，滑动时只旋转模型本体。本地模型资源为 `MiaoxunRN/src/assets/avatar/miaoxun-avatar.glb`，由 `MiaoxunRN/scripts/generate-miaoxun-avatar-glb.js` 通过 `npm run generate:avatar-model` 可复现生成；当前 GLB 为低模卡通人形验证资产，只用于验证模型加载、材质更新、舞台旋转、Skybox 背景和真机稳定性。主舞台使用不透明 `FilamentView`、固定色 `Skybox` 背景、正面方向光和点光校准亮度；`Skybox` 只用于填满背景像素，避免 iOS 真机透明 Metal 层露出未清屏缓冲，不接入环境贴图或 `EnvironmentalLight`。

已删除未达上线标准的捏脸、装扮、动作和上传图片生成编辑器。当前脚本几何 GLB 不能作为最终 QQ 秀级形象方案；要达到完整人物、发型、服装褶皱和动作统一画风，必须接入完整授权角色模型/贴图/动作资产管线。升级商业素材库、骨骼动画或图片生成形象时需要新增模型/素材资源、生成服务、审核流程、模型压缩、跨平台性能验证和资源授权记录。Agent 头像由 Agent 注册 identity 决定，不允许复用用户可编辑形象。收藏列表、签名动态码、好友拒绝/取消、群聊、已读回执、正在输入、媒体消息和内容级可见性记录在 [社交关系流程](social-graph.md)，后续必须继续按后端校验优先实现。

App 通知列表只读取 `notifications` 表；通知创建、标题正文、通知种类集中在后端 `backend/src/notification-service.js`，社交关系仓储只返回创建结果，接口层负责实时推送刷新信号。当前标准通知种类为 `friend.request`、`friend.accepted`、`follow.created`，后续关注的人发布动态、收藏板块更新、系统审核等通知必须先扩展 `notification-service` 枚举和模板，再接入对应业务事件。`usage_events` 和 `agent_runs` 保持为后台审计与运行记录，不进入用户通知流。客户端在妙讯页 `聊天 / 通知` 切换中显示通知未读数，进入通知列表不会自动清空，点击单条、通过好友申请或显式标记已读才更新 `read_at`。妙讯管家当前聊天页内的同步回复不计入会话未读，只有用户未打开的会话消息才应显示未读数字。

2026-06-24 真机回归修复：登录流程必须在 `login` 和首屏 `bootstrap` 都成功后才写入本地 token 并进入主界面，避免网络超时时出现按钮持续刷新、二次点击后半同步进入的状态；登录页本地提交锁防止 React 状态尚未刷新时重复发起登录。小站在线/离线/隐藏菜单使用 RN `Modal` 透明浮层，按点击位置计算弹层坐标，不再放在滚动内容内部的固定 absolute 层，避免 iPhone 真机上被 AI ID 或资料区遮挡。小站 3D 舞台继续使用真实 GLB/Filament 渲染，但相机、灯光、场景参数和配饰缩放使用稳定引用，形象配置按内容 key 归一化，减少 profile/bootstrap 刷新导致的原生资源重复初始化；真机背景闪烁问题通过不透明 `FilamentView` 和固定色 `Skybox` 处理，不恢复 `EnvironmentalLight`，不改为 2D。好友聊天页不再展示“实时聊天未连接 / 正在连接实时聊天”顶部横幅，实时连接状态保留在 session 内部，用户只在具体发送失败或重试时看到操作结果。WebSocket 生命周期只绑定登录 token，presence 事件直接更新本地公开在线状态并触发增量同步，不能因本人 `presenceMode` 变化重建连接。妙讯页会话左滑进入聊天，聊天页左滑退出，动画位移必须跟手并按距离或速度完成。
