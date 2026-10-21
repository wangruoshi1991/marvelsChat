import {
  Bot,
  Box,
  ExternalLink,
  RotateCcw,
  Pencil,
  LayoutGrid,
} from 'lucide-react-native';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  Pressable,
  Share,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { Avatar3DBootstrapDTO } from '../../models/api';
import { avatar3dModelThumbnailUrl } from '../../services/api/avatar3dApi';
import { textFor } from '../../shared/i18n';
import { styles } from '../../shared/styles';
import { Palette, productColors } from '../../shared/theme';
import {
  AIAssistGestureHandle,
  AIAssistGestureSurface,
} from '../assist/AIAssistGestureSurface';
import { AIAssistAction } from '../assist/aiAssistTypes';
import { useAIAssist } from '../assist/AIAssistProvider';
import { Language } from '../session/useMiaoxunSession';
import { Avatar3DViewer } from './Avatar3DViewer';
import { resolveStationColors } from './stationTheme';
import { Avatar3DLoadState } from './useAvatar3d';
import { avatar3dCreationUnavailableReason } from './avatar3dAvailability';

export function StationAvatarSpace({
  active = true,
  embedded = false,
  palette,
  language,
  token,
  avatar3d,
  avatar3dStatus,
  avatar3dError,
  selectedModelId,
  onOpenGenerator,
  onOpenCoreAgent,
  onOpenAgents,
  onOpenCallable,
  onOpenDiary,
  onOpenOotd,
}: {
  active?: boolean;
  /** Embedded mode drops the standalone card chrome so the stage can sit
   *  inside the profile card as a ~35% height region. */
  embedded?: boolean;
  palette: Palette;
  language: Language;
  token: string;
  avatar3d: Avatar3DBootstrapDTO | null;
  avatar3dStatus: Avatar3DLoadState;
  avatar3dError: string;
  selectedModelId: string | null;
  onOpenGenerator: () => void;
  onOpenCoreAgent?: () => void;
  onOpenAgents?: () => void;
  onOpenCallable?: () => void;
  onOpenDiary?: () => void;
  onOpenOotd?: () => void;
}) {
  const [viewerError, setViewerError] = useState('');
  const { askButler } = useAIAssist();
  const [viewerRevision, setViewerRevision] = useState(0);
  const assistGestureRef = useRef<AIAssistGestureHandle>(null);
  const colors = resolveStationColors(palette);
  // The standalone stage owns its pale plate. In the profile card the stage
  // already sits inside `.stationIdentityStage`; keeping another plate here
  // made the empty state read as a nested card and left a visible rectangle
  // around the 3D area. Let the profile stage show through when embedded.
  const stageBackgroundColor = embedded
    ? 'transparent'
    : colors.isLight
    ? '#F7F8FC'
    : colors.soft;
  const latestModel = useMemo(
    () =>
      avatar3d?.models.find(
        model =>
          model.id === selectedModelId &&
          model.status === 'active' &&
          model.interactiveAvailable,
      ) ||
      avatar3d?.models.find(
        model => model.status === 'active' && model.interactiveAvailable,
      ) ||
      null,
    [avatar3d?.models, selectedModelId],
  );
  const latestModelId = latestModel?.id || '';
  const activeJob = avatar3d?.activeJob || null;
  const preparingModelId =
    activeJob?.status === 'persisting' ? activeJob.modelId : null;

  useEffect(() => {
    setViewerError('');
    setViewerRevision(0);
  }, [latestModelId]);

  const creationUnavailableReason = avatar3dCreationUnavailableReason(
    avatar3d,
    language,
  );
  const canOpenGenerator =
    avatar3dStatus === 'ready' &&
    (Boolean(avatar3d?.models.length) || !creationUnavailableReason);
  // An empty stage needs a visible, keyboard- and screen-reader-accessible
  // entry point. Long-press actions remain useful for an existing model, but
  // they are not discoverable enough for a first-time user. Keep the action
  // out of unavailable/error/loading states so those states stay truthful.
  const showCreateAction =
    !latestModel &&
    !viewerError &&
    !activeJob &&
    !creationUnavailableReason &&
    avatar3dStatus === 'ready';
  const emptyBody =
    viewerError ||
    avatar3dError ||
    (activeJob
      ? activeJobStageCopy(language, activeJob.status).body
      : avatar3dStatus !== 'loading'
      ? creationUnavailableReason ||
        (embedded && avatar3dStatus === 'ready'
          ? textFor(
              language,
              '创建后在此查看模型。',
              'Create an avatar to preview it here.',
            )
          : emptyStateBody(language, avatar3dStatus))
      : '');
  const assistObject = useMemo(
    () => ({
      kind: 'avatar-3d' as const,
      id: latestModel?.id || activeJob?.id || null,
      title: textFor(language, '我的3D形象', 'My 3D avatar'),
      metadata: {
        modelId: latestModel?.id || null,
        activeJobId: activeJob?.id || null,
        serviceStatus: avatar3dStatus,
      },
    }),
    [activeJob?.id, avatar3dStatus, language, latestModel?.id],
  );
  const assistActions = useMemo<AIAssistAction[]>(
    () => [
      {
        direction: 'right',
        label: textFor(language, '妙管家', 'Butler'),
        Icon: Bot,
        accent: productColors.accent,
        onSelect: askButler,
      },
      {
        direction: 'up',
        label: textFor(language, '分享', 'Share'),
        Icon: ExternalLink,
        accent: '#E46845',
        available: Boolean(latestModel),
        onSelect: () => {
          if (!latestModel) return;
          const message = textFor(
            language,
            `我的3D形象：${latestModel.title}`,
            `My 3D avatar: ${latestModel.title}`,
          );
          Share.share({ message }).catch(error => {
            Alert.alert(
              textFor(language, '分享失败', 'Sharing failed'),
              error instanceof Error
                ? error.message
                : textFor(
                    language,
                    '无法打开系统分享，请重试。',
                    'Unable to open sharing. Try again.',
                  ),
            );
          });
        },
      },
      {
        direction: 'left',
        label: textFor(language, '更多', 'More'),
        Icon: LayoutGrid,
        accent: '#147D6C',
        onSelect: () => {
          Alert.alert(textFor(language, '更多', 'More'), undefined, [
            ...(onOpenOotd
              ? [
                  {
                    text: textFor(language, '今日穿搭', 'OOTD'),
                    onPress: onOpenOotd,
                  },
                ]
              : []),
            ...(onOpenCoreAgent
              ? [{ text: '3D Agent', onPress: onOpenCoreAgent }]
              : []),
            ...(onOpenAgents
              ? [
                  {
                    text: textFor(language, 'AI伙伴', 'AI partners'),
                    onPress: onOpenAgents,
                  },
                ]
              : []),
            ...(onOpenDiary
              ? [
                  {
                    text: textFor(language, '漫画日记', 'Comic diary'),
                    onPress: onOpenDiary,
                  },
                ]
              : []),
            ...(onOpenCallable
              ? [
                  {
                    text: textFor(language, '可被调用', 'Callable'),
                    onPress: onOpenCallable,
                  },
                ]
              : []),
            { text: textFor(language, '取消', 'Cancel'), style: 'cancel' },
          ]);
        },
      },
      {
        direction: 'down',
        label: textFor(language, '编辑', 'Edit'),
        Icon: Pencil,
        accent: '#C94668',
        available: canOpenGenerator,
        onSelect: onOpenGenerator,
      },
    ],
    [
      askButler,
      canOpenGenerator,
      language,
      onOpenAgents,
      onOpenCoreAgent,
      onOpenDiary,
      onOpenGenerator,
      onOpenOotd,
      onOpenCallable,
      latestModel,
    ],
  );

  return (
    <View
      style={[
        styles.avatarSpace,
        embedded
          ? localStyles.embeddedSpace
          : {
              backgroundColor: colors.surface,
              borderColor: colors.border,
              shadowColor: palette.shadow,
            },
      ]}
    >
      <View
        style={[
          embedded ? localStyles.embeddedStage : styles.avatarStage,
          !embedded && styles.avatarStageStation,
          { backgroundColor: stageBackgroundColor },
        ]}
        testID="avatar3d-stage"
      >
        <AIAssistGestureSurface
          actions={assistActions}
          object={assistObject}
          palette={palette}
          ref={assistGestureRef}
          style={localStyles.assistSurface}
          testID="avatar3d-ai-assist"
        >
          {latestModel && !viewerError ? (
            <Avatar3DViewer
              active={active}
              key={`${latestModel.id}:${viewerRevision}`}
              modelId={latestModel.id}
              onAssistGesture={gesture => {
                if (gesture.phase === 'activate') {
                  assistGestureRef.current?.activateAt(gesture.point);
                } else if (gesture.phase === 'move') {
                  assistGestureRef.current?.moveTo(gesture.point);
                } else if (gesture.phase === 'release') {
                  assistGestureRef.current?.releaseAt(gesture.point);
                } else {
                  assistGestureRef.current?.cancel();
                }
              }}
              onError={setViewerError}
              style={styles.avatar3dStageWebView}
              token={token}
            />
          ) : (
            <View
              style={[
                styles.avatar3dEmptyState,
                embedded && localStyles.embeddedEmptyState,
              ]}
              testID="avatar3d-empty-state"
            >
              {preparingModelId ? (
                <>
                  <Image
                    accessibilityLabel="3D形象预览"
                    resizeMode="contain"
                    source={{
                      headers: { Authorization: `Bearer ${token}` },
                      uri: avatar3dModelThumbnailUrl(preparingModelId),
                    }}
                    style={localStyles.preparingPreview}
                  />
                  <View
                    style={[
                      localStyles.preparingScrim,
                      !colors.isLight && localStyles.preparingScrimDark,
                    ]}
                  />
                </>
              ) : null}
              {avatar3dStatus === 'loading' || activeJob ? (
                <ActivityIndicator color={colors.accent} />
              ) : (
                <Box color={colors.secondaryText} size={28} strokeWidth={1.8} />
              )}
              <Text style={[styles.avatar3dEmptyTitle, { color: colors.text }]}>
                {activeJob
                  ? activeJobStageCopy(language, activeJob.status).title
                  : emptyStateTitle(
                      language,
                      avatar3dStatus,
                      Boolean(viewerError),
                    )}
              </Text>
              <Text
                style={[
                  styles.avatar3dEmptyBody,
                  { color: colors.secondaryText },
                  embedded && localStyles.embeddedEmptyStateBody,
                ]}
              >
                {emptyBody}
              </Text>
              {showCreateAction ? (
                <Pressable
                  accessibilityLabel={textFor(
                    language,
                    '创建3D形象',
                    'Create 3D avatar',
                  )}
                  accessibilityRole="button"
                  onPress={onOpenGenerator}
                  style={({ pressed }) => [
                    localStyles.createButton,
                    { backgroundColor: colors.accent },
                    pressed && localStyles.createButtonPressed,
                  ]}
                  testID="avatar3d-create-empty"
                >
                  <Text style={localStyles.createButtonText}>
                    {textFor(language, '创建3D形象', 'Create 3D avatar')}
                  </Text>
                </Pressable>
              ) : null}
            </View>
          )}
        </AIAssistGestureSurface>
        {viewerError && latestModel ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={textFor(
              language,
              '重新加载3D预览',
              'Reload 3D preview',
            )}
            onPress={() => {
              setViewerError('');
              setViewerRevision(current => current + 1);
            }}
            style={[styles.avatar3dRetryButton, localStyles.retryOverlay]}
          >
            <RotateCcw color={productColors.accent} size={15} strokeWidth={2} />
            <Text style={styles.avatar3dRetryButtonText}>
              {textFor(language, '重新加载', 'Reload')}
            </Text>
          </Pressable>
        ) : null}
      </View>

      {embedded ? null : (
        <View style={styles.avatarSpaceCopy}>
          <View style={styles.avatarSpaceTitleRow}>
            <View style={styles.avatarSpaceTitleCopy}>
              <Text
                style={[styles.avatarSpaceEyebrow, { color: colors.accent }]}
              >
                {latestModel
                  ? textFor(language, '拖拽换视角', 'Drag to rotate')
                  : textFor(language, '3D个人形象', '3D avatar')}
              </Text>
              <Text style={[styles.avatarSpaceTitle, { color: colors.text }]}>
                {textFor(language, '我的模样', 'My Look')}
              </Text>
            </View>
          </View>
          <Text
            style={[styles.avatarSpaceBody, { color: colors.secondaryText }]}
          >
            {textFor(
              language,
              '让我的形象与穿搭、日记和个人能力一起呈现在小站中。',
              'Bring your avatar, outfits, diary, and personal capabilities together in your station.',
            )}
          </Text>
          {!latestModel &&
          avatar3dStatus === 'ready' &&
          creationUnavailableReason ? (
            <Text
              style={[
                localStyles.availabilityText,
                { color: colors.secondaryText },
              ]}
            >
              {creationUnavailableReason}
            </Text>
          ) : null}
        </View>
      )}
    </View>
  );
}

const localStyles = StyleSheet.create({
  availabilityText: { fontSize: 12, marginTop: 8 },
  embeddedStage: {
    alignItems: 'center',
    flex: 1,
    justifyContent: 'center',
    overflow: 'hidden',
    position: 'relative',
  },
  embeddedEmptyState: {
    gap: 6,
    paddingHorizontal: 8,
    paddingVertical: 8,
  },
  embeddedEmptyStateBody: { fontSize: 10, lineHeight: 14 },
  embeddedSpace: {
    backgroundColor: 'transparent',
    borderWidth: 0,
    borderRadius: 0,
    overflow: 'hidden',
    flex: 1,
    shadowOpacity: 0,
  },
  embeddedActions: {
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 4,
    paddingVertical: 8,
  },
  assistSurface: { flex: 1, width: '100%' },
  createButton: {
    borderRadius: 999,
    marginTop: 4,
    minHeight: 34,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  createButtonPressed: { opacity: 0.78, transform: [{ scale: 0.97 }] },
  createButtonText: { color: '#FFFFFF', fontSize: 12, fontWeight: '800' },
  preparingPreview: {
    bottom: 0,
    height: '100%',
    left: 0,
    position: 'absolute',
    right: 0,
    top: 0,
    width: '100%',
  },
  preparingScrim: {
    backgroundColor: 'rgba(247,248,252,0.58)',
    bottom: 0,
    left: 0,
    position: 'absolute',
    right: 0,
    top: 0,
  },
  preparingScrimDark: { backgroundColor: 'rgba(14,16,15,0.78)' },
  retryOverlay: {
    alignSelf: 'center',
    bottom: 12,
    position: 'absolute',
    zIndex: 2,
  },
});

function activeJobStageCopy(
  language: Language,
  status: NonNullable<Avatar3DBootstrapDTO['activeJob']>['status'],
) {
  if (status === 'awaiting_reference_confirmation') {
    return {
      title: textFor(language, '参考视图待确认', 'References need review'),
      body: textFor(
        language,
        '进入形象管理确认后才会开始3D建模。',
        'Open avatar management to review the references before modeling.',
      ),
    };
  }
  if (status === 'persisting') {
    return {
      title: textFor(language, '正在准备3D形象', 'Preparing 3D avatar'),
      body: textFor(
        language,
        '模型已生成，正在准备交互文件。',
        'The model is ready and its interactive file is being prepared.',
      ),
    };
  }
  return {
    title: textFor(language, '正在生成3D形象', 'Creating 3D avatar'),
    body: textFor(
      language,
      '任务会在后台继续。',
      'Generation continues in the background.',
    ),
  };
}

function emptyStateTitle(
  language: Language,
  status: Avatar3DLoadState,
  viewerFailed: boolean,
) {
  if (viewerFailed) {
    return textFor(language, '模型无法显示', 'Model unavailable');
  }
  if (status === 'unavailable') {
    return textFor(language, '3D建模服务未启用', '3D service unavailable');
  }
  if (status === 'error') {
    return textFor(language, '3D形象加载失败', 'Unable to load 3D avatar');
  }
  if (status === 'loading') {
    return textFor(language, '正在加载', 'Loading');
  }
  return textFor(language, '还没有3D形象', 'No 3D avatar yet');
}

function emptyStateBody(language: Language, status: Avatar3DLoadState) {
  if (status === 'ready') {
    return textFor(
      language,
      '创建完成后，模型会显示在这里。',
      'Your completed model will appear here.',
    );
  }
  return '';
}
