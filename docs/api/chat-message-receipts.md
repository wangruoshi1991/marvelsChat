# 普通私聊送达回执

本轮只区分服务器接受与接收客户端收到，不披露已读。群聊、Agent、系统会话、输入状态和多设备已读同步不在此合同内。

## 状态含义

- `accepted` / 已发送：发送者自己的消息副本已持久化到服务器，尚无接收客户端 ACK。服务器创建对方副本、WebSocket `send()` 成功、对方在线，以及现有 `unread_delivered` / `/read` 都不能升级此状态。
- `delivered` / 已送达：经认证的接收客户端，在前台主动打开该私聊并加载实际收件副本后调用 ACK；后端验证该副本、原作者和双方会话关系后记录。它不证明人已阅读、播放语音或打开附件。
- 只有发送者能查询自己发出消息的状态；接收者只能确认自己的收件副本。没有设备回执就不显示已送达。客户端请求失败时保持已发送/尚未确认，不推测对方离线或未读。

现有 `/api/threads/:threadId/read` 仍只处理本人的未读位置。本轮不增加 `readAt`、read 状态或开启已读披露的按钮。未来披露已读必须先实现双方明确同意、默认关闭和撤销生效的独立权限合同。

## 显式能力声明

`/api/app/bootstrap` 与 `/api/app/sync` 返回：

```json
{"chatMessageReceipts":{"directDelivery":1,"readDisclosure":false}}
```

RN 只有看到准确版本及 `readDisclosure:false` 才发送回执请求。字段缺失/版本不匹配时不轮询新接口。会话、账号、token 和前后台状态均绑定当前 effect；退出或切换后旧响应不能写入另一会话。

## 接口

两个接口都要求有效认证，响应 `Cache-Control: private, no-store`，只接受普通私聊、双方有效账号及双向活跃好友关系。每个请求 1–50 个 UUID，去重后处理；额外字段、无效 UUID、空数组、超量数组返回 400。会话/权限不可用统一返回 404，未认证 401；现有每进程限流为每用户 120 次/分钟。

`POST /api/threads/:threadId/message-receipts/delivered`

```json
{"messageIds":["接收者会话中的消息 UUID"]}
```

响应 `data.acknowledgedMessageIds` 为实际确认的本地消息 ID 数组。无效归属、自己的发件、撤回/删除、缺失原始发件副本的 ID 被省略，不影响同批合法项。只接受服务端存储的 `source=direct`、`senderUserId=peer` 的用户消息，与对方 `source=app`、相同作者及 `client_message_id` 的原始副本精确关联。

`POST /api/threads/:threadId/message-receipts/status`

```json
{"messageIds":["发送者会话中的消息 UUID"]}
```

响应 `data.receipts` 为 `{messageId,status:"accepted"|"delivered"}` 数组。不返回对方消息 ID、账号/设备/session、接收时间或已读位置；非本人原始发件、已撤回/删除消息被省略。接收者后来本地删除不会撤销已发生的送达。

## 数据及并发

迁移 `072_direct_message_delivery.sql` 为 `chat_messages` 增加 nullable `recipient_received_at TIMESTAMPTZ`。历史值全部保持 NULL，不补造回执。CHECK 阻止给发件、非用户消息或缺失作者/来源的记录填写时间。已有消息 owner 外键使用 `ON DELETE SET NULL`：新增 BEFORE UPDATE 触发器在 owner 变更/丢失时先清空回执，使账号删除可继续执行 thread cascade，且不会保留失去接收者归属的确认。数据随消息/账号生命周期清理，不新增独立留存表。

ACK 和查询都沿用普通私聊的 advisory transaction lock，与发消息、镜像和撤回顺序一致。ACK 使用 `COALESCE` 保留第一次服务器时间；重复和多设备并发 ACK 幂等。已有主键、会话/客户端消息唯一索引、直接会话唯一索引支持最多 50 项的有界连接，不增加冗余索引。

升级顺序为备份/隔离验迁移 → 应用 072 → 发布带合同的新后端 → 新客户端。该迁移新增可空列，无历史更新；`ADD CONSTRAINT` 校验可能扫描消息表并持有 DDL 锁，正式执行仍需独立授权和维护安排。回滚应用可保留新增列及约束，旧程序忽略字段；不在应用回滚时删列或抹除回执。

## RN 当前范围与验证

`useDirectMessageReceipts` 在受支持、可见且前台的普通私聊确认最近 50 条已加载收件，并查询最近 50 条本人已持久化发件。发送者的待确认状态每 5 秒刷新，已确认的送达在当前已加载消息中保留。接收端仅在 ACK 请求失败时重试，合法成功响应中省略的消息 ID 不重复提交给服务；离开页面、其他覆盖层、切账号或进入后台停止后续请求。历史更早消息、后台同步确认和实时推送回执留待下一阶段，因此未确认不等同于对方没有收到。

定向命令：

```sh
cd backend
RUN_CHAT_MESSAGE_RECEIPTS_POSTGRES=1 MIAOXUN_DOTENV_ENABLED=false NODE_ENV=test DEFAULT_ADMIN_ENABLED=false DATABASE_URL=postgresql://<isolated-local-user>@127.0.0.1:<isolated-port>/<name>_migration_test node --test test/chat-message-receipts-postgres.test.js
cd ../MiaoxunRN
npx jest --runInBand __tests__/messageReceipts.test.tsx
npx tsc --noEmit
```

隔离 PostgreSQL 验证真实回执、并发幂等、越权拒绝、撤回、好友撤销、账号停用，以及账号删除时回执的清理。隔离 App 打开收件会话后，发件方状态查询验证由已发送变为已送达。客户端与发布状态见[当前交接](../handoffs/CURRENT.md)。
