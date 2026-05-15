import { memo, type DragEvent } from 'react';
import IntradayChart from '../../popup/components/IntradayChart';

type Props = {
  name: string;
  code: string;
  price: number;
  changePct: number;
  intradayData: Array<{ time: string; price: number }>;
  intradayPrevClose?: number;
  prevClose: number;
  index: number;
  onSelect: (code: string) => void;
  onDragStart: (e: DragEvent<HTMLDivElement>, index: number) => void;
  onDragOver: (e: DragEvent<HTMLDivElement>, index: number) => void;
  onDrop: (e: DragEvent<HTMLDivElement>, index: number) => void;
};

function tone(value: number): string {
  if (value > 0) return 'up';
  if (value < 0) return 'down';
  return '';
}

function formatPrice(v: number): string {
  return Number.isFinite(v) ? v.toFixed(2) : '--';
}

function formatChangePct(v: number): string {
  if (!Number.isFinite(v)) return '--';
  const sign = v > 0 ? '+' : '';
  return `${sign}${v.toFixed(2)}%`;
}

const StockCard = memo(function StockCard({
  name, code, price, changePct, intradayData, intradayPrevClose, prevClose,
  index, onSelect, onDragStart, onDragOver, onDrop,
}: Props) {
  const t = tone(changePct);
  return (
    <div
      className="stock-card"
      draggable
      onClick={() => onSelect(code)}
      onDragStart={(e) => onDragStart(e, index)}
      onDragOver={(e) => onDragOver(e, index)}
      onDrop={(e) => onDrop(e, index)}
    >
      <span className={`stock-card-accent ${t}`} />
      <div className="stock-card-info">
        <span className="stock-card-name">{name}</span>
        <span className="stock-card-code">{code}</span>
      </div>
      <div className="stock-card-chart">
        <IntradayChart
          data={intradayData}
          prevClose={prevClose}
          intradayPrevClose={intradayPrevClose}
          changePct={changePct}
          width={88}
          height={28}
        />
      </div>
      <div className="stock-card-price">
        <div className="stock-card-price-value">{formatPrice(price)}</div>
        <div className={`stock-card-price-change color-${t}`}>{formatChangePct(changePct)}</div>
      </div>
    </div>
  );
});

export default StockCard;
