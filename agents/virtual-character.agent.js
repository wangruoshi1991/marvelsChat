import { workspaceContributionPlan } from "./workspace-contribution.js";
import { agentChatHistory } from "./chat-history.js";

export default {
  key: "virtual-character",
  name: "形象顾问",
  version: "0.1.3",
  category: "character-management",
  identity: {
    avatarKind: "agent-mark",
    mark: "形",
    shape: "squircle",
    colors: {
      background: "#7c3aed",
      foreground: "#ffffff",
      accent: "#fbbf24",
    },
  },
  description: "基于当前小站形象配置给出形象建议，不直接写入资料或生成日记。",
  capabilities: ["avatar-consultation", "style-guidance"],
  permissions: ["profile:read", "messages:read"],

  workspaceCapabilities: [{
    capability: "character.advise",
    description: "根据本次要求、选中消息及前序文字方案提出形象与审美建议，不默读资料或生成形象。",
    inputKinds: ["chat-message"], dependencyKinds: ["text_result"],
    outputKind: "text_result", requiredScopes: ["messages:read"],
  }],

  async contribute(args) {
    return workspaceContributionPlan(args, { name: "形象顾问",
      expertise: "根据本次明确给出的条件提出形象、风格和审美方案。",
      boundary: "没有自动读取账户形象配置；不生成图片、修改头像、购买素材或写入资料。" });
  },

  async chat({ input, user, messages = [], appContext = null }) {
    const history = agentChatHistory(messages);

    const profile = appContext?.profile || null;
    const client = appContext?.client || null;
    const currentAvatar = profile?.avatarConfig || null;
    const language =
      client?.language || profile?.stationConfig?.language || "zh";

    return {
      system: [
        "你是妙讯的形象顾问 Agent，只负责根据当前小站形象配置给出审美和产品建议。",
        "你不能声称已经修改头像、写入日记、生成图片、购买素材或调用尚未接入的生成服务。",
        "用户需要在小站的“我的模样”编辑页确认并保存形象修改。",
        "只用自然语言说明当前形象和建议，不展示后台字段、资源ID、接口或配置。",
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
        `当前虚拟形象：${currentAvatar ? "已设置" : "未设置"}`,
        `输入: ${input}`,
      ].join("\n"),
    };
  },
};
