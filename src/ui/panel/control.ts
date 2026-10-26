import { cancelCapture, isCapturing, startCapture } from '../../runtime/capture';
import { bindLabel } from '../../core/keys';
import { bindOf, get as getEntry, subscribe as subscribeRegistry } from '../../data/registry';
import { setBind, subscribe as subscribeSettings } from '../../core/settings';
import { t } from '../i18n';
import { button, div } from './dom';
import type { Bind } from '../../core/types';

export interface BindControlOptions {
  /** 是否显示重置按钮，默认显示 */
  showReset?: boolean;
  /** 键位写入后回调；控件自身已刷新，用于同步外部界面 */
  onChange?: (id: string, bind: Bind) => void;
}

/**
 * 键位控件：录制与重置。
 * 第三方可在自己的界面挂载；改键只能来自用户操作，没有直接写入的接口。
 */
export function createBindControl(id: string, options: BindControlOptions = {}): HTMLElement | null {
  if (!getEntry(id)) {
    console.warn(`[dol-hotkeys] bind control skipped: "${id}" is not registered`);
    return null;
  }

  const root = div('dolhk-actions dolhk-bind-control');
  root.dataset.dolhkControl = id;
  const key = button('dolhk-key', '');
  const reset = options.showReset === false ? null : button('dolhk-reset', t().reset);
  root.append(key);
  if (reset) root.append(reset);

  let capturing = false;
  let attached = false;
  let offSettings: (() => void) | null = null;
  let offRegistry: (() => void) | null = null;

  const render = (): void => {
    const gone = !getEntry(id);
    if (!capturing) {
      const bind = bindOf(id);
      key.classList.toggle('dolhk-empty', bind.length === 0);
      key.textContent = bind.length ? bindLabel(bind) : t().empty;
    }
    key.disabled = gone;
    if (reset) reset.disabled = gone;
  };

  const dispose = (): void => {
    offSettings?.();
    offRegistry?.();
    offSettings = null;
    offRegistry = null;
  };

  // 首次连接后才开始回收：面板先建行后挂载，构建期间 isConnected 仍是 false
  const sync = (): void => {
    // 条目被注销时放弃进行中的录制，避免把键位写回一个不存在的 id
    if (!getEntry(id) && capturing) cancelCapture();
    if (root.isConnected) attached = true;
    else if (attached) {
      dispose();
      return;
    }
    if (!capturing) render();
  };

  key.addEventListener('click', () => {
    if (capturing || key.disabled) return;
    if (isCapturing()) cancelCapture();
    capturing = true;
    key.classList.remove('dolhk-empty');
    key.classList.add('dolhk-capturing');
    key.textContent = t().pressCombo;

    let outside: ((event: MouseEvent) => void) | null = null;
    const detach = (): void => {
      if (!outside) return;
      document.removeEventListener('click', outside, true);
      outside = null;
    };

    startCapture(
      atoms => {
        key.textContent = atoms.length > 0 ? bindLabel(atoms) : t().pressCombo;
      },
      atoms => {
        detach();
        capturing = false;
        key.classList.remove('dolhk-capturing');
        if (atoms === null) {
          render();
          return;
        }
        setBind(id, atoms);
        render();
        options.onChange?.(id, atoms);
      },
    );

    setTimeout(() => {
      outside = (event: MouseEvent) => {
        if (root.contains(event.target as Node)) return;
        cancelCapture();
      };
      document.addEventListener('click', outside, true);
    }, 0);
  });

  if (reset) {
    reset.addEventListener('click', () => {
      const entry = getEntry(id);
      if (!entry || capturing) return;
      const bind = [...entry.defaultBind];
      setBind(id, bind);
      render();
      options.onChange?.(id, bind);
    });
  }

  render();
  offSettings = subscribeSettings(sync);
  offRegistry = subscribeRegistry(sync);
  // 挂载发生在当前任务之后，用微任务补记连接状态，之后才能判断「已卸载」
  queueMicrotask(() => {
    if (root.isConnected) attached = true;
  });
  return root;
}
