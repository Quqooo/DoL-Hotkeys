import { normalizeSavedBind, parseV2Binds } from './keys';
import { ACTION_ORDER, type ActionId, type Bind, type ConflictMode, type Config, type LangMode } from './types';

const STORAGE_KEY = 'dol-hotkeys:config';
const CONFIG_VERSION = 3;

export const DEFAULT_BINDS: Record<ActionId, Bind> = {
  back: ['ControlLeft', 'KeyZ'],
  forward: ['ControlLeft', 'KeyX'],
  characteristics: ['AltLeft', 'KeyC'],
  social: ['AltLeft', 'KeyR'],
  traits: ['AltLeft', 'KeyT'],
  journal: ['AltLeft', 'KeyJ'],
  statistics: ['AltLeft', 'KeyI'],
  feats: ['AltLeft', 'KeyF'],
  options: ['AltLeft', 'KeyO'],
  saves: ['AltLeft', 'KeyS'],
  cheats: ['AltLeft', 'KeyH'],
};

const CONFLICT_MODES: readonly ConflictMode[] = ['first', 'all'];

function cloneDefaults(): Record<string, Bind> {
  const binds: Record<string, Bind> = {};
  for (const action of ACTION_ORDER) binds[action] = [...DEFAULT_BINDS[action]];
  return binds;
}

function defaults(): Config {
  return {
    v: CONFIG_VERSION,
    lang: 'auto',
    volumeKeys: false,
    volumeInvert: false,
    conflictMode: 'first',
    binds: cloneDefaults(),
    external: [],
    collapsed: [],
  };
}

let cache: Config | null = null;
let rev = 0;

const listeners = new Set<() => void>();

/** 配置写入后回调，供控件与外部界面同步；返回取消订阅的函数 */
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
      console.warn('[dol-hotkeys] settings listener failed', error);
    }
  }
}

/** 逐条解析：解析失败的条目保持默认值，不因一条非法数据丢弃其余配置 */
function readBinds(rawBinds: Record<string, unknown>, target: Config): void {
  for (const [id, value] of Object.entries(rawBinds)) {
    const bind = normalizeSavedBind(value);
    if (bind) target.binds[id] = bind;
  }
}

/** 1.0.2 的键位是 step 串，转换为有序组合 */
function readV2Binds(rawBinds: Record<string, unknown>, target: Config): void {
  for (const [id, value] of Object.entries(rawBinds)) {
    const bind = parseV2Binds(value);
    if (bind) target.binds[id] = bind;
  }
}

/** 读取字符串数组：剔除非法项并按首现去重 */
function readStringList(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  const items = raw.filter((item): item is string => typeof item === 'string' && item.length > 0);
  return [...new Set(items)];
}

export function getConfig(): Config {
  if (cache) return cache;
  const config = defaults();
  let needsSave = false;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Record<string, unknown>;
      if (parsed && typeof parsed === 'object') needsSave = applyStored(parsed, config);
    }
  } catch {
    /* 无法读取时使用默认值 */
  }
  cache = config;
  if (needsSave) saveConfig();
  return config;
}

/** 把已存储的内容读进 config；返回是否需要回写（1.0.2 的配置需要升级） */
function applyStored(parsed: Record<string, unknown>, config: Config): boolean {
  const version = typeof parsed.v === 'number' ? parsed.v : CONFIG_VERSION;
  const lang = parsed.lang;
  if (lang === 'auto' || lang === 'zh' || lang === 'en') config.lang = lang as LangMode;
  if (typeof parsed.volumeKeys === 'boolean') config.volumeKeys = parsed.volumeKeys;
  if (typeof parsed.volumeInvert === 'boolean') config.volumeInvert = parsed.volumeInvert;
  if (CONFLICT_MODES.includes(parsed.conflictMode as ConflictMode)) {
    config.conflictMode = parsed.conflictMode as ConflictMode;
  }
  config.external = readStringList(parsed.external);
  config.collapsed = readStringList(parsed.collapsed);

  const rawBinds = parsed.binds && typeof parsed.binds === 'object' ? (parsed.binds as Record<string, unknown>) : {};
  if (version < 3) {
    readV2Binds(rawBinds, config);
    return true;
  }
  readBinds(rawBinds, config);
  return false;
}

export function saveConfig(): void {
  if (!cache) return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(cache));
  } catch {
    /* 存储不可用时仅保留内存配置 */
  }
}

export function revision(): number {
  return rev;
}

export function setBind(id: string, bind: Bind): void {
  const config = getConfig();
  config.binds[id] = [...bind];
  rev++;
  saveConfig();
  notify();
}

export function conflictMode(): ConflictMode {
  return getConfig().conflictMode;
}

export function setConflictMode(mode: ConflictMode): void {
  const config = getConfig();
  config.conflictMode = mode;
  saveConfig();
  notify();
}

/** 删除某个 id 的已存键位，供卸载时同步清理 */
export function forgetBind(id: string): void {
  const config = getConfig();
  if (!(id in config.binds)) return;
  delete config.binds[id];
  rev++;
  saveConfig();
  notify();
}

/** 折叠状态只影响面板观感，不参与派发，因此不递增 rev */
export function setFolded(key: string, folded: boolean): void {
  const config = getConfig();
  const has = config.collapsed.includes(key);
  if (has === folded) return;
  config.collapsed = folded ? [...config.collapsed, key] : config.collapsed.filter(item => item !== key);
  saveConfig();
}
