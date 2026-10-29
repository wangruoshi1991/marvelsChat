import React, { useEffect } from 'react';
import { Animated, StyleSheet, Text, View } from 'react-native';
import ReactTestRenderer from 'react-test-renderer';

import { StationProfileHeader } from '../src/features/station/StationHeader';
import { palettes } from '../src/shared/theme';

const copyAIID = jest.fn();
const openLocation = jest.fn();
const stageMounted = jest.fn();
const stageUnmounted = jest.fn();
const longBio = '一段用于验证较长简介折叠行为的内容。'.repeat(12);

function StageFixture() {
  useEffect(() => {
    stageMounted();
    return stageUnmounted;
  }, []);
  return <View testID="station-header-stage" />;
}

function header(collapseProgress: Animated.Value) {
  return (
    <StationProfileHeader
      avatarConfig={{}}
      avatarText="妙"
      bio={longBio}
      collapseProgress={collapseProgress}
      language="zh"
      locationLabel="上海"
      nickname="测试昵称"
      onCopyAIID={copyAIID}
      onOpenLocation={openLocation}
      palette={palettes.light}
      presenceStatus="online"
      renderUserAvatar={() => <View testID="station-header-user-avatar" />}
      stage={<StageFixture />}
      aiId="900000000000001"
    />
  );
}

function groupHeight(
  renderer: ReactTestRenderer.ReactTestRenderer,
  testID: string,
) {
  const group = renderer.root.findByProps({ testID });
  const style = StyleSheet.flatten(group.props.style);
  if (style.height === undefined) return undefined;
  return (style.height as unknown as { __getValue: () => number }).__getValue();
}

function measureGroup(
  renderer: ReactTestRenderer.ReactTestRenderer,
  testID: string,
  height: number,
) {
  const content = renderer.root.findByProps({ testID: `${testID}-content` });
  content.props.onLayout({
    nativeEvent: { layout: { height, width: 200, x: 0, y: 0 } },
  });
}

describe('station profile collapse', () => {
  let renderer: ReactTestRenderer.ReactTestRenderer | undefined;
  let collapseProgress: Animated.Value;

  beforeEach(() => {
    jest.clearAllMocks();
    collapseProgress = new Animated.Value(0);
  });

  afterEach(async () => {
    await ReactTestRenderer.act(async () => renderer?.unmount());
    renderer = undefined;
  });

  it('keeps the expanded profile content and 3D stage mounted as one instance', async () => {
    await ReactTestRenderer.act(async () => {
      renderer = ReactTestRenderer.create(header(collapseProgress));
    });

    const texts = renderer!.root
      .findAllByType(Text)
      .map(node => node.props.children);
    expect(texts).toContain('我的信息');
    expect(texts).toContain('测试昵称');
    expect(texts).toContain('ID · 900000000000001');
    expect(texts).toContain(longBio);
    expect(texts).toContain('上海');
    expect(
      StyleSheet.flatten(
        renderer!.root.findByProps({ testID: 'station-profile-main-row' }).props
          .style,
      ).alignItems,
    ).toBe('center');
    expect(stageMounted).toHaveBeenCalledTimes(1);
    expect(stageUnmounted).not.toHaveBeenCalled();
  });

  it('clips measured long details continuously, hides controls when collapsed, and restores them on reverse scroll', async () => {
    await ReactTestRenderer.act(async () => {
      renderer = ReactTestRenderer.create(header(collapseProgress));
    });

    await ReactTestRenderer.act(async () => {
      measureGroup(renderer!, 'station-profile-kicker', 24);
      measureGroup(renderer!, 'station-profile-details', 224);
    });

    const collapsedDetails = () =>
      renderer!.root.findByProps({ testID: 'station-profile-details' });
    const name = () =>
      renderer!.root.findByProps({ testID: 'station-profile-name' });
    const nicknameText = () => name().props.children;

    await ReactTestRenderer.act(async () => collapseProgress.setValue(0.25));
    expect(groupHeight(renderer!, 'station-profile-kicker')).toBeCloseTo(18);
    expect(groupHeight(renderer!, 'station-profile-details')).toBeCloseTo(168);
    expect(collapsedDetails().props.pointerEvents).toBe('auto');
    expect(collapsedDetails().props.accessibilityElementsHidden).toBe(false);
    expect(nicknameText()).toBe('测试昵称');

    await ReactTestRenderer.act(async () => collapseProgress.setValue(0.5));
    expect(groupHeight(renderer!, 'station-profile-kicker')).toBeCloseTo(12);
    expect(groupHeight(renderer!, 'station-profile-details')).toBeCloseTo(112);
    expect(collapsedDetails().props.pointerEvents).toBe('none');
    expect(collapsedDetails().props.accessibilityElementsHidden).toBe(true);
    expect(nicknameText()).toBe('测试昵称');

    await ReactTestRenderer.act(async () => collapseProgress.setValue(1));
    expect(groupHeight(renderer!, 'station-profile-kicker')).toBe(0);
    expect(groupHeight(renderer!, 'station-profile-details')).toBe(0);
    expect(collapsedDetails().props.pointerEvents).toBe('none');
    expect(collapsedDetails().props.accessibilityElementsHidden).toBe(true);
    expect(collapsedDetails().props.importantForAccessibility).toBe(
      'no-hide-descendants',
    );
    expect(nicknameText()).toBe('测试昵称');
    expect(stageMounted).toHaveBeenCalledTimes(1);
    expect(stageUnmounted).not.toHaveBeenCalled();

    await ReactTestRenderer.act(async () => collapseProgress.setValue(0));
    expect(groupHeight(renderer!, 'station-profile-details')).toBeCloseTo(224);
    expect(collapsedDetails().props.pointerEvents).toBe('auto');
    expect(collapsedDetails().props.accessibilityElementsHidden).toBe(false);
    expect(nicknameText()).toBe('测试昵称');
  });

  it('waits for a positive natural layout instead of locking initially empty measurements closed', async () => {
    await ReactTestRenderer.act(async () => {
      renderer = ReactTestRenderer.create(header(collapseProgress));
    });

    await ReactTestRenderer.act(async () => {
      measureGroup(renderer!, 'station-profile-kicker', 0);
      measureGroup(renderer!, 'station-profile-details', 0);
    });

    expect(groupHeight(renderer!, 'station-profile-kicker')).toBeUndefined();
    expect(groupHeight(renderer!, 'station-profile-details')).toBeUndefined();

    await ReactTestRenderer.act(async () => {
      measureGroup(renderer!, 'station-profile-kicker', 24);
      measureGroup(renderer!, 'station-profile-details', 224);
    });

    expect(groupHeight(renderer!, 'station-profile-kicker')).toBe(24);
    expect(groupHeight(renderer!, 'station-profile-details')).toBe(224);
  });

  it('restores full details after a clipped layout reports zero and accepts later text reflow', async () => {
    await ReactTestRenderer.act(async () => {
      renderer = ReactTestRenderer.create(header(collapseProgress));
    });
    await ReactTestRenderer.act(async () => {
      measureGroup(renderer!, 'station-profile-kicker', 24);
      measureGroup(renderer!, 'station-profile-details', 224);
      collapseProgress.setValue(1);
    });
    await ReactTestRenderer.act(async () => {
      measureGroup(renderer!, 'station-profile-kicker', 0);
      measureGroup(renderer!, 'station-profile-details', 0);
      collapseProgress.setValue(0);
    });

    expect(groupHeight(renderer!, 'station-profile-kicker')).toBe(24);
    expect(groupHeight(renderer!, 'station-profile-details')).toBe(224);
    expect(
      renderer!.root.findByProps({ testID: 'station-profile-details' }).props
        .accessibilityElementsHidden,
    ).toBe(false);

    await ReactTestRenderer.act(async () => {
      measureGroup(renderer!, 'station-profile-details', 280);
    });
    expect(groupHeight(renderer!, 'station-profile-details')).toBe(280);
    expect(stageMounted).toHaveBeenCalledTimes(1);
    expect(stageUnmounted).not.toHaveBeenCalled();
  });
});
