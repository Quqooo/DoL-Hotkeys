import { runAction } from './actions';
import { getConfig } from './settings';

export function hasCordova(): boolean {
  const cordova = window.cordova;
  return Boolean(cordova && typeof cordova.exec === 'function');
}

export function applyVolumeOverride(enabled: boolean): boolean {
  if (!hasCordova()) return false;
  try {
    const cordova = window.cordova;
    cordova.exec(null, null, 'CoreAndroid', 'overrideButton', ['volumeup', enabled]);
    cordova.exec(null, null, 'CoreAndroid', 'overrideButton', ['volumedown', enabled]);
    return true;
  } catch (error) {
    console.warn('[dol-hotkeys] volume override failed:', error);
    return false;
  }
}

export function installVolumeKeys(): void {
  if (!hasCordova()) return;
  const step = (forward: boolean) => {
    const invert = getConfig().volumeInvert;
    runAction(forward !== invert ? 'forward' : 'back');
  };
  document.addEventListener('volumeupbutton', () => step(false));
  document.addEventListener('volumedownbutton', () => step(true));
}
