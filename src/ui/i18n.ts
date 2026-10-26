import type { ActionId, Lang } from '../core/types';

export interface Dict {
  tab: string;
  mine: string;
  original: string;
  other: string;
  pressCombo: string;
  empty: string;
  reset: string;
  srcDynamic: string;
  srcSnapshot: string;
  srcMixed: string;
  redetect: string;
  lang: string;
  langAuto: string;
  langZh: string;
  langEn: string;
  volume: string;
  volumeOn: string;
  volumeOff: string;
  volumeEnabled: string;
  volumeInvert: string;
  volumeUnsupported: string;
  volumeConfirm: string;
  confirmTitle: string;
  confirmOk: string;
  confirmCancel: string;
  warnDigit: string;
  warnBrowser: string;
  warnSide: string;
  warnDupAll: (name: string) => string;
  warnDupFirst: (name: string) => string;
  warnVanilla: (name: string) => string;
  conflict: string;
  conflictHint: string;
  modeAll: string;
  modeFirst: string;
  unavailable: string;
  names: Record<ActionId, string>;
  orig: {
    links: (from: number, to: number) => string;
    back: (n: number) => string;
    forward: (n: number) => string;
    reroll: string;
    dialog: string;
    cont: string;
    modloader: string;
    unknown: string;
  };
}

const zh: Dict = {
  tab: '快捷键',
  mine: '常用快捷键',
  original: '原版快捷键（只读）',
  other: '其他',
  pressCombo: '按下组合…',
  empty: '未设置',
  reset: '恢复默认',
  srcDynamic: '动态检测',
  srcSnapshot: '内置快照',
  srcMixed: '动态检测 + 内置快照',
  redetect: '重新检测',
  lang: '界面语言',
  langAuto: '自动',
  langZh: '中文',
  langEn: 'English',
  volume: '音量键回溯/前进',
  volumeOn: '音量 + 回溯，音量 − 前进',
  volumeOff: '禁用',
  volumeEnabled: '启用',
  volumeInvert: '反向',
  volumeUnsupported: '仅安卓客户端可用',
  volumeConfirm: '开启后游戏前台时音量键将不再调节音量，确定继续？',
  confirmTitle: '提示',
  confirmOk: '继续',
  confirmCancel: '取消',
  warnDigit: '含数字键：与原版数字选链接重叠，可能一次触发两件事',
  warnBrowser: '浏览器可能优先处理该组合',
  warnSide: '未加修饰键的鼠标侧键：浏览器可能同时切换页面历史',
  warnDupAll: name => `与「${name}」重叠，全部触发`,
  warnDupFirst: name => `与「${name}」重叠，只执行优先级最高的一项`,
  warnVanilla: name => `与${name}冲突`,
  conflict: '冲突处理',
  conflictHint: '多个动作共用同一组合时',
  modeAll: '全部触发',
  modeFirst: '仅触发一个',
  unavailable: '当前不可用',
  names: {
    back: '回溯',
    forward: '前进',
    characteristics: '属性',
    social: '社交',
    traits: '特质',
    journal: '日志',
    statistics: '统计',
    feats: '成就',
    options: '选项',
    saves: '存档',
    cheats: '作弊',
  },
  orig: {
    links: (from, to) => `选择第 ${from}–${to} 个链接`,
    back: n => (n === 2 ? '回溯两步' : '回溯一步'),
    forward: n => (n === 2 ? '前进两步' : '前进一步'),
    reroll: '重掷随机数',
    dialog: '关闭对话框',
    cont: '点击「继续」链接',
    modloader: '打开模组管理器',
    unknown: '未识别的绑定',
  },
};

const en: Dict = {
  tab: 'Hotkeys',
  mine: 'Common hotkeys',
  original: 'Vanilla hotkeys (read-only)',
  other: 'Other',
  pressCombo: 'Press a combination…',
  empty: 'Not set',
  reset: 'Reset',
  srcDynamic: 'Detected',
  srcSnapshot: 'Built-in snapshot',
  srcMixed: 'Detected + snapshot',
  redetect: 'Detect again',
  lang: 'Interface language',
  langAuto: 'Auto',
  langZh: '中文',
  langEn: 'English',
  volume: 'Volume keys (back/forward)',
  volumeOn: 'Volume + back, Volume - forward',
  volumeOff: 'Disabled',
  volumeEnabled: 'Enabled',
  volumeInvert: 'Inverted',
  volumeUnsupported: 'Android client only',
  volumeConfirm: 'While the game is focused the volume keys will no longer change volume. Continue?',
  confirmTitle: 'Confirm',
  confirmOk: 'Continue',
  confirmCancel: 'Cancel',
  warnDigit: 'Contains a digit: overlaps vanilla link numbering, may fire two actions at once',
  warnBrowser: 'The browser may handle this combination first',
  warnSide: 'Bare side button: the browser may also navigate its own history',
  warnDupAll: name => `Also used by "${name}". All of them run.`,
  warnDupFirst: name => `Also used by "${name}". Only the highest priority one runs.`,
  warnVanilla: name => `Conflicts with ${name}`,
  conflict: 'Conflicts',
  conflictHint: 'Shortcut conflicts between actions',
  modeAll: 'All',
  modeFirst: 'First',
  unavailable: 'Unavailable now',
  names: {
    back: 'Back',
    forward: 'Forward',
    characteristics: 'Characteristics',
    social: 'Social',
    traits: 'Traits',
    journal: 'Journal',
    statistics: 'Statistics',
    feats: 'Feats',
    options: 'Options',
    saves: 'Saves',
    cheats: 'Cheats',
  },
  orig: {
    links: (from, to) => `Follow link ${from}–${to}`,
    back: n => (n === 2 ? 'Go back two steps' : 'Go back one step'),
    forward: n => (n === 2 ? 'Go forward two steps' : 'Go forward one step'),
    reroll: 'Reroll random',
    dialog: 'Close the dialog',
    cont: 'Click the continue link',
    modloader: 'Open the mod manager',
    unknown: 'Unrecognised binding',
  },
};

const DICTS: Record<Lang, Dict> = { zh, en };

let override: Lang | null = null;
let detected: Lang | null = null;

const HAN = /[\u4e00-\u9fff]/g;
const PROBES = ['#passages', '#story-caption'];
const HAN_THRESHOLD = 10;

export function setLangOverride(lang: 'auto' | Lang): void {
  override = lang === 'auto' ? null : lang;
  detected = null;
}

export function invalidateLang(): void {
  detected = null;
}

export function detectLang(): Lang {
  let han = 0;
  for (const selector of PROBES) {
    const text = document.querySelector(selector)?.textContent ?? '';
    han += (text.match(HAN) ?? []).length;
    if (han >= HAN_THRESHOLD) return 'zh';
  }
  return 'en';
}

export function currentLang(): Lang {
  if (override) return override;
  if (!detected) detected = detectLang();
  return detected;
}

export function dictFor(lang: Lang): Dict {
  return DICTS[lang];
}

export function t(): Dict {
  return dictFor(currentLang());
}
