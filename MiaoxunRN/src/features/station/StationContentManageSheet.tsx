import React, { useEffect, useMemo, useState } from 'react';
import { Alert } from 'react-native';

import { StationContentDTO, StationVisibility } from '../../models/api';
import { textFor } from '../../shared/i18n';
import { Palette } from '../../shared/theme';
import { Language, useMiaoxunSession } from '../session/useMiaoxunSession';
import {
  StationContentDetailView,
  StationContentEditView,
} from './StationContentManageViews';
import type { StationManageTarget } from './stationTypes';

type StationContentManageSheetProps = {
  target: StationManageTarget;
  palette: Palette;
  language: Language;
  token: string;
  stationContent: StationContentDTO;
  session: ReturnType<typeof useMiaoxunSession>;
  onAddAlbumMedia: (albumId: string) => void;
  mode: 'detail' | 'edit';
  onEdit?: () => void;
  onBack: () => void;
  onDeleted: () => void;
  onActionMessage: (message: string) => void;
  onActionError: (error: unknown) => void;
};

export function StationContentManageSheet({
  target,
  palette,
  language,
  token,
  stationContent,
  session,
  onAddAlbumMedia,
  mode,
  onEdit,
  onBack,
  onDeleted,
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

  const openVisibilityMenu = () => {
    Alert.alert(textFor(language, '谁可以看', 'Visibility'), undefined, [
      {
        text: textFor(language, '仅自己可见', 'Only Me'),
        onPress: () => setVisibility('private'),
      },
      {
        text: textFor(language, '好友可见', 'Friends'),
        onPress: () => setVisibility('friends'),
      },
      {
        text: textFor(language, '公开', 'Public'),
        onPress: () => setVisibility('public'),
      },
      { text: textFor(language, '取消', 'Cancel'), style: 'cancel' },
    ]);
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
                onDeleted();
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

  if (mode === 'detail') {
    return (
      <StationContentDetailView
        album={album}
        albumMedia={albumMedia}
        comicDiaries={stationContent.comicDiaries}
        diary={diary}
        language={language}
        missing={missing}
        onActionError={onActionError}
        onActionMessage={onActionMessage}
        onBack={onBack}
        onEdit={onEdit}
        palette={palette}
        session={session}
        target={target}
        token={token}
      />
    );
  }

  return (
    <StationContentEditView
      album={album}
      albumMedia={albumMedia}
      body={body}
      canSave={canSave}
      comicDiaries={stationContent.comicDiaries}
      deletingAssetId={deletingAssetId}
      diary={diary}
      isDeleting={isDeleting}
      isSaving={isSaving}
      language={language}
      missing={missing}
      onActionError={onActionError}
      onActionMessage={onActionMessage}
      onAddAlbumMedia={onAddAlbumMedia}
      onBack={onBack}
      onBodyChange={setBody}
      onDeleteContent={deleteContent}
      onDeleteMediaAsset={deleteMediaAsset}
      onOpenVisibilityMenu={openVisibilityMenu}
      onSave={save}
      onTitleChange={setTitle}
      palette={palette}
      session={session}
      target={target}
      title={title}
      token={token}
      visibility={visibility}
    />
  );
}
