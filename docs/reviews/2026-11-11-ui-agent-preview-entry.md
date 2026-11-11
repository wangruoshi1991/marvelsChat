# UI-Agent 专属聊天预览入口修复

2026-11-11，仅本地源码与自动化验证。本记录不证明线上客户端、真实模型或实体设备已经验收。

## 问题与行为

当前后端 `message-routes.js` 已为 `ui-agent` 专属会话准备并持久化受保护的 UI 预览，回复通过 `metadata.uiPreferencePreview.id` 引用预览；与管家会话使用相同的预览读取和显式确认合同。已有 `ui-agent-message-integration.test.js` 覆盖专属会话返回预览、生成后不自动应用及确认后才更新偏好。

RN `ChatMessageItem` 原先只在 `miaoxun-butler` 会话挂载 `UIPreferenceChatCard`。因此专属 UI-Agent 回复虽然要求先查看预览，却没有可读取差异和确认的入口。本次把允许的会话精确补充为 `miaoxun-butler` 和 `ui-agent`，复用现有卡片、登录 token、预览 API、baseRevision 及确认回调。

普通 Agent、用户消息、已撤回/删除消息和仍在本地发送的消息不挂载此卡片。生成预览仍不自动确认；服务端 release/product、用户授权、预览归属、版本冲突及撤回校验继续由既有 API 执行。无 API 合同、迁移、Agent 声明或权限变更。

## 修改与证据

- `MiaoxunRN/src/features/messages/ChatMessageItem.tsx`：专属 UI-Agent 会话补齐预览入口。
- `MiaoxunRN/__tests__/chatContentActions.test.tsx`：新增七项真实消息/卡片组件回归。两个允许会话都能读取差异，只有点按“应用界面调整”才传递预览 ID 和 revision；五种不允许消息不读取或确认预览。仅网络和现有全局辅助依赖使用测试替代，不调用模型或写线上数据。
- RED：新增回归后、实现修改前，UI-Agent 用例因未读取预览而失败；其余 30 项通过。日志 `/tmp/miaoxun-20261111-ui-preview-red.log`。
- GREEN：最小修改后，消息操作和预览卡两套测试 37/37 通过，0 跳过。日志 `/tmp/miaoxun-20261111-ui-preview-green.log`。
- RN TypeScript、目标 ESLint（零 warning）、目标 Prettier 检查均退出 0，日志分别为 `/tmp/miaoxun-20261111-ui-preview-typecheck.log`、`/tmp/miaoxun-20261111-ui-preview-lint.log`、`/tmp/miaoxun-20261111-ui-preview-format.log`。

整仓检查和本轮线上只读结论统一见 `docs/handoffs/CURRENT.md`。本修复尚未分发到 TestFlight；UI-Agent 的真实设备预览、用户确认、持久化、撤销/重置完整验收仍待进行。
