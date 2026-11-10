# 2026-11-06 协作与原 Agent 会话贯通

用户确认处理“协作只有任务里看得到，与讯页Agent像分开的”问题。本轮范围是本地实现、隔离验证与Simulator，不含生产部署、真实供应商调用、TestFlight、提交或推送；保留原有全部未提交修改。

## 行为与代码

| 目标 | 实现入口 | 行为边界 |
| --- | --- | --- |
| 原会话看到真实协作进展 | `backend/src/message-repository.js` | 在既有owner/Agent会话投影节点与工作空间状态；固定文案、活动时间、排序与增量sync，不复制目标/摘要/正文，不创建第二套会话 |
| 聊天按时间看到贡献 | `MiaoxunRN/src/features/messages/chatTimeline.ts`、`MessagesScreen.tsx`、`WorkspaceContributionCard.tsx`、`useWorkspaceContributions.ts` | 与普通消息按createdAt混排，同一node更新不重复、不跳位；前台3/15秒读取，账号/前后台隔离 |
| 从妙页找到对应Agent贡献 | `useWorkspaceContributions.ts`、`agentWorkspaceApi.ts`、`backend/src/routes/agent-workspace-routes.js`与`agent-workspace-service.js` | 沿原Agent会话定位节点；超过50条走精确贡献GET并复验权限，拒绝使用一般任务快照补回已不可访问节点；协调步骤不冒充专业成果 |
| 就选定成果继续聊 | 两端`workspaceContext`合同、`useMessageActions.ts`、`WorkspaceContextCard.tsx`、`messageApi.ts`、后端`workspace-discussion-service.js`与`message-request.js` | 选择当前轮成功text_result，显示可移除关联，严格nodeId/Agent/round/revision；选中节点计入指纹，同键变更409；回原任务修改仍显式确认 |
| 模型上下文有范围 | `contribution-discussion-plan.js`、`agent-runtime.js`、`readContributionDiscussionContext` | 现有Agent的chat能力；只提供选中正文与限定历史，无工具/dispatch/任务变更路径，无其他节点正文、私聊或原素材正文额外注入 |
| 保护派生讨论正文 | `contribution-discussion-reader.js`、`public-message.js`、`ContributionDiscussionReply.tsx` | 普通消息存安全占位、内部metadata存答复；专GET鉴权后临时显示，no-store，前台15秒复验，后台/切账号清除；不进入普通预览、历史、复制或回复内容 |
| 撤回后不经后续答复泄露 | `workspace-discussion-history.js` | 受理/模型前/交付/读取递归校验讨论来源链，超过6对历史窗口的祖先撤回也失效；元信息管家历史hash保持既有字节协议 |
| 续聊后列表时间与顺序同步 | `sessionMappers.ts`、`useMessageActions.ts` | 发送回执和刷新按真实服务器消息时间合并活动、置顶优先排序；旧消息不覆盖更晚协作活动，待回执气泡不制造列表活动时间 |
| 受保护答复可被读屏读取 | `ChatMessageItem.tsx` | 仅保护讨论分支取消父层AX合并，获准正文及重新读取按钮独立可访问；普通消息和安全复制/分享载荷不变 |

工作空间节点和成果仍是唯一执行来源。原056已有owner/Agent索引，无新迁移或配置项；现有JSONB保存受保护讨论回执，不新增Agent声明、权限或版本，不需要因这条能力单独重发Agent产品。

没有持久协作已读游标，本轮不伪造协作未读数。普通聊天原未读保持。列表最多50条仍非全历史分页，任务来源定位通过精确读取补齐。

## API合同

- 工作空间主合同继续6、AI任务1。贡献列表严格DTO新增`workspace.goal/currentRound`，独立要求`X-Miaoxun-Workspace-Contributions:2`；旧客户端缺失声明明确426，避免旧严格解析器收到新格式。
- `GET /api/agent-workspaces/contributions/:agentId/:nodeId`同头要求，返回`{contribution: DTO|null}`。不属于本人/该Agent、无此节点或协调步骤返回null；原成果授权/来源不通过明确403/409。
- 选中讨论使用现有POST消息，`workspaceContext:{id,revision,currentRound,nodeId}`。不可混用附件、素材、回复或重置；服务端派生goal。
- 公开讨论答复只有安全content、selector、`contributionDiscussion:{state:"available"}`。`GET /api/threads/:threadId/messages/:messageId/contribution-discussion`返回鉴权后的`{content}`，不写入普通会话响应。
- 元信息管家讨论不带nodeId，继续原只读元信息模式；专业Agent必须指定自己的成果节点。新请求按当前版本验证；原键只重放原回执，未知/过期不重复分派。

## 验证证据

初轮RED确认普通会话无贡献上下文、公开marker缺失、模型没有选中正文等缺口。独立复核又复现附件混入、祖先讨论撤回后仍可读取派生答复、标题120/160不一致，并修复后回归。客户端针对版本刷新导致正文重载、前后台同批切换和跨会话定位做回归。

已完成的隔离PG回归：

```sh
MIAOXUN_DOTENV_ENABLED=false NODE_ENV=test DEFAULT_ADMIN_ENABLED=false \
DATABASE_URL=<隔离loopback *_migration_test> \
RUN_AGENT_WORKSPACE_SERVICE_INTEGRATION=1 RUN_AGENT_WORKSPACE_TEXT_INTEGRATION=1 \
RUN_AGENT_WORKSPACE_DIRECT_INTEGRATION=1 RUN_AGENT_WORKSPACE_CONTINUATION_INTEGRATION=1 \
RUN_WORKSPACE_THREAD_ACTIVITY_INTEGRATION=1 RUN_WORKSPACE_DISCUSSION_INTEGRATION=1 \
node --test --test-concurrency=1 \
  backend/test/agent-workspace-service-integration.test.js \
  backend/test/agent-workspace-text-integration.test.js \
  backend/test/agent-workspace-direct-integration.test.js \
  backend/test/agent-workspace-continuation-integration.test.js \
  backend/test/workspace-thread-activity-integration.test.js \
  backend/test/workspace-discussion-integration.test.js
```

117/117通过、零跳过，日志`/tmp/miaoxun-contribution-pg-regression.log`。早先116/117的失败是统计变化后测试硬性要求固定索引胜出；已改为验证已有索引有效性及实际决策读取次数，不强迫优化器。运行中任务无等待决策查询，等待状态仅实际相关会话读取；微型EXPLAIN证据不作为容量压测。

新增贡献讨论与精确定位套件：

```sh
MIAOXUN_DOTENV_ENABLED=false NODE_ENV=test DEFAULT_ADMIN_ENABLED=false \
DATABASE_URL=<隔离loopback *_migration_test> \
RUN_WORKSPACE_CONTRIBUTION_DISCUSSION_INTEGRATION=1 \
node --test backend/test/workspace-contribution-discussion-integration.test.js
```

23/23通过、零跳过（含一项纯合同边界），日志`/tmp/miaoxun-contribution-discussion-green.log`。有真实HTTP/PG/发布授权生命周期，模型传输为明确fixture；覆盖同Agent、无关私聊隔离、幂等、未知/过期、权限与来源变化、输入/输出及8轮祖先撤回、标题边界、精确读取超50项。

最终整仓、Simulator与收尾证据见下文；不把测试模型fixture当成真实模型质量验收。

### 最终整仓与编译

`MIAOXUN_DOTENV_ENABLED=false ./scripts/check-repository.sh`退出0，日志`/tmp/miaoxun-contribution-repository-final.log`：

- RN 95套1207项全部通过，TypeScript、ESLint零警告门禁与Prettier通过。
- Backend 1416项中1057通过、359项专用环境门控跳过、零失败；跳过项不计作通过。Agents55、Admin49、检索Web4通过，各工程检查与构建通过。
- 仍有既存VoiceShortcutDock测试act提示、Admin产物大小及第三方原生构建警告，未降低门禁。

QA清理后，在`backend/`以最终后端源码重跑：

```sh
MIAOXUN_DOTENV_ENABLED=false NODE_ENV=test DEFAULT_ADMIN_ENABLED=false \
DATABASE_URL=<隔离loopback *_migration_test> \
RUN_WORKSPACE_CONTRIBUTION_DISCUSSION_INTEGRATION=1 \
RUN_WORKSPACE_DISCUSSION_INTEGRATION=1 \
node --test --test-concurrency=1 \
  test/workspace-contribution-discussion-integration.test.js \
  test/workspace-discussion-integration.test.js
```

真实隔离PG **42/42、零跳过**，日志`/tmp/miaoxun-contribution-final-pg.log`；包含贡献讨论23项及既有管家讨论19项。

最终Simulator构建命令（在`MiaoxunRN/ios`）：

```sh
xcodebuild -workspace MiaoxunRN.xcworkspace -scheme MiaoxunRN \
  -configuration Debug \
  -destination 'platform=iOS Simulator,id=7E81531F-02AE-40FC-98DA-A575CEC9930F' \
  -derivedDataPath /tmp/miaoxun-collaboration-qa-20261105 \
  PRODUCT_BUNDLE_IDENTIFIER=com.wangruoshi.miaoxun.collaborationQA20261105 \
  MIAOXUN_API_BASE_URL=http://127.0.0.1:4395 build -quiet
```

退出0，日志`/tmp/miaoxun-contribution-build-final.log`。独立QA Bundle实际安装并启动，内嵌`main.jsbundle`晚于最后修改源码；SHA-256为`26f2c24012a50d5d5bf237470b69f21c2ccd1dcfaebafb19e9384d4f6d15715b`，源码摘要与mtime记录在`/tmp/miaoxun-contribution-qa/final-build.json`。没有改正式Bundle/API配置或进行分发签名。

### 实际Simulator交互

隔离本地API/PG使用真实登录、授权发布生命周期及HTTP路由，三个专业Agent和管家节点内容明确标注为验收夹具。仅注入两次固定模型答复，无Worker或真实供应商调用。

1. 漫画原会话实际显示普通消息→本Agent协作贡献→普通消息；点“就此继续聊”显示任务关联，发送中文追问后得到专用鉴权正文，仍在原会话。
2. “查看原任务”打开同一工作空间；从妙页四参与者中的漫画Agent进入原会话，实际定位到对应贡献。
3. 首轮实际UI接线发现父AX层只读占位文案，以及发送后列表预览更新但时间/排序停留旧值。分别修复并重编译：最终AX能读获准正文及“重新读取讨论”；视频Agent从列表第三位续聊，返回即排第一且显示“刚刚”，无需重启。
4. 移除输入关联保持已有讨论记录。撤回本地夹具的视频Agent授权后，前台复验清除贡献与答复正文，显示“授权或能力声明已变化，成果目前不可读取”，没有保留旧正文。

截图保存在`/tmp/miaoxun-contribution-qa/`：`01-timeline.png`、`03-original-workspace.png`、`04-participant-focus.png`记录首轮接线；`05-final-thread-order.png`、`06-final-protected-reply.png`、`07-revoked-reply.png`记录最终构建的排序、答复和撤权状态。这些只证明Simulator与隔离HTTP/PG链路，不证明真实模型质量、生产部署或实体设备手感。

### 清理与修改范围

正常从二楼设置退出QA账号，独立QA App已卸载；精准停止本次4395服务，撤回并删除其临时授权/发布、用户与私密凭据。`cleanup.json`记录`modelFixtureCalls:2`、`blockedOutbound:0`、`remainingUserCount:0`。最后42项PG回归后复查users/auth_sessions/workspaces/nodes均0，再停止本轮独立PG；未清理或改写其他环境。

除上表业务入口，本轮同步了`models/api.ts`、`models/agentWorkspace.ts`、`models/workspaceContext.ts`、`sessionTypes.ts`、两端API客户端/合同、`ai-client-contract.js`、`schemas.js`与路由。新增/扩充的主要回归为`chatTimeline`、`contributionFocus`、`contributionDiscussionReply`、`threadMessageActivity`、`workspaceContributionCard`、`workspaceContributionsPolling`、`workspaceDiscussion`、`agentWorkspaceApi`及后端贡献讨论、会话活动、合同/路由/消息sync测试；文档为本记录、CURRENT、文档索引及两个架构合同文档。原工作区其他已有改动全部保留，未提交或推送。

## 发布和后续边界

本地实现需要后端API/双Worker所用相同代码制品更新及新客户端发布才能到真机。无新增迁移，但正式制品仍须按仓库可追溯发布流程准备。贡献列表合同2要求客户端配套，旧客户端贡献入口会明确要求更新。

Build59不含本轮修改。本轮不部署、不上传TestFlight、不运行真实模型；实体iPhone的滚动手感、弱网/后台与真实付费模型对选中成果的连续讨论仍需分别验收。本轮Simulator使用明确标注的隔离夹具，证明真实UI到HTTP/数据库的接线，不能证明线上数据与生成质量。
