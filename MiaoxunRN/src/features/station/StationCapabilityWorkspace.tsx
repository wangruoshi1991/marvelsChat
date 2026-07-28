import React from 'react';
import { Text, View } from 'react-native';

import {
  AgentReadinessDTO,
  ProfileDTO,
  StationAlbumSuggestionDTO,
  StationContentDTO,
  StationFileAssetDTO,
  StationVideoDraftDTO,
  StationVisibility,
} from '../../models/api';
import { textFor } from '../../shared/i18n';
import { styles } from '../../shared/styles';
import { Palette } from '../../shared/theme';
import { Language } from '../session/useMiaoxunSession';
import { StationAlbumAgentPanel } from './StationAlbumAgentPanel';
import { StationFileAgentPanel } from './StationFileAgentPanel';
import { StationSiteBuilderPanel } from './StationSiteBuilderPanel';
import { StationVideoAgentPanel } from './StationVideoAgentPanel';

export function StationCapabilityWorkspace({
  palette,
  language,
  profile,
  stationContent,
  agentReadiness,
  hasCapability,
  onCreateSiteDraft,
  onApplySiteDraft,
  onLoadAlbumSuggestions,
  onApplyAlbumSuggestion,
  onCreateFileAsset,
  onPreprocessFileAsset,
  onCreateVideoDraft,
  onActionMessage,
  onActionError,
}: {
  palette: Palette;
  language: Language;
  profile: ProfileDTO;
  stationContent: StationContentDTO;
  agentReadiness: Record<string, AgentReadinessDTO>;
  hasCapability: (agentId: string) => boolean;
  onCreateSiteDraft: (payload: {
    prompt: string;
    apply?: boolean;
  }) => Promise<unknown>;
  onApplySiteDraft: (draftId: string) => Promise<unknown>;
  onLoadAlbumSuggestions: () => Promise<StationAlbumSuggestionDTO[]>;
  onApplyAlbumSuggestion: (payload: {
    title: string;
    description?: string;
    visibility?: StationVisibility;
    mediaAssetIds: string[];
  }) => Promise<unknown>;
  onCreateFileAsset: (payload: {
    originalFilename: string;
    mimeType?: string;
    content?: string;
    metadata?: Record<string, unknown>;
  }) => Promise<StationFileAssetDTO>;
  onPreprocessFileAsset: (
    fileAssetId: string,
    payload: {
      originalFilename?: string;
      mimeType?: string;
      content?: string;
      metadata?: Record<string, unknown>;
    },
  ) => Promise<StationFileAssetDTO>;
  onCreateVideoDraft: (payload: {
    prompt: string;
    diaryEntryId?: string | null;
    comicDiaryId?: string | null;
    mediaAssetIds?: string[];
    fileAssetIds?: string[];
    format?: 'short-clip';
    aspectRatio?: '9:16';
    durationSeconds?: number;
  }) => Promise<StationVideoDraftDTO>;
  onActionMessage: (message: string) => void;
  onActionError: (error: unknown) => void;
}) {
  const activePanels = [
    hasCapability('site-builder') ? (
      <StationSiteBuilderPanel
        key="site-builder"
        palette={palette}
        language={language}
        profile={profile}
        readiness={agentReadiness['site-builder']}
        siteDrafts={stationContent.siteDrafts || []}
        onCreateDraft={onCreateSiteDraft}
        onApplyDraft={onApplySiteDraft}
        onActionMessage={onActionMessage}
        onActionError={onActionError}
      />
    ) : null,
    hasCapability('album-manager') ? (
      <StationAlbumAgentPanel
        key="album-manager"
        palette={palette}
        language={language}
        readiness={agentReadiness['album-manager']}
        onLoadSuggestions={onLoadAlbumSuggestions}
        onApplySuggestion={onApplyAlbumSuggestion}
        onActionMessage={onActionMessage}
        onActionError={onActionError}
      />
    ) : null,
    hasCapability('file-preprocessor') ? (
      <StationFileAgentPanel
        key="file-preprocessor"
        palette={palette}
        language={language}
        readiness={agentReadiness['file-preprocessor']}
        fileAssets={stationContent.fileAssets || []}
        onCreateFileAsset={onCreateFileAsset}
        onPreprocessFileAsset={onPreprocessFileAsset}
        onActionMessage={onActionMessage}
        onActionError={onActionError}
      />
    ) : null,
    hasCapability('video-production') ? (
      <StationVideoAgentPanel
        key="video-production"
        palette={palette}
        language={language}
        readiness={agentReadiness['video-production']}
        stationContent={stationContent}
        onCreateVideoDraft={onCreateVideoDraft}
        onActionMessage={onActionMessage}
        onActionError={onActionError}
      />
    ) : null,
  ].filter(Boolean);

  if (!activePanels.length) {
    return null;
  }

  return (
    <View style={styles.stationAgentSection}>
      <View style={styles.stationSectionTitleRow}>
        <Text style={[styles.stationSectionTitle, { color: palette.text }]}>
          {textFor(language, '能力工作区', 'Capability Workspace')}
        </Text>
        <Text
          style={[
            styles.stationSectionPill,
            { backgroundColor: palette.soft, color: palette.secondaryText },
          ]}
        >
          {textFor(
            language,
            `${activePanels.length} 项`,
            `${activePanels.length}`,
          )}
        </Text>
      </View>
      {activePanels}
    </View>
  );
}
