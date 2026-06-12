import type { StockDetailKlinePoint } from './stockDetail';

export type IndexMinutePoint = {
  time: string;
  price: number;
  cumulativeVolume: number;
  volume: number;
};

export function eastmoneyIndexKlt(period: 'day' | 'week' | 'month'): 101 | 102 | 103 {
  if (period === 'day') return 101;
  if (period === 'week') return 102;
  return 103;
}

export function mapIndexMinutePoints(kline: StockDetailKlinePoint[]): IndexMinutePoint[] {
  let previousCumulative = 0;

  return kline
    .map((item) => {
      const time = String(item.date).slice(-5);
      const cumulativeVolume = Number(item.volume);
      const volume = Math.max(0, cumulativeVolume - previousCumulative);
      previousCumulative = cumulativeVolume;

      if (!/^\d{2}:\d{2}$/.test(time) || !Number.isFinite(item.close) || !Number.isFinite(cumulativeVolume)) {
        return null;
      }

      return {
        time,
        price: item.close,
        cumulativeVolume,
        volume,
      };
    })
    .filter((item): item is IndexMinutePoint => item !== null);
}
