import React from 'react';
import Renderer, { act } from 'react-test-renderer';
import { MyComicsScreen } from '../src/features/messages/MyComicsScreen';
import { chatContentApi } from '../src/services/api/chatContentApi';
import { palettes } from '../src/shared/theme';
jest.mock('../src/services/api/chatContentApi', () => ({
  chatContentApi: { comics: jest.fn() },
}));
test('retains standalone comics as a read-only history without creation controls', async () => {
  jest.mocked(chatContentApi.comics).mockResolvedValue([
    {
      id: 'old',
      title: '旧独立漫画',
      prompt: '',
      summary: '',
      style: 'manga',
      frames: [{ title: '一' }, { title: '二' }],
      sourceDiaryEntryId: null,
    },
  ]);
  const open = jest.fn();
  let tree: Renderer.ReactTestRenderer;
  await act(async () => {
    tree = Renderer.create(
      <MyComicsScreen
        token="owner"
        palette={palettes.light}
        language="zh"
        onBack={jest.fn()}
        onOpen={open}
      />,
    );
  });
  await act(async () => {
    tree!.root.findByProps({ accessibilityLabel: '查看作品' }).props.onPress();
  });
  expect(open).toHaveBeenCalledWith('old');
  expect(
    tree!.root.findAllByProps({ accessibilityLabel: '生成漫画' }),
  ).toHaveLength(0);
  await act(async () => tree!.unmount());
});
