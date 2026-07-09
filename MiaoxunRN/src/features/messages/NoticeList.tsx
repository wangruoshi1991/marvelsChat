import React, {useState} from 'react';
import {ActivityIndicator, Pressable, ScrollView, Text, View} from 'react-native';
import {Bell, Database, UserCircle} from 'lucide-react-native';

import {Language, useMiaoxunSession} from '../session/useMiaoxunSession';
import {displayText, textFor} from '../../shared/i18n';
import {styles} from '../../shared/styles';
import {Palette} from '../../shared/theme';
import {IconComponent} from '../../shared/ui';

function NoticeRow({
  palette,
  language,
  icon: Icon,
  title,
  message,
  status,
  active,
  actionLabel,
  secondaryActionLabel,
  isActionBusy,
  isSecondaryActionBusy,
  onAction,
  onSecondaryAction,
}: {
  palette: Palette;
  language: Language;
  icon: IconComponent;
  title: string;
  message: string;
  status: string;
  active?: boolean;
  actionLabel?: string;
  secondaryActionLabel?: string;
  isActionBusy?: boolean;
  isSecondaryActionBusy?: boolean;
  onAction: () => void;
  onSecondaryAction?: () => void;
}) {
  return (
    <View style={[styles.noticeRow, {backgroundColor: palette.surface, borderColor: palette.border}]}>
      <View style={[styles.noticeSymbol, {backgroundColor: `${palette.mint}24`}]}>
        <Icon color={palette.mint} size={20} strokeWidth={2.4} />
      </View>
      <View style={styles.noticeBody}>
        <View style={styles.noticeTitleRow}>
          <Text style={[styles.noticeTitle, {color: palette.text}]}>{title}</Text>
          <Text style={[styles.noticeStatus, {color: active ? palette.mint : palette.secondaryText}]}>
            {status}
          </Text>
        </View>
        <Text style={[styles.noticeMessage, {color: palette.secondaryText}]}>{message}</Text>
        {active || actionLabel || secondaryActionLabel ? (
          <View style={styles.noticeActionRow}>
            {secondaryActionLabel && onSecondaryAction ? (
              <Pressable
                disabled={isActionBusy || isSecondaryActionBusy}
                onPress={onSecondaryAction}
                style={[styles.noticeAction, styles.noticeSecondaryAction, {backgroundColor: palette.surface, borderColor: palette.border}, isSecondaryActionBusy && styles.disabledButton]}>
                {isSecondaryActionBusy ? (
                  <View style={styles.noticeActionContent}>
                    <ActivityIndicator color={palette.text} size="small" />
                    <Text style={[styles.noticeActionText, {color: palette.text}]}>{textFor(language, '处理中', 'Processing')}</Text>
                  </View>
                ) : (
                  <Text style={[styles.noticeActionText, {color: palette.text}]}>{secondaryActionLabel}</Text>
                )}
              </Pressable>
            ) : null}
            <Pressable
              disabled={isActionBusy || isSecondaryActionBusy}
              onPress={onAction}
              style={[styles.noticeAction, {backgroundColor: palette.mint}, isActionBusy && styles.disabledButton]}>
              {isActionBusy ? (
                <View style={styles.noticeActionContent}>
                  <ActivityIndicator color="#ffffff" size="small" />
                  <Text style={styles.noticeActionText}>{textFor(language, '处理中', 'Processing')}</Text>
                </View>
              ) : (
                <Text style={styles.noticeActionText}>
                  {actionLabel || textFor(language, '标记已读', 'Mark read')}
                </Text>
              )}
            </Pressable>
          </View>
        ) : null}
      </View>
    </View>
  );
}

export function NoticeList({
  palette,
  language,
  notices,
  onMarkNotificationRead,
  onAcceptFriendRequest,
  onRejectFriendRequest,
}: {
  palette: Palette;
  language: Language;
  notices: ReturnType<typeof useMiaoxunSession>['notices'];
  onMarkNotificationRead: (notificationId: string) => Promise<void>;
  onAcceptFriendRequest: (requestId: string) => Promise<void>;
  onRejectFriendRequest: (requestId: string) => Promise<void>;
}) {
  const [pendingActionId, setPendingActionId] = useState<string | null>(null);
  const runNoticeAction = async ({
    busyId,
    notificationId,
    action,
  }: {
    busyId: string;
    notificationId: string;
    action?: () => Promise<void>;
  }) => {
    if (pendingActionId) {
      return;
    }
    setPendingActionId(busyId);
    try {
      if (action) {
        await action();
      } else {
        await onMarkNotificationRead(notificationId);
      }
    } finally {
      setPendingActionId(null);
    }
  };

  return (
    <ScrollView style={[styles.noticeScreen, {backgroundColor: palette.surface}]} contentContainerStyle={styles.noticeList}>
      {notices.length ? (
        notices.map(notice => {
          const friendRequestStatus = String(notice.payload?.friendRequestStatus || '');
          const canAcceptFriendRequest =
            notice.kind === 'friend.request' &&
            notice.targetId &&
            (!friendRequestStatus || friendRequestStatus === 'pending');
          return (
            <NoticeRow
              key={notice.id}
              palette={palette}
              language={language}
              icon={notice.kind.includes('friend') ? UserCircle : notice.kind.includes('follow') ? Bell : Database}
              title={displayText(language, notice.title)}
              message={displayText(language, notice.body)}
              status={notice.readAt ? textFor(language, '已读', 'Read') : textFor(language, '未读', 'Unread')}
              active={!notice.readAt}
              actionLabel={canAcceptFriendRequest ? textFor(language, '通过', 'Accept') : undefined}
              secondaryActionLabel={canAcceptFriendRequest ? textFor(language, '拒绝', 'Reject') : undefined}
              isActionBusy={pendingActionId === `${notice.id}:accept`}
              isSecondaryActionBusy={pendingActionId === `${notice.id}:reject`}
              onAction={() =>
                runNoticeAction({
                  busyId: canAcceptFriendRequest ? `${notice.id}:accept` : notice.id,
                  notificationId: notice.id,
                  action: canAcceptFriendRequest ? () => onAcceptFriendRequest(notice.targetId || '') : undefined,
                })
              }
              onSecondaryAction={
                canAcceptFriendRequest
                  ? () =>
                      runNoticeAction({
                        busyId: `${notice.id}:reject`,
                        notificationId: notice.id,
                        action: () => onRejectFriendRequest(notice.targetId || ''),
                      })
                  : undefined
              }
            />
          );
        })
      ) : (
        <View style={[styles.stationPlaceholder, {backgroundColor: palette.surface, borderColor: palette.border}]}>
          <Text style={[styles.placeholderTitle, {color: palette.text}]}>
            {textFor(language, '暂无通知', 'No notices')}
          </Text>
          <Text style={[styles.placeholderBody, {color: palette.secondaryText}]}>
            {textFor(language, '好友申请、关注和系统事件会出现在这里。', 'Friend requests, follows, and system events will appear here.')}
          </Text>
        </View>
      )}
    </ScrollView>
  );
}
