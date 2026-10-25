/** 面板用的最小 DOM 构造工具，统一各区块的元素写法 */
export function div(className: string, text?: string): HTMLDivElement {
  const node = document.createElement('div');
  node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

export function span(className: string, text?: string): HTMLSpanElement {
  const node = document.createElement('span');
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

export function button(className: string, text: string): HTMLButtonElement {
  const node = document.createElement('button');
  node.type = 'button';
  node.className = className;
  node.textContent = text;
  return node;
}

/** 原版 (?)：游戏自己的 tooltip 模块读 `tooltip` 属性生成弹层，样式因此与原版一致 */
export function hint(text: string): HTMLSpanElement {
  // 前导不换行空格：与前面的文字始终隔开一格，行首不会被空白折叠吃掉
  const node = span('tooltip-anchor linkBlue', '\u00A0(?)');
  node.setAttribute('tooltip', text);
  return node;
}

/** 折叠能力由调用方注入，dom 层不感知配置存储 */
export interface FoldHandlers {
  /** 初始是否收起 */
  folded: boolean;
  /** 用户点击后写回；面板重建时再从这里读 */
  onToggle: (folded: boolean) => void;
}

/**
 * 与原版设置一致的区块外壳：标题 + 内容网格。
 * 传入 handlers 时标题成为可点击的折叠开关，状态落在容器的 class 上。
 */
export function section(title: string, handlers?: FoldHandlers): HTMLDivElement {
  const wrap = div('settingsGrid');
  const head = div('settingsHeader options', title);
  wrap.append(head);
  if (!handlers) return wrap;

  head.classList.add('dolhk-fold');
  head.setAttribute('role', 'button');
  head.tabIndex = 0;

  const paint = (folded: boolean): void => {
    wrap.classList.toggle('dolhk-folded', folded);
    head.setAttribute('aria-expanded', String(!folded));
  };
  const toggle = (): void => {
    const next = !wrap.classList.contains('dolhk-folded');
    paint(next);
    handlers.onToggle(next);
  };

  head.addEventListener('click', toggle);
  head.addEventListener('keydown', event => {
    if (event.key !== 'Enter' && event.key !== ' ') return;
    // 焦点在标题上时，热键派发（capture 阶段）可能已经消费掉这次按键
    if (event.defaultPrevented) return;
    event.preventDefault();
    event.stopPropagation();
    toggle();
  });
  paint(handlers.folded);
  return wrap;
}
