export type UIPreferenceSurface = 'messages' | 'miao' | 'secondFloor';
export type UIPreferenceDensity = 'compact' | 'comfortable' | 'spacious';
export type UIGestureDirection = 'left' | 'right' | 'up' | 'down';
export type UILayoutSlot =
  | 'header'
  | 'headerLeft'
  | 'headerRight'
  | 'topRight'
  | 'inline'
  | 'cardFooter'
  | 'bottomBar'
  | 'floating';

export type UIRegisteredAction =
  | 'openDetails'
  | 'openParticipants'
  | 'openSecondFloor'
  | 'goBack'
  | 'openUpload';
export type UIGestureId =
  | 'messages.pullToSecondFloor'
  | 'secondFloor.swipeToExit'
  | 'miao.taskCard.participantsSwipe'
  | 'miao.taskCard.detailsSwipe';

export type UIPreferenceSurfaceTokens = {
  buttonRadius: number;
  buttonScale: number;
  cardRadius: number;
  rowGap: number;
};

export type UIComponentPreference = {
  slot?: UILayoutSlot;
  visible?: boolean;
  order?: number;
  sizeScale?: number;
  icon?: string;
  label?: string;
};

export type UIGesturePreference = {
  enabled: boolean;
  direction: UIGestureDirection;
  distance: number;
  velocityThreshold: number;
  animationMs: number;
  action: UIRegisteredAction;
};
export type UILayoutPreferences = {
  moduleOrder: string[];
  buttonSlots: Record<string, string>;
};

export type UIPreferences = {
  schemaVersion: 1;
  revision: number;
  density: UIPreferenceDensity;
  fontScale: number;
  surfaces: Record<UIPreferenceSurface, UIPreferenceSurfaceTokens>;
  hiddenModules: Record<UIPreferenceSurface, string[]>;
  layout: Record<UIPreferenceSurface, UILayoutPreferences>;
  components: Partial<
    Record<UIPreferenceSurface, Record<string, UIComponentPreference>>
  >;
  gestures: Partial<Record<UIGestureId, UIGesturePreference>>;
};

export type UIPreferencePreviewDTO = {
  id: string;
  status: 'pending' | 'confirmed' | 'expired' | 'reset' | 'undone';
  baseRevision: number;
  expiresAt: string;
  patch: Partial<UIPreferences>;
  beforePreferences: UIPreferences;
  preferences: UIPreferences;
  intent: string;
  rationale: string;
  affectedSurfaces: UIPreferenceSurface[];
};
