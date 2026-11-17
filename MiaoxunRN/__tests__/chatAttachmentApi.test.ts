import {
  readChatAttachmentText,
  uploadChatFile,
  uploadChatImage,
} from '../src/services/api/chatAttachmentApi';
import { NativeModules } from 'react-native';
import {
  requestBinary,
  setAuthSessionExpiredHandler,
} from '../src/services/api/http';

jest.mock('react-native', () => ({
  NativeModules: {
    MiaoxunConfigModule: {
      apiBaseURL: 'https://api.example.test',
      buildNumber: '42',
    },
    MiaoxunDocumentPickerModule: {
      uploadChatAttachment: jest.fn(),
      requestBinary: jest.fn(),
    },
  },
}));

const attachmentId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const threadId = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const idempotencyKey = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const dto = {
  id: attachmentId,
  kind: 'image',
  filename: 'hello.jpg',
  title: 'hello.jpg',
  mimeType: 'image/jpeg',
  byteSize: 16,
  durationMs: null,
  downloadPath: `/api/chat-attachments/${attachmentId}/content`,
  data: {},
};
const stream = (chunks: Uint8Array[]) =>
  new ReadableStream<Uint8Array>({
    start(controller) {
      chunks.forEach(chunk => controller.enqueue(chunk));
      controller.close();
    },
  });
const asBytes = (value: unknown) =>
  value instanceof ArrayBuffer
    ? new Uint8Array(value)
    : new TextEncoder().encode(JSON.stringify(value));
const response = (
  status: number,
  body: unknown,
  headers: Record<string, string> = {},
) => {
  const bytes = asBytes(body);
  return {
    status,
    ok: status >= 200 && status < 300,
    headers: {
      get: (name: string) =>
        headers[name.toLowerCase()] ||
        (name.toLowerCase() === 'content-length'
          ? String(bytes.byteLength)
          : null),
    },
    body: stream([bytes]),
  } as unknown as Response;
};

beforeEach(() => {
  jest.restoreAllMocks();
  global.fetch = jest.fn();
  const picker = NativeModules.MiaoxunDocumentPickerModule as {
    requestBinary: jest.Mock;
  };
  picker.requestBinary.mockReset();
});

test('posts raw bytes with fixed API origin, auth, idempotency and attachment headers', async () => {
  const picker = NativeModules.MiaoxunDocumentPickerModule as {
    requestBinary: jest.Mock;
  };
  picker.requestBinary.mockResolvedValueOnce({
    status: 201,
    body: JSON.stringify({ data: dto }),
    requestId: 'server-request',
  });
  const result = await uploadChatImage({
    threadId,
    token: 'secret-token',
    uri: 'file:///private/photo',
    filename: 'hello world.png',
    mimeType: 'image/png',
    idempotencyKey,
  });
  expect(result).toEqual(dto);
  expect(picker.requestBinary).toHaveBeenCalledWith(
    'POST',
    `/api/threads/${threadId}/attachments/upload`,
    'secret-token',
    'file:///private/photo',
    expect.objectContaining({
      'X-Miaoxun-App-Build': '42',
      'X-Request-ID': expect.stringMatching(/^mx-/),
      'Idempotency-Key': idempotencyKey,
      'X-Miaoxun-Attachment-Kind': 'image',
      'X-Miaoxun-Attachment-Mime': 'image/png',
      'X-Miaoxun-Filename': 'hello%20world.png',
    }),
    8 * 1024 * 1024,
    8192,
  );
});

test('retries preserve the caller supplied idempotency key', async () => {
  const picker = NativeModules.MiaoxunDocumentPickerModule as {
    requestBinary: jest.Mock;
  };
  picker.requestBinary
    .mockResolvedValueOnce({ status: 201, body: JSON.stringify({ data: dto }) })
    .mockResolvedValueOnce({
      status: 201,
      body: JSON.stringify({ data: dto }),
    });
  const args = {
    threadId,
    token: 'secret-token',
    uri: 'file:///private/photo',
    filename: 'hello.png',
    mimeType: 'image/png',
    idempotencyKey,
  };
  await uploadChatImage(args);
  await uploadChatImage(args);
  expect(picker.requestBinary.mock.calls[0][4]).toEqual(
    expect.objectContaining({ 'Idempotency-Key': idempotencyKey }),
  );
  expect(picker.requestBinary.mock.calls[1][4]).toEqual(
    expect.objectContaining({ 'Idempotency-Key': idempotencyKey }),
  );
});

test('rejects malformed DTOs and structured API errors', async () => {
  const picker = NativeModules.MiaoxunDocumentPickerModule as {
    requestBinary: jest.Mock;
  };
  picker.requestBinary.mockResolvedValueOnce({
    status: 201,
    body: JSON.stringify({
      data: { ...dto, downloadPath: 'https://evil.test/file' },
    }),
  });
  await expect(
    uploadChatImage({
      threadId,
      token: 't',
      uri: 'file:///photo',
      filename: 'photo.png',
      mimeType: 'image/png',
      idempotencyKey,
    }),
  ).rejects.toThrow('附件上传结果与当前请求不一致');

  picker.requestBinary.mockResolvedValueOnce({
    status: 413,
    body: JSON.stringify({
      error: { code: 'CHAT_ATTACHMENT_TOO_LARGE', message: 'too large' },
    }),
  });
  await expect(
    uploadChatImage({
      threadId,
      token: 't',
      uri: 'file:///photo',
      filename: 'photo.png',
      mimeType: 'image/png',
      idempotencyKey,
    }),
  ).rejects.toMatchObject({ status: 413, code: 'CHAT_ATTACHMENT_TOO_LARGE' });
});

test('rejects authenticated redirects and keeps raw media and text out of logs', async () => {
  const info = jest.spyOn(console, 'info').mockImplementation(() => undefined);
  const privateText = 'private file body';
  const picker = NativeModules.MiaoxunDocumentPickerModule as {
    requestBinary: jest.Mock;
  };
  picker.requestBinary.mockResolvedValueOnce({ status: 302, body: '' });
  await expect(
    uploadChatImage({
      threadId,
      token: 'secret-token',
      uri: 'file:///private/photo',
      filename: 'private-name.png',
      mimeType: 'image/png',
      idempotencyKey,
    }),
  ).rejects.toThrow('重定向');

  const fileDto = {
    ...dto,
    kind: 'file' as const,
    filename: 'notes.txt',
    title: 'notes.txt',
    mimeType: 'text/plain',
    byteSize: new TextEncoder().encode(privateText).byteLength,
  };
  picker.requestBinary.mockResolvedValueOnce({
    status: 200,
    body: privateText,
  });
  await expect(
    readChatAttachmentText({ attachment: fileDto, token: 'secret-token' }),
  ).resolves.toBe(privateText);
  expect(picker.requestBinary).toHaveBeenCalledWith(
    'GET',
    `/api/chat-attachments/${attachmentId}/content`,
    'secret-token',
    '',
    expect.objectContaining({ 'X-Request-ID': expect.stringMatching(/^mx-/) }),
    0,
    256 * 1024,
  );
  expect(JSON.stringify(info.mock.calls)).not.toContain(privateText);
  expect(JSON.stringify(info.mock.calls)).not.toContain('4,9');
});

test('passes an explicit upload limit to the native image transport', async () => {
  const picker = NativeModules.MiaoxunDocumentPickerModule as {
    requestBinary: jest.Mock;
  };
  picker.requestBinary.mockRejectedValueOnce(new Error('上传大小超出限制。'));
  await expect(
    uploadChatImage({
      threadId,
      token: 't',
      uri: 'file:///large',
      filename: 'large.png',
      mimeType: 'image/png',
      idempotencyKey,
    }),
  ).rejects.toThrow('超出限制');
  expect(picker.requestBinary).toHaveBeenCalledWith(
    'POST',
    `/api/threads/${threadId}/attachments/upload`,
    't',
    'file:///large',
    expect.any(Object),
    8 * 1024 * 1024,
    8192,
  );
});

test('keeps native upload and download failures explicit', async () => {
  const picker = NativeModules.MiaoxunDocumentPickerModule as {
    requestBinary: jest.Mock;
  };
  picker.requestBinary.mockRejectedValueOnce(new Error('上传响应超出限制。'));
  await expect(
    uploadChatImage({
      threadId,
      token: 't',
      uri: 'file:///streaming-large',
      filename: 'large.png',
      mimeType: 'image/png',
      idempotencyKey,
    }),
  ).rejects.toThrow('超出限制');

  const fileDto = {
    ...dto,
    kind: 'file' as const,
    filename: 'notes.txt',
    title: 'notes.txt',
    mimeType: 'text/plain',
    byteSize: 1,
  };
  picker.requestBinary.mockRejectedValueOnce(new Error('下载响应超出限制。'));
  await expect(
    readChatAttachmentText({ attachment: fileDto, token: 't' }),
  ).rejects.toThrow('超出限制');
});

test('caps oversized JSON responses and handles authenticated binary 401s', async () => {
  const largeBody = new TextEncoder().encode(
    JSON.stringify({ data: dto }),
  ).length;
  const bytes = new Uint8Array(largeBody + 1);
  const picker = NativeModules.MiaoxunDocumentPickerModule as {
    requestBinary: jest.Mock;
  };
  picker.requestBinary.mockResolvedValueOnce({
    status: 201,
    body: new TextDecoder().decode(bytes),
  });
  await expect(
    uploadChatImage({
      threadId,
      token: 't',
      uri: 'file:///photo',
      filename: 'photo.png',
      mimeType: 'image/png',
      idempotencyKey,
    }),
  ).rejects.toThrow();

  const expired = jest.fn();
  setAuthSessionExpiredHandler(expired);
  try {
    jest
      .mocked(global.fetch)
      .mockResolvedValueOnce(response(401, { error: {} }));
    const result = await requestBinary('/api/private', {
      method: 'GET',
      token: 'expired-token',
    });
    expect(result.response.status).toBe(401);
    expect(expired).toHaveBeenCalledWith({
      token: 'expired-token',
      requestId: result.requestId,
    });
    // The body remains unread in this request; release its bounded-read timeout.
    result.release();
  } finally {
    setAuthSessionExpiredHandler(null);
  }
});

test('reports binary request timeout with request metadata', async () => {
  jest.useFakeTimers();
  try {
    jest.mocked(global.fetch).mockImplementation(
      (_input, init) =>
        new Promise((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () => {
            reject(Object.assign(new Error('aborted'), { name: 'AbortError' }));
          });
        }),
    );
    const pending = requestBinary('/api/private', {
      method: 'GET',
      token: 'token',
    });
    const rejection = pending.catch(error => error);
    await jest.advanceTimersByTimeAsync(20000);
    await expect(rejection).resolves.toMatchObject({
      isTimeout: true,
      isNetworkError: true,
      requestId: expect.stringMatching(/^mx-/),
    });
  } finally {
    jest.useRealTimers();
  }
});

test('keeps the binary timeout active while a response body stalls', async () => {
  jest.useFakeTimers();
  try {
    let requestSignal: AbortSignal | undefined;
    jest.mocked(global.fetch).mockImplementation((_input, init) => {
      requestSignal = init?.signal as AbortSignal;
      return Promise.resolve({
        status: 200,
        ok: true,
        headers: { get: () => null },
        body: new ReadableStream<Uint8Array>({
          start(controller) {
            requestSignal?.addEventListener('abort', () => {
              controller.error(
                Object.assign(new Error('aborted'), { name: 'AbortError' }),
              );
            });
          },
        }),
      } as unknown as Response);
    });
    const pending = requestBinary('/api/private', {
      method: 'GET',
      token: 'token',
    });
    const resultPromise = pending.then(result => result.readBytes(1024));
    const rejection = resultPromise.catch(error => error);
    await jest.advanceTimersByTimeAsync(20000);
    await expect(rejection).resolves.toMatchObject({
      isTimeout: true,
      requestId: expect.stringMatching(/^mx-/),
    });
  } finally {
    jest.useRealTimers();
  }
});

test('native file upload dispatches 401 through shared session expiry handler', async () => {
  const picker = NativeModules.MiaoxunDocumentPickerModule as {
    uploadChatAttachment: jest.Mock;
  };
  picker.uploadChatAttachment.mockResolvedValueOnce({
    status: 401,
    body: JSON.stringify({ error: { message: 'expired' } }),
  });
  const expired = jest.fn();
  const info = jest.spyOn(console, 'info').mockImplementation(() => undefined);
  setAuthSessionExpiredHandler(expired);
  try {
    await expect(
      uploadChatFile({
        threadId,
        token: 'expired-token',
        nativeKey: 'native-key',
        filename: 'notes.txt',
        mimeType: 'text/plain',
        idempotencyKey,
      }),
    ).rejects.toMatchObject({ status: 401 });
    expect(expired).toHaveBeenCalledWith({
      token: 'expired-token',
      requestId: expect.stringMatching(/^mx-/),
    });
  } finally {
    setAuthSessionExpiredHandler(null);
  }
  const failingHandler = jest
    .fn()
    .mockRejectedValue(new Error('handler failed'));
  picker.uploadChatAttachment.mockResolvedValueOnce({
    status: 401,
    body: JSON.stringify({ error: { message: 'expired' } }),
  });
  setAuthSessionExpiredHandler(failingHandler);
  try {
    await expect(
      uploadChatFile({
        threadId,
        token: 'expired-token',
        nativeKey: 'native-key',
        filename: 'notes.txt',
        mimeType: 'text/plain',
        idempotencyKey,
      }),
    ).rejects.toMatchObject({ status: 401 });
  } finally {
    setAuthSessionExpiredHandler(null);
  }
  expect(JSON.stringify(info.mock.calls)).toContain('expire-session');
});
