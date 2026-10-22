import type { EarlyRegistry } from './globals';

const registry: EarlyRegistry = { bindings: [], native: [], mousetrapSeen: false };

window.__DoLHKEarly = registry;

function record(keys: unknown, handler: unknown): void {
  const text = Array.isArray(keys) ? keys.join(' ') : String(keys ?? '');
  if (!text) return;
  registry.bindings.push({ keys: text, src: typeof handler === 'function' ? String(handler) : '' });
}

function instrument(Mousetrap: any): any {
  if (!Mousetrap || typeof Mousetrap.bind !== 'function' || Mousetrap.__dolhk) return Mousetrap;
  const originalBind = Mousetrap.bind;
  Mousetrap.bind = function patchedBind(this: unknown, keys: unknown, handler: unknown, action?: unknown) {
    try {
      record(keys, handler);
    } catch {
      /* recording must never break the host library */
    }
    return originalBind.call(this, keys, handler, action);
  };
  Object.defineProperty(Mousetrap, '__dolhk', { value: true });
  return Mousetrap;
}

function recordNative(type: unknown, listener: unknown): void {
  if (typeof type !== 'string' || !type.startsWith('key')) return;
  if (typeof listener !== 'function') return;
  registry.native.push({ keys: type, src: String(listener) });
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
      /* recording must never break listener registration */
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
  /* non-configurable global: detect.ts falls back to the built-in snapshot */
}
