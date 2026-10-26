import type { EarlyRegistry } from '../globals';

/**
 * 早期包：在 InjectEarlyLoad 阶段采集原版与第三方的按键绑定。
 * 安装状态记在 `window.__DoLHKEarly` 上，重复求值不会二次包装。
 */

/** 重复求值时复用同一份观测数据：已安装的包装仍向这个对象写入 */
const previous = window.__DoLHKEarly;
const registry: EarlyRegistry =
  previous && Array.isArray(previous.bindings) ? previous : { bindings: [], native: [], mousetrapSeen: false };

window.__DoLHKEarly = registry;

function combosOf(keys: unknown): string[] {
  if (Array.isArray(keys)) return keys.map(item => String(item ?? '').trim()).filter(Boolean);
  if (typeof keys === 'string') return keys.split(/\s+/).filter(Boolean);
  return [];
}

function record(keys: unknown, handler: unknown): void {
  const combos = combosOf(keys);
  if (combos.length === 0) return;
  registry.bindings.push({
    keys: combos.join(' '),
    combos,
    src: typeof handler === 'function' ? String(handler) : '',
  });
}

function forget(keys: unknown): void {
  const combos = combosOf(keys);
  if (combos.length === 0) return;
  const drop = new Set(combos);
  const next: typeof registry.bindings = [];
  for (const binding of registry.bindings) {
    const remain = binding.combos.filter(combo => !drop.has(combo));
    if (remain.length === binding.combos.length) {
      next.push(binding);
      continue;
    }
    if (remain.length > 0) next.push({ ...binding, combos: remain, keys: remain.join(' ') });
  }
  registry.bindings = next;
}

function instrument(Mousetrap: any): any {
  if (!Mousetrap || typeof Mousetrap.bind !== 'function' || Mousetrap.__dolhk) return Mousetrap;
  const originalBind = Mousetrap.bind;
  Mousetrap.bind = function patchedBind(this: unknown, keys: unknown, handler: unknown, action?: unknown) {
    try {
      record(keys, handler);
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

/** 原生监听条数上限：只用于识别引擎处理器，超出后不再记录 */
const MAX_NATIVE = 200;

function recordNative(type: unknown, listener: unknown): void {
  if (typeof type !== 'string' || !type.startsWith('key')) return;
  if (typeof listener !== 'function') return;
  if (registry.native.length >= MAX_NATIVE) return;
  const src = String(listener);
  // 同一 type 与源码只记一次：重复注册很常见，去重后检测仍然够用
  if (registry.native.some(item => item.keys === type && item.src === src)) return;
  registry.native.push({ keys: type, combos: [type], src });
}

let current: any;

function installMousetrapAccessor(): void {
  const prior = Object.getOwnPropertyDescriptor(window, 'Mousetrap');
  // 已有访问器说明别的代码也在拦截该全局，交给对方，检测回退到内置快照
  if (prior && (prior.get || prior.set)) return;
  if (prior && 'value' in prior) {
    current = instrument(prior.value);
    if (current) registry.mousetrapSeen = true;
  }
  try {
    Object.defineProperty(window, 'Mousetrap', {
      configurable: true,
      enumerable: true,
      get() {
        return current;
      },
      set(value: any) {
        current = instrument(value);
        if (current) registry.mousetrapSeen = true;
      },
    });
  } catch {
    /* 全局不可配置时为只读，检测回退到内置快照 */
  }
}

/** 包装只安装一次；`installed` 落在共享 registry 上，重复求值不再叠加监听与访问器 */
function installWrappers(): void {
  if (registry.installed) return;
  registry.installed = true;

  try {
    const originalAdd = EventTarget.prototype.addEventListener;
    EventTarget.prototype.addEventListener = function patchedAdd(
      this: EventTarget,
      type: string,
      listener: any,
      options?: boolean | AddEventListenerOptions,
    ) {
      try {
        recordNative(type, listener);
      } catch {
        /* 记录失败不得影响监听注册 */
      }
      return originalAdd.call(this, type, listener, options);
    };
  } catch {
    /* ignore */
  }

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
