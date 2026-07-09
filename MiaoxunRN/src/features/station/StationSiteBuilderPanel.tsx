import React, { useMemo, useState } from 'react';
import { Alert, Pressable, Text, TextInput, View } from 'react-native';

import {
  AgentReadinessDTO,
  ProfileDTO,
  StationSiteDraftDTO,
} from '../../models/api';
import { textFor } from '../../shared/i18n';
import { styles } from '../../shared/styles';
import { Palette } from '../../shared/theme';
import { Language } from '../session/useMiaoxunSession';
import { StationModule } from './StationHomeModules';

const defaultPrompt = '帮我生成一个突出相册、漫画日记和视频草稿的小站主页';

export function StationSiteBuilderPanel({
  palette,
  language,
  profile,
  readiness,
  siteDrafts,
  onCreateDraft,
  onApplyDraft,
  onActionMessage,
  onActionError,
}: {
  palette: Palette;
  language: Language;
  profile: ProfileDTO;
  readiness?: AgentReadinessDTO;
  siteDrafts: StationSiteDraftDTO[];
  onCreateDraft: (payload: {
    prompt: string;
    apply?: boolean;
  }) => Promise<unknown>;
  onApplyDraft: (draftId: string) => Promise<unknown>;
  onActionMessage: (message: string) => void;
  onActionError: (error: unknown) => void;
}) {
  const [prompt, setPrompt] = useState(defaultPrompt);
  const [isCreating, setIsCreating] = useState(false);
  const [applyingDraftId, setApplyingDraftId] = useState<string | null>(null);
  const appliedDraftId = profile.stationConfig.siteDraftId;
  const activeLayout = profile.stationConfig.siteLayout;
  const sortedDrafts = useMemo(
    () =>
      [...siteDrafts].sort((left, right) =>
        String(right.createdAt || '').localeCompare(String(left.createdAt || '')),
      ),
    [siteDrafts],
  );
  const latestDrafts = sortedDrafts.slice(0, 3);
  const readinessText = readinessLabel(language, readiness);
  const canCreate = prompt.trim().length > 0 && !isCreating;

  const createDraft = async () => {
    if (!canCreate) {
      return;
    }
    setIsCreating(true);
    try {
      await onCreateDraft({ prompt: prompt.trim(), apply: false });
      onActionMessage(textFor(language, '小站草稿已生成', 'Station draft created'));
    } catch (error) {
      onActionError(error);
    } finally {
      setIsCreating(false);
    }
  };

  const applyDraft = async (draftId: string) => {
    if (applyingDraftId) {
      return;
    }
    const draft = latestDrafts.find(item => item.id === draftId);
    Alert.alert(
      textFor(language, '应用小站结构', 'Apply Station Layout'),
      draft?.draft.title
        ? textFor(
            language,
            `确认将「${draft.draft.title}」应用到小站首页吗？`,
            `Apply "${draft.draft.title}" to your station home?`,
          )
        : textFor(
            language,
            '确认将这份草稿应用到小站首页吗？',
            'Apply this draft to your station home?',
          ),
      [
        { text: textFor(language, '取消', 'Cancel'), style: 'cancel' },
        {
          text: textFor(language, '应用', 'Apply'),
          onPress: () => {
            setApplyingDraftId(draftId);
            onApplyDraft(draftId)
              .then(() =>
                onActionMessage(
                  textFor(language, '小站结构已应用', 'Station layout applied'),
                ),
              )
              .catch(onActionError)
              .finally(() => setApplyingDraftId(null));
          },
        },
      ],
    );
  };

  return (
    <StationModule
      palette={palette}
      title={textFor(language, '小站结构 / 建站 Agent', 'Station Builder Agent')}
      action={isCreating ? textFor(language, '生成中', 'Creating') : textFor(language, '生成', 'Create')}
      onAction={createDraft}
    >
      <View style={styles.stationAgentLoopStack}>
        <View
          style={[
            styles.stationAgentLoopStatus,
            { backgroundColor: palette.soft, borderColor: palette.border },
          ]}
        >
          <View style={styles.stationAgentLoopStatusCopy}>
            <Text style={[styles.stationAgentLoopEyebrow, { color: palette.secondaryText }]}>
              {textFor(language, '主页生成', 'Site Builder')}
            </Text>
            <Text style={[styles.stationAgentLoopTitle, { color: palette.text }]}>
              {readinessText}
            </Text>
          </View>
          <Text
            style={[
              styles.stationAgentLoopBadge,
              { backgroundColor: palette.surface, color: palette.text },
            ]}
          >
            {readiness?.configured
              ? textFor(language, '可生成', 'Ready')
              : textFor(language, '待配置', 'Pending')}
          </Text>
        </View>

        {activeLayout ? (
          <View
            style={[
              styles.stationAgentLoopActive,
              { borderColor: palette.border, backgroundColor: palette.surface },
            ]}
          >
            <Text style={[styles.stationAgentLoopEyebrow, { color: palette.secondaryText }]}>
              {textFor(language, '当前小站结构', 'Current Station Layout')}
            </Text>
            <Text style={[styles.stationAgentLoopTitle, { color: palette.text }]}>
              {activeLayout.title || textFor(language, '已应用结构', 'Applied Layout')}
            </Text>
            {activeLayout.summary ? (
              <Text style={[styles.stationAgentLoopBody, { color: palette.secondaryText }]}>
                {activeLayout.summary}
              </Text>
            ) : null}
            <SectionChips
              palette={palette}
              language={language}
              sections={activeLayout.sections || []}
            />
          </View>
        ) : null}

        <TextInput
          value={prompt}
          onChangeText={setPrompt}
          multiline
          maxLength={600}
          placeholder={textFor(language, '描述你想要的小站主页', 'Describe the station page you want')}
          placeholderTextColor={palette.secondaryText}
          style={[
            styles.settingsInput,
            styles.stationAgentLoopInput,
            {
              backgroundColor: palette.input,
              borderColor: palette.border,
              color: palette.text,
            },
          ]}
        />

        {latestDrafts.length ? (
          latestDrafts.map(draft => (
            <SiteDraftCard
              key={draft.id}
              draft={draft}
              palette={palette}
              language={language}
              isApplied={draft.id === appliedDraftId || draft.status === 'applied'}
              isApplying={applyingDraftId === draft.id}
              onApply={() => applyDraft(draft.id)}
            />
          ))
        ) : (
          <Text style={[styles.relationshipEmpty, { color: palette.secondaryText }]}>
            {textFor(
              language,
              '还没有小站结构草稿。生成后会显示标题、摘要和页面模块。',
              'No station draft yet. Created drafts will show title, summary, and page modules.',
            )}
          </Text>
        )}
      </View>
    </StationModule>
  );
}

function SiteDraftCard({
  draft,
  palette,
  language,
  isApplied,
  isApplying,
  onApply,
}: {
  draft: StationSiteDraftDTO;
  palette: Palette;
  language: Language;
  isApplied: boolean;
  isApplying: boolean;
  onApply: () => void;
}) {
  const sections = draft.draft.sections || [];
  return (
    <View
      style={[
        styles.stationAgentLoopCard,
        { borderColor: palette.border, backgroundColor: palette.surface },
      ]}
    >
      <View style={styles.stationAgentLoopCardHeader}>
        <View style={styles.stationAgentLoopStatusCopy}>
          <Text style={[styles.stationAgentLoopTitle, { color: palette.text }]}>
            {draft.draft.title || textFor(language, '小站草稿', 'Station Draft')}
          </Text>
          <Text style={[styles.stationAgentLoopMeta, { color: palette.secondaryText }]}>
            {formatDate(draft.createdAt, language)}
          </Text>
        </View>
        <Pressable
          accessibilityRole="button"
          disabled={isApplied || isApplying}
          onPress={onApply}
          style={[
            styles.stationAgentLoopButton,
            { backgroundColor: isApplied ? palette.soft : palette.text },
          ]}
        >
          <Text
            style={[
              styles.stationAgentLoopButtonText,
              { color: isApplied ? palette.secondaryText : palette.background },
            ]}
          >
            {isApplied
              ? textFor(language, '已应用', 'Applied')
              : isApplying
                ? textFor(language, '应用中', 'Applying')
                : textFor(language, '应用', 'Apply')}
          </Text>
        </Pressable>
      </View>
      <Text style={[styles.stationAgentLoopBody, { color: palette.secondaryText }]}>
        {draft.draft.summary || draft.prompt}
      </Text>
      <SectionChips palette={palette} language={language} sections={sections} />
    </View>
  );
}

function SectionChips({
  palette,
  language,
  sections,
}: {
  palette: Palette;
  language: Language;
  sections: NonNullable<StationSiteDraftDTO['draft']['sections']>;
}) {
  if (!sections.length) {
    return null;
  }
  return (
    <View style={styles.stationAgentLoopChipRow}>
      {sections.slice(0, 6).map((section, index) => (
        <Text
          key={`${section.type || 'section'}-${index}`}
          style={[
            styles.stationAgentLoopChip,
            { backgroundColor: palette.soft, color: palette.text },
          ]}
          numberOfLines={1}
        >
          {section.title || sectionLabel(language, section.type)}
        </Text>
      ))}
    </View>
  );
}

function readinessLabel(language: Language, readiness?: AgentReadinessDTO) {
  if (!readiness) {
    return textFor(language, '准备中', 'Preparing');
  }
  if (readiness.configured) {
    return textFor(language, '已接入，可生成结构草稿', 'Ready to create layout drafts');
  }
  return textFor(language, '基础入口可用，生成服务待配置', 'Entry ready; generation service pending');
}

function sectionLabel(language: Language, type?: string) {
  const labels: Record<string, { zh: string; en: string }> = {
    hero: { zh: '主页', en: 'Hero' },
    about: { zh: '关于我', en: 'About' },
    gallery: { zh: '相册', en: 'Gallery' },
    diary: { zh: '日记', en: 'Diary' },
    contact: { zh: '联系', en: 'Contact' },
  };
  const label = labels[type || ''];
  return label ? textFor(language, label.zh, label.en) : textFor(language, '模块', 'Section');
}

function formatDate(value: string | null | undefined, language: Language) {
  if (!value) {
    return textFor(language, '刚刚', 'Just now');
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return date.toLocaleString(language === 'zh' ? 'zh-CN' : 'en-US', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}
