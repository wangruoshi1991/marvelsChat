# 普通聊天附件 Task 5：消息发送与精确重试

日期：2026-11-16
状态：代码与定向验证完成；尚未做设备验收。

## 实现

- `messageApi.sendMessage` 接受末位可选 `attachmentIds`，仅在非空时将原序列复制进请求体。纯文字请求体保持原合同；附件可以与正文一同发送，也可用空正文发送。
- `useMessageActions` 将附件 ID 序列写入乐观消息回执。失败重试读取并保留原序列与 `clientMessageId`；列表变化会在请求前拒绝。Agent、UI-Agent、workspace/contribution、assistant 来源与创作上下文不得携带普通附件 ID。
- 同一 thread 的在途发送只派发一次。未知或已知失败都留在显式失败状态，不自动提交第二次请求；再次从输入框提交已被失败消息引用的附件会被拒绝并指向原消息重试入口。
- `MessagesScreen` 仅从 direct/group 会话读取附件草稿，必须所有附件均为 ready 且有服务端 ID 才调用发送。空正文仅在该 ready 快照非空时允许。成功时按发送前保存的 clientKey 批量移除；发送过程中加入的新条目保留。失败时草稿保留，消息回执保存原 ID；同一失败附件仍在草稿中时，Composer 禁用普通发送并显示“这组附件的消息发送失败，请点击失败消息重试，或移除附件后重新选择。”
- `useChatAttachments.removeMany` 以 clientKey 精确移除提交快照，并沿用既有临时文件清理逻辑。

## 测试证据

- TDD 红灯：实现前运行 `npm test -- --runInBand __tests__/chatContentApi.test.ts __tests__/messageRetry.test.tsx`，2 个 suite 中有 3 个预期失败，分别显示 API 未传 ID、失败回执没有附件序列、在途重复调用发出两次请求。
- 最终定向回归：`npm test -- --runInBand __tests__/chatContentApi.test.ts __tests__/messageRetry.test.tsx __tests__/chatAttachmentTools.test.tsx __tests__/aiContract.test.ts __tests__/workspaceDiscussion.test.tsx __tests__/chatContentActions.test.tsx`，6 suites、164 tests 通过。`chatContentActions` 组件用例覆盖失败快照留在输入区、Composer 阻止新 key 发送、失败消息重试传回原消息 ID 与附件序列；`messageRetry` 覆盖 action 层复用原 `clientMessageId`。
- `npm run typecheck` 退出 0。
- `npx prettier --write` 与 `npx prettier --check` 覆盖本任务涉及的 RN 源码和测试；check 报告所有匹配文件格式正确。
- `git diff --check` 退出 0。

## 边界与未覆盖项

- Task 4 的单独 report/ledger 文件未在当前 worktree 的 docs 中找到；Task 4 状态依据 `docs/handoffs/CURRENT.md` 的 2026-11-16 条目核对。该共享交接文件按任务要求未修改。
- 本轮未运行完整 `./scripts/check-repository.sh`、Simulator/真机、Android 设备或生产检查；Task 7 负责纵向验收。群聊成员退出与只读状态属于并行实现，不由本 Task 5 报告认定完成。
- 未提交、推送、部署、上传 TestFlight、连接生产或调用付费模型。
