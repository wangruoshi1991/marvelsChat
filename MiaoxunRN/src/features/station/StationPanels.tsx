import React, { useState } from 'react';

import { AgentDTO, OwnedAgentDTO } from '../../models/api';
import { Palette } from '../../shared/theme';
import { Language, useMiaoxunSession } from '../session/useMiaoxunSession';
import { StationAgentsPanel } from './StationAgentsPanel';
import { StationHome } from './StationHome';
import { StationPostsPanel } from './StationPostsPanel';
import { StationSocialPanel } from './StationSocialPanel';
import { StationCreateKind, StationTab } from './stationTypes';

export function StationPanel({
  palette,
  language,
  selectedTab,
  token,
  profile,
  relationships,
  stationContent,
  agents,
  agentReadiness,
  ownedAgents,
  moduleStatus,
  homepageEnabled,
  homepageRefreshVersion,
  loadHomepageSite,
  onOpenFriendThread,
  onOpenAgentThread,
  onSetAgentEnabled,
  onOpenPublicProfileByAiId,
  onSelectStationTab,
  onOpenCreateSheet,
  onOpenDiaryDetail,
  onOpenAlbumDetail,
  onOpenSiteBuilder,
  onCreateModelJob,
  onSyncModelJob,
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
  agents: AgentDTO[];
  agentReadiness: ReturnType<typeof useMiaoxunSession>['agentReadiness'];
  ownedAgents: OwnedAgentDTO[];
  moduleStatus: (key: string) => string;
  homepageEnabled: boolean;
  homepageRefreshVersion: number;
  loadHomepageSite: ReturnType<typeof useMiaoxunSession>['homepageSite'];
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
  onOpenSiteBuilder: () => void;
  onCreateModelJob: ReturnType<typeof useMiaoxunSession>['createStationModelJob'];
  onSyncModelJob: ReturnType<typeof useMiaoxunSession>['syncStationModelJob'];
  onLoadAlbumSuggestions: ReturnType<typeof useMiaoxunSession>['listStationAlbumSuggestions'];
  onApplyAlbumSuggestion: ReturnType<typeof useMiaoxunSession>['applyStationAlbumSuggestion'];
  onCreateFileAsset: ReturnType<typeof useMiaoxunSession>['createStationFileAsset'];
  onPreprocessFileAsset: ReturnType<typeof useMiaoxunSession>['preprocessStationFileAsset'];
  onCreateVideoDraft: ReturnType<typeof useMiaoxunSession>['createStationVideoDraft'];
  onActionMessage: (message: string) => void;
  onActionError: (error: unknown) => void;
}) {
  const [stationAvatarRotation, setStationAvatarRotation] = useState(0);

  if (selectedTab === 'posts') {
    return (
      <StationPostsPanel
        palette={palette}
        language={language}
        stationContent={stationContent}
        token={token}
        onOpenCreateSheet={onOpenCreateSheet}
        onOpenDiaryDetail={onOpenDiaryDetail}
        onOpenAlbumDetail={onOpenAlbumDetail}
      />
    );
  }

  if (selectedTab === 'agents') {
    return (
      <StationAgentsPanel
        palette={palette}
        language={language}
        stationContent={stationContent}
        agents={agents}
        agentReadiness={agentReadiness}
        ownedAgents={ownedAgents}
        status={moduleStatus('agents')}
        onOpenAgentThread={onOpenAgentThread}
        onSetAgentEnabled={onSetAgentEnabled}
        homepageEnabled={homepageEnabled}
        onOpenSiteBuilder={onOpenSiteBuilder}
        onCreateModelJob={onCreateModelJob}
        onSyncModelJob={onSyncModelJob}
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
      agents={agents}
      ownedAgents={ownedAgents}
      moduleStatus={moduleStatus}
      homepageEnabled={homepageEnabled}
      homepageRefreshVersion={homepageRefreshVersion}
      loadHomepageSite={loadHomepageSite}
      avatarRotation={stationAvatarRotation}
      onAvatarRotate={setStationAvatarRotation}
      onSelectStationTab={onSelectStationTab}
      onOpenCreateSheet={onOpenCreateSheet}
      onOpenDiaryDetail={onOpenDiaryDetail}
      onOpenAlbumDetail={onOpenAlbumDetail}
      onOpenAgentThread={onOpenAgentThread}
      onOpenSiteBuilder={onOpenSiteBuilder}
      onActionMessage={onActionMessage}
    />
  );
}
