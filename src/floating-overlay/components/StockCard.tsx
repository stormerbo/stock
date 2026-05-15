import { memo } from 'react';
import IntradayChart from '../../popup/components/IntradayChart';

type Props = {
  name: string;
  code: string;
  price: number;
  changePct: number;
  intradayData: Array<{ time: string; price: number }>;
  intradayPrevClose?: number;
  prevClose: number;
};

function toneClass(value: number): string {
  if (value > 0) return 'color-up';
  if (value < 0) return 'color-down';
  return '';
}

function formatPrice(value: number): string {
  if (!Number.isFinite(value)) return '--';
  return value.toFixed(2);
}

function formatChangePct(value: number): string {
  if (!Number.isFinite(value)) return '--';
  const sign = value > 0 ? '+' : '';
  return `${sign}${value.toFixed(2)}%`;
}

const StockCard = memo(function StockCard({
  name, code, price, changePct, intradayData, intradayPrevClose, prevClose,
}: Props) {
  return (
    <div className="stock-card">
      <div className="stock-card-info">
        <div className="stock-card-name">{name}</div>
        <div className="stock-card-code">{code}</div>
      </div>
      <div className="stock-card-price">
        <div className="stock-card-price-value">{formatPrice(price)}</div>
        <div className={`stock-card-price-change ${toneClass(changePct)}`}>
          {formatChangePct(changePct)}
        </div>
      </div>
      <div className="stock-card-chart">
        <IntradayChart
          data={intradayData}
          prevClose={prevClose}
          intradayPrevClose={intradayPrevClose}
          changePct={changePct}
          width={100}
          height={28}
        />
      </div>
    </div>
  );
});

export default StockCard;
