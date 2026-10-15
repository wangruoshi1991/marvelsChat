import React, { useEffect, useRef, useState } from 'react';
import {
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import {
  assertSiteDocument,
  type SiteDocumentSection,
} from '../../../../shared/site-document';
import { StationDiaryEntryDTO } from '../../models/api';
import { SiteDocumentView } from '../../models/siteDocument';
import { textFor } from '../../shared/i18n';
import { Palette } from '../../shared/theme';
import {
  WorkspaceButton,
  WorkspacePanel,
  WorkspaceState,
  workspaceTokens,
} from '../../shared/workspaceUi';
import { Language } from '../session/sessionTypes';
import { StationMediaPreviewScreen } from '../station/StationMediaPreviewScreen';
import { SiteDocumentMedia } from './SiteDocumentMedia';
import { siteDocumentTheme } from './siteDocumentTheme';

export type SiteDocumentRendererProps = {
  view: SiteDocumentView | null;
  token: string;
  palette: Palette;
  language: Language;
  onReadinessChange?: (ready: boolean) => void;
};

type Selection = { kind: 'view-media' | 'view-diary'; id: string };

// Both previews and applied pages enter here. No model HTML, URLs, or arbitrary
// navigation actions are interpreted by this renderer.
export function SiteDocumentRenderer(props: SiteDocumentRendererProps) {
  const { view, token, palette, language } = props;
  if (!token) {
    return (
      <WorkspaceState
        palette={palette}
        title={textFor(
          language,
          '登录后查看私有页面',
          'Sign in to view this private page',
        )}
      />
    );
  }
  if (!view) {
    return (
      <WorkspaceState
        palette={palette}
        title={textFor(language, '暂无结构页面', 'No structured page yet')}
      />
    );
  }
  try {
    assertSiteDocument(view.document);
    if (
      typeof view.documentHash !== 'string' ||
      !view.documentHash ||
      typeof view.resourcesHash !== 'string' ||
      !view.resourcesHash ||
      !Array.isArray(view.mediaAssets) ||
      !Array.isArray(view.diaryEntries) ||
      new Set(view.mediaAssets.map(item => item?.id)).size !==
        view.mediaAssets.length ||
      new Set(view.diaryEntries.map(item => item?.id)).size !==
        view.diaryEntries.length ||
      view.mediaAssets.some(
        item =>
          !item ||
          typeof item.id !== 'string' ||
          typeof item.caption !== 'string' ||
          typeof item.originalFilename !== 'string',
      ) ||
      view.diaryEntries.some(
        item =>
          !item ||
          typeof item.id !== 'string' ||
          typeof item.title !== 'string' ||
          typeof item.body !== 'string' ||
          typeof item.mood !== 'string',
      )
    ) {
      throw new Error('Invalid site document resources');
    }
  } catch {
    return (
      <WorkspaceState
        palette={palette}
        tone="error"
        title={textFor(
          language,
          '无法显示此页面结构',
          'This page structure cannot be displayed',
        )}
        description={textFor(
          language,
          '页面结构不受支持或内容不完整，请重新加载。',
          'The page structure is unsupported or incomplete. Reload it to continue.',
        )}
      />
    );
  }
  return (
    <DocumentContent
      key={`${token}:${view.document.documentId}:${view.documentHash}:${view.resourcesHash}`}
      {...props}
      view={view}
    />
  );
}

function DocumentContent({
  view,
  token,
  palette,
  language,
  onReadinessChange,
}: SiteDocumentRendererProps & { view: SiteDocumentView }) {
  const [selection, setSelection] = useState<Selection | null>(null);
  const [unavailable, setUnavailable] = useState<string[]>([]);
  const [loadedImages, setLoadedImages] = useState<Record<string, boolean>>({});
  const alive = useRef(true);
  const readiness = useRef(onReadinessChange);
  readiness.current = onReadinessChange;
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);
  const { fontScale } = useWindowDimensions();
  const theme = siteDocumentTheme(view.document.theme, palette);
  const colors = theme.colors;
  const mediaById = new Map(view.mediaAssets.map(asset => [asset.id, asset]));
  const diaryById = new Map(view.diaryEntries.map(entry => [entry.id, entry]));
  const mediaAvailable = (id: string) => {
    const asset = mediaById.get(id);
    return asset &&
      asset.status === 'uploaded' &&
      (asset.kind === 'image' || asset.kind === 'video') &&
      !unavailable.includes(id)
      ? asset
      : null;
  };
  const canOpen = (section: SiteDocumentSection, action: Selection) =>
    action.kind === 'view-media'
      ? section.assetIds.includes(action.id) && !!mediaAvailable(action.id)
      : section.diaryEntryIds.includes(action.id) && diaryById.has(action.id);
  const open = (section: SiteDocumentSection, action: Selection) => {
    if (canOpen(section, action)) setSelection(action);
  };
  const selectedMedia =
    selection?.kind === 'view-media' ? mediaAvailable(selection.id) : null;
  const selectedDiary =
    selection?.kind === 'view-diary' ? diaryById.get(selection.id) : null;
  const close = () => setSelection(null);
  const missingMedia = textFor(
    language,
    '引用素材不可用',
    'Referenced media is unavailable',
  );
  const missingDiary = textFor(
    language,
    '引用日记不可用',
    'Referenced diary is unavailable',
  );
  const columns = fontScale > 1.3 ? 1 : theme.mediaColumns;
  // Each rendered image must load, even when the same asset appears in more
  // than one section. Videos retain their existing explicit play control.
  const ready = view.document.sections.every(
    section =>
      section.assetIds.every(id => {
        const asset = mediaAvailable(id);
        return (
          !!asset &&
          (asset.kind === 'video' || loadedImages[`${section.id}:${id}`])
        );
      }) && section.diaryEntryIds.every(id => diaryById.has(id)),
  );
  useEffect(() => {
    readiness.current?.(ready);
  }, [ready]);

  return (
    <View
      testID="site-document"
      style={[s.screen, { backgroundColor: colors.background }]}
    >
      <ScrollView
        contentContainerStyle={[s.content, { gap: theme.sectionGap }]}
      >
        <View style={s.titleBlock}>
          <Text style={[s.privacy, { color: theme.accent }]}>
            {textFor(language, '仅自己可见', 'Only visible to you')}
          </Text>
          <Text
            selectable
            accessibilityRole="header"
            style={[s.pageTitle, { color: colors.text }]}
          >
            {view.document.title}
          </Text>
          {view.document.summary ? (
            <Text selectable style={[s.body, { color: colors.secondaryText }]}>
              {view.document.summary}
            </Text>
          ) : null}
        </View>
        {view.document.sections.map(section => (
          <WorkspacePanel
            key={section.id}
            testID={`site-section-${section.id}`}
            palette={colors}
            style={[
              s.section,
              { borderRadius: theme.sectionRadius },
              section.type === 'hero' && s.hero,
            ]}
          >
            <Text
              selectable
              accessibilityRole="header"
              style={[
                s.sectionTitle,
                section.type === 'hero' && s.heroTitle,
                { color: colors.text },
              ]}
            >
              {section.title}
            </Text>
            {section.subtitle ? (
              <Text selectable style={[s.subtitle, { color: theme.accent }]}>
                {section.subtitle}
              </Text>
            ) : null}
            {section.body ? (
              <Text selectable style={[s.body, { color: colors.text }]}>
                {section.body}
              </Text>
            ) : null}
            {section.assetIds.length ? (
              <View style={s.mediaGrid}>
                {section.assetIds.map(id => {
                  const asset = mediaAvailable(id);
                  return (
                    <View key={id} style={columns === 2 ? s.half : s.full}>
                      {asset ? (
                        <SiteDocumentMedia
                          asset={asset}
                          token={token}
                          palette={colors}
                          language={language}
                          onReadinessChange={loaded => {
                            if (!alive.current) return;
                            // Revoke immediately, including when a back action
                            // is batched before the next render/effect.
                            if (!loaded) readiness.current?.(false);
                            const key = `${section.id}:${id}`;
                            setLoadedImages(previous =>
                              previous[key] === loaded
                                ? previous
                                : { ...previous, [key]: loaded },
                            );
                          }}
                          onOpen={() =>
                            open(section, { kind: 'view-media', id })
                          }
                        />
                      ) : (
                        <WorkspaceState
                          palette={colors}
                          tone="error"
                          title={missingMedia}
                        />
                      )}
                    </View>
                  );
                })}
              </View>
            ) : null}
            {section.diaryEntryIds.map(id => {
              const entry = diaryById.get(id);
              return entry ? (
                <DiaryContent
                  key={id}
                  entry={entry}
                  palette={colors}
                  language={language}
                />
              ) : (
                <WorkspaceState
                  key={id}
                  palette={colors}
                  tone="error"
                  title={missingDiary}
                />
              );
            })}
            {section.actions.length ? (
              <View style={s.actions}>
                {section.actions.map((action, actionIndex) => {
                  if (action.kind === 'interaction-intent') {
                    const state = textFor(
                      language,
                      '尚未接通',
                      'Not connected',
                    );
                    return (
                      <View
                        key={`${section.id}:intent:${actionIndex}`}
                        testID={`site-intent-${section.id}-${actionIndex}`}
                        style={s.intent}
                      >
                        <WorkspaceButton
                          palette={colors}
                          variant="secondary"
                          label={action.label}
                          disabled
                          accessibilityHint={state}
                        />
                        <Text
                          style={[s.privacy, { color: colors.secondaryText }]}
                        >
                          {state}
                        </Text>
                        <Text
                          selectable
                          style={[s.body, { color: colors.text }]}
                        >
                          {action.target.text}
                        </Text>
                      </View>
                    );
                  }
                  const target = { kind: action.kind, id: action.targetId };
                  return (
                    <WorkspaceButton
                      key={`${action.kind}:${action.targetId}`}
                      palette={colors}
                      variant="secondary"
                      label={action.label}
                      disabled={!canOpen(section, target)}
                      onPress={() => open(section, target)}
                    />
                  );
                })}
              </View>
            ) : null}
          </WorkspacePanel>
        ))}
      </ScrollView>
      {selection ? (
        <Modal visible animationType="slide" onRequestClose={close}>
          <SafeAreaProvider>
            <SafeAreaView
              style={[s.screen, { backgroundColor: colors.background }]}
            >
              {selectedMedia ? (
                <StationMediaPreviewScreen
                  asset={selectedMedia}
                  token={token}
                  timestampMs={null}
                  palette={colors}
                  language={language}
                  onBack={close}
                  onUnavailable={id => {
                    if (!alive.current) return;
                    readiness.current?.(false);
                    setUnavailable(previous => [...previous, id]);
                  }}
                />
              ) : (
                <>
                  <WorkspaceButton
                    palette={colors}
                    variant="ghost"
                    label={textFor(language, '返回页面', 'Back to page')}
                    onPress={close}
                  />
                  <ScrollView contentContainerStyle={s.content}>
                    {selectedDiary ? (
                      <DiaryContent
                        entry={selectedDiary}
                        palette={colors}
                        language={language}
                      />
                    ) : (
                      <WorkspaceState
                        palette={colors}
                        tone="error"
                        title={
                          selection.kind === 'view-media'
                            ? missingMedia
                            : missingDiary
                        }
                      />
                    )}
                  </ScrollView>
                </>
              )}
            </SafeAreaView>
          </SafeAreaProvider>
        </Modal>
      ) : null}
    </View>
  );
}

function DiaryContent({
  entry,
  palette,
  language,
}: {
  entry: StationDiaryEntryDTO;
  palette: Palette;
  language: Language;
}) {
  return (
    <View style={[s.diary, { borderColor: palette.border }]}>
      <Text
        selectable
        accessibilityRole="header"
        style={[s.sectionTitle, { color: palette.text }]}
      >
        {entry.title}
      </Text>
      {entry.mood ? (
        <Text selectable style={[s.subtitle, { color: palette.secondaryText }]}>
          {entry.mood}
        </Text>
      ) : null}
      {entry.createdAt && !Number.isNaN(Date.parse(entry.createdAt)) ? (
        <Text style={[s.privacy, { color: palette.secondaryText }]}>
          {new Date(entry.createdAt).toLocaleDateString(
            language === 'zh' ? 'zh-CN' : 'en-US',
          )}
        </Text>
      ) : null}
      <Text selectable style={[s.body, { color: palette.text }]}>
        {entry.body}
      </Text>
    </View>
  );
}

const s = StyleSheet.create({
  screen: { flex: 1 },
  content: {
    padding: workspaceTokens.space.lg,
    paddingBottom: workspaceTokens.space.xxl,
    gap: workspaceTokens.space.lg,
  },
  titleBlock: { gap: workspaceTokens.space.sm },
  privacy: workspaceTokens.typography.caption,
  pageTitle: { fontSize: 26, lineHeight: 34, fontWeight: '700' },
  section: { padding: workspaceTokens.space.lg, gap: workspaceTokens.space.md },
  hero: { paddingVertical: workspaceTokens.space.xxl },
  sectionTitle: workspaceTokens.typography.heading,
  heroTitle: { fontSize: 23, lineHeight: 31, fontWeight: '600' },
  subtitle: workspaceTokens.typography.title,
  body: { fontSize: 15, lineHeight: 25 },
  mediaGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: workspaceTokens.space.md,
  },
  half: { width: '47.5%' },
  full: { width: '100%' },
  actions: { gap: workspaceTokens.space.sm },
  intent: { gap: workspaceTokens.space.xs },
  diary: {
    paddingVertical: workspaceTokens.space.md,
    borderTopWidth: StyleSheet.hairlineWidth,
    gap: workspaceTokens.space.sm,
  },
});
