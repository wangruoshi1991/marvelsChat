# A01 至 A23 实现后的独立验收

2026-11-19，正式工作树 `codex/ui-agent-candidate-20261105` 的 `d04221f` 加本地修改。以[原工单及验收条件](2026-11-18-implementation-prompts.md)为基准，对照当前源码、当日独立测试和[11 月 18 日执行交接](../handoffs/CURRENT.md#2026-11-18-指定工作树本地修复)。本次只写审查资料。

## 返工后的独立复验

2026-11-19 再次检查同一正式工作树的当前本地改动。A02、A06、A13、A16、A17 可以按原关闭条件结单。剩余 A09 需要在两端实体设备运行当前候选。

| 工单 | 此次独立验证 |
| --- | --- |
| A17、A16、A06 | 新的回环 PG18 空库应用 70 份迁移，三个后端专项 33/33、零跳过。验证相册同键并发、丢回执重放、改参、新键同名及删除后重放；验证相册加入与删除的两种持锁顺序、可见性和清理清单；验证续租挂起时退出、真实行锁超时和旧凭据不能回写。相册相关 RN 五套 85/85。 |
| A02 | RN 会话专项 53/53，使用真实 API 客户端与离线网络替身。提交前断线、提交后丢回执、普通会话撤销和切换账号均有独立断言。仅会话过期时返回登录并提示注销结果待确认。 |
| A13 | 重跑隔离恢复演练，使用断网 Linux、PG18.7、pgvector 和合成归档。六张表计数与 1,296 条约束匹配时可切换、回退；归档不匹配、少素材行、缺外键时均在切换前拒绝，原库仍可读。服务停服由夹具模拟。 |
| A09 | 执行交接记录 iPhone 14 Pro 现装 Build 66，QA Bundle 构建因缺相应开发描述文件而失败。本次重新查询 ADB，可用 Android 真机数为 0。待具备签名、设备与隔离 API 后测试相机权限和扫码、语音打断、相册落盘、读屏及系统返回。 |

整仓重新运行 `MIAOXUN_DOTENV_ENABLED=false ./scripts/check-repository.sh` 退出 0，RN 127 套 1,571 项、Backend 1,159 项通过及 432 项环境门控跳过。上述专项不与整仓重复累计。本次只更新验收与交接文档；没有发布操作。

## A09 真机专项续验

2026-11-19，正式工作树 `codex/ui-agent-candidate-20261105`，`d04221f` 加当前协作修改。当前 iOS 独立 QA 含聊天和漫画图片预览修复，独立构建配置仅应用于本机产物。**A09 待验。**

| 平台 | 真机及实际安装 | 当前树 QA 构建 | 结果 |
| --- | --- | --- | --- |
| iOS | iPhone 14 Pro，iOS 17.6.1（21G93），通过 USB 连接。`devicectl` 确认独立「妙讯 QA」1.0（64）和正式包 1.0（66）并存。 | Xcode 26.6。从正式树签名构建 `com.wangruoshi.miaoxun.qa` 1.0（64），包含图片预览和辅助功能修复。 | 真机安装、会话恢复和主要页面实测通过。VoiceOver 的其余实际播报、读屏手势和焦点待验。 |
| Android | 暂无可用真机。机型、OS 和真机安装版本待验。 | 既有独立 QA 1.0（20261119）APK，含显式局域网 API、arm64-v8a 和 armeabi-v7a。 | 既有离线 Debug 构建和签名验证通过。按用户安排，本轮暂停。 |

| 实测项 | 预期 | iOS | Android |
| --- | --- | --- | --- |
| 测试账号登录 | 当前候选连接隔离 API，合法合成凭据成功登录并能冷启动恢复会话。 | **通过。** QA 64 真机登录、启动初始化和同步均返回 HTTP 200。 | 待验。 |
| 相机与扫码 | 聊天列表扫码入口触发首次授权。拒绝后提示并能恢复，取消时安全返回，扫码打开测试账号，再进仍能扫码。 | **通过。** 首次授权和拒绝恢复沿用同机原扫码流程探针证据。当前 QA 64 从「讯」页两次打开扫码并取消，另从同一入口实扫合成码，解析 HTTP 200，打开测试账号资料页。 | 待验。 |
| 语音 | 在聊天录制中打断或取消，系统麦克风占用结束，回到聊天能再次录制。 | **通过。** 当前 QA 64 从聊天页连续两次录音、松手并转写合成短句。另在长按过程中切到系统设置，回来后语音按钮可用并重新转写。原真机探针观察到取消时音频会话停用和输入监听移除。 | 待验。 |
| 聊天相册落盘 | 从聊天图片查看器保存合成聊天图片，在系统相册读到对应图像。 | **通过。** 真机点保存，查看器显示成功，关闭回聊天。USB 读回新增 `A09 CHAT` 640×440。 | 待验。 |
| 漫画相册落盘 | 在漫画查看器保存合成画格，在系统相册读到对应图像。 | **通过。** 真机从「我的漫画」第一格点保存并显示成功，关闭回详情。USB 读回新增 `A09 COMIC` 768×512。 | 本项仅验 iOS。 |
| 读屏与减动 | VoiceOver 或 TalkBack 能读出扫码、语音、保存及返回等关键按钮，焦点位置和状态提示符合操作。打开系统减动后，页面仍提供清楚的操作反馈。 | **部分通过。** 真机减动有启动、设置入场及注销页导航回执。真机 XCUITest 识别「新建」「扫描名片」「切换语音输入」「按住说话」「保存图片」并验证可操作，返回控件可按名称定位。用户实听「新建」。旁白保持关闭，其他控件的实际播报和跨页面焦点待验。 | 待验。 |
| 注销页返回 | 使用测试账号，从设置打开注销页并回到设置，再返回上一层。iOS 走页面返回和支持手势，Android 走系统返回。 | **通过。** 真机从二楼设置进注销页，两次点返回依次回到设置弹层和二楼设置，底部上滑回讯。未提交注销。 | 待验。 |

- 隔离 API 使用当前 Express 和回环 PG18 空库，`npm run db:migrate` 应用 70 份迁移。禁用 dotenv 和供应商调用，局域网监听只绑定 Mac 的 Wi-Fi 地址。Mac 访问 `/api/health`、`/api/ready` 均为 200，真机侧连通性待验。已通过同一 API 创建合成账号及好友会话，并确认扫码解析、鉴权下载聊天图片和两格漫画图片。漫画数据由本地夹具通过正式仓储写入，无需模型生成。本轮结束已停止隔离 API 和 PG，测试数据留在本机临时目录供续验。
- iOS 使用 `xcrun devicectl list devices`、`device info lockState`、`device info apps` 核对手机和安装记录。使用 `xcodebuild -workspace MiaoxunRN/ios/MiaoxunRN.xcworkspace -scheme MiaoxunRN -configuration Debug -destination "platform=iOS,id=$device_id" -derivedDataPath "$qa_derived_data" PRODUCT_BUNDLE_IDENTIFIER=com.wangruoshi.miaoxun.qa MIAOXUN_API_BASE_URL="$qa_origin" build` 验签名。将目标改为 `generic/platform=iOS` 并设 `CODE_SIGNING_ALLOWED=NO` 后完成编译。
- Android 在临时副本通过 `./gradlew :app:assembleDebug --offline --no-daemon -PMIAOXUN_API_BASE_URL="$qa_origin" -PMIAOXUN_VERSION_CODE=20261119 -PMIAOXUN_VERSION_NAME=1.0 -PreactNativeArchitectures=arm64-v8a,armeabi-v7a` 构建，以 `aapt dump badging`、`apksigner verify --verbose` 和归档内容核实产物。

USB 续验中，`xcrun xcdevice list` 确认 iPhone 14 Pro 的连接方式为 `usb`，`devicectl` 确认设备已解锁。通过 `devicectl device process launch --payload-url` 在该手机的 Safari 打开一次性局域网探针，探针确认请求来自 iPhone Safari，隔离 API `/api/ready` 返回 200。iOS QA 仍待独立签名和安装。用户确认 Android 暂无真机，本轮暂停 Android，真机项继续待验。

用户授权后，带 `-allowProvisioningUpdates` 重跑独立 QA 构建，退出 65。Xcode 报 `No Accounts: Add a new account in Accounts settings`，未生成 QA 描述文件。已打开 Xcode 工作区，待用户在 Settings → Accounts 登录开发团队账号。正式 Build 66 保留，QA 仍待安装和验收。

随后直接查看 Xcode 的 Apple Accounts，确认已有开发团队和管理员角色。命令行自动签名仍返回 `No Accounts`。用临时 QA 工作区在 Xcode 图形界面发起自动签名，取得 `iOS Team Provisioning Profile: *`。正式工作树不带 `-allowProvisioningUpdates` 重跑后退出 0。`codesign --verify --deep --strict` 通过，核对 Bundle 和隔离 API 后，使用 `devicectl device install app` 安装并启动 QA。设备分别查到 QA 1.0（63）及正式 1.0（66）。隔离 API 重新启动，就绪返回 HTTP 200。等待手机端登录和人工操作，A09 状态仍为待验。

QA 登录页首测提示网络连接失败。同期 Mac 访问 `/api/ready` 为 200，后端没有收到登录请求。临时副本的签名 QA 包以相同 Bundle 在真机运行原生 URLSession，先得到 IP 地址 `NSURLErrorDomain -1009` 和 `.local` 地址 `-1001`。配置独立名称「妙讯 QA」以及本地网络用途说明，构建 1.0（64）替换原 QA 包后，同一设备上两个地址都返回 HTTP 200。探针仅在指定启动参数下运行，所有诊断和配置变更留在临时副本。设备原有正式 1.0（66）保留。该回执确认 App 进程已能访问测试后端，登录页的成功回执及其余 A09 项待验。此次记录未单独验证本地网络权限变更与恢复之间的因果关系。

网络恢复后，用户遇到的账号错误在隔离 API 上对应 `POST /api/auth/login` 的 401。先在同一隔离 API 验证合成凭据有效。XCUITest runner 签名通过，但 iPhone 启用自动化超时，测试未执行。另用只在临时 QA 包启用的一次性入口填入该合成账号，调用原登录表单提交，真机的 `POST /api/auth/login` 与 `GET /api/app/bootstrap` 均返回 200。装回测试前的 QA 1.0（64）并冷启动后，`GET /api/app/bootstrap` 再次返回 200。确认一次性凭据文件已从 App 容器移除，临时测试 runner 已卸载，正式 1.0（66）及 QA 1.0（64）均在。该次验证覆盖登录与会话恢复，屏幕键盘输入及其余 A09 功能仍待验。

真机界面续验在解锁的 iPhone 上用 `xcodebuild ... -only-testing:A09Login/LoginTests/testCurrentQAInterface test` 重跑，退出 65，iOS 启用 UI 自动化超时，任何触控步骤均未执行。Xcode Accessibility Inspector 能列出该 iPhone，选择后没有可用远程 App 目标。随后安装同 Bundle 的临时 QA 64 相册诊断包，通过 `devicectl device process launch --a09-media` 调用现有保存函数。聊天图鉴权下载返回 HTTP 200，真机回执显示正在等待 PhotoKit 仅添加权限。等待授权期间，漫画保存尚未执行。照片在系统相册中可见、页面按钮、相机、语音、VoiceOver、减动和返回手势继续待验。临时诊断入口未写入正式工作树。

用户允许仅添加照片后，聊天和漫画两条鉴权下载均返回 HTTP 200，PhotoKit 的写入完成回执分别包含新资产标识及 640×440、768×512 尺寸。USB Image Capture 只读探针按写入时间和尺寸过滤，再用 OCR 从同一台 iPhone 读回 `A09 CHAT` 与 `A09 COMIC`，最终确认 2/2。首次联合读回遇到 Image Capture 锁屏状态回调，仅确认漫画图，聊天图单独重试和最终联合读回均成功。该验证通过临时探针调用现有保存函数，页面按钮交互仍待验。测试后已装回测试前的 QA 1.0（64），冷启动 `/api/app/bootstrap` 返回 HTTP 200，正式版 1.0（66）保留。


同一 iPhone 14 Pro（iOS 17.6.1）续跑临时 QA 1.0（64），使用 `devicectl device process launch --a09-device navigation`、`camera`、`voice-engine` 启动探针，并从 QA 容器读回结果。设置弹层、注销页、返回后的设置弹层均收到原生展示回执，最后关闭设置收到原生关闭回执。探针从设置切入并调用原页面回调，屏幕点按和下拉手势仍待验。原扫码流程从权限未决定进入授权状态，两次开启时相机会话均在运行，首轮取消，次轮解码合成码并经隔离 API 返回 200，App 收到测试账号主页。用户随后关闭了 QA 相机权限。复测时会话中的 CoreDevice 连接超时，访问本机设备服务的自动审批返回 HTTP 503，拒绝分支及恢复后重扫仍待取证。

语音首次离线英语识别探针返回设备不可用。使用只启动原音频引擎的真机探针重复两轮，每轮均观察到录音引擎启动、取消返回 `speech_cancelled`、音频会话停用、输入监听移除，第二轮可重新启动。识别任务、聊天页面操作及系统打断仍待验。系统减动状态只读到关闭，VoiceOver 与减动开启后的页面反馈仍待验。诊断代码保存在临时副本。

恢复 CoreDevice 访问后，在 QA 相机权限关闭时，以 `devicectl device process launch --terminate-existing com.wangruoshi.miaoxun.qa --a09-device camera` 重跑。真机会话记录两次 `camera permission 2` 和 `camera_denied`，末尾记录 `camera attempts finished`。用户重新开启 QA 相机权限后，再跑同一探针，真机返回 `camera permission 3`。两次打开都确认相机会话运行，第一次取消，第二次识别合成码，发送 `POST /api/scan/resolve` 返回 HTTP 200，App 收到测试账号主页。第一次恢复后的扫码窗口到期，重开后完成解码。页面入口点按待验。

扫码复验后重新安装并启动常规 QA 64，`GET /api/app/bootstrap` 返回 HTTP 200，设备同时查到正式 66。另运行 `npm --prefix MiaoxunRN test -- --runInBand --silent __tests__/launchAccessibility.test.tsx __tests__/secondFloorGestureContinuity.test.tsx __tests__/speechToText.test.ts`，3 套共 19 项通过。系统减动开启后的页面反馈仍待真机取证。

随后尝试减动复验时，诊断包和常规 QA 64 重装均成功，iPhone 均以 CoreDevice 10002 Security 拒绝启动。Mac 执行 `codesign --verify --deep --strict` 通过，两份包使用相同且未过期的开发描述文件。设备仍通过 USB 连接、已解锁且开启开发者模式。目前装回的是常规 QA 64。设备端实际弹窗及开发者 App 验证状态待核，减动复验未执行。之前已完成的真机回执保留。

用户随后确认系统反复弹出「无法验证 App」，取消后再次出现。Mac 查询进程未发现运行中的 Xcode 构建、CoreDevice 启动或 XCTest 进程。只读查询仍显示 QA 64 与正式 66 均已安装。已暂停启动及安装操作，等待手机回到可用主屏幕后再排查设备端验证。

用户确认手机恢复后，登录提示无法连接。检查确认隔离 API 的 20 分钟运行窗口已结束，原局域网地址无服务监听。使用原合成库恢复 API 后，Mac 和 iPhone Safari 就绪探针均返回 HTTP 200。QA 界面的登录请求到达后端并返回 401，随后用一次性入口提交既有合成测试账号，真机登录和会话初始化均为 HTTP 200。重装常规 QA 64 后冷启动，`/api/app/bootstrap` 也返回 200。设备同时查到正式 66。此次恢复后的启动已通过，开发描述文件曾被设备拒绝的具体触发原因仍待查。

用户在 iPhone 开启「减弱动态效果」后，使用临时 QA 64 的 `--a09-device navigation` 参数启动同一台真机。iOS 报告减动开启，React Native 启动组件读取开启并跳过动画。第一次探针只更新了父组件的二楼工具记录，未实际选择子组件的设置页。调整为由二楼设置入口的选择函数触发后，真机回执确认设置入场动画跳过，依次展示设置、注销页、返回后的设置，最后关闭设置。通过 `devicectl device copy from` 读取 QA 容器回执。此次由探针调用页面原回调，VoiceOver 播报、焦点、实际点按和手势仍待验。常规 QA 64 已装回，冷启动会话恢复 HTTP 200，同一设备仍查到正式 66。

用户在 iPhone 上开启旁白，聚焦讯页右上角按钮时听到「新建」。该按钮的默认辅助功能标签为「新建」，按下后打开包含扫码入口的操作菜单。此项记录来源于用户在设备上的实际听读。用户随后关闭旁白。 [按钮源码](../../MiaoxunRN/src/features/messages/ThreadListScreen.tsx#L830)

### iOS 模拟器补验与图片预览修复

使用 iPhone 17 模拟器（iOS 26.5）的独立 QA 1.0（64），连接隔离 API，以合成账号从 App 页面操作。Mac 运行临时 XCUITest，不需要开启 iPhone 旁白。

| 项目 | 预期 | 实测 |
| --- | --- | --- |
| 新建与扫码入口 | 新建菜单可展开和关闭，扫描名片有按钮名称并可点 | **模拟器通过。** 实点打开和关闭菜单，系统 UI 树中的「扫描名片」可点。镜头和解码见先前真机探针回执。 |
| 语音入口 | 可以切换语音输入，系统识别「按住说话」按钮 | **模拟器通过。** 实点切换和恢复键盘，「按住说话」有按钮名称且可点。App 页面录音、系统打断和完整识别待真机。 |
| 聊天图片保存与关闭 | 图片预览可点保存和关闭，查看器显示保存结果，系统相册出现合成图 | **模拟器通过。** 修复前，打开 A09 测试聊天的图片，状态栏覆盖两按钮，XCUITest 判为不可点。修复安全区后，两按钮均为 44×44 点且可点，发现原保存反馈在预览背后的聊天页。修复反馈后，实点保存显示成功，系统相册新增一张 640×440 图片，实点关闭回到聊天。模拟器通过 `simctl privacy grant photos-add` 预授仅添加权限。 |
| 漫画图片保存与关闭 | 从「我的漫画」打开作品及画格，能保存、关闭并读到合成图 | **模拟器通过。** 修复前，从「漫画日记 Agent」→「我的漫画」→「A09 Physical QA Comic」→ 第一画格进入预览，状态栏覆盖保存和关闭，两按钮均不可点。修复后两按钮均为 44×44 点且可点，实点保存显示「已保存到相册」，系统相册新增 768×512 合成图，关闭返回漫画详情。 |
| 注销页返回 | 从设置打开注销页，点返回恢复设置，再点返回退出弹层 | **模拟器通过。** 实点两次返回，恢复二楼设置，再从底部上滑回讯页。只浏览注销页。 |
| 读屏与减动 | 关键按钮有名称，读屏播报和焦点符合页面操作，减动能生效 | **部分验证。** 模拟器获取新建、扫码、语音和图片保存按钮的名称及角色。iPhone 用户已听到「新建」，真机减动已有探针回执。其他 VoiceOver 播报及焦点仍待验。 |

聊天图片和漫画查看器均使用模态安全区，保存与关闭的实际触控区域为 44×44 点。聊天预览在当前界面呈现保存结果，iOS 使用辅助功能播报 API，Android 使用 live region。漫画画面等比放入实际可用的列表区域。 [聊天查看器](../../MiaoxunRN/src/features/messages/ChatMessageAttachments.tsx) · [漫画查看器](../../MiaoxunRN/src/features/messages/ComicFrameGrid.tsx)

- UI 验证在临时 XCUITest 工程执行。`xcodebuild -project A09Login.xcodeproj -scheme A09Login -destination 'platform=iOS Simulator,id=B5AA8278-4F20-4054-989E-8DF2700091D7' -parallel-testing-enabled NO -only-testing:A09Login/SimulatorChecks test` 运行 `testScreenControls`、`testComicSave` 和 `testSettingsBack`，3 项通过。只读查询确认模拟器 Photos 数据库新增两种资产。
- `npm --prefix MiaoxunRN test -- --runInBand --silent chatMessageAttachments` 通过 9 项。最终 `MIAOXUN_DOTENV_ENABLED=false ./scripts/check-repository.sh` 和 `git diff --check` 均退出 0，移动端 127 套、1572 项通过。 [聊天回归](../../MiaoxunRN/__tests__/chatMessageAttachments.test.tsx) · [漫画回归](../../MiaoxunRN/__tests__/comicFrameGrid.test.tsx)
- iPhone 14 Pro（iOS 17.6.1）通过 `devicectl device install app` 装入含两处修复的独立 QA 1.0（64），签名递归校验通过，安装后读取设备 App 列表确认 QA 64 与正式 1.0（66）。此前仅含聊天修复的 QA 安装后，`devicectl device process launch` 超时。最新版需从手机打开，聊天和漫画保存与关闭仍待同机页面复测。Android 本轮暂停，A09 仍待验。

用户打开修复后的 QA 64 时看到「账号空间暂时无法同步」。检查确认隔离 API 的 20 分钟运行窗口已到期，Mac 端口无服务监听。用原隔离库重启 API 并将本轮窗口延长至 4 小时，`/api/ready` 返回 HTTP 200。使用 `xcrun devicectl device process launch --terminate-existing` 重新打开同一台 iPhone 的独立 QA，`GET /api/app/bootstrap` 和 `GET /api/app/sync` 均返回 HTTP 200，原测试会话恢复。

通知用户从测试聊天打开图片并点保存后，隔离 API 收到聊天附件请求并返回 HTTP 200。运行 `A09_ONLY=CHAT ./verify <UTC开始时间> <UTC结束时间>`（临时 USB Image Capture 探针），从同一台 iPhone 的当轮时间窗内读回一张 640×440 合成图，OCR 匹配 `A09 CHAT`。Image Capture 曾报告 `-9943`，同次运行随后读到相册目录及匹配资产，退出 0。聊天图片落盘已取得修复包真机证据，页面成功提示和关闭操作仍待确认。漫画保存和关闭待同机页面复测。

### 当前 QA 64 的 iPhone 页面实测

同一台 iPhone 14 Pro（iOS 17.6.1，USB）保持安装含两处图片修复的独立 QA 1.0（64）。此前 Xcode 启用真机自动化超时。本次签名 runner 成功启动，通过 App 页面执行以下操作，旁白保持关闭。

- `testComicSave` 和 `testScreenControls` 实点漫画及聊天图的保存、确认查看器内的成功提示并点关闭。顶部按钮约 44×44 点且可操作。聊天首轮用浮点值直接比较 44 点，在 43.99998 处触发测试断言。加 0.01 点容差后通过，App 代码无变化。各次测试后用 USB Image Capture 探针按时间窗和尺寸匹配，再用 OCR 分别确认新增 `A09 CHAT` 640×440 和 `A09 COMIC` 768×512。
- `testSettingsBack` 从二楼设置打开注销页，点两次返回后从二楼底部上滑回「讯」。注销仅打开确认页。
- `testCameraCancelAndReopen` 从「讯」页打开和取消原生扫码页两次。随后 `testCameraResolveFixture` 从同一入口打开相机，设备对准 Mac 上的合成码，隔离 API 的 `POST /api/scan/resolve` 返回 HTTP 200，App 展示测试账号资料。首次授权和拒绝恢复的证据来自先前同机原扫码流程。
- `testVoiceHoldReleaseAndReenter` 静音长按、松手后输入栏恢复可用，系统识别回报中断。`testSpokenPhraseAndSecondCapture` 用 Mac 播放合成中文短句，连续两次转写至草稿。`testSpeechBackgroundCancellation` 在长按未松手时将系统设置切到前台，回到 QA 后直接再次长按，成功转写合成句。第一次中断后重录未匹配到短句，调整播放时序和返回后的操作后通过。实测没有发送草稿，Mac 音量恢复至测试前的静音状态。当前包的重录结果确认麦克风可再次使用。取消时音频会话停用及监听移除由先前同机探针直接确认。

本轮 XCUITest 复跑命令为 `xcodebuild -project A09Login.xcodeproj -scheme A09Login -destination 'platform=iOS,id=<测试机UDID>' -parallel-testing-enabled NO -only-testing:A09Login/SimulatorChecks/<用例> test`。命令在临时测试工程运行，以上用例均有真机通过回执。仅扫码用例需将镜头对准 Mac 上的合成码，其余页面操作由 XCUITest 驱动。

### iOS 无障碍续验

旁白保持关闭。本轮沿用同一台 iPhone 14 Pro（iOS 17.6.1）；先复现返回控件在真机辅助功能树中的角色缺失，再从正式工作树构建并安装签名后的独立 QA 1.0（64）。

| 核对项 | 预期与实测 |
| --- | --- |
| 扫码入口和关闭 | **通过。** 真机自动化识别「扫描名片」和「关闭」两个按钮，打开、取消及重开均能操作。 |
| 设置和注销页返回 | **通过。** 修复前两处「返回」可点但为通用元素。补上按钮角色和本地化标签后，真机辅助功能树均识别为按钮，点按恢复上一级，二楼上滑回「讯」。 |
| 语音 | **自动化通过，旁白手势待验。** 增加 iOS 旁白激活入口，双击开始录音、再次双击结束，回归覆盖录音状态、重复操作及中断清理。新版真机普通长按两轮可用，切到系统设置再回来后成功转写。连续录音首轮测试的第二次转写未匹配合成短句，调整播放时序后同包复跑两次均转写成功。 |
| 保存与反馈 | **自动化通过，旁白实际播报待验。** 真机可识别聊天与漫画的保存、关闭按钮以及保存结果文本。漫画补上 iOS 保存结果播报，定向测试验证成功和失败会调用播报 API，切换画格后过期结果不播报。 |
| 旁白焦点 | **待验。** 用户此前实听讯页「新建」。本轮检查系统辅助功能树和触控结果，其余实际播报、读屏手势和跨页面焦点仍待验。 |

涉及 [设置页](../../MiaoxunRN/src/features/settings/SettingsScreen.tsx)、[注销页](../../MiaoxunRN/src/features/settings/DeleteAccountSheet.tsx)、[聊天语音键](../../MiaoxunRN/src/features/messages/ChatComposer.tsx) 和 [漫画查看器](../../MiaoxunRN/src/features/messages/ComicFrameGrid.tsx)。真机 XCUITest 的扫码取消、漫画保存、聊天控件、设置返回、语音松手重进共 5 条通过。另有语音后台中断恢复及连续转写用例的通过回执。新增回归覆盖语音旁白激活和漫画保存播报。

`MIAOXUN_DOTENV_ENABLED=false ./scripts/check-repository.sh` 退出 0，移动端 127 套、1576 项通过。`git diff --check` 通过。新版签名包和 XCUITest 原始结果已归档，手机临时测试 runner 已移除，隔离 API 和数据库已停止。Android 无真机，本轮暂停。A09 待验。

### 11 月 20 日 Build 68 续验

- `xcrun devicectl device info apps` 直接查询到 iPhone 14 Pro（iOS 17.6.1，21G93）安装正式妙讯 1.0（68）及独立 QA 1.0（64）。本轮仅查询设备上的版本。App Store Connect 的处理、出口合规与测试组状态仍待核对。ADB 未列出已连接设备。
- 在移动端发布快照 `33de46e` 运行 `MIAOXUN_DOTENV_ENABLED=false npm --prefix MiaoxunRN test -- --runInBand --silent launchAccessibility appWorkspaceNavigation publicProfileActions chatVoiceMessages chatMessageAttachments`，5 套共 39 项通过。
- 用同一快照构建 iPhone 17（iOS 26.5）独立 QA 1.0（68），连接归档隔离数据的副本。用 `xcodebuild test-without-building` 运行 `testScreenControls` 和 `testSettingsBack`，两项通过。验证新建与扫码入口可操作、普通聊天语音入口与录音按钮可操作、图片长按查看与保存、从系统相册选图并发送、设置和注销页两次返回、二楼上滑退出。隔离 API 和 PostgreSQL 已停止。
- 以上模拟器回归补充 Build 68 证据。iPhone 的实际 VoiceOver 播报、读屏手势和跨页面焦点，以及 Android 真机验收仍待完成。

### 11 月 20 日 QA 69 续验

| 平台 | 设备与实际安装 | 本轮实测 |
| --- | --- | --- |
| iOS 真机 | iPhone 14 Pro，iOS 17.6.1。当前正式树签名的独立 QA 1.0（69）已安装并启动，正式妙讯 1.0（68）仍可查到。 | **启动与同步通过，页面待验。** 真机冷启动和账号同步均从隔离 API 获得 HTTP 200。两次 XCUITest 均在连接测试会话前退出，退出码 74，未执行页面步骤。当前候选真机扫码、语音打断、系统相册、返回、二楼手感及 VoiceOver 实际播报、手势和焦点待验。 |
| iOS 模拟器 | iPhone 17，iOS 26.5，隔离 QA 1.0（69）。 | **通过。** 5 条 XCUITest 覆盖普通聊天草稿、资料回聊天、聊天边缘返回、设置和注销页返回、二楼短长拖动、聊天图片查看保存及发送、漫画图片保存。 |
| Android 模拟器 | Pixel 7，Android 16 / API 36，隔离 QA 1.0（20261120）。 | **通过本次修复。** Android 系统返回及草稿恢复、资料回聊天，二楼入口、首页、固定返回区及长设置页短滑留页、长滑切换。Android 真机按本轮范围暂缓。 |

A09 保持待验。此前 QA 64 同一 iPhone 的相机、语音、相册及返回实测记录见上方。

## 首次验收时需返工的事项

| 工单 | 独立验收结果 | 关闭条件 |
| --- | --- | --- |
| A17 相册创建重试 | **在临时 PG18 和正式 Express 路由复现。** 相同账号、相同正文、相同 Idempotency-Key 连续两次创建，两次都返回 201，库中有两条同名相册。手写文件主流程的幂等测试通过。现有相册创建事务解决使用事件失败回滚，仍缺提交后丢回执的重放。[创建路由](../../backend/src/routes/station-album-routes.js#L20)、[App 入口](../../MiaoxunRN/src/features/second-floor/SecondFloorAlbums.tsx#L77) | 在 App 保存意图及后端绑定稳定键，重放返回原相册。用两连接同键、丢回执再试及同键改参验收；独立新意图允许创建同名相册。 |
| A06 Worker 停机 | **在真实 runner 和挂起的续租替身上复现。** 慢续租最大在途 1、空转 50 轮余留监听 0，均达标。数据库续租一直不返回时，业务已经完成，stop 仍等待该 Promise；实验中手动释放后才能结束。[等待续租](../../backend/src/ai-task-runner.js#L70) | 给数据库续租建立可执行的时间上限和取消/失效规则；在不手动释放阻塞查询的情况下验证停止有界，旧 claim 不得继续写入或触发重复执行。 |
| A02 注销提交后响应丢失 | **源码确认，App 断线场景待实测。** 服务端注销、会话撤销和对象清单有隔离 PG 证据；客户端只在成功收到 DELETE 响应后清本地会话，断线走错误分支，可能继续显示已登录。[客户端回调](../../MiaoxunRN/src/features/session/useMiaoxunSession.ts#L950) | 区分结果未知和已确认；之后按原账号复核会话，有效时给出恢复路径，失效时安全返回登录。分别测试服务端提交后丢响应、提交前断线、普通会话撤销和切换账号。401 单独不能证明注销成功。 |
| A13 恢复切换前的数据核对 | **源码确认，切换保护已有演练记录。** 候选库的账本与 checksum 实际比对。脚本查询用户、会话、素材条数后即执行切换，仅输出条数，未同审批基线比较；当前约束查询检查已存在而尚未验证的约束，不能单凭它确认期望约束齐全。[校验及切换](../../scripts/restore-production-database.sh#L209) | 按原工单补足批准备份版本的代表性行数或摘要、关键约束的可比对证据。缺项或不匹配应在切换前停住。只在一次性 Linux/PG18 实例造数据验证，旧库要持续可用。 |
| A09 原生设备；A16 并发加入的测试证据 | 双端构建及模拟器有既有证据。真实镜头、音频打断、相册、读屏、手势仍待双端真机。A16 此次在真实数据库运行移出素材与删除相册竞态 15 次，14 次移出成功、1 次删除成功，记录与对象清单一致。并发新加入与删除需单独做持锁测试。[移动端取证](2026-11-18-mobile-concurrency-and-native.md)、[存储回归](../../backend/test/account-storage-cleanup-postgres.test.js#L108) | 记录机型、OS、构建和实际效果；为相册同时加入和删除覆盖两种提交次序及最终对象清单。这两项缺口属于验收取证。 |

## 其他工单核对

| 工单 | 本地依据与边界 |
| --- | --- |
| A01、A03、A04、A05 | 新鲜 PG18 复跑管理员账号、发布生命周期、好友并发和漫画仓储，分别 1、11、1、15 项通过。既有浏览器证据覆盖账号及发布确认重试。 |
| A02、A16、A17 的数据库主流程 | 与上述四单使用的五组专题共 32 项通过、零跳过。另做的相册移出/删除竞争及失败的相册重放实验见前表。 |
| A07、A08、A19、A20 | RN 定向覆盖聊天已读/静音、精确草稿、素材预览、隐私序列化。与 A11 移动端共 5 套 47 项通过。 |
| A10、A11、A12 | 后台监控在 320px、1440px Chromium 下通过切窗、失败重试及零值。3D Web 进度定向 7 项通过。检索 Web 定向 13 项通过，双宽度输入法与焦点沿用上轮浏览器记录。 |
| A14 | 当前 CI 将四组 PG 套件分开设开关，并断言执行数和零跳过；Compose 的两类 Worker 使用各自进程探针。空库启动、镜像和暂停/恢复隔离演练见此前交接，本次未重新构建容器。[CI](../../.github/workflows/quality.yml#L135)、[Compose](../../deploy/docker-compose.prod.yml#L31) |
| A15 | 已清理旧后台实现并迁移有效断言，保留 10 个仍有测试消费者的 RN 候选。本轮修正原报告的两个旧测试链接与早期设备记录的指向。 |
| A18 | 定向覆盖协作相册错误映射和调用次数。与 Worker、3D Runner 的离线四套共 55 项通过；八种状态未逐一做真机联验。 |
| A21、A22、A23 | 两个独立的回环 PG18 测试库。3D 双执行器领取/过期/晚回执及检索控制版本、审计与重放共 9 项通过；上传索引归属、换版、删除等 12 项通过，均零跳过。用本地替身模拟供应商。 |

整仓在关闭 dotenv 的隔离进程环境运行 `./scripts/check-repository.sh`，退出 0。RN 127 套、1,563 项，Backend 1,157 项通过、425 项按环境跳过，Agents 59、Admin 27、3D Web 37、检索 Web 13 项通过。专题数字有重叠，不与整仓相加。未操作生产、真实供应商或 TestFlight。

## 首次验收使用的返工提示词（历史）

```text
请在 /Users/gary/.codex/worktrees/admin-lifecycle-release/marvelsChat 核对当前工作树，保留已有改动。读 AGENTS.md、README.md、docs/README.md、docs/handoffs/CURRENT.md，以及 docs/reviews/2026-11-19-ticket-acceptance.md。以该报告第一张表的关闭条件为准，处理 A17 相册重放、A06 续租挂起、A02 注销未知结果、A13 恢复前数据核对。补 A16 并发加入/删除的隔离测试；A09 按实际可用设备出具记录，缺设备保留待验。无需重做其他已验收工单。

先复核每个失败场景，再做本地修复与定向回归。整合后跑整仓测试，回传每项的文件、运行命令、实际结果及尚未验证的条件。数据库仅用一次性隔离库，不推送、不部署、不访问真实供应商或生产。
```
