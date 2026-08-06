import React from 'react';

import {
  AgentDTO,
  Avatar3DBootstrapDTO,
  OwnedAgentDTO,
} from '../../models/api';
import { Palette } from '../../shared/theme';
import { Language, useMiaoxunSession } from '../session/useMiaoxunSession';
import { StationAgentsPanel } from './StationAgentsPanel';
import { StationHome } from './StationHome';
import { StationPostsPanel } from './StationPostsPanel';
import { StationSocialPanel } from './StationSocialPanel';
import { StationCreateKind, StationTab } from './stationTypes';
import { Avatar3DLoadState } from './useAvatar3d';

export function StationPanel({
  palette,
  language,
  selectedTab,
  token,
  profile,
  relationships,
  stationContent,
  avatar3d,
  avatar3dStatus,
  avatar3dError,
  agents,
  agentReadiness,
  ownedAgents,
  moduleStatus,
  onOpenFriendThread,
  onOpenAgentThread,
  onSetAgentEnabled,
  onOpenPublicProfileByAiId,
  onSelectStationTab,
  onOpenCreateSheet,
  onOpenDiaryDetail,
  onOpenAlbumDetail,
  onDeletePost,
  onCreateSiteDraft,
  onApplySiteDraft,
  onOpenAvatar3d,
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
  selectedTab: StationTab;
  token: string;
  profile: ReturnType<typeof useMiaoxunSession>['profile'];
  relationships: ReturnType<typeof useMiaoxunSession>['relationships'];
  stationContent: ReturnType<typeof useMiaoxunSession>['stationContent'];
  avatar3d: Avatar3DBootstrapDTO | null;
  avatar3dStatus: Avatar3DLoadState;
  avatar3dError: string;
  agents: AgentDTO[];
  agentReadiness: ReturnType<typeof useMiaoxunSession>['agentReadiness'];
  ownedAgents: OwnedAgentDTO[];
  moduleStatus: (key: string) => string;
  onOpenFriendThread: (friendUserId: string) => void;
  onOpenAgentThread: (agentId: string) => void;
  onSetAgentEnabled: (
    agentId: string,
    enabled: boolean,
  ) => Promise<OwnedAgentDTO>;
  onOpenPublicProfileByAiId: (aiId: string) => void;
  onSelectStationTab: (tab: StationTab) => void;
  onOpenCreateSheet: (kind: StationCreateKind) => void;
  onOpenDiaryDetail: (entryId: string) => void;
  onOpenAlbumDetail: (albumId: string) => void;
  onDeletePost: ReturnType<typeof useMiaoxunSession>['deleteStationPost'];
  onCreateSiteDraft: ReturnType<
    typeof useMiaoxunSession
  >['createStationSiteDraft'];
  onApplySiteDraft: ReturnType<
    typeof useMiaoxunSession
  >['applyStationSiteDraft'];
  onOpenAvatar3d: () => void;
  onLoadAlbumSuggestions: ReturnType<
    typeof useMiaoxunSession
  >['listStationAlbumSuggestions'];
  onApplyAlbumSuggestion: ReturnType<
    typeof useMiaoxunSession
  >['applyStationAlbumSuggestion'];
  onCreateFileAsset: ReturnType<
    typeof useMiaoxunSession
  >['createStationFileAsset'];
  onPreprocessFileAsset: ReturnType<
    typeof useMiaoxunSession
  >['preprocessStationFileAsset'];
  onCreateVideoDraft: ReturnType<
    typeof useMiaoxunSession
  >['createStationVideoDraft'];
  onActionMessage: (message: string) => void;
  onActionError: (error: unknown) => void;
}) {
  if (selectedTab === 'posts') {
    return (
      <StationPostsPanel
        palette={palette}
        language={language}
        stationContent={stationContent}
        ownedAgents={ownedAgents}
        token={token}
        onDeletePost={onDeletePost}
        onActionMessage={onActionMessage}
        onActionError={onActionError}
      />
    );
  }

  if (selectedTab === 'agents') {
    return (
      <StationAgentsPanel
        palette={palette}
        language={language}
        profile={profile}
        stationContent={stationContent}
        agents={agents}
        agentReadiness={agentReadiness}
        ownedAgents={ownedAgents}
        status={moduleStatus('agents')}
        onOpenAgentThread={onOpenAgentThread}
        onSetAgentEnabled={onSetAgentEnabled}
        onCreateSiteDraft={onCreateSiteDraft}
        onApplySiteDraft={onApplySiteDraft}
        onLoadAlbumSuggestions={onLoadAlbumSuggestions}
        onApplyAlbumSuggestion={onApplyAlbumSuggestion}
        onCreateFileAsset={onCreateFileAsset}
        onPreprocessFileAsset={onPreprocessFileAsset}
        onCreateVideoDraft={onCreateVideoDraft}
        onActionMessage={onActionMessage}
        onActionError={onActionError}
      />
    );
  }

  if (selectedTab === 'social') {
    return (
      <StationSocialPanel
        palette={palette}
        language={language}
        relationships={relationships}
        status={moduleStatus('social')}
        onOpenFriendThread={onOpenFriendThread}
        onOpenPublicProfileByAiId={onOpenPublicProfileByAiId}
      />
    );
  }

  return (
    <StationHome
      palette={palette}
      language={language}
      token={token}
      profile={profile}
      stationContent={stationContent}
      avatar3d={avatar3d}
      avatar3dStatus={avatar3dStatus}
      avatar3dError={avatar3dError}
      agents={agents}
      ownedAgents={ownedAgents}
      moduleStatus={moduleStatus}
      onOpenAvatar3d={onOpenAvatar3d}
      onSelectStationTab={onSelectStationTab}
      onOpenCreateSheet={onOpenCreateSheet}
      onOpenDiaryDetail={onOpenDiaryDetail}
      onOpenAlbumDetail={onOpenAlbumDetail}
      onOpenAgentThread={onOpenAgentThread}
      onActionMessage={onActionMessage}
    />
  );
}
