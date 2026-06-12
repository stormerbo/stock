import { BarChart3, Bell, Coins, FileText, Moon, PieChart, Settings, Shield, Sun, WalletCards } from 'lucide-react';
import type { PageTab, ThemeMode } from '../types';
import type { MarketStats } from '../../shared/fetch';
import { formatMarketAmount, formatNumber } from '../utils/format';

type Props = {
  activeTab: PageTab;
  setActiveTab: (tab: PageTab) => void;
  unreadCount: number;
  marketStats: MarketStats | null;
  theme: ThemeMode;
  toggleTheme: () => void;
  openSettings: () => void;
  clearDetailTargets: () => void;
};

export default function SideNav({
  activeTab, setActiveTab, unreadCount, marketStats, theme, toggleTheme, openSettings, clearDetailTargets,
}: Props) {
  return (
    <aside className="side-nav">
      <button
        type="button"
        className={`nav-btn ${activeTab === 'stocks' ? 'active' : ''}`}
        onClick={() => setActiveTab('stocks')}
      >
        <BarChart3 size={10} />
        <span>股票</span>
      </button>
      <button
        type="button"
        className={`nav-btn ${activeTab === 'funds' ? 'active' : ''}`}
        onClick={() => setActiveTab('funds')}
      >
        <WalletCards size={10} />
        <span>基金</span>
      </button>
      <button
        type="button"
        className={`nav-btn ${activeTab === 'gold' ? 'active' : ''}`}
        onClick={() => { setActiveTab('gold'); clearDetailTargets(); }}
      >
        <Coins size={10} />
        <span>金价</span>
      </button>
      <button
        type="button"
        className={`nav-btn ${activeTab === 'trades' ? 'active' : ''}`}
        onClick={() => { setActiveTab('trades'); clearDetailTargets(); }}
      >
        <FileText size={10} />
        <span>交易</span>
      </button>
      <button
        type="button"
        className={`nav-btn ${activeTab === 'notifications' ? 'active' : ''}`}
        onClick={() => { setActiveTab('notifications'); clearDetailTargets(); }}
        style={{ position: 'relative' }}
      >
        <Bell size={10} />
        <span>通知</span>
        {unreadCount > 0 && <span className="nav-badge">{unreadCount}</span>}
      </button>
      <button
        type="button"
        className={`nav-btn ${activeTab === 'account' ? 'active' : ''}`}
        onClick={() => setActiveTab('account')}
      >
        <PieChart size={10} />
        <span>账户</span>
      </button>
      <button
        type="button"
        className={`nav-btn ${activeTab === 'risk' ? 'active' : ''}`}
        onClick={() => { setActiveTab('risk'); clearDetailTargets(); }}
      >
        <Shield size={10} />
        <span>评估</span>
      </button>
      <div className="nav-spacer" />

      <div className="side-nav-footer">
        <div className="market-stats-panel" aria-label="市场统计">
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
            <span className="market-stats-label">
              {marketStats && Number.isFinite(marketStats.volumeChange)
                ? (marketStats.volumeChange >= 0 ? '放量' : '缩量')
                : '缩量'}
            </span>
            <span className={`market-stats-value ${marketStats && Number.isFinite(marketStats.volumeChange) ? (marketStats.volumeChange >= 0 ? 'up' : 'down') : ''}`}>
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

        <button
          type="button"
          className="nav-btn"
          onClick={openSettings}
        >
          <Settings size={10} />
          <span>设置</span>
        </button>
        <button
          type="button"
          className="nav-btn"
          onClick={toggleTheme}
        >
          {theme === 'dark' ? <Sun size={10} /> : theme === 'light' ? <Sun size={10} /> : <Moon size={10} />}
          <span>{theme === 'dark' ? '浅色' : theme === 'light' ? '白色' : '深色'}</span>
        </button>
      </div>
    </aside>
  );
}
