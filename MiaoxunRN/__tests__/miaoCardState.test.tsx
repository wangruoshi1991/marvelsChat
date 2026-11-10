import {
  MiaoCardViewState,
  nextMiaoCardState,
  participantProjection,
} from '../src/features/miao/miaoCardState';
import React from 'react';
import ReactTestRenderer from 'react-test-renderer';
import { PanResponder, StyleSheet, Text, View } from 'react-native';
import { AIAssistProvider } from '../src/features/assist/AIAssistProvider';
import { AIAssistGestureSurface } from '../src/features/assist/AIAssistGestureSurface';
import { AIContextActions } from '../src/features/assist/AIContextActions';
import { MiaoTaskCard } from '../src/features/miao/MiaoTaskCard';
import { palettes } from '../src/shared/theme';
import { agentWorkspace, workspaceStep } from '../__fixtures__/agentWorkspace';
import { AgentDTO } from '../src/models/api';
import { defaultUIPreferences } from '../src/features/ui/uiPreferences';

const agent = (key: string, name: string): AgentDTO => ({
  key,
  name,
  version: '1',
  category: 'test',
  description: `${name} description`,
  capabilities: [],
  permissions: [],
  identity: {
    avatarKind: 'agent-mark',
    mark: name.slice(0, 1),
    shape: 'circle',
    colors: {
      background: '#123456',
      foreground: '#ffffff',
      accent: '#abcdef',
    },
  },
  status: 'published',
});

describe('Miao card view state', () => {
  function renderCard(
    uiPreferences = defaultUIPreferences(),
    renderState: (state: MiaoCardViewState) => React.ReactNode = state => (
      <Text testID="miao-card-state">{state}</Text>
    ),
    options: {
      participantIds?: string[];
      onOpen?: () => void;
      inlineStates?: boolean;
    } = {},
  ) {
    return ReactTestRenderer.create(
      <AIAssistProvider routeKey="miao-test" onAskButler={jest.fn()}>
        <MiaoTaskCard
          object={{ kind: 'ai-task', id: 'task-1', title: '协作任务' }}
          goal="整理协作结果"
          status="协作中"
          participantIds={options.participantIds ?? ['miaoxun-butler']}
          agents={[agent('miaoxun-butler', '妙管家')]}
          palette={palettes.light}
          language="zh"
          grid={false}
          failed={false}
          openLabel="查看协作"
          onOpen={options.onOpen ?? jest.fn()}
          uiPreferences={uiPreferences}
          renderState={options.inlineStates === false ? undefined : renderState}
        >
          <Text testID="miao-card-summary-marker">摘要</Text>
        </MiaoTaskCard>
      </AIAssistProvider>,
    );
  }

  function cardPanConfig(pan: jest.SpyInstance) {
    const config = pan.mock.calls.at(-1)?.[0];
    if (!config) throw new Error('Miao card did not create a pan responder');
    return config as {
      onMoveShouldSetPanResponder?: (
        event: unknown,
        gesture: { dx: number; dy: number },
      ) => boolean;
      onPanResponderGrant?: () => void;
      onPanResponderRelease?: (
        event: unknown,
        gesture: { dx: number; dy: number; vx: number; vy: number },
      ) => void;
    };
  }

  function renderedState(renderer: ReactTestRenderer.ReactTestRenderer) {
    const expanded = renderer.root.findAllByProps({
      testID: 'miao-card-state',
    });
    return expanded.length > 0 ? expanded[0].props.children : 'summary';
  }

  function nativeSurface(renderer: ReactTestRenderer.ReactTestRenderer) {
    return renderer.root.findAll(
      node =>
        typeof node.type === 'string' &&
        node.props.testID === 'ai-assist-surface',
    )[0];
  }

  test('the PDF keeps named non-overlapping avatars above the body in every state and gives S1 a collapse control', () => {
    let renderer!: ReactTestRenderer.ReactTestRenderer;
    try {
      ReactTestRenderer.act(() => {
        renderer = renderCard();
      });
      const header = () =>
        renderer.root.findByProps({ testID: 'miao-card-agent-header' });
      const avatar = () =>
        header().findByProps({ testID: 'miao-participant-miaoxun-butler' });
      expect(
        avatar()
          .findAllByType(Text)
          .map(node => node.props.children),
      ).toContain('妙管家');
      expect(
        StyleSheet.flatten(avatar().props.style).marginLeft,
      ).toBeUndefined();
      expect(
        renderer.root
          .findByProps({ testID: 'miao-card-footer-actions' })
          .findAllByProps({ testID: 'miao-participant-miaoxun-butler' }),
      ).toHaveLength(0);
      ReactTestRenderer.act(() =>
        renderer.root
          .findByProps({ testID: 'miao-card-participants-action' })
          .props.onPress({ stopPropagation: jest.fn() }),
      );
      expect(avatar()).toBeTruthy();
      expect(
        renderer.root.findAllByProps({ testID: 'miao-card-title-action' }),
      ).toHaveLength(0);
      expect(renderedState(renderer)).toBe('agents');
      const collapse = renderer.root.findByProps({
        testID: 'miao-card-details-action',
      });
      expect(collapse.props.accessibilityLabel).toBe('收起 Agent');
      ReactTestRenderer.act(() =>
        collapse.props.onPress({ stopPropagation: jest.fn() }),
      );
      expect(renderedState(renderer)).toBe('summary');
      ReactTestRenderer.act(() =>
        renderer.root
          .findByProps({ testID: 'miao-card-details-action' })
          .props.onPress({ stopPropagation: jest.fn() }),
      );
      expect(renderedState(renderer)).toBe('detail');
      expect(avatar()).toBeTruthy();
    } finally {
      ReactTestRenderer.act(() => renderer?.unmount());
    }
  });

  test('content-action wrappers preserve accessible grouping by default', () => {
    let renderer!: ReactTestRenderer.ReactTestRenderer;
    try {
      ReactTestRenderer.act(() => {
        renderer = ReactTestRenderer.create(
          <AIAssistProvider routeKey="default-assist" onAskButler={jest.fn()}>
            <AIContextActions
              object={{ kind: 'ai-task', id: 'legacy', title: '原任务' }}
              palette={palettes.light}
              language="zh"
              onOpen={jest.fn()}
              openLabel="查看任务"
            >
              <Text>原任务</Text>
            </AIContextActions>
          </AIAssistProvider>,
        );
      });
      expect(nativeSurface(renderer).props.accessible).toBe(true);
    } finally {
      ReactTestRenderer.act(() => renderer?.unmount());
    }
  });

  test('stateful cards expose separately named title, participants and detail controls to accessibility', () => {
    let renderer!: ReactTestRenderer.ReactTestRenderer;
    try {
      ReactTestRenderer.act(() => {
        renderer = renderCard();
      });
      expect(renderer.root.findByType(AIContextActions).props.accessible).toBe(
        false,
      );
      expect(
        renderer.root.findByType(AIAssistGestureSurface).props.accessible,
      ).toBe(false);
      expect(nativeSurface(renderer).props.accessible).toBe(false);
      const title = renderer.root.findByProps({
        testID: 'miao-card-title-action',
      });
      expect(title.props.accessible).toBe(true);
      expect(title.props.accessibilityLabel).toBe('整理协作结果');
      expect(title.props.accessibilityRole).toBe('button');
      for (const testID of [
        'miao-card-participants-action',
        'miao-card-details-action',
        'miao-card-content-menu',
      ]) {
        const action = renderer.root.findByProps({ testID });
        expect(action.props.accessible).toBe(true);
        expect(action.props.accessibilityLabel).toEqual(expect.any(String));
      }
      const participantControl = () =>
        renderer.root.findByProps({
          testID: 'miao-card-participants-action',
        });
      ReactTestRenderer.act(() =>
        participantControl().props.onPress({ stopPropagation: jest.fn() }),
      );
      expect(renderedState(renderer)).toBe('agents');
      expect(nativeSurface(renderer).props.accessible).toBe(false);
      expect(participantControl().props.accessible).toBe(true);
      expect(participantControl().props.accessibilityState.expanded).toBe(true);
      ReactTestRenderer.act(() =>
        participantControl().props.onPress({ stopPropagation: jest.fn() }),
      );
      expect(renderedState(renderer)).toBe('summary');
      ReactTestRenderer.act(() =>
        renderer.root
          .findByProps({ testID: 'miao-card-title-action' })
          .props.onPress({ stopPropagation: jest.fn() }),
      );
      expect(renderedState(renderer)).toBe('detail');
      expect(
        renderer.root.findByProps({ testID: 'miao-card-details-action' }).props
          .accessibilityLabel,
      ).toBe('收起详情');
    } finally {
      ReactTestRenderer.act(() => renderer?.unmount());
    }
  });

  test('the visible content-menu control opens the real provider menu and retains full workspace navigation', () => {
    const onOpen = jest.fn();
    const measure = jest
      .spyOn(View.prototype, 'measureInWindow')
      .mockImplementation(callback => callback(0, 0, 390, 844));
    let renderer!: ReactTestRenderer.ReactTestRenderer;
    try {
      ReactTestRenderer.act(() => {
        renderer = renderCard(undefined, undefined, { onOpen });
      });
      const menu = renderer.root.findByProps({
        testID: 'miao-card-content-menu',
      });
      expect(menu.props.accessible).toBe(true);
      expect(menu.props.accessibilityLabel).toBe('更多任务操作');
      const stopPropagation = jest.fn();
      ReactTestRenderer.act(() => menu.props.onPress({ stopPropagation }));
      expect(stopPropagation).toHaveBeenCalledTimes(1);
      expect(onOpen).not.toHaveBeenCalled();
      expect(
        renderer.root.findAllByProps({ testID: 'content-actions-overlay' })
          .length,
      ).toBeGreaterThan(0);
      const openWorkspace = renderer.root.findByProps({
        testID: 'content-action-up',
      });
      expect(openWorkspace.props.accessibilityLabel).toBe('查看协作');
      ReactTestRenderer.act(() => openWorkspace.props.onPress());
      expect(onOpen).toHaveBeenCalledTimes(1);
      expect(renderedState(renderer)).toBe('summary');
    } finally {
      ReactTestRenderer.act(() => renderer?.unmount());
      measure.mockRestore();
    }
  });

  test.each(['immediate', 'deferred'] as const)(
    'a menu tap survives the enclosing touch release and cancellation with %s native measurements',
    timing => {
      const onOpen = jest.fn();
      const measurements: Array<() => void> = [];
      const measure = jest
        .spyOn(View.prototype, 'measureInWindow')
        .mockImplementation(callback => {
          const finish = () => callback(0, 0, 390, 844);
          if (timing === 'deferred') measurements.push(finish);
          else finish();
        });
      let renderer!: ReactTestRenderer.ReactTestRenderer;
      try {
        ReactTestRenderer.act(() => {
          renderer = renderCard(undefined, undefined, { onOpen });
        });
        const surface = nativeSurface(renderer);
        const menu = renderer.root.findByProps({
          testID: 'miao-card-content-menu',
        });
        ReactTestRenderer.act(() => {
          menu.props.onPress({ stopPropagation: jest.fn() });
          // Native touch-end bubbles independently of a nested onPress.
          surface.props.onTouchEnd({
            nativeEvent: { pageX: 340, pageY: 180 },
          });
          surface.props.onTouchCancel();
        });
        ReactTestRenderer.act(() => {
          while (measurements.length) measurements.shift()!();
        });
        // The provider measures its actual host before placing the menu.
        // It does not depend on measuring a nested Pressable gesture ref.
        expect(measure).toHaveBeenCalledTimes(1);
        expect(
          renderer.root.findAllByProps({ testID: 'content-actions-overlay' })
            .length,
        ).toBeGreaterThan(0);
        expect(onOpen).not.toHaveBeenCalled();
        ReactTestRenderer.act(() =>
          renderer.root
            .findByProps({ testID: 'content-action-up' })
            .props.onPress(),
        );
        expect(onOpen).toHaveBeenCalledTimes(1);
      } finally {
        ReactTestRenderer.act(() => renderer?.unmount());
        measure.mockRestore();
      }
    },
  );

  test('keeps the horizontal card responder when the list asks to terminate it', () => {
    const pan = jest.spyOn(PanResponder, 'create');
    let renderer: ReactTestRenderer.ReactTestRenderer | undefined;
    try {
      ReactTestRenderer.act(() => {
        renderer = ReactTestRenderer.create(
          React.createElement(AIAssistProvider, {
            routeKey: 'miao-test',
            onAskButler: jest.fn(),
            children: React.createElement(
              MiaoTaskCard,
              {
                object: {
                  kind: 'ai-task',
                  id: 'task-1',
                  title: '协作任务',
                },
                goal: '整理协作结果',
                status: '协作中',
                participantIds: ['miaoxun-butler'],
                agents: [agent('miaoxun-butler', '妙管家')],
                palette: palettes.light,
                language: 'zh',
                grid: false,
                failed: false,
                openLabel: '查看协作',
                onOpen: jest.fn(),
              },
              React.createElement(Text, null, '摘要'),
            ),
          }),
        );
      });
      const config = pan.mock.calls.at(-1)?.[0];
      expect(
        config?.onPanResponderTerminationRequest?.({} as never, {} as never),
      ).toBe(false);
    } finally {
      if (renderer) ReactTestRenderer.act(() => renderer?.unmount());
      pan.mockRestore();
    }
  });

  test('uses the configured detail distance threshold and transition state', () => {
    const pan = jest.spyOn(PanResponder, 'create');
    let renderer: ReactTestRenderer.ReactTestRenderer | undefined;
    try {
      const preferences = defaultUIPreferences();
      preferences.gestures['miao.taskCard.detailsSwipe'] = {
        ...preferences.gestures['miao.taskCard.detailsSwipe']!,
        distance: 140,
      };
      ReactTestRenderer.act(() => {
        renderer = renderCard(preferences);
      });
      const config = cardPanConfig(pan);
      ReactTestRenderer.act(() => {
        config.onPanResponderRelease?.({}, { dx: -120, dy: 0, vx: 0, vy: 0 });
      });
      expect(renderedState(renderer!)).toBe('summary');

      ReactTestRenderer.act(() => {
        config.onPanResponderRelease?.({}, { dx: -140, dy: 0, vx: 0, vy: 0 });
      });
      expect(renderedState(renderer!)).toBe('detail');
    } finally {
      if (renderer) ReactTestRenderer.act(() => renderer?.unmount());
      pan.mockRestore();
    }
  });

  test('swapped horizontal directions open and close their configured states', () => {
    const pan = jest.spyOn(PanResponder, 'create');
    let renderer: ReactTestRenderer.ReactTestRenderer | undefined;
    try {
      const preferences = defaultUIPreferences();
      preferences.gestures['miao.taskCard.participantsSwipe']!.direction =
        'left';
      preferences.gestures['miao.taskCard.detailsSwipe']!.direction = 'right';
      ReactTestRenderer.act(() => {
        renderer = renderCard(preferences);
      });
      const swipe = (dx: number) =>
        ReactTestRenderer.act(() => {
          cardPanConfig(pan).onPanResponderRelease?.(
            {},
            { dx, dy: 0, vx: 0, vy: 0 },
          );
        });
      swipe(-160);
      expect(renderedState(renderer!)).toBe('agents');
      swipe(160);
      expect(renderedState(renderer!)).toBe('summary');
      swipe(160);
      expect(renderedState(renderer!)).toBe('detail');
      swipe(-160);
      expect(renderedState(renderer!)).toBe('summary');
    } finally {
      if (renderer) ReactTestRenderer.act(() => renderer?.unmount());
      pan.mockRestore();
    }
  });

  test('does not enter the participant state when its component is hidden', () => {
    const pan = jest.spyOn(PanResponder, 'create');
    let renderer: ReactTestRenderer.ReactTestRenderer | undefined;
    try {
      const preferences = defaultUIPreferences();
      preferences.components.miao = {
        'miao.taskCard.participants': { visible: false },
      };
      ReactTestRenderer.act(() => {
        renderer = renderCard(preferences);
      });
      const config = cardPanConfig(pan);
      ReactTestRenderer.act(() => {
        config.onPanResponderRelease?.({}, { dx: 160, dy: 0, vx: 0, vy: 0 });
      });
      expect(renderedState(renderer!)).toBe('summary');
    } finally {
      if (renderer) ReactTestRenderer.act(() => renderer?.unmount());
      pan.mockRestore();
    }
  });

  test('places the participant control in its actual configured slot with its own label and icon', () => {
    const preferences = defaultUIPreferences();
    preferences.components.miao = {
      'miao.taskCard.participants': {
        slot: 'topRight',
        label: '协作伙伴',
        icon: '伙伴',
      },
    };
    let renderer!: ReactTestRenderer.ReactTestRenderer;
    try {
      ReactTestRenderer.act(() => {
        renderer = renderCard(preferences);
      });
      const top = renderer.root.findByProps({
        testID: 'miao-card-top-right-actions',
      });
      const control = top.findByProps({
        testID: 'miao-card-participants-action',
      });
      expect(control.props.accessibilityLabel).toBe('协作伙伴');
      expect(
        control.findAllByType(Text).map(node => node.props.children),
      ).toContain('伙伴');
      expect(
        renderer.root
          .findByProps({ testID: 'miao-card-footer-actions' })
          .findAllByProps({ testID: 'miao-card-participants-action' }),
      ).toHaveLength(0);
    } finally {
      ReactTestRenderer.act(() => renderer?.unmount());
    }
  });

  test('uses the configured details control to open S2 in the card and preserves a return control', () => {
    const preferences = defaultUIPreferences();
    preferences.components.miao = {
      'miao.taskCard.details': {
        label: '当前成果',
        icon: '结果',
        sizeScale: 1.3,
        order: 0,
      },
      'miao.taskCard.participants': {
        label: '参与者',
        sizeScale: 0.8,
        order: 1,
      },
    };
    preferences.surfaces.miao.buttonScale = 0.8;
    let renderer!: ReactTestRenderer.ReactTestRenderer;
    try {
      ReactTestRenderer.act(() => {
        renderer = renderCard(preferences);
      });
      const footer = renderer.root.findByProps({
        testID: 'miao-card-footer-actions',
      });
      const controls = footer.findAll(
        node =>
          typeof node.type === 'string' &&
          [
            'miao-card-details-action',
            'miao-card-participants-action',
          ].includes(node.props.testID),
      );
      expect(controls.map(node => node.props.testID)).toEqual([
        'miao-card-details-action',
        'miao-card-participants-action',
      ]);
      const details = renderer.root.findByProps({
        testID: 'miao-card-details-action',
      });
      expect(details.props.accessibilityLabel).toBe('当前成果');
      expect(
        details.findAllByType(Text).map(node => node.props.children),
      ).toContain('结果');
      const detailsStyle = StyleSheet.flatten(details.props.style);
      const participantStyle = StyleSheet.flatten(
        renderer.root.findByProps({ testID: 'miao-card-participants-action' })
          .props.style,
      );
      expect(detailsStyle.minHeight).toBeGreaterThanOrEqual(44);
      expect(detailsStyle.minWidth).toBeGreaterThanOrEqual(44);
      expect(participantStyle.minHeight).toBeGreaterThanOrEqual(44);
      expect(detailsStyle.transform).toBeUndefined();
      expect(detailsStyle.paddingHorizontal).toBeGreaterThan(
        participantStyle.paddingHorizontal,
      );
      ReactTestRenderer.act(() =>
        details.props.onPress({ stopPropagation: jest.fn() }),
      );
      expect(renderedState(renderer)).toBe('detail');
      const back = renderer.root.findByProps({
        accessibilityLabel: '收起详情',
      });
      ReactTestRenderer.act(() =>
        back.props.onPress({ stopPropagation: jest.fn() }),
      );
      expect(renderedState(renderer)).toBe('summary');
    } finally {
      ReactTestRenderer.act(() => renderer?.unmount());
    }
  });

  test('a hidden details component blocks the card tap while keeping participants reachable', () => {
    const preferences = defaultUIPreferences();
    preferences.components.miao = {
      'miao.taskCard.details': { visible: false, label: '隐藏详情' },
    };
    const onOpen = jest.fn();
    let renderer!: ReactTestRenderer.ReactTestRenderer;
    try {
      ReactTestRenderer.act(() => {
        renderer = renderCard(preferences, undefined, { onOpen });
      });
      expect(
        renderer.root.findAllByProps({ testID: 'miao-card-details-action' }),
      ).toHaveLength(0);
      ReactTestRenderer.act(() =>
        renderer.root.findByType(AIAssistGestureSurface).props.onPress(),
      );
      expect(renderedState(renderer)).toBe('summary');
      expect(onOpen).not.toHaveBeenCalled();
      ReactTestRenderer.act(() =>
        renderer.root
          .findByProps({ testID: 'miao-card-participants-action' })
          .props.onPress({ stopPropagation: jest.fn() }),
      );
      expect(renderedState(renderer)).toBe('agents');
      ReactTestRenderer.act(() =>
        renderer.root
          .findByProps({ testID: 'miao-card-participants-action' })
          .props.onPress({ stopPropagation: jest.fn() }),
      );
      expect(renderedState(renderer)).toBe('summary');
    } finally {
      ReactTestRenderer.act(() => renderer?.unmount());
    }
  });

  test('combined button scaling stays bounded while preserving native touch targets', () => {
    const preferences = defaultUIPreferences();
    preferences.surfaces.miao.buttonScale = 1.3;
    preferences.components.miao = {
      'miao.taskCard.participants': { sizeScale: 1.3 },
    };
    let renderer!: ReactTestRenderer.ReactTestRenderer;
    try {
      ReactTestRenderer.act(() => {
        renderer = renderCard(preferences);
      });
      const control = renderer.root.findByProps({
        testID: 'miao-card-participants-action',
      });
      const style = StyleSheet.flatten(control.props.style);
      expect(style.minHeight).toBeCloseTo(44 * 1.3);
      expect(style.minWidth).toBeCloseTo(44 * 1.3);
      expect(style.transform).toBeUndefined();
    } finally {
      ReactTestRenderer.act(() => renderer?.unmount());
    }
  });

  test('the default footer expands the current result and collapses it back into the summary', () => {
    const onOpen = jest.fn();
    let renderer!: ReactTestRenderer.ReactTestRenderer;
    try {
      ReactTestRenderer.act(() => {
        renderer = renderCard(undefined, undefined, { onOpen });
      });
      const details = renderer.root.findByProps({
        testID: 'miao-card-details-action',
      });
      expect(details.props.accessibilityLabel).toBe('展开详情');
      expect(
        details.findAllByType(Text).map(node => node.props.children),
      ).toContain('展开详情');
      expect(
        renderer.root.findByProps({ testID: 'miao-card-participants-action' })
          .props.accessibilityLabel,
      ).toBe('查看 1 个 Agent');
      expect(
        renderer.root.findAllByProps({ accessibilityLabel: '展开 Agent' }),
      ).toHaveLength(0);
      ReactTestRenderer.act(() =>
        details.props.onPress({ stopPropagation: jest.fn() }),
      );
      expect(renderedState(renderer)).toBe('detail');
      const collapse = renderer.root.findByProps({
        testID: 'miao-card-details-action',
      });
      expect(collapse.props.accessibilityLabel).toBe('收起详情');
      expect(collapse.props.accessibilityState.expanded).toBe(true);
      ReactTestRenderer.act(() =>
        collapse.props.onPress({ stopPropagation: jest.fn() }),
      );
      expect(renderedState(renderer)).toBe('summary');
      expect(onOpen).not.toHaveBeenCalled();
    } finally {
      ReactTestRenderer.act(() => renderer?.unmount());
    }
  });

  test('a default summary tap opens S2 inline while the content menu still opens the full workspace', () => {
    const onOpen = jest.fn();
    let renderer!: ReactTestRenderer.ReactTestRenderer;
    try {
      ReactTestRenderer.act(() => {
        renderer = renderCard(undefined, undefined, { onOpen });
      });
      ReactTestRenderer.act(() =>
        renderer.root.findByType(AIAssistGestureSurface).props.onPress(),
      );
      expect(renderedState(renderer)).toBe('detail');
      expect(onOpen).not.toHaveBeenCalled();
      // Reading an expanded card cannot replace it with a workspace screen.
      ReactTestRenderer.act(() =>
        renderer.root.findByType(AIAssistGestureSurface).props.onPress(),
      );
      expect(renderedState(renderer)).toBe('detail');
      const surface = renderer.root.findByType(AIAssistGestureSurface);
      const openWorkspace = surface.props.actions.find(
        (action: { direction: string }) => action.direction === 'up',
      );
      expect(openWorkspace.label).toBe('查看协作');
      ReactTestRenderer.act(() => openWorkspace.onSelect(surface.props.object));
      expect(onOpen).toHaveBeenCalledTimes(1);
    } finally {
      ReactTestRenderer.act(() => renderer?.unmount());
    }
  });

  test('a legacy card without an inline renderer opens its task and never exposes an empty S1 or S2', () => {
    const onOpen = jest.fn();
    const pan = jest.spyOn(PanResponder, 'create');
    let renderer!: ReactTestRenderer.ReactTestRenderer;
    try {
      ReactTestRenderer.act(() => {
        renderer = renderCard(undefined, undefined, {
          onOpen,
          inlineStates: false,
        });
      });
      expect(
        renderer.root.findAllByProps({ testID: 'miao-card-details-action' }),
      ).toHaveLength(0);
      expect(
        renderer.root.findAllByProps({
          testID: 'miao-card-participants-action',
        }),
      ).toHaveLength(0);
      for (const dx of [-160, 160]) {
        expect(
          cardPanConfig(pan).onMoveShouldSetPanResponder?.({}, { dx, dy: 0 }),
        ).toBe(false);
        ReactTestRenderer.act(() =>
          cardPanConfig(pan).onPanResponderRelease?.(
            {},
            { dx, dy: 0, vx: 0, vy: 0 },
          ),
        );
      }
      expect(
        renderer.root.findByProps({ testID: 'miao-card-summary-marker' }).props
          .children,
      ).toBe('摘要');
      ReactTestRenderer.act(() =>
        renderer.root.findByType(AIAssistGestureSurface).props.onPress(),
      );
      expect(onOpen).toHaveBeenCalledTimes(1);
      expect(
        renderer.root.findByProps({ testID: 'miao-card-summary-marker' }).props
          .children,
      ).toBe('摘要');
    } finally {
      ReactTestRenderer.act(() => renderer?.unmount());
      pan.mockRestore();
    }
  });

  test('a press delivered immediately after a reverse swipe cannot reopen the details', () => {
    const pan = jest.spyOn(PanResponder, 'create');
    let now = 1000;
    const clock = jest.spyOn(Date, 'now').mockImplementation(() => now);
    const onOpen = jest.fn();
    let renderer!: ReactTestRenderer.ReactTestRenderer;
    try {
      ReactTestRenderer.act(() => {
        renderer = renderCard(undefined, undefined, { onOpen });
      });
      const swipe = (dx: number) =>
        ReactTestRenderer.act(() =>
          cardPanConfig(pan).onPanResponderRelease?.(
            {},
            { dx, dy: 0, vx: 0, vy: 0 },
          ),
        );
      swipe(-160);
      expect(renderedState(renderer)).toBe('detail');
      swipe(160);
      expect(renderedState(renderer)).toBe('summary');
      ReactTestRenderer.act(() =>
        renderer.root.findByType(AIAssistGestureSurface).props.onPress(),
      );
      expect(renderedState(renderer)).toBe('summary');
      now += 261;
      ReactTestRenderer.act(() =>
        renderer.root.findByType(AIAssistGestureSurface).props.onPress(),
      );
      expect(renderedState(renderer)).toBe('detail');
      expect(onOpen).not.toHaveBeenCalled();
    } finally {
      ReactTestRenderer.act(() => renderer?.unmount());
      clock.mockRestore();
      pan.mockRestore();
    }
  });

  test('a configured details entry opens only the in-card result and remains dismissible without participants', () => {
    const preferences = defaultUIPreferences();
    preferences.components.miao = {
      'miao.taskCard.details': { visible: true },
    };
    const onOpen = jest.fn();
    let renderer!: ReactTestRenderer.ReactTestRenderer;
    try {
      ReactTestRenderer.act(() => {
        renderer = renderCard(preferences, undefined, {
          participantIds: [],
          onOpen,
        });
      });
      ReactTestRenderer.act(() =>
        renderer.root
          .findByProps({ testID: 'miao-card-details-action' })
          .props.onPress({ stopPropagation: jest.fn() }),
      );
      expect(renderedState(renderer)).toBe('detail');
      expect(onOpen).not.toHaveBeenCalled();
      ReactTestRenderer.act(() =>
        renderer.root
          .findByProps({ accessibilityLabel: '收起详情' })
          .props.onPress({ stopPropagation: jest.fn() }),
      );
      expect(renderedState(renderer)).toBe('summary');
    } finally {
      ReactTestRenderer.act(() => renderer?.unmount());
    }
  });

  test('a hidden details component disables its swipe without hiding the current task status', () => {
    const preferences = defaultUIPreferences();
    preferences.components.miao = {
      'miao.taskCard.details': { visible: false },
      'miao.taskCard.participants': { visible: false },
    };
    const pan = jest.spyOn(PanResponder, 'create');
    let renderer!: ReactTestRenderer.ReactTestRenderer;
    try {
      ReactTestRenderer.act(() => {
        renderer = renderCard(preferences);
      });
      ReactTestRenderer.act(() =>
        cardPanConfig(pan).onPanResponderRelease?.(
          {},
          { dx: -160, dy: 0, vx: 0, vy: 0 },
        ),
      );
      expect(renderedState(renderer)).toBe('summary');
      expect(
        renderer.root.findByProps({ testID: 'miao-task-status' }).props
          .children,
      ).toBe('协作中');
    } finally {
      ReactTestRenderer.act(() => renderer?.unmount());
      pan.mockRestore();
    }
  });

  test('moves from summary to the Agent list on a deliberate right swipe', () => {
    expect(nextMiaoCardState('summary', 'right', 96, 12)).toBe('agents');
  });

  test('moves from summary to content detail on a deliberate left swipe', () => {
    expect(nextMiaoCardState('summary', 'left', 96, 12)).toBe('detail');
  });

  test('uses the PDF reverse swipes to return to summary', () => {
    expect(nextMiaoCardState('agents', 'left', 96, 12)).toBe('summary');
    expect(nextMiaoCardState('detail', 'right', 96, 12)).toBe('summary');
  });

  test('keeps the current state when the gesture is below threshold or vertically locked', () => {
    const states: MiaoCardViewState[] = ['summary', 'agents', 'detail'];
    for (const state of states) {
      expect(nextMiaoCardState(state, 'left', 79, 0)).toBe(state);
      expect(nextMiaoCardState(state, 'right', 96, 97)).toBe(state);
      expect(nextMiaoCardState(state, 'right', 80, 80)).toBe(state);
    }
  });

  test('projects each participating Agent once and keeps the latest real step', () => {
    const first = agent('miaoxun-butler', '妙管家');
    const worker = agent('album-manager', '相册管理');
    const workspace = agentWorkspace({
      steps: [
        workspaceStep({
          id: 'coordinate-1',
          agentId: first.key,
          capability: 'workspace.coordinate',
          updatedAt: '2026-10-12T00:00:01Z',
          summary: '已拆分任务',
        }),
        workspaceStep({
          id: 'worker-1',
          agentId: worker.key,
          capability: 'media.search',
          goal: '查找海边视频',
          updatedAt: '2026-10-12T00:00:02Z',
          summary: '已找到候选素材',
        }),
        workspaceStep({
          id: 'worker-2',
          agentId: worker.key,
          capability: 'media.search',
          goal: '复核海边视频',
          updatedAt: '2026-10-12T00:00:03Z',
          summary: '已完成复核',
        }),
      ],
    });

    const projected = participantProjection(workspace, [first, worker]);

    expect(projected.map(item => item.agentId)).toEqual([
      'miaoxun-butler',
      'album-manager',
    ]);
    expect(projected[0].agent).toBe(first);
    expect(projected[0].step.id).toBe('coordinate-1');
    expect(projected[1].agent).toBe(worker);
    expect(projected[1].step.id).toBe('worker-2');
    expect(projected[1].step.summary).toBe('已完成复核');
  });

  test('keeps an explicit unavailable Agent identity instead of inventing display data', () => {
    const workspace = agentWorkspace({
      steps: [workspaceStep({ agentId: 'unpublished-agent' })],
    });

    const projected = participantProjection(workspace, []);

    expect(projected).toHaveLength(1);
    expect(projected[0].agentId).toBe('unpublished-agent');
    expect(projected[0].agent).toBeNull();
  });
});
