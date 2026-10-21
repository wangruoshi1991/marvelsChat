import { specialistDispatchPlan } from "./specialist-dispatch.js";
import { workspaceContributionPlan } from "./workspace-contribution.js";
import { agentChatHistory } from "./chat-history.js";

export default {
  key: "model-3d",
  name: "3D形象顾问 Agent",
  version: "1.0.1",
  category: "advisory",
  identity: {
    avatarKind: "agent-mark",
    mark: "3D",
    shape: "squircle",
    colors: {
      background: "#1f2937",
      foreground: "#ffffff",
      accent: "#38bdf8"
    }
  },
  description: "提供照片准备、形象设定和模型结果理解建议，不直接发起3D生成。",
  capabilities: [
    "avatar-planning",
    "photo-readiness-guidance",
    "model-result-guidance",
  ],
  permissions: ["profile:read", "messages:read", "station:read"],

  workspaceCapabilities: [{
    capability: "model.advise",
    description: "对本次文字要求、选中消息及前序文字方案提供3D照片准备和形象建议，不执行3D生成。",
    inputKinds: ["chat-message"], dependencyKinds: ["text_result"],
    outputKind: "text_result", requiredScopes: ["messages:read"],
  }],

  async contribute(args) {
    return workspaceContributionPlan(args, { name: "3D形象顾问",
      expertise: "给出3D照片准备、形象设定和结果理解的文字建议。",
      boundary: "3D生成仍是独立产品流程；不能发起、控制或代替3D任务，不生成模型、不扣费或保存模型。" });
  },

  async dispatch(args) {
    return specialistDispatchPlan(args, this);
  },

  async chat({ input, user, messages = [], appContext = null }) {
    const prompt = await this.plan({ input, user, appContext });
    return { ...prompt, history: agentChatHistory(messages) };
  },

  async plan({ input, user, appContext = null }) {
    const profile = appContext?.profile || null;
    return {
      system: [
        "你是妙讯的3D形象顾问，只提供照片准备、形象设定和模型结果理解建议。",
        "3D形象生成是妙讯 App 内的独立产品流程；你不能调用、控制或代替该流程，也不能声称已经上传照片、发起任务、扣费、保存或删除模型。",
        "不要引导用户前往 Web 工作台。需要实际生成时，只说明可在小站的“我的模样”中操作。",
        "涉及照片时，提醒用户仅使用本人或已获得明确授权的成年人物照片。",
        "回答要短，不承诺生成质量、耗时或结果一定成功。",
        "普通聊天不要输出JSON、后台字段、接口、资源ID或模型配置，用简短的自然语言回答。",
        `当前语言：${appContext?.client?.language || "zh"}，按当前语言回答。`,
      ].join("\n"),
      history: [],
      user: [
        `用户: ${user?.displayName || "未登录用户"}`,
        `AI ID: ${user?.aiId || "未登录"}`,
        `昵称: ${profile?.nickname || "未设置"}`,
        `简介: ${profile?.bio || "未设置"}`,
        `输入: ${input}`,
      ].join("\n")
    };
  }
};
