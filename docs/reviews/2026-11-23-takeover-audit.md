# 妙讯接手审查 · 2026-11-23

本轮先完成只读地图、源码追踪和离线故障复现。正式工作树为 `/Users/gary/.codex/worktrees/admin-lifecycle-release/marvelsChat`，分支 `codex/ui-agent-candidate-20261105`，HEAD `d04221f`。初始状态有 260 项已跟踪修改和 86 项未跟踪条目（目录条目不等于文件数）；均保留。以下源码行号均对应此次正式树。

## 现状及证据边界

- 已按顺序读取 AGENTS、README、docs/README、CURRENT 并核对 Git。正式移动端为 MiaoxunRN；后台、API、Agent 和两个 Web 工具各自独立管理依赖。数据及权限仍由同一 Express/PostgreSQL 后端承接。
- 当前源码包含 70 份 SQL 迁移，最高 071，064 空号保留；这证明候选文件构成，不证明当前数据库账本。
- 11 月 23 日 CURRENT 记录生产 API、管理台、双 Worker 已切到 `paired-20261123-b443f02`、071 / 70 条账本，iPhone 已装正式 Build 69。菜单能力开关的客户端修复仍待下次 iOS 制品。这些是历史记录，本轮没有取得新的服务器或真机回执。
- Xcode 源文件内 `CURRENT_PROJECT_VERSION = 63` 与交接的 Build 69 不构成已证实错误：归档记录明确通过命令行覆盖版本号。应核对实际归档/设备，不擅自修改工程版本。
- 健康检查被当前网络沙箱阻止；提权请求又因自动审批服务 503 未执行。工具明确说明这是审批服务故障，并非认定操作不安全。正式树也不在本聊天可写根，附加该树返回“由其他任务持有”。本轮没有绕过限制。
- 没有生产写入、推送、上传、付费供应商调用，也未复跑已闭环的 A02/A06/A13/A16/A17。

## 实际模块与调用地图

| 模块 | 已追踪的入口与数据边界 | 当前验证边界 |
| --- | --- | --- |
| App / 会话 | `MiaoxunRN/src/App.tsx` 组合页面；`features/session/useMiaoxunSession.ts` 组合登录、同步和领域动作；API 由平台配置显式提供。RN/TS 管业务与交互，Swift/Kotlin 适配设备能力。 | 本轮 TypeScript 及聊天、导航定向测试通过；不等于设备验收。 |
| 聊天搜索 | `ThreadSettingsSheet` → `ChatHistorySearch.tsx:71` → `messageApi.searchHistory` → `chat-message-search-routes.js` → `chat-message-search.js:28`。认证 POST，按当前账号自己的会话消息副本查询，过滤删除/撤回及受保护内容；游标绑定账号/会话/关键词，SQL 限时 1.5 秒。 | 历史 PG 与双模拟器已验；本轮核源码，未重跑 PG。RN 搜索结果跳转链路的直接组件测试仍应补齐。 |
| 消息转发 | `MessagesScreen.tsx:2636` → `ChatForwardSheet` → `messageApi.forwardMessage` → `message-routes.js:224` 注册转发路由 → `chat-forward-repository.js`。跨会话按稳定顺序加锁，检查目标写权限，复制到目标授权的新附件，同键重试返回原回执。 | 本轮弹层与消息操作回归通过；历史 PG 覆盖字节、额度、并发、回滚。实际页面到 API 的连接及设备回执仍需与该候选对应。 |
| 语音 / 图片 / 文件 | `useChatVoice` / `ChatVoiceMessage` 经统一服务调用原生音频桥；附件经 `chatAttachmentApi` 上传、`chat-attachment-service` 验证格式与归属；`ChatMessageAttachments` 显示私有内容并调用保存桥接。 | 本轮音频/附件组件测试、服务器附件合同通过。扬声器出声、系统打断和相册新增资产必须独立验真机。发现缩略图失败恢复缺口，见下文。 |
| 二楼 / 返回 | `shared/gestures/secondFloorGesture.ts`、`SecondFloorScreen`、`SecondFloorScrollView`；进入/固定区退出/内容区退出最低距离 140/128/160，核对滚动边缘与松手方向。Android 原生报坐标和边界，TS 决定关闭。`useIOSBackGesture` 与 AppModal 系统返回共同处理页面退出。 | 本轮 5 套 81 项导航/手势回归；真机手感、读屏及跨页焦点仍待验。 |
| 管理后台 | `admin/src/main.jsx` → `/admin` React 路由 → Users/Publishing/Operations 页面；`platform.js` 统一请求，API 独立 `authenticate` / `requireAdmin`，前端开关不授予权限。状态/角色/密码/撤会话及发布、媒体预算已有事务和稳定回执机制。 | 本轮 Admin 27 项及后台相关 19 项通过；另证实三条未纳入事务审计的路径，见下文。真实 PG / Chromium 本轮未重跑。 |
| PostgreSQL | `backend/src/db.js` 管连接、事务与迁移检查；领域 repository 管业务。`/api/ready` 在 `app-routes.js:75` 只检查数据库配置、连接、迁移一致性。 | ready 200 不能证明两个 Worker 活跃、供应商可用或整个用户流程成功。 |
| 双 Worker | `ai-task-worker.js` 消费持久 AI/协作任务，按配置注册漫画执行器；`media-retrieval-worker.js` 消费媒体索引、outbox、恢复及清理。各自有心跳探针。 | 本轮核源码与健康合同，未启动 Worker 或核生产心跳。3D runner 另在 API `server.js:167` 内启动，不是第三个独立部署 Worker。 |
| Agent | `agents/registry.js:7` 动态加载声明；`app-routes.js:96` 将注册、Release/Product 合并后过滤公开项；`agent-runtime.js` 执行计划与模型调用。 | 本轮 59 项通过。目录 published 不等于每项生图/视频/3D/检索都能执行；3D Agent 指导与独立 3D 工作流不同。 |
| Web 工具 | avatar-web 管 3D 创建、原提交恢复、四视图确认和模型；App 只嵌入单模型查看器。media-retrieval-web 是私有媒体检索工具，使用后端权限与 shared 公共状态合同。 | avatar-web 本轮 37 项、检索 Web 定向 10 项通过；3D 终态刷新发现错误恢复缺口，见下文。 |

## 已证实问题与处理顺序

### P1：后台三类写入与审计不在同一事务

源码：`backend/src/routes/admin-routes.js:250` 创建账号、`:338` 修改管理员权限、`:367` 修改资料。各路径先完成业务写，再单独调用 `createUsageEvent`。A01 的 `mutateAdminAccount` 没有覆盖这三条路径。

复现条件：业务写成功后，让审计存储失败。加载原路由模块并注入只在内存执行的故障依赖，三条路径均得到 `businessWriteCompleted: true`、`auditFailed: true`、`successResponseSent: false`。这是原路由故障注入，不是实际 PostgreSQL 验证，也不表示线上已经发生。

影响：操作员看到失败，账号/权限/资料却已改变，缺审计回执；创建重试可能变成“邮箱已注册”。另外 `repositories.js:170` 先以 active 创建账号，再独立写入目标 status；逐字提取原函数的内存事务夹具已复现：请求 disabled、首次事务提交后状态 UPDATE 失败，留下 active。源码哈希、合成依赖和断言均保存在证据脚本；未在真实 PostgreSQL 或生产账号上执行。

下一项验收：将初始状态、业务变更、审计和必要回执纳入同一事务；隔离 PG 注入审计失败与状态写失败，断言全部回滚；补失败重试、正常成功、越权和并发验证。该项需真实数据库证据后才能宣称修复完成。

### P2：聊天缩略图失败后无法在当前会话恢复

源码：`MiaoxunRN/src/features/messages/ChatMessageAttachments.tsx:386`、`:439`。图片读取失败将附件 ID 加入失败集合，此后不再挂载该缩略图，原实现没有清除此失败状态的路径。

复现条件：图片先因网络故障加载失败，随后网络恢复、再次打开该图。原实现仍保留失败缩略图，即使预览可以重新读取；离开会话卸载组件后才恢复。

局部修复方向：由用户重新打开图片触发该图重试；失败状态按附件和会话隔离，防止旧请求的迟到失败污染新账号/会话。隔离补丁及回归结果见本报告末尾补充。

### P2：3D 任务完成后的刷新失败变成空结果

源码：`avatar-web/src/workspace/AvatarWorkspace.tsx:186`。终态回执先移除 activeJob，随后 `void refresh()` 无异常处理。

复现条件：任务收到 succeeded/cancelled 等终态时，bootstrap 刷新遇到离线/503。原组件测试出现未处理 Promise rejection；界面退为“暂无 3D 模型”，没有刷新失败提示和重试。

局部修复方向：保留已确认的任务信息，显示只读刷新失败与重试；重试只读取 bootstrap，不重新创建任务、上传照片或触发供应商。隔离补丁及回归结果见本报告末尾补充。

## 本轮验证及未执行项

| 验证 | 新鲜结果 |
| --- | --- |
| `git diff --check` | 通过；阶段检查 Git 状态与初始清单一致 |
| 根目录 `npm run lint` | 通过 |
| `backend/` 中 `npm run check` | 461 文件语法检查通过 |
| `MiaoxunRN/` 中 `npm run typecheck` | 通过 |
| 聊天定向 Jest 5 套 | 110 项通过 |
| 导航/二楼定向 Jest 5 套 | 81 项通过 |
| 后端附件/公开消息/启动合同 | 12 项通过，0 跳过 |
| Admin / Agents 单测 | 分别 27 / 59 项通过 |
| 后台操作、发布幂等、Worker 健康合同 | 19 项通过 |
| avatar-web 全部单测 | 11 套 37 项通过 |
| media-retrieval-web 定向测试 | 10 项通过 |

离线后端检查显式设置 `MIAOXUN_DOTENV_ENABLED=false`，不加载仓库环境凭证。基线通过不覆盖上面新发现的失败场景；新增复现与修复测试另列。没有把默认门控跳过计作 PostgreSQL 通过。

本轮未执行整仓 `./scripts/check-repository.sh`、隔离 PostgreSQL、浏览器实点、新 iOS/Android 构建、实体设备、生产状态或供应商验证。正式树写入/联网权限恢复后，应用补丁、完成相关设备/浏览器复验，并在提交前执行整仓检查。

## 下一阶段可执行事项

1. 应用两个已隔离验证的局部界面修复，补浏览器/模拟器故障恢复场景，更新正式 CURRENT 与对应说明。
2. 修后台三条事务审计路径，重点验证创建停用账号失败不会留下活动账号，以及审计失败不会产生半成功结果。
3. 延续 A09：iPhone 使用隔离合成内容验语音真实出声/打断/重录、图片从页面保存并读回相册、二楼短手势取消/长手势切换/长内容边缘、两级返回、VoiceOver 播报与焦点。Android 继续模拟器，真机项保留待验。
4. 下次获授权发布客户端时纳入菜单能力开关修复，核对实际分发制品；不把本地修复算作已进入 Build 69。
5. 收到新需求后先定义可见行为、失败/取消状态、权限及跨端验收，再复用现有组件、API、数据与任务结构。当前不预先扩展新功能。

审查阶段结论：地图和离线证据已建立；存在已复现问题，不能宣称全项目验收通过。以上为首轮审查当时状态。权限恢复后，聊天缩略图和 3D Web 的两处局部修复已应用正式树。后续验证见 [聊天体验续修](2026-11-23-chat-voice-and-calls.md)。后台事务问题继续待修。
