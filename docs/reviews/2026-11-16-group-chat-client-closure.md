# 群聊客户端闭环阶段报告

## 范围

本阶段仅复用现有群聊服务端合同，没有新增接口、迁移、成员管理权限或生产写入：

- `POST /api/chat-groups`：真实好友选择、群标题、UUID 幂等键建群。
- `GET /api/chat-groups/:groupId/members`：成员读取。
- `DELETE /api/chat-groups/:groupId/membership`：退出群聊。

## 客户端实现

- `MiaoxunRN/src/services/api/groupChatApi.ts` 增加显式 API 类型和请求封装。
- `GroupChatCreateScreen` 从真实 `friends` 关系加载好友；空列表、加载失败、提交中和失败重试均为明确状态。重复点击锁定，失败重试复用相同幂等键。
- `GroupChatMembersSection` 增加成员读取、空/错误状态、退出二次确认和退出失败提示；设置页不可见时不请求成员。
- 退出后依据服务端持久 `thread.status === 已退出群聊` 恢复只读状态，保留历史消息，隐藏 Composer，并阻止普通发送和失败消息重试；退出回调触发 bootstrap 刷新。
- `+` 菜单已接入创建群聊页面；创建成功使用后端返回的 thread/messages 打开会话，不生成假数据。

## 验证

- 群聊 4 套测试：14 项通过。
- 群聊 + 消息/附件定向回归：8 suites，132 项通过。
- `npm run typecheck`：通过。
- Prettier check：通过。
- 定向 ESLint：0 errors；仅 inline-style、`no-void`、变量 shadow 等 warnings。
- `git diff --check`：通过。

## 未完成/边界

未运行 PostgreSQL 群聊集成、iOS Simulator/真机或生产预检；未提交、推送、部署或创建生产群。`docs/handoffs/CURRENT.md` 由主代理统一更新。
