import React, { useEffect, useRef, useState } from 'react';
import { AppState, Text, View } from 'react-native';
import { AgentWorkspace } from '../../models/agentWorkspace';
import { agentWorkspaceApi } from '../../services/api/agentWorkspaceApi';
import { MiaoxunApiError } from '../../services/api/http';
import { supportsAgentWorkspaces } from '../../services/aiContract';
import {
  WorkspaceAttempt,
  workspaceAttemptStore,
} from '../../services/workspaceAttemptStore';
import { textFor } from '../../shared/i18n';
import { Palette } from '../../shared/theme';
import {
  WorkspaceButton,
  WorkspaceState,
  workspaceTokens,
} from '../../shared/workspaceUi';
import { Language } from '../session/sessionTypes';

type Props = {
  token: string;
  userId: string;
  palette: Palette;
  language: Language;
  onCreated: (workspace: AgentWorkspace) => void;
};
export function WorkspaceSubmissionRecovery(props: Props) {
  return <Submission key={`${props.token}:${props.userId}`} {...props} />;
}
function Submission({ token, userId, palette, language, onCreated }: Props) {
  const [attempt, setAttempt] = useState<WorkspaceAttempt | null>(null);
  const stored = useRef<WorkspaceAttempt | null>(null);
  const [restoring, setRestoring] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [storageFailed, setStorageFailed] = useState(false);
  const [foreground, setForeground] = useState(
    AppState.currentState !== 'background' &&
      AppState.currentState !== 'inactive',
  );
  const foregroundRef = useRef(foreground);
  const alive = useRef(true);
  const pending = useRef(false);
  const created = useRef(onCreated);
  created.current = onCreated;
  const accepted = useRef<AgentWorkspace | null>(null);
  const rejected = useRef<{ key: string; message: string } | null>(null);
  const [restoreVersion, setRestoreVersion] = useState(0);
  useEffect(() => {
    alive.current = true;
    let current = true;
    setRestoring(true);
    setStorageFailed(false);
    setError('');
    workspaceAttemptStore
      .read(userId)
      .then(saved => {
        if (current && alive.current) {
          stored.current = saved;
          setAttempt(saved);
        }
      })
      .catch(issue => {
        if (current && alive.current) {
          setStorageFailed(true);
          setError(
            issue instanceof Error ? issue.message : '无法读取待恢复提交。',
          );
        }
      })
      .finally(() => {
        if (current && alive.current) setRestoring(false);
      });
    return () => {
      current = false;
      alive.current = false;
    };
  }, [userId, restoreVersion]);
  useEffect(() => {
    const sub = AppState.addEventListener('change', state => {
      foregroundRef.current = state === 'active';
      setForeground(state === 'active');
      if (state === 'active' && accepted.current) {
        const workspace = accepted.current;
        accepted.current = null;
        created.current(workspace);
      }
    });
    return () => sub.remove();
  }, []);
  const submit = async () => {
    if (
      restoring ||
      storageFailed ||
      pending.current ||
      !foregroundRef.current ||
      !supportsAgentWorkspaces(token) ||
      !stored.current
    )
      return;
    pending.current = true;
    setBusy(true);
    setError('');
    const submission = stored.current;
    try {
      if (rejected.current?.key === submission.idempotencyKey) {
        await workspaceAttemptStore.clear(userId, submission.idempotencyKey);
        if (!alive.current) return;
        stored.current = null;
        setAttempt(null);
        setError(rejected.current.message);
        rejected.current = null;
        return;
      }
      if (!foregroundRef.current) return;
      const workspace = await agentWorkspaceApi.create(token, submission);
      await workspaceAttemptStore.clear(userId, submission.idempotencyKey);
      if (!alive.current) return;
      stored.current = null;
      setAttempt(null);
      if (foregroundRef.current) created.current(workspace);
      else accepted.current = workspace;
    } catch (issue) {
      // Only the server's committed outcome for this exact nonce permits a new
      // submission. HTTP status alone says nothing about a previous lost reply.
      if (
        issue instanceof MiaoxunApiError &&
        issue.status &&
        [400, 403, 404, 409].includes(issue.status) &&
        issue.details?.submissionOutcome === 'rejected' &&
        issue.details.idempotencyKey === submission.idempotencyKey &&
        !issue.isNetworkError &&
        !issue.isTimeout
      ) {
        rejected.current = {
          key: submission.idempotencyKey,
          message: issue.message,
        };
        try {
          await workspaceAttemptStore.clear(userId, submission.idempotencyKey);
          if (!alive.current) return;
          stored.current = null;
          setAttempt(null);
          rejected.current = null;
          setError(
            textFor(
              language,
              `${issue.message} 本次未创建任务，可在草稿中修改后交给妙管家。`,
              `${issue.message} No task was created. Edit your draft and review it with Butler.`,
            ),
          );
        } catch {
          if (alive.current)
            setError(
              textFor(
                language,
                '本次未创建任务，但暂时无法恢复本机编辑状态，请重试。',
                'No task was created, but the local request could not be cleared. Try again.',
              ),
            );
        }
      } else if (alive.current) {
        setError(
          issue instanceof Error
            ? issue.message
            : '提交结果尚未确认，请恢复同一项提交。',
        );
      }
    } finally {
      pending.current = false;
      if (alive.current) {
        setBusy(false);
      }
    }
  };
  const supported = supportsAgentWorkspaces(token);
  if (!attempt && !error) return null;
  return (
    <View style={{ gap: workspaceTokens.space.sm }}>
      {!supported ? (
        <WorkspaceState
          palette={palette}
          title={textFor(
            language,
            '协作服务尚未就绪，更新服务后可开始。',
            'Agent collaboration is unavailable until the service is updated.',
          )}
        />
      ) : null}
      {attempt ? (
        <Text
          testID="workspace-pending-goal"
          style={[
            workspaceTokens.typography.caption,
            { color: palette.secondaryText },
          ]}
        >
          {textFor(
            language,
            '上次提交尚待确认，将恢复原目标：',
            'Resume the unconfirmed request: ',
          )}
          {attempt.goal}
        </Text>
      ) : null}
      {error ? (
        <WorkspaceState palette={palette} tone="error" title={error} />
      ) : null}
      {storageFailed ? (
        <WorkspaceButton
          palette={palette}
          label={textFor(
            language,
            '重试读取上次提交',
            'Retry pending request recovery',
          )}
          disabled={restoring || !foreground}
          busy={restoring}
          onPress={() => setRestoreVersion(value => value + 1)}
        />
      ) : attempt ? (
        <WorkspaceButton
          testID="workspace-recover"
          palette={palette}
          label={textFor(
            language,
            rejected.current ? '清理已拒绝的提交' : '恢复上次协作提交',
            rejected.current
              ? 'Clear rejected request'
              : 'Resume pending request',
          )}
          disabled={!supported || restoring || busy || !foreground}
          busy={busy || restoring}
          onPress={submit}
        />
      ) : null}
    </View>
  );
}
