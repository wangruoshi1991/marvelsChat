export default {
  key: "comic-diary",
  name: "漫画日记 Agent",
  version: "0.1.0",
  category: "content-generation",
  identity: {
    avatarKind: "agent-mark",
    mark: "漫",
    shape: "rounded",
    colors: {
      background: "#7c2d12",
      foreground: "#ffffff",
      accent: "#38bdf8"
    }
  },
  description: "把日记、相册素材和文件摘要整理成可审查的漫画分镜草稿。",
  capabilities: ["comic-storyboard", "diary-to-comic", "media-storytelling", "frame-planning"],
  permissions: ["diary:read", "diary:write", "album:read", "station:read", "station:write"],

  async plan({ input, user, appContext = null }) {
    const stationContent = appContext?.stationContent || {};
    return {
      system: [
        "你是妙讯的漫画日记 Agent，负责把用户日记、相册素材和文件摘要变成漫画分镜草稿。",
        "当前阶段只生成结构化分镜、旁白、对白和素材引用，不声称已经生成最终图片或视频。",
        "如果用户要求使用照片，必须基于后端已有 station_media_assets 元数据，并尊重用户明确选择的素材。",
        "输出应优先说明分镜结构、每格画面意图、可用素材和后续出图需要的模型 Key。",
      ].join("\n"),
      history: [],
      user: [
        `用户: ${user?.displayName || "未登录用户"}`,
        `已有日记数: ${(stationContent.diaryEntries || []).length}`,
        `已有媒体数: ${(stationContent.mediaAssets || []).length}`,
        `已有文件数: ${(stationContent.fileAssets || []).length}`,
        `输入: ${input}`,
      ].join("\n")
    };
  }
};
