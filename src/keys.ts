const MODIFIER_CODES = /^(Shift|Control|Alt|Meta)(Left|Right)$/;

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
};

const MOD_ORDER = ['Ctrl', 'Shift', 'Alt', 'Meta'] as const;

export function isModifierCode(code: string): boolean {
  return MODIFIER_CODES.test(code);
}

export function stepFromEvent(e: KeyboardEvent): string {
  const mods: string[] = [];
  if (e.ctrlKey) mods.push('Ctrl');
  if (e.shiftKey) mods.push('Shift');
  if (e.altKey) mods.push('Alt');
  if (e.metaKey) mods.push('Meta');
  mods.push(e.code || e.key);
  return mods.join('+');
}

export function modsFromEvent(e: KeyboardEvent): string[] {
  const mods: string[] = [];
  if (e.ctrlKey) mods.push('Ctrl');
  if (e.shiftKey) mods.push('Shift');
  if (e.altKey) mods.push('Alt');
  if (e.metaKey) mods.push('Meta');
  return mods;
}

export function appendKey(step: string, code: string): string {
  return `${step},${code}`;
}

export function splitStep(step: string): { mods: string[]; codes: string[] } {
  const parts = step.split('+');
  const tail = parts.pop() ?? '';
  return { mods: parts, codes: tail ? tail.split(',') : [] };
}

export function sameMods(a: string[], b: string[]): boolean {
  const na = MOD_ORDER.filter(m => a.includes(m));
  const nb = MOD_ORDER.filter(m => b.includes(m));
  return na.length === nb.length && na.every((m, i) => m === nb[i]);
}

export function sameStep(a: string, b: string): boolean {
  const sa = splitStep(a);
  const sb = splitStep(b);
  if (sa.codes.length !== sb.codes.length) return false;
  if (!sa.codes.every((code, i) => code === sb.codes[i])) return false;
  return sameMods(sa.mods, sb.mods);
}

export function stepIsPrefixOf(partial: string, full: string): boolean {
  const p = splitStep(partial);
  const f = splitStep(full);
  if (!sameMods(p.mods, f.mods)) return false;
  if (p.codes.length > f.codes.length) return false;
  return p.codes.every((code, i) => code === f.codes[i]);
}

export function sameSequence(a: string[], b: string[]): boolean {
  return a.length === b.length && a.every((s, i) => sameStep(s, b[i]));
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

export function formatStep(step: string): string {
  const { mods, codes } = splitStep(step);
  return [...MOD_ORDER.filter(m => mods.includes(m)), ...codes.map(keyLabel)].join(' + ');
}

export function formatSequence(steps: string[]): string {
  return steps.map(formatStep).join('  →  ');
}

export function isDigitStep(step: string): boolean {
  return splitStep(step).codes.some(code => /^(Digit|Numpad)\d/.test(code));
}
