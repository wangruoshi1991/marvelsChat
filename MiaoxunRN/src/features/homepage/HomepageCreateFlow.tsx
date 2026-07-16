import React, { useCallback, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Check, ImagePlus, RefreshCw, Sparkles } from 'lucide-react-native';

import { StationMediaAssetDTO } from '../../models/api';
import { buildStationMediaFileUrl } from '../../services/stationMediaUrl';
import { pickStationPhotosFromLibrary } from '../../services/stationMediaPicker';
import { textFor } from '../../shared/i18n';
import { Palette } from '../../shared/theme';
import { Language } from '../session/useMiaoxunSession';
import { homepageStyles } from './homepageStyles';
import { HomepageSession, HomepageUploadItem } from './homepageTypes';

const uploadLabel = (
  language: Language,
  status: HomepageUploadItem['status'],
) => {
  if (status === 'uploading') {
    return textFor(language, '上传中', 'Uploading');
  }
  if (status === 'uploaded') {
    return textFor(language, '已上传', 'Uploaded');
  }
  if (status === 'failed') {
    return textFor(language, '上传失败', 'Upload failed');
  }
  return textFor(language, '等待上传', 'Waiting');
};

export function HomepageCreateFlow({
  palette,
  language,
  session,
  initialPrompt = '',
  initialSelectedMediaAssetIds = [],
  isGenerating,
  isTakingLong,
  errorMessage,
  onCancel,
  onGenerate,
  onError,
}: {
  palette: Palette;
  language: Language;
  session: HomepageSession;
  initialPrompt?: string;
  initialSelectedMediaAssetIds?: string[];
  isGenerating: boolean;
  isTakingLong: boolean;
  errorMessage?: string;
  onCancel: () => void;
  onGenerate: (payload: {
    prompt: string;
    mediaAssetIds: string[];
  }) => Promise<void>;
  onError: (error: unknown) => void;
}) {
  const [prompt, setPrompt] = useState(initialPrompt);
  const [selectedIds, setSelectedIds] = useState<string[]>(
    initialSelectedMediaAssetIds.slice(0, 9),
  );
  const [uploads, setUploads] = useState<HomepageUploadItem[]>([]);
  const [submitError, setSubmitError] = useState('');
  const availableMedia = useMemo(
    () =>
      session.stationContent.mediaAssets.filter(
        asset => asset.kind === 'image' && asset.status === 'uploaded',
      ),
    [session.stationContent.mediaAssets],
  );
  const uploading = uploads.some(
    item => item.status === 'queued' || item.status === 'uploading',
  );
  const canGenerate =
    prompt.trim().length > 0 &&
    selectedIds.length >= 3 &&
    selectedIds.length <= 9 &&
    !uploading &&
    !isGenerating;
  const generateTextColor = canGenerate ? '#ffffff' : palette.secondaryText;
  const visibleError = submitError || errorMessage;

  const selectionMessage =
    selectedIds.length < 3
      ? textFor(
          language,
          `还需选择 ${3 - selectedIds.length} 张照片`,
          `Select ${3 - selectedIds.length} more photo${
            3 - selectedIds.length === 1 ? '' : 's'
          }`,
        )
      : textFor(
          language,
          `已选择 ${selectedIds.length} 张照片`,
          `${selectedIds.length} photos selected`,
        );

  const toggleExisting = (asset: StationMediaAssetDTO) => {
    setSelectedIds(current => {
      if (current.includes(asset.id)) {
        return current.filter(id => id !== asset.id);
      }
      return current.length >= 9 ? current : [...current, asset.id];
    });
  };

  const uploadItem = useCallback(
    async (item: HomepageUploadItem) => {
      setUploads(current =>
        current.map(candidate =>
          candidate.localId === item.localId
            ? { ...candidate, status: 'uploading' }
            : candidate,
        ),
      );
      try {
        const asset = await session.createStationMediaAsset({
          kind: 'image',
          originalFilename: item.media.originalFilename,
          mimeType: item.media.mimeType,
          byteSize: item.media.byteSize,
          width: item.media.width,
          height: item.media.height,
          localMedia: item.media,
        });
        setUploads(current =>
          current.map(candidate =>
            candidate.localId === item.localId
              ? { ...candidate, status: 'uploaded', assetId: asset.id }
              : candidate,
          ),
        );
        setSelectedIds(current =>
          current.includes(asset.id) || current.length >= 9
            ? current
            : [...current, asset.id],
        );
      } catch (error) {
        setUploads(current =>
          current.map(candidate =>
            candidate.localId === item.localId
              ? { ...candidate, status: 'failed' }
              : candidate,
          ),
        );
        onError(error);
      }
    },
    [onError, session],
  );

  const pickPhotos = async () => {
    const remaining = Math.max(9 - selectedIds.length, 0);
    if (!remaining) {
      return;
    }
    try {
      const picked = await pickStationPhotosFromLibrary(remaining);
      const now = Date.now();
      const items = picked.slice(0, remaining).map((media, index) => ({
        localId: `local-${now}-${index}`,
        media,
        status: 'queued' as const,
        assetId: null,
      }));
      setUploads(current => [...current, ...items]);
      await Promise.all(items.map(uploadItem));
    } catch (error) {
      onError(error);
    }
  };

  const submit = async () => {
    if (!canGenerate) {
      return;
    }
    setSubmitError('');
    try {
      await onGenerate({
        prompt: prompt.trim(),
        mediaAssetIds: selectedIds,
      });
    } catch (error) {
      setSubmitError(
        textFor(
          language,
          '主页暂时没有生成成功，请重试。',
          'Homepage generation did not finish. Try again.',
        ),
      );
      onError(error);
    }
  };

  return (
    <ScrollView
      style={[homepageStyles.screen, { backgroundColor: palette.background }]}
      contentContainerStyle={homepageStyles.content}
      keyboardShouldPersistTaps="handled"
    >
      <Text style={[homepageStyles.overviewTitle, { color: palette.text }]}>
        {textFor(language, '创建我的主页', 'Create my homepage')}
      </Text>
      <View
        style={[homepageStyles.section, { borderBottomColor: palette.border }]}
      >
        <Text style={[homepageStyles.sectionTitle, { color: palette.text }]}>
          {textFor(
            language,
            '一句话介绍你想展示的内容',
            'What should your homepage show?',
          )}
        </Text>
        <TextInput
          testID="homepage-prompt"
          value={prompt}
          onChangeText={setPrompt}
          maxLength={1200}
          multiline
          placeholder={textFor(
            language,
            '例如：展示我最近的城市生活和摄影作品',
            'For example: my recent city life and photography',
          )}
          placeholderTextColor={palette.secondaryText}
          style={[
            homepageStyles.input,
            homepageStyles.multilineInput,
            {
              color: palette.text,
              backgroundColor: palette.input,
              borderColor: palette.border,
            },
          ]}
        />
      </View>

      <View
        style={[homepageStyles.section, { borderBottomColor: palette.border }]}
      >
        <Text style={[homepageStyles.sectionTitle, { color: palette.text }]}>
          {textFor(language, '选择 3–9 张照片', 'Choose 3–9 photos')}
        </Text>
        <Text
          style={[homepageStyles.sectionHint, { color: palette.secondaryText }]}
        >
          {selectionMessage}
        </Text>
        {availableMedia.length ? (
          <View style={homepageStyles.photoGrid}>
            {availableMedia.map(asset => {
              const selected = selectedIds.includes(asset.id);
              return (
                <Pressable
                  key={asset.id}
                  testID={`homepage-photo-${asset.id}`}
                  accessibilityRole="checkbox"
                  accessibilityState={{ checked: selected }}
                  onPress={() => toggleExisting(asset)}
                  style={[
                    homepageStyles.photoButton,
                    {
                      borderColor: selected ? palette.mint : palette.border,
                    },
                  ]}
                >
                  <Image
                    source={{
                      uri: buildStationMediaFileUrl(asset.id),
                      headers: { Authorization: `Bearer ${session.token}` },
                    }}
                    style={homepageStyles.photo}
                    resizeMode="cover"
                  />
                  {selected ? (
                    <View style={homepageStyles.photoOverlay}>
                      <View
                        style={[
                          homepageStyles.photoCheck,
                          { backgroundColor: palette.mint },
                        ]}
                      >
                        <Check color="#ffffff" size={16} strokeWidth={3} />
                      </View>
                    </View>
                  ) : null}
                </Pressable>
              );
            })}
          </View>
        ) : null}

        {uploads.length ? (
          <View style={homepageStyles.photoGrid}>
            {uploads.map(item => (
              <View
                key={item.localId}
                style={[
                  homepageStyles.photoButton,
                  { borderColor: palette.border },
                ]}
              >
                <Image
                  source={{ uri: item.media.uri }}
                  style={homepageStyles.photo}
                />
                <View
                  style={[
                    homepageStyles.uploadStatus,
                    { backgroundColor: palette.surface },
                  ]}
                >
                  <Text
                    style={[
                      homepageStyles.uploadStatusText,
                      {
                        color:
                          item.status === 'failed'
                            ? palette.rose
                            : palette.text,
                      },
                    ]}
                  >
                    {uploadLabel(language, item.status)}
                  </Text>
                  {item.status === 'uploading' ? (
                    <ActivityIndicator color={palette.mint} size="small" />
                  ) : item.status === 'failed' ? (
                    <Pressable
                      testID={`homepage-upload-retry-${item.localId}`}
                      accessibilityLabel={textFor(
                        language,
                        '重试上传',
                        'Retry upload',
                      )}
                      onPress={() => uploadItem(item)}
                    >
                      <RefreshCw
                        color={palette.rose}
                        size={15}
                        strokeWidth={2.5}
                      />
                    </Pressable>
                  ) : null}
                </View>
              </View>
            ))}
          </View>
        ) : null}

        <Pressable
          accessibilityLabel={textFor(language, '从相册添加照片', 'Add photos')}
          onPress={() => pickPhotos().catch(onError)}
          style={[
            homepageStyles.outlineButton,
            homepageStyles.marginTop14,
            { borderColor: palette.border },
          ]}
        >
          <ImagePlus color={palette.text} size={18} strokeWidth={2.3} />
          <Text style={[homepageStyles.outlineText, { color: palette.text }]}>
            {textFor(language, '从相册添加', 'Add from photos')}
          </Text>
        </Pressable>
      </View>

      {isGenerating ? (
        <View
          style={[
            homepageStyles.statusBand,
            { backgroundColor: palette.soft, borderLeftColor: palette.mint },
          ]}
        >
          <Text style={[homepageStyles.statusText, { color: palette.text }]}>
            {isTakingLong
              ? textFor(
                  language,
                  '正在完成基础版，生成完成后仍可继续修改。',
                  'Finishing a basic version. You can keep editing afterward.',
                )
              : textFor(language, '正在生成主页…', 'Creating homepage…')}
          </Text>
        </View>
      ) : null}
      {visibleError ? (
        <Text style={[homepageStyles.errorText, { color: palette.rose }]}>
          {visibleError}
        </Text>
      ) : null}
      <View style={homepageStyles.actionRow}>
        <Pressable
          onPress={onCancel}
          style={[
            homepageStyles.outlineButton,
            { borderColor: palette.border },
          ]}
        >
          <Text style={[homepageStyles.outlineText, { color: palette.text }]}>
            {textFor(language, '取消', 'Cancel')}
          </Text>
        </Pressable>
        <Pressable
          testID="homepage-generate"
          accessibilityState={{ disabled: !canGenerate }}
          disabled={!canGenerate}
          onPress={() => submit().catch(onError)}
          style={[
            homepageStyles.commandButton,
            homepageStyles.commandButtonFill,
            {
              backgroundColor: canGenerate ? palette.mint : palette.soft,
            },
          ]}
        >
          {isGenerating ? (
            <ActivityIndicator color="#ffffff" size="small" />
          ) : (
            <Sparkles color="#ffffff" size={18} strokeWidth={2.4} />
          )}
          <Text
            style={[homepageStyles.commandText, { color: generateTextColor }]}
          >
            {textFor(language, '生成主页', 'Create homepage')}
          </Text>
        </Pressable>
      </View>
    </ScrollView>
  );
}
