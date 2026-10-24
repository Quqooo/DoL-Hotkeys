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

export function buildConflict(config: Config, repaint: () => void): HTMLElement {
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
      repaint();
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
