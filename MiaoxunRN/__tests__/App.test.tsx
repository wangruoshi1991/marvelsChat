/**
 * @format
 */

import React from 'react';
import { Text } from 'react-native';
import ReactTestRenderer from 'react-test-renderer';
import App from '../App';
import { useMiaoxunSession } from '../src/features/session/useMiaoxunSession';

jest.mock('../src/features/session/useMiaoxunSession', () => ({
  useMiaoxunSession: jest.fn(),
}));

jest.mock('react-native-safe-area-context', () => {
  const ReactModule = require('react');
  const { View: NativeView } = require('react-native');
  const SafeAreaWrapper = ({ children }: { children: React.ReactNode }) =>
    ReactModule.createElement(NativeView, null, children);
  return {
    SafeAreaProvider: SafeAreaWrapper,
    SafeAreaView: SafeAreaWrapper,
  };
});

jest.mock('../src/features/messages/MessagesScreen', () => ({
  ...(() => {
    const ReactModule = require('react');
    const { View: NativeView } = require('react-native');
    return {
      MessagesScreen: () =>
        ReactModule.createElement(NativeView, { testID: 'messages-screen' }),
      ChatScreen: () =>
        ReactModule.createElement(NativeView, { testID: 'chat-screen' }),
    };
  })(),
}));

jest.mock('../src/features/homepage/HomepageScreen', () => {
  const ReactModule = require('react');
  const { View: NativeView } = require('react-native');
  return {
    HomepageScreen: () =>
      ReactModule.createElement(NativeView, { testID: 'homepage-screen' }),
  };
});

jest.mock('../src/features/station/StationScreen', () => {
  const ReactModule = require('react');
  const {
    Pressable: NativePressable,
    Text: NativeText,
    View: NativeView,
  } = require('react-native');
  return {
    StationScreen: () =>
      ReactModule.createElement(NativeView, { testID: 'station-screen' }),
    FloatingMiaoButton: ({ onPress }: { onPress: () => void }) =>
      ReactModule.createElement(
        NativePressable,
        { testID: 'site-builder-shortcut', onPress },
        ReactModule.createElement(NativeText, null, '妙'),
      ),
  };
});

jest.mock('../src/app/AppModals', () => ({
  AppModals: () => null,
}));

jest.mock('../src/app/LaunchAnimation', () => ({
  LaunchAnimation: () => null,
}));

jest.mock('../src/app/useButlerActions', () => ({
  useButlerActions: () => ({ sendButlerMessage: jest.fn() }),
}));

jest.mock('../src/features/profile/useProfileFlows', () => ({
  useProfileFlows: () => ({
    isScanning: false,
    openQRCode: jest.fn(),
    startQRCodeScan: jest.fn(async () => undefined),
    openPublicProfileByAiId: jest.fn(async () => undefined),
  }),
}));

const mockUseMiaoxunSession = useMiaoxunSession as jest.MockedFunction<
  typeof useMiaoxunSession
>;

beforeEach(() => {
  jest.useFakeTimers();
});

afterEach(() => {
  jest.clearAllTimers();
  jest.useRealTimers();
});

const makeSession = (homepageEnabled = true) =>
  ({
    token: 'token',
    user: {
      id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      displayName: 'Jarson',
      role: 'user',
      aiId: '900000000000001',
    },
    appearance: 'light',
    language: 'zh',
    isRestoring: false,
    restoreStatus: 'ready',
    isBusy: false,
    errorMessage: null,
    realtimeNotificationNotice: null,
    threads: [],
    agents: [],
    notices: [],
    unreadNoticeCount: 0,
    profile: {
      userId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      nickname: 'Jarson',
      avatarText: 'J',
      avatarConfig: {},
      bio: '',
      community: '',
      activityArea: '',
      miaoPoints: 0,
      followingCount: 0,
      followersCount: 0,
      collectionsCount: 0,
      stationConfig: {},
    },
    stationContent: {
      diaryEntries: [],
      albums: [],
      mediaAssets: [],
      outfits: [],
      siteDrafts: [],
      modelJobs: [],
      modelAssets: [],
      fileAssets: [],
      comicDiaries: [],
      videoDrafts: [],
    },
    homepageV1: {
      enabled: homepageEnabled,
      publicVisibilityEnabled: false,
      generationDailyLimit: 5,
      refineDailyLimit: 20,
    },
    relationships: { following: [], followers: [], friends: [] },
    profileVisibility: {},
    searchHistory: [],
    legalPolicies: null,
    setActiveThreadId: jest.fn(),
    markThreadRead: jest.fn(),
    loadPublicProfileByAiId: jest.fn(),
    resolveScanPayload: jest.fn(),
    openFriendThread: jest.fn(),
    retryRestoreSession: jest.fn(),
    signOut: jest.fn(),
    sendMessage: jest.fn(),
    deleteMessage: jest.fn(),
    recallMessage: jest.fn(),
    setThreadMuted: jest.fn(),
    refreshBootstrap: jest.fn(),
    refreshNotifications: jest.fn(),
    markNotificationRead: jest.fn(),
    acceptFriendRequest: jest.fn(),
    rejectFriendRequest: jest.fn(),
    refreshLegalPolicies: jest.fn(),
    signIn: jest.fn(),
    signUp: jest.fn(),
    setAppearance: jest.fn(),
    setLanguage: jest.fn(),
  }) as unknown as ReturnType<typeof useMiaoxunSession>;

const renderApp = async (homepageEnabled = true) => {
  mockUseMiaoxunSession.mockReturnValue(makeSession(homepageEnabled));
  let renderer: ReactTestRenderer.ReactTestRenderer | null = null;
  await ReactTestRenderer.act(async () => {
    renderer = ReactTestRenderer.create(<App />);
  });
  return renderer as unknown as ReactTestRenderer.ReactTestRenderer;
};

const tabLabels = (renderer: ReactTestRenderer.ReactTestRenderer) =>
  rootTabs(renderer)
    .map(tab =>
      tab
        .findAllByType(Text)
        .map(text => text.props.children)
        .join(''),
    );

const rootTabs = (renderer: ReactTestRenderer.ReactTestRenderer) => {
  return renderer.root.findAll(node => {
    const typeName =
      typeof node.type === 'string'
        ? node.type
        : (node.type as { displayName?: string; name?: string }).displayName ??
          (node.type as { displayName?: string; name?: string }).name;
    return (
      typeName === 'Pressable' &&
      node.props.accessibilityRole === 'tab' &&
      typeof node.props.onPress === 'function'
    );
  });
};

test('keeps Messages as the Build 25 default and Station second', async () => {
  const renderer = await renderApp();

  expect(renderer.root.findByProps({ testID: 'messages-screen' })).toBeDefined();
  expect(tabLabels(renderer)).toEqual(['妙讯', '小站']);

  await ReactTestRenderer.act(async () => {
    rootTabs(renderer)[1].props.onPress();
  });
  expect(renderer.root.findByProps({ testID: 'station-screen' })).toBeDefined();

  await ReactTestRenderer.act(async () => renderer.unmount());
});

test('shows the builder shortcut only for an enabled homepage account', async () => {
  const enabledRenderer = await renderApp(true);
  await ReactTestRenderer.act(async () => {
    rootTabs(enabledRenderer)[1].props.onPress();
  });
  expect(
    enabledRenderer.root.findByProps({ testID: 'site-builder-shortcut' }),
  ).toBeDefined();
  await ReactTestRenderer.act(async () => enabledRenderer.unmount());

  const disabledRenderer = await renderApp(false);
  await ReactTestRenderer.act(async () => {
    rootTabs(disabledRenderer)[1].props.onPress();
  });
  expect(
    disabledRenderer.root.findAllByProps({ testID: 'site-builder-shortcut' }),
  ).toHaveLength(0);
  await ReactTestRenderer.act(async () => disabledRenderer.unmount());
});
