export type ActionId =
  | 'back'
  | 'forward'
  | 'characteristics'
  | 'social'
  | 'traits'
  | 'journal'
  | 'statistics'
  | 'feats'
  | 'options'
  | 'saves'
  | 'cheats';

export const ACTION_ORDER: readonly ActionId[] = [
  'back',
  'forward',
  'characteristics',
  'social',
  'traits',
  'journal',
  'statistics',
  'feats',
  'options',
  'saves',
  'cheats',
];

export const OVERLAY_OF: Record<string, string> = {
  characteristics: 'characteristics',
  social: 'social',
  traits: 'traits',
  journal: 'journal',
  statistics: 'statistics',
  options: 'options',
  saves: 'saves',
  cheats: 'cheats',
};

export type OrigKind = 'links' | 'history' | 'reroll' | 'dialog' | 'continue' | 'modloader' | 'unknown';

export interface OrigEntry {
  keys: string;
  kind: OrigKind;
  offset?: number;
  dir?: -1 | 1;
  steps?: number;
  detected: boolean;
}

export type Lang = 'zh' | 'en';
export type LangMode = 'auto' | Lang;

export interface Config {
  v: number;
  lang: LangMode;
  volumeKeys: boolean;
  volumeInvert: boolean;
  binds: Record<ActionId, string[]>;
}
