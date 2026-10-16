import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  AppState,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ChevronRight } from 'lucide-react-native';
import { AgentWorkspace } from '../../models/agentWorkspace';
import { StationContentDTO } from '../../models/api';
import { textFor } from '../../shared/i18n';
import { Palette } from '../../shared/theme';
import { Header } from '../../shared/ui';
import { WorkspaceButton, WorkspaceState } from '../../shared/workspaceUi';
import { ChatMessageText } from '../messages/ChatMessageText';
import { Language } from '../session/sessionTypes';
import { SiteDocumentPreview } from '../site-document/SiteDocumentPreview';
import { useAgentWorkspaces } from '../workspaces/useAgentWorkspaces';
import { StationPageHeading } from './StationPageHeading';
import { resolveStationColors } from './stationTheme';
import { stationOutcomes } from './stationOutcomes';
import { StationOutfitResult } from './StationOutfitResult';

export function StationOutcomesPanel({
  active,
  token,
  language,
  palette,
  stationContent,
  onRefreshStationContent,
  onOpenWorkspace,
}: {
  active: boolean;
  token: string;
  language: Language;
  palette: Palette;
  stationContent: StationContentDTO;
  onRefreshStationContent: (signal: AbortSignal) => Promise<unknown>;
  onOpenWorkspace: (workspace: AgentWorkspace) => void;
}) {
  const colors = resolveStationColors(palette);
  const t = (zh: string, en: string) => textFor(language, zh, en);
  const workspaces = useAgentWorkspaces({ token, active });
  const outcomes = useMemo(
    () => stationOutcomes(stationContent, workspaces.workspaces, language),
    [stationContent, workspaces.workspaces, language],
  );
  const [selection, setSelection] = useState<{
    token: string;
    key: string;
  } | null>(null);
  const [foreground, setForeground] = useState(
    AppState.currentState === 'active',
  );
  const visibleScope = useRef({ token, active, foreground });
  visibleScope.current = { token, active, foreground };
  const contentRequest = useRef<AbortController | null>(null);
  const [contentRefresh, setContentRefresh] = useState<{
    token: string;
    status: 'loading' | 'loaded' | 'failed';
  } | null>(null);
  const refreshContent = useCallback(async () => {
    const scope = visibleScope.current;
    if (scope.token !== token || !scope.active || !scope.foreground || !token)
      return;
    contentRequest.current?.abort();
    const controller = new AbortController();
    contentRequest.current = controller;
    const isCurrent = () =>
      contentRequest.current === controller &&
      !controller.signal.aborted &&
      visibleScope.current.token === token &&
      visibleScope.current.active &&
      visibleScope.current.foreground;
    setContentRefresh({ token, status: 'loading' });
    try {
      await onRefreshStationContent(controller.signal);
      if (isCurrent()) setContentRefresh({ token, status: 'loaded' });
    } catch {
      if (isCurrent()) setContentRefresh({ token, status: 'failed' });
    }
  }, [onRefreshStationContent, token]);
  useEffect(() => {
    const subscription = AppState.addEventListener('change', state => {
      visibleScope.current.foreground = state === 'active';
      setForeground(state === 'active');
      if (state !== 'active') {
        contentRequest.current?.abort();
        setSelection(null);
      }
    });
    return () => subscription.remove();
  }, []);
  useEffect(() => {
    setSelection(null);
  }, [active, token]);
  useEffect(() => {
    if (active && foreground) refreshContent();
    return () => contentRequest.current?.abort();
  }, [active, foreground, refreshContent]);
  const contentStatus =
    contentRefresh?.token === token ? contentRefresh.status : null;
  const contentError =
    contentStatus === 'failed'
      ? t('无法读取创作成果，请重试。', 'Unable to load creations. Try again.')
      : '';
  const selected =
    active && foreground && selection?.token === token
      ? outcomes.find(item => item.key === selection.key)
      : undefined;
  return (
    <View style={s.stack}>
      <StationPageHeading
        palette={palette}
        title={t('我的成果', 'My outcomes')}
        detail={t(
          '查看最近的创作与协作产出',
          'Recent creations and task results',
        )}
      />
      {contentError || workspaces.error ? (
        <View style={s.stack}>
          {[contentError, workspaces.error]
            .filter(Boolean)
            .map((error, index) => (
              <Text
                key={index}
                accessibilityRole="alert"
                style={{ color: palette.rose }}
              >
                {error}
              </Text>
            ))}
          <WorkspaceButton
            palette={palette}
            label={t('重新读取成果', 'Reload outcomes')}
            disabled={!active || !foreground || contentStatus === 'loading'}
            onPress={() => {
              const scope = visibleScope.current;
              if (scope.token !== token || !scope.active || !scope.foreground)
                return;
              refreshContent();
              workspaces.refresh();
            }}
          />
        </View>
      ) : !workspaces.loaded || contentStatus !== 'loaded' ? (
        <Text style={{ color: colors.secondaryText }}>
          {t('正在读取成果…', 'Loading outcomes…')}
        </Text>
      ) : null}
      {outcomes.map(item => (
        <Pressable
          key={item.key}
          testID={`outcome-${item.key}`}
          accessibilityRole="button"
          accessibilityLabel={t(`打开${item.title}`, `Open ${item.title}`)}
          disabled={!active}
          onPress={() => {
            if (item.target.kind === 'workspace')
              onOpenWorkspace(item.target.workspace);
            else setSelection({ token, key: item.key });
          }}
          style={[
            s.card,
            { backgroundColor: colors.surface, borderColor: colors.border },
          ]}
        >
          <View style={s.copy}>
            <Text style={[s.label, { color: colors.secondaryText }]}>
              {item.label}
            </Text>
            <Text numberOfLines={2} style={[s.title, { color: colors.text }]}>
              {item.title}
            </Text>
            {item.summary && item.summary !== item.title ? (
              <Text
                numberOfLines={2}
                style={[s.body, { color: colors.secondaryText }]}
              >
                {item.summary}
              </Text>
            ) : null}
          </View>
          <ChevronRight size={18} color={colors.secondaryText} />
        </Pressable>
      ))}
      {contentStatus === 'loaded' &&
      workspaces.loaded &&
      !workspaces.error &&
      !outcomes.length ? (
        <WorkspaceState
          palette={palette}
          title={t('暂无成果', 'No outcomes yet')}
          description={t(
            '完成的文字成果、页面、分镜和穿搭记录会显示在这里。',
            'Text results, pages, storyboards and outfits appear here.',
          )}
        />
      ) : null}
      {selected?.target.kind === 'site' ? (
        <SiteDocumentPreview
          key={`${token}:${selected.target.id}`}
          draftId={selected.target.id}
          token={token}
          active={active}
          palette={palette}
          language={language}
          onClose={() => setSelection(null)}
        />
      ) : null}
      {selected?.target.kind === 'text' ||
      selected?.target.kind === 'outfit' ? (
        <Modal
          key={`${token}:${selected.key}`}
          animationType="slide"
          visible
          onRequestClose={() => setSelection(null)}
        >
          <SafeAreaView
            style={[s.screen, { backgroundColor: colors.background }]}
          >
            <Header
              title={selected.title}
              palette={palette}
              onBack={() => setSelection(null)}
            />
            <ScrollView contentContainerStyle={s.detail}>
              <Text style={[s.label, { color: colors.secondaryText }]}>
                {selected.label}
              </Text>
              {selected.summary ? (
                <ChatMessageText
                  formatted
                  palette={palette}
                  style={[s.body, { color: colors.text }]}
                >
                  {selected.summary}
                </ChatMessageText>
              ) : null}
              {selected.target.kind === 'outfit' ? (
                <StationOutfitResult
                  avatarConfig={selected.target.avatarConfig}
                  mediaAssetId={selected.target.mediaAssetId}
                  token={token}
                  palette={palette}
                  language={language}
                />
              ) : (
                selected.target.sections.map((section, index) => (
                  <View key={index} style={s.stack}>
                    {section.title ? (
                      <Text style={[s.title, { color: colors.text }]}>
                        {section.title}
                      </Text>
                    ) : null}
                    {section.body.map((body, part) => (
                      <ChatMessageText
                        key={part}
                        formatted
                        palette={palette}
                        style={[s.body, { color: colors.text }]}
                      >
                        {body}
                      </ChatMessageText>
                    ))}
                  </View>
                ))
              )}
            </ScrollView>
          </SafeAreaView>
        </Modal>
      ) : null}
    </View>
  );
}
const s = StyleSheet.create({
  screen: { flex: 1 },
  stack: { gap: 12 },
  detail: { padding: 20, gap: 20 },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 16,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
  },
  copy: { flex: 1, gap: 6 },
  title: { fontSize: 17, lineHeight: 24, fontWeight: '600' },
  label: { fontSize: 12, lineHeight: 18 },
  body: { fontSize: 15, lineHeight: 23 },
});
