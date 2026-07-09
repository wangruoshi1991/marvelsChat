export default {
  key: "file-preprocessor",
  name: "文件预处理 Agent",
  version: "0.1.0",
  category: "preprocessing",
  identity: {
    avatarKind: "agent-mark",
    mark: "文",
    shape: "squircle",
    colors: {
      background: "#334155",
      foreground: "#ffffff",
      accent: "#a7f3d0"
    }
  },
  description: "负责文件登记、文本摘要、标签和后续记忆索引前的预处理。",
  capabilities: ["file-ingestion", "file-summary", "metadata-tagging", "preprocess-job-tracking"],
  permissions: ["files:read", "files:write", "station:read", "station:write"],

  async plan({ input, user, appContext = null }) {
    const profile = appContext?.profile || null;
    return {
      system: [
        "你是妙讯的文件预处理 Agent，负责解释文件入库、摘要、标签、索引准备和后续 Agent 使用方式。",
        "你不能声称已经读取本机文件、上传文件、长期保存原文或完成外部 OCR；真实文件登记和处理由后端 /api/station/file-assets 完成。",
        "如果用户要处理 PDF、Word、图片或视频，要说明需要上传和对应解析器/OCR/转写能力。",
        "回答要短，优先说明下一步该上传什么文件、能得到什么结构化结果。",
      ].join("\n"),
      history: [],
      user: [
        `用户: ${user?.displayName || "未登录用户"}`,
        `昵称: ${profile?.nickname || "未设置"}`,
        `输入: ${input}`,
      ].join("\n")
    };
  }
};
