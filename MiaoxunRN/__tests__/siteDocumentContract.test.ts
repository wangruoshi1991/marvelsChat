import { SiteDocumentView } from '../src/models/siteDocument';
import {
  clearAIContractSession,
  setAIContractSession,
} from '../src/services/aiContract';
import { request } from '../src/services/api/http';
import { stationAgentApi } from '../src/services/api/stationAgentApi';

jest.mock('../src/services/api/http', () => ({ request: jest.fn() }));
const mockedRequest = jest.mocked(request);
const id = (n: number) =>
  `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const view = (): SiteDocumentView => ({
  document: {
    schemaVersion: 2,
    documentId: id(1),
    revision: 1,
    visibility: 'private',
    language: 'zh',
    theme: 'clean',
    title: '测试夹具页面',
    summary: '仅用于接口契约测试',
    sections: [
      {
        id: id(2),
        type: 'gallery',
        title: '引用内容',
        subtitle: '',
        body: '',
        assetIds: [id(101)],
        diaryEntryIds: [id(102)],
        actions: [{ kind: 'view-media', label: '查看照片', targetId: id(101) }],
      },
    ],
  },
  documentHash: 'a'.repeat(64),
  resourcesHash: 'b'.repeat(64),
  mediaAssets: [
    {
      id: id(101),
      userId: id(200),
      albumId: null,
      kind: 'image',
      status: 'uploaded',
      storageProvider: 'inline',
      storageKey: '',
      originalFilename: 'fixture.jpg',
      mimeType: 'image/jpeg',
      caption: '测试照片',
    },
  ],
  diaryEntries: [
    {
      id: id(102),
      userId: id(200),
      title: '测试日记',
      body: '完整测试内容',
      mood: '平静',
      visibility: 'private',
      source: 'manual',
    },
  ],
});

beforeEach(() => {
  mockedRequest.mockReset();
  setAIContractSession('owner', { aiTasks: 1, siteDocuments: 2 });
});
afterEach(clearAIContractSession);

test('the document endpoint uses the current owner and explicit page contract, returning the unchanged complete view', async () => {
  const value = view();
  const original = JSON.stringify(value);
  mockedRequest.mockResolvedValue(value);
  await expect(stationAgentApi.siteDocument('owner', id(1))).resolves.toBe(
    value,
  );
  expect(JSON.stringify(value)).toBe(original);
  expect(mockedRequest).toHaveBeenCalledWith(
    `/api/station/site-drafts/${id(1)}/document`,
    {
      token: 'owner',
      headers: { 'X-Miaoxun-AI-Contract': '1', 'X-Miaoxun-Site-Document': '2' },
    },
  );
});

test('one exact resource set supports references shared by multiple stable sections', async () => {
  const value = view();
  value.document.sections.push({ ...value.document.sections[0], id: id(3) });
  mockedRequest.mockResolvedValue(value);
  await expect(stationAgentApi.siteDocument('owner', id(1))).resolves.toBe(
    value,
  );
});

test('unresolved intents preserve ordered duplicate text without requesting additional resources', async () => {
  const value = view();
  value.document.sections[0].actions = [
    value.document.sections[0].actions[0],
    {
      kind: 'interaction-intent',
      intent: 'compose-message',
      label: '联系',
      target: { kind: 'unresolved', text: ' 用户提供的目标\n ' },
    },
    {
      kind: 'interaction-intent',
      intent: 'compose-message',
      label: '联系',
      target: { kind: 'unresolved', text: ' 用户提供的目标\n ' },
    },
  ];
  const original = JSON.stringify(value);
  mockedRequest.mockResolvedValue(value);
  await expect(stationAgentApi.siteDocument('owner', id(1))).resolves.toBe(
    value,
  );
  expect(JSON.stringify(value)).toBe(original);
  expect(mockedRequest).toHaveBeenCalledTimes(1);
});

test.each([
  {
    kind: 'interaction-intent',
    intent: 'open-link',
    label: '查看',
    target: {
      kind: 'unresolved',
      text: 'target',
      href: 'https://example.test',
    },
  },
  {
    kind: 'interaction-intent',
    intent: 'follow-user',
    label: '关注',
    target: { kind: 'resolved', text: 'target', userId: id(101) },
  },
  {
    kind: 'interaction-intent',
    intent: 'send-message',
    label: '发送',
    target: { kind: 'unresolved', text: 'target' },
  },
  { kind: 'message', label: '旧版', href: 'target' },
])(
  'rejects unsupported or executable intent fields at the mobile API boundary: %j',
  async action => {
    const value = view();
    mockedRequest.mockResolvedValue({
      ...value,
      document: {
        ...value.document,
        sections: [{ ...value.document.sections[0], actions: [action] }],
      },
    });
    await expect(
      stationAgentApi.siteDocument('owner', id(1)),
    ).rejects.toThrow();
  },
);

const invalidViews: Array<[string, (value: SiteDocumentView) => unknown]> = [
  [
    'unsupported schema',
    value => ({ ...value, document: { ...value.document, schemaVersion: 1 } }),
  ],
  [
    'unknown structural field',
    value => ({ ...value, document: { ...value.document, html: '<div />' } }),
  ],
  [
    'wrong document identity',
    value => ({
      ...value,
      document: { ...value.document, documentId: id(99) },
    }),
  ],
  [
    'invalid document digest',
    value => ({ ...value, documentHash: 'not-a-hash' }),
  ],
  [
    'invalid resources digest',
    value => ({ ...value, resourcesHash: 'b'.repeat(63) }),
  ],
  [
    'non-string document digest',
    value => ({ ...value, documentHash: [value.documentHash] }),
  ],
  [
    'non-string resources digest',
    value => ({ ...value, resourcesHash: [value.resourcesHash] }),
  ],
  ['missing media', value => ({ ...value, mediaAssets: [] })],
  ['missing diary', value => ({ ...value, diaryEntries: [] })],
  [
    'unreferenced media',
    value => ({
      ...value,
      mediaAssets: [
        ...value.mediaAssets,
        { ...value.mediaAssets[0], id: id(999) },
      ],
    }),
  ],
  [
    'unreferenced diary',
    value => ({
      ...value,
      diaryEntries: [
        ...value.diaryEntries,
        { ...value.diaryEntries[0], id: id(999) },
      ],
    }),
  ],
  [
    'duplicate media',
    value => ({
      ...value,
      mediaAssets: [value.mediaAssets[0], value.mediaAssets[0]],
    }),
  ],
  [
    'duplicate diary',
    value => ({
      ...value,
      diaryEntries: [value.diaryEntries[0], value.diaryEntries[0]],
    }),
  ],
  [
    'substituted media',
    value => ({
      ...value,
      mediaAssets: [{ ...value.mediaAssets[0], id: id(999) }],
    }),
  ],
  [
    'substituted diary',
    value => ({
      ...value,
      diaryEntries: [{ ...value.diaryEntries[0], id: id(999) }],
    }),
  ],
  [
    'unsupported media kind',
    value => ({
      ...value,
      mediaAssets: [{ ...value.mediaAssets[0], kind: 'file' }],
    }),
  ],
  [
    'unavailable media',
    value => ({
      ...value,
      mediaAssets: [{ ...value.mediaAssets[0], status: 'deleted' }],
    }),
  ],
  [
    'invalid caption',
    value => ({
      ...value,
      mediaAssets: [{ ...value.mediaAssets[0], caption: null }],
    }),
  ],
  [
    'invalid original filename',
    value => ({
      ...value,
      mediaAssets: [
        { ...value.mediaAssets[0], originalFilename: { text: 'file.jpg' } },
      ],
    }),
  ],
  [
    'invalid diary title',
    value => ({
      ...value,
      diaryEntries: [{ ...value.diaryEntries[0], title: null }],
    }),
  ],
  [
    'invalid diary body',
    value => ({
      ...value,
      diaryEntries: [{ ...value.diaryEntries[0], body: ['text'] }],
    }),
  ],
  [
    'invalid diary mood',
    value => ({
      ...value,
      diaryEntries: [{ ...value.diaryEntries[0], mood: { label: 'calm' } }],
    }),
  ],
  ['null media record', value => ({ ...value, mediaAssets: [null] })],
  ['null diary record', value => ({ ...value, diaryEntries: [null] })],
];

test.each(invalidViews)(
  'rejects %s before exposing a view to the renderer',
  async (_label, mutate) => {
    mockedRequest.mockResolvedValue(mutate(view()));
    await expect(
      stationAgentApi.siteDocument('owner', id(1)),
    ).rejects.toThrow();
  },
);

test('missing page capability or another login stops document reads before HTTP', async () => {
  setAIContractSession('owner', { aiTasks: 1 });
  await expect(stationAgentApi.siteDocument('owner', id(1))).rejects.toThrow(
    '结构化页面',
  );
  setAIContractSession('other', { aiTasks: 1, siteDocuments: 2 });
  await expect(stationAgentApi.siteDocument('owner', id(1))).rejects.toThrow(
    '当前服务器不支持',
  );
  expect(mockedRequest).not.toHaveBeenCalled();
});
