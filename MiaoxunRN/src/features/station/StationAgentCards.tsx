import React from 'react';
import { Pressable, Text, View } from 'react-native';
import { ArrowUpRight, X } from 'lucide-react-native';

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

/** V15 profile cards use a title/date row and one full-width destination. */
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
            // V15's levels, collaboration counts, matches and stars have no
            // API fields. Show the real description instead of demo metrics.
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
                <View style={styles.stationAgentListHead}>
                  <Pressable
                    accessibilityLabel={agent.name}
                    accessibilityRole="button"
                    onPress={() => onOpenAgentThread(agent.id)}
                    style={styles.stationAgentListOpen}
                  >
                    <AgentMark palette={palette} agent={agent} />
                    <View style={styles.stationOwnedAgentCopy}>
                      <Text
                        style={[
                          styles.stationOwnedAgentName,
                          { color: colors.text },
                        ]}
                      >
                        {agent.name}
                      </Text>
                      {addedDate ? (
                        <Text
                          style={[
                            styles.stationAgentAddedDate,
                            { color: colors.secondaryText },
                          ]}
                        >
                          {textFor(
                            language,
                            `添加于 ${addedDate}`,
                            `Added ${addedDate}`,
                          )}
                        </Text>
                      ) : null}
                    </View>
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
                    <X
                      color={colors.secondaryText}
                      size={18}
                      strokeWidth={1.9}
                    />
                  </Pressable>
                </View>
                <Text
                  style={[
                    styles.stationAgentListDescription,
                    { color: colors.secondaryText },
                  ]}
                >
                  {agent.description ||
                    moduleBindingForAgent(agent.id, language)}
                </Text>
                {readdAgentIds?.has(agent.id) ? (
                  <Text
                    style={[
                      styles.stationAgentAccessNotice,
                      {
                        backgroundColor: colors.soft,
                        color: colors.accent,
                      },
                    ]}
                  >
                    {textFor(
                      language,
                      '授权范围不同，请移除后重新添加。',
                      'Access scopes differ. Remove and add this agent again.',
                    )}
                  </Text>
                ) : null}
                <Pressable
                  accessibilityLabel={textFor(
                    language,
                    `与 ${agent.name} 对话`,
                    `Chat with ${agent.name}`,
                  )}
                  accessibilityRole="button"
                  onPress={() => onOpenAgentThread(agent.id)}
                  style={[
                    styles.stationAgentListDestination,
                    colors.isV6
                      ? styles.stationAgentDarkDestination
                      : {
                          backgroundColor: colors.soft,
                          borderColor: colors.border,
                        },
                  ]}
                >
                  <Text
                    style={[
                      styles.stationAgentListDestinationText,
                      { color: colors.text },
                    ]}
                  >
                    {textFor(language, '进入对话', 'Open conversation')}
                  </Text>
                  <ArrowUpRight
                    color={colors.text}
                    size={16}
                    strokeWidth={1.9}
                  />
                </Pressable>
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
      size={48}
    />
  );
}

/** The date comes from user_agents.created_at, never the prototype's demo date. */
function formatAddedDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const month = `${date.getMonth() + 1}`.padStart(2, '0');
  const day = `${date.getDate()}`.padStart(2, '0');
  return `${date.getFullYear()}.${month}.${day}`;
}
