import React from 'react';
import {
  Image,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from 'react-native';
import { ChevronRight, Globe2, LockKeyhole, Users } from 'lucide-react-native';

import {
  StationAlbumDTO,
  StationComicDiaryDTO,
  StationDiaryEntryDTO,
  StationMediaAssetDTO,
  StationVisibility,
} from '../../models/api';
import { buildStationMediaFileUrl } from '../../services/stationMediaUrl';
import { textFor } from '../../shared/i18n';
import { styles } from '../../shared/styles';
import { Palette } from '../../shared/theme';
import { Language, useMiaoxunSession } from '../session/useMiaoxunSession';
import { StationComicDiaryPanel } from './StationComicDiaryPanel';
import {
  StationContentEditorField,
  StationContentEditorHeader,
  StationContentEditorSection,
} from './StationContentEditorUi';
import type { StationManageTarget } from './stationTypes';

type ContentViewProps = {
  target: StationManageTarget;
  diary: StationDiaryEntryDTO | null;
  album: StationAlbumDTO | null;
  albumMedia: StationMediaAssetDTO[];
  comicDiaries: StationComicDiaryDTO[];
  missing: boolean;
  palette: Palette;
  language: Language;
  token: string;
  session: ReturnType<typeof useMiaoxunSession>;
  onBack: () => void;
  onActionMessage: (message: string) => void;
  onActionError: (error: unknown) => void;
};

export function StationContentDetailView({
  target,
  diary,
  album,
  albumMedia,
  comicDiaries,
  missing,
  palette,
  language,
  token,
  session,
  onBack,
  onEdit,
  onActionMessage,
  onActionError,
}: ContentViewProps & { onEdit?: () => void }) {
  const item = diary || album;

  return (
    <View
      style={[
        styles.stationEditorScreen,
        { backgroundColor: palette.background },
      ]}
    >
      <StationContentEditorHeader
        action={textFor(language, '编辑', 'Edit')}
        actionDisabled={missing}
        onAction={() => onEdit?.()}
        onBack={onBack}
        palette={palette}
        title={
          target.kind === 'diary'
            ? textFor(language, '日记详情', 'Diary')
            : textFor(language, '相册详情', 'Album')
        }
      />
      <ScrollView contentContainerStyle={styles.stationEditorBody}>
        {missing || !item ? (
          <StationContentEditorSection
            title={textFor(language, '内容不存在', 'Content Missing')}
            palette={palette}
          >
            <Text
              style={[
                styles.relationshipEmpty,
                { color: palette.secondaryText },
              ]}
            >
              {textFor(
                language,
                '这条内容已被删除。',
                'This item was deleted.',
              )}
            </Text>
          </StationContentEditorSection>
        ) : (
          <>
            <View
              style={[
                styles.stationContentDetailHero,
                {
                  backgroundColor: palette.surface,
                  borderBottomColor: palette.border,
                },
              ]}
            >
              <Text
                style={[
                  styles.stationContentDetailTitle,
                  { color: palette.text },
                ]}
              >
                {item.title}
              </Text>
              <Text
                style={[
                  styles.stationContentDetailMeta,
                  { color: palette.secondaryText },
                ]}
              >
                {formatDetailDate(item.createdAt, language)} ·{' '}
                {visibilityLabel(item.visibility, language)}
              </Text>
              {diary ? (
                <Text
                  style={[
                    styles.stationContentDetailBody,
                    { color: palette.text },
                  ]}
                >
                  {diary.body}
                </Text>
              ) : album?.description ? (
                <Text
                  style={[
                    styles.stationContentDetailBody,
                    { color: palette.text },
                  ]}
                >
                  {album.description}
                </Text>
              ) : null}
            </View>

            {album ? (
              <StationContentEditorSection
                title={textFor(
                  language,
                  `照片 ${albumMedia.length}`,
                  `Photos ${albumMedia.length}`,
                )}
                palette={palette}
              >
                <AlbumMediaGrid
                  albumMedia={albumMedia}
                  emptyText={textFor(language, '暂无照片', 'No photos yet')}
                  language={language}
                  palette={palette}
                  token={token}
                />
              </StationContentEditorSection>
            ) : null}

            {diary ? (
              <StationComicDiaryPanel
                diary={diary}
                comicDiaries={comicDiaries}
                palette={palette}
                language={language}
                session={session}
                onActionMessage={onActionMessage}
                onActionError={onActionError}
              />
            ) : null}
          </>
        )}
      </ScrollView>
    </View>
  );
}

export function StationContentEditView({
  target,
  diary,
  album,
  albumMedia,
  comicDiaries,
  missing,
  palette,
  language,
  token,
  session,
  title,
  body,
  visibility,
  canSave,
  isSaving,
  isDeleting,
  deletingAssetId,
  onTitleChange,
  onBodyChange,
  onOpenVisibilityMenu,
  onAddAlbumMedia,
  onDeleteMediaAsset,
  onDeleteContent,
  onSave,
  onBack,
  onActionMessage,
  onActionError,
}: ContentViewProps & {
  title: string;
  body: string;
  visibility: StationVisibility;
  canSave: boolean;
  isSaving: boolean;
  isDeleting: boolean;
  deletingAssetId: string | null;
  onTitleChange: (value: string) => void;
  onBodyChange: (value: string) => void;
  onOpenVisibilityMenu: () => void;
  onAddAlbumMedia: (albumId: string) => void;
  onDeleteMediaAsset: (assetId: string) => void;
  onDeleteContent: () => void;
  onSave: () => void;
}) {
  const pageTitle =
    target.kind === 'diary'
      ? textFor(language, '编辑日记', 'Edit Diary')
      : textFor(language, '编辑相册', 'Edit Album');

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      style={[
        styles.stationEditorKeyboard,
        { backgroundColor: palette.background },
      ]}
    >
      <StationContentEditorHeader
        action={
          isSaving
            ? textFor(language, '保存中', 'Saving')
            : textFor(language, '保存', 'Save')
        }
        actionDisabled={!canSave || isSaving || isDeleting || missing}
        onAction={onSave}
        onBack={onBack}
        palette={palette}
        title={pageTitle}
      />
      <ScrollView
        contentContainerStyle={styles.stationEditorBody}
        keyboardShouldPersistTaps="handled"
      >
        {missing ? (
          <StationContentEditorSection
            title={textFor(language, '内容不存在', 'Content Missing')}
            palette={palette}
          >
            <Text
              style={[
                styles.relationshipEmpty,
                { color: palette.secondaryText },
              ]}
            >
              {textFor(
                language,
                '这条内容已经被删除或不属于当前账号。',
                'This item was deleted or does not belong to this account.',
              )}
            </Text>
          </StationContentEditorSection>
        ) : (
          <>
            <StationContentEditorSection
              title={
                target.kind === 'diary'
                  ? textFor(language, '日记内容', 'Diary Content')
                  : textFor(language, '相册信息', 'Album Information')
              }
              palette={palette}
            >
              <StationContentEditorField
                label={textFor(language, '标题', 'Title')}
                palette={palette}
              >
                <TextInput
                  value={title}
                  onChangeText={onTitleChange}
                  maxLength={120}
                  placeholderTextColor={palette.secondaryText}
                  style={[
                    styles.stationEditorInput,
                    {
                      backgroundColor: palette.surface,
                      borderColor: palette.border,
                      color: palette.text,
                    },
                  ]}
                />
              </StationContentEditorField>
              <StationContentEditorField
                label={
                  target.kind === 'diary'
                    ? textFor(language, '正文', 'Body')
                    : textFor(language, '描述', 'Description')
                }
                palette={palette}
              >
                <TextInput
                  value={body}
                  onChangeText={onBodyChange}
                  multiline
                  maxLength={target.kind === 'diary' ? 6000 : 1000}
                  placeholderTextColor={palette.secondaryText}
                  style={[
                    styles.stationEditorInput,
                    styles.stationEditorTextArea,
                    {
                      backgroundColor: palette.surface,
                      borderColor: palette.border,
                      color: palette.text,
                    },
                  ]}
                />
              </StationContentEditorField>
            </StationContentEditorSection>

            <StationContentEditorSection
              title={textFor(language, '可见范围', 'Visibility')}
              palette={palette}
            >
              <Pressable
                accessibilityRole="button"
                onPress={onOpenVisibilityMenu}
                style={[
                  styles.stationEditorVisibilityRow,
                  { backgroundColor: palette.soft },
                ]}
              >
                <ManageVisibilityIcon
                  color={palette.secondaryText}
                  visibility={visibility}
                />
                <Text
                  style={[
                    styles.stationCreateVisibilityTitle,
                    { color: palette.text },
                  ]}
                >
                  {textFor(language, '谁可以看', 'Visibility')}
                </Text>
                <Text
                  style={[
                    styles.stationCreateVisibilityValue,
                    { color: palette.secondaryText },
                  ]}
                >
                  {visibilityLabel(visibility, language)}
                </Text>
                <ChevronRight
                  color={palette.secondaryText}
                  size={17}
                  strokeWidth={1.8}
                />
              </Pressable>
            </StationContentEditorSection>

            {diary ? (
              <StationComicDiaryPanel
                diary={diary}
                comicDiaries={comicDiaries}
                palette={palette}
                language={language}
                session={session}
                onActionMessage={onActionMessage}
                onActionError={onActionError}
              />
            ) : null}

            {album ? (
              <StationContentEditorSection
                title={textFor(language, '相册照片', 'Album Photos')}
                palette={palette}
              >
                <View style={styles.stationManagePhotoHeader}>
                  <Text
                    style={[
                      styles.relationshipEmpty,
                      { color: palette.secondaryText },
                    ]}
                  >
                    {textFor(
                      language,
                      `${albumMedia.length} 张照片`,
                      `${albumMedia.length} photos`,
                    )}
                  </Text>
                  <Pressable
                    accessibilityRole="button"
                    onPress={() => onAddAlbumMedia(album.id)}
                    style={[
                      styles.stationManageSmallButton,
                      styles.stationEditorPrimaryBackground,
                    ]}
                  >
                    <Text style={styles.stationEditorSaveText}>
                      {textFor(language, '添加照片', 'Add Photos')}
                    </Text>
                  </Pressable>
                </View>
                <AlbumMediaGrid
                  albumMedia={albumMedia}
                  deletingAssetId={deletingAssetId}
                  emptyText={textFor(language, '暂无照片', 'No photos yet')}
                  language={language}
                  onDeleteMediaAsset={onDeleteMediaAsset}
                  palette={palette}
                  token={token}
                />
              </StationContentEditorSection>
            ) : null}

            <StationContentEditorSection
              title={textFor(language, '内容管理', 'Content Management')}
              palette={palette}
            >
              <Pressable
                accessibilityLabel={
                  target.kind === 'diary'
                    ? textFor(language, '删除日记', 'Delete Diary')
                    : textFor(language, '删除相册', 'Delete Album')
                }
                accessibilityRole="button"
                disabled={isSaving || isDeleting}
                onPress={onDeleteContent}
                style={[
                  styles.stationEditorDeleteButton,
                  { borderColor: palette.rose },
                  (isSaving || isDeleting) && styles.disabledButton,
                ]}
              >
                <Text
                  style={[
                    styles.stationEditorDeleteText,
                    { color: palette.rose },
                  ]}
                >
                  {isDeleting
                    ? textFor(language, '删除中', 'Deleting')
                    : target.kind === 'diary'
                    ? textFor(language, '删除日记', 'Delete Diary')
                    : textFor(language, '删除相册', 'Delete Album')}
                </Text>
              </Pressable>
            </StationContentEditorSection>
          </>
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function AlbumMediaGrid({
  albumMedia,
  emptyText,
  language,
  palette,
  token,
  deletingAssetId,
  onDeleteMediaAsset,
}: {
  albumMedia: StationMediaAssetDTO[];
  emptyText: string;
  language: Language;
  palette: Palette;
  token: string;
  deletingAssetId?: string | null;
  onDeleteMediaAsset?: (assetId: string) => void;
}) {
  if (!albumMedia.length) {
    return (
      <Text
        style={[styles.relationshipEmpty, { color: palette.secondaryText }]}
      >
        {emptyText}
      </Text>
    );
  }

  return (
    <View style={styles.stationManageMediaGrid}>
      {albumMedia.map(asset => (
        <View
          key={asset.id}
          style={[
            styles.stationManageMediaItem,
            { backgroundColor: palette.soft },
          ]}
        >
          {asset.status === 'uploaded' &&
          (!onDeleteMediaAsset || asset.kind === 'image') ? (
            <Image
              resizeMode="cover"
              source={{
                uri: buildStationMediaFileUrl(asset.id),
                headers: { Authorization: `Bearer ${token}` },
              }}
              style={styles.stationManageMediaImage}
            />
          ) : (
            <Text
              style={[
                styles.stationAlbumCoverText,
                { color: palette.secondaryText },
              ]}
            >
              {textFor(
                language,
                onDeleteMediaAsset ? '上传中' : '处理中',
                onDeleteMediaAsset ? 'Uploading' : 'Processing',
              )}
            </Text>
          )}
          {onDeleteMediaAsset ? (
            <Pressable
              accessibilityRole="button"
              disabled={deletingAssetId === asset.id}
              onPress={() => onDeleteMediaAsset(asset.id)}
              style={[
                styles.stationManageMediaDelete,
                { backgroundColor: palette.surface },
                deletingAssetId === asset.id && styles.disabledButton,
              ]}
            >
              <Text
                style={[
                  styles.stationManageMediaDeleteText,
                  { color: palette.rose },
                ]}
              >
                {textFor(language, '删除', 'Delete')}
              </Text>
            </Pressable>
          ) : null}
        </View>
      ))}
    </View>
  );
}

const visibilityLabel = (visibility: StationVisibility, language: Language) =>
  ({
    private: textFor(language, '仅自己', 'Only Me'),
    friends: textFor(language, '好友可见', 'Friends'),
    public: textFor(language, '公开', 'Public'),
  }[visibility]);

const formatDetailDate = (
  value: string | null | undefined,
  language: Language,
) => {
  const date = value ? new Date(value) : null;
  if (!date || Number.isNaN(date.getTime()))
    return textFor(language, '时间未知', 'Unknown date');
  return date.toLocaleDateString(language === 'zh' ? 'zh-CN' : 'en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
};

function ManageVisibilityIcon({
  color,
  visibility,
}: {
  color: string;
  visibility: StationVisibility;
}) {
  if (visibility === 'public')
    return <Globe2 color={color} size={18} strokeWidth={1.9} />;
  if (visibility === 'friends')
    return <Users color={color} size={18} strokeWidth={1.9} />;
  return <LockKeyhole color={color} size={18} strokeWidth={1.9} />;
}
