import { bindFromLegacySteps, normalizeBind } from './keys';
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

/** v1 默认键（旧编码），仅用于 v1→v2 迁移 */
const LEGACY_V1_DEFAULTS: Partial<Record<ActionId, string[]>> = {
  back: ['Alt+KeyZ'],
  forward: ['Alt+KeyX'],
};

/** v2 默认键，v1 用户迁移后的目标 */
const V2_DEFAULTS: Partial<Record<ActionId, string[]>> = {
  back: ['Ctrl+KeyZ'],
  forward: ['Ctrl+KeyX'],
};

const CONFLICT_MODES: readonly ConflictMode[] = ['legacy', 'all', 'first'];

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
    conflictMode: 'legacy',
    binds: cloneDefaults(),
    external: [],
  };
}

let cache: Config | null = null;
let rev = 0;

/** v1→v2：仅在旧编码上替换默认键，避免影响用户自定义 */
function migrateV1ToV2(rawBinds: Record<string, unknown>): void {
  for (const action of ACTION_ORDER) {
    const legacy = LEGACY_V1_DEFAULTS[action];
    const next = V2_DEFAULTS[action];
    if (!legacy || !next) continue;
    const current = rawBinds[action];
    if (!Array.isArray(current)) continue;
    const steps = current.filter((item): item is string => typeof item === 'string');
    if (steps.length === legacy.length && steps.every((step, index) => step === legacy[index])) {
      rawBinds[action] = [...next];
    }
  }
}

/** v2→v3：旧编码解析为 Bind，不改变既有键位含义 */
function migrateV2ToV3(rawBinds: Record<string, unknown>, target: Config): void {
  for (const [id, value] of Object.entries(rawBinds)) {
    const bind = bindFromLegacySteps(value);
    if (bind) target.binds[id] = bind;
  }
}


function readV3Binds(rawBinds: Record<string, unknown>, target: Config): void {
  for (const [id, value] of Object.entries(rawBinds)) {
    const bind = normalizeBind(value);
    if (bind) target.binds[id] = bind;
  }
}

function readExternal(raw: unknown, target: Config): void {
  if (!Array.isArray(raw)) return;
  const ids = raw.filter((item): item is string => typeof item === 'string' && item.length > 0);
  target.external = [...new Set(ids)];
}

export function getConfig(): Config {
  if (cache) return cache;
  const config = defaults();
  let needsSave = false;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Record<string, unknown>;
      if (parsed && typeof parsed === 'object') {
        const version = typeof parsed.v === 'number' ? parsed.v : 1;
        const lang = parsed.lang;
        if (lang === 'auto' || lang === 'zh' || lang === 'en') config.lang = lang as LangMode;
        if (typeof parsed.volumeKeys === 'boolean') config.volumeKeys = parsed.volumeKeys;
        if (typeof parsed.volumeInvert === 'boolean') config.volumeInvert = parsed.volumeInvert;
        if (CONFLICT_MODES.includes(parsed.conflictMode as ConflictMode)) {
          config.conflictMode = parsed.conflictMode as ConflictMode;
        }
        readExternal(parsed.external, config);

        const rawBinds =
          parsed.binds && typeof parsed.binds === 'object' ? (parsed.binds as Record<string, unknown>) : {};

        if (version < 2) {
          migrateV1ToV2(rawBinds);
          needsSave = true;
        }
        if (version < 3) {
          migrateV2ToV3(rawBinds, config);
          needsSave = true;
        } else {
          readV3Binds(rawBinds, config);
        }
      }
    }
  } catch {
    /* 无法读取时使用默认值 */
  }
  cache = config;
  if (needsSave) saveConfig();
  return config;
}

export function saveConfig(): void {
  if (!cache) return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(cache));
  } catch {
    /* 存储不可用时仅保留内存配置 */
  }
}

export function getBind(id: string): Bind | null {
  const bind = getConfig().binds[id];
  return bind ? [...bind] : null;
}

export function revision(): number {
  return rev;
}

export function setBind(id: string, bind: Bind): void {
  const config = getConfig();
  config.binds[id] = [...bind];
  rev++;
  saveConfig();
}

export function resetBind(action: ActionId): void {
  setBind(action, [...DEFAULT_BINDS[action]]);
}

export function conflictMode(): ConflictMode {
  return getConfig().conflictMode;
}

export function setConflictMode(mode: ConflictMode): void {
  const config = getConfig();
  config.conflictMode = mode;
  saveConfig();
}
