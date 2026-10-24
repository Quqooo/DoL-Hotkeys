import { withDeclaration } from './decl';
import { normalizeBind, parseMousetrap } from '../core/keys';
import { getConfig } from '../core/settings';
import { ACTION_ORDER, type ActionId, type Bind, type HotkeyDefInput, type Lang, type LocalizedText, type RegisteredHotkey } from '../core/types';

const ID_PATTERN = /^[A-Za-z0-9_-]+(\.[A-Za-z0-9_-]+)+$/;
const MAX_LABEL = 80;

const entries = new Map<string, RegisteredHotkey>();
const listeners = new Set<() => void>();

/** 注册表内容变化时回调，供面板重绘 */
export function subscribe(listener: () => void): void {
  listeners.add(listener);
}

function notify(): void {
  for (const listener of listeners) {
    try {
      listener();
    } catch (error) {
      console.warn('[dol-hotkeys] registry listener failed', error);
    }
  }
}
let counter = 0;
let rev = 0;

function warn(message: string): void {
  console.warn(`[dol-hotkeys] ${message}`);
}

export function revision(): number {
  return rev;
}

export function isValidId(id: string): boolean {
  return ID_PATTERN.test(id);
}

function toBind(input: HotkeyDefInput['defaultBind']): Bind | null {
  if (typeof input === 'string') return parseMousetrap(input);
  return normalizeBind(input);
}

export function resolveLabel(text: LocalizedText | undefined, id: string, lang: Lang): string {
  if (text === undefined) return id;
  if (typeof text === 'string') return text.trim() || id;
  if (typeof text === 'function') {
    try {
      const value = text(lang);
      return typeof value === 'string' && value.trim() ? value.trim() : id;
    } catch {
      return id;
    }
  }
  const primary = text[lang];
  if (typeof primary === 'string' && primary.trim()) return primary.trim();
  const fallback = text[lang === 'zh' ? 'en' : 'zh'];
  return typeof fallback === 'string' && fallback.trim() ? fallback.trim() : id;
}

export function register(raw: HotkeyDefInput): boolean {
  const input = withDeclaration(raw);
  if (!input || typeof input !== 'object') {
    warn('register() rejected: definition must be an object');
    return false;
  }
  const id = typeof input.id === 'string' ? input.id.trim() : '';
  if (!isValidId(id)) {
    warn(`register() rejected: invalid id "${String(input.id)}"`);
    return false;
  }
  if (typeof input.handler !== 'function') {
    warn(`register() rejected: handler of "${id}" must be a function`);
    return false;
  }
  if (entries.has(id)) {
    warn(`register() rejected: duplicate id "${id}"`);
    return false;
  }
  const bind = toBind(input.defaultBind);
  if (!bind) {
    warn(`register() rejected: defaultBind of "${id}" is missing or invalid`);
    return false;
  }

  store(input, id, bind, false);
  return true;
}

/** 内置动作走内部注册：id 不需要命名空间，但必须属于 ACTION_ORDER */
export function registerBuiltin(input: HotkeyDefInput): boolean {
  const id = input.id;
  if (!ACTION_ORDER.includes(id as ActionId)) return false;
  if (entries.has(id)) return false;
  if (typeof input.handler !== 'function') return false;
  const bind = toBind(input.defaultBind);
  if (!bind) return false;
  store(input, id, bind, true);
  return true;
}

function store(input: HotkeyDefInput, id: string, bind: Bind, builtin: boolean): void {
  entries.set(id, {
    id,
    handler: input.handler,
    label: input.label ?? id,
    defaultBind: bind,
    group: input.group,
    available: typeof input.available === 'function' ? input.available : () => true,
    priority: typeof input.priority === 'number' && Number.isFinite(input.priority) ? input.priority : 0,
    inInput: input.inInput === true,
    builtin,
    order: counter++,
  });
  rev++;
  notify();
}

export function unregister(id: string): boolean {
  const removed = entries.delete(id);
  if (removed) {
    rev++;
    notify();
  }
  return removed;
}

export function get(id: string): RegisteredHotkey | undefined {
  return entries.get(id);
}

export function list(): RegisteredHotkey[] {
  return [...entries.values()];
}

export function labelOf(entry: RegisteredHotkey, lang: Lang): string {
  return resolveLabel(entry.label, entry.id, lang).slice(0, MAX_LABEL);
}

export function groupOf(entry: RegisteredHotkey, lang: Lang): string | null {
  if (entry.group === undefined) return null;
  const text = resolveLabel(entry.group, entry.id, lang);
  return text === entry.id ? null : text.slice(0, MAX_LABEL);
}

/**
 * 生效键位：用户改过则用用户值，否则回退注册时的默认键。
 * 空数组属于"用户显式清空"，不能当作未设置再回退。
 */
export function bindOf(id: string): Bind {
  const stored = getConfig().binds[id];
  if (stored) return stored;
  return entries.get(id)?.defaultBind ?? [];
}

/** available() 抛错视为不可用，避免一个条目的错误影响整批派发 */
export function isUsable(entry: RegisteredHotkey): boolean {
  try {
    return entry.available() !== false;
  } catch {
    return false;
  }
}
