import type { Bind } from './types';

const MODIFIER_CODES = /^(Shift|Control|Alt|Meta)(Left|Right)$/;
const MOUSE_CODE = /^Mouse(\d+)$/;

const MOUSE_BUTTONS = new Set([1, 3, 4]);

/** 单个组合允许的最大原子数 */
export const MAX_CHORD_ATOMS = 8;

const NAMED_CODES = [
  'Backquote',
  'Minus',
  'Equal',
  'BracketLeft',
  'BracketRight',
  'Backslash',
  'IntlBackslash',
  'IntlRo',
  'IntlYen',
  'Semicolon',
  'Quote',
  'Comma',
  'Period',
  'Slash',
  'Space',
  'Enter',
  'Tab',
  'Escape',
  'Backspace',
  'Delete',
  'Insert',
  'PageUp',
  'PageDown',
  'Home',
  'End',
  'CapsLock',
  'PrintScreen',
  'ScrollLock',
  'Pause',
  'ContextMenu',
  'NumLock',
  'NumpadAdd',
  'NumpadSubtract',
  'NumpadMultiply',
  'NumpadDivide',
  'NumpadDecimal',
  'NumpadEnter',
  'NumpadEqual',
  'NumpadComma',
  'ArrowUp',
  'ArrowDown',
  'ArrowLeft',
  'ArrowRight',
];

const KEY_CODES = new Set<string>(NAMED_CODES);

for (let i = 0; i < 26; i++) KEY_CODES.add(`Key${String.fromCharCode(65 + i)}`);
for (let i = 0; i <= 9; i++) KEY_CODES.add(`Digit${i}`);
for (let i = 1; i <= 24; i++) KEY_CODES.add(`F${i}`);
for (let i = 0; i <= 9; i++) KEY_CODES.add(`Numpad${i}`);
for (const side of ['Left', 'Right']) {
  for (const family of ['Shift', 'Control', 'Alt', 'Meta']) KEY_CODES.add(`${family}${side}`);
}

const LABELS: Record<string, string> = {
  Backquote: '`',
  Minus: '-',
  Equal: '=',
  BracketLeft: '[',
  BracketRight: ']',
  Backslash: '\\',
  IntlBackslash: '\\',
  Semicolon: ';',
  Quote: "'",
  Comma: ',',
  Period: '.',
  Slash: '/',
  Space: 'Space',
  Enter: 'Enter',
  Tab: 'Tab',
  Escape: 'Esc',
  Backspace: 'Backspace',
  Delete: 'Del',
  Insert: 'Ins',
  PageUp: 'PgUp',
  PageDown: 'PgDn',
  Home: 'Home',
  End: 'End',
  CapsLock: 'CapsLock',
  PrintScreen: 'PrtSc',
  ScrollLock: 'ScrLk',
  Pause: 'Pause',
  ArrowUp: '↑',
  ArrowDown: '↓',
  ArrowLeft: '←',
  ArrowRight: '→',
  NumpadDivide: 'Num /',
  NumpadMultiply: 'Num *',
  NumpadSubtract: 'Num -',
  NumpadAdd: 'Num +',
  NumpadDecimal: 'Num .',
  NumpadEnter: 'Num Enter',
  NumpadEqual: 'Num =',
  ShiftLeft: 'Shift',
  ShiftRight: 'R Shift',
  ControlLeft: 'Ctrl',
  ControlRight: 'R Ctrl',
  AltLeft: 'Alt',
  AltRight: 'R Alt',
  MetaLeft: 'Meta',
  MetaRight: 'R Meta',
  Mouse1: 'Middle',
  Mouse3: 'Back',
  Mouse4: 'Forward',
};

/** 迁移统一取左侧键 */
const LEGACY_MODS: Record<string, string> = {
  Ctrl: 'ControlLeft',
  Shift: 'ShiftLeft',
  Alt: 'AltLeft',
  Meta: 'MetaLeft',
};

const LEGACY_MOD_ORDER = ['Ctrl', 'Shift', 'Alt', 'Meta'];

/** 有损适配仅接受左侧键 */
const MOUSETRAP_MODS: Record<string, string> = {
  ctrl: 'ControlLeft',
  control: 'ControlLeft',
  shift: 'ShiftLeft',
  alt: 'AltLeft',
  altgr: 'AltRight',
  meta: 'MetaLeft',
  cmd: 'MetaLeft',
  command: 'MetaLeft',
  option: 'AltLeft',
};

const MOUSETRAP_KEYS: Record<string, string> = {
  esc: 'Escape',
  escape: 'Escape',
  space: 'Space',
  spacebar: 'Space',
  enter: 'Enter',
  return: 'Enter',
  tab: 'Tab',
  backspace: 'Backspace',
  del: 'Delete',
  delete: 'Delete',
  ins: 'Insert',
  insert: 'Insert',
  up: 'ArrowUp',
  down: 'ArrowDown',
  left: 'ArrowLeft',
  right: 'ArrowRight',
  home: 'Home',
  end: 'End',
  pageup: 'PageUp',
  pagedown: 'PageDown',
  '-': 'Minus',
  '=': 'Equal',
  '[': 'BracketLeft',
  ']': 'BracketRight',
  '\\': 'Backslash',
  ';': 'Semicolon',
  "'": 'Quote',
  ',': 'Comma',
  '.': 'Period',
  '/': 'Slash',
  '`': 'Backquote',
};

export function isModifierCode(code: string): boolean {
  return MODIFIER_CODES.test(code);
}

export function modifierFamily(code: string): string | null {
  const match = MODIFIER_CODES.exec(code);
  return match ? match[1] : null;
}

export function mouseButtonOf(bind: Bind): number | null {
  if (bind.length !== 1) return null;
  const match = MOUSE_CODE.exec(bind[0]);
  return match ? Number(match[1]) : null;
}

export function isBindAtom(code: unknown): code is string {
  if (typeof code !== 'string' || !code) return false;
  if (MODIFIER_CODES.test(code)) return true;
  if (MOUSE_CODES_HAS(code)) return true;
  return KEY_CODES.has(code);
}

function MOUSE_CODES_HAS(code: string): boolean {
  const match = MOUSE_CODE.exec(code);
  return Boolean(match && MOUSE_BUTTONS.has(Number(match[1])));
}

/** 修饰键按物理键族比较，使迁移后的左侧键绑定对右侧键同样有效 */
export function sameAtom(a: string, b: string): boolean {
  if (a === b) return true;
  const fa = modifierFamily(a);
  if (!fa) return false;
  return fa === modifierFamily(b);
}

export function sameBind(a: Bind, b: Bind): boolean {
  if (a.length !== b.length) return false;
  return a.every((atom, index) => sameAtom(atom, b[index]));
}

export function normalizeBind(input: unknown): Bind | null {
  if (!Array.isArray(input)) return null;
  if (input.length === 0 || input.length > MAX_CHORD_ATOMS) return null;
  const out: Bind = [];
  const seen = new Set<string>();
  for (const atom of input) {
    if (!isBindAtom(atom)) return null;
    if (seen.has(atom)) return null;
    seen.add(atom);
    out.push(atom);
  }
  return out;
}

/** 旧编码迁移：`Ctrl+KeyA,KeyB` → [ControlLeft, KeyA, KeyB]；旧编码不含顺序，修饰符置于前部 */
export function legacyStepToBind(step: string): Bind | null {
  if (typeof step !== 'string' || !step) return null;
  const parts = step.split('+');
  const tail = parts.pop() ?? '';
  const mods = parts;
  const codes = tail ? tail.split(',') : [];
  if (codes.length === 0) return null;

  const out: Bind = [];
  for (const mod of LEGACY_MOD_ORDER) {
    if (!mods.includes(mod)) continue;
    const atom = LEGACY_MODS[mod];
    if (!out.includes(atom)) out.push(atom);
  }
  for (const mod of mods) {
    if (LEGACY_MOD_ORDER.includes(mod)) continue;
    return null;
  }
  for (const code of codes) {
    if (!isBindAtom(code) || MODIFIER_CODES.test(code)) return null;
    if (!out.includes(code)) out.push(code);
  }
  if (out.length === 0 || out.length > MAX_CHORD_ATOMS) return null;
  return out;
}

/** 多段旧绑定转换为单个组合：按顺序合并并去重，避免静默丢弃 */
export function bindFromLegacySteps(steps: unknown): Bind | null {
  if (!Array.isArray(steps)) return null;
  const out: Bind = [];
  for (const step of steps) {
    const bind = legacyStepToBind(typeof step === 'string' ? step : '');
    if (!bind) continue;
    for (const atom of bind) {
      if (!out.includes(atom) && out.length < MAX_CHORD_ATOMS) out.push(atom);
    }
  }
  return out.length > 0 ? out : null;
}

/** Mousetrap 串转换为 Bind（有损）：仅接受单组合，逗号序列与未知键名返回 null */
export function parseMousetrap(text: string): Bind | null {
  if (typeof text !== 'string' || !text.trim()) return null;
  if (text.includes(',')) return null;

  const parts = text
    .split('+')
    .map(part => part.trim().toLowerCase())
    .filter(Boolean);
  if (parts.length === 0) return null;

  const mods: string[] = [];
  const keys: string[] = [];
  for (const part of parts) {
    const mod = MOUSETRAP_MODS[part];
    if (mod) {
      if (!mods.includes(mod)) mods.push(mod);
      continue;
    }
    keys.push(part);
  }
  if (keys.length === 0) return null;

  const out: Bind = [...mods];
  for (const key of keys) {
    const atom = mousetrapKey(key);
    if (!atom) return null;
    if (!out.includes(atom)) out.push(atom);
  }
  return out.length <= MAX_CHORD_ATOMS ? out : null;
}

function mousetrapKey(key: string): string | null {
  const named = MOUSETRAP_KEYS[key];
  if (named) return named;
  if (/^[a-z]$/.test(key)) return `Key${key.toUpperCase()}`;
  if (/^\d$/.test(key)) return `Digit${key}`;
  const fn = /^f(\d{1,2})$/.exec(key);
  if (fn) {
    const code = `F${fn[1]}`;
    return KEY_CODES.has(code) ? code : null;
  }
  const numpad = /^(?:num|numpad)\s*([0-9+\-*/.])$/.exec(key);
  if (numpad) {
    const table: Record<string, string> = {
      '+': 'NumpadAdd',
      '-': 'NumpadSubtract',
      '*': 'NumpadMultiply',
      '/': 'NumpadDivide',
      '.': 'NumpadDecimal',
    };
    const code = table[numpad[1]] ?? `Numpad${numpad[1]}`;
    return KEY_CODES.has(code) ? code : null;
  }
  return null;
}

export function keyLabel(code: string): string {
  const known = LABELS[code];
  if (known) return known;
  let m = /^Key([A-Z])$/.exec(code);
  if (m) return m[1];
  m = /^Digit(\d)$/.exec(code);
  if (m) return m[1];
  m = /^Numpad(\d)$/.exec(code);
  if (m) return `Num ${m[1]}`;
  return code;
}

/** 按记录顺序展示，不做重排序；顺序本身携带语义 */
export function bindLabel(bind: Bind): string {
  return bind.map(keyLabel).join(' + ');
}

export function bindHasDigit(bind: Bind): boolean {
  return bind.some(atom => /^(Digit|Numpad)\d/.test(atom));
}
