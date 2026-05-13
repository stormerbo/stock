// Portfolio config loading/saving and parsing
import {
  type StockHoldingConfig,
  type FundHoldingConfig,
  normalizeStockCode,
  normalizeFundCode,
  toNumber,
} from '../../shared/fetch';
import type { PortfolioConfig } from '../types';

export const STORAGE_KEYS = {
  stockHoldings: 'stockHoldings',
  fundHoldings: 'fundHoldings',
};

export const EMPTY_PORTFOLIO: PortfolioConfig = {
  stockHoldings: [],
  fundHoldings: [],
};

export function parseStockHoldings(input: unknown): StockHoldingConfig[] {
  if (!Array.isArray(input)) return [];
  return input
    .map((item) => {
      const code = normalizeStockCode(String((item as StockHoldingConfig)?.code ?? ''));
      const shares = Math.max(0, toNumber((item as StockHoldingConfig)?.shares));
      const cost = Math.max(0, toNumber((item as StockHoldingConfig)?.cost));
      if (!code) return null;
      const parsed: StockHoldingConfig = {
        code,
        shares: Number.isFinite(shares) ? shares : 0,
        cost: Number.isFinite(cost) ? cost : 0,
        pinned: Boolean((item as StockHoldingConfig)?.pinned),
        special: Boolean((item as StockHoldingConfig)?.special),
      };
      const addedPrice = toNumber((item as StockHoldingConfig)?.addedPrice);
      const addedAt = String((item as StockHoldingConfig)?.addedAt ?? '').trim();
      if (Number.isFinite(addedPrice) && addedPrice > 0) parsed.addedPrice = addedPrice;
      if (addedAt) parsed.addedAt = addedAt;
      return parsed;
    })
    .filter((item): item is NonNullable<typeof item> => item !== null);
}

export function parseFundHoldings(input: unknown): FundHoldingConfig[] {
  if (!Array.isArray(input)) return [];
  return input
    .map((item) => {
      const code = normalizeFundCode(String((item as FundHoldingConfig)?.code ?? ''));
      const units = Math.max(0, toNumber((item as FundHoldingConfig)?.units));
      const cost = Math.max(0, toNumber((item as FundHoldingConfig)?.cost));
      const name = String((item as FundHoldingConfig)?.name ?? '').trim();
      if (!code) return null;
      const parsed: FundHoldingConfig = {
        code,
        units: Number.isFinite(units) ? units : 0,
        cost: Number.isFinite(cost) ? cost : 0,
        pinned: Boolean((item as FundHoldingConfig)?.pinned),
        special: Boolean((item as FundHoldingConfig)?.special),
      };
      if (name) parsed.name = name;
      const addedNav = toNumber((item as FundHoldingConfig)?.addedNav);
      const addedAt = String((item as FundHoldingConfig)?.addedAt ?? '').trim();
      if (Number.isFinite(addedNav) && addedNav > 0) parsed.addedNav = addedNav;
      if (addedAt) parsed.addedAt = addedAt;
      return parsed;
    })
    .filter((item): item is FundHoldingConfig => item !== null);
}

export async function loadPortfolioConfig(): Promise<PortfolioConfig> {
  if (typeof chrome !== 'undefined' && chrome.storage?.sync) {
    const result = await chrome.storage.sync.get([STORAGE_KEYS.stockHoldings, STORAGE_KEYS.fundHoldings]);
    return {
      stockHoldings: parseStockHoldings(result[STORAGE_KEYS.stockHoldings]),
      fundHoldings: parseFundHoldings(result[STORAGE_KEYS.fundHoldings]),
    };
  }

  try {
    const raw = window.localStorage.getItem('portfolio-config-v1');
    if (!raw) return EMPTY_PORTFOLIO;
    const parsed = JSON.parse(raw) as Partial<PortfolioConfig>;
    return {
      stockHoldings: parseStockHoldings(parsed.stockHoldings),
      fundHoldings: parseFundHoldings(parsed.fundHoldings),
    };
  } catch {
    return EMPTY_PORTFOLIO;
  }
}

export async function savePortfolioConfig(config: PortfolioConfig): Promise<void> {
  if (typeof chrome !== 'undefined' && chrome.storage?.sync) {
    await chrome.storage.sync.set({
      [STORAGE_KEYS.stockHoldings]: config.stockHoldings,
      [STORAGE_KEYS.fundHoldings]: config.fundHoldings,
    });
    return;
  }

  window.localStorage.setItem('portfolio-config-v1', JSON.stringify(config));
}
