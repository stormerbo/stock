export function getQuickStatsToggleState(isExpanded: boolean): {
  label: string;
  ariaLabel: string;
  expanded: boolean;
} {
  return isExpanded
    ? {
        label: '收起详细行情',
        ariaLabel: '收起顶部详细行情',
        expanded: true,
      }
    : {
        label: '展开详细行情',
        ariaLabel: '展开顶部详细行情',
        expanded: false,
      };
}

export function getQuickStatsSummaryKeys(): Array<'open' | 'high' | 'low'> {
  return ['open', 'high', 'low'];
}

export function getQuickStatsCollapsedSummary(): Array<{ key: 'open' | 'high' | 'low'; label: string }> {
  return [
    { key: 'open', label: '今开' },
    { key: 'high', label: '最高' },
    { key: 'low', label: '最低' },
  ];
}
