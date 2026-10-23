import { runAction } from './actions';
import { gameVariables } from './game';
import { captureKeyDown, captureKeyUp, captureMouseDown, captureMouseUp, isCapturing } from './capture';
import {
  appendKey,
  isModifierCode,
  modsFromEvent,
  mouseStepEvent,
  sameMods,
  sameStep,
  splitStep,
  stepFromEvent,
  stepIsPrefixOf,
  type StepEvent,
} from './keys';
import { getConfig } from './settings';
import { ACTION_ORDER, type ActionId } from './types';

const STEP_TIMEOUT = 1000;
const NON_TEXT_INPUTS = new Set(['radio', 'button', 'checkbox', 'submit', 'reset', 'image', 'range', 'color', 'file']);

let pending: string[] = [];
let pendingAt = 0;
let held = new Set<string>();
const claimed = new Set<number>();

function shouldIgnore(): boolean {
  const variables = gameVariables();
  if (variables && variables.tempDisable) return true;
  const element = document.activeElement as HTMLElement | null;
  if (!element) return false;
  const tag = element.tagName;
  if (tag === 'INPUT') return !NON_TEXT_INPUTS.has((element as HTMLInputElement).type);
  if (tag === 'TEXTAREA' || tag === 'SELECT') return true;
  return element.isContentEditable === true;
}

function bindOf(action: ActionId): string[] {
  return getConfig().binds[action];
}

function matchExact(sequence: string[]): ActionId | null {
  for (const action of ACTION_ORDER) {
    const bind = bindOf(action);
    if (bind.length === sequence.length && bind.every((step, i) => sameStep(step, sequence[i]))) return action;
  }
  return null;
}

function matchesPrefix(sequence: string[]): boolean {
  for (const action of ACTION_ORDER) {
    const bind = bindOf(action);
    if (bind.length === 0 || sequence.length > bind.length) continue;
    const headOk = sequence.slice(0, -1).every((step, i) => sameStep(step, bind[i]));
    if (!headOk) continue;
    if (stepIsPrefixOf(sequence[sequence.length - 1], bind[sequence.length - 1])) return true;
  }
  return false;
}

function extend(sequence: string[], code: string): string[] {
  const out = sequence.slice();
  const last = out.length - 1;
  out[last] = appendKey(out[last], code);
  return out;
}

function canExtend(input: StepEvent): boolean {
  if (held.size === 0 || pending.length === 0) return false;
  const { mods } = splitStep(pending[pending.length - 1]);
  return sameMods(mods, modsFromEvent(input));
}

function handlePress(input: StepEvent, event: Event): boolean {
  if (pending.length > 0 && Date.now() - pendingAt > STEP_TIMEOUT) pending = [];

  const merging = canExtend(input);
  held.add(input.code);

  if (merging) {
    const merged = extend(pending, input.code);
    const mergedAction = matchExact(merged);
    if (mergedAction) {
      pending = [];
      event.preventDefault();
      runAction(mergedAction);
      return true;
    }
    if (matchesPrefix(merged)) {
      pending = merged;
      pendingAt = Date.now();
      event.preventDefault();
      return true;
    }
  }

  const sequence = [...pending, stepFromEvent(input)];
  const action = matchExact(sequence);
  if (action) {
    pending = [];
    event.preventDefault();
    runAction(action);
    return true;
  }
  if (matchesPrefix(sequence)) {
    pending = sequence;
    pendingAt = Date.now();
    event.preventDefault();
    return true;
  }
  pending = [];
  return false;
}

function onKeyDown(e: KeyboardEvent): void {
  if (isCapturing()) {
    if (captureKeyDown(e)) e.preventDefault();
    return;
  }
  if (e.repeat) return;
  if (isModifierCode(e.code)) return;
  if (shouldIgnore()) {
    pending = [];
    return;
  }
  handlePress(e, e);
}

function onKeyUp(e: KeyboardEvent): void {
  if (isCapturing() && captureKeyUp(e)) e.preventDefault();
  if (!isModifierCode(e.code)) held.delete(e.code);
}

function onMouseDown(e: MouseEvent): void {
  const input = mouseStepEvent(e);
  if (!input) return;
  if (isCapturing()) {
    if (captureMouseDown(e)) {
      e.preventDefault();
      claimed.add(e.button);
    }
    return;
  }
  if (shouldIgnore()) {
    pending = [];
    return;
  }
  if (handlePress(input, e)) {
    e.preventDefault();
    claimed.add(e.button);
  }
}

function onMouseUp(e: MouseEvent): void {
  const input = mouseStepEvent(e);
  if (!input) return;
  if (claimed.has(e.button)) e.preventDefault();
  if (isCapturing()) captureMouseUp(e);
  held.delete(input.code);
}

function onAuxClick(e: MouseEvent): void {
  if (!claimed.delete(e.button)) return;
  e.preventDefault();
  e.stopPropagation();
}

function resetPending(): void {
  pending = [];
  held.clear();
  claimed.clear();
}

export function install(): void {
  document.addEventListener('keydown', onKeyDown, true);
  document.addEventListener('keyup', onKeyUp, true);
  document.addEventListener('mousedown', onMouseDown, true);
  document.addEventListener('mouseup', onMouseUp, true);
  document.addEventListener('auxclick', onAuxClick, true);
  window.addEventListener('blur', resetPending);
  document.addEventListener('visibilitychange', resetPending);
}
