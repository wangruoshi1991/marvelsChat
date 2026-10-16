import React from 'react';
import { AppState, AppStateStatus, Image, Modal, Text } from 'react-native';
import Renderer, { act } from 'react-test-renderer';
import { StationOutcomesPanel } from '../src/features/station/StationOutcomesPanel';
import { stationOutcomes } from '../src/features/station/stationOutcomes';
import { SiteDocumentPreview } from '../src/features/site-document/SiteDocumentPreview';
import { emptyStationContent } from '../src/features/session/sessionDefaults';
import { palettes } from '../src/shared/theme';
import { agentWorkspace, workspaceStep } from '../__fixtures__/agentWorkspace';
import { WorkspaceButton, WorkspaceState } from '../src/shared/workspaceUi';
import { MiaoShowAvatar } from '../src/features/avatar/AvatarViews';
import { normalizeAvatarConfig } from '../src/features/avatar/avatarConfig';
import { StationOutfitDTO } from '../src/models/api';
import { stationContentApi } from '../src/services/api/stationContentApi';
import { SiteDocumentMedia } from '../src/features/site-document/SiteDocumentMedia';
import { StationMediaPreviewScreen } from '../src/features/station/StationMediaPreviewScreen';
import { SecondFloorFiles } from '../src/features/second-floor/SecondFloorFiles';
import { useMiaoxunSession } from '../src/features/session/useMiaoxunSession';

jest.mock('../src/features/workspaces/useAgentWorkspaces', () => ({
  useAgentWorkspaces: () => mockWorkspaces,
}));
jest.mock('../src/features/site-document/SiteDocumentPreview', () => ({
  SiteDocumentPreview: () => null,
}));
jest.mock('../src/services/api/stationContentApi', () => ({
  stationContentApi: { stationMediaAsset: jest.fn() },
}));
jest.mock('react-native-safe-area-context', () => ({
  SafeAreaView: require('react-native').View,
}));
const draft = {
  id: 'page-1',
  title: '页面',
  status: 'draft' as const,
  source: 'model' as const,
  createdAt: '2026-10-14T00:00:00Z',
  updatedAt: null,
};
const approval = {
  id: 'approval-1',
  draftId: draft.id,
  draftHash: 'draft-hash',
  profileHash: 'profile-hash',
  resourcesHash: 'resources-hash',
  expiresAt: '2026-10-15T00:00:00Z',
};
const outfit: StationOutfitDTO = {
  id: 'outfit-1',
  userId: 'user-a',
  title: '保存的穿搭',
  note: '',
  avatarConfig: normalizeAvatarConfig({
    seed: 'saved-outfit',
    hairColor: 'silver',
    top: 'shirt',
    bottom: 'skirt',
    action: 'wave',
  }),
  visibility: 'private',
  source: 'manual',
};
const workspace = agentWorkspace({
  status: 'succeeded',
  allowedActions: [],
  result: { kind: 'text_result', id: 'text-1', title: '分镜' },
  steps: [
    workspaceStep({
      id: 'text-1',
      key: 'storyboard',
      result: { kind: 'text_result', id: 'text-1', title: '分镜' },
      summary: '三个场景',
    }),
  ],
});
let mockWorkspaces = {
  workspaces: [workspace],
  loaded: true,
  error: '',
  refresh: jest.fn(),
};
let renderer: Renderer.ReactTestRenderer;
const open = jest.fn();
const props = {
  active: true,
  token: 'account-a',
  language: 'zh' as const,
  palette: palettes.light,
  stationContent: { ...emptyStationContent, siteDrafts: [draft] },
  onOpenWorkspace: open,
  onRefreshStationContent: jest.fn(async () => emptyStationContent),
};
beforeEach(() => {
  jest.clearAllMocks();
  jest.mocked(stationContentApi.stationMediaAsset).mockReset();
  AppState.currentState = 'active';
  mockWorkspaces = {
    workspaces: [workspace],
    loaded: true,
    error: '',
    refresh: jest.fn(),
  };
});
afterEach(async () => {
  await act(async () => renderer?.unmount());
  jest.restoreAllMocks();
});
const card = (id: string) =>
  renderer.root.findByProps({ testID: `outcome-${id}` });

test('opens completed text in its authoritative task and saved page in the existing full preview', async () => {
  await act(async () => {
    renderer = Renderer.create(<StationOutcomesPanel {...props} />);
  });
  act(() => card('text:text-1').props.onPress());
  expect(open).toHaveBeenCalledWith(workspace);
  act(() => card('site:page-1').props.onPress());
  expect(renderer.root.findByType(SiteDocumentPreview).props).toMatchObject({
    token: 'account-a',
    draftId: 'page-1',
    active: true,
  });
});

test('deduplicates workspace pages and sends pending confirmation to its owning task', () => {
  const waiting = agentWorkspace({
    status: 'awaiting_confirmation',
    approval,
    steps: [
      workspaceStep({
        result: { kind: 'site_draft', id: draft.id, title: draft.title },
      }),
    ],
  });
  const results = stationOutcomes(props.stationContent, [waiting], 'zh');
  expect(results).toHaveLength(1);
  expect(results[0].target).toEqual({ kind: 'workspace', workspace: waiting });
  expect(results[0].label).toBe('待确认页面');
  const saved = stationOutcomes(
    { ...props.stationContent, siteDrafts: [{ ...draft, status: 'applied' }] },
    [{ ...waiting, status: 'succeeded' }],
    'zh',
  );
  expect(saved).toHaveLength(1);
  expect(saved[0].target).toEqual({ kind: 'site', id: draft.id });
});

test('only the page named by the current approval is pending, while other successful pages open their own document', () => {
  const waiting = agentWorkspace({
    status: 'awaiting_confirmation',
    approval,
    result: { kind: 'site_draft', id: draft.id, title: draft.title },
    steps: [
      workspaceStep({
        id: 'node-1',
        result: { kind: 'site_draft', id: draft.id, title: draft.title },
      }),
      workspaceStep({
        id: 'node-2',
        result: { kind: 'site_draft', id: 'page-2', title: '中间稿' },
      }),
    ],
  });
  const results = stationOutcomes(emptyStationContent, [waiting], 'zh');
  expect(results.find(item => item.key === `site:${draft.id}`)).toMatchObject({
    label: '待确认页面',
    target: { kind: 'workspace', workspace: waiting },
  });
  expect(results.find(item => item.key === 'site:page-2')).toMatchObject({
    label: '页面成果',
    target: { kind: 'site', id: 'page-2' },
  });
  const saved = stationOutcomes(
    {
      ...emptyStationContent,
      siteDrafts: [{ ...draft, id: 'page-2', status: 'applied' }],
    },
    [waiting],
    'zh',
  );
  expect(saved.find(item => item.key === 'site:page-2')).toMatchObject({
    label: '已保存页面',
    target: { kind: 'site', id: 'page-2' },
  });
});

test('pages outside the current content list do not infer their present saved status from task history', () => {
  const completed = agentWorkspace({
    status: 'succeeded',
    result: { kind: 'site_draft', id: draft.id, title: draft.title },
    steps: [
      workspaceStep({
        result: { kind: 'site_draft', id: draft.id, title: draft.title },
      }),
    ],
  });
  expect(
    stationOutcomes(emptyStationContent, [completed], 'zh')[0],
  ).toMatchObject({
    label: '页面成果',
    target: { kind: 'site', id: draft.id },
  });
  expect(
    stationOutcomes(
      {
        ...emptyStationContent,
        siteDrafts: [{ ...draft, status: 'archived' }],
      },
      [completed],
      'zh',
    )[0],
  ).toMatchObject({ label: '已归档页面' });
});

test('an outfit without notes still shows its saved full avatar without requesting invented media', async () => {
  await act(async () => {
    renderer = Renderer.create(
      <StationOutcomesPanel
        {...props}
        stationContent={{ ...emptyStationContent, outfits: [outfit] }}
      />,
    );
  });
  act(() => card('outfit:outfit-1').props.onPress());
  expect(renderer.root.findByType(MiaoShowAvatar).props.config).toEqual(
    outfit.avatarConfig,
  );
  expect(renderer.root.findAllByType(Image)).toHaveLength(0);
  expect(stationContentApi.stationMediaAsset).not.toHaveBeenCalled();
});

test('linked outfit media is authorized by ID even outside the bootstrap list, then reuses the full preview', async () => {
  jest.mocked(stationContentApi.stationMediaAsset).mockResolvedValue({
    id: 'linked-asset',
    kind: 'image',
    status: 'uploaded',
  });
  await act(async () => {
    renderer = Renderer.create(
      <StationOutcomesPanel
        {...props}
        stationContent={{
          ...emptyStationContent,
          outfits: [{ ...outfit, mediaAssetId: 'linked-asset' }],
        }}
      />,
    );
  });
  await act(async () => card('outfit:outfit-1').props.onPress());
  expect(stationContentApi.stationMediaAsset).toHaveBeenCalledWith(
    'account-a',
    'linked-asset',
  );
  expect(renderer.root.findByType(Image).props.source).toEqual({
    uri: 'http://127.0.0.1:4390/api/station/media-assets/linked-asset/file',
    headers: { Authorization: 'Bearer account-a' },
  });
  act(() => renderer.root.findByType(SiteDocumentMedia).props.onOpen());
  const preview = renderer.root.findByType(StationMediaPreviewScreen);
  expect(preview.props).toMatchObject({
    asset: { id: 'linked-asset', kind: 'image' },
    token: 'account-a',
    timestampMs: null,
  });
  act(() => preview.props.onUnavailable('linked-asset'));
  expect(renderer.root.findAllByType(StationMediaPreviewScreen)).toHaveLength(
    0,
  );
  expect(renderer.root.findAllByType(Image)).toHaveLength(0);
  expect(renderer.root.findByType(WorkspaceState).props.title).toBe(
    '关联素材已不可用',
  );
});

test('unavailable linked media shows an explicit retry, preserving the saved outfit', async () => {
  jest
    .mocked(stationContentApi.stationMediaAsset)
    .mockRejectedValueOnce(new Error('Unavailable'))
    .mockResolvedValueOnce({
      id: 'linked-asset',
      kind: 'video',
      status: 'uploaded',
    });
  await act(async () => {
    renderer = Renderer.create(
      <StationOutcomesPanel
        {...props}
        stationContent={{
          ...emptyStationContent,
          outfits: [{ ...outfit, mediaAssetId: 'linked-asset' }],
        }}
      />,
    );
  });
  await act(async () => card('outfit:outfit-1').props.onPress());
  expect(renderer.root.findByType(WorkspaceState).props.title).toBe(
    '无法读取关联素材，请重试。',
  );
  expect(renderer.root.findByType(MiaoShowAvatar).props.config).toEqual(
    outfit.avatarConfig,
  );
  await act(async () =>
    renderer.root.findByType(WorkspaceState).props.onRetry(),
  );
  expect(stationContentApi.stationMediaAsset).toHaveBeenCalledTimes(2);
  act(() => renderer.root.findByType(SiteDocumentMedia).props.onOpen());
  expect(
    renderer.root.findByType(StationMediaPreviewScreen).props.asset.kind,
  ).toBe('video');
});

test('a media response for a different asset is not displayed as the outfit reference', async () => {
  jest.mocked(stationContentApi.stationMediaAsset).mockResolvedValue({
    id: 'different-asset',
    kind: 'image',
    status: 'uploaded',
  });
  await act(async () => {
    renderer = Renderer.create(
      <StationOutcomesPanel
        {...props}
        stationContent={{
          ...emptyStationContent,
          outfits: [{ ...outfit, mediaAssetId: 'linked-asset' }],
        }}
      />,
    );
  });
  await act(async () => card('outfit:outfit-1').props.onPress());
  expect(renderer.root.findAllByType(Image)).toHaveLength(0);
  expect(renderer.root.findAllByType(SiteDocumentMedia)).toHaveLength(0);
  expect(renderer.root.findByType(WorkspaceState).props.title).toBe(
    '关联素材已不可用',
  );
});

test.each(['account', 'hidden', 'background'])(
  'a pending outfit media response cannot reopen content after %s changes',
  async change => {
    let complete!: (value: {
      id: string;
      kind: 'image';
      status: 'uploaded';
    }) => void;
    jest.mocked(stationContentApi.stationMediaAsset).mockReturnValue(
      new Promise(resolve => {
        complete = resolve;
      }),
    );
    const listeners = new Set<(state: AppStateStatus) => void>();
    jest
      .spyOn(AppState, 'addEventListener')
      .mockImplementation((_event, listener) => {
        listeners.add(listener);
        return { remove: () => listeners.delete(listener) };
      });
    const outfitProps = {
      ...props,
      stationContent: {
        ...emptyStationContent,
        outfits: [{ ...outfit, mediaAssetId: 'linked-asset' }],
      },
    };
    await act(async () => {
      renderer = Renderer.create(<StationOutcomesPanel {...outfitProps} />);
    });
    await act(async () => card('outfit:outfit-1').props.onPress());
    await act(async () => {
      if (change === 'background')
        listeners.forEach(listener => listener('background'));
      else
        renderer.update(
          <StationOutcomesPanel
            {...outfitProps}
            token={change === 'account' ? 'account-b' : props.token}
            active={change !== 'hidden'}
          />,
        );
    });
    await act(async () =>
      complete({ id: 'linked-asset', kind: 'image', status: 'uploaded' }),
    );
    expect(renderer.root.findAllByType(Modal)).toHaveLength(0);
    expect(renderer.root.findAllByType(Image)).toHaveLength(0);
    expect(renderer.root.findAllByType(MiaoShowAvatar)).toHaveLength(0);
  },
);

test('never turns failed or unfinished steps into deliverable results', () => {
  const failed = {
    ...workspace,
    steps: [{ ...workspace.steps[0], status: 'failed' as const }],
  };
  expect(stationOutcomes(emptyStationContent, [failed], 'zh')).toEqual([]);
});

test('closes the previous account preview and hidden-tab preview even when IDs match', async () => {
  await act(async () => {
    renderer = Renderer.create(<StationOutcomesPanel {...props} />);
  });
  act(() => card('site:page-1').props.onPress());
  await act(async () =>
    renderer.update(<StationOutcomesPanel {...props} token="account-b" />),
  );
  expect(renderer.root.findAllByType(SiteDocumentPreview)).toHaveLength(0);
  act(() => card('site:page-1').props.onPress());
  expect(renderer.root.findByType(SiteDocumentPreview).props.token).toBe(
    'account-b',
  );
  await act(async () =>
    renderer.update(
      <StationOutcomesPanel {...props} token="account-b" active={false} />,
    ),
  );
  expect(renderer.root.findAllByType(SiteDocumentPreview)).toHaveLength(0);
});

test('renders readable storyboard fields without exposing prompt or backend metadata and clears on background', async () => {
  let appStateChanged: (state: AppStateStatus) => void = () => {};
  jest
    .spyOn(AppState, 'addEventListener')
    .mockImplementation((_event, listener) => {
      appStateChanged = listener;
      return { remove: jest.fn() };
    });
  const content = {
    ...emptyStationContent,
    comicDiaries: [
      {
        id: 'comic-1',
        title: '日记分镜',
        style: 'storyboard',
        prompt: 'INTERNAL_PROMPT',
        summary: '一天的故事',
        frames: [
          {
            title: '第一幕',
            scene: '走进公园',
            caption: '阳光正好',
            backendTrace: 'DO_NOT_DISPLAY',
          },
        ],
      },
    ],
  };
  await act(async () => {
    renderer = Renderer.create(
      <StationOutcomesPanel {...props} stationContent={content} />,
    );
  });
  act(() => card('comic:comic-1').props.onPress());
  expect(renderer.root.findAllByType(Modal)).toHaveLength(1);
  const visible = JSON.stringify(renderer.toJSON());
  expect(visible).toContain('走进公园');
  expect(visible).not.toContain('INTERNAL_PROMPT');
  expect(visible).not.toContain('DO_NOT_DISPLAY');
  act(() => appStateChanged('background'));
  expect(renderer.root.findAllByType(Modal)).toHaveLength(0);
});

test('shows retrieval failure and retry rather than claiming there are no results', async () => {
  mockWorkspaces = {
    ...mockWorkspaces,
    workspaces: [],
    error: '无法读取协作成果',
  };
  await act(async () => {
    renderer = Renderer.create(
      <StationOutcomesPanel {...props} stationContent={emptyStationContent} />,
    );
  });
  const texts = renderer.root
    .findAllByType(Text)
    .map(node => node.props.children);
  expect(texts).toContain('无法读取协作成果');
  expect(texts).not.toContain('暂无成果');
  await act(async () =>
    renderer.root.findByType(WorkspaceButton).props.onPress(),
  );
  expect(mockWorkspaces.refresh).toHaveBeenCalledTimes(1);
});

test('second floor files lists app-generated outcomes and opens their task', async () => {
  const session = {
    token: 'account-a',
    stationContent: { ...emptyStationContent, siteDrafts: [draft] },
    refreshStationContent: jest.fn(async () => emptyStationContent),
    createStationFileAsset: jest.fn(),
  } as unknown as ReturnType<typeof useMiaoxunSession>;
  await act(async () => {
    renderer = Renderer.create(
      <SecondFloorFiles
        palette={palettes.light}
        language="zh"
        session={session}
        onOpenWorkspace={open}
      />,
    );
  });
  const texts = renderer.root
    .findAllByType(Text)
    .map(node => node.props.children);
  expect(texts).toContain('App 生成文件');
  expect(session.refreshStationContent).toHaveBeenCalled();
  act(() => card('text:text-1').props.onPress());
  expect(open).toHaveBeenCalledWith(workspace);
  expect(card('site:page-1')).toBeTruthy();
});
