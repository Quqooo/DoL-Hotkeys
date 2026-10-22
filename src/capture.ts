import { isModifierCode, stepFromEvent } from './keys';
import { MAX_SEQUENCE_STEPS } from './settings';

type UpdateFn = (steps: string[]) => void;
type FinishFn = (steps: string[] | null) => void;

interface CaptureState {
  steps: string[];
  update: UpdateFn;
  finish: FinishFn;
}

let active: CaptureState | null = null;

export function isCapturing(): boolean {
  return active !== null;
}

export function startCapture(update: UpdateFn, finish: FinishFn): void {
  active = { steps: [], update, finish };
  update([]);
}

export function captureKeyDown(e: KeyboardEvent): boolean {
  if (!active) return false;
  if (isModifierCode(e.code)) return true;

  if (e.code === 'Escape') {
    const { finish } = active;
    active = null;
    finish(null);
    return true;
  }

  const plainBackspace = e.code === 'Backspace' && !e.ctrlKey && !e.altKey && !e.shiftKey && !e.metaKey;
  if (plainBackspace && active.steps.length === 0) {
    const { finish } = active;
    active = null;
    finish([]);
    return true;
  }

  if (e.repeat) return true;
  if (active.steps.length >= MAX_SEQUENCE_STEPS) return true;

  active.steps.push(stepFromEvent(e));
  active.update(active.steps.slice());
  return true;
}

export function captureKeyUp(e: KeyboardEvent): boolean {
  if (!active) return false;
  if (e.altKey || e.ctrlKey || e.shiftKey || e.metaKey) return true;
  if (active.steps.length === 0) return true;
  const { steps, finish } = active;
  active = null;
  finish(steps);
  return true;
}

export function cancelCapture(): void {
  if (!active) return;
  const { finish } = active;
  active = null;
  finish(null);
}
