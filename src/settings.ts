import type { ActionId, Config, LangMode } from './types';
import { ACTION_ORDER } from './types';

const STORAGE_KEY = 'dol-hotkeys:config';
const MAX_STEPS = 8;
const CONFIG_VERSION = 2;

export const DEFAULT_BINDS: Record<ActionId, string[]> = {
  back: ['Ctrl+KeyZ'],
  forward: ['Ctrl+KeyX'],
  characteristics: ['Alt+KeyC'],
  social: ['Alt+KeyR'],
  traits: ['Alt+KeyT'],
  journal: ['Alt+KeyJ'],
  feats: ['Alt+KeyF'],
  options: ['Alt+KeyO'],
  saves: ['Alt+KeyS'],
  cheats: ['Alt+KeyH'],
};

const LEGACY_DEFAULTS: Partial<Record<ActionId, string[]>> = {
  back: ['Alt+KeyZ'],
  forward: ['Alt+KeyX'],
};

function cloneBinds(source: Record<ActionId, string[]>): Record<ActionId, string[]> {
  const binds = {} as Record<ActionId, string[]>;
  for (const action of ACTION_ORDER) binds[action] = [...source[action]];
  return binds;
}

function defaults(): Config {
  return {
    v: CONFIG_VERSION,
    lang: 'auto',
    volumeKeys: false,
    volumeInvert: false,
    binds: cloneBinds(DEFAULT_BINDS),
  };
}

let cache: Config | null = null;

function sanitizeBinds(raw: unknown, target: Config): void {
  if (!raw || typeof raw !== 'object') return;
  const src = raw as Record<string, unknown>;
  for (const action of ACTION_ORDER) {
    const value = src[action];
    if (!Array.isArray(value)) continue;
    if (value.length > MAX_STEPS) continue;
    if (!value.every(s => typeof s === 'string' && s.length > 0)) continue;
    target.binds[action] = [...value];
  }
}

function migrate(parsed: Record<string, unknown>, target: Config): void {
  const version = typeof parsed.v === 'number' ? parsed.v : 1;
  if (version >= CONFIG_VERSION) return;
  for (const action of ACTION_ORDER) {
    const legacy = LEGACY_DEFAULTS[action];
    if (!legacy) continue;
    const current = target.binds[action];
    if (current.length === legacy.length && current.every((step, index) => step === legacy[index])) {
      target.binds[action] = [...DEFAULT_BINDS[action]];
    }
  }
}

export function getConfig(): Config {
  if (cache) return cache;
  const config = defaults();
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Record<string, unknown>;
      if (parsed && typeof parsed === 'object') {
        const lang = parsed.lang;
        if (lang === 'auto' || lang === 'zh' || lang === 'en') config.lang = lang as LangMode;
        if (typeof parsed.volumeKeys === 'boolean') config.volumeKeys = parsed.volumeKeys;
        if (typeof parsed.volumeInvert === 'boolean') config.volumeInvert = parsed.volumeInvert;
        sanitizeBinds(parsed.binds, config);
        migrate(parsed, config);
      }
    }
  } catch {
    /* unreadable storage falls back to defaults */
  }
  cache = config;
  return config;
}

export function saveConfig(): void {
  if (!cache) return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(cache));
  } catch {
    /* storage disabled, keep the in-memory config */
  }
}

export function setBind(action: ActionId, steps: string[]): void {
  const config = getConfig();
  config.binds[action] = steps.slice(0, MAX_STEPS);
  saveConfig();
}

export function resetBind(action: ActionId): void {
  setBind(action, [...DEFAULT_BINDS[action]]);
}

export const MAX_SEQUENCE_STEPS = MAX_STEPS;
