import { textFor } from '../../shared/i18n';
import { Language } from '../session/sessionTypes';
import { persistentAssistReference } from '../ai/assistContext';
import { taskPhaseLabel, taskStatusLabel } from '../ai/taskPresentation';
import { workspaceStatusLabel } from '../workspaces/workspacePresentation';
import { AIAssistObjectReference, AIAssistScene } from './aiAssistTypes';

export const assistMessageLimit = 2000;

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
          `关联第 ${workspace.currentRound} 轮任务。进入管家前会重新读取任务；发送消息只讨论，修改需回到任务详情确认。`,
          `Linked to round ${workspace.currentRound}. The task is checked before opening Butler. Messages discuss it; revisions require confirmation in task details.`,
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
    object &&
    object.kind !== 'agent-workspace' &&
    !persistentAssistReference(object)
      ? assistContextSummary(scene, object, language)
      : '',
  ]
    .filter(Boolean)
    .join('\n\n');
}
