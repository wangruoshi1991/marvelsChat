# 妙讯移动端上线功能实施清单

本文用于约束妙讯 iOS / Android 上线前的功能边界。每个功能必须说清楚实现链路、平台差异、后端依赖、第三方服务、当前状态和上线前缺口；不使用客户端假数据、不用临时兜底替代正式方案。

## 上线原则

1. 核心业务数据必须来自后端和数据库，客户端只负责展示、交互和系统能力桥接。
2. React Native 承担跨平台业务逻辑，iOS / Android 原生层只做系统能力薄桥接。
3. Release 包必须使用证书有效的公网 HTTPS API，不能使用 `127.0.0.1`、localhost 或局域网地址；受信任证书覆盖的固定公网 IP 可以作为正式 origin。
4. 配置缺失、权限拒绝、网络失败、后端错误都必须给出明确错误状态，不静默切换到示例数据。
5. 未正式接入的功能只展示待接入状态或暂不入口，不填充假列表、假聊天、假地址或假文件。
6. 涉及费用、平台审核、隐私权限和第三方服务的能力，先确认供应商和合规方案，再进入上线清单。

## 当前环境基准

移动端正式工程：`MiaoxunRN/`

当前 iOS Bundle ID：`com.wangruoshi.miaoxun`

当前 Android application ID：`com.wangruoshi.miaoxun`

当前 API 配置：

```text
iOS Debug:   http://127.0.0.1:4390
iOS Release: https://8.153.167.11
```

说明：

- Debug 默认用于本机后端联调；正式 Release 已加构建校验，只允许公网 HTTPS origin，不能使用 localhost 或 loopback URL。
- 如需本地后端调试，必须显式改为 Mac 局域网地址或单独建 Debug 配置；同一次扫码联调不能混用两套后端。
- Android 构建必须显式传入 `MIAOXUN_API_BASE_URL`。正式上线 Release 必须使用 HTTPS API。

当前后端入口：

```text
正式 API origin: https://8.153.167.11
可选域名 origin: https://api.marvelschat.com
业务路径前缀: /api
管理后台: https://8.153.167.11/admin/
```

正式包必须使用受信任的 HTTPS API，不能使用 `127.0.0.1` 或局域网地址。当前 Let's Encrypt 证书的 SAN 直接覆盖固定公网 IP；域名完成后可切换 origin，但不是 App Store 上架的技术前置条件。

2026-09-09 发布检查确认：`https://8.153.167.11` 的证书链、IP SAN、外部健康检查和 Apple ATS 均通过；Release 已切换到该 HTTPS origin 并删除 HTTP ATS 例外。域名审核继续单独跟踪，不再阻断移动端发布。

## 功能分级

### 上线必需

| 功能 | 当前状态 | 上线要求 |
| --- | --- | --- |
| 登录 / 注册 | 已接入真实后端 | 保持昵称唯一，登录失败、网络失败、会话过期提示清楚 |
| 会话恢复 / 退出登录 | 已接入 Keychain 和后端 session | 网络失败和 403 不能误清 token，只有 401 使会话失效 |
| 聊天列表 / 妙讯管家 | 已接入真实会话和消息 | 不能展示假会话；模型未配置时要清楚记录和提示 |
| 好友 direct 聊天 | 已接入真实线程、消息、WebSocket | 发送失败可重试，不能写入假送达 |
| 语音转文字输入 | 已接入 iOS / Android 系统语音识别 | 识别结果只回填输入框，由用户确认发送；真机验证权限和识别可用性 |
| 关注 / 好友申请 / 通知 | 已接入关注、申请、通过、拒绝、取消和通知闭环 | 操作中、成功、失败状态完整 |
| 小站基础资料 | 已接入 profile | 修改资料必须走后端保存 |
| 后端部署 | 已部署 ECS + PolarDB | 当前临时 HTTP 可测试，正式上线必须补 HTTPS、健康检查、日志和数据库迁移稳定性 |
| iOS TestFlight | 已具备历史上传基础 | 当前源码临时使用 ECS 公网 IP；正式包必须使用 HTTPS API |
| Android 基础构建 | 工程存在 Android 目录 | 上线前补签名、权限、真机回归 |

### 上线可选

| 功能 | 当前状态 | 决策 |
| --- | --- | --- |
| 扫码看主页 | 已接入 iOS / Android 原生桥接和后端解析 | 可作为早期亮点，但要真机验证相机权限和失败态 |
| 定位名称解析 | 已接系统定位和高德逆地理编码；无地图展示 | 暂不作为首版必需；上线前确认生产授权、配额和隐私披露 |
| 管理后台 | 已部署静态后台 | 内部使用即可，不作为公开产品入口 |
| 3D 小站形象 | 已接入私有照片、四视图确认、Tripo 任务和移动端 GLB | 上线前完成真实付费链路、内容审核、失败计费、保留策略和真机性能回归 |

### 暂缓正式上线

| 功能 | 暂缓原因 |
| --- | --- |
| 个人日记 | 手写日记已入库；缺少 Agent 生成任务、漫画分镜、审核和公开读取策略 |
| 相册 | 元数据、OSS 上传、上传完成回写和 App 图片读取已接入；仍缺媒体审核和公开读取策略，服务器凭据由发布预检确认 |
| 音乐菜单 | 缺少版权/来源/播放能力 |
| 文件 | 缺少 OSS 权限模型、上传下载审计 |
| 语音消息 | 缺少录音、OSS 上传、媒体消息类型、播放、审核和清理策略 |
| AI 建站 | 已接模型生成草稿并拒绝规则假结果；仍缺正式发布托管、内容审核和域名方案 |
| 复杂多 Agent 编排 | 需要后端权限、任务状态、审计和用户确认机制 |
| 推送通知 | 需要 APNs / FCM、设备 token、通知偏好和隐私说明 |

## 功能实现链路

### 1. 账号与会话

iOS 实现：

- React Native 登录/注册页面收集昵称、手机号或邮箱、密码。
- Token 通过 `react-native-keychain` 保存到 Keychain。
- App 启动时读取 Keychain token，调用 `/api/app/bootstrap` 恢复账号。

Android 实现：

- 业务逻辑与 iOS 共用 React Native。
- Token 同样通过 `react-native-keychain` 对应 Android Keystore 保存。

后端依赖：

- `POST /api/auth/register`
- `POST /api/auth/login`
- `POST /api/auth/logout`
- `GET /api/app/bootstrap`
- PostgreSQL: `users`、`auth_sessions`、`user_profiles`

上线前检查：

- 网络失败不清除 token。
- 只有 401 清除本地 token 并回到登录页；403 作为当前操作无权限处理。
- 默认管理员密码不得暴露给普通用户。

### 2. 聊天与实时通道

iOS / Android 实现：

- React Native 消息列表、聊天页、消息发送、失败重试。
- WebSocket 由 `useRealtimeChannel` 管理，按登录 token 生命周期连接。
- 客户端可以显示本地发送中状态，但成功后必须由后端真实消息替换。

后端依赖：

- `POST /api/threads/:threadId/messages`
- `POST /api/threads/:threadId/read`
- `GET /api/app/sync`
- `GET /api/realtime` WebSocket upgrade
- PostgreSQL: `chat_threads`、`chat_messages`

上线前检查：

- WSS 必须和 HTTPS 同域名可用。
- 断线后只重连同一实时通道，不用短轮询伪装实时。
- 发送失败消息不能写入后端。

### 3. 好友、关注与通知

iOS / Android 实现：

- 公开主页展示关系状态。
- 关注、取消关注、发送好友申请、通过好友申请都走后端。
- 通知页展示真实通知和未读数。

后端依赖：

- `POST /api/social/follows/:targetUserId`
- `DELETE /api/social/follows/:targetUserId`
- `POST /api/social/friend-requests/:targetUserId`
- `POST /api/social/friend-requests/:requestId/accept`
- `GET /api/notifications`
- PostgreSQL: `social_relationships`、`social_requests`、`notifications`

上线前检查：

- 所有按钮有提交中状态。
- 接口失败后恢复按钮并提示错误。
- 好友通过后双方 direct 线程必须真实生成。
- 接收方可以拒绝待处理申请；发起方可以取消自己发出的待处理申请。

### 4. 语音转文字输入

当前状态：已接入聊天输入框。

iOS 实现：

- `MiaoxunSpeechModule` 使用 Apple Speech framework 和 `AVAudioEngine`。
- 需要 `NSSpeechRecognitionUsageDescription` 和 `NSMicrophoneUsageDescription`。
- 用户点击聊天输入框左侧麦克风按钮后开始一次识别，识别结果追加到草稿输入框。

Android 实现：

- `MiaoxunSpeechModule` 使用系统 `SpeechRecognizer`。
- 需要 `RECORD_AUDIO` 权限。
- 用户点击聊天输入框左侧麦克风按钮后开始一次识别，识别结果追加到草稿输入框。

产品边界：

- 语音转文字不是语音消息。
- 当前版本不保存录音、不上传音频、不生成媒体消息。
- 识别文字不会自动发送，必须由用户检查后点击发送。

上线前检查：

- iOS 真机验证语音识别权限、麦克风权限、拒绝权限后的错误提示。
- Android 真机验证系统语音服务可用、录音权限、拒绝权限后的错误提示。
- 模拟器可能没有稳定麦克风或系统识别服务，不能作为最终验收依据。

### 5. 扫码与动态码

iOS 实现：

- `QRCodeScannerModule` 使用 AVFoundation 打开相机。
- 扫码成功返回二维码文本给 JS。

Android 实现：

- CameraX + ML Kit bundled barcode scanning。
- 对 JS 暴露同名 `QRCodeScannerModule.scan()`。

后端依赖：

- `POST /api/scan/resolve`
- 用户 AI ID 和公开主页数据。

上线前检查：

- 相机权限文案清楚。
- 扫码取消、权限拒绝、设备无相机必须明确提示。
- 二维码只打开主页，不直接创建好友。
- 后续正式动态码应补签名、过期和撤销表。

### 6. 小站基础资料

iOS / Android 实现：

- React Native 展示和编辑昵称、简介、社区、活动区域；`avatar_config` 当前只用于小站展示和用户小头像，不提供正式编辑入口。
- 用户保存时调用后端更新 profile。

后端依赖：

- `PATCH /api/me/profile`
- `PATCH /api/me/profile-visibility`
- PostgreSQL: `user_profiles`、`profile_visibility`

上线前检查：

- 昵称唯一由后端和数据库共同保证。
- 公开主页必须按隐私开关过滤字段。
- 未接入模块只显示待接入，不写假内容。

### 7. 定位

当前决策：保留系统定位和真实社区/活动区域候选确认，首版不提供地图选点。

正确实现链路：

```text
App 请求系统定位权限
-> iOS CoreLocation / Android LocationManager 返回 WGS84 坐标
-> App 调用 /api/location/resolve
-> 后端调用明确配置的地理编码供应商
-> 返回社区 / 活动区域候选
-> 用户确认保存
```

不能做的事：

- 不能在客户端写默认地址。
- 不能为了模拟器或网络失败加假位置兜底。
- 不能长期依赖公共免费接口作为生产服务。
- 不能在地理编码授权、配额和隐私披露未确认前把定位列为上线必需。

正式做之前必须确认：

- 高德逆地理编码是否有生产授权和足够配额。
- iOS / Android 权限说明是否符合应用实际用途。
- 高德供应商适配层的 WGS84 / GCJ-02 转换是否通过真机坐标抽样验证。

### 8. 3D 形象

当前状态：

- App 已接入私有照片上传、参考图确认、Tripo 建模任务、任务状态和模型管理流程。
- 小站主舞台使用内嵌 Three.js `0.180.0` 查看器加载 App 专用 GLB；移动端不嵌入伙伴 Web 工作台。
- 原始高精 GLB 与移动端压缩 GLB 分开保存，移动端文件缺失时明确失败，不回退下载大体积原件。

上线策略：

- 保留经过审核、计费和失败策略验证的照片生成与模型展示闭环。
- 捏脸、骨骼动画、服装素材库和动作系统在具备真实资产与服务前不开放入口。
- 不把参考图、缩略图或确定性预处理结果描述成最终 3D 模型。

上线前检查：

- iOS Release / TestFlight 与 Android 真机完成生成、恢复、刷新、删除和弱网验证。
- 确认付费任务扣费时点、失败/超时退款、并发限制、资产保留期限和人工处理流程。
- 第三方素材与生成服务具备授权、内容审核、隐私告知和性能评估。

### 9. 管理后台

实现方式：

- `admin/` 是独立 Vite 前端。
- 后端提供 `/api/admin/*`。
- 管理后台只供内部使用，不在 App 里暴露入口。

上线前检查：

- 管理员账号密码不写入公开仓库。
- 后台只能通过 HTTPS 访问正式后端。
- 用户状态、角色、重置密码、撤销 session 都有审计记录。

### 10. AI / Agent

实现链路：

```text
App 聊天
-> backend message API
-> agent runtime
-> registered agent
-> OpenAI-compatible provider
-> PostgreSQL agent_runs 审计
```

原则：

- 前端不保存模型供应商密钥。
- 前端不直接调用模型 API。
- Agent 权限、提示词、模型调用、审计都在后端。
- 未配置模型时，消息仍可入库，但不能伪造 token 或假装模型已接入。

上线前检查：

- `NEW_API_BASE_URL`、`NEW_API_KEY`、`NEW_API_MODEL` 在服务器环境文件中配置。
- 模型失败、超时、额度不足都返回明确错误。
- 高权限 Agent 操作必须有用户确认流程。

## iOS 上线清单

发布前先运行：

```bash
# 正式发布，HTTPS、ATS、后端和生产依赖必须全部通过
scripts/check-launch-readiness.sh
```

该脚本会检查当前 Release HTTPS origin、域名状态、服务器后端 liveness/readiness、生产安全开关、OSS 与 3D 供应商配置、iOS Release API 地址、ATS 例外和 Android Gradle 所需 Java Runtime。域名状态单独记录为 warning；HTTPS、服务或配置 failure 仍应阻止上传。

1. Nginx 的 IP HTTPS 证书有效且自动续期任务成功。
2. ECS 公网 IP 保持固定；IP 变化会导致现有 App 无法连接并需要发布新版本。
3. iOS Release `MIAOXUN_API_BASE_URL=https://8.153.167.11`。
4. Release 不包含 HTTP ATS 例外。
5. `CURRENT_PROJECT_VERSION` 递增；当前工程为 42，下一次上传不得复用已存在的构建号。
6. `npx tsc --noEmit` 通过。
7. `npm test -- --runInBand` 通过。
8. `npm run lint` 无 error；warning 可登记后续处理。
9. Release archive 成功。
10. App Store Connect 上传成功。
11. 完成出口合规确认。
12. 加入 TestFlight 内部/外部测试组。
13. 真机测试登录、注册、聊天、好友、扫码、语音转文字、小站基础资料。

## Android 上线清单

1. Android namespace 和 application ID 已统一为正式标识 `com.wangruoshi.miaoxun`；首次上架前在应用市场使用同一标识创建应用，之后不得更改。
2. 准备正式 keystore，真实密码只放本机或 CI，不提交仓库。
3. Release 构建传入 `MIAOXUN_API_BASE_URL=https://8.153.167.11`。
4. 检查 Android 权限：相机、麦克风、定位、网络、通知。
5. Android 真机验证登录、注册、聊天、扫码、语音转文字、小站资料。
6. 如定位进入上线范围，必须完成 Android 定位权限、高德逆地理编码授权和隐私合规说明。
7. 准备应用市场隐私政策、权限说明和测试账号。

## 当前不做的临时方案

- 不为定位添加模拟器假地址兜底。
- 不把公共 Nominatim 当长期生产服务。
- 不为未接入模块填假内容。
- 不在客户端保存模型 Key。
- 不让 App 直接连接数据库。
- 不为发布放宽数据库、Redis、OSS 或后台权限，也不恢复历史 HTTP IP 例外。

## 下一步建议

优先顺序：

1. 确认 IP 证书续期、iOS Release HTTPS origin 和无 ATS 例外持续通过发布检查。
2. 跑一轮 iOS 模拟器和真机核心链路。
3. 打新 TestFlight 包。
4. 再启动 Android Release 准备：签名、权限、应用市场配置和真机回归。
5. 域名审核完成后评估切换 origin；切换不涉及数据库迁移。
6. 定位、推送、文件、相册等增强功能另开正式方案，不插入临时实现。
