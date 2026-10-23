import {
  appendKey,
  isModifierCode,
  modsFromEvent,
  mouseStepEvent,
  sameMods,
  splitStep,
  stepFromEvent,
  type StepEvent,
} from './keys';
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

function press(input: StepEvent, repeat: boolean): boolean {
  if (!active) return false;
  if (isModifierCode(input.code)) return true;
  if (repeat) return true;

  if (input.code === 'Escape') {
    const { finish } = active;
    active = null;
    held.clear();
    finish(null);
    return true;
  }

  const plainBackspace =
    input.code === 'Backspace' && !input.ctrlKey && !input.altKey && !input.shiftKey && !input.metaKey;
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
    if (sameMods(mods, modsFromEvent(input)) && codes.length < MAX_CHORD_KEYS) {
      active.steps[lastIndex] = appendKey(last, input.code);
      held.add(input.code);
      active.update(active.steps.slice());
      return true;
    }
  }

  if (active.steps.length >= MAX_SEQUENCE_STEPS) return true;

  active.steps.push(stepFromEvent(input));
  held.add(input.code);
  active.update(active.steps.slice());
  return true;
}

function release(code: string, modifierHeld: boolean): boolean {
  if (!active) return false;
  if (!isModifierCode(code)) held.delete(code);
  if (modifierHeld) return true;
  if (held.size > 0) return true;
  if (active.steps.length === 0) return true;
  const { steps, finish } = active;
  active = null;
  held.clear();
  finish(steps);
  return true;
}

export function captureKeyDown(e: KeyboardEvent): boolean {
  return press(e, e.repeat);
}

export function captureKeyUp(e: KeyboardEvent): boolean {
  return release(e.code, e.altKey || e.ctrlKey || e.shiftKey || e.metaKey);
}

export function captureMouseDown(e: MouseEvent): boolean {
  const input = mouseStepEvent(e);
  return input ? press(input, false) : false;
}

export function captureMouseUp(e: MouseEvent): boolean {
  const input = mouseStepEvent(e);
  if (!input) return false;
  return release(input.code, input.altKey || input.ctrlKey || input.shiftKey || input.metaKey);
}

export function cancelCapture(): void {
  if (!active) return;
  const { finish } = active;
  active = null;
  held.clear();
  finish(null);
}
