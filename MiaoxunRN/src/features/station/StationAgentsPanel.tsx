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
import { StationCapabilityWorkspace } from './StationCapabilityWorkspace';
import { StationMetricBox } from './StationMetricBox';

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
  onCreateModelJob: (payload: {
    inputType: 'text';
    prompt: string;
    provider: 'meshy';
  }) => Promise<unknown>;
  onSyncModelJob: (jobId: string) => Promise<unknown>;
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
  const displayedAssistants = ownedCards.filter(
    agent => isAssistantAgent(agent.id, agent.category),
  );
  const assistantKeys = new Set(displayedAssistants.map(agent => agent.id));
  const displayedCapabilities = ownedCards.filter(
    agent => !assistantKeys.has(agent.id),
  );
  const ownedIds = new Set(ownedCards.map(agent => agent.id));
  const recommendedAgents = agents.filter(agent => !ownedIds.has(agent.key));
  const availableCount = recommendedAgents.length;
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
      <View
        style={[
          styles.stationPartnerStatusCard,
          { backgroundColor: palette.surface, shadowColor: palette.shadow },
        ]}
      >
        <View style={styles.stationPartnerStatusHead}>
          <View style={styles.stationPartnerStatusCopy}>
            <Text
              style={[
                styles.stationPartnerEyebrow,
                { color: palette.secondaryText },
              ]}
            >
              {textFor(language, '运行状态', 'Status')}
            </Text>
            <Text style={[styles.stationPartnerTitle, { color: palette.text }]}>
              {textFor(
                language,
                `已添加 ${ownedCards.length} 个 Agent`,
                `${ownedCards.length} agents added`,
              )}
            </Text>
            <Text
              style={[
                styles.stationPartnerStatusNote,
                { color: palette.secondaryText },
              ]}
            >
              {textFor(
                language,
                `能力库 ${agents.length} 个，可添加 ${availableCount} 个`,
                `${agents.length} in library, ${availableCount} available`,
              )}
            </Text>
          </View>
          <Pressable
            accessibilityRole="button"
            onPress={() =>
              onActionMessage(
                textFor(
                  language,
                  '这里展示已经接入小站的能力，具体使用会在对应模块里完成。',
                  'This shows capabilities connected to your station. Use them from their modules.',
                ),
              )
            }
            style={[
              styles.stationPartnerAuthButton,
              { backgroundColor: palette.text },
            ]}
          >
            <Text
              style={[
                styles.stationPartnerAuthText,
                { color: palette.background },
              ]}
            >
              {status}
            </Text>
          </Pressable>
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

      <View
        style={[
          styles.stationAgentWorkbench,
          { backgroundColor: palette.surface, borderColor: palette.border },
        ]}
      >
        <View style={styles.stationSectionTitleRow}>
          <Text style={[styles.stationSectionTitle, { color: palette.text }]}>
            {textFor(language, 'Agent 与模块', 'Agents and Modules')}
          </Text>
          <Text
            style={[
              styles.stationSectionDetail,
              { color: palette.secondaryText },
            ]}
          >
            {textFor(language, '小站能力总览', 'Station capabilities')}
          </Text>
        </View>
        <View style={styles.stationCapabilityGrid}>
          {agents.map(agent => {
            const readiness = agentReadiness[agent.key];
            const binding = moduleBindingForAgent(agent.key, language);
            return (
              <View
                key={agent.key}
                style={[
                  styles.stationCapabilityCard,
                  {
                    backgroundColor: palette.soft,
                    borderColor: palette.border,
                  },
                ]}
              >
                <View style={styles.stationCapabilityHead}>
                  <Text
                    style={[
                      styles.stationCapabilityTitle,
                      { color: palette.text },
                    ]}
                    numberOfLines={1}
                  >
                    {agent.name}
                  </Text>
                  <Text
                    style={[
                      styles.stationCapabilityBadge,
                      {
                        backgroundColor: readiness?.configured
                          ? `${palette.mint}1f`
                          : `${palette.sun}30`,
                        color: readiness?.configured
                          ? palette.mint
                          : palette.text,
                      },
                    ]}
                  >
                    {readiness?.configured
                      ? textFor(language, '可用', 'Ready')
                      : textFor(language, '待完善', 'Pending')}
                  </Text>
                </View>
                <Text
                  style={[
                    styles.stationCapabilityMeta,
                    { color: palette.secondaryText },
                  ]}
                  numberOfLines={2}
                >
                  {binding}
                </Text>
                <Text
                  style={[
                    styles.stationCapabilityResult,
                    { color: palette.secondaryText },
                  ]}
                  numberOfLines={2}
                >
                  {readinessSummary(language, readiness)}
                </Text>
              </View>
            );
          })}
        </View>
      </View>

      <AgentSection
        palette={palette}
        language={language}
        title={textFor(language, '我的助理', 'My Assistants')}
        detail={textFor(
          language,
          `${displayedAssistants.length} 个`,
          `${displayedAssistants.length}`,
        )}
        agents={displayedAssistants}
        empty={textFor(language, '暂无助理 Agent。', 'No assistant agent yet.')}
        updatingAgentId={updatingAgentId}
        onOpenAgentThread={onOpenAgentThread}
        onRemoveAgent={agentId => updateAgent(agentId, false)}
      />

      <AgentSection
        palette={palette}
        language={language}
        title={textFor(language, '我的能力', 'My Capabilities')}
        detail={textFor(
          language,
          `${displayedCapabilities.length} 个`,
          `${displayedCapabilities.length}`,
        )}
        agents={displayedCapabilities}
        empty={textFor(
          language,
          '暂无能力 Agent。',
          'No capability agents yet.',
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

      <View style={styles.stationRecommendAgents}>
        <View style={styles.stationSectionTitleRow}>
          <Text style={[styles.stationSectionTitle, { color: palette.text }]}>
            {textFor(language, '推荐添加', 'Recommended')}
          </Text>
          <Text
            style={[
              styles.stationSectionDetail,
              { color: palette.secondaryText },
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
                    backgroundColor: palette.surface,
                    borderColor: palette.border,
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
                      { color: palette.text },
                    ]}
                    numberOfLines={1}
                  >
                    {agent.name}
                  </Text>
                  <Text
                    style={[
                      styles.stationOwnedAgentDesc,
                      { color: palette.secondaryText },
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
                      backgroundColor: palette.text,
                      color: palette.background,
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
            style={[styles.relationshipEmpty, { color: palette.secondaryText }]}
          >
            {textFor(language, '暂无可添加 Agent。', 'No more agents to add.')}
          </Text>
        )}
      </View>
    </View>
  );
}

const agentModuleBindings: Record<string, { zh: string; en: string }> = {
  'miaoxun-butler': {
    zh: '妙讯聊天 / 管家中枢',
    en: 'Messages / Butler Orchestrator',
  },
  'virtual-character': {
    zh: '我的小站 / 我的模样',
    en: 'Station / My Look',
  },
  'model-3d': {
    zh: '我的模样 / 3D 模型生成',
    en: 'My Look / 3D Model Generation',
  },
  'site-builder': {
    zh: '个人主页 / 小站结构草稿',
    en: 'Profile Site / Station Drafts',
  },
  'album-manager': {
    zh: '个人相册 / 素材整理',
    en: 'Albums / Media Organization',
  },
  'file-preprocessor': {
    zh: '文件素材 / 上传预处理',
    en: 'Files / Upload Preprocessing',
  },
  'comic-diary': {
    zh: '个人日记 / 漫画日记',
    en: 'Diary / Comic Diary',
  },
  'video-production': {
    zh: '我的动态 / 视频草稿',
    en: 'Posts / Video Drafts',
  },
};

const assistantAgentIds = new Set(['miaoxun-butler', 'virtual-character']);
const assistantAgentCategories = new Set(['orchestrator', 'character-management']);

const isAssistantAgent = (agentId: string, category: string) =>
  assistantAgentIds.has(agentId) || assistantAgentCategories.has(category);

const moduleBindingForAgent = (agentKey: string, language: Language) => {
  const binding = agentModuleBindings[agentKey];
  if (!binding) {
    return textFor(language, '暂未绑定业务模块', 'No module binding yet');
  }
  return textFor(language, binding.zh, binding.en);
};

const readinessSummary = (
  language: Language,
  readiness?: AgentReadinessDTO,
) => {
  if (!readiness) {
    return textFor(
      language,
      '能力准备中。',
      'Capability is preparing.',
    );
  }
  if (readiness.configured) {
    return readiness.capabilityNeeds.length
      ? textFor(
          language,
          '基础能力可用，部分生成能力稍后开放。',
          'Base capability is ready; some generation features will open later.',
        )
      : textFor(language, '基础能力可用。', 'Base capability ready.');
  }
  return textFor(
    language,
    '生成服务待配置。',
    'Generation service pending.',
  );
};

type AgentCard = OwnedAgentDTO & {
  identity?: AgentDTO['identity'];
};

function AgentSection({
  palette,
  language,
  title,
  detail,
  agents,
  empty,
  updatingAgentId,
  onOpenAgentThread,
  onRemoveAgent,
}: {
  palette: Palette;
  language: Language;
  title: string;
  detail: string;
  agents: AgentCard[];
  empty: string;
  updatingAgentId: string | null;
  onOpenAgentThread: (agentId: string) => void;
  onRemoveAgent: (agentId: string) => void;
}) {
  return (
    <View style={styles.stationAgentSection}>
      <View style={styles.stationSectionTitleRow}>
        <Text style={[styles.stationSectionTitle, { color: palette.text }]}>
          {title}
        </Text>
        <Text
          style={[
            styles.stationSectionPill,
            { backgroundColor: palette.soft, color: palette.secondaryText },
          ]}
        >
          {detail}
        </Text>
      </View>
      {agents.length ? (
        <View style={styles.stationOwnedAgentGrid}>
          {agents.map(agent => (
            <Pressable
              key={agent.id}
              accessibilityRole="button"
              onPress={() => onOpenAgentThread(agent.id)}
              style={[
                styles.stationOwnedAgentCard,
                {
                  backgroundColor: palette.surface,
                  borderColor: palette.border,
                },
              ]}
            >
              <AgentMark palette={palette} agent={agent} />
              <View style={styles.stationOwnedAgentCopy}>
                <Text
                  style={[
                    styles.stationOwnedAgentName,
                    { color: palette.text },
                  ]}
                  numberOfLines={1}
                >
                  {agent.name}
                </Text>
                <Text
                  style={[
                    styles.stationOwnedAgentDesc,
                    { color: palette.secondaryText },
                  ]}
                  numberOfLines={1}
                >
                  {moduleBindingForAgent(agent.id, language)}
                </Text>
              </View>
              <Text
                style={[
                  styles.stationOwnedAgentStatus,
                  { backgroundColor: `${palette.mint}1f`, color: palette.mint },
                ]}
              >
                {textFor(language, '进入对话', 'Chat')}
              </Text>
              {agent.id === 'miaoxun-butler' ? null : (
                <Pressable
                  accessibilityRole="button"
                  disabled={updatingAgentId === agent.id}
                  onPress={() => onRemoveAgent(agent.id)}
                  style={[
                    styles.stationOwnedAgentStatus,
                    {
                      backgroundColor: palette.soft,
                    },
                    updatingAgentId === agent.id &&
                      styles.stationAgentCardDisabled,
                  ]}
                >
                  <Text style={{ color: palette.secondaryText }}>
                    {updatingAgentId === agent.id
                      ? textFor(language, '处理中', 'Updating')
                      : textFor(language, '移除', 'Remove')}
                  </Text>
                </Pressable>
              )}
            </Pressable>
          ))}
        </View>
      ) : (
        <Text
          style={[styles.relationshipEmpty, { color: palette.secondaryText }]}
        >
          {empty}
        </Text>
      )}
    </View>
  );
}

function AgentMark({
  palette,
  agent,
}: {
  palette: Palette;
  agent: Pick<AgentDTO, 'name' | 'identity'>;
}) {
  return (
    <View
      style={[
        styles.stationAgentMark,
        {
          backgroundColor: agent.identity?.colors.background || palette.rose,
        },
      ]}
    >
      <Text
        style={[
          styles.stationAgentMarkText,
          {
            color: agent.identity?.colors.foreground || palette.background,
          },
        ]}
      >
        {agent.identity?.mark || agent.name.slice(0, 1)}
      </Text>
    </View>
  );
}
