# Agent 接入说明

更新：2026-10-20。本页描述当前工作区代码能力，运行共用同一API、两个Worker和数据库，不为Agent建立单独服务。正式部署、安装包与验收证据见[当前交接](handoffs/CURRENT.md)；代码已实现不等于产品链路已通过真机验收。

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
  identity: {
    avatarKind: "agent-mark",
    mark: "助",
    shape: "squircle",
    colors: { background: "#12352c", foreground: "#ffffff", accent: "#f5c449" }
  },
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

- `miaoxun-butler`：妙讯管家，按需求决定回答、澄清或创建协作任务，运行时依据真实能力目录动态选人、规划与汇总；前端不按关键词拦截需求或预先声称已完成操作。
- `virtual-character`：形象顾问，基于当前形象配置提供建议，不直接修改资料。
- `site-builder`：生成经过严格校验的私有结构页面草稿；完整预览并确认后保存，参与协作时只消费本次所选/交付素材。
- `model-3d`：提供照片准备、形象设定和模型理解建议，不发起 3D 任务或扣费。
- `album-manager`：通过受控工具检索真实图片/视频，在协作中交付绑定内容版本的精确素材选择；云端同意、owner与授权按调用重验。原按固定关键词/文件名推标签、分组并生成置信度的建议服务已删除；上传与编辑仅使用用户明确标签。原生视觉索引直接处理获准的原图/视频帧，不依赖这些旧规则。
- `file-preprocessor`：普通会话提供文件处理建议，`text.summarize`处理明确选中消息，新增`file.summary`消费成功上传并完整保存的UTF-8文本及消息，交付持久摘要。文件引用使用`files:read`、owner和完整内容版本校验；预览至多1000字符且标记截断，执行不截断正文。支持格式、上传核对和删除边界见[文件处理](file-processing.md)。
- `comic-diary`：普通对话使用自然文字；协作能力`comic.storyboard`交付可读文字分镜；日记详情另有保存结构化分镜草稿的明确流程。尚无最终生图。草稿接口要求完整声明授权，只发送本次明确选定的日记/媒体窄字段；无选择不读取全库，不接未声明的文件来源；调用及保存前重验授权、原声明和来源，成功审计与保存同事务，公共结果不返回模型审计元数据。
- `video-production`：普通对话及协作能力`video.script`提供文字脚本和镜头计划，配置文本模型后即可执行，不依赖OSS。视频供应商与渲染队列尚未接入，不生成成片；旧的不可用生成接口和面板已移除，已有草稿只保留读取。

漫画日记的结构化保存接口只接受一个完整JSON对象，严格检查字段、字数、指定格数和媒体归属。模型缺字段、围栏/混合文字、超长输出、重复或未选素材都明确失败，不补标题、截断文字或抽取JSON后伪装成功。用户省略风格/格数时采用`slice-of-life`/4格，显式无效值直接拒绝。此契约仅用于保存分镜；普通聊天和协作文字成果不套固定结构。

当前后端通过 `backend/src/agent-runtime.js` 调用 Agent。

- `backend/.env` 中 `NEW_API_BASE_URL`、`NEW_API_KEY`、`NEW_API_MODEL` 都存在时，聊天线程可调用模型服务。
- `POST /api/threads/:threadId/messages` 根据已鉴权线程的 `agent_id` 加载Agent。本地7个专业会话（含相册）使用严格`dispatch`区分咨询、澄清与明确交办；新请求要求任务1/协作6声明及稳定`clientMessageId`。咨询和澄清返回真实消息，不建任务；交办把原文需求链、任务与回复同事务保存，返回201及`agentWorkspace.id`，之后AI Worker异步执行。专业`direct`任务固定原Agent/版本/能力，不调用管家；管家`coordinated`任务仍按真实授权能力目录选人。旧已接受相册key保留原ai_tasks/Worker/素材回放，重放200且不另建工作空间。
- 7个专业Agent明确声明`dispatch`，共用版本1专业分派协议；咨询答复不冒充任务执行或保存。保留的`chat`方法服务于明确普通对话调用，不回落到结构化生成`plan`。管家使用其独立`dispatch`/`coordinate`协议，绑定原任务讨论使用`discussWorkspace`；相册节点使用受控工具真实检索。供应商返回值必须具有合法结束原因；缺失、未知或截断结果不算成功，不自动切模型或供应商。
- Agent 会话在写入用户消息前校验注册状态和当前账号授权；已移除或已注销的 Agent 不能通过旧会话继续调用。
- Agent 消息创建按账号执行独立限流，避免旧会话、脚本或异常客户端无限触发模型调用；好友 direct 消息不使用这个模型调用限额。
- `permissions` 是 Agent 注册声明的完整授权范围，`user_agents.granted_scopes` 保存账号明确确认的范围。二者集合一致才可启用或执行；除下条默认管家约定外，旧不完整或声明已变化的授权要求移除后重新添加，不自动补权。资料、历史消息、小站内容及编排上下文仍由后端按当前权限和任务范围提供。
- `PATCH /api/me/agents/:agentId` 与 `PATCH /api/admin/users/:userId/agents/:agentId` 在 `enabled:true` 时必须显式传完整 `grantedScopes` 数组；省略、`null`、非数组、空/部分范围及声明外范围均拒绝且不写授权或创建会话。声明本身为空时可明确确认空数组。`enabled:false` 可省略范围，最终统一撤回为空范围。按用户要求，本地注册/管理员建号事务及迁移040默认启用妙讯管家并授予其当前完整声明；其他Agent仍须明确添加授权，旧不完整授权不静默扩权。相册云端同意仅由本人确认，后台不能代签。040尚未部署，不能当作线上已生效。
- 未配置模型或调用失败时，用户消息、失败审计和明确的服务失败提示会写入 PostgreSQL；App 不接收供应商原始错误信息，也不会伪造成功回复或 token 用量。
- 接入真实模型供应商后，后端会写入 `token_prompt`、`token_completion`、`token_total`。

“已注册”“已加入用户 AI 伙伴”“可进行模型对话”和“已完成最终业务产物”是四种不同状态。
`agentReadiness` 用于公开配置和能力缺口；3D 生成、漫画出图、视频渲染等独立业务流程不能用
Agent 注册状态代替。

## 多 Agent 接入与后续能力

前端不决定模型、提示词或密钥。当前链路为：

```text
MiaoxunRN/admin -> backend API -> PostgreSQL任务/协作节点
                              -> AI Worker -> registered agent/runtime -> model/tool provider -> 回执与成果
```

客户端管理需求草稿、Agent目录与授权展示、运行任务、完整预览和错误提示；注册、权限判断、模型调用与审计留在后端。当前任务/协作以API恢复和轮询展示状态，通用流式回复尚未完成。

已落地与后续边界：

1. 单Agent会话与任务：专业会话固定原Agent，明确交办通过042直接工作空间复用原节点、回执、041轮次和审批；普通咨询不建任务。旧已接受相册任务与独立建站入口仍保留036持久任务；`agent_runs` 是消息运行审计，不作为任意通用任务创建入口。
2. 授权：App“我 → AI伙伴”添加Agent时确认完整声明范围，确认后原子添加/授权；移除即撤权，不完整授权要求移除后重新添加。二楼只管理账号隐私。后台仍有独立权限接口；上述默认管家约定之外，历史授权不自动扩大。
3. 动态协作：037工作空间保存共同目标、授权快照和依赖节点，由主管选择实际已接入且授权的专业能力；执行前与成果交接时再次校验。
4. 结构页面：私有草稿与当前页面使用相同严格渲染器；支持查看绑定素材/日记，链接/消息/关注仅保存未接通意图。外部发布或发送需要另行实现工具、权限、确认与回执。
5. 后续能力：通用流式输出、递归委派、定时任务、可管理长期记忆和任意工具断点恢复仍未交付，不以注册文件或提示词替代。

## 原则

- 前端不直接引入 Agent 文件。
- 后端通过 `agents/registry.js` 加载 Agent。
- 每次调用保留可追溯运行记录：现有会话使用 `agent_runs`，协作节点使用持久调用回执，记录成功、失败、耗时和真实用量；不能伪造供应商未报告的字段。
- Agent 涉及发布、外部发送、长期记忆或敏感权限时，必须走用户确认。

## 可执行能力与本地合同6工作区

Agent独立模块通过 `workspaceCapabilities` 声明输入引用类型、依赖成果、输出类型与必要权限。registry严格验证声明，后端执行器必须实现匹配合同；名称或提示词本身不具备执行权。管家可协调相册选材与建站页面，并通过明确的`contribute`运行模式交付`text_result`，包括文件文字摘要、漫画分镜、视频脚本、形象建议和管家汇总，不以普通聊天作为执行器兜底。各Agent可声明多个真实能力，逐个匹配执行合同。

当前本地App/API/Worker使用协作合同6，迁移042保留`coordinated`并新增严格专业会话来源`direct`；保留`request_access`、038提交结果账本、039未确认页面来源和041轮次。正式部署最后核验仍为合同3/039，详见当前交接，不新增服务或供应商环境变量。管家内容澄清使用`clarify`与`followups`，专业分派以`agentClarification`恢复明确需求链，可用`agentContextReset`重新开始；缺权不能通过回复扩大旧任务快照。仅我页添加时确认全部声明权限；已有不完整授权移除重加，新权限只在新任务生效。文本成果继承全部明确来源，下游以自己的范围重验，不共享私聊或全库。文字成果只投影`kind/id/title`，正文通过`GET /api/agent-workspaces/:workspaceId/text/:nodeId`重新校验当前授权与原始来源后读取；列表、取消或重放不携带正文。PDF/DOCX解析、生图与成片仍未接入，详见[需求驱动协作](agent-workspace-architecture.md#按需求组织协作合同3工作区)。

运行共用现有Node API、AI Worker与PostgreSQL。架构决策与初版合同可参考[协作闭环历史](reviews/2026-10-12-agent-collaboration.md)；现行合同见[统一AI交互](ai-interaction-system.md#任务1页面2与协作3合同)，部署状态只以[当前交接](handoffs/CURRENT.md)中的运行证据为准。

## 文件输入（本地合同6，迁移043）

已接入UTF-8 TXT/Markdown/JSON/CSV/TSV设备上传、完整正文和`station-file`版本引用。文件Agent的`file.summary`消费获准文件/消息并保留全部来源，`text.summarize`仍处理消息；分派只见文件元信息，正文仅交给专业持久任务。管家没有新增`files:read`，本阶段由二楼文件进入原专业会话的`direct`任务，不自动扩权或转交私聊。删除/变更来源或撤权后，历史保留但正文与续作不可用。格式、大小、上传幂等、正文核对、删除、迁移和保留边界详见[文件处理](file-processing.md)。PDF/DOCX、OCR、生图、成片和协作3D仍未接入；本地源码不代表生产或真机验收。
