import { currentPassage, engine, gameVariables, stateTemp, wikifyEval } from './game';
import { OVERLAY_OF, type ActionId } from './types';

export function inGame(): boolean {
  const variables = gameVariables();
  if (variables && typeof variables.intro === 'number') return variables.intro === 0;
  const passage = currentPassage();
  return passage !== '' && passage !== 'Start';
}

function cheatButtonPresent(): boolean {
  const bar = document.getElementById('overlayButtons');
  if (!bar) return false;
  const splits = [...bar.querySelectorAll('.sidebarButtonSplit')];
  if (splits.length < 2) return false;
  const tail = splits[splits.length - 1];
  if (tail.querySelectorAll('button').length !== 2) return false;
  return splits[splits.length - 2].querySelectorAll('button').length > 0;
}

function cheatsToggledOn(variables: any): boolean {
  if (typeof variables.cheatsEnabled === 'boolean') return variables.cheatsEnabled;
  if (typeof variables.cheatdisable === 'string') return variables.cheatdisable === 'f';
  return false;
}

export function cheatsAvailable(): boolean {
  if (!inGame()) return false;
  const variables = gameVariables();
  if (!variables) return false;
  if (variables.debug === 1) return true;
  if ((variables.dancing ?? 0) === 0 && (variables.combat ?? 0) === 0 && cheatsToggledOn(variables)) return true;
  return cheatButtonPresent();
}

export function isAvailable(id: ActionId): boolean {
  if (id === 'cheats') return cheatsAvailable();
  if (id === 'characteristics' || id === 'social' || id === 'traits' || id === 'journal' || id === 'statistics') {
    return inGame();
  }
  return true;
}

function overlayKeyOf(id: ActionId): string {
  if (id === 'feats') return inGame() ? 'gameFeats' : 'startFeats';
  return OVERLAY_OF[id] ?? '';
}

function closeIfOpen(): void {
  const temp = stateTemp();
  if (!temp || !temp.currentOverlay) return;
  if (typeof window.closeOverlay === 'function') window.closeOverlay();
}

function withSafeTabs(run: () => void): void {
  const proto = (window as any).Tab?.prototype;
  const original = proto?.toggle;
  if (typeof original !== 'function') {
    run();
    return;
  }
  proto.toggle = function patchedToggle(this: unknown, target?: unknown) {
    try {
      return original.call(this, target);
    } catch {
      return undefined;
    }
  };
  try {
    run();
  } finally {
    proto.toggle = original;
  }
}

function toggleOverlay(id: ActionId): void {
  const key = overlayKeyOf(id);
  if (!key) return;
  const temp = stateTemp();
  if (temp && temp.currentOverlay === key) {
    if (typeof window.closeOverlay === 'function') window.closeOverlay();
    return;
  }
  withSafeTabs(() => {
    if (typeof window.wikifier === 'function') window.wikifier('overlayReplace', `"${key}"`);
    else wikifyEval(`<<overlayReplace "${key}">>`);
  });
  if (temp) temp.currentOverlay = key;
  window.jQuery?.('#customOverlay').attr('data-overlay', key);
}

function navigate(direction: -1 | 1): void {
  closeIfOpen();
  const api = engine();
  if (!api) return;
  if (direction === -1) api.backward();
  else api.forward();
}

export function runAction(id: ActionId): void {
  try {
    if (!isAvailable(id)) return;
    if (id === 'back') navigate(-1);
    else if (id === 'forward') navigate(1);
    else toggleOverlay(id);
  } catch (error) {
    console.warn('[dol-hotkeys] action failed:', id, error);
  }
}
