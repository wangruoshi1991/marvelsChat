import { customStickerApi } from '../src/services/api/customStickerApi';
import { NativeModules } from 'react-native';

jest.mock('react-native', () => ({
  NativeModules: {
    MiaoxunConfigModule: {
      apiBaseURL: 'https://api.example.test',
      buildNumber: '42',
    },
    MiaoxunDocumentPickerModule: { requestBinary: jest.fn() },
  },
}));

const stickerId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const idempotencyKey = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const sticker = {
  id: stickerId,
  mimeType: 'image/png',
  byteSize: 42,
  width: 64,
  height: 64,
  downloadPath: `/api/custom-stickers/${stickerId}/content`,
};

const stream = (bytes: Uint8Array[]) =>
  new ReadableStream<Uint8Array>({
    start(controller) {
      bytes.forEach(value => controller.enqueue(value));
      controller.close();
    },
  });

const response = (status: number, body: unknown) => {
  const bytes = new TextEncoder().encode(
    typeof body === 'string' ? body : JSON.stringify(body),
  );
  return {
    status,
    ok: status >= 200 && status < 300,
    headers: { get: () => String(bytes.byteLength) },
    body: stream([bytes]),
    text: async () => new TextDecoder().decode(bytes),
  } as unknown as Response;
};

beforeEach(() => {
  global.fetch = jest.fn();
  jest
    .mocked(
      (
        NativeModules.MiaoxunDocumentPickerModule as {
          requestBinary: jest.Mock;
        }
      ).requestBinary,
    )
    .mockReset();
});

test('lists private stickers and builds authenticated content reads', async () => {
  jest
    .mocked(global.fetch)
    .mockResolvedValueOnce(response(200, { data: [sticker] }));
  await expect(customStickerApi.list('token')).resolves.toEqual([sticker]);
  expect(customStickerApi.read(stickerId, 'token')).toEqual({
    uri: `https://api.example.test/api/custom-stickers/${stickerId}/content`,
    headers: { Authorization: 'Bearer token' },
  });
});

test('uploads only supported MIME types and rejects malformed sticker responses', async () => {
  const requestBinary = (
    NativeModules.MiaoxunDocumentPickerModule as { requestBinary: jest.Mock }
  ).requestBinary;
  requestBinary.mockResolvedValueOnce({
    status: 201,
    body: JSON.stringify({ data: sticker }),
    requestId: 'server-request',
  });
  await expect(
    customStickerApi.upload({
      token: 'token',
      uri: 'file:///sticker.png',
      mimeType: 'image/png',
      idempotencyKey,
    }),
  ).resolves.toEqual(sticker);
  expect(requestBinary).toHaveBeenCalledWith(
    'POST',
    '/api/custom-stickers/upload',
    'token',
    'file:///sticker.png',
    expect.objectContaining({
      'Idempotency-Key': idempotencyKey,
      'X-Miaoxun-Sticker-Mime': 'image/png',
    }),
    2 * 1024 * 1024,
    8192,
  );
  await expect(
    customStickerApi.upload({
      token: 'token',
      uri: 'file:///sticker.gif',
      mimeType: 'image/gif',
      idempotencyKey,
    }),
  ).rejects.toThrow('仅支持');
});
