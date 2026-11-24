import type { ChatAttachmentDTO } from '../src/models/api';
import type {
  ChatMessage,
  ChatThread,
} from '../src/features/session/sessionTypes';
import {
  canSelectForwardMessage,
  forwardMessageLabel,
  maxForwardSelection,
  selectableForwardMessages,
  selectableForwardTargets,
  selectedForwardMessages,
} from '../src/features/messages/chatMessageSelection';

const message = (
  id: string,
  overrides: Partial<ChatMessage> = {},
): ChatMessage => ({
  id,
  threadId: 'source',
  senderType: 'user',
  senderName: 'Sender',
  content: `Message ${id}`,
  ...overrides,
});
const attachment = (kind: ChatAttachmentDTO['kind']): ChatAttachmentDTO => ({
  id: kind,
  kind,
  filename: `${kind}.bin`,
  title: kind,
  mimeType: null,
  byteSize: 1,
  durationMs: null,
  downloadPath: '/attachment',
  data: {},
});
const thread = (id: string, kind: string, agentId?: string): ChatThread => ({
  id,
  kind,
  agentId,
  title: id,
  avatarText: 'A',
  pinned: false,
  lastContent: '',
  unreadCount: 0,
  messages: [],
});

describe('chat message multiselect', () => {
  it('preserves chat order and removes duplicates, unavailable rows and other threads', () => {
    const one = message('one');
    const two = message('two');
    expect(
      selectableForwardMessages(
        [
          one,
          message('other', { threadId: 'elsewhere' }),
          one,
          message('deleted', { deletedAt: 'now' }),
          two,
        ],
        'source',
      ),
    ).toEqual([one, two]);
    expect(
      selectedForwardMessages([one, two], new Set(['two', 'one'])),
    ).toEqual([one, two]);
  });

  it.each<Partial<ChatMessage>>([
    { senderType: 'agent' },
    { id: 'local-pending' },
    { localStatus: 'sending' },
    { localStatus: 'failed' },
    { deletedAt: 'now' },
    { recalledAt: 'now' },
    { content: '  ' },
    { metadata: { sticker: { id: 'sticker' } } },
    { metadata: { contentPreview: {} } as ChatMessage['metadata'] },
    { metadata: { contentPreviewContext: {} } as ChatMessage['metadata'] },
    { metadata: { workspaceContext: {} } as ChatMessage['metadata'] },
    { metadata: { agentWorkspace: { id: 'workspace' } } },
    {
      metadata: {
        attachments: [{ ...attachment('file'), kind: 'task' }],
      } as unknown as ChatMessage['metadata'],
    },
  ])('excludes messages outside the forwarding contract: %p', overrides => {
    expect(canSelectForwardMessage(message('one', overrides))).toBe(false);
  });

  it('accepts supported attachments with no text and caps at twenty messages', () => {
    for (const kind of ['image', 'audio', 'file', 'video'] as const) {
      expect(
        canSelectForwardMessage(
          message(kind, {
            content: '',
            metadata: { attachments: [attachment(kind)] },
          }),
        ),
      ).toBe(true);
    }
    const messages = Array.from({ length: 25 }, (_, index) =>
      message(String(index)),
    );
    expect(
      selectedForwardMessages(messages, new Set(messages.map(item => item.id))),
    ).toEqual(messages.slice(0, maxForwardSelection));
  });

  it('only offers other ordinary direct or group conversations', () => {
    const direct = thread('direct', 'direct');
    const group = thread('group', 'group');
    expect(
      selectableForwardTargets(
        [
          thread('source', 'direct'),
          direct,
          group,
          thread('agent', 'direct', 'agent-id'),
          thread('workspace', 'agent'),
        ],
        'source',
      ),
    ).toEqual([direct, group]);
  });

  it('provides readable voice, image and file labels', () => {
    expect(
      forwardMessageLabel(
        message('voice', {
          content: '[语音]',
          metadata: { attachments: [attachment('audio')] },
        }),
        'en',
      ),
    ).toBe('Voice message');
    expect(
      forwardMessageLabel(
        message('image', {
          content: '',
          metadata: { attachments: [attachment('image')] },
        }),
        'zh',
      ),
    ).toBe('图片消息');
    expect(
      forwardMessageLabel(
        message('file', {
          content: '',
          metadata: { attachments: [attachment('file')] },
        }),
        'en',
      ),
    ).toBe('file.bin');
  });
});
