# 妙讯部署说明

## 当前生产测试目标

TestFlight 只负责把 iOS App 分发给测试用户；登录、聊天、扫码解析、妙讯管家、通知、在线状态和定位名称解析都必须连接公网 HTTPS 后端。

当前后端要求 Node.js 22+ 和 PostgreSQL。阿里云生产测试环境由 ECS 上的
systemd 服务 `marvels-chat-backend` 直接运行 Node.js，数据库、缓存和文件分别使用
PolarDB PostgreSQL、Tair / Redis 和 OSS。2026-08-04 只读核查时，线上 Node.js 为
`v22.22.1`，服务工作目录为 `/opt/projects/marvels-chat/app/backend`，环境文件为
`/opt/projects/marvels-chat/app/deploy/miaoxun-prod.env`，服务用户为 `marvels`。

仓库仍保留 `backend/Dockerfile` 和 `deploy/docker-compose.prod.yml`，CI 会构建镜像以
验证容器化产物，但当前生产进程不是 Docker 容器。切换运行方式必须作为独立运维变更，
不能在普通应用发布中混用两套命令。

当前阿里云资源：

```text
ECS：i-uf6ikxhmdl3az4qls99c，公网 IP 8.153.167.11，私网 IP 172.25.210.107
PolarDB：pc-uf64w91ivxd2160iu，数据库 marvels_chat，账号 marvels_chat
Redis：r-uf6fvbi3bbux1cjwer.redis.rds.aliyuncs.com:6379
OSS Bucket：marvels-chat
```

PolarDB 和 Redis 当前白名单只放行 ECS 私网 IP `172.25.210.107`。生产服务部署在 ECS 上后，通过阿里云内网地址连接数据库和缓存，不需要在本地电脑或同学家庭网络上频繁配置公网白名单。

## 服务器目录

当前目录为：

```text
/opt/projects/marvels-chat
```

其中：

```text
/opt/projects/marvels-chat/app          # 当前发布文件
/opt/projects/marvels-chat/app/backend  # systemd WorkingDirectory
/opt/projects/marvels-chat/app/agents   # 后端运行时 Agent 定义
/opt/projects/marvels-chat/app/avatar-web/dist # 后端提供的 Avatar Web 静态产物
/opt/projects/marvels-chat/app/deploy/miaoxun-prod.env # systemd EnvironmentFile
```

真实 `miaoxun-prod.env` 只保存在服务器，不提交仓库。

## 必需环境变量

参考 [deploy/miaoxun-prod.env.example](../deploy/miaoxun-prod.env.example)。

必须设置：

- `HOST=127.0.0.1`：当前 systemd 进程只监听本机，由 Nginx 反向代理；不要直接暴露 Node 端口。
- `NODE_ENV=production`：启用生产错误隐藏和生产配置校验。
- `TRUST_PROXY_HOPS=1`：只信任最靠近后端的一层 Nginx 代理，以便登录限流和审计使用真实客户端 IP。
- `CORS_ORIGIN=https://console.marvelschat.com`：正式环境只允许明确的浏览器管理台 origin；不能设为 `true` 或多个 origin。临时 IP TestFlight 阶段使用 `http://8.153.167.11`，域名可用后必须切回 HTTPS 管理台域名。
- `POSTGRES_HOST`、`POSTGRES_USER`、`POSTGRES_PASSWORD`、`POSTGRES_DATABASE`：阿里云 PolarDB 连接信息。
- Tair / Redis 已作为预留基础设施开通，但当前代码没有运行时消费者，因此不写入应用环境变量；待 session、缓存、队列或限流正式接入后再补充明确配置。
- `OSS_REGION`、`OSS_BUCKET`、`OSS_ENDPOINT`、`OSS_ACCESS_KEY_ID`、`OSS_ACCESS_KEY_SECRET`：OSS 文件能力。AccessKey 后续应使用程序专用 RAM 用户。
- `NEW_API_BASE_URL`、`NEW_API_KEY`、`NEW_API_MODEL`：妙讯管家 AI 调用。
- `GEOCODING_PROVIDER=amap`、`AMAP_WEB_SERVICE_KEY`：定位坐标解析社区和活动区域。

## 发布与启动顺序

生产发布必须在明确的维护窗口内执行。域名审核期间可以继续使用临时 IP 测试策略，
但数据库备份、安全开关和 readiness 不得降级。不要直接覆盖当前目录后立即重启。

1. 确认 PolarDB 最近自动快照有效，并在变更前再创建或验证一个可恢复点。
2. 备份当前应用目录和环境文件；把新代码、依赖和 `avatar-web/dist` 完整暂存好。
3. 将常驻环境改为 `TRUST_PROXY_HOPS=1`、`CREATE_FIRST_USER_AS_ADMIN=false`、
   `ADMIN_EMAILS=`、`DEFAULT_ADMIN_ENABLED=false`，并清空默认管理员密码。
4. 停止后端和媒体检索 worker，加载同一份生产环境，执行 `npm run db:migrate`。
5. 启动新后端和独立 `marvels-chat-media-retrieval-worker`，依次验证 `/api/health`、`/api/ready`、worker 心跳、认证接口、OSS 媒体和 3D 模型读取。
6. 任一关键检查失败时保持停写，停止新 worker，恢复 PolarDB 到变更前时间点并恢复旧应用目录；仅恢复旧代码
   不能撤销数据迁移。

当前 systemd 运行方式的检查命令：

```sh
sudo systemctl status marvels-chat-backend --no-pager
sudo systemctl status marvels-chat-media-retrieval-worker --no-pager
sudo journalctl -u marvels-chat-backend -n 120 --no-pager
sudo journalctl -u marvels-chat-media-retrieval-worker -n 120 --no-pager
curl http://127.0.0.1:4390/api/health
curl --fail http://127.0.0.1:4390/api/ready
```

systemd 单元应与 [deploy/marvels-chat-backend.service.example](../deploy/marvels-chat-backend.service.example)
保持一致，尤其是 `KillSignal=SIGTERM` 和 `TimeoutStopSec=90s`。后端收到终止信号后会先停止
HTTP/WebSocket 接入和 3D Job Runner，等待在途工作结束，再关闭数据库连接池；不要用 `SIGKILL`
作为常规重启方式。Docker Compose 同样保留 90 秒停止窗口。

在维护窗口中执行迁移时，必须加载 systemd 使用的同一份环境文件：

```sh
sudo systemctl stop marvels-chat-media-retrieval-worker marvels-chat-backend
cd /opt/projects/marvels-chat/app/backend
set -a
. ../deploy/miaoxun-prod.env
set +a
npm run db:migrate
sudo systemctl start marvels-chat-backend
sudo systemctl start marvels-chat-media-retrieval-worker
```

`/api/health` 只检查进程存活；`/api/ready` 还会核对数据库连接、迁移文件、迁移账本和
历史校验和。账本缺失或存在待执行迁移时 readiness 返回 503 是预期行为，但完成迁移后
必须恢复为 200 才能结束维护窗口。

生产环境长期保持 `CREATE_FIRST_USER_AS_ADMIN=false`、空 `ADMIN_EMAILS` 和
`DEFAULT_ADMIN_ENABLED=false`。不要把初始化密码留在常驻环境文件中；管理员初始化应通过
单独、可审计的一次性流程完成。只有首次确实需要创建管理员时，才在迁移完成后临时注入
强密码并执行：

```sh
DEFAULT_ADMIN_ENABLED=true \
DEFAULT_ADMIN_PASSWORD='<至少 16 位的非占位强密码>' \
npm run admin:bootstrap
```

命令成功后立即清除这两个临时值。`db:migrate` 不创建管理员，也不执行账本外的结构修补。

## 线上冒烟测试

后端部署完成后需要至少验证以下链路：

```sh
curl http://127.0.0.1:4390/api/health
curl --fail http://127.0.0.1:4390/api/ready
curl http://8.153.167.11/api/health # 仅域名审核期间的 TestFlight 临时入口
curl https://api.marvelschat.com/api/health # 域名和 HTTPS 完成后
```

2026-06-23 线上已验证：

- 本机容器口 `http://127.0.0.1:4390/api/health` 连续返回 `ok: true`。
- 服务器自身访问 `https://miaoxun-api.pizelife.com/api/health` 连续返回 `ok: true`。
- 公网域名完成注册、登录、`/api/app/bootstrap` 和 `/api/realtime` WebSocket 连接测试。
- 测试账号只用于部署冒烟，不作为正式用户。

本地 Mac 如果开启代理或使用 Fake-IP DNS，`miaoxun-api.pizelife.com` 可能被解析到 `198.18.x.x`，会出现 `SSL_ERROR_SYSCALL` 或间歇性握手失败。排查时先用 `dig +short miaoxun-api.pizelife.com` 确认解析结果，必要时用 `curl --noproxy '*' --resolve miaoxun-api.pizelife.com:443:1.15.135.238 https://miaoxun-api.pizelife.com/api/health` 绕过本地代理解析。

2026-06-24 真机 TestFlight 发现首次打开或首次登录偶发网络超时；本机连续请求 `https://miaoxun-api.pizelife.com/api/health` 时也复现 TLS 握手阶段 `SSL_ERROR_SYSCALL`，成功请求约 0.1 秒返回，说明问题发生在 HTTPS 入口或本地/移动网络链路，而不是 `/api/app/bootstrap` 业务查询固定慢。客户端当时区分认证与网络失败；当前实现已进一步收紧为只有 401 才判定 session 失效，403 和网络错误都保留 Keychain token。服务器侧仍需持续检查 Nginx、证书和公网链路稳定性。

2026-06-24 继续验证聊天实时体验时，再次连续请求线上 `/api/health`，5 次中 1 次在 TLS 握手阶段返回 `SSL_ERROR_SYSCALL`。客户端已把 WebSocket 生命周期收敛到登录 token，避免 presence 事件导致实时连接自重建；但如果 HTTPS/WSS 入口仍偶发握手失败，手机端仍会出现登录、聊天和定位解析请求间歇变慢或超时。该问题必须从服务器 Nginx、证书链、反向代理和公网网络稳定性继续排查。

## 当前线上配置状态

2026-08-04 对服务器 `/opt/projects/marvels-chat/app/deploy/miaoxun-prod.env` 做脱敏只读检查后的状态：

- `NEW_API_BASE_URL=https://api.z.ai/api/paas/v4`
- `NEW_API_MODEL=glm-4.5-air`
- `NEW_API_TIMEOUT_MS=30000`
- `NEW_API_KEY` 当前服务器未配置；本地测试 Key 已返回额度不足，妙讯管家暂不可用。
- 当前源码要求 `MIAOXUN_API_BASE_URL` 只能是无路径的 HTTP(S) origin；临时 IP 配置为 `http://8.153.167.11`，业务调用必须显式使用 `/api/*`，非规范路径会直接报错。
- `GEOCODING_PROVIDER=amap` 和 `AMAP_WEB_SERVICE_KEY` 已配置；正式上线前仍需确认高德逆地理编码的生产授权、配额和隐私披露。未被位置页调用的 MapLibre、地图票据和瓦片代理已从当前源码移除，服务器里的旧地图变量在下次部署时一并清理。
- 当前常驻环境仍保留 `CREATE_FIRST_USER_AS_ADMIN=true`、`DEFAULT_ADMIN_ENABLED=true`，且没有显式 `TRUST_PROXY_HOPS=1`。下次部署新版后端前必须先关闭两个管理员初始化开关、清空 `ADMIN_EMAILS` 和默认管理员密码，并补齐代理层配置；新版生产配置校验会拒绝以不安全的初始化开关启动。
- 当前线上后端尚未部署 `/api/ready`，请求返回 404。下次后端部署必须按“构建 -> 执行迁移 -> `/api/health` -> `/api/ready`”顺序验证，不能只用 liveness 判定可接流量。
- 注册模型已改为昵称唯一：发布新 TestFlight 前必须执行最新数据库迁移，迁移会把历史重复昵称追加短后缀；迁移后注册和资料改名都会由后端与数据库共同拒绝重复昵称。
- `marvels-chat-backend` 当前为 active，直接运行 Node.js，`NRestarts=0`；`/api/health` 返回 200，磁盘和内存余量充足。
- PolarDB 每天自动全量备份，数据和日志保留 7 天，最近 7 个快照均有效并支持按时间点恢复。迁移前仍需确认最新恢复点和单独导出受影响行。
- 生产数据库没有迁移账本，且 015 的 `likes_count` / `miao_point_ledger` 缺失；016-022 的主要结构已经存在。024 还会统一用户在线状态约束、删除重复用户索引并约束 12 位 AI ID。真实 PostgreSQL 重放测试已覆盖这些漂移，生产执行仍必须处于维护窗口。
- ECS 当前标记“需要重启”，`/var/run/reboot-required.pkgs` 包含 `libc6`。系统升级和应用发布必须拆成两个维护窗口，分别验证和回滚。

修改 `NEW_API_KEY`、`NEW_API_TIMEOUT_MS`、`GEOCODING_PROVIDER`、`GEOCODING_REVERSE_URL`、`GEOCODING_TIMEOUT_MS`、`AMAP_WEB_SERVICE_KEY` 或 `AMAP_REVERSE_URL` 后需要只重启妙讯后端服务：

```sh
sudo systemctl restart marvels-chat-backend
sudo systemctl status marvels-chat-backend --no-pager
```

## HTTPS 和 TestFlight

iOS Release 正式上线目标 API 地址是：

```text
https://api.marvelschat.com
```

临时测试策略：正式域名实名和 HTTPS 完成前，iOS Release 临时使用 `http://8.153.167.11`，并在 iOS `Info.plist` 里只为该 IP 放开 HTTP ATS 例外，方便异地成员先通过 TestFlight 连接真实 ECS 后端、PolarDB 和 OSS 进行体验测试。该策略只用于内部测试，不作为上线配置。

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

## 2026-07-28 App 3D 接入

已在不修改伙伴建模核心的前提下，为妙讯 App 部署 Bearer 鉴权的 `/api/avatar-3d/app/*` 接口和私有 GLB 文件读取路由。线上 `avatar-3d-lifecycle-service.js`、Wan、Tripo、OSS 和多视图提示文件与 `origin/feat/avatar-3d-web-v1` 对应文件哈希一致；本次只新增 App 路由与公共路由辅助模块，并在服务器现有 `server.js` 中增加一次注册。

部署前备份位于：

```text
/opt/projects/marvels-chat/app/deploy-backups/avatar-app-native-20260728-150831
```

服务器远端 `npm run check` 和 App 路由 4 项契约测试通过。重启后 `/api/health` 返回 200，未登录访问 `/api/avatar-3d/app/bootstrap` 返回预期 401，systemd 服务无重启。`AVATAR_3D_PROVIDER_CALLS_ENABLED` 已在单账号受限白名单下启用；DashScope 和 OSS 必需配置均存在，未在日志或仓库输出配置值。尚未发起真实付费生成，最终闭环需要测试账号在 App 内完成照片授权和四视图确认。

回滚时恢复备份中的 `src/server.js` 和 `miaoxun-prod.env`，重启 `marvels-chat-backend` 后重新检查 health。新增但未注册的 `avatar-3d-app-routes.js` 和 `avatar-3d-route-support.js` 不影响旧运行路径。

## 2026-07-29 App 3D 查看器修复

App 内置查看器从 `file://` 页面读取私有 GLB，请求来源在 WebView 中表现为 `Origin: null`。后端仅对 `GET|HEAD|OPTIONS /api/avatar-3d/app/models/:uuid/file` 返回该来源的 CORS 授权，并且实际文件请求仍必须通过 Bearer 鉴权和模型归属校验；其他 API 继续使用 `CORS_ORIGIN`，不得全局允许 `null` 来源。

线上增量部署前备份位于：

```text
/opt/projects/marvels-chat/backups/20260729-avatar-viewer-cors.tgz
```

部署后需同时验证模型路由预检返回 `Access-Control-Allow-Origin: null`，普通 `/api/app/bootstrap` 预检仍返回配置的站点来源。精细模型文件可能达到数十 MB，App 在下载和 Three.js 解析期间显示已生成缩略图；等待四视图人工确认时停止任务轮询，后台处理阶段按 Runner 节奏查询。

iOS `1.0 (28)` 已完成 Release archive 并上传 App Store Connect，上传返回 `Uploaded MiaoxunRN` 和 `** EXPORT SUCCEEDED **`。MapLibre、React、ReactNativeDependencies 和 Hermes 的第三方 dSYM warning 仍存在，不阻止 TestFlight 分发。

## 2026-07-30 App 媒体与 3D 加载优化

生产后端已启用 OSS 内网读取、私有媒体长期缓存、3D 缩略图占位和 App 专用轻量 GLB。伙伴生成的原始 GLB 保持不变；新增 Worker 将 App 版本限制为最多 25 万三角面、最大 2048 像素纹理，并使用 `KHR_mesh_quantization`。App 模型接口不回退到原始大文件，轻量资产缺失时会明确返回错误，避免手机静默下载数十 MB 原件。

部署前备份位于：

```text
/opt/projects/marvels-chat/app/deploy-backups/media-loading-20260730-140933
/opt/projects/marvels-chat/app/deploy-backups/avatar-mobile-model-20260730-155317
```

已执行 `022_avatar_3d_mobile_model.sql` 和 `npm run avatar3d:backfill-mobile`。线上 4 个 active 模型均已生成轻量资产，原始文件总计 `198,908,508` bytes，App 文件总计 `25,736,428` bytes。当前测试账号模型从 `57,205,168` bytes 降至 `6,432,516` bytes，缩略图为 `11,418` bytes。鉴权 Range 冒烟测试返回 206，模型和缩略图均包含 `ETag`、`Vary: Authorization` 与 `Cache-Control: private, max-age=31536000, immutable`。重启后本机和公网 health 正常，systemd `NRestarts=0`。

服务端轻量模型对现有客户端直接生效；WebView 缓存和加载中缩略图属于客户端变更，必须随下一次 TestFlight 构建发布。上传前先确认 App Store Connect 已占用的最高 build 号，再递增 `CURRENT_PROJECT_VERSION`，不能仅依赖本文中的历史编号。

## 2026-08-04 仓库发布审查基线

本轮只完成本地代码审查、修复、构建验证和线上只读核查，没有上传 TestFlight、部署后端或修改生产数据库。iOS Release workspace archive 使用当前工程 `1.0 (30)` 成功生成，归档内 API 为域名审核期间的受控地址 `http://8.153.167.11`，ATS 只允许该 IP，`NSAllowsArbitraryLoads=false`。

App Store Connect 已有 `1.0 (30)`，上传时间为 2026-07-30 13:21，当前状态为“正在测试”，并已加入内部和外部 `YU yunzhi` 群组。因此下次上传必须先把工程号递增到 `1.0 (31)`；不能再次上传 30，也不能复用本轮验证归档。

MapLibre、地图票据、地图瓦片代理及其 iOS / Android 依赖已经从当前源码和归档移除。早期 build 日志中的 MapLibre dSYM warning 仅描述当时的历史构建，不再代表当前依赖状态；本轮归档只保留 React、ReactNativeDependencies 和 Hermes framework。下次上传前仍需按 App Store Connect 的实际 build 状态递增编号并重新 archive，不能直接复用本轮 `/tmp` 验证归档。

域名审核期间运行 `MIAOXUN_TEMP_IP_TESTFLIGHT=1 scripts/check-launch-readiness.sh`，域名、DNS 和 HTTPS 项按受控测试策略记录为 warning。其余发布检查保持严格：当前服务器仍需在下一次授权部署时上线 `/api/ready`，并设置 `TRUST_PROXY_HOPS=1`、`CREATE_FIRST_USER_AS_ADMIN=false`、`DEFAULT_ADMIN_ENABLED=false`；完成迁移后必须同时验证 `/api/health` 和 `/api/ready`。

## 2026-08-31 Build 42 小站崩溃修复

App Store Connect 的 Build 41 与 Build 42 真机报告均显示 `RCTExceptionsManager.reportFatal`，确认是 JavaScript 致命异常，不是 3D WebView 或 SVG 原生释放异常。线上 `/api/app/bootstrap` 的 `stationContent` 未返回 `posts`，而移动端生活页直接读取 `posts.length` 与 `posts.map`；Build 42 又同时挂载五个小站页签，因此故障从“切换生活时崩溃”扩大为“进入小站即崩溃”。

生产后端已复用现有 `station-post-repository.js` 的 `listStationPostsForUser()`，把真实动态列表接入 `getStationContentForUser()`。变更前文件备份位于：

```text
/opt/projects/marvels-chat/app/deploy-backups/build42-station-contract-20260831-1523/station-repository.js
```

线上 `npm run check` 通过；服务按 `User=marvels`、`Restart=always` 与 `KillSignal=SIGTERM` 的既有 systemd 策略平滑重启，主进程从 `427140` 切换到 `446437`。重启后 `/api/health` 返回 200，生产数据库级冒烟确认 `posts` 为数组，且移动端要求的九个小站字段全部为数组。

移动端源码同时恢复为只挂载当前选中的小站面板，不再同时保留五棵原生视图树；`/api/app/bootstrap` 与 `/api/station/content` 增加严格运行时契约校验。缺少 `posts` 等字段时明确报告服务端版本不匹配，不再让 `undefined` 进入页面后触发致命异常。本轮未上传新的 TestFlight build；Build 42 需完全退出并重新打开，重新获取线上 bootstrap 后再验证现有包。

## 2026-09-08 代码与依赖审查

本轮删除了已被小站真实建站 Agent 工作区替代的移动端占位建站页，妙讯管家的建站动作改为直接打开小站 `Agent` 页签；消息新建菜单不再展示尚未实现的创建群和独立添加好友入口。未被运行时消费的 `REDIS_URL` 已从后端配置与环境示例移除，Tair 只保留为尚未接入的基础设施记录。

后端通过固定 `qs@6.16.0` 消除了 Express 4 依赖链中的已知 DoS 告警，`npm audit` 为 0。移动端 RN CLI 已从 `20.1.0` 升级到同系列 `20.2.0`，并更新现有 semver 范围内的间接依赖；剩余 4 条高危审计项均来自 React Native 0.86 的 Metro / `image-size` 构建链，当前 npm 解析没有可应用修复。该链路不进入 App 运行时 bundle，但 CI 只应处理仓库内受信任的图片资源；待 React Native 提供兼容修复后单独升级并重新验证 iOS、Android 和 TestFlight。

本轮只修改本地仓库，没有部署服务器。线上仍未包含 `/api/ready`，并且常驻环境需要在下一次授权部署前设置 `TRUST_PROXY_HOPS=1`、`CREATE_FIRST_USER_AS_ADMIN=false`、`DEFAULT_ADMIN_ENABLED=false`。域名实名审核、公共 DNS 和 HTTPS 继续作为正式上架前置条件。
