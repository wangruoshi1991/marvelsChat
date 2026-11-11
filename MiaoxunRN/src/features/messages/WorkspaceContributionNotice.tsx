import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { WorkspaceContributionUnavailableCounts } from '../../models/agentWorkspace';
import { textFor } from '../../shared/i18n';
import type { Palette } from '../../shared/theme';
import type { Language } from '../session/sessionTypes';

export function WorkspaceContributionNotice({
  reasons,
  palette,
  language,
  loading,
  onRetry,
  onOpenAgentAccess,
}: {
  reasons: WorkspaceContributionUnavailableCounts;
  palette: Palette;
  language: Language;
  loading: boolean;
  onRetry: () => Promise<void>;
  onOpenAgentAccess?: () => void;
}) {
  const t = (zh: string, en: string) => textFor(language, zh, en);
  const total = Object.values(reasons).reduce((sum, count) => sum + count, 0);
  if (!total) return null;
  const labels = [
    reasons.authorization
      ? t(
          `授权已失效 ${reasons.authorization} 份`,
          `Access revoked: ${reasons.authorization}`,
        )
      : '',
    reasons.source
      ? t(
          `来源已变化或移除 ${reasons.source} 份`,
          `Source changed or removed: ${reasons.source}`,
        )
      : '',
    reasons.version
      ? t(
          `Agent 版本已变化 ${reasons.version} 份`,
          `Agent version changed: ${reasons.version}`,
        )
      : '',
    reasons.unavailable
      ? t(
          `暂不可用 ${reasons.unavailable} 份`,
          `Currently unavailable: ${reasons.unavailable}`,
        )
      : '',
  ]
    .filter(Boolean)
    .join(t('；', '; '));
  return (
    <View style={[noticeStyles.notice, { backgroundColor: palette.soft }]}>
      <Text accessibilityRole="alert" style={{ color: palette.text }}>
        {t(
          `有 ${total} 份历史协作成果暂不可读：${labels}。`,
          `${total} historical contributions cannot be read: ${labels}.`,
        )}
      </Text>
      <Text style={{ color: palette.secondaryText }}>
        {t(
          '可继续编辑消息；发送结果和当前授权状态会单独提示。',
          'You can continue editing. Message results and current access are reported separately.',
        )}
      </Text>
      <View style={noticeStyles.actions}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('重试历史成果', 'Retry contributions')}
          disabled={loading}
          accessibilityState={{ disabled: loading }}
          onPress={onRetry}
          style={noticeStyles.action}
        >
          <Text style={{ color: palette.text }}>
            {loading
              ? t('正在核验', 'Checking')
              : t('重试历史成果', 'Retry contributions')}
          </Text>
        </Pressable>
        {reasons.authorization > 0 && onOpenAgentAccess ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('查看 Agent 授权', 'Review Agent access')}
            onPress={onOpenAgentAccess}
            style={noticeStyles.action}
          >
            <Text style={{ color: palette.text }}>
              {t('查看 Agent 授权', 'Review Agent access')}
            </Text>
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}

const noticeStyles = StyleSheet.create({
  notice: { padding: 12, borderRadius: 12, gap: 8 },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  action: { minHeight: 44, justifyContent: 'center', paddingHorizontal: 8 },
});
