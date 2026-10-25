import { getConfig, setFolded } from '../../core/settings';
import type { FoldHandlers } from './dom';

/**
 * 分区标识。第三方组名由模组声明、可随语言变化，因此统一加 `g:` 前缀，
 * 与本模块自用的 `@` 命名空间隔离，避免同名冲突。
 */
export const COMMON_KEY = '@common';
export const ORIGINAL_KEY = '@original';
export const SETTINGS_KEY = '@settings';

export function groupKey(name: string): string {
  return `g:${name}`;
}

/** 折叠状态存于配置：面板每次重建（改键位、注册表变化）都能取回 */
export function foldHandlers(key: string): FoldHandlers {
  return {
    folded: getConfig().collapsed.includes(key),
    onToggle: folded => setFolded(key, folded),
  };
}
