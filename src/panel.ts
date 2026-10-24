import { cancelCapture, isCapturing, startCapture } from './capture';
import { detect } from './detect';
import { confirmDialog } from './dialog';
import { stateTemp } from './game';
import { currentLang, invalidateLang, setLangOverride, t } from './i18n';
import { bindHasDigit, bindKey, bindLabel, mouseButtonOf } from './keys';
import { applyVolumeOverride, hasCordova } from './mobile';
import { get as getEntry, groupOf, labelOf, list as listRegistry, subscribe as subscribeRegistry } from './registry';
import { clashOf, labelOfReserved } from './vanilla';
import { getConfig, resetBind, saveConfig, setBind, setConflictMode } from './settings';
import {
  ACTION_ORDER,
  type ActionId,
  type Bind,
  type ConflictMode,
  type LangMode,
  type OrigEntry,
  type RegisteredHotkey,
} from './types';

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

let rootEl: HTMLElement | null = null;
let listEl: HTMLElement | null = null;
let sourceEl: HTMLElement | null = null;
let originalEl: HTMLElement | null = null;
const warnSlots = new Map<string, HTMLElement>();

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

function setKeyText(target: HTMLButtonElement, bind: Bind): void {
  target.classList.toggle('dolhk-empty', bind.length === 0);
  target.textContent = bind.length ? bindLabel(bind) : t().empty;
}

/** 用户未改过时回退到注册时的默认键，第三方行才能显示与判重 */
function bindOf(id: string): Bind {
  const stored = getConfig().binds[id];
  if (stored) return stored;
  return getEntry(id)?.defaultBind ?? [];
}

function paintWarnings(id: string, bind: Bind): void {
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
  const duplicate = listRegistry().find(other => other.id !== id && bindKey(bindOf(other.id)) === key);
  if (duplicate) {
    const mode = getConfig().conflictMode;
    const text = mode === 'all' ? s.warnDupAll : mode === 'first' ? s.warnDupFirst : s.warnDup;
    messages.push(text(labelOf(duplicate, lang)));
  }
  if (bindHasDigit(bind)) messages.push(s.warnDigit);
  if (BROWSER_RESERVED.some(reserved => bindKey(reserved) === key)) messages.push(s.warnBrowser);
  const button = mouseButtonOf(bind);
  if (button === 3 || button === 4) messages.push(s.warnSide);
  const reserved = clashOf(bind);
  if (reserved) messages.push(s.warnVanilla(labelOfReserved(reserved, lang)));
  slot.textContent = messages.join(' · ');
}

function beginCapture(id: string, target: HTMLButtonElement): void {
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

function sourceBadge(id: string): string | null {
  const dot = id.indexOf('.');
  return dot > 0 ? id.slice(0, dot) : null;
}

function buildRow(entry: RegisteredHotkey): HTMLElement {
  const s = t();
  const lang = currentLang();
  const row = div('settingsToggleItem dolhk-row');
  row.dataset.dolhk = entry.id;
  const column = div('dolhk-col');
  const head = div('dolhk-head');
  head.append(span('gold', labelOf(entry, lang)));
  const badge = entry.builtin ? null : sourceBadge(entry.id);
  if (badge) head.append(span('dolhk-badge', badge));

  const available = (() => {
    try {
      return entry.available() !== false;
    } catch {
      return false;
    }
  })();
  if (!available) head.append(span('dolhk-muted', s.unavailable));

  const warning = div('dolhk-warn');
  warnSlots.set(entry.id, warning);
  column.append(head, warning);

  const actions = div('dolhk-actions');
  const keyButton = button('dolhk-key', '');
  setKeyText(keyButton, bindOf(entry.id));
  keyButton.addEventListener('click', () => beginCapture(entry.id, keyButton));

  const resetButton = button('dolhk-reset', s.reset);
  resetButton.addEventListener('click', () => {
    if (entry.builtin) resetBind(entry.id as ActionId);
    else setBind(entry.id, [...entry.defaultBind]);
    paintRows();
  });

  actions.append(keyButton, resetButton);
  row.append(column, actions);
  row.classList.toggle('dolhk-disabled', !available);
  return row;
}

function buildSection(title: string, entries: RegisteredHotkey[]): HTMLElement {
  const wrap = section(title);
  const grid = div('dolhk-list');
  for (const entry of entries) grid.append(buildRow(entry));
  wrap.append(grid);
  return wrap;
}

function paintRows(): void {
  if (!listEl) return;
  listEl.textContent = '';
  warnSlots.clear();

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
  if (common.length) listEl.append(buildSection(s.mine, common));

  for (const [name, entries] of groups) {
    if (name === null) continue;
    listEl.append(buildSection(name, entries));
  }

  for (const entry of all) paintWarnings(entry.id, bindOf(entry.id));
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
  if (result.usedSnapshot) sourceEl.textContent = s.srcMixed;
  else if (result.partiallyDetected) sourceEl.textContent = s.srcDynamic;
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

type VolumeMode = 'off' | 'on' | 'invert';

function volumeModeOf(config: ReturnType<typeof getConfig>): VolumeMode {
  if (!config.volumeKeys) return 'off';
  return config.volumeInvert ? 'invert' : 'on';
}

function buildVolume(config: ReturnType<typeof getConfig>): HTMLElement {
  const s = t();
  const supported = hasCordova();
  const item = div('settingsToggleItem dolhk-row');
  const column = div('dolhk-col');

  const head = div('dolhk-volume-head');
  head.append(span('gold', s.volume), span('dolhk-muted', supported ? s.volumeOn : s.volumeUnsupported));

  const group = div('dolhk-radios');
  const inputs: HTMLInputElement[] = [];

  const sync = (): void => {
    const mode = volumeModeOf(config);
    for (const input of inputs) input.checked = input.value === mode;
  };

  const commit = (mode: VolumeMode): void => {
    config.volumeKeys = mode !== 'off';
    config.volumeInvert = mode === 'invert';
    saveConfig();
    if (supported) applyVolumeOverride(config.volumeKeys);
  };

  const choose = (mode: VolumeMode): void => {
    if (mode !== 'off' && !config.volumeKeys) {
      void confirmDialog(s.volumeConfirm, s.confirmOk, s.confirmCancel, s.confirmTitle).then(ok => {
        if (!ok) {
          sync();
          return;
        }
        commit(mode);
      });
      return;
    }
    commit(mode);
  };

  const options: Array<[VolumeMode, string]> = [
    ['off', s.volumeOff],
    ['on', s.volumeEnabled],
    ['invert', s.volumeInvert],
  ];
  for (const [mode, label] of options) {
    if (inputs.length > 0) group.append(document.createTextNode(' | '));
    const wrap = document.createElement('label');
    const input = document.createElement('input');
    input.type = 'radio';
    input.name = 'dolhk-volume';
    input.value = mode;
    input.disabled = !supported;
    input.addEventListener('change', () => {
      if (input.checked) choose(mode);
    });
    inputs.push(input);
    wrap.append(input, document.createTextNode(` ${label}`));
    group.append(wrap);
  }
  sync();

  column.append(head, group);
  item.append(column);
  return item;
}

const WIDE_MIN = 620;

function applyWidth(): void {
  if (!rootEl) return;
  const host = document.getElementById('customOverlayContent') ?? rootEl.parentElement;
  const width = host?.clientWidth ?? window.innerWidth;
  rootEl.classList.toggle('dolhk-wide', width >= WIDE_MIN);
}

function buildConflict(config: ReturnType<typeof getConfig>): HTMLElement {
  const s = t();
  const item = div('settingsToggleItem dolhk-row dolhk-full');
  const column = div('dolhk-col');
  const head = div('dolhk-volume-head');
  head.append(span('gold', s.conflict), span('dolhk-muted', s.conflictHint));

  const group = div('dolhk-radios');
  const inputs: HTMLInputElement[] = [];
  const options: Array<[ConflictMode, string]> = [
    ['legacy', s.modeLegacy],
    ['all', s.modeAll],
    ['first', s.modeFirst],
  ];

  const sync = (): void => {
    for (const input of inputs) input.checked = input.value === config.conflictMode;
  };

  for (const [mode, label] of options) {
    if (inputs.length > 0) group.append(document.createTextNode(' | '));
    const wrap = document.createElement('label');
    const input = document.createElement('input');
    input.type = 'radio';
    input.name = 'dolhk-conflict';
    input.value = mode;
    input.addEventListener('change', () => {
      if (!input.checked) return;
      config.conflictMode = mode;
      saveConfig();
      setConflictMode(mode);
      paintRows();
    });
    inputs.push(input);
    wrap.append(input, document.createTextNode(` ${label}`));
    group.append(wrap);
  }
  sync();

  column.append(head, group);
  item.append(column);
  return item;
}

function build(): HTMLElement {
  invalidateLang();
  const s = t();
  const config = getConfig();
  const root = div('dolhk');

  listEl = div('dolhk-sections');
  root.append(listEl);

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
  other.append(buildLanguage(config), buildVolume(config), buildConflict(config));
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

subscribeRegistry(() => {
  if (isCapturing()) return;
  if (listEl?.isConnected) paintRows();
});

