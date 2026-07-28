import { Box, RotateCcw } from 'lucide-react-native';
import React, { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, Text, View } from 'react-native';

import { Avatar3DBootstrapDTO } from '../../models/api';
import { textFor } from '../../shared/i18n';
import { styles } from '../../shared/styles';
import { Palette, palettes } from '../../shared/theme';
import { Language } from '../session/useMiaoxunSession';
import { Avatar3DViewer } from './Avatar3DViewer';
import { Avatar3DLoadState } from './useAvatar3d';

export function StationAvatarSpace({
  palette,
  language,
  token,
  avatar3d,
  avatar3dStatus,
  avatar3dError,
  onOpenGenerator,
  onOpenAgents,
  onOpenCallable,
  onOpenDiary,
  onOpenOotd,
}: {
  palette: Palette;
  language: Language;
  token: string;
  avatar3d: Avatar3DBootstrapDTO | null;
  avatar3dStatus: Avatar3DLoadState;
  avatar3dError: string;
  onOpenGenerator: () => void;
  onOpenAgents?: () => void;
  onOpenCallable?: () => void;
  onOpenDiary?: () => void;
  onOpenOotd?: () => void;
}) {
  const [viewerError, setViewerError] = useState('');
  const [viewerRevision, setViewerRevision] = useState(0);
  const isDarkPalette = palette.text === palettes.dark.text;
  const stageBackgroundColor = isDarkPalette ? '#F5F6FA' : '#F7F8FC';
  const latestModel = useMemo(
    () =>
      avatar3d?.models.find(
        model => model.status === 'active' && model.interactiveAvailable,
      ) || null,
    [avatar3d?.models],
  );
  const latestModelId = latestModel?.id || '';

  useEffect(() => {
    setViewerError('');
    setViewerRevision(0);
  }, [latestModelId]);

  const canOpenGenerator = avatar3dStatus === 'ready';
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
          backgroundColor: palette.surface,
          borderColor: palette.border,
          shadowColor: palette.shadow,
        },
      ]}
    >
      <View style={[styles.avatarStage, styles.avatarStageStation]}>
        {latestModel && !viewerError ? (
          <Avatar3DViewer
            key={`${latestModel.id}:${viewerRevision}`}
            modelId={latestModel.id}
            onError={setViewerError}
            style={styles.avatar3dStageWebView}
            token={token}
          />
        ) : (
          <View
            style={[
              styles.avatar3dEmptyState,
              { backgroundColor: stageBackgroundColor },
            ]}
          >
            {avatar3dStatus === 'loading' ? (
              <ActivityIndicator color="#2012D9" />
            ) : (
              <Box color={palette.secondaryText} size={28} strokeWidth={1.8} />
            )}
            <Text style={[styles.avatar3dEmptyTitle, { color: palette.text }]}>
              {emptyStateTitle(language, avatar3dStatus, Boolean(viewerError))}
            </Text>
            <Text
              style={[
                styles.avatar3dEmptyBody,
                { color: palette.secondaryText },
              ]}
            >
              {viewerError ||
                avatar3dError ||
                emptyStateBody(language, avatar3dStatus)}
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
      </View>

      <View style={styles.avatarSpaceCopy}>
        <View style={styles.avatarSpaceTitleRow}>
          <View style={styles.avatarSpaceTitleCopy}>
            <Text style={[styles.avatarSpaceEyebrow, { color: palette.sun }]}>
              {latestModel
                ? textFor(language, '拖拽换视角', 'Drag to rotate')
                : textFor(language, '3D个人形象', '3D avatar')}
            </Text>
            <Text style={[styles.avatarSpaceTitle, { color: palette.text }]}>
              {textFor(language, '我的模样', 'My Look')}
            </Text>
          </View>
        </View>
        <Text
          style={[styles.avatarSpaceBody, { color: palette.secondaryText }]}
        >
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
              { backgroundColor: palette.text },
              !canOpenGenerator && styles.avatar3dGenerateButtonDisabled,
            ]}
          >
            <Box color={palette.background} size={15} strokeWidth={2.2} />
            <Text
              style={[
                styles.avatar3dGenerateButtonText,
                { color: palette.background },
              ]}
            >
              {latestModel
                ? textFor(language, '管理形象', 'Manage avatar')
                : textFor(language, '生成形象', 'Create avatar')}
            </Text>
          </Pressable>
          <Pressable
            onPress={onOpenOotd}
            style={[styles.avatarOotdButton, { backgroundColor: palette.soft }]}
          >
            <Text
              style={[styles.avatarOotdButtonText, { color: palette.text }]}
            >
              {textFor(language, '今日穿搭', 'Today’s OOTD')}
            </Text>
          </Pressable>
        </View>
      </View>
    </View>
  );
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
  const backgroundColor = active ? palette.rose : palette.surface;
  const textColor = active ? palette.background : palette.text;

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
