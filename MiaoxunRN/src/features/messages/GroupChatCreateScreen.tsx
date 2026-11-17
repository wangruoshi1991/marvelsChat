import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
  StyleSheet,
} from 'react-native';
import { Check, UsersRound } from 'lucide-react-native';
import type { RelationshipProfileDTO } from '../../models/api';
import {
  groupChatApi,
  CreateGroupChatResult,
} from '../../services/api/groupChatApi';
import { socialApi } from '../../services/api/socialApi';
import { createIdempotencyKey } from '../../shared/createIdempotencyKey';
import { displayText, textFor } from '../../shared/i18n';
import { styles } from '../../shared/styles';
import { Palette } from '../../shared/theme';
import { Language } from '../session/useMiaoxunSession';
import { SheetHeader } from '../../shared/ui';

export function GroupChatCreateScreen({
  token,
  palette,
  language,
  onBack,
  onCreated,
  onActionError,
}: {
  token: string;
  palette: Palette;
  language: Language;
  onBack: () => void;
  onCreated: (result: CreateGroupChatResult) => void;
  onActionError: (message: string) => void;
}) {
  const [friends, setFriends] = useState<RelationshipProfileDTO[]>([]);
  const [loadState, setLoadState] = useState<'loading' | 'loaded' | 'error'>(
    'loading',
  );
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [title, setTitle] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [friendsScope, setFriendsScope] = useState(token);
  const submittingRef = useRef(false);
  const attempt = useRef<{ fingerprint: string; key: string } | null>(null);
  const currentScope = useRef(token);
  currentScope.current = token;
  const active = useRef(false);
  const requestEpoch = useRef(0);
  const loadFeedback = useRef({ language, onActionError });
  loadFeedback.current = { language, onActionError };

  const loadFriends = useCallback(() => {
    if (!active.current || currentScope.current !== token) return;
    const epoch = ++requestEpoch.current;
    const isCurrent = () =>
      active.current &&
      currentScope.current === token &&
      requestEpoch.current === epoch;
    setLoadState('loading');
    socialApi
      .relationships('friends', token)
      .then(result => {
        if (!isCurrent()) return;
        setFriends(result);
        setLoadState('loaded');
      })
      .catch(error => {
        if (!isCurrent()) return;
        setLoadState('error');
        loadFeedback.current.onActionError(
          error instanceof Error
            ? error.message
            : textFor(
                loadFeedback.current.language,
                '好友列表读取失败',
                'Could not load friends',
              ),
        );
      });
  }, [token]);

  useEffect(() => {
    active.current = true;
    setFriendsScope(token);
    setFriends([]);
    setSelectedIds([]);
    setTitle('');
    attempt.current = null;
    loadFriends();
    return () => {
      active.current = false;
      requestEpoch.current += 1;
    };
  }, [loadFriends, token]);

  const ownsFriends = friendsScope === token;
  const visibleLoadState = ownsFriends ? loadState : 'loading';

  const toggleFriend = (userId: string) => {
    setSelectedIds(current =>
      current.includes(userId)
        ? current.filter(id => id !== userId)
        : [...current, userId],
    );
  };

  const submit = async () => {
    if (submittingRef.current || selectedIds.length < 2 || !title.trim())
      return;
    const payload = {
      title: title.trim(),
      memberUserIds: [...selectedIds].sort(),
    };
    const fingerprint = JSON.stringify(payload);
    if (attempt.current?.fingerprint !== fingerprint) {
      attempt.current = { fingerprint, key: createIdempotencyKey() };
    }
    submittingRef.current = true;
    setSubmitting(true);
    try {
      const result = await groupChatApi.create(
        { ...payload, idempotencyKey: attempt.current.key },
        token,
      );
      onCreated(result);
    } catch (error) {
      onActionError(
        error instanceof Error
          ? error.message
          : textFor(language, '创建群聊失败', 'Could not create group'),
      );
    } finally {
      submittingRef.current = false;
      setSubmitting(false);
    }
  };

  const canSubmit =
    visibleLoadState === 'loaded' &&
    selectedIds.length >= 2 &&
    Boolean(title.trim()) &&
    !submitting;

  return (
    <View style={[styles.safeArea, backgroundStyle(palette.background)]}>
      <SheetHeader
        title={textFor(language, '创建群聊', 'Create group')}
        palette={palette}
        onBack={onBack}
      />
      <TextInput
        accessibilityLabel={textFor(language, '群聊名称', 'Group name')}
        maxLength={80}
        onChangeText={setTitle}
        placeholder={textFor(language, '群聊名称', 'Group name')}
        placeholderTextColor={palette.secondaryText}
        style={[
          s.titleInput,
          colorStyle(palette.text),
          backgroundStyle(palette.surface),
        ]}
        value={ownsFriends ? title : ''}
      />
      {visibleLoadState === 'loading' ? (
        <View testID="group-create-loading" style={s.loading}>
          <ActivityIndicator color={palette.mint} />
        </View>
      ) : visibleLoadState === 'error' ? (
        <View testID="group-create-error" style={s.error}>
          <Text style={colorStyle(palette.secondaryText)}>
            {textFor(language, '好友列表暂不可用', 'Friends are unavailable')}
          </Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={textFor(language, '重试', 'Retry')}
            onPress={loadFriends}
          >
            <Text style={[s.retryLabel, colorStyle(palette.mint)]}>
              {textFor(language, '重试', 'Retry')}
            </Text>
          </Pressable>
        </View>
      ) : friends.length === 0 ? (
        <View testID="group-create-empty" style={s.empty}>
          <UsersRound color={palette.secondaryText} size={24} />
          <Text style={[s.emptyLabel, colorStyle(palette.secondaryText)]}>
            {textFor(
              language,
              '还没有可邀请的好友',
              'No friends to invite yet',
            )}
          </Text>
        </View>
      ) : (
        <ScrollView contentContainerStyle={s.listContent}>
          <Text style={[s.listHint, colorStyle(palette.secondaryText)]}>
            {textFor(
              language,
              '选择至少两位好友',
              'Select at least two friends',
            )}
          </Text>
          {friends.map(friend => {
            const selected = selectedIds.includes(friend.user.id);
            return (
              <Pressable
                key={friend.user.id}
                accessibilityRole="button"
                accessibilityLabel={`${
                  selected ? '已选择' : '选择'
                }${displayText(
                  language,
                  friend.profile.nickname || friend.user.displayName,
                )}`}
                accessibilityState={{ selected }}
                onPress={() => toggleFriend(friend.user.id)}
                style={[s.friendRow, borderColorStyle(palette.border)]}
              >
                <View style={[s.avatar, backgroundStyle(palette.soft)]}>
                  <Text style={colorStyle(palette.text)}>
                    {friend.profile.avatarText ||
                      friend.user.displayName.slice(0, 1)}
                  </Text>
                </View>
                <Text style={[s.friendName, colorStyle(palette.text)]}>
                  {displayText(
                    language,
                    friend.profile.nickname || friend.user.displayName,
                  )}
                </Text>
                {selected ? <Check color={palette.mint} size={18} /> : null}
              </Pressable>
            );
          })}
        </ScrollView>
      )}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={textFor(language, '创建群聊', 'Create group')}
        accessibilityState={{ disabled: !canSubmit }}
        disabled={!canSubmit}
        onPress={submit}
        style={[
          s.submitButton,
          backgroundStyle(canSubmit ? palette.mint : palette.soft),
        ]}
      >
        {submitting ? (
          <ActivityIndicator color={palette.text} />
        ) : (
          <Text style={[s.submitLabel, colorStyle(palette.text)]}>
            {textFor(language, '创建群聊', 'Create group')}
          </Text>
        )}
      </Pressable>
    </View>
  );
}

const colorStyle = (color: string) => ({ color });
const backgroundStyle = (backgroundColor: string) => ({ backgroundColor });
const borderColorStyle = (borderBottomColor: string) => ({ borderBottomColor });

const s = StyleSheet.create({
  titleInput: { margin: 16, padding: 12, borderRadius: 8 },
  loading: { padding: 24 },
  error: { padding: 16 },
  retryLabel: { paddingVertical: 12 },
  empty: { padding: 24, alignItems: 'center' },
  emptyLabel: { paddingTop: 8 },
  listContent: { paddingHorizontal: 16, paddingBottom: 24 },
  listHint: { paddingBottom: 8 },
  friendRow: {
    minHeight: 54,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    borderBottomWidth: 1,
  },
  avatar: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  friendName: { flex: 1 },
  submitButton: {
    minHeight: 48,
    margin: 16,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 8,
  },
  submitLabel: { fontWeight: '600' },
});
