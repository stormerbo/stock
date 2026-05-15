export type FloatingOverlayConfig = {
  enabled: boolean;
  stockCodes: string[];        // 自选股代码列表（纯数字，如 ['000001', '600519']）
};

export type FloatingOverlayState = {
  position: { x: number; y: number };
  collapsed: boolean;
  hidden: boolean;
  opacity: number;
};

export const DEFAULT_CONFIG: FloatingOverlayConfig = {
  enabled: false,
  stockCodes: [],
};

export const DEFAULT_STATE: FloatingOverlayState = {
  position: { x: 9999, y: 80 },
  collapsed: false,
  hidden: false,
  opacity: 1,
};

export const CONFIG_KEY = 'floatingOverlayConfig';
export const STATE_KEY = 'floatingOverlayState';
