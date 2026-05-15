export type FloatingOverlayConfig = {
  enabled: boolean;
  stockCodes: string[];        // 自选股代码列表（纯数字，如 ['000001', '600519']）
};

export type FloatingOverlayState = {
  position: { x: number; y: number };
  collapsed: boolean;
  hidden: boolean;
};

export const DEFAULT_CONFIG: FloatingOverlayConfig = {
  enabled: false,
  stockCodes: [],
};

export const DEFAULT_STATE: FloatingOverlayState = {
  position: { x: 20, y: 80 },
  collapsed: false,
  hidden: false,
};

export const CONFIG_KEY = 'floatingOverlayConfig';
export const STATE_KEY = 'floatingOverlayState';
