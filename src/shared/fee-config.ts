// 交易费率配置
export const FEE_CONFIG_KEY = 'feeConfig';

export type FeeConfig = {
  // 股票费率
  stockCommissionRate: number;  // 佣金费率，如 0.00025 = 万2.5
  stockCommissionMin: number;   // 佣金最低收费，如 5 元
  stockStampTaxRate: number;    // 印花税率（仅卖出），如 0.0005 = 万5
  stockTransferFeeRate: number; // 过户费率，如 0.00001 = 万0.1

  // 基金费率
  fundSubscriptionRate: number; // 申购费率，如 0.0015 = 0.15%
  fundRedemptionRate: number;   // 赎回费率，如 0.005 = 0.5%
};

export const DEFAULT_FEE_CONFIG: FeeConfig = {
  stockCommissionRate: 0.00025,  // 万2.5
  stockCommissionMin: 5,         // 最低 5 元
  stockStampTaxRate: 0.0005,     // 万5（仅卖出）
  stockTransferFeeRate: 0.00001, // 万0.1

  fundSubscriptionRate: 0.0015,  // 0.15%
  fundRedemptionRate: 0.005,     // 0.5%
};

export async function loadFeeConfig(): Promise<FeeConfig> {
  try {
    if (typeof chrome !== 'undefined' && chrome.storage?.sync) {
      const result = await chrome.storage.sync.get(FEE_CONFIG_KEY);
      const saved = result[FEE_CONFIG_KEY] as FeeConfig | undefined;
      if (saved && typeof saved === 'object') {
        return {
          stockCommissionRate: Number.isFinite(saved.stockCommissionRate) ? saved.stockCommissionRate : DEFAULT_FEE_CONFIG.stockCommissionRate,
          stockCommissionMin: Number.isFinite(saved.stockCommissionMin) ? saved.stockCommissionMin : DEFAULT_FEE_CONFIG.stockCommissionMin,
          stockStampTaxRate: Number.isFinite(saved.stockStampTaxRate) ? saved.stockStampTaxRate : DEFAULT_FEE_CONFIG.stockStampTaxRate,
          stockTransferFeeRate: Number.isFinite(saved.stockTransferFeeRate) ? saved.stockTransferFeeRate : DEFAULT_FEE_CONFIG.stockTransferFeeRate,
          fundSubscriptionRate: Number.isFinite(saved.fundSubscriptionRate) ? saved.fundSubscriptionRate : DEFAULT_FEE_CONFIG.fundSubscriptionRate,
          fundRedemptionRate: Number.isFinite(saved.fundRedemptionRate) ? saved.fundRedemptionRate : DEFAULT_FEE_CONFIG.fundRedemptionRate,
        };
      }
    }
  } catch { /* fall through */ }
  return { ...DEFAULT_FEE_CONFIG };
}

export async function saveFeeConfig(config: FeeConfig): Promise<void> {
  if (typeof chrome !== 'undefined' && chrome.storage?.sync) {
    await chrome.storage.sync.set({ [FEE_CONFIG_KEY]: config });
    return;
  }
  localStorage.setItem(FEE_CONFIG_KEY, JSON.stringify(config));
}
