import { X } from 'lucide-react';
import { formatRelativeTime } from '../utils/format';
import type { NotificationRecord, PageTab } from '../types';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type TechReportStatus = any;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type TechReportDetail = any;

type Props = {
  notifications: NotificationRecord[];
  panelOpacity: number;
  notifSubTab: 'tech-report' | 'alerts';
  setNotifSubTab: (tab: 'tech-report' | 'alerts') => void;
  techReportStatus: TechReportStatus;
  techReportDetail: TechReportDetail;
  signalStocks: Record<string, { name: string; signalCount: number }> | null;
  unreadCount: number;
  markAllRead: () => void;
  markNotificationRead: (id: string) => void;
  clearNotifications: () => void;
  deleteNotification: (id: string) => void;
  setTechReportDetail: (d: TechReportDetail) => void;
  setTechReportStatus: (s: TechReportStatus) => void;
  setActiveTab: (tab: PageTab) => void;
  scrollPosRef: React.MutableRefObject<number>;
  renderNotificationMessage: (msg: string) => React.ReactNode;
};

export default function NotificationPanel({
  notifications, panelOpacity, notifSubTab, setNotifSubTab,
  techReportStatus, techReportDetail, signalStocks, unreadCount,
  markAllRead, markNotificationRead, clearNotifications, deleteNotification,
  setTechReportDetail, setTechReportStatus, setActiveTab, scrollPosRef,
  renderNotificationMessage,
}: Props) {
  return (
    <div className="notification-panel" style={{ opacity: panelOpacity }}>
      <div className="notification-header">
        <span className="notification-title">消息通知</span>
        <div className="notification-actions">
          {unreadCount > 0 && (
            <button type="button" className="notif-btn" onClick={markAllRead}>全部已读</button>
          )}
          {notifications.length > 0 && (
            <button type="button" className="notif-btn danger" onClick={clearNotifications}>清空</button>
          )}
        </div>
      </div>

      <div className="notif-sub-tabs">
        <button
          type="button"
          className={`notif-sub-tab ${notifSubTab === 'alerts' ? 'active' : ''}`}
          onClick={() => setNotifSubTab('alerts')}
        >
          股票告警
        </button>
        <button
          type="button"
          className={`notif-sub-tab ${notifSubTab === 'tech-report' ? 'active' : ''}`}
          onClick={() => setNotifSubTab('tech-report')}
        >
          技术报告
        </button>
      </div>

      {notifSubTab === 'tech-report' && (
        <>
          <div className="tech-report-status">
            {techReportStatus === 'loading' ? (
              <div className="tech-report-loading">盘后技术报告加载中...</div>
            ) : techReportStatus ? (
              <>
                <div className="tech-report-header">
                  <span className="tech-report-title">盘后技术报告</span>
                  <span className={`tech-report-enabled ${techReportStatus.enabled ? 'on' : 'off'}`}>
                    {techReportStatus.enabled ? '已启用' : '已禁用'}
                  </span>
                </div>
                <div className="tech-report-body">
                  {techReportStatus.enabled ? (
                    <>
                      <div className="tech-report-row">
                        <span className="tech-report-label">上次运行</span>
                        <span className="tech-report-value">
                          {techReportStatus.lastRunDate
                            ? `${techReportStatus.lastRunDate} ${techReportStatus.lastRunTime ? formatRelativeTime(techReportStatus.lastRunTime) : ''}`
                            : '尚未运行'}
                          {techReportStatus.lastRunDate && (
                            <span className={`tech-report-badge ${techReportStatus.status === 'success' ? 'ok' : techReportStatus.status === 'error' ? 'err' : 'idle'}`}>
                              {techReportStatus.status === 'success' ? `✓ ${techReportStatus.details}` : ''}
                              {techReportStatus.status === 'no_signal' ? '○ 无新信号' : ''}
                              {techReportStatus.status === 'error' ? '✗ 出错' : ''}
                              {techReportStatus.status === 'pending' ? '⋯ 运行中' : ''}
                            </span>
                          )}
                        </span>
                      </div>
                      {techReportStatus.errorMessage && (
                        <div className="tech-report-row">
                          <span className="tech-report-label">错误信息</span>
                          <span className="tech-report-value error">{techReportStatus.errorMessage}</span>
                        </div>
                      )}
                      <div className="tech-report-row">
                        <span className="tech-report-label">下次运行</span>
                        <span className="tech-report-value">
                          {techReportStatus.nextRunTime > 0 ? (
                            <>
                              {new Date(techReportStatus.nextRunTime).toLocaleString('zh-CN', {
                                month: '2-digit', day: '2-digit',
                                hour: '2-digit', minute: '2-digit',
                              })}
                              <button type="button" className="tech-report-run-btn" onClick={() => {
                                if (typeof chrome !== 'undefined' && chrome.runtime?.sendMessage) {
                                  void chrome.runtime.sendMessage({ type: 'trigger-tech-report' }).then(() => {
                                    chrome.storage.local.get('technicalReportStatus').then((r) => {
                                      const s = r.technicalReportStatus as TechReportStatus;
                                      if (s) setTechReportStatus(s);
                                    });
                                  });
                                }
                              }}>
                                {(() => {
                                  const todayStr = new Date().toLocaleDateString('en-CA');
                                  return techReportStatus.lastRunDate === todayStr ? '重新生成' : '立即运行';
                                })()}
                              </button>
                            </>
                          ) : '等待调度'}
                        </span>
                      </div>
                    </>
                  ) : (
                    <div className="tech-report-row">
                      <span className="tech-report-value disabled">请在设置页面启用盘后技术指标报告</span>
                    </div>
                  )}
                </div>
              </>
            ) : null}
          </div>

          {(() => {
            const techNotifs = notifications.filter((n) => n.name === '盘后技术报告');
            return techNotifs.length === 0 ? (
              <div className="notification-empty">暂无技术报告</div>
            ) : (
              <div className="notification-list">
                {techNotifs.map((item) => (
                  <div
                    key={item.id}
                    className={`notification-item ${item.read ? '' : 'unread'} clickable`}
                    onClick={() => {
                      markNotificationRead(item.id);
                      setTechReportDetail({ name: item.name, message: item.message, firedAt: item.firedAt });
                    }}
                  >
                    <span className={`notification-dot ${item.read ? '' : 'unread'}`} />
                    <div className="notification-text">
                      <span className="notification-stock">
                        {(() => {
                          const stockLines = item.message.split('\n').filter(l => /^\S+\(\d{6}\)/.test(l.trim()));
                          const first = stockLines[0]?.trim().replace(/\(.*$/, '') || '';
                          return <>{'📊 '}<span className="tech-report-title-inline">盘后技术报告</span>{first ? <span className="notification-code"> {first}{stockLines.length > 1 ? ` 等${stockLines.length}只` : ''}</span> : ''}</>;
                        })()}
                      </span>
                      <span className="notification-message">{renderNotificationMessage(item.message)}</span>
                    </div>
                    <span className="notification-time">
                      <button type="button" className="notif-del-btn" title="删除" onClick={(e) => { e.stopPropagation(); deleteNotification(item.id); }}>
                        <X size={10} />
                      </button>
                      {formatRelativeTime(item.firedAt)}
                    </span>
                  </div>
                ))}
              </div>
            );
          })()}
        </>
      )}

      {notifSubTab === 'alerts' && (
        <>
          {(() => {
            const alertNotifs = notifications.filter((n) => n.name !== '盘后技术报告');
            return alertNotifs.length === 0 ? (
              <div className="notification-empty">暂无股票告警</div>
            ) : (
              <div className="notification-list">
                {alertNotifs.map((item) => {
                  const changeUp = Number.isFinite(item.changePct) && item.changePct >= 0;
                  const priceValid = Number.isFinite(item.price) && item.price > 0;
                  return (
                    <div
                      key={item.id}
                      className={`notification-item ${item.read ? '' : 'unread'} ${item.code ? 'clickable' : ''}`}
                      onClick={item.code ? () => {
                        markNotificationRead(item.id);
                        if (item.code) {
                          const el = document.querySelector('.content-scroll');
                          if (el) scrollPosRef.current = el.scrollTop;
                          setActiveTab('stocks');
                        }
                      } : undefined}
                    >
                      <span className={`notification-dot ${item.read ? '' : 'unread'}`} />
                      <div className="notification-text">
                        <span className="notification-stock">
                          {item.name}
                          {item.code && <span className="notification-code">({item.code})</span>}
                        </span>
                        {priceValid && (
                          <span className="notification-price-row">
                            <span className="notif-price-label">现价 </span>
                            <span className="notif-price-value">¥{item.price.toFixed(2)}</span>
                            <span className={`notif-change-value ${changeUp ? 'up' : 'down'}`}>
                              {item.changePct >= 0 ? '+' : ''}{item.changePct.toFixed(2)}%
                            </span>
                          </span>
                        )}
                        <span className="notification-message">{renderNotificationMessage(item.message)}</span>
                      </div>
                      <span className="notification-time">
                        <button type="button" className="notif-del-btn" title="删除" onClick={(e) => { e.stopPropagation(); deleteNotification(item.id); }}>
                          <X size={10} />
                        </button>
                        {formatRelativeTime(item.firedAt)}
                      </span>
                    </div>
                  );
                })}
              </div>
            );
          })()}
        </>
      )}
    </div>
  );
}
