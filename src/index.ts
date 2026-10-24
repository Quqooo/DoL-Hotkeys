import { isAvailable } from './actions';
import { installBuiltins } from './builtins';
import { checkDeclarations } from './decl';
import { install } from './engine';
import { currentLang, setLangOverride, t } from './i18n';
import { applyVolumeOverride, installVolumeKeys } from './mobile';
import { ensureTab, installTab, openPanel } from './panel';
import * as registry from './registry';
import { clashOf, labelOfReserved, warnOnRegister } from './vanilla';
import { getBind as storedBind, getConfig } from './settings';

let listenersInstalled = false;

function register(def: Parameters<typeof registry.register>[0]): boolean {
  const ok = registry.register(def);
  if (ok) {
    const bind = getBind(def.id);
    if (bind) warnOnRegister(def.id, bind);
  }
  return ok;
}

function drainQueue(): void {
  const queue = window.DoLHK_QUEUE;
  if (Array.isArray(queue)) {
    for (const def of queue.splice(0)) register(def as never);
  }
  window.DoLHK_QUEUE = { push: (def: unknown) => register(def as never) } as never;
}

function getBind(id: string): string[] | null {
  const stored = storedBind(id);
  if (stored) return stored;
  const entry = registry.get(id);
  return entry ? [...entry.defaultBind] : null;
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
  installTab();
  return true;
}

window.DoLHK = {
  api: 1,
  version: __DOLHK_VERSION__,
  register,
  unregister: registry.unregister,
  getBind,
  openPanel,
  lang: currentLang,
  get label(): string {
    return t().tab;
  },
  available: (id: string) => isAvailable(id as never),
  refreshTab: ensureTab,
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
