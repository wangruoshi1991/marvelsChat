import {
  AgentWorkspace,
  WorkspaceStatus,
  WorkspaceStep,
} from '../../models/agentWorkspace';
import { textFor } from '../../shared/i18n';
import { Language } from '../session/sessionTypes';
const labels: Record<WorkspaceStatus, [string, string]> = {
  queued: ['等待执行', 'Queued'],
  running: ['协作中', 'Working'],
  waiting_input: ['需要补充', 'Needs your input'],
  awaiting_confirmation: ['等待确认', 'Review required'],
  succeeded: ['已完成', 'Completed'],
  failed: ['执行失败', 'Failed'],
  interrupted: ['执行中断', 'Interrupted'],
  cancelling: ['正在取消', 'Cancelling'],
  cancelled: ['已取消', 'Cancelled'],
};
export const workspaceStatusLabel = (
  status: WorkspaceStatus | WorkspaceStep['status'],
  language: Language,
  executionMode: AgentWorkspace['executionMode'] = 'coordinated',
) =>
  status === 'running' && executionMode === 'direct'
    ? textFor(language, '执行中', 'Working')
    : textFor(language, ...labels[status]);

export function workspaceCardPresentation(
  workspace: AgentWorkspace,
  language: Language,
) {
  const activeSteps = ['running', 'cancelling'].includes(workspace.status)
    ? workspace.steps.filter(step => step.status === 'running')
    : [];
  const activities = activeSteps.map(step => ({
    id: step.id,
    agentId: step.agentId,
    description:
      step.capability === 'workspace.coordinate'
        ? textFor(
            language,
            '梳理需求和协作进展',
            'Reviewing the request and progress',
          )
        : step.goal,
  }));
  const attention =
    workspace.status === 'waiting_input'
      ? workspace.inputRequest?.question || workspace.question
      : workspace.status === 'awaiting_confirmation'
      ? workspace.allowedActions.includes('confirm')
        ? textFor(
            language,
            '待你预览页面并确认保存',
            'Preview the page and confirm saving',
          )
        : textFor(
            language,
            '页面尚未确认，打开任务查看',
            'The page is unconfirmed. Open the task to review it.',
          )
      : null;
  const latestDelivery = workspace.steps
    .filter(
      step =>
        step.capability !== 'workspace.coordinate' &&
        step.status === 'succeeded' &&
        step.result,
    )
    .sort(
      (left, right) =>
        Date.parse(right.updatedAt) - Date.parse(left.updatedAt) ||
        right.id.localeCompare(left.id),
    )[0]?.result;
  const artifact = workspace.result || latestDelivery;
  const outcome = artifact
    ? {
        label: workspace.result
          ? textFor(language, '成果', 'Result')
          : textFor(language, '最新成果', 'Latest result'),
        title: artifact.title,
      }
    : null;
  return {
    activities,
    attention,
    outcome,
    detail:
      workspace.status === 'cancelled'
        ? null
        : workspace.error?.message ||
          (!activities.length && !attention && !outcome
            ? workspace.summary
            : null),
  };
}
