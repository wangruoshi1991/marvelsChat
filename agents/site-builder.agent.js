export default {
  key: "site-builder",
  name: "建站 Agent",
  version: "0.1.0",
  category: "station-builder",
  identity: {
    avatarKind: "agent-mark",
    mark: "站",
    shape: "squircle",
    colors: {
      background: "#0f766e",
      foreground: "#ffffff",
      accent: "#fde68a"
    }
  },
  description: "把自然语言需求转换成妙讯个人主页的结构化草稿。",
  capabilities: ["station-site-draft", "section-planning", "template-recommendation"],
  permissions: ["profile:read", "station:read", "station:write"],

  async plan({ input, user, appContext = null }) {
    const profile = appContext?.profile || null;
    const stationContent = appContext?.stationContent || {};
    const language = profile?.stationConfig?.language || "zh";

    return {
      system: [
        "你是妙讯的建站 Agent，负责把用户自然语言需求转换成个人主页结构化草稿。",
        "只返回一个合法 JSON 对象，不要输出 Markdown、解释、代码块或多余文本。",
        "不要输出 HTML、CSS、JavaScript、iframe、script 或任何可执行内容。",
        "所有字段必须是产品可渲染的纯文本、枚举、数组或 ID 引用。",
        "允许的 theme: clean, warm, gallery, portfolio。",
        "允许的 section.type: hero, about, gallery, diary, contact。",
        "JSON schema: {\"version\":1,\"language\":\"zh|en\",\"title\":\"string\",\"theme\":\"clean|warm|gallery|portfolio\",\"summary\":\"string\",\"sections\":[{\"type\":\"hero|about|gallery|diary|contact\",\"title\":\"string\",\"subtitle\":\"string\",\"body\":\"string\",\"assetIds\":[\"string\"],\"diaryEntryIds\":[\"string\"],\"actions\":[{\"label\":\"string\",\"kind\":\"message|follow|link\",\"href\":\"string\"}]}]}",
        "优先复用提供的 mediaAssets、diaryEntries、albums 和 profile 信息；不要编造不存在的资源 ID。",
        "如果缺少素材，仍然生成可预览的文字型主页草稿。",
        `当前语言: ${language}`,
      ].join("\n"),
      history: [],
      user: [
        `用户: ${user?.displayName || "未登录用户"}`,
        `AI ID: ${user?.aiId || "未登录"}`,
        `昵称: ${profile?.nickname || user?.displayName || "未设置"}`,
        `简介: ${profile?.bio || "未设置"}`,
        `社区: ${profile?.community || "未设置"}`,
        `活动区域: ${profile?.activityArea || "未设置"}`,
        `相册: ${JSON.stringify((stationContent.albums || []).slice(0, 8))}`,
        `媒体: ${JSON.stringify((stationContent.mediaAssets || []).slice(0, 12))}`,
        `日记: ${JSON.stringify((stationContent.diaryEntries || []).slice(0, 8))}`,
        `穿搭: ${JSON.stringify((stationContent.outfits || []).slice(0, 6))}`,
        `用户需求: ${input}`,
      ].join("\n")
    };
  }
};
