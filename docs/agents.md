# Agent 接入说明

Agent 独立放在 `agents/` 目录。文件名使用：

```text
xxx.agent.js
```

文件名必须与导出的 `key` 完全一致，例如 `model-3d.agent.js` 必须声明
`key: "model-3d"`。注册器会拒绝文件名不匹配、重复 key 或非法 identity，不再通过
扫描其他文件兼容错误命名。

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

- `miaoxun-butler`：妙讯管家，负责 App 上下文理解和后续编排入口。
- `virtual-character`：形象顾问，基于当前形象配置提供建议，不直接修改资料。
- `site-builder`：生成经过校验的结构化个人主页草稿。
- `model-3d`：提供照片准备、形象设定和模型理解建议，不发起 3D 任务或扣费。
- `album-manager`：基于后端已有相册和媒体元数据提供整理、标签和筛选建议。
- `file-preprocessor`：提供文件登记、摘要、标签和索引准备建议；解析器仍需按格式接入。
- `comic-diary`：生成并持久化可审查的漫画分镜结构，不生成最终漫画图片。
- `video-production`：当前只定义视频脚本和镜头计划；视频供应商与渲染队列尚未接入，readiness 固定为不可用。

当前后端通过 `backend/src/agent-runtime.js` 调用 Agent。

- `backend/.env` 中 `NEW_API_BASE_URL`、`NEW_API_KEY`、`NEW_API_MODEL` 都存在时，聊天线程可调用模型服务。
- `POST /api/threads/:threadId/messages` 根据线程的 `agent_id` 加载对应 Agent，按账号授权把资料、模块、已授权 Agent 与当前小站内容传入 plan，再调用模型并写入消息与 `agent_runs`。
- Agent 会话在写入用户消息前校验注册状态和当前账号授权；已移除或已注销的 Agent 不能通过旧会话继续调用。
- Agent 消息创建按账号执行独立限流，避免旧会话、脚本或异常客户端无限触发模型调用；好友 direct 消息不使用这个模型调用限额。
- `permissions` 是 Agent 注册层允许申请的 scope 上限，`user_agents.granted_scopes` 是账号实际授权。后端拒绝声明外 scope，并只按实际授权注入资料、聊天历史、小站内容和编排上下文。
- 未配置模型或调用失败时，用户消息、失败审计和明确的服务失败提示会写入 PostgreSQL；App 不接收供应商原始错误信息，也不会伪造成功回复或 token 用量。
- 接入真实模型供应商后，后端会写入 `token_prompt`、`token_completion`、`token_total`。

“已注册”“已加入用户 AI 伙伴”“可进行模型对话”和“已完成最终业务产物”是四种不同状态。
`agentReadiness` 用于公开配置和能力缺口；3D 生成、漫画出图、视频渲染等独立业务流程不能用
Agent 注册状态代替。

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
