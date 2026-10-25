import { getConfig, setFolded } from '../../core/settings';
import type { FoldHandlers } from './dom';

/**
 * 分区标识。第三方分组用 `g:<分组 id>`：id 稳定，切换界面语言时折叠状态不变；
 * `@` 前缀留给本模块自用，两组命名空间互不干扰。
 */
export const COMMON_KEY = '@common';
export const ORIGINAL_KEY = '@original';
export const SETTINGS_KEY = '@settings';

export function groupKey(id: string): string {
  return `g:${id}`;
}

/** 折叠状态存于配置：面板每次重建（改键位、注册表变化）都能取回 */
export function foldHandlers(key: string): FoldHandlers {
  return {
    folded: getConfig().collapsed.includes(key),
    onToggle: folded => setFolded(key, folded),
  };
}
