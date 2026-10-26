import type { Bind } from './types';

const MODIFIER_CODES = /^(Shift|Control|Alt|Meta)(Left|Right)$/;
const MOUSE_CODE = /^Mouse(\d+)$/;

const MOUSE_BUTTONS = new Set([1, 3, 4]);

/** 不能作为热键原子的 code：不可识别键与裸修饰键名 */
const BLOCKED_CODES = new Set(['Unidentified', 'Dead', 'Shift', 'Control', 'Alt', 'Meta']);

/** e.code 的形态：KeyA、F5、MediaPlayPause、AudioVolumeUp */
const CODE_SHAPE = /^[A-Z][A-Za-z0-9]*$/;

/** MouseEvent.button 到 buttons 位掩码的映射；中键为 4，右键为 2 */
const MOUSE_BUTTON_BITS: Record<number, number> = { 0: 1, 1: 4, 2: 2, 3: 8, 4: 16 };

/** 单个组合允许的最大原子数 */
export const MAX_CHORD_ATOMS = 8;

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
  AudioVolumeUp: 'Vol +',
  AudioVolumeDown: 'Vol -',
  AudioVolumeMute: 'Mute',
  MediaPlayPause: 'Play',
  MediaStop: 'Stop',
  MediaTrackNext: 'Next',
  MediaTrackPrevious: 'Prev',
  Mouse1: 'Middle',
  Mouse3: 'Side 1',
  Mouse4: 'Side 2',
};

/** 1.0.2 的修饰键别名，迁移统一取左侧键 */
const V2_MODS: Record<string, string> = {
  Ctrl: 'ControlLeft',
  Shift: 'ShiftLeft',
  Alt: 'AltLeft',
  Meta: 'MetaLeft',
};

const V2_MOD_ORDER = ['Ctrl', 'Shift', 'Alt', 'Meta'];

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

export function modifierFamily(code: string): string | null {
  const match = MODIFIER_CODES.exec(code);
  return match ? match[1] : null;
}

export function mouseButtonOf(bind: Bind): number | null {
  if (bind.length !== 1) return null;
  const match = MOUSE_CODE.exec(bind[0]);
  return match ? Number(match[1]) : null;
}

/**
 * 键位原子校验：接受任意形态合法的 `KeyboardEvent.code`，
 * 只排除无法使用的值。这样录制、注册、读配置三条路径的判定一致。
 */
export function isBindAtom(code: unknown): code is string {
  if (typeof code !== 'string' || !CODE_SHAPE.test(code)) return false;
  if (BLOCKED_CODES.has(code)) return false;
  if (MOUSE_CODE.test(code)) return isMouseAtom(code);
  return true;
}

/** 是否为受支持的鼠标原子（中键与两个侧键） */
export function isMouseAtom(code: string): boolean {
  const match = MOUSE_CODE.exec(code);
  return Boolean(match && MOUSE_BUTTONS.has(Number(match[1])));
}

/** 鼠标原子是否仍按在 `buttons` 掩码里；非鼠标原子一律返回 true */
export function mouseAtomPressed(atom: string, buttons: number): boolean {
  const match = MOUSE_CODE.exec(atom);
  if (!match) return true;
  const bit = MOUSE_BUTTON_BITS[Number(match[1])] ?? 0;
  return (buttons & bit) !== 0;
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

/**
 * 读取已保存的键位。空数组表示用户显式清空，属于合法配置；
 * 注册与声明仍走 `normalizeBind`，不接受空键位。
 */
export function normalizeSavedBind(input: unknown): Bind | null {
  if (Array.isArray(input) && input.length === 0) return [];
  return normalizeBind(input);
}

/** 1.0.2 的 step 串：`Ctrl+KeyA,KeyB` → [ControlLeft, KeyA, KeyB]；旧编码不含顺序，修饰键置于前部 */
function parseV2Step(step: string): Bind | null {
  if (typeof step !== 'string' || !step) return null;
  const parts = step.split('+');
  const tail = parts.pop() ?? '';
  const mods = parts;
  const codes = tail ? tail.split(',') : [];
  if (codes.length === 0) return null;

  const out: Bind = [];
  for (const mod of V2_MOD_ORDER) {
    if (!mods.includes(mod)) continue;
    const atom = V2_MODS[mod];
    if (!out.includes(atom)) out.push(atom);
  }
  for (const mod of mods) {
    if (V2_MOD_ORDER.includes(mod)) continue;
    return null;
  }
  for (const code of codes) {
    if (!isBindAtom(code) || MODIFIER_CODES.test(code)) return null;
    if (!out.includes(code)) out.push(code);
  }
  if (out.length === 0 || out.length > MAX_CHORD_ATOMS) return null;
  return out;
}

/** 1.0.2 的多个 step 按顺序合并为一个组合并去重，避免静默丢弃 */
export function parseV2Binds(steps: unknown): Bind | null {
  if (!Array.isArray(steps)) return null;
  const out: Bind = [];
  for (const step of steps) {
    const bind = parseV2Step(typeof step === 'string' ? step : '');
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
    const index = Number(fn[1]);
    return index >= 1 && index <= 24 ? `F${index}` : null;
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
    return isBindAtom(code) ? code : null;
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

/** 匹配表键：修饰键按族归并，顺序保留 */
export function bindKey(bind: Bind): string {
  return bind
    .map(atom => {
      const family = modifierFamily(atom);
      return family ? `@${family}` : atom;
    })
    .join('|');
}
