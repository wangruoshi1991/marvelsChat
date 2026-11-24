# 妙讯当前交接入口

更新：2026-11-24。先读 AGENTS、README、docs/README，再核对 Git 与实际运行。日期记录只证明当时状态，不延续部署、上传或付费授权；保留已有修改，不写入密钥、生产身份或私人内容。

11 月 17 日及更早阶段的实施、发布与设备验收记录见[历史交接档案](2026-11-18-handoff-history.md)。

#### 2026-11-24 接手复核与当前缺口

- 主分支 `ff90b34` 推送后的 GitHub Actions `Repository Quality` 运行 `45307924678` 曾在干净 `MiaoxunRN/npm ci` 阶段失败，原因为 `react-native-webrtc+155.0.1.patch` 的上下文空行和第二个 hunk 行数头不符合 `patch-package` 严格解析；后续任务因质量门依赖全部跳过。已修正 patch，干净 `npm ci` 本地验证两个原生 patch 均成功应用，待重新推送后复验远端运行。
- 正式工作树为 `/Users/gary/.codex/worktrees/admin-lifecycle-release/marvelsChat`，当前分支 `main`，远端与本地均指向 `ff90b34`。此前工作区原有 251 项已跟踪修改和 132 项未跟踪条目已纳入合并提交，本轮只补充本节交接记录。
- `MIAOXUN_DOTENV_ENABLED=false ./scripts/check-repository.sh` 退出 0：RN 144 套、1,722 项，Backend 1,178 项通过、440 项按环境跳过，Agents 59、Admin 27、Avatar Web 44、检索 Web 13；`git diff --check` 通过。跳过项没有计作 PostgreSQL 通过。
- 新建一次性本机 PostgreSQL 18.4 隔离库，先应用 071，再运行两次 `npm run db:migrate`，第一次应用 072–074 共 3 份，第二次 0 新增、73 不变。回归运行送达回执、附件、相册并发和前台通话 PostgreSQL 专项共 32 项，零失败、零跳过。
- 后台事务边界已修复。账号创建、修改管理员权限、修改资料和撤销 Agent 授权的业务写入与审计写入现在共用同一事务；账号创建一次性写入请求状态。审计故障回滚、并发幂等、会话撤销和凭据回执在隔离 PostgreSQL 18.4 通过。
- 后台权限与资料审计失败回滚定向测试共 22 项通过，Backend 源码检查 470 个文件通过。管理账号隔离 PostgreSQL 专项 1 项通过。
- 一对一通话仍是前台、单 API 进程信令的候选。被叫接听请求丢回执时，控制器现在先读取权威通话状态，服务端已接通则发送 `hangup` 清理，不再按旧响铃状态发送 `decline`。RN 定向控制器测试 9 项通过。跨网 TURN、系统后台来电、锁屏接听和实体设备听音、路由、打断、读屏仍待验。
- Agent 注册和 published 目录只证明可发现性。视频 Agent 仍产出脚本/镜头表，PDF/DOCX/OCR、外部通知和真实漫画生图供应商未接入或未完成验收。两个 Worker 有独立健康探针，`/api/ready` 只检查数据库，不能单独证明 Worker 或供应商可用。

#### 2026-11-24 后续本地修复

- 账号创建审计失败已补真实隔离 PostgreSQL 回归。完整 001–074 迁移和有效 Butler 发布身份夹具下，审计异常会回滚 `users`、`user_profiles`、`user_agents`、`chat_threads` 和 `chat_messages`，管理员事务专项共 2 项通过。
- `/api/ready` 现在读取 AI Worker 新鲜心跳和媒体检索 Worker 的 readiness/liveness。数据库正常但任一必需 Worker 停止时返回 503 并给出依赖状态。媒体检索明确关闭时，健康的 Worker 不阻断基础 API readiness。readiness 定向测试 7 项通过。
- 本轮完整 `MIAOXUN_DOTENV_ENABLED=false ./scripts/check-repository.sh` 通过，RN 144 套、1,722 项；`git diff --check` 通过。上述代码改动尚未提交，仍需在提交后重新验证远端 CI。

#### 2026-11-23 通话单次退出与音频输出

- 主动取消、拒绝或挂断直接关闭本机通话和控制页，返回原页面并保留草稿。后端确认异步处理。服务端无法确认时在原页提示。
- 接通后底部提供直接切换的扬声器按钮和静音按钮。系统提供一个通话耳机时可直接切换，多个耳机才显示选项。右上角独立缩小图标收起原通话。系统回读和路由事件决定选中状态。Android 12 及以上点击蓝牙后请求「附近设备」权限，旧 Android 的设备选择受系统接口限制。
- 通话交互参考 Signal 无外接设备时直接切扬声器，以及 Telegram 只有两个输出时直切、输出更多时才展开选项。 [Signal 通话控制](https://github.com/signalapp/Signal-iOS/blob/45372289a9387cd4271a2f7a47dba8ba92951e41/Signal/Calls/UserInterface/CallControls.swift#L690-L696) · [Telegram 音频输出交互](https://github.com/TelegramMessenger/Telegram-iOS/blob/24638bc69bd083981b178dd1e7f921eebbf7fc46/submodules/TelegramCallsUI/Sources/CallController.swift#L246-L283)
- iPhone 17 最终隔离安装包构建通过，有实际 WebRTC 通话的 XCUITest 验证扬声器状态、右上角缩小、浮钮拖动和跨页恢复、挂断一次即回到搜索页。独立取消呼叫测试也通过。模拟器系统只有扬声器输出，听筒、蓝牙、有线及实体出声待验。此前同一环境有一次 ICE 建连失败，本次最终链路通过。
- Android 隔离 SDK 已恢复，最终 QA 包构建并安装到 Android 16 模拟器。WebRTC 通话持续 90 秒，双向 RTP 计数增长。另验单次取消、右上角缩小、拖动及恢复浮钮、单次挂断返回聊天。模拟器仅报告扬声器输出，实际听筒、外接设备切换和出声留待实体机。
- 整仓检查通过，移动端 144 套、1721 项。跨网阶段需按通话签发短期 TURN 凭据，并在不同网络用 relay 候选复验，后台来电仍待接入。

#### 2026-11-23 通话收起与可拖动浮钮

- 接通后可收起全屏通话控制。浮钮是 56 点圆角方形，默认停在应用右侧约三分之一高度。拖动在安全区域内，松手保留位置。点按恢复同一次通话。静音和重连有对应图标。收起时对方挂断会移除浮钮并提示。
- 通话收起时可继续编辑和发送文字、切换会话、浏览小站。拍摄、扫码、录音、语音识别和音视频播放展示冲突提示。iOS 应用内选图与选文件仍可用，Android 需要离开妙讯的系统选择器会提示。系统后台仍会结束前台通话。
- iPhone 17 隔离安装包构建通过。模拟器与独立 Chromium 的实际 WebRTC 通话验证了默认位置和尺寸、拖动、发文字、录音与拍摄的冲突提示、切换到会话列表后保留位置、从搜索页恢复原通话及计时、再次收起保留搜索输入、静音和挂断。首次模拟器测试有一次本地 ICE 建连失败，随后聊天专项和最终搜索链路各通过一次。
- 整仓检查通过，移动端 143 套、1717 项。通话 PostgreSQL、HTTP 和信令专项 17 项通过。资料页与动态草稿通过 RN 回归测试，设备级原生验证覆盖聊天、会话列表和搜索。部分功能内的独立弹层可能盖住浮钮，关闭该弹层后可继续使用。
- 本轮改动保留在本地候选。Android 新候选构建受隔离 SDK 和 NDK 文件缺失影响。实体手机需要复验双向听音、音频路由和系统打断。系统级后台来电、锁屏接听和跨网络 TURN 待后续接入与验证。

#### 2026-11-23 一对一前台语音通话与聊天交互复核

- 普通好友私聊顶栏加入语音通话入口。前台来电可接听或拒接，发起者可取消。媒体连接建立后开始计时，通话中可静音、恢复麦克风或挂断。退出前台释放本地音频。聊天录音或语音识别在通话界面打开时停止。
- 复核语音初态、转写译文、视频卡片和多选结果。iPhone 17 最大辅助字号暴露了时长和倍速截断，调整语音布局后点播、暂停与截图复验通过。Pixel 7 在字号 1.6 下实点来电拒接，大字布局和可点击区域仍可用。实体设备读屏和首次起声延迟待验。
- iPhone 17 与 Pixel 7 的隔离妙讯包从普通私聊发起和接听真实 WebRTC 通话，确认接通、静音、恢复、主动挂断及另一端同步结束。Android 与独立 Chromium 互测时，模拟器输出测得浏览器的 440 Hz，浏览器收到注入 Android 虚拟麦克风的非静音信号。iOS 与 Chromium 验证双向 RTP。两个妙讯客户端之间已接通，iOS 侧未注入可辨识的测试音，实际听筒、扬声器和双端人声仍待实体机复验。
- WebRTC 155.0.1 已锁定在 npm、Pods 和 Android 解析。iOS 依赖归档 SHA-256 与官方值一致，最新隔离模拟器包构建通过。Android 通话隔离包构建成功，追加语音大字号布局后重建时本机临时 NDK 已缺少元数据和部分文件，因此最后这个布局的 Android 新包还未复验。
- PostgreSQL 由 073 升至 074，账本 73 条，重复迁移执行 0 份。通话 PostgreSQL、HTTP 和信令专项 17 项通过。整仓检查通过，移动端 140 套 1693 项。公网 health 和 ready 只读 200。
- 本阶段为同网前台候选，后端默认关闭。生产启用、试用包分发、系统后台来电和跨网中继待完成。用户手机复验应使用独立测试包和两个普通好友账号。 [运行配置与合同](../../backend/VOICE_CALLS.md)

#### 2026-11-23 语音转写翻译、播放反馈与普通聊天续修

- 语音点播前的等高竖条从 7 提高至 14 点。按下立即反馈，下载时保留圆形播放图标和气泡高度，可点按取消。原生播放就绪后更新为暂停按钮，实际波形晚到时保持进度。
- 聊天语音长按「转文字」，转写完成后可在同一消息下「翻译转写」。两项能力由服务端分别声明。翻译复用服务端短期转写结果，校验账号、会话和附件权限。未调用真实供应商。生产开关以最近一次生产配置记录为准，本轮仅只读复核公网 health 和 ready 均返回 200。
- 普通私聊增加接收客户端 ACK 驱动的「已发送 / 已送达」。最近已加载消息按有界批次确认，发送状态查询独立于收件 ACK。长按「多选」可对同一目标逐条转发最多 20 条并单独重试未确认条目。普通聊天「更多 → 视频」打开系统文件选择器，初版支持 60 秒、8 MiB 以内的 H.264 MP4，确认发送后由收件人在 App 内鉴权预览。 [送达合同](../api/chat-message-receipts.md) · [多选和视频合同](../api/chat-message-forward.md) · [转写与翻译合同](../api/chat-message-ai.md)
- 隔离 PostgreSQL 18 从 071 到 073 新增两份迁移，账本为 72 条，复跑新增 0。旧消息与文件见证保持，历史回执为 NULL。33 项 HTTP/PostgreSQL 定向检查通过，覆盖回执与账号删除、伪造/越权拒绝、视频上传读取、转发重放及撤回。整仓检查通过，移动端 138 套、1678 项。
- iPhone 17 和 Pixel 7 独立安装包均构建成功。在隔离 API 上，iOS 点播和暂停、转写后翻译、打开/关闭私有视频、一次转发语音和视频两条均通过，后端两次转发各 201。接收端打开私聊后，发送方查询获得实际「已送达」。Android 播放和暂停语音、播放视频、从系统文件选择器选择 MP4 并明确发送通过，上传与消息响应各 201。两端真机、首次点播实际起声延迟、iOS 系统选取视频及真实供应商效果待验。
- 本轮候选保留在本地。批量删除、群聊回执、已读与输入状态仍待实现。一对一语音通话按既有方案，下一步先验两台设备的前台呼叫、双向音频和挂断。 [开源参考与通话方案](../reviews/2026-11-23-chat-voice-and-calls.md#一对一语音通话分阶段方案)

#### 2026-11-23 语音录制试听、锁定与倍速

- 普通聊天录音松手进入本机待发状态。上滑丢弃，左滑锁定继续录，结束后可试听、丢弃或明确发送。语音波形支持跳转及读屏五秒步进。倍速为 1×、1.5×、2×，每次新播放恢复 1×，暂停时拖动或切换倍速保持暂停。
- iPhone 17 与 Pixel 7 隔离模拟器进入完整 App 和回环 API，验了播放进度、倍速、录音取消、锁定、试听和显式发送。试听未上传，两端各一次明确发送取得附件 201 和消息 201。整仓通过，移动端 132 套 1,631 项。公网 health、ready 只读返回 200。
- 此轮改动仍在本地候选。两端实体设备的实际听音、系统打断、锁屏和读屏继续待验。聊天下一步进入回执、多选、视频的需求选择。一对一语音通话仍待实施，按已有方案另行安排。[完整证据与通话方案](../reviews/2026-11-23-chat-voice-and-calls.md#第二阶段录音与播放控制)。

#### 2026-11-23 语音消息体验及开源参考

- 正式树已加入圆形播放与暂停、实际播放进度和 32 段音频波形。点播前显示等高刻度，暂停从原位置继续，失败可重试。退出页面、切换语音或切换账号释放原生播放。录制按住、上滑取消与原有发送回执继续适用。修复登录输入密码时键盘遮住提交按钮，并接通回车提交。开源源码、当前聊天能力和一对一通话方案见[聊天体验续修](../reviews/2026-11-23-chat-voice-and-calls.md)。
- iPhone 17 和 Pixel 7 隔离模拟器实点音频播放、暂停、续播、切换及错误状态。iOS 完整 App 另连隔离 Express/PostgreSQL 18，70 份迁移至 071，合成语音上传和发送各 201，收件人读回原字节 200，匿名拒绝 401。收件 App 聊天页面播放、暂停与继续通过。整仓检查通过，移动端 132 套 1,628 项。实际读屏、扬声器、蓝牙与系统打断留给真机，A09 待验。
- [上轮审查](../reviews/2026-11-23-takeover-audit.md)的缩略图失败重试与 3D Web 终态刷新修复已应用。3D Chromium 三种宽度共六条合成场景通过。后台创建账号、改权限与改资料的事务审计问题继续待修。公网 health、ready、后台首页、公开目录本轮只读复核为 200，精确部署和装机沿此前记录。
- 下一步优先做录音试听与锁定、波形拖动和倍速，再按需求补聊天回执、多选与视频。当前无实时语音通话，先按方案用隔离设备验证一对一信令和媒体，后续分别验系统来电和中继网络。此轮客户端改动尚待分发。

#### 2026-11-23 QA 残留清理

- 本机移除 16 个可重建的 iOS 和 Android 缓存目录，删除前测量合计 7.44 GiB。清理前把两份已签名的独立 QA 69、真机测试 runner 和五份测试结果另存至 `~/Library/Application Support/MiaoxunQA/A09-2026-11-23-cleanup`，签名复验通过。正式 Build 69 归档及符号、Android SDK/AVD、APK 均保留。关闭独立 QA 模拟器，主 iPhone 17 模拟器仍启动，本地开发 API 4391 返回 200。
- 停止闲置的 `miaoxun-a01-postgres` 前查到唯一非默认库为 `admin_account_migration_test`，无其他客户端。原计划保留数据卷，Docker 在停止时一并销毁容器和匿名卷，事件已核实。该隔离测试库可通过 A01 的 PostgreSQL 夹具重建。经用户授权，另移除两项已停止的本机容器 `miaoxun-album-qa-pg` 和 `miaoxun-postgres`，逐个核实容器已不存在、两个数据卷仍在。本地开发 API 与公网 ready 均返回 200。
- 生产先校验 071 上线后定时备份、三份正式 061 停写备份和保留库，再按库名移除五个已禁连接且无会话的恢复验证库，并删除两份与正式备份完全相同的临时副本，合计 78.98 MiB。旧 061 运行包、原库及正式备份保留。复查生产仍是 071、70 条账本，API、双 Worker 和备份定时器 active，公网 ready 和后台首页均 200。服务器清单位于 `/opt/projects/marvels-chat/backups/paired-20261123-b443f02/cleanup-20261123.tsv`。A09 真机状态仍待验。

#### 2026-11-23 生产 071 与 Build 69 配套开流

- 用户同意立即安排维护。北京时间 12:10，生产 API、后台和两个 Worker 已同时切换到 `paired-20261123-b443f02`。已复算 326 个制品文件，历史 61 份迁移 SHA 全部一致。生产 PostgreSQL 18.6 以正式受限角色将候选库从 061 升至 071，新增 9 份，复跑 0 份，当前账本 70 条。生产环境文件与旧版本一致，聊天翻译与语音转写仍关闭。
- 前两次短暂维护均在迁移前安全恢复 061。第一次是旧约束的类型转换表达式在 PG18 逻辑恢复后出现等价表示，第二次是 data-only dump 的导出顺序产生差异。第三次用同一服务器分别解析原库的结构导出与归档恢复结构，逐字匹配；再逐表比对保留全部行值和重复行、去除导出顺序影响的摘要及序列状态。停写的 061 自定义备份恢复验证、六表见证及物理克隆严格结构比对均通过。原 061 数据库已保留并禁用连接，旧运行时与停写备份保留。证据在服务器 `/opt/projects/marvels-chat/backups/paired-20261123-b443f02/attempt-3`；开流后修复须保留新写入。
- 开流后独立复核：公网 health、ready、后台首页及产品页均 200，后台首页字节与候选制品一致，公开目录 9 项。匿名 `/api/me` 及聊天搜索、转发、翻译和转写四条路由均 401，较切换前的四条 404 已配齐对应路由。API 与两个 Worker 的工作目录均指向同一新制品，重启次数 0，Worker 心跳新鲜，备份定时器 active，维护标记已清除。生产未使用真实用户会话或业务写入来做冒烟验证。已装 Build 69 可在正式 App 复验搜索、转发和真实听音；菜单关闭状态的客户端改动仍需下一次构建。没有重新上传 TestFlight。

#### 2026-11-23 聊天菜单修复与配套发布演练

- App 仅在登录后的后端响应明确开放时显示「翻译」或「语音转文字」。未提供能力字段的旧后端也隐藏两项。文字分享独立保留。无错误码的旧 404 提示服务暂未开放，`CHAT_MESSAGE_AI_NOT_FOUND` 才提示原消息不可用。iPhone 17（iOS 26.5）隔离 QA 1.0（72）验证关停时仍可打开系统分享，开启时两项走通本地 HTTPS 替身，未访问真实供应商。菜单改动随下一次客户端构建生效，现装 Build 69 保留旧菜单，配套后端关闭时会返回明确的暂未开放。
- 用独立本地干净快照 `b443f02` 打包了 326 个校验文件的 API、后台和双 Worker 制品。实际旧包 `38ba385` 按合成 061 库预置旧会话、文字和 AAC；Linux Node 22、PostgreSQL 18.7、pgvector 0.8.7 应用 9 份迁移，复跑 0 份，账本为 70 条至 071。受限角色复跑同样通过。旧登录、启动、同步及普通收发保持可用，新搜索和语音转发与重放通过，授权接收方读回原字节。后台四组 Chromium 实测通过。两个 Worker 心跳和停机通过。
- 同一候选库的恢复演练核对 6 表行数及 1,305 项约束，数据不符或约束缺失均拦住切库，匹配备份成功切换。回退 061 后，旧库 OID、见证记录、旧版 API 就绪、旧会话和语音读回均通过。候选包、SHA-256、运行命令及证据已保存于本机 `~/Library/Application Support/MiaoxunReleasePreparations/paired-20261123-b443f02`。
- 演练期间的生产基线为 `mobile-interaction-20261119-38ba385`、061 账本。生产 PostgreSQL 18.6、pgvector 0.8.1，隔离库为 18.7 和 0.8.7。实际切换和停写恢复证据见上方生产 071 记录。 [部署顺序](../deployment.md#发布与启动顺序)
- 采用正式 Build 69 归档的同一份 Hermes 字节码，隔离模拟器实测搜索命中并跳到旧消息、转发，以及 11.89 秒合成语音正常结束。iPhone 14 Pro 保留正式 69，另装独立 QA 69。独立 QA 能打开，两次真机 XCUITest runner 均在进入页面前因 IDE 会话断开以 74 退出。听音、打断、相册及二楼手势仍待真机回执，A09 保持待验。临时 runner 已卸载，隔离服务已停止。没有新增 TestFlight 上传。
- `MIAOXUN_DOTENV_ENABLED=false ./scripts/check-repository.sh`、`git diff --check` 通过，RN 130 套、1619 项。正式工作树原有改动保留。

#### 2026-11-23 Build 69 与线上配套复核

- 补读 11 月 20 日 18:30 的 Organizer 交付日志。正式 1.0（69）已上传成功，零错误、仅 `ITMS-90725` 一条 SDK 提示，三项 dSYM 警告均未再出现。归档包含聊天搜索、转发和语音播放入口，配置正式 HTTPS。配对 iPhone 14 Pro 实读正式 1.0（69）。当前 TestFlight 测试组状态没有实读。
- 生产 `GET /api/health`、`GET /api/ready`、`GET /admin/` 均 200，匿名 `GET /api/me` 401。使用无授权空请求和合成 ID 核对路由，普通消息 POST 返回 401，搜索、转发、翻译和语音转写四条 POST 均 404。同样请求在隔离候选四条均 401，隔离服务已停止。这次核对确认线上缺对应路由，公开就绪响应未提供精确迁移号。
- 正式工作树仍含未提交和未跟踪改动。复跑 `MIAOXUN_DOTENV_ENABLED=false ./scripts/check-repository.sh` 和 `git diff --check` 均通过，RN 130 套、1617 项。下一步冻结完整配套候选，以同一制品演练 061 → 071、恢复和旧客户端兼容，再安排生产切换。旧 061 程序无法直接接已升级的账本。翻译和已发语音转写维持关闭，客户端需区分功能未开放与原消息不可用。已装 Build 69 可用于真机复验语音出声与打断、二楼进出和相册保存，A09 仍待验。 [部署顺序](../deployment.md#发布与启动顺序)

#### 2026-11-23 聊天语音播放复验

- iPhone 17 模拟器（iOS 26.5，独立 QA 1.0（71））以回环隔离 API 上传并发送 4.55 秒合成 AAC，上传和消息创建均 HTTP 201，附件读取 HTTP 200。XCUITest 从聊天页点语音条，进入「停止语音播放」，约 5 秒后恢复普通播放按钮，未进入重试状态。此次从 UI 确认播放正常结束，未采集扬声器输出。语音定向 Jest 6 项通过，隔离 API 和 PostgreSQL 已停止。证据：本地 `/private/tmp/miaoxun-nov23-voice.eGv9gzUg/playback.xcresult`。
- `devicectl` 读到配对 iPhone 14 Pro 当前安装正式 1.0（69）。未在该设备发送或点播消息，实际扬声器出声待验。Android 沿用 11 月 19–20 日模拟器点播证据。

#### 2026-11-20 TestFlight 上传警告处理

- 用户截图确认上传记录中 Build 66、67、68 已完成且带黄色警告，65 已完成。66–68 的 Apple 上传日志均含 `ITMS-90725`，归档采用 iOS 26.5 SDK，2027 年 4 月起需使用 Xcode 27 所带的 iOS 27 或更新 SDK。65 的本地上传回执已有三个框架缺 dSYM 的 Organizer 警告。本机 macOS 26.4、Xcode 26.6，用户选择暂缓升级。App Store Connect 站点权限拒绝读取，黄色标记详情尚未实读。
- 在正式工作树用 `xcodebuild` Release 归档当前源码，命令行覆盖本地候选号为 69。新增 `bash scripts/prepare-ios-archive-symbols.sh <archive> [symbol-download-directory]`，用官方锁定版本的符号包补齐 React、ReactNativeDependencies 和 Hermes，包 SHA-256 与 App 及三个框架的 arm64 UUID 全部匹配。复跑结果一致，损坏缓存被拒，`codesign --verify --deep --strict`、正式 HTTPS 配置校验、整仓检查和 `git diff --check` 通过。归档、符号包和证据保存在本机 `~/Library/Application Support/MiaoxunReleasePreparations/upload-warnings-20261120`。 [归档操作说明](../ios.md#上传警告检查)
- 命令行 App Store 导出因本地没有 Distribution 签名身份失败。复查 Build 68 的 Organizer 日志确认曾使用 Apple 云端分发签名。将本地 1.0（69）复制到 `~/Library/Developer/Xcode/Archives/2026-11-20`，核对签名及四份 dSYM。后续 Organizer 上传已成功，结果见 11 月 23 日复核。

#### 2026-11-20 会话内查找聊天记录及转发

- 单聊、群聊可通过「聊天设置 → 查找聊天记录」搜索当前会话正文。结果含发送人、日期和片段，可分页，点选返回并标亮原消息。关键词通过认证 POST 正文传递。搜索只覆盖当前账号可见历史，排除撤回、删除和工作区贡献等受保护内容。隔离 PostgreSQL 18.4 与 Linux PostgreSQL 16.15 各通过 7 项专项、零跳过，覆盖权限、字面匹配、精确分页和真实数据库锁超时。搜索专项已接入 CI。 [搜索接口](../api/chat-message-search.md)
- 长按普通消息可转发到另一个单聊或群聊。支持文字、图片、语音和文件，确认目的会话后发送。媒体复制到目标消息授权的新附件并计入转发人额度。同键重试复用回执，已转发的副本可按目标会话规则单独撤回。隔离 PostgreSQL 18.7 群聊与转发专项 21 项通过、零跳过，覆盖并发重试、越权、配额、字节一致和失败回滚。无需数据库迁移。 [转发接口](../api/chat-message-forward.md)
- iPhone 17（iOS 26.5）隔离 QA 1.0（71）两条 XCUITest 通过。命中早于 24 条后续消息的旧内容并跳到原消息，确认文字转发，另转发合成文件并从目标会话读回正文。正式工作树整仓检查及 `git diff --check` 通过，移动端 130 套、1617 项。真机验收暂缓。
- Pixel 7 模拟器（Android 16）使用本地 QA 包和本轮源码，实测搜索并跳转旧消息，转发文字、图片、语音及文件。目标会话可以打开图片、播放语音并预览文件正文。隔离 API 和数据库已停止。
- 用户要求模拟器复测后，重新构建 iPhone 17 隔离 QA 1.0（71），使用当次合成消息验证搜索命中、跳转高亮和全新文字转发，数据库确认一个转发请求及两个会话副本。另实测文件转发和正文读取。截图发现文件预览关闭按钮贴近状态栏，补安全区及 44 点点击区后，在 iOS 重测可点关闭并回到聊天。整仓检查通过，移动端 130 套、1617 项。
- 同轮 Pixel 7（Android 16，QA 1.0（20261120）与当前 Metro 源码）重新实测搜索旧消息及文字、图片、语音、文件转发，四次均收到发送成功回执。更新安全区后重开目标文件，读回合成正文，关闭控件约 44dp 并返回同一会话。

#### 2026-11-20 聊天气泡与消息操作、后台发布预演

- 语音、纯图片和纯文件各用一层消息内容，单聊和群聊按发送人和时间分隔合并连续头像。长按正文及附件直接打开按内容筛选的消息菜单，支持回复、复制、分享、预览、保存、撤回及删除。选「妙讯工具」继续使用方向菜单。界面参考 Signal 的语音播放和消息操作、Telegram Web K 的翻译和转写入口。 [移动端说明](../../MiaoxunRN/README.md)
- 单聊和群聊新增按需翻译及语音转文字。翻译目标为 App 当前语言（中文或英文），转写由供应商识别语言。结果仅在本次打开的聊天中保留，可收起。API 按当前账号可读的原消息读取输入，对第三方仅发送选中的单条正文或语音附件。两项默认关闭，真实供应商待验证。隔离 PostgreSQL 18、正式 Express 路由与 HTTPS 供应商替身已通过合法读取、会话与附件隔离、撤回、超时等验证。iPhone 17（iOS 26.5）隔离 QA 1.0（70）从实际长按菜单取得合成译文和转写，实测译文收起。真机验收暂缓。 [API 合同](../api/chat-message-ai.md)
- Pixel 7（Android 16）使用隔离 QA 1.0（20261120）加载本轮源码，验证单层语音条、菜单和内联译文、转写。复现靠近输入栏的文字长按菜单向下裁切，调整菜单定位后，六项操作均可见，翻译可点。修复后两端模拟器复验通过。整仓 `MIAOXUN_DOTENV_ENABLED=false ./scripts/check-repository.sh` 及 `git diff --check` 通过，移动端 129 套、1613 项。
- 后台从 061 实际发布存档演练升级至 071，共新增 9 份迁移，复跑 0 新增。Linux PostgreSQL 18.7 和 pgvector 验证代表性数据或约束不匹配时停在原库，匹配时切换，回退恢复原库和见证数据。干净发布候选 `61178b5` 的原包解压运行后，浏览器复验账号权限、Agent 和产品发布同键重试、两标签页并发保存预算。后台候选包含 320 个校验文件，聊天翻译与转写另在当前工作树验证。整批证据位于本地 `/private/tmp/miaoxun-admin-061-to-071.108isJjr`，线上仍使用 061。

#### 2026-11-20 聊天交互续修与后台隔离联验

- 单聊和群聊的未发送文字及回复目标按登录会话、会话 ID 保存，关闭后重开恢复。切换账号清空。聊天设置打开对方主页后，返回原聊天。iOS 聊天与资料页共用左边缘返回，短滑或从页面中间起手留在当前页。Android 系统返回先收键盘，随后回对话列表。参考 Signal 的会话草稿保留，沿用本仓导航结构和原有 iOS 资料页边缘手势。 [移动端说明](../../MiaoxunRN/README.md)
- Android 二楼长内容区由 Kotlin 传递原生滚动边界和触摸事件，TypeScript 继续决定方向、距离、取消和返回。Pixel 7（Android 16 / API 36）隔离 QA 1.0（20261120）实测设置页未到底可正常滚动。到末尾后新起手，上滑约 99dp 留页，约 192dp 返回。二楼入口、首页及固定返回区短滑留页、长滑切换通过。系统返回和聊天草稿恢复通过，Android 真机待验。
- 聊天图片保存回执按图片隔离，菜单保存打开选中的图片。聊天图片、文件、发送预览和漫画查看器遵循系统减动。iPhone 17（iOS 26.5）隔离 QA 1.0（69）共 5 条 XCUITest 通过，覆盖聊天与资料返回、草稿、设置和注销页返回、二楼距离边界、聊天图片发送保存及漫画保存。
- 后台用同一正式树的 Vite 产物和真实 API 联验。隔离 PostgreSQL 18 加 pgvector 应用 70 份迁移，14 项数据库专项和 27 项后台单测通过。浏览器实测停用、启用、角色切换、重置密码和撤销会话。旧会话返回 401，只读管理员越权操作返回 403。Agent 与产品发布丢回执后同键重试，分别只写一条发布历史、回执和审计。两个标签页以同一版本修改不同媒体检索预算字段，数据库保留两处修改，同键重试返回原回执。修正新建账号和重置密码的临时密码提示及校验，与 API 的 8 至 128 字符和英文大小写要求一致。 [后台账号页](../../admin/src/UsersPage.jsx)
- `MIAOXUN_DOTENV_ENABLED=false ./scripts/check-repository.sh` 和 `git diff --check` 通过，移动端 129 套、1598 项。A09 继续待验，详见[设备续验](../reviews/2026-11-19-ticket-acceptance.md#11-月-20-日-qa-69-续验)。本轮候选仅在本地与隔离环境验证。

#### 2026-11-20 二楼防误触与交互复核

- 用户反馈正式 1.0（68）有震动，但下拉较短就容易进入二楼。源码中进入距离可低至 72pt，常规配置为 96pt，退出默认为 88pt。本地候选将下拉进入、底部返回区、末尾内容区的最低松手距离分别调到 140pt、128pt、160pt。列表起手、识别及松手均核对顶部。下拉页面位移按手指距离的一半计算，回拉到阈值内取消，完成切换时反馈一次触感。实现参考 AndroidX 的边缘资格、阻尼和松手判定，本轮沿用仓内手势实现。 [移动端说明](../../MiaoxunRN/README.md)
- 正式树整仓检查通过，RN 129 套共 1592 项。iPhone 17（iOS 26.5）隔离 QA 1.0（68）两项 XCUITest 通过。讯页下拉 96pt 留在原页、205pt 进入，底部返回区上滑 92pt 留在二楼、200pt 返回，二楼首页内容区上滑 120pt 留在二楼、230pt 返回。设置到注销页及两级返回通过。首次模拟器使用局域网地址无法到达 QA API，改用本机回环访问同一隔离库后复验通过。修复在本地候选，iPhone 真机手感及 A09 仍待验。
- Pixel 7（Android 16 / API 36）隔离 QA 1.0（20261120）加载正式工作树的 JS，短下拉约 101dp、底部返回区短上滑约 99dp、首页内容区短上滑约 118dp 均留在原页。对应长手势约 173dp、168dp、183dp 均切换。长设置页复现原生滚动与内容返回冲突：选择设置，滚动至注销账号下方，从页面内容再次上滑约 192dp，仍停在二楼。固定返回区可用。内容区退出仍需原生手势协调，Android 真机未验。
- App 下一轮优先收敛返回和草稿。iPhone 模拟器在普通聊天输入文字、点返回、重开同一会话，确认草稿丢失。源码中聊天全页左滑与资料页 iOS 左边缘右滑行为不同。按会话保存草稿可参考 Signal。标准页面返回可在讯页链路试用 React Navigation Native Stack。二楼长内容与原生滚动的手势冲突可用 React Native Gesture Handler 验证。媒体预览还需隔离逐图保存结果并统一系统减动。 [Signal 草稿](https://github.com/signalapp/Signal-iOS/blob/main/Signal/ConversationView/ConversationViewController.swift#L507) · [React Navigation 原生栈](https://github.com/react-navigation/react-navigation/blob/3bbbf6402663c8b1927060fc026d4bb39f285ac2/packages/native-stack/src/views/NativeStackView.native.tsx#L476-L493) · [RNGH 原生滚动组件](https://github.com/software-mansion/react-native-gesture-handler/blob/c09aaa6af4d4e9f5189247b59f72d5124b3911f2/packages/react-native-gesture-handler/src/v3/components/GestureComponents.tsx#L46-L113)
- 后台正式入口可访问，账号、发布、任务、监控、媒体检索接口在未认证时拒绝访问。本地后台 27 项单测和 5 套 Chromium 浏览器脚本通过，覆盖账号确认、任务重试、发布、监控、媒体检索控制和诊断。线上后台仍用 061 基线。下一轮以同一候选版本配对验证后台前端、API 和迁移，重点走通管理员账号变更与审计、Agent 和产品发布后重试、媒体检索并发保存与预算审计。

#### 2026-11-20 Build 68 安装核查与回归

- Mac 通过 `devicectl` 读到 iPhone 14 Pro（iOS 17.6.1）已安装正式妙讯 1.0（68），独立 QA 1.0（64）同时在机。App Store Connect 仍受已保存的站点权限限制，Apple 处理、出口合规和测试组状态待核对。生产 `/api/ready` 返回 200。
- Build 68 发布快照 `33de46e` 的启动、导航、资料页、语音与图片定向测试 39 项通过。同快照构建独立 iPhone 17 模拟器包 1.0（68），使用隔离数据执行 2 条 XCUITest，通过聊天图片保存和发送、设置与注销页返回及二楼上滑。实际 VoiceOver 播报、读屏手势和焦点仍待验，Android 未发现已授权真机。**A09 待验。** [验收报告](../reviews/2026-11-19-ticket-acceptance.md#11-月-20-日-build-68-续验)

#### 2026-11-19 开机动画细调

- 用户已确认三行逐渐出现的方案。保留「妙讯，」「与你一起成长的」「数字身份」，降低字重与上移幅度，缩短行间间隔，启动完成后淡出到目标页。iPhone 17（iOS 26.5）独立预览实测逐行淡入、登录交接与系统减动。整仓检查通过，移动端 129 套共 1592 项。iOS 1.0（68）基于 Build 67 快照追加启动改动，发布快照 126 套共 1561 项通过，Release 归档签名及正式 HTTPS 校验通过。 [移动端说明](../../MiaoxunRN/README.md)
- Build 68 已于 18:02 CST 上传并获 Apple 交付回执，上传错误为 0。仍有 React、ReactNativeDependencies 和 Hermes 框架缺 dSYM 以及未来 SDK 要求提示。App Store Connect 浏览器访问仍受站点权限约束，Apple 处理及测试组安装状态待核对。

#### 2026-11-19 移动端交互配套发布

- 线上 API 和两个 Worker 已于 17:17 CST 切换到 `mobile-interaction-20261119-38ba385`。配套改动为 Android 语音附件容器解析及扫码资料的待处理好友申请字段。新旧运行时各 309 个文件均核对哈希，61 份迁移与生产账本匹配。首次维护探测早于 Nginx 重载就绪，自动恢复原配置后重试成功。开流后 `/api/health`、`/api/ready`、`/api/agents` 和 `/admin/` 返回 200，未认证 `/api/me` 与 `/api/custom-stickers` 返回 401，两个 Worker 心跳已更新。上一个运行时及回退脚本已保留。
- iOS 1.0（67）采用独立快照 `209bcdb`，包含开机动画、身份码资料与好友、全屏扫码、语音、二楼和聊天图片，以及麦克风和照片用途说明。发布快照 RN 126 套共 1559 项通过，Release archive 严格签名校验及 App dSYM 匹配通过，Bundle 使用正式 HTTPS。17:19 CST Xcode Organizer 上传成功，回执为 `Uploaded with warnings`，错误列表为空。React、ReactNativeDependencies 和 Hermes 框架缺 dSYM，Apple 另报 SDK 提示 ITMS-90725。用户已重新登录并同意访问 App Store Connect，浏览器仍按已保存的站点权限拒绝读取。Apple 处理、出口合规及测试组可安装性待核对。A09 真机待验。

#### 2026-11-19 移动端交互调整

- 开机与登录采用「妙讯，与你一起成长的数字身份」。启动品牌图形向外展开一次，系统减动时显示静态画面，启动期间读屏焦点留在启动页。二楼切换从手指落点量到松手点，达到距离后松手触发一次轻触感。iPhone 17 模拟器核对启动、减动、二楼进出。Pixel 7 模拟器实测短拉留在对话页、长拉进入二楼、首页内容区上滑退出。Android 长内容页滚动到底后的手势及硬件触感仍待实测。 [移动端说明](../../MiaoxunRN/README.md)
- 身份码采用全屏取景。扫码后打开独立资料页，未加好友时可发申请，收到申请时可同意，已是好友可以发消息。Pixel 7 Android 16 模拟器实测首次权限、拒绝后恢复、扫码、发送及取消申请、页面与系统返回。iPhone 17 模拟器经聊天设置打开同一资料页，验证左边缘向右滑返回，短滑和从页面中间起手均留在原页。好友申请状态另用隔离 PostgreSQL 验证。 [社交关系与扫码](../social-graph.md)
- 普通单聊和群聊支持录制和播放语音消息，Agent 聊天保留转写。iPhone 17（iOS 26.5）和 Pixel 7（Android 16）模拟器均已走通上滑取消、录音发送与语音播放。Android 首次上传发现系统录音的扩展长度字段被拒绝，修正后原录音重试返回 HTTP 201，播放读取返回 HTTP 200。隔离 PostgreSQL 18 语音专项 8 项通过，覆盖单群聊、幂等和读取授权。 [聊天操作](../../MiaoxunRN/README.md)
- 聊天图片进入独立发送预览，聊天内点开大图，长按或通过图片操作菜单保存。iPhone 17 和 Pixel 7 模拟器实测系统选图、确认发送、大图查看和保存，隔离 API 上传及消息创建均返回 HTTP 201。Pixel 7 另在 MediaStore 查到新保存的合成图片，系统返回能关闭查看器和图片菜单。两端深色查看器的状态栏对比度已复核。 [聊天操作](../../MiaoxunRN/README.md)
- 正式工作树通过 `MIAOXUN_DOTENV_ENABLED=false ./scripts/check-repository.sh` 和 `git diff --check`，移动端 129 套共 1590 项通过，iOS 最终模拟器构建成功。本轮真机镜头、硬件触感、麦克风及读屏待验，A09 维持原验收状态。

#### 2026-11-19 A09 真机专项续验

- 旁白保持关闭的真机补验定位了设置与注销页「返回」的按钮角色缺失。已从正式树修复并安装新版 QA 1.0（64），同机复验两个「返回」均识别为按钮。聊天语音增加旁白双击开始及结束录音，漫画保存增加 iOS 结果播报，定向测试通过。新版真机 5 条页面用例通过，录音打断后恢复通过，连续转写首次第二轮未匹配合成短句，调整播放时序后同包两轮通过。整仓检查通过，移动端 127 套、1576 项。新版 QA 与回执已归档，隔离服务已停止。实际旁白播报、读屏手势与跨页面焦点仍待验，Android 暂停，A09 保持待验。 [验收报告](../reviews/2026-11-19-ticket-acceptance.md#ios-无障碍续验)
- iPhone 14 Pro、iOS 17.6.1、独立 QA 1.0（64）的前一轮真机 XCUITest 已通过扫码入口打开、关闭及重开，并实扫合成码打开测试账号。聊天图和漫画从页面保存、显示结果并关闭，USB 相册读回 640×440 和 768×512 两张合成图。注销页两次返回及二楼上滑回讯通过，未提交注销。
- 真机语音连续两次转写 Mac 播放的合成短句。从录制中的 QA 切到系统设置并返回后，输入栏恢复操作并重新转写成功。中断后重录第一次未匹配到测试短句，调整播放时序及返回后直接重录的步骤后通过。本轮通过恢复后重新录音确认麦克风可再次使用，先前探针已直接观察音频会话停用和监听移除。
- 系统减动已有真机回执，讯页「新建」已有用户实际听读回执。旁白保持关闭，其他控件的实际播报和跨页面焦点待验。Android 无可用真机，本轮暂停。**A09 待验。** [验收报告](../reviews/2026-11-19-ticket-acceptance.md#a09-真机专项续验)
- 本机已清理 A09 和往期妙讯 QA 的可重建构建产物。A09 的 iOS 签名包、Android APK、模拟器包、测试报告、隔离数据库及合成素材已归档到 `~/Library/Application Support/MiaoxunQA/A09-2026-11-19`。归档后已验证隔离 API 就绪和测试账号登录均返回 HTTP 200，随后停止 API 和数据库。补验时按归档内的《复测说明》启动。

此前各阶段记录如下。

- 修复包在 iPhone 上打开后显示「账号空间暂时无法同步」。Mac 隔离 API 的 20 分钟窗口已到期。用原测试库恢复 API，将本轮窗口延长至 4 小时。通过 `devicectl` 重新打开手机上的「妙讯 QA」，同一次启动的会话初始化与同步均返回 HTTP 200。随后聊天图片的鉴权下载返回 200，通过 USB 从系统相册读回本轮新增的 640×440 `A09 CHAT`。页面保存提示、关闭操作及漫画保存仍待确认。
- iPhone 旁白保持关闭，iPhone 17 模拟器（iOS 26.5，隔离 QA 1.0（64））补验了新建菜单、扫码和语音入口的按钮名称及可点状态，以及设置 → 注销页 → 设置 → 二楼的两次页面返回和上滑回讯。注销页仅打开和返回。
- 修复聊天图片和漫画预览的保存、关闭按钮被状态栏挡住的问题，聊天图片的保存结果改为在预览内显示。模拟器实点两处保存与关闭通过，系统相册新增 640×440 聊天图及 768×512 漫画图。3 条 UI 自动化用例和整仓检查通过，移动端 127 套 1572 项。 [验收步骤和证据](../reviews/2026-11-19-ticket-acceptance.md#a09-真机专项续验)
- 含两处图片预览修复的独立 QA 1.0（64）已安装到 iPhone 14 Pro（iOS 17.6.1），设备读回同时存在正式 1.0（66）。先前 Mac 远程启动超时，两处图片保存和关闭待从手机打开 QA 后复测。其他 VoiceOver 播报、焦点、语音系统打断和真机页面手势待验。Android 暂停，A09 整体仍待验。
- iPhone 旁白实测已取得一项回执。用户聚焦讯页右上角按钮时听到「新建」，与源码的默认辅助功能标签一致。用户随后关闭旁白。其他按钮的播报、跨页面焦点和返回手势仍待验。[旁白记录](../reviews/2026-11-19-ticket-acceptance.md#a09-真机专项续验)
- 系统减动开启后的 iPhone 真机复验通过。iOS 与 React Native 均识别为开启，启动和二楼设置入场动画跳过。设置、注销页与两级返回均收到原生展示或关闭回执，操作由临时探针触发原回调。已装回常规 QA 64，冷启动恢复会话返回 200。VoiceOver 播报、焦点及实际手势仍待验。[减动证据](../reviews/2026-11-19-ticket-acceptance.md#a09-真机专项续验)
- iPhone 14 Pro QA 1.0（64）续验取得真机回执。底层音频引擎两轮均成功启动并在取消后释放，设置和注销页原回调均收到系统展示或关闭回执。完整语音识别、原页面点按、VoiceOver、减动和手势继续待验。[验收证据](../reviews/2026-11-19-ticket-acceptance.md#a09-真机专项续验)
- 恢复本机设备访问后，隔离 API 就绪 HTTP 200。相机权限关闭时，同一部 iPhone 两次拒绝扫码，两个请求均结束。用户重新开启 QA 相机权限后，相机会话启动、取消后重开，实扫合成码后隔离 API 返回 HTTP 200，App 收到测试账号主页。相机权限恢复链路通过，聊天列表入口点按待验。已装回常规 QA 64，冷启动恢复会话 HTTP 200，设备同时查到正式 66。
- 后续尝试减动复测时，iPhone 在重装诊断包及常规 QA 64 后均拒绝启动 QA，报 CoreDevice 10002 Security。Mac 对两份包的严格签名校验通过，开发描述文件未过期，设备开发者模式开启。常规 QA 64 已装回，需在 iPhone 上确认实际提示。有「验证 App」入口时先完成设备端验证，再重跑减动和读屏。[验收记录](../reviews/2026-11-19-ticket-acceptance.md#a09-真机专项续验)
- 用户确认 iPhone 反复弹出「无法验证 App」，取消后再次出现。Mac 未发现运行中的安装、启动或测试进程，已暂停 A09 启动操作。先恢复手机主屏幕可用，再核对设备端开发者 App 验证状态。
- 用户确认设备恢复后，登录提示无法连接。原 20 分钟隔离会话已到期，Mac 的 QA 端口没有监听，启动原隔离库和 API 后，iPhone Safari 就绪探针、QA 测试账号登录及会话初始化均返回 HTTP 200。重新安装常规 QA 64 并冷启动，恢复会话返回 200，正式 66 仍在。减动和读屏待验。
- iOS 真机相册落盘与读回通过。用户允许仅添加照片后，QA 64 的临时探针通过两条原保存桥接下载合成聊天图与漫画图，均 HTTP 200。PhotoKit 确认写入两个资产，USB Image Capture 从同一台 iPhone 读回两张照片，图中文字与 640×440、768×512 尺寸均匹配。已装回测试前的 QA 64，冷启动恢复会话 HTTP 200，正式 66 保留。页面保存按钮仍待实测。解锁状态下重跑 XCUITest 仍在启用自动化时超时，Accessibility Inspector 也没有可用远程 App 目标。相机、语音、读屏、减动和返回手势仍待验。逐项证据见[验收报告](../reviews/2026-11-19-ticket-acceptance.md#a09-真机专项续验)。
- iPhone 登录复验已通过。先前请求到达隔离 API 并返回 401。使用预置合成账号，从临时 QA 包调用原登录表单的提交函数，真机登录与会话初始化均返回 200。已装回测试前的 QA 1.0（64），冷启动恢复会话返回 200。正式 1.0（66）保留。A09 后续功能仍待验。
- iOS QA 登录首测提示网络连接失败，隔离 API 在线且未收到登录请求。iPhone 上的原生探针在 QA 1.0（63）复现 IP 地址 `NSURLErrorDomain -1009` 和 `.local` 地址超时。临时 QA 1.0（64）加上独立显示名称和本地网络用途说明后，在同一设备用 App 进程访问两种地址均得到 HTTP 200。设备实读独立 QA 64 与正式 66 并存。当前等测试账号从 App 登录页复验，根因具体到本地网络权限或连接状态仍待确认。[网络复验](../reviews/2026-11-19-ticket-acceptance.md#a09-真机专项续验)
- iOS 独立 QA 已签名、通过 `codesign --verify --deep --strict`、安装并启动。`devicectl` 确认 iPhone 14 Pro（iOS 17.6.1）上同时有 QA 1.0（63）和正式 1.0（66）。Xcode 图形界面已有开发团队，并取得团队 Development 描述文件，随后正式工作树命令行构建成功。等待手机端用隔离测试账号登录和人工实测，A09 仍待验。[安装证据](../reviews/2026-11-19-ticket-acceptance.md#a09-真机专项续验)
- **A09 待验。** 当前树独立 QA 包都完成了构建阶段的核对。iPhone 14 Pro、iOS 17.6.1（21G93）已配对，现装正式 1.0（66）保留。iOS QA 1.0（63）无签名编译通过，签名缺少 `com.wangruoshi.miaoxun.qa` 开发描述文件。Android QA 1.0（20261119）APK 构建和签名验证通过，尚无已授权的 ADB 真机。
- 用户确认 Android 暂无真机，本轮暂停 Android。iPhone 已通过 USB 连接并解锁，真机 Safari 请求隔离 API 就绪端点得到 HTTP 200。现有描述文件仍只覆盖正式 Bundle，独立 QA 安装待签名。两端 App 登录、相机、语音、落盘、读屏、减动和返回均待真机验证。逐项预期、构建和验证命令见[真机验收报告](../reviews/2026-11-19-ticket-acceptance.md#a09-真机专项续验)。
- 用户已授权独立 QA Bundle 的 Xcode 自动签名。添加 `-allowProvisioningUpdates` 重构建退出 65，Xcode 报 `No Accounts`。已打开工作区，待用户在 Xcode 的 Settings → Accounts 登录有开发团队权限的账号后重跑。QA 尚未安装。

#### 2026-11-19 返工后的独立复验

- A02、A06、A13、A16、A17 的本地关闭条件已独立通过，整仓复跑退出 0。数据库、客户端、恢复演练结果见[独立复验](../reviews/2026-11-19-ticket-acceptance.md#返工后的独立复验)。
- A09 剩双端真机验收。准备能安装到测试 iPhone 的隔离 QA 签名包及已授权的 Android 真机，连接本地测试服务，记录相机、语音、相册、读屏和返回手势结果。

#### 2026-11-19 独立验收返工与补验

正式工作树 `/Users/gary/.codex/worktrees/admin-lifecycle-release/marvelsChat`，分支 `codex/ui-agent-candidate-20261105`。依据[独立验收第一张表](../reviews/2026-11-19-ticket-acceptance.md)，原有协作修改和未跟踪文件已保留。此次执行限本地和合成夹具。

| 工单 | 状态 | 原问题、修改文件及证据 |
| --- | --- | --- |
| A17 | 已通过 | 创建接口忽略请求键，丢回执后的重试会新建。App 在同一创建表单复用键，主动新建分配新键。PG 验到两连接同键并发只写一条相册和使用事件，丢回执后返回原相册，改参 409，新键同名成功。软删、硬删后同键 410，未复活相册。改动见 [StationCreateSheet](../../MiaoxunRN/src/features/station/StationCreateSheet.tsx)、[StationScreen](../../MiaoxunRN/src/features/station/StationScreen.tsx)、[SecondFloorAlbums](../../MiaoxunRN/src/features/second-floor/SecondFloorAlbums.tsx)、[useStationActions](../../MiaoxunRN/src/features/session/useStationActions.ts)、[stationContentApi](../../MiaoxunRN/src/services/api/stationContentApi.ts)、[路由](../../backend/src/routes/station-album-routes.js)、[仓储](../../backend/src/station-library-repository.js)、[迁移 071](../../backend/database/071_station_album_submissions.sql)、[数据库合同](../database.md)及[小站页面测试](../../MiaoxunRN/__tests__/stationModuleManagement.test.tsx)、[客户端合同测试](../../MiaoxunRN/__tests__/stationContentContract.test.ts)。API 使用新回执表，启动候选 API 前需完成 071。 |
| A06 | 已通过 | 执行完成仍等待永久挂起的续租。现在结束时取消，5 秒上限覆盖客户端、续租连接池等待和数据库语句。获得行锁后重新检查租约。永久挂起替身从启动到停机约 5 毫秒，回环 TCP 握手无响应时续租池约 5 秒关闭。真实 PG 行锁验证了超时、取消、跨到期点及旧凭据回写拒绝，恢复后的任务不会再次领取。改动见[运行器](../../backend/src/ai-task-runner.js)、[数据库连接](../../backend/src/db.js)、[仓储](../../backend/src/ai-task-repository.js)、[运行器测试](../../backend/test/ai-task-runner.test.js)、[HTTP 集成](../../backend/test/ai-task-integration.test.js)、[仓储集成](../../backend/test/ai-task-repository.integration.test.js)和[部署文档](../deployment.md)。 |
| A02 | 已通过 | DELETE 提交成功但回执丢失时旧登录界面可能残留。App 现在显示待确认，用发起账号的原凭据调用 `GET /api/me`。会话仍有效时可复核后重新确认操作，401 清除旧登录并保留待确认提示，切换账号会丢弃旧结果。提交前断线、提交后丢响应、普通撤销、切换账号及冷启动均有回归。待确认提示在当前进程内保留，冷启动单独验证原凭据。改动见[会话](../../MiaoxunRN/src/features/session/useMiaoxunSession.ts)、[注销页](../../MiaoxunRN/src/features/settings/DeleteAccountSheet.tsx)、[登录页](../../MiaoxunRN/src/features/auth/AuthScreen.tsx)、[应用入口](../../MiaoxunRN/src/App.tsx)、[弹窗](../../MiaoxunRN/src/app/AppModals.tsx)、[应用 API](../../MiaoxunRN/src/services/api/appApi.ts)、[登录 API](../../MiaoxunRN/src/services/api/authApi.ts)、[回归测试](../../MiaoxunRN/__tests__/sessionSync.test.tsx)和 [RN 文档](../../MiaoxunRN/README.md)。 |
| A13 | 已通过 | 恢复曾只打印行数，对完全缺失的约束没有期望清单。现在必须提供同一归档 SHA-256 和迁移版本绑定的审批 TSV，比对六张表的行数和 public 表约束。一次性无网络 Linux、PG18.7、pgvector 0.8.7、合成 070 归档和 1,296 条约束完成匹配切换与回退。少一条素材、缺相册外键和错误归档审批均被拒，原库 OID 和见证数据保持可读。停服状态由夹具模拟。改动见[恢复脚本](../../scripts/restore-production-database.sh)、[演练脚本](../../scripts/check-database-restore.sh)、[部署测试](../../backend/test/self-hosted-database-deployment.test.js)、[数据库说明](../database.md)、[备份说明](../database-backup.md)和[恢复手册](../database-recovery-owner-guide.md)。 |
| A16 | 已通过 | 独立验收缺少加入素材与删相册的并发证据。新增[隔离 PG 测试](../../backend/test/station-albums-postgres.test.js)，两连接分别执行业务事务，第三连接安排锁顺序。先加入时两份素材随相册隐藏，两对象进入清理清单。先删除时加入返回 404，游离素材保持原归属和本人可见，清单仅含原相册对象。此次只补测试。 |
| A09 | 待验 | 原缺口是双端物理功能实测。`xcrun devicectl device info details` 和 `device info apps --bundle-id com.wangruoshi.miaoxun` 读到 iPhone 14 Pro、iOS 17.6.1（21G93）、现装 1.0（66）。尝试 `xcodebuild -workspace MiaoxunRN/ios/MiaoxunRN.xcworkspace -scheme MiaoxunRN -configuration Debug -destination "platform=iOS,id=$device_id" PRODUCT_BUNDLE_IDENTIFIER=com.wangruoshi.miaoxun.qa MIAOXUN_API_BASE_URL="$isolated_origin" build`，退出 65，缺独立 QA Bundle 的 iOS 开发描述文件。现装 Build66 保留。Android 用本机 SDK 的 `adb devices -l` 返回空列表，机型、OS、构建均无实测记录。双端的相机权限与扫码、语音打断、系统相册落盘、读屏和返回手势全部待真机跑。 |

本轮回归命令及口径

- A17、A06、A02、A16 的共同 PG 回归在合成 `*_migration_test` 回环库运行。从空库 `npm run db:migrate` 应用 70 份迁移，再跑一次为 0 新增、70 不变。`cd backend` 后运行 `MIAOXUN_DOTENV_ENABLED=false NODE_ENV=test DEFAULT_ADMIN_ENABLED=false RUN_AI_TASK_INTEGRATION=1 RUN_ACCOUNT_STORAGE_CLEANUP_POSTGRES=1 node --test --test-concurrency=1 test/ai-task-integration.test.js test/station-albums-postgres.test.js test/account-storage-cleanup-postgres.test.js test/account-deletion.test.js test/ai-task-runner.test.js`，41 项通过，零失败、零跳过。`DATABASE_URL` 指向本次临时库，测试结束销毁。
- A17 App `npm --prefix MiaoxunRN test -- --runInBand stationModuleManagement.test.tsx stationContentContract.test.ts secondFloor.test.tsx stationTabLifecycle.test.tsx agentWorkspace.test.tsx`，5 套、85 项通过。小站套件有既有 `act()` 警告。
- A02 App `npm --prefix MiaoxunRN test -- --runInBand --silent __tests__/sessionSync.test.tsx`，53 项通过。已提交但响应中断由请求边界夹具模拟，账号级联删除及旧会话撤销由隔离 PG 回归验证。
- A06 仓储 `cd backend` 后运行 `MIAOXUN_DOTENV_ENABLED=false DEFAULT_ADMIN_ENABLED=false NODE_ENV=test RUN_AI_TASK_REPOSITORY_INTEGRATION=1 node --test test/ai-task-repository.integration.test.js`，用 `AI_TASK_REPOSITORY_DATABASE_URL` 指向另一空的回环 `*_migration_test` 库，12 项通过、零跳过。
- A13 `./scripts/check-database-restore.sh` 及 `MIAOXUN_DOTENV_ENABLED=false node --test backend/test/self-hosted-database-deployment.test.js` 分别退出 0，后者 7 项通过、零跳过。两份脚本均通过 `bash -n`。
- 整合树 `MIAOXUN_DOTENV_ENABLED=false ./scripts/check-repository.sh` 退出 0。RN 127 套、1,571 项，Backend 1,159 项通过、432 项按环境跳过，Agents 59、Admin 27、3D Web 37、检索 Web 13 项通过。`git diff --check` 退出 0。
- 下一步为独立签名的 iOS QA 包和接入 Android 真机，使用隔离数据逐项补齐 A09。

#### 2026-11-19 工单实现后的独立验收

- 按原 A01 至 A23 核对本地整合树；整仓退出 0，独立 PG、浏览器和离线专项详见[验收结果与返工提示词](../reviews/2026-11-19-ticket-acceptance.md)。相册同键重试和 Worker 续租挂起已复现。注销丢回执及恢复切换前的摘要比对需补处理。
- 下一轮只处理 A17、A06、A02、A13 的剩余场景，补 A16 同时加入/删除的并发测试和 A09 双端真机记录。其他工单按已有本地证据交接。

#### 2026-11-18 续验与后台清理

- 完整容器镜像通过。用仓库原始 `backend/Dockerfile` 构建本地 arm64 `miaoxun-backend:local-070`，Debian FFmpeg 依赖下载及安装成功，`./scripts/check-backend-image.sh` 退出 0。镜像内的实际媒体检索代码用 FFmpeg 和 FFprobe 从 4 秒合成 MP4 提取 0、1、2、3 秒处的四张 WebP。
- 隔离 Compose 从空 PG18 应用 69 份迁移，API ready 200，API 与两个 Worker 均健康。分别暂停进程后，只有对应 Worker 变为不健康，恢复后重新健康。验证网络禁用外部访问，临时容器与数据库已清理。
- 后台 A15 清理完成。旧 DOM 样式、请求、路由、权限、渲染组件及页面模块共 16 个实现文件和 4 份旧测试退出引用链。保留的 `app-shell.js` 负责实际 React 挂载；媒体控制版本校验由正式页面消费。旧测试仍有效的角色、运营、发布与媒体控制断言迁入正式页面验证。独立的构建引用复核只找到正式 React 运行链及 Vite 配置。
- 正式后台请求校验 API 路径并附带请求编号，20 秒截止覆盖响应体。任务失败可在确认框沿用原键重试；媒体控制缺少服务端版本时显示错误并停用保存。后台 27 项单测、Vite 构建、5 个 Chromium 脚本通过，浏览器回归已接入 CI。
- Android 使用独立 SDK 安装目录和隔离构建配置，`assembleDebug` 完成四个 ABI 的 Debug APK 编译。Pixel 7 API 36 隔离模拟器完成安装、冷启动、登录和扫码异常实测。拒绝相机权限后返回聊天，再次打开会重新请求权限；授权后无镜头时退回聊天，再开扫码仍能启动。系统返回能关闭操作菜单。
- iOS 26.5 使用隔离 Bundle 和本地 API 构建、启动和登录，打开有 3 条未读的单聊并切换免打扰，后端回读未读 0、免打扰关闭、偏好版本 2。已配对 iPhone 当前断开，未发现 Android 真机。双端实际镜头、媒体保存、音频打断和辅助功能仍待真机验收。
- 清理完成后整仓 `MIAOXUN_DOTENV_ENABLED=false ./scripts/check-repository.sh` 退出 0，RN 127 套 1,563 项、Backend 1,157 项通过及 425 项环境门控跳过、Admin 27 项。续验后的 `git diff --check` 通过。

#### 2026-11-18 指定工作树本地修复

工作树为 `/Users/gary/.codex/worktrees/admin-lifecycle-release/marvelsChat`，分支为 `codex/ui-agent-candidate-20261105`。已有改动和未跟踪文件保留。当前候选有 69 份迁移文件，最高编号 070，原有 064 空号保留。PG18 的空库迁移和带真实历史漂移的 `backend/scripts/check-migration-replay.sh` 均通过，复跑 0 新增、69 不变。

| 工单 | 本地状态与证据 |
| --- | --- |
| A01 | 后台状态、角色、密码和撤销会话提交与审计同事务，确认失败保留输入。同键重放返回原回执，实时投递复验会话。隔离 PG、实时网关与 React 浏览器账号确认通过。 |
| A02 | 注销受理与账号级联删除、清理清单同事务，旧凭据随提交失效。返回 `cleanupStatus`；对象延迟清理，逐项可恢复。隔离 PG 验证中途失败、重启续跑、旧凭据和其他账号的共享对象。 |
| A03 | Release/Product 转换记录原版本回执，事务内保存状态和审计。隔离 PG、离线重放和 React 发布确认通过。Chromium 覆盖 503、丢回执同键重试、切换版本重新确认、忙碌防重复与取消焦点恢复，页面错误为零。 |
| A04 | 好友请求创建与处理按账号对串行锁定，通知随事务提交。隔离 PG 覆盖并发请求、接受/拒绝及通知回执。 |
| A05 | 后台漫画取消、重试按当前任务版本和原请求核对，App 能读完整画格事件。定向 26 项通过，真实生图供应商待验。 |
| A06 | AI 单 claim 至多一条在途续租，失去 claim、停止或离开执行阶段后停止发起续租；媒体空闲轮询解绑监听。Worker 定向套件通过，慢续租及 50 轮空等夹具分别测得峰值 1 和剩余监听 0。 |
| A07 | 已读以所见消息为边界保留后续投递，免打扰按账号及会话排序并丢弃过期回执。群聊隔离 PG 和 RN 定向通过。 |
| A08 | 妙页任务打开对应的私有建站草稿，处理失效/无权访问和切换账号。RN 导航与权限定向通过。 |
| A09 | Android 扫码启动、绑定异常释放请求，八个 RN 弹窗接通 Android 系统返回。首次 iOS 26.5 Simulator Debug 构建通过，首次 Android SDK 缺失已解决。双端编译和模拟器实际操作见上方续验。 |
| A10 | 监控使用独立窗口去重人数，隔离 PG 验到 201 位用户、200 名排行。React Chromium 两种宽度通过切换、加载、失败重试和真实零值。 |
| A11 | 3D Web 四视图可原位读取重试，取消失败可见；RN 轮询丢弃迟到结果。Web Vitest 37 项及 Chromium Playwright 30 项通过，RN 同轮定向通过。 |
| A12 | 检索 Web 局部刷新保留输入节点、选区、IME 和焦点；账号切换回收迟到图片。13 项测试、构建和 Chromium 320/1440 验证通过。 |
| A13 | Linux PG18/pgvector 合成归档先恢复候选、核对审批版本账本，再事务换名。正常切换回退、目录可读但数据损坏、账本缺项、预备事务使切换失败，均验证原库安全；系统服务前置由停服夹具模拟。 |
| A14 | CI 四组独立 PG 套件在完整 070 数据库本地通过 48 项，零跳过。首次 Debian 下载失败时使用隔离镜像核对 Worker 探针，随后完整镜像和 Compose 复验已通过，见上方续验。原隔离启动器识别默认端口占用，临时副本改用独立端口从空库完成启停、重启及 ready 200，合成 `.env` 的 SHA-256 不变。 |
| A15 | 后台分两轮完成旧入口和旧模块清理，旧请求实现及其消费者已移除，正式 React 路由覆盖结果见上方续验。RN 十个测试可达候选保留，发布打包测试通过。 |
| A16 | 小站删除事务同时登记对象清单，排序锁协调相册加入与删除。重复请求复用记录，已删素材从关联读取隐藏，待上传键延迟处理。隔离 PG 验证移动、重复删除、其他账号、清单与使用事件。 |
| A17 | 二楼手稿使用稳定保存键。隔离 PG 验证同键并发、提交后重放、改参冲突、空正文及事件失败回滚。相册、素材、日记、搭配用真实 HTTP 路由断言事件失败时业务无写入，恢复后各一次写入。 |
| A18 | 协作相册节点分别公开授权、索引、服务失败与真实空结果状态；定向覆盖 8 类结果。 |
| A19 | 聊天相册预览按选择和关闭失效前一请求，RN 乱序回执定向通过。 |
| A20 | 隐私写入按当前账号串行，旧回执被隔离。RN 定向和隔离 PG 小站访问验证通过。 |
| A21 | 3D 四视图和模型的数据库 lease 挡掉新旧执行器争抢，过期提交不重放。隔离 PG 与运行器 12 项，含 51 个对象越页清理与续跑。 |
| A22 | 上传回执、索引任务和 run 归属原子关联，删除用迁移 070 收敛已取消的 upload run。隔离 PG 12 项，并验证旧孤立无费用 run 迁移后进入 blocked。 |
| A23 | 检索后台控制按字段版本并发更新，预算、审计与幂等回执同事务。隔离 PG 覆盖不相交修改、冲突、回滚及重放，React 浏览器通过 503、丢回执和原键重试。 |

移动端合同、设备限制与清理候选依据见[移动端复核](../reviews/2026-11-18-mobile-concurrency-and-native.md)。3D 客户端重放与 Worker 合同见[3D 提交合同](../api/avatar-3d-submissions.md)。手稿保存和恢复操作分别见[文件合同](../file-processing.md)与[恢复手册](../database-recovery-owner-guide.md)。

- 整仓 `MIAOXUN_DOTENV_ENABLED=false ./scripts/check-repository.sh` 通过，包含 RN 127 套 1,563 项、Backend 1,157 项及 425 项环境门控跳过、Agents 59、Admin 48、Avatar Web 37、检索 Web 13。四个独立 PG CI 套件分别通过群聊 16、表情 7、AI 任务 17、3D 提交 8，均无跳过。另跑账号注销、小站删除、文件提交、四类小站创建事务 4 项及各工单专题。

发布状态仍以此前 061 / Build66 记录为准。该阶段后补的镜像、后台和设备证据见上方续验。

#### 2026-11-18 全仓审查派单

- 已盘点正式树 1,457 个文件，并检查 984 个 JS/TS 文件的语法与相对引用。离线复现了注销部分删除、产品暂停后的审计失败、Worker 续租积压与空轮询监听累积。源码定位、设备待验范围及历史证据见[全仓审查报告](../reviews/2026-11-18-project-audit-dispatch.md)。
- 正式树已完成本轮模块级源码审查，可以开始本地修复。[执行结论](../reviews/2026-11-18-project-audit-dispatch.md#执行结论)与[23 份提示词](../reviews/2026-11-18-implementation-prompts.md)记录优先级、并行边界和验收。末轮整仓退出 0；真实隔离 PG 复现 3D 双执行器提交回执丢失。真机、真实供应商及生产继续分别验收。

#### 2026-11-18 正式开发树跨端质量整理

- iOS 26.5 独立模拟器实测原生相册模块：添加照片权限下，小站和聊天图片均回执成功，DCIM 实增两张且尺寸匹配；损坏图没有新增文件。使用临时 UIKit 壳和合成图片。端到端 App 点按及实体 iPhone 验收待补。

- 第二轮补丁与后续修复均已应用到正式开发树本地。后台账号确认失败保留输入，3D Web 同标签刷新恢复，RN 主页、扫码、好友会话及搜索拒绝过期回执。最终整仓退出 0，RN 125 套 1,554 项、Backend 1,154 项通过及 412 项门控跳过、Agents 59、Admin 53、Avatar Web 34、检索 Web 13；隔离 PG18 的 Worker 与 3D 专项及真实 Chromium 验证见[第二轮源码审查](../reviews/2026-11-18-source-quality.md)。

- 第二轮针对代码自身的并发、生命周期与合同重复进行审查。3D 两端按原提交键核对，Worker 隔离异常队首，iOS 漫画保存等待真实回执，后台列表丢弃过期读取，检索 Web 使用共享状态合同。复核方式、剩余结构问题与设备验收见[第二轮源码审查](../reviews/2026-11-18-source-quality.md)。

- 本地候选修复 App 会话恢复和减少动态效果、Android 拍摄和语音、iOS 录音、后台请求合同与键盘详情、检索 Web 账号切换及注销。删除已退出小站入口的滚动组件、专属样式与测试；修正跨套件的 Worker 测试数据清理。各模块的处理依据和复核方式见[质量检查](../reviews/2026-11-18-project-quality.md)和[开发规范](../development-standards.md#模块链路与验收)。
- 整仓检查通过，RN 122 套 1,542 项，Backend 1,153 项通过、410 项默认跳过。61 项迁移回放、两组 HTTP 集成、79 项隔离 PostgreSQL 专项通过；Chromium 验证后台五类详情和检索 Web 两种宽度。下文 Build66 和生产 061 是此前发布记录。
- 本轮审查提出的后台账号事务、聊天静音和已读回执、旧后台入口及设备问题，后续结果见上方指定工作树本地修复。

#### 2026-11-18 聊天媒体配套生产061已开流，Build66正在测试

- 用户明确授权既定维护/停写备份恢复演练/061迁移/309文件候选切换及验证后开流。现行runtime为`chat-media-20261117-43bbe01`，001–061及checksum全部匹配；2026-11-18 09:40 CST开流完成。API/双Worker同源、active/running零重启，AI真实子进程poll及AI/media心跳推进；备份timer已恢复，原Nginx/env保持字节一致，维护marker已移除。
- 原v2隔离演练已提交061，但`name[]`与JS数组类型比较误判触发器，生产门禁正确停止在旧060并保留维护。v3改为JSON聚合，精确校验不放宽；补严格原回执验证与独立rehearse/resume命令，Python33/JS6和独立审查通过。原79张表数据/序列/权限/schema不变、两新表为空、隔离PG18已停止；生产单事务061、独立只读validate、open均通过。原失败证据保留。
- 公网health/ready/agents/admin200，公开目录9项，漫画0.1.6/UI Agent0.1.0保持published；未认证custom-stickers/me401，共享路由边界保持。registry/release/product及用户授权完整指纹不变。没有模型调用、测试业务写入、Agent发布或代用户授权。
- Build66已由Organizer成功上传，实屏/官方日志/元数据均确认1.0(66)、09:20 Uploaded with warnings、errors为空；实际分发重签名严格验证通过。90725为未来SDK要求，既有框架dSYM缺失限制保留。用户处理后，App Store Connect实读Build66为「正在测试」，群组栏列出内部及外部两个 `yunzhi` 组。Mac发现配对iPhone 14 Pro，读取妙讯版本时设备锁屏，真机安装和功能验收仍待核实。同期公网ready为200、Agent目录9项，漫画0.1.6及UI Agent0.1.0仍为published。
- 本轮更新部署与验收文档，未新提交/推送，保留全部既有修改。完整证据和剩余项见[本次部署与上传](../reviews/2026-11-18-chat-media-production-build66.md)。新鲜`MIAOXUN_DOTENV_ENABLED=false ./scripts/check-repository.sh`退出0：RN122套/1534项、Backend1153通过/410项PG环境门控跳过、Agents59、Admin52、avatar-web29、检索Web4；格式/lint/类型/构建及`git diff --check`通过。410项默认跳过不计PG通过；本次PG18停写恢复/061升级与生产验证另有实际回执。
