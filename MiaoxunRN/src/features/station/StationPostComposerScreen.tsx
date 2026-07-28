import React, { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  type ImageSourcePropType,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from 'react-native';
import {
  ChevronRight,
  Globe2,
  LockKeyhole,
  MapPin,
  Plus,
  Users,
  X,
} from 'lucide-react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';

import { composerIconAssets, contactIconAssets } from '../../assets/icons';
import { StationVisibility } from '../../models/api';
import {
  PickedStationMedia,
  pickStationImagesFromLibrary,
  pickStationVideoFromLibrary,
} from '../../services/stationMediaPicker';
import { textFor } from '../../shared/i18n';
import { styles } from '../../shared/styles';
import { Palette } from '../../shared/theme';
import { Language, useMiaoxunSession } from '../session/useMiaoxunSession';

const maxImageCount = 9;
const maxImageBytes = 25 * 1024 * 1024;
const maxVideoBytes = 250 * 1024 * 1024;

export function StationPostComposerScreen({
  palette,
  language,
  session,
  onClose,
  onPublished,
  onActionError,
}: {
  palette: Palette;
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
  const isDark = session.appearance === 'dark';
  const screenColor = isDark ? palette.background : '#F8F7FD';
  const backgroundColor = isDark ? palette.surface : '#FFFFFF';
  const headerColor = isDark ? palette.surface : '#F8F7FD';
  const borderColor = isDark ? palette.border : '#F0EBFD';
  const softColor = isDark ? palette.soft : '#F4F6FF';
  const textColor = isDark ? palette.text : '#000000';
  const secondaryTextColor = isDark
    ? palette.secondaryText
    : 'rgba(0,0,0,0.60)';
  const accentColor = isDark ? palette.mint : '#2012D9';
  const selectedAgentChipStyle = {
    backgroundColor: accentColor,
    borderColor: accentColor,
  };
  const unselectedAgentChipStyle = {
    backgroundColor: softColor,
    borderColor: isDark ? borderColor : '#DBE2FF',
  };
  const locationTextStyle = {
    color: locationLabel ? accentColor : secondaryTextColor,
  };
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
      ? maxImageCount
      : maxImageCount - attachments.length;
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
          return valid.slice(0, maxImageCount);
        }
        const knownUris = new Set(current.map(item => item.uri));
        return [
          ...current,
          ...valid.filter(item => !knownUris.has(item.uri)),
        ].slice(0, maxImageCount);
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
      onActionError(error);
    }
  };

  const attachmentIcon =
    postKind === 'image'
      ? composerIconAssets.imageEntry
      : postKind === 'video'
      ? composerIconAssets.videoEntry
      : composerIconAssets.textEntry;
  const attachmentTitle =
    postKind === 'image'
      ? textFor(language, '图片动态', 'Photo Post')
      : postKind === 'video'
      ? textFor(language, '视频动态', 'Video Post')
      : textFor(language, '文字动态', 'Text Post');

  return (
    <Modal
      animationType="slide"
      presentationStyle="fullScreen"
      visible
      onRequestClose={requestClose}
    >
      <SafeAreaProvider>
        <SafeAreaView
          edges={['top']}
          style={[styles.postComposerScreen, { backgroundColor: headerColor }]}
        >
          <SafeAreaView
            edges={['bottom']}
            style={[
              styles.postComposerScreen,
              { backgroundColor: screenColor },
            ]}
          >
            <KeyboardAvoidingView
              behavior={Platform.OS === 'ios' ? 'padding' : undefined}
              style={styles.postComposerKeyboard}
            >
              <View
                style={[
                  styles.postComposerHeader,
                  {
                    backgroundColor: headerColor,
                  },
                ]}
              >
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={textFor(language, '返回', 'Back')}
                  disabled={isPublishing}
                  onPress={requestClose}
                  style={styles.postComposerBack}
                >
                  <Image
                    source={contactIconAssets.back}
                    resizeMode="contain"
                    style={[
                      styles.postComposerBackIcon,
                      isDark && { tintColor: palette.text },
                    ]}
                  />
                </Pressable>
                <Text style={[styles.postComposerTitle, { color: textColor }]}>
                  {textFor(language, '发布动态', 'New Post')}
                </Text>
                <View style={styles.postComposerPublishSlot}>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={
                      isPublishing && attachments.length
                        ? textFor(
                            language,
                            `正在上传 ${uploadedCount}/${attachments.length}`,
                            `Uploading ${uploadedCount}/${attachments.length}`,
                          )
                        : textFor(language, '发布', 'Post')
                    }
                    accessibilityState={{
                      disabled: isPublishing,
                    }}
                    disabled={isPublishing}
                    onPress={publish}
                    style={[
                      styles.postComposerPublish,
                      { backgroundColor: accentColor },
                      isPublishing && styles.disabledButton,
                    ]}
                  >
                    {isPublishing ? (
                      <View style={styles.postComposerPublishProgress}>
                        <ActivityIndicator color="#FFFFFF" size="small" />
                        {attachments.length ? (
                          <Text style={styles.postComposerPublishProgressText}>
                            {uploadedCount}/{attachments.length}
                          </Text>
                        ) : null}
                      </View>
                    ) : (
                      <Text
                        style={styles.postComposerPublishText}
                        numberOfLines={1}
                      >
                        {textFor(language, '发布', 'Post')}
                      </Text>
                    )}
                  </Pressable>
                </View>
              </View>

              <ScrollView
                contentContainerStyle={styles.postComposerScrollContent}
                keyboardShouldPersistTaps="handled"
              >
                <View
                  style={[styles.postComposerEditorCard, { backgroundColor }]}
                >
                  <TextInput
                    editable={!isPublishing}
                    maxLength={5000}
                    multiline
                    onChangeText={setBody}
                    placeholder={textFor(
                      language,
                      '分享你的小站动态、想法或服务更新',
                      'Share a Station update, thought, or service',
                    )}
                    placeholderTextColor={secondaryTextColor}
                    selectionColor={accentColor}
                    style={[
                      styles.postComposerInput,
                      postKind === 'image'
                        ? styles.postComposerInputImage
                        : postKind === 'video'
                        ? styles.postComposerInputVideo
                        : styles.postComposerInputText,
                      { color: textColor },
                    ]}
                    textAlignVertical="top"
                    value={body}
                  />

                  {postKind === 'image' ? (
                    <View style={styles.postComposerMediaGrid}>
                      {attachments.map(item => (
                        <View
                          key={item.uri}
                          style={[
                            styles.postComposerMediaItem,
                            { backgroundColor: softColor },
                          ]}
                        >
                          <Image
                            resizeMode="cover"
                            source={{ uri: item.uri }}
                            style={styles.postComposerMediaImage}
                          />
                          <MediaRemoveButton
                            disabled={isPublishing}
                            language={language}
                            onPress={() => removeAttachment(item.uri)}
                          />
                        </View>
                      ))}
                      {attachments.length < maxImageCount ? (
                        <Pressable
                          accessibilityRole="button"
                          accessibilityLabel={textFor(
                            language,
                            '继续添加图片',
                            'Add more images',
                          )}
                          disabled={isPublishing}
                          onPress={addImages}
                          style={[
                            styles.postComposerMediaAdd,
                            { borderColor: secondaryTextColor },
                          ]}
                        >
                          <Plus
                            color={secondaryTextColor}
                            size={26}
                            strokeWidth={1.6}
                          />
                        </Pressable>
                      ) : null}
                    </View>
                  ) : null}

                  {postKind === 'video' ? (
                    <View
                      style={[
                        styles.postComposerVideoMedia,
                        { backgroundColor: softColor },
                      ]}
                    >
                      <Image
                        resizeMode="contain"
                        source={composerIconAssets.videoEntry}
                        style={styles.postComposerVideoEntryIcon}
                      />
                      <Text
                        numberOfLines={1}
                        style={[
                          styles.postComposerVideoName,
                          { color: secondaryTextColor },
                        ]}
                      >
                        {attachments[0]?.originalFilename}
                      </Text>
                      <MediaRemoveButton
                        disabled={isPublishing}
                        language={language}
                        onPress={() => removeAttachment(attachments[0].uri)}
                      />
                    </View>
                  ) : null}

                  <View
                    style={[
                      styles.postComposerMediaToolbar,
                      { borderTopColor: borderColor },
                    ]}
                  >
                    <ComposerMediaAction
                      active={postKind === 'image'}
                      disabled={isPublishing}
                      label={textFor(language, '图片', 'Photo')}
                      onPress={addImages}
                      source={
                        postKind === 'image'
                          ? composerIconAssets.imageActive
                          : composerIconAssets.imageInactive
                      }
                      textColor={textColor}
                      activeColor={accentColor}
                    />
                    <ComposerMediaAction
                      active={postKind === 'video'}
                      disabled={isPublishing}
                      label={textFor(language, '视频', 'Video')}
                      onPress={addVideo}
                      source={
                        postKind === 'video'
                          ? composerIconAssets.videoActive
                          : composerIconAssets.videoInactive
                      }
                      textColor={textColor}
                      activeColor={accentColor}
                    />
                  </View>
                </View>

                <View
                  style={[styles.postComposerSectionCard, { backgroundColor }]}
                >
                  <Text
                    style={[
                      styles.postComposerSectionTitle,
                      { color: textColor },
                    ]}
                  >
                    {textFor(language, '内容附件', 'Content Attachment')}
                  </Text>
                  <Text
                    style={[
                      styles.postComposerSectionDescription,
                      { color: secondaryTextColor },
                    ]}
                  >
                    {textFor(
                      language,
                      '可添加文字内容，也可以切换到图片或视频动态',
                      'Add text or switch to a photo or video post',
                    )}
                  </Text>
                  <View
                    style={[styles.postComposerAttachmentRow, { borderColor }]}
                  >
                    <Image
                      resizeMode="contain"
                      source={attachmentIcon}
                      style={styles.postComposerAttachmentIcon}
                    />
                    <View style={styles.postComposerAttachmentCopy}>
                      <Text
                        style={[
                          styles.postComposerAttachmentTitle,
                          { color: textColor },
                        ]}
                      >
                        {attachmentTitle}
                      </Text>
                      <Text
                        numberOfLines={1}
                        style={[
                          styles.postComposerAttachmentDescription,
                          { color: secondaryTextColor },
                        ]}
                      >
                        {textFor(
                          language,
                          '发布后展示在我的动态顶部',
                          'Shown at the top of My Posts after publishing',
                        )}
                      </Text>
                    </View>
                  </View>
                </View>

                <View
                  style={[styles.postComposerSectionCard, { backgroundColor }]}
                >
                  <View style={styles.postComposerAgentHeader}>
                    <Text
                      style={[
                        styles.postComposerSectionTitle,
                        { color: textColor },
                      ]}
                    >
                      {textFor(language, '添加Agent能力', 'Add Agent Ability')}
                    </Text>
                    <Text
                      numberOfLines={1}
                      style={[
                        styles.postComposerAgentHint,
                        { color: secondaryTextColor },
                      ]}
                    >
                      {textFor(
                        language,
                        '随动态一起提供可执行入口',
                        'Offer actions with this post',
                      )}
                    </Text>
                  </View>
                  {enabledAgents.length ? (
                    <View style={styles.postComposerAgentChips}>
                      {enabledAgents.map(agent => {
                        const selected = selectedAgentIds.includes(agent.id);
                        return (
                          <Pressable
                            key={agent.id}
                            accessibilityRole="checkbox"
                            accessibilityState={{ checked: selected }}
                            disabled={isPublishing}
                            onPress={() => toggleAgent(agent.id)}
                            style={[
                              styles.postComposerAgentChip,
                              selected
                                ? selectedAgentChipStyle
                                : unselectedAgentChipStyle,
                            ]}
                          >
                            <Text
                              numberOfLines={1}
                              style={[
                                styles.postComposerAgentChipText,
                                selected
                                  ? styles.postComposerAgentChipTextSelected
                                  : { color: secondaryTextColor },
                              ]}
                            >
                              {agent.name}
                            </Text>
                          </Pressable>
                        );
                      })}
                    </View>
                  ) : (
                    <Text
                      style={[
                        styles.postComposerAgentEmpty,
                        { color: secondaryTextColor },
                      ]}
                    >
                      {textFor(
                        language,
                        '暂无可用能力',
                        'No abilities available',
                      )}
                    </Text>
                  )}
                </View>

                <View
                  style={[styles.postComposerSettingsCard, { backgroundColor }]}
                >
                  <Pressable
                    accessibilityRole="button"
                    disabled={isPublishing}
                    onPress={openLocationMenu}
                    style={styles.postComposerSettingRow}
                  >
                    <MapPin
                      color={locationLabel ? accentColor : secondaryTextColor}
                      size={18}
                      strokeWidth={1.9}
                    />
                    <Text
                      numberOfLines={1}
                      style={[
                        styles.postComposerSettingTitle,
                        locationTextStyle,
                      ]}
                    >
                      {locationLabel ||
                        textFor(language, '添加位置', 'Add Location')}
                    </Text>
                    <ChevronRight
                      color={secondaryTextColor}
                      size={17}
                      strokeWidth={1.8}
                    />
                  </Pressable>
                  <View
                    style={[
                      styles.postComposerSettingDivider,
                      { backgroundColor: borderColor },
                    ]}
                  />
                  <Pressable
                    accessibilityRole="button"
                    disabled={isPublishing}
                    onPress={openVisibilityMenu}
                    style={styles.postComposerSettingRow}
                  >
                    <VisibilityIcon
                      color={secondaryTextColor}
                      visibility={visibility}
                    />
                    <Text
                      style={[
                        styles.postComposerSettingTitle,
                        { color: textColor },
                      ]}
                    >
                      {textFor(language, '谁可以看', 'Visibility')}
                    </Text>
                    <Text
                      style={[
                        styles.postComposerSettingValue,
                        { color: secondaryTextColor },
                      ]}
                    >
                      {visibilityLabel(visibility, language)}
                    </Text>
                    <ChevronRight
                      color={secondaryTextColor}
                      size={17}
                      strokeWidth={1.8}
                    />
                  </Pressable>
                </View>
              </ScrollView>
            </KeyboardAvoidingView>
          </SafeAreaView>
        </SafeAreaView>
      </SafeAreaProvider>
    </Modal>
  );
}

function ComposerMediaAction({
  active,
  activeColor,
  disabled,
  label,
  onPress,
  source,
  textColor,
}: {
  active: boolean;
  activeColor: string;
  disabled: boolean;
  label: string;
  onPress: () => void;
  source: ImageSourcePropType;
  textColor: string;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ selected: active }}
      disabled={disabled}
      onPress={onPress}
      style={styles.postComposerMediaAction}
    >
      <Image
        resizeMode="contain"
        source={source}
        style={styles.postComposerMediaActionIcon}
      />
      <Text
        style={[
          styles.postComposerMediaActionText,
          { color: active ? activeColor : textColor },
        ]}
      >
        {label}
      </Text>
    </Pressable>
  );
}

function MediaRemoveButton({
  disabled,
  language,
  onPress,
}: {
  disabled: boolean;
  language: Language;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={textFor(language, '移除附件', 'Remove attachment')}
      disabled={disabled}
      onPress={onPress}
      style={styles.postComposerMediaRemove}
    >
      <X color="#FFFFFF" size={13} strokeWidth={3} />
    </Pressable>
  );
}

function VisibilityIcon({
  color,
  visibility,
}: {
  color: string;
  visibility: StationVisibility;
}) {
  if (visibility === 'friends') {
    return <Users color={color} size={14} strokeWidth={2} />;
  }
  if (visibility === 'private') {
    return <LockKeyhole color={color} size={14} strokeWidth={2} />;
  }
  return <Globe2 color={color} size={14} strokeWidth={2} />;
}

function visibilityLabel(visibility: StationVisibility, language: Language) {
  if (visibility === 'friends') {
    return textFor(language, '好友可见', 'Friends');
  }
  if (visibility === 'private') {
    return textFor(language, '仅自己可见', 'Only Me');
  }
  return textFor(language, '公开', 'Public');
}
