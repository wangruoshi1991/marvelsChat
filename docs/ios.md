# iOS 客户端规划

妙讯正式 iOS App 当前以 `MiaoxunRN/` 为主开发目录，采用 React Native 承接上线实现；`MiaoxunApp/` 保留为 SwiftUI 原型和交互参考，不再作为当前正式移动端主线。

## 客户端边界

- `MiaoxunRN/`：正式 iOS App 主线，包含 React Native 业务代码和 iOS 原生工程。
- `MiaoxunApp/`：SwiftUI 原型，保留历史页面、视觉和信息架构参考。
- `admin/`：后台管理系统前端，只面向管理端使用。
- `backend/`：唯一业务 API、鉴权、数据库、Agent 编排和模型供应商接入层。

iOS 客户端不直接连接 PostgreSQL，不直接调用模型供应商，不直接加载 `agents/` 文件，不保存 Agent 私钥或模型密钥。

## 当前实现约束

- 未登录状态只展示登录/注册页面，不展示原型账号、静态会话或假用户数据。
- 登录 token 使用 `react-native-keychain` 保存到 Keychain。
- App 启动时仅通过 Keychain 中的真实 token 恢复账号；恢复失败会清除本机 token 并回到登录页。
- 退出登录必须调用 `POST /api/auth/logout` 撤销服务端 session，成功后再清除本机 token。
- 注册页面只要求昵称、手机号或邮箱、密码；昵称就是用户可见用户名，必须唯一。登录页支持昵称、手机号或邮箱，不再展示单独登录账号、用户名或妙讯号字段。后端注册和资料改名都会检查 `display_name` 唯一，数据库使用 `uniq_users_display_name_lower` 约束大小写不敏感唯一性；历史重复昵称在迁移中一次性追加短后缀清理。
- 所有聊天、小站、Agent 和模块状态都来自 `backend` 与数据库；未建表模块只能展示真实空状态或待接入状态。
- 不引入兼容式静默兜底。配置缺失、后端错误和响应格式错误都要显式暴露为错误状态。
- 业务能力保持在 React Native / TypeScript；相机、推送、Keychain、相册和文件等系统能力通过薄原生桥接接入。
- React Native 不等于完全零原生；原则是业务逻辑跨平台，系统能力按平台桥接。若产品改为不使用相机扫码，则可移除当前扫码桥接及对应权限。

## 跨平台原生桥接

React Native 业务层只调用统一服务，不直接写平台分支：

```text
src/services/qrScanner.ts -> NativeModules.QRCodeScannerModule.scan()
src/services/location.ts -> NativeModules.MiaoxunLocationModule.currentLocation()
```

平台实现：

```text
iOS:     ios/MiaoxunRN/QRCodeScannerModule.swift
         ios/MiaoxunRN/QRCodeScannerViewController.swift

Android: android/app/src/main/java/com/gary/miaoxun/rn/QRCodeScannerModule.kt
         android/app/src/main/java/com/gary/miaoxun/rn/QRCodeScannerActivity.kt

iOS:     ios/MiaoxunRN/QRCodeScannerModule.swift / MiaoxunLocationModule
Android: android/app/src/main/java/com/gary/miaoxun/rn/MiaoxunLocationModule.kt
```

当前扫码能力：

- iOS 使用 `AVFoundation` 打开相机并只识别 QR Code。
- Android 使用 CameraX + ML Kit bundled barcode-scanning 打开相机并只识别 QR Code。
- 扫码成功后向 JS 返回真实二维码文本。
- 小站动态码必须使用标准 QR Code 本体；允许外框装饰，但不能改变二维码模块形态、静区和对比度。
- 用户取消、权限拒绝、设备不可用和模块未安装都返回明确错误或取消状态。
- 如果后续不使用 QR Code 或不需要实时相机识别，则不需要 `AVFoundation` / CameraX 这一层；可改为纯 RN 输入、链接打开或后端校验流程。
- 扫码结果不会在客户端直接伪造成主页跳转；JS 会调用 `/api/scan/resolve`，由后端解析 AI ID、校验账号状态并返回公开主页和关系状态。
- 扫码页识别成功后会自动关闭，随后 App 必须显示“正在打开用户主页”的解析状态；解析成功才展示公开主页，失败或超时必须关闭解析页并提示明确错误。
- 公开主页已接入关注、好友申请、好友通过通知、好友 direct 聊天线程和通知未读；小站社交页已展示真实好友、关注和粉丝列表；搜索页已接入用户搜索和最近搜索；设置页已接入主页展示开关。收藏列表、签名动态码、好友拒绝/取消流程、群聊和内容级可见性仍按 [社交关系流程](social-graph.md) 后续接入。

当前定位能力：

- iOS 使用 CoreLocation 请求 When In Use 定位权限；Android 使用系统 LocationManager 请求粗略/精确定位权限。
- 原生层只返回坐标和精度，不做社区/活动区域业务判断。
- JS 将坐标提交给 `/api/location/resolve`，由后端调用显式配置的反向地理编码服务，并返回附近社区候选和活动区域候选。当前支持 `GEOCODING_PROVIDER=nominatim` 和 `GEOCODING_PROVIDER=amap`；高德模式使用 Web 服务逆地理编码 API，后端会将系统定位的 WGS84 坐标转换为 GCJ-02 后请求高德。
- 小站页的“我的社区/我的活动区域”是位置入口；用户可以在 MapLibre 附近地图上拖动缩放并点选位置，App 重新解析所选坐标，用户从候选中选择并点击保存后，才更新 `user_profiles.community` 和 `user_profiles.activity_area`。后端写入和返回位置字段时会规范化 Nominatim 多语言分号别名，避免已有历史资料继续展示为别名串。iOS Podfile 必须在 `post_install` 中调用 `$MLRN.post_install(installer)`，由 MapLibre React Native 注入底层 MapLibre Swift Package；缺少该钩子会导致 `MapLibre/MapLibre.h` 编译失败。当前 iOS 底层 MapLibre 固定为官方 `maplibre-gl-native-distribution` 6.26.0 远程 Swift Package，不依赖开发者本机绝对路径。
- 2026-06-24 线上验证：TestFlight 真机定位权限链路可进入后端，服务器已切换 `GEOCODING_PROVIDER=amap`，`/api/location/resolve` 返回 `provider=amap` 和真实社区/活动区域候选。地图底图通过后端 `/api/map/style` 和 `/api/map/tiles/:z/:x/:y.png` 代理加载，样式中的瓦片地址必须由当前 `PUBLIC_API_BASE_URL` 生成 HTTPS URL；当前线上高德瓦片模板可返回真实 PNG。正式上架前需要补齐高德地图 SDK/瓦片授权或采购/自建合规瓦片服务。
- 服务未配置、权限拒绝、定位关闭、设备不可用、反向地理编码失败都必须提示明确错误，不允许写入假社区或静默使用默认地址。

## API 地址配置

iOS 原生工程通过 `Info.plist` 的 `MiaoxunAPIBaseURL` 注入 API 地址，值来自 Xcode build setting `MIAOXUN_API_BASE_URL`。React Native 业务代码不直接读取 `SettingsManager`，而是通过项目自有原生桥接 `MiaoxunConfigModule.apiBaseURL` 获取配置，避免依赖 React Native 内部设置模块是否导出自定义 `Info.plist` 字段。

正式发布目标：Debug 默认指向本机后端，Release 必须指向 `https://api.marvelschat.com`。正常 Release 构建脚本会阻止 HTTP、裸 IP、localhost 和 loopback API URL。

2026-07-09 域名实名和 HTTPS 完成前，允许上传临时 IP TestFlight 内测包：Release API 临时指向 `http://8.153.167.11/api`，只为该 IP 放开 iOS ATS HTTP 例外，并通过 `MIAOXUN_TEMP_IP_TESTFLIGHT=1` 明确标记。该配置仅用于内部/外部 TestFlight 测试，不能用于正式上架。

当前配置：

```text
Debug:   http://127.0.0.1:4390
Release: http://8.153.167.11/api  # 临时 TestFlight；正式发布恢复 https://api.marvelschat.com/api
```

本地后端调试时，Debug 配置必须显式改为 Mac 局域网 IP 或可访问的本地测试后端地址，例如：

```text
http://192.168.x.x:4390
```

Release 构建脚本会阻止 HTTP、裸 IP、localhost 和 loopback API URL。上线前还必须确认证书、CORS、鉴权和隐私合规配置均已完成。

Android 使用同名构建参数生成 `BuildConfig.MIAOXUN_API_BASE_URL`，并通过同一个 `MiaoxunConfigModule.apiBaseURL` 暴露给 JS。Android 构建时必须显式传入：

```sh
./gradlew assembleDebug -PMIAOXUN_API_BASE_URL=http://<MAC_LAN_IP>:4390
```

未提供 `MIAOXUN_API_BASE_URL` 时 Android 构建会直接失败，避免生成无法访问后端的包。

Android Release 构建还必须显式提供正式签名参数，不能使用 `debug.keystore`：

```text
MIAOXUN_RELEASE_STORE_FILE=/absolute/path/to/miaoxun-release.keystore
MIAOXUN_RELEASE_STORE_PASSWORD=...
MIAOXUN_RELEASE_KEY_ALIAS=miaoxun
MIAOXUN_RELEASE_KEY_PASSWORD=...
```

这些值可放在本机 `~/.gradle/gradle.properties`、CI 环境变量或临时 `-P` 参数中；不要提交真实 keystore 或密码。示例见 `MiaoxunRN/android/release-signing.properties.example`。

移动端 API 请求当前超时时间为 15 秒；超时必须向用户暴露明确错误，不能让关注、加好友、扫码解析等操作一直处于提交状态。关注和好友申请按钮在提交期间需要显示操作中状态，失败后恢复可点击状态。

## 真机调试

真机调试必须满足以下条件：

- iPhone 已通过 USB 连接 Mac，并在 iPhone 上完成“信任此电脑”。
- iPhone 已开启开发者模式。
- 默认联调使用线上 HTTPS API；只有本地后端调试时，才要求后端服务运行在 Mac 上，手机可以访问 Mac 局域网 IP 和端口 `4390`。
- iOS 模拟器、真机 Debug 和 Release 都使用构建阶段内嵌的 `main.jsbundle`，避免测试依赖 Metro 或开发服务器状态。
- Debug 构建显式传入手机可访问的 API 地址；真机/模拟器互扫时必须与 TestFlight 使用同一个后端，不使用 `127.0.0.1`。
- iOS 工程使用 Apple Development 自动签名；首次安装后，iPhone 必须在“设置 -> 通用 -> VPN 与设备管理”中信任开发者证书。

真机与模拟器互扫测试时，必须同时更新两端 App，并保证两端 `MIAOXUN_API_BASE_URL` 指向同一个服务。模拟器更新后需要重新安装并启动，否则二维码页和扫码处理逻辑可能仍是旧版本。

扫码入口的展示顺序必须是 RN `+` 菜单关闭完成后，再调用原生扫码页；不得在 RN Modal 仍处于关闭动画或交互处理中时直接 present `QRCodeScannerViewController`。iOS 需要在 present 前检查 `AVCaptureDevice.default(for: .video)`，没有可用摄像头时直接返回错误；模拟器不能打开无预览的黑屏扫码页。

查看已连接设备：

```sh
xcrun devicectl list devices
```

构建真机 Debug 包：

```sh
cd MiaoxunRN
xcodebuild -allowProvisioningUpdates \
  -workspace ios/MiaoxunRN.xcworkspace \
  -scheme MiaoxunRN \
  -configuration Debug \
  -destination 'id=<DEVICE_IDENTIFIER>' \
  -derivedDataPath ios/build \
      MIAOXUN_API_BASE_URL=http://<MAC_LAN_IP>:4390 \
  build
```

安装到 iPhone：

```sh
xcrun devicectl device install app \
  --device <DEVICE_IDENTIFIER> \
  ios/build/Build/Products/Debug-iphoneos/MiaoxunRN.app
```

如果设备上已经安装同 Bundle ID 的 TestFlight 版本，USB Debug 包不能直接覆盖该 App。此时必须二选一：在 TestFlight 中更新同一个 build，或先在 iPhone 上卸载 TestFlight 版再安装 Debug 包；不能混用两条安装链路覆盖同一个 `com.wangruoshi.miaoxun`。

启动 App：

```sh
xcrun devicectl device process launch \
  --device <DEVICE_IDENTIFIER> \
  com.wangruoshi.miaoxun
```

如果启动时报 `profile has not been explicitly trusted by the user`，说明 App 已安装但开发者证书未被设备信任。此时需要在 iPhone 上手动信任证书，再重新执行启动命令。这个错误不能通过客户端代码兜底处理。

2026-06-18 本地真机连接记录：

```text
设备：iPhone 14 Pro / iOS 17.6.1
连接：USB wired / paired / developer mode enabled
Debug API：当时使用 Mac 局域网 IP 访问本机 backend；当前线上联调默认使用 https://api.marvelschat.com
Bundle ID：com.wangruoshi.miaoxun
签名：自动签名，Team ID R8K5DUTWB6
JS 加载：真机和模拟器 Debug 都使用构建时内嵌 main.jsbundle
配置桥接：JS 通过 MiaoxunConfigModule.apiBaseURL 读取原生构建配置
结果：Debug 包构建和安装成功；首次启动需要在设备上信任开发者证书。
```

## TestFlight 签名状态

2026-06-23 当前 Xcode 已识别 `Rose Wang Developer Team`，Team ID 为 `R8K5DUTWB6`，角色为 `Admin`。正式 iOS Bundle ID 已从不可用的 `com.gary.miaoxun.rn` 切换为：

```text
com.wangruoshi.miaoxun
```

`MiaoxunRN` target 当前使用自动签名，工程级手动 `CODE_SIGN_IDENTITY[sdk=iphoneos*]` 覆盖已移除，避免 Release 归档时出现自动签名和手动 `Apple Distribution` 冲突。本机已完成 Release 未签名 archive 验证：

```sh
xcodebuild \
  -workspace MiaoxunRN/ios/MiaoxunRN.xcworkspace \
  -scheme MiaoxunRN \
  -configuration Release \
  -destination 'generic/platform=iOS' \
  -archivePath MiaoxunRN/ios/build/MiaoxunRN.xcarchive \
  clean archive \
  CODE_SIGNING_ALLOWED=NO
```

该 archive 证明 RN Release 打包和 iOS 原生编译通过。当前普通自动签名 archive 会因为开发团队下 `0 Provisioned Devices` 无法生成 iOS App Development profile 而失败；TestFlight 上传使用 export 阶段的 App Store Connect 自动签名。

2026-06-23 已创建 Apple Developer App ID 和 App Store Connect App：

```text
Apple Developer App ID: Miaoxun / com.wangruoshi.miaoxun
App Store Connect App: 妙讯
Apple App ID: 6783301943
```

iOS AppIcon 已补齐 iPhone、iPad 和 `ios-marketing` 必需尺寸，`Info.plist` 已设置 `CFBundleIconName=AppIcon`。缺少这些资源时，App Store Connect 会拒绝上传。

2026-06-23 TestFlight 上传已成功：

```text
Uploaded MiaoxunRN
** EXPORT SUCCEEDED **
```

2026-06-23 已在 App Store Connect 完成出口合规确认、关联外部 TestFlight 群组，并提交 Beta App Review。当前 iOS `1.0 (1)` 状态为“正在等待审核”，外部群组为 `YU yunzhi`。审核信息使用专用妙讯审核账号 `app-review-20260623@pizelife.com`，账号密码不写入仓库文档。

构建上传和提交过程中存在 MapLibre、React、ReactNativeDependencies 和 hermesvm 的 dSYM 缺失 warning；该 warning 不阻止 TestFlight 安装或 Beta 审核，但会影响对应 framework 的崩溃符号化。Beta App Review 通过后，才能在外部测试群组中邀请测试员或开启公开链接给朋友安装。

2026-06-24 已将 `CURRENT_PROJECT_VERSION` 从 `1` 升到 `2`，并完成 iOS `1.0 (2)` Release archive、App Store Connect 自动签名导出和 TestFlight 上传。该 build 包含 `react-native-filament` 重复释放崩溃修复、好友列表/聊天页进入公开主页入口，以及后端 `ThreadDTO.peerAiId` 配套字段。

```text
Uploaded MiaoxunRN
** EXPORT SUCCEEDED **
```

App Store Connect 已接收 `1.0 (2)`，构建处理完成后已完成出口合规确认，已加入 TestFlight 外部群组 `YU yunzhi`，状态为“正在测试”。公开链接沿用现有 TestFlight 链接，不需要重新生成；手机 TestFlight 必须更新并安装 `1.0 (2)` 后才能验证本次崩溃修复和公开主页入口，`1.0 (1)` 旧包不会包含这些本地原生与 JS 修改。

2026-06-24 已将 `CURRENT_PROJECT_VERSION` 从 `2` 升到 `3`，并完成 iOS `1.0 (3)` Release archive、App Store Connect 自动签名导出和 TestFlight 上传。该 build 包含在线状态实时事件、登录首屏同步、在线/离线/隐藏菜单 Modal 层级和小站 3D 稳定渲染修复；手机 TestFlight 必须安装 `1.0 (3)` 后才能验证这些真机问题。

```text
Uploaded MiaoxunRN
** EXPORT SUCCEEDED **
```

App Store Connect 已接收 `1.0 (3)`，构建处理完成后已完成出口合规确认，已加入 TestFlight 外部群组 `YU yunzhi`，状态为“正在测试”。公开链接沿用现有 TestFlight 链接，不需要重新生成；手机 TestFlight 更新到 `1.0 (3)` 后再验证在线状态、登录超时、菜单遮挡和小站 3D 崩溃。

2026-06-24 已将 `CURRENT_PROJECT_VERSION` 从 `3` 升到 `4`，并完成 iOS `1.0 (4)` Release archive、App Store Connect 自动签名导出和 TestFlight 上传。该 build 包含 TestFlight build 3 真机回归修复：小站 3D 舞台改为不透明 `FilamentView` 和固定色 `Skybox` 背景，在线/离线/隐藏菜单改为透明浮层并处理真机层级，好友聊天页移除“实时聊天未连接 / 正在连接实时聊天”顶部横幅，并同步 README、MiaoxunRN README、架构和社交流程文档。归档和上传前已执行 `npx tsc --noEmit` 与 `git diff --check`。

```text
Uploaded MiaoxunRN
** EXPORT SUCCEEDED **
```

App Store Connect 已接收 `1.0 (4)`，构建处理完成后已完成出口合规确认，并已加入内部/外部 TestFlight 群组 `YU yunzhi`，状态为“正在测试”。上传过程中仍存在 MapLibre、React、ReactNativeDependencies 和 hermesvm 的 dSYM 缺失 warning；该 warning 不阻止 TestFlight 上传或安装，但会影响对应 framework 崩溃日志的符号化。公开链接沿用现有 TestFlight 链接；手机 TestFlight 更新到 `1.0 (4)` 后再验证小站 3D 背景闪烁、在线状态面板遮挡和聊天页顶部文案问题。

2026-06-24 已将 `CURRENT_PROJECT_VERSION` 从 `4` 升到 `5`，并完成 iOS `1.0 (5)` Release archive、App Store Connect 自动签名导出和 TestFlight 上传。该 build 包含启动恢复登录网络失败不清除 Keychain token、显示账号空间同步重试页、在线/离线/隐藏菜单锚定名称旁状态按钮并固定显示在按钮下方居中，以及 TLS 握手超时问题记录。App Store Connect 已完成出口合规确认，已加入内部/外部 TestFlight 群组 `YU yunzhi`，状态为“正在测试”。模拟器 Debug 已用同一线上 API 地址重新安装启动；连接的 iPhone 当前安装的是 TestFlight `1.0 (4)`，USB Debug 覆盖同 Bundle ID 时被 iOS 安装协调机制拒绝，需要在手机 TestFlight 中更新到 `1.0 (5)`，或手动卸载 TestFlight 版后再安装 Debug 包。

2026-07-01 已将 `CURRENT_PROJECT_VERSION` 从 `6` 升到 `7`，并完成 iOS `1.0 (7)` Release archive、App Store Connect 自动签名导出和 TestFlight 上传。该 build 包含聊天输入框语音转文字入口、iOS Speech / 麦克风权限说明、模拟器语音识别防崩溃拦截，以及好友申请拒绝/取消等移动端更新。App Store Connect 已接收包并进入处理队列；手机 TestFlight 更新到 `1.0 (7)` 后再验证真机语音转文字。

2026-07-02 已将 `CURRENT_PROJECT_VERSION` 从 `7` 升到 `8`，并完成 iOS `1.0 (8)` Release archive、App Store Connect 自动签名导出和 TestFlight 上传。该 build 用于域名实名完成前的异地体验测试，Release API 临时指向 `http://8.153.167.11`，并只为该 IP 放开 iOS ATS HTTP 例外。App Store Connect 已接收包并进入处理队列；手机 TestFlight 更新到 `1.0 (8)` 后再验证异地登录、聊天、好友、扫码和小站基础数据同步。

2026-07-02 已将 `CURRENT_PROJECT_VERSION` 从 `8` 升到 `9`，并完成 iOS `1.0 (9)` Release archive、App Store Connect 自动签名导出和 TestFlight 上传。该 build 继续临时使用 `http://8.153.167.11`，包含好友申请通知红色数字提示、前台实时通知 toast、通过/拒绝好友申请后由后端自动更新通知已读状态，以及线上后端 8 秒延迟离线广播。上传返回 `Uploaded MiaoxunRN` 和 `** EXPORT SUCCEEDED **`；MapLibre、React、ReactNativeDependencies、hermesvm 的 dSYM warning 仍存在，不阻止 TestFlight 安装。

## API 边界

iOS 只调用 `backend` 提供的 API：

```text
POST /api/auth/login
POST /api/auth/register
POST /api/auth/logout
GET /api/me
GET /api/app/bootstrap
GET /api/app/sync
GET /api/agents
POST /api/scan/resolve
GET /api/profiles/ai/:aiId
POST /api/social/follows/:targetUserId
DELETE /api/social/follows/:targetUserId
POST /api/social/friend-requests/:targetUserId
POST /api/social/friend-requests/:requestId/accept
POST /api/social/friends/:friendUserId/thread
GET /api/notifications
GET /api/realtime
POST /api/notifications/read
POST /api/notifications/:notificationId/read
GET /api/social/relationships/:type
GET /api/search/users
GET /api/search/history
POST /api/search/history
PATCH /api/me/profile
POST /api/location/resolve
GET /api/map/style
GET /api/map/tiles/:z/:x/:y.png
GET /api/me/profile-visibility
PATCH /api/me/profile-visibility
GET /api/threads/:threadId/messages
POST /api/threads/:threadId/messages
POST /api/threads/:threadId/read
PATCH /api/me/station-config
POST /api/events
```

好友申请通过后，后端会为双方创建 `peer_user_id` direct 线程。iOS/RN 不在本地伪造好友聊天；好友列表、公开主页 `发消息` 和聊天列表都读取同一套后端线程数据。

## 后续需要补的能力

- 设备注册：保存 APNs device token。
- 通知设置：按用户保存通知偏好。
- 实时消息：direct 好友聊天已使用 `/api/realtime` WebSocket；客户端只重连同一个实时通道，不使用轮询兜底。
- 长任务：显式 `agent_runs` 创建接口和状态查询。
- 扫码跳转规范：当前支持 `miaoxun://ai/<aiId>` 和裸 AI ID 解析，后续需要补签名动态码校验、过期策略落库和内容级跳转。
- 敏感操作确认：发布、外部发送、长期记忆写入前必须确认。

## 2026-06-24 TestFlight 崩溃修复

真机 TestFlight 曾出现“妙讯已崩溃”，控制台日志显示 JS HostFunction 抛出 `Pointer RenderableManagerWrapper has already been manually released!`，崩溃点来自 `react-native-filament` 资源在 Release/TestFlight 生命周期里被 JS cleanup 和原生 GC 重复释放。

已完成处理：

- `StationAvatarSpace` 不再把 `Model` 的 `key` 绑定到形象配置；小站只保留同一个 GLB `Model` 实例，形象变化只通过 `EntitySelector` 更新材质、缩放、显示状态和根节点 Y 轴旋转。后续 build 重新启用固定色 `Skybox` 只用于填满 3D 舞台背景像素，不接入环境贴图或外部光照资源。
- `scripts/patch-react-native-filament.js` 新增原生 `PointerHolder::release()` 幂等释放补丁；重复释放时记录日志并返回，不再抛出导致 App abort 的异常。Pods 头文件是指向 `node_modules/react-native-filament` 的符号链接，iOS 编译会使用该补丁。
- 已执行 `npx tsc --noEmit`、`backend npm run check`、`git diff --check`，均通过；已在 iPhone 17 模拟器重新编译安装，进入小站并横向滑动 3D 形象后未复现 Filament 重复释放崩溃。

TestFlight 手机端必须安装包含本次原生补丁的新 build 后才能验证；旧 TestFlight 包不会自动获得本地 JS/原生依赖修改。

2026-06-24 真机回归继续修复：

- 小站 3D 舞台继续使用 `react-native-filament` 和本地 GLB，不改为 2D；RN 端稳定相机、灯光、场景参数和隐藏配饰缩放引用，形象配置按内容 key 归一化，减少 TestFlight 真机中 profile/bootstrap 刷新触发的原生资源重复初始化。
- 在线/离线/隐藏菜单改为透明 `Modal` 浮层，避免 iPhone 真机上被 AI ID、资料区或滚动层遮挡；菜单必须锚定整个在线状态按钮的屏幕矩形，并在按钮下方居中显示，不能使用触摸事件的 `pageX/pageY`，避免点击文字、圆点或箭头时弹层位置不一致。
- 登录流程必须在 `/api/auth/login` 和 `/api/app/bootstrap` 都成功后才保存 token 并进入主界面；登录页加本地提交锁，避免用户快速点击造成重复请求和半同步状态。
- 启动恢复登录必须区分“认证失效”和“网络入口失败”：只有 `/api/app/bootstrap` 明确返回 401/403 时才清除 Keychain token；TLS 握手失败、请求超时或移动网络不可达时保留 token，展示“账号空间暂时无法同步”页面，并提供“重试同步 / 退出登录”两个明确动作。这样不会把服务器或网络抖动误判成账号不存在，也不会进入未完成 bootstrap 的主页。
- 后端新增 `presence.changed` WebSocket 事件，在线连接、最后断开和模式切换会通知相关好友、关注和 direct 聊天用户；客户端收到后刷新真实 bootstrap 数据，不在本地伪造在线状态。

2026-06-24 TestFlight build 3 真机继续发现小站 3D 舞台背景出现重复块状噪点并闪烁，原因是 `FilamentView` 透明合成时未被模型覆盖的像素会透出底层渲染缓冲。处理要求如下：

- 小站继续使用真实 GLB/Filament 渲染；`FilamentView` 对 3D 舞台改为不透明渲染，并在 Filament 场景内使用固定色 `Skybox` 填满背景像素，避免透明区参与 iOS Metal 层合成。
- 该 `Skybox` 只用于确定背景颜色，不接入环境贴图或外部光照资源；舞台仍使用稳定相机、方向光和点光，不恢复 `EnvironmentalLight`。
- 在线/离线/隐藏菜单不再使用固定 `left/top` 或触点坐标；打开时只测量名称旁状态胶囊本身的屏幕矩形，并固定显示在该按钮下方居中，由全屏透明 `Modal` 承载。点击昵称、状态圆点、文字或箭头都必须复用同一个状态按钮锚点，避免不同 iPhone 尺寸上遮挡 AI ID 或穿到内容层后面。
- 好友聊天页不再显示“实时聊天未连接 / 正在连接实时聊天”横幅；实时 WebSocket 状态仍由 session 维护，发送失败、重试和未读同步继续走真实接口与事件。

## 工程要求

- `MiaoxunRN/ios/MiaoxunRN.xcworkspace` 是 iOS 原生工程入口。
- 生产包必须使用 Release 配置，不允许保留本地 API 地址。
- 域名实名完成前允许上传 TestFlight 临时测试包，但必须显式使用 `MIAOXUN_TEMP_IP_TESTFLIGHT=1`，API 只能指向 `http://8.153.167.11/api`。如果需要外部群组，`ExportOptions-AppStoreConnect.plist` 必须设置 `testFlightInternalTestingOnly=false`，并在 App Store Connect 完成 Beta App Review；该配置不能用于正式上架。
- `Info.plist` 不能保留空白权限说明；新增相机、相册、文件、通知等能力时，必须同步填写对应用途说明并更新 `PrivacyInfo.xcprivacy`。
- Android 新增系统能力时，必须同步更新 `AndroidManifest.xml` 权限、Gradle 依赖和本文件的桥接说明。
- 每次新增或调整移动端能力，都要同步更新 `README.md`、`MiaoxunRN/README.md` 和相关 `docs/` 文档。

2026-07-07 已上传 `1.0 (10)`，但该 build 误设为 `testFlightInternalTestingOnly=true`，只能内部测试，后续不分发。

2026-07-07 已将 iOS TestFlight build 升到 `1.0 (11)`，Release API 临时指向 `http://8.153.167.11`，只为该 IP 放开 ATS HTTP 例外，并通过 `MIAOXUN_TEMP_IP_TESTFLIGHT=1` 明确标记临时 IP 测试。`ExportOptions-AppStoreConnect.plist` 已设置 `testFlightInternalTestingOnly=false`，该 build 可用于外部群组。已完成 `npm run lint -- --max-warnings=0`、`npx tsc --noEmit`、`npm test -- --runInBand`、Release archive 和 App Store Connect 上传；上传返回 `Uploaded MiaoxunRN` / `** EXPORT SUCCEEDED **`。App Store Connect 已完成构建处理、出口合规确认和外部 TestFlight 配置，`1.0 (11)` 当前状态为“正在测试”，已加入内部/外部群组 `YU yunzhi`，外部公开链接沿用 `https://testflight.apple.com/join/jKSqUnYU`。该 build 用于验证真机登录、聊天、好友、扫码、小站相册/拍照上传和 OSS 读取链路；域名实名和 HTTPS 完成后必须恢复 `https://api.marvelschat.com` 发布配置。

2026-07-07 已将 iOS TestFlight build 升到 `1.0 (12)` 并上传 App Store Connect。该 build 包含定位语义调整：后端高德解析不再把楼宇、商场、POI 作为“所属社区”，而是将它们作为“当前位置区域”；“所属社区”只采用高德返回的社区、街道、区县、城市等归属层级。上传前已完成 `backend npm run check`、`npm run lint -- --max-warnings=0`、`npx tsc --noEmit`、`npm test -- --runInBand`、Release archive；archive 内确认 `CFBundleVersion=12`，`MiaoxunAPIBaseURL=http://8.153.167.11`。上传返回 `Uploaded MiaoxunRN` / `** EXPORT SUCCEEDED **`。App Store Connect 已完成处理，`1.0 (12)` 当前状态为“正在测试”，已加入内部/外部群组 `YU yunzhi`，外部群组邀请数显示 4。上传仍存在 MapLibre、React、ReactNativeDependencies、hermesvm 第三方 framework dSYM 缺失 warning；不阻止 TestFlight 分发，但会影响这些 framework 的崩溃符号化。

2026-07-07 已将 iOS TestFlight build 升到 `1.0 (13)` 并上传 App Store Connect。该 build 移除小站位置页的地图选点主流程，位置确认改为“所属社区 + 活动区域”候选标签；高德逆地理解析优先把 `businessAreas` 作为活动区域，服务器采样坐标返回 `community=桂溪街道`、`activityArea=交子商圈`。小站首页调整为个人日记固定 4 格、个人相册仅展示最近 3 个相册，不再在首页展开相册分类详情。后端同步新增日记、相册、媒体资产的 PATCH 更新和 DELETE 软删除接口，并已部署到 `/opt/projects/marvels-chat/app/backend`。上传前已完成 `backend npm run check`、`npm run lint -- --max-warnings=0`、`npx tsc --noEmit`、`npm test -- --runInBand`、Release archive；archive 内确认 `CFBundleVersion=13`，`MiaoxunAPIBaseURL=http://8.153.167.11`。上传返回 `Uploaded MiaoxunRN` / `** EXPORT SUCCEEDED **`。上传仍存在 MapLibre、React、ReactNativeDependencies、hermesvm 第三方 framework dSYM 缺失 warning；不阻止 TestFlight 分发，但会影响这些 framework 的崩溃符号化。

2026-07-07 已将 iOS TestFlight build 升到 `1.0 (14)` 并上传 App Store Connect。该 build 修正 build 13 的小站首页展示问题：数据库未清空，TGary 账号线上仍有 1 条日记、7 个相册和 4 个照片媒体；首页相册排序改为优先展示有媒体活动的相册，避免最近创建的空相册把已有照片挤出前三个；日记空位移除“空日记格”文字模板，仅保留空占位；相册卡片保留点击封面添加照片，移除重复的“添加照片”按钮；Agent 推荐列表不再截断前 4 个，`可添加 7 个` 与实际 7 个推荐卡片一致。上传前已完成 `npm run lint -- --max-warnings=0`、`npx tsc --noEmit`、`npm test -- --runInBand`、Release archive；archive 内确认 `CFBundleVersion=14`，`MiaoxunAPIBaseURL=http://8.153.167.11`。上传返回 `Uploaded MiaoxunRN` / `** EXPORT SUCCEEDED **`。上传仍存在 MapLibre、React、ReactNativeDependencies、hermesvm 第三方 framework dSYM 缺失 warning；不阻止 TestFlight 分发，但会影响这些 framework 的崩溃符号化。

2026-07-07 已将 iOS TestFlight build 升到 `1.0 (15)` 并上传 App Store Connect。该 build 补齐小站个人日记和个人相册的详情管理闭环：首页和动态流点击日记/相册会进入统一管理页；日记支持编辑标题、正文、可见范围和删除；相册支持编辑标题、描述、可见范围、添加照片、删除照片和删除相册。该管理页复用后端真实 PATCH/DELETE 软删除接口，不清空数据库，不使用固定模板数据。上传前已完成 `npm run lint -- --max-warnings=0`、`npx tsc --noEmit`、`npm test -- --runInBand`、Release archive；archive 内确认 `CFBundleVersion=15`，`MiaoxunAPIBaseURL=http://8.153.167.11`。上传返回 `Uploaded MiaoxunRN` / `** EXPORT SUCCEEDED **`。上传仍存在 MapLibre、React、ReactNativeDependencies、hermesvm 第三方 framework dSYM 缺失 warning；不阻止 TestFlight 分发，但会影响这些 framework 的崩溃符号化。

2026-07-09 已将 iOS TestFlight build 升到 `1.0 (16)` 并上传 App Store Connect。该 build 将 Release API Base 改为 `http://8.153.167.11/api`，客户端 `buildApiUrl` 会自动处理业务 path 是否带 `/api`，避免 `/api/api` 或漏 `/api`；WebSocket 和地图 style URL 也统一走同一构造规则。网络层新增安全日志，输出 method、最终 URL、状态码、脱敏后的响应摘要和环境名，不输出密码、token、API key、OSS key 或用户隐私正文。AI 伙伴页已接入功能类 Agent API：`site-drafts`、`model-jobs`、`file-assets`、`album-suggestions`、`comic-diaries`、`video-drafts`，并展示 `/api/app/bootstrap` 返回的 `agentReadiness`。上传前已完成 `npm run lint -- --max-warnings=0`、`npx tsc --noEmit`、`npm test -- --runInBand`、Release archive；archive 内确认 `CFBundleVersion=16`，`MiaoxunAPIBaseURL=http://8.153.167.11/api`。同时用 curl 确认 `http://8.153.167.11/api/health` 返回 200，未登录访问 `http://8.153.167.11/api/station/site-drafts` 返回 401，`https://miaoxun-api.pizelife.com/api/health` 当前仍返回 502。上传返回 `Uploaded MiaoxunRN` / `** EXPORT SUCCEEDED **`。上传仍存在 MapLibre、React、ReactNativeDependencies、hermesvm 第三方 framework dSYM 缺失 warning；不阻止 TestFlight 分发，但会影响这些 framework 的崩溃符号化。

2026-07-09 已将 iOS TestFlight build 升到 `1.0 (17)` 并上传 App Store Connect。该 build 延续 build 16 的临时服务器策略，Release API Base 明确为 `http://8.153.167.11/api`，用于域名实名和 HTTPS 完成前验证后端 Agent 接口效果。上传前已确认 archive 内 `CFBundleShortVersionString=1.0`、`CFBundleVersion=17`、`MiaoxunAPIBaseURL=http://8.153.167.11/api`；已完成 `npm run lint -- --max-warnings=0`、`npx tsc --noEmit`、`npm test -- --runInBand`、后端 `npm run check`。同时用 curl 确认 `http://8.153.167.11/api/health` 返回 200，数据库连接正常，未登录访问 `http://8.153.167.11/api/station/site-drafts` 返回 401，说明接口存在且鉴权生效。上传返回 `Uploaded MiaoxunRN` / `** EXPORT SUCCEEDED **`。上传仍存在 MapLibre、React、ReactNativeDependencies、hermesvm 第三方 framework dSYM 缺失 warning；不阻止 TestFlight 分发，但会影响这些 framework 的崩溃符号化。若 Cursor 中 `MiaoxunRN/src/App.tsx` 仍显示未保存冲突，必须先 Compare 并合并，不能直接覆盖磁盘版本；当前 `1.0 (17)` 使用的是磁盘上的 `App.tsx`。
