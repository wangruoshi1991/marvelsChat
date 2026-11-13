import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { ChevronDown, ChevronUp } from 'lucide-react-native';
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
  const [expanded, setExpanded] = React.useState(false);
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
  const Chevron = expanded ? ChevronUp : ChevronDown;
  return (
    <View style={[noticeStyles.notice, { backgroundColor: palette.soft }]}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={t(
          '查看不可读协作成果的原因',
          'Review unavailable contribution reasons',
        )}
        accessibilityState={{ expanded }}
        accessibilityHint={labels}
        onPress={() => setExpanded(value => !value)}
        style={noticeStyles.summary}
      >
        <Text style={[noticeStyles.title, { color: palette.secondaryText }]}>
          {t(
            `历史协作成果 · ${total} 份不可读`,
            `Historical contributions · ${total} unavailable`,
          )}
        </Text>
        <Chevron size={16} color={palette.secondaryText} />
      </Pressable>
      {expanded ? (
        <View style={noticeStyles.details}>
          <Text style={{ color: palette.text }}>{labels}。</Text>
          <Text style={{ color: palette.secondaryText }}>
            {t(
              '这里仅说明历史协作记录；当前消息的授权与发送结果会单独显示。',
              'These are historical collaboration records. Access and results for current messages are shown separately.',
            )}
          </Text>
          {reasons.source > 0 || reasons.version > 0 ? (
            <Text style={{ color: palette.secondaryText }}>
              {t(
                '来源或 Agent 版本已变化的旧成果无法通过重试恢复，可基于当前素材另发需求。',
                'Retrying cannot restore results whose sources or Agent versions changed. Send a new request using current sources.',
              )}
            </Text>
          ) : null}
          <View style={noticeStyles.actions}>
            {reasons.unavailable > 0 ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={t(
                  '重新核验历史协作成果',
                  'Recheck historical contributions',
                )}
                disabled={loading}
                accessibilityState={{ disabled: loading }}
                onPress={onRetry}
                style={noticeStyles.action}
              >
                <Text style={{ color: palette.text }}>
                  {loading
                    ? t('正在核验', 'Checking')
                    : t('重新核验', 'Recheck')}
                </Text>
              </Pressable>
            ) : null}
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
      ) : null}
    </View>
  );
}

const noticeStyles = StyleSheet.create({
  notice: { paddingHorizontal: 12, borderRadius: 12 },
  summary: {
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  title: { flex: 1, fontSize: 12, lineHeight: 18 },
  details: { paddingBottom: 12, gap: 8 },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  action: { minHeight: 44, justifyContent: 'center', paddingHorizontal: 8 },
});
