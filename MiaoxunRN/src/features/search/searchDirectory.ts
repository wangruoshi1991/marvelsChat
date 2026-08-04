import { pinyin } from 'pinyin-pro';

import type { AgentDTO, RelationshipProfileDTO } from '../../models/api';
import { displayText, publicPresenceText } from '../../shared/i18n';
import type { ChatThread, Language } from '../session/useMiaoxunSession';

type DirectoryItemBase = {
  id: string;
  title: string;
  subtitle: string;
  searchText: string;
};

export type DirectoryItem =
  | (DirectoryItemBase & {
      kind: 'agent';
      thread: ChatThread;
      agent: AgentDTO | null;
    })
  | (DirectoryItemBase & {
      kind: 'friend';
      profile: RelationshipProfileDTO;
    })
  | (DirectoryItemBase & {
      kind: 'thread';
      thread: ChatThread;
    });

export type DirectoryGroup = {
  initial: string;
  items: DirectoryItem[];
};

const searchableMessages = (thread?: ChatThread) =>
  (thread?.messages || []).filter(
    message => !message.deletedAt && !message.recalledAt && message.content,
  );

const matchingMessage = (thread: ChatThread | undefined, query: string) => {
  if (!query) {
    return '';
  }
  return (
    [...searchableMessages(thread)]
      .reverse()
      .find(message => message.content.toLocaleLowerCase().includes(query))
      ?.content || ''
  );
};

const threadSearchText = (thread?: ChatThread) =>
  thread
    ? [
        thread.title,
        thread.status,
        thread.lastContent,
        thread.agentId,
        thread.peerAiId,
        ...searchableMessages(thread).flatMap(message => [
          message.senderName,
          message.content,
        ]),
      ]
        .filter(Boolean)
        .join(' ')
        .toLocaleLowerCase()
    : '';

const directoryInitial = (title: string) => {
  const romanized = pinyin(title.trim().charAt(0), { toneType: 'none' }).trim();
  const initial = romanized.charAt(0).toUpperCase();
  return /^[A-Z]$/.test(initial) ? initial : '#';
};

const directorySortText = (title: string) =>
  pinyin(title, { toneType: 'none' }).toLocaleLowerCase();

export function buildSearchDirectory({
  agents,
  friends,
  language,
  normalizedQuery,
  threads,
}: {
  agents: AgentDTO[];
  friends: RelationshipProfileDTO[];
  language: Language;
  normalizedQuery: string;
  threads: ChatThread[];
}): DirectoryGroup[] {
  const agentItems: DirectoryItem[] = threads
    .filter(thread => Boolean(thread.agentId))
    .map(thread => {
      const agent = agents.find(item => item.key === thread.agentId) || null;
      const title = displayText(language, thread.title);
      const matchedMessage = matchingMessage(thread, normalizedQuery);
      const subtitle = displayText(
        language,
        matchedMessage ||
          agent?.description ||
          thread.status ||
          thread.lastContent,
      );
      return {
        id: `agent:${thread.id}`,
        kind: 'agent' as const,
        title,
        subtitle,
        searchText: [title, agent?.description, threadSearchText(thread)]
          .filter(Boolean)
          .join(' ')
          .toLocaleLowerCase(),
        thread,
        agent,
      };
    });

  const friendItems: DirectoryItem[] = friends.map(profile => {
    const thread = threads.find(item => item.peerUserId === profile.user.id);
    const title = displayText(
      language,
      profile.profile.nickname || profile.user.displayName,
    );
    const matchedMessage = matchingMessage(thread, normalizedQuery);
    const profileSubtitle =
      displayText(language, profile.profile.bio) ||
      publicPresenceText(language, profile.user.presenceStatus);
    return {
      id: `friend:${profile.user.id}`,
      kind: 'friend' as const,
      title,
      subtitle: displayText(language, matchedMessage) || profileSubtitle,
      searchText: [
        title,
        profileSubtitle,
        profile.user.aiId,
        threadSearchText(thread),
      ]
        .filter(Boolean)
        .join(' ')
        .toLocaleLowerCase(),
      profile,
    };
  });

  const groupItems: DirectoryItem[] = threads
    .filter(thread => thread.kind === 'group' && !thread.agentId)
    .map(thread => {
      const title = displayText(language, thread.title);
      const matchedMessage = matchingMessage(thread, normalizedQuery);
      return {
        id: `thread:${thread.id}`,
        kind: 'thread' as const,
        title,
        subtitle: displayText(
          language,
          matchedMessage || thread.lastContent || thread.status,
        ),
        searchText: `${title} ${threadSearchText(thread)}`.toLocaleLowerCase(),
        thread,
      };
    });

  const items = [...agentItems, ...friendItems, ...groupItems]
    .filter(
      item => !normalizedQuery || item.searchText.includes(normalizedQuery),
    )
    .sort((left, right) =>
      directorySortText(left.title).localeCompare(
        directorySortText(right.title),
        'en',
      ),
    );

  const groups = new Map<string, DirectoryItem[]>();
  items.forEach(item => {
    const initial = directoryInitial(item.title);
    groups.set(initial, [...(groups.get(initial) || []), item]);
  });
  return Array.from(groups, ([initial, groupedItems]) => ({
    initial,
    items: groupedItems,
  }));
}
