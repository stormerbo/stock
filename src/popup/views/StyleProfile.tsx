import { useEffect, useState, useCallback } from 'react';
import { RefreshCw } from 'lucide-react';
import RadarChart from '../components/RadarChart';
import { loadCachedStyleProfile, type StyleProfile } from '../../shared/investment-style';

const DIM_LABELS: Record<string, string> = {
  concentration: '集中度',
  turnover: '换手率',
  holdPeriod: '持仓周期',
  winRate: '胜率',
  profitLossRatio: '盈亏比',
  riskAppetite: '风险偏好',
};

const DIM_ORDER = ['concentration', 'turnover', 'holdPeriod', 'winRate', 'profitLossRatio', 'riskAppetite'];

function renderBar(value: number) {
  const clamped = Math.max(0, Math.min(100, value));
  const blocks = Math.round(clamped / 10);
  return (
    <span className="score-bar">
      <span className="score-bar-fill" style={{ width: `${clamped}%` }} />
      <span className="score-bar-value">{clamped}</span>
    </span>
  );
}

export default function StyleProfile() {
  const [profile, setProfile] = useState<StyleProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const loadProfile = useCallback(() => {
    loadCachedStyleProfile().then(setProfile).finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    loadProfile();
  }, [loadProfile]);

  const forceRefresh = useCallback(async () => {
    setRefreshing(true);
    chrome.runtime.sendMessage({ type: 'force-refresh' });
    setTimeout(async () => {
      await loadCachedStyleProfile().then(setProfile);
      setRefreshing(false);
    }, 3000);
  }, []);

  if (loading) {
    return <div className="panel-message">加载中...</div>;
  }

  if (!profile) {
    return (
      <div className="panel-message">
        <p>暂无数据</p>
        <p className="panel-sub">点击下方按钮立即生成投资画像</p>
        <button type="button" className="style-refresh-btn" style={{ margin: '12px auto 0', display: 'flex' }} onClick={forceRefresh} disabled={refreshing} title="立即生成">
          <RefreshCw size={14} className={refreshing ? 'spin' : ''} />
        </button>
      </div>
    );
  }

  const dp = profile.dataPoints;
  const orderedDims: Record<string, number> = {};
  const dims = profile.dimensions;
  for (const k of DIM_ORDER) {
    orderedDims[k] = (dims as Record<string, number>)[k] ?? 0;
  }

  return (
    <div className="style-profile">
      <div className="style-header">
        <span className="style-label">🎯 {profile.label}</span>
        <button type="button" className="style-refresh-btn" onClick={forceRefresh} disabled={refreshing} title="强制刷新">
          <RefreshCw size={14} className={refreshing ? 'spin' : ''} />
        </button>
      </div>
      <p className="style-desc">{profile.description}</p>

      <div className="style-radar-wrap">
        <RadarChart dimensions={orderedDims} labels={DIM_LABELS} size={200} />
      </div>

      <div className="style-dims">
        {DIM_ORDER.map((k) => (
          <div key={k} className="style-dim-row">
            <span className="style-dim-label">{DIM_LABELS[k]}</span>
            {renderBar((profile.dimensions as Record<string, number>)[k] ?? 0)}
          </div>
        ))}
      </div>

      <div className="style-data-grid">
        <div className="style-dp"><span>持仓数量</span><strong>{dp.stockCount > 0 ? `${dp.stockCount}只股票` : ''}{dp.fundCount > 0 ? `${dp.stockCount > 0 ? ' + ' : ''}${dp.fundCount}只基金` : ''}</strong></div>
        <div className="style-dp"><span>前3集中度</span><strong>{(dp.top3Weight * 100).toFixed(0)}%</strong></div>
        {dp.fundWeight > 0.01 ? (
          <div className="style-dp"><span>基金占比</span><strong>{(dp.fundWeight * 100).toFixed(0)}%</strong></div>
        ) : null}
        <div className="style-dp"><span>月均交易</span><strong>{dp.monthlyTrades}笔</strong></div>
        <div className="style-dp"><span>平均持仓</span><strong>{dp.avgHoldDays}天</strong></div>
        <div className="style-dp"><span>胜率</span><strong>{(dp.winRate * 100).toFixed(0)}%</strong></div>
        <div className="style-dp"><span>累计盈亏</span><strong className={dp.totalPnl >= 0 ? 'up' : 'down'}>{dp.totalPnl >= 0 ? '+' : ''}{dp.totalPnl.toFixed(0)}</strong></div>
        <div className="style-dp"><span>已实现盈亏</span><strong className={dp.realizedPnl >= 0 ? 'up' : 'down'}>{dp.realizedPnl >= 0 ? '+' : ''}{dp.realizedPnl.toFixed(0)}</strong></div>
        <div className="style-dp"><span>年化波动率</span><strong>{dp.avgAnnualVolatility.toFixed(1)}%</strong></div>
      </div>

      {profile.calculatedAt ? (
        <div className="style-footer">
          数据截止：{new Date(profile.calculatedAt).toLocaleString('zh-CN')}
        </div>
      ) : null}
    </div>
  );
}
