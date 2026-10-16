import React, { useMemo } from 'react';
import { Pressable, Text, View } from 'react-native';

import { AgentDTO, OwnedAgentDTO } from '../../models/api';
import { textFor } from '../../shared/i18n';
import { styles } from '../../shared/styles';
import { Palette } from '../../shared/theme';
import { Language } from '../session/useMiaoxunSession';
import {
  AgentList,
  AgentMark,
  moduleBindingForAgent,
} from './StationAgentCards';
import { resolveStationColors } from './stationTheme';
import { useAgentAccessConfirmation } from '../agents/useAgentAccessConfirmation';
import { agentAccessMatchesDeclaration } from '../agents/agentAccess';
import type { AlbumAIConsentVersion } from './albumAssistantAuthorization';

export function StationAgentsPanel({
  token,
  active,
  palette,
  language,
  agents,
  ownedAgents,
  onOpenAgentThread,
  onSetAgentEnabled,
  onActionMessage,
  onActionError,
}: {
  token: string;
  active: boolean;
  palette: Palette;
  language: Language;
  agents: AgentDTO[];
  ownedAgents: OwnedAgentDTO[];
  onOpenAgentThread: (agentId: string) => void;
  onSetAgentEnabled: (
    agentId: string,
    enabled: boolean,
    grantedScopes?: string[],
    albumAIConsentVersion?: AlbumAIConsentVersion,
  ) => Promise<OwnedAgentDTO>;
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
  // A disabled Agent returns to 「推荐添加」, so the filter keys off the
  // *enabled* cards rather than every owned row.
  const recommendedAgents = useMemo(() => {
    const enabledIds = new Set(ownedCards.map(agent => agent.id));
    return agents.filter(
      agent => agent.key !== 'media-retrieval' && !enabledIds.has(agent.key),
    );
  }, [agents, ownedCards]);
  return (
    <View style={styles.stationPanelStack}>
      <AgentList
        palette={palette}
        language={language}
        agents={ownedCards}
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

      {/*
       * The prototype's `#me-agents-panel` shows only the owned grid, so the
       * 「能力工作区」 block is gone. This 「推荐添加」 row stays: it is the app's
       * only way to add an Agent, and the access-confirmation contract is
       * pinned to it by 18 tests.
       */}
      <View style={styles.stationRecommendAgents}>
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
                disabled={updatingAgentId === agent.key}
                onPress={() => confirmAccess(agent.key, 'add')}
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
                    numberOfLines={1}
                    style={[
                      styles.stationOwnedAgentName,
                      { color: colors.text },
                    ]}
                  >
                    {agent.name}
                  </Text>
                  <Text
                    numberOfLines={1}
                    style={[
                      styles.stationOwnedAgentDesc,
                      { color: colors.secondaryText },
                    ]}
                  >
                    {moduleBindingForAgent(agent.key, language)}
                  </Text>
                </View>
                <Text
                  style={[
                    styles.stationOwnedAgentStatus,
                    { backgroundColor: colors.accent, color: colors.surface },
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
