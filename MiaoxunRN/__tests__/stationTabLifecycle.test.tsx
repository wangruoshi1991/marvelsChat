import React from 'react';
import { View } from 'react-native';
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
    StationProfileHeader: () =>
      ReactModule.createElement(NativeView, { testID: 'station-profile' }),
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

jest.mock('../src/features/station/StationHome', () => {
  const ReactModule = require('react');
  const { View: NativeView } = require('react-native');
  return {
    StationHome: ({ active }: { active: boolean }) => {
      ReactModule.useEffect(() => {
        mockPanelMounted('station');
        return () => mockPanelUnmounted('station');
      }, []);
      return ReactModule.createElement(NativeView, {
        testID: 'station-panel-station',
        active,
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
  applyStationSiteDraft: asyncAction,
  listStationAlbumSuggestions: asyncAction,
  applyStationAlbumSuggestion: asyncAction,
  createStationFileAsset: asyncAction,
  preprocessStationFileAsset: asyncAction,
  createStationVideoDraft: asyncAction,
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
        onOpenFriendThread={action}
        onOpenLocation={action}
        onOpenPostComposer={action}
        onOpenPublicProfileByAiId={action}
        onOpenQRCode={action}
        onOpenSettings={action}
        onSelectStationTab={action}
        palette={palettes.light}
        renderUserAvatar={() => <View />}
        selectedStationTab={tab}
        session={session}
      />
    </AIAssistProvider>
  );
}

describe('Station tab lifecycle', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('keeps the home viewer mounted and makes only the selected panel interactive', () => {
    let renderer: ReactTestRenderer.ReactTestRenderer;

    ReactTestRenderer.act(() => {
      renderer = ReactTestRenderer.create(stationScreen('station'));
    });

    expect(mockPanelMounted.mock.calls.map(([tab]) => tab)).toEqual([
      'station',
    ]);
    expect(mockPanelUnmounted).not.toHaveBeenCalled();
    expect(
      renderer!.root.findByProps({
        testID: 'station-panel-scroll-station',
      }),
    ).toBeTruthy();

    ReactTestRenderer.act(() => {
      renderer!.update(stationScreen('posts'));
    });

    expect(mockPanelMounted.mock.calls.map(([tab]) => tab)).toEqual([
      'station',
      'posts',
    ]);
    expect(mockPanelUnmounted).not.toHaveBeenCalledWith('station');
    expect(
      renderer!.root.findAllByProps({
        testID: 'station-panel-scroll-station',
      }),
    ).toHaveLength(0);
    expect(
      renderer!.root.findByProps({ testID: 'station-panel-scroll-posts' }),
    ).toBeTruthy();
    const home = renderer!.root.findByProps({
      testID: 'station-home-retained',
    });
    expect(home.props.accessibilityElementsHidden).toBe(true);
    expect(home.props.importantForAccessibility).toBe('no-hide-descendants');
    expect(home.props.pointerEvents).toBe('none');
    expect(
      renderer!.root.findByProps({ testID: 'station-panel-station' }).props
        .active,
    ).toBe(false);
    ReactTestRenderer.act(() => {
      renderer!.update(stationScreen('station'));
    });
    expect(mockPanelMounted.mock.calls.map(([tab]) => tab)).toEqual([
      'station',
      'posts',
    ]);
    expect(mockPanelUnmounted).not.toHaveBeenCalled();
    const posts = renderer!.root.findByProps({
      testID: 'station-posts-retained',
    });
    expect(posts.props.accessibilityElementsHidden).toBe(true);
    expect(posts.props.importantForAccessibility).toBe('no-hide-descendants');
    expect(posts.props.pointerEvents).toBe('none');
    expect(
      renderer!.root.findByProps({ testID: 'station-panel-station' }).props
        .active,
    ).toBe(true);
    expect(
      renderer!.root.findByProps({ testID: 'station-home-retained' }).props
        .accessibilityElementsHidden,
    ).toBe(false);
  });

  it('pauses the retained viewer when station is inactive without remounting it', () => {
    let renderer: ReactTestRenderer.ReactTestRenderer;
    ReactTestRenderer.act(() => {
      renderer = ReactTestRenderer.create(stationScreen('station'));
    });
    ReactTestRenderer.act(() => {
      renderer!.update(stationScreen('station', false));
    });
    expect(
      renderer!.root.findByProps({ testID: 'station-panel-station' }).props
        .active,
    ).toBe(false);
    ReactTestRenderer.act(() => {
      renderer!.update(stationScreen('station', true));
    });
    expect(
      renderer!.root.findByProps({ testID: 'station-panel-station' }).props
        .active,
    ).toBe(true);
    expect(mockPanelMounted.mock.calls.map(([tab]) => tab)).toEqual([
      'station',
    ]);
    expect(mockPanelUnmounted).not.toHaveBeenCalled();
  });

  it('does not create the home viewer before the home tab is first visited', () => {
    let renderer: ReactTestRenderer.ReactTestRenderer;
    ReactTestRenderer.act(() => {
      renderer = ReactTestRenderer.create(stationScreen('posts'));
    });
    expect(
      renderer!.root.findAllByProps({ testID: 'station-panel-station' }),
    ).toHaveLength(0);
    ReactTestRenderer.act(() => {
      renderer!.update(stationScreen('station'));
    });
    expect(mockPanelMounted.mock.calls.map(([tab]) => tab)).toEqual([
      'posts',
      'station',
    ]);
    expect(mockPanelUnmounted).not.toHaveBeenCalled();
    const posts = renderer!.root.findByProps({
      testID: 'station-posts-retained',
    });
    expect(posts.props.accessibilityElementsHidden).toBe(true);
    expect(posts.props.importantForAccessibility).toBe('no-hide-descendants');
    expect(posts.props.pointerEvents).toBe('none');
  });
});
