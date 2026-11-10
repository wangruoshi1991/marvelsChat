import React from 'react';
import { Alert, AppState, AppStateStatus, Image, Text } from 'react-native';
import Renderer, { act } from 'react-test-renderer';
import { comicRenderTask } from '../__fixtures__/comicRender';
import { StationComicDiaryPanel } from '../src/features/station/StationComicDiaryPanel';
import { useMiaoxunSession } from '../src/features/session/useMiaoxunSession';
import { StationComicDiaryDTO, StationDiaryEntryDTO } from '../src/models/api';
import { ComicRenderTaskDTO } from '../src/models/comicRender';
import { comicRenderApi } from '../src/services/api/comicRenderApi';
import { MiaoxunApiError } from '../src/services/api/http';
import {
  clearAIContractSession,
  setAIContractSession,
} from '../src/services/aiContract';
import { SettingsActionButton } from '../src/shared/settingsUi';
import { palettes } from '../src/shared/theme';

jest.mock('../src/services/api/comicRenderApi', () => ({
  comicRenderApi: {
    list: jest.fn(),
    get: jest.fn(),
    create: jest.fn(),
    cancel: jest.fn(),
    events: jest.fn(),
  },
}));

const diary: StationDiaryEntryDTO = {
  id: 'diary-1',
  userId: 'user-1',
  title: '周末',
  body: '散步回家',
  mood: '',
  source: 'manual',
  visibility: 'private',
};
const draft: StationComicDiaryDTO = {
  id: 'comic-1',
  title: '周末分镜',
  prompt: '散步',
  style: 'manga',
  sourceDiaryEntryId: diary.id,
  frames: [
    { title: '出发', caption: '早上出门' },
    { title: '回家', caption: '走到家门前' },
  ],
  summary: '两格记录',
};
const queued = comicRenderTask();
const running = comicRenderTask({
  status: 'running',
  phase: 'rendering',
  revision: 3,
  allowedActions: [],
  progress: { total: 2, succeeded: 1, failed: 0, unknown: 0 },
  frames: [
    {
      frameIndex: 1,
      status: 'succeeded',
      mediaAssetId: 'asset-1',
      errorCode: null,
    },
    { frameIndex: 2, status: 'running', mediaAssetId: null, errorCode: null },
  ],
});
const completed = comicRenderTask({
  status: 'partially_succeeded',
  phase: 'completed',
  revision: 5,
  allowedActions: [],
  progress: { total: 2, succeeded: 1, failed: 1, unknown: 0 },
  frames: [
    running.frames[0],
    {
      frameIndex: 2,
      status: 'failed',
      mediaAssetId: null,
      errorCode: 'COMIC_IMAGE_REJECTED',
    },
  ],
});
let renderer: Renderer.ReactTestRenderer | undefined;
let lifecycle: (next: AppStateStatus) => void;
let alert: jest.SpyInstance;
const props = (token = 'owner') => ({
  diary,
  comicDiaries: [draft],
  palette: palettes.light,
  language: 'zh' as const,
  session: {
    token,
    createStationComicDiary: jest.fn(async () => draft),
    deleteStationComicDiary: jest.fn(async () => {}),
  } as unknown as ReturnType<typeof useMiaoxunSession>,
  onActionMessage: jest.fn(),
  onActionError: jest.fn(),
});
const text = () =>
  renderer!.root
    .findAllByType(Text)
    .map(node => node.props.children)
    .flat(Infinity)
    .join(' ');
const button = (label: string) =>
  renderer!.root
    .findAllByType(SettingsActionButton)
    .find(node => node.props.title === label)!;
const confirm = () => {
  const buttons = alert.mock.calls[alert.mock.calls.length - 1][2];
  return buttons.find(
    (value: { style?: string; onPress?: () => void }) =>
      value.onPress && value.style !== 'cancel',
  ).onPress;
};
const mount = async (input = props()) => {
  await act(async () => {
    renderer = Renderer.create(<StationComicDiaryPanel {...input} />);
  });
  return input;
};
const advance = async (ms = 3000) => {
  await act(async () => {
    jest.advanceTimersByTime(ms);
  });
};

beforeEach(() => {
  jest.useFakeTimers();
  jest.clearAllMocks();
  AppState.currentState = 'active';
  setAIContractSession('owner', { aiTasks: 1, comicRenders: 1 });
  alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
  jest
    .spyOn(AppState, 'addEventListener')
    .mockImplementation((_type, callback) => {
      lifecycle = callback;
      return { remove: jest.fn() };
    });
  jest.mocked(comicRenderApi.list).mockResolvedValue([]);
  jest.mocked(comicRenderApi.create).mockResolvedValue(queued);
  jest.mocked(comicRenderApi.get).mockResolvedValue(running);
});
afterEach(async () => {
  await act(async () => renderer?.unmount());
  renderer = undefined;
  jest.restoreAllMocks();
  jest.useRealTimers();
  clearAIContractSession();
});

test('storyboard saving never renders images; generation confirms the saved frame count before enqueue', async () => {
  const input = await mount();
  await act(async () => button('重新生成').props.onPress());
  expect(input.session.createStationComicDiary).toHaveBeenCalledTimes(1);
  expect(comicRenderApi.create).not.toHaveBeenCalled();
  act(() => button('生成漫画画面').props.onPress());
  expect(alert.mock.calls[0][1]).toContain('2');
  expect(comicRenderApi.create).not.toHaveBeenCalled();
  let resolve!: (task: ComicRenderTaskDTO) => void;
  jest.mocked(comicRenderApi.create).mockImplementation(
    () =>
      new Promise(done => {
        resolve = done;
      }),
  );
  const action = confirm();
  act(() => {
    action();
    action();
  });
  expect(comicRenderApi.create).toHaveBeenCalledTimes(1);
  expect(comicRenderApi.create).toHaveBeenCalledWith(
    'owner',
    'comic-1',
    expect.stringMatching(/^[0-9a-f-]{36}$/),
  );
  await act(async () => resolve(queued));
  expect(text()).toContain('排队中');
});

test('running tasks show private frame images, keep the same image mounted through revisions, and stop polling when terminal', async () => {
  jest.mocked(comicRenderApi.list).mockResolvedValue([running]);
  jest
    .mocked(comicRenderApi.get)
    .mockResolvedValueOnce({ ...running, revision: 4 })
    .mockResolvedValueOnce(completed);
  await mount();
  const image = renderer!.root.findByType(Image);
  const source = image.props.source;
  expect(source).toEqual({
    uri: 'http://127.0.0.1:4390/api/station/media-assets/asset-1/file',
    headers: { Authorization: 'Bearer owner' },
  });
  expect(button('取消排队')).toBeUndefined();
  await advance();
  expect(renderer!.root.findByType(Image)).toBe(image);
  expect(renderer!.root.findByType(Image).props.source).toBe(source);
  await advance();
  expect(text()).toContain('部分完成');
  expect(text()).toContain('生成失败');
  expect(text()).not.toContain('COMIC_IMAGE_REJECTED');
  expect(renderer!.root.findAllByType(Image)).toHaveLength(1);
  await advance(30000);
  expect(comicRenderApi.get).toHaveBeenCalledTimes(2);
});

test('queued cancel uses the current revision and hides cancellation after the server starts work', async () => {
  jest.mocked(comicRenderApi.list).mockResolvedValue([queued]);
  jest.mocked(comicRenderApi.cancel).mockResolvedValue(running);
  await mount();
  await act(async () => button('取消排队').props.onPress());
  expect(comicRenderApi.cancel).toHaveBeenCalledWith('owner', queued);
  expect(button('取消排队')).toBeUndefined();
  expect(text()).toContain('生成中');
});

test('unknown dispatch shows the server explanation and never retries automatically', async () => {
  const interrupted = comicRenderTask({
    ...completed,
    status: 'interrupted',
    phase: 'interrupted',
    progress: { total: 2, succeeded: 1, failed: 0, unknown: 1 },
    frames: [
      running.frames[0],
      {
        frameIndex: 2,
        status: 'unknown',
        mediaAssetId: null,
        errorCode: 'COMIC_IMAGE_RESULT_UNKNOWN',
      },
    ],
    error: {
      code: 'COMIC_IMAGE_RESULT_UNKNOWN',
      message: '图片请求已发出，供应商结果无法确认。',
    },
  });
  jest.mocked(comicRenderApi.list).mockResolvedValue([interrupted]);
  await mount();
  expect(text()).toContain('结果未知');
  expect(text()).toContain('图片请求已发出，供应商结果无法确认。');
  await advance(30000);
  expect(comicRenderApi.get).not.toHaveBeenCalled();
  expect(comicRenderApi.create).not.toHaveBeenCalled();
});

test('provider 503 reports the real unavailability and preserves the idempotency key for explicit resubmission', async () => {
  const input = await mount();
  const unavailable = new MiaoxunApiError('图片服务尚未配置。', {
    status: 503,
    code: 'COMIC_IMAGE_PROVIDER_UNAVAILABLE',
  });
  jest.mocked(comicRenderApi.create).mockRejectedValue(unavailable);
  act(() => button('生成漫画画面').props.onPress());
  await act(async () => confirm()());
  expect(text()).toContain('图片服务尚未配置。');
  expect(input.onActionError).toHaveBeenCalledWith(unavailable);
  const key = jest.mocked(comicRenderApi.create).mock.calls[0][2];
  await advance(30000);
  expect(comicRenderApi.create).toHaveBeenCalledTimes(1);
  await act(async () => button('刷新画面任务').props.onPress());
  act(() => button('生成漫画画面').props.onPress());
  await act(async () => confirm()());
  expect(jest.mocked(comicRenderApi.create).mock.calls[1][2]).toBe(key);
});

test('authorization failure clears images and stops automatic reads until an explicit refresh', async () => {
  jest.mocked(comicRenderApi.list).mockResolvedValue([running]);
  jest
    .mocked(comicRenderApi.get)
    .mockRejectedValue(
      new MiaoxunApiError('漫画授权已撤回。', { status: 403 }),
    );
  await mount();
  await advance();
  expect(renderer!.root.findAllByType(Image)).toHaveLength(0);
  expect(text()).toContain('漫画授权已撤回。');
  await advance(30000);
  expect(comicRenderApi.get).toHaveBeenCalledTimes(1);
});

test('a failed active-task read requires a successful refresh before another generation can be submitted', async () => {
  jest.mocked(comicRenderApi.list).mockResolvedValue([running]);
  jest.mocked(comicRenderApi.get).mockRejectedValue(
    new MiaoxunApiError('网络中断，任务状态未确认。', {
      isNetworkError: true,
    }),
  );
  await mount();
  await advance();
  expect(button('生成漫画画面').props.disabled).toBe(true);
  act(() => button('生成漫画画面').props.onPress());
  expect(alert).not.toHaveBeenCalled();
  expect(comicRenderApi.create).not.toHaveBeenCalled();
  jest.mocked(comicRenderApi.list).mockResolvedValue([completed]);
  await act(async () => button('刷新画面任务').props.onPress());
  expect(button('生成漫画画面').props.disabled).toBe(false);
});

test('background clears protected results, rejects a stale read, and resumes from the server on return', async () => {
  jest.mocked(comicRenderApi.list).mockResolvedValue([running]);
  let resolve!: (value: ComicRenderTaskDTO) => void;
  jest.mocked(comicRenderApi.get).mockImplementation(
    () =>
      new Promise(done => {
        resolve = done;
      }),
  );
  await mount();
  await advance();
  act(() => lifecycle('background'));
  expect(renderer!.root.findAllByType(Image)).toHaveLength(0);
  await act(async () => resolve(completed));
  expect(renderer!.root.findAllByType(Image)).toHaveLength(0);
  await advance(30000);
  expect(comicRenderApi.get).toHaveBeenCalledTimes(1);
  jest.mocked(comicRenderApi.list).mockResolvedValue([completed]);
  await act(async () => lifecycle('active'));
  expect(text()).toContain('部分完成');
  expect(renderer!.root.findAllByType(Image)).toHaveLength(1);
  expect(comicRenderApi.list).toHaveBeenCalledTimes(2);
});

test('old confirmation and delayed task replies cannot write or repopulate another session', async () => {
  let resolve!: (value: ComicRenderTaskDTO[]) => void;
  jest
    .mocked(comicRenderApi.list)
    .mockResolvedValueOnce([])
    .mockImplementationOnce(
      () =>
        new Promise(done => {
          resolve = done;
        }),
    );
  const input = await mount();
  act(() => button('生成漫画画面').props.onPress());
  const oldConfirm = confirm();
  setAIContractSession('other', { comicRenders: 1 });
  await act(async () =>
    renderer!.update(
      <StationComicDiaryPanel
        {...input}
        session={{ ...input.session, token: 'other' }}
      />,
    ),
  );
  await act(async () => oldConfirm());
  expect(comicRenderApi.create).not.toHaveBeenCalled();
  clearAIContractSession();
  await act(async () => resolve([running]));
  expect(renderer!.root.findAllByType(Image)).toHaveLength(0);
});

test('a confirmation expires across a same-batch background and active transition', async () => {
  await mount();
  act(() => button('生成漫画画面').props.onPress());
  const oldConfirm = confirm();
  await act(async () => {
    lifecycle('background');
    lifecycle('active');
  });
  expect(comicRenderApi.list).toHaveBeenCalledTimes(2);
  await act(async () => oldConfirm());
  expect(comicRenderApi.create).not.toHaveBeenCalled();
});

test('an image load failure has an explicit task refresh and never retries the image automatically', async () => {
  jest.mocked(comicRenderApi.list).mockResolvedValue([completed]);
  await mount();
  act(() => renderer!.root.findByType(Image).props.onError());
  expect(text()).toContain('画面读取失败');
  expect(renderer!.root.findAllByType(Image)).toHaveLength(0);
  await advance(30000);
  expect(comicRenderApi.list).toHaveBeenCalledTimes(1);
  await act(async () => button('刷新画面任务').props.onPress());
  expect(comicRenderApi.list).toHaveBeenCalledTimes(2);
  expect(renderer!.root.findAllByType(Image)).toHaveLength(1);
});

test('partial success with skipped frames explains changed access and retains only the real saved image', async () => {
  jest.mocked(comicRenderApi.list).mockResolvedValue([
    comicRenderTask({
      ...completed,
      progress: { total: 2, succeeded: 1, failed: 0, unknown: 0 },
      frames: [
        running.frames[0],
        {
          frameIndex: 2,
          status: 'skipped',
          mediaAssetId: null,
          errorCode: 'AGENT_ACCESS_REVOKED',
        },
      ],
    }),
  ]);
  await mount();
  expect(text()).toContain('部分完成');
  expect(text()).toContain('未生成');
  expect(text()).toContain('重新确认漫画 Agent 授权');
  expect(text()).not.toContain('AGENT_ACCESS_REVOKED');
  expect(renderer!.root.findAllByType(Image)).toHaveLength(1);
});

test('a newly accepted bootstrap enables rendering for the same login without remounting the panel', async () => {
  setAIContractSession('owner', { aiTasks: 1 });
  const input = await mount();
  expect(button('生成漫画画面').props.disabled).toBe(true);
  expect(comicRenderApi.list).not.toHaveBeenCalled();
  setAIContractSession('owner', { aiTasks: 1, comicRenders: 1 });
  await act(async () =>
    renderer!.update(<StationComicDiaryPanel {...input} />),
  );
  expect(comicRenderApi.list).toHaveBeenCalledTimes(1);
  expect(button('生成漫画画面').props.disabled).toBe(false);
});
