import React, { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import {
  AIArtifact,
  AIContextReference,
  AITaskDTO,
  AITaskOperation,
} from '../../models/aiTask';
import { Palette } from '../../shared/theme';
import { textFor } from '../../shared/i18n';
import {
  WorkspaceButton,
  WorkspacePanel,
  WorkspaceState,
  workspaceTokens,
} from '../../shared/workspaceUi';
import { Language } from '../session/sessionTypes';
import { taskPhaseLabel, taskStatusLabel } from './taskPresentation';

type Appearance = { palette: Palette; language: Language };

export function ContextReference({
  references,
  onRemove,
  palette,
  language,
}: Appearance & {
  references: AIContextReference[];
  onRemove?: (index: number) => void;
}) {
  const names: Record<AIContextReference['kind'], [string, string]> = {
    'chat-message': ['消息', 'Message'],
    'station-album': ['相册', 'Album'],
    'station-diary': ['日记', 'Diary'],
    'station-photo': ['素材', 'Media'],
    'station-file': ['文件', 'File'],
  };
  if (!references.length) return null;
  return (
    <View style={s.references}>
      {references.map((reference, index) => (
        <View
          key={`${reference.kind}:${reference.id}`}
          style={[
            s.reference,
            { backgroundColor: palette.soft, borderColor: palette.border },
          ]}
        >
          <Text
            numberOfLines={2}
            style={[s.body, s.referenceText, { color: palette.text }]}
          >
            {textFor(language, ...names[reference.kind])} ·{' '}
            {reference.title ||
              textFor(language, '已选择的内容', 'Selected content')}
          </Text>
          {onRemove ? (
            <WorkspaceButton
              palette={palette}
              variant="ghost"
              label="×"
              accessibilityLabel={textFor(
                language,
                `移除引用${reference.title || ''}`,
                `Remove reference ${reference.title || ''}`,
              )}
              onPress={() => onRemove(index)}
            />
          ) : null}
        </View>
      ))}
    </View>
  );
}

export function TaskStatus({
  task,
  palette,
  language,
  compact = false,
}: Appearance & { task: AITaskDTO; compact?: boolean }) {
  const phaseLabel = taskPhaseLabel(task.phase, language);
  return (
    <View style={s.stack} accessibilityLiveRegion="polite">
      <Text
        accessibilityRole="header"
        style={[s.title, compact && s.compactTitle, { color: palette.text }]}
      >
        {taskStatusLabel(task.status, language)}
      </Text>
      {task.status === 'running' && phaseLabel ? (
        <Text style={[s.body, { color: palette.secondaryText }]}>
          {phaseLabel}
        </Text>
      ) : null}
      {task.error ? (
        <WorkspaceState
          palette={palette}
          title={task.error.message}
          tone="error"
        />
      ) : null}
      {task.status === 'interrupted' ? (
        <Text style={[s.body, { color: palette.secondaryText }]}>
          {textFor(
            language,
            '执行已中断，不会自动重试。请核对现有成果后重新发起。',
            'Execution was interrupted and will not retry automatically. Review any results before starting again.',
          )}
        </Text>
      ) : null}
    </View>
  );
}

export function Artifact({
  artifact,
  children,
  onPreview,
  palette,
  language,
}: Appearance & {
  artifact: AIArtifact;
  children?: React.ReactNode;
  onPreview?: () => void;
}) {
  return (
    <WorkspacePanel palette={palette}>
      <Text style={[s.title, { color: palette.text }]}>
        {artifact.title || textFor(language, '任务成果', 'Result')}
      </Text>
      {onPreview ? (
        <WorkspaceButton
          palette={palette}
          variant="secondary"
          label={textFor(language, '查看成果', 'View result')}
          onPress={onPreview}
        />
      ) : null}
      {children}
    </WorkspacePanel>
  );
}

export function Confirmation({
  task,
  canConfirm,
  busy,
  onDecision,
  palette,
  language,
}: Appearance & {
  task: AITaskDTO;
  canConfirm: boolean;
  busy: boolean;
  onDecision: (operation: AITaskOperation) => void;
}) {
  const expiresAt = task.approval?.expiresAt;
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    setNow(Date.now());
    if (!expiresAt) return;
    const remaining = Date.parse(expiresAt) - Date.now();
    const timer = setTimeout(
      () => setNow(Date.now()),
      Math.max(0, Math.min(remaining + 1, 2147483647)),
    );
    return () => clearTimeout(timer);
  }, [expiresAt]);
  if (!task.approval || task.status !== 'awaiting_confirmation') return null;
  const expired = Date.parse(task.approval.expiresAt) <= now;
  return (
    <WorkspacePanel palette={palette}>
      <Text style={[s.title, { color: palette.text }]}>
        {textFor(language, '保存为当前页面', 'Save as current page')}
      </Text>
      <Text style={[s.body, { color: palette.secondaryText }]}>
        {textFor(
          language,
          '这份页面仅自己可见，保存后可随时打开。请先查看完整草稿；页面、资料或引用内容变化后需要重新确认。',
          'This page is private and can be reopened after saving. Review the full draft first. Changes to the page, profile or references require a new confirmation.',
        )}
      </Text>
      {expired ? (
        <WorkspaceState
          palette={palette}
          tone="error"
          title={textFor(
            language,
            '确认已过期，请刷新任务。',
            'This confirmation expired. Refresh the task.',
          )}
        />
      ) : null}
      {!canConfirm && !expired ? (
        <Text style={[s.body, { color: palette.secondaryText }]}>
          {textFor(
            language,
            '完整读取并查看下方草稿后可确认保存。',
            'Load and review the complete draft below before saving.',
          )}
        </Text>
      ) : null}
      <View style={s.actions}>
        {task.allowedActions.includes('confirm') ? (
          <WorkspaceButton
            palette={palette}
            label={textFor(language, '确认保存', 'Confirm save')}
            disabled={busy || !canConfirm || expired}
            busy={busy}
            onPress={() => onDecision('confirm')}
          />
        ) : null}
        {task.allowedActions.includes('reject') ? (
          <WorkspaceButton
            palette={palette}
            variant="secondary"
            label={textFor(language, '不保存', 'Do not save')}
            disabled={busy}
            onPress={() => onDecision('reject')}
          />
        ) : null}
      </View>
    </WorkspacePanel>
  );
}

export function AITaskCard({
  task,
  palette,
  language,
  busy = false,
  canConfirm = false,
  onDecision,
  renderArtifact,
}: Appearance & {
  task: AITaskDTO;
  busy?: boolean;
  canConfirm?: boolean;
  onDecision: (operation: AITaskOperation) => void;
  renderArtifact?: (artifact: AIArtifact) => React.ReactNode;
}) {
  return (
    <WorkspacePanel
      palette={palette}
      testID={`ai-task-${task.id}`}
      style={s.card}
    >
      <Text style={[s.body, { color: palette.secondaryText }]}>
        {textFor(
          language,
          task.kind === 'site_draft' ? '建站任务' : '对话任务',
          task.kind === 'site_draft' ? 'Site task' : 'Conversation task',
        )}
      </Text>
      <Text numberOfLines={3} style={[s.body, { color: palette.text }]}>
        {task.goal}
      </Text>
      <TaskStatus task={task} palette={palette} language={language} />
      <ContextReference
        references={task.contextRefs}
        palette={palette}
        language={language}
      />
      <Confirmation
        task={task}
        palette={palette}
        language={language}
        busy={busy}
        canConfirm={canConfirm}
        onDecision={onDecision}
      />
      {task.artifacts.map(artifact => (
        <React.Fragment key={`${artifact.kind}:${artifact.id}`}>
          {renderArtifact ? (
            renderArtifact(artifact)
          ) : (
            <Artifact
              artifact={artifact}
              palette={palette}
              language={language}
            />
          )}
        </React.Fragment>
      ))}
      {task.allowedActions.includes('cancel') ? (
        <WorkspaceButton
          palette={palette}
          variant="secondary"
          disabled={busy}
          busy={busy}
          onPress={() => onDecision('cancel')}
          label={textFor(
            language,
            busy ? '正在处理' : '取消任务',
            busy ? 'Updating' : 'Cancel task',
          )}
        />
      ) : null}
    </WorkspacePanel>
  );
}

const s = StyleSheet.create({
  stack: { gap: workspaceTokens.space.sm },
  card: {
    gap: workspaceTokens.space.md,
    marginVertical: workspaceTokens.space.sm,
  },
  title: workspaceTokens.typography.title,
  compactTitle: workspaceTokens.typography.caption,
  body: workspaceTokens.typography.body,
  referenceText: { flexShrink: 1 },
  references: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: workspaceTokens.space.sm,
  },
  reference: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: workspaceTokens.radius.control,
    paddingLeft: workspaceTokens.space.md,
    maxWidth: '100%',
  },
  actions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: workspaceTokens.space.sm,
  },
});
