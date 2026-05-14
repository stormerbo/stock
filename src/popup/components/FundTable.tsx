import { Pin, Star, X, ArrowUpDown, ArrowUp, ArrowDown } from 'lucide-react';
import TagBadge from '../tags/TagBadge';
import FloatingRefreshBtn from './FloatingRefreshBtn';
import { formatNumber, formatLooseNumber, formatPercent, toneClass } from '../utils/format';
import type { FundRow, FundSortKey, ColumnSort } from '../types';

type EditingCell = {
  kind: 'stock' | 'fund';
  code: string;
  field: 'cost' | 'shares' | 'units';
  value: string;
} | null;

type Props = {
  rows: FundRow[];
  fundPinnedCode: string | null;
  sort: ColumnSort<FundSortKey>;
  onToggleSort: (key: FundSortKey) => void;
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
  onRemoveFund: (code: string) => void;
  onRefresh: () => void;
  refreshing: boolean;
};

function SortTh({
  children, sortKey, currentSort, onToggle,
}: {
  children: React.ReactNode;
  sortKey: FundSortKey;
  currentSort: ColumnSort<FundSortKey>;
  onToggle: (k: FundSortKey) => void;
}) {
  const active = currentSort.key === sortKey;
  const dir = active ? currentSort.dir : null;
  const Icon = active && dir === 'asc' ? ArrowUp : active && dir === 'desc' ? ArrowDown : ArrowUpDown;
  return (
    <th className={`sortable-th${active ? ' active' : ''}`} onClick={() => onToggle(sortKey)}>
      {children}
      <Icon size={11} className="sort-icon" />
    </th>
  );
}

export default function FundTable({
  rows, fundPinnedCode, sort, onToggleSort, draggingCode, editingCell,
  fundsLoading, fundsError, fundPositionsLength,
  openFundDetail, openRowContextMenu, startEditing, updateEditingValue, finishEditing, cancelEditing,
  handleDragStart, handleDragEnd, handleFundDrop,
  onRemoveFund, onRefresh, refreshing,
}: Props) {
  return (
    <div className="table-panel">
      <table className="data-table fund-table">
        <thead>
          <tr>
            <SortTh sortKey="name" currentSort={sort} onToggle={onToggleSort}>基金名称</SortTh>
            <SortTh sortKey="estimatedNav" currentSort={sort} onToggle={onToggleSort}><span className="stacked-th"><span>持仓净值</span><span>估算净值</span></span></SortTh>
            <SortTh sortKey="holdingAmount" currentSort={sort} onToggle={onToggleSort}>持有额</SortTh>
            <SortTh sortKey="holdingProfit" currentSort={sort} onToggle={onToggleSort}>持有收益</SortTh>
            <SortTh sortKey="holdingProfitRate" currentSort={sort} onToggle={onToggleSort}>持有收益率</SortTh>
            <SortTh sortKey="changePct" currentSort={sort} onToggle={onToggleSort}>涨跌幅</SortTh>
            <SortTh sortKey="estimatedProfit" currentSort={sort} onToggle={onToggleSort}>估算收益</SortTh>
            <th>更新时间</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((item) => {
            const isPinned = item.code === fundPinnedCode;
            const hasFundCost = item.cost > 0;
            const hasFundUnits = item.units > 0;
            return (
            <tr
              onContextMenu={(event) => openRowContextMenu(event, 'fund', item.code)}
              className={[
                draggingCode === item.code ? 'dragging-row' : '',
                isPinned ? 'locked-row' : '',
              ].filter(Boolean).join(' ')}
              draggable={!isPinned}
              onDragStart={() => handleDragStart(item.code)}
              onDragEnd={handleDragEnd}
              onDragOver={(event) => event.preventDefault()}
              onDrop={() => handleFundDrop(item.code)}
            >
              <td
                className={`name-col fund-detail-trigger ${item.special ? 'special-row' : ''}`}
                onClick={() => openFundDetail(item)}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openFundDetail(item); }
                }}
              >
                <button type="button" className="remove-stock-btn" title="移除自选"
                  onClick={(e) => { e.stopPropagation(); onRemoveFund(item.code); }}
                ><X size={10} strokeWidth={1} /></button>
                <span className="primary" title={item.name}>
                  <span className="name-inline">
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
                  <>
                    <span className={hasFundUnits ? 'editable-trigger' : 'editable-trigger placeholder-hint'}
                      onClick={(e) => { e.stopPropagation(); startEditing('fund', item.code, 'units'); }}
                    >
                      {hasFundUnits ? formatLooseNumber(item.units, 4) : '输入持有额'}
                    </span>
                    {hasFundUnits && Number.isFinite(item.holdingAmount) ? (
                      <div style={{ fontSize: 10, color: 'var(--text-2)', lineHeight: 1.4, marginTop: 1 }}>
                        ≈{formatNumber(item.holdingAmount, 2)}
                      </div>
                    ) : null}
                  </>
                )}
              </td>
              <td className={toneClass(item.holdingProfit)}>{formatNumber(item.holdingProfit, 2)}</td>
              <td className={toneClass(item.holdingProfitRate)}>{formatPercent(item.holdingProfitRate)}</td>
              <td className={toneClass(item.changePct)}>{formatPercent(item.changePct)}</td>
              <td className={toneClass(item.estimatedProfit)}>{formatNumber(item.estimatedProfit, 2)}</td>
              <td>{item.updatedAt}</td>
            </tr>
          );
          })}

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
