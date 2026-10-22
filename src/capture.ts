import { appendKey, isModifierCode, modsFromEvent, sameMods, splitStep, stepFromEvent } from './keys';
import { MAX_SEQUENCE_STEPS } from './settings';

const MAX_CHORD_KEYS = 8;

type UpdateFn = (steps: string[]) => void;
type FinishFn = (steps: string[] | null) => void;

interface CaptureState {
  steps: string[];
  update: UpdateFn;
  finish: FinishFn;
}

let active: CaptureState | null = null;
let held = new Set<string>();

export function isCapturing(): boolean {
  return active !== null;
}

export function startCapture(update: UpdateFn, finish: FinishFn): void {
  active = { steps: [], update, finish };
  held.clear();
  update([]);
}

export function captureKeyDown(e: KeyboardEvent): boolean {
  if (!active) return false;
  if (isModifierCode(e.code)) return true;
  if (e.repeat) return true;

  if (e.code === 'Escape') {
    const { finish } = active;
    active = null;
    held.clear();
    finish(null);
    return true;
  }

  const plainBackspace = e.code === 'Backspace' && !e.ctrlKey && !e.altKey && !e.shiftKey && !e.metaKey;
  if (plainBackspace && active.steps.length === 0) {
    const { finish } = active;
    active = null;
    held.clear();
    finish([]);
    return true;
  }

  const lastIndex = active.steps.length - 1;
  if (lastIndex >= 0 && held.size > 0) {
    const last = active.steps[lastIndex];
    const { mods, codes } = splitStep(last);
    if (sameMods(mods, modsFromEvent(e)) && codes.length < MAX_CHORD_KEYS) {
      active.steps[lastIndex] = appendKey(last, e.code);
      held.add(e.code);
      active.update(active.steps.slice());
      return true;
    }
  }

  if (active.steps.length >= MAX_SEQUENCE_STEPS) return true;

  active.steps.push(stepFromEvent(e));
  held.add(e.code);
  active.update(active.steps.slice());
  return true;
}

export function captureKeyUp(e: KeyboardEvent): boolean {
  if (!active) return false;
  if (!isModifierCode(e.code)) held.delete(e.code);
  if (e.altKey || e.ctrlKey || e.shiftKey || e.metaKey) return true;
  if (held.size > 0) return true;
  if (active.steps.length === 0) return true;
  const { steps, finish } = active;
  active = null;
  held.clear();
  finish(steps);
  return true;
}

export function cancelCapture(): void {
  if (!active) return;
  const { finish } = active;
  active = null;
  held.clear();
  finish(null);
}
