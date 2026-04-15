import { formatNumber, formatPercent, getColorClass } from '@/utils/format';
import { cn } from '@/utils/cn';

interface ProfitCellProps {
  value: number;
  percent: number;
  showZero?: boolean;
  colorMode?: 'red-up' | 'green-up';
}

export function ProfitCell({ value, percent, showZero = true, colorMode = 'red-up' }: ProfitCellProps) {
  const hasData = showZero || value !== 0 || percent !== 0;

  if (!hasData) {
    return (
      <div className="flex flex-col gap-0.5">
        <span className="text-gray-400">-</span>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-0.5">
      <span className={cn('font-medium', getColorClass(value, colorMode))}>
        {value >= 0 ? '+' : ''}
        {formatNumber(value)}
      </span>
      <span className={cn('text-xs opacity-80', getColorClass(percent, colorMode))}>
        {formatPercent(percent)}
      </span>
    </div>
  );
}
