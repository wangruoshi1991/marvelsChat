# Agent 接入说明

Agent 独立放在 `agents/` 目录。文件名使用：

```text
xxx.agent.js
```

## Agent 结构

```js
export default {
  key: "agent-key",
  name: "Agent 名称",
  version: "0.1.0",
  category: "orchestrator",
  description: "Agent 做什么",
  capabilities: ["ability-a"],
  permissions: ["scope:read"],
  async plan({ input, user }) {
    return {
      system: "系统提示词",
      user: `用户输入: ${input}`
    };
  }
};
```

## 当前 Agent

- `miaoxun-butler.agent.js`：妙讯管家，负责统一承接消息整理、小站能力和后续 Agent 调度。

当前后端通过 `backend/src/agent-runtime.js` 调用 Agent。

- `backend/.env` 中 `NEW_API_BASE_URL`、`NEW_API_KEY`、`NEW_API_MODEL` 都存在时，会调用 OpenAI-compatible chat completions。当前本地测试配置使用 `https://api.z.ai/api/paas/v4` 和 `glm-4.5-air`，需要视觉能力时可切到 `glm-4.6v`。
- 未配置 New API 时，消息仍会真实写入 PostgreSQL，运行记录的 `provider` 为 `not-configured`，并且不会伪造 token 用量。
- 接入真实模型供应商后，后端会写入 `token_prompt`、`token_completion`、`token_total`。

## 多 Agent 接入方向

后续不要让前端直接决定“调用哪个模型、拼什么提示词、用什么密钥”。推荐保持这条链路：

```text
iOS/admin -> backend API -> agent runtime -> registered agent -> model/tool provider -> PostgreSQL audit log
```

客户端可以管理 Agent 交互状态，例如 Agent 列表、授权状态、运行中任务、流式回复和错误提示；但 Agent 的注册、权限判断、模型调用和审计必须留在后端。

建议分阶段实现：

1. 单 Agent 会话：继续沿用当前 `POST /api/threads/:threadId/messages`，由线程绑定 `agent_id`。
2. Agent 授权：后台管理按用户开启/关闭 Agent，并配置 scopes。
3. 显式任务：新增 `agent_runs` 创建接口，支持非聊天类任务，例如发布、整理文件、生成小站内容。
4. 实时事件：为长任务新增 SSE 或 WebSocket，前端订阅进度，不轮询数据库。
5. 多 Agent 编排：由后端 orchestrator 选择子 Agent，记录每一步调用和权限确认。

## 原则

- 前端不直接引入 Agent 文件。
- 后端通过 `agents/registry.js` 加载 Agent。
- 每次调用需要写入 `agent_runs`，便于后台管理平台查看成功、失败、耗时和真实 token。
- Agent 涉及发布、外部发送、长期记忆或敏感权限时，必须走用户确认。
