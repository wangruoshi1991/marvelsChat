# MiaoxunRN

## 妙 / 讯 / 我与二楼

以下描述当前源码能力；实际服务器版本、设备安装和验收状态见[当前交接](../docs/handoffs/CURRENT.md)。

截至当前交接，客户端合同为 `aiTasks:1 / siteDocuments:2 / agentWorkspaces:6`；发布目录与 entitlement 链路的迁移 046–048 已在隔离 PostgreSQL 验证，尚未据此宣称生产已部署。Build54 的 TestFlight 状态、设备安装和验收结论只以[当前交接](../docs/handoffs/CURRENT.md)为准；本地源码和未提交修复可能领先于已分发构建。

底栏为妙、讯、我，冷启动和切换账号默认进入讯。妙展示真实任务动态；卡片读取真实 `GET /api/tasks` 与 `GET /api/agent-workspaces`，展示目标、执行状态和已持久化的工作空间信息。普通同步对话不混入任务动态。Agent 添加管理保留在我的小站入口。讯使用“对话 / 任务”分段及独立通知入口。

当前视觉以 V15 Plan3 原型为准：妙页和我页使用深色画布，讯页、对话、任务、二楼及讯内页面使用浅色画布和青色强调。V15 只用于视觉与状态核对，不把原型演示账号、统计数字或未接入能力写入真实数据；我页折叠、资料卡缩小/恢复和长按三向菜单的现有交互继续保留。

讯对话列表在顶部纵向下拉，经0.56阻尼后显示位移达到86pt，松开进入二楼；短拖回弹，静止时无提示占位。二楼按实际宽度显示五张完整功能卡，六项横向滚动并按一卡间距吸附，进出卡缩放；底部拖拽柄上滑55pt返回，另支持无障碍和Android系统返回。我保留原小站，已访问的小站在切换栏时保留挂载、暂停交互。账号切换重置导航与二楼页面状态。

妙/讯共用 `VoiceShortcutDock` 的三方向长按菜单，轴向中心距约80pt、入口同幅上移16pt；两页均为上/左/下，分别映射键盘、妙管家、瀑布或任务。轻点不展开菜单；长按后才显示入口。原地松手取消，140ms收起且立即禁交互；转写先入可编辑草稿，不自动发送。首次权限由用户显式准备，成功后重新长按才识别。妙长按隐藏底栏；读屏用户可使用显式“开始语音输入”长按操作。最新验收见[当前交接](../docs/handoffs/CURRENT.md)。

二楼相册复用内容列表/编辑组件，部分上传失败保留新相册和成功素材，明确提示用户进入详情检查后继续添加；原小站创建流程仍保留其原有整体回滚语义。文件入口目前支持 TXT、Markdown、JSON、CSV、TSV 的 UTF-8 正文上传与鉴权读取，空登记仍保持 `pending_upload`，不会伪造正文。信息海目前只展示应用通知；关系评分、第三方汇聚和代支付仍未开放。完整 Agent 合同见[方案](../docs/agent-workspace-architecture.md)。

新增和调整的任务/二楼界面统一使用 `shared/workspaceUi.tsx` 的按钮、面板、状态与视觉规范，以及 `shared/workspacePalette.ts`。业务组件持有真实状态，共享组件只负责呈现和交互语义。任务状态及可读阶段只在 `features/ai/taskPresentation.ts` 定义。

单任务、协作与相册卡的长按复用 `features/assist/AIContextActions.tsx` 和既有全局径向菜单，携带页面、模块、对象与选择时快照；草稿只展示所选内容及必要快照，再由用户主动发起。来源使用 `clientContext.currentPage`，资源使用鉴权 `contextRefs`；工程来源不拼入新聊天正文。缺完整授权时引导到我页添加；已添加但授权不完整的Agent须移除后重新添加并确认全部声明范围。按账号/token/会话保留未发送内容，返回不自动发送。协作快照不冒充可鉴权资源或自动读取原素材，尚未支持任意页面直接作为服务端资源引用。

这是妙讯的 React Native 正式实现目录。

Agent 视觉统一经 `AgentGlyphAvatar` 渲染，消费已发布 release identity 的两种正式模式：`agent-mark` 使用合同中的 mark/shape/colors；`agent-image` 使用后台规范化的 512×512 WebP 资产，并保留相同展示字段。图片 identity 必须携带 assetId、sha256、mimeType 和尺寸，URL 必须精确为 `/api/agent-avatar-assets/<assetId>/<sha256>.webp`，客户端通过原生显式 API origin 构造地址，不接受任意远端 URL。图片加载失败显示明确错误，不退回文字头像；产品依赖与 Agent identity 比对包含完整图片资产字段。本地源码支持不代表当前 TestFlight 已包含该模式，分发状态以当前交接为准。 普通 Agent 的明确授权确认同时绑定所展示的 productVersionId；产品目录在确认期间变更会使旧确认失效，客户端不会自动升级授权。撤销不要求产品版本。

## 定位

`MiaoxunRN/` 是妙讯唯一正式移动端主线，承接 iOS 和 Android 上线实现。历史 SwiftUI 原型已从主工程移除，后续新增能力都应落在 React Native 业务层或明确的原生薄桥接中。

## 当前状态

当前源码、线上运行版本、TestFlight、设备验收和未完成事项统一见[当前交接](../docs/handoffs/CURRENT.md)。本文件保留的 Build46–48、合同2–3 和旧设备描述属于历史背景，不能作为当前联调或发布依据；对应的发布与恢复证据仍保留在 `docs/reviews/` 和 `docs/handoffs/`。
- 已建立独立 RN 工程。
- 已保留与原型相近的视觉基调。
- 已预留 `src/features`、`src/services`、`src/shared` 分层。
- 已接入后端登录、注册、bootstrap、增量同步、发送消息、标记已读和小站设置同步接口。
- 已用 Keychain 保存登录 token，启动时会自动恢复后端账号会话。
- 启动动画文案为“AI 不只问答 / 找人，找东西 / 就上妙讯小站”。登录和注册页不展示未上线的忘记密码、短信或邮件验证说明；对应能力接入后再按真实入口补回。
- 注册页只要求昵称、手机号或邮箱、密码；昵称就是用户可见用户名，必须唯一。登录页支持使用昵称、手机号或邮箱登录。后端注册和资料改名都会检查 `displayName` 唯一，重复时提示“名称已使用”。
- 未登录状态只展示登录/注册页，不再保留原型账号、预览会话或前端假聊天。
- 设置页退出登录会先调用 `/api/auth/logout` 撤销服务端 session，成功后再清除本机 Keychain token。
- 妙讯管家通过妙讯会话和小站 Agent 卡片进入；小站不再渲染悬浮“妙”，避免覆盖 3D、动态和后续内容模块。内容级 AI 辅助统一由根部 `AIAssistProvider` 接管，3D、聊天消息、动态、日记和相册卡片使用同一长按与方向能力入口。
- API 地址由 `MiaoxunConfigModule` 原生桥接显式注入；iOS 读取 `Info.plist` 的 `MiaoxunAPIBaseURL`，Android 读取 `BuildConfig.MIAOXUN_API_BASE_URL`。该值只能是无路径的 HTTP(S) origin，所有业务调用必须显式传入 `/api/*` 路径；配置缺失或格式错误会直接报错。
- 妙讯页左上角 `+` 菜单中的扫码已接入统一 `src/services/qrScanner.ts`，iOS 使用 AVFoundation，Android 使用 CameraX + ML Kit。
- 妙讯页左上角 `+` 菜单当前仍只提供扫码；V15 原型已核对为“发起聊天 / 创建群聊 / 扫描名片”三项，其中前两项还需要对应的联系人/群聊创建接口，好友申请继续从公开主页按钮发起。不要把原型演示弹层当成已接入能力。
- 扫码返回真实二维码文本后，会调用 `/api/scan/resolve` 由后端解析 AI ID 并打开公开用户主页，用户确认后再点击加好友。
- 扫码结果会先在客户端校验是否为妙讯主页码；非妙讯码直接提示错误，不进入主页加载。主页解析加载页必须提供返回入口，避免网络或后端异常时困住用户。
- 小站动态码使用标准 QR Code 组件生成，外框可以装饰，但二维码模块本体不能变形、缺失或被遮挡，确保 iOS AVFoundation 和 Android ML Kit 都能识别。
- 普通 API 请求超时为 20 秒，生成类长请求为 45 秒；超时会提示网络/后端连接问题，不允许页面无限等待。
- 扫码解析、关注和发送好友申请都有明确提交中状态；请求成功后更新关系状态，请求失败或超时时恢复按钮并提示错误。
- 公开用户主页已支持关注、发送好友申请；好友申请、好友通过和新关注会进入妙讯页通知列表并计入未读数。通知列表只展示 `notifications` 表中的真实通知，进入通知页不会自动全部已读，点单条通知、标记已读或处理好友申请才更新对应通知的已读状态。
- 好友申请通过后，后端自动生成双方 `peer_user_id` direct 聊天线程；公开主页已是好友时显示 `发消息`。公开主页可由扫码、搜索、小站好友/关注/粉丝列表和好友聊天页进入；小站社交页好友行的头像/资料区域进入公开主页，消息图标进入 direct 聊天，聊天页右上角资料按钮也进入同一公开主页。对方收到 direct 消息时会增加对应线程未读数。direct 消息用 `metadata.senderUserId` 区分真实发送者，聊天页不能只按 `senderType=user` 判断“我”。
- direct 好友聊天使用 `/api/realtime` WebSocket 实时通道接收在线消息；登录期间连接按 token 生命周期保持，增量游标更新、进入或退出聊天页、收到 `presence.changed` 或更新本人 `presenceMode` 都不会重建。WebSocket 返回 `connection.ready` 时只做一次增量补偿，不重新请求完整 bootstrap；异常断开后只重连同一个实时通道，实时事件和用户显式刷新负责补齐列表、通知及离线数据，并发同步请求会合并为同一个 in-flight 请求。
- 用户在线状态由后端 `users.presence_mode` 和 WebSocket 连接共同决定：自己可在小站顶部点击名称旁的状态胶囊切换 `在线 / 离线 / 隐藏`，弹层锚定整个状态胶囊的屏幕矩形，并固定显示在该按钮下方居中；点击昵称、圆点、文字或箭头都必须得到同一位置。别人只能看到公开状态 `在线 / 离线`，当用户选择离线或隐藏时公开状态均为离线。聊天列表、搜索结果、小站社交列表和公开主页都展示同一套公开状态，不在设置页放置个人在线状态入口。真机上该弹层必须在小站 ScrollView 之后渲染，并设置足够高的 `zIndex`/`elevation`，避免被 AI ID、妙点或位置卡片穿透压住。
- 妙讯页聊天列表支持点击会话进入聊天，也支持对某个会话左滑进入聊天；聊天页支持左滑退出到妙讯页，同时保留左上角 `<` 返回按钮作为可访问性和明确操作入口。左右方向不混用：列表和聊天页都用左滑表达进入/退出这一层级切换，手势只在横向滑动明显大于纵向滚动时触发，释放判断同时参考滑动距离和速度，避免影响消息列表上下滚动。
- 聊天发送展示真实本地状态：发送中、发送失败和点击重试。失败消息只保存在当前客户端内存中，不写入后端，不伪装为已送达；重试成功后由后端真实消息替换本地气泡。
- 聊天消息时间以居中时间分隔条展示；第一条真实消息显示时间，后续与上一条真实消息间隔 5 分钟及以上才再次显示，单条消息下方不再重复显示时间。相邻消息气泡保持更紧凑的上下间距。
- 长按消息会在被选消息附近展示操作浮层，可回复、复制、删除或撤回。复制只写入系统剪贴板，不写后端；回复会把被回复消息快照写入新消息 metadata；删除只删除当前用户自己线程里的消息；撤回只能由发送者在发送后 1 分钟内执行，并通过 `client_message_id` 同步双方 direct 线程。撤回窗口由 PostgreSQL 使用 `created_at` 和 `CURRENT_TIMESTAMP` 判断，避免手机时间、Node 进程时间或时区格式影响；旧消息如果没有 `client_message_id`，或超过撤回窗口，后端会明确拒绝撤回，不做单侧假撤回。客户端按当前语言展示撤回/删除/扫码等操作错误，但真实聊天正文按发送时原文展示，不自动翻译或改写历史聊天记录。
- 小站社交页已展示真实好友、关注和粉丝列表；小站顶部关注/粉丝数字可进入社交页。搜索页已接入用户搜索与最近搜索；设置页已接入主页展示开关，公开主页会按后端可见性策略隐藏字段。
- 设置页包含关注列表和粉丝列表公开开关；当前 App 只展示自己的关注/粉丝列表，后续开放查看他人列表前必须先由后端 API 按这两个开关校验。
- 小站页已接入位置入口。点击“我的社区”或“我的活动区域”进入位置选择；“我的模样”通过独立 App 流程创建和管理私有 3D 形象，只有最终 GLB 查看画布使用受限 WebView。照片上传、授权、任务轮询和四视图确认均为 React Native 页面，不进入 Agent 工作区或完整 Web 工作台。
- 小站仍存在旧版个人日记、相册与 Agent 模块，尚未完成新版第一面“个人数字身份＋形象档案”的整体调整。2026-09-16 已移除不属于本次新版设计范围的音乐板块；不以旧版默认模块代替新版设计验收。
- 定位通过 `src/services/location.ts` 调用原生薄桥接：iOS 使用 CoreLocation，Android 使用系统 LocationManager。定位只返回 WGS84 坐标，社区和活动区域候选由 `/api/location/resolve` 调用后端显式配置的反向地理编码服务生成；线上当前使用 `GEOCODING_PROVIDER=amap`，WGS84 到 GCJ-02 的转换只发生在后端供应商适配层。App 只展示真实候选并由用户确认保存，不提供未使用的地图选点链路；服务未配置、权限拒绝、设备不可用或解析失败都提示明确错误，不写入假社区或默认活动区域。
- `avatar_config` v2 继续用于用户头像和未涉及 3D 模型的形象配置；小站 3D 模型来自独立的 `avatar_3d_models` 生命周期，不用 SVG 或低模占位作为生成失败兜底。
- 原型里小站形象、OOTD 和漫画日记封面都是可交互区域；当前 RN 保留这些真实入口，3D 模型可在舞台旋转查看，未接入内容仍只展示真实空状态，不写客户端假内容。
- 第一面“编辑小站资料”已接入昵称、头像文字、签名、职业身份、主动展示的城市、经验年限和沟通语言；通过 `PATCH /api/me/profile` 持久化，后台同步支持编辑。身份标签受“展示职业资料与简介”控制，不读取 GPS；妙点和定位管理移到“其他”。新客户端依赖迁移 031 和新后端，须按[资料闭环记录](../docs/reviews/2026-09-16-profile-identity.md)顺序发布。设计要求的“粉丝、合作伙伴、综合评分”仍未完成统计接入，用户已确认按完成合作与评价计算，具体[生命周期契约](../docs/reviews/2026-09-16-cooperation-lifecycle.md)已记录；不能把旧计数换名替代。
- 生活动态的点赞和收藏已接入 `station_post_interactions` 真实接口，按钮状态由服务端返回并在失败时回滚；动态、互动、媒体资产和漫画日记数量已进入后台总览。音乐不在当前新版设计实施范围；最终漫画媒体发布仍待接入。
- `avatar_config` 只表示人类用户的小站形象。Agent 使用独立身份及设计资源；妙讯管家聊天头像映射为蓝湖聊天页对应的 `messages/avatar-butler.png` 人物插画，小站现有 `station/partners/miaoxun-assistant.png` 机器人素材不能替代聊天头像。新增 Agent 必须声明合法 `identity`，正式设计素材按入口与 `agentId` 明确映射，不能使用用户可编辑形象。
- 正式形象设计可以参考 QQ 秀的顶部人物预览和底部素材卡片编辑结构，同时保留 VRoid 的 Face/Hair/Body/Outfit/Accessories 分区、Roblox 的 avatar cosmetics/accessories 持久化思路。正式扩展捏脸、装扮、动作、上传图片生成或购买素材时，必须使用本地或后端审核后的 2D/3D 人形资源，并补齐素材授权、审核流程、模型压缩、跨平台性能验证和资源版本记录。
- 收藏列表、签名动态码、群聊、已读回执、正在输入、媒体消息和内容级可见性仍按 `docs/social-graph.md` 后续接入；好友申请拒绝/取消接口已存在。所有新增能力必须先补后端 schema/API，不能用客户端假状态替代。

## 原生桥接边界

业务页面、登录、聊天、小站和 Agent 交互保持在 `src/` 的 React Native / TypeScript 中。
React Native 不代表完全没有原生代码；当前原则是业务跨平台，系统能力用薄桥接接入。

系统能力按平台实现薄桥接：

```text
src/services/qrScanner.ts
  -> ios/MiaoxunRN/QRCodeScannerModule.swift
  -> android/app/src/main/java/com/wangruoshi/miaoxun/QRCodeScannerModule.kt

src/services/location.ts
  -> ios/MiaoxunRN/QRCodeScannerModule.swift / MiaoxunLocationModule
  -> android/app/src/main/java/com/wangruoshi/miaoxun/MiaoxunLocationModule.kt
```

新增相机、推送、相册、文件、分享等能力时，先在 `src/services` 定义统一 JS API，再分别补 iOS / Android 原生实现和权限说明。
如果后续产品不使用 QR Code 或不需要相机实时识别，可以移除扫码桥接和相机权限，改为纯 RN 输入、链接打开或后端校验流程。

## 本地构建与正式环境联调

日常使用现有主 iPhone 17 Simulator（UDID `7E81531F-02AE-40FC-98DA-A575CEC9930F`，iOS 26.5）上的同一个 **妙讯** App，Bundle ID 为 `com.wangruoshi.miaoxun`。当前默认 API 为 `https://8.153.167.11`；Build、服务器版本和设备安装是否配套以[当前交接](../docs/handoffs/CURRENT.md)为准。固定设备原位更新并保留已有数据与 Keychain 登录态，不并列维护另一个日常开发 App。

从仓库根目录执行：

```sh
node scripts/miaoxun-development.mjs ios
```

该命令检查正式API readiness，再构建、签名、安装并启动固定设备上的正式Bundle；不需要先启动本机API、PostgreSQL或Worker。构建证据记录设备UDID、Build、提交、未提交源码摘要、`main.jsbundle`摘要、产品摘要和API origin。源码在构建期间变化时中止安装；单凭Build号或HEAD不能证明版本一致。实际部署与安装结果以[当前交接](../docs/handoffs/CURRENT.md)为准，构建不会自动升级服务器或TestFlight。

当前工作区包含专业文字成果、续作和直接工作空间合同；客户端启动时从 bootstrap 校验 `aiTasks:1`、`siteDocuments:2` 和 `agentWorkspaces:6`，不按 Build 号猜测协议。只在[当前交接](../docs/handoffs/CURRENT.md)确认客户端、后端和数据库配套后进行正式联调；不搬运本地 token，不把旧合同静默降级为新请求。供应商付费验收、生产部署和 TestFlight 上传按各自授权范围执行。

最近一次固定 iPhone 17 构建、安装和页面验收证据，以及实体设备与 TestFlight 状态，统一见[当前交接](../docs/handoffs/CURRENT.md)；历史 Build48/Build51 证据保留在发布记录中，不作为当前安装或配套判断。

仅在显式验证后端迁移、权限或失败场景时使用 `verify-local-start` / `verify-local-restart`；`stop` / `status` 继续管理已有本机验证服务。隔离库账号与数据保留，供应商请求明确阻断。它不是日常App的后端，`status`也不表示生产状态。详细命令、证据和恢复约定见[固定iPhone 17联调](../docs/local-development-preview.md)。

iOS API地址由Xcode build setting `MIAOXUN_API_BASE_URL` 注入，Android使用同名构建参数。Release必须使用受信任的公网HTTPS origin；当前IP证书SAN包含 `8.153.167.11`，无需ATS HTTP例外。Debug可在显式隔离验证时覆盖origin，日常默认保持正式HTTPS。同一次扫码联调不能混用两套后端。

当前iOS Debug通过 `AppDelegate.swift` 读取内置 `main.jsbundle`。修改 `src/` 后重新执行 `ios` 构建安装；重启Simulator或Metro不会让已安装App自动更新。Simulator通过不代表真机、Android或TestFlight已通过。

真机和模拟器互扫联调必须保证双方进入同一套后端账号、二维码、好友申请和通知数据。同一次扫码联调不能一端连本地、一端连线上。

iOS 和 Android 都通过 `src/services/apiClient.ts` 读取 `NativeModules.MiaoxunConfigModule.apiBaseURL`；不要再通过 `SettingsManager` 读取自定义 `Info.plist` 字段。

iOS Debug 和 Release 都使用构建阶段写入 App 包内的 `main.jsbundle`，模拟器和真机都不依赖 Metro；缺少内嵌 bundle 时会直接报错，避免联调测试加载到不确定的 JS 来源。

3D GLB 查看器是 App 内置的单文件 HTML 资源，不打开 `/avatar/` Web 工作台。修改 `avatar-web/src/viewer/modelScene.ts` 或 `avatar-web/src/app-viewer/main.ts` 后，需要重新生成并提交该资源：

```sh
cd avatar-web
npm run build:app-viewer
```

小站顶层 Tab 使用可横向滚动的 `StationTabBar` 和单一内容 ScrollView，选项宽度按标题自然布局并在切换后滚动到可见区域，为后续新增选项保留空间。第一面首次访问后会保留其真实内容树，离开时暂停交互并隐藏；其他面板按访问和当前路由生命周期管理，不能依赖定时器或动态 `key` 强制重建。查看器原生容器、HTML 加载层和 Three.js 场景使用同一浅色背景，模型在首帧渲染后结束加载状态，进入后台或离开小站时暂停 RAF 和未触发的长按计时器，恢复时复用已加载场景。

内容级长按由根部 `AIAssistProvider` 统一管理。3D 舞台、聊天消息、动态、日记和相册卡片使用同一四向半透明操作层；原内容始终保持单份挂载，不克隆 3D 舞台，不显示系统文本选择菜单。选择“妙管家”只打开妙讯管家会话并把标题、正文和内容类型写入待发送草稿，用户确认后才发送；不会自动发送、上传私有媒体或伪造生成结果。未配置 `AIAssistProvider` 时直接报错，动作取消、页面切换、后台和卸载都会使当前交互失效。

四向操作层只复用手势和布局，不复用业务文案：聊天卡片为“分享 / 妙管家 / 复制 / 更多”，聊天输入框为“换行 / 妙管家 / 粘贴 / 更多”，3D / OOTD 为“分享 / 妙管家 / 编辑 / 更多”。边缘布局同时携带标签在圆上方或下方的设计信息，文字与触点光圈不得重叠；具体映射和照片稿的接入状态见 `docs/app-design-assets.md`。

长按菜单中的图标目前按“正式资源优先、Lucide 语义图标补足”的明确映射渲染。仓库没有蓝湖全部图标的原始 SVG/透明 2x/3x 导出时，不能把截图裁剪物当成最终资产；需要设计交付原始资源后按 `agentId`/动作 ID 显式替换，并同步 `docs/app-design-assets.md` 的清单。

小站首页的个人日记和个人相册模块分别绑定已注册的漫画日记 Agent、相册管理 Agent；已添加时点击进入对话，未添加时进入 AI 伙伴管理。模块“更多”进入按月份分组的完整内容列表，列表项点按查看详情、左滑快捷进入编辑。AI 伙伴模块不虚构总管 Agent，具体伙伴点按进入对话，“更多”进入统一伙伴管理。

小站首页只展示真实内容，不使用空白卡片补齐网格：个人日记最多 4 条并保持两列，个人相册最多 3 个并保持三列，AI 伙伴最多 6 个并保持两列；单数内容的最后一项靠左显示，不拉伸占满整行。零数据模块显示明确的空状态。

个人日记和个人相册从首页、完整列表进入创建、详情或编辑时统一使用全屏内容工作区；首页创建返回首页，完整列表内创建返回列表，不再从底部打开旧 `pageSheet`。日记创建采用动态发布页风格的纯文本编辑器；相册创建必须先选择 1 至 9 张照片，保存时创建相册并逐张上传，任一上传失败会删除已上传对象和新相册。今日穿搭仍保留独立创建弹层。

小站顶层导航按照新版设计映射为“第一面 / 生活 / 成果 / 生态 / 其他”：第一面保留个人主页与形象模块，生活承载动态时间线并在“正在发生”入口发布动态，成果只汇总真实内容产出，生态承载 AI 伙伴能力，既有社交关系归入其他。当前底部导航为“妙 / 讯 / 我”，小站内容保留在“我”页，不再显示中央发布按钮。

小站浅色模式使用独立的设计色解析：页面底色 `#F8F7FD`、内容板块 `#FFFFFF`、辅助底色 `#F4F6FF`、分隔色 `#F0EBFD`、标签边框 `#DBE2FF`、强调色 `#2012D9`。妙讯管家可使用已确认的专属图标；其他动态 Agent 默认读取注册层的 `identity` 标记，正式图标到位后再按 `agentId` 显式替换，不把设计示例头像映射成真实 Agent。

日记详情可以调用已注册的 `comic-diary` Agent 生成结构化漫画分镜。后端会校验 Agent 返回的 JSON、帧数和媒体归属后再持久化；当前阶段产物是标题、场景、旁白、对白和素材引用，不是最终漫画图片。

App bootstrap 与增量同步 DTO 直接对应当前后端响应：通知、未读数、关系、小站内容和 Agent readiness 均为必填字段。`/api/app/bootstrap` 与 `/api/station/content` 会在数据进入 session 前验证小站九个数组字段，后端漏字段时明确报告版本契约不匹配，客户端不把契约缺失静默转换成空列表。

日记和相册管理由 `StationContentManageSheet` 维护内容定位、保存和删除状态，`StationContentManageViews` 维护详情与编辑展示；列表、视图和主屏共用 `stationTypes.ts` 中的内容目标类型，避免组件之间反向依赖。

从妙讯页 `+` 菜单进入扫码时，RN 必须先关闭当前菜单，并由 `Modal.onDismiss` 确认菜单已关闭后，再调用原生 `QRCodeScannerModule.scan()` 打开相机页；不能在 RN Modal 仍在消失时直接 present 原生扫码页。iOS 原生层必须在 present 前确认存在可用视频设备；模拟器没有真实摄像头时直接返回明确错误，不打开黑屏扫码页。

涉及两台设备互扫的联调必须保证双方都安装或启动同一次代码版本，并且 `MIAOXUN_API_BASE_URL` 指向同一个后端。只更新真机不更新模拟器时，模拟器展示的二维码、页面状态和客户端逻辑可能仍来自旧包，扫码测试结果无效。

真机连接正式 API 的构建和安装命令：

```sh
xcodebuild -allowProvisioningUpdates \
  -workspace ios/MiaoxunRN.xcworkspace \
  -scheme MiaoxunRN \
  -configuration Debug \
  -destination 'id=<DEVICE_IDENTIFIER>' \
  -derivedDataPath ios/build \
  MIAOXUN_API_BASE_URL=https://8.153.167.11 \
  build

xcrun devicectl device install app \
  --device <DEVICE_IDENTIFIER> \
  ios/build/Build/Products/Debug-iphoneos/MiaoxunRN.app

xcrun devicectl device process launch \
  --device <DEVICE_IDENTIFIER> \
  com.wangruoshi.miaoxun
```

Android 使用与当前交接一致的版本计划和正式 API。在 `MiaoxunRN/android` 中构建：

```sh
./gradlew assembleDebug \
  -PMIAOXUN_API_BASE_URL=https://8.153.167.11
```

构建参数仍可显式传入 `MIAOXUN_API_BASE_URL`、`MIAOXUN_VERSION_CODE` 和 `MIAOXUN_VERSION_NAME`；后续版本递增需同步iOS与Android发布计划。真机或Android做隔离后端验证时，必须明确配置设备可访问的origin；仅绑定本机的4391验证服务不能直接作为真机LAN服务使用。

Android Release 构建必须显式提供正式签名参数，版本码必须为正整数，并按当前发布计划递增。`MIAOXUN_API_BASE_URL` 必须是公网 HTTPS origin，不能使用 localhost 或 loopback URL。可参考：

```text
android/release-signing.properties.example
```

iOS/Android Release 共用仓库 `scripts/validate-release-api-origin.mjs`：允许公网 IPv4、普通全球单播 IPv6
和标准域名，拒绝本地/保留地址、特殊本地域名、用户信息、非根路径、查询、片段和非法端口。
该构建检查不做 DNS 或 TLS 探测，正式目标仍须运行生产只读预检。
iOS 从 `.xcode.env` 与可选 `.xcode.env.local` 读取 `NODE_BINARY`，Android 使用 React Native 的
`nodeExecutableAndArgs`；必须从完整仓库构建。Debug 仍支持显式指定本地开发 API。

iOS 依赖同步使用项目内 Bundler：

```sh
cd ios
bundle exec pod install
```

首次安装后，如果 iOS 阻止启动，需要在 iPhone 的“设置 -> 通用 -> VPN 与设备管理”中信任 Apple Development 开发者证书，再重新启动 App。

## 开发原则

1. RN是唯一正式移动端主线，不恢复已移除的SwiftUI原型。
2. 新能力优先在RN业务层实现，原生能力通过薄桥接接入。
3. 合同变更同步后端、迁移、客户端和测试；不增加旧接口静默兜底。
4. 以真实数据和显式状态验收，保留现有用户内容。

## 结构化页面与完整预览

2026-10-12：新建站页面通过 `features/site-document` 的同一RN渲染器完成草稿和当前保存页面的全屏查看，合同共用仓库 `shared/site-document.js`。Metro只额外纳入shared目录，并显式从移动端node_modules解析共享代码的转换运行库。生成/确认先检查会话的 `siteDocuments:2`，资源通过本人文档接口精确读取，预览双hash匹配才允许保存。

结构化页面使用 `siteDocuments:2` 合同；生成、预览和保存必须经过当前会话能力校验、资源 hash 校验和用户确认。页面图片加载失败、重试或资源失效会撤销审阅，迟到响应按会话、文档和 hash 隔离。当前部署与发布状态以[当前交接](../docs/handoffs/CURRENT.md)为准，旧 Build46/038 记录仅保留为历史证据。
