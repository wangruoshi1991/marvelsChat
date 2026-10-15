import React, { useMemo } from 'react';
import { Pressable, Text, View } from 'react-native';

import {
  AgentDTO,
  AgentReadinessDTO,
  OwnedAgentDTO,
  ProfileDTO,
  StationContentDTO,
  StationFileAssetDTO,
} from '../../models/api';
import { textFor } from '../../shared/i18n';
import { styles } from '../../shared/styles';
import { Palette } from '../../shared/theme';
import { Language } from '../session/useMiaoxunSession';
import {
  AgentMark,
  AgentSection,
  isAssistantAgent,
  moduleBindingForAgent,
} from './StationAgentCards';
import { StationCapabilityWorkspace } from './StationCapabilityWorkspace';
import { StationMetricBox } from './StationMetricBox';
import { StationPageHeading } from './StationPageHeading';
import { resolveStationColors } from './stationTheme';
import { useAgentAccessConfirmation } from '../agents/useAgentAccessConfirmation';
import { agentAccessMatchesDeclaration } from '../agents/agentAccess';
import type { AlbumAIConsentVersion } from './albumAssistantAuthorization';

export function StationAgentsPanel({
  token,
  active,
  palette,
  language,
  profile,
  stationContent,
  agents,
  agentReadiness,
  ownedAgents,
  status,
  onOpenAgentThread,
  onSetAgentEnabled,
  onCreateSiteDraft,
  onRefreshTaskArtifacts,
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
  agents: AgentDTO[];
  agentReadiness: Record<string, AgentReadinessDTO>;
  ownedAgents: OwnedAgentDTO[];
  status: string;
  onOpenAgentThread: (agentId: string) => void;
  onSetAgentEnabled: (
    agentId: string,
    enabled: boolean,
    grantedScopes?: string[],
    albumAIConsentVersion?: AlbumAIConsentVersion,
  ) => Promise<OwnedAgentDTO>;
  onCreateSiteDraft: (payload: {
    prompt: string;
    idempotencyKey: string;
  }) => Promise<{ task: import('../../models/aiTask').AITaskDTO }>;
  onRefreshTaskArtifacts: () => Promise<unknown>;
  onCreateFileAsset: (payload: {
    originalFilename: string;
    mimeType?: string;
    content?: string;
    metadata?: Record<string, unknown>;
  }) => Promise<StationFileAssetDTO>;
  onActionMessage: (message: string) => void;
  onActionError: (error: unknown) => void;
}) {
  const { confirmAccess, updatingAgents } = useAgentAccessConfirmation({
    accessToken: token,
    active,
    language,
    agents,
    ownedAgents,
    onSetAgentEnabled,
    onChanged: action =>
      onActionMessage(
        textFor(
          language,
          action === 'add' ? 'Agent 已添加' : 'Agent 已移除',
          action === 'add' ? 'Agent added' : 'Agent removed',
        ),
      ),
    onError: onActionError,
  });
  const updatingAgentId = [...updatingAgents][0] || null;
  const colors = resolveStationColors(palette);
  const registeredByKey = useMemo(
    () => new Map(agents.map(agent => [agent.key, agent])),
    [agents],
  );
  const ownedCards = ownedAgents
    .filter(agent => agent.id !== 'media-retrieval')
    .filter(agent => agent.enabled)
    .map(agent => ({
      ...agent,
      identity: registeredByKey.get(agent.id)?.identity || null,
    }));
  const displayedAssistants = ownedCards.filter(agent =>
    isAssistantAgent(agent.id, agent.category),
  );
  const assistantKeys = new Set(displayedAssistants.map(agent => agent.id));
  const displayedCapabilities = ownedCards.filter(
    agent => !assistantKeys.has(agent.id),
  );
  const ownedIds = new Set(ownedCards.map(agent => agent.id));
  const recommendedAgents = agents.filter(
    agent => agent.key !== 'media-retrieval' && !ownedIds.has(agent.key),
  );
  const availableCount = recommendedAgents.length;
  const visibleAgentCount = agents.filter(
    agent => agent.key !== 'media-retrieval',
  ).length;
  const connectionRate = visibleAgentCount
    ? Math.round((ownedCards.length / visibleAgentCount) * 100)
    : 0;
  const hasCapability = (agentId: string) => ownedIds.has(agentId);

  return (
    <View style={styles.stationPanelStack}>
      <StationPageHeading
        detail={textFor(language, '能力与协作', 'Capabilities')}
        palette={palette}
        title={textFor(language, '我的生态', 'My Ecosystem')}
        watermark="ECOSYSTEM"
      />
      <View
        style={[
          styles.stationEcosystemHero,
          !colors.isLight && { backgroundColor: colors.soft },
        ]}
      >
        <View style={styles.stationEcosystemScoreBlock}>
          <Text
            style={[
              styles.stationEcosystemEyebrow,
              { color: colors.secondaryText },
            ]}
          >
            {textFor(language, '能力接入率', 'Capability coverage')}
          </Text>
          <Text style={[styles.stationEcosystemScore, { color: colors.text }]}>
            {connectionRate}%
          </Text>
          <Text
            style={[
              styles.stationEcosystemScoreLabel,
              { color: colors.accent },
            ]}
          >
            {status}
          </Text>
        </View>
        <View style={styles.stationEcosystemProgressBlock}>
          <Text
            style={[
              styles.stationEcosystemProgressTitle,
              { color: colors.text },
            ]}
          >
            {textFor(
              language,
              `已接入 ${ownedCards.length} / ${visibleAgentCount}`,
              `${ownedCards.length} / ${visibleAgentCount} connected`,
            )}
          </Text>
          <View style={styles.stationEcosystemProgressTrack}>
            <View
              style={[
                styles.stationEcosystemProgressFill,
                { width: `${connectionRate}%` },
              ]}
            />
          </View>
          <Text
            style={[
              styles.stationEcosystemProgressMeta,
              { color: colors.secondaryText },
            ]}
          >
            {textFor(
              language,
              `仍可添加 ${availableCount} 个 Agent`,
              `${availableCount} agents available`,
            )}
          </Text>
        </View>
        <View style={styles.stationPartnerMetrics}>
          <StationMetricBox
            palette={palette}
            value={displayedAssistants.length}
            label={textFor(language, '我的助理', 'Assistants')}
          />
          <StationMetricBox
            palette={palette}
            value={displayedCapabilities.length}
            label={textFor(language, '我的能力', 'Capabilities')}
          />
          <StationMetricBox
            palette={palette}
            value={availableCount}
            label={textFor(language, '可添加', 'Available')}
          />
        </View>
      </View>

      <AgentSection
        palette={palette}
        language={language}
        title={textFor(language, 'AI Agent能力', 'AI Agent capabilities')}
        detail={textFor(
          language,
          `${ownedCards.length} 个已接入`,
          `${ownedCards.length} connected`,
        )}
        agents={ownedCards}
        empty={textFor(
          language,
          '暂无已接入 Agent。',
          'No connected agents yet.',
        )}
        updatingAgentId={updatingAgentId}
        onOpenAgentThread={onOpenAgentThread}
        onRemoveAgent={agentId => confirmAccess(agentId, 'remove')}
        readdAgentIds={
          new Set(
            ownedCards
              .filter(owned => {
                const agent = registeredByKey.get(owned.id);
                return agent && !agentAccessMatchesDeclaration(agent, owned);
              })
              .map(agent => agent.id),
          )
        }
      />

      <StationCapabilityWorkspace
        token={token}
        active={active}
        palette={palette}
        language={language}
        profile={profile}
        stationContent={stationContent}
        agentReadiness={agentReadiness}
        hasCapability={hasCapability}
        onCreateSiteDraft={onCreateSiteDraft}
        onRefreshTaskArtifacts={onRefreshTaskArtifacts}
        onOpenAgentThread={onOpenAgentThread}
        onCreateFileAsset={onCreateFileAsset}
        onActionMessage={onActionMessage}
        onActionError={onActionError}
      />

      <View style={styles.stationRecommendAgents}>
        <View style={styles.stationSectionTitleRow}>
          <Text style={[styles.stationSectionTitle, { color: colors.text }]}>
            {textFor(language, '推荐添加', 'Recommended')}
          </Text>
          <Text
            style={[
              styles.stationSectionDetail,
              { color: colors.secondaryText },
            ]}
          >
            {textFor(language, '为你的小站补充新能力', 'Add new capabilities')}
          </Text>
        </View>
        {recommendedAgents.length ? (
          <View style={styles.stationOwnedAgentGrid}>
            {recommendedAgents.map(agent => (
              <Pressable
                key={agent.key}
                accessibilityRole="button"
                accessibilityLabel={textFor(
                  language,
                  `添加${agent.name}`,
                  `Add ${agent.name}`,
                )}
                onPress={() => confirmAccess(agent.key, 'add')}
                disabled={updatingAgentId === agent.key}
                style={[
                  styles.stationOwnedAgentCard,
                  {
                    backgroundColor: colors.surface,
                    borderColor: colors.border,
                  },
                  updatingAgentId === agent.key &&
                    styles.stationAgentCardDisabled,
                ]}
              >
                <AgentMark palette={palette} agent={agent} />
                <View style={styles.stationOwnedAgentCopy}>
                  <Text
                    style={[
                      styles.stationOwnedAgentName,
                      { color: colors.text },
                    ]}
                    numberOfLines={1}
                  >
                    {agent.name}
                  </Text>
                  <Text
                    style={[
                      styles.stationOwnedAgentDesc,
                      { color: colors.secondaryText },
                    ]}
                    numberOfLines={1}
                  >
                    {moduleBindingForAgent(agent.key, language)}
                  </Text>
                </View>
                <Text
                  style={[
                    styles.stationOwnedAgentStatus,
                    {
                      backgroundColor: colors.accent,
                      color: colors.surface,
                    },
                  ]}
                >
                  {updatingAgentId === agent.key
                    ? textFor(language, '添加中', 'Adding')
                    : textFor(language, '添加', 'Add')}
                </Text>
              </Pressable>
            ))}
          </View>
        ) : (
          <Text
            style={[styles.relationshipEmpty, { color: colors.secondaryText }]}
          >
            {textFor(language, '暂无可添加 Agent。', 'No more agents to add.')}
          </Text>
        )}
      </View>
    </View>
  );
}
