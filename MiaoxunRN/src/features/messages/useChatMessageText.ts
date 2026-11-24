import { useEffect, useMemo, useRef, useState } from 'react';
import { AppState } from 'react-native';

import type { ChatMessageTextAvailabilityDTO } from '../../models/api';
import { messageApi } from '../../services/api/messageApi';
import { MiaoxunApiError } from '../../services/api/http';
import { chatVoiceMessageContent } from '../../services/chatVoiceAudio';
import { textFor } from '../../shared/i18n';
import type {
  ChatMessage,
  ChatThread,
  Language,
} from '../session/sessionTypes';

type Action = 'translate' | 'transcribe';
export type ChatMessageTextOutput =
  | { status: 'loading' }
  | {
      status: 'ready';
      text: string;
      visible: boolean;
      transcriptId?: string;
      attachmentId?: string;
    }
  | { status: 'error'; text: string; retryable: boolean; expired?: boolean };

export function useChatMessageText({
  scope,
  thread,
  token,
  language,
  availability,
}: {
  scope: string;
  thread: ChatThread;
  token?: string;
  language: Language;
  availability?: ChatMessageTextAvailabilityDTO;
}) {
  const canTranslate = availability?.translate === true;
  const canTranscribe = availability?.transcribe === true;
  const canTranslateVoice =
    canTranslate && canTranscribe && availability?.translateTranscript === true;
  const [privacyEpoch, setPrivacyEpoch] = useState(0);
  const operationScope = useMemo(
    () => ({
      scope,
      language,
      canTranslate,
      canTranscribe,
      canTranslateVoice,
      token,
      threadId: thread.id,
      privacyEpoch,
    }),
    [
      scope,
      language,
      canTranslate,
      canTranscribe,
      canTranslateVoice,
      token,
      thread.id,
      privacyEpoch,
    ],
  );
  const activeScope = useRef<typeof operationScope | null>(operationScope);
  activeScope.current = operationScope;
  useEffect(() => {
    activeScope.current = operationScope;
    return () => {
      if (activeScope.current === operationScope) activeScope.current = null;
    };
  }, [operationScope]);
  const messages = useRef(thread.messages);
  messages.current = thread.messages;
  const [entries, setEntries] = useState<{
    scope: typeof operationScope;
    values: Record<string, ChatMessageTextOutput>;
  }>({ scope: operationScope, values: {} });
  useEffect(() => {
    const subscription = AppState.addEventListener('change', state => {
      if (state !== 'active') {
        activeScope.current = null;
        setEntries({ scope: operationScope, values: {} });
        setPrivacyEpoch(value => value + 1);
      }
    });
    return () => subscription.remove();
  }, [operationScope]);
  const pending = useRef(new Map<string, typeof operationScope>());

  const eligibleContent = (message: ChatMessage) => {
    if (
      !token ||
      !['direct', 'group'].includes(thread.kind) ||
      message.senderType !== 'user' ||
      message.deletedAt ||
      message.recalledAt ||
      message.localStatus ||
      message.metadata?.sticker
    )
      return;
    if (
      Array.isArray(message.metadata?.attachments) &&
      message.metadata.attachments.some(
        attachment => attachment?.kind === 'audio',
      )
    )
      return 'voice';
    if (message.content.trim() && message.content !== chatVoiceMessageContent)
      return 'text';
  };

  const availableAction = (message: ChatMessage): Action | undefined => {
    const content = eligibleContent(message);
    if (content === 'text' && canTranslate) return 'translate';
    if (content === 'voice' && canTranscribe) return 'transcribe';
  };

  const setEntry = (id: string, output: ChatMessageTextOutput) => {
    setEntries(current => ({
      scope: operationScope,
      values: {
        ...(current.scope === operationScope ? current.values : {}),
        [id]: output,
      },
    }));
  };
  const outputFor = (message: ChatMessage) =>
    availableAction(message) && entries.scope === operationScope
      ? entries.values[message.id]
      : undefined;

  const toggle = async (message: ChatMessage, retranscribe = false) => {
    const current = messages.current.find(item => item.id === message.id);
    if (!token || !current || activeScope.current !== operationScope) return;
    const action = availableAction(current);
    if (!action || pending.current.get(message.id) === operationScope) return;
    const existing = outputFor(current);
    if (existing?.status === 'ready' && !retranscribe) {
      setEntry(current.id, { ...existing, visible: !existing.visible });
      return;
    }
    const audio = current.metadata?.attachments?.find(
      item => item.kind === 'audio',
    );
    if (action === 'transcribe' && !audio) return;
    const isCurrent = () => {
      if (activeScope.current !== operationScope) return false;
      const latest = messages.current.find(item => item.id === current.id);
      return (
        latest &&
        availableAction(latest) === action &&
        latest.content === current.content &&
        (action === 'translate' ||
          latest.metadata?.attachments?.some(item => item.id === audio?.id))
      );
    };
    pending.current.set(current.id, operationScope);
    setEntry(current.id, { status: 'loading' });
    if (action === 'transcribe')
      setEntries(previous => {
        const values = {
          ...(previous.scope === operationScope ? previous.values : {}),
        };
        delete values[`${current.id}:translation`];
        return { scope: operationScope, values };
      });
    try {
      const usesReceipt = action === 'transcribe' && audio && canTranslateVoice;
      const transcript = usesReceipt
        ? await messageApi.transcribeMessageText(
            thread.id,
            current.id,
            token,
            audio.id,
          )
        : undefined;
      const text = usesReceipt
        ? transcript?.text
        : await messageApi.readMessageText(
            thread.id,
            current.id,
            token,
            action === 'transcribe' && audio
              ? { kind: action, attachmentId: audio.id }
              : { kind: 'translate', language },
          );
      if (!isCurrent()) return;
      setEntry(
        current.id,
        text
          ? {
              status: 'ready',
              text,
              visible: true,
              transcriptId: transcript?.transcriptId,
              attachmentId: audio?.id,
            }
          : {
              status: 'error',
              text: textFor(
                language,
                '这条消息未返回可显示的文字。',
                'No text was returned for this message.',
              ),
              retryable: true,
            },
      );
    } catch (error) {
      if (!isCurrent()) return;
      const code = error instanceof MiaoxunApiError ? error.code : undefined;
      const status =
        error instanceof MiaoxunApiError ? error.status : undefined;
      const originalUnavailable = code === 'CHAT_MESSAGE_AI_NOT_FOUND';
      const unavailable =
        code === 'CHAT_MESSAGE_AI_UNAVAILABLE' ||
        status === 503 ||
        (status === 404 && !originalUnavailable);
      setEntry(current.id, {
        status: 'error',
        retryable:
          !unavailable &&
          status !== 404 &&
          status !== 400 &&
          status !== 403 &&
          status !== 422,
        text: unavailable
          ? textFor(
              language,
              '这项服务暂未开放。',
              'This service is currently unavailable.',
            )
          : originalUnavailable
          ? textFor(
              language,
              '原消息已不可用。',
              'The original message is no longer available.',
            )
          : status === 400 || status === 422
          ? textFor(
              language,
              '这条消息无法处理。',
              'This message cannot be processed.',
            )
          : status === 403
          ? textFor(
              language,
              '当前无法访问原消息。',
              'The original message is inaccessible.',
            )
          : status === 429
          ? textFor(
              language,
              '操作太频繁，请稍后重试。',
              'Too many requests. Try again shortly.',
            )
          : textFor(
              language,
              '处理失败，请重试。',
              'Could not process this message. Try again.',
            ),
      });
    } finally {
      if (pending.current.get(current.id) === operationScope)
        pending.current.delete(current.id);
    }
  };

  const canTranslateTranscript = (message: ChatMessage) => {
    const transcript = outputFor(message);
    return (
      canTranslateVoice &&
      availableAction(message) === 'transcribe' &&
      transcript?.status === 'ready' &&
      Boolean(transcript.transcriptId) &&
      message.metadata?.attachments?.some(
        item => item.kind === 'audio' && item.id === transcript.attachmentId,
      ) === true
    );
  };
  const translationFor = (message: ChatMessage) =>
    canTranslateTranscript(message) && entries.scope === operationScope
      ? entries.values[`${message.id}:translation`]
      : undefined;

  const translateTranscript = async (message: ChatMessage) => {
    const current = messages.current.find(item => item.id === message.id);
    if (
      !token ||
      !current ||
      activeScope.current !== operationScope ||
      !canTranslateTranscript(current)
    )
      return;
    const transcript = outputFor(current);
    if (
      transcript?.status !== 'ready' ||
      !transcript.transcriptId ||
      !transcript.attachmentId
    )
      return;
    const key = `${current.id}:translation`;
    if (pending.current.get(key) === operationScope) return;
    const existing = translationFor(current);
    if (
      existing?.status === 'ready' ||
      (existing?.status === 'error' && !existing.retryable)
    )
      return;
    const isCurrent = () => {
      if (activeScope.current !== operationScope) return false;
      const latest = messages.current.find(item => item.id === current.id);
      return (
        latest &&
        availableAction(latest) === 'transcribe' &&
        latest.metadata?.attachments?.some(
          item => item.id === transcript.attachmentId,
        )
      );
    };
    pending.current.set(key, operationScope);
    setEntry(key, { status: 'loading' });
    try {
      const text = await messageApi.translateTranscript(
        thread.id,
        current.id,
        token,
        transcript.attachmentId,
        transcript.transcriptId,
        language,
      );
      if (!isCurrent()) return;
      if (!text) throw new Error('Empty translation');
      setEntry(key, { status: 'ready', text, visible: true });
    } catch (error) {
      if (!isCurrent()) return;
      const apiError = error instanceof MiaoxunApiError ? error : undefined;
      const expired = apiError?.code === 'CHAT_MESSAGE_AI_TRANSCRIPT_EXPIRED';
      const unavailable =
        apiError?.code === 'CHAT_MESSAGE_AI_UNAVAILABLE' ||
        apiError?.status === 503;
      setEntry(key, {
        status: 'error',
        expired,
        retryable:
          !expired &&
          !unavailable &&
          ![400, 403, 404, 422].includes(apiError?.status || 0),
        text: expired
          ? textFor(
              language,
              '转写结果已过期，请重新转写后再翻译。',
              'This transcript has expired. Transcribe again before translating.',
            )
          : unavailable
          ? textFor(
              language,
              '这项服务暂未开放。',
              'This service is currently unavailable.',
            )
          : apiError?.status === 404 || apiError?.status === 403
          ? textFor(
              language,
              '原消息已不可用。',
              'The original message is no longer available.',
            )
          : apiError?.status === 400 || apiError?.status === 422
          ? textFor(
              language,
              '这段转写无法翻译。',
              'This transcript cannot be translated.',
            )
          : apiError?.status === 429
          ? textFor(
              language,
              '操作太频繁，请稍后重试。',
              'Too many requests. Try again shortly.',
            )
          : textFor(
              language,
              '翻译失败，请重试。',
              'Could not translate this transcript. Try again.',
            ),
      });
    } finally {
      if (pending.current.get(key) === operationScope)
        pending.current.delete(key);
    }
  };

  return {
    availableAction,
    canShareText: (message: ChatMessage) => eligibleContent(message) === 'text',
    outputFor,
    toggle,
    canTranslateTranscript,
    translationFor,
    translateTranscript,
    retranscribe: (message: ChatMessage) => toggle(message, true),
  };
}
