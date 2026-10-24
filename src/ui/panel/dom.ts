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

/** 与原版设置一致的区块外壳：标题 + 内容网格 */
export function section(title: string): HTMLDivElement {
  const wrap = div('settingsGrid');
  wrap.append(div('settingsHeader options', title));
  return wrap;
}
