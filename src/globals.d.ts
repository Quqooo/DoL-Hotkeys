export interface EarlyBinding {
  keys: string;
  src: string;
}

export interface EarlyRegistry {
  bindings: EarlyBinding[];
  native: EarlyBinding[];
  mousetrapSeen: boolean;
}

declare global {
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
    cordova?: any;
    __DoLHKEarly?: EarlyRegistry;
    DoLHK?: {
      readonly label: string;
      available: (id: string) => boolean;
      refreshTab: () => void;
    };
  }
}

export {};
