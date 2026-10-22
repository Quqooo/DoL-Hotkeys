import { cancelCapture, isCapturing, startCapture } from './capture';
import { detect } from './detect';
import { stateTemp } from './game';
import { invalidateLang, setLangOverride, t } from './i18n';
import { formatSequence, isDigitStep, sameSequence, sameStep } from './keys';
import { applyVolumeOverride, hasCordova } from './mobile';
import { getConfig, resetBind, saveConfig, setBind } from './settings';
import { ACTION_ORDER, type ActionId, type LangMode, type OrigEntry } from './types';

const BROWSER_RESERVED = [
  'Ctrl+KeyS',
  'Ctrl+KeyW',
  'Ctrl+KeyT',
  'Ctrl+KeyN',
  'Ctrl+KeyP',
  'Ctrl+KeyF',
  'Ctrl+KeyD',
  'Ctrl+KeyL',
  'Ctrl+KeyJ',
  'F5',
  'F11',
  'F12',
  'Alt+ArrowLeft',
  'Alt+ArrowRight',
];

let rootEl: HTMLElement | null = null;
let listEl: HTMLElement | null = null;
let sourceEl: HTMLElement | null = null;
let originalEl: HTMLElement | null = null;
const warnSlots = new Map<ActionId, HTMLElement>();

function div(className: string, text?: string): HTMLDivElement {
  const node = document.createElement('div');
  node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function span(className: string, text?: string): HTMLSpanElement {
  const node = document.createElement('span');
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function button(className: string, text: string): HTMLButtonElement {
  const node = document.createElement('button');
  node.type = 'button';
  node.className = className;
  node.textContent = text;
  return node;
}

function section(title: string): HTMLDivElement {
  const wrap = div('settingsGrid');
  wrap.append(div('settingsHeader options', title));
  return wrap;
}

function describe(entry: OrigEntry): string {
  const s = t();
  switch (entry.kind) {
    case 'links': {
      const from = (entry.offset ?? 0) + 1;
      return s.orig.links(from, from + 9);
    }
    case 'history':
      return entry.dir === -1 ? s.orig.back(entry.steps ?? 1) : s.orig.forward(entry.steps ?? 1);
    case 'reroll':
      return s.orig.reroll;
    case 'dialog':
      return s.orig.dialog;
    case 'continue':
      return s.orig.cont;
    case 'modloader':
      return s.orig.modloader;
    default:
      return s.orig.unknown;
  }
}

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

function setKeyText(target: HTMLButtonElement, steps: string[]): void {
  target.classList.toggle('dolhk-empty', steps.length === 0);
  target.textContent = steps.length ? formatSequence(steps) : t().empty;
}

function paintWarnings(action: ActionId): void {
  const slot = warnSlots.get(action);
  if (!slot) return;
  const s = t();
  const config = getConfig();
  const steps = config.binds[action];
  if (steps.length === 0) {
    slot.textContent = '';
    return;
  }
  const messages: string[] = [];
  const earlier = ACTION_ORDER.slice(0, ACTION_ORDER.indexOf(action));
  const duplicate = earlier.find(other => sameSequence(config.binds[other], steps));
  if (duplicate) messages.push(s.warnDup(s.names[duplicate]));
  if (steps.some(isDigitStep)) messages.push(s.warnDigit);
  if (steps.some(step => BROWSER_RESERVED.some(reserved => sameStep(reserved, step)))) messages.push(s.warnBrowser);
  if (steps.some(step => sameStep('Alt+KeyM', step))) messages.push(s.warnModLoader);
  slot.textContent = messages.join(' · ');
}

function beginCapture(action: ActionId, target: HTMLButtonElement): void {
  if (isCapturing()) cancelCapture();
  const s = t();
  const original = [...getConfig().binds[action]];
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
    steps => {
      target.textContent = steps.length > 0 ? formatSequence(steps) : s.pressCombo;
    },
    steps => {
      detachOutside();
      target.classList.remove('dolhk-capturing');
      if (steps === null) {
        setKeyText(target, original);
        return;
      }
      setBind(action, steps);
      paintRows();
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

function buildRow(action: ActionId): HTMLElement {
  const s = t();
  const row = div('settingsToggleItem dolhk-row');
  row.dataset.dolhk = action;
  const column = div('dolhk-col');
  const warning = div('dolhk-warn');
  warnSlots.set(action, warning);
  column.append(span('gold', s.names[action]), warning);

  const actions = div('dolhk-actions');
  const keyButton = button('dolhk-key', '');
  setKeyText(keyButton, getConfig().binds[action]);
  keyButton.addEventListener('click', () => beginCapture(action, keyButton));

  const resetButton = button('dolhk-reset', s.reset);
  resetButton.addEventListener('click', () => {
    resetBind(action);
    paintRows();
  });

  actions.append(keyButton, resetButton);
  row.append(column, actions);
  return row;
}

function paintRows(): void {
  if (!listEl) return;
  listEl.textContent = '';
  warnSlots.clear();
  for (const action of ACTION_ORDER) listEl.append(buildRow(action));
  for (const action of ACTION_ORDER) paintWarnings(action);
}

function paintOriginal(): void {
  if (!originalEl || !sourceEl) return;
  const result = detect();
  const s = t();
  originalEl.textContent = '';
  for (const entry of result.entries) {
    const row = div('dolhk-orig-row');
    const left = span('dolhk-orig-key', entry.keys);
    const right = span('dolhk-orig-desc', describe(entry));
    if (!entry.detected) right.append(span('dolhk-muted', ` · ${s.srcSnapshot}`));
    row.append(left, right);
    originalEl.append(row);
  }
  if (result.fullyDetected) sourceEl.textContent = s.srcDynamic;
  else if (result.partiallyDetected) sourceEl.textContent = s.srcMixed;
  else sourceEl.textContent = s.srcSnapshot;
}

function buildLanguage(config: ReturnType<typeof getConfig>): HTMLElement {
  const s = t();
  const item = div('settingsToggleItem dolhk-row');
  const select = document.createElement('select');
  select.className = 'dolhk-select';
  const options: Array<[LangMode, string]> = [
    ['auto', s.langAuto],
    ['zh', s.langZh],
    ['en', s.langEn],
  ];
  for (const [value, label] of options) {
    const option = document.createElement('option');
    option.value = value;
    option.textContent = label;
    select.append(option);
  }
  select.value = config.lang;
  select.addEventListener('change', () => {
    const lang = select.value as LangMode;
    config.lang = lang;
    saveConfig();
    setLangOverride(lang);
    remount();
  });
  item.append(span('gold', s.lang), select);
  return item;
}

function buildVolume(config: ReturnType<typeof getConfig>): HTMLElement {
  const s = t();
  const supported = hasCordova();
  const item = div('settingsToggleItem dolhk-row');
  const column = div('dolhk-col');
  const label = document.createElement('label');
  const checkbox = document.createElement('input');
  checkbox.type = 'checkbox';
  checkbox.checked = config.volumeKeys;
  checkbox.disabled = !supported;
  checkbox.addEventListener('change', () => {
    if (checkbox.checked && !window.confirm(s.volumeConfirm)) {
      checkbox.checked = false;
      return;
    }
    config.volumeKeys = checkbox.checked;
    saveConfig();
    if (supported) applyVolumeOverride(checkbox.checked);
  });
  label.append(checkbox, document.createTextNode(` ${s.volume}`));
  column.append(label, span('dolhk-muted', supported ? s.volumeOn : s.volumeUnsupported));

  const invertLabel = document.createElement('label');
  invertLabel.className = 'dolhk-invert';
  const invert = document.createElement('input');
  invert.type = 'checkbox';
  invert.checked = config.volumeInvert;
  invert.disabled = !supported;
  invert.addEventListener('change', () => {
    config.volumeInvert = invert.checked;
    saveConfig();
  });
  invertLabel.append(invert, document.createTextNode(` ${s.volumeInvert}`));

  item.append(column, invertLabel);
  return item;
}

const WIDE_MIN = 620;

function applyWidth(): void {
  if (!rootEl) return;
  const host = document.getElementById('customOverlayContent') ?? rootEl.parentElement;
  const width = host?.clientWidth ?? window.innerWidth;
  rootEl.classList.toggle('dolhk-wide', width >= WIDE_MIN);
}

function build(): HTMLElement {
  invalidateLang();
  const s = t();
  const config = getConfig();
  const root = div('dolhk');

  const mine = section(s.mine);
  listEl = div('dolhk-list');
  mine.append(listEl);
  root.append(mine);

  const original = section(s.original);
  originalEl = div('dolhk-orig');
  sourceEl = span('dolhk-muted', '');
  const tools = div('dolhk-tools');
  const redetect = button('dolhk-btn', s.redetect);
  redetect.addEventListener('click', paintOriginal);
  tools.append(sourceEl, redetect);
  original.append(originalEl, tools);
  root.append(original);

  const other = section(s.other);
  other.append(buildLanguage(config), buildVolume(config));
  root.append(other);

  paintRows();
  paintOriginal();
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
