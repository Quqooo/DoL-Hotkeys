import {
  captureKeyDown,
  captureKeyUp,
  captureMouseDown,
  captureMouseUp,
  isCapturing,
} from './capture';
import { dispatch } from './dispatch';
import { gameVariables } from '../host/game';
import { isMouseAtom, modifierFamily, mouseAtomPressed } from '../core/keys';
import type { Bind } from '../core/types';

const NON_TEXT_INPUTS = new Set(['radio', 'button', 'checkbox', 'submit', 'reset', 'image', 'range', 'color', 'file']);

/** 当前按下的原子，按按下顺序排列，直接作为匹配依据 */
let held: Bind = [];
const claimed = new Set<number>();

/** tempDisable 是不可覆盖的硬守卫 */
function hardBlocked(): boolean {
  const variables = gameVariables();
  return Boolean(variables && variables.tempDisable);
}

/** 输入框内默认不派发，仅 inInput 的条目可候选 */
function inputBlocked(): boolean {
  const element = document.activeElement as HTMLElement | null;
  if (!element) return false;
  const tag = element.tagName;
  if (tag === 'INPUT') return !NON_TEXT_INPUTS.has((element as HTMLInputElement).type);
  if (tag === 'TEXTAREA' || tag === 'SELECT') return true;
  return element.isContentEditable === true;
}

function resetHeld(): void {
  held = [];
  claimed.clear();
}

function removeAtom(code: string): void {
  const index = held.indexOf(code);
  if (index >= 0) held.splice(index, 1);
}

/** 依据 buttons 掩码校正鼠标原子：覆盖层替换 DOM 时 mouseup 可能丢失，残留原子会导致后续组合无法匹配 */
function trimMouseAtoms(mask: number): void {
  held = held.filter(atom => mouseAtomPressed(atom, mask));
}

/** 依据修饰键标志校正修饰原子，处理丢失的 keyup */
function trimModifiers(e: KeyboardEvent): void {
  held = held.filter(atom => {
    const family = modifierFamily(atom);
    if (!family) return true;
    if (family === 'Control') return e.ctrlKey;
    if (family === 'Shift') return e.shiftKey;
    if (family === 'Alt') return e.altKey;
    return e.metaKey;
  });
}

function pressAtom(code: string, event: Event): boolean {
  if (!held.includes(code)) held.push(code);
  const hit = dispatch(held, event, inputBlocked());
  if (!hit) return false;
  event.preventDefault();
  return true;
}

function onKeyDown(e: KeyboardEvent): void {
  // 输入法组字期间的按键不属于热键
  if (e.isComposing) return;
  if (isCapturing()) {
    if (captureKeyDown(e)) e.preventDefault();
    return;
  }
  if (e.repeat) return;
  if (hardBlocked()) {
    resetHeld();
    return;
  }
  trimModifiers(e);
  pressAtom(e.code, e);
}

function onKeyUp(e: KeyboardEvent): void {
  if (isCapturing()) captureKeyUp(e);
  removeAtom(e.code);
  trimModifiers(e);
}

function onMouseDown(e: MouseEvent): void {
  const code = `Mouse${e.button}`;
  if (!isMouseAtom(code)) return;
  if (isCapturing()) {
    if (captureMouseDown(e)) {
      e.preventDefault();
      claimed.add(e.button);
    }
    return;
  }
  if (hardBlocked()) {
    resetHeld();
    return;
  }
  trimMouseAtoms(e.buttons);
  if (pressAtom(code, e)) claimed.add(e.button);
}

function onMouseUp(e: MouseEvent): void {
  const code = `Mouse${e.button}`;
  if (!isMouseAtom(code)) return;
  if (claimed.has(e.button)) e.preventDefault();
  if (isCapturing()) captureMouseUp(e);
  removeAtom(code);
  trimMouseAtoms(e.buttons);
}

function onAuxClick(e: MouseEvent): void {
  if (!claimed.delete(e.button)) return;
  e.preventDefault();
  e.stopPropagation();
}

export function install(): void {
  document.addEventListener('keydown', onKeyDown, true);
  document.addEventListener('keyup', onKeyUp, true);
  document.addEventListener('mousedown', onMouseDown, true);
  document.addEventListener('mouseup', onMouseUp, true);
  document.addEventListener('auxclick', onAuxClick, true);
  window.addEventListener('blur', resetHeld);
  document.addEventListener('visibilitychange', resetHeld);
}
