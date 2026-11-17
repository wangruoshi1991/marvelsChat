import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';
import { ThreadSettingsSheet } from '../src/features/messages/ThreadSettingsSheet';
import { groupChatApi } from '../src/services/api/groupChatApi';
import { palettes } from '../src/shared/theme';

jest.mock('../src/services/api/groupChatApi', () => ({
  groupChatApi: { members: jest.fn(), leave: jest.fn() },
}));

const api = jest.mocked(groupChatApi);
const props = {
  visible: false,
  muted: false,
  palette: palettes.light,
  language: 'zh' as const,
  onClose: jest.fn(),
  onSetMuted: jest.fn(async () => undefined),
  token: 'token',
  groupId: 'group-id',
  hasLeftGroup: false,
  onGroupLeft: jest.fn(),
  onActionError: jest.fn(),
};

describe('group chat thread settings', () => {
  beforeEach(() => api.members.mockReset());

  test('does not read members until the settings sheet is visible', async () => {
    await act(async () => {
      TestRenderer.create(<ThreadSettingsSheet {...props} />);
    });
    expect(api.members).not.toHaveBeenCalled();
  });

  test('uses persisted exit status without requesting inaccessible members', async () => {
    let tree!: TestRenderer.ReactTestRenderer;
    await act(async () => {
      tree = TestRenderer.create(
        <ThreadSettingsSheet {...props} visible hasLeftGroup />,
      );
    });
    expect(api.members).not.toHaveBeenCalled();
    expect(
      tree.root.findAllByProps({ testID: 'group-history-retained' }).length,
    ).toBeGreaterThan(0);
  });
});
