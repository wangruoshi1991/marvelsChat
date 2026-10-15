import { DeviceEventEmitter, NativeModules } from 'react-native';
import {
  recognizeSpeechOnce,
  prepareSpeechRecognition,
  startSpeechRecognition,
} from '../src/services/speechToText';

const recognize = jest.fn();
const prepare = jest.fn();
const cancel = jest.fn();
const finish = jest.fn();
const addListener = jest.fn();
const removeListeners = jest.fn();
let resolve: (value: { text: string }) => void;
beforeEach(() => {
  jest.clearAllMocks();
  NativeModules.MiaoxunSpeechModule = {
    recognize,
    prepare,
    cancel,
    finish,
    addListener,
    removeListeners,
  };
  prepare.mockResolvedValue({ ready: true });
  recognize.mockImplementation(
    () =>
      new Promise(done => {
        resolve = done;
      }),
  );
});
afterEach(() => {
  delete NativeModules.MiaoxunSpeechModule;
});

test('current request only receives its own native transcript events', async () => {
  const update = jest.fn();
  const session = startSpeechRecognition('zh', update);
  const requestId = recognize.mock.calls[0][0];
  DeviceEventEmitter.emit('MiaoxunSpeechUpdate', {
    requestId: 'old-request',
    state: 'listening',
    text: 'private',
  });
  expect(update).not.toHaveBeenCalled();
  DeviceEventEmitter.emit('MiaoxunSpeechUpdate', {
    requestId,
    state: 'listening',
    text: 'current',
  });
  expect(update).toHaveBeenCalledTimes(1);
  session.finish();
  expect(finish).toHaveBeenCalledWith(requestId);
  resolve({ text: ' current result ' });
  await expect(session.result).resolves.toBe('current result');
  DeviceEventEmitter.emit('MiaoxunSpeechUpdate', {
    requestId,
    state: 'listening',
    text: 'late',
  });
  expect(update).toHaveBeenCalledTimes(1);
  session.cancel();
  expect(cancel).not.toHaveBeenCalled();
  expect(removeListeners).toHaveBeenCalled();
});

test('cancel is idempotent and late successful native completion is rejected', async () => {
  const update = jest.fn();
  const session = startSpeechRecognition('en', update);
  const requestId = recognize.mock.calls[0][0];
  session.cancel();
  session.cancel();
  session.finish();
  expect(cancel).toHaveBeenCalledTimes(1);
  expect(cancel).toHaveBeenCalledWith(requestId);
  expect(finish).not.toHaveBeenCalled();
  DeviceEventEmitter.emit('MiaoxunSpeechUpdate', {
    requestId,
    state: 'listening',
    text: 'late',
  });
  expect(update).not.toHaveBeenCalled();
  resolve({ text: 'must not send' });
  await expect(session.result).rejects.toMatchObject({
    code: 'speech_cancelled',
  });
});

test('one-shot callers reuse the same native service and preserve explicit failures', async () => {
  recognize.mockRejectedValueOnce(new Error('network unavailable'));
  await expect(recognizeSpeechOnce('en')).rejects.toThrow(
    'network unavailable',
  );
  expect(prepare).toHaveBeenCalledTimes(1);
  expect(recognize).toHaveBeenCalledWith(expect.any(String), 'en');
  expect(removeListeners).toHaveBeenCalled();
});

test('missing native capabilities report an error instead of invoking an old method', () => {
  NativeModules.MiaoxunSpeechModule = { recognizeOnce: jest.fn() };
  expect(() => startSpeechRecognition('zh')).toThrow('重新构建');
  expect(
    NativeModules.MiaoxunSpeechModule.recognizeOnce,
  ).not.toHaveBeenCalled();
});

test('native synchronous failure removes the subscribed listener', () => {
  recognize.mockImplementationOnce(() => {
    throw new Error('bridge unavailable');
  });
  expect(() => startSpeechRecognition('zh')).toThrow('bridge unavailable');
  expect(removeListeners).toHaveBeenCalled();
});

test('permission preparation never calls recognize and remains cancellable', async () => {
  let complete!: (response: { ready: boolean }) => void;
  prepare.mockReturnValueOnce(
    new Promise(done => {
      complete = done;
    }),
  );
  const session = prepareSpeechRecognition();
  expect(recognize).not.toHaveBeenCalled();
  session.cancel();
  session.cancel();
  expect(cancel).toHaveBeenCalledTimes(1);
  expect(cancel).toHaveBeenCalledWith(prepare.mock.calls[0][0]);
  complete({ ready: true });
  await expect(session.result).rejects.toMatchObject({
    code: 'speech_cancelled',
  });
  expect(recognize).not.toHaveBeenCalled();
});

test('one-shot permission denial is explicit and never starts recognition', async () => {
  prepare.mockRejectedValueOnce(
    Object.assign(new Error('Permission denied'), { code: 'speech_denied' }),
  );
  await expect(recognizeSpeechOnce('zh')).rejects.toMatchObject({
    code: 'speech_denied',
  });
  expect(recognize).not.toHaveBeenCalled();
});
