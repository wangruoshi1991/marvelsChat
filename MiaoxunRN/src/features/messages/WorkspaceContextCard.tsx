import React, { useEffect, useRef, useState } from 'react';
import { AppState, StyleSheet, Text, View } from 'react-native';
import { AgentWorkspace } from '../../models/agentWorkspace';
import {
  WorkspaceContinuationDraft,
  WorkspaceDiscussionContext,
  sameWorkspaceContext,
  workspaceDiscussionContext,
} from '../../models/workspaceContext';
import { agentWorkspaceApi } from '../../services/api/agentWorkspaceApi';
import { createIdempotencyKey } from '../../shared/createIdempotencyKey';
import { appErrorText, textFor } from '../../shared/i18n';
import { Palette } from '../../shared/theme';
import { WorkspaceButton, WorkspaceState } from '../../shared/workspaceUi';
import { Language } from '../session/sessionTypes';

export function WorkspaceContextCard({
  token,
  context,
  palette,
  language,
  draft,
  historical = false,
  agentId,
  onChangeContext,
  onRemove,
  onOpenWorkspace,
}: {
  token: string;
  context: WorkspaceDiscussionContext;
  palette: Palette;
  language: Language;
  draft?: string;
  historical?: boolean;
  agentId?: string | null;
  onChangeContext: (context: WorkspaceDiscussionContext) => void;
  onRemove?: () => void;
  onOpenWorkspace: (
    workspace: AgentWorkspace,
    draft?: WorkspaceContinuationDraft,
  ) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [candidate, setCandidate] = useState<WorkspaceDiscussionContext | null>(
    null,
  );
  const alive = useRef(true);
  const pending = useRef(false);
  const generation = useRef(0);
  const foreground = useRef(AppState.currentState === 'active');
  useEffect(() => {
    alive.current = true;
    pending.current = false;
    foreground.current =
      AppState.currentState !== 'background' &&
      AppState.currentState !== 'inactive';
    setBusy(false);
    setError('');
    setCandidate(null);
    const subscription = AppState.addEventListener('change', state => {
      foreground.current = state === 'active';
      if (!foreground.current) {
        generation.current += 1;
        pending.current = false;
        setBusy(false);
        setCandidate(null);
      }
    });
    return () => {
      alive.current = false;
      generation.current += 1;
      subscription.remove();
    };
  }, [
    token,
    context.id,
    context.revision,
    context.currentRound,
    context.nodeId,
    agentId,
  ]);
  const read = async (action: 'view' | 'prepare' | 'restore') => {
    if (!alive.current || !foreground.current || pending.current) return;
    const seq = ++generation.current;
    const text = draft?.trim() || '';
    if (action === 'prepare' && (!text || text.length > 2000)) return;
    pending.current = true;
    setBusy(true);
    setError('');
    setCandidate(null);
    try {
      const workspace = await agentWorkspaceApi.get(token, context.id);
      if (!alive.current || !foreground.current || generation.current !== seq)
        return;
      if (action === 'restore') {
        const latest = workspaceDiscussionContext(
          workspace,
          context.nodeId,
          agentId || undefined,
        );
        if (sameWorkspaceContext(context, latest)) onChangeContext(latest);
        else setCandidate(latest);
      } else {
        onOpenWorkspace(
          workspace,
          action === 'prepare'
            ? {
                id: context.id,
                revision: context.revision,
                currentRound: context.currentRound,
                text,
                draftId: createIdempotencyKey(),
              }
            : undefined,
        );
      }
    } catch (issue) {
      if (alive.current && generation.current === seq)
        setError(
          appErrorText(
            language,
            issue,
            '无法读取原任务，请重试或检查授权。',
            'Unable to read the task. Retry or review access.',
          ),
        );
    } finally {
      if (alive.current && generation.current === seq) {
        pending.current = false;
        setBusy(false);
      }
    }
  };
  return (
    <View testID="workspace-context-card" style={s.card}>
      <Text style={[s.title, { color: palette.text }]}>{context.goal}</Text>
      <Text style={{ color: palette.secondaryText }}>
        {textFor(
          language,
          `${historical ? '这条讨论关联' : '正在讨论'}第 ${
            context.currentRound
          } 轮任务；发送消息只讨论，修改需在任务详情确认。`,
          `${historical ? 'This message concerns' : 'Discussing'} round ${
            context.currentRound
          }. Messages only discuss; revisions require confirmation in task details.`,
        )}
      </Text>
      <View style={s.actions}>
        <WorkspaceButton
          palette={palette}
          variant="ghost"
          label={textFor(language, '查看原任务', 'View original task')}
          disabled={busy}
          onPress={() => read('view')}
        />
        <WorkspaceButton
          palette={palette}
          variant="ghost"
          label={textFor(
            language,
            historical ? '继续讨论此任务' : '刷新任务关联',
            historical ? 'Discuss this task' : 'Refresh task context',
          )}
          disabled={busy}
          onPress={() => read('restore')}
        />
        {onRemove ? (
          <WorkspaceButton
            palette={palette}
            variant="ghost"
            label={textFor(language, '移除任务关联', 'Remove task context')}
            onPress={onRemove}
          />
        ) : null}
      </View>
      {!historical && !context.nodeId ? (
        <WorkspaceButton
          palette={palette}
          variant="secondary"
          label={textFor(language, '继续修改此任务', 'Revise this task')}
          disabled={busy || !draft?.trim() || draft.trim().length > 2000}
          busy={busy}
          onPress={() => read('prepare')}
        />
      ) : null}
      {candidate ? (
        <View style={s.card}>
          <WorkspaceState
            palette={palette}
            title={textFor(
              language,
              `任务已更新到第 ${candidate.currentRound} 轮。请查看当前成果，再确认使用当前版本继续讨论；输入原文会保留。`,
              `The task is now at round ${candidate.currentRound}. Review the current result before using its current version. Your text is retained.`,
            )}
          />
          <WorkspaceButton
            palette={palette}
            label={textFor(
              language,
              '使用当前任务版本讨论',
              'Discuss the current task version',
            )}
            onPress={() => {
              if (!alive.current || !foreground.current) return;
              onChangeContext(candidate);
              setCandidate(null);
            }}
          />
        </View>
      ) : null}
      {error ? (
        <WorkspaceState palette={palette} tone="error" title={error} />
      ) : null}
    </View>
  );
}

const s = StyleSheet.create({
  card: { gap: 8, paddingVertical: 8 },
  title: { fontSize: 15, fontWeight: '600' },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
});
