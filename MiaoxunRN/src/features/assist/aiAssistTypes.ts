import type { LucideIcon } from 'lucide-react-native';

export type AIAssistDirection = 'up' | 'right' | 'down' | 'left';

export type AIAssistObjectKind =
  | 'avatar-3d'
  | 'chat-message'
  | 'station-post'
  | 'link';

export type AIAssistObjectReference = {
  kind: AIAssistObjectKind;
  id: string | null;
  title: string;
  metadata?: Record<string, string | number | boolean | null>;
};

export type AIAssistPoint = { x: number; y: number };

export type AIAssistAction = {
  direction: AIAssistDirection;
  label: string;
  eyebrow?: string;
  Icon: LucideIcon;
  accent: string;
  available?: boolean;
  onSelect: (object: AIAssistObjectReference) => void;
  onUnavailable?: (object: AIAssistObjectReference) => void;
};
