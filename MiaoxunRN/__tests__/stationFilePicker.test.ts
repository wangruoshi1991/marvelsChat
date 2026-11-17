import { NativeModules } from 'react-native';
import {
  pickStationFile,
  releaseStationFile,
  uploadStationFile,
} from '../src/services/stationFilePicker';
import {
  persistentAssistReference,
  missingContextScopes,
} from '../src/features/ai/assistContext';
const file = {
  uri: 'file:///controlled/file',
  originalFilename: '说明.md',
  mimeType: 'text/plain',
  byteSize: 16,
  idempotencyKey: 'key-1',
};
const native = {
  pick: jest.fn(),
  release: jest.fn(async () => {}),
  upload: jest.fn(),
  uploadChatAttachment: jest.fn(),
};
beforeEach(() => {
  jest.clearAllMocks();
  NativeModules.MiaoxunDocumentPickerModule = native;
});
test('cancel creates no upload; unsupported and oversized selection releases temporary files', async () => {
  native.pick.mockResolvedValueOnce(null);
  expect(await pickStationFile()).toBeNull();
  expect(native.upload).not.toHaveBeenCalled();
  native.pick.mockResolvedValueOnce({
    ...file,
    originalFilename: 'source.pdf',
  });
  await expect(pickStationFile()).rejects.toThrow('UTF-8');
  native.pick.mockResolvedValueOnce({ ...file, byteSize: 262145 });
  await expect(pickStationFile()).rejects.toThrow('256KiB');
  expect(native.release).toHaveBeenCalledTimes(2);
});
test('uses raw native file transport with encoded filename and preserves key across explicit retries', async () => {
  native.pick.mockResolvedValue(file);
  const picked = (await pickStationFile())!;
  expect(picked.mimeType).toBe('text/markdown');
  native.upload.mockRejectedValueOnce(new Error('unknown'));
  await expect(uploadStationFile('token', picked)).rejects.toThrow('unknown');
  expect(native.release).not.toHaveBeenCalled();
  const asset = {
    id: 'asset',
    status: 'processed',
    reference: {
      kind: 'station-file',
      id: 'asset',
      version: 'v1',
      title: '说明.md',
    },
  };
  native.upload.mockResolvedValueOnce({
    status: 200,
    body: JSON.stringify({ data: asset }),
  });
  expect(await uploadStationFile('token', picked)).toEqual(asset);
  expect(native.upload.mock.calls).toEqual(
    Array(2).fill([
      'key-1',
      'token',
      'text/markdown',
      encodeURIComponent('说明.md'),
    ]),
  );
  await releaseStationFile(picked);
  expect(native.release).toHaveBeenCalledWith('key-1');
});
test('chat file uploads use the shared native contract without changing station uploads', async () => {
  const { uploadChatFile } =
    require('../src/services/api/chatAttachmentApi') as typeof import('../src/services/api/chatAttachmentApi');
  const threadId = '123e4567-e89b-42d3-a456-426614174000';
  const idempotencyKey = '123e4567-e89b-42d3-a456-426614174001';
  const attachmentId = '123e4567-e89b-42d3-a456-426614174002';
  native.uploadChatAttachment.mockResolvedValueOnce({
    status: 201,
    body: JSON.stringify({
      data: {
        id: attachmentId,
        kind: 'file',
        filename: '说明.md',
        title: '说明.md',
        mimeType: 'text/markdown',
        byteSize: 16,
        durationMs: null,
        downloadPath: `/api/chat-attachments/${attachmentId}/content`,
        data: {},
      },
    }),
  });

  await uploadChatFile({
    threadId,
    token: 'chat-token',
    nativeKey: 'picker-key',
    filename: '说明.md',
    mimeType: 'text/markdown',
    idempotencyKey,
  });

  expect(native.uploadChatAttachment).toHaveBeenCalledWith(
    'picker-key',
    threadId,
    'chat-token',
    'text/markdown',
    encodeURIComponent('说明.md'),
    idempotencyKey,
  );
  expect(native.upload).not.toHaveBeenCalled();
});
test('rejects server errors, unreadable response and incomplete parse without inventing a reference', async () => {
  native.upload.mockResolvedValueOnce({
    status: 413,
    body: JSON.stringify({ error: { message: '超限', code: 'limit' } }),
  });
  await expect(uploadStationFile('token', file)).rejects.toMatchObject({
    status: 413,
    message: '超限',
  });
  native.upload.mockResolvedValueOnce({ status: 201, body: '{}' });
  await expect(uploadStationFile('token', file)).rejects.toThrow('解析');
  native.upload.mockResolvedValueOnce({ status: 201, body: '<html>' });
  await expect(uploadStationFile('token', file)).rejects.toThrow('无法确认');
});
test('file reference requires files read and never includes preview text', () => {
  expect(
    missingContextScopes(
      [{ kind: 'station-file', id: 'asset', version: 'v1' }],
      [],
    ),
  ).toEqual(['files:read']);
  expect(
    persistentAssistReference({
      kind: 'station-file',
      id: 'asset',
      title: 'source',
      metadata: { content: 'private content', version: 'v1' },
    }),
  ).toEqual({
    kind: 'station-file',
    id: 'asset',
    title: 'source',
    version: 'v1',
  });
});
