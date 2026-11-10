import React, { useEffect, useState } from 'react';
import { AppState, Text, View } from 'react-native';
import { messageApi } from '../../services/api/messageApi';
import { textFor } from '../../shared/i18n';
import { Palette } from '../../shared/theme';
import { WorkspaceButton } from '../../shared/workspaceUi';
import { Language } from '../session/sessionTypes';
import { ChatMessageText } from './ChatMessageText';

type Props = {
  token: string;
  threadId: string;
  messageId: string;
  palette: Palette;
  language: Language;
};

// Source-derived replies never enter session messages, previews or copy/reply
// payloads. Only the mounted, foreground reader holds the authorized text.
export function ContributionDiscussionReply(props: Props) {
  const [visibilityGeneration, setVisibilityGeneration] = useState(0);
  const [foreground, setForeground] = useState(
    AppState.currentState !== 'background' &&
      AppState.currentState !== 'inactive',
  );
  useEffect(() => {
    const sub = AppState.addEventListener('change', state => {
      if (state !== 'active') setVisibilityGeneration(value => value + 1);
      setForeground(state === 'active');
    });
    return () => sub.remove();
  }, []);
  if (!foreground) return null;
  return (
    <ProtectedReply
      key={`${props.token}:${props.threadId}:${props.messageId}:${visibilityGeneration}`}
      {...props}
    />
  );
}

function ProtectedReply({
  token,
  threadId,
  messageId,
  palette,
  language,
}: Props) {
  const [content, setContent] = useState('');
  const [error, setError] = useState('');
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let active = true;
    let timer: ReturnType<typeof setTimeout>;
    setContent('');
    setError('');
    const read = async () => {
      try {
        const value = await messageApi.contributionDiscussion(
          threadId,
          messageId,
          token,
        );
        if (active) {
          setContent(value.content);
          setError('');
        }
      } catch (issue) {
        if (active) {
          setContent('');
          setError(
            issue instanceof Error
              ? issue.message
              : textFor(
                  language,
                  '无法读取讨论，请检查授权。',
                  'Unable to read the discussion. Review access.',
                ),
          );
        }
      } finally {
        if (active) timer = setTimeout(read, 15000);
      }
    };
    read();
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [token, threadId, messageId, attempt, language]);
  return (
    <View testID={`contribution-discussion-${messageId}`}>
      {content ? (
        <ChatMessageText
          formatted
          palette={palette}
          style={{ color: palette.text }}
        >
          {content}
        </ChatMessageText>
      ) : (
        <Text
          accessibilityRole={error ? 'alert' : undefined}
          style={{ color: error ? palette.rose : palette.secondaryText }}
        >
          {error ||
            textFor(
              language,
              '正在读取协作讨论…',
              'Loading contribution discussion…',
            )}
        </Text>
      )}
      {content || error ? (
        <WorkspaceButton
          palette={palette}
          variant="ghost"
          label={textFor(language, '重新读取讨论', 'Reload discussion')}
          onPress={() => {
            setContent('');
            setError('');
            setAttempt(value => value + 1);
          }}
        />
      ) : null}
    </View>
  );
}
