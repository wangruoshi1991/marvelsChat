import React from 'react';
import { AppState, AppStateStatus } from 'react-native';
import Renderer, { act } from 'react-test-renderer';
import { useChatMessageText } from '../src/features/messages/useChatMessageText';
import { ChatMessageTextResult } from '../src/features/messages/ChatMessageTextResult';
import type {
  ChatMessage,
  ChatThread,
} from '../src/features/session/sessionTypes';
import type { ChatMessageTextAvailabilityDTO } from '../src/models/api';
import { messageApi } from '../src/services/api/messageApi';
import { MiaoxunApiError } from '../src/services/api/http';
import { palettes } from '../src/shared/theme';

const receipt = '00000000-0000-4000-8000-000000000002';
const voice: ChatMessage = {
  id: 'message-1',
  threadId: 'thread-1',
  senderType: 'user',
  senderName: 'Synthetic',
  content: '[语音]',
  createdAt: '2026-11-23T08:00:00Z',
  metadata: {
    attachments: [
      {
        id: 'audio-1',
        kind: 'audio',
        filename: 'voice.m4a',
        title: 'Voice',
        mimeType: 'audio/mp4',
        byteSize: 10,
        downloadPath: '/api/chat-attachments/audio-1/content',
        durationMs: 1000,
        data: {},
      },
    ],
  },
};
const thread = {
  id: 'thread-1',
  kind: 'direct',
  title: 'Synthetic',
  messages: [voice],
} as ChatThread;
const enabled: ChatMessageTextAvailabilityDTO = {
  translate: true,
  transcribe: true,
  translateTranscript: true,
};
let state: ReturnType<typeof useChatMessageText>;
let tree: Renderer.ReactTestRenderer;
let appStateChange: (next: AppStateStatus) => void;
function Harness({
  availability = enabled,
  scope = 'owner:thread',
  currentThread = thread,
}: {
  availability?: ChatMessageTextAvailabilityDTO;
  scope?: string;
  currentThread?: ChatThread;
}) {
  state = useChatMessageText({
    scope,
    thread: currentThread,
    token: 'synthetic-token',
    language: 'zh',
    availability,
  });
  const output = state.outputFor(currentThread.messages[0]);
  return output ? (
    <ChatMessageTextResult
      action="transcribe"
      output={output}
      translation={state.translationFor(currentThread.messages[0])}
      palette={palettes.light}
      language="zh"
      onRetry={() => {
        state.toggle(voice);
      }}
      onTranslateTranscript={
        state.canTranslateTranscript(currentThread.messages[0])
          ? () => {
              state.translateTranscript(voice);
            }
          : undefined
      }
      onTranscribeAgain={() => {
        state.retranscribe(voice);
      }}
    />
  ) : null;
}
const transcribe = async () => {
  await act(async () => state.toggle(voice));
};
const translate = async () => {
  await act(async () => state.translateTranscript(voice));
};
const content = () => JSON.stringify(tree.toJSON());
beforeEach(async () => {
  jest
    .spyOn(AppState, 'addEventListener')
    .mockImplementation((_event, handler) => {
      appStateChange = handler;
      return { remove: jest.fn() };
    });
  jest
    .spyOn(messageApi, 'transcribeMessageText')
    .mockResolvedValue({ text: '原始转写', transcriptId: receipt });
  jest.spyOn(messageApi, 'translateTranscript').mockResolvedValue('翻译结果');
  jest.spyOn(messageApi, 'readMessageText').mockResolvedValue('普通转写');
  await act(async () => {
    tree = Renderer.create(<Harness />);
  });
});
afterEach(() => {
  act(() => tree.unmount());
  jest.restoreAllMocks();
});

test('translation requires its capability and both feature gates, and keeps ordinary transcription available', async () => {
  for (const availability of [
    { translate: false, transcribe: true, translateTranscript: true },
    { translate: true, transcribe: true },
    { translate: true, transcribe: true, translateTranscript: false },
  ]) {
    await act(async () => tree.update(<Harness availability={availability} />));
    await transcribe();
    expect(state.canTranslateTranscript(voice)).toBe(false);
    await translate();
  }
  expect(messageApi.transcribeMessageText).not.toHaveBeenCalled();
  expect(messageApi.readMessageText).toHaveBeenCalledTimes(2);
  expect(messageApi.translateTranscript).not.toHaveBeenCalled();
  await act(async () =>
    tree.update(<Harness availability={{ ...enabled, transcribe: false }} />),
  );
  expect(state.availableAction(voice)).toBeUndefined();
});

test('only explicit translation invokes the provider API and repeated taps preserve both transcript and translation', async () => {
  await transcribe();
  expect(messageApi.translateTranscript).not.toHaveBeenCalled();
  expect(content()).toContain('原始转写');
  expect(content()).toContain('翻译转写');
  let resolve!: (value: string) => void;
  jest.mocked(messageApi.translateTranscript).mockReturnValue(
    new Promise(done => {
      resolve = done;
    }),
  );
  let pending!: Promise<void>;
  await act(async () => {
    pending = state.translateTranscript(voice);
  });
  await act(async () => {
    state.translateTranscript(voice);
  });
  expect(messageApi.translateTranscript).toHaveBeenCalledTimes(1);
  expect(messageApi.translateTranscript).toHaveBeenCalledWith(
    'thread-1',
    'message-1',
    'synthetic-token',
    'audio-1',
    receipt,
    'zh',
  );
  await act(async () => {
    resolve('翻译结果');
    await pending;
  });
  await translate();
  expect(messageApi.translateTranscript).toHaveBeenCalledTimes(1);
  expect(messageApi.transcribeMessageText).toHaveBeenCalledTimes(1);
  expect(messageApi.readMessageText).not.toHaveBeenCalled();
  expect(content()).toContain('原始转写');
  expect(content()).toContain('翻译结果');
  await transcribe();
  expect(tree.toJSON()).toBeNull();
  await transcribe();
  expect(content()).toContain('翻译结果');
  expect(messageApi.transcribeMessageText).toHaveBeenCalledTimes(1);
});

test('expired receipt shows explicit retranscription and never repeats paid work automatically', async () => {
  jest.mocked(messageApi.translateTranscript).mockRejectedValue(
    new MiaoxunApiError('Expired', {
      status: 409,
      code: 'CHAT_MESSAGE_AI_TRANSCRIPT_EXPIRED',
    }),
  );
  await transcribe();
  await translate();
  expect(content()).toContain('转写结果已过期');
  expect(content()).toContain('重新转写');
  await translate();
  expect(messageApi.translateTranscript).toHaveBeenCalledTimes(1);
  expect(messageApi.transcribeMessageText).toHaveBeenCalledTimes(1);
  await act(async () => state.retranscribe(voice));
  expect(messageApi.transcribeMessageText).toHaveBeenCalledTimes(2);
  expect(messageApi.translateTranscript).toHaveBeenCalledTimes(1);
  expect(state.translationFor(voice)).toBeUndefined();
  expect(content()).toContain('翻译转写');
});

test('null transcript never triggers a second transcription request and missing receipt hides translation', async () => {
  jest.mocked(messageApi.transcribeMessageText).mockResolvedValueOnce(null);
  await transcribe();
  expect(messageApi.readMessageText).not.toHaveBeenCalled();
  expect(state.canTranslateTranscript(voice)).toBe(false);
  jest
    .mocked(messageApi.transcribeMessageText)
    .mockResolvedValueOnce({ text: '转写', transcriptId: undefined });
  await transcribe();
  expect(state.canTranslateTranscript(voice)).toBe(false);
  expect(messageApi.readMessageText).not.toHaveBeenCalled();
});

test('recall, account scope changes, and application backgrounding discard results and stale replies', async () => {
  await transcribe();
  let resolve!: (value: string) => void;
  jest.mocked(messageApi.translateTranscript).mockReturnValue(
    new Promise(done => {
      resolve = done;
    }),
  );
  let pending!: Promise<void>;
  await act(async () => {
    pending = state.translateTranscript(voice);
  });
  await act(async () =>
    tree.update(
      <Harness
        currentThread={{
          ...thread,
          messages: [{ ...voice, recalledAt: '2026-11-23T08:01:00Z' }],
        }}
      />,
    ),
  );
  await act(async () => {
    resolve('should never display');
    await pending;
  });
  expect(tree.toJSON()).toBeNull();
  await act(async () => tree.update(<Harness scope="other-owner:thread" />));
  expect(state.outputFor(voice)).toBeUndefined();
  await transcribe();
  expect(state.outputFor(voice)?.status).toBe('ready');
  await act(async () => appStateChange('background'));
  expect(state.outputFor(voice)).toBeUndefined();
  await act(async () => appStateChange('active'));
  expect(state.outputFor(voice)).toBeUndefined();
});
