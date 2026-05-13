import { Fragment } from 'react';
import { GripVertical, Pin, Star, X } from 'lucide-react';
import TagBadge from '../tags/TagBadge';
import FloatingRefreshBtn from './FloatingRefreshBtn';
import { formatNumber, formatLooseNumber, formatPercent, toneClass } from '../utils/format';
import type { FundRow } from '../types';

type EditingCell = {
  kind: 'stock' | 'fund';
  code: string;
  field: 'cost' | 'shares' | 'units';
  value: string;
} | null;

type Props = {
  rows: FundRow[];
  fundPinnedCode: string | null;
  sortingMode: string | null;
  draggingCode: string | null;
  editingCell: EditingCell;
  fundsLoading: boolean;
  fundsError: string;
  fundPositionsLength: number;
  // event handlers
  openFundDetail: (item: FundRow) => void;
  openRowContextMenu: (e: React.MouseEvent, kind: 'stock' | 'fund', code: string) => void;
  startEditing: (kind: 'stock' | 'fund', code: string, field: 'cost' | 'shares' | 'units') => void;
  updateEditingValue: (v: string) => void;
  finishEditing: () => void;
  cancelEditing: () => void;
  handleDragStart: (code: string) => void;
  handleDragEnd: () => void;
  handleFundDrop: (code: string) => void;
  handleFundDropAfterPinned: () => void;
  onRemoveFund: (code: string) => void;
  onRefresh: () => void;
  refreshing: boolean;
};

export default function FundTable({
  rows, fundPinnedCode, sortingMode, draggingCode, editingCell,
  fundsLoading, fundsError, fundPositionsLength,
  openFundDetail, openRowContextMenu, startEditing, updateEditingValue, finishEditing, cancelEditing,
  handleDragStart, handleDragEnd, handleFundDrop, handleFundDropAfterPinned,
  onRemoveFund, onRefresh, refreshing,
}: Props) {
  return (
    <div className="table-panel">
      <table className="data-table fund-table">
        <thead>
          <tr>
            <th>基金名称</th>
            <th><span className="stacked-th"><span>持仓净值</span><span>估算净值</span></span></th>
            <th>持有额</th>
            <th>持有收益</th>
            <th>持有收益率</th>
            <th>涨跌幅</th>
            <th>估算收益</th>
            <th>更新时间</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((item) => {
            const isLockedPinned = sortingMode === 'funds' && item.code === fundPinnedCode;
            const hasFundCost = item.cost > 0;
            const hasFundUnits = item.units > 0;
            return (
            <Fragment key={item.code}>
            <tr
              onContextMenu={(event) => openRowContextMenu(event, 'fund', item.code)}
              className={[
                sortingMode === 'funds' ? 'sorting-row' : '',
                draggingCode === item.code ? 'dragging-row' : '',
                isLockedPinned ? 'locked-row' : '',
              ].filter(Boolean).join(' ')}
              draggable={sortingMode === 'funds' && !isLockedPinned}
              onDragStart={() => handleDragStart(item.code)}
              onDragEnd={handleDragEnd}
              onDragOver={(event) => { if (sortingMode === 'funds') event.preventDefault(); }}
              onDrop={() => handleFundDrop(item.code)}
            >
              <td
                className={`name-col fund-detail-trigger ${item.special ? 'special-row' : ''}`}
                onClick={() => { if (sortingMode === 'funds') return; openFundDetail(item); }}
                role="button"
                tabIndex={sortingMode === 'funds' ? -1 : 0}
                onKeyDown={(e) => {
                  if (sortingMode === 'funds') return;
                  if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openFundDetail(item); }
                }}
              >
                <button type="button" className="remove-stock-btn" title="移除自选"
                  onClick={(e) => { e.stopPropagation(); onRemoveFund(item.code); }}
                ><X size={10} strokeWidth={1} /></button>
                <span className="primary" title={item.name}>
                  <span className="name-inline">
                    {sortingMode === 'funds' ? (
                      <span className={`drag-handle ${isLockedPinned ? 'disabled' : ''}`}><GripVertical size={12} /></span>
                    ) : null}
                    {item.navDisclosedToday ? (
                      <span className="fund-disclosed-check" aria-label="当日净值已披露" title={`当日净值已披露${item.navDate ? `：${item.navDate}` : ''}`}>✓</span>
                    ) : null}
                    {item.special ? <Star size={10} className="special-star-icon" aria-hidden="true" /> : null}
                    <span className="name-text">{item.name}</span>
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
              <td className="dual-value price-cell">
                {editingCell?.kind === 'fund' && editingCell.code === item.code && editingCell.field === 'cost' ? (
                  <input className="inline-edit-input inline-edit-compact" value={editingCell.value}
                    placeholder="输入持仓净值" onChange={(e) => updateEditingValue(e.target.value)}
                    onBlur={finishEditing} autoFocus
                    onKeyDown={(e) => { if (e.key === 'Enter') finishEditing(); else if (e.key === 'Escape') cancelEditing(); }}
                  />
                ) : (
                  <span className={hasFundCost ? 'cost-line editable-trigger' : 'editable-trigger placeholder-hint'}
                    onClick={(e) => { e.stopPropagation(); startEditing('fund', item.code, 'cost'); }}
                  >
                    {hasFundCost ? formatLooseNumber(item.cost, 4) : '输入持仓净值'}
                  </span>
                )}
                <span className="price-line">{Number.isFinite(item.estimatedNav) ? item.estimatedNav.toFixed(4) : '-'}</span>
                {Number.isFinite(item.addedNav) && item.addedNav! > 0 ? (
                  <span style={{ fontSize: 9, color: 'var(--text-1)', opacity: 0.6, lineHeight: 1.2, display: 'inline-flex', gap: 4, alignItems: 'center' }}>
                    <span>关注 {item.addedNav!.toFixed(4)}</span>
                    <span className={toneClass(((item.estimatedNav - item.addedNav!) / item.addedNav!) * 100)}>
                      {formatPercent(((item.estimatedNav - item.addedNav!) / item.addedNav!) * 100)}
                    </span>
                  </span>
                ) : null}
              </td>
              <td>
                {editingCell?.kind === 'fund' && editingCell.code === item.code && editingCell.field === 'units' ? (
                  <input className="inline-edit-input inline-edit-compact" value={editingCell.value}
                    placeholder="输入持有额" onChange={(e) => updateEditingValue(e.target.value)}
                    onBlur={finishEditing} autoFocus
                    onKeyDown={(e) => { if (e.key === 'Enter') finishEditing(); else if (e.key === 'Escape') cancelEditing(); }}
                  />
                ) : (
                  <span className={hasFundUnits ? 'editable-trigger' : 'editable-trigger placeholder-hint'}
                    onClick={(e) => { e.stopPropagation(); startEditing('fund', item.code, 'units'); }}
                  >
                    {hasFundUnits ? formatLooseNumber(item.units, 4) : '输入持有额'}
                  </span>
                )}
              </td>
              <td className={toneClass(item.holdingProfit)}>{formatNumber(item.holdingProfit, 2)}</td>
              <td className={toneClass(item.holdingProfitRate)}>{formatPercent(item.holdingProfitRate)}</td>
              <td className={toneClass(item.changePct)}>{formatPercent(item.changePct)}</td>
              <td className={toneClass(item.estimatedProfit)}>{formatNumber(item.estimatedProfit, 2)}</td>
              <td>{item.updatedAt}</td>
            </tr>
            {sortingMode === 'funds' && isLockedPinned ? (
              <tr className={`sort-insert-row ${draggingCode ? 'active' : ''}`}
                onDragOver={(event) => event.preventDefault()}
                onDrop={handleFundDropAfterPinned}
              >
                <td colSpan={8}>拖到这里可排到置顶后</td>
              </tr>
            ) : null}
            </Fragment>
          )})}

          {fundsLoading && fundPositionsLength === 0 ? (
            <>
              <tr className="skeleton-row"><td className="skeleton-cell"><div className="skeleton-bar medium" /></td><td className="skeleton-cell"><div className="skeleton-bar short" /></td><td className="skeleton-cell"><div className="skeleton-bar" /></td><td className="skeleton-cell"><div className="skeleton-bar short" /></td><td className="skeleton-cell"><div className="skeleton-bar short" /></td><td className="skeleton-cell"><div className="skeleton-bar short" /></td><td className="skeleton-cell"><div className="skeleton-bar short" /></td><td className="skeleton-cell"><div className="skeleton-bar short" /></td></tr>
              <tr className="skeleton-row"><td className="skeleton-cell"><div className="skeleton-bar medium" /></td><td className="skeleton-cell"><div className="skeleton-bar short" /></td><td className="skeleton-cell"><div className="skeleton-bar" /></td><td className="skeleton-cell"><div className="skeleton-bar short" /></td><td className="skeleton-cell"><div className="skeleton-bar short" /></td><td className="skeleton-cell"><div className="skeleton-bar short" /></td><td className="skeleton-cell"><div className="skeleton-bar short" /></td><td className="skeleton-cell"><div className="skeleton-bar short" /></td></tr>
            </>
          ) : rows.length === 0 ? (
            <tr><td colSpan={8} className="table-empty-cell">{fundsError || '暂无基金持仓，点击右上角搜索添加基金'}</td></tr>
          ) : null}
        </tbody>
      </table>
      <FloatingRefreshBtn onRefresh={onRefresh} spinning={refreshing} />
    </div>
  );
}
