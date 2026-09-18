import React, { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import {
  AgentDTO,
  AgentReadinessDTO,
  StationMediaAssetDTO,
} from '../../models/api';
import { stationContentApi } from '../../services/api/stationContentApi';
import { MiaoxunApiError } from '../../services/api/http';
import { Palette } from '../../shared/theme';
import { MediaRetrievalScreen } from '../media-retrieval/MediaRetrievalScreen';
import { MediaRetrievalSearchResult } from '../media-retrieval/mediaRetrievalTypes';
import { Language } from '../session/useMiaoxunSession';
import { StationMediaPreviewScreen } from './StationMediaPreviewScreen';

export function StationMediaRetrievalWorkspace({
  token,
  userId,
  palette,
  language,
  agents,
  agentReadiness,
  onClose,
}: {
  token: string;
  userId: string;
  palette: Palette;
  language: Language;
  agents: AgentDTO[];
  agentReadiness: Record<string, AgentReadinessDTO>;
  onClose: () => void;
}) {
  const [preview, setPreview] = useState<{
    asset: Pick<StationMediaAssetDTO, 'id' | 'kind' | 'status'>;
    timestampMs: number | null;
  } | null>(null);
  const [invalidatedAssetId, setInvalidatedAssetId] = useState<string | null>(
    null,
  );
  const onOpenResult = async (result: MediaRetrievalSearchResult) => {
    const asset = await stationContentApi.stationMediaAsset(
      token,
      result.mediaAssetId,
    );
    if (asset.kind !== result.kind || asset.status !== 'uploaded') {
      throw new MiaoxunApiError('素材已更新，请重新检索', { status: 409 });
    }
    setPreview({ asset, timestampMs: result.matchedFrameTimestampMs });
  };
  return (
    <View style={local.screen}>
      <View style={preview ? local.hidden : local.screen}>
        <MediaRetrievalScreen
          userId={userId}
          token={token}
          palette={palette}
          language={language}
          registeredAvailability={
            agents.some(
              agent =>
                agent.key === 'media-retrieval' &&
                agent.status === 'registered',
            ) && agentReadiness['media-retrieval']?.configured === true
          }
          onClose={onClose}
          onOpenResult={onOpenResult}
          invalidatedAssetId={invalidatedAssetId}
        />
      </View>
      {preview ? (
        <StationMediaPreviewScreen
          key={preview.asset.id}
          {...preview}
          token={token}
          palette={palette}
          language={language}
          onBack={() => setPreview(null)}
          onUnavailable={assetId => {
            setPreview(null);
            setInvalidatedAssetId(assetId);
          }}
        />
      ) : null}
    </View>
  );
}

const local = StyleSheet.create({
  screen: { flex: 1 },
  hidden: { display: 'none' },
});
