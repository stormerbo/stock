import type { MarketStats } from '../../shared/fetch';
import { formatMarketAmount, formatNumber } from '../utils/format';

type Props = {
  marketStats: MarketStats | null;
};

export default function MarketStatsStrip({ marketStats }: Props) {
  const volumeChangeTone = marketStats && Number.isFinite(marketStats.volumeChange)
    ? (marketStats.volumeChange >= 0 ? 'up' : 'down')
    : '';

  const volumeChangeLabel = marketStats && Number.isFinite(marketStats.volumeChange)
    ? (marketStats.volumeChange >= 0 ? '放量' : '缩量')
    : '缩量';

  return (
    <section className="market-stats-panel market-stats-strip" aria-label="市场统计">
      <div className="market-stats-row">
        <div className="market-stats-entry">
          <span className="market-stats-label">上涨</span>
          <span className="market-stats-value up">{marketStats ? formatNumber(marketStats.upCount, 0) : '--'}</span>
        </div>
        <div className="market-stats-entry">
          <span className="market-stats-label">平盘</span>
          <span className="market-stats-value flat">{marketStats ? formatNumber(marketStats.flatCount, 0) : '--'}</span>
        </div>
        <div className="market-stats-entry">
          <span className="market-stats-label">下跌</span>
          <span className="market-stats-value down">{marketStats ? formatNumber(marketStats.downCount, 0) : '--'}</span>
        </div>
        <div className="market-stats-entry">
          <span className="market-stats-label">成交额</span>
          <span className="market-stats-value">{marketStats ? formatMarketAmount(marketStats.turnover) : '--'}</span>
        </div>
        <div className="market-stats-entry">
          <span className="market-stats-label">{volumeChangeLabel}</span>
          <span className={`market-stats-value ${volumeChangeTone}`}>
            {marketStats && Number.isFinite(marketStats.volumeChange)
              ? formatMarketAmount(Math.abs(marketStats.volumeChange))
              : '--'}
          </span>
        </div>
        <div className="market-stats-entry">
          <span className="market-stats-label">昨成交</span>
          <span className="market-stats-value">{marketStats ? formatMarketAmount(marketStats.prevTurnover) : '--'}</span>
        </div>
      </div>
    </section>
  );
}
