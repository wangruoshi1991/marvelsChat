import {
  parseContentPreview,
  contentPreviewReference,
} from '../src/models/chatContentPreview';

export const previewFixture = {
  id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  version: 1,
  revision: 1,
  snapshotHash: 'a'.repeat(64),
  kind: 'comic',
  status: 'pending',
  threadId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
  inputMessageId: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
  outputMessageId: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
  snapshot: {
    title: '新故事',
    summary: '一场散步',
    style: 'slice-of-life',
    frameCount: 4,
    frames: Array.from({ length: 4 }, (_, index) => ({
      index: index + 1,
      title: `第${index + 1}格`,
      scene: '散步',
      caption: '',
      dialogue: '',
      mood: '',
      camera: '',
      mediaAssetIds: [],
    })),
  },
  sources: [],
  allowedActions: ['confirm', 'reject'],
  expiresAt: '2099-01-01T00:00:00.000Z',
  result: null,
};

test('accepts a complete ordered comic proposal but rejects a diary result in its branch', () => {
  expect(parseContentPreview(previewFixture).snapshot.title).toBe('新故事');
  expect(() =>
    parseContentPreview({
      ...previewFixture,
      result: { diaryEntryId: previewFixture.id },
    }),
  ).toThrow();
  expect(() =>
    parseContentPreview({ ...previewFixture, snapshotHash: 'invalid' }),
  ).toThrow();
  expect(() =>
    parseContentPreview({
      ...previewFixture,
      snapshot: { ...previewFixture.snapshot, frameCount: 2 },
    }),
  ).toThrow();
});

test('only accepts server agent preview refs in the matching visible comic thread', () => {
  const message = {
    id: previewFixture.outputMessageId,
    threadId: previewFixture.threadId,
    senderType: 'agent',
    senderName: '漫画',
    content: '',
    metadata: {
      contentPreview: { version: 1 as const, id: previewFixture.id },
    },
  };
  expect(
    contentPreviewReference(message, previewFixture.threadId, 'comic-diary'),
  ).toEqual({ version: 1, id: previewFixture.id });
  for (const item of [
    { ...message, recalledAt: 'now' },
    { ...message, localStatus: 'sending' },
    { ...message, senderType: 'user' },
    { ...message, threadId: previewFixture.id },
  ]) {
    expect(
      contentPreviewReference(item, previewFixture.threadId, 'comic-diary'),
    ).toBeNull();
  }
  expect(
    contentPreviewReference(message, previewFixture.threadId, 'site-builder'),
  ).toBeNull();
});

test('confirmed reference-image comics remain readable after private source labels are suppressed', () => {
  const photoId = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';
  const result = {
    comicDiaryId: previewFixture.id,
    comicRenderTaskId: previewFixture.inputMessageId,
  };
  expect(
    parseContentPreview({
      ...previewFixture,
      status: 'confirmed',
      allowedActions: [],
      result,
      snapshot: {
        ...previewFixture.snapshot,
        frames: previewFixture.snapshot.frames.map(frame => ({
          ...frame,
          mediaAssetIds: [photoId],
        })),
      },
    }).status,
  ).toBe('confirmed');
});

test('accepts the complete diary size contract and rejects unknown fields or oversized mood', () => {
  const value = {
    ...previewFixture,
    kind: 'diary',
    snapshot: { title: '日记', body: '字'.repeat(20000), mood: '平静' },
  };
  expect(parseContentPreview(value).kind).toBe('diary');
  expect(() =>
    parseContentPreview({
      ...value,
      snapshot: { ...value.snapshot, mood: '字'.repeat(41) },
    }),
  ).toThrow();
  expect(() => parseContentPreview({ ...value, secret: 'unknown' })).toThrow();
});
