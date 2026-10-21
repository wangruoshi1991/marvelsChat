jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 62, bottom: 34, left: 0, right: 0 }),
}));
import React from 'react';
import {
  AppState,
  BackHandler,
  Image,
  Keyboard,
  PanResponder,
  StyleSheet,
  Text,
  TextInput,
} from 'react-native';
import TestRenderer, { act } from 'react-test-renderer';
import { SecondFloorScreen } from '../src/features/second-floor/SecondFloorScreen';
import { SecondFloorAlbums } from '../src/features/second-floor/SecondFloorAlbums';
import { SecondFloorAlbumList } from '../src/features/second-floor/SecondFloorAlbumList';
import { SecondFloorFiles } from '../src/features/second-floor/SecondFloorFiles';
import { SecondFloorAssets } from '../src/features/second-floor/SecondFloorAssets';
import { SecondFloorRelationships } from '../src/features/second-floor/SecondFloorRelationships';
import { SecondFloorInformation } from '../src/features/second-floor/SecondFloorInformation';
import { SecondFloorPermissions } from '../src/features/second-floor/SecondFloorPermissions';
import { StationCreateSheet } from '../src/features/station/StationCreateSheet';
import { StationContentManageSheet } from '../src/features/station/StationContentManageSheet';
import {
  emptyProfile,
  emptyRelationships,
  emptyStationContent,
} from '../src/features/session/sessionDefaults';
import { useMiaoxunSession } from '../src/features/session/useMiaoxunSession';
import { palettes } from '../src/shared/theme';
import { AIAssistGestureSurface } from '../src/features/assist/AIAssistGestureSurface';

// The files panel lists app-generated outcomes; keep these tests off the network.
jest.mock('../src/services/api/agentWorkspaceApi', () => ({
  agentWorkspaceApi: { list: jest.fn(() => new Promise(() => undefined)) },
}));
jest.mock('../src/features/assist/AIAssistProvider', () => ({
  useAIAssist: () => mockAssist,
}));
const mockAssist = {
  open: jest.fn(),
  dismiss: jest.fn(),
  move: jest.fn(),
  release: jest.fn(),
  askButler: jest.fn(),
  routeKey: 'second-floor',
  getGeneration: () => 0,
};

// Isolated test inputs; product data comes only from the session and APIs.
const album = {
  id: 'album-1',
  userId: 'owner',
  title: '用户相册',
  description: '用户说明',
  visibility: 'private' as const,
  mediaCount: 1,
};
const file = {
  id: 'file-1',
  originalFilename: '用户素材.txt',
  mimeType: 'text/plain',
  byteSize: 12,
  status: 'processed',
  storageProvider: 'inline',
  sourceKind: 'inline_text',
  preprocessingResult: { textPreview: '用户保存的真实预览' },
};
const sessionForFloor = (overrides = {}) =>
  ({
    token: 'unit-test',
    appearance: 'light',
    // The settings panel reads visibility and the language setter, so the
    // session stub carries them rather than leaving them undefined.
    language: 'zh',
    profileVisibility: {
      showBio: true,
      showAiId: true,
      showCounts: true,
      showCommunity: true,
      showActivityArea: true,
      showCollections: true,
      showPosts: true,
      showAlbum: true,
      showDiary: true,
      showMusic: true,
      showFiles: true,
      showFollowingList: true,
      showFollowersList: true,
    },
    setAppearance: jest.fn(),
    setLanguage: jest.fn(),
    updateProfileVisibility: jest.fn(async () => undefined),
    signOut: jest.fn(async () => undefined),
    profile: emptyProfile,
    stationContent: emptyStationContent,
    agents: [],
    ownedAgents: [],
    agentReadiness: {},
    relationships: emptyRelationships,
    notices: [],
    unreadNoticeCount: 0,
    refreshRelationships: jest.fn(async () => undefined),
    listMiaoPointLedger: jest.fn(async () => []),
    ...overrides,
  } as unknown as ReturnType<typeof useMiaoxunSession>);
const floorProps = (session = sessionForFloor()) => ({
  palette: palettes.light,
  language: 'zh' as const,
  session,
  onClose: jest.fn(),
  onOpenFriendThread: jest.fn(),
  onOpenProfile: jest.fn(),
  onOpenSettings: jest.fn(),
  onOpenDeleteAccount: jest.fn(),
  onOpenNotices: jest.fn(),
  onOpenPostComposer: jest.fn(),
  onOpenWorkspace: jest.fn(),
});
let renderer: TestRenderer.ReactTestRenderer;
const text = () =>
  renderer.root
    .findAllByType(Text)
    .map(node => node.props.children)
    .flat()
    .join(' ');
const button = (label: string) =>
  renderer.root
    .findAll(node => typeof node.props.onPress === 'function')
    .find(
      node =>
        node.props.accessibilityLabel === label ||
        node.findAllByType(Text).some(child => child.props.children === label),
    )!;
const tool = (key: string) =>
  renderer.root.findByProps({ testID: `floor-tool-${key}` });
const deferred = <T,>() => {
  let resolve!: (value: T) => void;
  let reject!: (cause: Error) => void;
  const promise = new Promise<T>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
};
afterEach(() => {
  if (renderer) act(() => renderer.unmount());
  jest.clearAllMocks();
  jest.restoreAllMocks();
});

test.each([320, 402, 768])(
  'tool strip fits five complete cards in a %ipx viewport and snaps to the sixth',
  async width => {
    await act(async () => {
      renderer = TestRenderer.create(<SecondFloorScreen {...floorProps()} />);
    });
    act(() =>
      renderer.root
        .findByProps({ testID: 'floor-tools-viewport' })
        .props.onLayout({ nativeEvent: { layout: { width } } }),
    );
    const strip = renderer.root.findByProps({ testID: 'floor-tools' });
    const spacing = StyleSheet.flatten(strip.props.contentContainerStyle);
    const cardWidth = StyleSheet.flatten(
      tool('albums').parent!.props.style,
    ).width;
    const fifthRight =
      spacing.paddingHorizontal + 5 * cardWidth + 4 * spacing.gap;
    const sixthRight =
      spacing.paddingHorizontal + 6 * cardWidth + 5 * spacing.gap;
    expect(fifthRight).toBeCloseTo(width - spacing.paddingHorizontal);
    expect(cardWidth).toBeGreaterThanOrEqual(44);
    expect(sixthRight - width + spacing.paddingHorizontal).toBeCloseTo(
      strip.props.snapToInterval,
    );
    expect(strip.props.decelerationRate).toBe('fast');
    act(() => tool('permissions').props.onPress());
    expect(tool('permissions').props.accessibilityState.selected).toBe(true);
  },
);

test('floor opens on albums; tools toggle independently and keep file drafts on panel switch', async () => {
  const dismiss = jest.spyOn(Keyboard, 'dismiss');
  await act(async () => {
    renderer = TestRenderer.create(<SecondFloorScreen {...floorProps()} />);
  });
  // The floor opens on 相册, so its panel is already mounted and bordered.
  expect(tool('albums').props.accessibilityState.selected).toBe(true);
  expect(renderer.root.findByType(SecondFloorAlbums)).toBeTruthy();
  expect(renderer.root.findByType(SecondFloorAlbumList).props.albums).toEqual(
    [],
  );
  expect(text()).toContain('新建相册');
  expect(
    renderer.root.findAllByProps({ accessibilityLabel: '收起相册面板' }),
  ).toHaveLength(0);
  act(() => button('新建相册').props.onPress());
  expect(renderer.root.findByType(StationCreateSheet).props.kind).toBe('album');
  act(() => renderer.root.findByType(StationCreateSheet).props.onBack());
  expect(renderer.root.findByType(SecondFloorAlbumList)).toBeTruthy();
  expect(tool('albums').props.accessibilityState.selected).toBe(true);
  expect(
    StyleSheet.flatten(
      renderer.root.findByProps({ testID: 'floor-content' }).props.style,
    ).borderWidth,
  ).toBe(1);
  // Toggling the same tool closes the panel, which is what leaves the floor
  // blank — the state the rest of this test relies on.
  act(() => tool('albums').props.onPress());
  expect(
    StyleSheet.flatten(
      renderer.root.findByProps({ testID: 'floor-content' }).props.style,
    ).borderWidth,
  ).toBeUndefined();
  expect(
    renderer.root.findByProps({ testID: 'floor-tools' }).props
      .keyboardShouldPersistTaps,
  ).toBe('handled');
  act(() => tool('files').props.onPress());
  expect(
    StyleSheet.flatten(
      renderer.root.findByProps({ testID: 'floor-content' }).props.style,
    ).backgroundColor,
  ).toBe('#FFFFFF');
  act(() => button('添加文字素材').props.onPress());
  act(() =>
    renderer.root
      .findAllByType(TextInput)[1]
      .props.onChangeText('未发送的草稿'),
  );
  act(() => tool('information').props.onPress());
  act(() => tool('files').props.onPress());
  expect(renderer.root.findAllByType(TextInput)[1].props.value).toBe(
    '未发送的草稿',
  );
  act(() => tool('files').props.onPress());
  expect(tool('files').props.accessibilityState.selected).toBe(false);
  expect(dismiss).toHaveBeenCalled();
});

test('publish opens its panel and settings acts instead of selecting a panel', async () => {
  const props = floorProps();
  await act(async () => {
    renderer = TestRenderer.create(<SecondFloorScreen {...props} />);
  });

  // The design's floor has six tools; 发布 and 设置 are the user's additions.
  act(() => tool('publish').props.onPress());
  expect(tool('publish').props.accessibilityState.selected).toBe(true);
  expect(text()).toContain('发布动态');
  expect(text()).toContain('写日记');
  // 写日记 moved here with the composer; it must open the diary sheet.
  act(() => button('写日记').props.onPress());
  expect(text()).toContain('今天想记录什么');

  // Switching tools leaves the diary sheet; settings is reached the same way.
  // Settings is now a floor panel too, not a punt to the full-screen modal.
  act(() => tool('albums').props.onPress());
  act(() => tool('settings').props.onPress());
  expect(tool('settings').props.accessibilityState.selected).toBe(true);
  expect(props.onOpenSettings).not.toHaveBeenCalled();
  expect(text()).toContain('主页展示');
  expect(text()).toContain('展示社区');
  expect(text()).toContain('展示活动区域');
});

test('file save gates every floor exit and tool switch until failure, preserving the draft', async () => {
  AppState.currentState = 'active';
  const work = deferred<typeof file>();
  const save = jest.fn(() => work.promise);
  let hardwareBack!: Parameters<typeof BackHandler.addEventListener>[1];
  jest
    .spyOn(BackHandler, 'addEventListener')
    .mockImplementation((_name, callback) => {
      hardwareBack = callback;
      return { remove: jest.fn() };
    });
  const pan = jest.spyOn(PanResponder, 'create');
  const props = floorProps(sessionForFloor({ createStationFileAsset: save }));
  await act(async () => {
    renderer = TestRenderer.create(<SecondFloorScreen {...props} />);
  });
  act(() => tool('files').props.onPress());
  act(() => button('添加文字素材').props.onPress());
  act(() => {
    const inputs = renderer.root.findAllByType(TextInput);
    inputs[0].props.onChangeText('资料.TXT');
    expect(inputs[1].props.maxLength).toBe(1000);
    inputs[1].props.onChangeText('  <p>保留的草稿</p>\n');
  });
  const submit = button('保存素材').props.onPress;
  act(() => {
    submit();
    submit();
  });
  expect(save).toHaveBeenCalledTimes(1);
  expect(save).toHaveBeenCalledWith(
    expect.objectContaining({
      originalFilename: '资料.TXT',
      content: '  <p>保留的草稿</p>\n',
    }),
  );
  expect(tool('albums').props.disabled).toBe(true);
  act(() => tool('albums').props.onPress());
  expect(tool('files').props.accessibilityState.selected).toBe(true);
  const handle = renderer.root.findByProps({ testID: 'floor-return-gesture' });
  expect(handle.props.accessibilityState.busy).toBe(true);
  act(() => {
    handle.props.onAccessibilityTap();
    hardwareBack({} as Parameters<typeof hardwareBack>[0]);
  });
  const config = pan.mock.calls[0][0];
  const event = {} as Parameters<
    NonNullable<typeof config.onPanResponderRelease>
  >[0];
  const gesture = { dx: 0, dy: -90 } as Parameters<
    NonNullable<typeof config.onPanResponderRelease>
  >[1];
  expect(config.onMoveShouldSetPanResponder?.(event, gesture)).toBe(false);
  act(() => config.onPanResponderRelease?.(event, gesture));
  expect(props.onClose).not.toHaveBeenCalled();
  await act(async () => {
    work.reject(new Error('连接已断开'));
  });
  expect(text()).toContain('连接已断开');
  expect(renderer.root.findAllByType(TextInput)[1].props.value).toBe(
    '  <p>保留的草稿</p>\n',
  );
  expect(tool('albums').props.disabled).toBe(false);
  act(() =>
    renderer.root
      .findByProps({ testID: 'floor-return-gesture' })
      .props.onAccessibilityTap(),
  );
  expect(props.onClose).toHaveBeenCalledTimes(1);
});

test('return responder only handles upward vertical motion and ignores inactive floors', async () => {
  const pan = jest.spyOn(PanResponder, 'create');
  const props = floorProps();
  await act(async () => {
    renderer = TestRenderer.create(<SecondFloorScreen {...props} />);
  });
  const config = pan.mock.calls[0][0];
  const event = {} as Parameters<
    NonNullable<typeof config.onPanResponderRelease>
  >[0];
  const gesture = (dx: number, dy: number) =>
    ({ dx, dy } as Parameters<
      NonNullable<typeof config.onPanResponderRelease>
    >[1]);
  expect(config.onMoveShouldSetPanResponder?.(event, gesture(-80, -20))).toBe(
    false,
  );
  expect(config.onMoveShouldSetPanResponder?.(event, gesture(0, 90))).toBe(
    false,
  );
  expect(config.onMoveShouldSetPanResponder?.(event, gesture(0, -20))).toBe(
    true,
  );
  act(() => config.onPanResponderRelease?.(event, gesture(0, -40)));
  expect(props.onClose).not.toHaveBeenCalled();
  act(() => config.onPanResponderRelease?.(event, gesture(0, -56)));
  expect(props.onClose).toHaveBeenCalledTimes(1);
  act(() => renderer.update(<SecondFloorScreen {...props} active={false} />));
  act(() =>
    renderer.root
      .findByProps({ testID: 'floor-return-gesture' })
      .props.onAccessibilityTap(),
  );
  expect(props.onClose).toHaveBeenCalledTimes(1);
});

test('album creation blocks internal back until finished; details and editing return to their real parent', async () => {
  const work = deferred<{ id: string }>();
  const busy = jest.fn();
  const session = sessionForFloor({
    stationContent: { ...emptyStationContent, albums: [album] },
    createStationAlbum: jest.fn(() => work.promise),
    createStationMediaAsset: jest.fn(async () => ({ id: 'photo' })),
  });
  act(() => {
    renderer = TestRenderer.create(
      <SecondFloorAlbums
        palette={palettes.light}
        language="zh"
        session={session}
        onBusyChange={busy}
      />,
    );
  });
  act(() => renderer.root.findByType(SecondFloorAlbumList).props.onCreate());
  let submit!: Promise<void>;
  act(() => {
    submit = renderer.root.findByType(StationCreateSheet).props.onSubmit({
      kind: 'album',
      title: album.title,
      description: '',
      visibility: 'private',
      media: [{ originalFilename: 'one.jpg' }],
    });
  });
  act(() => renderer.root.findByType(StationCreateSheet).props.onBack());
  expect(renderer.root.findByType(StationCreateSheet).props.isSaving).toBe(
    true,
  );
  expect(busy).toHaveBeenLastCalledWith(true);
  await act(async () => {
    work.resolve({ id: album.id });
    await submit;
  });
  expect(busy).toHaveBeenLastCalledWith(false);
  expect(
    renderer.root.findByType(StationContentManageSheet).props.target.id,
  ).toBe(album.id);
  act(() => renderer.root.findByType(StationContentManageSheet).props.onEdit());
  expect(renderer.root.findByType(StationContentManageSheet).props.mode).toBe(
    'edit',
  );
  act(() => renderer.root.findByType(StationContentManageSheet).props.onBack());
  expect(renderer.root.findByType(StationContentManageSheet).props.mode).toBe(
    'detail',
  );
  act(() => renderer.root.findByType(StationContentManageSheet).props.onBack());
  expect(renderer.root.findByType(SecondFloorAlbumList)).toBeTruthy();
});

test('late album creation response after unmount cannot upload selected photos', async () => {
  const work = deferred<{ id: string }>();
  const upload = jest.fn();
  act(() => {
    renderer = TestRenderer.create(
      <SecondFloorAlbums
        palette={palettes.light}
        language="zh"
        session={sessionForFloor({
          createStationAlbum: () => work.promise,
          createStationMediaAsset: upload,
        })}
      />,
    );
  });
  act(() => renderer.root.findByType(SecondFloorAlbumList).props.onCreate());
  let submit!: Promise<void>;
  act(() => {
    submit = renderer.root.findByType(StationCreateSheet).props.onSubmit({
      kind: 'album',
      title: '测试',
      description: '',
      visibility: 'private',
      media: [{ originalFilename: 'one.jpg' }],
    });
    renderer.unmount();
  });
  await act(async () => {
    work.resolve({ id: album.id });
    await submit;
  });
  expect(upload).not.toHaveBeenCalled();
});

test('album covers use authenticated uploaded image references and open their real album', () => {
  const open = jest.fn();
  const media = [
    {
      id: 'not-ready',
      albumId: album.id,
      kind: 'image',
      status: 'pending_upload',
    },
    { id: 'real-cover', albumId: album.id, kind: 'image', status: 'uploaded' },
  ] as unknown as Parameters<typeof SecondFloorAlbumList>[0]['mediaAssets'];
  act(() => {
    renderer = TestRenderer.create(
      <SecondFloorAlbumList
        palette={palettes.light}
        language="zh"
        token="unit-token"
        albums={[album]}
        mediaAssets={media}
        onCreate={jest.fn()}
        onOpen={open}
        onEdit={jest.fn()}
      />,
    );
  });
  expect(renderer.root.findByType(Image).props.source).toEqual({
    uri: 'http://127.0.0.1:4390/api/station/media-assets/real-cover/file',
    headers: { Authorization: 'Bearer unit-token' },
  });
  act(() => button(`查看相册${album.title}`).props.onPress());
  expect(open).toHaveBeenCalledWith(album.id);
});

test('album cover and title share their real object and floor location without nested touch targets', () => {
  const open = jest.fn();
  const edit = jest.fn();
  act(() => {
    renderer = TestRenderer.create(
      <SecondFloorAlbumList
        palette={palettes.light}
        language="zh"
        token="unit-token"
        albums={[album]}
        mediaAssets={[]}
        onCreate={jest.fn()}
        onOpen={open}
        onEdit={edit}
      />,
    );
  });
  const surfaces = renderer.root.findAllByType(AIAssistGestureSurface);
  expect(surfaces).toHaveLength(2);
  surfaces.forEach(surface => {
    expect(surface.props.object).toEqual({
      kind: 'station-album',
      id: album.id,
      title: album.title,
      scene: {
        page: 'second-floor.albums',
        label: '讯 · 二楼 · 相册',
        module: { key: 'album-grid', label: '相册列表' },
      },
    });
    expect(surface.findAllByType(AIAssistGestureSurface)).toHaveLength(1);
  });
  expect(mockAssist.askButler).not.toHaveBeenCalled();
  act(() =>
    surfaces[1].props.actions
      .find((action: { label: string }) => action.label === '妙管家')
      .onSelect(surfaces[1].props.object),
  );
  expect(mockAssist.askButler).toHaveBeenCalledWith({
    ...surfaces[1].props.object,
  });
  act(() => button(`编辑相册${album.title}`).props.onPress());
  expect(edit).toHaveBeenCalledWith(album.id);
  expect(open).not.toHaveBeenCalled();
});

test('failed album covers show a retry action and ignore old image callbacks after retry', () => {
  const open = jest.fn();
  const media = [
    { id: 'real-cover', albumId: album.id, kind: 'image', status: 'uploaded' },
  ] as unknown as Parameters<typeof SecondFloorAlbumList>[0]['mediaAssets'];
  act(() => {
    renderer = TestRenderer.create(
      <SecondFloorAlbumList
        palette={palettes.light}
        language="zh"
        token="unit-token"
        albums={[album]}
        mediaAssets={media}
        onCreate={jest.fn()}
        onOpen={open}
        onEdit={jest.fn()}
      />,
    );
  });
  expect(text()).toContain('加载封面');
  const firstImageCallbacks = renderer.root.findByType(Image).props;
  act(() => firstImageCallbacks.onError());
  expect(text()).toContain('封面加载失败');
  expect(text()).toContain('点击重试');
  const coverSurface = renderer.root.findAllByType(AIAssistGestureSurface)[0];
  const openFromMenu = coverSurface.props.actions.find(
    (action: { label: string }) => action.label === '查看相册',
  );
  act(() => openFromMenu.onSelect(coverSurface.props.object));
  expect(open).toHaveBeenCalledWith(album.id);
  open.mockClear();
  act(() => button(`重新加载${album.title}封面`).props.onPress());
  expect(open).not.toHaveBeenCalled();
  expect(text()).toContain('加载封面');
  expect(text()).not.toContain('封面加载失败');
  expect(renderer.root.findByType(Image).props.source).toEqual({
    uri: 'http://127.0.0.1:4390/api/station/media-assets/real-cover/file',
    headers: { Authorization: 'Bearer unit-token' },
    cache: 'reload',
  });
  act(() => {
    firstImageCallbacks.onLoad();
    firstImageCallbacks.onError();
  });
  expect(text()).toContain('加载封面');
  expect(text()).not.toContain('封面加载失败');
  act(() => renderer.root.findByType(Image).props.onLoad());
  expect(text()).not.toContain('加载封面');
  expect(text()).not.toContain('点击重试');
  act(() => button(`查看相册${album.title}`).props.onPress());
  expect(open).toHaveBeenCalledWith(album.id);
});

test('file detail shows actual preview and explicit unsupported/unknown states, then returns to list', async () => {
  const props = {
    palette: palettes.light,
    language: 'zh' as const,
    onOpenWorkspace: jest.fn(),
    session: sessionForFloor({
      stationFileAsset: jest.fn(async () => ({
        ...file,
        status: 'unsupported',
        content: null,
        reference: null,
      })),
      stationContent: {
        ...emptyStationContent,
        fileAssets: [{ ...file, status: 'unsupported' }],
      },
    }),
  };
  act(() => {
    renderer = TestRenderer.create(<SecondFloorFiles {...props} />);
  });
  expect(text()).toContain('暂不支持处理');
  await act(async () => {
    button(`查看${file.originalFilename}`).props.onPress();
  });
  expect(text()).toContain(file.preprocessingResult.textPreview);
  act(() => button('返回文件列表').props.onPress());
  expect(button(`查看${file.originalFilename}`)).toBeTruthy();
  act(() =>
    renderer.update(
      <SecondFloorFiles
        {...props}
        session={sessionForFloor({
          stationContent: {
            ...emptyStationContent,
            fileAssets: [{ ...file, status: 'future-state' }],
          },
        })}
      />,
    ),
  );
  expect(text()).toContain('未知状态：future-state');
});

test('relationship sync prevents duplicates and reports failed empty groups; real friends still navigate', async () => {
  const work = deferred<void>();
  const refresh = jest
    .fn()
    .mockImplementationOnce(() => work.promise)
    .mockResolvedValue(undefined);
  const profile = jest.fn();
  const chat = jest.fn();
  const session = sessionForFloor({
    refreshRelationships: refresh,
    relationships: {
      ...emptyRelationships,
      friends: [
        {
          user: { id: 'friend-id', aiId: 'friend-ai' },
          profile: { nickname: '好友本人' },
        },
      ],
    },
  });
  act(() => {
    renderer = TestRenderer.create(
      <SecondFloorRelationships
        palette={palettes.light}
        language="zh"
        session={session}
        onOpenProfile={profile}
        onOpenFriendThread={chat}
      />,
    );
  });
  act(() => {
    button('正在同步关系').props.onPress();
    button('正在同步关系').props.onPress();
  });
  expect(refresh).toHaveBeenCalledTimes(1);
  await act(async () => work.reject(new Error('关系读取失败')));
  expect(text()).toContain('未能获取记录，请重试');
  expect(text()).not.toContain('暂无记录');
  act(() => {
    button('查看好友本人的主页').props.onPress();
    button('和好友本人聊天').props.onPress();
  });
  expect(profile).toHaveBeenCalledWith('friend-ai');
  expect(chat).toHaveBeenCalledWith('friend-id');
  await act(async () => button('重试同步').props.onPress());
  expect(refresh).toHaveBeenCalledTimes(2);
  expect(text()).toContain('暂无记录');
});

test('assets preserve real transactions on refresh failure without fabricating totals', async () => {
  const work = deferred<[]>();
  const entries = [
    {
      id: 'entry-1',
      userId: 'owner',
      amount: -3,
      title: '真实支出',
      description: '真实说明',
      eventType: 'spend',
      createdAt: '2026-10-12T04:00:00Z',
    },
  ];
  const load = jest
    .fn()
    .mockResolvedValueOnce(entries)
    .mockImplementationOnce(() => work.promise)
    .mockResolvedValue([]);
  await act(async () => {
    renderer = TestRenderer.create(
      <SecondFloorAssets
        palette={palettes.dark}
        language="zh"
        miaoPoints={7}
        onLoadEntries={load}
      />,
    );
  });
  expect(text()).toContain('真实支出');
  expect(text()).toContain('-3');
  expect(text()).not.toContain('累计');
  act(() => {
    button('刷新流水').props.onPress();
    button('刷新流水').props.onPress();
  });
  expect(load).toHaveBeenCalledTimes(2);
  await act(async () => work.reject(new Error('流水读取失败')));
  expect(text()).toContain('流水读取失败');
  expect(text()).toContain('真实支出');
  await act(async () => button('重试加载流水').props.onPress());
  expect(text()).toContain('暂无妙点流水');
});

test('information expands actual notice content without inventing AI decisions or marking it read', () => {
  const onOpenNotices = jest.fn();
  act(() => {
    renderer = TestRenderer.create(
      <SecondFloorInformation
        palette={palettes.light}
        language="zh"
        unreadCount={1}
        notices={[
          {
            id: 'notice-1',
            kind: 'friend.accepted',
            title: '用户通知标题',
            body: '这段内容只来自通知记录',
            readAt: null,
            createdAt: '2026-10-12T04:00:00Z',
          },
        ]}
        onOpenNotices={onOpenNotices}
      />,
    );
  });
  const notice = () => button('用户通知标题');
  expect(notice().props.accessibilityState.expanded).toBe(false);
  act(() => notice().props.onPress());
  expect(notice().props.accessibilityState.expanded).toBe(true);
  expect(text()).toContain('这段内容只来自通知记录');
  expect(text()).toContain('未读');
  expect(text()).toContain('AI 信息整理尚未开放');
  expect(text()).not.toContain('已提取');
  expect(onOpenNotices).not.toHaveBeenCalled();
  act(() => notice().props.onPress());
  expect(notice().props.accessibilityState.expanded).toBe(false);
  act(() => button('查看应用通知').props.onPress());
  expect(onOpenNotices).toHaveBeenCalledTimes(1);
});

test('second-floor privacy does not duplicate Agent authorization management', () => {
  const onOpenSettings = jest.fn();
  act(() => {
    renderer = TestRenderer.create(
      <SecondFloorPermissions
        palette={palettes.light}
        language="zh"
        onOpenSettings={onOpenSettings}
      />,
    );
  });
  expect(text()).toContain('账号与隐私');
  expect(text()).toContain('打开账号设置');
  expect(text()).not.toContain('已授权 Agent');
  expect(text()).not.toContain('读取相册');
  expect(button('移除相册管理')).toBeUndefined();
  expect(button('更新相册管理授权')).toBeUndefined();
  expect(button('打开相册管理')).toBeUndefined();
  const actions = renderer.root.findAll(
    node => typeof node.props.onPress === 'function',
  );
  expect(actions).toHaveLength(1);
  expect(actions[0].props.accessibilityRole).toBe('button');
  expect(actions[0].props.onPress).toBe(onOpenSettings);
  act(() => actions[0].props.onPress());
  expect(onOpenSettings).toHaveBeenCalledTimes(1);
});
