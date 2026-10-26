import { bindHasDigit, bindKey, mouseButtonOf } from '../../core/keys';
import { bindOf, get as getEntry, labelOf, list as listRegistry, tipOf } from '../../data/registry';
import { getConfig } from '../../core/settings';
import { clashOf, labelOfReserved } from '../../host/vanilla';
import { currentLang, t } from '../i18n';
import type { Bind, RegisteredHotkey } from '../../core/types';
import { div, hint, section, span } from './dom';
import { createBindControl } from './control';
import { foldHandlers } from './fold';

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

function messagesFor(id: string, bind: Bind, occupancy: Occupancy): string[] {
  if (bind.length === 0) return [];
  const s = t();
  const lang = currentLang();
  const messages: string[] = [];
  const key = bindKey(bind);
  const duplicateId = duplicateOf(occupancy, key, id);
  if (duplicateId) {
    const duplicate = getEntry(duplicateId);
    const mode = getConfig().conflictMode;
    const text = mode === 'all' ? s.warnDupAll : s.warnDupFirst;
    if (duplicate) messages.push(text(labelOf(duplicate, lang)));
  }
  if (bindHasDigit(bind)) messages.push(s.warnDigit);
  if (BROWSER_KEYS.has(key)) messages.push(s.warnBrowser);
  const side = mouseButtonOf(bind);
  if (side === 3 || side === 4) messages.push(s.warnSide);
  const reserved = clashOf(bind);
  if (reserved) messages.push(s.warnVanilla(labelOfReserved(reserved, lang)));
  return messages;
}

/** 供第三方界面自行显示：该键位当前的提示文本，没有提示或未注册时返回空串 */
export function warnOf(id: string): string {
  if (!getEntry(id)) return '';
  return messagesFor(id, bindOf(id), occupancyOf()).join(' · ');
}

function paintWarnings(id: string, bind: Bind, occupancy: Occupancy): void {
  const slot = warnSlots.get(id);
  if (!slot) return;
  slot.textContent = messagesFor(id, bind, occupancy).join(' · ');
}

function sourceBadge(id: string): string | null {
  const dot = id.indexOf('.');
  return dot > 0 ? id.slice(0, dot) : null;
}

function buildRow(entry: RegisteredHotkey, repaint: () => void): HTMLElement {
  const lang = currentLang();
  const row = div('settingsToggleItem dolhk-row');
  row.dataset.dolhk = entry.id;
  const column = div('dolhk-col');
  const head = div('dolhk-head');
  head.append(span('gold', labelOf(entry, lang)));
  const tip = tipOf(entry, lang);
  if (tip) head.append(hint(tip));
  const badge = entry.builtin ? null : sourceBadge(entry.id);
  if (badge) head.append(span('dolhk-badge', badge));

  const warning = div('dolhk-warn');
  warnSlots.set(entry.id, warning);
  column.append(head, warning);

  const actions = createBindControl(entry.id, { onChange: () => repaint() });
  row.append(column, actions ?? div('dolhk-actions'));
  return row;
}

export function buildSection(
  title: string,
  entries: RegisteredHotkey[],
  repaint: () => void,
  foldKey: string,
): HTMLElement {
  const wrap = section(title, foldHandlers(foldKey));
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
