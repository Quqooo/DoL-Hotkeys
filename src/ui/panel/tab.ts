import { stateTemp, wikifyEval } from '../../host/game';
import { invalidateLang, t } from '../i18n';

/** 面板内容的渲染入口，由装配层注入，避免与 panel/index 互相引用 */
type Renderer = () => HTMLElement;

let render: Renderer | null = null;

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
  if (!tabBar || !content || !tabEl || !render) return;
  const buttons = [...tabBar.querySelectorAll('button')];
  for (const node of buttons) node.classList.toggle('tab-selected', node === tabEl);
  const api = stateTemp()?.tab;
  if (api) {
    refreshTabCollection();
    api.activeTab = buttons.indexOf(tabEl);
  }
  content.textContent = '';
  content.appendChild(render());
  content.scrollTop = 0;
  window.jQuery?.(content).scrollTop(0);
}

/** 点其他分页时取消本页高亮，避免两个分页同时处于选中态 */
function onDocumentClick(event: MouseEvent): void {
  if (!tabEl) return;
  const target = event.target as Element | null;
  if (!target || tabEl.contains(target)) return;
  const bar = tabEl.parentElement;
  if (!bar || !bar.contains(target)) return;
  if (!target.closest('button')) return;
  tabEl.classList.remove('tab-selected');
}

export function updateTabLabel(): void {
  if (!tabEl) return;
  const label = t().tab;
  if (tabEl.textContent !== label) tabEl.textContent = label;
}

/** 设置覆盖层出现时补上本模组分页；切走时清空引用 */
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

export function installTab(renderer: Renderer): void {
  render = renderer;
  if (!tabObserver) {
    // 覆盖层可能随段落一起重建（PassageHeader / Footer 也在 #passages 内），不能按目标节点过滤
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
  }
  ensureTab();
}

/** 打开设置覆盖层并切到本模组分页 */
export function openPanel(): void {
  const overlay = document.getElementById('customOverlay');
  if (overlay?.getAttribute('data-overlay') !== 'options') {
    if (typeof window.wikifier === 'function') window.wikifier('overlayReplace', '"options"');
    else wikifyEval('<<overlayReplace "options">>');
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
