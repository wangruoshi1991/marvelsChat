import React from 'react';
import { Text, TextInput } from 'react-native';
import ReactTestRenderer from 'react-test-renderer';

import { StationContentListScreen } from '../src/features/station/StationContentListScreen';
import { StationAgentsPanel } from '../src/features/station/StationAgentsPanel';
import { StationCreateSheet } from '../src/features/station/StationCreateSheet';
import {
  AIPartnerGrid,
  DiaryComicGrid,
  StationModule,
} from '../src/features/station/StationHomeModules';
import { styles } from '../src/shared/styles';
import { palettes } from '../src/shared/theme';

const diaryEntry = {
  id: 'diary-1',
  userId: 'user-1',
  title: '今天的日记',
  body: '今天完成了新的小站交互。',
  mood: 'calm',
  visibility: 'private' as const,
  source: 'manual' as const,
  createdAt: '2026-08-12T08:00:00.000Z',
  updatedAt: '2026-08-12T09:00:00.000Z',
};

describe('station module management', () => {
  it('does not render placeholder diary cards for missing entries', async () => {
    let renderer: ReactTestRenderer.ReactTestRenderer;

    await ReactTestRenderer.act(() => {
      renderer = ReactTestRenderer.create(
        <DiaryComicGrid
          entries={[]}
          language="zh"
          onOpenEntry={jest.fn()}
          palette={palettes.light}
        />,
      );
    });

    expect(renderer!.root.findByProps({ children: '暂无日记' })).toBeTruthy();
    expect(
      renderer!.root.findAllByProps({ style: styles.stationComicCoverCard }),
    ).toHaveLength(0);

    await ReactTestRenderer.act(() => renderer!.unmount());
  });

  it('keeps an odd AI partner on the left instead of stretching it', async () => {
    const ownedAgents = ['one', 'two', 'three'].map(id => ({
      id,
      name: id,
      description: `${id} description`,
      enabled: true,
    }));
    let renderer: ReactTestRenderer.ReactTestRenderer;

    await ReactTestRenderer.act(() => {
      renderer = ReactTestRenderer.create(
        <AIPartnerGrid
          agents={[]}
          language="zh"
          onOpenAgentThread={jest.fn()}
          ownedAgents={ownedAgents as never}
          palette={palettes.light}
        />,
      );
    });

    expect(
      renderer!.root.findByProps({ accessibilityLabel: 'one' }),
    ).toBeTruthy();
    expect(
      renderer!.root.findByProps({ accessibilityLabel: 'two' }),
    ).toBeTruthy();
    expect(
      renderer!.root.findByProps({ accessibilityLabel: 'three' }),
    ).toBeTruthy();
    expect(styles.stationAIPartnerTile.flexGrow).toBe(0);

    await ReactTestRenderer.act(() => renderer!.unmount());
  });

  it('keeps agent, create, and more actions independent', async () => {
    const onAgentAction = jest.fn();
    const onCreate = jest.fn();
    const onMore = jest.fn();
    let renderer: ReactTestRenderer.ReactTestRenderer;

    await ReactTestRenderer.act(() => {
      renderer = ReactTestRenderer.create(
        <StationModule
          action="添加"
          agentAction="漫画日记 Agent"
          moreLabel="更多日记"
          onAction={onCreate}
          onAgentAction={onAgentAction}
          onMore={onMore}
          palette={palettes.light}
          title="个人日记"
        >
          <Text>内容</Text>
        </StationModule>,
      );
    });

    await ReactTestRenderer.act(() => {
      renderer!.root
        .findByProps({ accessibilityLabel: '添加' })
        .props.onPress();
      renderer!.root
        .findByProps({ accessibilityLabel: '更多日记' })
        .props.onPress();
      renderer!.root
        .findByProps({ accessibilityLabel: '漫画日记 Agent' })
        .props.onPress();
    });

    expect(onAgentAction).toHaveBeenCalledTimes(1);
    expect(onCreate).toHaveBeenCalledTimes(1);
    expect(onMore).toHaveBeenCalledTimes(1);

    await ReactTestRenderer.act(() => renderer!.unmount());
  });

  it('keeps Agent chat and removal as independent controls', async () => {
    const agent = {
      key: 'model-3d',
      name: '3D形象顾问 Agent',
      version: '1.0.0',
      category: 'advisory',
      description: '3D advice',
      capabilities: [],
      permissions: [],
      status: 'active',
    };
    const ownedAgent = {
      id: 'model-3d',
      name: agent.name,
      description: agent.description,
      category: agent.category,
      enabled: true,
      grantedScopes: [],
    };
    const onOpenAgentThread = jest.fn();
    const onSetAgentEnabled = jest.fn().mockResolvedValue({
      ...ownedAgent,
      enabled: false,
    });
    const onActionMessage = jest.fn();
    let renderer: ReactTestRenderer.ReactTestRenderer;

    await ReactTestRenderer.act(() => {
      renderer = ReactTestRenderer.create(
        <StationAgentsPanel
          agentReadiness={{}}
          agents={[agent]}
          language="zh"
          onActionError={jest.fn()}
          onActionMessage={onActionMessage}
          onApplyAlbumSuggestion={jest.fn()}
          onApplySiteDraft={jest.fn()}
          onCreateFileAsset={jest.fn()}
          onCreateSiteDraft={jest.fn()}
          onCreateVideoDraft={jest.fn()}
          onLoadAlbumSuggestions={jest.fn()}
          onOpenAgentThread={onOpenAgentThread}
          onPreprocessFileAsset={jest.fn()}
          onSetAgentEnabled={onSetAgentEnabled}
          ownedAgents={[ownedAgent]}
          palette={palettes.light}
          profile={{} as never}
          stationContent={{} as never}
          status="正常"
        />,
      );
    });

    const open = renderer!.root.findByProps({
      accessibilityLabel: agent.name,
    });
    const remove = renderer!.root.findByProps({
      accessibilityLabel: `移除 ${agent.name}`,
    });
    expect(
      open.findAllByProps({ accessibilityLabel: `移除 ${agent.name}` }),
    ).toHaveLength(0);

    await ReactTestRenderer.act(async () => {
      remove.props.onPress();
      await new Promise<void>(resolve => setImmediate(resolve));
    });

    expect(onSetAgentEnabled).toHaveBeenCalledWith('model-3d', false);
    expect(onOpenAgentThread).not.toHaveBeenCalled();
    expect(onActionMessage).toHaveBeenCalledWith('Agent 已移除');

    await ReactTestRenderer.act(() => open.props.onPress());
    expect(onOpenAgentThread).toHaveBeenCalledWith('model-3d');
    expect(onSetAgentEnabled).toHaveBeenCalledTimes(1);

    await ReactTestRenderer.act(() => renderer!.unmount());
  });

  it('opens an existing diary in the shared editor and exposes swipe handlers', async () => {
    const onOpen = jest.fn();
    const onEdit = jest.fn();
    let renderer: ReactTestRenderer.ReactTestRenderer;

    await ReactTestRenderer.act(() => {
      renderer = ReactTestRenderer.create(
        <StationContentListScreen
          albums={[]}
          diaryEntries={[diaryEntry]}
          kind="diary"
          language="zh"
          mediaAssets={[]}
          onBack={jest.fn()}
          onCreate={jest.fn()}
          onOpen={onOpen}
          onEdit={onEdit}
          palette={palettes.light}
          token="token"
        />,
      );
    });

    const row = renderer!.root.findByProps({
      accessibilityLabel: '今天的日记',
    });
    expect(
      renderer!.root.findByProps({ accessibilityViewIsModal: true }),
    ).toBeTruthy();
    expect(row.props.accessibilityHint).toContain('向左滑动');
    expect(typeof row.parent?.props.onResponderMove).toBe('function');

    await ReactTestRenderer.act(() => row.props.onPress());
    expect(onOpen).toHaveBeenCalledWith({ kind: 'diary', id: 'diary-1' });
    expect(onEdit).not.toHaveBeenCalled();

    expect(
      renderer!.root.findByProps({ children: '2026 年 8 月' }),
    ).toBeTruthy();

    await ReactTestRenderer.act(() => renderer!.unmount());
  });

  it('requires at least one photo before a new album can be saved', async () => {
    const onSubmit = jest.fn();
    let renderer: ReactTestRenderer.ReactTestRenderer;

    await ReactTestRenderer.act(() => {
      renderer = ReactTestRenderer.create(
        <StationCreateSheet
          fullScreen
          isSaving={false}
          kind="album"
          language="zh"
          onBack={jest.fn()}
          onSubmit={onSubmit}
          palette={palettes.light}
        />,
      );
    });

    const inputs = renderer!.root.findAllByType(TextInput);
    await ReactTestRenderer.act(() => inputs[0].props.onChangeText('旅行相册'));
    const save = renderer!.root.findByProps({ accessibilityLabel: '保存' });
    expect(save.props.disabled).toBe(true);

    await ReactTestRenderer.act(() => renderer!.unmount());
  });
});
