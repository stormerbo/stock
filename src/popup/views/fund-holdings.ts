export function getFundHoldingAddButtonState(isAlreadyAdded: boolean): { label: string; disabled: boolean; className: string } {
  if (isAlreadyAdded) {
    return {
      label: '已自选',
      disabled: true,
      className: 'fund-add-stock-btn is-added',
    };
  }

  return {
    label: '+自选',
    disabled: false,
    className: 'fund-add-stock-btn',
  };
}
