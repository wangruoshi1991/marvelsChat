# MiaoxunRN

这是妙讯的 React Native 正式实现目录。

## 定位

`MiaoxunRN/` 是妙讯唯一正式移动端主线，承接 iOS 和 Android 上线实现。历史 SwiftUI 原型已从主工程移除，后续新增能力都应落在 React Native 业务层或明确的原生薄桥接中。

## 当前状态

- 已建立独立 RN 工程。
- 已保留与原型相近的视觉基调。
- 已预留 `src/features`、`src/services`、`src/shared` 分层。
- 已接入后端登录、注册、bootstrap、增量同步、发送消息、标记已读和小站设置同步接口。
- 已用 Keychain 保存登录 token，启动时会自动恢复后端账号会话。
- 启动动画文案为“AI 不只问答 / 找人，找东西 / 就上妙讯小站”。登录和注册页不展示未上线的忘记密码、短信或邮件验证说明；对应能力接入后再按真实入口补回。
- 注册页只要求昵称、手机号或邮箱、密码；昵称就是用户可见用户名，必须唯一。登录页支持使用昵称、手机号或邮箱登录。后端注册和资料改名都会检查 `displayName` 唯一，重复时提示“名称已使用”。
- 未登录状态只展示登录/注册页，不再保留原型账号、预览会话或前端假聊天。
- 设置页退出登录会先调用 `/api/auth/logout` 撤销服务端 session，成功后再清除本机 Keychain token。
- 妙讯管家和悬浮“妙”保持为两个入口：管家用于账号/消息/小站问答，悬浮“妙”预留给后续 AI 建站。
- API 地址由 `MiaoxunConfigModule` 原生桥接显式注入；iOS 读取 `Info.plist` 的 `MiaoxunAPIBaseURL`，Android 读取 `BuildConfig.MIAOXUN_API_BASE_URL`，配置缺失或格式错误会直接报错。
- 妙讯页左上角 `+` 菜单中的扫码已接入统一 `src/services/qrScanner.ts`，iOS 使用 AVFoundation，Android 使用 CameraX + ML Kit。
- 妙讯页左上角 `+` 菜单展示创建群、添加好友和扫码；创建群和独立添加好友入口当前为待接入状态，不触发业务写入，好友申请从公开主页按钮发起。
- 扫码返回真实二维码文本后，会调用 `/api/scan/resolve` 由后端解析 AI ID 并打开公开用户主页，用户确认后再点击加好友。
- 扫码结果会先在客户端校验是否为妙讯主页码；非妙讯码直接提示错误，不进入主页加载。主页解析加载页必须提供返回入口，避免网络或后端异常时困住用户。
- 小站动态码使用标准 QR Code 组件生成，外框可以装饰，但二维码模块本体不能变形、缺失或被遮挡，确保 iOS AVFoundation 和 Android ML Kit 都能识别。
- API 请求有明确超时，当前为 15 秒；超时会提示网络/后端连接问题，不允许页面无限等待。
- 扫码解析、关注和发送好友申请都有明确提交中状态；请求成功后更新关系状态，请求失败或超时时恢复按钮并提示错误。
- 公开用户主页已支持关注、发送好友申请；好友申请、好友通过和新关注会进入妙讯页通知列表并计入未读数。通知列表只展示 `notifications` 表中的真实通知，进入通知页不会自动全部已读，点单条通知、标记已读或处理好友申请才更新对应通知的已读状态。
- 好友申请通过后，后端自动生成双方 `peer_user_id` direct 聊天线程；公开主页已是好友时显示 `发消息`。公开主页可由扫码、搜索、小站好友/关注/粉丝列表和好友聊天页进入；小站社交页好友行的头像/资料区域进入公开主页，消息图标进入 direct 聊天，聊天页右上角资料按钮也进入同一公开主页。对方收到 direct 消息时会增加对应线程未读数。direct 消息用 `metadata.senderUserId` 区分真实发送者，聊天页不能只按 `senderType=user` 判断“我”。
- direct 好友聊天使用 `/api/realtime` WebSocket 实时通道接收在线消息；登录期间连接按 token 生命周期保持，增量游标更新、进入或退出聊天页、收到 `presence.changed` 或更新本人 `presenceMode` 都不会重建。WebSocket 返回 `connection.ready` 时只做一次增量补偿，不重新请求完整 bootstrap；异常断开后只重连同一个实时通道，全局 30 秒同步只负责列表、通知和离线后的数据补齐，并发同步请求会合并为同一个 in-flight 请求。
- 用户在线状态由后端 `users.presence_mode` 和 WebSocket 连接共同决定：自己可在小站顶部点击名称旁的状态胶囊切换 `在线 / 离线 / 隐藏`，弹层锚定整个状态胶囊的屏幕矩形，并固定显示在该按钮下方居中；点击昵称、圆点、文字或箭头都必须得到同一位置。别人只能看到公开状态 `在线 / 离线`，当用户选择离线或隐藏时公开状态均为离线。聊天列表、搜索结果、小站社交列表和公开主页都展示同一套公开状态，不在设置页放置个人在线状态入口。真机上该弹层必须在小站 ScrollView 之后渲染，并设置足够高的 `zIndex`/`elevation`，避免被 AI ID、妙点或位置卡片穿透压住。
- 妙讯页聊天列表支持点击会话进入聊天，也支持对某个会话左滑进入聊天；聊天页支持左滑退出到妙讯页，同时保留左上角 `<` 返回按钮作为可访问性和明确操作入口。左右方向不混用：列表和聊天页都用左滑表达进入/退出这一层级切换，手势只在横向滑动明显大于纵向滚动时触发，释放判断同时参考滑动距离和速度，避免影响消息列表上下滚动。
- 聊天发送展示真实本地状态：发送中、发送失败和点击重试。失败消息只保存在当前客户端内存中，不写入后端，不伪装为已送达；重试成功后由后端真实消息替换本地气泡。
- 聊天消息时间以居中时间分隔条展示；第一条真实消息显示时间，后续与上一条真实消息间隔 5 分钟及以上才再次显示，单条消息下方不再重复显示时间。相邻消息气泡保持更紧凑的上下间距。
- 长按消息会在被选消息附近展示操作浮层，可回复、复制、删除或撤回。复制只写入系统剪贴板，不写后端；回复会把被回复消息快照写入新消息 metadata；删除只删除当前用户自己线程里的消息；撤回只能由发送者在发送后 1 分钟内执行，并通过 `client_message_id` 同步双方 direct 线程。撤回窗口由 PostgreSQL 使用 `created_at` 和 `CURRENT_TIMESTAMP` 判断，避免手机时间、Node 进程时间或时区格式影响；旧消息如果没有 `client_message_id`，或超过撤回窗口，后端会明确拒绝撤回，不做单侧假撤回。客户端按当前语言展示撤回/删除/扫码等操作错误，但真实聊天正文按发送时原文展示，不自动翻译或改写历史聊天记录。
- 小站社交页已展示真实好友、关注和粉丝列表；小站顶部关注/粉丝数字可进入社交页。搜索页已接入用户搜索与最近搜索；设置页已接入主页展示开关，公开主页会按后端可见性策略隐藏字段。
- 设置页包含关注列表和粉丝列表公开开关；当前 App 只展示自己的关注/粉丝列表，后续开放查看他人列表前必须先由后端 API 按这两个开关校验。
- 小站页已接入位置入口。点击“我的社区”或“我的活动区域”进入位置选择；“我的模样”通过独立 App 流程创建和管理私有 3D 形象，只有最终 GLB 查看画布使用受限 WebView。照片上传、授权、任务轮询和四视图确认均为 React Native 页面，不进入 Agent 工作区或完整 Web 工作台。
- “我的小站”面板按原型结构保留 3D 形象、个人日记、个人相册、喜欢的音乐菜单、可调用能力 Agent 和我的文件的位置。当前未接入内容模块只展示真实空状态，不在客户端写静态假列表、假封面、假数量或假文件；后续需要先补对应后端表、素材/权限模型和 API，再把待接入状态替换为真实数据。
- 定位通过 `src/services/location.ts` 调用原生薄桥接：iOS 使用 CoreLocation，Android 使用系统 LocationManager。定位只返回 WGS84 坐标，社区和活动区域候选由 `/api/location/resolve` 调用后端显式配置的反向地理编码服务生成；线上当前使用 `GEOCODING_PROVIDER=amap`。附近地图使用开源 `@maplibre/maplibre-react-native`，从 `/api/map/style` 获取样式并通过 `/api/map/tiles/:z/:x/:y.png` 加载后端代理的显式地图瓦片；当前线上高德瓦片属于 GCJ-02 坐标体系，客户端展示地图时必须把 WGS84 定位点转换为 GCJ-02 居中，用户点选地图后再把 GCJ-02 转回 WGS84 发给后端解析，避免底图和定位点出现系统性偏移。用户可以拖动缩放地图并点选附近位置，App 重新解析该点并从真实候选中选择保存。服务未配置、权限拒绝、地图瓦片不可达或解析失败都提示明确错误，不写入假社区或默认活动区域。当前线上临时使用高德瓦片模板解决服务器访问 OSM/CARTO 超时问题；正式上架前需要补齐高德地图 SDK/瓦片授权或采购/自建合规瓦片服务。
- `avatar_config` v2 继续用于用户头像和未涉及 3D 模型的形象配置；小站 3D 模型来自独立的 `avatar_3d_models` 生命周期，不用 SVG 或低模占位作为生成失败兜底。
- 原型里小站形象、OOTD 和漫画日记封面都是可交互区域；当前 RN 保留这些真实入口，3D 模型可在舞台旋转查看，未接入内容仍只展示真实空状态，不写客户端假内容。
- `avatar_config` 只表示人类用户的小站形象。妙讯管家和后续 Agent 不使用用户可编辑形象，Agent 头像来自 `agents/*.agent.js` 的 `identity` 注册声明；客户端按 `agentId` 渲染不可编辑的 Agent 标识。新增 Agent 时必须在注册层声明 identity，registry 会校验缺失或非法配置，不能让客户端把 Agent 当作普通用户头像处理。
- 正式形象设计可以参考 QQ 秀的顶部人物预览和底部素材卡片编辑结构，同时保留 VRoid 的 Face/Hair/Body/Outfit/Accessories 分区、Roblox 的 avatar cosmetics/accessories 持久化思路。正式扩展捏脸、装扮、动作、上传图片生成或购买素材时，必须使用本地或后端审核后的 2D/3D 人形资源，并补齐素材授权、审核流程、模型压缩、跨平台性能验证和资源版本记录。
- 收藏列表、签名动态码、好友拒绝/取消流程、群聊、已读回执、正在输入、媒体消息和内容级可见性仍按 `docs/social-graph.md` 后续接入，必须先补后端 schema/API，不能用客户端假状态替代。

## 原生桥接边界

业务页面、登录、聊天、小站和 Agent 交互保持在 `src/` 的 React Native / TypeScript 中。
React Native 不代表完全没有原生代码；当前原则是业务跨平台，系统能力用薄桥接接入。

系统能力按平台实现薄桥接：

```text
src/services/qrScanner.ts
  -> ios/MiaoxunRN/QRCodeScannerModule.swift
  -> android/app/src/main/java/com/gary/miaoxun/rn/QRCodeScannerModule.kt

src/services/location.ts
  -> ios/MiaoxunRN/QRCodeScannerModule.swift / MiaoxunLocationModule
  -> android/app/src/main/java/com/gary/miaoxun/rn/MiaoxunLocationModule.kt
```

新增相机、推送、相册、文件、分享等能力时，先在 `src/services` 定义统一 JS API，再分别补 iOS / Android 原生实现和权限说明。
如果后续产品不使用 QR Code 或不需要相机实时识别，可以移除扫码桥接和相机权限，改为纯 RN 输入、链接打开或后端校验流程。

## 本地运行

```sh
cd MiaoxunRN
npm start -- --port 8081
npm run ios -- --simulator "iPhone 17"
```

iOS API 地址由 Xcode build setting `MIAOXUN_API_BASE_URL` 注入：

```text
Debug: http://127.0.0.1:4390
Release: http://8.153.167.11/api  # 临时 TestFlight；正式上线恢复 HTTPS 域名
```

Debug 默认连接本机后端。正式 Release 构建必须使用 HTTPS 域名，不能使用裸 IP、localhost 或 loopback URL；域名审核完成前，TestFlight 可通过 `MIAOXUN_TEMP_IP_TESTFLIGHT=1` 显式启用临时 IP 测试配置。同一次扫码联调不能混用两套后端。

当前 iOS Debug 工程会通过 `AppDelegate.swift` 强制读取内置 `main.jsbundle`，不是直接从 Metro 拉取最新 JS。修改 `src/` 后如模拟器没有变化，需要重新执行 `npx react-native run-ios --udid <simulator-id>` 生成并安装新的内置 bundle；单纯重启模拟器或 Metro 不会让已安装 App 自动更新。

真机和模拟器互扫联调必须保证双方进入同一套后端账号、二维码、好友申请和通知数据。同一次扫码联调不能一端连本地、一端连线上。

iOS 和 Android 都通过 `src/services/apiClient.ts` 读取 `NativeModules.MiaoxunConfigModule.apiBaseURL`；不要再通过 `SettingsManager` 读取自定义 `Info.plist` 字段。

iOS Debug 和 Release 都使用构建阶段写入 App 包内的 `main.jsbundle`，模拟器和真机都不依赖 Metro；缺少内嵌 bundle 时会直接报错，避免联调测试加载到不确定的 JS 来源。

从妙讯页 `+` 菜单进入扫码时，RN 必须先关闭当前菜单，并由 `Modal.onDismiss` 确认菜单已关闭后，再调用原生 `QRCodeScannerModule.scan()` 打开相机页；不能在 RN Modal 仍在消失时直接 present 原生扫码页。iOS 原生层必须在 present 前确认存在可用视频设备；模拟器没有真实摄像头时直接返回明确错误，不打开黑屏扫码页。

涉及两台设备互扫的联调必须保证双方都安装或启动同一次代码版本，并且 `MIAOXUN_API_BASE_URL` 指向同一个后端。只更新真机不更新模拟器时，模拟器展示的二维码、页面状态和客户端逻辑可能仍来自旧包，扫码测试结果无效。

真机构建和安装命令：

```sh
xcodebuild -allowProvisioningUpdates \
  -workspace ios/MiaoxunRN.xcworkspace \
  -scheme MiaoxunRN \
  -configuration Debug \
  -destination 'id=<DEVICE_IDENTIFIER>' \
  -derivedDataPath ios/build \
      MIAOXUN_API_BASE_URL=http://<MAC_LAN_IP>:4390 \
  build

xcrun devicectl device install app \
  --device <DEVICE_IDENTIFIER> \
  ios/build/Build/Products/Debug-iphoneos/MiaoxunRN.app

xcrun devicectl device process launch \
  --device <DEVICE_IDENTIFIER> \
  com.wangruoshi.miaoxun
```

Android 构建必须显式提供 API 地址：

```sh
./gradlew assembleDebug -PMIAOXUN_API_BASE_URL=http://<MAC_LAN_IP>:4390
```

Android Release 构建还必须提供正式签名参数，并且 `MIAOXUN_API_BASE_URL` 必须是 HTTPS 域名，不能使用裸 IP、localhost 或 loopback URL。可参考：

```text
android/release-signing.properties.example
```

iOS 依赖同步使用项目内 Bundler：

```sh
cd ios
bundle exec pod install
```

MapLibre iOS 底层包固定为远程 Swift Package `maplibre-gl-native-distribution` 6.26.0，不依赖本机 `vendor/maplibre...` 绝对路径。

首次安装后，如果 iOS 阻止启动，需要在 iPhone 的“设置 -> 通用 -> VPN 与设备管理”中信任 Apple Development 开发者证书，再重新启动 App。

## 迁移原则

1. 先保留 Swift 原型可运行。
2. 新能力优先在 RN 目录实现。
3. 后端接口和数据结构尽量不变。
4. 原生能力用桥接层接入，不重写后端。
