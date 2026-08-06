import React, { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  type LayoutChangeEvent,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from 'react-native';
import { ChevronDown, ChevronUp, Search, X } from 'lucide-react-native';
import Svg, {
  Defs,
  LinearGradient as SvgLinearGradient,
  Rect,
  Stop,
} from 'react-native-svg';

import { contactIconAssets } from '../../assets/icons';
import {
  AgentDTO,
  RelationshipProfileDTO,
  SearchHistoryDTO,
} from '../../models/api';
import { appErrorText, textFor } from '../../shared/i18n';
import { styles } from '../../shared/styles';
import { Palette, palettes } from '../../shared/theme';
import { AgentIconAvatar } from '../messages/AgentIconAvatar';
import { UserAvatarRenderer } from '../messages/messageTypes';
import { ChatThread, Language } from '../session/useMiaoxunSession';
import { buildSearchDirectory } from './searchDirectory';
import { useSearchHistoryLayout } from './useSearchHistoryLayout';

function SearchHistoryChip({
  deleteLabel,
  disabled,
  label,
  onDelete,
  onLayout,
  onPress,
}: {
  deleteLabel: string;
  disabled: boolean;
  label: string;
  onDelete: () => void;
  onLayout: (event: LayoutChangeEvent) => void;
  onPress: () => void;
}) {
  return (
    <View onLayout={onLayout} style={styles.searchChip}>
      <Pressable
        accessibilityRole="button"
        onPress={onPress}
        style={styles.searchChipLabelButton}
      >
        <Text
          ellipsizeMode="tail"
          numberOfLines={1}
          style={styles.searchChipText}
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
        <X color="rgba(0,0,0,0.5)" size={13} strokeWidth={2} />
      </Pressable>
    </View>
  );
}

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
  const isLightPalette = palette.text === palettes.light.text;
  const titleColor = isLightPalette ? '#000000' : palette.text;
  const actionColor = onAction
    ? isLightPalette
      ? '#2012D9'
      : palette.mint
    : isLightPalette
    ? 'rgba(0,0,0,0.6)'
    : palette.secondaryText;

  return (
    <View style={styles.searchSectionHeader}>
      <Text style={[styles.searchSectionTitle, { color: titleColor }]}>
        {title}
      </Text>
      {action ? (
        <Pressable disabled={!onAction} hitSlop={8} onPress={onAction}>
          <Text style={[styles.searchSectionAction, { color: actionColor }]}>
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
}) {
  const [pendingAction, setPendingAction] = useState<'save' | 'clear' | null>(
    null,
  );
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);
  const [isHistoryExpanded, setIsHistoryExpanded] = useState(false);
  const {
    collapsedCount: collapsedHistoryCount,
    collapsedHeight: collapsedHistoryHeight,
    onItemLayout: handleSearchHistoryLayout,
  } = useSearchHistoryLayout(searchHistory);
  const isLightPalette = palette.text === palettes.light.text;
  const contactTitleColor = isLightPalette ? '#000000' : palette.text;
  const contactBodyColor = isLightPalette
    ? 'rgba(0,0,0,0.6)'
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

  return (
    <View style={[styles.searchScreen, { backgroundColor: palette.surface }]}>
      <View
        style={[
          styles.searchPageHeader,
          { backgroundColor: palette.soft, borderBottomColor: palette.border },
        ]}
      >
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={textFor(language, '返回', 'Back')}
          hitSlop={8}
          onPress={onBack}
          style={styles.searchBackButton}
        >
          <Image
            source={contactIconAssets.back}
            resizeMode="contain"
            style={styles.searchBackIcon}
          />
        </Pressable>
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
      </View>

      <View
        style={[styles.searchContent, { backgroundColor: palette.surface }]}
      >
        <ScrollView
          style={styles.searchListViewport}
          contentContainerStyle={styles.searchResults}
        >
          <View style={styles.searchSection}>
            <SectionHeader
              palette={palette}
              title={textFor(language, '搜索记录', 'Search History')}
              action={
                searchHistory.length
                  ? textFor(language, '清除', 'Clear')
                  : undefined
              }
              onAction={searchHistory.length ? confirmClearHistory : undefined}
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
                    <Text style={styles.searchHistoryToggleText}>
                      {isHistoryExpanded
                        ? textFor(language, '收起', 'Collapse')
                        : textFor(language, '展开', 'Show all')}
                    </Text>
                    {isHistoryExpanded ? (
                      <ChevronUp color="#2012D9" size={14} strokeWidth={2} />
                    ) : (
                      <ChevronDown color="#2012D9" size={14} strokeWidth={2} />
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
                    <Text style={styles.searchDirectoryInitial}>
                      {group.initial}
                    </Text>
                    <View>
                      {group.items.map((item, index) => (
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
                            index < group.items.length - 1 &&
                              styles.searchRowDivider,
                            { borderBottomColor: palette.border },
                          ]}
                        >
                          {item.kind === 'agent' ? (
                            <AgentIconAvatar
                              agentId={item.thread.agentId || ''}
                              category={item.agent?.category}
                              identity={item.agent?.identity || null}
                              palette={palette}
                            />
                          ) : item.kind === 'friend' ? (
                            renderUserAvatar({
                              text: item.profile.profile.avatarText,
                              config: item.profile.profile.avatarConfig,
                            })
                          ) : (
                            renderUserAvatar({
                              text: item.thread.avatarText,
                              config: item.thread.avatarConfig || undefined,
                            })
                          )}
                          <View style={styles.searchRowCopy}>
                            <Text
                              numberOfLines={1}
                              style={[
                                styles.searchRowTitle,
                                { color: contactTitleColor },
                              ]}
                            >
                              {item.title}
                            </Text>
                            <Text
                              numberOfLines={1}
                              style={[
                                styles.searchRowBody,
                                { color: contactBodyColor },
                              ]}
                            >
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
              <Text
                style={[styles.searchEmpty, { color: palette.secondaryText }]}
              >
                {textFor(language, '暂无匹配联系人', 'No matching contacts')}
              </Text>
            )}
          </View>
        </ScrollView>

        {isLightPalette ? (
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
    </View>
  );
}
