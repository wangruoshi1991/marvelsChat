import React, { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import {
  WorkspaceArtifact,
  WorkspaceTextDocument,
} from '../../models/agentWorkspace';
import { agentWorkspaceApi } from '../../services/api/agentWorkspaceApi';
import { textFor } from '../../shared/i18n';
import { Palette } from '../../shared/theme';
import { WorkspaceButton, workspaceTokens } from '../../shared/workspaceUi';
import { ChatMessageText } from '../messages/ChatMessageText';
import { Language } from '../session/sessionTypes';

type Props = {
  artifact: Extract<WorkspaceArtifact, { kind: 'text_result' }>;
  token: string;
  workspaceId: string;
  foreground: boolean;
  disabled: boolean;
  refreshKey: number;
  palette: Palette;
  language: Language;
};

// Body text lives only in this visible, authenticated result. Workspace
// snapshots contain its reference; backgrounding or changing identity drops it.
export function WorkspaceTextResult(props: Props) {
  if (!props.foreground) return null;
  return (
    <TextResult
      key={`${props.token}:${props.workspaceId}:${props.artifact.id}:${props.artifact.title}:${props.refreshKey}`}
      {...props}
    />
  );
}

function TextResult({
  artifact,
  token,
  workspaceId,
  disabled,
  palette,
  language,
}: Props) {
  const [document, setDocument] = useState<WorkspaceTextDocument | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let active = true;
    setDocument(null);
    setError(null);
    agentWorkspaceApi.text(token, workspaceId, artifact.id).then(
      value => {
        if (!active) return;
        if (value.title !== artifact.title) {
          setError('');
          return;
        }
        setDocument(value);
      },
      issue => {
        if (!active) return;
        setDocument(null);
        setError(issue instanceof Error ? issue.message : '');
      },
    );
    return () => {
      active = false;
    };
  }, [token, workspaceId, artifact.id, artifact.title, attempt]);
  const t = (zh: string, en: string) => textFor(language, zh, en);
  if (error !== null)
    return (
      <View style={s.error}>
        <Text accessibilityLiveRegion="polite" style={{ color: palette.rose }}>
          {error ||
            t(
              '文字成果已变化或读取失败，请重新读取。',
              'Could not read the current text result. Reload it.',
            )}
        </Text>
        <WorkspaceButton
          testID={`workspace-text-retry-${artifact.id}`}
          palette={palette}
          variant="ghost"
          label={t('重新读取文字成果', 'Reload text result')}
          disabled={disabled}
          onPress={() => {
            setDocument(null);
            setError(null);
            setAttempt(value => value + 1);
          }}
        />
      </View>
    );
  if (!document)
    return (
      <Text style={{ color: palette.secondaryText }}>
        {t('正在读取文字成果…', 'Loading text result…')}
      </Text>
    );
  return (
    <ChatMessageText
      testID={`workspace-text-result-${artifact.id}`}
      formatted
      palette={palette}
      style={[workspaceTokens.typography.body, { color: palette.text }]}
    >
      {document.content}
    </ChatMessageText>
  );
}

const s = StyleSheet.create({ error: { gap: 8 } });
