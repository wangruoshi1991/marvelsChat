import React from 'react';
import { Modal, View } from 'react-native';
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
    // The real card renders the 3D stage inside its avatar cell; keep that
    // relationship so these lifecycle assertions stay meaningful.
    StationProfileHeader: ({ stage }: { stage?: unknown }) =>
      ReactModule.createElement(
        NativeView,
        { testID: 'station-profile' },
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
