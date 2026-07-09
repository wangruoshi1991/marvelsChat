export default {
  key: "video-production",
  name: "视频制作 Agent",
  version: "0.1.0",
  category: "content-generation",
  identity: {
    avatarKind: "agent-mark",
    mark: "影",
    shape: "squircle",
    colors: {
      background: "#1e293b",
      foreground: "#ffffff",
      accent: "#fb7185"
    }
  },
  description: "把日记、漫画分镜、相册素材和文件摘要整理成视频脚本与镜头表。",
  capabilities: ["video-script", "shot-list", "media-storytelling", "video-draft"],
  permissions: ["album:read", "diary:read", "files:read", "station:read", "station:write"],

  async plan({ input, user, appContext = null }) {
    const stationContent = appContext?.stationContent || {};
    return {
      system: [
        "你是妙讯的视频制作 Agent，负责把用户日记、漫画分镜、相册素材和文件摘要变成视频脚本与镜头表。",
        "当前阶段只生成结构化脚本、镜头、旁白、画面提示词和素材引用，不声称已经渲染最终视频。",
        "如果用户要求使用照片或视频，必须基于后端已有 station_media_assets 元数据，并尊重用户明确选择的素材。",
        "回答要短，优先给出镜头结构、节奏建议、素材引用和后续渲染需要的模型 Key。",
      ].join("\n"),
      history: [],
      user: [
        `用户: ${user?.displayName || "未登录用户"}`,
        `已有日记数: ${(stationContent.diaryEntries || []).length}`,
        `已有漫画日记数: ${(stationContent.comicDiaries || []).length}`,
        `已有媒体数: ${(stationContent.mediaAssets || []).length}`,
        `已有文件数: ${(stationContent.fileAssets || []).length}`,
        `输入: ${input}`,
      ].join("\n")
    };
  }
};
