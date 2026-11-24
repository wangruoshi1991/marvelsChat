# 2026-11-18 移动端并发与原生本地验证

## 本地实现

- A07 聊天已读和免打扰。迁移 068 将已有未读数量作为每个会话的初始投递位置。新单聊和群聊投递在写入消息的事务中递增接收方位置。打开正式聊天入口后，App 用该会话快照及收到的消息位置确认已读。服务端原子推进已读位置，晚到与重复确认保留后续未读。失败时读取当前账号、当前会话的权威计数。免打扰按会话排队，使用服务端版本校验，设置页关闭或切换会话后收不到旧错误。
- A08 任务建站预览。任务详情使用服务端返回的草稿产物或审批草稿 ID，沿用现有私人文档接口。缺产物或产物冲突时显示草稿不可用。生成中显示等待状态。删除、鉴权失败、网络错误和重试使用实际读取结果。关闭预览返回原任务，预览本身没有审批或应用操作。
- A09 原生与系统返回。Android 扫码的 Activity 启动失败、CameraX 初始化或绑定失败、取消与权限拒绝分别结算，并释放扫码占用。设置、搜索等八处 Modal 接通系统返回，注销提交时保留防关闭条件。小站列表回弹、滑开和点赞响应系统减动。TS/RN 继续负责输入解释与页面反馈，原生桥适配系统接口。聊天相册保存与 iOS 漫画保存仍是两个入口。
- A11 小站 3D。只应用当前账号最新读取。轮询权限关闭、切换账号或有更新读取时，旧成功回执及错误失效。
- A19 聊天检索素材。点击、关闭以及消息或账号切换都会撤销早先素材校验的 UI 所有权。
- A20 隐私。设置页接入已有的相册和动态隐私字段。同一账号按提交顺序写入，失败会 GET 当前配置。晚到回执不能更新另一账号的状态或关闭后重开的页面错误提示。

## 聊天状态接口

- `GET /api/threads/:threadId/state` 只允许本人读取，返回 `unreadSequence`、`readSequence`、`muted` 和 `preferencesRevision`。
- `POST /api/threads/:threadId/read` 的 `readThrough` 是线程内已收到的投递位置。响应含 `ok` 和最新状态。重复或更旧的位置保持幂等，领先于服务端收到的位置返回 409。已分发客户端的空请求继续清除收到请求时的全部旧未读。
- `PATCH /api/threads/:threadId/preferences` 接收 `muted` 和 `baseRevision`。版本冲突返回 409 `THREAD_PREFERENCES_CHANGED`，客户端按最新意图重新读取和提交。已分发客户端仍可使用原 `muted` 字段。

## 本地验收边界

下列构建状态记录初轮验收。随后已在两端模拟器安装、登录并验证部分交互，Android 已完成四 ABI 的 Debug 构建。最新结论见[独立验收](2026-11-19-ticket-acceptance.md)和[续验记录](../handoffs/CURRENT.md#2026-11-18-续验与后台清理)。

- PostgreSQL 使用本机隔离数据库回放 001–068。群聊集成覆盖四次投递后确认前三条、乱序与重复确认、跨账号访问、静音过期版本和群聊回滚。
- iPhone 17，iOS 26.5 模拟器 Debug 构建完成。该构建使用本地 API 地址，无安装或启动。
- Android `assembleDebug` 使用 CI 的本地 API 地址与 Java 17。修正 Gradle 9.4.1 与现有 RN 插件的 Android 构建配置后，项目评估进入 SDK 定位，当前 Mac 缺少 Android SDK。Android 编译与权限、相机故障后重扫仍待环境验证。
- 双端实体设备的相机首授或永久拒绝、语音打断、相册文件、读屏、动态效果与慢拖手势仍待验。生产和 TestFlight 未进入本轮本地验证。

## A15 移动端清理复核

用 Babel 解析当前 `src` 的静态 import/export、字面量 require 和动态 import。从 `index.js` 经根组件追踪，264 个 JS/TS 源文件中 252 个可达。余下两个 `.d.ts` 是编译输入。下列十个业务候选各有测试消费者，本轮保留。

| 候选 | 保留依据 |
| --- | --- |
| `siteTaskAttemptStore.ts` | 建站面板读取和保存原提交键，`keychainIsolation.test.ts` 验证跨账号读取、清理与损坏回执。 |
| `AvatarViews.tsx` | 成果面板经穿搭成果间接加载，`stationOutcomes.test.tsx` 另直接验证头像渲染。 |
| `StationFileAgentPanel.tsx` | `stationFileRegistration.test.tsx` 验证文件注册、失败和重试。正式二楼文件入口须有相同断言后再清理。 |
| `StationHome.tsx` | `stationHomeContentActions.test.tsx` 验证旧首页内容操作。 |
| `StationHomeModules.tsx` | 建站、文件和旧首页共用，`stationModuleManagement.test.tsx` 验证模块管理。 |
| `StationOutcomesPanel.tsx` | `stationOutcomes.test.tsx`、`stationOutcomesRefresh.test.tsx` 和 `stationPostExperience.test.tsx` 覆盖成果、刷新和动态体验。 |
| `StationOutfitResult.tsx` | 成果面板的穿搭分支，`stationOutcomes.test.tsx` 间接覆盖。 |
| `StationPageHeading.tsx` | 旧首页及成果面板共用，`stationTabLifecycle.test.tsx` 仍有 Jest 模块引用。 |
| `StationSiteBuilderPanel.tsx` | `siteTasks.test.tsx` 覆盖创建、原键恢复与审批。A08 直接调用 `SiteDocumentPreview`，旧面板的创建与审批证据仍须保留。 |
| `stationOutcomes.ts` | 成果面板的筛选与映射，`stationOutcomes.test.tsx` 直接验证结果。 |

核对了 AppRegistry 根注册及 RN 原生模块引用，十个候选未出现原生注册或动态生产消费者。扫码模块仍由 iOS 工程及桥接、Android Manifest 和原生包引用。协作者已删除的 `StationTabBar.tsx` 和其测试在当前树无剩余引用。
