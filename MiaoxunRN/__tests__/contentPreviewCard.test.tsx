import React from 'react';
import Renderer, { act } from 'react-test-renderer';
import { ContentPreviewMessageCard } from '../src/features/messages/ContentPreviewMessageCard';
import { parseContentPreview } from '../src/models/chatContentPreview';
import { palettes } from '../src/shared/theme';

const proposal = {
  id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  version: 1,
  revision: 1,
  snapshotHash: 'a'.repeat(64),
  kind: 'comic',
  status: 'pending',
  threadId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
  inputMessageId: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
  outputMessageId: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
  snapshot: {
    title: '散步',
    summary: '小猫走过桥',
    style: 'slice-of-life',
    frameCount: 4,
    frames: Array.from({ length: 4 }, (_, i) => ({
      index: i + 1,
      title: `格${i + 1}`,
      scene: '桥',
      caption: '',
      dialogue: '',
      mood: '',
      camera: '',
      mediaAssetIds: [],
    })),
  },
  sources: [],
  allowedActions: ['confirm', 'reject'],
  expiresAt: '2099-01-01T00:00:00Z',
  result: null,
};

const completedTask = {
  id: 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',
  contractVersion: 1 as const,
  comicDiaryId: 'ffffffff-ffff-4fff-8fff-ffffffffffff',
  status: 'succeeded' as const,
  phase: 'completed' as const,
  revision: 1,
  progress: { total: 4, succeeded: 4, failed: 0, unknown: 0 },
  frames: Array.from({ length: 4 }, (_, index) => ({
    frameIndex: index + 1,
    status: 'succeeded' as const,
    mediaAssetId: null,
    errorCode: null,
  })),
  error: null,
  allowedActions: [],
  createdAt: '2099-01-01T00:00:00Z',
  updatedAt: '2099-01-01T00:00:00Z',
};

test('offers one explicit generation action and prevents confirmation while busy', async () => {
  const confirm = jest.fn();
  const props = {
    preview: parseContentPreview(proposal),
    token: 'owner',
    palette: palettes.light,
    language: 'zh' as const,
    busy: false,
    onConfirm: confirm,
    onReject: jest.fn(),
    onRefresh: jest.fn(),
    onOpen: jest.fn(),
    onSelectContext: jest.fn(),
  };
  let tree: Renderer.ReactTestRenderer;
  await act(async () => {
    tree = Renderer.create(<ContentPreviewMessageCard {...props} />);
  });
  const action = tree!.root.findByProps({ testID: 'content-preview-confirm' });
  await act(async () => {
    action.props.onPress();
  });
  expect(confirm).toHaveBeenCalledTimes(1);
  await act(async () => {
    tree!.update(<ContentPreviewMessageCard {...props} busy />);
  });
  expect(
    tree!.root.findByProps({ testID: 'content-preview-confirm' }).props
      .disabled,
  ).toBe(true);
});

test('uses the preview header as the chat context entry without a revise action', async () => {
  const selectContext = jest.fn();
  let tree: Renderer.ReactTestRenderer;
  await act(async () => {
    tree = Renderer.create(
      <ContentPreviewMessageCard
        preview={parseContentPreview(proposal)}
        token="owner"
        palette={palettes.light}
        language="zh"
        busy={false}
        onConfirm={jest.fn()}
        onReject={jest.fn()}
        onRefresh={jest.fn()}
        onOpen={jest.fn()}
        onSelectContext={selectContext}
      />,
    );
  });
  await act(async () => {
    tree!.root
      .findByProps({ testID: 'content-preview-context-select' })
      .props.onPress();
  });
  expect(selectContext).toHaveBeenCalledTimes(1);
  expect(
    tree!.root.findAll(
      node =>
        typeof node.props.children === 'string' &&
        node.props.children.includes('继续修改'),
    ),
  ).toHaveLength(0);
});

test('expired previews cannot generate and four frame positions remain ordered', async () => {
  let tree: Renderer.ReactTestRenderer;
  await act(async () => {
    tree = Renderer.create(
      <ContentPreviewMessageCard
        preview={parseContentPreview({
          ...proposal,
          status: 'expired',
          allowedActions: [],
        })}
        token="owner"
        palette={palettes.light}
        language="zh"
        busy={false}
        onConfirm={jest.fn()}
        onReject={jest.fn()}
        onRefresh={jest.fn()}
        onOpen={jest.fn()}
        onSelectContext={jest.fn()}
      />,
    );
  });
  expect(
    tree!.root.findAllByProps({ testID: 'content-preview-confirm' }),
  ).toHaveLength(0);
  expect([
    ...new Set(
      tree!.root
        .findAll(node => /^comic-frame-\d+$/.test(node.props.testID || ''))
        .map(node => node.props.testID),
    ),
  ]).toEqual([
    'comic-frame-1',
    'comic-frame-2',
    'comic-frame-3',
    'comic-frame-4',
  ]);
});

test('completed history keeps detail actions without a refresh task action', async () => {
  let tree: Renderer.ReactTestRenderer;
  await act(async () => {
    tree = Renderer.create(
      <ContentPreviewMessageCard
        preview={parseContentPreview({
          ...proposal,
          status: 'confirmed',
          allowedActions: [],
          result: {
            comicDiaryId: completedTask.comicDiaryId,
            comicRenderTaskId: completedTask.id,
          },
        })}
        task={completedTask}
        token="owner"
        palette={palettes.light}
        language="zh"
        busy={false}
        onConfirm={jest.fn()}
        onReject={jest.fn()}
        onRefresh={jest.fn()}
        onOpen={jest.fn()}
        onSelectContext={jest.fn()}
      />,
    );
  });
  expect(
    tree!.root.findAll(
      node =>
        node.props.accessibilityRole === 'button' &&
        node.props.accessibilityLabel === '刷新查看',
    ),
  ).toHaveLength(0);
  expect(
    tree!.root.findAllByProps({ accessibilityLabel: '查看详情' }).length,
  ).toBeGreaterThan(0);
});

test('opens a selected source image instead of leaving it as a passive thumbnail', async () => {
  const mediaAssetId = '123e4567-e89b-12d3-a456-426614174000';
  const onOpenSource = jest.fn();
  let tree: Renderer.ReactTestRenderer;
  await act(async () => {
    tree = Renderer.create(
      <ContentPreviewMessageCard
        preview={parseContentPreview({
          ...proposal,
          sources: [
            {
              type: 'station-photo',
              id: mediaAssetId,
              mediaAssetId,
              title: '雨后纸船.jpg',
            },
          ],
        })}
        token="owner"
        palette={palettes.light}
        language="zh"
        busy={false}
        onConfirm={jest.fn()}
        onReject={jest.fn()}
        onRefresh={jest.fn()}
        onOpen={jest.fn()}
        onSelectContext={jest.fn()}
        onOpenSource={onOpenSource}
      />,
    );
  });
  const sourceImage = tree!.root.findByProps({
    accessibilityLabel: '雨后纸船.jpg',
  });
  expect(sourceImage.props.accessibilityRole).toBe('button');
  await act(async () => sourceImage.props.onPress());
  expect(onOpenSource).toHaveBeenCalledWith(mediaAssetId);
});
