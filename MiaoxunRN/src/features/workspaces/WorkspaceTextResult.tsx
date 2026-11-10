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
  collapsedByDefault?: boolean;
  palette: Palette;
  language: Language;
};

// Body text lives only in this visible, authenticated result. Workspace
// snapshots contain its reference; backgrounding or changing identity drops it.
export function WorkspaceTextResult(props: Props) {
  if (!props.foreground) return null;
  const key = `${props.token}:${props.workspaceId}:${props.artifact.id}:${props.artifact.title}:${props.refreshKey}`;
  if (props.collapsedByDefault)
    return <CollapsedTextResult key={key} {...props} />;
  return <TextResult key={key} {...props} />;
}

function CollapsedTextResult(props: Props) {
  const [expanded, setExpanded] = useState(false);
  const t = (zh: string, en: string) => textFor(props.language, zh, en);
  return (
    <View style={s.collapsedResult}>
      {expanded ? (
        <>
          <WorkspaceButton
            testID={`workspace-text-toggle-${props.artifact.id}`}
            palette={props.palette}
            variant="ghost"
            label={t('收起完整成果', 'Collapse full result')}
            onPress={() => setExpanded(false)}
          />
          <TextResult {...props} />
        </>
      ) : (
        <WorkspaceButton
          testID={`workspace-text-toggle-${props.artifact.id}`}
          palette={props.palette}
          variant="ghost"
          label={t('阅读完整成果', 'Read full result')}
          onPress={() => setExpanded(true)}
        />
      )}
    </View>
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

const s = StyleSheet.create({
  collapsedResult: { gap: 8 },
  error: { gap: 8 },
});
