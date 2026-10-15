export const aiContractHeaders = { 'X-Miaoxun-AI-Contract': '1' };
export const siteDocumentHeaders = {
  ...aiContractHeaders,
  'X-Miaoxun-Site-Document': '2',
};

let session: {
  token: string;
  supported: boolean;
  siteDocuments: boolean;
  agentWorkspaces: boolean;
} | null = null;

// Only the active session's accepted bootstrap may establish this contract.
// It is not persisted, inferred from a build number, or probed by a write.
export function setAIContractSession(token: string, contracts?: unknown) {
  session = token
    ? {
        token,
        supported:
          contracts !== null &&
          typeof contracts === 'object' &&
          'aiTasks' in contracts &&
          contracts.aiTasks === 1,
        agentWorkspaces:
          contracts !== null &&
          typeof contracts === 'object' &&
          'agentWorkspaces' in contracts &&
          contracts.agentWorkspaces === 3,
        siteDocuments:
          contracts !== null &&
          typeof contracts === 'object' &&
          'siteDocuments' in contracts &&
          contracts.siteDocuments === 2,
      }
    : null;
}

export function clearAIContractSession() {
  session = null;
}

export function assertAIContract(token: string) {
  if (!token || session?.token !== token || !session.supported) {
    throw new Error(
      '当前服务器不支持此客户端的 AI 功能，请刷新后重试或联系管理员完成升级。',
    );
  }
}

export function supportsSiteDocuments(token: string) {
  return Boolean(
    token &&
      session?.token === token &&
      session.supported &&
      session.siteDocuments,
  );
}

export function assertSiteDocumentContract(token: string) {
  assertAIContract(token);
  if (!supportsSiteDocuments(token)) {
    throw new Error('当前服务器尚未支持结构化页面，请在服务更新后重试。');
  }
}

export const agentWorkspaceHeaders = {
  ...aiContractHeaders,
  'X-Miaoxun-Agent-Workspace': '3',
};
export function supportsAgentWorkspaces(token: string) {
  return Boolean(
    token &&
      session?.token === token &&
      session.supported &&
      session.agentWorkspaces,
  );
}
export function assertAgentWorkspaceContract(token: string) {
  assertAIContract(token);
  if (!supportsAgentWorkspaces(token))
    throw new Error('当前服务器尚未支持 Agent 协作，请在服务更新后重试。');
}
