import React from 'react';
import { Text, TextInput } from 'react-native';
import TestRenderer, { act } from 'react-test-renderer';
import * as Keychain from 'react-native-keychain';
import { StationSiteBuilderPanel } from '../src/features/station/StationSiteBuilderPanel';
import { StationModule } from '../src/features/station/StationHomeModules';
import { AITaskCard, Artifact } from '../src/features/ai/AIInteraction';
import { aiTaskApi } from '../src/services/api/aiTaskApi';
import { emptyProfile } from '../src/features/session/sessionDefaults';
import { AITaskDTO } from '../src/models/aiTask';
import { palettes } from '../src/shared/theme';
import { setAIContractSession } from '../src/services/aiContract';
import { stationAgentApi } from '../src/services/api/stationAgentApi';
import { SiteDocumentRenderer } from '../src/features/site-document/SiteDocumentRenderer';
import { WorkspaceButton } from '../src/shared/workspaceUi';

jest.mock('react-native-safe-area-context', () => {
  const { View } = require('react-native');
  return { SafeAreaView: View };
});
jest.mock('../src/services/api/stationAgentApi', () => ({
  stationAgentApi: { siteDocument: jest.fn() },
}));

const documentView = () => ({
  document: {
    schemaVersion: 2 as const,
    documentId: '00000000-0000-4000-8000-000000000001',
    revision: 1 as const,
    visibility: 'private' as const,
    language: 'zh' as const,
    theme: 'clean' as const,
    title: '草稿一',
    summary: '真实草稿摘要',
    sections: [
      {
        id: '00000000-0000-4000-8000-000000000002',
        type: 'about' as const,
        title: '关于我',
        subtitle: '',
        body: '介绍内容',
        assetIds: [],
        diaryEntryIds: [],
        actions: [],
      },
    ],
  },
  documentHash: 'a'.repeat(64),
  resourcesHash: 'b'.repeat(64),
  mediaAssets: [],
  diaryEntries: [],
});

jest.mock('../src/services/api/aiTaskApi', () => ({
  aiTaskApi: { list: jest.fn(), decide: jest.fn() },
}));
const task = (updates: Partial<AITaskDTO> = {}): AITaskDTO => ({
  id: 'task-site',
  contractVersion: 1,
  kind: 'site_draft',
  agentId: 'site-builder',
  agentVersion: '1',
  goal: '用户的真实请求',
  threadId: null,
  inputMessageId: null,
  status: 'queued',
  revision: 1,
  phase: 'queued',
  contextRefs: [],
  artifacts: [],
  approval: null,
  error: null,
  createdAt: '2026-10-10T00:00:00Z',
  updatedAt: '2026-10-10T00:00:00Z',
  allowedActions: ['cancel'],
  ...updates,
});
const props = () => ({
  token: 'owner-token',
  active: true,
  palette: palettes.light,
  language: 'zh' as const,
  profile: { ...emptyProfile, userId: 'owner-1' },
  readiness: { configured: true } as never,
  siteDrafts: [],
  onCreateDraft: jest.fn().mockResolvedValue({ task: task() }),
  onRefreshTaskArtifacts: jest.fn().mockResolvedValue(undefined),
  onActionMessage: jest.fn(),
  onActionError: jest.fn(),
});
let renderer: TestRenderer.ReactTestRenderer;
beforeEach(() => {
  jest.useFakeTimers();
  jest.clearAllMocks();
  setAIContractSession('owner-token', { aiTasks: 1, siteDocuments: 2 });
  jest.mocked(stationAgentApi.siteDocument).mockResolvedValue(documentView());
  jest.mocked(aiTaskApi.list).mockResolvedValue([]);
  const stored = new Map<string, { username: string; password: string }>();
  jest
    .mocked(Keychain.getGenericPassword)
    .mockImplementation(
      async options => (stored.get(options!.service!) as never) || false,
    );
  jest
    .mocked(Keychain.setGenericPassword)
    .mockImplementation(async (username, password, options) => {
      stored.set(options!.service!, { username, password });
      return true as never;
    });
  jest
    .mocked(Keychain.resetGenericPassword)
    .mockImplementation(async options => {
      stored.delete(options!.service!);
      return true;
    });
});
afterEach(() => {
  if (renderer) act(() => renderer.unmount());
  jest.restoreAllMocks();
  jest.useRealTimers();
});
const enter = (value: string) =>
  act(() => renderer.root.findByType(TextInput).props.onChangeText(value));
const submit = () => renderer.root.findByType(StationModule).props.onAction();

test('starts empty and retains the same key after a lost response, including after reopening', async () => {
  const options = props();
  options.onCreateDraft.mockRejectedValueOnce(new Error('response lost'));
  await act(async () => {
    renderer = TestRenderer.create(<StationSiteBuilderPanel {...options} />);
  });
  expect(renderer.root.findByType(TextInput).props.value).toBe('');
  expect(renderer.root.findByType(StationModule).props.actionDisabled).toBe(
    true,
  );
  enter('  我的真实主页需求  ');
  await act(async () => {
    await submit();
  });
  const original = options.onCreateDraft.mock.calls[0][0];
  expect(original.prompt).toBe('我的真实主页需求');
  expect(renderer.root.findByType(TextInput).props.value).toBe(
    '  我的真实主页需求  ',
  );
  act(() => renderer.unmount());
  await act(async () => {
    renderer = TestRenderer.create(<StationSiteBuilderPanel {...options} />);
  });
  expect(renderer.root.findByType(TextInput).props.value).toBe(
    '我的真实主页需求',
  );
  expect(
    renderer.root
      .findAllByType(Text)
      .map(node => node.props.children)
      .join(' '),
  ).toContain('上次提交尚未确认');
  await act(async () => {
    await submit();
  });
  expect(options.onCreateDraft.mock.calls[1][0]).toEqual(original);
  expect(renderer.root.findByType(AITaskCard).props.task.id).toBe('task-site');
  expect(renderer.root.findByType(TextInput).props.value).toBe('');
  expect(options.onActionMessage).toHaveBeenCalledWith('建站任务已接收');
});

test('another payload gets a new key and rapid duplicate submission sends only once', async () => {
  const options = props();
  options.onCreateDraft.mockRejectedValue(new Error('offline'));
  await act(async () => {
    renderer = TestRenderer.create(<StationSiteBuilderPanel {...options} />);
  });
  enter('第一个需求');
  await act(async () => {
    await Promise.all([submit(), submit()]);
  });
  expect(options.onCreateDraft).toHaveBeenCalledTimes(1);
  enter('更改后的需求');
  await act(async () => {
    await submit();
  });
  expect(options.onCreateDraft.mock.calls[0][0].idempotencyKey).not.toBe(
    options.onCreateDraft.mock.calls[1][0].idempotencyKey,
  );
});

test('only a previewed current revision can confirm; historical applied flags do not claim the current layout', async () => {
  const waiting = task({
    status: 'awaiting_confirmation',
    revision: 3,
    phase: 'awaiting_confirmation',
    allowedActions: ['confirm', 'reject'],
    artifacts: [{ kind: 'site_draft', id: 'draft-1', title: '草稿一' }],
    approval: {
      id: 'approval-1',
      draftId: 'draft-1',
      draftHash: 'a'.repeat(64),
      resourcesHash: 'b'.repeat(64),
      profileHash: 'profile-hash',
      expiresAt: new Date(Date.now() + 60000).toISOString(),
    },
  });
  jest.mocked(aiTaskApi.list).mockResolvedValue([waiting]);
  const options = {
    ...props(),
    siteDrafts: [
      {
        id: 'draft-1',
        title: '草稿一',
        source: 'model' as const,
        status: 'applied' as const,
        createdAt: null,
        updatedAt: null,
      },
    ],
  };
  await act(async () => {
    renderer = TestRenderer.create(<StationSiteBuilderPanel {...options} />);
  });
  expect(renderer.root.findByType(AITaskCard).props.canConfirm).toBe(false);
  expect(
    renderer.root
      .findAllByType(Text)
      .map(node => node.props.children)
      .join(' '),
  ).not.toContain('当前小站正在使用');
  await act(async () =>
    renderer.root.findAllByType(Artifact)[0].props.onPreview(),
  );
  expect(
    renderer.root.findByProps({ testID: 'site-draft-preview-draft-1' }),
  ).toBeTruthy();
  expect(renderer.root.findByType(AITaskCard).props.canConfirm).toBe(true);
  expect(renderer.root.findByType(SiteDocumentRenderer).props.view).toEqual(
    documentView(),
  );
  jest.mocked(aiTaskApi.list).mockResolvedValue([{ ...waiting, revision: 4 }]);
  await act(async () => jest.advanceTimersByTime(3000));
  expect(renderer.root.findByType(AITaskCard).props.canConfirm).toBe(false);
});

test('saved current page and task preview use the same renderer and exact stored resource bundle', async () => {
  const options = props();
  options.profile.stationConfig = {
    ...options.profile.stationConfig,
    siteDraftId: documentView().document.documentId,
  };
  await act(async () => {
    renderer = TestRenderer.create(<StationSiteBuilderPanel {...options} />);
  });
  await act(async () =>
    renderer.root
      .findAllByType(WorkspaceButton)
      .find(item => item.props.label === '查看当前页面')!
      .props.onPress(),
  );
  expect(stationAgentApi.siteDocument).toHaveBeenCalledWith(
    'owner-token',
    documentView().document.documentId,
  );
  expect(renderer.root.findByType(SiteDocumentRenderer).props.view).toEqual(
    documentView(),
  );
});

test('switching account during submission cannot inject the previous account task or toast', async () => {
  const options = props();
  let resolve!: (result: { task: AITaskDTO }) => void;
  options.onCreateDraft.mockReturnValue(
    new Promise(done => {
      resolve = done;
    }),
  );
  await act(async () => {
    renderer = TestRenderer.create(<StationSiteBuilderPanel {...options} />);
  });
  enter('私有主页');
  let pending!: Promise<void>;
  await act(async () => {
    pending = submit();
  });
  await act(async () =>
    renderer.update(
      <StationSiteBuilderPanel
        {...options}
        token="other-token"
        profile={{ ...emptyProfile, userId: 'owner-2' }}
      />,
    ),
  );
  await act(async () => {
    resolve({ task: task() });
    await pending;
  });
  expect(renderer.root.findAllByType(AITaskCard)).toHaveLength(0);
  expect(options.onActionMessage).not.toHaveBeenCalled();
  expect(renderer.root.findByType(TextInput).props.value).toBe('');
});

test('changing display language keeps an unsent user draft', async () => {
  const options = props();
  await act(async () => {
    renderer = TestRenderer.create(<StationSiteBuilderPanel {...options} />);
  });
  enter('保留我尚未提交的内容');
  await act(async () =>
    renderer.update(<StationSiteBuilderPanel {...options} language="en" />),
  );
  expect(renderer.root.findByType(TextInput).props.value).toBe(
    '保留我尚未提交的内容',
  );
});
