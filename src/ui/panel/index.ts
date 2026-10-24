import { isCapturing } from '../../runtime/capture';
import { stateTemp } from '../../host/game';
import { currentLang, invalidateLang, t } from '../i18n';
import { groupOf, list as listRegistry, subscribe as subscribeRegistry } from '../../data/registry';
import { getConfig } from '../../core/settings';
import { ACTION_ORDER, type RegisteredHotkey } from '../../core/types';
import { div, section } from './dom';
import { buildOriginal, paintOriginal, type OriginalView } from './original';
import { buildSection, clearWarnings, repaintWarnings } from './rows';
import { buildConflict, buildLanguage, buildVolume } from './settings';

let rootEl: HTMLElement | null = null;
let listEl: HTMLElement | null = null;
let originalView: OriginalView | null = null;

let tabEl: HTMLButtonElement | null = null;
let tabBar: HTMLElement | null = null;
let tabObserver: MutationObserver | null = null;
let pendingScan = false;

function refreshTabCollection(): void {
  const api = stateTemp()?.tab;
  if (!api || !window.jQuery) return;
  api.tabs = window.jQuery('#overlayTabs').find('button');
}

function activateTab(): void {
  const content = document.getElementById('customOverlayContent');
  if (!tabBar || !content || !tabEl) return;
  const buttons = [...tabBar.querySelectorAll('button')];
  for (const node of buttons) node.classList.toggle('tab-selected', node === tabEl);
  const api = stateTemp()?.tab;
  if (api) {
    refreshTabCollection();
    api.activeTab = buttons.indexOf(tabEl);
  }
  content.textContent = '';
  content.appendChild(renderPanel());
  content.scrollTop = 0;
  window.jQuery?.(content).scrollTop(0);
}

function onDocumentClick(event: MouseEvent): void {
  if (!tabEl) return;
  const target = event.target as Element | null;
  if (!target || tabEl.contains(target)) return;
  const bar = tabEl.parentElement;
  if (!bar || !bar.contains(target)) return;
  if (!target.closest('button')) return;
  tabEl.classList.remove('tab-selected');
}

function updateTabLabel(): void {
  if (!tabEl) return;
  const label = t().tab;
  if (tabEl.textContent !== label) tabEl.textContent = label;
}

export function ensureTab(): void {
  const bar = document.getElementById('overlayTabs');
  const key = document.getElementById('customOverlay')?.getAttribute('data-overlay') ?? '';
  if (!bar || key !== 'options') {
    tabEl = null;
    tabBar = null;
    return;
  }
  if (bar !== tabBar) {
    tabBar = bar;
    invalidateLang();
  }
  const existing = bar.querySelector<HTMLButtonElement>('button[data-dolhk-tab]');
  if (existing) {
    tabEl = existing;
    updateTabLabel();
    return;
  }
  const button = document.createElement('button');
  button.type = 'button';
  button.dataset.dolhkTab = '1';
  button.textContent = t().tab;
  button.addEventListener('click', activateTab);
  bar.appendChild(button);
  tabEl = button;
  refreshTabCollection();
}

const WIDE_MIN = 620;

function applyWidth(): void {
  if (!rootEl) return;
  const host = document.getElementById('customOverlayContent') ?? rootEl.parentElement;
  const width = host?.clientWidth ?? window.innerWidth;
  rootEl.classList.toggle('dolhk-wide', width >= WIDE_MIN);
}

export function installTab(): void {
  if (!tabObserver) {
    tabObserver = new MutationObserver(() => {
      if (pendingScan) return;
      pendingScan = true;
      setTimeout(() => {
        pendingScan = false;
        ensureTab();
      }, 0);
    });
    tabObserver.observe(document.body, { childList: true, subtree: true });
    document.addEventListener('click', onDocumentClick, true);
    window.addEventListener('resize', applyWidth);
  }
  ensureTab();
}

/** 打开设置覆盖层并切到本模组分页 */
export function openPanel(): void {
  const overlay = document.getElementById('customOverlay');
  if (overlay?.getAttribute('data-overlay') !== 'options') {
    window.wikifier?.('overlayReplace', '"options"');
  }
  let attempts = 0;
  const focus = (): void => {
    ensureTab();
    const tab = document.querySelector<HTMLButtonElement>('#overlayTabs button[data-dolhk-tab]');
    if (tab) {
      tab.click();
      return;
    }
    attempts++;
    if (attempts < 20) setTimeout(focus, 50);
  };
  focus();
}

function paintRows(): void {
  if (!listEl) return;
  listEl.textContent = '';
  clearWarnings();

  const s = t();
  const lang = currentLang();
  const all = listRegistry();
  const builtins = ACTION_ORDER.map(id => all.find(entry => entry.id === id)).filter(
    (entry): entry is RegisteredHotkey => Boolean(entry),
  );
  const external = all.filter(entry => !entry.builtin);

  const groups = new Map<string | null, RegisteredHotkey[]>();
  for (const entry of external) {
    const name = groupOf(entry, lang);
    const bucket = groups.get(name);
    if (bucket) bucket.push(entry);
    else groups.set(name, [entry]);
  }

  const common = [...builtins, ...(groups.get(null) ?? [])];
  if (common.length) listEl.append(buildSection(s.mine, common, paintRows));

  for (const [name, entries] of groups) {
    if (name === null) continue;
    listEl.append(buildSection(name, entries, paintRows));
  }

  repaintWarnings(all.map(entry => entry.id));
}

function build(): HTMLElement {
  invalidateLang();
  const s = t();
  const config = getConfig();
  const root = div('dolhk');

  listEl = div('dolhk-sections');
  root.append(listEl);

  const original = section(s.original);
  originalView = buildOriginal();
  original.append(originalView.body, originalView.tools);
  root.append(original);

  const other = section(s.other);
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

subscribeRegistry(() => {
  if (isCapturing()) return;
  if (listEl?.isConnected) paintRows();
});
