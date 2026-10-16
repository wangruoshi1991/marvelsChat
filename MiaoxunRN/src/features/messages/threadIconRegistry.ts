import {
  BookOpen,
  Bot,
  Compass,
  FileText,
  Film,
  HandHeart,
  Heart,
  Images,
  LayoutTemplate,
  MapPin,
  ScanFace,
  Search,
  Sparkles,
  type LucideIcon,
} from 'lucide-react-native';

/**
 * One visual language for every Agent in the app: a pale disc carrying a single
 * coloured vector glyph. The glyph resolves by Agent key first, then by
 * category, so an Agent this build has never seen still renders something
 * sensible. Disc and glyph colours both come from the Agent's own brand colour
 * via `agentGlyphColors`, so no second colour has to be declared anywhere.
 *
 * The photo-style Agent portraits that used to live here were removed on
 * 2026-10-16. Five character illustrations sitting next to six line icons read
 * as two unrelated systems on the same screen — the inconsistency the user
 * asked to unify.
 */
export type AgentGlyphSpec = {
  Icon: LucideIcon;
  /** Brand colour for this Agent; disc and glyph are derived from it. */
  accent: string;
};

const agentGlyphs: Record<string, AgentGlyphSpec> = {
  'miaoxun-butler': { Icon: Bot, accent: '#0F766E' },
  'friendship-expert': { Icon: Heart, accent: '#D9536F' },
  'global-scout': { Icon: Compass, accent: '#2F6FD0' },
  'neighborhood-helper': { Icon: HandHeart, accent: '#2E9E6B' },
  'nearby-stories': { Icon: MapPin, accent: '#D08A2E' },
  'site-builder': { Icon: LayoutTemplate, accent: '#0F766E' },
  'album-manager': { Icon: Images, accent: '#1E7A8C' },
  'file-preprocessor': { Icon: FileText, accent: '#475569' },
  'media-retrieval': { Icon: Search, accent: '#2E9E6B' },
  'comic-diary': { Icon: BookOpen, accent: '#B45309' },
  'model-3d': { Icon: ScanFace, accent: '#4F46E5' },
  'video-production': { Icon: Film, accent: '#BE3455' },
  'virtual-character': { Icon: Sparkles, accent: '#7C3AED' },
};

const categoryGlyphs: Record<string, AgentGlyphSpec> = {
  orchestrator: { Icon: Bot, accent: '#0F766E' },
  'media-management': { Icon: Images, accent: '#1E7A8C' },
  preprocessing: { Icon: FileText, accent: '#475569' },
  generation: { Icon: Sparkles, accent: '#7C3AED' },
  'content-generation': { Icon: Sparkles, accent: '#7C3AED' },
  'character-management': { Icon: Sparkles, accent: '#7C3AED' },
};

const fallbackGlyph: AgentGlyphSpec = { Icon: Sparkles, accent: '#0B8271' };

export const resolveAgentGlyph = (
  agentId: string,
  category?: string | null,
): AgentGlyphSpec =>
  agentGlyphs[agentId] ||
  categoryGlyphs[String(category || '')] ||
  fallbackGlyph;
