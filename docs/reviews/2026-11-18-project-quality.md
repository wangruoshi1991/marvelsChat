# 2026-11-18 正式开发树跨端质量检查

审查对象为 `codex/ui-agent-candidate-20261105` 的 `d04221f` 加已有工作区修改。桌面分支另有不同的 055 迁移。本文记录本地实现和验证，线上及已分发的构建记录见[当前交接](../handoffs/CURRENT.md)。

## 用户路径与证据

下表保留第一轮结果。3D 提交归属、漫画保存、Worker 队首隔离及检索错误展示的后续处理见[第二轮源码审查](2026-11-18-source-quality.md)。

| 用户操作 | 源码与本轮结果 | 仍需验证或补齐 |
| --- | --- | --- |
| 打开 App、恢复账号 | [App](../../MiaoxunRN/src/App.tsx) 在启动介绍结束后仍等待真实会话恢复，等待期间提供可读状态。减少动态效果时显示静态内容，偏好变化时停止既有循环。定向测试覆盖慢恢复、失败和切换偏好。 | 实体机冷启动并切换系统“减少动态效果”，以 VoiceOver 和 TalkBack 复验。 |
| 设置、漫画或发布页选择选项 | [共用分段控件](../../MiaoxunRN/src/shared/ui.tsx) 为单选组及每个选项提供角色和选中态。 | 实机确认读屏能逐项聚焦，切换后仅一个选项被选中。 |
| 从聊天、小站或头像入口拍照 | [媒体选择服务](../../MiaoxunRN/src/services/stationMediaPicker.ts) 在 Android 调起相机前请求 CAMERA 权限，普通拒绝、永久拒绝和取消分别处理。文件选择与相册保存改从当前 React context 取得 Activity。 | Android 首次安装分别检验允许、拒绝、永久拒绝、切回前台及两种取消。系统相册选择应独立于拍摄权限。 |
| 按住说话、松手取得文本 | Android 清单登记系统语音识别服务查询。iOS [语音桥](../../MiaoxunRN/ios/MiaoxunRN/QRCodeScannerModule.swift) 的录音会话移除与 `.record` 不兼容的 `.duckOthers`。使用设备 SDK 编译完整 Swift 桥及扫码控制器为 arm64 对象文件。 | 双端真机核对授权、取消、打断、音频恢复和最终识别文本。Android 编译需 JDK 与 Android SDK。 |
| 后台打开页面或提交管理操作 | [共用请求入口](../../admin/src/platform.js) 校验 JSON 的 `data` 回执，保留合法 null、空集合和错误请求 ID。ESLint 覆盖全部 Admin JS/JSX，清理 9 项告警。[详情入口](../../admin/src/components/detail-column.jsx) 支持键盘和鼠标，任务读取失败可在抽屉内重试。 | Chromium 与本地接口夹具验证用户、任务、监控、审计事件和 Agent 运行五类详情。Tab 聚焦、Enter 打开、Escape 关闭并返回原按钮。任务 GET 首次 503 后一次重试恢复，行点击仅发一次请求。其他浏览器及读屏仍待验。 |
| 选择 Agent 产品、同意授权及撤销 | 真实临时 PG 和 HTTP 覆盖 registry、release、产品、同意、精确授权、bootstrap/sync、撤权和回读。注册及资料读取在已初始化默认管家发布合同后通过。 | 账号身份、服务端权限、审批与模型质量分别验收。 |
| 发群聊消息、引用表情及撤回 | [群聊集成](../../backend/test/group-chat-postgres.test.js) 与[自定义表情集成](../../backend/test/custom-stickers-postgres.test.js) 在隔离数据库检验收件人投影、授权失败、重试、撤回及历史读取。 | 双端同一次操作的拍摄、输入、发送、显示及系统相册落盘仍需实体设备联验。 |
| 查看媒体索引进度、退出与切换账号 | [检索 Web](../../media-retrieval-web/src/main.js) 区分余量、无限额、零、未知和取消。状态不可用时可刷新，停用依赖状态的操作。退出清理私有结果与预览并请求服务端注销，注销未确认时明确提示。异步结果绑定原会话，任务事件另核对运行 ID。 | Chromium 以 1280×800 和 390×844 实测登录、刷新、503、恢复和注销。状态与账号来自本机同源夹具，两种宽度无横向溢出。账号切换时晚到的搜索、事件和预览由回归用例覆盖。生产索引、用量及供应商计费需独立验收。 |
| 在 3D Web 提交照片 | [创建流程](../../avatar-web/src/workspace/AvatarWorkspace.tsx) 创建失败后重新读取 bootstrap，可能将另一标签页的 activeJob 当作本次成功。现有 public job 缺少可对照的提交身份。 | 补本人请求的查询或回执关联。双标签并发提交不同照片，分别验证冲突、响应丢失、重开后的恢复。 |
| 保存漫画图片 | [漫画相册服务](../../MiaoxunRN/src/services/comicMediaLibrary.ts) 在 JS 等待 20 秒后可报错，PhotoKit 的授权与保存仍可能继续。Android 入口当前明确限定能力。 | 用首次授权弹窗停留超过 20 秒验证晚到成功及重复保存；需要对齐原生回执和重试生命周期。 |
| 二楼手势、系统日历、扫码 | [二楼入口](../../MiaoxunRN/src/features/second-floor/SecondFloorScreen.tsx) 和[权限面板](../../MiaoxunRN/src/features/second-floor/SecondFloorPermissions.tsx) 分别处理手势归属、平台能力和待接入提示；扫码有双端原生实现。 | 实体连续慢拖、内容区滚动与返回手势、相机拒绝和取消需现场验收。日历按此树实际入口另行实现。 |

## 清理与暂缓

- 删除只有合成滚动测试调用的旧 `StationTabBar` 和八项专属样式。现行[小站入口](../../MiaoxunRN/src/features/station/StationScreen.tsx)及[真实标签交互测试](../../MiaoxunRN/__tests__/stationPostExperience.test.tsx)继续覆盖「动态 / 我的 Agent」。删除两个未使用的渐变常量，以及两项与 JSON Schema 重复、无消费者的 ID 导出。
- 后台实际入口加载 [React 页面](../../admin/index.html)，旧 [admin.js](../../admin/admin.js) 仍被[资料流程测试](../../admin/test/profile-workflow.test.js)与[媒体诊断测试](../../admin/test/media-retrieval-diagnostics.test.js)直接执行。下次清理先把有效的请求、错误与权限断言迁到实际页面，确认覆盖后再移除旧代码。
- [检索 Web 的事件与错误文案](../../media-retrieval-web/src/main.js)仍将缺失或无效事件时间显示为“刚刚”，并将所有 HTTP 409 解释为需要同意。后续应展示未知时间，并按服务端公开错误码区分同意和其他冲突，用缺时间和非同意类冲突的响应验收。
- [发布集成](../../backend/scripts/check-agent-publishing-integration.js)创建的诊断任务原先留在全局队列，导致后续四个 Worker 用例领取了不属于自己的记录。测试现在按拥有者和本次成功写入的 ID 清理；另一个旧漫画请求已补现行客户端合同头。带额外诊断字段的任务是测试所造；线上是否有同形记录尚无证据。若允许其他服务写任务表，需核对写入合同，并验证一条坏记录能被隔离、后续正常任务可继续领取。

## 验证记录

| 环境 | 实际覆盖 |
| --- | --- |
| 整仓检查 | `MIAOXUN_DOTENV_ENABLED=false ./scripts/check-repository.sh` 退出 0。RN 122 套、1,542 项，Backend 1,153 项，Agents 59 项，Admin 53 项，avatar-web 29 项，检索 Web 12 项通过。包含格式、静态检查、类型、Web 构建及 App 嵌入查看器字节比对。后端默认跳过 410 项环境门控用例，下面另列本轮主动执行的专项。Admin 构建仍提示大于 500 kB 的 JS 块，RN 部分测试仍提示异步状态更新缺少 `act`。 |
| PostgreSQL 和 HTTP | 全新数据库应用 61 项迁移，再次回放变更数为零。先建立默认管家发布合同，再验证发布权限、注册、登录、资料、私有内容、同步、退出与账号删除。 |
| PostgreSQL 专项 | 群聊 15、表情 7、AI 任务 16 项通过。另用七个独立库验证发布生命周期 10、重新同意 4、账户授权删除 1、目录诊断 5、用户指标 5、聊天附件 7、附件生命周期 9 项。专项共 79 项，全部执行。 |
| 原生端及线上 | 完整 iOS 语音桥与扫码控制器通过设备 SDK 的 arm64 对象编译。当前本地缺少 Android 构建所需 JDK 与 SDK，双端系统权限、读屏、真实音频、相册保存和手势仍需设备验收。生产与供应商实测沿用各自的发布验收流程。 |
