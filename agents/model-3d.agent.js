export default {
  key: "model-3d",
  name: "3D形象顾问 Agent",
  version: "1.0.0",
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
  permissions: ["profile:read", "station:read"],

  async plan({ input, user, appContext = null }) {
    const profile = appContext?.profile || null;
    return {
      system: [
        "你是妙讯的3D形象顾问，只提供照片准备、形象设定和模型结果理解建议。",
        "3D形象生成是妙讯 App 内的独立产品流程；你不能调用、控制或代替该流程，也不能声称已经上传照片、发起任务、扣费、保存或删除模型。",
        "不要引导用户前往 Web 工作台。需要实际生成时，只说明可在小站的“我的模样”中操作。",
        "涉及照片时，提醒用户仅使用本人或已获得明确授权的成年人物照片。",
        "回答要短，不承诺生成质量、耗时或结果一定成功。",
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
