jest.mock('../src/services/api/agentWorkspaceApi', () => ({
  agentWorkspaceApi: { text: jest.fn() },
}));
import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';
import { Text } from 'react-native';
import { WorkspaceTextResult } from '../src/features/workspaces/WorkspaceTextResult';
import { AgentWorkspaceCard } from '../src/features/workspaces/AgentWorkspaceCard';
import { agentWorkspace, workspaceStep } from '../__fixtures__/agentWorkspace';
import { AIAssistProvider } from '../src/features/assist/AIAssistProvider';
import { ChatMessageText } from '../src/features/messages/ChatMessageText';
import { agentWorkspaceApi } from '../src/services/api/agentWorkspaceApi';
import { MiaoxunApiError } from '../src/services/api/http';
import { WorkspaceButton } from '../src/shared/workspaceUi';
import { palettes } from '../src/shared/theme';

const api = jest.mocked(agentWorkspaceApi);
const props: React.ComponentProps<typeof WorkspaceTextResult> = {
  artifact: { kind: 'text_result' as const, id: 'node-1', title: '故事' },
  token: 'owner-token',
  workspaceId: 'workspace-1',
  foreground: true,
  disabled: false,
  refreshKey: 0,
  palette: palettes.light,
  language: 'zh' as const,
};
const document = (content = '先去看展。\n\n- 带好入场码', id = 'node-1') => ({
  id,
  title: '故事',
  content,
});
const deferred = () => {
  let resolve!: (value: ReturnType<typeof document>) => void;
  const promise = new Promise<ReturnType<typeof document>>(accept => {
    resolve = accept;
  });
  return { promise, resolve };
};
let tree: TestRenderer.ReactTestRenderer;
const mount = async (next = props) => {
  await act(async () => {
    tree = TestRenderer.create(<WorkspaceTextResult {...next} />);
  });
};
const update = async (next = props) => {
  await act(async () => tree.update(<WorkspaceTextResult {...next} />));
};
const bodies = () =>
  tree.root.findAllByType(ChatMessageText).map(node => node.props.children);
const renderedText = () =>
  tree.root.findAllByType(Text).map(node => node.props.children);
beforeEach(() => api.text.mockReset());
afterEach(async () => {
  if (tree) await act(async () => tree.unmount());
});

test('visible text is read under its workspace and node, with the existing prose renderer', async () => {
  api.text.mockResolvedValue(document());
  await mount();
  expect(api.text).toHaveBeenCalledWith('owner-token', 'workspace-1', 'node-1');
  expect(bodies()).toEqual([document().content]);
  expect(tree.root.findByType(ChatMessageText).props.formatted).toBe(true);
  await update({ ...props, palette: palettes.dark });
  expect(api.text).toHaveBeenCalledTimes(1);
});

test('the Miao result summary opens the exact full text only on explicit request', async () => {
  const fullText = `${'当前成果第一部分。\n\n'.repeat(30)}当前成果结尾。`;
  api.text.mockResolvedValue(document(fullText));
  await mount({ ...props, collapsedByDefault: true });

  expect(bodies()).toEqual([]);
  const toggle = tree.root.findByProps({
    testID: 'workspace-text-toggle-node-1',
  });
  expect(toggle.props.label).toBe('阅读完整成果');
  expect(renderedText()).toContain('阅读完整成果');

  await act(async () => toggle.props.onPress());
  expect(bodies()).toEqual([fullText]);
  expect(renderedText()).toContain('收起完整成果');
  expect(api.text).toHaveBeenCalledTimes(1);

  await act(async () =>
    tree.root
      .findByProps({ testID: 'workspace-text-toggle-node-1' })
      .props.onPress(),
  );
  expect(bodies()).toEqual([]);
});

test('workspace polling revisions do not reload the open Miao result body', async () => {
  const artifact = {
    kind: 'text_result' as const,
    id: 'node-result',
    title: '故事',
  };
  const workspace = agentWorkspace({
    status: 'succeeded',
    revision: 3,
    currentRound: 1,
    result: artifact,
    summary: '本轮协作已完成。',
    steps: [
      workspaceStep({
        id: artifact.id,
        key: 'text-result',
        agentId: 'comic-diary',
        capability: 'comic.script',
        status: 'succeeded',
        summary: '完成故事结构。',
        result: artifact,
      }),
    ],
  });
  const card = (revision: number) => (
    <AIAssistProvider routeKey="miao-polling-test" onAskButler={jest.fn()}>
      <AgentWorkspaceCard
        workspace={{ ...workspace, revision }}
        token="owner-token"
        active
        agents={[]}
        palette={palettes.light}
        language="zh"
        onOpen={jest.fn()}
        grid={false}
        viewState="detail"
      />
    </AIAssistProvider>
  );
  api.text.mockResolvedValue(document('保持展开的正文', artifact.id));
  await act(async () => {
    tree = TestRenderer.create(card(workspace.revision));
  });
  await act(async () =>
    tree.root
      .findByProps({ testID: 'workspace-text-toggle-node-result' })
      .props.onPress(),
  );
  expect(bodies()).toEqual(['保持展开的正文']);
  await act(async () => tree.update(card(workspace.revision + 1)));
  expect(api.text).toHaveBeenCalledTimes(1);
  expect(bodies()).toEqual(['保持展开的正文']);
});

test.each([
  ['account token', { token: 'other-owner-token' }],
  ['workspace', { workspaceId: 'workspace-2' }],
  ['node', { artifact: { ...props.artifact, id: 'node-2' } }],
] as const)(
  'changing %s clears the previous body before the new response',
  async (_kind, changed) => {
    api.text.mockResolvedValue(document('原来的正文'));
    await mount();
    const pending = deferred();
    api.text.mockReturnValue(pending.promise);
    await update({ ...props, ...changed });
    expect(bodies()).toEqual([]);
    expect(renderedText()).not.toContain('原来的正文');
    await act(async () =>
      pending.resolve(
        document(
          '当前正文',
          'artifact' in changed ? changed.artifact.id : 'node-1',
        ),
      ),
    );
    expect(bodies()).toEqual(['当前正文']);
  },
);

test('late responses from a previous token cannot restore its private body', async () => {
  const previous = deferred();
  const current = deferred();
  api.text
    .mockReturnValueOnce(previous.promise)
    .mockReturnValueOnce(current.promise);
  await mount();
  await update({ ...props, token: 'other-owner-token' });
  await act(async () => previous.resolve(document('旧账号的正文')));
  expect(bodies()).toEqual([]);
  await act(async () => current.resolve(document('当前账号的正文')));
  expect(bodies()).toEqual(['当前账号的正文']);
});

test('backgrounding drops body and pending responses; foreground always reads permission again', async () => {
  api.text.mockResolvedValueOnce(document('后台前正文'));
  await mount();
  expect(bodies()).toEqual(['后台前正文']);
  const obsolete = deferred();
  const resumed = deferred();
  api.text
    .mockReturnValueOnce(obsolete.promise)
    .mockReturnValueOnce(resumed.promise);
  await update({ ...props, refreshKey: 1 });
  await update({ ...props, foreground: false, refreshKey: 1 });
  expect(bodies()).toEqual([]);
  await act(async () => obsolete.resolve(document('后台期间迟到的正文')));
  expect(bodies()).toEqual([]);
  await update({ ...props, refreshKey: 1 });
  expect(bodies()).toEqual([]);
  expect(api.text).toHaveBeenCalledTimes(3);
  await act(async () => resumed.resolve(document('重新鉴权后的正文')));
  expect(bodies()).toEqual(['重新鉴权后的正文']);
});

test.each([401, 403, 404, 409])(
  'a %s refresh clears body, reports the error and waits for explicit retry',
  async status => {
    api.text.mockResolvedValueOnce(document('曾获准读取的正文'));
    await mount();
    api.text.mockRejectedValueOnce(
      new MiaoxunApiError('当前成果不可读取。', { status }),
    );
    await update({ ...props, refreshKey: 1 });
    expect(bodies()).toEqual([]);
    expect(renderedText()).toContain('当前成果不可读取。');
    expect(api.text).toHaveBeenCalledTimes(2);
    api.text.mockResolvedValueOnce(document('当前获准读取的正文'));
    await act(async () =>
      tree.root.findByType(WorkspaceButton).props.onPress(),
    );
    expect(api.text).toHaveBeenCalledTimes(3);
    expect(bodies()).toEqual(['当前获准读取的正文']);
  },
);

test('a changed title never presents an unbound document as the selected result', async () => {
  api.text.mockResolvedValue({ ...document(), title: '另一份成果' });
  await mount();
  expect(bodies()).toEqual([]);
  expect(renderedText()).toContain('文字成果已变化或读取失败，请重新读取。');
});

test('leaving and reopening a result does not reuse its previous body', async () => {
  api.text.mockResolvedValueOnce(document('离开前正文'));
  await mount();
  await act(async () => tree.unmount());
  const fresh = deferred();
  api.text.mockReturnValueOnce(fresh.promise);
  await mount();
  expect(bodies()).toEqual([]);
  expect(api.text).toHaveBeenCalledTimes(2);
  await act(async () => fresh.resolve(document('重新读取正文')));
  expect(bodies()).toEqual(['重新读取正文']);
});
