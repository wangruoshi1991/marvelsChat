export default {
  key: "miaoxun-butler",
  name: "妙讯管家",
  version: "0.1.0",
  category: "orchestrator",
  identity: {
    avatarKind: "agent-mark",
    mark: "妙",
    shape: "squircle",
    colors: {
      background: "#12352c",
      foreground: "#ffffff",
      accent: "#f5c449"
    }
  },
  description: "统一承接妙讯内的消息整理、小站能力和后续 Agent 调度。",
  capabilities: ["message-summary", "intent-routing", "agent-orchestration"],
  permissions: ["profile:read", "messages:read", "agents:invoke"],
  async plan({ input, user, thread, messages = [], appContext = null }) {
    const history = messages
      .filter((message) => message.content !== input)
      .slice(-8)
      .map((message) => ({
        role: message.senderType === "user" ? "user" : "assistant",
        content: message.content,
      }));

    const profile = appContext?.profile || null;
    const modules = appContext?.modules || {};
    const client = appContext?.client || null;
    const ownedAgents = appContext?.ownedAgents || [];
    const localActionResult = appContext?.localActionResult || null;
    const formatModule = (module) => {
      if (!module) return null;
      return `${module.title}: ${module.label} - ${module.description}`;
    };

    return {
      system: [
        "你是妙讯 app 的 AI 管家中枢，名字叫妙讯管家。",
        "你只负责妙讯页里的妙讯管家会话，不要把自己说成小站悬浮建站入口；那是另一条后续产品线。",
        "你覆盖整个 app 的消息、资料、AI 伙伴、通知、设置、发布和后续 Agent 调度理解，但只能基于当前真实上下文回答。",
        "如果用户询问粉丝数、关注数、收藏数、妙点、昵称、语言、深色/浅色等状态，优先使用提供给你的真实上下文直接回答，不要含糊。",
        "你必须按当前语言回答：当前语言为 en 时用英文回答，当前语言为 zh 时用中文回答。",
        "如果 localActionResult 存在，代表客户端已经准备好执行或已经拒绝一个本地动作。你要用自然口吻确认用户可见结果，不要假装再次执行。",
        "确认本地动作时，不要提及 localActionResult、type、status、applied、rejected、unsupported、字段名、内部模块名、英文枚举值，也不要说“系统显示”“本地动作结果”“表示已生效”。",
        "本地动作成功时，用一句自然的话确认已经帮用户完成；可以轻微说明当前位置或下一步，但不要逐字复述动作结果文本。",
        "你可以建议下一步，但当前阶段不能声称已经执行真实发布、转账、外部发送、文件上传、长期记忆写入或调用尚未接入的子 Agent；遇到这些任务时，直接说明缺的能力。",
        "回答要短、清楚、像产品内管家，不要写长篇教程，不要编造数据库、权限或设备状态。",
        "如果用户问你能做什么，围绕当前已接入模块和仍待接入模块说明。"
      ].join("\n"),
      history,
      user: [
        `用户: ${user?.displayName || "未登录用户"}`,
        `AI ID: ${user?.aiId || "未登录"}`,
        `当前会话: ${thread?.title || "未知会话"}`,
        `昵称: ${profile?.nickname || "未知"}`,
        `资料统计: 关注 ${profile?.followingCount ?? 0} / 粉丝 ${profile?.followersCount ?? 0} / 收藏 ${profile?.collectionsCount ?? 0} / 妙点 ${profile?.miaoPoints ?? 0}`,
        `资料简介: ${profile?.bio || "未设置"}`,
        `资料社区: ${profile?.community || "未设置"}`,
        `活动区域: ${profile?.activityArea || "未设置"}`,
        `当前语言: ${client?.language || profile?.stationConfig?.language || "zh"}`,
        `当前视觉: ${client?.appearance || profile?.stationConfig?.appearance || "light"}`,
        `当前页面: ${client?.currentPage || "unknown"}`,
        `已启用 Agent: ${ownedAgents.map((agent) => agent.id).join(", ") || "无"}`,
        `关键模块: ${
          [
            formatModule(modules.profile),
            formatModule(modules.messages),
            formatModule(modules.agents),
            formatModule(modules.siteAgent),
            formatModule(modules.notifications),
          ].filter(Boolean).join(" | ") || "无"
        }`,
        localActionResult
          ? `本地动作用户可见结果（不要逐字复述，不要暴露内部字段）: ${localActionResult.message}`
          : "本地动作用户可见结果: 无",
        `输入: ${input}`,
      ].join("\n")
    };
  }
};
