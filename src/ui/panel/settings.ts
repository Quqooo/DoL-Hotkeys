import { confirmDialog } from '../../host/dialog';
import { applyVolumeOverride, hasCordova } from '../../host/mobile';
import { setLangOverride, t } from '../i18n';
import { saveConfig, setConflictMode } from '../../core/settings';
import type { Config, ConflictMode, LangMode } from '../../core/types';
import { div, span } from './dom';

type VolumeMode = 'off' | 'on' | 'invert';

function volumeModeOf(config: Config): VolumeMode {
  if (!config.volumeKeys) return 'off';
  return config.volumeInvert ? 'invert' : 'on';
}

interface RadioSpec<T extends string> {
  name: string;
  options: Array<[T, string]>;
  disabled?: boolean;
  /** 当前选中项；返回 null 表示全不选 */
  current: () => T | null;
  onPick: (value: T) => void;
}

/**
 * 单选组：分隔符沿用原版的纯文本 ` | `，不用样式元素。
 * 每个选项在 change 时回调，回调内需要回滚就调用返回的 sync。
 */
function radioRow<T extends string>(spec: RadioSpec<T>): { group: HTMLElement; sync: () => void } {
  const group = div('dolhk-radios');
  const inputs: HTMLInputElement[] = [];

  const sync = (): void => {
    const active = spec.current();
    for (const input of inputs) input.checked = input.value === active;
  };

  for (const [value, label] of spec.options) {
    if (inputs.length > 0) group.append(document.createTextNode(' | '));
    const wrap = document.createElement('label');
    const input = document.createElement('input');
    input.type = 'radio';
    input.name = spec.name;
    input.value = value;
    input.disabled = spec.disabled === true;
    input.addEventListener('change', () => {
      if (input.checked) spec.onPick(value);
    });
    inputs.push(input);
    wrap.append(input, document.createTextNode(` ${label}`));
    group.append(wrap);
  }
  sync();
  return { group, sync };
}

export function buildLanguage(config: Config, remount: () => void): HTMLElement {
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

export function buildVolume(config: Config): HTMLElement {
  const s = t();
  const supported = hasCordova();
  const item = div('settingsToggleItem dolhk-row');
  const column = div('dolhk-col');

  const head = div('dolhk-volume-head');
  head.append(span('gold', s.volume), span('dolhk-muted', supported ? s.volumeOn : s.volumeUnsupported));

  const commit = (mode: VolumeMode): void => {
    config.volumeKeys = mode !== 'off';
    config.volumeInvert = mode === 'invert';
    saveConfig();
    if (supported) applyVolumeOverride(config.volumeKeys);
  };

  const { group, sync } = radioRow<VolumeMode>({
    name: 'dolhk-volume',
    disabled: !supported,
    current: () => volumeModeOf(config),
    options: [
      ['off', s.volumeOff],
      ['on', s.volumeEnabled],
      ['invert', s.volumeInvert],
    ],
    onPick: mode => {
      if (mode === 'off' || config.volumeKeys) {
        commit(mode);
        return;
      }
      // 首次开启会让音量键不再调节音量，先征求确认；取消则回滚选中态
      void confirmDialog(s.volumeConfirm, s.confirmOk, s.confirmCancel, s.confirmTitle).then(ok => {
        if (ok) commit(mode);
        else sync();
      });
    },
  });

  column.append(head, group);
  item.append(column);
  return item;
}

export function buildConflict(config: Config, repaint: () => void): HTMLElement {
  const s = t();
  const item = div('settingsToggleItem dolhk-row dolhk-full');
  const column = div('dolhk-col');
  const head = div('dolhk-volume-head');
  head.append(span('gold', s.conflict), span('dolhk-muted', s.conflictHint));

  const { group } = radioRow<ConflictMode>({
    name: 'dolhk-conflict',
    current: () => config.conflictMode,
    options: [
      ['first', s.modeFirst],
      ['all', s.modeAll],
    ],
    onPick: mode => {
      setConflictMode(mode);
      repaint();
    },
  });

  column.append(head, group);
  item.append(column);
  return item;
}
