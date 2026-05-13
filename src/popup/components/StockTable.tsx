import { Fragment } from 'react';
import { GripVertical, Pin, Star, X } from 'lucide-react';
import TagBadge from '../tags/TagBadge';
import IntradayChart from './IntradayChart';
import FloatingRefreshBtn from './FloatingRefreshBtn';
import { formatNumber, formatPercent, formatRatioPercent, toneClass } from '../utils/format';
import type { StockRow } from '../types';

type EditingCell = {
  kind: 'stock' | 'fund';
  code: string;
  field: 'cost' | 'shares' | 'units';
  value: string;
} | null;

type Props = {
  rows: StockRow[];
  stockPinnedCode: string | null;
  sortingMode: string | null;
  draggingCode: string | null;
  editingCell: EditingCell;
  signalStocks: Record<string, { name: string; signalCount: number }> | null;
  stocksLoading: boolean;
  stocksError: string;
  stockTotalHoldingAmount: number;
  // event handlers
  openStockDetail: (item: StockRow) => void;
  openRowContextMenu: (e: React.MouseEvent, kind: 'stock' | 'fund', code: string) => void;
  startEditing: (kind: 'stock' | 'fund', code: string, field: 'cost' | 'shares' | 'units') => void;
  updateEditingValue: (v: string) => void;
  finishEditing: () => void;
  cancelEditing: () => void;
  handleDragStart: (code: string) => void;
  handleDragEnd: () => void;
  handleStockDrop: (code: string) => void;
  handleStockDropAfterPinned: () => void;
  onRemoveStock: (code: string) => void;
  getStockBadge: (code: string) => { label: string; tone: 'growth' | 'tech' | 'beijing' } | null;
  onRefresh: () => void;
  refreshing: boolean;
};

export default function StockTable({
  rows, stockPinnedCode, sortingMode, draggingCode, editingCell,
  signalStocks, stocksLoading, stocksError, stockTotalHoldingAmount,
  openStockDetail, openRowContextMenu, startEditing, updateEditingValue, finishEditing, cancelEditing,
  handleDragStart, handleDragEnd, handleStockDrop, handleStockDropAfterPinned,
  onRemoveStock, getStockBadge, onRefresh, refreshing,
}: Props) {
  return (
    <div className="table-panel">
      <table className="data-table stock-table">
        <thead>
          <tr>
            <th>股票</th>
            <th>分时图</th>
            <th>盈亏</th>
            <th>当日盈亏</th>
            <th>成本/现价</th>
            <th>持仓股数</th>
            <th>仓位比</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((item) => {
            const hasShares = item.shares > 0;
            const hasCost = item.cost > 0;
            const hasPosition = hasShares && hasCost;
            const badge = getStockBadge(item.code);
            const isLockedPinned = sortingMode === 'stocks' && item.code === stockPinnedCode;
            const holdingAmount = hasPosition && Number.isFinite(item.price)
              ? item.price * item.shares
              : Number.NaN;
            const holdingRate = hasPosition && Number.isFinite(item.price)
              ? ((item.price - item.cost) / item.cost) * 100
              : Number.NaN;
            const positionRatio = stockTotalHoldingAmount > 0 && Number.isFinite(holdingAmount)
              ? (holdingAmount / stockTotalHoldingAmount) * 100
              : Number.NaN;

            return (
              <Fragment key={item.code}>
              <tr
                className={[
                  editingCell?.code === item.code ? 'editing-row' : '',
                  sortingMode === 'stocks' ? 'sorting-row' : '',
                  draggingCode === item.code ? 'dragging-row' : '',
                  isLockedPinned ? 'locked-row' : '',
                ].filter(Boolean).join(' ')}
                onContextMenu={(event) => openRowContextMenu(event, 'stock', item.code)}
                draggable={sortingMode === 'stocks' && !isLockedPinned}
                onDragStart={() => handleDragStart(item.code)}
                onDragEnd={handleDragEnd}
                onDragOver={(event) => {
                  if (sortingMode === 'stocks') event.preventDefault();
                }}
                onDrop={() => handleStockDrop(item.code)}
              >
                <td
                  className={`name-col stock-detail-trigger ${item.special ? 'special-row' : ''}`}
                  onClick={() => { if (sortingMode === 'stocks') return; openStockDetail(item); }}
                  role="button"
                  tabIndex={sortingMode === 'stocks' ? -1 : 0}
                  onKeyDown={(e) => {
                    if (sortingMode === 'stocks') return;
                    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openStockDetail(item); }
                  }}
                >
                  <button type="button" className="remove-stock-btn" title="移除自选"
                    onClick={(e) => { e.stopPropagation(); onRemoveStock(item.code); }}
                  ><X size={10} strokeWidth={1} /></button>
                  <span className="primary">
                    <span className="name-inline">
                      {sortingMode === 'stocks' ? (
                        <span className={`drag-handle ${isLockedPinned ? 'disabled' : ''}`}>
                          <GripVertical size={12} />
                        </span>
                      ) : null}
                      {item.special ? <Star size={10} className="special-star-icon" aria-hidden="true" /> : null}
                      <span className={`name-text ${toneClass(item.dailyChangePct)}`}>{item.name || item.code}</span>
                      {badge ? <span className={`stock-badge ${badge.tone}`}>{badge.label}</span> : null}
                      {signalStocks?.[item.code] ? (
                        <span className="stock-badge signal" title={`${signalStocks[item.code].signalCount} 个技术信号`}>技</span>
                      ) : null}
                      {item.pinned ? <Pin size={10} className="pinned-flag" /> : null}
                    </span>
                    {item.tags.length > 0 ? (
                      <span className="tag-row">
                        {item.tags.slice(0, 2).map(tag => (<TagBadge key={tag} tag={tag} />))}
                        {item.tags.length > 2 ? <span className="tag-badge-more">+{item.tags.length - 2}</span> : null}
                      </span>
                    ) : null}
                  </span>
                  <span className="secondary">{item.code}</span>
                </td>
                <td
                  className="stock-detail-trigger stock-detail-chart"
                  onClick={() => { if (sortingMode === 'stocks') return; openStockDetail(item); }}
                  role="button"
                  tabIndex={sortingMode === 'stocks' ? -1 : 0}
                  onKeyDown={(e) => {
                    if (sortingMode === 'stocks') return;
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
                  <span className={toneClass(item.floatingPnl)}>{formatNumber(item.floatingPnl, 1)}</span>
                  <span className={toneClass(holdingRate)}>{formatPercent(holdingRate)}</span>
                </td>
                <td className="dual-value">
                  <span className={toneClass(item.dailyPnl)}>{formatNumber(item.dailyPnl, 0)}</span>
                  <span className={toneClass(item.dailyChangePct)}>{formatPercent(item.dailyChangePct)}</span>
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
                      {hasCost ? formatNumber(item.cost, 3) : '输入成本价'}
                    </span>
                  )}
                  <span className="price-line">{formatNumber(item.price, 2)}<span style={{ display: 'inline', marginLeft: 6 }} className={toneClass(item.dailyChangePct)}>{formatPercent(item.dailyChangePct)}</span></span>
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
                    <span className={hasShares ? 'editable-trigger' : 'editable-trigger placeholder-hint'}
                      onClick={(e) => { e.stopPropagation(); startEditing('stock', item.code, 'shares'); }}
                      title="点击编辑股数"
                    >
                      {hasShares ? formatNumber(item.shares, 0) : '输入股数'}
                    </span>
                  )}
                </td>
                <td>{formatRatioPercent(positionRatio)}</td>
              </tr>
              {sortingMode === 'stocks' && isLockedPinned ? (
                <tr className={`sort-insert-row ${draggingCode ? 'active' : ''}`}
                  onDragOver={(event) => event.preventDefault()}
                  onDrop={handleStockDropAfterPinned}
                >
                  <td colSpan={7}>拖到这里可排到置顶后</td>
                </tr>
              ) : null}
              </Fragment>
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
    </div>
  );
}
