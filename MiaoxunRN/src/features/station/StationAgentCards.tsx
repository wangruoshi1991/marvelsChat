import React from 'react';
import { Image, Pressable, Text, View } from 'react-native';
import { X } from 'lucide-react-native';

import { stationPartnerIconAssets } from '../../assets/icons';
import { AgentDTO, OwnedAgentDTO } from '../../models/api';
import { textFor } from '../../shared/i18n';
import { styles } from '../../shared/styles';
import { Palette } from '../../shared/theme';
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

export function AgentSection({
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
  const colors = resolveStationColors(palette);

  return (
    <View style={styles.stationAgentSection}>
      <View style={styles.stationSectionTitleRow}>
        <Text style={[styles.stationSectionTitle, { color: colors.text }]}>
          {title}
        </Text>
        <Text
          style={[
            styles.stationSectionPill,
            { backgroundColor: colors.soft, color: colors.secondaryText },
          ]}
        >
          {detail}
        </Text>
      </View>
      {agents.length ? (
        <View style={styles.stationOwnedAgentGrid}>
          {agents.map(agent => (
            <View
              key={agent.id}
              style={[
                styles.stationOwnedAgentManagedCard,
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
                style={styles.stationOwnedAgentOpenButton}
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
                <Text
                  style={[
                    styles.stationOwnedAgentStatus,
                    { backgroundColor: colors.soft, color: colors.accent },
                  ]}
                >
                  {textFor(language, '进入对话', 'Chat')}
                </Text>
              </Pressable>
              {agent.id === 'miaoxun-butler' ? null : (
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
                    styles.stationAgentRemoveButton,
                    updatingAgentId === agent.id &&
                      styles.stationAgentCardDisabled,
                  ]}
                >
                  <X color={colors.secondaryText} size={15} strokeWidth={2} />
                </Pressable>
              )}
            </View>
          ))}
        </View>
      ) : (
        <Text
          style={[styles.relationshipEmpty, { color: colors.secondaryText }]}
        >
          {empty}
        </Text>
      )}
    </View>
  );
}

export function AgentMark({
  palette,
  agent,
}: {
  palette: Palette;
  agent: Pick<AgentDTO, 'name' | 'identity'> & {
    id?: string;
    key?: string;
  };
}) {
  const icon = agentIconForKey(agent.id || agent.key || '');
  if (icon) {
    return (
      <Image
        resizeMode="cover"
        source={icon}
        style={styles.stationAgentImage}
      />
    );
  }
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

function agentIconForKey(key: string) {
  return key === 'miaoxun-butler'
    ? stationPartnerIconAssets.miaoxunButler
    : undefined;
}
