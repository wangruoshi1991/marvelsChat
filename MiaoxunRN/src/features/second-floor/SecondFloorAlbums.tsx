import React, { useEffect, useRef, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { pickStationPhotoFromLibrary } from '../../services/stationMediaPicker';
import { appErrorText, textFor } from '../../shared/i18n';
import { Palette } from '../../shared/theme';
import { secondFloorPalette } from './secondFloorTheme';
import { isV6Palette } from '../../shared/v6Palette';
import { isXunPalette } from '../../shared/xunPalette';
import { Language, useMiaoxunSession } from '../session/useMiaoxunSession';
import { SecondFloorPageScrollProps } from './secondFloorScroll';
import { SecondFloorAlbumList } from './SecondFloorAlbumList';
import { StationContentManageSheet } from '../station/StationContentManageSheet';
import {
  StationCreatePayload,
  StationCreateSheet,
} from '../station/StationCreateSheet';

export function SecondFloorAlbums({
  header,
  palette,
  language,
  session,
  onBusyChange,
  scrollProps,
}: {
  header?: React.ReactNode;
  palette: Palette;
  language: Language;
  session: ReturnType<typeof useMiaoxunSession>;
  onBusyChange?: (busy: boolean) => void;
  scrollProps?: SecondFloorPageScrollProps;
}) {
  const colors = secondFloorPalette(palette);
  const v6 = isV6Palette(colors);
  const xun = isXunPalette(colors);
  const [page, setPage] = useState<'list' | 'create' | 'detail' | 'edit'>(
    'list',
  );
  const [albumId, setAlbumId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const pending = useRef(false);
  const alive = useRef(true);
  const createdAlbum = useRef<string | null>(null);

  const setPending = (value: boolean) => {
    pending.current = value;
    if (alive.current) {
      setBusy(value);
      onBusyChange?.(value);
    }
  };

  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);
  const reportError = (error: unknown) => {
    if (alive.current)
      setMessage(
        appErrorText(language, error, '相册操作失败', 'Album action failed'),
      );
  };
  const create = async (payload: StationCreatePayload) => {
    if (!alive.current || payload.kind !== 'album' || pending.current) return;
    setPending(true);
    setMessage('');
    try {
      if (!createdAlbum.current) {
        const album = await session.createStationAlbum({
          title: payload.title,
          description: payload.description,
          visibility: payload.visibility,
        });
        createdAlbum.current = album.id;
      }
      for (let index = 0; index < payload.media.length; index += 1) {
        if (!alive.current) return;
        const media = payload.media[index];
        await session.createStationMediaAsset({
          albumId: createdAlbum.current,
          kind: 'image',
          originalFilename: media.originalFilename,
          mimeType: media.mimeType,
          byteSize: media.byteSize,
          width: media.width,
          height: media.height,
          localMedia: media,
        });
      }
      if (alive.current) {
        setAlbumId(createdAlbum.current);
        setPage('detail');
        createdAlbum.current = null;
      }
    } catch (error) {
      reportError(error);
      if (alive.current && createdAlbum.current) {
        setAlbumId(createdAlbum.current);
        setPage('detail');
        setMessage(
          textFor(
            language,
            '相册已保存，部分照片未完成上传。请在相册中检查后继续添加。',
            'Album saved. Some photos were not uploaded. Review the album before adding more.',
          ) +
            ' ' +
            appErrorText(language, error, '上传失败', 'Upload failed'),
        );
        createdAlbum.current = null;
      }
    } finally {
      setPending(false);
    }
  };
  const addPhoto = async (targetId: string) => {
    if (!alive.current || pending.current) return;
    setPending(true);
    setMessage('');
    try {
      const media = await pickStationPhotoFromLibrary();
      if (!media || !alive.current) return;
      await session.createStationMediaAsset({
        albumId: targetId,
        kind: 'image',
        originalFilename: media.originalFilename,
        mimeType: media.mimeType,
        byteSize: media.byteSize,
        width: media.width,
        height: media.height,
        localMedia: media,
      });
    } catch (error) {
      reportError(error);
    } finally {
      setPending(false);
    }
  };
  const withPending = async <T,>(work: () => Promise<T>): Promise<T> => {
    if (!alive.current || pending.current)
      throw new Error(
        textFor(
          language,
          '请等待当前相册操作完成',
          'Wait for the current album action to finish.',
        ),
      );
    setPending(true);
    try {
      return await work();
    } finally {
      setPending(false);
    }
  };
  const managedSession = {
    ...session,
    updateStationAlbum: (
      ...args: Parameters<typeof session.updateStationAlbum>
    ) => withPending(() => session.updateStationAlbum(...args)),
    deleteStationAlbum: (
      ...args: Parameters<typeof session.deleteStationAlbum>
    ) => withPending(() => session.deleteStationAlbum(...args)),
    deleteStationMediaAsset: (
      ...args: Parameters<typeof session.deleteStationMediaAsset>
    ) => withPending(() => session.deleteStationMediaAsset(...args)),
  };
  return (
    <View
      style={[
        s.screen,
        {
          backgroundColor: v6 || xun ? colors.background : colors.surface,
        },
      ]}
    >
      {page !== 'list' && header ? (
        <View style={s.flowHeader}>{header}</View>
      ) : null}
      {busy && page !== 'create' ? (
        <Text
          accessibilityLiveRegion="polite"
          style={[s.message, { color: colors.secondaryText }]}
        >
          {textFor(
            language,
            '正在保存相册，请稍候',
            'Saving album. Please wait.',
          )}
        </Text>
      ) : null}
      {message ? (
        <Text
          accessibilityRole="alert"
          style={[s.message, { color: palette.rose }]}
        >
          {message}
        </Text>
      ) : null}
      {page === 'list' ? (
        <SecondFloorAlbumList
          header={header}
          palette={colors}
          language={language}
          token={session.token}
          albums={session.stationContent.albums}
          mediaAssets={session.stationContent.mediaAssets}
          onCreate={() => {
            createdAlbum.current = null;
            setMessage('');
            setPage('create');
          }}
          onOpen={id => {
            setMessage('');
            setAlbumId(id);
            setPage('detail');
          }}
          onEdit={id => {
            setMessage('');
            setAlbumId(id);
            setPage('edit');
          }}
          scrollProps={scrollProps}
        />
      ) : null}
      {page === 'create' ? (
        <StationCreateSheet
          kind="album"
          fullScreen
          palette={colors}
          language={language}
          isSaving={busy}
          progressText={textFor(
            language,
            '正在保存所选照片',
            'Saving selected photos',
          )}
          onActionError={reportError}
          onBack={() => {
            if (!pending.current) setPage('list');
          }}
          onSubmit={create}
        />
      ) : null}
      {(page === 'detail' || page === 'edit') && albumId ? (
        <StationContentManageSheet
          target={{ kind: 'album', id: albumId }}
          palette={colors}
          language={language}
          token={session.token}
          stationContent={session.stationContent}
          session={managedSession}
          mode={page}
          onEdit={() => setPage('edit')}
          onAddAlbumMedia={id => {
            addPhoto(id);
          }}
          onBack={() => {
            if (pending.current) return;
            setMessage('');
            setPage(page === 'edit' ? 'detail' : 'list');
          }}
          onDeleted={() => setPage('list')}
          onActionMessage={setMessage}
          onActionError={reportError}
        />
      ) : null}
    </View>
  );
}

const s = StyleSheet.create({
  screen: { flex: 1 },
  flowHeader: { paddingTop: 8, paddingHorizontal: 17 },
  message: { padding: 12 },
});
