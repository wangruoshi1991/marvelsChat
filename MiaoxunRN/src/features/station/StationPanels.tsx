import React, { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { AgentDTO, OwnedAgentDTO } from '../../models/api';
import { Palette } from '../../shared/theme';
import { Language, useMiaoxunSession } from '../session/useMiaoxunSession';
import { UserAvatarRenderer } from '../messages/messageTypes';
import { StationAgentsPanel } from './StationAgentsPanel';
import { StationPostsPanel } from './StationPostsPanel';
import type { StationTab } from './stationTypes';
import type { AlbumAIConsentVersion } from './albumAssistantAuthorization';

export function StationPanel({
  active,
  palette,
  language,
  selectedTab,
  token,
  profile,
  renderUserAvatar,
  stationContent,
  agents,
  ownedAgents,
  products,
  entitlements,
  catalogRevision,
  onOpenAgentThread,
  onSetAgentEnabled,
  onOpenDiaryDetail,
  onDeletePost,
  onSetStationPostInteraction,
  onActionMessage,
  onActionError,
}: {
  active: boolean;
  palette: Palette;
  language: Language;
  selectedTab: StationTab;
  token: string;
  profile: ReturnType<typeof useMiaoxunSession>['profile'];
  renderUserAvatar: UserAvatarRenderer;
  stationContent: ReturnType<typeof useMiaoxunSession>['stationContent'];
  agents: AgentDTO[];
  ownedAgents: OwnedAgentDTO[];
  products: ReturnType<typeof useMiaoxunSession>['products'];
  entitlements: ReturnType<typeof useMiaoxunSession>['entitlements'];
  catalogRevision: ReturnType<typeof useMiaoxunSession>['catalogRevision'];
  onOpenAgentThread: (agentId: string) => void;
  onSetAgentEnabled: (
    agentId: string,
    enabled: boolean,
    grantedScopes?: string[],
    albumAIConsentVersion?: AlbumAIConsentVersion,
  ) => Promise<OwnedAgentDTO>;
  onOpenDiaryDetail: (entryId: string) => void;
  onDeletePost: ReturnType<typeof useMiaoxunSession>['deleteStationPost'];
  onSetStationPostInteraction: ReturnType<
    typeof useMiaoxunSession
  >['setStationPostInteraction'];
  onActionMessage: (message: string) => void;
  onActionError: (error: unknown) => void;
}) {
  // Posts stay mounted after the first visit so the timeline keeps its
  // scroll state; Agent management is rebuilt from session state each time.
  const [postsVisited, setPostsVisited] = useState(selectedTab === 'posts');
  if (selectedTab === 'posts' && !postsVisited) setPostsVisited(true);

  return (
    <>
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
            agents={agents}
            ownedAgents={ownedAgents}
            token={token}
            onDeletePost={onDeletePost}
            onSetStationPostInteraction={onSetStationPostInteraction}
            onActionMessage={onActionMessage}
            onActionError={onActionError}
            onOpenDiaryDetail={onOpenDiaryDetail}
          />
        </View>
      ) : null}
      {selectedTab === 'agents' ? (
        <StationAgentsPanel
          token={token}
          active={active}
          palette={palette}
          language={language}
          agents={agents}
          ownedAgents={ownedAgents}
          products={products}
          entitlements={entitlements}
          catalogRevision={catalogRevision}
          onOpenAgentThread={onOpenAgentThread}
          onSetAgentEnabled={onSetAgentEnabled}
          onActionMessage={onActionMessage}
          onActionError={onActionError}
        />
      ) : null}
    </>
  );
}

const panelStyles = StyleSheet.create({ hidden: { display: 'none' } });
