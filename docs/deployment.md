# 妙讯部署说明

## 当前生产测试目标

TestFlight 只负责把 iOS App 分发给测试用户；登录、聊天、扫码解析、妙讯管家、通知、在线状态、定位名称解析和地图都必须连接公网 HTTPS 后端。

当前后端要求 Node.js 20+ 和 PostgreSQL。团队新的阿里云生产测试环境使用 ECS 承载后端 Docker 服务，数据库、缓存和文件分别使用 PolarDB PostgreSQL、Tair / Redis 和 OSS。Docker 镜像固定使用 Node 20 slim，镜像构建上下文是仓库根目录，因为 `backend/src` 会按相对路径加载 `agents/registry.js`。

当前阿里云资源：

```text
ECS：i-uf6ikxhmdl3az4qls99c，公网 IP 8.153.167.11，私网 IP 172.25.210.107
PolarDB：pc-uf64w91ivxd2160iu，数据库 marvels_chat，账号 marvels_chat
Redis：r-uf6fvbi3bbux1cjwer.redis.rds.aliyuncs.com:6379
OSS Bucket：marvels-chat
```

PolarDB 和 Redis 当前白名单只放行 ECS 私网 IP `172.25.210.107`。生产服务部署在 ECS 上后，通过阿里云内网地址连接数据库和缓存，不需要在本地电脑或同学家庭网络上频繁配置公网白名单。

## 服务器目录

建议放在：

```text
/opt/projects/marvels-chat
```

其中：

```text
/opt/projects/marvels-chat/app      # 仓库代码或 rsync 后的发布文件
/opt/projects/marvels-chat/deploy   # docker-compose.prod.yml 和 miaoxun-prod.env
```

真实 `miaoxun-prod.env` 只保存在服务器，不提交仓库。

## 必需环境变量

参考 [deploy/miaoxun-prod.env.example](../deploy/miaoxun-prod.env.example)。

必须设置：

- `POSTGRES_HOST`、`POSTGRES_USER`、`POSTGRES_PASSWORD`、`POSTGRES_DATABASE`：阿里云 PolarDB 连接信息。
- `REDIS_URL`：阿里云 Tair / Redis 连接信息。当前代码未强依赖 Redis，但后续 session、缓存、队列和限流会使用。
- `OSS_REGION`、`OSS_BUCKET`、`OSS_ENDPOINT`、`OSS_ACCESS_KEY_ID`、`OSS_ACCESS_KEY_SECRET`：OSS 文件能力。AccessKey 后续应使用程序专用 RAM 用户。
- `DEFAULT_ADMIN_PASSWORD`：正式管理员初始密码，不能使用示例值。
- `NEW_API_BASE_URL`、`NEW_API_KEY`、`NEW_API_MODEL`：妙讯管家 AI 调用。
- `GEOCODING_REVERSE_URL`、`GEOCODING_USER_AGENT`：定位坐标解析社区和活动区域。
- `MAP_TILE_URL_TEMPLATE`、`MAP_TILE_USER_AGENT`：地图瓦片代理。

## 启动顺序

```sh
cd /opt/projects/marvels-chat/app/deploy
docker-compose -f docker-compose.prod.yml up -d --build
docker-compose -f docker-compose.prod.yml exec backend npm run db:migrate
curl http://127.0.0.1:4390/api/health
```

服务器当前 Docker Compose 版本较旧，生产 compose 文件使用 `version: "2"` 并通过 `env_file` 注入环境变量，不依赖 `--env-file` 参数。

如果 `up -d --build` 后立刻执行迁移时看到：

```text
ERROR: Container ... is restarting, wait until the container is running
```

先查看容器状态和后端日志：

```sh
cd /opt/projects/marvels-chat/app/deploy
docker-compose -p miaoxun -f docker-compose.prod.yml ps
docker-compose -p miaoxun -f docker-compose.prod.yml logs --tail=120 backend
```

必须等 `miaoxun_backend_1` 状态变成 `Up` 后再执行迁移。生产 compose 不再启动本地 PostgreSQL 容器；后端会直接连接阿里云 PolarDB。

## 线上冒烟测试

后端部署完成后需要至少验证以下链路：

```sh
curl http://127.0.0.1:4390/api/health
curl https://miaoxun-api.pizelife.com/api/health
```

2026-06-23 线上已验证：

- 本机容器口 `http://127.0.0.1:4390/api/health` 连续返回 `ok: true`。
- 服务器自身访问 `https://miaoxun-api.pizelife.com/api/health` 连续返回 `ok: true`。
- 公网域名完成注册、登录、`/api/app/bootstrap` 和 `/api/realtime` WebSocket 连接测试。
- 测试账号只用于部署冒烟，不作为正式用户。

本地 Mac 如果开启代理或使用 Fake-IP DNS，`miaoxun-api.pizelife.com` 可能被解析到 `198.18.x.x`，会出现 `SSL_ERROR_SYSCALL` 或间歇性握手失败。排查时先用 `dig +short miaoxun-api.pizelife.com` 确认解析结果，必要时用 `curl --noproxy '*' --resolve miaoxun-api.pizelife.com:443:1.15.135.238 https://miaoxun-api.pizelife.com/api/health` 绕过本地代理解析。

2026-06-24 真机 TestFlight 发现首次打开或首次登录偶发网络超时；本机连续请求 `https://miaoxun-api.pizelife.com/api/health` 时也复现 TLS 握手阶段 `SSL_ERROR_SYSCALL`，成功请求约 0.1 秒返回，说明问题发生在 HTTPS 入口或本地/移动网络链路，而不是 `/api/app/bootstrap` 业务查询固定慢。客户端已调整启动恢复登录状态机：网络失败不清 Keychain token，只有 401/403 才判定 session 失效；服务器侧仍需持续检查 Nginx/证书/运营商链路，确保公网 443 连续握手稳定。

2026-06-24 继续验证聊天实时体验时，再次连续请求线上 `/api/health`，5 次中 1 次在 TLS 握手阶段返回 `SSL_ERROR_SYSCALL`。客户端已把 WebSocket 生命周期收敛到登录 token，避免 presence 事件导致实时连接自重建；但如果 HTTPS/WSS 入口仍偶发握手失败，手机端仍会出现登录、聊天、定位解析和地图瓦片请求间歇变慢或超时。该问题必须从服务器 Nginx、证书链、反向代理和公网网络稳定性继续排查。

## 当前线上配置状态

2026-06-23 当前服务器 `/home/ubuntu/miaoxun/app/deploy/miaoxun-prod.env` 状态：

- `NEW_API_BASE_URL=https://api.z.ai/api/paas/v4`
- `NEW_API_MODEL=glm-4.5-air`
- `NEW_API_TIMEOUT_MS=30000`
- `NEW_API_KEY` 当前服务器未配置；本地测试 Key 已返回额度不足，妙讯管家暂不可用。
- `PUBLIC_API_BASE_URL=http://8.153.167.11` 为后端生成地图瓦片代理 URL 使用的临时站点根地址；`/api/map/style` 使用它生成 `/api/map/tiles/...` 地址，不能依赖 Nginx 反代协议推断。它不同于移动端内嵌的 `MIAOXUN_API_BASE_URL`。
- 2026-07-09 当前 iOS TestFlight `1.0 (16)` 的移动端 API Base 为 `http://8.153.167.11/api`；客户端会自动处理业务 path 是否带 `/api`，避免漏 `/api` 或拼成 `/api/api`。
- 当前服务器地理编码仍为 `GEOCODING_PROVIDER=nominatim`，地图瓦片为 OpenStreetMap 模板；2026-07-02 服务器访问 Nominatim 和 OSM 瓦片均超时，手机定位解析和地图加载会失败或不稳定。
- 正式测试定位前需要切换到明确可用的地理编码和地图瓦片服务，例如配置高德 Web 服务 `AMAP_WEB_SERVICE_KEY` 并采购/确认合规瓦片服务；不能把公共 OpenStreetMap 当稳定生产依赖。
- 注册模型已改为昵称唯一：发布新 TestFlight 前必须执行最新数据库迁移，迁移会把历史重复昵称追加短后缀；迁移后注册和资料改名都会由后端与数据库共同拒绝重复昵称。

修改 `PUBLIC_API_BASE_URL`、`NEW_API_KEY`、`NEW_API_TIMEOUT_MS`、`GEOCODING_PROVIDER`、`GEOCODING_REVERSE_URL`、`GEOCODING_TIMEOUT_MS`、`AMAP_WEB_SERVICE_KEY` 或 `AMAP_REVERSE_URL` 后需要只重启妙讯后端服务：

```sh
cd /home/ubuntu/miaoxun/app/deploy
docker-compose -p miaoxun -f docker-compose.prod.yml up -d backend
```

## HTTPS 和 TestFlight

iOS Release 正式上线目标 API 地址是：

```text
https://api.marvelschat.com
```

2026-07-09 临时测试策略：正式域名实名和 HTTPS 完成前，iOS Release 临时使用 `http://8.153.167.11/api`，并在 iOS `Info.plist` 里只为该 IP 放开 HTTP ATS 例外，方便异地成员先通过 TestFlight 连接真实 ECS 后端、PolarDB 和 Redis 进行体验测试。该策略只用于内部测试，不作为上线配置。

正式上线前必须恢复为 `https://api.marvelschat.com`，删除 Release 不需要的 HTTP ATS 例外，并确认 Nginx 443 证书、续期和 WebSocket `/api/realtime` 反向代理都正常。

2026-06-23 已在本机完成 iOS Release 未签名 archive 构建验证：

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

归档结果：

- Archive 路径：`MiaoxunRN/ios/build/MiaoxunRN.xcarchive`
- Bundle ID：`com.wangruoshi.miaoxun`
- Version：`1.0`
- Build：`1`
- 签名状态：未签名 archive，代码编译和 RN Release 打包通过。

普通自动签名 archive 当前会被 Apple 开发描述文件阻止：

```text
Your team has no devices from which to generate a provisioning profile.
No profiles for 'com.wangruoshi.miaoxun' were found.
```

这是因为 Xcode 账号页显示 `On Device Testing: 0 Provisioned Devices`，开发签名没有可生成 profile 的设备。TestFlight 分发本身不需要登记测试设备，但上传前必须具备 App Store Connect provider、同 Bundle ID 的 App 记录和 App Store 分发签名资料。

本机 Xcode 已识别正式团队：

```text
Team: Rose Wang
Team ID: R8K5DUTWB6
Role: Admin
Bundle ID: com.wangruoshi.miaoxun
```

iOS 工程 Target 使用 `CODE_SIGN_STYLE=Automatic`、`DEVELOPMENT_TEAM=R8K5DUTWB6`、`PRODUCT_BUNDLE_IDENTIFIER=com.wangruoshi.miaoxun`。工程级 `CODE_SIGN_IDENTITY[sdk=iphoneos*]` 手动覆盖已移除，避免 Release 自动签名和手动 `Apple Distribution` 身份冲突。

2026-06-23 已在 Apple 后台完成：

- Apple Developer App ID：`Miaoxun / com.wangruoshi.miaoxun`
- App Store Connect App：`妙讯`
- Apple App ID：`6783301943`

iOS AppIcon 已补齐 iPhone、iPad 和 `ios-marketing` 必需尺寸，`Info.plist` 已显式设置：

```text
CFBundleIconName=AppIcon
```

否则 App Store Connect 会拒绝上传并提示 `CFBundleIconName`、`120x120`、`152x152` 或 `167x167` 图标缺失。

2026-06-23 已从本机执行：

```sh
xcodebuild -allowProvisioningUpdates \
  -exportArchive \
  -archivePath MiaoxunRN/ios/build/MiaoxunRN.xcarchive \
  -exportPath /tmp/MiaoxunRNTestFlightUpload \
  -exportOptionsPlist /tmp/miaoxun-export-options.plist
```

上传结果：

```text
Uploaded MiaoxunRN
** EXPORT SUCCEEDED **
```

App Store Connect 已接收包并进入处理队列。上传过程中仍有第三方 framework dSYM warning：

```text
MapLibre.framework / React.framework / ReactNativeDependencies.framework / hermesvm.framework dSYM missing
```

这些 warning 不阻止 TestFlight 包上传，但会影响这些 framework 的崩溃符号化。后续需要按依赖供应方式补齐 dSYM 或调整上传符号策略。旧 Bundle ID `com.gary.miaoxun.rn` 无法注册到该团队，iOS 工程已切换为正式 Bundle ID `com.wangruoshi.miaoxun`。

2026-06-23 已继续完成 TestFlight 外部测试准备：

- App Store Connect 出口合规已确认并保存。
- iOS `1.0 (1)` 已关联外部测试群组 `YU yunzhi`。
- Beta App Review 测试信息已填写并提交，当前构建状态为“正在等待审核”。
- Apple 审核登录使用专用妙讯审核账号 `app-review-20260623@pizelife.com`；账号密码属于上线操作凭据，不写入仓库文档。

2026-06-24 已上传 iOS `1.0 (2)`，`CURRENT_PROJECT_VERSION=2`。该 build 包含 TestFlight 真机 3D 形象崩溃修复、公开主页入口闭环和 direct 线程 `peerAiId` 字段；本次已重新 archive/export，未复用 `1.0 (1)` 旧归档。

```text
Uploaded MiaoxunRN
** EXPORT SUCCEEDED **
```

App Store Connect 已接收 `1.0 (2)`，构建处理完成后已完成出口合规确认，已加入 TestFlight 外部群组 `YU yunzhi`，状态为“正在测试”。公开链接沿用现有 TestFlight 链接，不需要重新生成；测试手机必须在 TestFlight 中更新并安装 `1.0 (2)` 后再验证扫码、好友主页入口、关注/取消关注和小站 3D 形象稳定性。

当前外部群组公开链接已可用。后续上传新的外部测试 build 时，仍需要完成构建处理、出口合规确认和 Beta App Review；通过后，同一个公开链接会分发可用的新 build。

2026-06-24 真机回归后继续修复在线状态、登录首屏同步、状态菜单层级和小站 3D 稳定渲染。后端新增 `presence.changed` WebSocket 事件并已重新部署 `/home/ubuntu/miaoxun/app/backend`；iOS 端已上传 TestFlight `1.0 (3)`，并完成出口合规确认、加入外部测试群组 `YU yunzhi`，当前状态为“正在测试”。

```text
Uploaded MiaoxunRN
** EXPORT SUCCEEDED **
```

公开链接沿用现有 TestFlight 链接，不需要重新生成；测试手机更新到 `1.0 (3)` 后再验证本轮真机问题。

2026-06-24 已上传 iOS `1.0 (5)`，`CURRENT_PROJECT_VERSION=5`。该 build 包含启动恢复登录网络失败不清除 Keychain token、显示“账号空间暂时无法同步”重试页、在线/离线/隐藏菜单锚定名称旁状态按钮并固定显示在按钮下方居中，以及本机/网络 TLS 握手失败现象记录。本次 `xcodebuild -exportArchive` 已返回 `Uploaded MiaoxunRN` 和 `** EXPORT SUCCEEDED **`，App Store Connect 已完成出口合规确认，并已加入内部/外部 TestFlight 群组 `YU yunzhi`，状态为“正在测试”。公开链接仍沿用现有 TestFlight 链接；测试手机需要在 TestFlight 中更新到 `1.0 (5)` 后再验证。

2026-06-24 已上传 iOS `1.0 (6)`，`CURRENT_PROJECT_VERSION=6`。该 build 包含真机在线状态实时性修复、`presence.changed` 增量同步收敛、聊天列表左滑进入和聊天页左滑返回手势优化，以及高德瓦片场景下 WGS84/GCJ-02 坐标转换，避免真机地图底图和定位点偏移。本次 Release archive 使用 `MIAOXUN_API_BASE_URL=https://miaoxun-api.pizelife.com`，`xcodebuild -exportArchive` 已返回 `Uploaded MiaoxunRN` 和 `** EXPORT SUCCEEDED **`，App Store Connect 已接收包并进入处理队列。上传仍出现 MapLibre、React、ReactNativeDependencies、hermesvm 第三方 framework dSYM warning，不阻止 TestFlight 上传，但会影响对应 framework 崩溃符号化。构建处理完成后需要在 App Store Connect 完成出口合规确认，并加入内部/外部 TestFlight 群组 `YU yunzhi`；公开链接仍沿用现有 TestFlight 链接，测试手机必须更新到 `1.0 (6)` 后再验证。

2026-07-01 已上传 iOS `1.0 (7)`，`CURRENT_PROJECT_VERSION=7`。该 build 包含聊天输入框语音转文字入口、iOS Speech / 麦克风权限说明、模拟器语音识别防崩溃拦截，以及好友申请拒绝/取消等移动端更新。本次 Release archive 使用 `MIAOXUN_API_BASE_URL=https://api.marvelschat.com`，上传返回 `Uploaded MiaoxunRN` 和 `** EXPORT SUCCEEDED **`，App Store Connect 已接收包并进入处理队列。上传仍出现 MapLibre、React、ReactNativeDependencies、hermesvm 第三方 framework dSYM warning，不阻止 TestFlight 上传或安装，但会影响对应 framework 崩溃符号化。构建处理完成后需要在 App Store Connect 完成出口合规确认，并加入内部/外部 TestFlight 群组 `YU yunzhi`；手机 TestFlight 更新到 `1.0 (7)` 后再验证真机语音转文字。

2026-07-02 已上传 iOS `1.0 (8)`，`CURRENT_PROJECT_VERSION=8`。该 build 用于域名实名完成前的异地 TestFlight 体验测试，Release API 临时指向 `http://8.153.167.11`，并只为该 IP 放开 iOS ATS HTTP 例外。上传返回 `Uploaded MiaoxunRN` 和 `** EXPORT SUCCEEDED **`，App Store Connect 已接收包并进入处理队列。上传仍出现 MapLibre、React、ReactNativeDependencies、hermesvm 第三方 framework dSYM warning，不阻止 TestFlight 上传或安装，但会影响对应 framework 崩溃符号化。构建处理完成后需要在 App Store Connect 完成出口合规确认，并加入内部/外部 TestFlight 群组 `YU yunzhi`；手机 TestFlight 更新到 `1.0 (8)` 后再验证异地登录、聊天、好友、扫码和小站基础数据同步。

2026-07-02 已上传 iOS `1.0 (9)`，`CURRENT_PROJECT_VERSION=9`。该 build 包含好友申请通知红色数字提示、前台实时通知 toast、通过/拒绝好友申请后由后端自动更新通知已读状态，以及线上后端 8 秒延迟离线广播；模拟器 Debug 与 TestFlight Release 仍共同指向 `http://8.153.167.11`。本次已同步模块化后端到 `/opt/projects/marvels-chat/app/backend`，执行数据库迁移，配置智谱 Anthropic 兼容模型 `glm-4.6v`，并重启 `marvels-chat-backend`。当前定位仍使用 Nominatim/OpenStreetMap，阿里云 ECS 访问逆地理服务返回 `fetch failed`，正式测试定位前需要配置高德或其他合规地图服务 Key。

2026-07-07 已同步后端代码到 `/opt/projects/marvels-chat/app/backend` 并重启 `marvels-chat-backend`。本次包含小站媒体 OSS 短效上传/后端代理读取接口、我的动态真实内容聚合状态、相册/隐私/社交模块状态修正；无数据库迁移。服务器健康检查 `http://127.0.0.1:4390/api/health` 返回 `ok: true`，bootstrap 中 `posts`、`album`、`social`、`privacy` 均返回 `connected`。服务器 `miaoxun-prod.env` 仍缺少 `OSS_ACCESS_KEY_ID` 和 `OSS_ACCESS_KEY_SECRET`，媒体上传接口会按设计返回 503；域名 `marvelschat.com` 当前 RDAP 状态包含 `client hold`，阿里云域名控制台显示“未实名”，外部 DNS 不解析；Nginx 当前仍只监听 80，TestFlight 新包暂缓，正式测试包必须先完成域名实名、HTTPS 和 OSS 生产配置。

2026-07-07 曾调整移动端发布防线：iOS Debug 默认 `http://127.0.0.1:4390`，iOS Release 固定 `https://api.marvelschat.com`，并移除 `8.153.167.11` 的 ATS HTTP 例外。该策略已被 2026-07-09 临时 IP TestFlight 策略覆盖；正式上线前仍必须恢复 HTTPS 域名并移除临时 HTTP 例外。

2026-07-07 已新增 `scripts/check-launch-readiness.sh`。当前检查结果：权威 DNS 中 `api.marvelschat.com` 和 `console.marvelschat.com` 均指向 `8.153.167.11`；公开 DNS 因域名 `client hold` 不返回记录；HTTPS API 不可达；服务器后端健康；服务器 OSS AccessKey 未配置；iOS Release API 为 `https://api.marvelschat.com`；iOS 已无公共 HTTP ATS 例外；本机缺 Java Runtime，Android Gradle 校验暂不能运行。

2026-07-07 已创建程序专用 RAM 用户 `marvels-chat-oss-prod`，绑定仅面向 `marvels-chat` Bucket 的自定义 OSS 权限策略，并将 `OSS_ACCESS_KEY_ID` / `OSS_ACCESS_KEY_SECRET` 配置到服务器 `/opt/projects/marvels-chat/app/deploy/miaoxun-prod.env`；后端已重启，服务器健康检查正常。已在服务器用同一套后端 OSS 签名逻辑完成上传、读取、删除冒烟测试，返回 `OSS_SMOKE_OK`。密钥只保存在服务器环境变量中，不写入文档和代码仓库。

2026-07-07 已上传 iOS `1.0 (10)`，`CURRENT_PROJECT_VERSION=10`。该 build 误设为 `testFlightInternalTestingOnly=true`，只能用于内部测试，不能加入外部群组；后续不分发该 build。

2026-07-07 已上传 iOS `1.0 (11)`，`CURRENT_PROJECT_VERSION=11`。该 build 用于域名实名完成前的内部和外部 TestFlight 测试，Release API 临时指向 `http://8.153.167.11`，并只为 `8.153.167.11` 放开 iOS ATS HTTP 例外；Release 构建守卫要求同时设置 `MIAOXUN_TEMP_IP_TESTFLIGHT=1` 才允许该临时配置。`ExportOptions-AppStoreConnect.plist` 已设置 `testFlightInternalTestingOnly=false`，可加入外部群组。本次 `xcodebuild -exportArchive` 已返回 `Uploaded MiaoxunRN` 和 `** EXPORT SUCCEEDED **`。上传仍出现 MapLibre、React、ReactNativeDependencies、hermesvm 第三方 framework dSYM warning，不阻止 TestFlight 安装，但会影响对应 framework 崩溃符号化。App Store Connect 已完成构建处理、出口合规确认和外部 TestFlight 配置，`1.0 (11)` 当前状态为“正在测试”，已加入内部/外部群组 `YU yunzhi`；外部公开链接沿用 `https://testflight.apple.com/join/jKSqUnYU`。域名实名和 HTTPS 完成后必须切回 `https://api.marvelschat.com` 并移除临时 ATS 例外。

2026-07-07 已上传 iOS `1.0 (13)`，`CURRENT_PROJECT_VERSION=13`。该 build 用于验证去地图化位置确认、小站首页日记 4 格/相册 3 项展示、以及后端日记/相册/媒体资产更新和软删除接口。服务器已同步 `location-service.js`、`station-repository.js`、`station-routes.js`、`schemas.js` 到 `/opt/projects/marvels-chat/app/backend` 并重启 `marvels-chat-backend`；高德采样验证返回 `community=桂溪街道`、`activityArea=交子商圈`。本次 TestFlight 仍采用域名实名完成前的临时 API `http://8.153.167.11`，归档内确认 `CFBundleVersion=13` 和 `MiaoxunAPIBaseURL=http://8.153.167.11`；上传返回 `Uploaded MiaoxunRN` 和 `** EXPORT SUCCEEDED **`。上传仍出现 MapLibre、React、ReactNativeDependencies、hermesvm 第三方 framework dSYM warning，不阻止 TestFlight 安装，但会影响对应 framework 崩溃符号化。

## 2026-07-10 Build 23 Foundation

后端已从 `codex/build23-foundation` 部署到 `/opt/projects/marvels-chat/app/backend`。部署恢复日记、相册和媒体资产的 PATCH/DELETE 接口，以及媒体 `upload-url`、`upload-complete` 和鉴权文件读取接口；保留线上已有的 Agent 限流与自助授权 schema。无数据库迁移。

部署前备份位于：

```text
/opt/projects/marvels-chat/app/deploy-backups/backend-build23-foundation-20260710-183335
```

远端 `npm run check` 和 14 项既有/新增测试通过，新增 station 路由与 schema 4 项测试单独通过。服务进程由 systemd `Restart=always` 拉起，新进程健康检查 `http://127.0.0.1:4390/api/health` 与外网 `http://8.153.167.11/api/health` 均返回 200。

使用专用测试账号完成并清理了真实闭环：登录、bootstrap、日记创建/更新/删除、相册创建/更新/删除、媒体元数据创建、OSS 签名上传、OSS HEAD 校验、上传完成、鉴权代理读取、媒体更新/删除全部返回预期 2xx。日志不包含密码、token 或 OSS 签名 URL。

回滚时恢复上述备份中的 4 个 source 文件并终止当前 Node 主进程；systemd 会在 5 秒后按现有 `Restart=always` 策略重新拉起。回滚后必须再次检查本机与外网 health。

## 2026-07-11 iOS 1.0 (23)

已将 PR #1 完整合入 `feat/miaoxun-scaffold`，发布 iOS TestFlight `1.0 (23)`。本次移动端同步修复使用 ref 保存增量同步游标，合并并发 bootstrap/sync 请求，并让 `connection.ready` 只触发 `incrementalSync(false)`，避免恢复会话后重复 bootstrap 和 WebSocket 重建。

发布前已完成：

- `npm ci`
- `npx tsc --noEmit`
- `npm run lint -- --max-warnings=0`
- `npm test -- --runInBand`，3 个 suite、4 个测试通过。

Release archive 内确认：

```text
CFBundleShortVersionString = 1.0
CFBundleVersion = 23
MiaoxunAPIBaseURL = http://8.153.167.11/api
```

包内未发现 `https://miaoxun-api.pizelife.com`、`http://8.153.167.11/api/api` 或 `http://8.153.167.11/station/`。上传返回 `Uploaded MiaoxunRN` 和 `** EXPORT SUCCEEDED **`；MapLibre、React、ReactNativeDependencies、hermesvm dSYM warning 仍存在，不阻止 TestFlight 分发。App Store Connect 已处理完成，`1.0 (23)` 状态为“正在测试”，已加入内部和外部 TestFlight 群组 `YU yunzhi`；外部公开链接仍为 `https://testflight.apple.com/join/jKSqUnYU`。

尚未完成的是安装 build 23 后的真机 2 分钟网络验收；需要测试账号登录后确认不会再出现每秒 bootstrap/sync 或 WebSocket 重建，并继续验证日记、相册、照片上传和 Agent 接口闭环。

2026-06-24 本地 iPhone 连接设备 `7501195F-00E2-58E2-88E4-F3D68C3CBD0A` 已成功构建 Debug 包，签名为 Apple Development: Rose Wang，API 指向 `https://miaoxun-api.pizelife.com`。安装时设备上已有 TestFlight 版妙讯，`devicectl` 返回同 Bundle ID 已存在 App Store 安装协调记录，USB Debug 包不能直接覆盖 TestFlight 版；需要先在手机 TestFlight 更新到当前可用最新构建，或用户确认卸载现有 TestFlight 版后再安装 Debug 包。

正式上架 App Store 前，必须继续补 APNs 推送、隐私说明、账号找回/验证、内容审核和未接入模块的产品状态；当前阶段建议只走 TestFlight 给朋友测试。
