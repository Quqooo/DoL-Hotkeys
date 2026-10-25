import { isCapturing } from '../../runtime/capture';
import { currentLang, invalidateLang, t } from '../i18n';
import { groupIdOf, groupLabelOf, list as listRegistry, subscribe as subscribeRegistry } from '../../data/registry';
import { getConfig } from '../../core/settings';
import { ACTION_ORDER, type RegisteredHotkey } from '../../core/types';
import { div, section } from './dom';
import { COMMON_KEY, ORIGINAL_KEY, SETTINGS_KEY, foldHandlers, groupKey } from './fold';
import { buildOriginal, paintOriginal, type OriginalView } from './original';
import { buildSection, clearWarnings, repaintWarnings } from './rows';
import { buildConflict, buildLanguage, buildVolume } from './settings';
import { ensureTab, installTab, updateTabLabel } from './tab';

export { ensureTab, openPanel } from './tab';

let rootEl: HTMLElement | null = null;
let listEl: HTMLElement | null = null;
let originalView: OriginalView | null = null;
let panelInstalled = false;

const WIDE_MIN = 620;

function applyWidth(): void {
  if (!rootEl) return;
  const host = document.getElementById('customOverlayContent') ?? rootEl.parentElement;
  const width = host?.clientWidth ?? window.innerWidth;
  rootEl.classList.toggle('dolhk-wide', width >= WIDE_MIN);
}

/** 内置项按 ACTION_ORDER 排在前面，其余按分组 id 归拢 */
function groupEntries(entries: RegisteredHotkey[]) {
  const builtins = ACTION_ORDER.map(id => entries.find(entry => entry.id === id)).filter(
    (entry): entry is RegisteredHotkey => Boolean(entry),
  );
  const groups = new Map<string | null, RegisteredHotkey[]>();
  for (const entry of entries) {
    if (entry.builtin) continue;
    const id = groupIdOf(entry);
    const bucket = groups.get(id);
    if (bucket) bucket.push(entry);
    else groups.set(id, [entry]);
  }
  return { builtins, groups };
}

function paintRows(): void {
  if (!listEl) return;
  listEl.textContent = '';
  clearWarnings();

  const s = t();
  const all = listRegistry();
  const { builtins, groups } = groupEntries(all);
  const lang = currentLang();

  const common = [...builtins, ...(groups.get(null) ?? [])];
  if (common.length) listEl.append(buildSection(s.mine, common, paintRows, COMMON_KEY));

  // 组顺序与注册顺序无关：按组 id 升序，保证同一份注册表在任何加载顺序下排版一致
  const ids = [...groups.keys()]
    .filter((id): id is string => id !== null)
    .sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
  for (const id of ids) {
    listEl.append(buildSection(groupLabelOf(id, lang), groups.get(id) ?? [], paintRows, groupKey(id)));
  }

  repaintWarnings();
}

function build(): HTMLElement {
  invalidateLang();
  const s = t();
  const config = getConfig();
  const root = div('dolhk');

  listEl = div('dolhk-sections');
  root.append(listEl);

  const original = section(s.original, foldHandlers(ORIGINAL_KEY));
  originalView = buildOriginal();
  original.append(originalView.body, originalView.tools);
  root.append(original);

  const other = section(s.other, foldHandlers(SETTINGS_KEY));
  other.append(buildLanguage(config, remount), buildVolume(config), buildConflict(config, paintRows));
  root.append(other);

  paintRows();
  paintOriginal(originalView);
  rootEl = root;
  applyWidth();
  updateTabLabel();
  return root;
}

function remount(): void {
  const previous = rootEl;
  const fresh = build();
  if (previous && previous.parentNode) previous.parentNode.replaceChild(fresh, previous);
}

export function renderPanel(): HTMLElement {
  return build();
}

/** 装配分页与内容：分页生命周期在 tab.ts，内容构建在本文件 */
export function installPanel(): void {
  if (!panelInstalled) {
    installTab(renderPanel);
    window.addEventListener('resize', applyWidth);
    panelInstalled = true;
  }
  ensureTab();
}

subscribeRegistry(() => {
  if (isCapturing()) return;
  if (listEl?.isConnected) paintRows();
});
