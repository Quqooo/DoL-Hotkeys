import { MAX_CHORD_ATOMS, mouseButtonOf } from '../core/keys';
import type { Bind } from '../core/types';

/** 组合静默超时（毫秒），超时后结束录制 */
const CAPTURE_IDLE = 1000;

type UpdateFn = (atoms: Bind) => void;
type FinishFn = (atoms: Bind | null) => void;

interface CaptureState {
  atoms: Bind;
  update: UpdateFn;
  finish: FinishFn;
  timer: ReturnType<typeof setTimeout> | null;
}

let active: CaptureState | null = null;
let held = new Set<string>();

export function isCapturing(): boolean {
  return active !== null;
}

function clearTimer(state: CaptureState): void {
  if (state.timer !== null) {
    clearTimeout(state.timer);
    state.timer = null;
  }
}

function finishWith(atoms: Bind | null): void {
  const state = active;
  if (!state) return;
  active = null;
  held.clear();
  clearTimer(state);
  state.finish(atoms);
}

function arm(state: CaptureState): void {
  clearTimer(state);
  if (state.atoms.length === 0) return;
  state.timer = setTimeout(() => finishWith([...state.atoms]), CAPTURE_IDLE);
}

export function startCapture(update: UpdateFn, finish: FinishFn): void {
  if (active) finishWith(null);
  active = { atoms: [], update, finish, timer: null };
  held.clear();
  update([]);
}

function press(code: string, repeat: boolean, hasModifier: boolean): boolean {
  const state = active;
  if (!state) return false;
  if (repeat) return true;

  if (code === 'Escape') {
    finishWith(null);
    return true;
  }

  const plainBackspace = code === 'Backspace' && !hasModifier;
  if (plainBackspace && state.atoms.length === 0) {
    finishWith([]);
    return true;
  }

  if (held.has(code)) return true;
  if (state.atoms.length >= MAX_CHORD_ATOMS) return true;
  if (state.atoms.includes(code)) return true;

  state.atoms.push(code);
  held.add(code);
  state.update([...state.atoms]);
  arm(state);
  return true;
}

function release(code: string): boolean {
  const state = active;
  if (!state) return false;
  held.delete(code);
  if (held.size === 0 && state.atoms.length > 0) finishWith([...state.atoms]);
  return true;
}

function hasModifierOf(e: KeyboardEvent | MouseEvent): boolean {
  return e.altKey || e.ctrlKey || e.shiftKey || e.metaKey;
}

export function captureKeyDown(e: KeyboardEvent): boolean {
  return press(e.code, e.repeat, hasModifierOf(e));
}

export function captureKeyUp(e: KeyboardEvent): boolean {
  return release(e.code);
}

export function captureMouseDown(e: MouseEvent): boolean {
  const code = `Mouse${e.button}`;
  if (mouseButtonOf([code]) === null) return false;
  return press(code, false, hasModifierOf(e));
}

export function captureMouseUp(e: MouseEvent): boolean {
  return release(`Mouse${e.button}`);
}

export function cancelCapture(): void {
  if (!active) return;
  finishWith(null);
}
