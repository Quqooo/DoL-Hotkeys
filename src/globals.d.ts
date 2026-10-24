import type { Bind, HotkeyDefInput, Lang } from './core/types';

export interface EarlyBinding {
  keys: string;
  /** 该条目的原始组合串，用于按组合解除绑定 */
  combos: string[];
  src: string;
}

export interface EarlyRegistry {
  bindings: EarlyBinding[];
  native: EarlyBinding[];
  mousetrapSeen: boolean;
}

declare global {
  const __DOLHK_VERSION__: string;

  interface Window {
    SugarCube: any;
    Engine?: any;
    State?: any;
    V?: any;
    T?: any;
    setup?: any;
    Macro?: any;
    Wikifier?: any;
    jQuery?: any;
    wikifier?: (widget: string, ...args: unknown[]) => DocumentFragment;
    closeOverlay?: () => void;
    Dialog?: {
      setup: (title: string, classNames?: string) => HTMLElement;
      body: () => HTMLElement;
      append: (...args: unknown[]) => unknown;
      empty: () => unknown;
      open: (options?: { top?: number }, onClose?: (ev?: unknown) => void) => unknown;
      close: () => unknown;
      isOpen: (classNames?: string) => boolean;
    };
    cordova?: any;
    __DoLHKEarly?: EarlyRegistry;
    DoLHK?: {
      readonly api: number;
      readonly version: string;
      register: (def: HotkeyDefInput) => boolean;
      unregister: (id: string) => boolean;
      getBind: (id: string) => Bind | null;
      openPanel: () => void;
      lang: () => Lang;
      readonly label: string;
      available: (id: string) => boolean;
      refreshTab: () => void;
    };
    DoLHK_QUEUE?: unknown[] | { push: (def: unknown) => unknown };
    DoLHK_DECL?: unknown[];
  }
}

export {};
