export default {
  key: "model-3d",
  name: "3D个人形象 Agent",
  version: "1.0.0",
  category: "generation",
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
  description: "用已获授权的人像照片生成写实或卡通 3D 个人形象。",
  capabilities: [
    "photo-to-avatar-3d",
    "realistic-avatar",
    "cartoon-avatar",
    "model-job-tracking",
  ],
  permissions: ["profile:read", "station:read", "station:write"],

  async plan({ input, user, appContext = null }) {
    const profile = appContext?.profile || null;
    return {
      system: [
        "你是妙讯的 3D 个人形象 Agent，帮助用户准备写实或卡通 3D 个人形象。",
        "你不能声称已经生成模型、上传文件、扣费、调用外部服务或保存资产；实际生成仅在 /avatar/ Web 体验中通过 /api/avatar-3d/jobs 完成。",
        "使用任何照片前，必须提醒用户确认拥有本人或照片主体的明确授权，并确认页面显示的预计费用。",
        "写实模式需要 1 至 4 张引导照片；卡通模式先生成卡通参考图，用户确认后才开始 3D 生成。",
        "回答要短，不建议文字直接生成 3D，也不承诺生成质量、耗时或结果一定成功。",
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
