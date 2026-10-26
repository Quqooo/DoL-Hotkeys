import { installBuiltins } from './builtins';
import { checkDeclarations } from './data/decl';
import { install } from './runtime/engine';
import { currentLang, setLangOverride, t } from './ui/i18n';
import { applyVolumeOverride, installVolumeKeys } from './host/mobile';
import { ensureTab, installPanel, openPanel } from './ui/panel';
import { createBindControl } from './ui/panel/control';
import { warnOf } from './ui/panel/rows';
import * as registry from './data/registry';
import { clashOf, labelOfReserved, warnOnRegister } from './host/vanilla';
import { getConfig } from './core/settings';
import type { Bind, HotkeyDefInput } from './core/types';

let listenersInstalled = false;

function register(def: Parameters<typeof registry.register>[0]): boolean {
  const ok = registry.register(def);
  if (ok) {
    const bind = getBind(def.id);
    if (bind) warnOnRegister(def.id, bind);
  }
  return ok;
}

/** 队列里的条目来自第三方，可能完全非法；类型在此收窄，校验由注册表负责 */
function registerRaw(def: unknown): boolean {
  return register(def as HotkeyDefInput);
}

function drainQueue(): void {
  const queue = window.DoLHK_QUEUE;
  if (Array.isArray(queue)) {
    for (const def of queue.splice(0)) registerRaw(def);
  }
  window.DoLHK_QUEUE = { push: registerRaw };
}

/** 未注册的 id 返回 null，与"注册但键位为空"的 [] 区分 */
function getBind(id: string): Bind | null {
  return registry.get(id) ? [...registry.bindOf(id)] : null;
}

function overlayHost(): HTMLElement | null {
  return document.getElementById('customOverlay') ?? document.getElementById('customOverlayTitle');
}

function init(): boolean {
  if (!document.body) return false;
  const config = getConfig();
  setLangOverride(config.lang);
  if (!listenersInstalled) {
    install();
    // 注册音量键监听会使 cordova 自动接管按键，随后需按配置重新声明一次（关闭状态亦然）
    installVolumeKeys();
    applyVolumeOverride(config.volumeKeys);
    listenersInstalled = true;
  }
  if (!overlayHost()) return false;
  installPanel();
  return true;
}

/** 未注册的 id 一律视为不可用 */
function availableOf(id: string): boolean {
  const entry = registry.get(id);
  return entry ? registry.isUsable(entry) : false;
}

window.DoLHK = {
  api: 1,
  version: __DOLHK_VERSION__,
  register,
  unregister: registry.unregister,
  getBind,
  getDefaultBind: registry.defaultBindOf,
  list: () => registry.list().map(entry => entry.id),
  openPanel,
  lang: currentLang,
  get label(): string {
    return t().tab;
  },
  available: availableOf,
  refreshTab: ensureTab,
  ui: {
    createBindControl,
    warnOf,
  },
};

installBuiltins();
checkDeclarations(bind => {
  const clash = clashOf(bind);
  return clash ? labelOfReserved(clash, currentLang()) : undefined;
});
drainQueue();

function boot(): void {
  let attempts = 0;
  const tick = (): void => {
    if (init()) return;
    attempts++;
    if (attempts < 600) setTimeout(tick, 100);
    else console.warn('[dol-hotkeys] overlay container never appeared, settings tab was not injected.');
  };
  tick();
}

window.jQuery?.(document).on(':storyready', () => {
  init();
});
boot();
