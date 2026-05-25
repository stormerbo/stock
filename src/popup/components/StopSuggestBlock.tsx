import { trendMeta, type StopSuggest } from '../../shared/stop-suggest';

type Props = {
  suggestion: StopSuggest | null;
};

export default function StopSuggestBlock({ suggestion }: Props) {
  if (!suggestion) return null;
  const meta = trendMeta(suggestion.trendDirection);

  return (
    <div className="stop-suggest-block">
      <span className="stop-block-label">💡</span>
      <span className="stop-block-item">ATR {suggestion.atr.toFixed(2)}</span>
      <span className="stop-block-divider">|</span>
      <span className="stop-block-item loss">止损 ¥{suggestion.stopLoss.toFixed(2)}</span>
      <span className="stop-block-divider">|</span>
      <span className="stop-block-item profit">止盈 ¥{suggestion.takeProfit.toFixed(2)}</span>
      <span className="stop-block-divider">|</span>
      <span className="stop-block-item">{meta.icon} {meta.label}</span>
    </div>
  );
}
