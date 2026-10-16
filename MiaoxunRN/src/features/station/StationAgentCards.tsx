import React from 'react';
import { Pressable, Text, View } from 'react-native';
import { X } from 'lucide-react-native';

import { AgentDTO, OwnedAgentDTO } from '../../models/api';
import { textFor } from '../../shared/i18n';
import { styles } from '../../shared/styles';
import { Palette } from '../../shared/theme';
import { AgentGlyphAvatar } from '../messages/AgentGlyphAvatar';
import { Language } from '../session/useMiaoxunSession';
import { resolveStationColors } from './stationTheme';

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
    zh: '3D形象准备建议（不发起生成）',
    en: '3D Avatar Guidance (No Generation)',
  },
  'site-builder': {
    zh: '个人主页 / 小站结构草稿',
    en: 'Profile Site / Station Drafts',
  },
  'album-manager': {
    zh: '个人相册 / 素材整理',
    en: 'Albums / Media Organization',
  },
  'media-retrieval': {
    zh: '相册管理对话 / 检索协作能力',
    en: 'Album conversation / Search capability',
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
    zh: '视频脚本 / 协作任务',
    en: 'Video Scripts / Collaborative Tasks',
  },
};

const assistantAgentIds = new Set(['miaoxun-butler', 'virtual-character']);
const assistantAgentCategories = new Set([
  'orchestrator',
  'character-management',
]);

export const isAssistantAgent = (agentId: string, category: string) =>
  assistantAgentIds.has(agentId) || assistantAgentCategories.has(category);

export const moduleBindingForAgent = (agentKey: string, language: Language) => {
  const binding = agentModuleBindings[agentKey];
  if (!binding) {
    return textFor(language, '暂未绑定业务模块', 'No module binding yet');
  }
  return textFor(language, binding.zh, binding.en);
};

type AgentCard = OwnedAgentDTO & {
  identity?: AgentDTO['identity'];
};

/**
 * Prototype `#me-agents-panel` holds one `me-agent-grid` and nothing else, so
 * this renders the cards directly — no section heading, no capability
 * workspace, no recommendation block.
 */
export function AgentList({
  palette,
  language,
  agents,
  updatingAgentId,
  onOpenAgentThread,
  onRemoveAgent,
  readdAgentIds,
}: {
  palette: Palette;
  language: Language;
  agents: AgentCard[];
  updatingAgentId: string | null;
  onOpenAgentThread: (agentId: string) => void;
  onRemoveAgent: (agentId: string) => void;
  readdAgentIds?: ReadonlySet<string>;
}) {
  const colors = resolveStationColors(palette);

  return (
    <View style={styles.stationAgentSection}>
      {agents.length ? (
        <View style={styles.stationAgentList}>
          {agents.map(agent => {
            // 「数量等级」「被添加星标」 have no backend columns yet; the grid is
            // rendered from whatever cells carry real data, so an empty cell is
            // never shown as if it held a value.
            const addedDate = agent.createdAt
              ? formatAddedDate(agent.createdAt)
              : '';
            return (
              <View
                key={agent.id}
                style={[
                  styles.stationAgentListCard,
                  {
                    backgroundColor: colors.surface,
                    borderColor: colors.border,
                  },
                ]}
              >
                <Pressable
                  accessibilityLabel={agent.name}
                  accessibilityRole="button"
                  onPress={() => onOpenAgentThread(agent.id)}
                  style={styles.stationAgentListHead}
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
                      {moduleBindingForAgent(agent.id, language)}
                    </Text>
                  </View>
                </Pressable>
                {readdAgentIds?.has(agent.id) ? (
                  <Text
                    style={[
                      styles.stationOwnedAgentDesc,
                      { color: colors.accent },
                    ]}
                  >
                    {textFor(
                      language,
                      '授权范围不同，请移除后重新添加。',
                      'Access scopes differ. Remove and add this agent again.',
                    )}
                  </Text>
                ) : null}
                {addedDate ? (
                  <View style={styles.stationAgentListMeta}>
                    <View style={styles.stationAgentListMetaCell}>
                      <Text
                        style={[
                          styles.stationAgentListMetaLabel,
                          { color: colors.secondaryText },
                        ]}
                      >
                        {textFor(language, '添加时间', 'Added')}
                      </Text>
                      <Text
                        style={[
                          styles.stationAgentListMetaValue,
                          { color: colors.text },
                        ]}
                      >
                        {addedDate}
                      </Text>
                    </View>
                  </View>
                ) : null}
                <View style={styles.stationAgentListFoot}>
                  <Pressable
                    accessibilityLabel={textFor(
                      language,
                      `与 ${agent.name} 对话`,
                      `Chat with ${agent.name}`,
                    )}
                    accessibilityRole="button"
                    onPress={() => onOpenAgentThread(agent.id)}
                  >
                    <Text
                      style={[
                        styles.stationOwnedAgentStatus,
                        { backgroundColor: colors.soft, color: colors.accent },
                      ]}
                    >
                      {textFor(language, '进入对话', 'Chat')}
                    </Text>
                  </Pressable>
                  <Pressable
                    accessibilityLabel={textFor(
                      language,
                      `移除 ${agent.name}`,
                      `Remove ${agent.name}`,
                    )}
                    accessibilityRole="button"
                    disabled={updatingAgentId === agent.id}
                    onPress={() => onRemoveAgent(agent.id)}
                    style={[
                      styles.stationAgentListRemove,
                      updatingAgentId === agent.id &&
                        styles.stationAgentCardDisabled,
                    ]}
                  >
                    <X color={colors.secondaryText} size={15} strokeWidth={2} />
                  </Pressable>
                </View>
              </View>
            );
          })}
        </View>
      ) : (
        <Text
          style={[styles.relationshipEmpty, { color: colors.secondaryText }]}
        >
          {textFor(language, '暂无已接入 Agent。', 'No connected agents yet.')}
        </Text>
      )}
    </View>
  );
}

export function AgentMark({
  agent,
}: {
  /** Retained so existing call sites keep compiling; the glyph no longer uses it. */
  palette?: Palette;
  agent: Pick<AgentDTO, 'name' | 'identity'> & {
    id?: string;
    key?: string;
    category?: string | null;
  };
}) {
  return (
    <AgentGlyphAvatar
      agentId={agent.id || agent.key || ''}
      category={agent.category}
      identity={agent.identity}
      size={42}
    />
  );
}

/** Prototype shows 添加时间 as 2026.05.12; the real column is user_agents.created_at. */
function formatAddedDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const month = `${date.getMonth() + 1}`.padStart(2, '0');
  const day = `${date.getDate()}`.padStart(2, '0');
  return `${date.getFullYear()}.${month}.${day}`;
}
