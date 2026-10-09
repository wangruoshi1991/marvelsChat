import React, { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  Text,
  View,
} from 'react-native';
import { ChevronLeft, RefreshCw } from 'lucide-react-native';
import { Palette } from '../../shared/theme';
import { textFor } from '../../shared/i18n';
import { MiaoxunApiError } from '../../services/api/http';
import { Language } from '../session/useMiaoxunSession';
import { resolveStationColors } from '../station/stationTheme';
import { canSearch, phaseFor } from './mediaRetrievalState';
import { MediaRetrievalSearchResult } from './mediaRetrievalTypes';
import { useMediaRetrieval } from './useMediaRetrieval';
import { RetrievalStatusCard } from './RetrievalStatusCard';
import { RetrievalResultCard } from './RetrievalResultCard';
import { RetrievalSearchForm } from './RetrievalSearchForm';
import { retrievalStyles as styles } from './mediaRetrievalStyles';

export function MediaRetrievalScreen({
  token,
  userId,
  registeredAvailability,
  palette,
  language,
  onClose,
  onOpenResult,
  invalidatedAssetId,
}: {
  token: string;
  userId: string;
  registeredAvailability: boolean;
  palette: Palette;
  language: Language;
  onClose: () => void;
  onOpenResult: (result: MediaRetrievalSearchResult) => void | Promise<void>;
  invalidatedAssetId?: string | null;
}) {
  const { state, controller } = useMediaRetrieval(
    token,
    registeredAvailability,
    userId,
  );
  const [consent, setConsent] = useState(false);
  const [query, setQuery] = useState('');
  const [kind, setKind] = useState<'image' | 'video' | undefined>();
  const [opening, setOpening] = useState(false);
  const [openError, setOpenError] = useState('');
  const openingRef = useRef(false);
  const c = resolveStationColors(palette);
  const t = (zh: string, en: string) => textFor(language, zh, en);
  const phase = phaseFor(state, registeredAvailability);
  const busy = Boolean(state.busy || state.refreshing);
  const searchEnabled = canSearch(state, registeredAvailability);
  useEffect(() => {
    setConsent(false);
    setQuery('');
    setKind(undefined);
    setOpenError('');
  }, [token]);
  useEffect(() => {
    if (invalidatedAssetId) controller.removeResult(invalidatedAssetId);
  }, [invalidatedAssetId, controller]);
  useEffect(() => {
    if (state.purgePending) setConsent(false);
  }, [state.purgePending]);

  const openResult = async (result: MediaRetrievalSearchResult) => {
    if (openingRef.current) return;
    openingRef.current = true;
    setOpening(true);
    setOpenError('');
    try {
      await onOpenResult(result);
    } catch (error) {
      if (
        error instanceof MiaoxunApiError &&
        [404, 409].includes(error.status || 0)
      )
        controller.removeResult(result.mediaAssetId);
      else
        setOpenError(
          t(
            '素材暂时无法打开，请检查网络后再试。',
            'Unable to open media. Check your connection and try again.',
          ),
        );
    } finally {
      openingRef.current = false;
      setOpening(false);
    }
  };
  const confirmPurge = () =>
    Alert.alert(
      t('撤回并清除索引', 'Withdraw and clear index'),
      t(
        '停止素材检索并清除为检索建立的数据。原始图片和视频不会删除。完成清理后，再次启用需要重新同意。',
        'Stop retrieval and clear derived search data. Your original photos and videos remain. Enabling again requires new consent.',
      ),
      [
        { text: t('取消', 'Cancel'), style: 'cancel' },
        {
          text: t('确认清除', 'Clear index'),
          style: 'destructive',
          onPress: () => {
            controller.perform('purge');
          },
        },
      ],
    );
  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      style={[styles.screen, { backgroundColor: c.background }]}
    >
      <View style={styles.header}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('返回', 'Back')}
          onPress={onClose}
          style={[styles.back, { backgroundColor: c.surface }]}
        >
          <ChevronLeft color={c.text} size={24} />
        </Pressable>
        <Text style={[styles.headerTitle, { color: c.text }]}>
          {t('找素材', 'Find media')}
        </Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('刷新检索状态', 'Refresh retrieval status')}
          disabled={busy}
          onPress={() => {
            controller.checkStatus();
          }}
          style={styles.back}
        >
          {state.refreshing ? (
            <ActivityIndicator color={c.accent} />
          ) : (
            <RefreshCw size={20} color={c.accent} />
          )}
        </Pressable>
      </View>
      <ScrollView
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
      >
        <RetrievalStatusCard
          state={state}
          phase={phase}
          consent={consent}
          onConsent={() => setConsent(value => !value)}
          onEnable={() => {
            if (consent && phase === 'disabled' && !busy)
              controller.perform('enable');
          }}
          palette={palette}
          language={language}
        />
        {state.error || openError ? (
          <View
            style={[
              styles.card,
              { backgroundColor: c.surface, borderColor: c.border },
            ]}
          >
            <Text
              accessibilityRole="alert"
              style={[styles.subtitle, { color: palette.rose }]}
            >
              {openError ||
                (language === 'zh'
                  ? state.error?.message
                  : 'This operation could not be completed. Check the service status before trying again.')}
            </Text>
            {controller.hasRetryAction() ? (
              <Pressable
                accessibilityRole="button"
                disabled={busy}
                onPress={() => {
                  controller.retryAction();
                }}
                style={styles.inlineAction}
              >
                <Text style={[styles.buttonText, { color: c.accent }]}>
                  {t('重试本次操作', 'Retry this operation')}
                </Text>
              </Pressable>
            ) : null}
          </View>
        ) : null}
        {state.status?.enabled && !state.purgePending ? (
          <RetrievalSearchForm
            palette={palette}
            language={language}
            query={query}
            kind={kind}
            onQuery={setQuery}
            onKind={setKind}
            onSearch={() => {
              controller.search(query, kind);
            }}
            busy={Boolean(state.busy)}
            searching={state.busy === 'search'}
            enabled={searchEnabled}
          />
        ) : null}
        {state.searched ? (
          <View style={styles.column}>
            <Text style={[styles.sectionTitle, { color: c.text }]}>
              {t(
                `找到 ${state.results.length} 个素材`,
                `${state.results.length} results`,
              )}
            </Text>
            {!state.results.length ? (
              <Text style={[styles.subtitle, { color: c.secondaryText }]}>
                {t(
                  '未找到匹配素材。试试更具体地描述画面，或检查素材是否已整理完成。',
                  'No matching media. Try a more specific description or check that indexing is complete.',
                )}
              </Text>
            ) : null}
            {state.results.map(result => (
              <RetrievalResultCard
                key={result.mediaAssetId}
                result={result}
                token={token}
                palette={palette}
                language={language}
                disabled={opening || busy}
                onPress={() => {
                  openResult(result);
                }}
              />
            ))}
          </View>
        ) : null}
        {state.status?.enabled || state.purgePending ? (
          <View
            style={[
              styles.card,
              { backgroundColor: c.surface, borderColor: c.border },
            ]}
          >
            <Text style={[styles.sectionTitle, { color: c.text }]}>
              {t('检索设置', 'Retrieval settings')}
            </Text>
            {state.status?.enabled && !state.purgePending ? (
              <Pressable
                accessibilityRole="button"
                disabled={
                  busy ||
                  state.chargeReview ||
                  phase === 'indexing' ||
                  !state.status.availability.canStartRun
                }
                onPress={() => {
                  controller.perform('reindex');
                }}
                style={styles.inlineAction}
              >
                <Text
                  style={[
                    styles.buttonText,
                    { color: c.accent },
                    (busy ||
                      state.chargeReview ||
                      phase === 'indexing' ||
                      !state.status.availability.canStartRun) &&
                      styles.disabled,
                  ]}
                >
                  {t('补建遗漏素材的索引', 'Index missing media')}
                </Text>
              </Pressable>
            ) : null}
            <Pressable
              accessibilityRole="button"
              disabled={
                busy ||
                (state.purgePending &&
                  Boolean(
                    state.run &&
                      state.run.runType === 'media-purge' &&
                      !['failed', 'blocked', 'cancelled'].includes(
                        state.run.lifecycleStatus,
                      ),
                  ))
              }
              onPress={confirmPurge}
              style={styles.inlineAction}
            >
              <Text style={[styles.buttonText, { color: palette.rose }]}>
                {t('撤回并清除索引', 'Withdraw and clear index')}
              </Text>
            </Pressable>
          </View>
        ) : null}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
