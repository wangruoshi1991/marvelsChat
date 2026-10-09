import React from 'react';
import { Alert, Image, Share } from 'react-native';
import Clipboard from '@react-native-clipboard/clipboard';
import ReactTestRenderer from 'react-test-renderer';

import {
  messageIconAssets,
  stationPartnerIconAssets,
} from '../src/assets/icons';
import { AIAssistGestureSurface } from '../src/features/assist/AIAssistGestureSurface';
import { AIAssistAction } from '../src/features/assist/aiAssistTypes';
import { resolveAgentThreadIcon } from '../src/features/messages/threadIconRegistry';
import {
  AIPartnerGrid,
  AlbumGrid,
  DiaryComicGrid,
} from '../src/features/station/StationHomeModules';
import { StationHome } from '../src/features/station/StationHome';
import { moduleBindingForAgent } from '../src/features/station/StationAgentCards';
import {
  AgentDTO,
  OwnedAgentDTO,
  StationAlbumDTO,
  StationDiaryEntryDTO,
  StationMediaAssetDTO,
} from '../src/models/api';
import { palettes } from '../src/shared/theme';

const mockAssist = {
  activeSourceId: undefined,
  dismiss: jest.fn(),
  askButler: jest.fn(),
  open: jest.fn(),
  move: jest.fn(),
  release: jest.fn(),
  getGeneration: () => 0,
  routeKey: 'station',
};
jest.mock('../src/features/assist/AIAssistProvider', () => ({
  useAIAssist: () => mockAssist,
}));
jest.mock('../src/features/station/StationAvatarSpace', () => ({
  StationAvatarSpace: () => null,
}));

const entry = {
  id: 'diary-1',
  title: '日记标题',
  body: '真实日记正文',
} as StationDiaryEntryDTO;
const album = {
  id: 'album-1',
  title: '相册标题',
  description: '真实相册描述',
  mediaCount: 1,
} as StationAlbumDTO;

describe('Station home content actions', () => {
  let renderer: ReactTestRenderer.ReactTestRenderer;
  beforeEach(() => jest.clearAllMocks());
  afterEach(async () => {
    await ReactTestRenderer.act(() => renderer?.unmount());
    jest.restoreAllMocks();
  });

  it('keeps diary detail navigation and forwards real diary text to the shared actions', async () => {
    const share = jest
      .spyOn(Share, 'share')
      .mockResolvedValue({ action: Share.sharedAction });
    const onOpenEntry = jest.fn();
    await ReactTestRenderer.act(() => {
      renderer = ReactTestRenderer.create(
        <DiaryComicGrid
          entries={[entry]}
          language="zh"
          palette={palettes.light}
          onOpenEntry={onOpenEntry}
        />,
      );
    });
    const surface = renderer.root.findByType(AIAssistGestureSurface);
    const actions: AIAssistAction[] = surface.props.actions;
    await ReactTestRenderer.act(() => surface.props.onPress());
    expect(onOpenEntry).toHaveBeenCalledWith(entry.id);
    await ReactTestRenderer.act(() =>
      actions[0].onSelect(surface.props.object),
    );
    expect(share).toHaveBeenCalledWith({ message: '日记标题\n\n真实日记正文' });
    await ReactTestRenderer.act(() =>
      actions[1].onSelect(surface.props.object),
    );
    expect(mockAssist.askButler).toHaveBeenCalledWith({
      kind: 'station-diary',
      id: entry.id,
      title: entry.title,
      metadata: { content: entry.body },
    });
    expect(actions[2].label).toBe('查看');
    await ReactTestRenderer.act(() =>
      actions[2].onSelect(surface.props.object),
    );
    expect(onOpenEntry).toHaveBeenCalledTimes(2);
  });

  it('shares only album text and never sends private media URLs or authorization to Butler', async () => {
    const share = jest
      .spyOn(Share, 'share')
      .mockResolvedValue({ action: Share.sharedAction });
    const onOpenAlbum = jest.fn();
    const media = {
      id: 'private-media-1',
      albumId: album.id,
      kind: 'image',
      status: 'uploaded',
    } as StationMediaAssetDTO;
    await ReactTestRenderer.act(() => {
      renderer = ReactTestRenderer.create(
        <AlbumGrid
          albums={[album]}
          mediaAssets={[media]}
          token="test-authorization-secret"
          language="zh"
          palette={palettes.light}
          onOpenAlbum={onOpenAlbum}
        />,
      );
    });
    const surface = renderer.root.findByType(AIAssistGestureSurface);
    const actions: AIAssistAction[] = surface.props.actions;
    const image = renderer.root.findByType(Image);
    expect(image.props.source.headers.Authorization).toBe(
      'Bearer test-authorization-secret',
    );
    await ReactTestRenderer.act(() =>
      actions[0].onSelect(surface.props.object),
    );
    expect(share).toHaveBeenCalledWith({ message: '相册标题\n\n真实相册描述' });
    await ReactTestRenderer.act(() =>
      actions[1].onSelect(surface.props.object),
    );
    expect(mockAssist.askButler).toHaveBeenCalledWith({
      kind: 'station-album',
      id: album.id,
      title: album.title,
      metadata: { content: album.description, mediaCount: 1 },
    });
    const transferred = JSON.stringify(mockAssist.askButler.mock.calls);
    expect(transferred).not.toContain('test-authorization-secret');
    expect(transferred).not.toContain('private-media-1');
    expect(transferred).not.toContain('/api/');
  });

  it('More exposes real detail/copy actions without claiming editing or deletion', async () => {
    const alert = jest.spyOn(Alert, 'alert');
    await ReactTestRenderer.act(() => {
      renderer = ReactTestRenderer.create(
        <DiaryComicGrid
          entries={[entry]}
          language="zh"
          palette={palettes.light}
          onOpenEntry={jest.fn()}
        />,
      );
    });
    const surface = renderer.root.findByType(AIAssistGestureSurface);
    const more: AIAssistAction = surface.props.actions.find(
      (action: AIAssistAction) => action.direction === 'left',
    );
    await ReactTestRenderer.act(() => more.onSelect(surface.props.object));
    const buttons = alert.mock.calls[0][2]!;
    expect(buttons.map(button => button.text)).toEqual([
      '查看详情',
      '复制文字',
      '取消',
    ]);
    await ReactTestRenderer.act(() => buttons[1].onPress?.());
    expect(Clipboard.setString).toHaveBeenCalledWith(
      '日记标题\n\n真实日记正文',
    );
  });

  it('uses the Butler chat portrait while preserving home card and other Agent identities', async () => {
    const agent = {
      key: 'miaoxun-butler',
      name: '妙讯管家',
      identity: {
        mark: '妙',
        colors: { background: '#000000', foreground: '#FFFFFF' },
      },
    } as AgentDTO;
    const owned = {
      id: agent.key,
      name: agent.name,
      description: '管家',
      enabled: true,
    } as OwnedAgentDTO;
    await ReactTestRenderer.act(() => {
      renderer = ReactTestRenderer.create(
        <AIPartnerGrid
          agents={[agent]}
          ownedAgents={[owned]}
          language="zh"
          palette={palettes.light}
          onOpenAgentThread={jest.fn()}
        />,
      );
    });
    expect(renderer.root.findByType(Image).props.source).toBe(
      stationPartnerIconAssets.miaoxunButler,
    );
    expect(resolveAgentThreadIcon(agent.key).imageSource).toBe(
      messageIconAssets.agentAvatars.butler,
    );
    expect(
      resolveAgentThreadIcon('new-agent', 'generation').imageSource,
    ).toBeUndefined();
  });

  it('uses the album conversation and has no separate Find media shortcut', async () => {
    await ReactTestRenderer.act(() => {
      renderer = ReactTestRenderer.create(
        <StationHome
          active={false}
          agents={[]}
          avatar3d={null}
          avatar3dError=""
          avatar3dStatus="unavailable"
          language="zh"
          onActionMessage={jest.fn()}
          onOpenAgentThread={jest.fn()}
          onOpenAlbumDetail={jest.fn()}
          onOpenAvatar3d={jest.fn()}
          onOpenContentList={jest.fn()}
          onOpenCreateSheet={jest.fn()}
          onOpenDiaryDetail={jest.fn()}
          onSelectStationTab={jest.fn()}
          ownedAgents={[]}
          palette={palettes.light}
          profile={{ stationConfig: { siteLayout: { sections: [] } } } as never}
          selectedAvatar3dModelId={null}
          stationContent={
            {
              albums: [],
              diaryEntries: [],
              mediaAssets: [],
            } as never
          }
          token=""
        />,
      );
    });

    expect(
      renderer.root.findAllByProps({
        testID: 'station-home-find-media',
      }),
    ).toHaveLength(0);
    expect(moduleBindingForAgent('media-retrieval', 'zh')).toBe(
      '相册管理对话 / 检索协作能力',
    );
  });
});
