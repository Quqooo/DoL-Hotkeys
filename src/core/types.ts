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

export type LocalizedText = string | { zh?: string; en?: string } | ((lang: Lang) => string);

export interface HotkeyContext {
  id: string;
  event: Event;
  source: 'key' | 'mouse';
}

export interface HotkeyDefInput {
  id: string;
  handler: (ctx: HotkeyContext) => void;
  label?: LocalizedText;
  /** 行尾 (?) 的说明文字，悬停时由原版 tooltip 弹层显示 */
  tip?: LocalizedText;
  /** 结构化 Bind，或可无歧义解析的 Mousetrap 单组合串 */
  defaultBind?: Bind | string;
  group?: LocalizedText;
  available?: () => boolean;
  priority?: number;
  inInput?: boolean;
}

export interface RegisteredHotkey {
  id: string;
  handler: (ctx: HotkeyContext) => void;
  label: LocalizedText;
  tip?: LocalizedText;
  defaultBind: Bind;
  group?: LocalizedText;
  available: () => boolean;
  priority: number;
  inInput: boolean;
  /** 内置动作：同优先级时优先于第三方 */
  builtin: boolean;
  /** 注册顺序，用于同优先级排序 */
  order: number;
}

export interface Config {
  v: number;
  lang: LangMode;
  volumeKeys: boolean;
  volumeInvert: boolean;
  conflictMode: ConflictMode;
  binds: Record<string, Bind>;
  /** 曾注册过的第三方 id；缺席期间保留其键位 */
  external: string[];
  /** 已收起的分区标识，见 ui/panel/fold.ts */
  collapsed: string[];
}
