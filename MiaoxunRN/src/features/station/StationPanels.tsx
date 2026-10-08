import React, { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import {
  AgentDTO,
  Avatar3DBootstrapDTO,
  OwnedAgentDTO,
} from '../../models/api';
import { Palette } from '../../shared/theme';
import { Language, useMiaoxunSession } from '../session/useMiaoxunSession';
import { UserAvatarRenderer } from '../messages/messageTypes';
import { StationAgentsPanel } from './StationAgentsPanel';
import { StationHome } from './StationHome';
import { StationOutcomesPanel } from './StationOutcomesPanel';
import { StationPostsPanel } from './StationPostsPanel';
import { StationSocialPanel } from './StationSocialPanel';
import type {
  StationContentListKind,
  StationCreateKind,
  StationTab,
} from './stationTypes';
import { Avatar3DLoadState } from './useAvatar3d';

export function StationPanel({
  active,
  palette,
  language,
  selectedTab,
  token,
  profile,
  renderUserAvatar,
  relationships,
  stationContent,
  avatar3d,
  avatar3dStatus,
  avatar3dError,
  selectedAvatar3dModelId,
  agents,
  agentReadiness,
  ownedAgents,
  moduleStatus,
  onOpenFriendThread,
  onOpenAgentThread,
  onOpenPostComposer,
  onOpenContentList,
  onSetAgentEnabled,
  onOpenPublicProfileByAiId,
  onSelectStationTab,
  onOpenCreateSheet,
  onOpenDiaryDetail,
  onOpenAlbumDetail,
  onDeletePost,
  onSetStationPostInteraction,
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
  onOpenPoints,
  onOpenLocation,
}: {
  active: boolean;
  palette: Palette;
  language: Language;
  selectedTab: StationTab;
  token: string;
  profile: ReturnType<typeof useMiaoxunSession>['profile'];
  renderUserAvatar: UserAvatarRenderer;
  relationships: ReturnType<typeof useMiaoxunSession>['relationships'];
  stationContent: ReturnType<typeof useMiaoxunSession>['stationContent'];
  avatar3d: Avatar3DBootstrapDTO | null;
  avatar3dStatus: Avatar3DLoadState;
  avatar3dError: string;
  selectedAvatar3dModelId: string | null;
  agents: AgentDTO[];
  agentReadiness: ReturnType<typeof useMiaoxunSession>['agentReadiness'];
  ownedAgents: OwnedAgentDTO[];
  moduleStatus: (key: string) => string;
  onOpenFriendThread: (friendUserId: string) => void;
  onOpenAgentThread: (agentId: string) => void;
  onOpenPostComposer: () => void;
  onOpenContentList: (kind: StationContentListKind) => void;
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
  onSetStationPostInteraction: ReturnType<
    typeof useMiaoxunSession
  >['setStationPostInteraction'];
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
  onOpenPoints: () => void;
  onOpenLocation: () => void;
}) {
  const [homeVisited, setHomeVisited] = useState(selectedTab === 'station');
  const [postsVisited, setPostsVisited] = useState(selectedTab === 'posts');
  if (selectedTab === 'station' && !homeVisited) setHomeVisited(true);
  if (selectedTab === 'posts' && !postsVisited) setPostsVisited(true);
  const renderSelectedPanel = () => {
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

    if (selectedTab === 'outcomes') {
      return (
        <StationOutcomesPanel
          language={language}
          palette={palette}
          stationContent={stationContent}
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
          miaoPoints={profile.miaoPoints}
          onOpenPoints={onOpenPoints}
          onOpenLocation={onOpenLocation}
        />
      );
    }

    return null;
  };

  return (
    <>
      {homeVisited ? (
        <View
          testID="station-home-retained"
          style={selectedTab !== 'station' && panelStyles.hidden}
          pointerEvents={selectedTab === 'station' ? 'auto' : 'none'}
          accessibilityElementsHidden={selectedTab !== 'station'}
          importantForAccessibility={
            selectedTab === 'station' ? 'auto' : 'no-hide-descendants'
          }
        >
          <StationHome
            active={active && selectedTab === 'station'}
            palette={palette}
            language={language}
            token={token}
            profile={profile}
            stationContent={stationContent}
            avatar3d={avatar3d}
            avatar3dStatus={avatar3dStatus}
            avatar3dError={avatar3dError}
            selectedAvatar3dModelId={selectedAvatar3dModelId}
            agents={agents}
            ownedAgents={ownedAgents}
            onOpenAvatar3d={onOpenAvatar3d}
            onSelectStationTab={onSelectStationTab}
            onOpenCreateSheet={onOpenCreateSheet}
            onOpenDiaryDetail={onOpenDiaryDetail}
            onOpenAlbumDetail={onOpenAlbumDetail}
            onOpenAgentThread={onOpenAgentThread}
            onOpenContentList={onOpenContentList}
            onActionMessage={onActionMessage}
          />
        </View>
      ) : null}
      {postsVisited ? (
        <View
          testID="station-posts-retained"
          style={selectedTab !== 'posts' && panelStyles.hidden}
          pointerEvents={selectedTab === 'posts' ? 'auto' : 'none'}
          accessibilityElementsHidden={selectedTab !== 'posts'}
          importantForAccessibility={
            selectedTab === 'posts' ? 'auto' : 'no-hide-descendants'
          }
        >
          <StationPostsPanel
            palette={palette}
            language={language}
            stationContent={stationContent}
            profile={profile}
            renderUserAvatar={renderUserAvatar}
            ownedAgents={ownedAgents}
            token={token}
            onDeletePost={onDeletePost}
            onSetStationPostInteraction={onSetStationPostInteraction}
            onActionMessage={onActionMessage}
            onActionError={onActionError}
            onOpenPostComposer={onOpenPostComposer}
          />
        </View>
      ) : null}
      {renderSelectedPanel()}
    </>
  );
}

const panelStyles = StyleSheet.create({ hidden: { display: 'none' } });
