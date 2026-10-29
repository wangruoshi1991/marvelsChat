import React, { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  type LayoutChangeEvent,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from 'react-native';
import {
  ChevronDown,
  ChevronLeft,
  ChevronUp,
  Search,
  X,
} from 'lucide-react-native';
import Svg, {
  Circle,
  Defs,
  LinearGradient as SvgLinearGradient,
  Path,
  Rect,
  Stop,
} from 'react-native-svg';

import {
  AgentDTO,
  RelationshipProfileDTO,
  SearchHistoryDTO,
} from '../../models/api';
import { appErrorText, textFor } from '../../shared/i18n';
import { styles } from '../../shared/styles';
import { isLightPalette, Palette } from '../../shared/theme';
import { isXunPalette } from '../../shared/xunPalette';
import { VoiceShortcutDock } from '../agents/VoiceShortcutDock';
import { AgentGlyphAvatar } from '../messages/AgentGlyphAvatar';
import { UserAvatarRenderer } from '../messages/messageTypes';
import { ChatThread, Language } from '../session/useMiaoxunSession';
import { BottomBar, RootTab } from '../../shared/ui';
import { buildSearchDirectory, DirectoryItem } from './searchDirectory';
import { useSearchHistoryLayout } from './useSearchHistoryLayout';

function SearchHistoryChip({
  deleteLabel,
  disabled,
  label,
  onDelete,
  onLayout,
  onPress,
  palette,
}: {
  deleteLabel: string;
  disabled: boolean;
  label: string;
  onDelete: () => void;
  onLayout: (event: LayoutChangeEvent) => void;
  onPress: () => void;
  palette: Palette;
}) {
  const xunTheme = isXunPalette(palette);
  return (
    <View
      onLayout={onLayout}
      style={[
        styles.searchChip,
        xunTheme && {
          backgroundColor: palette.surface,
          borderColor: palette.border,
        },
      ]}
    >
      <Pressable
        accessibilityRole="button"
        onPress={onPress}
        style={styles.searchChipLabelButton}
      >
        <Text
          ellipsizeMode="tail"
          numberOfLines={1}
          style={[
            styles.searchChipText,
            xunTheme && { color: palette.secondaryText },
          ]}
        >
          {label}
        </Text>
      </Pressable>
      <Pressable
        accessibilityLabel={deleteLabel}
        accessibilityRole="button"
        disabled={disabled}
        hitSlop={6}
        onPress={onDelete}
        style={[styles.searchChipDelete, disabled && styles.disabledButton]}
      >
        <X
          color={xunTheme ? palette.secondaryText : 'rgba(0,0,0,0.5)'}
          size={13}
          strokeWidth={2}
        />
      </Pressable>
    </View>
  );
}

function SectionHeader({
  palette,
  title,
  action,
  onAction,
  resultHeader = false,
}: {
  palette: Palette;
  title: string;
  action?: string;
  onAction?: () => void;
  resultHeader?: boolean;
}) {
  const lightPalette = isLightPalette(palette);
  const xunTheme = isXunPalette(palette);
  const titleColor = palette.text;
  const actionColor = onAction
    ? lightPalette
      ? xunTheme
        ? palette.mint
        : '#0B8271'
      : palette.mint
    : lightPalette
    ? 'rgba(0,0,0,0.6)'
    : palette.secondaryText;

  return (
    <View
      style={[
        styles.searchSectionHeader,
        xunTheme &&
          (resultHeader
            ? styles.xunSearchResultHeader
            : styles.xunSearchSectionHeader),
      ]}
    >
      <Text
        style={[
          styles.searchSectionTitle,
          xunTheme && styles.xunSearchSectionTitle,
          { color: titleColor },
        ]}
      >
        {title}
      </Text>
      {action ? (
        <Pressable disabled={!onAction} hitSlop={8} onPress={onAction}>
          <Text
            style={[
              styles.searchSectionAction,
              xunTheme && styles.xunSearchSectionAction,
              { color: actionColor },
            ]}
          >
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
  onDeleteSearchHistory,
  onError,
  onSelectTab,
  onComposeAssistant,
  onOpenAssistant,
  onOpenTasks,
  onAssistantExpandedChange,
  active = true,
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
  onDeleteSearchHistory: (historyId: string) => Promise<void>;
  onError: (message: string) => void;
  onSelectTab?: (tab: RootTab) => void;
  onComposeAssistant: (draft?: string) => void;
  onOpenAssistant: (draft?: string) => void;
  onOpenTasks: () => void;
  onAssistantExpandedChange: (expanded: boolean) => void;
  active?: boolean;
}) {
  const [pendingAction, setPendingAction] = useState<'save' | 'clear' | null>(
    null,
  );
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);
  const [isHistoryExpanded, setIsHistoryExpanded] = useState(false);
  // Keep the search overlay aligned with the fixed root navigation height.
  // Measuring the bar on every modal mount made the assistant jump while the
  // search route was settling on different tabs and devices.
  const bottomBarHeight = 89;
  const {
    collapsedCount: collapsedHistoryCount,
    collapsedHeight: collapsedHistoryHeight,
    onItemLayout: handleSearchHistoryLayout,
  } = useSearchHistoryLayout(searchHistory);
  const lightPalette = isLightPalette(palette);
  const xunTheme = isXunPalette(palette);
  const contactTitleColor = palette.text;
  const contactBodyColor = lightPalette
    ? xunTheme
      ? palette.secondaryText
      : 'rgba(0,0,0,0.6)'
    : palette.secondaryText;
  const visibleSearchHistory = isHistoryExpanded
    ? searchHistory
    : searchHistory.slice(0, collapsedHistoryCount);
  const normalizedQuery = query.trim().toLocaleLowerCase();
  const directoryGroups = useMemo(
    () =>
      buildSearchDirectory({
        agents,
        friends,
        language,
        normalizedQuery,
        threads,
      }),
    [agents, friends, language, normalizedQuery, threads],
  );
  const directoryItems = directoryGroups.flatMap(group => group.items);
  const agentResults = directoryItems.filter(item => item.kind === 'agent');
  const friendResults = directoryItems.filter(item => item.kind === 'friend');
  const conversationResults = directoryItems.filter(
    item => item.kind === 'thread',
  );

  const saveSearch = async () => {
    if (!query.trim() || pendingAction || pendingDeleteId) {
      return;
    }
    setPendingAction('save');
    try {
      await onSaveSearch(query);
    } catch (error) {
      onError(
        appErrorText(
          language,
          error,
          '保存搜索记录失败',
          'Failed to save search history',
        ),
      );
    } finally {
      setPendingAction(null);
    }
  };

  const clearHistory = async () => {
    if (pendingAction || pendingDeleteId) {
      return;
    }
    setPendingAction('clear');
    try {
      await onClearSearchHistory();
      setIsHistoryExpanded(false);
    } catch (error) {
      onError(
        appErrorText(
          language,
          error,
          '清空搜索记录失败',
          'Failed to clear search history',
        ),
      );
    } finally {
      setPendingAction(null);
    }
  };

  const deleteHistoryItem = async (historyId: string) => {
    if (pendingAction || pendingDeleteId) {
      return;
    }
    setPendingDeleteId(historyId);
    try {
      await onDeleteSearchHistory(historyId);
    } catch (error) {
      onError(
        appErrorText(
          language,
          error,
          '删除搜索记录失败',
          'Failed to delete search history',
        ),
      );
    } finally {
      setPendingDeleteId(null);
    }
  };

  const confirmClearHistory = () => {
    if (pendingAction || pendingDeleteId) {
      return;
    }
    Alert.alert(
      textFor(language, '清空搜索记录', 'Clear Search History'),
      textFor(
        language,
        '确定要清空全部查询记录吗？此操作无法撤销。',
        'Clear all search history? This action cannot be undone.',
      ),
      [
        { text: textFor(language, '取消', 'Cancel'), style: 'cancel' },
        {
          text: textFor(language, '清空', 'Clear'),
          style: 'destructive',
          onPress: clearHistory,
        },
      ],
    );
  };

  const renderDirectoryItem = (
    item: DirectoryItem,
    index: number,
    itemCount: number,
    queryResult = false,
  ) => (
    <Pressable
      key={item.id}
      accessibilityRole="button"
      onPress={() => {
        onBack();
        if (item.kind === 'friend') {
          onOpenFriend(item.profile.user.id);
        } else {
          onOpenThread(item.thread);
        }
      }}
      style={[
        styles.searchRow,
        xunTheme && styles.xunSearchRow,
        xunTheme &&
          queryResult &&
          index < itemCount - 1 &&
          styles.xunSearchResultRowSpacing,
        !queryResult &&
          index < itemCount - 1 &&
          (xunTheme ? styles.xunSearchRowDivider : styles.searchRowDivider),
        !queryResult && { borderBottomColor: palette.border },
      ]}
    >
      {item.kind === 'agent' ? (
        <AgentGlyphAvatar
          agentId={item.thread.agentId || ''}
          category={item.agent?.category}
          identity={item.agent?.identity || null}
          size={xunTheme ? 44 : 54}
          variant={xunTheme ? 'xun' : undefined}
        />
      ) : item.kind === 'friend' ? (
        renderUserAvatar({
          text: item.profile.profile.avatarText,
          config: item.profile.profile.avatarConfig,
          size: xunTheme ? 44 : undefined,
        })
      ) : (
        renderUserAvatar({
          text: item.thread.avatarText,
          config: item.thread.avatarConfig || undefined,
          size: xunTheme ? 44 : undefined,
        })
      )}
      <View style={[styles.searchRowCopy, xunTheme && styles.xunSearchRowCopy]}>
        <Text
          numberOfLines={1}
          style={[
            styles.searchRowTitle,
            xunTheme && styles.xunSearchRowTitle,
            { color: contactTitleColor },
          ]}
        >
          {item.title}
        </Text>
        <Text
          numberOfLines={1}
          style={[
            styles.searchRowBody,
            xunTheme && styles.xunSearchRowBody,
            { color: contactBodyColor },
          ]}
        >
          {item.subtitle}
        </Text>
      </View>
    </Pressable>
  );

  return (
    <View
      style={[
        styles.searchScreen,
        {
          backgroundColor: xunTheme ? palette.background : palette.surface,
        },
      ]}
    >
      <View
        style={[
          styles.searchPageHeader,
          xunTheme && styles.xunSearchPageHeader,
          {
            backgroundColor: xunTheme ? palette.background : palette.soft,
            borderBottomColor: palette.border,
          },
        ]}
      >
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={textFor(language, '返回', 'Back')}
          hitSlop={8}
          onPress={onBack}
          style={[
            styles.searchBackButton,
            xunTheme && styles.xunSearchBackButton,
          ]}
        >
          {xunTheme ? (
            <Svg height={21} viewBox="0 0 24 24" width={21}>
              <Path
                d="m14 5-7 7 7 7"
                fill="none"
                stroke={palette.text}
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={1.9}
              />
            </Svg>
          ) : (
            <ChevronLeft color={palette.text} size={22} strokeWidth={2} />
          )}
        </Pressable>
        {xunTheme ? (
          <Text
            accessibilityRole="header"
            style={[styles.xunSearchTitle, { color: palette.text }]}
          >
            {textFor(language, '搜索', 'Search')}
          </Text>
        ) : (
          <View
            style={[
              styles.searchField,
              { backgroundColor: palette.surface, borderColor: palette.border },
            ]}
          >
            <Search color={palette.secondaryText} size={16} strokeWidth={2.2} />
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
              style={[styles.searchInput, { color: palette.text }]}
            />
            {pendingAction === 'save' ? (
              <ActivityIndicator color="#2A00FF" size="small" />
            ) : null}
          </View>
        )}
      </View>

      <View
        style={[
          styles.searchContent,
          {
            backgroundColor: xunTheme ? palette.background : palette.surface,
          },
        ]}
      >
        {xunTheme ? (
          <View
            style={[
              styles.searchField,
              styles.xunSearchField,
              { backgroundColor: palette.surface, borderColor: palette.border },
            ]}
          >
            <Svg height={20} viewBox="0 0 24 24" width={20}>
              <Circle
                cx={10}
                cy={10}
                fill="none"
                r={6}
                stroke="#A5B7BD"
                strokeWidth={1.9}
              />
              <Path
                d="m15 15 5 5"
                fill="none"
                stroke="#A5B7BD"
                strokeLinecap="round"
                strokeWidth={1.9}
              />
            </Svg>
            <TextInput
              value={query}
              onChangeText={onChangeQuery}
              onSubmitEditing={saveSearch}
              placeholder={textFor(
                language,
                '搜索对话、任务或Agent',
                'Search conversations, tasks, or agents',
              )}
              placeholderTextColor={palette.secondaryText}
              returnKeyType="search"
              style={[
                styles.searchInput,
                styles.xunSearchInput,
                { color: palette.text },
              ]}
            />
            {pendingAction === 'save' ? (
              <ActivityIndicator color={palette.mint} size="small" />
            ) : query ? (
              <Pressable
                accessibilityLabel={textFor(
                  language,
                  '清空搜索',
                  'Clear search',
                )}
                accessibilityRole="button"
                hitSlop={6}
                onPress={() => onChangeQuery('')}
                style={styles.xunSearchClear}
              >
                <Text
                  importantForAccessibility="no"
                  style={[styles.xunSearchClearGlyph, { color: palette.text }]}
                >
                  ×
                </Text>
              </Pressable>
            ) : null}
          </View>
        ) : null}
        <ScrollView
          keyboardShouldPersistTaps="handled"
          style={styles.searchListViewport}
          contentContainerStyle={[
            styles.searchResults,
            xunTheme && styles.xunSearchResults,
          ]}
        >
          {!xunTheme || !normalizedQuery ? (
            <View style={styles.searchSection}>
              <SectionHeader
                palette={palette}
                title={textFor(language, '搜索记录', 'Search History')}
                action={
                  searchHistory.length
                    ? textFor(language, '清除', 'Clear')
                    : undefined
                }
                onAction={
                  searchHistory.length ? confirmClearHistory : undefined
                }
              />
              {visibleSearchHistory.length ? (
                <>
                  <View
                    style={
                      isHistoryExpanded
                        ? undefined
                        : [
                            styles.searchHistoryCollapsed,
                            { maxHeight: collapsedHistoryHeight },
                          ]
                    }
                  >
                    <View style={styles.searchHistoryList}>
                      {visibleSearchHistory.map(item => (
                        <SearchHistoryChip
                          key={item.id}
                          deleteLabel={textFor(
                            language,
                            `删除搜索记录 ${item.query}`,
                            `Delete search history ${item.query}`,
                          )}
                          disabled={
                            Boolean(pendingDeleteId) || Boolean(pendingAction)
                          }
                          label={item.query}
                          palette={palette}
                          onDelete={() => deleteHistoryItem(item.id)}
                          onLayout={event =>
                            handleSearchHistoryLayout(item.id, event)
                          }
                          onPress={() => onChangeQuery(item.query)}
                        />
                      ))}
                    </View>
                  </View>
                  {collapsedHistoryCount < searchHistory.length ? (
                    <Pressable
                      accessibilityRole="button"
                      onPress={() => setIsHistoryExpanded(value => !value)}
                      style={styles.searchHistoryToggle}
                    >
                      <Text
                        style={[
                          styles.searchHistoryToggleText,
                          xunTheme && { color: palette.mint },
                        ]}
                      >
                        {isHistoryExpanded
                          ? textFor(language, '收起', 'Collapse')
                          : textFor(language, '展开', 'Show all')}
                      </Text>
                      {isHistoryExpanded ? (
                        <ChevronUp
                          color={xunTheme ? palette.mint : '#0B8271'}
                          size={14}
                          strokeWidth={2}
                        />
                      ) : (
                        <ChevronDown
                          color={xunTheme ? palette.mint : '#0B8271'}
                          size={14}
                          strokeWidth={2}
                        />
                      )}
                    </Pressable>
                  ) : null}
                </>
              ) : (
                <Text
                  style={[styles.searchEmpty, { color: palette.secondaryText }]}
                >
                  {textFor(language, '暂无搜索记录', 'No search history')}
                </Text>
              )}
            </View>
          ) : null}

          {xunTheme && normalizedQuery ? (
            <>
              <View style={styles.xunSearchResultSection}>
                <SectionHeader palette={palette} resultHeader title="Agent" />
                {agentResults.length ? (
                  agentResults.map((item, index) =>
                    renderDirectoryItem(item, index, agentResults.length, true),
                  )
                ) : (
                  <Text
                    style={[
                      styles.searchEmpty,
                      styles.xunSearchResultEmpty,
                      { color: palette.secondaryText },
                    ]}
                  >
                    {textFor(
                      language,
                      '暂无匹配的 Agent',
                      'No matching agents',
                    )}
                  </Text>
                )}
              </View>
              <View style={styles.xunSearchResultSection}>
                <SectionHeader
                  palette={palette}
                  resultHeader
                  title={textFor(language, '联系人', 'Contacts')}
                />
                {friendResults.length ? (
                  friendResults.map((item, index) =>
                    renderDirectoryItem(
                      item,
                      index,
                      friendResults.length,
                      true,
                    ),
                  )
                ) : (
                  <Text
                    style={[
                      styles.searchEmpty,
                      styles.xunSearchResultEmpty,
                      { color: palette.secondaryText },
                    ]}
                  >
                    {textFor(
                      language,
                      '暂无匹配的联系人',
                      'No matching contacts',
                    )}
                  </Text>
                )}
              </View>
              {conversationResults.length ? (
                <View style={styles.xunSearchResultSection}>
                  <SectionHeader
                    palette={palette}
                    resultHeader
                    title={textFor(language, '对话', 'Conversations')}
                  />
                  {conversationResults.map((item, index) =>
                    renderDirectoryItem(
                      item,
                      index,
                      conversationResults.length,
                      true,
                    ),
                  )}
                </View>
              ) : null}
            </>
          ) : (
            <View style={styles.searchSection}>
              <SectionHeader
                palette={palette}
                title={textFor(language, '通讯录', 'Contacts')}
                action={textFor(language, '按字母分类', 'Alphabetical')}
              />
              {directoryGroups.length ? (
                <View style={styles.searchDirectoryList}>
                  {directoryGroups.map(group => (
                    <View
                      key={group.initial}
                      style={styles.searchDirectoryGroup}
                    >
                      <Text
                        style={[
                          styles.searchDirectoryInitial,
                          xunTheme && { color: palette.secondaryText },
                        ]}
                      >
                        {group.initial}
                      </Text>
                      <View>
                        {group.items.map((item, index) =>
                          renderDirectoryItem(item, index, group.items.length),
                        )}
                      </View>
                    </View>
                  ))}
                </View>
              ) : (
                <Text
                  style={[styles.searchEmpty, { color: palette.secondaryText }]}
                >
                  {textFor(language, '暂无匹配联系人', 'No matching contacts')}
                </Text>
              )}
            </View>
          )}
        </ScrollView>

        {lightPalette && !xunTheme ? (
          <View pointerEvents="none" style={styles.searchBottomFade}>
            <Svg height="100%" width="100%">
              <Defs>
                <SvgLinearGradient
                  id="searchBottomFade"
                  x1="0"
                  x2="0"
                  y1="0"
                  y2="1"
                >
                  <Stop offset="0" stopColor="#FFFFFF" />
                  <Stop offset="1" stopColor="#F1EFFA" />
                </SvgLinearGradient>
              </Defs>
              <Rect fill="url(#searchBottomFade)" height="100%" width="100%" />
            </Svg>
          </View>
        ) : null}
      </View>
      {xunTheme ? (
        <>
          <View>
            <BottomBar
              language={language}
              onSelectTab={tab => onSelectTab?.(tab)}
              palette={palette}
              selectedTab="messages"
            />
          </View>
          <VoiceShortcutDock
            active={active}
            bottomOffset={bottomBarHeight + 64}
            language={language}
            onCompose={onComposeAssistant}
            onExpandedChange={onAssistantExpandedChange}
            onOpenButler={onOpenAssistant}
            onToggleFeed={onOpenTasks}
            palette={palette}
            tone="xun"
          />
        </>
      ) : null}
    </View>
  );
}
