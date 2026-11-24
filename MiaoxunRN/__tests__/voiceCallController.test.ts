import {
  createVoiceCallController,
  VoiceCallDisplay,
} from '../src/features/voiceCalls/voiceCallController';
import {
  voiceCallApi,
  VoiceCallRecord,
} from '../src/services/api/voiceCallApi';
import { createVoiceCallMedia } from '../src/services/voiceCall/voiceCallMedia';
import { MiaoxunApiError } from '../src/services/api/http';

jest.mock('../src/services/api/voiceCallApi', () => ({
  voiceCallApi: {
    dial: jest.fn(),
    incoming: jest.fn(),
    load: jest.fn(),
    action: jest.fn(),
    send: jest.fn(),
    receive: jest.fn(),
  },
}));
jest.mock('../src/services/voiceCall/voiceCallMedia', () => ({
  createVoiceCallMedia: jest.fn(),
}));
jest.mock('../src/services/chatVoiceAudio', () => ({
  stopCurrentVoicePlayback: jest.fn(),
}));
const ringing: VoiceCallRecord = {
  id: 'call-1',
  callerUserId: 'alice',
  calleeUserId: 'bob',
  peerUserId: 'bob',
  peerName: 'Synthetic peer',
  state: 'ringing',
  createdAt: '2026-11-23T00:00:00Z',
};
const accepted = { ...ringing, state: 'accepted' as const };
const ended = { ...ringing, state: 'ended' as const };
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: Error) => void;
  const promise = new Promise<T>((done, fail) => {
    resolve = done;
    reject = fail;
  });
  return { promise, resolve, reject };
}
const flush = async () => {
  for (let i = 0; i < 15; i++) await Promise.resolve();
};
let controller: ReturnType<typeof createVoiceCallController>;
let onDisplay: jest.Mock;
let media: ReturnType<typeof createVoiceCallMedia>;
const last = () => onDisplay.mock.calls.at(-1)?.[0] as VoiceCallDisplay | null;
const setup = (userId = 'alice') => {
  controller = createVoiceCallController({
    token: 'synthetic',
    userId,
    iceServers: [],
    onDisplay,
    text: zh => zh,
  });
  controller.setForeground(true);
  return controller;
};
beforeEach(() => {
  jest.useFakeTimers();
  onDisplay = jest.fn();
  media = {
    start: jest.fn().mockResolvedValue(undefined),
    receive: jest.fn().mockResolvedValue(undefined),
    close: jest.fn(),
    mute: jest.fn(),
  };
  jest.mocked(createVoiceCallMedia).mockReturnValue(media);
  jest.mocked(voiceCallApi.dial).mockResolvedValue(ringing);
  jest.mocked(voiceCallApi.incoming).mockResolvedValue(null);
  jest.mocked(voiceCallApi.load).mockResolvedValue(accepted);
  jest.mocked(voiceCallApi.action).mockResolvedValue(ended);
  jest.mocked(voiceCallApi.receive).mockResolvedValue([]);
  jest.mocked(voiceCallApi.send).mockResolvedValue({ id: 1 });
});
afterEach(() => {
  controller?.dispose();
  jest.clearAllTimers();
  jest.useRealTimers();
  jest.resetAllMocks();
});

test('background immediately closes media even while microphone/offer startup is unresolved', async () => {
  const startup = deferred<void>();
  jest.mocked(media.start).mockReturnValue(startup.promise);
  setup();
  await controller.start('thread-1', 'Synthetic peer');
  await flush();
  expect(media.start).toHaveBeenCalledTimes(1);
  expect(last()?.phase).toBe('connecting');
  controller.setForeground(false);
  expect(media.close).toHaveBeenCalledTimes(1);
  expect(last()?.phase).toBe('ended');
  expect(voiceCallApi.action).toHaveBeenCalledWith(
    'synthetic',
    'call-1',
    'hangup',
  );
  startup.resolve();
  await flush();
  expect(voiceCallApi.receive).not.toHaveBeenCalled();
  expect(last()?.phase).toBe('ended');
});

test('ending during incoming acceptance closes the accepted late response without opening a microphone', async () => {
  const acceptance = deferred<VoiceCallRecord>();
  jest
    .mocked(voiceCallApi.incoming)
    .mockResolvedValueOnce({ ...ringing, peerUserId: 'alice' });
  jest.mocked(voiceCallApi.load).mockResolvedValue(ringing);
  jest
    .mocked(voiceCallApi.action)
    .mockImplementation(async (_token, _id, action) =>
      action === 'accept' ? acceptance.promise : ended,
    );
  setup('bob');
  await flush();
  expect(last()?.phase).toBe('incoming');
  const pending = controller.accept();
  expect(last()?.phase).toBe('connecting');
  await controller.end();
  expect(last()).toBeNull();
  acceptance.resolve(accepted);
  await pending;
  await flush();
  expect(
    jest.mocked(voiceCallApi.action).mock.calls.map(call => call[2]),
  ).toEqual(['accept', 'decline', 'hangup']);
  expect(createVoiceCallMedia).not.toHaveBeenCalled();
  expect(last()).toBeNull();
});

test('cancel racing peer acceptance reads authoritative state and hangs up the accepted call', async () => {
  jest
    .mocked(voiceCallApi.load)
    .mockResolvedValueOnce(ringing)
    .mockResolvedValue(accepted);
  jest
    .mocked(voiceCallApi.action)
    .mockImplementation(async (_token, _id, action) => {
      if (action === 'cancel')
        throw new MiaoxunApiError('State changed', {
          status: 409,
          code: 'VOICE_CALL_ACTION_STATE',
        });
      return ended;
    });
  setup();
  await controller.start('thread-1', 'Synthetic peer');
  await flush();
  await controller.end();
  expect(
    jest.mocked(voiceCallApi.action).mock.calls.map(call => call[2]),
  ).toEqual(['cancel', 'hangup']);
  expect(last()).toBeNull();
  expect(createVoiceCallMedia).not.toHaveBeenCalled();
});

test('lost incoming acceptance response reads authoritative state before cleaning up', async () => {
  jest
    .mocked(voiceCallApi.incoming)
    .mockResolvedValueOnce({ ...ringing, peerUserId: 'alice' });
  jest
    .mocked(voiceCallApi.load)
    .mockResolvedValueOnce(ringing)
    .mockResolvedValueOnce(accepted);
  jest
    .mocked(voiceCallApi.action)
    .mockImplementation(async (_token, _id, action) => {
      if (action === 'accept')
        throw new MiaoxunApiError('Request timed out', {
          isNetworkError: true,
        });
      return ended;
    });
  setup('bob');
  await flush();
  expect(last()?.phase).toBe('incoming');

  await controller.accept();
  await flush();

  expect(voiceCallApi.load).toHaveBeenLastCalledWith('synthetic', 'call-1');
  expect(
    jest.mocked(voiceCallApi.action).mock.calls.map(call => call[2]),
  ).toEqual(['accept', 'hangup']);
  expect(last()?.phase).toBe('failed');
});

test('one hang-up closes the controls and media before the server replies', async () => {
  const hangup = deferred<VoiceCallRecord>();
  jest.mocked(voiceCallApi.action).mockReturnValueOnce(hangup.promise);
  setup();
  await controller.start('thread-1', 'Synthetic peer');
  await flush();
  jest.mocked(createVoiceCallMedia).mock.calls[0][0].onConnection('connected');

  const pending = controller.end();
  expect(last()).toBeNull();
  expect(media.close).toHaveBeenCalledTimes(1);
  hangup.reject(new Error('Network unavailable'));
  await expect(pending).resolves.toBe('音频已关闭，挂断回执待确认。');
  expect(last()).toBeNull();
  expect(voiceCallApi.action).toHaveBeenCalledTimes(1);
});

test('dispose while native startup is pending closes media and suppresses late connection notifications', async () => {
  const startup = deferred<void>();
  jest.mocked(media.start).mockReturnValue(startup.promise);
  setup();
  await controller.start('thread-1', 'Synthetic peer');
  await flush();
  const connection =
    jest.mocked(createVoiceCallMedia).mock.calls[0][0].onConnection;
  controller.dispose();
  const calls = onDisplay.mock.calls.length;
  expect(media.close).toHaveBeenCalledTimes(1);
  startup.resolve();
  connection('connected');
  await flush();
  expect(onDisplay).toHaveBeenCalledTimes(calls);
  expect(voiceCallApi.receive).not.toHaveBeenCalled();
});

test('late outgoing creation after user cancellation is cleaned up without becoming an outgoing call', async () => {
  const dial = deferred<VoiceCallRecord>();
  jest.mocked(voiceCallApi.dial).mockReturnValue(dial.promise);
  setup();
  const pending = controller.start('thread-1', 'Synthetic peer');
  await controller.end();
  dial.resolve(ringing);
  await pending;
  await flush();
  expect(voiceCallApi.action).toHaveBeenCalledWith(
    'synthetic',
    'call-1',
    'cancel',
  );
  expect(last()).toBeNull();
  expect(createVoiceCallMedia).not.toHaveBeenCalled();
});

test('an established call survives a short signaling network interruption', async () => {
  setup();
  await controller.start('thread-1', 'Synthetic peer');
  await flush();
  const connection =
    jest.mocked(createVoiceCallMedia).mock.calls[0][0].onConnection;
  connection('connected');
  const connectedAt = last()?.connectedAt;
  jest.mocked(voiceCallApi.load).mockRejectedValueOnce(
    new MiaoxunApiError('Transient network interruption', {
      isNetworkError: true,
    }),
  );
  await jest.advanceTimersByTimeAsync(850);
  expect(media.close).not.toHaveBeenCalled();
  expect(last()?.phase).toBe('connected');
  await jest.advanceTimersByTimeAsync(1200);
  expect(last()?.connectedAt).toBe(connectedAt);
  expect(voiceCallApi.load).toHaveBeenCalledTimes(3);
});

test('peer hangup between polling endpoints is shown as an ended call', async () => {
  setup();
  await controller.start('thread-1', 'Synthetic peer');
  await flush();
  jest.mocked(voiceCallApi.receive).mockRejectedValueOnce(
    new MiaoxunApiError('Already ended', {
      status: 409,
      code: 'VOICE_CALL_NOT_ACCEPTED',
    }),
  );
  await jest.advanceTimersByTimeAsync(850);
  expect(media.close).not.toHaveBeenCalled();
  jest.mocked(voiceCallApi.load).mockResolvedValueOnce(ended);
  await jest.advanceTimersByTimeAsync(150);
  expect(media.close).toHaveBeenCalledTimes(1);
  expect(last()?.phase).toBe('ended');
});
