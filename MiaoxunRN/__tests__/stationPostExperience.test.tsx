import React from 'react';
import { Image, Text, TextInput } from 'react-native';
import ReactTestRenderer from 'react-test-renderer';

import { StationPostComposerScreen } from '../src/features/station/StationPostComposerScreen';
import { StationPostsPanel } from '../src/features/station/StationPostsPanel';
import { StationMediaAssetDTO, StationPostDTO } from '../src/models/api';
import { emptyStationContent } from '../src/features/session/sessionDefaults';
import { palettes } from '../src/shared/theme';

jest.mock('react-native/Libraries/Modal/Modal', () => {
  const ReactModule = require('react');
  return {
    __esModule: true,
    default: ({ children }: { children: React.ReactNode }) =>
      ReactModule.createElement(ReactModule.Fragment, null, children),
  };
});

jest.mock('react-native-safe-area-context', () => {
  const ReactModule = require('react');
  const { View } = require('react-native');
  const SafeAreaMock = ({ children, ...props }: React.PropsWithChildren) =>
    ReactModule.createElement(View, props, children);
  return {
    SafeAreaProvider: SafeAreaMock,
    SafeAreaView: SafeAreaMock,
  };
});

const imageAsset = (index: number): StationMediaAssetDTO => ({
  id: `asset-${index}`,
  userId: 'user-1',
  albumId: null,
  kind: 'image',
  storageProvider: 'oss',
  storageKey: `posts/asset-${index}.jpg`,
  originalFilename: `asset-${index}.jpg`,
  mimeType: 'image/jpeg',
  byteSize: 1024,
  width: 800,
  height: 800,
  caption: '',
  status: 'uploaded',
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
});

const post: StationPostDTO = {
  id: 'post-1',
  userId: 'user-1',
  body: '把服务入口重新整理了一遍。',
  locationLabel: '',
  visibility: 'public',
  agentCapabilities: [],
  likeCount: 32,
  favoriteCount: 6,
  commentCount: 8,
  media: Array.from({ length: 5 }, (_, index) => imageAsset(index)),
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
};

describe('Station post experience', () => {
  it('matches the compact design and caps the image preview at three items', () => {
    let renderer: ReactTestRenderer.ReactTestRenderer;
    ReactTestRenderer.act(() => {
      renderer = ReactTestRenderer.create(
        <StationPostsPanel
          language="zh"
          ownedAgents={[]}
          palette={palettes.light}
          stationContent={{ ...emptyStationContent, posts: [post] }}
          token="token"
          onActionError={jest.fn()}
          onActionMessage={jest.fn()}
          onDeletePost={jest.fn(async () => undefined)}
        />,
      );
    });

    const remoteImages = renderer!.root
      .findAllByType(Image)
      .filter(node => typeof node.props.source?.uri === 'string');
    const textValues = renderer!.root
      .findAllByType(Text)
      .map(node =>
        Array.isArray(node.props.children)
          ? node.props.children.join('')
          : node.props.children,
      );

    expect(remoteImages).toHaveLength(3);
    expect(textValues).toContain('今天');
    expect(textValues).toContain('+2');
    expect(textValues).toContain(32);
    expect(textValues).toContain(6);
    expect(textValues).toContain(8);
  });

  it('shows publish errors inside the full-screen composer', async () => {
    const publishError = new Error('动态服务暂时不可用');
    const onActionError = jest.fn();
    const createStationPost = jest.fn(async () => {
      throw publishError;
    });
    const session = {
      appearance: 'light',
      ownedAgents: [],
      profile: { activityArea: '', community: '' },
      createStationPost,
      createStationMediaAsset: jest.fn(),
      deleteStationMediaAsset: jest.fn(async () => undefined),
    } as never;
    let renderer: ReactTestRenderer.ReactTestRenderer;

    await ReactTestRenderer.act(() => {
      renderer = ReactTestRenderer.create(
        <StationPostComposerScreen
          language="zh"
          palette={palettes.light}
          session={session}
          onActionError={onActionError}
          onClose={jest.fn()}
          onPublished={jest.fn()}
        />,
      );
    });
    const input = renderer!.root.findByType(TextInput);
    await ReactTestRenderer.act(() => {
      input.props.onChangeText('测试动态');
    });
    const publishButton = renderer!.root.findByProps({
      testID: 'post-composer-publish',
    });

    await ReactTestRenderer.act(async () => {
      await publishButton.props.onPress();
    });
    expect(createStationPost).toHaveBeenCalledTimes(1);

    expect(
      renderer!.root.findByProps({ testID: 'post-composer-error' }),
    ).toBeTruthy();
    expect(
      renderer!.root.findAllByType(Text).map(node => node.props.children),
    ).toContain('动态服务暂时不可用');
    expect(onActionError).toHaveBeenCalledWith(publishError);
  });
});
