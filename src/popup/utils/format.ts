// Formatting utilities used across popup components
import type { MarketStats } from '../types';

export function formatNumber(value: number, digits = 2): string {
  if (!Number.isFinite(value)) return '-';
  return value.toLocaleString('zh-CN', {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}

export function formatLooseNumber(value: number, maximumFractionDigits = 4): string {
  if (!Number.isFinite(value)) return '-';
  return value.toLocaleString('zh-CN', {
    minimumFractionDigits: 0,
    maximumFractionDigits,
  });
}

export function formatMarketAmount(value: number): string {
  if (!Number.isFinite(value)) return '--';
  return value >= 10000
    ? `${(value / 10000).toFixed(2)}万亿`
    : `${formatLooseNumber(value, 0)}亿`;
}

export function formatPercent(value: number): string {
  if (!Number.isFinite(value)) return '-';
  return `${value >= 0 ? '+' : ''}${value.toFixed(2)}%`;
}

export function formatRatioPercent(value: number): string {
  if (!Number.isFinite(value)) return '-';
  return `${value.toFixed(2)}%`;
}

export function toneClass(value: number): string {
  if (!Number.isFinite(value)) return '';
  return value >= 0 ? 'up' : 'down';
}

export function formatRelativeTime(timestampMs: number): string {
  const diffMs = Date.now() - timestampMs;
  const diffSec = Math.floor(diffMs / 1000);
  if (diffSec < 60) return `${diffSec} 秒前`;
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin} 分钟前`;
  const diffHour = Math.floor(diffMin / 60);
  if (diffHour < 24) return `${diffHour} 小时前`;
  const d = new Date(timestampMs);
  return `${d.getMonth() + 1}/${d.getDate()} ${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`;
}

export function getShanghaiDateKey(timestampMs: number): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date(timestampMs));

  const year = parts.find((item) => item.type === 'year')?.value ?? '0000';
  const month = parts.find((item) => item.type === 'month')?.value ?? '00';
  const day = parts.find((item) => item.type === 'day')?.value ?? '00';
  return `${year}-${month}-${day}`;
}

export function resolvePrevTurnover(
  history: Record<string, number>,
  referenceDate: string,
): number {
  const dates = Object.keys(history)
    .filter((date) => date < referenceDate && Number.isFinite(history[date]))
    .sort();
  if (dates.length === 0) return Number.NaN;
  return history[dates[dates.length - 1]];
}

export function deriveMarketStats(
  stats: MarketStats,
  history: Record<string, number>,
  referenceDate: string,
): MarketStats {
  const historyPrev = resolvePrevTurnover(history, referenceDate);
  const prevTurnover = Number.isFinite(stats.prevTurnover) ? stats.prevTurnover : historyPrev;
  const volumeChange = Number.isFinite(stats.volumeChange)
    ? stats.volumeChange
    : Number.isFinite(prevTurnover)
      ? stats.turnover - prevTurnover
    : Number.NaN;

  return {
    ...stats,
    prevTurnover: Number.isFinite(prevTurnover) ? Math.round(prevTurnover * 100) / 100 : Number.NaN,
    volumeChange: Number.isFinite(volumeChange) ? Math.round(volumeChange * 100) / 100 : Number.NaN,
  };
}
