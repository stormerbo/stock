import { useState, useRef } from 'react';
import { cn } from '@/utils/cn';
import { formatNumber, getColorClass } from '@/utils/format';
import { generateMiniChart } from '@/utils/stock';
import { ProfitCell } from './ProfitCell';
import { PositionBar } from './PositionBar';
import { ContextMenu } from './ContextMenu';
import { Pin, Trash2, Star } from 'lucide-react';
import type { HoldingWithQuote, StockQuote } from '@/types';
import type { SortField, SortOrder } from '@/types';

interface StockTableProps {
  holdings: HoldingWithQuote[];
  colorMode: 'red-up' | 'green-up';
  sortField: SortField;
  sortOrder: SortOrder;
  onSort: (field: SortField) => void;
  onTogglePin: (code: string) => void;
  onToggleWatch: (code: string) => void;
  onUpdate: (code: string, costPrice: number, shares: number) => void;
  onDelete: (code: string) => void;
}

const sortableColumns: { field: SortField; label: string; width: string }[] = [
  { field: 'default', label: '股票', width: 'w-36' },
  { field: 'profit', label: '盈亏', width: 'w-24' },
  { field: 'daily', label: '当日盈亏', width: 'w-24' },
  { field: 'position', label: '仓位比', width: 'w-20' },
];

export function StockTable({
  holdings,
  colorMode,
  sortField,
  sortOrder,
  onSort,
  onTogglePin,
  onToggleWatch,
  onUpdate,
  onDelete,
}: StockTableProps) {
  const [editingCell, setEditingCell] = useState<{ code: string; field: 'costPrice' | 'shares' } | null>(null);

  return (
    <table className="w-full text-sm">
      <thead>
        <tr className="bg-gray-50 border-b border-gray-100">
          {sortableColumns.map((col) => (
            <th
              key={col.field}
              className={cn(
                'py-3 px-2 text-left font-medium text-gray-600',
                col.width,
                col.field !== 'default' && 'cursor-pointer hover:text-primary-500'
              )}
              onClick={() => col.field !== 'default' && onSort(col.field)}
            >
              <span className="flex items-center gap-1">
                {col.label}
                {col.field !== 'default' && (
                  <span className="text-xs opacity-50">
                    {sortField === col.field
                      ? sortOrder === 'asc'
                        ? '↑'
                        : '↓'
                      : '↕'}
                  </span>
                )}
              </span>
            </th>
          ))}
          <th className="py-3 px-2 text-left font-medium text-gray-600 w-16">分时</th>
          <th className="py-3 px-2 text-left font-medium text-gray-600 w-24">成本/现价</th>
          <th className="py-3 px-2 text-left font-medium text-gray-600 w-16">持仓</th>
          <th className="py-3 px-2 text-left font-medium text-gray-600 w-10"></th>
        </tr>
      </thead>
      <tbody>
        {holdings.map((holding) => (
          <StockRow
            key={holding.code}
            holding={holding}
            colorMode={colorMode}
            editingCell={editingCell}
            setEditingCell={setEditingCell}
            onTogglePin={onTogglePin}
            onToggleWatch={onToggleWatch}
            onUpdate={onUpdate}
            onDelete={onDelete}
          />
        ))}
      </tbody>
    </table>
  );
}

interface StockRowProps {
  holding: HoldingWithQuote;
  colorMode: 'red-up' | 'green-up';
  editingCell: { code: string; field: 'costPrice' | 'shares' } | null;
  setEditingCell: (cell: { code: string; field: 'costPrice' | 'shares' } | null) => void;
  onTogglePin: (code: string) => void;
  onToggleWatch: (code: string) => void;
  onUpdate: (code: string, costPrice: number, shares: number) => void;
  onDelete: (code: string) => void;
}

function StockRow({
  holding,
  colorMode,
  editingCell,
  setEditingCell,
  onTogglePin,
  onToggleWatch,
  onUpdate,
  onDelete,
}: StockRowProps) {
  const [costValue, setCostValue] = useState(holding.costPrice.toString());
  const [sharesValue, setSharesValue] = useState(holding.shares.toString());
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number } | null>(null);
  const isEditingCost = editingCell?.code === holding.code && editingCell?.field === 'costPrice';
  const isEditingShares = editingCell?.code === holding.code && editingCell?.field === 'shares';

  const handleSave = () => {
    const cost = parseFloat(costValue) || 0;
    const shares = parseInt(sharesValue) || 0;
    onUpdate(holding.code, cost, shares);
    setEditingCell(null);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleSave();
    } else if (e.key === 'Escape') {
      setCostValue(holding.costPrice.toString());
      setSharesValue(holding.shares.toString());
      setEditingCell(null);
    }
  };

  const handleContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    setContextMenu({ x: e.clientX, y: e.clientY });
  };

  const handleCloseContextMenu = () => {
    setContextMenu(null);
  };

  return (
    <>
      <tr
        onContextMenu={handleContextMenu}
        className={cn(
          'border-b border-gray-50 hover:bg-gray-50/50 group cursor-context-menu',
          holding.pinned && 'bg-amber-50/50 hover:bg-amber-50',
          holding.watched && 'bg-red-50/30 hover:bg-red-50/50'
        )}
      >
        <td className="py-3 px-2">
          <div className="flex items-center gap-2">
            <button
              onClick={() => onTogglePin(holding.code)}
              className={cn(
                'opacity-30 hover:opacity-100 transition-opacity',
                holding.pinned && 'opacity-100 text-amber-500'
              )}
            >
              <Pin size={14} className={cn(holding.pinned && 'fill-current')} />
            </button>
            <div>
              <div className="font-medium flex items-center gap-1">
                {holding.name || holding.code}
                {holding.watched && (
                  <Star size={12} className="text-red-500 fill-red-500" />
                )}
                {getMarketTag(holding.code)}
              </div>
              <div className="text-xs text-gray-400">
                {holding.marketValue > 0 ? formatNumber(holding.marketValue, 0) : '-'}
              </div>
            </div>
          </div>
        </td>
        <td className="py-3 px-2">
          <ProfitCell
            value={holding.profit}
            percent={holding.profitPct}
            showZero={holding.costPrice > 0 && holding.shares > 0}
            colorMode={colorMode}
          />
        </td>
        <td className="py-3 px-2">
          <ProfitCell
            value={holding.dailyProfit}
            percent={holding.dailyProfitPct}
            showZero={!!holding.quote}
            colorMode={colorMode}
          />
        </td>
        <td className="py-3 px-2">
          <PositionBar ratio={holding.positionRatio} />
        </td>
        <td className="py-3 px-2">
          <div
            className="w-16 h-8"
            dangerouslySetInnerHTML={{
              __html: generateMiniChart(
                generateIntradayData(holding.quote),
                70,
                32,
                holding.quote?.open,
                holding.quote ? (holding.quote.open + holding.quote.close) / 2 : undefined
              ),
            }}
          />
        </td>
        <td className="py-3 px-2">
          <div className="flex flex-col gap-0.5">
            <span
              className={cn(
                'font-medium',
                getColorClass(
                  (holding.quote?.close || 0) - (holding.quote?.preClose || 0),
                  colorMode
                )
              )}
            >
              {holding.currentPrice > 0 ? formatNumber(holding.currentPrice) : '-'}
            </span>
            {isEditingCost ? (
              <input
                type="number"
                step="0.01"
                value={costValue}
                onChange={(e) => setCostValue(e.target.value)}
                onBlur={handleSave}
                onKeyDown={handleKeyDown}
                autoFocus
                className="w-20 px-1 py-0.5 text-xs border border-primary-500 rounded focus:outline-none"
              />
            ) : (
              <button
                onClick={() => {
                  setCostValue(holding.costPrice.toString());
                  setEditingCell({ code: holding.code, field: 'costPrice' });
                }}
                className="text-xs text-gray-400 hover:text-primary-500 hover:underline text-left"
                title="点击编辑成本价"
              >
                {holding.costPrice > 0 ? formatNumber(holding.costPrice) : '未设置'}
              </button>
            )}
          </div>
        </td>
        <td className="py-3 px-2">
          {isEditingShares ? (
            <input
              type="number"
              step="1"
              value={sharesValue}
              onChange={(e) => setSharesValue(e.target.value)}
              onBlur={handleSave}
              onKeyDown={handleKeyDown}
              autoFocus
              className="w-16 px-1 py-0.5 text-xs border border-primary-500 rounded focus:outline-none"
            />
          ) : (
            <button
              onClick={() => {
                setSharesValue(holding.shares.toString());
                setEditingCell({ code: holding.code, field: 'shares' });
              }}
              className="text-sm hover:text-primary-500 hover:underline text-left"
              title="点击编辑持仓数量"
            >
              {holding.shares > 0 ? holding.shares : '-'}
            </button>
          )}
        </td>
        <td className="py-3 px-2">
          <button
            onClick={() => onDelete(holding.code)}
            className="opacity-0 group-hover:opacity-100 p-1 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded transition-all"
            title="删除"
          >
            <Trash2 size={14} />
          </button>
        </td>
      </tr>

      <ContextMenu
        isOpen={!!contextMenu}
        x={contextMenu?.x || 0}
        y={contextMenu?.y || 0}
        pinned={holding.pinned}
        watched={holding.watched}
        onClose={handleCloseContextMenu}
        onTogglePin={() => {
          onTogglePin(holding.code);
          handleCloseContextMenu();
        }}
        onEditSort={() => {
          // 编辑排序 - 可以打开一个排序输入框
          handleCloseContextMenu();
        }}
        onToggleWatch={() => {
          onToggleWatch(holding.code);
          handleCloseContextMenu();
        }}
        onDelete={() => {
          onDelete(holding.code);
          handleCloseContextMenu();
        }}
      />
    </>
  );
}

function getMarketTag(code: string) {
  const first = code.charAt(0);
  const tags: Record<string, string> = { '0': '深', '3': '创', '6': '沪', '4': '北', '8': '北' };
  if (tags[first]) {
    return (
      <span className="text-[10px] px-1 py-0.5 bg-primary-50 text-primary-500 rounded">
        {tags[first]}
      </span>
    );
  }
  return null;
}

// 生成分时数据（使用 open/high/low/close 模拟日内走势）
function generateIntradayData(quote: StockQuote | undefined): number[] {
  if (!quote) {
    return [0, 0, 0, 0, 0];
  }

  const { open, high, low, close, preClose } = quote;
  const points: number[] = [];
  const numPoints = 30;

  let currentPrice = open;
  const volatility = (high - low) / numPoints;

  for (let i = 0; i < numPoints; i++) {
    const progress = i / (numPoints - 1);
    const targetPrice = low + (high - low) * Math.sin(progress * Math.PI);
    const randomMove = (Math.random() - 0.5) * volatility;
    currentPrice = currentPrice * 0.7 + targetPrice * 0.3 + randomMove;
    currentPrice = Math.max(low, Math.min(high, currentPrice));

    if (i === numPoints - 1) {
      currentPrice = close;
    }

    points.push(currentPrice);
  }

  return points;
}
