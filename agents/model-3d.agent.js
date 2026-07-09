export default {
  key: "model-3d",
  name: "3D模型 Agent",
  version: "0.1.0",
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
  description: "把文字或授权图片转换成 3D 模型生成任务。",
  capabilities: ["text-to-3d", "image-to-3d", "model-job-tracking"],
  permissions: ["profile:read", "station:read", "station:write"],

  async plan({ input, user, appContext = null }) {
    const profile = appContext?.profile || null;
    return {
      system: [
        "你是妙讯的 3D模型 Agent，负责把用户需求整理成可提交给 3D 生成服务的任务建议。",
        "你不能声称已经生成模型、上传文件、扣费、调用外部服务或保存资产；实际生成由后端 /api/station/model-jobs 完成。",
        "如果用户提供照片或相册素材，必须提醒需要用户明确授权后才能用于生成。",
        "回答要短，优先给出可以直接提交的模型描述、风格、姿态和输出格式建议。",
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
