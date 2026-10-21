import React from 'react';
import { Alert, Image, Share } from 'react-native';
import Clipboard from '@react-native-clipboard/clipboard';
import ReactTestRenderer from 'react-test-renderer';

import { AIAssistGestureSurface } from '../src/features/assist/AIAssistGestureSurface';
import { AIAssistAction } from '../src/features/assist/aiAssistTypes';
import { AgentGlyphAvatar } from '../src/features/messages/AgentGlyphAvatar';
import { resolveAgentGlyph } from '../src/features/messages/threadIconRegistry';
import {
  AIPartnerGrid,
  AlbumGrid,
  DiaryComicGrid,
} from '../src/features/station/StationHomeModules';
import { StationHome } from '../src/features/station/StationHome';
import { SecondFloorAlbumList } from '../src/features/second-floor/SecondFloorAlbumList';
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
          onEditAlbum={jest.fn()}
        />,
      );
    });
    const surface = renderer.root.findByType(AIAssistGestureSurface);
    const actions: AIAssistAction[] = surface.props.actions;
    const image = renderer.root.findByType(Image);
    expect(image.props.source.headers.Authorization).toBe(
      'Bearer test-authorization-secret',
    );
    const alert = jest.spyOn(Alert, 'alert');
    await ReactTestRenderer.act(() =>
      actions
        .find(action => action.direction === 'left')!
        .onSelect(surface.props.object),
    );
    const buttons = alert.mock.calls[0][2]!;
    await ReactTestRenderer.act(() => buttons[0].onPress?.());
    expect(share).toHaveBeenCalledWith({ message: '相册标题\n\n真实相册描述' });
    await ReactTestRenderer.act(() =>
      actions
        .find(action => action.direction === 'right')!
        .onSelect(surface.props.object),
    );
    expect(mockAssist.askButler).toHaveBeenCalledWith({
      kind: 'station-album',
      id: album.id,
      title: album.title,
      scene: {
        page: 'station.station',
        label: '我 · 主页',
        module: { key: 'album-grid', label: '相册列表' },
      },
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

  it('uses identical album actions on home and second floor, preserving edit, origin and cancellation', async () => {
    const open = jest.fn();
    const edit = jest.fn();
    const alert = jest.spyOn(Alert, 'alert');
    const menuFor = async (page: 'home' | 'second-floor') => {
      await ReactTestRenderer.act(() => {
        renderer?.unmount();
        renderer = ReactTestRenderer.create(
          page === 'home' ? (
            <AlbumGrid
              albums={[album]}
              mediaAssets={[]}
              token=""
              language="zh"
              palette={palettes.light}
              onOpenAlbum={open}
              onEditAlbum={edit}
            />
          ) : (
            <SecondFloorAlbumList
              albums={[album]}
              mediaAssets={[]}
              token=""
              language="zh"
              palette={palettes.light}
              onOpen={open}
              onEdit={edit}
              onCreate={jest.fn()}
            />
          ),
        );
      });
      return renderer.root.findAllByType(AIAssistGestureSurface)[0];
    };

    const menus = [];
    for (const page of ['home', 'second-floor'] as const) {
      const surface = await menuFor(page);
      const actions: AIAssistAction[] = surface.props.actions;
      menus.push(actions.map(({ direction, label }) => ({ direction, label })));
      expect(mockAssist.askButler).not.toHaveBeenCalled();
      await ReactTestRenderer.act(() =>
        actions
          .find(action => action.direction === 'down')!
          .onSelect(surface.props.object),
      );
      expect(edit).toHaveBeenLastCalledWith(album.id);
      await ReactTestRenderer.act(() =>
        actions
          .find(action => action.direction === 'right')!
          .onSelect(surface.props.object),
      );
      expect(mockAssist.askButler).toHaveBeenLastCalledWith(
        expect.objectContaining({
          kind: 'station-album',
          id: album.id,
          scene: expect.objectContaining({
            page: page === 'home' ? 'station.station' : 'second-floor.albums',
          }),
        }),
      );
      expect(mockAssist.askButler.mock.calls.at(-1)![0]).not.toHaveProperty(
        'intent',
      );
      await ReactTestRenderer.act(() =>
        actions
          .find(action => action.direction === 'left')!
          .onSelect(surface.props.object),
      );
      const cancel = alert.mock.calls
        .at(-1)![2]!
        .find(button => button.style === 'cancel')!;
      expect(cancel.onPress).toBeUndefined();
      expect(open).not.toHaveBeenCalled();
      mockAssist.askButler.mockClear();
    }
    expect(menus[0]).toEqual(menus[1]);
    expect(menus[0]).toEqual([
      { direction: 'up', label: '查看相册' },
      { direction: 'right', label: '妙管家' },
      { direction: 'down', label: '编辑相册' },
      { direction: 'left', label: '更多' },
    ]);
    expect(edit).toHaveBeenCalledTimes(2);
  });

  it('does not let an obsolete album More menu share or copy text after leaving its account or page', async () => {
    const alert = jest.spyOn(Alert, 'alert');
    const share = jest.spyOn(Share, 'share');
    await ReactTestRenderer.act(() => {
      renderer = ReactTestRenderer.create(
        <AlbumGrid
          albums={[album]}
          mediaAssets={[]}
          token=""
          language="zh"
          palette={palettes.light}
          onOpenAlbum={jest.fn()}
          onEditAlbum={jest.fn()}
        />,
      );
    });
    const surface = renderer.root.findByType(AIAssistGestureSurface);
    await ReactTestRenderer.act(() =>
      surface.props.actions
        .find((action: AIAssistAction) => action.direction === 'left')
        .onSelect(surface.props.object),
    );
    const buttons = alert.mock.calls[0][2]!;
    await ReactTestRenderer.act(() => renderer.unmount());
    await ReactTestRenderer.act(() => {
      buttons[0].onPress?.();
      buttons[1].onPress?.();
    });
    expect(share).not.toHaveBeenCalled();
    expect(Clipboard.setString).not.toHaveBeenCalled();
  });

  it('renders every Agent through the one shared glyph, whatever its identity', async () => {
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
    // The partner grid no longer swaps in a Butler portrait: every Agent goes
    // through the same glyph so one screen cannot show two icon languages.
    const glyphs = renderer.root.findAllByType(AgentGlyphAvatar);
    expect(glyphs).toHaveLength(1);
    expect(glyphs[0].props.agentId).toBe('miaoxun-butler');
    expect(glyphs[0].props.identity).toBe(agent.identity);
    // A near-black brand colour still yields a legible glyph rather than a
    // glyph indistinguishable from its own disc.
    const butler = resolveAgentGlyph('miaoxun-butler');
    expect(butler.Icon).toBeDefined();
    expect(butler.accent).toMatch(/^#[0-9A-Fa-f]{6}$/);
    // An Agent this build has never seen still resolves, by category first.
    expect(resolveAgentGlyph('new-agent', 'generation').Icon).toBeDefined();
    expect(resolveAgentGlyph('new-agent').Icon).toBeDefined();
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
          onEditAlbum={jest.fn()}
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
