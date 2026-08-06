import { useMemo, useState } from 'react';
import { Alert } from 'react-native';

import { StationVisibility } from '../../models/api';
import {
  PickedStationMedia,
  pickStationImagesFromLibrary,
  pickStationVideoFromLibrary,
} from '../../services/stationMediaPicker';
import { appErrorText, textFor } from '../../shared/i18n';
import { Language, useMiaoxunSession } from '../session/useMiaoxunSession';

export const maxStationPostImageCount = 9;

const maxImageBytes = 25 * 1024 * 1024;
const maxVideoBytes = 250 * 1024 * 1024;

export function useStationPostComposer({
  language,
  session,
  onClose,
  onPublished,
  onActionError,
}: {
  language: Language;
  session: ReturnType<typeof useMiaoxunSession>;
  onClose: () => void;
  onPublished: () => void;
  onActionError: (error: unknown) => void;
}) {
  const [body, setBody] = useState('');
  const [attachments, setAttachments] = useState<PickedStationMedia[]>([]);
  const [visibility, setVisibility] = useState<StationVisibility>('public');
  const [locationLabel, setLocationLabel] = useState('');
  const [selectedAgentIds, setSelectedAgentIds] = useState<string[]>([]);
  const [isPublishing, setIsPublishing] = useState(false);
  const [uploadedCount, setUploadedCount] = useState(0);
  const [preparedAssetIds, setPreparedAssetIds] = useState<string[]>([]);
  const [publishError, setPublishError] = useState('');

  const enabledAgents = useMemo(
    () => session.ownedAgents.filter(agent => agent.enabled).slice(0, 6),
    [session.ownedAgents],
  );
  const hasDraft =
    Boolean(body.trim()) ||
    attachments.length > 0 ||
    Boolean(locationLabel) ||
    selectedAgentIds.length > 0;
  const canPublish = Boolean(body.trim()) || attachments.length > 0;
  const postKind = attachments[0]?.kind || 'text';

  const discardPreparedAssets = () => {
    const assetIds = preparedAssetIds;
    setPreparedAssetIds([]);
    if (!assetIds.length) {
      return;
    }
    Promise.allSettled(
      assetIds.map(assetId => session.deleteStationMediaAsset(assetId)),
    ).catch(() => undefined);
  };

  const closeComposer = () => {
    discardPreparedAssets();
    onClose();
  };

  const requestClose = () => {
    if (isPublishing) {
      return;
    }
    if (!hasDraft) {
      closeComposer();
      return;
    }
    Alert.alert(
      textFor(language, '放弃此次编辑？', 'Discard this draft?'),
      textFor(
        language,
        '已编辑的内容不会保留。',
        'Your changes will not be saved.',
      ),
      [
        {
          text: textFor(language, '继续编辑', 'Keep Editing'),
          style: 'cancel',
        },
        {
          text: textFor(language, '放弃', 'Discard'),
          style: 'destructive',
          onPress: closeComposer,
        },
      ],
    );
  };

  const addImages = async () => {
    const hasVideo = attachments.some(item => item.kind === 'video');
    const remaining = hasVideo
      ? maxStationPostImageCount
      : maxStationPostImageCount - attachments.length;
    if (remaining <= 0) {
      Alert.alert(textFor(language, '已达到 9 张图片', 'Nine Images Added'));
      return;
    }
    try {
      const picked = await pickStationImagesFromLibrary(remaining);
      const valid = picked.filter(
        item => item.byteSize === null || item.byteSize <= maxImageBytes,
      );
      if (valid.length !== picked.length) {
        Alert.alert(
          textFor(language, '图片过大', 'Image Too Large'),
          textFor(
            language,
            '单张图片不能超过 25 MB。',
            'Each image must be 25 MB or smaller.',
          ),
        );
      }
      if (!valid.length) {
        return;
      }
      discardPreparedAssets();
      setAttachments(current => {
        if (current.some(item => item.kind === 'video')) {
          return valid.slice(0, maxStationPostImageCount);
        }
        const knownUris = new Set(current.map(item => item.uri));
        return [
          ...current,
          ...valid.filter(item => !knownUris.has(item.uri)),
        ].slice(0, maxStationPostImageCount);
      });
    } catch (error) {
      onActionError(error);
    }
  };

  const addVideo = async () => {
    if (attachments.some(item => item.kind === 'video')) {
      return;
    }
    try {
      const picked = await pickStationVideoFromLibrary();
      if (!picked) {
        return;
      }
      if (picked.byteSize !== null && picked.byteSize > maxVideoBytes) {
        Alert.alert(
          textFor(language, '视频过大', 'Video Too Large'),
          textFor(
            language,
            '视频不能超过 250 MB。',
            'The video must be 250 MB or smaller.',
          ),
        );
        return;
      }
      discardPreparedAssets();
      setAttachments([picked]);
    } catch (error) {
      onActionError(error);
    }
  };

  const removeAttachment = (uri: string) => {
    discardPreparedAssets();
    setAttachments(current => current.filter(item => item.uri !== uri));
  };

  const toggleAgent = (agentId: string) => {
    setSelectedAgentIds(current =>
      current.includes(agentId)
        ? current.filter(id => id !== agentId)
        : [...current, agentId],
    );
  };

  const openVisibilityMenu = () => {
    Alert.alert(textFor(language, '谁可以看', 'Post Visibility'), undefined, [
      {
        text: textFor(language, '公开', 'Public'),
        onPress: () => setVisibility('public'),
      },
      {
        text: textFor(language, '好友可见', 'Friends'),
        onPress: () => setVisibility('friends'),
      },
      {
        text: textFor(language, '仅自己可见', 'Only Me'),
        onPress: () => setVisibility('private'),
      },
      { text: textFor(language, '取消', 'Cancel'), style: 'cancel' },
    ]);
  };

  const openLocationMenu = () => {
    if (locationLabel) {
      Alert.alert(
        textFor(language, '动态位置', 'Post Location'),
        locationLabel,
        [
          {
            text: textFor(language, '移除位置', 'Remove Location'),
            style: 'destructive',
            onPress: () => setLocationLabel(''),
          },
          { text: textFor(language, '取消', 'Cancel'), style: 'cancel' },
        ],
      );
      return;
    }
    const profileLocation = String(
      session.profile.activityArea || session.profile.community || '',
    ).trim();
    if (!profileLocation) {
      onActionError(
        new Error(
          textFor(
            language,
            '请先在小站资料中设置活动区域。',
            'Set your activity area in Station first.',
          ),
        ),
      );
      return;
    }
    Alert.alert(
      textFor(language, '添加位置', 'Add Location'),
      profileLocation,
      [
        {
          text: textFor(language, '添加', 'Add'),
          onPress: () => setLocationLabel(profileLocation.slice(0, 120)),
        },
        { text: textFor(language, '取消', 'Cancel'), style: 'cancel' },
      ],
    );
  };

  const publish = async () => {
    if (isPublishing) {
      return;
    }
    if (!canPublish) {
      Alert.alert(
        textFor(language, '暂时没有可发布的内容', 'Nothing to post yet'),
        textFor(
          language,
          '请输入文字，或添加图片、视频。',
          'Enter some text or add photos or a video.',
        ),
      );
      return;
    }
    setPublishError('');
    setIsPublishing(true);
    setUploadedCount(preparedAssetIds.length);
    let mediaAssetIds = preparedAssetIds;

    if (mediaAssetIds.length !== attachments.length) {
      const uploadResults = await Promise.allSettled(
        attachments.map(async media => {
          const asset = await session.createStationMediaAsset({
            kind: media.kind,
            originalFilename: media.originalFilename,
            mimeType: media.mimeType,
            byteSize: media.byteSize,
            width: media.width,
            height: media.height,
            localMedia: media,
          });
          setUploadedCount(current => current + 1);
          return asset.id;
        }),
      );
      const uploadedIds = uploadResults
        .filter(
          (result): result is PromiseFulfilledResult<string> =>
            result.status === 'fulfilled',
        )
        .map(result => result.value);
      const failedUpload = uploadResults.find(
        (result): result is PromiseRejectedResult =>
          result.status === 'rejected',
      );
      if (failedUpload) {
        await Promise.allSettled(
          uploadedIds.map(assetId => session.deleteStationMediaAsset(assetId)),
        );
        setPreparedAssetIds([]);
        setUploadedCount(0);
        setIsPublishing(false);
        setPublishError(
          appErrorText(
            language,
            failedUpload.reason,
            '附件上传失败，请重试',
            'Attachment upload failed. Try again.',
          ),
        );
        onActionError(failedUpload.reason);
        return;
      }
      mediaAssetIds = uploadedIds;
      setPreparedAssetIds(mediaAssetIds);
    }

    try {
      await session.createStationPost({
        body: body.trim(),
        locationLabel,
        visibility,
        agentCapabilities: selectedAgentIds,
        mediaAssetIds,
      });
      setPreparedAssetIds([]);
      setIsPublishing(false);
      onPublished();
    } catch (error) {
      setIsPublishing(false);
      setPublishError(
        appErrorText(
          language,
          error,
          '发布失败，请稍后重试',
          'Could not publish. Try again.',
        ),
      );
      onActionError(error);
    }
  };

  return {
    addImages,
    addVideo,
    attachments,
    body,
    enabledAgents,
    isPublishing,
    locationLabel,
    openLocationMenu,
    openVisibilityMenu,
    postKind,
    publish,
    publishError,
    removeAttachment,
    requestClose,
    selectedAgentIds,
    setBody,
    setPublishError,
    toggleAgent,
    uploadedCount,
    visibility,
  };
}
