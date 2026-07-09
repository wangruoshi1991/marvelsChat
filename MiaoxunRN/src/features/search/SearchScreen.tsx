import React, {useState} from 'react';
import {ActivityIndicator, Pressable, ScrollView, Text, TextInput, View} from 'react-native';
import {Search} from 'lucide-react-native';

import {PublicProfileDTO, SearchHistoryDTO} from '../../models/api';
import {displayText, publicPresenceText, textFor} from '../../shared/i18n';
import {styles} from '../../shared/styles';
import {Palette} from '../../shared/theme';
import {ChatThread, Language, useMiaoxunSession} from '../session/useMiaoxunSession';
import {UserAvatarRenderer} from '../messages/MessagesScreen';

function SearchSection({
  palette,
  title,
  empty,
  children,
}: {
  palette: Palette;
  title: string;
  empty: string;
  children?: React.ReactNode;
}) {
  const hasChildren = React.Children.count(children) > 0;
  return (
    <View style={styles.searchSection}>
      <Text style={[styles.searchSectionTitle, {color: palette.secondaryText}]}>{title}</Text>
      {hasChildren ? children : <Text style={[styles.searchEmpty, {color: palette.secondaryText}]}>{empty}</Text>}
    </View>
  );
}

export function SearchScreen({
  palette,
  language,
  query,
  threads,
  agents,
  searchHistory,
  renderUserAvatar,
  renderHeader,
  onBack,
  onChangeQuery,
  onOpenThread,
  onSearchUsers,
  onOpenPublicProfile,
}: {
  palette: Palette;
  language: Language;
  query: string;
  threads: ChatThread[];
  agents: ReturnType<typeof useMiaoxunSession>['agents'];
  searchHistory: SearchHistoryDTO[];
  renderUserAvatar: UserAvatarRenderer;
  renderHeader: (title: string) => React.ReactNode;
  onBack: () => void;
  onChangeQuery: (value: string) => void;
  onOpenThread: (thread: ChatThread) => void;
  onSearchUsers: (query: string) => Promise<PublicProfileDTO[]>;
  onOpenPublicProfile: (profile: PublicProfileDTO) => void;
}) {
  const [userResults, setUserResults] = useState<PublicProfileDTO[]>([]);
  const [isSearchingUsers, setIsSearchingUsers] = useState(false);
  const normalized = query.trim().toLowerCase();
  const threadResults = normalized
    ? threads.filter(thread => {
        const text = [thread.title, thread.lastContent, thread.status, thread.agentId || '']
          .join(' ')
          .toLowerCase();
        return text.includes(normalized);
      })
    : threads;
  const agentResults = normalized
    ? agents.filter(agent => [agent.name, agent.description, agent.key, agent.category].join(' ').toLowerCase().includes(normalized))
    : agents;
  const runUserSearch = () => {
    const value = query.trim();
    if (!value || isSearchingUsers) {
      return;
    }
    setIsSearchingUsers(true);
    onSearchUsers(value)
      .then(setUserResults)
      .catch(() => setUserResults([]))
      .finally(() => setIsSearchingUsers(false));
  };

  return (
    <View style={[styles.searchScreen, {backgroundColor: palette.background}]}>
      {renderHeader(textFor(language, '搜索', 'Search'))}
      <View style={[styles.searchField, {backgroundColor: palette.surface, borderColor: palette.border}]}>
        <Search color={palette.secondaryText} size={18} strokeWidth={2.4} />
        <TextInput
          value={query}
          onChangeText={onChangeQuery}
          placeholder={textFor(language, '搜索 Agent、好友、群、对话记录', 'Search agents, friends, groups, and chat history')}
          placeholderTextColor={palette.secondaryText}
          returnKeyType="search"
          onSubmitEditing={runUserSearch}
          style={[styles.searchInput, {color: palette.text}]}
        />
        <Pressable
          disabled={!query.trim() || isSearchingUsers}
          onPress={runUserSearch}
          style={[styles.searchSubmit, {backgroundColor: palette.mint}, (!query.trim() || isSearchingUsers) && styles.disabledButton]}>
          {isSearchingUsers ? (
            <ActivityIndicator color="#ffffff" size="small" />
          ) : (
            <Text style={styles.searchSubmitText}>{textFor(language, '搜人', 'Users')}</Text>
          )}
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={styles.searchResults}>
        <SearchSection
          palette={palette}
          title={textFor(language, '最近搜索', 'Recent Searches')}
          empty={textFor(language, '暂无最近搜索', 'No recent searches')}
        >
          {searchHistory.map(item => (
            <Pressable
              key={item.id}
              onPress={() => onChangeQuery(item.query)}
              style={[styles.searchChip, {backgroundColor: palette.surface, borderColor: palette.border}]}>
              <Text style={[styles.searchChipText, {color: palette.text}]}>{item.query}</Text>
            </Pressable>
          ))}
        </SearchSection>

        <SearchSection
          palette={palette}
          title={textFor(language, '用户', 'Users')}
          empty={normalized ? textFor(language, '暂无匹配用户', 'No matching users') : textFor(language, '输入昵称或 AI ID 搜索用户', 'Search users by name or AI ID')}
        >
          {userResults.map(profile => (
            <Pressable
              key={profile.user.id}
              onPress={() => {
                onBack();
                onOpenPublicProfile(profile);
              }}
              style={[styles.searchRow, {backgroundColor: palette.surface, borderColor: palette.border}]}>
              {renderUserAvatar({text: profile.profile.avatarText, config: profile.profile.avatarConfig, small: true})}
              <View style={styles.searchRowCopy}>
                <Text style={[styles.searchRowTitle, {color: palette.text}]}>{displayText(language, profile.profile.nickname)}</Text>
                <Text style={[styles.searchRowBody, {color: palette.secondaryText}]} numberOfLines={1}>
                  {profile.user.aiId
                    ? `AI ID ${profile.user.aiId} · ${publicPresenceText(language, profile.user.presenceStatus)}`
                    : `${textFor(language, '对方已隐藏 AI ID', 'AI ID hidden')} · ${publicPresenceText(language, profile.user.presenceStatus)}`}
                </Text>
              </View>
            </Pressable>
          ))}
        </SearchSection>

        <SearchSection
          palette={palette}
          title={textFor(language, '对话记录', 'Chat history')}
          empty={textFor(language, '暂无匹配对话', 'No matching chats')}
        >
          {threadResults.map(thread => (
            <Pressable
              key={thread.id}
              onPress={() => {
                onBack();
                onOpenThread(thread);
              }}
              style={[styles.searchRow, {backgroundColor: palette.surface, borderColor: palette.border}]}>
              <View style={[styles.searchBadge, {backgroundColor: `${palette.mint}1f`}]} />
              <View style={styles.searchRowCopy}>
                <Text style={[styles.searchRowTitle, {color: palette.text}]}>{displayText(language, thread.title)}</Text>
                <Text style={[styles.searchRowBody, {color: palette.secondaryText}]} numberOfLines={1}>
                  {displayText(language, thread.lastContent)}
                </Text>
              </View>
            </Pressable>
          ))}
        </SearchSection>

        <SearchSection
          palette={palette}
          title={textFor(language, 'Agent', 'Agents')}
          empty={textFor(language, '暂无匹配 Agent', 'No matching agents')}
        >
          {agentResults.map(agent => (
            <View key={agent.key} style={[styles.searchRow, {backgroundColor: palette.surface, borderColor: palette.border}]}>
              <View style={[styles.searchBadge, {backgroundColor: `${palette.rose}1f`}]} />
              <View style={styles.searchRowCopy}>
                <Text style={[styles.searchRowTitle, {color: palette.text}]}>{agent.name}</Text>
                <Text style={[styles.searchRowBody, {color: palette.secondaryText}]} numberOfLines={1}>
                  {agent.description}
                </Text>
              </View>
            </View>
          ))}
        </SearchSection>

        <SearchSection
          palette={palette}
          title={textFor(language, '好友', 'Friends')}
          empty={textFor(language, '好友会在小站社交页展示', 'Friends are shown on the Station social tab')}
        />

        <SearchSection
          palette={palette}
          title={textFor(language, '群', 'Groups')}
          empty={textFor(language, '群检索暂缓', 'Group search is pending')}
        />
      </ScrollView>
    </View>
  );
}
