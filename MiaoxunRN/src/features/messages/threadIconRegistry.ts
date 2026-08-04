import type { ImageSourcePropType } from 'react-native';
import {
  Bot,
  FileText,
  Images,
  LayoutTemplate,
  Sparkles,
  type LucideIcon,
} from 'lucide-react-native';

import { messageIconAssets } from '../../assets/icons';

export type ThreadIconSpec = {
  Icon?: LucideIcon;
  imageSource?: ImageSourcePropType;
};

export const agentThreadIcons: Record<string, ThreadIconSpec> = {
  'miaoxun-butler': {
    imageSource: messageIconAssets.agentAvatars.butler,
  },
  'friendship-expert': {
    imageSource: messageIconAssets.agentAvatars.datingExpert,
  },
  'global-scout': {
    imageSource: messageIconAssets.agentAvatars.globalScout,
  },
  'neighborhood-helper': {
    imageSource: messageIconAssets.agentAvatars.neighborhoodHelp,
  },
  'nearby-stories': {
    imageSource: messageIconAssets.agentAvatars.nearbyStories,
  },
  'site-builder': { Icon: LayoutTemplate },
  'album-manager': { Icon: Images },
  'file-preprocessor': { Icon: FileText },
};

const categoryThreadIcons: Record<string, ThreadIconSpec> = {
  orchestrator: { Icon: Bot },
  'media-management': { Icon: Images },
  preprocessing: { Icon: FileText },
  generation: { Icon: Sparkles },
  'content-generation': { Icon: Sparkles },
  'character-management': { Icon: Sparkles },
};

export const resolveAgentThreadIcon = (
  agentId: string,
  category?: string | null,
): ThreadIconSpec =>
  agentThreadIcons[agentId] ||
  categoryThreadIcons[String(category || '')] || { Icon: Sparkles };
