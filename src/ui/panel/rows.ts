import { cancelCapture, isCapturing, startCapture } from '../../runtime/capture';
import { bindHasDigit, bindKey, bindLabel, mouseButtonOf } from '../../core/keys';
import { bindOf, get as getEntry, isUsable, labelOf, list as listRegistry } from '../../data/registry';
import { getConfig, resetBind, setBind } from '../../core/settings';
import { clashOf, labelOfReserved } from '../../host/vanilla';
import { currentLang, t } from '../i18n';
import type { ActionId, Bind, RegisteredHotkey } from '../../core/types';
import { button, div, section, span } from './dom';

const BROWSER_RESERVED: Bind[] = [
  ['ControlLeft', 'KeyS'],
  ['ControlLeft', 'KeyW'],
  ['ControlLeft', 'KeyT'],
  ['ControlLeft', 'KeyN'],
  ['ControlLeft', 'KeyP'],
  ['ControlLeft', 'KeyF'],
  ['ControlLeft', 'KeyD'],
  ['ControlLeft', 'KeyL'],
  ['ControlLeft', 'KeyJ'],
  ['F5'],
  ['F11'],
  ['F12'],
  ['AltLeft', 'ArrowLeft'],
  ['AltLeft', 'ArrowRight'],
];

const warnSlots = new Map<string, HTMLElement>();

function setKeyText(target: HTMLButtonElement, bind: Bind): void {
  target.classList.toggle('dolhk-empty', bind.length === 0);
  target.textContent = bind.length ? bindLabel(bind) : t().empty;
}

const BROWSER_KEYS = new Set(BROWSER_RESERVED.map(bindKey));

/** 键位指纹 → 占用它的前两个条目 id；整批建立一次，避免逐行重复扫描 */
interface Occupancy {
  byKey: Map<string, string[]>;
}

function occupancyOf(): Occupancy {
  const byKey = new Map<string, string[]>();
  for (const entry of listRegistry()) {
    const key = bindKey(bindOf(entry.id));
    if (!key || key === '') continue;
    const list = byKey.get(key);
    if (!list) byKey.set(key, [entry.id]);
    else if (list.length < 2) list.push(entry.id);
  }
  return { byKey };
}

/** 取与自身不同的首个占用者：多数行只有一个占用者，命中即返回 */
function duplicateOf(occupancy: Occupancy, key: string, self: string): string | null {
  for (const id of occupancy.byKey.get(key) ?? []) {
    if (id !== self) return id;
  }
  return null;
}

function paintWarnings(id: string, bind: Bind, occupancy: Occupancy): void {
  const slot = warnSlots.get(id);
  if (!slot) return;
  if (bind.length === 0) {
    slot.textContent = '';
    return;
  }
  const s = t();
  const lang = currentLang();
  const messages: string[] = [];
  const key = bindKey(bind);
  const duplicateId = duplicateOf(occupancy, key, id);
  if (duplicateId) {
    const duplicate = getEntry(duplicateId);
    const mode = getConfig().conflictMode;
    const text = mode === 'all' ? s.warnDupAll : mode === 'first' ? s.warnDupFirst : s.warnDup;
    if (duplicate) messages.push(text(labelOf(duplicate, lang)));
  }
  if (bindHasDigit(bind)) messages.push(s.warnDigit);
  if (BROWSER_KEYS.has(key)) messages.push(s.warnBrowser);
  const side = mouseButtonOf(bind);
  if (side === 3 || side === 4) messages.push(s.warnSide);
  const reserved = clashOf(bind);
  if (reserved) messages.push(s.warnVanilla(labelOfReserved(reserved, lang)));
  slot.textContent = messages.join(' · ');
}

function beginCapture(id: string, target: HTMLButtonElement, repaint: () => void): void {
  if (isCapturing()) cancelCapture();
  const s = t();
  const original = [...bindOf(id)];
  target.classList.remove('dolhk-empty');
  target.classList.add('dolhk-capturing');
  target.textContent = s.pressCombo;

  let outsideHandler: ((ev: MouseEvent) => void) | null = null;
  const detachOutside = () => {
    if (!outsideHandler) return;
    document.removeEventListener('click', outsideHandler, true);
    outsideHandler = null;
  };

  startCapture(
    atoms => {
      target.textContent = atoms.length > 0 ? bindLabel(atoms) : s.pressCombo;
    },
    atoms => {
      detachOutside();
      target.classList.remove('dolhk-capturing');
      if (atoms === null) {
        setKeyText(target, original);
        return;
      }
      setBind(id, atoms);
      repaint();
    },
  );

  setTimeout(() => {
    outsideHandler = (ev: MouseEvent) => {
      if (target.contains(ev.target as Node)) return;
      cancelCapture();
    };
    document.addEventListener('click', outsideHandler, true);
  }, 0);
}

function sourceBadge(id: string): string | null {
  const dot = id.indexOf('.');
  return dot > 0 ? id.slice(0, dot) : null;
}

function buildRow(entry: RegisteredHotkey, repaint: () => void): HTMLElement {
  const s = t();
  const lang = currentLang();
  const row = div('settingsToggleItem dolhk-row');
  row.dataset.dolhk = entry.id;
  const column = div('dolhk-col');
  const head = div('dolhk-head');
  head.append(span('gold', labelOf(entry, lang)));
  const badge = entry.builtin ? null : sourceBadge(entry.id);
  if (badge) head.append(span('dolhk-badge', badge));

  const available = isUsable(entry);
  if (!available) head.append(span('dolhk-muted', s.unavailable));

  const warning = div('dolhk-warn');
  warnSlots.set(entry.id, warning);
  column.append(head, warning);

  const actions = div('dolhk-actions');
  const keyButton = button('dolhk-key', '');
  setKeyText(keyButton, bindOf(entry.id));
  keyButton.addEventListener('click', () => beginCapture(entry.id, keyButton, repaint));

  const resetButton = button('dolhk-reset', s.reset);
  resetButton.addEventListener('click', () => {
    if (entry.builtin) resetBind(entry.id as ActionId);
    else setBind(entry.id, [...entry.defaultBind]);
    repaint();
  });

  actions.append(keyButton, resetButton);
  row.append(column, actions);
  row.classList.toggle('dolhk-disabled', !available);
  return row;
}

export function buildSection(title: string, entries: RegisteredHotkey[], repaint: () => void): HTMLElement {
  const wrap = section(title);
  const grid = div('dolhk-list');
  for (const entry of entries) grid.append(buildRow(entry, repaint));
  wrap.append(grid);
  return wrap;
}

/** 行重建后补画告警：只遍历已建出的行，`warnSlots` 由本模块独占 */
export function repaintWarnings(): void {
  const occupancy = occupancyOf();
  for (const id of warnSlots.keys()) paintWarnings(id, bindOf(id), occupancy);
}

export function clearWarnings(): void {
  warnSlots.clear();
}
