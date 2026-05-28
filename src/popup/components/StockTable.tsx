import { Fragment, useState, useCallback, useRef } from 'react';
import { Pin, Star, X, ArrowUpDown, ArrowUp, ArrowDown } from 'lucide-react';
import TagBadge from '../tags/TagBadge';
import { levelLabel } from '../../shared/trade-signal';
import IntradayChart from './IntradayChart';
import FloatingRefreshBtn from './FloatingRefreshBtn';
import { formatNumber, formatPercent, formatRatioPercent, toneClass } from '../utils/format';
import { getStockRowBadges, hasTechSignalBadge } from './stock-row-badges';
import type { StockRow, StockSortKey, SortDir, ColumnSort } from '../types';

type EditingCell = {
  kind: 'stock' | 'fund';
  code: string;
  field: 'cost' | 'shares' | 'units';
  value: string;
} | null;

type Props = {
  rows: StockRow[];
  sort: ColumnSort<StockSortKey>;
  onToggleSort: (key: StockSortKey) => void;
  draggingCode: string | null;
  editingCell: EditingCell;
  signalStocks: Record<string, { name: string; signalCount: number; signals?: Array<{ label: string; severity: string }>; score?: number }> | null;
  tradeSignals: Record<string, { score: number; level: string }> | null;
  stocksLoading: boolean;
  stocksError: string;
  stockTotalHoldingAmount: number;
  privacyHidden: boolean;
  // event handlers
  openStockDetail: (item: StockRow) => void;
  openRowContextMenu: (e: React.MouseEvent, kind: 'stock' | 'fund', code: string, name: string) => void;
  startEditing: (kind: 'stock' | 'fund', code: string, field: 'cost' | 'shares' | 'units') => void;
  updateEditingValue: (v: string) => void;
  finishEditing: () => void;
  cancelEditing: () => void;
  handleDragStart: (code: string) => void;
  handleDragEnd: () => void;
  handleStockDrop: (code: string) => void;
  onRemoveStock: (code: string) => void;
  onRefresh: () => void;
  refreshing: boolean;
};

/** Sortable header cell */
function SortTh({
  children, sortKey, currentSort, onToggle, className,
}: {
  children: React.ReactNode;
  sortKey: StockSortKey;
  currentSort: ColumnSort<StockSortKey>;
  onToggle: (k: StockSortKey) => void;
  className?: string;
}) {
  const active = currentSort.key === sortKey;
  const dir = active ? currentSort.dir : null;
  const Icon = active && dir === 'asc' ? ArrowUp : active && dir === 'desc' ? ArrowDown : ArrowUpDown;
  return (
    <th className={`sortable-th ${className ?? ''}${active ? ' active' : ''}`} onClick={() => onToggle(sortKey)}>
      {children}
      <Icon size={11} className="sort-icon" />
    </th>
  );
}

export default function StockTable({
  rows, sort, onToggleSort, draggingCode, editingCell,
  signalStocks, tradeSignals, stocksLoading, stocksError, stockTotalHoldingAmount,
  openStockDetail, openRowContextMenu, startEditing, updateEditingValue, finishEditing, cancelEditing,
  handleDragStart, handleDragEnd, handleStockDrop,
  onRemoveStock, onRefresh, refreshing, privacyHidden,
}: Props) {
  const [tip, setTip] = useState<{
    x: number; y: number;
    signals?: Array<{ label: string; severity: string }>;
    name: string; count: number;
    tradeLevel?: string; tradeScore?: number;
  } | null>(null);
  const tipTimerRef = useRef<number | null>(null);
  const hiddenText = '***';

  const showSignalTip = useCallback((
    e: React.MouseEvent,
    signals: Array<{ label: string; severity: string }> | undefined,
    name: string,
    count: number,
    trade?: { level: string; score: number },
  ) => {
    if (!signals && !trade) return;
    if (tipTimerRef.current != null) window.clearTimeout(tipTimerRef.current);
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const TOOLTIP_W = 290;
    const viewportW = window.innerWidth;
    const viewportH = window.innerHeight;

    let x = rect.right + 8;
    // translateY(-100%)：tooltip 底部对齐 Y，上方延伸
    let y = Math.min(e.clientY + 8, viewportH - 4);
    if (y < 52) y = 52;

    if (x + TOOLTIP_W + 8 > viewportW) {
      x = rect.left - TOOLTIP_W - 8;
    }
    if (x < 8) x = 8;

    setTip({ x, y, signals, name, count, tradeLevel: trade?.level, tradeScore: trade?.score });
  }, []);

  const hideSignalTip = useCallback(() => {
    tipTimerRef.current = window.setTimeout(() => setTip(null), 200);
  }, []);

  const keepTip = useCallback(() => {
    if (tipTimerRef.current != null) window.clearTimeout(tipTimerRef.current);
  }, []);

  return (
    <div className="table-panel">
      <table className="data-table stock-table">
        <thead>
          <tr>
            <SortTh sortKey="name" currentSort={sort} onToggle={onToggleSort}>股票</SortTh>
            <th>分时图</th>
            <SortTh sortKey="floatingPnl" currentSort={sort} onToggle={onToggleSort}>盈亏</SortTh>
            <SortTh sortKey="dailyPnl" currentSort={sort} onToggle={onToggleSort}>当日盈亏</SortTh>
            <SortTh sortKey="cost" currentSort={sort} onToggle={onToggleSort}>成本/现价</SortTh>
            <SortTh sortKey="shares" currentSort={sort} onToggle={onToggleSort}>持仓股数</SortTh>
            <SortTh sortKey="positionRatio" currentSort={sort} onToggle={onToggleSort}>仓位比</SortTh>
          </tr>
        </thead>
        <tbody>
          {rows.map((item) => {
            const hasShares = item.shares > 0;
            const hasCost = item.cost > 0;
            const hasPosition = hasShares && hasCost;
            const rowPrivacyHidden = privacyHidden && hasShares;
            const isPinned = item.pinned;
            const holdingAmount = hasPosition && Number.isFinite(item.price)
              ? item.price * item.shares
              : Number.NaN;
            const holdingRate = hasPosition && Number.isFinite(item.price)
              ? ((item.price - item.cost) / item.cost) * 100
              : Number.NaN;
            const positionRatio = stockTotalHoldingAmount > 0 && Number.isFinite(holdingAmount)
              ? (holdingAmount / stockTotalHoldingAmount) * 100
              : Number.NaN;
            const badges = getStockRowBadges({
              code: item.code,
              hasTechSignal: hasTechSignalBadge(signalStocks, tradeSignals, item.code),
            });

            return (
              <tr
                className={[
                  editingCell?.code === item.code ? 'editing-row' : '',
                  draggingCode === item.code ? 'dragging-row' : '',
                  isPinned ? 'locked-row' : '',
                ].filter(Boolean).join(' ')}
                onContextMenu={(event) => openRowContextMenu(event, 'stock', item.code, item.name)}
                draggable={!isPinned}
                onDragStart={() => handleDragStart(item.code)}
                onDragEnd={handleDragEnd}
                onDragOver={(event) => event.preventDefault()}
                onDrop={() => handleStockDrop(item.code)}
              >
                <td
                  className={`name-col stock-detail-trigger ${item.special ? 'special-row' : ''}`}
                  onClick={() => openStockDetail(item)}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openStockDetail(item); }
                  }}
                >
                  <button type="button" className="remove-stock-btn" title="移除自选"
                    onClick={(e) => { e.stopPropagation(); onRemoveStock(item.code); }}
                  ><X size={10} strokeWidth={1} /></button>
                  <span className="primary">
                    <span className="name-row">
                      <span className="name-inline">
                        {item.pinned ? <Pin size={10} className="pinned-flag" /> : null}
                        {item.special ? <Star size={10} className="special-star-icon" aria-hidden="true" /> : null}
                        <span className={`name-text ${toneClass(item.dailyChangePct)}`}>{item.name || item.code}</span>
                      </span>
                      <span className="name-badge-slot">
                        {badges.nameRowBadge ? <span className={`stock-badge ${badges.nameRowBadge.tone}`}>{badges.nameRowBadge.label}</span> : null}
                      </span>
                    </span>
                    {item.tags.length > 0 ? (
                      <span className="tag-row tag-row-inline">
                        {item.tags.slice(0, 2).map(tag => (<TagBadge key={tag} tag={tag} />))}
                        {item.tags.length > 2 ? <span className="tag-badge-more">+{item.tags.length - 2}</span> : null}
                      </span>
                    ) : null}
                  </span>
                  <span className="secondary">
                    <span className="secondary-code">{item.code}</span>
                    <span className="secondary-badge-slot">
                      {badges.codeRowBadge ? (
                        <span
                          className="signal-badge-wrapper signal-badge-wrapper-code"
                          onMouseEnter={(e) => showSignalTip(
                            e,
                            signalStocks?.[item.code]?.signals,
                            signalStocks?.[item.code]?.name || item.name,
                            signalStocks?.[item.code]?.signalCount ?? 0,
                            tradeSignals?.[item.code] ? { level: tradeSignals[item.code].level, score: tradeSignals[item.code].score } : undefined,
                          )}
                          onMouseLeave={hideSignalTip}
                        >
                          <span className={'stock-badge signal' + (() => { const sc = signalStocks?.[item.code]?.score; return sc != null ? (sc > 0 ? ' signal-up' : sc < 0 ? ' signal-dn' : ' signal-zero') : (tradeSignals?.[item.code] ? ' signal-up' : ''); })()}>技</span>
                        </span>
                      ) : null}
                    </span>
                  </span>
                </td>
                <td
                  className="stock-detail-trigger stock-detail-chart"
                  onClick={() => openStockDetail(item)}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openStockDetail(item); }
                  }}
                >
                  <IntradayChart
                    data={item.intraday?.data ?? []}
                    prevClose={item.prevClose}
                    intradayPrevClose={item.intraday?.prevClose}
                    changePct={item.dailyChangePct}
                  />
                </td>
                <td className="dual-value">
                  <span className={rowPrivacyHidden ? '' : toneClass(item.floatingPnl)}>{rowPrivacyHidden ? hiddenText : formatNumber(item.floatingPnl, 2)}</span>
                  <span className={rowPrivacyHidden ? '' : toneClass(holdingRate)}>{rowPrivacyHidden ? hiddenText : formatPercent(holdingRate)}</span>
                </td>
                <td className="dual-value">
                  <span className={rowPrivacyHidden ? '' : toneClass(item.dailyPnl)}>{rowPrivacyHidden ? hiddenText : formatNumber(item.dailyPnl, 2)}</span>
                  <span className={rowPrivacyHidden ? '' : toneClass(item.dailyChangePct)}>{rowPrivacyHidden ? hiddenText : formatPercent(item.dailyChangePct)}</span>
                </td>
                <td className="dual-value price-cell">
                  {editingCell?.kind === 'stock' && editingCell.code === item.code && editingCell.field === 'cost' ? (
                    <input className="inline-edit-input inline-edit-compact" value={editingCell.value}
                      placeholder="输入成本价" onChange={(e) => updateEditingValue(e.target.value)}
                      onBlur={finishEditing} autoFocus
                      onKeyDown={(e) => { if (e.key === 'Enter') finishEditing(); else if (e.key === 'Escape') cancelEditing(); }}
                    />
                  ) : (
                    <span className={hasCost ? 'cost-line editable-trigger' : 'editable-trigger placeholder-hint'}
                      onClick={(e) => { e.stopPropagation(); startEditing('stock', item.code, 'cost'); }}
                      title="点击编辑成本价"
                    >
                      {rowPrivacyHidden ? hiddenText : (hasCost ? formatNumber(item.cost, 3) : '输入成本价')}
                    </span>
                  )}
                  <span className="price-line">{formatNumber(item.price, 2)}<span style={{ display: 'inline', marginLeft: 6 }} className={toneClass(item.price - item.prevClose)}>{formatPercent(item.prevClose > 0 ? (item.price - item.prevClose) / item.prevClose * 100 : 0)}</span></span>
                  {Number.isFinite(item.addedPrice) && item.addedPrice! > 0 ? (
                    <span style={{ fontSize: 9, color: 'var(--text-1)', opacity: 0.6, lineHeight: 1.2, display: 'inline-flex', gap: 4, alignItems: 'center' }}>
                      <span>关注 {formatNumber(item.addedPrice!, 3)}</span>
                      <span className={toneClass(((item.price - item.addedPrice!) / item.addedPrice!) * 100)}>
                        {formatPercent(((item.price - item.addedPrice!) / item.addedPrice!) * 100)}
                      </span>
                    </span>
                  ) : null}
                </td>
                <td>
                  {editingCell?.kind === 'stock' && editingCell.code === item.code && editingCell.field === 'shares' ? (
                    <input className="inline-edit-input inline-edit-compact" value={editingCell.value}
                      placeholder="输入股数" onChange={(e) => updateEditingValue(e.target.value)}
                      onBlur={finishEditing} autoFocus
                      onKeyDown={(e) => { if (e.key === 'Enter') finishEditing(); else if (e.key === 'Escape') cancelEditing(); }}
                    />
                  ) : (
                    <>
                      <span className={hasShares ? 'editable-trigger' : 'editable-trigger placeholder-hint'}
                        onClick={(e) => { e.stopPropagation(); startEditing('stock', item.code, 'shares'); }}
                        title="点击编辑股数"
                      >
                        {rowPrivacyHidden ? hiddenText : (hasShares ? formatNumber(item.shares, 0) : '输入股数')}
                      </span>
                      {hasPosition && Number.isFinite(holdingAmount) ? (
                        <span style={{ fontSize: 10, color: 'var(--text-1)', opacity: 0.55, display: 'block', marginTop: 2 }}>
                          {rowPrivacyHidden ? hiddenText : `≈¥${formatNumber(holdingAmount, 1)}`}
                        </span>
                      ) : null}
                    </>
                  )}
                </td>
                <td>{rowPrivacyHidden ? hiddenText : formatRatioPercent(positionRatio)}</td>
              </tr>
            );
          })}

          {rows.length === 0 ? (
            <tr>
              <td colSpan={7} className="table-empty-cell">
                {stocksLoading ? '股票数据加载中...' : stocksError || '暂无股票持仓，点击右上角搜索添加股票'}
              </td>
            </tr>
          ) : null}
        </tbody>
      </table>
      <FloatingRefreshBtn onRefresh={onRefresh} spinning={refreshing} />

      {tip ? (
        <div className="signal-tooltip-fixed"
          style={{ left: tip.x, top: tip.y }}
          onMouseEnter={keepTip}
          onMouseLeave={hideSignalTip}
        >
          <div className="signal-tooltip-header">{tip.name}{tip.count > 0 ? ` — ${tip.count} 个信号` : ''}</div>
          {tip.tradeLevel ? (
            <div className="signal-tooltip-item">
              <span className={'severity-tag severity-' + (tip.tradeLevel === 'strong_buy' || tip.tradeLevel === 'buy' ? 'positive' : tip.tradeLevel === 'reduce' || tip.tradeLevel === 'avoid' ? 'negative' : 'info')}>
                {levelLabel(tip.tradeLevel as any)}
              </span>
              <span className="signal-tooltip-label">{tip.tradeScore} 分</span>
            </div>
          ) : null}
          {tip.signals?.slice(0, 15).map((s, i) => (
            <div key={i} className="signal-tooltip-item">
              <span className={'severity-tag severity-' + (s.severity === 'positive' ? 'positive' : s.severity === 'negative' ? 'negative' : 'info')}>
                {s.severity === 'positive' ? '看多' : s.severity === 'negative' ? '看空' : '中性'}
              </span>
              <span className="signal-tooltip-label">{s.label}</span>
            </div>
          ))}
          {tip.signals && tip.signals.length > 15 ? <div className="signal-tooltip-more">还有 {tip.signals.length - 15} 个信号...</div> : null}
        </div>
      ) : null}
    </div>
  );
}
