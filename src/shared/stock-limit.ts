import { normalizeStockCode } from './fetch.ts';

function hasSTInName(name?: string): boolean {
  if (!name) return false;
  return /\*?ST/i.test(name);
}

function isNorthBoard(plainCode: string): boolean {
  return /^(430|440|830|831|832|833|835|836|837|838|839|870|871|872|873|874|875|876|877|878|879|880|881|882|883|884|885|886|887|888|889)/.test(plainCode);
}

function isChiNextOrStar(plainCode: string): boolean {
  return /^(300|301|688|689)/.test(plainCode);
}

/**
 * 获取股票价格涨跌幅限制比例。
 * 当前覆盖：
 * - ST / *ST：5%
 * - 科创板 / 创业板：20%
 * - 北交所：30%
 * - 主板等默认：10%
 *
 * 注：上市首日、退市整理、临停等特殊场景仍可能没有固定涨跌停限制。
 */
export function getStockLimitPct(code: string, name?: string): number {
  const plain = normalizeStockCode(code);
  if (!plain) return 0.1;

  if (hasSTInName(name)) return 0.05;
  if (isChiNextOrStar(plain)) return 0.2;
  if (isNorthBoard(plain)) return 0.3;
  return 0.1;
}

export function isAtPriceLimit(code: string, name: string | undefined, dailyChangePct: number): boolean {
  if (!Number.isFinite(dailyChangePct)) return false;
  const limitPct = getStockLimitPct(code, name) * 100;
  return dailyChangePct >= limitPct || dailyChangePct <= -limitPct;
}
