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
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
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
import { SecondFloorPublish } from '../src/features/second-floor/SecondFloorPublish';
import { SecondFloorSettings } from '../src/features/second-floor/SecondFloorSettings';
import { StationCreateSheet } from '../src/features/station/StationCreateSheet';
import { StationContentManageSheet } from '../src/features/station/StationContentManageSheet';
import {
  emptyProfile,
  emptyRelationships,
  emptyStationContent,
} from '../src/features/session/sessionDefaults';
import { useMiaoxunSession } from '../src/features/session/useMiaoxunSession';
import { palettes } from '../src/shared/theme';
import { xunPalette } from '../src/shared/xunPalette';
import { AIAssistGestureSurface } from '../src/features/assist/AIAssistGestureSurface';
import { ChevronDown, ChevronUp } from 'lucide-react-native';
import { defaultUIPreferences } from '../src/features/ui/uiPreferences';

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
const floorScrollEvent = (
  y = 0,
  contentHeight = 1000,
  viewportHeight = 500,
) => ({
  nativeEvent: {
    contentOffset: { x: 0, y },
    contentSize: { width: 390, height: contentHeight },
    layoutMeasurement: { width: 390, height: viewportHeight },
  },
});
const floorTouchEvent = (pageY: number, pageX = 120, count = 1) => ({
  nativeEvent: {
    pageX,
    pageY,
    touches: Array.from({ length: count }, () => ({ pageX, pageY })),
    changedTouches: count === 0 ? [{ pageX, pageY }] : [],
  },
});
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

test('V15 Xun floor opens on the personal-space landing with six visible tools', async () => {
  const scrollTo = jest
    .spyOn(ScrollView.prototype, 'scrollTo')
    .mockImplementation(() => undefined);
  const props = {
    ...floorProps(),
    palette: xunPalette(palettes.light),
  };
  await act(async () => {
    renderer = TestRenderer.create(<SecondFloorScreen {...props} />);
  });

  expect(text()).toContain('二楼 · 个人空间');
  expect(text()).toContain('你的生活，有序安放。');
  expect(tool('albums').props.accessibilityState.selected).toBe(false);
  expect(renderer.root.findAllByType(SecondFloorAlbums)).toHaveLength(1);

  act(() =>
    renderer.root
      .findByProps({ testID: 'floor-tools-viewport' })
      .props.onLayout({ nativeEvent: { layout: { width: 402 } } }),
  );
  const strip = renderer.root.findByProps({ testID: 'floor-tools' });
  const spacing = StyleSheet.flatten(strip.props.contentContainerStyle);
  const cardWidth = StyleSheet.flatten(
    tool('albums').parent!.props.style,
  ).width;
  const sixthRight =
    spacing.paddingHorizontal + 6 * cardWidth + 5 * spacing.gap;
  expect(cardWidth).toBeGreaterThanOrEqual(44);
  expect(sixthRight).toBeCloseTo(402 - spacing.paddingHorizontal);
  expect(strip.props.snapToOffsets).toHaveLength(2);
  expect(strip.props.snapToOffsets[0]).toBe(0);
  expect(strip.props.snapToOffsets[1]).toBeCloseTo(
    2 * (cardWidth + spacing.gap),
  );

  act(() => tool('publish').props.onPress());
  expect(scrollTo).toHaveBeenLastCalledWith({
    x: strip.props.snapToOffsets[1],
    animated: false,
  });
  act(() => tool('permissions').props.onPress());
  expect(scrollTo).toHaveBeenLastCalledWith({ x: 0, animated: false });

  act(() => tool('albums').props.onPress());
  expect(tool('albums').props.accessibilityState.selected).toBe(true);
  expect(text()).toContain('上传');
  // Re-tapping the active V15 entrance keeps the current panel open.
  act(() => tool('albums').props.onPress());
  expect(tool('albums').props.accessibilityState.selected).toBe(true);
  expect(text()).toContain('上传');
});

test('V15 floor pages scroll their header while the tool tray stays outside', async () => {
  const props = { ...floorProps(), palette: xunPalette(palettes.light) };
  await act(async () => {
    renderer = TestRenderer.create(<SecondFloorScreen {...props} />);
  });

  const pages = [
    ['albums', SecondFloorAlbums],
    ['files', SecondFloorFiles],
    ['relationships', SecondFloorRelationships],
    ['assets', SecondFloorAssets],
    ['information', SecondFloorInformation],
    ['permissions', SecondFloorPermissions],
    ['publish', SecondFloorPublish],
    ['settings', SecondFloorSettings],
  ] as const;
  for (const [key, component] of pages) {
    await act(async () => tool(key).props.onPress());
    const pageScroller = renderer.root
      .findByType(component)
      .findByType(ScrollView);
    expect(
      pageScroller.findByProps({ testID: 'floor-header-back' }).props.onPress,
    ).toBeDefined();
    expect(pageScroller.findAllByProps({ testID: 'floor-tools' })).toHaveLength(
      0,
    );
    expect(
      pageScroller.findAllByProps({ testID: 'floor-return-gesture' }),
    ).toHaveLength(0);
  }
  const settingsScroller = renderer.root
    .findByType(SecondFloorSettings)
    .findByType(ScrollView);
  expect(
    settingsScroller
      .findAllByType(Text)
      .some(node =>
        node.props.children?.includes?.('展示社区与展示活动区域在这里调整。'),
      ),
  ).toBe(true);
  expect(StyleSheet.flatten(settingsScroller.props.style).flex).toBe(1);
  expect(settingsScroller.props.alwaysBounceVertical).toBe(true);
  const publishScroller = renderer.root
    .findByType(SecondFloorPublish)
    .findByType(ScrollView);
  expect(publishScroller.props.alwaysBounceVertical).toBe(true);
});

test('V15 bottom-edge return uses the native scroller touch release without taking its responder', async () => {
  const props = { ...floorProps(), palette: xunPalette(palettes.light) };
  await act(async () => {
    renderer = TestRenderer.create(<SecondFloorScreen {...props} />);
  });
  await act(async () => tool('relationships').props.onPress());
  const scroller = renderer.root
    .findByType(SecondFloorRelationships)
    .findByType(ScrollView);
  const scroll = scroller.props;
  expect(
    renderer.root.findByProps({ testID: 'floor-content' }).props
      .onMoveShouldSetResponderCapture,
  ).toBeUndefined();
  // Scrolling from mid-page to its end is ordinary reading, not a floor exit.
  act(() => scroll.onTouchStart(floorTouchEvent(500)));
  act(() => scroll.onScrollBeginDrag(floorScrollEvent(300)));
  act(() => scroll.onScroll(floorScrollEvent(530)));
  act(() => scroll.onTouchEnd(floorTouchEvent(350, 120, 0)));
  expect(props.onClose).not.toHaveBeenCalled();
  // Native dragEnd can run before touchEnd; the latter still owns its origin.
  act(() => scroll.onTouchStart(floorTouchEvent(500)));
  act(() => scroll.onScrollBeginDrag(floorScrollEvent(499)));
  act(() => scroll.onScroll(floorScrollEvent(540)));
  act(() => scroll.onScrollEndDrag(floorScrollEvent(540)));
  act(() => scroll.onTouchEnd(floorTouchEvent(399, 120, 0)));
  expect(props.onClose).toHaveBeenCalledTimes(1);
  act(() => scroll.onMomentumScrollEnd(floorScrollEvent(500)));
  act(() => scroll.onTouchEnd(floorTouchEvent(399, 120, 0)));
  expect(props.onClose).toHaveBeenCalledTimes(1);
});

test.each([
  ['albums', SecondFloorAlbums],
  ['files', SecondFloorFiles],
  ['relationships', SecondFloorRelationships],
  ['assets', SecondFloorAssets],
  ['information', SecondFloorInformation],
  ['permissions', SecondFloorPermissions],
  ['publish', SecondFloorPublish],
  ['settings', SecondFloorSettings],
] as const)(
  'V15 %s short page and landing can swipe up to return without a responder handoff',
  async (key, component) => {
    const props = { ...floorProps(), palette: xunPalette(palettes.light) };
    await act(async () => {
      renderer = TestRenderer.create(<SecondFloorScreen {...props} />);
    });
    const landing = renderer.root.findByProps({
      testID: 'floor-landing-scroll',
    }).props;
    expect(landing.alwaysBounceVertical).toBe(true);
    act(() => landing.onTouchStart(floorTouchEvent(500)));
    act(() => landing.onScrollBeginDrag(floorScrollEvent(0, 300, 500)));
    act(() => landing.onTouchEnd(floorTouchEvent(399, 120, 0)));
    expect(props.onClose).toHaveBeenCalledTimes(1);
    await act(async () => tool(key).props.onPress());
    const scroll = renderer.root
      .findByType(component)
      .findByType(ScrollView).props;
    expect(scroll.alwaysBounceVertical).toBe(true);
    // Native rubber-band displacement need not reach the finger's 100pt.
    act(() => scroll.onTouchStart(floorTouchEvent(500)));
    act(() => scroll.onScrollBeginDrag(floorScrollEvent(0, 300, 500)));
    act(() => scroll.onScroll(floorScrollEvent(35, 300, 500)));
    act(() => scroll.onTouchEnd(floorTouchEvent(399, 120, 0)));
    expect(props.onClose).toHaveBeenCalledTimes(2);
  },
);

test('short landing and panel pages arm return from measured dimensions before any scroll event', async () => {
  const props = { ...floorProps(), palette: xunPalette(palettes.light) };
  await act(async () => {
    renderer = TestRenderer.create(<SecondFloorScreen {...props} />);
  });
  const landing = renderer.root.findByProps({
    testID: 'floor-landing-scroll',
  }).props;
  act(() => landing.onContentSizeChange(390, 300));
  act(() => landing.onLayout({ nativeEvent: { layout: { height: 500 } } }));
  act(() => landing.onTouchStart(floorTouchEvent(500)));
  act(() => landing.onTouchEnd(floorTouchEvent(350, 120, 0)));
  expect(props.onClose).toHaveBeenCalledTimes(1);

  await act(async () => tool('relationships').props.onPress());
  const page = renderer.root
    .findByType(SecondFloorRelationships)
    .findByType(ScrollView).props;
  act(() => page.onContentSizeChange(390, 300));
  act(() => page.onLayout({ nativeEvent: { layout: { height: 500 } } }));
  act(() => page.onTouchStart(floorTouchEvent(500)));
  act(() => page.onTouchEnd(floorTouchEvent(350, 120, 0)));
  expect(props.onClose).toHaveBeenCalledTimes(2);
});

test('V15 settings keeps a real scrolling viewport before bottom-edge return is armed', async () => {
  const props = { ...floorProps(), palette: xunPalette(palettes.light) };
  await act(async () => {
    renderer = TestRenderer.create(<SecondFloorScreen {...props} />);
  });
  await act(async () => tool('settings').props.onPress());
  const scroller = renderer.root
    .findByType(SecondFloorSettings)
    .findByType(ScrollView);
  const scroll = scroller.props;
  expect(StyleSheet.flatten(scroll.style)).toEqual(
    expect.objectContaining({ flex: 1 }),
  );
  expect(StyleSheet.flatten(scroll.contentContainerStyle)).toEqual(
    expect.objectContaining({ flexGrow: 1 }),
  );

  // A normal upward read from the top must stay inside the settings viewport.
  act(() => scroll.onTouchStart(floorTouchEvent(520)));
  act(() => scroll.onScrollBeginDrag(floorScrollEvent(0, 1400, 500)));
  act(() => scroll.onScroll(floorScrollEvent(240, 1400, 500)));
  act(() => scroll.onTouchEnd(floorTouchEvent(350, 120, 0)));
  expect(props.onClose).not.toHaveBeenCalled();

  // Only a release that starts at the content end returns to the conversation.
  act(() => scroll.onTouchStart(floorTouchEvent(520)));
  act(() => scroll.onScrollBeginDrag(floorScrollEvent(900, 1400, 500)));
  act(() => scroll.onScroll(floorScrollEvent(900, 1400, 500)));
  act(() => scroll.onTouchEnd(floorTouchEvent(350, 120, 0)));
  expect(props.onClose).toHaveBeenCalledTimes(1);
});

test('bottom-edge return honors a configured distance below the legacy 100px guard', async () => {
  const preferences = defaultUIPreferences();
  preferences.gestures['secondFloor.swipeToExit'] = {
    ...preferences.gestures['secondFloor.swipeToExit']!,
    distance: 60,
  };
  const props = {
    ...floorProps(sessionForFloor({ uiPreferences: preferences })),
    palette: xunPalette(palettes.light),
  };
  await act(async () => {
    renderer = TestRenderer.create(<SecondFloorScreen {...props} />);
  });
  await act(async () => tool('relationships').props.onPress());
  const scroll = renderer.root
    .findByType(SecondFloorRelationships)
    .findByType(ScrollView).props;

  // The page is at its measured bottom. A 61px upward release must use the
  // configured 60px threshold instead of the old unconditional 100px floor.
  act(() => scroll.onTouchStart(floorTouchEvent(500)));
  act(() => scroll.onScrollBeginDrag(floorScrollEvent(499, 1000, 500)));
  act(() => scroll.onTouchEnd(floorTouchEvent(439, 120, 0)));
  expect(props.onClose).toHaveBeenCalledTimes(1);
});

test('return release reads changedTouches coordinates and rejects missing release points', async () => {
  const props = { ...floorProps(), palette: xunPalette(palettes.light) };
  await act(async () => {
    renderer = TestRenderer.create(<SecondFloorScreen {...props} />);
  });
  const landing = renderer.root.findByProps({
    testID: 'floor-landing-scroll',
  }).props;
  act(() => landing.onContentSizeChange(390, 300));
  act(() => landing.onLayout({ nativeEvent: { layout: { height: 500 } } }));
  act(() => landing.onTouchStart(floorTouchEvent(500)));
  // Native iOS touchEnd carries the release point in changedTouches; root
  // pageX/pageY are intentionally absent here.
  act(() =>
    landing.onTouchEnd({
      nativeEvent: {
        touches: [],
        changedTouches: [{ pageX: 120, pageY: 350 }],
      },
    }),
  );
  expect(props.onClose).toHaveBeenCalledTimes(1);

  await act(async () => tool('relationships').props.onPress());
  const page = renderer.root
    .findByType(SecondFloorRelationships)
    .findByType(ScrollView).props;
  act(() => page.onContentSizeChange(390, 300));
  act(() => page.onLayout({ nativeEvent: { layout: { height: 500 } } }));
  act(() => page.onTouchStart(floorTouchEvent(500)));
  act(() =>
    page.onTouchEnd({
      nativeEvent: {
        touches: [],
        changedTouches: [{ pageX: undefined, pageY: undefined }],
      },
    }),
  );
  expect(props.onClose).toHaveBeenCalledTimes(1);
});

test('bottom-edge release ignores short, sideways, downward, multitouch and cancelled gestures', async () => {
  const props = { ...floorProps(), palette: xunPalette(palettes.light) };
  await act(async () => {
    renderer = TestRenderer.create(<SecondFloorScreen {...props} />);
  });
  await act(async () => tool('relationships').props.onPress());
  const scroll = renderer.root
    .findByType(SecondFloorRelationships)
    .findByType(ScrollView).props;
  for (const [endY, endX] of [
    [446, 120],
    [399, 320],
    [650, 120],
  ]) {
    act(() => scroll.onTouchStart(floorTouchEvent(500)));
    act(() => scroll.onScrollBeginDrag(floorScrollEvent(499)));
    act(() => scroll.onTouchEnd(floorTouchEvent(endY, endX, 0)));
  }
  act(() => scroll.onTouchStart(floorTouchEvent(500)));
  act(() => scroll.onScrollBeginDrag(floorScrollEvent(499)));
  act(() => scroll.onTouchMove(floorTouchEvent(450, 120, 2)));
  act(() => scroll.onTouchEnd(floorTouchEvent(350, 120, 0)));
  act(() => scroll.onTouchStart(floorTouchEvent(500)));
  act(() => scroll.onScrollBeginDrag(floorScrollEvent(499)));
  act(() => scroll.onTouchCancel());
  act(() => scroll.onTouchEnd(floorTouchEvent(350, 120, 0)));
  act(() => scroll.onScrollBeginDrag(floorScrollEvent(499)));
  act(() => scroll.onScrollEndDrag(floorScrollEvent(550)));
  expect(props.onClose).not.toHaveBeenCalled();
});

test('hidden file and previous-activation touch events cannot arm or clear the current floor swipe', async () => {
  const props = { ...floorProps(), palette: xunPalette(palettes.light) };
  await act(async () => {
    renderer = TestRenderer.create(<SecondFloorScreen {...props} />);
  });
  await act(async () => tool('files').props.onPress());
  const oldFiles = renderer.root
    .findByType(SecondFloorFiles)
    .findByType(ScrollView).props;
  await act(async () => tool('relationships').props.onPress());
  const oldRelationships = renderer.root
    .findByType(SecondFloorRelationships)
    .findByType(ScrollView).props;
  act(() => oldRelationships.onTouchStart(floorTouchEvent(500)));
  act(() => oldRelationships.onScrollBeginDrag(floorScrollEvent(499)));
  act(() => renderer.update(<SecondFloorScreen {...props} active={false} />));
  const inactive = renderer.root
    .findByType(SecondFloorRelationships)
    .findByType(ScrollView).props;
  act(() => renderer.update(<SecondFloorScreen {...props} active />));
  const current = renderer.root
    .findByType(SecondFloorRelationships)
    .findByType(ScrollView).props;
  for (const old of [oldFiles, oldRelationships, inactive]) {
    act(() => old.onTouchStart(floorTouchEvent(500)));
    act(() => old.onScrollBeginDrag(floorScrollEvent(499)));
    act(() => old.onTouchEnd(floorTouchEvent(350, 120, 0)));
  }
  act(() => current.onTouchEnd(floorTouchEvent(350, 120, 0)));
  expect(props.onClose).not.toHaveBeenCalled();
  act(() => current.onTouchStart(floorTouchEvent(500)));
  act(() => current.onScrollBeginDrag(floorScrollEvent(499)));
  for (const old of [oldFiles, oldRelationships, inactive]) {
    act(() => old.onScrollEndDrag(floorScrollEvent(300)));
    act(() => old.onMomentumScrollEnd(floorScrollEvent(300)));
    act(() => old.onTouchCancel());
    act(() => old.onTouchEnd(floorTouchEvent(350, 120, 0)));
  }
  act(() => current.onMomentumScrollEnd(floorScrollEvent(499)));
  act(() => current.onTouchEnd(floorTouchEvent(350, 120, 0)));
  expect(props.onClose).toHaveBeenCalledTimes(1);
});

test('a switched-away landing gesture cannot exit a selected page', async () => {
  const props = { ...floorProps(), palette: xunPalette(palettes.light) };
  await act(async () => {
    renderer = TestRenderer.create(<SecondFloorScreen {...props} />);
  });
  const landing = renderer.root.findByProps({
    testID: 'floor-landing-scroll',
  }).props;
  act(() => landing.onTouchStart(floorTouchEvent(500)));
  act(() => landing.onScrollBeginDrag(floorScrollEvent(0, 300, 500)));
  await act(async () => tool('relationships').props.onPress());
  act(() => landing.onTouchEnd(floorTouchEvent(350, 120, 0)));
  expect(props.onClose).not.toHaveBeenCalled();
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
  const props = {
    ...floorProps(sessionForFloor({ createStationFileAsset: save })),
    palette: xunPalette(palettes.light),
  };
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
  const fileScroll = renderer.root
    .findByType(SecondFloorFiles)
    .findByType(ScrollView).props;
  act(() => fileScroll.onTouchStart(floorTouchEvent(500)));
  act(() => fileScroll.onScrollBeginDrag(floorScrollEvent(0, 300, 500)));
  act(() => fileScroll.onTouchEnd(floorTouchEvent(350, 120, 0)));
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
  const swipeArea = renderer.root
    .findAllByType(View)
    .find(node => node.props.testID === 'floor-return-swipe-area')!;
  const pressHost = renderer.root
    .findAllByType(View)
    .find(node => node.props.testID === 'floor-return-gesture')!;
  expect(swipeArea.props.onResponderRelease).toEqual(expect.any(Function));
  expect(swipeArea.props.onResponderRelease).not.toBe(
    pressHost.props.onResponderRelease,
  );
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

test('return responder consumes configured direction and distance', async () => {
  const pan = jest.spyOn(PanResponder, 'create');
  const preferences = defaultUIPreferences();
  preferences.gestures['secondFloor.swipeToExit'] = {
    ...preferences.gestures['secondFloor.swipeToExit']!,
    direction: 'left',
    distance: 120,
  };
  const props = floorProps(sessionForFloor({ uiPreferences: preferences }));
  await act(async () => {
    renderer = TestRenderer.create(<SecondFloorScreen {...props} />);
  });
  const config = pan.mock.calls[0]?.[0];
  expect(config).toBeDefined();
  const event = {} as Parameters<
    NonNullable<typeof config.onPanResponderRelease>
  >[0];
  const gesture = (dx: number, dy = 0) =>
    ({ dx, dy, vx: 0, vy: 0 } as Parameters<
      NonNullable<typeof config.onPanResponderRelease>
    >[1]);

  expect(config.onMoveShouldSetPanResponder?.(event, gesture(-20))).toBe(true);
  expect(config.onMoveShouldSetPanResponder?.(event, gesture(20))).toBe(false);
  act(() => config.onPanResponderRelease?.(event, gesture(-119)));
  expect(props.onClose).not.toHaveBeenCalled();
  act(() => config.onPanResponderRelease?.(event, gesture(-121)));
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

test('album landing keeps one upload entry and opens the real creation flow', () => {
  act(() => {
    renderer = TestRenderer.create(
      <SecondFloorAlbums
        palette={xunPalette(palettes.light)}
        language="zh"
        session={sessionForFloor()}
      />,
    );
  });

  expect(text()).not.toContain('连接你的手机相册');
  expect(text()).not.toContain('仅在你授权后读取所选照片');
  expect(text()).not.toContain('演示图');
  expect(text()).not.toContain('选择照片并新建相册');
  const upload = button('上传照片并新建相册');
  expect(upload).toBeTruthy();
  act(() => upload.props.onPress());
  expect(renderer.root.findByType(StationCreateSheet).props.kind).toBe('album');
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
    palette: xunPalette(palettes.light),
    language: 'zh' as const,
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
  expect(text()).not.toContain('UTF-8');
  expect(text()).not.toContain('256KiB');
  expect(text()).not.toContain('50000字符');
  expect(text()).toContain('暂不支持处理');
  await act(async () => {
    button(`查看${file.originalFilename}`).props.onPress();
  });
  expect(text()).toContain(file.preprocessingResult.textPreview);
  const returnToFiles = button('返回文件列表');
  expect(StyleSheet.flatten(returnToFiles.props.style)).toMatchObject({
    borderColor: '#cedae5',
    borderRadius: 12,
  });
  expect(
    StyleSheet.flatten(returnToFiles.findByType(Text).props.style),
  ).toMatchObject({ color: '#425b71', fontSize: 13, fontWeight: '400' });
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
  const notice = () => button('用户通知标题，未读');
  expect(notice().props.accessibilityState.expanded).toBe(false);
  expect(renderer.root.findAllByType(ChevronDown)).toHaveLength(1);
  expect(renderer.root.findAllByType(ChevronUp)).toHaveLength(0);
  const status = renderer.root
    .findAllByType(Text)
    .find(node => ['已读', '未读'].includes(node.props.children))!;
  const statusStyle = StyleSheet.flatten(status.props.style);
  expect(status.props.numberOfLines).toBe(1);
  expect(statusStyle.flexShrink).toBe(1);
  expect(StyleSheet.flatten(status.parent?.props.style).maxWidth).toBe('28%');
  act(() => notice().props.onPress());
  expect(notice().props.accessibilityState.expanded).toBe(true);
  expect(renderer.root.findAllByType(ChevronDown)).toHaveLength(0);
  expect(renderer.root.findAllByType(ChevronUp)).toHaveLength(1);
  expect(text()).toContain('这段内容只来自通知记录');
  expect(text()).toContain('未读');
  expect(text()).toContain('AI 信息整理尚未开放');
  expect(text()).not.toContain('已提取');
  const fullContent = renderer.root
    .findAllByType(Text)
    .find(
      node =>
        node.props.selectable &&
        node.props.children === '这段内容只来自通知记录',
    )!;
  expect(fullContent).toBeTruthy();
  let ancestor = fullContent.parent;
  while (ancestor) {
    expect(ancestor.props.accessibilityRole).not.toBe('button');
    ancestor = ancestor.parent;
  }
  expect(onOpenNotices).not.toHaveBeenCalled();
  act(() => notice().props.onPress());
  expect(notice().props.accessibilityState.expanded).toBe(false);
  act(() => button('查看应用通知，1 条未读').props.onPress());
  expect(onOpenNotices).toHaveBeenCalledTimes(1);
});

test('diary save failure is announced in the editor, keeps its draft and allows retry', async () => {
  const work = deferred<void>();
  const createDiary = jest
    .fn()
    .mockImplementationOnce(() => work.promise)
    .mockResolvedValueOnce(undefined);
  const onBusyChange = jest.fn();
  act(() => {
    renderer = TestRenderer.create(
      <SecondFloorPublish
        palette={xunPalette(palettes.light)}
        language="zh"
        session={sessionForFloor({ createStationDiary: createDiary })}
        onOpenPostComposer={jest.fn()}
        onBusyChange={onBusyChange}
      />,
    );
  });
  act(() => button('写日记').props.onPress());
  const draft = '失败后仍然保留的日记草稿';
  act(() => renderer.root.findByType(TextInput).props.onChangeText(draft));
  act(() => button('保存').props.onPress());
  expect(createDiary).toHaveBeenCalledTimes(1);
  expect(createDiary).toHaveBeenLastCalledWith(
    expect.objectContaining({ body: draft }),
  );
  expect(onBusyChange).toHaveBeenLastCalledWith(true);
  await act(async () => work.reject(new Error('日记服务暂不可用')));
  expect(renderer.root.findByType(StationCreateSheet).props.isSaving).toBe(
    false,
  );
  expect(renderer.root.findByType(TextInput).props.value).toBe(draft);
  expect(
    renderer.root.findByProps({ accessibilityRole: 'alert' }).props.children,
  ).toBe('日记服务暂不可用');
  expect(onBusyChange).toHaveBeenLastCalledWith(false);
  await act(async () => button('保存').props.onPress());
  expect(createDiary).toHaveBeenCalledTimes(2);
  expect(createDiary).toHaveBeenLastCalledWith(
    expect.objectContaining({ body: draft }),
  );
  expect(renderer.root.findAllByType(StationCreateSheet)).toHaveLength(0);
  expect(text()).toContain('发布动态');
});

test('publish actions remain scrollable with bottom breathing room', () => {
  act(() => {
    renderer = TestRenderer.create(
      <SecondFloorPublish
        palette={xunPalette(palettes.light)}
        language="zh"
        session={sessionForFloor()}
        onOpenPostComposer={jest.fn()}
      />,
    );
  });
  const scroller = renderer.root.findByType(ScrollView);
  const contentStyle = StyleSheet.flatten(scroller.props.contentContainerStyle);
  expect(StyleSheet.flatten(scroller.props.style).flex).toBe(1);
  expect(contentStyle.flexGrow).toBe(1);
  expect(contentStyle.paddingBottom).toBeGreaterThanOrEqual(24);
  expect(scroller.props.keyboardShouldPersistTaps).toBe('handled');
  expect(text()).toContain('发布动态');
  expect(text()).toContain('写日记');
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

test('second-floor permissions keep disconnected services and payment settings unavailable', () => {
  act(() => {
    renderer = TestRenderer.create(
      <SecondFloorPermissions
        palette={xunPalette(palettes.light)}
        language="zh"
        onOpenSettings={jest.fn()}
      />,
    );
  });
  const serviceLabels = [
    '微信 · 消息与联系人',
    '邮箱 · 邮件读取与整理',
    '日历 · 日程读取与提醒',
  ];
  const switches = renderer.root
    .findAllByType(View)
    .filter(node => node.props.accessibilityRole === 'switch');
  expect(switches).toHaveLength(3);
  expect(switches.map(node => node.props.accessibilityLabel)).toEqual(
    serviceLabels,
  );
  expect(new Set(switches.map(node => node.parent)).size).toBe(3);
  switches.forEach(node => {
    expect(node.props.accessibilityState).toEqual({
      disabled: true,
      checked: false,
    });
    expect(node.props.onPress).toBeUndefined();
    expect(node.props.onValueChange).toBeUndefined();
    expect(
      node
        .parent!.findAllByType(Text)
        .some(child => child.props.children === '尚未接入 · 暂不可管理'),
    ).toBe(true);
  });
  expect(text()).toContain('支付能力尚未开放');
  expect(text()).toContain('单次支付限额');
  expect(text()).not.toContain('¥200');
  expect(text()).not.toContain('已授权 · 可随时撤回');
  expect(
    renderer.root.findAllByProps({ accessibilityRole: 'slider' }),
  ).toHaveLength(0);
  const saveSettings = renderer.root.findAll(
    node =>
      node.props.accessibilityRole === 'button' &&
      node.props.accessibilityLabel === '保存设置',
  );
  expect(saveSettings.length).toBeGreaterThan(0);
  saveSettings.forEach(node => {
    expect(node.props.accessibilityState).toEqual({ disabled: true });
    expect(node.props.onPress).toBeUndefined();
  });
  expect(
    renderer.root.findAll(node => typeof node.props.onPress === 'function'),
  ).toHaveLength(1);
});
