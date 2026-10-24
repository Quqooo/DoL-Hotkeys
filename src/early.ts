import type { EarlyRegistry } from './globals';

const registry: EarlyRegistry = { bindings: [], native: [], mousetrapSeen: false };

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

function recordNative(type: unknown, listener: unknown): void {
  if (typeof type !== 'string' || !type.startsWith('key')) return;
  if (typeof listener !== 'function') return;
  registry.native.push({ keys: type, combos: [type], src: String(listener) });
}

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

let current: any;

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
