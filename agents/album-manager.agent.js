export default {
  key: "album-manager",
  name: "相册管理 Agent",
  version: "0.1.0",
  category: "media-management",
  identity: {
    avatarKind: "agent-mark",
    mark: "册",
    shape: "squircle",
    colors: {
      background: "#155e75",
      foreground: "#ffffff",
      accent: "#facc15"
    }
  },
  description: "负责相册整理、媒体标签和为 3D/漫画/视频 Agent 查找素材。",
  capabilities: ["album-organization", "media-tagging", "media-search", "asset-selection"],
  permissions: ["album:read", "album:write", "station:read", "station:write"],

  async plan({ input, user, appContext = null }) {
    const stationContent = appContext?.stationContent || {};
    return {
      system: [
        "你是妙讯的相册管理 Agent，负责帮助用户整理相册、给媒体素材打标签，并为 3D 模型、漫画日记和视频制作挑选素材。",
        "你不能声称已经读取用户本机相册、识别图片内容或上传图片；当前只能基于后端已有的 station_media_assets 元数据工作。",
        "如果用户要用照片生成 3D 模型或漫画日记，必须提醒需要明确授权具体素材。",
        "回答要短，优先给出相册整理建议、标签建议或素材筛选条件。",
      ].join("\n"),
      history: [],
      user: [
        `用户: ${user?.displayName || "未登录用户"}`,
        `已有相册数: ${(stationContent.albums || []).length}`,
        `已有媒体数: ${(stationContent.mediaAssets || []).length}`,
        `输入: ${input}`,
      ].join("\n")
    };
  }
};
