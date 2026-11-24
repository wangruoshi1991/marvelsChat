import React, { useMemo, useRef } from 'react';
import { Modal, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { textFor } from '../../shared/i18n';
import {
  SettingGroup,
  SettingsActionButton,
  SettingsSwitchRow,
} from '../../shared/settingsUi';
import { styles } from '../../shared/styles';
import { Palette } from '../../shared/theme';
import { SheetHeader } from '../../shared/ui';
import { useCurrentScope } from '../../shared/useCurrentScope';
import { Language } from '../session/useMiaoxunSession';
import { GroupChatMembersSection } from './GroupChatMembersSection';
import { ChatHistorySearch } from './ChatHistorySearch';
import type { MessageDTO } from '../../models/api';
import { useReduceMotion } from '../../shared/useReduceMotion';

export function ThreadSettingsSheet({
  visible,
  threadId,
  muted,
  palette,
  language,
  onClose,
  onSetMuted,
  onOpenProfile,
  onOpenMessage,
  token,
  groupId,
  hasLeftGroup,
  onGroupLeft,
  onActionError,
}: {
  visible: boolean;
  threadId: string;
  muted: boolean;
  palette: Palette;
  language: Language;
  onClose: () => void;
  onSetMuted: (muted: boolean) => Promise<void>;
  onOpenProfile?: () => void;
  onOpenMessage?: (message: MessageDTO) => void;
  token?: string;
  groupId?: string | null;
  hasLeftGroup?: boolean;
  onGroupLeft?: () => void;
  onActionError: (message: string) => void;
}) {
  const scope = useMemo(
    () => ({ visible, token, threadId }),
    [visible, token, threadId],
  );
  const isCurrentSheet = useCurrentScope(scope);
  const latestWrite = useRef(0);
  const [searchOpen, setSearchOpen] = React.useState(false);
  const reduceMotion = useReduceMotion();

  const updateMuted = (nextMuted: boolean) => {
    if (!visible || !isCurrentSheet()) return;
    const write = ++latestWrite.current;
    onSetMuted(nextMuted).catch(error => {
      if (!isCurrentSheet() || write !== latestWrite.current) return;
      onActionError(
        error instanceof Error
          ? error.message
          : textFor(language, '设置同步失败', 'Setting sync failed'),
      );
    });
  };

  const openProfile = () => {
    onClose();
    onOpenProfile?.();
  };
  const closeSheet = () => {
    setSearchOpen(false);
    onClose();
  };

  return (
    <Modal
      animationType={reduceMotion ? 'none' : 'slide'}
      onRequestClose={searchOpen ? () => setSearchOpen(false) : closeSheet}
      presentationStyle="pageSheet"
      visible={visible}
    >
      <SafeAreaView
        style={[styles.safeArea, { backgroundColor: palette.background }]}
      >
        {searchOpen && token && onOpenMessage ? (
          <ChatHistorySearch
            key={threadId}
            threadId={threadId}
            token={token}
            palette={palette}
            language={language}
            onClose={() => setSearchOpen(false)}
            onOpenMessage={message => {
              closeSheet();
              onOpenMessage(message);
            }}
          />
        ) : (
          <View style={styles.threadSettingsScreen}>
            <SheetHeader
              title={textFor(language, '聊天设置', 'Chat settings')}
              palette={palette}
              onBack={closeSheet}
            />
            <SettingGroup
              title={textFor(language, '消息', 'Messages')}
              palette={palette}
            >
              <SettingsSwitchRow
                title={textFor(language, '消息免打扰', 'Mute notifications')}
                value={muted}
                palette={palette}
                onChange={updateMuted}
              />
              {token && onOpenMessage ? (
                <SettingsActionButton
                  title={textFor(
                    language,
                    '查找聊天记录',
                    'Search chat history',
                  )}
                  palette={palette}
                  onPress={() => setSearchOpen(true)}
                />
              ) : null}
            </SettingGroup>
            {onOpenProfile ? (
              <SettingGroup
                title={textFor(language, '联系人', 'Contact')}
                palette={palette}
              >
                <SettingsActionButton
                  title={textFor(language, '查看主页', 'View profile')}
                  palette={palette}
                  onPress={openProfile}
                />
              </SettingGroup>
            ) : null}
            {groupId && token && onGroupLeft ? (
              <GroupChatMembersSection
                groupId={groupId}
                token={token}
                palette={palette}
                language={language}
                enabled={visible}
                hasLeft={hasLeftGroup}
                onGroupLeft={onGroupLeft}
                onActionError={onActionError}
              />
            ) : null}
          </View>
        )}
      </SafeAreaView>
    </Modal>
  );
}
