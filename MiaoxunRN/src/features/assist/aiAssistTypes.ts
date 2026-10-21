import type { LucideIcon } from 'lucide-react-native';
import type { ImageSourcePropType } from 'react-native';
import type { AITaskDTO } from '../../models/aiTask';
import type { AgentWorkspace } from '../../models/agentWorkspace';

export type AIAssistDirection = 'up' | 'right' | 'down' | 'left';

export type AIAssistObjectKind =
  | 'ai-task'
  | 'agent-workspace'
  | 'avatar-3d'
  | 'chat-message'
  | 'station-post'
  | 'chat-draft'
  | 'station-file'
  | 'station-photo'
  | 'station-diary'
  | 'station-album'
  | 'link';

// A scene describes where a request started. It never grants resource access.
export type AIAssistScene = {
  page: string;
  label: string;
  module?: { key: string; label: string };
  task?: Pick<
    AITaskDTO,
    | 'id'
    | 'goal'
    | 'status'
    | 'phase'
    | 'agentId'
    | 'revision'
    | 'inputMessageId'
  >;
  workspace?: Pick<
    AgentWorkspace,
    'id' | 'goal' | 'status' | 'revision' | 'currentRound'
  > & {
    participants: { agentId: string; name: string }[];
  };
};

export type AIAssistObjectReference = {
  kind: AIAssistObjectKind;
  id: string | null;
  title: string;
  metadata?: Record<string, string | number | boolean | null>;
  scene?: AIAssistScene;
};

export type AIAssistPoint = { x: number; y: number };

export type AIAssistAction = {
  direction: AIAssistDirection;
  label: string;
  eyebrow?: string;
  Icon: LucideIcon;
  imageSource?: ImageSourcePropType;
  accent: string;
  available?: boolean;
  onSelect: (object: AIAssistObjectReference) => void;
  onUnavailable?: (object: AIAssistObjectReference) => void;
};
