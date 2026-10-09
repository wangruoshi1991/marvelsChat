import React, { useEffect, useRef, useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { request } from '../../services/api/http';
import { stationContentApi } from '../../services/api/stationContentApi';
import { Palette } from '../../shared/theme';
import { textFor } from '../../shared/i18n';
import type { Language } from '../session/sessionTypes';
import { RetrievalResultCard } from '../media-retrieval/RetrievalResultCard';
import { MediaRetrievalSearchResult } from '../media-retrieval/mediaRetrievalTypes';
import { assertRetrievalResults } from '../media-retrieval/mediaRetrievalContract';
import { StationMediaPreviewScreen } from '../station/StationMediaPreviewScreen';

export function AlbumAssistantResults({
  token,
  threadId,
  messageId,
  palette,
  language,
}: {
  token: string;
  threadId: string;
  messageId: string;
  palette: Palette;
  language: Language;
}) {
  const [results, setResults] = useState<MediaRetrievalSearchResult[]>([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [attempt, setAttempt] = useState(0);
  const generation = useRef(0);
  const [preview, setPreview] = useState<MediaRetrievalSearchResult | null>(
    null,
  );
  useEffect(() => {
    let active = true;
    generation.current += 1;
    setPreview(null);
    setLoading(true);
    setError('');
    setResults([]);
    request<unknown>(
      `/api/threads/${threadId}/messages/${messageId}/media-results`,
      { token },
    )
      .then(data => {
        assertRetrievalResults(data);
        if (active) setResults(data);
      })
      .catch(issue => {
        if (active)
          setError(issue instanceof Error ? issue.message : '素材加载失败');
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
      generation.current += 1;
    };
  }, [attempt, messageId, threadId, token]);
  return (
    <View style={local.results}>
      {loading ? (
        <Text style={{ color: palette.secondaryText }}>
          {textFor(language, '正在读取素材…', 'Loading media…')}
        </Text>
      ) : null}
      {error ? (
        <Pressable
          accessibilityRole="button"
          onPress={() => setAttempt(value => value + 1)}
        >
          <Text style={{ color: palette.secondaryText }}>
            {error} · {textFor(language, '重试', 'Retry')}
          </Text>
        </Pressable>
      ) : !loading && !results.length ? (
        <Text style={{ color: palette.secondaryText }}>
          {textFor(
            language,
            '这些素材已不可用，请重新查找。',
            'These items are no longer available. Search again.',
          )}
        </Text>
      ) : null}
      {results.map(result => (
        <RetrievalResultCard
          key={result.mediaAssetId}
          result={result}
          token={token}
          palette={palette}
          language={language}
          disabled={false}
          onPress={() => {
            const currentGeneration = generation.current;
            stationContentApi
              .stationMediaAsset(token, result.mediaAssetId)
              .then(asset => {
                if (generation.current !== currentGeneration) return;
                if (asset.kind !== result.kind || asset.status !== 'uploaded')
                  throw new Error('素材已更新，请重新查找');
                setPreview(result);
              })
              .catch(issue => {
                if (generation.current !== currentGeneration) return;
                setError(
                  issue instanceof Error ? issue.message : '素材加载失败',
                );
              });
          }}
        />
      ))}
      <Modal
        visible={preview !== null}
        presentationStyle="fullScreen"
        onRequestClose={() => setPreview(null)}
      >
        {preview ? (
          <SafeAreaProvider>
            <SafeAreaView style={local.preview} edges={['top', 'bottom']}>
              <StationMediaPreviewScreen
                asset={{
                  id: preview.mediaAssetId,
                  kind: preview.kind,
                  status: 'uploaded',
                }}
                timestampMs={preview.matchedFrameTimestampMs}
                token={token}
                palette={palette}
                language={language}
                onBack={() => setPreview(null)}
                onUnavailable={assetId => {
                  setPreview(null);
                  setResults(current =>
                    current.filter(result => result.mediaAssetId !== assetId),
                  );
                }}
              />
            </SafeAreaView>
          </SafeAreaProvider>
        ) : null}
      </Modal>
    </View>
  );
}

const local = StyleSheet.create({
  results: { gap: 8, marginTop: 8 },
  preview: { flex: 1 },
});
