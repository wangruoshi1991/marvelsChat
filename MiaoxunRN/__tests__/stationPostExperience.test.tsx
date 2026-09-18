import React from 'react';
import { Alert, Image, Text, TextInput, View } from 'react-native';
import ReactTestRenderer from 'react-test-renderer';

import { stationPostIconAssets } from '../src/assets/icons';
import { AIAssistProvider } from '../src/features/assist/AIAssistProvider';
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
  const { View: NativeView } = require('react-native');
  const SafeAreaMock = ({ children, ...props }: React.PropsWithChildren) =>
    ReactModule.createElement(NativeView, props, children);
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
  likedByMe: false,
  favoritedByMe: false,
  media: Array.from({ length: 5 }, (_, index) => imageAsset(index)),
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
};

const renderUserAvatar = () => <Text>头像</Text>;

const postInteractionTree = ({
  onAskButler,
  onDeletePost,
  currentPost = post,
}: {
  onAskButler: jest.Mock;
  onDeletePost: (postId: string) => Promise<void>;
  currentPost?: StationPostDTO;
}) => (
  <AIAssistProvider onAskButler={onAskButler} routeKey="station-posts">
    <StationPostsPanel
      language="zh"
      ownedAgents={[]}
      palette={palettes.light}
      profile={emptyProfile}
      renderUserAvatar={renderUserAvatar}
      stationContent={{ ...emptyStationContent, posts: [currentPost] }}
      token="token"
      onActionError={jest.fn()}
      onActionMessage={jest.fn()}
      onDeletePost={onDeletePost}
      onSetStationPostInteraction={jest.fn(async () => ({
        postId: currentPost.id,
        likeCount: currentPost.likeCount,
        favoriteCount: currentPost.favoriteCount,
        likedByMe: false,
        favoritedByMe: false,
      }))}
      onOpenPostComposer={jest.fn()}
    />
  </AIAssistProvider>
);

const pressPoint = { nativeEvent: { pageX: 180, pageY: 330 } };

describe('Station post experience', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

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
        <AIAssistProvider onAskButler={jest.fn()} routeKey="station-posts">
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
            onSetStationPostInteraction={jest.fn(async () => ({
              postId: post.id,
              likeCount: post.likeCount,
              favoriteCount: post.favoriteCount,
              likedByMe: false,
              favoritedByMe: false,
            }))}
            onOpenPostComposer={onOpenPostComposer}
          />
        </AIAssistProvider>,
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
        <AIAssistProvider onAskButler={jest.fn()} routeKey="station-posts">
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
            onSetStationPostInteraction={jest.fn(async () => ({
              postId: post.id,
              likeCount: post.likeCount,
              favoriteCount: post.favoriteCount,
              likedByMe: false,
              favoritedByMe: false,
            }))}
            onOpenPostComposer={onOpenPostComposer}
          />
        </AIAssistProvider>,
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

  it('refreshes interaction state when the same post receives new server props', () => {
    const onAskButler = jest.fn();
    const onDeletePost = jest.fn(async () => undefined);
    let renderer: ReactTestRenderer.ReactTestRenderer;
    ReactTestRenderer.act(() => {
      renderer = ReactTestRenderer.create(
        postInteractionTree({ onAskButler, onDeletePost }),
      );
    });

    const updatedPost = {
      ...post,
      likeCount: 41,
      favoriteCount: 9,
      likedByMe: true,
      favoritedByMe: true,
    };
    ReactTestRenderer.act(() => {
      renderer!.update(
        postInteractionTree({
          onAskButler,
          onDeletePost,
          currentPost: updatedPost,
        }),
      );
    });

    expect(
      renderer!.root.findByProps({ accessibilityLabel: '点赞' }).props
        .accessibilityState,
    ).toEqual({ selected: true });
    expect(
      renderer!.root.findByProps({ accessibilityLabel: '收藏' }).props
        .accessibilityState,
    ).toEqual({ selected: true });
    const textValues = renderer!.root
      .findAllByType(Text)
      .map(node => node.props.children);
    expect(textValues).toContain(41);
    expect(textValues).toContain(9);
  });

  it('passes the actual post context to the butler from the global long-press menu', () => {
    jest
      .spyOn(View.prototype, 'measureInWindow')
      .mockImplementation(callback => callback(0, 59, 393, 760));
    const onAskButler = jest.fn();
    const onDeletePost = jest.fn(async () => undefined);
    let renderer: ReactTestRenderer.ReactTestRenderer;
    ReactTestRenderer.act(() => {
      renderer = ReactTestRenderer.create(
        postInteractionTree({ onAskButler, onDeletePost }),
      );
    });
    ReactTestRenderer.act(() => {
      renderer!.root
        .findAllByProps({ testID: `station-post-assist-${post.id}` })
        .find(node => typeof node.props.onLongPress === 'function')!
        .props.onLongPress(pressPoint);
    });
    expect(
      renderer!.root.findByProps({ testID: 'content-actions-overlay' }),
    ).toBeTruthy();
    ReactTestRenderer.act(() => {
      renderer!.root
        .findByProps({ testID: 'content-action-right' })
        .props.onPress();
    });
    expect(onAskButler).toHaveBeenCalledWith({
      kind: 'station-post',
      id: post.id,
      title: '这条动态',
      metadata: {
        content: post.body,
        visibility: post.visibility,
        mediaCount: post.media.length,
      },
    });
    expect(onDeletePost).not.toHaveBeenCalled();
    expect(
      renderer!.root.findAllByProps({ testID: 'content-actions-overlay' }),
    ).toHaveLength(0);
    ReactTestRenderer.act(() => renderer!.unmount());
  });

  it('opens the action menu from more and deletes only after explicit confirmation', async () => {
    jest
      .spyOn(View.prototype, 'measureInWindow')
      .mockImplementation(callback => callback(0, 59, 393, 760));
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(jest.fn());
    const onDeletePost = jest.fn(async () => undefined);
    let renderer: ReactTestRenderer.ReactTestRenderer;
    ReactTestRenderer.act(() => {
      renderer = ReactTestRenderer.create(
        postInteractionTree({ onAskButler: jest.fn(), onDeletePost }),
      );
    });
    ReactTestRenderer.act(() => {
      renderer!.root
        .findByProps({ accessibilityLabel: '更多' })
        .props.onPress(pressPoint);
    });
    expect(alert).not.toHaveBeenCalled();
    expect(onDeletePost).not.toHaveBeenCalled();
    ReactTestRenderer.act(() => {
      renderer!.root
        .findByProps({ testID: 'content-action-left' })
        .props.onPress();
    });
    expect(alert).toHaveBeenCalledTimes(1);
    expect(alert.mock.calls[0][0]).toBe('删除这条动态？');
    expect(onDeletePost).not.toHaveBeenCalled();
    const confirm = alert.mock.calls[0][2]?.find(
      action => action.style === 'destructive',
    );
    expect(confirm).toBeDefined();
    await ReactTestRenderer.act(async () => confirm!.onPress?.());
    expect(onDeletePost).toHaveBeenCalledTimes(1);
    expect(onDeletePost).toHaveBeenCalledWith(post.id);
    ReactTestRenderer.act(() => renderer!.unmount());
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
