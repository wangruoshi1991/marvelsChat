import {ChatMessage, ChatThread} from '../session/useMiaoxunSession';
import {AgentDTO, AgentIdentityDTO} from '../../models/api';

export const isThreadOnline = (
  thread: ChatThread,
  agent: AgentDTO | null,
) => {
  if (!thread.agentId) {
    return thread.peerPresenceStatus === 'online';
  }

  const statusText = String(thread.status || '').toLowerCase();
  const isDisabled =
    statusText.includes('停用') ||
    statusText.includes('disabled') ||
    statusText.includes('offline');
  return agent?.status === 'registered' && !isDisabled;
};

export const relativeTimeText = (rawValue?: string | null) => {
  if (!rawValue) {
    return '';
  }
  const timestamp = Date.parse(rawValue);
  if (Number.isNaN(timestamp)) {
    return rawValue;
  }
  const interval = Date.now() - timestamp;
  if (interval < 60000) {
    return '刚刚';
  }
  if (interval < 3600000) {
    return `${Math.floor(interval / 60000)}分钟前`;
  }
  if (interval < 86400000) {
    return `${Math.floor(interval / 3600000)}小时前`;
  }
  const date = new Date(timestamp);
  return `${String(date.getMonth() + 1).padStart(2, '0')}-${String(
    date.getDate(),
  ).padStart(2, '0')}`;
};

export const messageTimeText = (rawValue?: string | null) => {
  if (!rawValue) {
    return '';
  }
  const timestamp = Date.parse(rawValue);
  if (Number.isNaN(timestamp)) {
    return '';
  }
  const date = new Date(timestamp);
  return `${String(date.getHours()).padStart(2, '0')}:${String(
    date.getMinutes(),
  ).padStart(2, '0')}`;
};

export const shouldShowMessageTimeSeparator = (
  previous: ChatMessage | null,
  current: ChatMessage,
) => {
  if (!current.createdAt) {
    return false;
  }
  if (!previous?.createdAt) {
    return true;
  }
  const previousTimestamp = Date.parse(previous.createdAt);
  const currentTimestamp = Date.parse(current.createdAt);
  if (Number.isNaN(previousTimestamp) || Number.isNaN(currentTimestamp)) {
    return true;
  }
  return currentTimestamp - previousTimestamp >= 5 * 60 * 1000;
};

export const resolveAgentIdentity = (
  agents: AgentDTO[],
  agentId?: string | null,
): AgentIdentityDTO | null => {
  const identity = agents.find(agent => agent.key === agentId)?.identity;
  if (!identity || identity.avatarKind !== 'agent-mark') {
    return null;
  }
  return identity;
};
