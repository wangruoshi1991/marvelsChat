import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  Share,
  Text,
  View,
} from 'react-native';
import {
  Eye,
  FileClock,
  Globe2,
  Pencil,
  Plus,
  Settings,
  Share2,
  Unlink,
} from 'lucide-react-native';

import {
  HomepageGenerationJobDTO,
  HomepageReleaseDTO,
  HomepageSiteDraftDTO,
  HomepageSiteDTO,
  HomepageVisibility,
} from '../../models/api';
import { homepageDraftStore } from '../../services/homepageDraftStore';
import { textFor } from '../../shared/i18n';
import { Palette } from '../../shared/theme';
import { Language } from '../session/useMiaoxunSession';
import { HomepageCreateFlow } from './HomepageCreateFlow';
import { HomepageEditor } from './HomepageEditor';
import { HomepagePreview } from './HomepagePreview';
import { homepageStyles } from './homepageStyles';
import { HomepageScreenMode, HomepageSession } from './homepageTypes';

const generationFallbackDelayMs = 20_000;
const maxPollAttempts = 160;

const sleep = (milliseconds: number) =>
  new Promise<void>(resolve => setTimeout(resolve, milliseconds));

const idempotencyKey = () =>
  `homepage:${Date.now().toString(36)}:${Math.random()
    .toString(36)
    .slice(2, 10)}`;

function HomepageHeader({
  palette,
  language,
  onOpenSettings,
}: {
  palette: Palette;
  language: Language;
  onOpenSettings: () => void;
}) {
  return (
    <View
      style={[homepageStyles.header, { borderBottomColor: palette.border }]}
    >
      <Text style={[homepageStyles.headerTitle, { color: palette.text }]}>
        {textFor(language, '我的主页', 'My Homepage')}
      </Text>
      <Pressable
        accessibilityLabel={textFor(language, '设置', 'Settings')}
        onPress={onOpenSettings}
        style={[
          homepageStyles.headerButton,
          { backgroundColor: palette.surface, borderColor: palette.border },
        ]}
      >
        <Settings color={palette.text} size={19} strokeWidth={2.3} />
      </Pressable>
    </View>
  );
}

export function HomepageScreen({
  palette,
  language,
  session,
  pollIntervalMs = 1500,
  onOpenSettings,
  onActionMessage,
  onActionError,
}: {
  palette: Palette;
  language: Language;
  session: HomepageSession;
  pollIntervalMs?: number;
  onOpenSettings: () => void;
  onActionMessage: (message: string) => void;
  onActionError: (error: unknown) => void;
}) {
  const [mode, setMode] = useState<HomepageScreenMode>('home');
  const [isLoading, setIsLoading] = useState(true);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isTakingLong, setIsTakingLong] = useState(false);
  const [siteDraft, setSiteDraft] = useState<HomepageSiteDraftDTO | null>(null);
  const [site, setSite] = useState<HomepageSiteDTO | null>(null);
  const [releases, setReleases] = useState<HomepageReleaseDTO[]>([]);
  const [previewUrl, setPreviewUrl] = useState('');
  const [statusMessage, setStatusMessage] = useState('');
  const [screenError, setScreenError] = useState('');
  const [resumePrompt, setResumePrompt] = useState('');
  const [resumeMediaIds, setResumeMediaIds] = useState<string[]>([]);
  const cancelledRef = useRef(false);
  const longTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pollRunRef = useRef(0);
  const {
    token,
    user,
    homepageV1,
    homepageSite: fetchHomepageSite,
    homepageJobs: fetchHomepageJobs,
    homepageReleases: fetchHomepageReleases,
    homepageDraft: fetchHomepageDraft,
    createHomepageJob,
    homepageJob: fetchHomepageJob,
    updateHomepageDraft,
    refineHomepageSection,
    createHomepagePreview,
    publishHomepage,
    unpublishHomepage,
    restoreHomepageRelease,
  } = session;
  const userId = user?.id || '';

  const stopLongTimer = useCallback(() => {
    if (longTimerRef.current) {
      clearTimeout(longTimerRef.current);
      longTimerRef.current = null;
    }
    setIsTakingLong(false);
  }, []);

  const startLongTimer = useCallback(() => {
    stopLongTimer();
    longTimerRef.current = setTimeout(() => {
      setIsTakingLong(true);
    }, generationFallbackDelayMs);
  }, [stopLongTimer]);

  const saveResumeState = useCallback(
    async ({
      prompt,
      mediaAssetIds,
      activeJobId,
      draftId,
    }: {
      prompt: string;
      mediaAssetIds: string[];
      activeJobId: string | null;
      draftId: string | null;
    }) => {
      if (!userId) {
        return;
      }
      await homepageDraftStore
        .save({
          schemaVersion: 1,
          userId,
          prompt,
          selectedMediaAssetIds: mediaAssetIds,
          activeJobId,
          draftId,
          updatedAt: new Date().toISOString(),
        })
        .catch(() => undefined);
    },
    [userId],
  );

  const finishJob = useCallback(
    async (
      job: HomepageGenerationJobDTO,
      prompt: string,
      mediaAssetIds: string[],
    ) => {
      if (job.status === 'failed') {
        stopLongTimer();
        setIsGenerating(false);
        setScreenError(
          textFor(
            language,
            '主页暂时没有生成成功，请重试。',
            'Homepage generation did not finish. Try again.',
          ),
        );
        await saveResumeState({
          prompt,
          mediaAssetIds,
          activeJobId: null,
          draftId: null,
        });
        return true;
      }
      if (job.status !== 'completed' || !job.siteDraftId) {
        return false;
      }

      const loadedDraft = await fetchHomepageDraft(job.siteDraftId);
      if (cancelledRef.current) {
        return true;
      }
      stopLongTimer();
      setIsGenerating(false);
      setSiteDraft(loadedDraft);
      setStatusMessage(
        job.source === 'fallback'
          ? textFor(language, '基础版已生成', 'Basic version ready')
          : textFor(language, '主页草稿已生成', 'Homepage draft ready'),
      );
      setScreenError('');
      setMode('editor');
      await saveResumeState({
        prompt,
        mediaAssetIds,
        activeJobId: null,
        draftId: loadedDraft.id,
      });
      return true;
    },
    [fetchHomepageDraft, language, saveResumeState, stopLongTimer],
  );

  const pollJob = useCallback(
    async (jobId: string, prompt: string, mediaAssetIds: string[]) => {
      const runId = ++pollRunRef.current;
      for (let attempt = 0; attempt < maxPollAttempts; attempt += 1) {
        if (cancelledRef.current || pollRunRef.current !== runId || !token) {
          return;
        }
        const job = await fetchHomepageJob(jobId);
        if (cancelledRef.current || pollRunRef.current !== runId) {
          return;
        }
        if (await finishJob(job, prompt, mediaAssetIds)) {
          return;
        }
        await sleep(pollIntervalMs);
      }
      if (pollRunRef.current !== runId) {
        return;
      }
      stopLongTimer();
      setIsGenerating(false);
      setScreenError(
        textFor(
          language,
          '生成仍在后台进行，稍后回到这里可继续查看。',
          'Generation is still running. Return later to continue.',
        ),
      );
    },
    [
      fetchHomepageJob,
      finishJob,
      language,
      pollIntervalMs,
      stopLongTimer,
      token,
    ],
  );

  const load = useCallback(async () => {
    if (!homepageV1.enabled || !userId) {
      setIsLoading(false);
      return;
    }
    setIsLoading(true);
    setScreenError('');
    try {
      const [siteResult, jobs, releaseItems, localState] = await Promise.all([
        fetchHomepageSite(),
        fetchHomepageJobs(10),
        fetchHomepageReleases(10),
        homepageDraftStore.read(userId),
      ]);
      if (cancelledRef.current) {
        return;
      }
      setSite(siteResult.site);
      setReleases(releaseItems);
      setResumePrompt(localState?.prompt || '');
      setResumeMediaIds(localState?.selectedMediaAssetIds || []);

      const latestCompleted = jobs.find(
        job => job.status === 'completed' && job.siteDraftId,
      );
      const targetDraftId =
        siteResult.site?.currentDraftId ||
        localState?.draftId ||
        latestCompleted?.siteDraftId ||
        null;
      if (targetDraftId) {
        const loadedDraft = await fetchHomepageDraft(targetDraftId);
        if (!cancelledRef.current) {
          setSiteDraft(loadedDraft);
        }
      } else if (localState?.prompt) {
        setMode('create');
      }

      if (localState?.activeJobId) {
        setMode('create');
        setIsGenerating(true);
        startLongTimer();
        pollJob(
          localState.activeJobId,
          localState.prompt,
          localState.selectedMediaAssetIds,
        ).catch(error => {
          setIsGenerating(false);
          stopLongTimer();
          onActionError(error);
        });
      }
    } catch (error) {
      setScreenError(
        textFor(
          language,
          '主页暂时无法加载，请稍后重试。',
          'Homepage could not load. Try again later.',
        ),
      );
      onActionError(error);
    } finally {
      if (!cancelledRef.current) {
        setIsLoading(false);
      }
    }
  }, [
    fetchHomepageDraft,
    fetchHomepageJobs,
    fetchHomepageReleases,
    fetchHomepageSite,
    homepageV1.enabled,
    language,
    onActionError,
    pollJob,
    startLongTimer,
    stopLongTimer,
    userId,
  ]);

  useEffect(() => {
    cancelledRef.current = false;
    load().catch(onActionError);
    return () => {
      cancelledRef.current = true;
      pollRunRef.current += 1;
      if (longTimerRef.current) {
        clearTimeout(longTimerRef.current);
        longTimerRef.current = null;
      }
    };
  }, [load, onActionError]);

  const generate = async ({
    prompt,
    mediaAssetIds,
  }: {
    prompt: string;
    mediaAssetIds: string[];
  }) => {
    setIsGenerating(true);
    setScreenError('');
    setStatusMessage('');
    setResumePrompt(prompt);
    setResumeMediaIds(mediaAssetIds);
    startLongTimer();
    try {
      await saveResumeState({
        prompt,
        mediaAssetIds,
        activeJobId: null,
        draftId: null,
      });
      const result = await createHomepageJob({
        prompt,
        mediaAssetIds,
        idempotencyKey: idempotencyKey(),
      });
      await saveResumeState({
        prompt,
        mediaAssetIds,
        activeJobId: result.job.id,
        draftId: null,
      });
      if (await finishJob(result.job, prompt, mediaAssetIds)) {
        return;
      }
      await pollJob(result.job.id, prompt, mediaAssetIds);
    } catch (error) {
      stopLongTimer();
      setIsGenerating(false);
      setScreenError(
        textFor(
          language,
          '主页暂时没有生成成功，请重试。',
          'Homepage generation did not finish. Try again.',
        ),
      );
      throw error;
    }
  };

  const saveDraft = async (draft: HomepageSiteDraftDTO['draft']) => {
    if (!siteDraft) {
      throw new Error('Homepage draft is unavailable.');
    }
    const updated = await updateHomepageDraft(siteDraft.id, {
      revision: siteDraft.revision,
      draft,
    });
    setSiteDraft(updated);
    await saveResumeState({
      prompt: updated.prompt,
      mediaAssetIds: updated.selectedMediaAssetIds,
      activeJobId: null,
      draftId: updated.id,
    });
    return updated;
  };

  const refineSection = async (sectionId: string, instruction: string) => {
    if (!siteDraft) {
      throw new Error('Homepage draft is unavailable.');
    }
    const result = await refineHomepageSection(siteDraft.id, {
      revision: siteDraft.revision,
      sectionId,
      instruction,
    });
    setSiteDraft(result.siteDraft);
    return result.siteDraft;
  };

  const reloadDraft = async () => {
    if (!siteDraft) {
      throw new Error('Homepage draft is unavailable.');
    }
    const updated = await fetchHomepageDraft(siteDraft.id);
    setSiteDraft(updated);
    return updated;
  };

  const openPreview = async () => {
    if (!siteDraft) {
      return;
    }
    setScreenError('');
    try {
      const preview = await createHomepagePreview(siteDraft.id);
      setPreviewUrl(preview.previewUrl);
      setMode('preview');
    } catch (error) {
      setScreenError(
        textFor(
          language,
          '预览暂时无法打开，请重试。',
          'Preview could not open. Try again.',
        ),
      );
      onActionError(error);
    }
  };

  const publish = async (visibility: HomepageVisibility) => {
    if (!siteDraft) {
      return;
    }
    try {
      const result = await publishHomepage(siteDraft.id, {
        revision: siteDraft.revision,
        visibility,
      });
      setSite(result.site);
      setSiteDraft(result.siteDraft);
      setReleases(current => [
        result.release,
        ...current.filter(item => item.id !== result.release.id),
      ]);
      setStatusMessage(
        visibility === 'link'
          ? textFor(language, '分享链接已生成', 'Share link created')
          : textFor(language, '主页已保存为仅自己可见', 'Homepage is private'),
      );
      setMode('home');
      onActionMessage(
        visibility === 'link'
          ? textFor(language, '分享链接已生成', 'Share link created')
          : textFor(language, '主页已发布', 'Homepage published'),
      );
    } catch (error) {
      onActionError(error);
    }
  };

  const confirmPublish = () => {
    Alert.alert(
      textFor(language, '发布主页', 'Publish homepage'),
      textFor(language, '选择主页的可见范围', 'Choose who can view it'),
      [
        {
          text: textFor(language, '仅自己可见', 'Private'),
          onPress: () => publish('private'),
        },
        {
          text: textFor(language, '生成分享链接', 'Create share link'),
          onPress: () => publish('link'),
        },
        { text: textFor(language, '取消', 'Cancel'), style: 'cancel' },
      ],
    );
  };

  const confirmUnpublish = () => {
    Alert.alert(
      textFor(language, '停止分享', 'Stop sharing'),
      textFor(
        language,
        '原分享链接将立即失效。',
        'The current share link will stop working immediately.',
      ),
      [
        { text: textFor(language, '取消', 'Cancel'), style: 'cancel' },
        {
          text: textFor(language, '停止分享', 'Stop sharing'),
          style: 'destructive',
          onPress: async () => {
            try {
              const result = await unpublishHomepage();
              setSite(result.site);
              setStatusMessage(
                textFor(language, '分享链接已停用', 'Share link disabled'),
              );
              onActionMessage(
                textFor(language, '分享链接已停用', 'Share link disabled'),
              );
            } catch (error) {
              onActionError(error);
            }
          },
        },
      ],
    );
  };

  const confirmRestore = (release: HomepageReleaseDTO) => {
    Alert.alert(
      textFor(language, '恢复这个版本', 'Restore this version'),
      textFor(
        language,
        '会创建一个新的可编辑草稿，当前发布内容不会立即改变。',
        'This creates a new editable draft without changing the published page.',
      ),
      [
        { text: textFor(language, '取消', 'Cancel'), style: 'cancel' },
        {
          text: textFor(language, '恢复', 'Restore'),
          onPress: async () => {
            try {
              const restored = await restoreHomepageRelease(release.id);
              setSiteDraft(restored);
              setMode('editor');
              setStatusMessage(
                textFor(
                  language,
                  '历史版本已恢复为草稿',
                  'Version restored as draft',
                ),
              );
            } catch (error) {
              onActionError(error);
            }
          },
        },
      ],
    );
  };

  if (mode === 'preview' && previewUrl) {
    return (
      <HomepagePreview
        palette={palette}
        language={language}
        previewUrl={previewUrl}
        onBack={() => setMode(siteDraft ? 'editor' : 'home')}
      />
    );
  }

  return (
    <View
      style={[homepageStyles.screen, { backgroundColor: palette.background }]}
    >
      <HomepageHeader
        palette={palette}
        language={language}
        onOpenSettings={onOpenSettings}
      />

      {!homepageV1.enabled ? (
        <View style={homepageStyles.centered}>
          <Globe2 color={palette.secondaryText} size={44} strokeWidth={1.8} />
          <Text
            style={[
              homepageStyles.pageTitle,
              homepageStyles.marginTop18,
              { color: palette.text },
            ]}
          >
            {textFor(
              language,
              '主页功能暂未开放',
              'Homepage is not available yet',
            )}
          </Text>
        </View>
      ) : isLoading ? (
        <View style={homepageStyles.centered}>
          <ActivityIndicator color={palette.mint} size="large" />
        </View>
      ) : mode === 'create' ? (
        <HomepageCreateFlow
          palette={palette}
          language={language}
          session={session}
          initialPrompt={resumePrompt}
          initialSelectedMediaAssetIds={resumeMediaIds}
          isGenerating={isGenerating}
          isTakingLong={isTakingLong}
          errorMessage={screenError}
          onCancel={() => setMode('home')}
          onGenerate={generate}
          onError={onActionError}
        />
      ) : mode === 'editor' && siteDraft ? (
        <HomepageEditor
          palette={palette}
          language={language}
          token={token}
          siteDraft={siteDraft}
          onBack={() => setMode('home')}
          onSave={saveDraft}
          onReload={reloadDraft}
          onRefine={refineSection}
          onPreview={openPreview}
          onPublish={confirmPublish}
        />
      ) : siteDraft ? (
        <ScrollView contentContainerStyle={homepageStyles.content}>
          {statusMessage ? (
            <View
              style={[
                homepageStyles.statusBand,
                {
                  backgroundColor: palette.soft,
                  borderLeftColor: palette.mint,
                },
              ]}
            >
              <Text
                style={[homepageStyles.statusText, { color: palette.text }]}
              >
                {statusMessage}
              </Text>
            </View>
          ) : null}
          {screenError ? (
            <Text style={[homepageStyles.errorText, { color: palette.rose }]}>
              {screenError}
            </Text>
          ) : null}
          <Text style={[homepageStyles.overviewTitle, { color: palette.text }]}>
            {siteDraft.draft.title}
          </Text>
          <Text
            style={[
              homepageStyles.overviewSummary,
              { color: palette.secondaryText },
            ]}
          >
            {siteDraft.draft.summary}
          </Text>
          <View style={homepageStyles.metadataRow}>
            <View
              style={[
                homepageStyles.metadataPill,
                { backgroundColor: palette.soft },
              ]}
            >
              <Text
                style={[homepageStyles.metadataText, { color: palette.text }]}
              >
                {site?.visibility === 'link'
                  ? textFor(language, '分享链接已开启', 'Share link active')
                  : site?.unpublishedAt
                  ? textFor(language, '分享链接已停用', 'Share link disabled')
                  : site?.publishedReleaseId
                  ? textFor(language, '仅自己可见', 'Private')
                  : textFor(language, '草稿', 'Draft')}
              </Text>
            </View>
            <View
              style={[
                homepageStyles.metadataPill,
                { backgroundColor: palette.soft },
              ]}
            >
              <Text
                style={[homepageStyles.metadataText, { color: palette.text }]}
              >
                {siteDraft.draft.theme === 'gallery'
                  ? textFor(language, '画廊版式', 'Gallery theme')
                  : textFor(language, '简洁版式', 'Clean theme')}
              </Text>
            </View>
          </View>

          <View
            style={[
              homepageStyles.section,
              { borderBottomColor: palette.border },
            ]}
          >
            <View style={homepageStyles.toolbar}>
              <Pressable
                testID="homepage-edit"
                onPress={() => setMode('editor')}
                style={[
                  homepageStyles.commandButton,
                  { backgroundColor: palette.mint },
                ]}
              >
                <Pencil color="#ffffff" size={17} strokeWidth={2.3} />
                <Text
                  style={[homepageStyles.commandText, homepageStyles.whiteText]}
                >
                  {textFor(language, '编辑主页', 'Edit homepage')}
                </Text>
              </Pressable>
              <Pressable
                onPress={() => openPreview().catch(onActionError)}
                style={[
                  homepageStyles.outlineButton,
                  { borderColor: palette.border },
                ]}
              >
                <Eye color={palette.text} size={17} strokeWidth={2.3} />
                <Text
                  style={[homepageStyles.outlineText, { color: palette.text }]}
                >
                  {textFor(language, '预览', 'Preview')}
                </Text>
              </Pressable>
              {site?.shareUrl ? (
                <Pressable
                  onPress={() =>
                    Share.share({ message: site.shareUrl || '' }).catch(
                      onActionError,
                    )
                  }
                  style={[
                    homepageStyles.outlineButton,
                    { borderColor: palette.border },
                  ]}
                >
                  <Share2 color={palette.text} size={17} strokeWidth={2.3} />
                  <Text
                    style={[
                      homepageStyles.outlineText,
                      { color: palette.text },
                    ]}
                  >
                    {textFor(language, '分享', 'Share')}
                  </Text>
                </Pressable>
              ) : null}
              {site?.visibility === 'link' ? (
                <Pressable
                  testID="homepage-unpublish"
                  onPress={confirmUnpublish}
                  style={[
                    homepageStyles.outlineButton,
                    { borderColor: palette.border },
                  ]}
                >
                  <Unlink color={palette.rose} size={17} strokeWidth={2.3} />
                  <Text
                    style={[
                      homepageStyles.outlineText,
                      { color: palette.rose },
                    ]}
                  >
                    {textFor(language, '停止分享', 'Stop sharing')}
                  </Text>
                </Pressable>
              ) : null}
              <Pressable
                onPress={() => {
                  setResumePrompt('');
                  setResumeMediaIds([]);
                  setMode('create');
                }}
                style={[
                  homepageStyles.outlineButton,
                  { borderColor: palette.border },
                ]}
              >
                <Plus color={palette.text} size={17} strokeWidth={2.3} />
                <Text
                  style={[homepageStyles.outlineText, { color: palette.text }]}
                >
                  {textFor(language, '重新生成', 'Create another')}
                </Text>
              </Pressable>
            </View>
          </View>

          {releases.length ? (
            <View style={homepageStyles.section}>
              <Text
                style={[homepageStyles.sectionTitle, { color: palette.text }]}
              >
                {textFor(language, '历史版本', 'Version history')}
              </Text>
              {releases.map(release => (
                <View
                  key={release.id}
                  style={[
                    homepageStyles.historyRow,
                    { borderBottomColor: palette.border },
                  ]}
                >
                  <View style={homepageStyles.historyCopy}>
                    <Text
                      style={[
                        homepageStyles.historyTitle,
                        { color: palette.text },
                      ]}
                    >
                      {release.snapshot.title}
                    </Text>
                    <Text
                      style={[
                        homepageStyles.historyMeta,
                        { color: palette.secondaryText },
                      ]}
                    >
                      {release.createdAt
                        ? new Date(release.createdAt).toLocaleDateString(
                            language === 'zh' ? 'zh-CN' : 'en-US',
                          )
                        : textFor(language, '历史版本', 'Previous version')}
                    </Text>
                  </View>
                  <Pressable
                    accessibilityLabel={textFor(
                      language,
                      '恢复版本',
                      'Restore version',
                    )}
                    onPress={() => confirmRestore(release)}
                    style={[
                      homepageStyles.smallIconButton,
                      { borderColor: palette.border },
                    ]}
                  >
                    <FileClock
                      color={palette.text}
                      size={17}
                      strokeWidth={2.3}
                    />
                  </Pressable>
                </View>
              ))}
            </View>
          ) : null}
        </ScrollView>
      ) : (
        <View style={homepageStyles.centered}>
          <View
            style={[
              homepageStyles.emptyMark,
              { backgroundColor: palette.soft },
            ]}
          >
            <Globe2 color={palette.mint} size={32} strokeWidth={2} />
          </View>
          <Text style={[homepageStyles.pageTitle, { color: palette.text }]}>
            {textFor(language, '创建我的主页', 'Create my homepage')}
          </Text>
          <Text
            style={[
              homepageStyles.pageSubtitle,
              { color: palette.secondaryText },
            ]}
          >
            {textFor(
              language,
              '用你选择的照片，整理一个可以持续更新的个人主页。',
              'Turn selected photos into a personal homepage you can keep updating.',
            )}
          </Text>
          {screenError ? (
            <Text style={[homepageStyles.errorText, { color: palette.rose }]}>
              {screenError}
            </Text>
          ) : null}
          <Pressable
            testID="homepage-start"
            onPress={() => setMode('create')}
            style={[
              homepageStyles.commandButton,
              homepageStyles.marginTop22,
              { backgroundColor: palette.mint },
            ]}
          >
            <Plus color="#ffffff" size={18} strokeWidth={2.5} />
            <Text
              style={[homepageStyles.commandText, homepageStyles.whiteText]}
            >
              {textFor(language, '开始创建', 'Start creating')}
            </Text>
          </Pressable>
        </View>
      )}
    </View>
  );
}
