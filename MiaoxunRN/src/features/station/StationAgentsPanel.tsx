import React, { useMemo, useState } from 'react';
import { Pressable, Text, View } from 'react-native';

import {
  AgentDTO,
  AgentReadinessDTO,
  OwnedAgentDTO,
  ProfileDTO,
  StationContentDTO,
  StationFileAssetDTO,
  StationAlbumSuggestionDTO,
  StationVisibility,
  StationVideoDraftDTO,
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

export function StationAgentsPanel({
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
  agents: AgentDTO[];
  agentReadiness: Record<string, AgentReadinessDTO>;
  ownedAgents: OwnedAgentDTO[];
  status: string;
  onOpenAgentThread: (agentId: string) => void;
  onSetAgentEnabled: (
    agentId: string,
    enabled: boolean,
  ) => Promise<OwnedAgentDTO>;
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
  const [updatingAgentId, setUpdatingAgentId] = useState<string | null>(null);
  const colors = resolveStationColors(palette);
  const registeredByKey = useMemo(
    () => new Map(agents.map(agent => [agent.key, agent])),
    [agents],
  );
  const ownedCards = ownedAgents
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
  const recommendedAgents = agents.filter(agent => !ownedIds.has(agent.key));
  const availableCount = recommendedAgents.length;
  const connectionRate = agents.length
    ? Math.round((ownedCards.length / agents.length) * 100)
    : 0;
  const hasCapability = (agentId: string) => ownedIds.has(agentId);

  const updateAgent = (agentId: string, enabled: boolean) => {
    if (updatingAgentId) {
      return;
    }
    setUpdatingAgentId(agentId);
    onSetAgentEnabled(agentId, enabled)
      .then(() => {
        onActionMessage(
          enabled
            ? textFor(language, 'Agent 已添加', 'Agent added')
            : textFor(language, 'Agent 已移除', 'Agent removed'),
        );
      })
      .catch(error => {
        onActionMessage(
          error instanceof Error
            ? error.message
            : textFor(language, 'Agent 状态更新失败', 'Agent update failed'),
        );
      })
      .finally(() => setUpdatingAgentId(null));
  };

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
              `已接入 ${ownedCards.length} / ${agents.length}`,
              `${ownedCards.length} / ${agents.length} connected`,
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
        onRemoveAgent={agentId => updateAgent(agentId, false)}
      />

      <StationCapabilityWorkspace
        palette={palette}
        language={language}
        profile={profile}
        stationContent={stationContent}
        agentReadiness={agentReadiness}
        hasCapability={hasCapability}
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
                onPress={() => updateAgent(agent.key, true)}
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
