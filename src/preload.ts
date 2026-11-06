/**
 * 引擎启动前把分页按钮插进 `titleOptions` 的 `#overlayTabs` 里。
 */

interface PassageDataItem {
  id: number;
  name: string;
  tags: string[];
  content: string;
}

interface SC2DataInfo {
  passageDataItems: {
    map: Map<string, PassageDataItem>;
    back2Array(): void;
  };
  cloneSC2DataInfo(): SC2DataInfo;
  clean(): void;
}

interface ModUtils {
  replaceFollowSC2DataInfo(next: SC2DataInfo, old: SC2DataInfo): void;
}

const OVERLAY = 'overlayReplace';
const PANEL = 'hotkeysPanel';

/**
 * 文案在渲染时从 `setup.DoLHKTab` 取，脚本在引擎启动后写入并按语言更新。
 * 这样分页一出现就是正确语言，不需要渲染后再改文本。
 */
const LABEL = "`'<span data-dolhk-tab>' + (setup.DoLHKTab || 'Hotkeys') + '</span>'`";

const BUTTON = [
  `\t\t<<button ${LABEL}>>`,
  '\t\t\t<<toggleTab>>',
  '\t\t\t<<replace #customOverlayContent>><<hotkeysPanel>><</replace>>',
  '\t\t<</button>>',
].join('\n');

const PANEL_WIDGET = [
  '<<widget "hotkeysPanel">>',
  '\t<<run window.DoLHK && window.DoLHK.renderInto ? window.DoLHK.renderInto() : undefined>>',
  '<</widget>>',
  '',
].join('\n');

function patch(text: string): string {
  if (text.includes(PANEL)) return text;

  const start = text.indexOf('<<widget "titleOptions">>');
  if (start < 0) return text;
  const end = text.indexOf('<</widget>>', start);
  if (end < 0) return text;

  const block = text.slice(start, end);
  const close = block.lastIndexOf('<<closeButton>>');
  if (close < 0) return text;
  const div = block.lastIndexOf('</div>', close);
  if (div < 0) return text;

  const at = start + div;
  return `${text.slice(0, at)}${BUTTON}\n\t${text.slice(at)}`;
}

const win = window as unknown as {
  modUtils?: ModUtils;
  modSC2DataManager?: { getSC2DataInfoAfterPatch(): SC2DataInfo };
};

const utils = win.modUtils;
const manager = win.modSC2DataManager;

if (utils && manager) {
  const old = manager.getSC2DataInfoAfterPatch();
  const next = old.cloneSC2DataInfo();
  const passage = next.passageDataItems.map.get(OVERLAY);

  if (passage) {
    passage.content = patch(passage.content);
    if (!next.passageDataItems.map.has(PANEL)) {
      next.passageDataItems.map.set(PANEL, { id: 0, name: PANEL, tags: ['widget'], content: PANEL_WIDGET });
    }
    next.passageDataItems.back2Array();
    utils.replaceFollowSC2DataInfo(next, old);
  }

  next.clean();
  old.clean();
}
