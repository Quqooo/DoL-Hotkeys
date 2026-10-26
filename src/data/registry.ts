import { withDeclaration } from './decl';
import { normalizeBind, parseMousetrap } from '../core/keys';
import { forgetBind, getConfig } from '../core/settings';
import { ACTION_ORDER, type ActionId, type Bind, type GroupDecl, type GroupRef, type HotkeyDefInput, type Lang, type LocalizedText, type RegisteredHotkey } from '../core/types';

const ID_PATTERN = /^[A-Za-z0-9_-]+(\.[A-Za-z0-9_-]+)+$/;
const MAX_LABEL = 80;
const MAX_TIP = 240;
const MAX_GROUP_ID = 64;

const entries = new Map<string, RegisteredHotkey>();
const listeners = new Set<() => void>();

/** 注册表内容变化时回调，供面板与控件重绘；返回取消订阅的函数 */
export function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
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

/** 只接受字符串、函数或 `{ zh, en }` 对象；其余值按未提供处理 */
function toText(raw: unknown): LocalizedText | undefined {
  if (typeof raw === 'string') return raw.trim() ? raw : undefined;
  if (typeof raw === 'function') return raw as LocalizedText;
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return undefined;
  const source = raw as { zh?: unknown; en?: unknown };
  const text: { zh?: string; en?: string } = {};
  if (typeof source.zh === 'string' && source.zh.trim()) text.zh = source.zh.trim();
  if (typeof source.en === 'string' && source.en.trim()) text.en = source.en.trim();
  return text.zh === undefined && text.en === undefined ? undefined : text;
}

/** 归一并在丢弃非法值时诊断一次，便于第三方定位自己传错的字段 */
function textOf(field: string, raw: unknown, id: string): LocalizedText | undefined {
  const text = toText(raw);
  if (raw !== undefined && text === undefined) {
    warn(`${field} of "${id}" is not a string, a function or a { zh, en } object`);
  }
  return text;
}

/**
 * 分组引用归一。字符串视为只有 id 的写法，id 不要求命名空间，
 * 因此任何模组都能用同一个 id 加入别的模组创建的分组。
 */
function toGroup(raw: GroupRef | undefined, id: string): GroupDecl | undefined {
  if (raw === undefined || raw === null) return undefined;
  if (typeof raw === 'string') {
    const groupId = raw.trim().slice(0, MAX_GROUP_ID);
    if (groupId) return { id: groupId };
    warn(`group of "${id}" is empty and ignored`);
    return undefined;
  }
  if (typeof raw !== 'object') {
    warn(`group of "${id}" must be a string or { id, label }`);
    return undefined;
  }
  const groupId = typeof raw.id === 'string' ? raw.id.trim().slice(0, MAX_GROUP_ID) : '';
  if (!groupId) {
    warn(`group of "${id}" needs a non-empty id`);
    return undefined;
  }
  const label = textOf('group label', raw.label, id);
  return label === undefined ? { id: groupId } : { id: groupId, label };
}

/**
 * 解析本地化文本。参数用 `unknown`：调用方可能把第三方传入的值直接丢进来，
 * 因此非字符串、非函数、非 `{ zh, en }` 对象一律回退到 id，不抛错。
 */
export function resolveLabel(text: unknown, id: string, lang: Lang): string {
  if (typeof text === 'string') return text.trim() || id;
  if (typeof text === 'function') {
    try {
      const value = (text as (lang: Lang) => unknown)(lang);
      return typeof value === 'string' && value.trim() ? value.trim() : id;
    } catch {
      return id;
    }
  }
  if (!text || typeof text !== 'object') return id;
  const record = text as Record<string, unknown>;
  const primary = record[lang];
  if (typeof primary === 'string' && primary.trim()) return primary.trim();
  const fallback = record[lang === 'zh' ? 'en' : 'zh'];
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
    label: textOf('label', input.label, id) ?? id,
    tip: textOf('tip', input.tip, id),
    defaultBind: bind,
    group: toGroup(input.group, id),
    available: typeof input.available === 'function' ? input.available : () => true,
    priority: typeof input.priority === 'number' && Number.isFinite(input.priority) ? input.priority : 0,
    inInput: input.inInput === true,
    builtin,
    order: counter++,
  });
  rev++;
  notify();
}

/**
 * 注销一个热键。默认保留用户在配置里的键位，重新注册后可以沿用；
 * `forgetBind` 为 true 时一并删除，适用于模组被移除的场景。
 */
export function unregister(id: string, options?: { forgetBind?: boolean }): boolean {
  const removed = entries.delete(id);
  if (options?.forgetBind) forgetBind(id);
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

/** 分组 id；未分组返回 null（归入默认区） */
export function groupIdOf(entry: RegisteredHotkey): string | null {
  return entry.group?.id ?? null;
}

let labelRev = -1;
let labelSources = new Map<string, LocalizedText>();

/**
 * 分组显示名来源：按注册顺序取最早给出 label 的那一项。
 * 后来的模组只写 id 也能加入同一分组，名称沿用先注册者。
 */
function labelSourceOf(groupId: string): LocalizedText | undefined {
  if (labelRev !== rev) {
    labelRev = rev;
    labelSources = new Map();
    // Map 的迭代顺序即注册顺序
    for (const entry of entries.values()) {
      const group = entry.group;
      if (!group || group.label === undefined) continue;
      if (!labelSources.has(group.id)) labelSources.set(group.id, group.label);
    }
  }
  return labelSources.get(groupId);
}

/** 分组标题：没有任何注册项给出 label 时回退到 id */
export function groupLabelOf(groupId: string, lang: Lang): string {
  const source = labelSourceOf(groupId);
  if (source === undefined) return groupId;
  return resolveLabel(source, groupId, lang).slice(0, MAX_LABEL);
}

/** 说明文字；未提供或解析不出内容时返回 null，行上就不加 (?) */
export function tipOf(entry: RegisteredHotkey, lang: Lang): string | null {
  if (entry.tip === undefined) return null;
  const text = resolveLabel(entry.tip, entry.id, lang);
  return text === entry.id ? null : text.slice(0, MAX_TIP);
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
