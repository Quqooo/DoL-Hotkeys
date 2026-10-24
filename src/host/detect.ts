import { keyLabel } from '../core/keys';
import { SNAPSHOT_ENGINE, SNAPSHOT_LOADER, SNAPSHOT_MOUSETRAP } from './original-keys';
import type { OrigEntry } from '../core/types';

interface CaseGroup {
  labels: string[];
  stmt: string;
}

interface Row {
  code: string;
  prefix: string;
  kind: OrigEntry['kind'];
  offset?: number;
  dir?: -1 | 1;
  steps?: number;
}

const MOD_BY_OFFSET: Record<number, string> = { 10: 'Shift', 20: 'Ctrl', 30: 'Alt' };
const DEFAULT_OFFSETS = { shift: 10, ctrl: 20, alt: 30 };

function allHandlers(): unknown[] {
  const $ = window.jQuery;
  if (!$ || typeof $._data !== 'function') return [];
  const handlers: unknown[] = [];
  for (const target of [document, window]) {
    const events = $._data(target as any, 'events');
    if (!events) continue;
    for (const type of Object.keys(events)) {
      const list = events[type];
      if (!Array.isArray(list)) continue;
      for (const item of list) {
        const handler = item?.handler;
        if (typeof handler === 'function') handlers.push(handler);
      }
    }
  }
  return handlers;
}

function blockAt(src: string, openBrace: number): string | null {
  let depth = 0;
  for (let i = openBrace; i < src.length; i++) {
    const ch = src[i];
    if (ch === '{') depth++;
    else if (ch === '}') {
      depth--;
      if (depth === 0) return src.slice(openBrace + 1, i);
    }
  }
  return null;
}

function trimStatement(rest: string): string {
  let s = rest.trim();
  for (let i = 0; i < 3; i++) {
    s = s.replace(/\}\s*$/, '').trim();
    s = s.replace(/\bbreak\s*;$/, '').trim();
  }
  return s;
}

function readCases(body: string): CaseGroup[] {
  const out: CaseGroup[] = [];
  const parts = body.split(/case\s*"/);
  let pending: string[] = [];
  for (let i = 1; i < parts.length; i++) {
    const seg = parts[i];
    const quote = seg.indexOf('"');
    if (quote < 0) continue;
    const label = seg.slice(0, quote);
    const rest = seg.slice(quote + 1).replace(/^\s*:\s*/, '');
    pending.push(label);
    const stmt = trimStatement(rest);
    if (stmt.length > 0) {
      out.push({ labels: pending, stmt });
      pending = [];
    }
  }
  return out;
}

function parseOffsets(src: string): typeof DEFAULT_OFFSETS {
  const grab = (key: string): number => {
    const match = new RegExp(`${key}\\s*\\?\\s*(-?\\d+)`).exec(src);
    return match ? Number(match[1]) : Number.NaN;
  };
  const shift = grab('shiftKey');
  const ctrl = grab('ctrlKey');
  const alt = grab('altKey');
  const ok = [shift, ctrl, alt].every(value => Number.isFinite(value) && value > 0);
  return ok ? { shift, ctrl, alt } : DEFAULT_OFFSETS;
}

function rowsOf(group: CaseGroup): Row[] {
  const stmt = group.stmt;

  const link = /linkFollow\(\s*offset\s*\+\s*(\d+)\s*\)/.exec(stmt);
  if (link) {
    return group.labels.map(code => ({ code, prefix: '', kind: 'links' as const, offset: -1 }));
  }

  const history: Row[] = [];
  const backBase = /Engine\.backward\(\)/.test(stmt);
  const backShift = /Engine\.go\(\s*-2\s*\)/.test(stmt);
  const fwdBase = /Engine\.forward\(\)/.test(stmt);
  const fwdShift = /Engine\.go\(\s*2\s*\)/.test(stmt);

  if (backBase || backShift || fwdBase || fwdShift) {
    const dir: -1 | 1 = backBase || backShift ? -1 : 1;
    const base = dir === -1 ? backBase : fwdBase;
    const two = dir === -1 ? backShift : fwdShift;
    for (const code of group.labels) {
      if (base) history.push({ code, prefix: '', kind: 'history', dir, steps: 1 });
      if (two) history.push({ code, prefix: 'Shift', kind: 'history', dir, steps: 2 });
    }
    return history;
  }

  if (/State\.restore/.test(stmt)) {
    return group.labels.map(code => ({ code, prefix: '', kind: 'reroll' as const }));
  }
  if (/Dialog\.close\(\)/.test(stmt)) {
    return group.labels.map(code => ({ code, prefix: '', kind: 'dialog' as const }));
  }
  return group.labels.map(code => ({ code, prefix: '', kind: 'unknown' as const }));
}

function isDigitFamily(code: string, family: 'Digit' | 'Numpad'): boolean {
  return new RegExp(`^${family}\\d$`).test(code);
}

function expandLinkLayers(rows: Row[], offsets: typeof DEFAULT_OFFSETS): Row[] {
  const out: Row[] = [];
  for (const row of rows) {
    if (row.offset !== -1) {
      out.push(row);
      continue;
    }
    const digits = isDigitFamily(row.code, 'Digit') || isDigitFamily(row.code, 'Numpad');
    if (!digits) {
      out.push({ ...row, offset: 0, prefix: '' });
      continue;
    }
    out.push({ ...row, offset: 0, prefix: '' });
    out.push({ ...row, offset: offsets.shift, prefix: 'Shift' });
    out.push({ ...row, offset: offsets.ctrl, prefix: 'Ctrl' });
    out.push({ ...row, offset: offsets.alt, prefix: 'Alt' });
  }
  return out;
}

function composeEntries(rows: Row[], offsets: typeof DEFAULT_OFFSETS): OrigEntry[] {
  const buckets = new Map<string, { rows: Row[]; codes: string[] }>();
  for (const row of expandLinkLayers(rows, offsets)) {
    const offset = row.offset ?? 0;
    const key = [row.kind, row.dir ?? '', row.steps ?? '', row.prefix, offset].join('|');
    let bucket = buckets.get(key);
    if (!bucket) {
      bucket = { rows: [], codes: [] };
      buckets.set(key, bucket);
    }
    bucket.rows.push({ ...row, offset });
    bucket.codes.push(row.code);
  }

  const entries: OrigEntry[] = [];
  for (const bucket of buckets.values()) {
    const first = bucket.rows[0];
    const offset = first.offset ?? 0;
    const modPrefix = MOD_BY_OFFSET[offset] ?? first.prefix;
    const main = bucket.codes.filter(c => isDigitFamily(c, 'Digit'));
    const numpad = bucket.codes.filter(c => isDigitFamily(c, 'Numpad'));
    const singles = bucket.codes.filter(c => !isDigitFamily(c, 'Digit') && !isDigitFamily(c, 'Numpad'));

    const labels: string[] = [];
    if (main.length >= 8) labels.push('1 – 0');
    else main.forEach(c => labels.push(keyLabel(c)));
    if (numpad.length >= 8) labels.push('Num 1 – 0');
    else numpad.forEach(c => labels.push(keyLabel(c)));

    const base: Omit<OrigEntry, 'keys'> = { kind: first.kind, detected: true };
    if (first.kind === 'links') base.offset = offset;
    if (first.kind === 'history') {
      base.dir = first.dir;
      base.steps = first.steps;
    }

    if (labels.length > 0) {
      const suffix = modPrefix ? `${modPrefix} + ` : '';
      entries.push({ ...base, keys: suffix + labels.join(' / ') });
    }
    for (const code of singles) {
      const suffix = modPrefix ? `${modPrefix} + ` : '';
      entries.push({ ...base, keys: suffix + keyLabel(code) });
    }
  }
  const seen = new Set<string>();
  return entries.filter(entry => {
    const id = [entry.keys, entry.kind, entry.dir ?? '', entry.steps ?? ''].join('|');
    if (seen.has(id)) return false;
    seen.add(id);
    return true;
  });
}

function findSwitchBody(src: string, before: number): string | null {
  const re = /switch\s*\(/g;
  let best = -1;
  let match: RegExpExecArray | null;
  while ((match = re.exec(src)) !== null) {
    if (match.index >= before) break;
    best = match.index;
  }
  if (best < 0) return null;
  const brace = src.indexOf('{', best);
  if (brace < 0 || brace > before) return null;
  return blockAt(src, brace);
}

function parseEngineSource(src: string): OrigEntry[] | null {
  const firstCase = src.search(/case\s*"/);
  if (firstCase < 0) return null;
  const body = findSwitchBody(src, firstCase);
  if (!body) return null;
  const groups = readCases(body);
  if (groups.length === 0) return null;
  const rows = groups.flatMap(rowsOf);
  const entries = composeEntries(rows, parseOffsets(src));
  return entries.length > 0 ? entries : null;
}

function earlyHandlers(): string[] {
  const registry = window.__DoLHKEarly;
  if (!registry) return [];
  return registry.native.map(item => item.src);
}

interface EngineScan {
  entries: OrigEntry[] | null;
  present: boolean;
}

function detectEngine(): EngineScan {
  let present = false;
  for (const fn of [...earlyHandlers(), ...allHandlers()]) {
    const src = String(fn);
    if (!src.includes('linkFollow') && !src.includes('Engine.backward')) continue;
    present = true;
    const parsed = parseEngineSource(src);
    if (parsed) return { entries: parsed, present: true };
  }
  return { entries: null, present };
}

const COMBO_WORDS: Record<string, string> = {
  ctrl: 'Ctrl',
  control: 'Ctrl',
  alt: 'Alt',
  option: 'Alt',
  shift: 'Shift',
  meta: 'Meta',
  cmd: 'Cmd',
  command: 'Cmd',
  enter: 'Enter',
  return: 'Enter',
  escape: 'Esc',
  esc: 'Esc',
  space: 'Space',
  tab: 'Tab',
  backspace: 'Backspace',
  delete: 'Del',
  del: 'Del',
  up: '↑',
  down: '↓',
  left: '←',
  right: '→',
  plus: '+',
};

function prettyCombo(combo: string): string {
  return combo
    .split('+')
    .map(part => {
      const word = part.trim();
      if (!word) return '+';
      const known = COMBO_WORDS[word.toLowerCase()];
      if (known) return known;
      return word.length === 1 ? word.toUpperCase() : word.charAt(0).toUpperCase() + word.slice(1);
    })
    .join(' + ');
}

function describeMousetrap(src: string): Omit<OrigEntry, 'keys'> {
  if (/Engine\.backward\(\)|Engine\.go\(\s*-\s*\d/.test(src)) return { kind: 'history', dir: -1, steps: 1, detected: true };
  if (/Engine\.forward\(\)|Engine\.go\(\s*[1-9]/.test(src)) return { kind: 'history', dir: 1, steps: 1, detected: true };
  if (/updateSessionRNG|State\.restore/.test(src)) return { kind: 'reroll', detected: true };
  if (/Dialog\.close\(/.test(src)) return { kind: 'dialog', detected: true };
  if (/#next|macro-link/.test(src)) return { kind: 'continue', detected: true };
  return { kind: 'unknown', detected: true };
}

function detectMousetrap(): OrigEntry[] | null {
  const registry = window.__DoLHKEarly;
  if (!registry || registry.bindings.length === 0) return null;
  const entries: OrigEntry[] = [];
  for (const binding of registry.bindings) {
    const keys = binding.keys
      .split(/\s+/)
      .filter(Boolean)
      .map(prettyCombo)
      .join(' / ');
    if (!keys) continue;
    entries.push({ keys, ...describeMousetrap(binding.src) });
  }
  return entries.length > 0 ? entries : null;
}

function detectModLoader(): OrigEntry | null {
  for (const fn of [...earlyHandlers(), ...allHandlers()]) {
    const src = String(fn);
    if (!/altKey/i.test(src)) continue;
    if (!/["']m["']/i.test(src)) continue;
    return { keys: 'Alt + M', kind: 'modloader', detected: true };
  }
  const gui = (window as any).modLoaderGui;
  if (gui && typeof gui === 'object') {
    return { keys: 'Alt + M', kind: 'modloader', detected: true };
  }
  return null;
}

export interface DetectionResult {
  entries: OrigEntry[];
  partiallyDetected: boolean;
  usedSnapshot: boolean;
}

export function detect(): DetectionResult {
  const engine = detectEngine();
  const mousetrap = detectMousetrap();
  const loader = detectModLoader();

  const usedSnapshot = !engine.entries && engine.present;
  const engineEntries = engine.entries ?? (usedSnapshot ? SNAPSHOT_ENGINE : []);
  const entries: OrigEntry[] = [...engineEntries, ...(mousetrap ?? []), ...(loader ? [loader] : [])];
  const nothingDetected = entries.length === 0;
  if (nothingDetected) entries.push(...SNAPSHOT_ENGINE, ...SNAPSHOT_MOUSETRAP, SNAPSHOT_LOADER);

  const detectedLayers = [engine.entries, mousetrap, loader].filter(Boolean).length;
  return {
    entries,
    partiallyDetected: detectedLayers > 0,
    usedSnapshot: usedSnapshot || nothingDetected,
  };
}
