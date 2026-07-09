import React, { useMemo, useState } from 'react';
import { Pressable, Text, TextInput, View } from 'react-native';

import { AgentReadinessDTO, StationGenerationJobDTO } from '../../models/api';
import { textFor } from '../../shared/i18n';
import { styles } from '../../shared/styles';
import { Palette } from '../../shared/theme';
import { Language } from '../session/useMiaoxunSession';
import { StationModule } from './StationHomeModules';

const defaultPrompt = '一个适合妙讯个人小站展示的 3D 名片摆件';

export function StationModel3DPanel({
  palette,
  language,
  readiness,
  modelJobs,
  onCreateJob,
  onSyncJob,
  onActionMessage,
  onActionError,
}: {
  palette: Palette;
  language: Language;
  readiness?: AgentReadinessDTO;
  modelJobs: StationGenerationJobDTO[];
  onCreateJob: (payload: {
    inputType: 'text';
    prompt: string;
    provider: 'meshy';
  }) => Promise<unknown>;
  onSyncJob: (jobId: string) => Promise<unknown>;
  onActionMessage: (message: string) => void;
  onActionError: (error: unknown) => void;
}) {
  const [prompt, setPrompt] = useState(defaultPrompt);
  const [isCreating, setIsCreating] = useState(false);
  const [syncingJobId, setSyncingJobId] = useState<string | null>(null);
  const sortedJobs = useMemo(
    () =>
      [...modelJobs].sort((left, right) =>
        String(right.createdAt || '').localeCompare(String(left.createdAt || '')),
      ),
    [modelJobs],
  );
  const latestJobs = sortedJobs.slice(0, 3);
  const canCreate = prompt.trim().length > 0 && !isCreating;

  const createJob = async () => {
    if (!canCreate) {
      return;
    }
    setIsCreating(true);
    try {
      await onCreateJob({
        inputType: 'text',
        prompt: prompt.trim(),
        provider: 'meshy',
      });
      onActionMessage(textFor(language, '3D 生成需求已记录', '3D generation request saved'));
    } catch (error) {
      onActionError(error);
    } finally {
      setIsCreating(false);
    }
  };

  const syncJob = async (jobId: string) => {
    if (syncingJobId) {
      return;
    }
    setSyncingJobId(jobId);
    try {
      await onSyncJob(jobId);
      onActionMessage(textFor(language, '3D 模型任务已同步', '3D model job synced'));
    } catch (error) {
      onActionError(error);
    } finally {
      setSyncingJobId(null);
    }
  };

  return (
    <StationModule
      palette={palette}
      title={textFor(language, '我的模样 / 3D 模型 Agent', 'My Look / 3D Model Agent')}
      action={isCreating ? textFor(language, '生成中', 'Creating') : textFor(language, '生成', 'Create')}
      onAction={createJob}
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
              {textFor(language, '3D 模型生成', '3D Model Generation')}
            </Text>
            <Text style={[styles.stationAgentLoopTitle, { color: palette.text }]}>
              {readinessLabel(language, readiness)}
            </Text>
          </View>
          <Text
            style={[
              styles.stationAgentLoopBadge,
              { backgroundColor: palette.surface, color: palette.text },
            ]}
          >
            {readiness?.configured
              ? textFor(language, '可用', 'Ready')
              : textFor(language, '待配置', 'Pending')}
          </Text>
        </View>

        <TextInput
          value={prompt}
          onChangeText={setPrompt}
          multiline
          maxLength={600}
          placeholder={textFor(language, '描述要生成的 3D 模型', 'Describe the 3D model')}
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

        {latestJobs.length ? (
          latestJobs.map(job => (
            <ModelJobCard
              key={job.id}
              job={job}
              palette={palette}
              language={language}
              isSyncing={syncingJobId === job.id}
              onSync={() => syncJob(job.id)}
            />
          ))
        ) : (
          <Text style={[styles.relationshipEmpty, { color: palette.secondaryText }]}>
            {textFor(
              language,
              '还没有 3D 模型记录。生成后会显示处理状态和需求描述。',
              'No 3D model request yet. New requests will show status and prompt.',
            )}
          </Text>
        )}
      </View>
    </StationModule>
  );
}

function ModelJobCard({
  job,
  palette,
  language,
  isSyncing,
  onSync,
}: {
  job: StationGenerationJobDTO;
  palette: Palette;
  language: Language;
  isSyncing: boolean;
  onSync: () => void;
}) {
  const productStatus = jobStatusText(language, job);
  const canSync = !['blocked', 'failed', 'succeeded', 'cancelled'].includes(job.status);
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
            {productStatus}
          </Text>
          <Text style={[styles.stationAgentLoopMeta, { color: palette.secondaryText }]}>
            {formatDate(job.createdAt, language)}
          </Text>
        </View>
        <Pressable
          accessibilityRole="button"
          disabled={!canSync || isSyncing}
          onPress={onSync}
          style={[
            styles.stationAgentLoopButton,
            { backgroundColor: canSync ? palette.text : palette.soft },
          ]}
        >
          <Text
            style={[
              styles.stationAgentLoopButtonText,
              { color: canSync ? palette.background : palette.secondaryText },
            ]}
          >
            {isSyncing
              ? textFor(language, '刷新中', 'Refreshing')
              : textFor(language, '刷新', 'Refresh')}
          </Text>
        </Pressable>
      </View>
      <Text style={[styles.stationAgentLoopBody, { color: palette.secondaryText }]}>
        {job.prompt}
      </Text>
      <View style={styles.stationAgentLoopChipRow}>
        <Text
          style={[
            styles.stationAgentLoopChip,
            { backgroundColor: palette.soft, color: palette.text },
          ]}
        >
          {textFor(language, '文本生成', 'Text to 3D')}
        </Text>
        <Text
          style={[
            styles.stationAgentLoopChip,
            { backgroundColor: palette.soft, color: palette.text },
          ]}
        >
          {Math.max(0, Math.min(100, Number(job.progress || 0)))}%
        </Text>
      </View>
    </View>
  );
}

function readinessLabel(language: Language, readiness?: AgentReadinessDTO) {
  if (!readiness) {
    return textFor(language, '准备中', 'Preparing');
  }
  if (readiness.configured) {
    return textFor(language, '已接入，可提交 3D 生成任务', 'Ready to submit 3D jobs');
  }
  return textFor(language, '入口可用，生成服务待配置', 'Entry ready; generation service pending');
}

function jobStatusText(language: Language, job: StationGenerationJobDTO) {
  if (job.status === 'blocked') {
    return textFor(language, '生成服务待配置', 'Generation service pending');
  }
  if (job.status === 'provider_submitted' || job.status === 'processing') {
    return textFor(language, '生成中', 'Generating');
  }
  if (job.status === 'succeeded') {
    return textFor(language, '已生成', 'Generated');
  }
  if (job.status === 'failed') {
    return textFor(language, '生成失败，请稍后重试', 'Generation failed, try again later');
  }
  if (job.status === 'cancelled') {
    return textFor(language, '已取消', 'Cancelled');
  }
  return textFor(language, '等待处理', 'Queued');
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
