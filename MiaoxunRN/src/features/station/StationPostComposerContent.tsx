import React from 'react';
import {
  Image,
  type ImageSourcePropType,
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

import { composerIconAssets } from '../../assets/icons';
import { StationVisibility } from '../../models/api';
import { textFor } from '../../shared/i18n';
import { styles } from '../../shared/styles';
import { Language } from '../session/useMiaoxunSession';
import {
  maxStationPostImageCount,
  useStationPostComposer,
} from './useStationPostComposer';

export function StationPostComposerContent({
  accentColor,
  backgroundColor,
  borderColor,
  composer,
  isDark,
  language,
  secondaryTextColor,
  softColor,
  textColor,
}: {
  accentColor: string;
  backgroundColor: string;
  borderColor: string;
  composer: ReturnType<typeof useStationPostComposer>;
  isDark: boolean;
  language: Language;
  secondaryTextColor: string;
  softColor: string;
  textColor: string;
}) {
  const {
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
    removeAttachment,
    selectedAgentIds,
    setBody,
    toggleAgent,
    visibility,
  } = composer;
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
    <ScrollView
      contentContainerStyle={styles.postComposerScrollContent}
      keyboardShouldPersistTaps="handled"
    >
      <View style={[styles.postComposerEditorCard, { backgroundColor }]}>
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
            {attachments.length < maxStationPostImageCount ? (
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
                <Plus color={secondaryTextColor} size={26} strokeWidth={1.6} />
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

      <View style={[styles.postComposerSectionCard, { backgroundColor }]}>
        <Text style={[styles.postComposerSectionTitle, { color: textColor }]}>
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
        <View style={[styles.postComposerAttachmentRow, { borderColor }]}>
          <Image
            resizeMode="contain"
            source={attachmentIcon}
            style={styles.postComposerAttachmentIcon}
          />
          <View style={styles.postComposerAttachmentCopy}>
            <Text
              style={[styles.postComposerAttachmentTitle, { color: textColor }]}
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

      <View style={[styles.postComposerSectionCard, { backgroundColor }]}>
        <View style={styles.postComposerAgentHeader}>
          <Text style={[styles.postComposerSectionTitle, { color: textColor }]}>
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
            {textFor(language, '暂无可用能力', 'No abilities available')}
          </Text>
        )}
      </View>

      <View style={[styles.postComposerSettingsCard, { backgroundColor }]}>
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
            style={[styles.postComposerSettingTitle, locationTextStyle]}
          >
            {locationLabel || textFor(language, '添加位置', 'Add Location')}
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
          <VisibilityIcon color={secondaryTextColor} visibility={visibility} />
          <Text style={[styles.postComposerSettingTitle, { color: textColor }]}>
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
