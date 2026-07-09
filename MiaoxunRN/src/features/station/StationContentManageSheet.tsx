import React, { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Image,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from 'react-native';

import { StationContentDTO, StationVisibility } from '../../models/api';
import { buildStationMediaFileUrl } from '../../services/stationMediaUrl';
import { textFor } from '../../shared/i18n';
import {
  SettingGroup,
  SettingsActionButton,
  SettingsSegmentRow,
} from '../../shared/settingsUi';
import { styles } from '../../shared/styles';
import { Palette } from '../../shared/theme';
import { SegmentedControl, SheetHeader } from '../../shared/ui';
import { Language, useMiaoxunSession } from '../session/useMiaoxunSession';
import { StationComicDiaryPanel } from './StationComicDiaryPanel';

export type StationManageTarget =
  | { kind: 'diary'; id: string }
  | { kind: 'album'; id: string };

type StationContentManageSheetProps = {
  target: StationManageTarget;
  palette: Palette;
  language: Language;
  token: string;
  stationContent: StationContentDTO;
  session: ReturnType<typeof useMiaoxunSession>;
  onAddAlbumMedia: (albumId: string) => void;
  onBack: () => void;
  onActionMessage: (message: string) => void;
  onActionError: (error: unknown) => void;
};

const visibilityOptions = (language: Language) => [
  { label: textFor(language, '仅自己', 'Private'), value: 'private' as const },
  { label: textFor(language, '好友', 'Friends'), value: 'friends' as const },
  { label: textFor(language, '公开', 'Public'), value: 'public' as const },
];

export function StationContentManageSheet({
  target,
  palette,
  language,
  token,
  stationContent,
  session,
  onAddAlbumMedia,
  onBack,
  onActionMessage,
  onActionError,
}: StationContentManageSheetProps) {
  const diary = useMemo(
    () =>
      target.kind === 'diary'
        ? stationContent.diaryEntries.find(entry => entry.id === target.id) ||
          null
        : null,
    [stationContent.diaryEntries, target],
  );
  const album = useMemo(
    () =>
      target.kind === 'album'
        ? stationContent.albums.find(item => item.id === target.id) || null
        : null,
    [stationContent.albums, target],
  );
  const albumMedia = useMemo(
    () =>
      album
        ? stationContent.mediaAssets.filter(
            asset => asset.albumId === album.id && asset.status !== 'deleted',
          )
        : [],
    [album, stationContent.mediaAssets],
  );

  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [visibility, setVisibility] = useState<StationVisibility>('private');
  const [isSaving, setIsSaving] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [deletingAssetId, setDeletingAssetId] = useState<string | null>(null);

  useEffect(() => {
    if (diary) {
      setTitle(diary.title);
      setBody(diary.body);
      setVisibility(diary.visibility);
      return;
    }
    if (album) {
      setTitle(album.title);
      setBody(album.description);
      setVisibility(album.visibility);
    }
  }, [album, diary]);

  const missing = target.kind === 'diary' ? !diary : !album;
  const canSave =
    target.kind === 'diary'
      ? title.trim().length > 0 && body.trim().length > 0
      : title.trim().length > 0;

  const save = async () => {
    if (!canSave || isSaving || missing) {
      return;
    }
    setIsSaving(true);
    try {
      if (target.kind === 'diary') {
        await session.updateStationDiary(target.id, {
          title: title.trim(),
          body: body.trim(),
          visibility,
        });
        onActionMessage(textFor(language, '日记已更新', 'Diary updated'));
      } else {
        await session.updateStationAlbum(target.id, {
          title: title.trim(),
          description: body.trim(),
          visibility,
        });
        onActionMessage(textFor(language, '相册已更新', 'Album updated'));
      }
    } catch (error) {
      onActionError(error);
    } finally {
      setIsSaving(false);
    }
  };

  const deleteContent = () => {
    if (missing || isDeleting) {
      return;
    }
    Alert.alert(
      target.kind === 'diary'
        ? textFor(language, '删除日记', 'Delete Diary')
        : textFor(language, '删除相册', 'Delete Album'),
      target.kind === 'diary'
        ? textFor(
            language,
            '删除后这条日记会从小站移除。',
            'This diary will be removed.',
          )
        : textFor(
            language,
            '删除后相册和其中照片会从小站移除。',
            'This album and its photos will be removed.',
          ),
      [
        { text: textFor(language, '取消', 'Cancel'), style: 'cancel' },
        {
          text: textFor(language, '删除', 'Delete'),
          style: 'destructive',
          onPress: () => {
            setIsDeleting(true);
            const work =
              target.kind === 'diary'
                ? session.deleteStationDiary(target.id)
                : session.deleteStationAlbum(target.id);
            work
              .then(() => {
                onActionMessage(
                  target.kind === 'diary'
                    ? textFor(language, '日记已删除', 'Diary deleted')
                    : textFor(language, '相册已删除', 'Album deleted'),
                );
                onBack();
              })
              .catch(onActionError)
              .finally(() => setIsDeleting(false));
          },
        },
      ],
    );
  };

  const deleteMediaAsset = (assetId: string) => {
    if (deletingAssetId) {
      return;
    }
    Alert.alert(
      textFor(language, '删除照片', 'Delete Photo'),
      textFor(
        language,
        '这张照片会从相册中移除。',
        'This photo will be removed from the album.',
      ),
      [
        { text: textFor(language, '取消', 'Cancel'), style: 'cancel' },
        {
          text: textFor(language, '删除', 'Delete'),
          style: 'destructive',
          onPress: () => {
            setDeletingAssetId(assetId);
            session
              .deleteStationMediaAsset(assetId)
              .then(() =>
                onActionMessage(
                  textFor(language, '照片已删除', 'Photo deleted'),
                ),
              )
              .catch(onActionError)
              .finally(() => setDeletingAssetId(null));
          },
        },
      ],
    );
  };

  return (
    <ScrollView
      style={{ backgroundColor: palette.background }}
      contentContainerStyle={styles.settingsContent}
    >
      <SheetHeader
        title={
          target.kind === 'diary'
            ? textFor(language, '日记详情', 'Diary Detail')
            : textFor(language, '相册详情', 'Album Detail')
        }
        palette={palette}
        onBack={onBack}
      />

      {missing ? (
        <SettingGroup
          title={textFor(language, '内容不存在', 'Content Missing')}
          palette={palette}
        >
          <Text
            style={[styles.relationshipEmpty, { color: palette.secondaryText }]}
          >
            {textFor(
              language,
              '这条内容已经被删除或不属于当前账号。',
              'This item was deleted or does not belong to this account.',
            )}
          </Text>
        </SettingGroup>
      ) : (
        <>
          <SettingGroup
            title={
              target.kind === 'diary'
                ? textFor(language, '日记内容', 'Diary Content')
                : textFor(language, '相册信息', 'Album Info')
            }
            palette={palette}
          >
            <View style={styles.settingsInputWrap}>
              <Text
                style={[
                  styles.settingsSegmentTitle,
                  { color: palette.secondaryText },
                ]}
              >
                {textFor(language, '标题', 'Title')}
              </Text>
              <TextInput
                value={title}
                onChangeText={setTitle}
                maxLength={120}
                placeholderTextColor={palette.secondaryText}
                style={[
                  styles.settingsInput,
                  {
                    backgroundColor: palette.surface,
                    borderColor: palette.border,
                    color: palette.text,
                  },
                ]}
              />
            </View>
            <View style={styles.settingsInputWrap}>
              <Text
                style={[
                  styles.settingsSegmentTitle,
                  { color: palette.secondaryText },
                ]}
              >
                {target.kind === 'diary'
                  ? textFor(language, '正文', 'Body')
                  : textFor(language, '描述', 'Description')}
              </Text>
              <TextInput
                value={body}
                onChangeText={setBody}
                multiline
                maxLength={target.kind === 'diary' ? 6000 : 1000}
                placeholderTextColor={palette.secondaryText}
                style={[
                  styles.settingsInput,
                  styles.settingsInputMultiline,
                  styles.stationManageTextArea,
                  {
                    backgroundColor: palette.surface,
                    borderColor: palette.border,
                    color: palette.text,
                  },
                ]}
              />
            </View>
          </SettingGroup>

          <SettingGroup
            title={textFor(language, '可见范围', 'Visibility')}
            palette={palette}
          >
            <SettingsSegmentRow
              title={textFor(language, '谁可以看', 'Audience')}
              palette={palette}
            >
              <SegmentedControl
                fill
                palette={palette}
                value={visibility}
                options={visibilityOptions(language)}
                onChange={setVisibility}
              />
            </SettingsSegmentRow>
          </SettingGroup>

          {diary ? (
            <StationComicDiaryPanel
              diary={diary}
              comicDiaries={stationContent.comicDiaries || []}
              palette={palette}
              language={language}
              session={session}
              onActionMessage={onActionMessage}
              onActionError={onActionError}
            />
          ) : null}

          {album ? (
            <SettingGroup
              title={textFor(language, '照片', 'Photos')}
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
                    { backgroundColor: palette.text },
                  ]}
                >
                  <Text
                    style={[
                      styles.stationManageSmallButtonText,
                      { color: palette.background },
                    ]}
                  >
                    {textFor(language, '添加照片', 'Add')}
                  </Text>
                </Pressable>
              </View>
              {albumMedia.length ? (
                <View style={styles.stationManageMediaGrid}>
                  {albumMedia.map(asset => (
                    <View
                      key={asset.id}
                      style={[
                        styles.stationManageMediaItem,
                        { backgroundColor: palette.soft },
                      ]}
                    >
                      {asset.status === 'uploaded' && asset.kind === 'image' ? (
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
                          {textFor(language, '上传中', 'Uploading')}
                        </Text>
                      )}
                      <Pressable
                        accessibilityRole="button"
                        disabled={deletingAssetId === asset.id}
                        onPress={() => deleteMediaAsset(asset.id)}
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
                    </View>
                  ))}
                </View>
              ) : (
                <Text
                  style={[
                    styles.relationshipEmpty,
                    { color: palette.secondaryText },
                  ]}
                >
                  {textFor(language, '暂无照片', 'No photos yet')}
                </Text>
              )}
            </SettingGroup>
          ) : null}

          <View style={styles.settingsActionRow}>
            <SettingsActionButton
              title={textFor(language, '删除', 'Delete')}
              palette={palette}
              disabled={isSaving || isDeleting}
              onPress={deleteContent}
            />
            <SettingsActionButton
              title={
                isSaving
                  ? textFor(language, '保存中', 'Saving')
                  : textFor(language, '保存', 'Save')
              }
              palette={palette}
              primary
              disabled={!canSave || isSaving || isDeleting}
              onPress={save}
            />
          </View>
        </>
      )}
    </ScrollView>
  );
}
