import {
  BookOpen,
  Bot,
  Box,
  Shirt,
  Users,
  RotateCcw,
} from 'lucide-react-native';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { Avatar3DBootstrapDTO } from '../../models/api';
import { avatar3dModelThumbnailUrl } from '../../services/api/avatar3dApi';
import { textFor } from '../../shared/i18n';
import { styles } from '../../shared/styles';
import { Palette } from '../../shared/theme';
import {
  AIAssistGestureHandle,
  AIAssistGestureSurface,
} from '../assist/AIAssistGestureSurface';
import { AIAssistAction } from '../assist/aiAssistTypes';
import { Language } from '../session/useMiaoxunSession';
import { Avatar3DViewer } from './Avatar3DViewer';
import { resolveStationColors } from './stationTheme';
import { Avatar3DLoadState } from './useAvatar3d';

export function StationAvatarSpace({
  active = true,
  palette,
  language,
  token,
  avatar3d,
  avatar3dStatus,
  avatar3dError,
  onOpenGenerator,
  onOpenCoreAgent,
  onOpenAgents,
  onOpenCallable,
  onOpenDiary,
  onOpenOotd,
}: {
  active?: boolean;
  palette: Palette;
  language: Language;
  token: string;
  avatar3d: Avatar3DBootstrapDTO | null;
  avatar3dStatus: Avatar3DLoadState;
  avatar3dError: string;
  onOpenGenerator: () => void;
  onOpenCoreAgent?: () => void;
  onOpenAgents?: () => void;
  onOpenCallable?: () => void;
  onOpenDiary?: () => void;
  onOpenOotd?: () => void;
}) {
  const [viewerError, setViewerError] = useState('');
  const [viewerRevision, setViewerRevision] = useState(0);
  const [assistActive, setAssistActive] = useState(false);
  const assistGestureRef = useRef<AIAssistGestureHandle>(null);
  const colors = resolveStationColors(palette);
  const stageBackgroundColor = '#F7F8FC';
  const latestModel = useMemo(
    () =>
      avatar3d?.models.find(
        model => model.status === 'active' && model.interactiveAvailable,
      ) || null,
    [avatar3d?.models],
  );
  const latestModelId = latestModel?.id || '';
  const activeJob = avatar3d?.activeJob || null;
  const preparingModelId =
    activeJob?.status === 'persisting' ? activeJob.modelId : null;

  useEffect(() => {
    setViewerError('');
    setViewerRevision(0);
  }, [latestModelId]);

  const canOpenGenerator = avatar3dStatus === 'ready';
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
        eyebrow: textFor(language, '核心', 'Core'),
        label: textFor(language, '3D Agent', '3D Agent'),
        Icon: Bot,
        accent: '#2012D9',
        available: Boolean(onOpenCoreAgent),
        onSelect: () => onOpenCoreAgent?.(),
      },
      {
        direction: 'up',
        label: textFor(language, '今日穿搭', 'OOTD'),
        Icon: Shirt,
        accent: '#E46845',
        available: Boolean(onOpenOotd),
        onSelect: () => onOpenOotd?.(),
      },
      {
        direction: 'left',
        label: textFor(language, 'AI伙伴', 'AI partners'),
        Icon: Users,
        accent: '#147D6C',
        available: Boolean(onOpenAgents),
        onSelect: () => onOpenAgents?.(),
      },
      {
        direction: 'down',
        label: textFor(language, '漫画日记', 'Comic diary'),
        Icon: BookOpen,
        accent: '#C94668',
        available: Boolean(onOpenDiary),
        onSelect: () => onOpenDiary?.(),
      },
    ],
    [language, onOpenAgents, onOpenCoreAgent, onOpenDiary, onOpenOotd],
  );
  const floatingTags = [
    { label: textFor(language, '今日穿搭', 'OOTD'), onPress: onOpenOotd },
    {
      label: textFor(language, '漫画日记', 'Comic diary'),
      onPress: onOpenDiary,
    },
    {
      label: textFor(language, 'AI伙伴', 'AI partners'),
      onPress: onOpenAgents,
    },
    {
      label: textFor(language, '可被调用', 'Callable'),
      onPress: onOpenCallable,
    },
  ];
  const floatingTagPositions = [
    styles.avatarFloatingTag_0,
    styles.avatarFloatingTag_1,
    styles.avatarFloatingTag_2,
    styles.avatarFloatingTag_3,
  ];

  return (
    <View
      style={[
        styles.avatarSpace,
        {
          backgroundColor: colors.surface,
          borderColor: colors.border,
          shadowColor: palette.shadow,
        },
      ]}
    >
      <View
        style={[
          styles.avatarStage,
          styles.avatarStageStation,
          { backgroundColor: stageBackgroundColor },
        ]}
        testID="avatar3d-stage"
      >
        <AIAssistGestureSurface
          actions={assistActions}
          object={assistObject}
          onActiveChange={setAssistActive}
          palette={palette}
          ref={assistGestureRef}
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
              thumbnailAvailable={latestModel.thumbnailAvailable}
              token={token}
            />
          ) : (
            <View
              style={styles.avatar3dEmptyState}
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
                  <View style={localStyles.preparingScrim} />
                </>
              ) : null}
              {avatar3dStatus === 'loading' || activeJob ? (
                <ActivityIndicator color="#2012D9" />
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
                ]}
              >
                {viewerError ||
                  avatar3dError ||
                  (activeJob
                    ? activeJobStageCopy(language, activeJob.status).body
                    : emptyStateBody(language, avatar3dStatus))}
              </Text>
              {viewerError && latestModel ? (
                <Pressable
                  accessibilityRole="button"
                  onPress={() => {
                    setViewerError('');
                    setViewerRevision(current => current + 1);
                  }}
                  style={styles.avatar3dRetryButton}
                >
                  <RotateCcw color="#2012D9" size={15} strokeWidth={2} />
                  <Text style={styles.avatar3dRetryButtonText}>
                    {textFor(language, '重新加载', 'Reload')}
                  </Text>
                </Pressable>
              ) : null}
            </View>
          )}

          {!assistActive ? (
            <View pointerEvents="box-none" style={styles.avatarFloatingTags}>
              {floatingTags.map((item, index) => (
                <FloatingTag
                  key={item.label}
                  active={index === 3}
                  label={item.label}
                  onPress={item.onPress}
                  palette={palette}
                  positionStyle={floatingTagPositions[index]}
                />
              ))}
            </View>
          ) : null}
        </AIAssistGestureSurface>
      </View>

      <View style={styles.avatarSpaceCopy}>
        <View style={styles.avatarSpaceTitleRow}>
          <View style={styles.avatarSpaceTitleCopy}>
            <Text style={[styles.avatarSpaceEyebrow, { color: colors.accent }]}>
              {latestModel
                ? textFor(language, '拖拽换视角', 'Drag to rotate')
                : textFor(language, '3D个人形象', '3D avatar')}
            </Text>
            <Text style={[styles.avatarSpaceTitle, { color: colors.text }]}>
              {textFor(language, '我的模样', 'My Look')}
            </Text>
          </View>
        </View>
        <Text style={[styles.avatarSpaceBody, { color: colors.secondaryText }]}>
          {textFor(
            language,
            '让我的形象与穿搭、日记和个人能力一起呈现在小站中。',
            'Bring your avatar, outfits, diary, and personal capabilities together in your station.',
          )}
        </Text>
        <View style={styles.avatar3dActionRow}>
          <Pressable
            accessibilityRole="button"
            disabled={!canOpenGenerator}
            onPress={onOpenGenerator}
            style={[
              styles.avatar3dGenerateButton,
              { backgroundColor: colors.text },
              !canOpenGenerator && styles.avatar3dGenerateButtonDisabled,
            ]}
          >
            <Box color={colors.surface} size={15} strokeWidth={2.2} />
            <Text
              style={[
                styles.avatar3dGenerateButtonText,
                { color: colors.surface },
              ]}
            >
              {latestModel
                ? textFor(language, '管理形象', 'Manage avatar')
                : textFor(language, '生成形象', 'Create avatar')}
            </Text>
          </Pressable>
        </View>
      </View>
    </View>
  );
}

const localStyles = StyleSheet.create({
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

function FloatingTag({
  label,
  onPress,
  positionStyle,
  active,
  palette,
}: {
  label: string;
  onPress?: () => void;
  positionStyle: object;
  active: boolean;
  palette: Palette;
}) {
  const colors = resolveStationColors(palette);
  const backgroundColor = active ? colors.accent : colors.surface;
  const textColor = active ? colors.surface : colors.text;

  return (
    <Pressable
      accessibilityLabel={label}
      accessibilityRole="button"
      onPress={onPress}
      style={[
        styles.avatarFloatingTag,
        positionStyle,
        active ? styles.avatarFloatingTagCallable : null,
        { backgroundColor, shadowColor: palette.shadow },
      ]}
    >
      <Text style={[styles.avatarFloatingTagText, { color: textColor }]}>
        {label}
      </Text>
    </Pressable>
  );
}
