import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';

import { ContextReference } from '../src/features/ai/AIInteraction';
import type { Palette } from '../src/shared/theme';

const palette = {
  background: '#fff',
  surface: '#fff',
  soft: '#f4f4f4',
  border: '#ddd',
  text: '#111',
  secondaryText: '#666',
  mint: '#0a8',
  rose: '#c33',
  shadow: '#000',
} as unknown as Palette;

describe('context reference presentation', () => {
  it('shows an authorized station photo as a thumbnail instead of a text-only material row', () => {
    let tree!: TestRenderer.ReactTestRenderer;
    act(() => {
      tree = TestRenderer.create(
        <ContextReference
          token="qa-token"
          references={[
            {
              kind: 'station-photo',
              id: '123e4567-e89b-12d3-a456-426614174000',
              title: '雨后纸船.jpg',
            },
          ]}
          palette={palette}
          language="zh"
        />,
      );
    });

    const photo = tree.root.findByProps({ testID: 'context-reference-photo' });
    expect(photo.props.accessibilityLabel).toContain('雨后纸船.jpg');
    const image = photo.findByType(require('react-native').Image);
    expect(image.props.source.uri).toContain(
      '/api/station/media-assets/123e4567-e89b-12d3-a456-426614174000/file',
    );
    expect(image.props.source.headers.Authorization).toBe('Bearer qa-token');
  });

  it('keeps a text-only reference when no authenticated media token is available', () => {
    let tree!: TestRenderer.ReactTestRenderer;
    act(() => {
      tree = TestRenderer.create(
        <ContextReference
          references={[{ kind: 'station-photo', id: 'photo-1', title: '照片' }]}
          palette={palette}
          language="zh"
        />,
      );
    });

    expect(
      tree.root.findAllByProps({ testID: 'context-reference-photo' }),
    ).toHaveLength(0);
    expect(
      tree.root
        .findAllByType(require('react-native').Text)
        .some(
          node =>
            Array.isArray(node.props.children) &&
            node.props.children.includes('照片'),
        ),
    ).toBe(true);
  });

  it('makes an authenticated station photo reference openable', () => {
    const onPressReference = jest.fn();
    let tree!: TestRenderer.ReactTestRenderer;
    act(() => {
      tree = TestRenderer.create(
        <ContextReference
          token="qa-token"
          references={[{ kind: 'station-photo', id: 'photo-1', title: '照片' }]}
          palette={palette}
          language="zh"
          onPressReference={onPressReference}
        />,
      );
    });

    const photo = tree.root.findByProps({ testID: 'context-reference-photo' });
    const button = photo.findAll(
      node =>
        node.props.accessibilityRole === 'button' &&
        node.props.accessibilityLabel === '照片',
    )[0];
    expect(button).toBeDefined();
    act(() => button.props.onPress());
    expect(onPressReference).toHaveBeenCalledWith({
      kind: 'station-photo',
      id: 'photo-1',
      title: '照片',
    });
  });
});
