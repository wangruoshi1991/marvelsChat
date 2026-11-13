import React, { useMemo, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { AIContextReference } from '../../models/aiTask';
import { StationAlbumDTO, StationMediaAssetDTO } from '../../models/api';
import { Palette } from '../../shared/theme';
import { textFor } from '../../shared/i18n';
import { Language } from '../session/sessionTypes';
import { Action } from './ContentPreviewMessageCard';
import { PrivateReferenceImage } from './PrivateReferenceImage';
export function ComicSourcePickerSheet({
  token,
  albums,
  mediaAssets,
  references,
  palette,
  language,
  onSelect,
  onClose,
}: {
  token: string;
  albums: StationAlbumDTO[];
  mediaAssets: StationMediaAssetDTO[];
  references: AIContextReference[];
  palette: Palette;
  language: Language;
  onSelect: (refs: AIContextReference[]) => void;
  onClose: () => void;
}) {
  const [album, setAlbum] = useState<string>();
  const [selected, setSelected] = useState<string[]>(
    references.filter(ref => ref.kind === 'station-photo').map(ref => ref.id),
  );
  const [error, setError] = useState('');
  const existing = references.filter(ref => ref.kind !== 'station-photo');
  const images = useMemo(
    () =>
      mediaAssets.filter(
        asset =>
          asset.kind === 'image' &&
          asset.status === 'uploaded' &&
          (!album || asset.albumId === album),
      ),
    [mediaAssets, album],
  );
  const t = (zh: string, en: string) => textFor(language, zh, en);
  return (
    <View style={[s.screen, { backgroundColor: palette.background }]}>
      <View style={s.header}>
        <Action
          label={t('取消选择', 'Cancel')}
          palette={palette}
          onPress={onClose}
        />
        <Text style={{ color: palette.text }}>
          {t('选择参考图片', 'Reference images')} ·{' '}
          {selected.length + existing.length}/6
        </Text>
        <Action
          label={t('使用所选', 'Use selected')}
          palette={palette}
          onPress={() => {
            const chosen = selected.map(id =>
              mediaAssets.find(asset => asset.id === id),
            );
            if (
              chosen.some(
                asset =>
                  !asset ||
                  asset.kind !== 'image' ||
                  asset.status !== 'uploaded',
              )
            ) {
              setError(
                t(
                  '所选图片已不可用，请重新选择。',
                  'A selected image is unavailable.',
                ),
              );
              return;
            }
            onSelect([
              ...existing,
              ...chosen.map(asset => ({
                kind: 'station-photo' as const,
                id: asset!.id,
                title: asset!.caption || asset!.originalFilename,
              })),
            ]);
          }}
        />
      </View>
      <Text style={[s.note, { color: palette.secondaryText }]}>
        {t(
          '当前仅显示已载入的最近图片，相册可能不完整。图片作为画面参考，请附一句故事说明；文字模型不会读取原图内容。',
          'Only recently loaded images are shown; albums may be incomplete. Add a story description; the text model does not inspect image pixels.',
        )}
      </Text>
      <ScrollView horizontal style={s.filters}>
        <Action
          label={t('最近可用图片', 'Recent available images')}
          palette={palette}
          onPress={() => setAlbum(undefined)}
        />
        {albums.map(item => (
          <Action
            key={item.id}
            label={item.title}
            palette={palette}
            onPress={() => setAlbum(item.id)}
          />
        ))}
      </ScrollView>
      {error ? (
        <Text
          accessibilityRole="alert"
          style={[s.note, { color: palette.rose }]}
        >
          {error}
        </Text>
      ) : null}
      <ScrollView contentContainerStyle={s.body}>
        {!images.length ? (
          <Text style={{ color: palette.secondaryText }}>
            {t(
              '当前已载入图片中没有匹配项，请上传图片或选择其他相册。',
              'No matching image is currently loaded. Upload one or select another album.',
            )}
          </Text>
        ) : null}
        {images.map(asset => (
          <View key={asset.id} style={s.imageItem}>
            <PrivateReferenceImage
              key={`${token}:${asset.id}`}
              token={token}
              mediaAssetId={asset.id}
              label={asset.caption || asset.originalFilename}
              palette={palette}
              language={language}
              style={s.image}
            />
            <Action
              label={`${
                selected.includes(asset.id)
                  ? t('取消', 'Remove')
                  : t('选择', 'Select')
              } ${asset.caption || asset.originalFilename}`}
              palette={palette}
              onPress={() => {
                setError('');
                if (selected.includes(asset.id))
                  setSelected(old => old.filter(id => id !== asset.id));
                else if (selected.length + existing.length >= 6)
                  setError(
                    t(
                      '最多选择6份素材，请先移除一份。',
                      'Select at most six sources. Remove one first.',
                    ),
                  );
                else setSelected(old => [...old, asset.id]);
              }}
            />
          </View>
        ))}
      </ScrollView>
    </View>
  );
}
const s = StyleSheet.create({
  screen: { flex: 1 },
  header: {
    padding: 12,
    gap: 8,
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
  },
  note: { marginHorizontal: 16, marginBottom: 8 },
  filters: { maxHeight: 60, marginHorizontal: 12 },
  body: { padding: 16, gap: 14 },
  imageItem: { gap: 6 },
  image: { width: '100%', aspectRatio: 2, borderRadius: 8 },
});
