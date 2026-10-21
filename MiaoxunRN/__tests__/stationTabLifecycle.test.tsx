import React from 'react';
import { Modal, View, StyleSheet } from 'react-native';
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
    const card = () =>
      renderer!.root.findByProps({ testID: 'station-profile' });
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
      scroll.props.onLayout({ nativeEvent: { layout: { height: 500 } } });
    });
    expect(
      StyleSheet.flatten(scroll.props.contentContainerStyle).minHeight,
    ).toBe(572);

    await ReactTestRenderer.act(async () => {
      scroll.props.onScroll({ nativeEvent: { contentOffset: { y: 36 } } });
    });
    expect(card().props.collapseProgress.__getValue()).toBeCloseTo(0.5);
    expect(card().props.collapsed).toBe(false);

    await ReactTestRenderer.act(async () => {
      scroll.props.onScroll({ nativeEvent: { contentOffset: { y: 72 } } });
    });
    expect(card().props.collapseProgress.__getValue()).toBe(1);
    expect(card().props.collapsed).toBe(true);

    ReactTestRenderer.act(() => {
      scroll.props.onLayout({ nativeEvent: { layout: { height: 700 } } });
    });
    // Even as the header shrinks, an empty panel keeps exactly the same
    // gesture allowance instead of adding another screen of blank content.
    expect(
      StyleSheet.flatten(scroll.props.contentContainerStyle).minHeight,
    ).toBe(772);

    await ReactTestRenderer.act(async () => {
      scroll.props.onScroll({ nativeEvent: { contentOffset: { y: 8 } } });
    });
    expect(card().props.collapseProgress.__getValue()).toBeCloseTo(8 / 72);
    expect(card().props.collapsed).toBe(false);
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
      scroll.props.onContentSizeChange(320, 572);
    });

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
