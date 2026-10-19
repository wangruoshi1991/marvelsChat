import React from 'react';
import { Text, TextInput } from 'react-native';
import TestRenderer, { act } from 'react-test-renderer';
import { palettes } from '../src/shared/theme';
import { SecondFloorScreen } from '../src/features/second-floor/SecondFloorScreen';
import { SecondFloorFiles } from '../src/features/second-floor/SecondFloorFiles';
import { SecondFloorAlbums } from '../src/features/second-floor/SecondFloorAlbums';
import { SecondFloorAlbumList } from '../src/features/second-floor/SecondFloorAlbumList';
import { StationCreateSheet } from '../src/features/station/StationCreateSheet';
import { StationContentManageSheet } from '../src/features/station/StationContentManageSheet';
import {
  emptyProfile,
  emptyRelationships,
  emptyStationContent,
} from '../src/features/session/sessionDefaults';
import { useMiaoxunSession } from '../src/features/session/useMiaoxunSession';

jest.mock('react-native-safe-area-context', () => ({
  ...jest.requireActual('react-native-safe-area-context'),
  useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: 0, left: 0 }),
}));

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
afterEach(() => {
  if (renderer) act(() => renderer.unmount());
  jest.restoreAllMocks();
});
const sessionForFloor = (overrides = {}) =>
  ({
    token: 'unit-test',
    appearance: 'light',
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

test('second floor starts on albums, opens all six tools and returns explicitly', async () => {
  const onClose = jest.fn();
  await act(async () => {
    renderer = TestRenderer.create(
      <SecondFloorScreen
        palette={palettes.light}
        language="zh"
        session={sessionForFloor()}
        onClose={onClose}
        onOpenFriendThread={jest.fn()}
        onOpenProfile={jest.fn()}
        onOpenSettings={jest.fn()}
        onOpenDeleteAccount={jest.fn()}
        onOpenPostComposer={jest.fn()}
        onOpenNotices={jest.fn()}
        onOpenWorkspace={jest.fn()}
      />,
    );
  });
  const tools = () =>
    [
      'albums',
      'files',
      'relationships',
      'assets',
      'information',
      'permissions',
    ].map(key => renderer.root.findByProps({ testID: `floor-tool-${key}` }));
  expect(tools()).toHaveLength(6);
  // The floor opens on 相册, so exactly one tool starts selected.
  const selected = tools().filter(
    node => node.props.accessibilityState.selected,
  );
  expect(selected.map(node => node.props.testID)).toEqual([
    'floor-tool-albums',
  ]);
  // 相册 already starts open; pressing it would toggle it shut, so the loop
  // covers the other five and checks each takes over as the only selection.
  for (const key of [
    'files',
    'relationships',
    'assets',
    'information',
    'permissions',
  ]) {
    await act(async () => {
      renderer.root
        .findByProps({ testID: `floor-tool-${key}` })
        .props.onPress();
    });
    expect(
      tools().filter(node => node.props.accessibilityState.selected),
    ).toHaveLength(1);
  }
  expect(text()).toContain('账号与隐私');
  expect(text()).not.toContain('第三方平台授权和代支付尚未开放');
  const returnHandle = renderer.root.findByProps({
    testID: 'floor-return-gesture',
  });
  expect(text()).not.toContain('返回对话');
  expect(returnHandle.props.onPress).toBeUndefined();
  act(() =>
    returnHandle.props.onAccessibilityAction({
      nativeEvent: { actionName: 'activate' },
    }),
  );
  expect(onClose).toHaveBeenCalledTimes(1);
});

test('text material begins empty, prevents double submission and retains user input after failure', async () => {
  let reject!: (error: Error) => void;
  const save = jest.fn(
    () =>
      new Promise((_resolve, rejection) => {
        reject = rejection;
      }),
  );
  act(() => {
    renderer = TestRenderer.create(
      <SecondFloorFiles
        palette={palettes.light}
        language="zh"
        session={sessionForFloor({ createStationFileAsset: save })}
        onOpenWorkspace={jest.fn()}
      />,
    );
  });
  act(() => button('添加文字素材').props.onPress());
  const inputs = renderer.root.findAllByType(TextInput);
  expect(inputs.map(input => input.props.value)).toEqual(['', '']);
  act(() => {
    inputs[0].props.onChangeText('我的资料');
    inputs[1].props.onChangeText('用户输入的内容');
  });
  const submit = button('保存素材').props.onPress;
  act(() => {
    submit();
    submit();
  });
  expect(save).toHaveBeenCalledTimes(1);
  expect(save).toHaveBeenCalledWith(
    expect.objectContaining({
      content: '用户输入的内容',
      originalFilename: '我的资料.txt',
    }),
  );
  await act(async () => {
    reject(new Error('网络不可用'));
  });
  expect(text()).toContain('网络不可用');
  expect(renderer.root.findAllByType(TextInput)[1].props.value).toBe(
    '用户输入的内容',
  );
});

test('partial photo upload preserves the created album and opens its real detail instead of creating again', async () => {
  const create = jest.fn(async () => ({ id: 'created-album' }));
  const upload = jest
    .fn()
    .mockResolvedValueOnce({ id: 'first-photo' })
    .mockRejectedValueOnce(new Error('上传失败'));
  const session = sessionForFloor({
    createStationAlbum: create,
    createStationMediaAsset: upload,
  });
  act(() => {
    renderer = TestRenderer.create(
      <SecondFloorAlbums
        palette={palettes.light}
        language="zh"
        session={session}
        onBack={jest.fn()}
      />,
    );
  });
  act(() => renderer.root.findByType(SecondFloorAlbumList).props.onCreate());
  await act(async () =>
    renderer.root.findByType(StationCreateSheet).props.onSubmit({
      kind: 'album',
      title: '选择的相册',
      description: '',
      visibility: 'private',
      media: [{ originalFilename: 'one.jpg' }, { originalFilename: 'two.jpg' }],
    }),
  );
  expect(create).toHaveBeenCalledTimes(1);
  expect(upload).toHaveBeenCalledTimes(2);
  expect(text()).toContain('部分照片未完成上传');
  expect(
    renderer.root.findByType(StationContentManageSheet).props.target,
  ).toEqual({ kind: 'album', id: 'created-album' });
});
