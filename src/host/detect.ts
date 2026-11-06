import { SNAPSHOT_ENGINE, SNAPSHOT_ENGINE_LEGACY, SNAPSHOT_LOADER, SNAPSHOT_MOUSETRAP } from './original-keys';
import type { EarlyBinding } from '../globals';
import type { OrigEntry, OrigKind } from '../core/types';

export type DetectionSource = 'dynamic' | 'snapshot' | 'mixed';

export interface DetectionResult {
  entries: OrigEntry[];
  source: DetectionSource;
}

interface Semantics {
  kind: OrigKind;
  dir?: -1 | 1;
  steps?: number;
}

/** Mousetrap 组合 → 原版语义。表外组合显示为未知，不再解析处理函数源码 */
const COMBO_KINDS: Record<string, Semantics> = {
  z: { kind: 'continue' },
  n: { kind: 'continue' },
  enter: { kind: 'continue' },
  space: { kind: 'continue' },
  '/': { kind: 'history', dir: -1, steps: 1 },
  '-': { kind: 'history', dir: 1, steps: 1 },
  '*': { kind: 'reroll' },
  'alt+m': { kind: 'modloader' },
};

const COMBO_WORDS: Record<string, string> = {
  alt: 'Alt',
  option: 'Alt',
  ctrl: 'Ctrl',
  control: 'Ctrl',
  shift: 'Shift',
  meta: 'Meta',
  cmd: 'Cmd',
  command: 'Cmd',
  enter: 'Enter',
  return: 'Enter',
  esc: 'Esc',
  escape: 'Esc',
  space: 'Space',
  tab: 'Tab',
  backspace: 'Backspace',
  delete: 'Del',
  del: 'Del',
  up: '↑',
  down: '↓',
  left: '←',
  right: '→',
};

/** 数字键区在小键盘上以符号形式绑定，显示时沿用游戏的说法 */
const NUMPAD_LABELS: Record<string, string> = {
  '/': 'Num /',
  '-': 'Num -',
  '*': 'Num *',
};

export function describeCombo(combo: string): Semantics | null {
  return COMBO_KINDS[combo.trim().toLowerCase()] ?? null;
}

export function comboLabel(combo: string): string {
  const key = combo.trim().toLowerCase();
  const numpad = NUMPAD_LABELS[key];
  if (numpad) return numpad;
  return key
    .split('+')
    .map(part => {
      const word = part.trim();
      if (!word) return '+';
      const known = COMBO_WORDS[word];
      if (known) return known;
      return word.length === 1 ? word.toUpperCase() : word.charAt(0).toUpperCase() + word.slice(1);
    })
    .join(' + ');
}

function rowOf(combos: string[]): OrigEntry {
  const meaning = describeCombo(combos[0]) ?? { kind: 'unknown' as const };
  return {
    keys: combos.map(comboLabel).join(' / '),
    kind: meaning.kind,
    dir: meaning.dir,
    steps: meaning.steps,
    detected: true,
  };
}

/** 一次 bind 调用登记的多个组合合并为一行 */
export function rowsOfGroups(bindings: EarlyBinding[]): OrigEntry[] {
  return bindings.filter(binding => binding.combos.length > 0).map(binding => rowOf(binding.combos));
}

function handlerSources(): string[] {
  const $ = window.jQuery;
  if (!$ || typeof $._data !== 'function') return [];
  const out: string[] = [];
  for (const target of [document, window]) {
    const events = $._data(target as any, 'events');
    if (!events) continue;
    for (const type of Object.keys(events)) {
      if (!type.startsWith('key')) continue;
      const list = events[type];
      if (!Array.isArray(list)) continue;
      for (const item of list) {
        const handler = item?.handler;
        if (typeof handler === 'function') out.push(String(handler));
      }
    }
  }
  return out;
}

/**
 * 数字选链接由游戏的原生键盘处理函数提供。
 * 先探测实现代号，再取对应快照：新版用 linkFollow，0.4.x 用 currentLinks。
 */
function linkRows(): OrigEntry[] | null {
  const sources = handlerSources();
  if (sources.some(src => src.includes('linkFollow'))) {
    return SNAPSHOT_ENGINE.map(entry => ({ ...entry, detected: true }));
  }
  if (sources.some(src => src.includes('currentLinks'))) {
    return SNAPSHOT_ENGINE_LEGACY.map(entry => ({ ...entry, detected: true }));
  }
  return null;
}

function loaderRow(): OrigEntry | null {
  const gui = (window as any).modLoaderGui;
  return gui && typeof gui === 'object' ? { ...SNAPSHOT_LOADER, detected: true } : null;
}

export function detect(): DetectionResult {
  const entries: OrigEntry[] = [];
  entries.push(...(linkRows() ?? SNAPSHOT_ENGINE));

  const bindings = window.__DoLHKEarly?.bindings ?? [];
  if (bindings.length > 0) entries.push(...rowsOfGroups(bindings));
  else entries.push(...SNAPSHOT_MOUSETRAP);

  const loader = loaderRow();
  if (loader) entries.push(loader);

  const detected = entries.filter(entry => entry.detected).length;
  const source: DetectionSource = detected === 0 ? 'snapshot' : detected === entries.length ? 'dynamic' : 'mixed';
  return { entries, source };
}
