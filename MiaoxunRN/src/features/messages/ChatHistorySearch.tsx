import React, { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Keyboard,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import type { MessageDTO } from '../../models/api';
import { messageApi } from '../../services/api/messageApi';
import { textFor } from '../../shared/i18n';
import { SheetHeader } from '../../shared/ui';
import type { Palette } from '../../shared/theme';
import type { Language } from '../session/sessionTypes';

type SearchState = {
  query: string;
  items: MessageDTO[];
  nextCursor: string | null;
  phase: 'idle' | 'loading' | 'ready' | 'error';
};

const empty: SearchState = {
  query: '',
  items: [],
  nextCursor: null,
  phase: 'idle',
};

function snippet(content: string, query: string) {
  const match = content.toLocaleLowerCase().indexOf(query.toLocaleLowerCase());
  const start = Math.max(0, match - 22);
  const end = Math.min(content.length, start + 160);
  return `${start > 0 ? '…' : ''}${content.slice(start, end)}${
    end < content.length ? '…' : ''
  }`;
}

export function ChatHistorySearch({
  threadId,
  token,
  palette,
  language,
  onClose,
  onOpenMessage,
}: {
  threadId: string;
  token: string;
  palette: Palette;
  language: Language;
  onClose: () => void;
  onOpenMessage: (message: MessageDTO) => void;
}) {
  const translate = (zh: string, en: string) => textFor(language, zh, en);
  const [input, setInput] = useState('');
  const [state, setState] = useState(empty);
  const request = useRef(0);
  const pending = useRef(false);
  const query = input.trim();
  useEffect(
    () => () => {
      request.current += 1;
    },
    [],
  );

  const load = async (cursor?: string) => {
    if (!query || pending.current) return;
    const revision = ++request.current;
    pending.current = true;
    setState(current => ({
      ...(cursor ? current : empty),
      query,
      phase: 'loading',
    }));
    try {
      const page = await messageApi.searchHistory(
        threadId,
        token,
        query,
        cursor,
      );
      if (revision !== request.current) return;
      setState(current => ({
        query,
        items: [...current.items, ...page.items],
        nextCursor: page.nextCursor,
        phase: 'ready',
      }));
    } catch {
      if (revision === request.current)
        setState(current => ({ ...current, phase: 'error' }));
    } finally {
      if (revision === request.current) pending.current = false;
    }
  };

  const runSearch = () => {
    Keyboard.dismiss();
    load();
  };
  const hasResults = state.query === query && state.items.length > 0;

  return (
    <View style={searchStyles.screen}>
      <SheetHeader
        title={translate('查找聊天记录', 'Search chat history')}
        palette={palette}
        onBack={onClose}
      />
      <View style={searchStyles.searchRow}>
        <TextInput
          value={input}
          onChangeText={value => {
            request.current += 1;
            pending.current = false;
            setState(empty);
            setInput(value);
          }}
          onSubmitEditing={runSearch}
          returnKeyType="search"
          autoCorrect={false}
          maxLength={200}
          accessibilityLabel={translate('搜索关键词', 'Search keyword')}
          placeholder={translate('输入关键词', 'Enter a keyword')}
          placeholderTextColor={palette.secondaryText}
          style={[
            searchStyles.input,
            {
              color: palette.text,
              borderColor: palette.border,
              backgroundColor: palette.surface,
            },
          ]}
        />
        <Pressable
          accessibilityRole="button"
          accessibilityState={{ disabled: !query || state.phase === 'loading' }}
          disabled={!query || state.phase === 'loading'}
          onPress={runSearch}
          style={searchStyles.action}
        >
          <Text style={{ color: query ? palette.mint : palette.secondaryText }}>
            {translate('搜索', 'Search')}
          </Text>
        </Pressable>
      </View>
      <FlatList
        data={hasResults ? state.items : []}
        keyExtractor={item => item.id}
        keyboardShouldPersistTaps="handled"
        renderItem={({ item }) => (
          <Pressable
            testID={`chat-history-result-${item.id}`}
            accessibilityRole="button"
            accessibilityHint={translate(
              '跳到这条原消息',
              'Jump to the original message',
            )}
            onPress={() => onOpenMessage(item)}
            style={[searchStyles.result, { borderBottomColor: palette.border }]}
          >
            <Text style={{ color: palette.text }} numberOfLines={3}>
              {snippet(item.content, state.query)}
            </Text>
            <Text style={{ color: palette.secondaryText }}>
              {[
                item.senderName,
                item.createdAt
                  ? new Date(item.createdAt).toLocaleString(
                      language === 'zh' ? 'zh-CN' : 'en-US',
                      {
                        year: 'numeric',
                        month: 'short',
                        day: 'numeric',
                        hour: 'numeric',
                        minute: '2-digit',
                      },
                    )
                  : '',
              ]
                .filter(Boolean)
                .join(' · ')}
            </Text>
          </Pressable>
        )}
        ListFooterComponent={
          <View style={searchStyles.footer} accessibilityLiveRegion="polite">
            {state.phase === 'loading' ? (
              <ActivityIndicator
                color={palette.mint}
                accessibilityLabel={translate('正在搜索', 'Searching')}
              />
            ) : state.phase === 'error' ? (
              <>
                <Text style={{ color: palette.rose }}>
                  {translate('搜索失败，请重试。', 'Search failed. Try again.')}
                </Text>
                <Pressable
                  accessibilityRole="button"
                  style={searchStyles.action}
                  onPress={() => load(state.nextCursor || undefined)}
                >
                  <Text style={{ color: palette.mint }}>
                    {translate('重试', 'Retry')}
                  </Text>
                </Pressable>
              </>
            ) : state.phase === 'ready' && !hasResults ? (
              <Text style={{ color: palette.secondaryText }}>
                {translate('没有找到相关消息', 'No matching messages')}
              </Text>
            ) : state.nextCursor ? (
              <Pressable
                accessibilityRole="button"
                style={searchStyles.action}
                onPress={() => load(state.nextCursor || undefined)}
              >
                <Text style={{ color: palette.mint }}>
                  {translate('加载更多', 'Load more')}
                </Text>
              </Pressable>
            ) : null}
          </View>
        }
      />
    </View>
  );
}

const searchStyles = StyleSheet.create({
  screen: { flex: 1, paddingHorizontal: 16 },
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginVertical: 12,
  },
  input: {
    flex: 1,
    minHeight: 44,
    borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 12,
  },
  action: {
    minHeight: 44,
    minWidth: 44,
    justifyContent: 'center',
    alignItems: 'center',
  },
  result: {
    minHeight: 52,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: 5,
  },
  footer: { paddingVertical: 16, gap: 6, alignItems: 'center' },
});
