import { textFor } from '../../shared/i18n';
import { Language } from '../session/sessionTypes';
import { persistentAssistReference } from '../ai/assistContext';
import { taskPhaseLabel, taskStatusLabel } from '../ai/taskPresentation';
import { workspaceStatusLabel } from '../workspaces/workspacePresentation';
import { AIAssistObjectReference, AIAssistScene } from './aiAssistTypes';

export const assistMessageLimit = 2000;

export function assistPageLabel(page: string, language: Language) {
  const pages: Record<string, [string, string]> = {
    'miao.feed': ['妙 · 任务动态', 'Miao · Tasks'],
    'miao.task': ['妙 · 任务详情', 'Miao · Task details'],
    'miao.workspace': ['妙 · 协作详情', 'Miao · Workspace details'],
    'messages.chat': ['讯 · 对话', 'Xun · Conversation'],
    'messages.butler': ['讯 · 妙管家', 'Xun · Assistant'],
    'messages.tasks': ['讯 · 任务', 'Xun · Tasks'],
    'messages.notice': ['讯 · 通知', 'Xun · Notices'],
    'station.station': ['我 · 主页', 'Me · Home'],
    'station.posts': ['我 · 生活', 'Me · Life'],
    'station.outcomes': ['我 · 成果', 'Me · Results'],
    'station.agents': ['我 · Agent', 'Me · Agents'],
    'station.social': ['我 · 关系', 'Me · People'],
    'second-floor.home': ['讯 · 二楼', 'Xun · Second floor'],
    'second-floor.albums': ['讯 · 二楼 · 相册', 'Xun · Second floor · Albums'],
    'second-floor.files': ['讯 · 二楼 · 文件', 'Xun · Second floor · Files'],
    'second-floor.relationships': [
      '讯 · 二楼 · 关系',
      'Xun · Second floor · People',
    ],
    'second-floor.assets': ['讯 · 二楼 · 资产', 'Xun · Second floor · Assets'],
    'second-floor.information': [
      '讯 · 二楼 · 信息海',
      'Xun · Second floor · Inbox',
    ],
    'second-floor.permissions': [
      '讯 · 二楼 · 权限',
      'Xun · Second floor · Access',
    ],
  };
  const labels = pages[page];
  return labels
    ? textFor(language, labels[0], labels[1])
    : textFor(language, '所选内容页面', 'Selected content page');
}

export function assistContextSummary(
  _scene: AIAssistScene | undefined,
  object: AIAssistObjectReference | undefined,
  language: Language,
) {
  if (!object) return '';
  const parts = [];
  if (object) {
    parts.push(
      textFor(language, `关于「${object.title}」`, `About “${object.title}”`),
    );
    const task = object.scene?.task;
    const workspace = object.scene?.workspace;
    if (task) {
      const statusLabel = taskStatusLabel(task.status, language);
      const phaseLabel =
        task.status === 'running' ? taskPhaseLabel(task.phase, language) : null;
      const snapshotLabel = [statusLabel, phaseLabel]
        .filter(Boolean)
        .join(' · ');
      parts.push(
        textFor(
          language,
          `选中时${snapshotLabel}，最新进展请查看任务详情。`,
          `${snapshotLabel} when selected. Check task details for current progress.`,
        ),
      );
    }
    if (workspace) {
      const participants = workspace.participants.map(participant =>
        participant.name === participant.agentId
          ? textFor(language, '其他参与者', 'Another participant')
          : participant.name,
      );
      parts.push(
        textFor(
          language,
          `选中时${workspaceStatusLabel(workspace.status, language)}`,
          `Status when selected: ${workspaceStatusLabel(
            workspace.status,
            language,
          )}`,
        ),
        textFor(
          language,
          `参与者：${participants.join('、') || '暂无'}`,
          `Participants: ${participants.join(', ') || 'None yet'}`,
        ),
        textFor(
          language,
          '这里只带入选中时的内容，请先讨论建议；需要原素材时先询问，不继续执行原任务。',
          'Discuss the selected snapshot first. Ask before accessing original materials; do not resume the task.',
        ),
      );
    }
    const reference = persistentAssistReference(object);
    if (!reference) {
      const content = object.metadata?.content;
      if (typeof content === 'string' && content.trim()) {
        parts.push(
          textFor(language, '选中的文字：', 'Selected text:') +
            '\n' +
            content.trim(),
        );
      } else if (!task && !workspace) {
        parts.push(
          textFor(
            language,
            '仅提供当前对象名称，未附加可读取内容。请先询问需要补充的信息。',
            'Only the item name is provided, with no readable content attached. Ask for the missing information first.',
          ),
        );
      }
    }
  }
  return parts.join('\n');
}

// Persisted resources travel as authenticated references, not UI bookkeeping
// appended to the user's chat. Local snapshots remain explicit readable text.
export function buildAssistMessage(
  draft: string,
  scene: AIAssistScene | undefined,
  object: AIAssistObjectReference | undefined,
  language: Language,
) {
  return [
    draft.trim(),
    object && !persistentAssistReference(object)
      ? assistContextSummary(scene, object, language)
      : '',
  ]
    .filter(Boolean)
    .join('\n\n');
}
