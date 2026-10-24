import { detect } from '../../host/detect';
import { t } from '../i18n';
import type { OrigEntry } from '../../core/types';
import { button, div, span } from './dom';

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

export interface OriginalView {
  body: HTMLElement;
  source: HTMLElement;
  tools: HTMLElement;
}

/** 原版只读区：内容与来源说明分开持有，重绘时只替换列表 */
export function buildOriginal(): OriginalView {
  const s = t();
  const body = div('dolhk-orig');
  const source = span('dolhk-muted', '');
  const tools = div('dolhk-tools');
  const redetect = button('dolhk-btn', s.redetect);
  tools.append(source, redetect);
  const view = { body, source, tools };
  redetect.addEventListener('click', () => paintOriginal(view));
  return view;
}

export function paintOriginal(view: OriginalView): void {
  const result = detect();
  const s = t();
  view.body.textContent = '';
  for (const entry of result.entries) {
    const row = div('dolhk-orig-row');
    const left = span('dolhk-orig-key', entry.keys);
    const right = span('dolhk-orig-desc', describe(entry));
    if (!entry.detected) right.append(span('dolhk-muted', ` · ${s.srcSnapshot}`));
    row.append(left, right);
    view.body.append(row);
  }
  if (result.usedSnapshot) view.source.textContent = s.srcMixed;
  else if (result.partiallyDetected) view.source.textContent = s.srcDynamic;
  else view.source.textContent = s.srcSnapshot;
}
