import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import {
  groupChatApi,
  GroupChatMemberDTO,
} from '../../services/api/groupChatApi';
import { textFor } from '../../shared/i18n';
import { Palette } from '../../shared/theme';
import { Language } from '../session/useMiaoxunSession';
import { SettingGroup, SettingsActionButton } from '../../shared/settingsUi';

export function GroupChatMembersSection({
  groupId,
  token,
  palette,
  language,
  enabled = true,
  hasLeft = false,
  onGroupLeft,
  onActionError,
}: {
  groupId: string;
  token: string;
  palette: Palette;
  language: Language;
  enabled?: boolean;
  hasLeft?: boolean;
  onGroupLeft: () => void;
  onActionError: (message: string) => void;
}) {
  const [members, setMembers] = useState<GroupChatMemberDTO[]>([]);
  const [loadState, setLoadState] = useState<
    'idle' | 'loading' | 'loaded' | 'error' | 'left'
  >(hasLeft ? 'left' : enabled ? 'loading' : 'idle');
  const [leaving, setLeaving] = useState(false);
  const requestEpoch = useRef(0);
  const actionErrorHandler = useRef(onActionError);
  actionErrorHandler.current = onActionError;

  const load = useCallback(
    (isActive: () => boolean = () => true) => {
      const epoch = ++requestEpoch.current;
      setLoadState('loading');
      groupChatApi
        .members(groupId, token)
        .then(result => {
          if (!isActive() || requestEpoch.current !== epoch) return;
          setMembers(result);
          setLoadState('loaded');
        })
        .catch(error => {
          if (!isActive() || requestEpoch.current !== epoch) return;
          setLoadState('error');
          actionErrorHandler.current(
            error instanceof Error
              ? error.message
              : textFor(
                  language,
                  '群成员读取失败',
                  'Could not load group members',
                ),
          );
        });
    },
    [groupId, language, token],
  );

  useEffect(() => {
    let active = true;
    if (hasLeft) setLoadState('left');
    else if (enabled) load(() => active);
    else setLoadState('idle');
    return () => {
      active = false;
    };
  }, [enabled, hasLeft, load]);

  const leave = () => {
    if (leaving || loadState === 'left') return;
    Alert.alert(
      textFor(language, '退出群聊', 'Leave group'),
      textFor(
        language,
        '退出后将保留已有聊天记录，但不能发送新消息或查看当前成员。',
        'Your existing chat history stays available, but you will not be able to send messages or view current members.',
      ),
      [
        { text: textFor(language, '取消', 'Cancel'), style: 'cancel' },
        {
          text: textFor(language, '退出群聊', 'Leave group'),
          style: 'destructive',
          onPress: async () => {
            if (leaving) return;
            setLeaving(true);
            ++requestEpoch.current;
            try {
              await groupChatApi.leave(groupId, token);
              setLoadState('left');
              onGroupLeft();
            } catch (error) {
              onActionError(
                error instanceof Error
                  ? error.message
                  : textFor(language, '退出群聊失败', 'Could not leave group'),
              );
            } finally {
              setLeaving(false);
            }
          },
        },
      ],
    );
  };

  return (
    <SettingGroup title={textFor(language, '群聊', 'Group')} palette={palette}>
      {loadState === 'idle' ? null : loadState === 'loading' ? (
        <View testID="group-members-loading" style={s.loading}>
          <ActivityIndicator color={palette.mint} />
        </View>
      ) : loadState === 'error' ? (
        <View testID="group-members-error" style={s.error}>
          <Text style={[s.errorLabel, colorStyle(palette.secondaryText)]}>
            {textFor(
              language,
              '成员列表暂不可用',
              'Member list is unavailable',
            )}
          </Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={textFor(
              language,
              '重试读取成员',
              'Retry member loading',
            )}
            onPress={() => load()}
          >
            <Text style={[s.retryLabel, colorStyle(palette.mint)]}>
              {textFor(language, '重试', 'Retry')}
            </Text>
          </Pressable>
        </View>
      ) : loadState === 'left' ? (
        <View testID="group-history-retained" style={s.history}>
          <Text style={colorStyle(palette.secondaryText)}>
            {textFor(
              language,
              '你已退出群聊。已有聊天记录仍保留；你不能发送消息或查看成员。',
              'You left this group. Existing chat history is retained; sending messages and viewing members are unavailable.',
            )}
          </Text>
        </View>
      ) : (
        <>
          {members.length ? (
            members.map(member => (
              <View
                key={member.id}
                testID={`group-member-${member.id}`}
                style={s.memberRow}
              >
                <Text style={colorStyle(palette.text)}>
                  {member.avatarText} {member.name}
                </Text>
              </View>
            ))
          ) : (
            <View testID="group-members-empty" style={s.empty}>
              <Text style={colorStyle(palette.secondaryText)}>
                {textFor(
                  language,
                  '当前没有成员信息',
                  'No member information available',
                )}
              </Text>
            </View>
          )}
          <SettingsActionButton
            title={textFor(language, '退出群聊', 'Leave group')}
            palette={palette}
            disabled={leaving}
            onPress={leave}
          />
        </>
      )}
    </SettingGroup>
  );
}

const colorStyle = (color: string) => ({ color });

const s = StyleSheet.create({
  loading: { padding: 12 },
  error: { paddingHorizontal: 12 },
  errorLabel: { paddingVertical: 8 },
  retryLabel: { paddingVertical: 8 },
  history: { padding: 12 },
  memberRow: {
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
  },
  empty: { padding: 12 },
});
