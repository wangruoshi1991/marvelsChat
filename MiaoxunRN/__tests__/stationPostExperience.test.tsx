import React from 'react';
import { Image, Text, TextInput } from 'react-native';
import ReactTestRenderer from 'react-test-renderer';

import { stationPostIconAssets } from '../src/assets/icons';
import { StationPostComposerScreen } from '../src/features/station/StationPostComposerScreen';
import { StationPostsPanel } from '../src/features/station/StationPostsPanel';
import { StationTabs } from '../src/features/station/StationHeader';
import { StationOutcomesPanel } from '../src/features/station/StationOutcomesPanel';
import { StationMediaAssetDTO, StationPostDTO } from '../src/models/api';
import {
  emptyProfile,
  emptyStationContent,
} from '../src/features/session/sessionDefaults';
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

const renderUserAvatar = () => <Text>头像</Text>;

describe('Station post experience', () => {
  it('maps the five station tabs to the new information architecture', () => {
    const onChange = jest.fn();
    let renderer: ReactTestRenderer.ReactTestRenderer;

    ReactTestRenderer.act(() => {
      renderer = ReactTestRenderer.create(
        <StationTabs
          language="zh"
          palette={palettes.light}
          value="station"
          onChange={onChange}
          onOpenSettings={jest.fn()}
        />,
      );
    });

    const tabValues = ['station', 'posts', 'outcomes', 'agents', 'social'];
    const tabs = tabValues.map(value =>
      renderer!.root
        .findAllByProps({ testID: `station-tab-${value}` })
        .find(tab => typeof tab.props.onPress === 'function'),
    );
    const labels = renderer!.root
      .findAllByType(Text)
      .map(node => node.props.children);
    expect(labels).toEqual(
      expect.arrayContaining(['第一面', '生活', '成果', '生态', '其他']),
    );

    ReactTestRenderer.act(() => {
      tabs.forEach(tab => tab!.props.onPress());
    });
    expect(onChange.mock.calls.map(([value]) => value)).toEqual([
      'station',
      'posts',
      'outcomes',
      'agents',
      'social',
    ]);
  });

  it('counts only real station content in the outcomes overview', () => {
    let renderer: ReactTestRenderer.ReactTestRenderer;
    const stationContent = {
      ...emptyStationContent,
      posts: [post],
      comicDiaries: [
        {
          id: 'comic-1',
          title: '漫画成果',
          prompt: '',
          summary: '',
          createdAt: null,
        } as never,
      ],
      siteDrafts: [
        { id: 'site-1', prompt: '', draft: {}, createdAt: null } as never,
        { id: 'site-2', prompt: '', draft: {}, createdAt: null } as never,
      ],
      videoDrafts: [
        {
          id: 'video-1',
          title: '视频成果',
          prompt: '',
          summary: '',
          createdAt: null,
        } as never,
      ],
      outfits: [
        { id: 'outfit-1', title: '穿搭 1', note: '' } as never,
        { id: 'outfit-2', title: '穿搭 2', note: '' } as never,
        { id: 'outfit-3', title: '穿搭 3', note: '' } as never,
      ],
    };

    ReactTestRenderer.act(() => {
      renderer = ReactTestRenderer.create(
        <StationOutcomesPanel
          language="zh"
          palette={palettes.light}
          stationContent={stationContent}
        />,
      );
    });

    const textValues = renderer!.root
      .findAllByType(Text)
      .map(node => node.props.children);
    expect(textValues).toContain('我的成果');
    expect(textValues).toContain('生活动态');
    expect(textValues).toContain('AI 产出');
    expect(textValues).toContain('形象穿搭');
    expect(textValues).toContain(1);
    expect(textValues).toContain(4);
    expect(textValues).toContain(3);
  });

  it('matches the compact design and caps the image preview at three items', () => {
    const onOpenPostComposer = jest.fn();
    let renderer: ReactTestRenderer.ReactTestRenderer;
    ReactTestRenderer.act(() => {
      renderer = ReactTestRenderer.create(
        <StationPostsPanel
          language="zh"
          ownedAgents={[]}
          palette={palettes.light}
          profile={emptyProfile}
          renderUserAvatar={renderUserAvatar}
          stationContent={{ ...emptyStationContent, posts: [post] }}
          token="token"
          onActionError={jest.fn()}
          onActionMessage={jest.fn()}
          onDeletePost={jest.fn(async () => undefined)}
          onOpenPostComposer={onOpenPostComposer}
        />,
      );
    });

    ReactTestRenderer.act(() => {
      renderer!.root
        .findByProps({ accessibilityLabel: '发布动态' })
        .props.onPress();
    });
    expect(onOpenPostComposer).toHaveBeenCalledTimes(1);

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
    const imageSources = renderer!.root
      .findAllByType(Image)
      .map(node => node.props.source);

    expect(remoteImages).toHaveLength(3);
    expect(textValues).toContain('今天');
    expect(textValues).toContain('照片');
    expect(textValues).not.toContain('图片');
    expect(textValues).toContain('+2');
    expect(textValues).toContain(32);
    expect(textValues).toContain(6);
    expect(textValues).toContain(8);
    expect(imageSources).toContain(stationPostIconAssets.time);
    expect(imageSources).toContain(stationPostIconAssets.photo);
  });

  it('keeps the life composer available when there are no posts', () => {
    const onOpenPostComposer = jest.fn();
    let renderer: ReactTestRenderer.ReactTestRenderer;

    ReactTestRenderer.act(() => {
      renderer = ReactTestRenderer.create(
        <StationPostsPanel
          language="zh"
          ownedAgents={[]}
          palette={palettes.light}
          profile={emptyProfile}
          renderUserAvatar={renderUserAvatar}
          stationContent={emptyStationContent}
          token="token"
          onActionError={jest.fn()}
          onActionMessage={jest.fn()}
          onDeletePost={jest.fn(async () => undefined)}
          onOpenPostComposer={onOpenPostComposer}
        />,
      );
    });

    expect(renderer!.root.findByProps({ children: '正在发生' })).toBeTruthy();
    ReactTestRenderer.act(() => {
      renderer!.root
        .findByProps({ accessibilityLabel: '发布动态' })
        .props.onPress();
    });
    expect(onOpenPostComposer).toHaveBeenCalledTimes(1);
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
