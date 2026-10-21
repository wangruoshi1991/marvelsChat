import { ChatMessage, Language } from '../session/sessionTypes';
import { textFor } from '../../shared/i18n';
import { isAgentDispatch } from '../../models/agentDispatch';

const record = (value: unknown): value is Record<string, unknown> =>
  Boolean(value && typeof value === 'object' && !Array.isArray(value));
const fields = (value: Record<string, unknown>, required: string[]) =>
  required.every(key => Object.hasOwn(value, key));
const strings = (value: Record<string, unknown>, keys: string[]) =>
  keys.every(key => typeof value[key] === 'string');
const ids = (value: unknown) =>
  Array.isArray(value) && value.every(id => typeof id === 'string');

// Old generation prompts were also used by ordinary chat. Present only their
// recognized result shapes; never strip arbitrary JSON or rewrite stored text.
export function agentReplyPresentation(
  message: ChatMessage,
  agentId: string | null | undefined,
  language: Language,
): string {
  if (
    message.senderType !== 'agent' ||
    isAgentDispatch(message.metadata?.agentDispatch) ||
    !['comic-diary', 'site-builder'].includes(agentId || '')
  )
    return message.content;
  let value: unknown;
  try {
    value = JSON.parse(message.content);
  } catch {
    return message.content;
  }
  if (!record(value)) return message.content;
  if (
    agentId === 'comic-diary' &&
    fields(value, ['title', 'summary', 'frames']) &&
    strings(value, ['title', 'summary']) &&
    Array.isArray(value.frames) &&
    value.frames.length > 0 &&
    value.frames.every(
      frame =>
        record(frame) &&
        fields(frame, [
          'title',
          'scene',
          'caption',
          'dialogue',
          'mood',
          'camera',
          'mediaAssetIds',
        ]) &&
        strings(frame, [
          'title',
          'scene',
          'caption',
          'dialogue',
          'mood',
          'camera',
        ]) &&
        ids(frame.mediaAssetIds),
    )
  ) {
    const frames = value.frames as Array<Record<string, string>>;
    return [
      textFor(language, '分镜草稿', 'Storyboard draft'),
      value.title,
      value.summary,
      ...frames.map((frame, index) =>
        [
          `${index + 1}. ${frame.title}`,
          frame.scene,
          frame.caption &&
            `${textFor(language, '旁白', 'Narration')}：${frame.caption}`,
          frame.dialogue &&
            `${textFor(language, '对白', 'Dialogue')}：${frame.dialogue}`,
        ]
          .filter(Boolean)
          .join('\n'),
      ),
    ]
      .filter(Boolean)
      .join('\n\n');
  }
  if (
    agentId === 'site-builder' &&
    fields(value, ['language', 'theme', 'title', 'summary', 'sections']) &&
    strings(value, ['language', 'theme', 'title', 'summary']) &&
    (value.version === undefined || value.version === 1) &&
    Array.isArray(value.sections) &&
    value.sections.length > 0 &&
    value.sections.every(
      section =>
        record(section) &&
        fields(section, [
          'type',
          'title',
          'subtitle',
          'body',
          'assetIds',
          'diaryEntryIds',
          'actions',
        ]) &&
        strings(section, ['type', 'title', 'subtitle', 'body']) &&
        ids(section.assetIds) &&
        ids(section.diaryEntryIds) &&
        Array.isArray(section.actions),
    )
  ) {
    const sections = value.sections as Array<Record<string, string>>;
    return [
      textFor(language, '页面草稿', 'Page draft'),
      value.title,
      value.summary,
      ...sections.map(section =>
        [section.title, section.subtitle, section.body]
          .filter(Boolean)
          .join('\n'),
      ),
      textFor(
        language,
        '这是历史聊天中的草稿，不能在这里保存或发布。',
        'This draft is from an earlier conversation and cannot be saved or published here.',
      ),
    ]
      .filter(Boolean)
      .join('\n\n');
  }
  return message.content;
}
