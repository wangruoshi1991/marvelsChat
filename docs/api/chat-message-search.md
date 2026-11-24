# 会话内查找聊天记录

`POST /api/threads/:threadId/messages/search` 使用当前 App 会话的 Bearer token。请求为 JSON 对象，`q` 去除首尾空白后为 1 至 200 个字符，`limit` 为 1 至 50 的整数，默认 30。通过 `cursor` 传回同一会话和关键词上一页的游标。接口拒绝额外字段。

```json
{"q":"报告","limit":30}
```

响应为 `{"data":{"items":[…],"nextCursor":null}}`，带 `Cache-Control: private, no-store`。结果按发送时间从新到旧排列，时间相同时按消息 ID 排序。每条结果使用该账号在此会话中可见的消息 ID 和聊天历史接口使用的公开字段。结果耗尽时 `nextCursor` 为 `null`。

搜索覆盖单聊和群聊正文，以及退出群聊后仍可读取的历史。大小写匹配使用 PostgreSQL 数据库的 locale。百分号、下划线和反斜线按字面匹配。搜索排除已撤回、已删除的消息，也排除 Agent 消息和工作区贡献。服务端应用日志只记录路由模板，关键词通过 JSON 请求正文传递。

请求格式或游标无效时返回 `400`，会话无效时返回 `401`，会话不存在、不可读取或类型不支持时返回 `404`。搜索语句超时返回 `503` 和 `CHAT_SEARCH_TIMEOUT`。服务端搜索语句超时限制为 1.5 秒。

## 隔离回归

在已迁移的 loopback `*_migration_test` 数据库运行。`DATABASE_URL` 指向该测试库。

```bash
MIAOXUN_DOTENV_ENABLED=false RUN_CHAT_MESSAGE_SEARCH_POSTGRES=1 \
  NODE_ENV=test DEFAULT_ADMIN_ENABLED=false \
  node --test backend/test/chat-message-search-postgres.test.js
```
