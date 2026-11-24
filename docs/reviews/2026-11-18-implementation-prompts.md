# 妙讯项目执行提示词

对应[全仓审查报告](2026-11-18-project-audit-dispatch.md)。下方每个文本框都是一个可独立发给其他对话的任务。执行者应先在指定工作树复核问题是否仍存在，再修改。报告中的历史验证数字仅用于定位基线。

**发单顺序。** 首批处理 A01、A02/A16、A03、A04、A05、A13、A21、A23。A02/A16 协调存储清理，A05/A10/A23 协调后台运营页，A07/A08 共改 App.tsx 时串行，A14 接 A06 的心跳合同，A15 最后。涉及迁移先统一编号；各对话先交自己的验证证据，统一维护总交接。

## A01 后台账号事务与实时会话撤销

```text
请执行妙讯 A01「后台账号事务与实时会话撤销」，范围是本地实现与验证。

正式工作树为 /Users/gary/.codex/worktrees/admin-lifecycle-release/marvelsChat，分支 codex/ui-agent-candidate-20261105。先读该树的 AGENTS.md、README.md、docs/README.md、docs/handoffs/CURRENT.md，再核对 git status --short --branch。使用包含协作者本地修改的当前源码。Desktop 树的迁移历史另有分叉。

任务范围：修复管理员修改状态、角色或密码时的部分提交，以及服务端撤销会话后已连接 WebSocket 的生命周期。先看 backend/src/routes/admin-routes.js 的状态、角色、改密和主动撤会话入口，backend/src/admin-repository.js 的 updateUserStatus/Role/Password、backend/src/repositories.js、backend/src/routes/auth-routes.js 和 backend/src/realtime-gateway.js。

修改要求：将目标状态转换、必要的撤会话、审计和幂等回执放进同连接事务。区分 actor、target、operation、同键同意图与同键改参；禁止把密码或可离线猜测密码的摘要写入审计或日志。保留现有权限和账号确认框。实时层仅留必要会话标识，按单会话退出、账号级撤销、自然到期分别处理；结合实际进程边界交付失效，不存明文凭据。

验收：隔离 PG 分别使撤销和审计失败，断言账号、会话、审计回滚；同键并发和提交后丢回执只执行一次，改参有显式冲突。用合成会话做单元或集成测试，证明撤销后不再投递、另一正常设备按操作范围保留。若引入迁移，和 A02/A03 协调编号。

交付：按本单更新相关合同或文档，提供触发条件、修改文件、运行命令、实际结果（通过/失败/跳过分列）和仍待验证项，并给出可并入 CURRENT.md 的交接摘要。按仓库约定核对 ./scripts/check-repository.sh 与 git diff --check。保留其他人的改动，避免兼容兜底和虚构状态。本单未授权推送、生产操作、TestFlight 上传或付费供应商调用。
```

## A02 App 注销账号与存储清理

```text
请执行妙讯 A02「App 注销账号与存储清理」，范围是本地实现与验证。

正式工作树为 /Users/gary/.codex/worktrees/admin-lifecycle-release/marvelsChat，分支 codex/ui-agent-candidate-20261105。先读该树的 AGENTS.md、README.md、docs/README.md、docs/handoffs/CURRENT.md，再核对 git status --short --branch。使用包含协作者本地修改的当前源码。Desktop 树的迁移历史另有分叉。

任务范围：修复用户注销账号时可能只删除部分文件的问题。backend/src/account-service.js 逐项删对象后才调用 deleteUser；backend/src/account-repository.js 负责清单与数据库删除；backend/src/routes/account-routes.js、backend/test/account-deletion.test.js 及 RN 注销入口共同定义外部行为。已在两个对象的内存服务里复现第二次失败后账号仍在、第一个对象消失。

修改要求：明确注销受理、访问冻结、清理完成三者的语义；用数据库持久化可恢复的操作和对象清单，确保旧凭据、并发上传/任务、其他账号与共享对象各有正确边界。复用已有存储服务。需要跨层协议时同步服务端、App 状态、测试与文档；集成先保留现有账号删除与授权历史的约束。

验收：使用本地临时存储和一次性 PG。覆盖第一项成功第二项失败、DB 步骤失败、重启续跑、重复点击、期间新增写入、另一账号对照和正常完成。验收指标是无可见坏引用、可回收、可恢复，最终数据库和对象清单一致。和 A01/A03 协调迁移编号。

交付：按本单更新相关合同或文档，提供触发条件、修改文件、运行命令、实际结果（通过/失败/跳过分列）和仍待验证项，并给出可并入 CURRENT.md 的交接摘要。按仓库约定核对 ./scripts/check-repository.sh 与 git diff --check。保留其他人的改动，避免兼容兜底和虚构状态。本单未授权推送、生产操作、TestFlight 上传或付费供应商调用。
```

## A03 Agent 发布、产品授权与后台确认

```text
请执行妙讯 A03「Agent 发布、产品授权与后台确认」，范围是本地实现与验证。

正式工作树为 /Users/gary/.codex/worktrees/admin-lifecycle-release/marvelsChat，分支 codex/ui-agent-candidate-20261105。先读该树的 AGENTS.md、README.md、docs/README.md、docs/handoffs/CURRENT.md，再核对 git status --short --branch。使用包含协作者本地修改的当前源码。Desktop 树的迁移历史另有分叉。

任务范围：处理 Release 评审/发布、产品提交/发布/暂停等实际转换中的审计一致性，以及后台确认框失败重试。查 backend/src/agent-publishing-service.js、agent-release-repository.js、product-catalog-repository.js（后二者也在 backend/src/），backend/src/routes/admin-release-routes.js、admin-product-routes.js（同目录）和 admin/src/PublishingPages.jsx。产品暂停后审计抛错、状态已变更有离线复现。

修改要求：逐条列出现有转换是否写审计，把需同步的生命周期历史、授权投影、业务变更、审计、可重放回执纳入同一事务。保留 readiness、依赖版本、合同哈希、撤权和重新同意检查。确认失败保留弹窗和表单，同一动作复用原键，参数或版本改变换键，成功后回读。旧账号确认行为可作参考。

验收：隔离 PG 测审计故障和并发重放，查历史/授权/审计各自条数；浏览器夹具测首次 503、提交后响应丢失、改版本再试及键盘焦点。用本地 Agent 声明与已存在夹具，不发布线上 Agent。与 A01/A02 协调迁移编号。

交付：按本单更新相关合同或文档，提供触发条件、修改文件、运行命令、实际结果（通过/失败/跳过分列）和仍待验证项，并给出可并入 CURRENT.md 的交接摘要。按仓库约定核对 ./scripts/check-repository.sh 与 git diff --check。保留其他人的改动，避免兼容兜底和虚构状态。本单未授权推送、生产操作、TestFlight 上传或付费供应商调用。
```

## A04 好友请求并发与通知

```text
请执行妙讯 A04「好友请求并发与通知」，范围是本地实现与验证。

正式工作树为 /Users/gary/.codex/worktrees/admin-lifecycle-release/marvelsChat，分支 codex/ui-agent-candidate-20261105。先读该树的 AGENTS.md、README.md、docs/README.md、docs/handoffs/CURRENT.md，再核对 git status --short --branch。使用包含协作者本地修改的当前源码。Desktop 树的迁移历史另有分叉。

任务范围：修复好友请求同意、拒绝、撤回竞态，以及创建时丢弃 INSERT RETURNING 结果的问题。沿 backend/src/social-repository.js 的 createFriendRequest、acceptFriendRequest、rejectFriendRequest、cancelFriendRequest，追到 backend/src/routes/social-routes.js、notification-service.js（在 backend/src/）和会话仓储。

修改要求：在 DB 事务中按当前身份、对象和 pending 状态裁决，只让成功改变状态者写入关系、会话、计数和持久通知。优先用返回行或受影响行，去掉二次读取后使用猜测 UUID 的路径。定义重复提交与已变更的显式响应，实时事件按提交结果发出。

验收：两个独立 PG 连接同时同意/拒绝、同意/撤回、重复同意与重复创建。核对请求终态、双向关系、双方会话、计数、通知、返回的真实 ID。检查已有好友聊天读取及 A→B→A 回归不受影响。

交付：按本单更新相关合同或文档，提供触发条件、修改文件、运行命令、实际结果（通过/失败/跳过分列）和仍待验证项，并给出可并入 CURRENT.md 的交接摘要。按仓库约定核对 ./scripts/check-repository.sh 与 git diff --check。保留其他人的改动，避免兼容兜底和虚构状态。本单未授权推送、生产操作、TestFlight 上传或付费供应商调用。
```

## A05 后台漫画取消、重试与任务幂等

```text
请执行妙讯 A05「后台漫画取消、重试与任务幂等」，范围是本地实现与验证。

正式工作树为 /Users/gary/.codex/worktrees/admin-lifecycle-release/marvelsChat，分支 codex/ui-agent-candidate-20261105。先读该树的 AGENTS.md、README.md、docs/README.md、docs/handoffs/CURRENT.md，再核对 git status --short --branch。使用包含协作者本地修改的当前源码。Desktop 树的迁移历史另有分叉。

任务范围：修复后台通用 AI 任务操作绕开漫画逐帧状态机的问题。读 backend/src/admin-operations-repository.js 的 allowedTaskOperations 和 mutateAdminTask、backend/src/comic-render-repository.js、comic-render-executor.js（同目录）与 admin/src/OperationsPages.jsx 的任务操作。另有幂等读取先于行锁的竞态。

修改要求：先梳理漫画各状态下允许取消/重试的条件，再复用同一领域转换维护父任务、逐帧、租约、事件和审计。无安全重试语义时由服务端明确拒绝，UI 同步可用动作。相同操作者和请求的重放在锁内或等效唯一性机制中裁决。保留其他任务和工作区语义。

验收：模拟全排队、部分完成、结果未知、可安全重试等；断言父/子状态、供应商替身调用次数、事件/审计数量。用两条 PG 连接并发同键，验证相同 revision。此单先于 A10 合入共享仓储与后台页面。

交付：按本单更新相关合同或文档，提供触发条件、修改文件、运行命令、实际结果（通过/失败/跳过分列）和仍待验证项，并给出可并入 CURRENT.md 的交接摘要。按仓库约定核对 ./scripts/check-repository.sh 与 git diff --check。保留其他人的改动，避免兼容兜底和虚构状态。本单未授权推送、生产操作、TestFlight 上传或付费供应商调用。
```

## A06 AI 与媒体检索 Worker 生命周期

```text
请执行妙讯 A06「AI 与媒体检索 Worker 生命周期」，范围是本地实现与验证。

正式工作树为 /Users/gary/.codex/worktrees/admin-lifecycle-release/marvelsChat，分支 codex/ui-agent-candidate-20261105。先读该树的 AGENTS.md、README.md、docs/README.md、docs/handoffs/CURRENT.md，再核对 git status --short --branch。使用包含协作者本地修改的当前源码。Desktop 树的迁移历史另有分叉。

任务范围：处理 backend/src/ai-task-runner.js 的任务续租与 backend/src/media-retrieval-worker.js 的空闲 abort 监听。离线慢 DB 在任务结束时仍积压了 13 次续租，媒体 Worker 正常空转 50 轮后保留 50 个监听。

修改要求：每个 claim 最多一条在途续租，明确完成、失去 claim、报错与停止过程中的清理和超时边界；正常空闲等待及中止都应移除监听、清理定时器。保留已实现的坏队首隔离、claimToken 校验和独立进程心跳。

验收：用可控时钟、慢仓储替身及隔离 PG 测慢续租、任务早结束、重复 stop、重新领取；最大在途数 ≤ 1、结束后无新增写、空轮询后监听回到起始值、空闲中止可唤醒。把可观察的存活/进度字段交给 A14。

交付：按本单更新相关合同或文档，提供触发条件、修改文件、运行命令、实际结果（通过/失败/跳过分列）和仍待验证项，并给出可并入 CURRENT.md 的交接摘要。按仓库约定核对 ./scripts/check-repository.sh 与 git diff --check。保留其他人的改动，避免兼容兜底和虚构状态。本单未授权推送、生产操作、TestFlight 上传或付费供应商调用。
```

## A07 妙讯 App 聊天已读与静音

```text
请执行妙讯 A07「妙讯 App 聊天已读与静音」，范围是本地实现与验证。

正式工作树为 /Users/gary/.codex/worktrees/admin-lifecycle-release/marvelsChat，分支 codex/ui-agent-candidate-20261105。先读该树的 AGENTS.md、README.md、docs/README.md、docs/handoffs/CURRENT.md，再核对 git status --short --branch。使用包含协作者本地修改的当前源码。Desktop 树的迁移历史另有分叉。

任务范围：修复 MiaoxunRN/src/features/session/useMessageActions.ts 的已读、静音和失败回执归属，核对 MiaoxunRN/src/features/messages/ThreadSettingsSheet.tsx、聊天未读列表和对应 API。当前已读先清零，失败未回读；静音设置页关闭再打开后旧回执可覆盖新值。

修改要求：对已读记录账号、线程及读到的位置；失败时重取权威计数或合并新消息，勿盲目恢复旧快照。保证同线程静音远端写入的顺序与最终意图一致，忽略过期 UI 回执和错误弹窗。复用既有会话生命周期逻辑。

验收：测试 3 条未读期间新增 1 条、请求失败后再进入、先开后关且旧请求慢、设置页关闭重开、A→B→A、退出换号。客户端最终与服务端一致。取证至少包括一次从正式聊天入口进入的场景；需改 App.tsx 时先于 A08 合入。

交付：按本单更新相关合同或文档，提供触发条件、修改文件、运行命令、实际结果（通过/失败/跳过分列）和仍待验证项，并给出可并入 CURRENT.md 的交接摘要。按仓库约定核对 ./scripts/check-repository.sh 与 git diff --check。保留其他人的改动，避免兼容兜底和虚构状态。本单未授权推送、生产操作、TestFlight 上传或付费供应商调用。
```

## A08 妙讯 App 从任务打开正确建站草稿

```text
请执行妙讯 A08「妙讯 App 从任务打开正确建站草稿」，范围是本地实现与验证。

正式工作树为 /Users/gary/.codex/worktrees/admin-lifecycle-release/marvelsChat，分支 codex/ui-agent-candidate-20261105。先读该树的 AGENTS.md、README.md、docs/README.md、docs/handoffs/CURRENT.md，再核对 git status --short --branch。使用包含协作者本地修改的当前源码。Desktop 树的迁移历史另有分叉。

任务范围：修复 MiaoxunRN/src/features/miao/MiaoTaskWorkspace.tsx 的“打开建站预览”。目前 MiaoxunRN/src/App.tsx 的 site_draft 分支只切换到小站 Agent 列表。对照 src/features/station/StationPanels.tsx、StationSiteBuilderPanel.tsx、src/features/site-document/SiteDocumentPreview.tsx（均在 MiaoxunRN/）及 backend/src/routes/station-site-routes.js 的 document 读取。

修改要求：按选中任务的真实产物或审批合同定位本人可见的 draftId，走现有草稿预览和鉴权。定义生成中、产物缺失/删除、无权限、网络重试和返回原任务的交互。预览只读；已有审批/应用路径独立保留。勿自动选最新草稿或接回废弃的 apply 端点。

验收：用两份不同草稿从第二个任务进入，断言显示第二份；删除、跨账号、返回、慢响应后切任务各验一次。核对 iOS/Android 布局和返回行为。若改 App.tsx，先取 A07 最新改动。

交付：按本单更新相关合同或文档，提供触发条件、修改文件、运行命令、实际结果（通过/失败/跳过分列）和仍待验证项，并给出可并入 CURRENT.md 的交接摘要。按仓库约定核对 ./scripts/check-repository.sh 与 git diff --check。保留其他人的改动，避免兼容兜底和虚构状态。本单未授权推送、生产操作、TestFlight 上传或付费供应商调用。
```

## A09 Android 扫码修复与双端原生验收

```text
请执行妙讯 A09「Android 扫码修复与双端原生验收」，范围是本地实现与验证。 核对 AppModals.tsx 内八个缺少 onRequestClose 的弹窗，并检查 StationContentListScreen、StationPostsPanel 中自定义动效能否响应系统减动。

正式工作树为 /Users/gary/.codex/worktrees/admin-lifecycle-release/marvelsChat，分支 codex/ui-agent-candidate-20261105。先读该树的 AGENTS.md、README.md、docs/README.md、docs/handoffs/CURRENT.md，再核对 git status --short --branch。使用包含协作者本地修改的当前源码。Desktop 树的迁移历史另有分叉。

任务范围：检查 MiaoxunRN/android/app/src/main/java/com/wangruoshi/miaoxun/ 的 QRCodeScannerActivity.kt 和 QRCodeScannerModule.kt，修复 Activity 启动、CameraX 初始化/绑定失败时无法正确结束请求的路径。iOS 核对 MiaoxunRN/ios/MiaoxunRN/QRCodeScannerModule.swift 及媒体、语音桥的真实设备行为。

修改要求：TS/RN 负责业务与页面反馈，原生桥只适配系统接口。保留成功、取消、拒绝的不同结果，错误只结算一次并释放 busy；不要为展示成功伪造数据。区分聊天双端相册保存与 iOS 漫画专用保存。

验收：按现有 CI 提供明确的本地 API 配置并执行 Android assembleDebug；验证无可用摄像头/绑定失败/拒绝权限后可重新打开扫码。iOS 和 Android 分列表记录设备、OS、构建、首授/永久拒绝、语音打断、系统相册文件、VoiceOver/TalkBack、减动与慢拖返回。只有实际验证的项记通过；缺设备注明待验。 补查 MiaoxunRN/src/app/AppModals.tsx，将设置和注销页的 onRequestClose 接入现有返回动作。设备验证未提交时注销页返回设置、进行中遵守防误关条件。

交付：按本单更新相关合同或文档，提供触发条件、修改文件、运行命令、实际结果（通过/失败/跳过分列）和仍待验证项，并给出可并入 CURRENT.md 的交接摘要。按仓库约定核对 ./scripts/check-repository.sh 与 git diff --check。保留其他人的改动，避免兼容兜底和虚构状态。本单未授权推送、生产操作、TestFlight 上传或付费供应商调用。
```

## A10 后台监控统计与切换窗口

```text
请执行妙讯 A10「后台监控统计与切换窗口」，范围是本地实现与验证。

正式工作树为 /Users/gary/.codex/worktrees/admin-lifecycle-release/marvelsChat，分支 codex/ui-agent-candidate-20261105。先读该树的 AGENTS.md、README.md、docs/README.md、docs/handoffs/CURRENT.md，再核对 git status --short --branch。使用包含协作者本地修改的当前源码。Desktop 树的迁移历史另有分叉。

任务范围：修复 admin/src/OperationsPages.jsx 和 backend/src/admin-operations-repository.js 的监控用户指标。当前把最多 200 行的用户排行长度用作“用户数”，窗口切换期间还会保留旧数，尚未返回时可能显示 0。先确认界面标题与现行窗口定义。

修改要求：新增或复用服务器端同口径去重总数，保留排行 Top 200；按当前窗口绑定数据、加载、失败、重试与真实零值；取消或忽略已过期响应，保留筛选器和键盘焦点。对齐 API 合同。

验收：在隔离库插入 201 位窗口内有活动的合成账号，并给一人多个事件；总数 201、排行最多 200。另测空窗口、切换慢旧快新响应、503 后恢复。用本地浏览器查看窄屏和键盘操作。先合入 A05 对共享仓储及页面的修改。

交付：按本单更新相关合同或文档，提供触发条件、修改文件、运行命令、实际结果（通过/失败/跳过分列）和仍待验证项，并给出可并入 CURRENT.md 的交接摘要。按仓库约定核对 ./scripts/check-repository.sh 与 git diff --check。保留其他人的改动，避免兼容兜底和虚构状态。本单未授权推送、生产操作、TestFlight 上传或付费供应商调用。
```

## A11 3D Web 四视图、取消与减动反馈

```text
请执行妙讯 A11「3D Web 四视图、取消与减动反馈」，范围是本地实现与验证。 同时处理 RN 小站：MiaoxunRN/src/features/station/useAvatar3d.ts 的轮询、关闭和手动刷新交错可使终态被旧处理中响应覆盖。用可控 Promise 验证后发终态先返回以及晚到错误不会倒退状态。

正式工作树为 /Users/gary/.codex/worktrees/admin-lifecycle-release/marvelsChat，分支 codex/ui-agent-candidate-20261105。先读该树的 AGENTS.md、README.md、docs/README.md、docs/handoffs/CURRENT.md，再核对 git status --short --branch。使用包含协作者本地修改的当前源码。Desktop 树的迁移历史另有分叉。

任务范围：修复 avatar-web/src/workspace/TaskProgress.tsx、ReferenceConfirmation.tsx 所属的任务状态界面与 avatar-web/src/styles.css。待确认阶段加载 references 失败只留转圈，切回前台刷新可与轮询交错，取消按钮的拒绝没有可见反馈，减少动态效果时进度图标仍无限转动。

修改要求：建模四视图读取、失败、成功状态，提供原位只读重试，按 jobId 和请求世代拒绝旧结果；取消动作保留错误及可恢复操作，避免重复生成；减动时采用静态的可读状态。保留上次已修的提交键和同标签硬刷新恢复。

验收：在本地浏览器夹具测四视图首次 503 再成功、旧轮询晚于取消、换任务、取消失败、减动与屏幕阅读状态。观察 320px 与桌面布局，重试读取不得创建生成任务，用户确认前不得进入收费操作。

交付：按本单更新相关合同或文档，提供触发条件、修改文件、运行命令、实际结果（通过/失败/跳过分列）和仍待验证项，并给出可并入 CURRENT.md 的交接摘要。按仓库约定核对 ./scripts/check-repository.sh 与 git diff --check。保留其他人的改动，避免兼容兜底和虚构状态。本单未授权推送、生产操作、TestFlight 上传或付费供应商调用。
```

## A12 媒体检索 Web 的输入、焦点与事件

```text
请执行妙讯 A12「媒体检索 Web 的输入、焦点与事件」，范围是本地实现与验证。

正式工作树为 /Users/gary/.codex/worktrees/admin-lifecycle-release/marvelsChat，分支 codex/ui-agent-candidate-20261105。先读该树的 AGENTS.md、README.md、docs/README.md、docs/handoffs/CURRENT.md，再核对 git status --short --branch。使用包含协作者本地修改的当前源码。Desktop 树的迁移历史另有分叉。

任务范围：修复 media-retrieval-web/src/main.js 中 trackRun/refreshEvents/renderWorkbench 重建整个表单的问题，核对 src/api.js、test/session-boundary.test.js 和 test/status-display.test.js（在 media-retrieval-web/）。

修改要求：令更新范围与数据一致：后台事件只更新历史，搜索更新结果与状态；保留正在输入的节点、类型、焦点、光标及 IME。持续校验账号/运行/查询身份，正确清理 object URL，保留显式空态、权限和退出隔离。

验收：浏览器用延迟事件夹具：提交第一条，第二条输入到一半、选视频，旧事件抵达时不丢文字、类型和焦点；测试中文组合输入、不同搜索返回乱序、退出后旧预览不得复现。桌面与窄屏均从真实页面入口观察。

交付：按本单更新相关合同或文档，提供触发条件、修改文件、运行命令、实际结果（通过/失败/跳过分列）和仍待验证项，并给出可并入 CURRENT.md 的交接摘要。按仓库约定核对 ./scripts/check-repository.sh 与 git diff --check。保留其他人的改动，避免兼容兜底和虚构状态。本单未授权推送、生产操作、TestFlight 上传或付费供应商调用。
```

## A13 数据库备份恢复的失败保护

```text
请执行妙讯 A13「数据库备份恢复的失败保护」，范围是本地实现与验证。

正式工作树为 /Users/gary/.codex/worktrees/admin-lifecycle-release/marvelsChat，分支 codex/ui-agent-candidate-20261105。先读该树的 AGENTS.md、README.md、docs/README.md、docs/handoffs/CURRENT.md，再核对 git status --short --branch。使用包含协作者本地修改的当前源码。Desktop 树的迁移历史另有分叉。

任务范围：仅在隔离环境改进 scripts/restore-production-database.sh 及相应手册和检验。现有脚本先 DROP 旧库，再导入候选，结尾只要求账本非空。现有 scripts/backup-production-database.sh、异地恢复脚本和 docs/database-backup.md 有可复用的校验，先核对备份格式与运行主体。

修改要求：候选库先完整导入同一归档，按备份版本校验完整 ledger/checksum、pgvector、对象归属/约束和代表性数据；实现保留旧库、明确切换和可回退的步骤，处理活跃连接与失败清理。保持离线密钥和归档访问边界。

验收：用本机一次性 Linux、PG18、pgvector、合成归档测试成功、数据段损坏但目录可读、缺中间迁移、切换阶段失败。验证原有可用库与数据仍在，恢复结果可读，回退可执行。只交付脚本和演练证据，禁止在任何真实数据库上运行恢复。

交付：按本单更新相关合同或文档，提供触发条件、修改文件、运行命令、实际结果（通过/失败/跳过分列）和仍待验证项，并给出可并入 CURRENT.md 的交接摘要。按仓库约定核对 ./scripts/check-repository.sh 与 git diff --check。保留其他人的改动，避免兼容兜底和虚构状态。本单未授权推送、生产操作、TestFlight 上传或付费供应商调用。
```

## A14 CI、Worker 健康探针与隔离启动文档

```text
请执行妙讯 A14「CI、Worker 健康探针与隔离启动文档」，范围是本地实现与验证。

正式工作树为 /Users/gary/.codex/worktrees/admin-lifecycle-release/marvelsChat，分支 codex/ui-agent-candidate-20261105。先读该树的 AGENTS.md、README.md、docs/README.md、docs/handoffs/CURRENT.md，再核对 git status --short --branch。使用包含协作者本地修改的当前源码。Desktop 树的迁移历史另有分叉。

任务范围：处理 deploy/docker-compose.prod.yml、backend/Dockerfile、.github/workflows/quality.yml、scripts/check-backend-image.sh、README.md。核对 scripts/miaoxun-development.mjs 的 verify-local-start、verify-local-restart、status、stop 实际前置及日常 ios 的独立用途。媒体 Worker 继承 API HTTP 探针，AI Worker 关探针；PG job 未主动开启四组回归，README 的 cp 可能覆盖已有 .env。

修改要求：按本实例 Worker 的进程和数据库心跳/成功轮询定义探针，验证无法被另一实例的健康掩盖。保留 API 探针、Android 编译与既有浏览器 job。在已迁移的一次性回环 *_migration_test 库按各测试要求单独设置 RUN_GROUP_CHAT_POSTGRES、RUN_CUSTOM_STICKERS_POSTGRES、RUN_AI_TASK_INTEGRATION、RUN_AVATAR_3D_SUBMISSION_INTEGRATION 为 1；必要时隔离各套库。README 区分隔离运行、一次性验收及日常 iOS，避免覆盖 .env，说明显式 readiness 前置。

验收：隔离 Compose 中验证两类 Worker 活动/停滞/恢复，API 健康不变；四套 PG 在 CI 日志有执行数且跳过为零；临时目录验证已有 .env 哈希不变、空库可启动，全部用本地服务与合成配置。此单与 A06 协调心跳语义，放在相关测试稳定之后。

交付：按本单更新相关合同或文档，提供触发条件、修改文件、运行命令、实际结果（通过/失败/跳过分列）和仍待验证项，并给出可并入 CURRENT.md 的交接摘要。按仓库约定核对 ./scripts/check-repository.sh 与 git diff --check。保留其他人的改动，避免兼容兜底和虚构状态。本单未授权推送、生产操作、TestFlight 上传或付费供应商调用。
```

## A15 旧后台清理、文档整理与最终验收

```text
请执行妙讯 A15「旧后台清理、文档整理与最终验收」，范围是本地实现与验证。 对 RN 静态入口图的 10 个业务候选逐项核实测试、原生/动态入口、待接通的建站路径；后台静态可达的 15 个 JS/JSX 以及单独的 Vite 构建入口保留。

正式工作树为 /Users/gary/.codex/worktrees/admin-lifecycle-release/marvelsChat，分支 codex/ui-agent-candidate-20261105。先读该树的 AGENTS.md、README.md、docs/README.md、docs/handoffs/CURRENT.md，再核对 git status --short --branch。使用包含协作者本地修改的当前源码。Desktop 树的迁移历史另有分叉。

任务范围：最后执行。检查 admin/index.html、admin/src/main.jsx、admin/src/App.jsx、ResourcesPage.jsx（同目录）、admin/admin.js、admin/src/components/、admin/src/runtime-config.js、admin/test/ 及正式构建/发布 manifest。核对 docs/README.md、docs/handoffs/CURRENT.md、其他单的实际回执与本次审查总表。

修改要求：从正式 React 入口追生产引用、动态入口、测试与制品。将旧资料、媒体诊断、operations、publishing 测试中仍有效的权限/请求/状态断言迁到实际页面后，逐个删除已经证明无消费者的文件。保留同名 .js/.jsx 中仍使用的实现、历史 SQL、生成查看器与源的同步关系、归档、已有未提交文件。建站相关旧面板等 A08 核实再判断。文档只合并重复的当前说明，历史证据保留日期。

验收：列出每个删除/保留候选及引用依据，核对后台生产构建、本地浏览器关键操作和发布 manifest。以实际合入的树运行整仓与涉及的 PG/原生专项，汇总每份工单的修复、证据与待验项，再统一更新 CURRENT。无法确证的对象记录用途疑点后保留。

交付：按本单更新相关合同或文档，提供触发条件、修改文件、运行命令、实际结果（通过/失败/跳过分列）和仍待验证项，并给出可并入 CURRENT.md 的交接摘要。按仓库约定核对 ./scripts/check-repository.sh 与 git diff --check。保留其他人的改动，避免兼容兜底和虚构状态。本单未授权推送、生产操作、TestFlight 上传或付费供应商调用。
```

## A16 小站删除与对象清理

```text
请执行妙讯 A16「小站删除与对象清理」。正式工作树为 /Users/gary/.codex/worktrees/admin-lifecycle-release/marvelsChat，分支 codex/ui-agent-candidate-20261105。先读 AGENTS.md、README.md、docs/README.md、docs/handoffs/CURRENT.md，再检查 git status --short --branch。保留已有改动，按当前代码复核问题。

审查 backend/src/station-media-deletion-service.js、station-library-repository.js（同目录）及 routes/station-album-routes.js、station-media-routes.js 中的删除入口。第二个对象删除失败时，相册仍可见而第一个对象已消失。单项媒体也存在存储先成功、数据库后失败的边界。

用事务登记删除范围、可见性和可续作对象清单，使清理能在进程重启后继续。明确并发加入/移出素材和既有消息引用的行为。和 A02 协调清理语义与迁移编号，复用合适的基础设施。

验收：隔离 PG 加对象存储替身，覆盖中途失败、重复删除、重启、并发移动、已被引用及另一账号对照。核对相册可见性、引用、物理对象和遗留清单。

交付改动文件、实际运行命令、通过/跳过/未验项、相关合同与交接摘要。按范围运行 ./scripts/check-repository.sh 及 git diff --check；使用隔离数据。本单仅授权本地实现与验证，不推送、不部署、不上传 TestFlight、不调用付费供应商。
```

## A17 二楼手写文件保存

```text
请执行妙讯 A17「二楼手写文件保存」。正式工作树为 /Users/gary/.codex/worktrees/admin-lifecycle-release/marvelsChat，分支 codex/ui-agent-candidate-20261105。先读 AGENTS.md、README.md、docs/README.md、docs/handoffs/CURRENT.md，再检查 git status --short --branch。保留已有改动，按当前代码复核问题。 顺带核实创建相册、素材、日记和搭配入口的相同写入顺序；有正式消费者且复现的才纳入改动，其他记下证据。

从 MiaoxunRN/src/features/second-floor/SecondFloorFiles.tsx、MiaoxunRN/src/services/api/stationAgentApi.ts 追到 backend/src/routes/station-file-routes.js 的 JSON 创建。首次创建后使用事件失败再重试，会写出两份同一手稿。

让同一次编辑保存具有可重用的幂等键；服务端记录可重放的真实结果并定义事件与业务事务的关系。区分同键改参、用户修改手稿和元数据创建，核对已有 raw 上传的合同。

验收：用本地夹具和隔离 PG 测首次写事件失败、提交后丢回执、双击、内容变更和空正文的既有入口。每次独立编辑意图只生成一份文件，失败保留草稿。

交付改动文件、实际运行命令、通过/跳过/未验项、相关合同与交接摘要。按范围运行 ./scripts/check-repository.sh 及 git diff --check；使用隔离数据。本单仅授权本地实现与验证，不推送、不部署、不上传 TestFlight、不调用付费供应商。
```

## A18 Agent 协作相册的失败状态

```text
请执行妙讯 A18「Agent 协作相册的失败状态」。正式工作树为 /Users/gary/.codex/worktrees/admin-lifecycle-release/marvelsChat，分支 codex/ui-agent-candidate-20261105。先读 AGENTS.md、README.md、docs/README.md、docs/handoffs/CURRENT.md，再检查 git status --short --branch。保留已有改动，按当前代码复核问题。

核对 backend/src/album-assistant-tools.js、agent-workspace-capabilities.js、agent-workspace-runner.js（同目录）及工作区任务详情。未同意、检索服务不可用、索引中被压成没有匹配素材。

保留工具公开状态，持久化能指导用户的原因。分别暴露授权、等待、稍后再试与真实空结果的处理；保留费用未知或进行中时禁止自动重复调用的边界。

验收：使用真实执行器和工具配内存服务/隔离库，枚举未授权、不可用、索引中、无素材、无匹配、进行中及费用未知，断言搜索调用数、持久事件及用户提示。

交付改动文件、实际运行命令、通过/跳过/未验项、相关合同与交接摘要。按范围运行 ./scripts/check-repository.sh 及 git diff --check；使用隔离数据。本单仅授权本地实现与验证，不推送、不部署、不上传 TestFlight、不调用付费供应商。
```

## A19 App 聊天素材预览顺序

```text
请执行妙讯 A19「App 聊天素材预览顺序」。正式工作树为 /Users/gary/.codex/worktrees/admin-lifecycle-release/marvelsChat，分支 codex/ui-agent-candidate-20261105。先读 AGENTS.md、README.md、docs/README.md、docs/handoffs/CURRENT.md，再检查 git status --short --branch。保留已有改动，按当前代码复核问题。

核对 MiaoxunRN/src/features/messages/AlbumAssistantResults.tsx 的点击、预览关闭、会话变化及错误展示。两个不同素材同时读取时共享请求代次。

每次点击和关闭使早先读取失效，仅接受当前账号、消息和选择的结果或错误。保留现有检索调用、授权及已有数据。

验收：用可控 Promise 测依次选 A、B，B 先返回；关闭 B 后再完成 A；旧请求失败、切消息和切账号。检查预览内容、返回状态和错误提示。

交付改动文件、实际运行命令、通过/跳过/未验项、相关合同与交接摘要。按范围运行 ./scripts/check-repository.sh 及 git diff --check；使用隔离数据。本单仅授权本地实现与验证，不推送、不部署、不上传 TestFlight、不调用付费供应商。
```

## A20 App 隐私设置并发

```text
请执行妙讯 A20「App 隐私设置并发」。正式工作树为 /Users/gary/.codex/worktrees/admin-lifecycle-release/marvelsChat，分支 codex/ui-agent-candidate-20261105。先读 AGENTS.md、README.md、docs/README.md、docs/handoffs/CURRENT.md，再检查 git status --short --branch。保留已有改动，按当前代码复核问题。

审查 MiaoxunRN/src/features/settings/SettingsScreen.tsx、MiaoxunRN/src/features/session/useProfileActions.ts 和 backend/src/station-profile-repository.js 的可见性写入。两次单字段写响应各含整份设置，旧响应晚到可能覆盖新显示。

使一组可见性操作按明确顺序生效，或以权威版本裁决回执。失败回读到正确的账号，避免旧快照覆盖其他字段。保持现有服务端隐私校验。

验收：从设置连续修改相册、动态，两次响应逆序，再测试第一项失败、返回重进和切账号。最终界面应与服务端 GET 一致，按实际生效的配置校验访问呈现。

交付改动文件、实际运行命令、通过/跳过/未验项、相关合同与交接摘要。按范围运行 ./scripts/check-repository.sh 及 git diff --check；使用隔离数据。本单仅授权本地实现与验证，不推送、不部署、不上传 TestFlight、不调用付费供应商。
```

## A21 3D 提交所有权与私有对象清理

```text
请执行妙讯 A21「3D 提交所有权与私有对象清理」。正式工作树 /Users/gary/.codex/worktrees/admin-lifecycle-release/marvelsChat，分支 codex/ui-agent-candidate-20261105。先读该树 AGENTS.md、README.md、docs/README.md、docs/handoffs/CURRENT.md，再查 git status --short --branch。保留已有协作改动，复核当前代码。

检查 backend/src/avatar-3d-repository.js、avatar-3d-reference-repository.js、avatar-3d-job-processing-service.js、avatar-3d-job-runner.js、avatar-3d-private-asset-repository.js。两个真实 PG 连接下，第一实例等待供应商时第二实例将提交判为未知，迟到的成功回执无法写入。另有单条删除失败阻塞后续对象的情况。

在网络提交及回执持久化期间保留同一执行者的领取权；区分活动、过期、已派发与结果未知，旧执行者不得覆写新所有者，未知结果不自动重复生成。分别处理模型和四视图状态。清理失败按对象记录并退避，避免首批失败对象一直阻塞后续页。

验收：一次性 PG18 和延迟供应商替身跑两个执行器，测同一任务只提交一次、租约内成功回执落库、崩溃过期才转未知，覆盖迟到回执和重启。清理测试两对象与超过一批的 51 对象，核成功/失败标记和可恢复性。

交付修改文件、合同/迁移/文档和交接摘要；列出实际命令、通过/失败/跳过、未验证项。运行整仓检查 ./scripts/check-repository.sh、git diff --check 及本单定向验收。仅做本地实现与隔离验证，不推送、部署、上传 TestFlight 或调用真实付费供应商。
```

## A22 媒体上传回执与索引任务归属

```text
请执行妙讯 A22「媒体上传回执与索引任务归属」。正式工作树 /Users/gary/.codex/worktrees/admin-lifecycle-release/marvelsChat，分支 codex/ui-agent-candidate-20261105。先读该树 AGENTS.md、README.md、docs/README.md、docs/handoffs/CURRENT.md，再查 git status --short --branch。保留已有协作改动，复核当前代码。

沿 backend/src/routes/station-media-routes.js 的上传完成处理、backend/src/media-retrieval-user-service.js 和 media-retrieval-index-lifecycle-repository.js（同目录）修复索引重放。两次完成通知可能得到不同 runId 却复用同一 job，第二条 run 一直排队。

在账号、素材和内容版本边界内原子裁决 job 与 run，真实复用时返回绑定的运行和当前状态；孤立运行需有可核验的诊断和处置依据，不能一律标成功。先检查删除及换版语义，与 A16 协调素材生命周期。

验收：隔离 PG 分别做顺序/并发重放、已完成重放、换版、删除；检查没有新建永远排队的 run，事件序号正确，供应商替身调用数不增加。

交付修改文件、合同/迁移/文档和交接摘要；列出实际命令、通过/失败/跳过、未验证项。运行整仓检查 ./scripts/check-repository.sh、git diff --check 及本单定向验收。仅做本地实现与隔离验证，不推送、部署、上传 TestFlight 或调用真实付费供应商。
```

## A23 后台检索控制的并发、预算与审计

```text
请执行妙讯 A23「后台检索控制的并发、预算与审计」。正式工作树 /Users/gary/.codex/worktrees/admin-lifecycle-release/marvelsChat，分支 codex/ui-agent-candidate-20261105。先读该树 AGENTS.md、README.md、docs/README.md、docs/handoffs/CURRENT.md，再查 git status --short --branch。保留已有协作改动，复核当前代码。

检查 admin/src/OperationsPages.jsx 的 MediaRetrievalPage、backend/src/routes/admin-media-retrieval-routes.js、backend/src/media-retrieval-budget-admin-repository.js。两位管理员分别 PATCH 不同字段，仓储把各自旧快照的所有字段写回；另有审计分开提交和重试换键。

在事务内锁定控制行，对当前状态合并实际改动并验证预算、开关与预留的组合。界面要能识别过期草稿；持久化审计、版本及可重放回执。明确空值代表无限额、0 代表什么，保留原有权限。

验收：两个独立 PG 连接并发改限额与预算，最终包含两次合法修改；过期写同字段显式冲突，关闭开关不会被悄悄恢复。模拟审计失败和丢回执，浏览器核对原键重试和服务端回读。与 A05、A10 协调同一个运营页文件。

交付修改文件、合同/迁移/文档和交接摘要；列出实际命令、通过/失败/跳过、未验证项。运行整仓检查 ./scripts/check-repository.sh、git diff --check 及本单定向验收。仅做本地实现与隔离验证，不推送、部署、上传 TestFlight 或调用真实付费供应商。
```
