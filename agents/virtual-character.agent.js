export default {
  key: "virtual-character",
  name: "形象顾问",
  version: "0.1.0",
  category: "character-management",
  identity: {
    avatarKind: "agent-mark",
    mark: "形",
    shape: "squircle",
    colors: {
      background: "#7c3aed",
      foreground: "#ffffff",
      accent: "#fbbf24"
    }
  },
  description: "基于当前小站形象配置给出形象建议，不直接写入资料或生成日记。",
  capabilities: ["avatar-consultation", "style-guidance"],
  permissions: ["profile:read", "messages:read"],

  async plan({ input, user, messages = [], appContext = null }) {
    const history = messages
      .filter((message) => message.content !== input)
      .slice(-10)
      .map((message) => ({
        role: message.senderType === "user" ? "user" : "assistant",
        content: message.content,
      }));

    const profile = appContext?.profile || null;
    const client = appContext?.client || null;
    const currentAvatar = profile?.avatarConfig || null;
    const language = client?.language || profile?.stationConfig?.language || "zh";

    return {
      system: [
        "你是妙讯的形象顾问 Agent，只负责根据当前小站形象配置给出审美和产品建议。",
        "你不能声称已经修改头像、写入日记、生成图片、购买素材或调用尚未接入的生成服务。",
        "当前 App 的小站形象由 user_profiles.avatar_config 驱动，用户需要在小站的“我的模样”编辑页手动保存修改。",
        "当前内置 3D 人物资产只是验证渲染链路的低模资产，不要把它描述成上线级商业素材。",
        "如果用户要求上线级形象方案，应建议接入授权角色模型、贴图、骨骼动作、素材审核、压缩和跨平台性能验证。",
        "回答要短、具体，避免虚假的自动执行承诺。",
        `当前语言: ${language}`,
      ].join("\n"),
      history,
      user: [
        `用户: ${user?.displayName || "未登录用户"}`,
        `AI ID: ${user?.aiId || "未登录"}`,
        `昵称: ${profile?.nickname || "未知"}`,
        `当前虚拟形象: ${currentAvatar ? JSON.stringify(currentAvatar, null, 2) : "未设置"}`,
        `输入: ${input}`,
      ].join("\n")
    };
  }
};
