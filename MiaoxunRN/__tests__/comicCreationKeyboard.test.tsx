import React from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
} from 'react-native';
import Renderer, { act } from 'react-test-renderer';
import { ComicCreationScreen } from '../src/features/station/ComicCreationScreen';
import type { useMiaoxunSession } from '../src/features/session/useMiaoxunSession';
import { emptyStationContent } from '../src/features/session/sessionDefaults';
import { palettes } from '../src/shared/theme';

test.each(['keyboard', 'back-target'] as const)(
  'comic editing provides its own usable %s contract without starting generation',
  async contract => {
    const previousPlatform = Platform.OS;
    Platform.OS = 'ios';
    const onBack = jest.fn();
    const create = jest.fn();
    let tree: Renderer.ReactTestRenderer | undefined;
    try {
      await act(async () => {
        tree = Renderer.create(
          <ComicCreationScreen
            palette={palettes.light}
            language="zh"
            session={
              {
                token: 'isolated-comic-test',
                stationContent: emptyStationContent,
                createStationComicDiary: create,
              } as unknown as ReturnType<typeof useMiaoxunSession>
            }
            initialPrompt="用户准备编辑的故事"
            onBack={onBack}
            onActionMessage={jest.fn()}
            onActionError={jest.fn()}
          />,
        );
      });
      if (contract === 'keyboard') {
        const avoiding = tree!.root.findAllByType(KeyboardAvoidingView);
        expect(avoiding).toHaveLength(1);
        expect(avoiding[0].props.behavior).toBe('padding');
        expect(StyleSheet.flatten(avoiding[0].props.style).flex).toBe(1);
        expect(avoiding[0].findByType(ScrollView)).toBeDefined();
        expect(
          avoiding[0].findByType(ScrollView).props.keyboardShouldPersistTaps,
        ).toBe('handled');
      } else {
        const back = tree!.root.findByProps({ accessibilityLabel: '返回聊天' });
        expect(
          StyleSheet.flatten(back.props.style).width,
        ).toBeGreaterThanOrEqual(44);
        expect(
          StyleSheet.flatten(back.props.style).minHeight ?? 0,
        ).toBeGreaterThanOrEqual(44);
        act(() => back.props.onPress());
        expect(onBack).toHaveBeenCalledTimes(1);
      }
      expect(create).not.toHaveBeenCalled();
    } finally {
      if (tree) await act(async () => tree!.unmount());
      Platform.OS = previousPlatform;
    }
  },
);
