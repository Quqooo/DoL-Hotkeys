import type { OrigEntry } from '../core/types';

export const SNAPSHOT_ENGINE: OrigEntry[] = [
  { keys: '1 – 0 / Num 1 – 0', kind: 'links', offset: 0, detected: false },
  { keys: 'Shift + 1 – 0', kind: 'links', offset: 10, detected: false },
  { keys: 'Ctrl + 1 – 0', kind: 'links', offset: 20, detected: false },
  { keys: 'Alt + 1 – 0', kind: 'links', offset: 30, detected: false },
  { keys: 'N', kind: 'links', offset: 0, detected: false },
  { keys: 'Num /', kind: 'history', dir: -1, steps: 1, detected: false },
  { keys: 'Shift + Num /', kind: 'history', dir: -1, steps: 2, detected: false },
  { keys: 'Num -', kind: 'history', dir: 1, steps: 1, detected: false },
  { keys: 'Shift + Num -', kind: 'history', dir: 1, steps: 2, detected: false },
  { keys: 'Num *', kind: 'reroll', detected: false },
  { keys: 'Esc', kind: 'dialog', detected: false },
];

/** 0.4.2.7 一代的数字键实现：只处理 1–0，Ctrl 与 Alt 的偏移与后续版本相反 */
export const SNAPSHOT_ENGINE_LEGACY: OrigEntry[] = [
  { keys: '1 – 0 / Num 1 – 0', kind: 'links', offset: 0, detected: false },
  { keys: 'Shift + 1 – 0', kind: 'links', offset: 10, detected: false },
  { keys: 'Ctrl + 1 – 0', kind: 'links', offset: 30, detected: false },
  { keys: 'Alt + 1 – 0', kind: 'links', offset: 20, detected: false },
];

export const SNAPSHOT_MOUSETRAP: OrigEntry[] = [
  { keys: 'Z / N / Enter', kind: 'continue', detected: false },
];

export const SNAPSHOT_LOADER: OrigEntry = { keys: 'Alt + M', kind: 'modloader', detected: false };
