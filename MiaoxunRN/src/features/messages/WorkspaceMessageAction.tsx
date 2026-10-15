import React, { useEffect, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { AgentWorkspace } from '../../models/agentWorkspace';
import { agentWorkspaceApi } from '../../services/api/agentWorkspaceApi';
import { appErrorText, textFor } from '../../shared/i18n';
import { Palette } from '../../shared/theme';
import { WorkspaceButton, WorkspaceState } from '../../shared/workspaceUi';
import { ChatMessage, Language } from '../session/sessionTypes';

const workspaceIdPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function messageWorkspaceId(
  message: ChatMessage,
  agentId?: string | null,
) {
  const reference: unknown = message.metadata?.agentWorkspace;
  if (
    agentId !== 'miaoxun-butler' ||
    message.senderType !== 'agent' ||
    message.deletedAt ||
    message.recalledAt ||
    message.localStatus ||
    !reference ||
    typeof reference !== 'object' ||
    Array.isArray(reference) ||
    !('id' in reference) ||
    typeof reference.id !== 'string' ||
    !workspaceIdPattern.test(reference.id)
  )
    return null;
  return reference.id;
}

// The parent keys this action by authenticated session, thread, message and
// workspace. A late read cannot open a task in a different conversation.
export function WorkspaceMessageAction({
  token,
  workspaceId,
  palette,
  language,
  onOpen,
}: {
  token: string;
  workspaceId: string;
  palette: Palette;
  language: Language;
  onOpen: (workspace: AgentWorkspace) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const alive = useRef(true);
  const pending = useRef(false);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);
  const open = async () => {
    if (!alive.current || pending.current) return;
    pending.current = true;
    setBusy(true);
    setError('');
    try {
      const workspace = await agentWorkspaceApi.get(token, workspaceId);
      if (alive.current) onOpen(workspace);
    } catch (issue) {
      if (alive.current)
        setError(
          appErrorText(
            language,
            issue,
            '无法打开任务，请重试。',
            'Unable to open this task. Try again.',
          ),
        );
    } finally {
      pending.current = false;
      if (alive.current) setBusy(false);
    }
  };
  return (
    <View style={s.actions}>
      <WorkspaceButton
        palette={palette}
        label={textFor(language, '查看任务', 'View task')}
        testID="message-view-workspace"
        variant="secondary"
        busy={busy}
        disabled={busy}
        onPress={open}
      />
      {error ? (
        <WorkspaceState palette={palette} tone="error" title={error} />
      ) : null}
    </View>
  );
}

const s = StyleSheet.create({ actions: { gap: 8 } });
