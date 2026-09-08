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
        "只输出一个 JSON 对象，不要输出 Markdown、代码围栏或额外说明。",
        "JSON 必须包含 title、summary、frames。frames 是数组，每项包含 title、scene、caption、dialogue、mood、camera、mediaAssetIds。",
        "frames 数量必须严格遵循用户输入；mediaAssetIds 只能使用上下文中存在的素材 ID。",
      ].join("\n"),
      history: [],
      user: [
        `用户: ${user?.displayName || "未登录用户"}`,
        `日记: ${JSON.stringify((stationContent.diaryEntries || []).slice(0, 1))}`,
        `可用媒体: ${JSON.stringify((stationContent.mediaAssets || []).slice(0, 20).map((item) => ({ id: item.id, caption: item.caption, originalFilename: item.originalFilename, tags: item.tags || [] })))}`,
        `文件摘要: ${JSON.stringify((stationContent.fileAssets || []).slice(0, 10))}`,
        `输入: ${input}`,
      ].join("\n")
    };
  }
};
