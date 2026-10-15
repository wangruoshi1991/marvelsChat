import React from 'react';
import { Text, View } from 'react-native';

import {
  AgentReadinessDTO,
  ProfileDTO,
  StationContentDTO,
  StationFileAssetDTO,
} from '../../models/api';
import { textFor } from '../../shared/i18n';
import { styles } from '../../shared/styles';
import { Palette } from '../../shared/theme';
import { Language } from '../session/useMiaoxunSession';
import { StationAlbumAgentPanel } from './StationAlbumAgentPanel';
import { StationFileAgentPanel } from './StationFileAgentPanel';
import { StationSiteBuilderPanel } from './StationSiteBuilderPanel';

export function StationCapabilityWorkspace({
  token,
  active,
  palette,
  language,
  profile,
  stationContent,
  agentReadiness,
  hasCapability,
  onCreateSiteDraft,
  onRefreshTaskArtifacts,
  onOpenAgentThread,
  onCreateFileAsset,
  onActionMessage,
  onActionError,
}: {
  token: string;
  active: boolean;
  palette: Palette;
  language: Language;
  profile: ProfileDTO;
  stationContent: StationContentDTO;
  agentReadiness: Record<string, AgentReadinessDTO>;
  hasCapability: (agentId: string) => boolean;
  onCreateSiteDraft: (payload: {
    prompt: string;
    idempotencyKey: string;
  }) => Promise<{ task: import('../../models/aiTask').AITaskDTO }>;
  onRefreshTaskArtifacts: () => Promise<unknown>;
  onOpenAgentThread: (agentId: string) => void;
  onCreateFileAsset: (payload: {
    originalFilename: string;
    mimeType?: string;
    content?: string;
    metadata?: Record<string, unknown>;
  }) => Promise<StationFileAssetDTO>;
  onActionMessage: (message: string) => void;
  onActionError: (error: unknown) => void;
}) {
  const activePanels = [
    hasCapability('site-builder') ? (
      <StationSiteBuilderPanel
        token={token}
        active={active}
        key="site-builder"
        palette={palette}
        language={language}
        profile={profile}
        readiness={agentReadiness['site-builder']}
        siteDrafts={stationContent.siteDrafts}
        onCreateDraft={onCreateSiteDraft}
        onRefreshTaskArtifacts={onRefreshTaskArtifacts}
        onActionMessage={onActionMessage}
        onActionError={onActionError}
      />
    ) : null,
    hasCapability('album-manager') ? (
      <StationAlbumAgentPanel
        key="album-manager"
        palette={palette}
        language={language}
        onOpenConversation={() => onOpenAgentThread('album-manager')}
      />
    ) : null,
    hasCapability('file-preprocessor') ? (
      <StationFileAgentPanel
        key="file-preprocessor"
        palette={palette}
        language={language}
        fileAssets={stationContent.fileAssets}
        onCreateFileAsset={onCreateFileAsset}
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
