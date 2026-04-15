import { formatNumber, formatPercent, getColorClass } from '@/utils/format';
import type { OverviewData } from '@/types';

interface OverviewProps {
  data: OverviewData;
  colorMode: 'red-up' | 'green-up';
}

export function Overview({ data, colorMode }: OverviewProps) {
  return (
    <div className="flex gap-16 py-4">
      <div className="flex flex-col gap-1">
        <span className="text-sm text-gray-500">总市值</span>
        <span className="text-2xl font-semibold text-gray-900">
          {formatNumber(data.totalMarketValue)}
        </span>
      </div>
      <div className="flex flex-col gap-1">
        <span className="text-sm text-gray-500">浮动盈亏</span>
        <span className={`text-2xl font-semibold ${getColorClass(data.totalProfit, colorMode)}`}>
          {data.totalProfit >= 0 ? '+' : ''}
          {formatNumber(data.totalProfit)}
        </span>
      </div>
      <div className="flex flex-col gap-1">
        <span className="text-sm text-gray-500">当日盈亏</span>
        <span className={`text-2xl font-semibold ${getColorClass(data.dailyProfit, colorMode)}`}>
          {data.dailyProfit >= 0 ? '+' : ''}
          {formatNumber(data.dailyProfit)}
        </span>
        <span className={`text-sm ${getColorClass(data.dailyProfitPct, colorMode)}`}>
          {formatPercent(data.dailyProfitPct)}
        </span>
      </div>
    </div>
  );
}
