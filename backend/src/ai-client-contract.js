import { HttpError } from "./http-error.js";

export const aiClientContracts = Object.freeze({ aiTasks: 1, siteDocuments: 2, agentWorkspaces: 6, workspaceContributions: 3, uiPreferences: 1, comicRenders: 1 });
export const aiContractHeader = "X-Miaoxun-AI-Contract";
export const siteDocumentContractHeader = "X-Miaoxun-Site-Document";
export const agentWorkspaceContractHeader = "X-Miaoxun-Agent-Workspace";
export const uiPreferencesContractHeader = "X-Miaoxun-UI-Preferences";
export const workspaceContributionsContractHeader = "X-Miaoxun-Workspace-Contributions";

export function requireWorkspaceContributionsContract(req, _res, next) {
  if (!["2", "3"].includes(req.get(workspaceContributionsContractHeader))) {
    throw new HttpError(426, "当前客户端不支持协作会话时间线，请更新客户端。", {
      code: "WORKSPACE_CONTRIBUTIONS_CLIENT_UPDATE_REQUIRED", requiredContract: aiClientContracts.workspaceContributions,
    });
  }
  next?.();
}

export function requireUIPreferencesContract(req, _res, next) {
  if (req.get(uiPreferencesContractHeader) !== String(aiClientContracts.uiPreferences)) {
    throw new HttpError(426, "当前客户端不支持 AI 界面偏好，请更新客户端。", {
      code: "UI_PREFERENCES_CLIENT_UPDATE_REQUIRED", requiredContract: aiClientContracts.uiPreferences,
    });
  }
  next?.();
}

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

export const comicRenderContractHeader = "X-Miaoxun-Comic-Renders";
export function requireComicRenderContract(req, _res, next) {
  if (req.get(comicRenderContractHeader) !== String(aiClientContracts.comicRenders)) {
    throw new HttpError(426, "当前客户端不支持漫画生成任务，请更新应用。", {
      code: "COMIC_RENDER_CLIENT_UPDATE_REQUIRED", requiredContract: aiClientContracts.comicRenders,
    });
  }
  next?.();
}
