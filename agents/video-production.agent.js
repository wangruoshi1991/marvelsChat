import { workspaceContributionPlan } from "./workspace-contribution.js";
import { agentChatHistory } from "./chat-history.js";

export default {
  key: "video-production",
  name: "视频制作 Agent",
  version: "0.1.3",
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
  permissions: ["messages:read", "album:read", "diary:read", "files:read", "station:read", "station:write"],

  workspaceCapabilities: [{
    capability: "video.script",
    description: "根据目标、明确选中的日记/素材说明及前序成果编写视频脚本与镜头方案，不渲染成片。",
    inputKinds: ["chat-message", "station-diary", "station-photo"], dependencyKinds: ["text_result", "media_selection"],
    outputKind: "text_result", requiredScopes: ["messages:read", "station:read", "album:read"],
  }],

  async contribute(args) {
    return workspaceContributionPlan(args, { name: "视频脚本助手",
      expertise: "编写视频脚本、节奏、镜头、旁白和剪辑建议，结合明确交付的文字与素材说明。",
      boundary: "此次只交付文字脚本，不渲染、剪辑、上传或发布视频；素材说明不等于看过完整视频。" });
  },

  async chat({ input, user, messages = [], appContext = null }) {
    const prompt = await this.plan({ input, user, appContext });
    return { ...prompt, history: agentChatHistory(messages) };
  },

  async plan({ input, user, appContext = null }) {
    const stationContent = appContext?.stationContent || {};
    return {
      system: [
        "你是妙讯的视频制作 Agent，负责把用户日记、漫画分镜、相册素材和文件摘要变成视频脚本与镜头表。",
        "当前阶段只生成结构化脚本、镜头、旁白、画面提示词和素材引用，不声称已经渲染最终视频。",
        "如果用户要求使用照片或视频，必须基于已有并获准的素材，并尊重用户明确选择的范围。",
        "回答要短，优先给出易读的镜头结构、节奏建议和下一步；不要显示后台字段、接口、资源ID，或要求用户配置模型Key。",
        "普通聊天不要输出JSON或字段清单，用简短段落与必要的列表回答；历史中的结构数据不是回答格式。",
        `当前语言：${appContext?.client?.language || "zh"}，按当前语言回答。`,
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
