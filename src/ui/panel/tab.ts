import { wikifyEval } from '../../host/game';
import { invalidateLang, t } from '../i18n';

/** 面板内容的渲染入口，由装配层注入，避免与 panel/index 互相引用 */
type Renderer = () => HTMLElement;

let render: Renderer | null = null;

let tabEl: HTMLButtonElement | null = null;
let tabBar: HTMLElement | null = null;

/** preload 插进 `titleOptions` 的标记；分页按钮本身是原版 `<<button>>` */
const MARK = 'span[data-dolhk-tab]';

function findTab(bar: HTMLElement): HTMLButtonElement | null {
  const mark = bar.querySelector<HTMLElement>(MARK);
  return mark ? (mark.closest('button') as HTMLButtonElement | null) : null;
}

/**
 * 把当前文案写进 `setup`，`titleOptions` 渲染分页时直接取用。
 * 分页一出现就是正确语言，不会先显示占位文案再被改掉。
 */
export function publishLabel(): void {
  const setup = (window as unknown as { setup?: Record<string, unknown> }).setup;
  if (!setup) return;
  const label = t().tab;
  if (setup.DoLHKTab !== label) setup.DoLHKTab = label;
}

/** 同步已有分页的文案；结构与宽度仍走原版分页规则 */
export function updateTabLabel(): void {
  publishLabel();
  const mark = document.querySelector<HTMLElement>(`#overlayTabs ${MARK}`);
  if (!mark) return;
  const label = t().tab;
  if (mark.textContent !== label) mark.textContent = label;
}

/** 缓存分页引用；分页由 preload 插入，这里不创建也不删除任何节点 */
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
  tabEl = findTab(bar);
  updateTabLabel();
}

/** 分页内容由 `hotkeysPanel` widget 调这里渲染 */
export function renderInto(): void {
  // 必须避开 `<<replace>>` 自己的渲染过程：它先清空目标再写入内容，
  // 同步挂载会被覆盖，等这一轮结束再填。
  window.setTimeout(() => {
    const content = document.getElementById('customOverlayContent');
    if (!content || !render) return;
    content.textContent = '';
    content.append(render());
    content.scrollTop = 0;
    window.jQuery?.(content).scrollTop(0);
  }, 0);
}

export function installTab(renderer: Renderer): void {
  render = renderer;
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
    if (tabEl) {
      tabEl.click();
      return;
    }
    attempts++;
    if (attempts < 20) setTimeout(focus, 50);
  };
  focus();
}
