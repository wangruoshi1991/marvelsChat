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
    onModify: jest.fn(),
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
        onModify={jest.fn()}
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
