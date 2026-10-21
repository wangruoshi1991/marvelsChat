import { AgentDTO } from '../../models/api';
import { AgentWorkspace } from '../../models/agentWorkspace';
import { textFor } from '../../shared/i18n';
import { Language } from '../session/sessionTypes';
import { AIAssistObjectReference } from './aiAssistTypes';

// This is a captured view of a workspace, never an authenticated resource
// reference. Copy the fields so later polling cannot rewrite an open request.
export function workspaceAssistContext(
  workspace: AgentWorkspace,
  agents: AgentDTO[],
  language: Language,
): AIAssistObjectReference {
  return {
    kind: 'agent-workspace',
    id: workspace.id,
    title: workspace.goal,
    scene: {
      page: 'miao.feed',
      label: textFor(language, '妙 · 任务动态', 'Miao · Task activity'),
      module: {
        key: 'task-feed',
        label: textFor(language, '任务动态', 'Task activity'),
      },
      workspace: {
        id: workspace.id,
        goal: workspace.goal,
        status: workspace.status,
        revision: workspace.revision,
        currentRound: workspace.currentRound,
        participants: [
          ...new Set(workspace.steps.map(step => step.agentId)),
        ].map(agentId => ({
          agentId,
          name: agents.find(agent => agent.key === agentId)?.name || agentId,
        })),
      },
    },
  };
}
