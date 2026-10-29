import React from 'react';
import { Dimensions, Modal, View, StyleSheet } from 'react-native';
import ReactTestRenderer from 'react-test-renderer';

import { AIAssistProvider } from '../src/features/assist/AIAssistProvider';
import {
  emptyProfile,
  emptyStationContent,
} from '../src/features/session/sessionDefaults';
import { useMiaoxunSession } from '../src/features/session/useMiaoxunSession';
import { StationScreen } from '../src/features/station/StationScreen';
import type { StationTab } from '../src/features/station/stationTypes';
import { palettes } from '../src/shared/theme';

const mockPanelMounted = jest.fn();
const mockPanelUnmounted = jest.fn();

jest.mock('../src/features/station/useAvatar3d', () => ({
  useAvatar3d: () => ({
    bootstrap: null,
    errorMessage: '',
    refresh: jest.fn(async () => undefined),
    status: 'ready',
  }),
}));

jest.mock('../src/features/station/StationHeader', () => {
  const ReactModule = require('react');
  const { View: NativeView } = require('react-native');
  return {
    STATION_COLLAPSE_SCROLL_DISTANCE: 72,
    STATION_EXPAND_SCROLL_DISTANCE: 16,
    // The real card renders the 3D stage inside its avatar cell; keep that
    // relationship so these lifecycle assertions stay meaningful.
    StationProfileHeader: ({
      collapsed,
      collapseProgress,
      stage,
    }: {
      collapsed?: boolean;
      collapseProgress?: { __getValue: () => number };
      stage?: unknown;
    }) =>
      ReactModule.createElement(
        NativeView,
        { collapsed, collapseProgress, testID: 'station-profile' },
        stage as never,
      ),
    StationTabs: () =>
      ReactModule.createElement(NativeView, { testID: 'station-tabs' }),
  };
});

jest.mock('../src/features/station/StationPageHeading', () => {
  const ReactModule = require('react');
  const { View: NativeView } = require('react-native');
  return {
    StationPageHeading: () =>
      ReactModule.createElement(NativeView, { testID: 'station-heading' }),
  };
});

jest.mock('../src/features/station/StationAvatarSpace', () => {
  const ReactModule = require('react');
  const {
    Pressable: NativePressable,
    View: NativeView,
  } = require('react-native');
  return {
    StationAvatarSpace: ({
      active,
      onOpenCoreAgent,
    }: {
      active: boolean;
      onOpenCoreAgent?: () => void;
    }) => {
      ReactModule.useEffect(() => {
        mockPanelMounted('avatar');
        return () => mockPanelUnmounted('avatar');
      }, []);
      return ReactModule.createElement(
        NativeView,
        { testID: 'station-avatar', active },
        ReactModule.createElement(NativePressable, {
          onPress: onOpenCoreAgent,
          testID: 'station-avatar-agent',
        }),
      );
    },
  };
});

jest.mock('../src/features/station/StationAgentsPanel', () => {
  const ReactModule = require('react');
  const { View: NativeView } = require('react-native');
  return {
    StationAgentsPanel: () => {
      ReactModule.useEffect(() => {
        mockPanelMounted('agents');
        return () => mockPanelUnmounted('agents');
      }, []);
      return ReactModule.createElement(NativeView, {
        testID: 'station-panel-agents',
      });
    },
  };
});

jest.mock('../src/features/station/StationPostsPanel', () => {
  const ReactModule = require('react');
  const { View: NativeView } = require('react-native');
  return {
    StationPostsPanel: () => {
      ReactModule.useEffect(() => {
        mockPanelMounted('posts');
        return () => mockPanelUnmounted('posts');
      }, []);
      return ReactModule.createElement(NativeView, {
        testID: 'station-panel-posts',
      });
    },
  };
});

const action = jest.fn();
const asyncAction = jest.fn(async () => undefined);
const session = {
  appearance: 'light',
  token: 'token',
  user: {
    aiId: '900000000000001',
    presenceMode: 'online',
  },
  profile: emptyProfile,
  relationships: { following: [], followers: [], friends: [] },
  stationContent: emptyStationContent,
  agents: [],
  agentReadiness: {},
  ownedAgents: [],
  modules: {},
  setAgentEnabled: asyncAction,
  deleteStationPost: asyncAction,
  createStationSiteDraft: asyncAction,
  createStationFileAsset: asyncAction,
  listMiaoPointLedger: asyncAction,
} as unknown as ReturnType<typeof useMiaoxunSession>;

function stationScreen(tab: StationTab, active = true) {
  return (
    <AIAssistProvider onAskButler={action} routeKey="station">
      <StationScreen
        active={active}
        language="zh"
        onActionError={action}
        onActionMessage={action}
        onCopyAIID={action}
        onOpenAgentThread={action}
        onOpenLocation={action}
        onOpenQRCode={action}
        onSelectStationTab={action}
        palette={palettes.light}
        renderUserAvatar={() => <View />}
        selectedStationTab={tab}
        session={session}
      />
    </AIAssistProvider>
  );
}

function responderEvent(
  previousX: number,
  previousY: number,
  currentX: number,
  currentY: number,
  timeStamp: number,
) {
  const touch = {
    touchActive: true,
    currentTimeStamp: timeStamp,
    previousPageX: previousX,
    previousPageY: previousY,
    currentPageX: currentX,
    currentPageY: currentY,
  };
  return {
    nativeEvent: {
      touches: [{ pageX: currentX, pageY: currentY }],
    },
    touchHistory: {
      numberActiveTouches: 1,
      indexOfSingleActiveTouch: 0,
      mostRecentTimeStamp: timeStamp,
      touchBank: [touch],
    },
  };
}

describe('Station tab lifecycle', () => {
  let renderer: ReactTestRenderer.ReactTestRenderer | undefined;
  beforeEach(() => {
    jest.clearAllMocks();
  });

  afterEach(async () => {
    await ReactTestRenderer.act(async () => renderer?.unmount());
    renderer = undefined;
  });

  it('keeps the profile card and 3D avatar above both tabs', async () => {
    await ReactTestRenderer.act(async () => {
      renderer = ReactTestRenderer.create(stationScreen('posts'));
    });
    expect(
      renderer!.root.findByProps({ testID: 'station-profile' }),
    ).toBeTruthy();
    expect(mockPanelMounted.mock.calls.map(([tab]) => tab)).toEqual([
      'avatar',
      'posts',
    ]);
    expect(
      renderer!.root.findByProps({ testID: 'station-panel-scroll-posts' }),
    ).toBeTruthy();

    ReactTestRenderer.act(() => {
      renderer!.update(stationScreen('agents'));
    });
    expect(
      renderer!.root.findByProps({ testID: 'station-profile' }),
    ).toBeTruthy();
    expect(mockPanelMounted.mock.calls.map(([tab]) => tab)).toEqual([
      'avatar',
      'posts',
      'agents',
    ]);
    expect(mockPanelUnmounted).not.toHaveBeenCalled();
    const posts = renderer!.root.findByProps({
      testID: 'station-posts-retained',
    });
    expect(posts.props.accessibilityElementsHidden).toBe(true);
    expect(posts.props.importantForAccessibility).toBe('no-hide-descendants');
    expect(posts.props.pointerEvents).toBe('none');

    ReactTestRenderer.act(() => {
      renderer!.update(stationScreen('posts'));
    });
    expect(mockPanelUnmounted.mock.calls.map(([tab]) => tab)).toEqual([
      'agents',
    ]);
    expect(
      renderer!.root.findByProps({ testID: 'station-posts-retained' }).props
        .accessibilityElementsHidden,
    ).toBe(false);
  });

  it('pauses the 3D avatar when station is inactive without remounting it', async () => {
    await ReactTestRenderer.act(async () => {
      renderer = ReactTestRenderer.create(stationScreen('posts'));
    });
    ReactTestRenderer.act(() => {
      renderer!.update(stationScreen('posts', false));
    });
    expect(
      renderer!.root.findByProps({ testID: 'station-avatar' }).props.active,
    ).toBe(false);
    ReactTestRenderer.act(() => {
      renderer!.update(stationScreen('agents', true));
    });
    expect(
      renderer!.root.findByProps({ testID: 'station-avatar' }).props.active,
    ).toBe(true);
    expect(mockPanelUnmounted).not.toHaveBeenCalledWith('avatar');
  });

  it('does not mount the agents panel before it is selected', async () => {
    await ReactTestRenderer.act(async () => {
      renderer = ReactTestRenderer.create(stationScreen('posts'));
    });
    expect(
      renderer!.root.findAllByProps({ testID: 'station-panel-agents' }),
    ).toHaveLength(0);
  });

  it('keeps the profile card scroll-collapsible when the panel is empty', async () => {
    await ReactTestRenderer.act(async () => {
      renderer = ReactTestRenderer.create(stationScreen('posts'));
    });

    const scroll = renderer!.root.findByProps({
      testID: 'station-panel-scroll-posts',
    });
    const collapseSpacer = () =>
      renderer!.root.findByProps({ testID: 'station-collapse-spacer' });
    const card = () =>
      renderer!.root.findByProps({ testID: 'station-profile' });
    const measuredProfile = () =>
      renderer!.root.findByProps({ testID: 'station-profile-measure' });
    const header = renderer!.root.findByProps({ testID: 'station-top-header' });
    // The resizable profile and switch must stay outside the list's clipped
    // viewport; a native sticky wrapper can expose rows above the switch.
    expect(scroll.findAllByProps({ testID: 'station-profile' })).toHaveLength(
      0,
    );
    expect(scroll.findAllByProps({ testID: 'station-tabs' })).toHaveLength(0);
    expect(header.findByProps({ testID: 'station-profile' })).toBeTruthy();
    expect(header.findByProps({ testID: 'station-tabs' })).toBeTruthy();
    expect(scroll.props.stickyHeaderIndices).toBeUndefined();
    expect(StyleSheet.flatten(scroll.props.style).overflow).toBe('hidden');
    ReactTestRenderer.act(() => {
      measuredProfile().props.onLayout({
        nativeEvent: { layout: { height: 0, width: 320, x: 0, y: 0 } },
      });
      scroll.props.onLayout({ nativeEvent: { layout: { height: 500 } } });
    });
    expect(
      StyleSheet.flatten(scroll.props.contentContainerStyle).minHeight,
    ).toBe(Dimensions.get('window').height + 72);
    ReactTestRenderer.act(() => {
      measuredProfile().props.onLayout({
        nativeEvent: { layout: { height: 250, width: 320, x: 0, y: 0 } },
      });
    });
    expect(
      StyleSheet.flatten(scroll.props.contentContainerStyle).minHeight,
    ).toBe(758);
    scroll.props.onContentSizeChange(320, 758);

    await ReactTestRenderer.act(async () => {
      scroll.props.onScroll({ nativeEvent: { contentOffset: { y: 36 } } });
    });
    expect(card().props.collapseProgress.__getValue()).toBeCloseTo(0.5);
    expect(card().props.collapsed).toBe(false);
    expect(
      (
        StyleSheet.flatten(collapseSpacer().props.style).height as unknown as {
          __getValue: () => number;
        }
      ).__getValue(),
    ).toBeCloseTo(36);

    await ReactTestRenderer.act(async () => {
      scroll.props.onScroll({ nativeEvent: { contentOffset: { y: 72 } } });
    });
    expect(card().props.collapseProgress.__getValue()).toBe(1);
    expect(card().props.collapsed).toBe(true);
    expect(
      (
        StyleSheet.flatten(collapseSpacer().props.style).height as unknown as {
          __getValue: () => number;
        }
      ).__getValue(),
    ).toBeCloseTo(72);

    ReactTestRenderer.act(() => {
      scroll.props.onLayout({ nativeEvent: { layout: { height: 686 } } });
    });
    // The content extent is reserved once for the collapsed viewport, so the
    // native scroll range does not move while the card resizes on scroll.
    expect(
      StyleSheet.flatten(scroll.props.contentContainerStyle).minHeight,
    ).toBe(758);

    await ReactTestRenderer.act(async () => {
      scroll.props.onScroll({ nativeEvent: { contentOffset: { y: 8 } } });
    });
    expect(card().props.collapseProgress.__getValue()).toBeCloseTo(8 / 72);
    expect(card().props.collapsed).toBe(false);
  });

  it('rebuilds the reserved scroll extent after a window size change', async () => {
    const originalWindow = Dimensions.get('window');
    const originalScreen = Dimensions.get('screen');
    await ReactTestRenderer.act(async () => {
      renderer = ReactTestRenderer.create(stationScreen('posts'));
    });

    const scroll = renderer!.root.findByProps({
      testID: 'station-panel-scroll-posts',
    });
    const measuredProfile = () =>
      renderer!.root.findByProps({ testID: 'station-profile-measure' });
    ReactTestRenderer.act(() => {
      scroll.props.onLayout({ nativeEvent: { layout: { height: 500 } } });
      measuredProfile().props.onLayout({
        nativeEvent: { layout: { height: 250, width: 320, x: 0, y: 0 } },
      });
    });
    expect(
      StyleSheet.flatten(scroll.props.contentContainerStyle).minHeight,
    ).toBe(758);

    try {
      await ReactTestRenderer.act(async () => {
        Dimensions.set({
          screen: { ...originalScreen, height: originalScreen.height + 200 },
          window: { ...originalWindow, height: originalWindow.height + 200 },
        });
      });
      ReactTestRenderer.act(() => {
        scroll.props.onLayout({ nativeEvent: { layout: { height: 650 } } });
        measuredProfile().props.onLayout({
          nativeEvent: { layout: { height: 350, width: 420, x: 0, y: 0 } },
        });
      });
      expect(
        StyleSheet.flatten(scroll.props.contentContainerStyle).minHeight,
      ).toBe(1008);
    } finally {
      await ReactTestRenderer.act(async () => {
        Dimensions.set({ screen: originalScreen, window: originalWindow });
      });
    }
  });

  it('rebuilds a collapsed height-only resize without waiting for an unchanged profile layout', async () => {
    const originalWindow = Dimensions.get('window');
    const originalScreen = Dimensions.get('screen');
    await ReactTestRenderer.act(async () => {
      renderer = ReactTestRenderer.create(stationScreen('posts'));
    });
    const scroll = renderer!.root.findByProps({
      testID: 'station-panel-scroll-posts',
    });
    const measuredProfile = () =>
      renderer!.root.findByProps({ testID: 'station-profile-measure' });
    const contentMinHeight = () =>
      StyleSheet.flatten(scroll.props.contentContainerStyle).minHeight;

    ReactTestRenderer.act(() => {
      scroll.props.onLayout({ nativeEvent: { layout: { height: 500 } } });
      measuredProfile().props.onLayout({
        nativeEvent: { layout: { height: 250, width: 320, x: 0, y: 0 } },
      });
      scroll.props.onScroll({ nativeEvent: { contentOffset: { y: 72 } } });
    });
    ReactTestRenderer.act(() => {
      measuredProfile().props.onLayout({
        nativeEvent: { layout: { height: 64, width: 320, x: 0, y: 0 } },
      });
      scroll.props.onLayout({ nativeEvent: { layout: { height: 686 } } });
    });
    expect(contentMinHeight()).toBe(758);

    try {
      await ReactTestRenderer.act(async () => {
        Dimensions.set({
          screen: { ...originalScreen, height: originalScreen.height + 200 },
          window: { ...originalWindow, height: originalWindow.height + 200 },
        });
      });
      // The 64pt profile frame is unchanged, so native onLayout is deduplicated.
      ReactTestRenderer.act(() => {
        scroll.props.onLayout({ nativeEvent: { layout: { height: 886 } } });
      });
      expect(contentMinHeight()).toBe(958);

      ReactTestRenderer.act(() => {
        scroll.props.onScroll({ nativeEvent: { contentOffset: { y: 0 } } });
        measuredProfile().props.onLayout({
          nativeEvent: { layout: { height: 320, width: 320, x: 0, y: 0 } },
        });
        scroll.props.onLayout({ nativeEvent: { layout: { height: 630 } } });
      });
      expect(contentMinHeight()).toBe(958);
    } finally {
      await ReactTestRenderer.act(async () => {
        Dimensions.set({ screen: originalScreen, window: originalWindow });
      });
    }
  });

  it('drives the empty-panel collapse from vertical gestures that start in the fixed header', async () => {
    await ReactTestRenderer.act(async () => {
      renderer = ReactTestRenderer.create(stationScreen('posts'));
    });

    const header = renderer!.root.findByProps({ testID: 'station-top-header' });
    const scroll = renderer!.root.findByProps({
      testID: 'station-panel-scroll-posts',
    });
    const card = () =>
      renderer!.root.findByProps({ testID: 'station-profile' });

    ReactTestRenderer.act(() => {
      scroll.props.onLayout({ nativeEvent: { layout: { height: 500 } } });
      renderer!.root
        .findByProps({ testID: 'station-profile-measure' })
        .props.onLayout({
          nativeEvent: { layout: { height: 250, width: 320, x: 0, y: 0 } },
        });
    });
    scroll.props.onContentSizeChange(320, 758);

    const firstTouch = responderEvent(0, 0, 0, 0, 1);
    const horizontalMove = responderEvent(0, 0, 24, -4, 2);
    header.props.onStartShouldSetResponderCapture(firstTouch);
    header.props.onMoveShouldSetResponderCapture(horizontalMove);
    expect(header.props.onMoveShouldSetResponder(horizontalMove)).toBe(false);

    header.props.onResponderRelease(horizontalMove);
    const secondTouch = responderEvent(24, -4, 24, -4, 3);
    const verticalMove = responderEvent(24, -4, 24, -24, 4);
    header.props.onStartShouldSetResponderCapture(secondTouch);
    header.props.onMoveShouldSetResponderCapture(verticalMove);
    expect(header.props.onMoveShouldSetResponder(verticalMove)).toBe(true);

    await ReactTestRenderer.act(async () => {
      header.props.onResponderGrant(verticalMove);
      header.props.onResponderMove(responderEvent(24, -24, 24, -60, 5));
    });
    expect(card().props.collapseProgress.__getValue()).toBeCloseTo(0.5);
    expect(card().props.collapsed).toBe(false);

    await ReactTestRenderer.act(async () => {
      header.props.onResponderMove(responderEvent(24, -60, 24, -36, 6));
    });
    expect(card().props.collapseProgress.__getValue()).toBeCloseTo(12 / 72);
    expect(card().props.collapsed).toBe(false);
  });

  it('keeps the reverse gesture available while viewport and content size reports are out of sync', async () => {
    await ReactTestRenderer.act(async () => {
      renderer = ReactTestRenderer.create(stationScreen('posts'));
    });

    const header = renderer!.root.findByProps({ testID: 'station-top-header' });
    const scroll = renderer!.root.findByProps({
      testID: 'station-panel-scroll-posts',
    });
    const card = () =>
      renderer!.root.findByProps({ testID: 'station-profile' });

    ReactTestRenderer.act(() => {
      scroll.props.onLayout({ nativeEvent: { layout: { height: 500 } } });
      renderer!.root
        .findByProps({ testID: 'station-profile-measure' })
        .props.onLayout({
          nativeEvent: { layout: { height: 250, width: 320, x: 0, y: 0 } },
        });
    });
    scroll.props.onContentSizeChange(320, 758);
    await ReactTestRenderer.act(async () => {
      scroll.props.onScroll({ nativeEvent: { contentOffset: { y: 72 } } });
    });

    // The collapsed viewport arrives before its matching content-size event.
    // The known 72pt gesture range must remain usable meanwhile.
    ReactTestRenderer.act(() => {
      scroll.props.onLayout({ nativeEvent: { layout: { height: 686 } } });
    });
    const touchStart = responderEvent(0, 0, 0, 0, 1);
    const reverseMove = responderEvent(0, 0, 0, 20, 2);
    header.props.onStartShouldSetResponderCapture(touchStart);
    header.props.onMoveShouldSetResponderCapture(reverseMove);
    expect(header.props.onMoveShouldSetResponder(reverseMove)).toBe(true);

    await ReactTestRenderer.act(async () => {
      header.props.onResponderGrant(reverseMove);
      header.props.onResponderMove(responderEvent(0, 20, 0, 40, 3));
    });
    expect(card().props.collapseProgress.__getValue()).toBeCloseTo(52 / 72);
  });

  it('preserves a deep offset for a short reverse drag while content size catches up', async () => {
    await ReactTestRenderer.act(async () => {
      renderer = ReactTestRenderer.create(stationScreen('posts'));
    });

    const header = renderer!.root.findByProps({ testID: 'station-top-header' });
    const scroll = renderer!.root.findByProps({
      testID: 'station-panel-scroll-posts',
    });
    const scrollInstance = scroll.instance as unknown as {
      scrollTo: jest.Mock;
    };
    ReactTestRenderer.act(() => {
      scroll.props.onLayout({ nativeEvent: { layout: { height: 500 } } });
      renderer!.root
        .findByProps({ testID: 'station-profile-measure' })
        .props.onLayout({
          nativeEvent: { layout: { height: 250, width: 320, x: 0, y: 0 } },
        });
    });
    scroll.props.onContentSizeChange(320, 1000);
    await ReactTestRenderer.act(async () => {
      scroll.props.onScroll({ nativeEvent: { contentOffset: { y: 300 } } });
    });

    ReactTestRenderer.act(() => {
      scroll.props.onLayout({ nativeEvent: { layout: { height: 686 } } });
    });
    scroll.props.onContentSizeChange(320, 200);
    scrollInstance.scrollTo.mockClear();

    const touchStart = responderEvent(0, 0, 0, 0, 1);
    const reverseMove = responderEvent(0, 0, 0, 12, 2);
    header.props.onStartShouldSetResponderCapture(touchStart);
    header.props.onMoveShouldSetResponderCapture(reverseMove);
    expect(header.props.onMoveShouldSetResponder(reverseMove)).toBe(true);

    await ReactTestRenderer.act(async () => {
      header.props.onResponderGrant(reverseMove);
      header.props.onResponderMove(responderEvent(0, 12, 0, 24, 3));
    });
    expect(scrollInstance.scrollTo).toHaveBeenCalledWith({
      y: 288,
      animated: false,
    });
  });

  it('opens the 3D agent conversation without creating a content page', async () => {
    await ReactTestRenderer.act(async () => {
      renderer = ReactTestRenderer.create(stationScreen('posts'));
    });

    const contentModal = () =>
      renderer!.root
        .findAllByType(Modal)
        .find(
          modal =>
            modal.props.animationType === 'fade' &&
            modal.props.presentationStyle === 'fullScreen',
        );
    expect(contentModal()?.props.visible).toBe(false);

    ReactTestRenderer.act(() => {
      renderer!.root
        .findByProps({ testID: 'station-avatar-agent' })
        .props.onPress();
    });

    expect(contentModal()?.props.visible).toBe(false);
    expect(action).toHaveBeenCalledWith('model-3d');
  });
});
