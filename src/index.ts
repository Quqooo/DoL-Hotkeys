import { isAvailable } from './actions';
import { install } from './engine';
import { setLangOverride, t } from './i18n';
import { applyVolumeOverride, installVolumeKeys } from './mobile';
import { ensureTab, installTab } from './panel';
import { getConfig } from './settings';

let listenersInstalled = false;

function overlayHost(): HTMLElement | null {
  return document.getElementById('customOverlay') ?? document.getElementById('customOverlayTitle');
}

function init(): boolean {
  if (!document.body) return false;
  const config = getConfig();
  setLangOverride(config.lang);
  if (!listenersInstalled) {
    install();
    // Registering a volume listener makes cordova override the keys by itself,
    // so the stored setting has to be re-applied right after, even when off.
    installVolumeKeys();
    applyVolumeOverride(config.volumeKeys);
    listenersInstalled = true;
  }
  if (!overlayHost()) return false;
  installTab();
  return true;
}

window.DoLHK = {
  get label(): string {
    return t().tab;
  },
  available: (id: string) => isAvailable(id as never),
  refreshTab: ensureTab,
};

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
