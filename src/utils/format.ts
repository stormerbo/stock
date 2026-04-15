/**
 * 数字格式化工具
 */

// 格式化数字，添加千分位分隔符
export function formatNumber(num: number | null | undefined, decimals = 2): string {
  if (num === null || num === undefined || isNaN(num)) return '-';
  return num.toLocaleString('zh-CN', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

// 格式化百分比
export function formatPercent(num: number | null | undefined, decimals = 2): string {
  if (num === null || num === undefined || isNaN(num)) return '-';
  const prefix = num >= 0 ? '+' : '';
  return `${prefix}${num.toFixed(decimals)}%`;
}

// 获取涨跌颜色类名
export function getColorClass(
  value: number | null | undefined,
  colorMode: 'red-up' | 'green-up' = 'red-up'
): string {
  if (value === null || value === undefined || isNaN(value)) return '';
  if (value > 0) return colorMode === 'red-up' ? 'text-profit' : 'text-loss';
  if (value < 0) return colorMode === 'red-up' ? 'text-loss' : 'text-profit';
  return 'text-gray-500';
}

// 格式化时间
export function formatTime(timestamp: number): string {
  return new Date(timestamp).toLocaleTimeString('zh-CN', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

// 格式化日期
export function formatDate(timestamp: number): string {
  return new Date(timestamp).toLocaleDateString('zh-CN');
}
