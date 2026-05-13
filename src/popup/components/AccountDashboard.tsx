import { useEffect, useState } from 'react';
import DiagnosticPanel from '../views/DiagnosticPanel';
import type { StockPosition, FundPosition, DailyAssetSnapshot } from '../../shared/fetch';
import { formatNumber, toneClass } from '../utils/format';
import AssetCurveChart from './AssetCurveChart';

type AccountSnapshot = {
  totalAssets: number;
  stockMarketValue: number;
  fundHoldingAmount: number;
  stockRatio: number;
  fundRatio: number;
  stockFloating: number;
  fundHoldingProfit: number;
  stockDaily: number;
  fundEstimated: number;
  heldStockCount: number;
  watchStockCount: number;
  heldFundCount: number;
  watchFundCount: number;
  disclosedFundCount: number;
};

type Props = {
  snapshot: AccountSnapshot;
  stockPositions: StockPosition[];
  fundPositions: FundPosition[];
};

export default function AccountDashboard({ snapshot, stockPositions, fundPositions }: Props) {
  const [assetSnapshots, setAssetSnapshots] = useState<Record<string, DailyAssetSnapshot>>({});

  useEffect(() => {
    if (typeof chrome !== 'undefined' && chrome.storage?.local) {
      chrome.storage.local.get('dailyAssetSnapshots', (result: Record<string, unknown>) => {
        const snapshots = (result.dailyAssetSnapshots ?? {}) as Record<string, DailyAssetSnapshot>;
        setAssetSnapshots(snapshots);
      });
    }
    const listener = (changes: Record<string, chrome.storage.StorageChange>, area: string) => {
      if (area === 'local' && changes.dailyAssetSnapshots) {
        setAssetSnapshots(changes.dailyAssetSnapshots.newValue as Record<string, DailyAssetSnapshot>);
      }
    };
    if (typeof chrome !== 'undefined' && chrome.storage?.onChanged) {
      chrome.storage.onChanged.addListener(listener);
      return () => chrome.storage.onChanged.removeListener(listener);
    }
  }, []);

  return (
    <div className="account-dashboard">
      <section className="account-hero-card">
        <div className="account-hero-main">
          <span className="account-section-label">总投资资产</span>
          <strong>{formatNumber(snapshot.totalAssets, 2)}</strong>
          <p>当前账户由股票市值与基金持有金额共同构成，下面是两类资产的实时占比。</p>
        </div>
        <div className="account-allocation">
          <div className="allocation-row">
            <div className="allocation-meta">
              <span>股票资产</span>
              <strong>{formatNumber(snapshot.stockMarketValue, 2)}</strong>
            </div>
            <span className="allocation-ratio">{`${snapshot.stockRatio.toFixed(1)}%`}</span>
          </div>
          <div className="allocation-bar">
            <span className="stock" style={{ width: `${Math.max(snapshot.stockRatio, 0)}%` }} />
          </div>
          <div className="allocation-row">
            <div className="allocation-meta">
              <span>基金资产</span>
              <strong>{formatNumber(snapshot.fundHoldingAmount, 2)}</strong>
            </div>
            <span className="allocation-ratio">{`${snapshot.fundRatio.toFixed(1)}%`}</span>
          </div>
          <div className="allocation-bar">
            <span className="fund" style={{ width: `${Math.max(snapshot.fundRatio, 0)}%` }} />
          </div>
        </div>
      </section>

      <AssetCurveChart snapshots={assetSnapshots} />

      <div className="account-grid">
        <article className="account-card">
          <span className="account-section-label">收益快照</span>
          <div className="account-stat-list">
            <div className="account-stat-row">
              <span>综合持仓收益</span>
              <strong className={toneClass(snapshot.stockFloating + snapshot.fundHoldingProfit)}>
                {formatNumber(snapshot.stockFloating + snapshot.fundHoldingProfit, 2)}
              </strong>
            </div>
            <div className="account-stat-row">
              <span>综合预估收益</span>
              <strong className={toneClass(snapshot.stockDaily + snapshot.fundEstimated)}>
                {formatNumber(snapshot.stockDaily + snapshot.fundEstimated, 2)}
              </strong>
            </div>
            <div className="account-stat-row">
              <span>股票当日盈亏</span>
              <strong className={toneClass(snapshot.stockDaily)}>
                {formatNumber(snapshot.stockDaily, 2)}
              </strong>
            </div>
          </div>
        </article>

        <article className="account-card">
          <span className="account-section-label">披露状态</span>
          <div className="account-stat-list">
            <div className="account-stat-row">
              <span>基金持仓数</span>
              <strong>{formatNumber(snapshot.heldFundCount, 0)}</strong>
            </div>
            <div className="account-stat-row">
              <span>已披露净值</span>
              <strong>{formatNumber(snapshot.disclosedFundCount, 0)}</strong>
            </div>
            <div className="account-stat-row">
              <span>待估算净值</span>
              <strong>{formatNumber(snapshot.heldFundCount - snapshot.disclosedFundCount, 0)}</strong>
            </div>
          </div>
        </article>

        <article className="account-card account-detail-card">
          <span className="account-section-label">股票概览</span>
          <div className="account-detail-list">
            <div className="account-detail-item">
              <span>持仓只数</span>
              <strong>{formatNumber(snapshot.heldStockCount, 0)}</strong>
            </div>
            <div className="account-detail-item">
              <span>仅自选</span>
              <strong>{formatNumber(snapshot.watchStockCount, 0)}</strong>
            </div>
            <div className="account-detail-item">
              <span>股票市值</span>
              <strong>{formatNumber(snapshot.stockMarketValue, 2)}</strong>
            </div>
            <div className="account-detail-item">
              <span>持仓收益</span>
              <strong className={toneClass(snapshot.stockFloating)}>{formatNumber(snapshot.stockFloating, 2)}</strong>
            </div>
            <div className="account-detail-item">
              <span>当日盈亏</span>
              <strong className={toneClass(snapshot.stockDaily)}>{formatNumber(snapshot.stockDaily, 2)}</strong>
            </div>
          </div>
        </article>

        <article className="account-card account-detail-card">
          <span className="account-section-label">基金概览</span>
          <div className="account-detail-list">
            <div className="account-detail-item">
              <span>持仓只数</span>
              <strong>{formatNumber(snapshot.heldFundCount, 0)}</strong>
            </div>
            <div className="account-detail-item">
              <span>仅自选</span>
              <strong>{formatNumber(snapshot.watchFundCount, 0)}</strong>
            </div>
            <div className="account-detail-item">
              <span>持有金额</span>
              <strong>{formatNumber(snapshot.fundHoldingAmount, 2)}</strong>
            </div>
            <div className="account-detail-item">
              <span>持有收益</span>
              <strong className={toneClass(snapshot.fundHoldingProfit)}>{formatNumber(snapshot.fundHoldingProfit, 2)}</strong>
            </div>
            <div className="account-detail-item">
              <span>估算收益</span>
              <strong className={toneClass(snapshot.fundEstimated)}>{formatNumber(snapshot.fundEstimated, 2)}</strong>
            </div>
          </div>
        </article>
      </div>

      <DiagnosticPanel
        stockPositions={stockPositions}
        fundPositions={fundPositions}
      />
    </div>
  );
}
