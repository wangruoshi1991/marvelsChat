jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 62, bottom: 34, left: 0, right: 0 }),
}));
jest.mock('../src/features/assist/AIAssistProvider', () => ({
  useAIAssist: () => ({
    routeKey: 'second-floor',
    getGeneration: () => 0,
    open: jest.fn(),
    dismiss: jest.fn(),
    move: jest.fn(),
    release: jest.fn(),
    askButler: jest.fn(),
  }),
}));
import React from 'react';
import {
  AppState,
  PanResponder,
  ScrollView,
  StyleSheet,
  Text,
} from 'react-native';
import TestRenderer, { act } from 'react-test-renderer';
import { SecondFloorAlbums } from '../src/features/second-floor/SecondFloorAlbums';
import { SecondFloorAlbumList } from '../src/features/second-floor/SecondFloorAlbumList';
import { SecondFloorFiles } from '../src/features/second-floor/SecondFloorFiles';
import { SecondFloorScreen } from '../src/features/second-floor/SecondFloorScreen';
import { StationCreateSheet } from '../src/features/station/StationCreateSheet';
import { useMiaoxunSession } from '../src/features/session/useMiaoxunSession';
import {
  emptyProfile,
  emptyRelationships,
  emptyStationContent,
} from '../src/features/session/sessionDefaults';
import { defaultUIPreferences } from '../src/features/ui/uiPreferences';
import { xunPalette } from '../src/shared/xunPalette';
import { palettes } from '../src/shared/theme';

const palette = xunPalette(palettes.light);
const floorProps = (value = session()) => ({
  palette,
  language: 'zh' as const,
  session: value,
  onClose: jest.fn(),
  onOpenFriendThread: jest.fn(),
  onOpenProfile: jest.fn(),
  onOpenSettings: jest.fn(),
  onOpenDeleteAccount: jest.fn(),
  onOpenNotices: jest.fn(),
  onOpenPostComposer: jest.fn(),
});
const touch = (y: number, timestamp?: number, release = false) => ({
  nativeEvent: {
    pageX: 120,
    pageY: y,
    timestamp,
    touches: release ? [] : [{ pageX: 120, pageY: y, timestamp }],
    changedTouches: release ? [{ pageX: 120, pageY: y, timestamp }] : [],
  },
});

const preferences = () => {
  const value = defaultUIPreferences();
  value.fontScale = 1.2;
  value.density = 'spacious';
  value.surfaces.secondFloor = {
    buttonRadius: 21,
    buttonScale: 0.8,
    cardRadius: 25,
    rowGap: 16,
  };
  value.components.secondFloor = {
    'secondFloor.album.upload': {
      sizeScale: 0.75,
      label: '添加照片',
      icon: '↑',
    },
    'secondFloor.file.upload': {
      sizeScale: 0.75,
      label: '上传资料',
      icon: '↑',
    },
  };
  return value;
};

const album = {
  id: 'album-1',
  userId: 'owner',
  title: '相册',
  description: '',
  visibility: 'private' as const,
  mediaCount: 0,
};
const session = (uiPreferences = preferences()) =>
  ({
    token: 'local-test',
    profile: emptyProfile,
    relationships: emptyRelationships,
    stationContent: { ...emptyStationContent, albums: [album] },
    uiPreferences,
    notices: [],
    unreadNoticeCount: 0,
    listMiaoPointLedger: jest.fn(async () => []),
  } as unknown as ReturnType<typeof useMiaoxunSession>);
let renderer: TestRenderer.ReactTestRenderer;
beforeEach(() => {
  AppState.currentState = 'active';
});
afterEach(() => {
  if (renderer) act(() => renderer.unmount());
  jest.restoreAllMocks();
});
const style = (node: TestRenderer.ReactTestInstance) =>
  StyleSheet.flatten(
    typeof node.props.style === 'function'
      ? node.props.style({ pressed: false })
      : node.props.style,
  );
const button = (label: string) =>
  renderer.root.findAll(
    node =>
      node.props.accessibilityLabel === label &&
      typeof node.props.onPress === 'function',
  )[0];

test('album upload consumes confirmed appearance while preserving its native hit area', async () => {
  await act(async () => {
    renderer = TestRenderer.create(
      <SecondFloorAlbums
        palette={palette}
        language="zh"
        session={session()}
        uploadPreference={
          preferences().components.secondFloor?.['secondFloor.album.upload']
        }
      />,
    );
  });
  const upload = button('添加照片');
  expect(style(upload)).toMatchObject({
    minHeight: 44,
    minWidth: 44,
    borderRadius: 21,
  });
  expect(style(upload).transform).toBeUndefined();
  const uploadLabel = upload
    .findAllByType(Text)
    .find(node => node.props.children === '添加照片')!;
  expect(style(uploadLabel).fontSize).toBeCloseTo(13 * 1.2 * 0.8);
  const list = renderer.root.findAllByType(ScrollView)[0];
  expect(StyleSheet.flatten(list.props.contentContainerStyle).gap).toBe(18);
  const card = renderer.root.findAll(node => style(node)?.borderRadius === 25);
  expect(card.length).toBeGreaterThan(0);
  act(() => upload.props.onPress());
  expect(renderer.root.findAllByType(StationCreateSheet)).toHaveLength(1);
});

test('file upload uses the same bounded tokens and stays hidden when configured', async () => {
  const value = session();
  const render = () => (
    <SecondFloorFiles
      palette={palette}
      language="zh"
      session={value}
      uploadPreference={
        value.uiPreferences.components.secondFloor?.['secondFloor.file.upload']
      }
    />
  );
  await act(async () => {
    renderer = TestRenderer.create(render());
  });
  const upload = button('上传资料');
  expect(style(upload)).toMatchObject({
    minHeight: 44,
    minWidth: 44,
    borderRadius: 21,
  });
  expect(style(upload).transform).toBeUndefined();
  const title = renderer.root
    .findAllByType(Text)
    .find(node => node.props.children === '文件')!;
  expect(style(title).fontSize).toBeCloseTo(23 * 1.2);
  value.uiPreferences.components.secondFloor![
    'secondFloor.file.upload'
  ].visible = false;
  await act(async () => renderer.update(render()));
  expect(button('上传资料')).toBeUndefined();
});

test('combined upload sizing is bounded without scaling its native hit target', async () => {
  const value = preferences();
  value.fontScale = 1.35;
  value.surfaces.secondFloor.buttonScale = 1.3;
  const onCreate = jest.fn();
  await act(async () => {
    renderer = TestRenderer.create(
      <SecondFloorAlbumList
        palette={palettes.light}
        language="zh"
        token="test"
        albums={[]}
        mediaAssets={[]}
        uiPreferences={value}
        uploadPreference={{ sizeScale: 1.35, label: '添加照片' }}
        onCreate={onCreate}
        onOpen={jest.fn()}
        onEdit={jest.fn()}
      />,
    );
  });
  const upload = button('添加照片');
  expect(style(upload).minHeight).toBeCloseTo(44 * 1.3);
  expect(style(upload).minWidth).toBe(44);
  expect(style(upload).transform).toBeUndefined();
  act(() => upload.props.onPress());
  expect(onCreate).toHaveBeenCalledTimes(1);
});

test('file appearance applies to the saved row while detail keeps its own scrolling boundary', async () => {
  const value = session();
  const file = {
    id: 'file-1',
    originalFilename: '资料.txt',
    mimeType: 'text/plain',
    byteSize: 10,
    status: 'processed',
    storageProvider: 'inline',
    sourceKind: 'inline_text',
    preprocessingResult: { textPreview: '已保存正文' },
  };
  value.stationContent.fileAssets = [
    file,
  ] as typeof value.stationContent.fileAssets;
  value.stationFileAsset = jest.fn(async () => ({
    ...file,
    content: '完整正文',
    reference: null,
  })) as typeof value.stationFileAsset;
  const onTouchStart = jest.fn();
  await act(async () => {
    renderer = TestRenderer.create(
      <SecondFloorFiles
        palette={palette}
        language="zh"
        session={value}
        scrollProps={{ onTouchStart }}
      />,
    );
  });
  const row = button('查看资料.txt');
  expect(style(row).borderRadius).toBe(25);
  expect(renderer.root.findByType(ScrollView).props.onTouchStart).toBe(
    onTouchStart,
  );
  await act(async () => row.props.onPress());
  expect(
    renderer.root.findByType(ScrollView).props.onTouchStart,
  ).toBeUndefined();
  expect(
    renderer.root
      .findAllByType(Text)
      .some(node => node.props.children === '完整正文'),
  ).toBe(true);
});

test('second-floor module visibility and order consume confirmed preferences', async () => {
  const value = preferences();
  value.hiddenModules.secondFloor = ['albums'];
  value.layout.secondFloor.moduleOrder = ['files', 'toolTray', 'permissions'];
  await act(async () => {
    renderer = TestRenderer.create(
      <SecondFloorScreen
        palette={palette}
        language="zh"
        session={session(value)}
        onClose={jest.fn()}
        onOpenFriendThread={jest.fn()}
        onOpenProfile={jest.fn()}
        onOpenSettings={jest.fn()}
        onOpenDeleteAccount={jest.fn()}
        onOpenNotices={jest.fn()}
        onOpenPostComposer={jest.fn()}
      />,
    );
  });
  const tools = renderer.root.findAll(
    node =>
      node.props.testID?.startsWith('floor-tool-') &&
      typeof node.props.onPress === 'function',
  );
  expect(tools.map(node => node.props.testID)).not.toContain(
    'floor-tool-albums',
  );
  expect(tools[0].props.testID).toBe('floor-tool-files');
});

test('page exit uses the exact default distance and does not treat downward reading as exit', async () => {
  const props = floorProps();
  await act(async () => {
    renderer = TestRenderer.create(<SecondFloorScreen {...props} />);
  });
  const landing = () =>
    renderer.root.findByProps({ testID: 'floor-landing-scroll' }).props;
  act(() => landing().onContentSizeChange(320, 300));
  act(() => landing().onLayout({ nativeEvent: { layout: { height: 500 } } }));
  act(() => landing().onTouchStart(touch(500)));
  act(() => landing().onTouchEnd(touch(444, undefined, true)));
  expect(props.onClose).toHaveBeenCalledTimes(1);
  const next = session();
  next.uiPreferences.gestures['secondFloor.swipeToExit']!.direction = 'down';
  await act(async () =>
    renderer.update(<SecondFloorScreen {...props} session={next} />),
  );
  act(() => landing().onTouchStart(touch(400)));
  act(() => landing().onTouchEnd(touch(520, undefined, true)));
  expect(props.onClose).toHaveBeenCalledTimes(1);
});

test('page release consumes timestamp velocity only for a measured bottom upward swipe', async () => {
  const value = session();
  value.uiPreferences.gestures['secondFloor.swipeToExit']!.distance = 120;
  value.uiPreferences.gestures[
    'secondFloor.swipeToExit'
  ]!.velocityThreshold = 0.5;
  const props = floorProps(value);
  await act(async () => {
    renderer = TestRenderer.create(<SecondFloorScreen {...props} />);
  });
  const landing = renderer.root.findByProps({
    testID: 'floor-landing-scroll',
  }).props;
  act(() => landing.onContentSizeChange(320, 300));
  act(() => landing.onLayout({ nativeEvent: { layout: { height: 500 } } }));
  act(() => landing.onTouchStart(touch(500, 100)));
  act(() => landing.onTouchEnd(touch(460, 300, true)));
  expect(props.onClose).not.toHaveBeenCalled();
  act(() => landing.onTouchStart(touch(500, 400)));
  act(() => landing.onTouchEnd(touch(460, 450, true)));
  expect(props.onClose).toHaveBeenCalledTimes(1);
});

test('horizontal handle exit animation uses the horizontal axis', async () => {
  const value = session();
  value.uiPreferences.gestures['secondFloor.swipeToExit']!.direction = 'left';
  const pan = jest.spyOn(PanResponder, 'create');
  const props = floorProps(value);
  await act(async () => {
    renderer = TestRenderer.create(<SecondFloorScreen {...props} />);
  });
  expect(pan).toHaveBeenCalled();
  const floor = renderer.root.findByProps({ testID: 'second-floor' });
  const transform = StyleSheet.flatten(floor.props.style).transform;
  expect(transform).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ translateX: expect.anything() }),
    ]),
  );
  expect(transform).not.toEqual(
    expect.arrayContaining([
      expect.objectContaining({ translateY: expect.anything() }),
    ]),
  );
});

test('the headerRight return slot places the back control on the opposite side of the title', async () => {
  const value = preferences();
  value.layout.secondFloor.buttonSlots.backAction = 'headerRight';
  await act(async () => {
    renderer = TestRenderer.create(
      <SecondFloorScreen {...floorProps(session(value))} />,
    );
  });
  const header = renderer.root.findByProps({ testID: 'floor-header-layout' });
  expect(style(header).flexDirection).toBe('row-reverse');
});
