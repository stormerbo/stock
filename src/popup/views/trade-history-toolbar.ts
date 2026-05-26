export type TradeHistoryToolbarAction = {
  key: 'recalculate_holdings' | 'open_recalc_modal' | 'add_trade';
  title: string;
  ariaLabel: string;
  variant: 'brand' | 'ghost';
  icon: 'rotate' | 'clock' | 'plus';
  disabled: boolean;
};

export function getTradeHistoryToolbarActions(recalculating: boolean): TradeHistoryToolbarAction[] {
  return [
    {
      key: 'recalculate_holdings',
      title: '重算持仓',
      ariaLabel: '重算持仓',
      variant: 'brand',
      icon: 'rotate',
      disabled: recalculating,
    },
    {
      key: 'open_recalc_modal',
      title: '重新计算累计收益',
      ariaLabel: '重新计算累计收益',
      variant: 'ghost',
      icon: 'clock',
      disabled: false,
    },
    {
      key: 'add_trade',
      title: '新增交易',
      ariaLabel: '新增交易',
      variant: 'brand',
      icon: 'plus',
      disabled: false,
    },
  ];
}
