import { textFor } from '../../shared/i18n';
import { Language } from '../session/sessionTypes';

// Labels only: membership and access always come from the server registry.
const scopeLabels: Record<string, [string, string]> = {
  'profile:read': ['读取个人资料', 'Read profile'],
  'messages:read': ['读取获准的对话', 'Read permitted messages'],
  'agents:invoke': ['调用已授权 Agent', 'Invoke authorized agents'],
  'station:read': ['读取小站内容', 'Read station content'],
  'station:write': ['更新小站内容', 'Update station content'],
  'album:read': ['读取相册', 'Read albums'],
  'album:write': ['整理相册', 'Manage albums'],
  'diary:read': ['读取日记', 'Read diaries'],
  'diary:write': ['更新日记', 'Update diaries'],
  'files:read': ['读取文件素材', 'Read file materials'],
  'files:write': ['整理文件素材', 'Manage file materials'],
};

export function agentScopeLabel(scope: string, language: Language) {
  const label = Object.prototype.hasOwnProperty.call(scopeLabels, scope)
    ? scopeLabels[scope]
    : undefined;
  return label
    ? textFor(language, ...label)
    : textFor(
        language,
        '需更新应用以查看此权限',
        'Update the app to review this access',
      );
}

export function agentScopeListLabel(scopes: string[], language: Language) {
  return scopes.length
    ? scopes
        .map(scope => agentScopeLabel(scope, language))
        .join(language === 'zh' ? '、' : ', ')
    : textFor(language, '无', 'None');
}

export function hasUnknownAgentScope(scopes: string[]) {
  return scopes.some(
    scope => !Object.prototype.hasOwnProperty.call(scopeLabels, scope),
  );
}
