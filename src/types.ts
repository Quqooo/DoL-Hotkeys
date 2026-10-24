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

/** 有序组合（`KeyboardEvent.code` / `MouseN`）；顺序即按下顺序，不做重排归一 */
export type Bind = string[];

export type ConflictMode = 'legacy' | 'all' | 'first';

export interface Config {
  v: number;
  lang: LangMode;
  volumeKeys: boolean;
  volumeInvert: boolean;
  conflictMode: ConflictMode;
  binds: Record<string, Bind>;
  /** 曾注册过的第三方 id；缺席期间保留其键位 */
  external: string[];
}
