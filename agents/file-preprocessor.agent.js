import { specialistDispatchPlan } from "./specialist-dispatch.js";
import { workspaceContributionPlan } from "./workspace-contribution.js";
import { agentChatHistory } from "./chat-history.js";

export default {
  key: "file-preprocessor",
  name: "文件预处理 Agent",
  version: "0.2.0",
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
  permissions: ["messages:read", "files:read", "files:write", "station:read", "station:write"],

  workspaceCapabilities: [{
    capability: "file.summary",
    description: "对明确选中并成功解析的 UTF-8 文本文件及消息交付摘要，保留完整来源授权。",
    inputKinds: ["station-file", "chat-message"], dependencyKinds: ["text_result"],
    outputKind: "text_result", requiredScopes: ["files:read", "messages:read"],
  }, {
    capability: "text.summarize",
    description: "对本次提供的文本和明确选中消息做摘要、整理与标签建议，不解析未提供的文件。",
    inputKinds: ["chat-message"], dependencyKinds: ["text_result"],
    outputKind: "text_result", requiredScopes: ["messages:read"],
  }],

  async contribute(args) {
    return workspaceContributionPlan(args, { name: "文件内容助手",
      expertise: "整理用户本次提供的文字和消息，给出准确摘要、结构与标签建议。",
      boundary: "仅能读取本节点明确交付的完整 UTF-8 文件正文、消息及前序成果；不能读取本机文件、解析未上传文件、OCR、写文件或写长期记忆。" });
  },

  async dispatch(args) {
    return specialistDispatchPlan(args, this);
  },

  async chat({ input, user, messages = [], appContext = null }) {
    const prompt = await this.plan({ input, user, appContext });
    return { ...prompt, history: agentChatHistory(messages) };
  },

  async plan({ input, user, appContext = null }) {
    const stationContent = appContext?.stationContent || {};
    return {
      system: [
        "你是妙讯的文件预处理 Agent，负责解释文件入库、摘要、标签、索引准备和后续 Agent 使用方式。",
        "你不能声称已经读取本机文件、上传文件、长期保存原文或完成外部 OCR；用户需要通过产品的文件流程提供内容。",
        "面向用户只说明内容、处理结果和下一步，不展示后台接口、字段、配置或资源ID。",
        "普通聊天不要输出JSON或字段清单，用简短段落与必要的列表回答；历史中的结构数据不是回答格式。",
        `当前语言：${appContext?.client?.language || "zh"}，按当前语言回答。`,
        "如果用户要处理 PDF、Word、图片或视频，要说明需要上传和对应解析器/OCR/转写能力。",
        "回答要短，优先说明下一步该上传什么文件、能得到什么结构化结果。",
      ].join("\n"),
      history: [],
      user: [
        `用户: ${user?.displayName || "未登录用户"}`,
        `已有文件数: ${(stationContent.fileAssets || []).length}`,
        `输入: ${input}`,
      ].join("\n")
    };
  }
};
