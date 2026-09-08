import React from 'react';
import { View } from 'react-native';
import ReactTestRenderer from 'react-test-renderer';

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

jest.mock('../src/features/station/StationPanels', () => {
  const ReactModule = require('react');
  const { View: NativeView } = require('react-native');
  return {
    StationPanel: ({ selectedTab }: { selectedTab: StationTab }) => {
      ReactModule.useEffect(() => {
        mockPanelMounted(selectedTab);
        return () => mockPanelUnmounted(selectedTab);
      }, [selectedTab]);
      return ReactModule.createElement(NativeView, {
        testID: `station-panel-${selectedTab}`,
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

function stationScreen(tab: StationTab) {
  return (
    <StationScreen
      active
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
  );
}

describe('Station tab lifecycle', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('mounts only the selected panel and swaps it without an artificial delay', () => {
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
    expect(mockPanelUnmounted).toHaveBeenCalledWith('station');
    expect(
      renderer!.root.findAllByProps({
        testID: 'station-panel-scroll-station',
      }),
    ).toHaveLength(0);
    expect(
      renderer!.root.findByProps({ testID: 'station-panel-scroll-posts' }),
    ).toBeTruthy();
  });
});
