import { HttpError } from "./http-error.js";

export const aiClientContracts = Object.freeze({ aiTasks: 1, siteDocuments: 2, agentWorkspaces: 6 });
export const aiContractHeader = "X-Miaoxun-AI-Contract";
export const siteDocumentContractHeader = "X-Miaoxun-Site-Document";
export const agentWorkspaceContractHeader = "X-Miaoxun-Agent-Workspace";

export function requireAgentWorkspaceContract(req, _res, next) {
  if (req.get(agentWorkspaceContractHeader) !== String(aiClientContracts.agentWorkspaces)) {
    throw new HttpError(426, "当前客户端不支持协作工作空间，请更新客户端。", {
      code: "WORKSPACE_CLIENT_UPDATE_REQUIRED", requiredContract: aiClientContracts.agentWorkspaces,
    });
  }
  next?.();
}

export function requireSiteDocumentContract(req, _res, next) {
  if (req.get(siteDocumentContractHeader) !== String(aiClientContracts.siteDocuments)) {
    throw new HttpError(426, "当前客户端不支持结构化页面预览与保存，请更新客户端。", {
      code: "SITE_DOCUMENT_CLIENT_UPDATE_REQUIRED",
      requiredContract: aiClientContracts.siteDocuments,
    });
  }
  next?.();
}

export function requireAIClientContract(req, _res, next) {
  if (req.get(aiContractHeader) !== String(aiClientContracts.aiTasks)) {
    throw new HttpError(426, "当前客户端不支持新版 AI 任务与确认流程，请更新客户端后重试。", {
      code: "AI_CLIENT_UPDATE_REQUIRED",
      requiredContract: aiClientContracts.aiTasks,
    });
  }
  next?.();
}

export function rejectRetiredSiteApply() {
  throw new HttpError(426, "此应用入口已停用，请更新客户端并在建站任务中预览、确认应用。", {
    code: "AI_CLIENT_UPDATE_REQUIRED",
    requiredContract: aiClientContracts.aiTasks,
  });
}
