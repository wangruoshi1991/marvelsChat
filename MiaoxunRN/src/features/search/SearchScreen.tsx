import React, {useMemo, useState} from 'react';
import {
  ActivityIndicator,
  Image,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from 'react-native';
import {Search} from 'lucide-react-native';
import {pinyin} from 'pinyin-pro';

import {contactIconAssets} from '../../assets/icons';
import {AgentDTO, RelationshipProfileDTO, SearchHistoryDTO} from '../../models/api';
import {displayText, publicPresenceText, textFor} from '../../shared/i18n';
import {styles} from '../../shared/styles';
import {Palette} from '../../shared/theme';
import {AgentIconAvatar} from '../messages/AgentIconAvatar';
import {UserAvatarRenderer} from '../messages/messageTypes';
import {ChatThread, Language} from '../session/useMiaoxunSession';

type DirectoryItem =
  | {
      id: string;
      kind: 'agent';
      title: string;
      subtitle: string;
      searchText: string;
      thread: ChatThread;
      agent: AgentDTO | null;
    }
  | {
      id: string;
      kind: 'friend';
      title: string;
      subtitle: string;
      searchText: string;
      profile: RelationshipProfileDTO;
    };

type DirectoryGroup = {
  initial: string;
  items: DirectoryItem[];
};

const directoryInitial = (title: string) => {
  const romanized = pinyin(title.trim().charAt(0), {toneType: 'none'}).trim();
  const initial = romanized.charAt(0).toUpperCase();
  return /^[A-Z]$/.test(initial) ? initial : '#';
};

const directorySortText = (title: string) =>
  pinyin(title, {toneType: 'none'}).toLocaleLowerCase();

function SectionHeader({
  palette,
  title,
  action,
  onAction,
}: {
  palette: Palette;
  title: string;
  action?: string;
  onAction?: () => void;
}) {
  const actionColor = onAction ? '#2A00FF' : palette.secondaryText;

  return (
    <View style={styles.searchSectionHeader}>
      <Text style={[styles.searchSectionTitle, {color: palette.text}]}>
        {title}
      </Text>
      {action ? (
        <Pressable disabled={!onAction} hitSlop={8} onPress={onAction}>
          <Text
            style={[
              styles.searchSectionAction,
              {color: actionColor},
            ]}>
            {action}
          </Text>
        </Pressable>
      ) : null}
    </View>
  );
}

export function SearchScreen({
  palette,
  language,
  query,
  threads,
  agents,
  friends,
  searchHistory,
  renderUserAvatar,
  onBack,
  onChangeQuery,
  onOpenThread,
  onOpenFriend,
  onSaveSearch,
  onClearSearchHistory,
}: {
  palette: Palette;
  language: Language;
  query: string;
  threads: ChatThread[];
  agents: AgentDTO[];
  friends: RelationshipProfileDTO[];
  searchHistory: SearchHistoryDTO[];
  renderUserAvatar: UserAvatarRenderer;
  onBack: () => void;
  onChangeQuery: (value: string) => void;
  onOpenThread: (thread: ChatThread) => void;
  onOpenFriend: (friendUserId: string) => void;
  onSaveSearch: (query: string) => Promise<unknown>;
  onClearSearchHistory: () => Promise<void>;
}) {
  const [pendingAction, setPendingAction] = useState<'save' | 'clear' | null>(
    null,
  );
  const normalizedQuery = query.trim().toLocaleLowerCase();
  const directoryItems = useMemo<DirectoryItem[]>(() => {
    const agentItems: DirectoryItem[] = threads
      .filter(thread => Boolean(thread.agentId))
      .map(thread => {
        const agent =
          agents.find(item => item.key === thread.agentId) || null;
        const title = displayText(language, thread.title);
        const subtitle = displayText(
          language,
          agent?.description || thread.status || thread.lastContent,
        );
        return {
          id: `agent:${thread.id}`,
          kind: 'agent' as const,
          title,
          subtitle,
          searchText: `${title} ${subtitle} ${thread.agentId || ''}`.toLocaleLowerCase(),
          thread,
          agent,
        };
      });
    const friendItems: DirectoryItem[] = friends.map(profile => {
      const title = displayText(
        language,
        profile.profile.nickname || profile.user.displayName,
      );
      const subtitle =
        displayText(language, profile.profile.bio) ||
        publicPresenceText(language, profile.user.presenceStatus);
      return {
        id: `friend:${profile.user.id}`,
        kind: 'friend' as const,
        title,
        subtitle,
        searchText:
          `${title} ${subtitle} ${profile.user.aiId || ''}`.toLocaleLowerCase(),
        profile,
      };
    });

    return [...agentItems, ...friendItems]
      .filter(
        item => !normalizedQuery || item.searchText.includes(normalizedQuery),
      )
      .sort((left, right) =>
        directorySortText(left.title).localeCompare(
          directorySortText(right.title),
          'en',
        ),
      );
  }, [agents, friends, language, normalizedQuery, threads]);
  const directoryGroups = useMemo<DirectoryGroup[]>(() => {
    const groups: DirectoryGroup[] = [];
    directoryItems.forEach(item => {
      const initial = directoryInitial(item.title);
      const currentGroup = groups[groups.length - 1];
      if (currentGroup?.initial === initial) {
        currentGroup.items.push(item);
      } else {
        groups.push({initial, items: [item]});
      }
    });
    return groups;
  }, [directoryItems]);

  const saveSearch = async () => {
    if (!query.trim() || pendingAction) {
      return;
    }
    setPendingAction('save');
    try {
      await onSaveSearch(query);
    } finally {
      setPendingAction(null);
    }
  };

  const clearHistory = async () => {
    if (pendingAction) {
      return;
    }
    setPendingAction('clear');
    try {
      await onClearSearchHistory();
    } finally {
      setPendingAction(null);
    }
  };

  return (
    <View style={[styles.searchScreen, {backgroundColor: palette.soft}]}>
      <View style={styles.searchPageHeader}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={textFor(language, '返回', 'Back')}
          hitSlop={8}
          onPress={onBack}
          style={styles.searchBackButton}>
          <Image
            source={contactIconAssets.back}
            resizeMode="contain"
            style={styles.searchBackIcon}
          />
        </Pressable>
        <View
          style={[
            styles.searchField,
            {backgroundColor: palette.surface, borderColor: palette.border},
          ]}>
          <Search
            color={palette.secondaryText}
            size={16}
            strokeWidth={2.2}
          />
          <TextInput
            value={query}
            onChangeText={onChangeQuery}
            onSubmitEditing={saveSearch}
            placeholder={textFor(
              language,
              '搜索好友、聊天记录、Agent',
              'Search friends, chats, and agents',
            )}
            placeholderTextColor={palette.secondaryText}
            returnKeyType="search"
            style={[styles.searchInput, {color: palette.text}]}
          />
          {pendingAction === 'save' ? (
            <ActivityIndicator color="#2A00FF" size="small" />
          ) : null}
        </View>
      </View>

      <ScrollView contentContainerStyle={styles.searchResults}>
        <View style={styles.searchSection}>
          <SectionHeader
            palette={palette}
            title={textFor(language, '搜索记录', 'Search History')}
            action={
              searchHistory.length
                ? textFor(language, '清除', 'Clear')
                : undefined
            }
            onAction={searchHistory.length ? clearHistory : undefined}
          />
          {searchHistory.length ? (
            <View style={styles.searchHistoryList}>
              {searchHistory.map(item => (
                <Pressable
                  key={item.id}
                  onPress={() => onChangeQuery(item.query)}
                  style={[
                    styles.searchChip,
                    {
                      backgroundColor: palette.surface,
                      borderColor: palette.border,
                    },
                  ]}>
                  <Text
                    style={[
                      styles.searchChipText,
                      {color: palette.secondaryText},
                    ]}>
                    {item.query}
                  </Text>
                </Pressable>
              ))}
            </View>
          ) : (
            <Text style={[styles.searchEmpty, {color: palette.secondaryText}]}>
              {textFor(language, '暂无搜索记录', 'No search history')}
            </Text>
          )}
        </View>

        <View style={styles.searchSection}>
          <SectionHeader
            palette={palette}
            title={textFor(language, '通讯录', 'Contacts')}
            action={textFor(language, '按字母分类', 'Alphabetical')}
          />
          {directoryGroups.length ? (
            <View style={styles.searchDirectoryList}>
              {directoryGroups.map(group => (
                <View key={group.initial} style={styles.searchDirectoryGroup}>
                  <Text
                    style={[
                      styles.searchDirectoryInitial,
                      {color: palette.secondaryText},
                    ]}>
                    {group.initial}
                  </Text>
                  <View>
                    {group.items.map((item, index) => (
                      <Pressable
                        key={item.id}
                        accessibilityRole="button"
                        onPress={() => {
                          onBack();
                          if (item.kind === 'agent') {
                            onOpenThread(item.thread);
                          } else {
                            onOpenFriend(item.profile.user.id);
                          }
                        }}
                        style={[
                          styles.searchRow,
                          index < group.items.length - 1 &&
                            styles.searchRowDivider,
                          {borderBottomColor: palette.border},
                        ]}>
                        {item.kind === 'agent' ? (
                          <AgentIconAvatar
                            agentId={item.thread.agentId || ''}
                            category={item.agent?.category}
                            identity={item.agent?.identity || null}
                            palette={palette}
                            small
                          />
                        ) : (
                          renderUserAvatar({
                            text: item.profile.profile.avatarText,
                            config: item.profile.profile.avatarConfig,
                            small: true,
                          })
                        )}
                        <View style={styles.searchRowCopy}>
                          <Text
                            numberOfLines={1}
                            style={[
                              styles.searchRowTitle,
                              {color: palette.text},
                            ]}>
                            {item.title}
                          </Text>
                          <Text
                            numberOfLines={1}
                            style={[
                              styles.searchRowBody,
                              {color: palette.secondaryText},
                            ]}>
                            {item.subtitle}
                          </Text>
                        </View>
                      </Pressable>
                    ))}
                  </View>
                </View>
              ))}
            </View>
          ) : (
            <Text style={[styles.searchEmpty, {color: palette.secondaryText}]}>
              {textFor(language, '暂无匹配联系人', 'No matching contacts')}
            </Text>
          )}
        </View>
      </ScrollView>
    </View>
  );
}
