import { normalizeStockCode } from '../../shared/fetch';

export type StockBadgeTone = 'growth' | 'tech' | 'beijing';

export type StockRowBadge = {
  label: string;
  tone: StockBadgeTone | 'signal';
};

function resolveStockBadge(code: string): StockRowBadge | null {
  const plain = normalizeStockCode(code);
  if (!plain) return null;
  if (/^(300|301)/.test(plain)) return { label: '创', tone: 'growth' };
  if (/^(688|689)/.test(plain)) return { label: '科', tone: 'tech' };
  if (/^(430|440|830|831|832|833|835|836|837|838|839|870|871|872|873|874|875|876|877|878|879|880|881|882|883|884|885|886|887|888|889)/.test(plain)) {
    return { label: '北', tone: 'beijing' };
  }
  return null;
}

export function getStockRowBadges({
  code,
  hasTechSignal,
}: {
  code: string;
  hasTechSignal: boolean;
}): {
  nameRowBadge: StockRowBadge | null;
  codeRowBadge: StockRowBadge | null;
} {
  return {
    nameRowBadge: resolveStockBadge(code),
    codeRowBadge: hasTechSignal ? { label: '技', tone: 'signal' } : null,
  };
}

export function hasTechSignalBadge(
  signalStocks: Record<string, { score?: number } | undefined> | null,
  tradeSignals: Record<string, { score: number; level: string }> | null,
  code: string,
): boolean {
  return Boolean(signalStocks?.[code] || tradeSignals?.[code]);
}
