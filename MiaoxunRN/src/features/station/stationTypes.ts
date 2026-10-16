export type StationTab = 'posts' | 'agents';

export type StationCreateKind = 'diary' | 'album' | 'outfit';

export type StationContentListKind = 'diary' | 'album';

export type StationManageTarget =
  | { kind: 'diary'; id: string }
  | { kind: 'album'; id: string };
