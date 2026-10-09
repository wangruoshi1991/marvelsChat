import React from 'react';
import { ActivityIndicator, Pressable, Text, View } from 'react-native';
import { Check } from 'lucide-react-native';
import { Palette } from '../../shared/theme';
import { Language } from '../session/useMiaoxunSession';
import { textFor } from '../../shared/i18n';
import { resolveStationColors } from '../station/stationTheme';
import { eventMessage } from './mediaRetrievalState';
import { RetrievalPhase, RetrievalState } from './mediaRetrievalTypes';
import { retrievalStyles as styles } from './mediaRetrievalStyles';

export function RetrievalStatusCard({
  state,
  phase,
  consent,
  onConsent,
  onEnable,
  palette,
  language,
}: {
  state: RetrievalState;
  phase: RetrievalPhase;
  consent: boolean;
  onConsent: () => void;
  onEnable: () => void;
  palette: Palette;
  language: Language;
}) {
  const c = resolveStationColors(palette);
  const t = (zh: string, en: string) => textFor(language, zh, en);
  const titles: Record<RetrievalPhase, string> = {
    loading: t('正在获取状态', 'Checking status'),
    disabled: t('让描述帮你找到素材', 'Find media with a description'),
    enable: t('正在启用', 'Enabling retrieval'),
    indexing: t('正在整理素材', 'Indexing your media'),
    ready: t('素材已准备好', 'Your media is ready'),
    blocked: t('检索暂不可用', 'Retrieval unavailable'),
    purging: t('正在清除检索数据', 'Clearing retrieval data'),
  };
  const busy = Boolean(state.busy || state.refreshing);
  const showConsent =
    !state.status?.enabled &&
    !state.purgePending &&
    ['disabled', 'enable', 'blocked'].includes(phase);
  const enableDisabled = phase !== 'disabled' || !consent || busy;
  const reasonCodes = state.status?.availability.reasonCodes || [];
  const blockedMessage = reasonCodes.includes('lifecycle-not-available')
    ? t(
        '素材检索尚未正式开放，已上传的素材不会受到影响。',
        'Media retrieval is not open yet. Your uploaded media is unaffected.',
      )
    : reasonCodes.includes('operator-disabled')
    ? t(
        '检索服务尚未启用，已上传的素材不会受到影响。',
        'Media retrieval is not enabled. Your uploaded media is unaffected.',
      )
    : reasonCodes.includes('not-ready')
    ? t(
        '检索服务仍在准备中，请稍后刷新状态。',
        'Media retrieval is still getting ready. Refresh the status later.',
      )
    : reasonCodes.includes('capacity-limited')
    ? t(
        '检索服务暂时繁忙，请稍后重试。',
        'Media retrieval is temporarily busy. Try again later.',
      )
    : t(
        '服务尚未准备好，或素材整理需要处理。请稍后检查状态；已上传素材不受影响。',
        'The service or media index requires attention. Check again later; your uploaded media is retained.',
      );
  return (
    <View
      style={[
        styles.card,
        { backgroundColor: c.surface, borderColor: c.border },
      ]}
    >
      <View style={styles.row}>
        {['loading', 'enable', 'indexing', 'purging'].includes(phase) ? (
          <ActivityIndicator color={c.accent} />
        ) : null}
        <Text style={[styles.sectionTitle, styles.flex, { color: c.text }]}>
          {titles[phase]}
        </Text>
      </View>
      {phase === 'blocked' && !state.error ? (
        <Text style={[styles.subtitle, { color: c.secondaryText }]}>
          {blockedMessage}
        </Text>
      ) : null}
      {showConsent ? (
        <>
          <Text style={[styles.subtitle, { color: c.secondaryText }]}>
            {t(
              '在你已上传的图片和视频中，用一句话寻找需要的画面。检索范围仅限你自己的素材。',
              'Describe a scene to find it in your uploaded photos and videos. Only your own media is searched.',
            )}
          </Text>
          <Pressable
            accessibilityRole="checkbox"
            accessibilityState={{ checked: consent, disabled: busy }}
            accessibilityLabel={t(
              '同意私有素材检索',
              'Consent to private media retrieval',
            )}
            disabled={busy}
            onPress={onConsent}
            style={[styles.row, styles.consent]}
          >
            <View
              style={[
                styles.checkbox,
                {
                  borderColor: c.accent,
                  backgroundColor: consent ? c.accent : c.surface,
                },
              ]}
            >
              {consent ? <Check color="#FFFFFF" size={16} /> : null}
            </View>
            <Text
              style={[styles.caption, styles.flex, { color: c.secondaryText }]}
            >
              {t(
                '我同意建立仅供本人使用的检索索引。为建立索引和理解检索描述，将所需图片、视频采样帧及检索描述发送至阿里云百炼（通义千问模型）处理。我可随时撤回并清除索引，原始素材不会被删除。',
                'I consent to a private search index. Required images, sampled video frames, and search descriptions are sent to Alibaba Cloud Model Studio (Qwen models) for indexing and understanding search requests. I can withdraw and clear this index at any time without deleting my original media.',
              )}
            </Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('启用检索', 'Enable retrieval')}
            accessibilityState={{ disabled: enableDisabled }}
            disabled={enableDisabled}
            onPress={onEnable}
            style={[
              styles.button,
              { backgroundColor: c.accent },
              enableDisabled && styles.disabled,
            ]}
          >
            <Text style={[styles.buttonText, styles.white]}>
              {t('启用检索', 'Enable retrieval')}
            </Text>
          </Pressable>
        </>
      ) : null}
      {state.status?.enabled && phase !== 'purging' ? (
        <Text style={[styles.subtitle, { color: c.secondaryText }]}>
          {t(
            `已整理 ${state.status.backfill.indexedAssets} / ${
              state.status.backfill.totalAssets
            } 个素材${
              state.status.backfill.skippedAssets
                ? `，${state.status.backfill.skippedAssets} 个待处理`
                : ''
            }`,
            `${state.status.backfill.indexedAssets} of ${state.status.backfill.totalAssets} media indexed; ${state.status.backfill.skippedAssets} require attention`,
          )}
        </Text>
      ) : null}
      {phase === 'purging' ? (
        <Text style={[styles.subtitle, { color: c.secondaryText }]}>
          {t(
            '检索已暂停。待服务端确认清理完成后，才会显示已撤回。你的原始图片和视频仍然保留。',
            'Search is paused until deletion is confirmed by the service. Your original photos and videos remain.',
          )}
        </Text>
      ) : null}
      {phase === 'indexing' && state.events.length ? (
        <Text style={[styles.caption, { color: c.secondaryText }]}>
          {language === 'zh'
            ? eventMessage(state.events[state.events.length - 1])
            : 'Index status updated'}
        </Text>
      ) : null}
    </View>
  );
}
