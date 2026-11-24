# 第二轮源码审查

以正式开发树 `codex/ui-agent-candidate-20261105` 的工作区为基线。取样覆盖 3D 提交与数据库事务、Worker 领取、iOS 漫画保存、后台筛选及媒体检索状态。按用户影响排列。

| 优先级 | 触发条件和影响 | 本轮改动和验证 |
| --- | --- | --- |
| P1 | 同账号两页提交不同照片，创建请求丢失回执后，Web 和 RN 原先仅凭 bootstrap 有活动任务就确认本次成功。数据库还在获取账号锁前查重，同时提交同一键可能得到误导性的冲突。 | 获取锁后查重；两端按本人及原提交键查找可见任务，可找回终态。只读查询不会推进生成。RN 恢复原费用确认，Web 保留本页待确认草稿。见[接口约定](../api/avatar-3d-submissions.md)、[RN 回归](../../MiaoxunRN/__tests__/avatar3dSubmission.test.tsx)、[Web 回归](../../avatar-web/src/workspace/AvatarWorkspace.test.tsx)。 |
| P1 | 普通 AI 任务的 JSONB 可以含有严格 DTO 拒绝的字段。领取回滚会让同一条记录继续位于队首，后续健康任务也得不到处理。 | 在领取事务中锁定并检查任务。隔离异常行，写失败事件，对外显示固定错误；保留原始诊断和公共引用、产物、审批的严格校验。真实 PostgreSQL 覆盖安全回读、权限和后续任务继续领取。见[领取实现](../../backend/src/ai-task-repository.js)、[专项回归](../../backend/test/ai-task-integration.test.js)。 |
| P2 | iOS 首次授权等待超过 20 秒，JS 可以先报失败，但 PhotoKit 继续写入。连续点击、切换漫画帧或离开预览会造成重复保存或在新页面提示旧结果。 | 等待原生最终回执，按会话和素材共用进行中的操作，校验回执中的状态和素材身份；两个入口只消费当前素材的结果。3 套 12 项定向测试。实体 iPhone 首次授权停留超过 20 秒、切换页面再返回、系统相册最终文件数仍待确认。见[保存服务](../../MiaoxunRN/src/services/comicMediaLibrary.ts)。 |
| P2 | 后台快速切换账号筛选时，较慢的旧响应会覆盖当前账号表；读取新条件失败也会留下旧行及详情入口。 | 页码与筛选由同一状态驱动，查询变化及卸载时取消旧请求，校验列表结构。DOM 环境加载实际后台生产构建，按旧请求后返回的顺序先复现再验证修复；新筛选失败时旧行和操作入口均消失。见[用户列表](../../admin/src/UsersPage.jsx)。 |
| P2 | 检索 Web 单独维护状态白名单，丢掉公共合同合法的 `awaiting_user` 和 `purging`，使整个状态页显示未知。不同 409 冲突一律提示同意授权，缺失时间显示为“刚刚”。 | 状态合法性直接读[共享合同](../../shared/media-retrieval-public-contract.js)，按公开错误码区分同意、任务进行中与不可索引的素材，缺失时间展示未知。见[状态回归](../../media-retrieval-web/test/status-display.test.js)。 |

## 正式开发树后续复核

- 后台账号写操作保留失败的确认框，原请求可以重试；修改密码等输入后应作为新操作提交。资料表单保留失败时的输入。列表与详情在写入确认后回读。见[账号页面](../../admin/src/UsersPage.jsx)和[浏览器回归](../../admin/test/user-confirmation.browser.cjs)。
- Web 端将已确认的请求参数、账号、照片标识和幂等键保存在本标签会话中。硬刷新后仅查询任务，用户主动重试才发送创建请求。退出时清理记录，即使浏览器拒绝访问存储，仍会请求服务端注销。见[接口及恢复约定](../api/avatar-3d-submissions.md)。
- RN 的主页和扫码各次请求绑定会话和当前操作，关闭资料页或切换账号后丢弃旧回执。关注、取消关注及好友请求更新前核对当前展示的用户，避免用旧操作回执改写另一位用户的资料。见[主页状态](../../MiaoxunRN/src/features/profile/useProfileFlows.ts)和[异步回归](../../MiaoxunRN/__tests__/profileReadLifecycle.test.tsx)。
- 好友会话读取、联系人搜索和历史记录的更新绑定到发起操作的会话。A 切换到 B 再回到 A，第一次 A 的回执和清空历史确认都已失效。[社交回归](../../MiaoxunRN/__tests__/socialSessionOwnership.test.tsx)

## 继续处理

- **P1 · 账号管理写入与审计分开提交。** 状态、角色和重置密码三个[管理端点](../../backend/src/routes/admin-routes.js)先执行业务写入，再追加审计事件，均未读取客户端的幂等键。若已写入但审计失败或客户端没收到回执，再次确认可能重复执行。服务端需将操作身份、业务写入、审计及可重放回执纳入同一事务。用“已提交后丢回执”、审计故障和相同键不同参数验证最终业务与审计各一份；不得把明文密码写进操作记录。
- [App 根组件](../../MiaoxunRN/src/App.tsx)同时维护会话、跨页面请求、聊天草稿和模态框。主页读取和回执归属已集中在 profile 模块。其余职责后续沿各自用户路径逐项整理，保留账号切换、返回及重复进入的行为回归。
- 双端真机权限、语音、读屏及相册落盘和 Android 完整原生构建，沿用[第一轮验收清单](2026-11-18-project-quality.md)。
- [消息状态更新](../../MiaoxunRN/src/features/session/useMessageActions.ts)仍需逐项核查已读回执及静音失败回滚。在操作发出后切账号或重新打开会话，验证旧的成功或错误均不会覆盖新账号的会话或较新的选择。

## 本轮验证

iOS 26.5 独立 iPhone 17 模拟器以临时 UIKit 测试壳调用正式 [Swift 相册模块](../../MiaoxunRN/ios/MiaoxunRN/MiaoxunMediaLibraryModule.swift)。仅授予添加照片权限，以鉴权本地 HTTP 读取合成图片。小站和聊天两次保存均返回对应标识及 `saved`，损坏图返回 `comic_media_invalid_image`。DCIM 文件从 6 个增至 8 个，新增 JPEG 分别为 43×27 和 37×23。所有临时设备已删除。该实测覆盖原生模块与 PhotoKit，RN 页面点按、实体设备首次授权长时间等待仍待验收。

RN 全量 123 套 1,549 项，格式、lint 和类型检查通过。3D 后端定向 131 项、Avatar Web 32 项、Admin 53 项、Agents 59 项、检索 Web 13 项通过。真实 PostgreSQL 的 AI 任务 17 项、群聊 15 项、表情 7 项和发布及 API 集成通过。后台乱序筛选使用本地 DOM 加载生产构建复核。

独立 PostgreSQL 18 库应用迁移 001–061 后，[3D 并发与归属专项](../../backend/test/avatar-3d-submission-postgres.test.js) 1/1 通过。同键并发只创建一份任务，不同账号或键无法读到它，排队与终态任务读前读后数据一致，软删除后不可见。

早期补丁验证时，沙箱拦截了 10 项 HTTP 测试的回环监听。补丁已应用到正式开发树；首次完整复跑退出 0，后端 1,154 项通过、412 项环境门控跳过。正式树重新使用独立 PostgreSQL 18 实例验证 61 条迁移和无变更回放、3D 归属和并发 1/1、AI Worker 17/17，测试库和临时实例均已清理。

最终正式开发树 `MIAOXUN_DOTENV_ENABLED=false ./scripts/check-repository.sh` 退出 0。RN 125 套、1,554 项；Backend 1,154 项通过、412 项按环境跳过；Agents 59、Admin 53、3D Web 34、检索 Web 13 项通过。Chromium 在本地接口夹具上验证后台确认失败、重试、取消、密码变化换键、资料草稿保留、筛选乱序及 503 清除旧行；3D 页面在 320×568、430×932 和 1440×1000 硬刷新后按原键只读查询，主动重试沿用原始请求。生产供应商没有参与。
