import React from 'react';
import { AppState } from 'react-native';
import ReactTestRenderer, { act } from 'react-test-renderer';
import { useChatSpeech } from '../src/features/messages/useChatSpeech';
import {
  prepareSpeechRecognition,
  startSpeechRecognition,
  SpeechRecognitionUpdate,
} from '../src/services/speechToText';

jest.mock('../src/services/speechToText', () => ({
  prepareSpeechRecognition: jest.fn(),
  startSpeechRecognition: jest.fn(),
}));
const prepare = jest.mocked(prepareSpeechRecognition);
const recognize = jest.mocked(startSpeechRecognition);
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const result = new Promise<T>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { result, resolve, reject, cancel: jest.fn(), finish: jest.fn() };
}
let controller: ReturnType<typeof useChatSpeech>;
let renderer: ReactTestRenderer.ReactTestRenderer;
let background!: (state: string) => void;
const onText = jest.fn();
const onError = jest.fn();
function Harness({
  threadId = 'thread-a',
  token = 'token-a',
}: {
  threadId?: string;
  token?: string;
}) {
  controller = useChatSpeech({
    threadId,
    token,
    language: 'zh',
    onText,
    onError,
  });
  return null;
}
async function mount(props = {}) {
  await act(async () => {
    renderer = ReactTestRenderer.create(<Harness {...props} />);
  });
}
beforeEach(() => {
  jest.clearAllMocks();
  prepare.mockImplementation(() => ({
    result: Promise.resolve(),
    cancel: jest.fn(),
  }));
  jest
    .spyOn(AppState, 'addEventListener')
    .mockImplementation((_event, listener) => {
      background = listener as (state: string) => void;
      return { remove: jest.fn() };
    });
});
afterEach(async () => {
  if (renderer) await act(async () => renderer.unmount());
  jest.restoreAllMocks();
});

test('tap keeps cancellable permission ownership and cannot open the mic after unmount', async () => {
  const permission = deferred<void>();
  prepare.mockReturnValue(permission);
  await mount();
  act(() => controller.start('tap', 'prefix'));
  await act(async () => renderer.unmount());
  expect(permission.cancel).toHaveBeenCalledTimes(1);
  await act(async () => permission.resolve());
  expect(recognize).not.toHaveBeenCalled();
  expect(onText).not.toHaveBeenCalled();
});

test.each([{ threadId: 'thread-b' }, { token: 'token-b' }])(
  'thread/account changes cancel tap and discard late results: %j',
  async props => {
    const session = deferred<string>();
    recognize.mockReturnValue(session);
    await mount();
    await act(async () => controller.start('tap', ''));
    expect(controller.isRecognizing).toBe(true);
    await act(async () => renderer.update(<Harness {...props} />));
    expect(session.cancel).toHaveBeenCalledTimes(1);
    await act(async () => session.resolve('old account text'));
    expect(onText).not.toHaveBeenCalled();
    expect(controller.isRecognizing).toBe(false);
  },
);

test('background cancels the active mic and a late result cannot update the draft', async () => {
  const session = deferred<string>();
  recognize.mockReturnValue(session);
  await mount();
  await act(async () => controller.start('tap', ''));
  act(() => background('background'));
  expect(session.cancel).toHaveBeenCalledTimes(1);
  await act(async () => session.resolve('late text'));
  expect(onText).not.toHaveBeenCalled();
  expect(onError).not.toHaveBeenCalled();
});

test('a system permission prompt becoming inactive does not cancel the approved input', async () => {
  const permission = deferred<void>();
  const session = deferred<string>();
  prepare.mockReturnValue(permission);
  recognize.mockReturnValue(session);
  await mount();
  act(() => controller.start('tap', ''));
  act(() => background('inactive'));
  expect(permission.cancel).not.toHaveBeenCalled();
  await act(async () => permission.resolve());
  expect(recognize).toHaveBeenCalledTimes(1);
  act(() => background('active'));
  await act(async () => session.resolve('approved input'));
  expect(onText).toHaveBeenCalledWith('approved input', '', 'tap');
  expect(controller.isRecognizing).toBe(false);
});

test('old hold finalizers cannot clear or finish a newer session', async () => {
  const oldSession = deferred<string>();
  const nextSession = deferred<string>();
  recognize.mockReturnValueOnce(oldSession).mockReturnValueOnce(nextSession);
  await mount();
  await act(async () => controller.start('hold', 'first'));
  act(() => controller.cancel());
  await act(async () => controller.start('hold', 'second'));
  await act(async () => oldSession.resolve('stale'));
  expect(controller.isRecognizing).toBe(true);
  act(() => controller.finish());
  expect(oldSession.finish).not.toHaveBeenCalled();
  expect(nextSession.finish).toHaveBeenCalledTimes(1);
  await act(async () => nextSession.resolve('recognized'));
  expect(onText).toHaveBeenCalledTimes(1);
  expect(onText).toHaveBeenCalledWith('recognized', 'second', 'hold');
  expect(controller.isRecognizing).toBe(false);
});

test('release while permission is preparing cancels without opening the mic', async () => {
  const permission = deferred<void>();
  prepare.mockReturnValue(permission);
  await mount();
  act(() => controller.start('hold', ''));
  act(() => controller.finish());
  expect(permission.cancel).toHaveBeenCalledTimes(1);
  await act(async () => permission.resolve());
  expect(recognize).not.toHaveBeenCalled();
});

test('only the current hold updates the confirmation draft and duplicate start is blocked synchronously', async () => {
  const session = deferred<string>();
  let update!: (value: SpeechRecognitionUpdate) => void;
  recognize.mockImplementation((_language, listener) => {
    update = listener!;
    return session;
  });
  await mount();
  await act(async () => {
    controller.start('hold', 'prefix');
    controller.start('tap', 'duplicate');
  });
  expect(prepare).toHaveBeenCalledTimes(1);
  expect(recognize).toHaveBeenCalledTimes(1);
  act(() =>
    update({ requestId: 'sample', text: 'partial', state: 'listening' }),
  );
  expect(onText).toHaveBeenCalledWith('partial', 'prefix', 'hold');
  act(() => controller.cancel());
  act(() =>
    update({ requestId: 'sample', text: 'late partial', state: 'listening' }),
  );
  await act(async () => session.resolve('late final'));
  expect(onText).toHaveBeenCalledTimes(1);
});
