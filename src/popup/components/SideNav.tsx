import { BarChart3, Bell, FileText, Moon, PieChart, Settings, Shield, Sun, WalletCards } from 'lucide-react';
import type { PageTab, ThemeMode } from '../types';

type Props = {
  activeTab: PageTab;
  setActiveTab: (tab: PageTab) => void;
  unreadCount: number;
  theme: ThemeMode;
  toggleTheme: () => void;
  openSettings: () => void;
  clearDetailTargets: () => void;
};

export default function SideNav({
  activeTab, setActiveTab, unreadCount, theme, toggleTheme, openSettings, clearDetailTargets,
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
