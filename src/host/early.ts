import type { EarlyRegistry } from '../globals';

/**
 * 早期包：接住 Mousetrap 的 bind / unbind / reset，并接入模组声明。
 * 只记录组合，不保存处理函数源码，也不改写任何原生原型。
 */

const previous = window.__DoLHKEarly;
const registry: EarlyRegistry =
  previous && Array.isArray(previous.bindings) ? previous : { bindings: [] };
window.__DoLHKEarly = registry;

function combosOf(keys: unknown): string[] {
  if (Array.isArray(keys)) {
    return keys.map(item => String(item ?? '').trim().toLowerCase()).filter(Boolean);
  }
  if (typeof keys === 'string') return keys.toLowerCase().split(/\s+/).filter(Boolean);
  return [];
}

function record(keys: unknown): void {
  const combos = combosOf(keys);
  if (combos.length === 0) return;
  registry.bindings.push({ combos });
}

function forget(keys: unknown): void {
  const drop = new Set(combosOf(keys));
  if (drop.size === 0) return;
  const next: typeof registry.bindings = [];
  for (const binding of registry.bindings) {
    const remain = binding.combos.filter(combo => !drop.has(combo));
    if (remain.length === binding.combos.length) next.push(binding);
    else if (remain.length > 0) next.push({ combos: remain });
  }
  registry.bindings = next;
}

function instrument(Mousetrap: any): any {
  if (!Mousetrap || typeof Mousetrap.bind !== 'function' || Mousetrap.__dolhk) return Mousetrap;

  const originalBind = Mousetrap.bind;
  Mousetrap.bind = function patchedBind(this: unknown, keys: unknown, handler: unknown, action?: unknown) {
    try {
      record(keys);
    } catch {
      /* 记录失败不得影响宿主 */
    }
    return originalBind.call(this, keys, handler, action);
  };

  if (typeof Mousetrap.unbind === 'function') {
    const originalUnbind = Mousetrap.unbind;
    Mousetrap.unbind = function patchedUnbind(this: unknown, keys: unknown, action?: unknown) {
      try {
        forget(keys);
      } catch {
        /* ignore */
      }
      return originalUnbind.call(this, keys, action);
    };
  }

  if (typeof Mousetrap.reset === 'function') {
    const originalReset = Mousetrap.reset;
    Mousetrap.reset = function patchedReset(this: unknown) {
      try {
        registry.bindings = [];
      } catch {
        /* ignore */
      }
      return originalReset.call(this);
    };
  }

  Object.defineProperty(Mousetrap, '__dolhk', { value: true });
  return Mousetrap;
}

let current: any;

function installMousetrapAccessor(): void {
  const prior = Object.getOwnPropertyDescriptor(window, 'Mousetrap');
  // 已有访问器说明别的代码也在拦截该全局，交给对方，检测回退到内置快照
  if (prior && (prior.get || prior.set)) return;
  if (prior && 'value' in prior) current = instrument(prior.value);
  try {
    Object.defineProperty(window, 'Mousetrap', {
      configurable: true,
      enumerable: true,
      get() {
        return current;
      },
      set(value: any) {
        current = instrument(value);
      },
    });
  } catch {
    /* 全局不可配置时为只读，检测回退到内置快照 */
  }
}

function installWrappers(): void {
  if (registry.installed) return;
  registry.installed = true;
  installMousetrapAccessor();
}

installWrappers();

/** 每个模组的第 n 次回调对应其第 n 条声明，避免同一次注册被重复采集 */
const cursor = new WeakMap<object, number>();

function registerAddon(): void {
  if (registry.addonRegistered) return;
  const manager = (window as any).modSC2DataManager?.getAddonPluginManager?.();
  if (!manager || typeof manager.registerAddonPlugin !== 'function') return;
  registry.addonRegistered = true;
  try {
    manager.registerAddonPlugin('DoL Hotkeys', 'hotkeys', {
      async registerMod(_addonName: string, mod: any): Promise<void> {
        const declared = mod?.bootJson?.addonPlugin;
        if (!Array.isArray(declared)) return;
        const matches = declared.filter(
          (entry: any) => entry?.modName === 'DoL Hotkeys' && entry?.addonName === 'hotkeys',
        );
        const index = cursor.get(mod) ?? 0;
        cursor.set(mod, index + 1);
        const entry = matches[index];
        if (!entry) return;
        const list = (window.DoLHK_DECL ??= []);
        list.push({
          modName: typeof mod?.name === 'string' ? mod.name : '',
          params: entry.params ?? null,
          declaredVersion: entry.modVersion ?? null,
        });
      },
    });
  } catch (error) {
    console.warn('[dol-hotkeys] addon registration failed', error);
  }
}

registerAddon();
