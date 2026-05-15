import IntradayChart from '../../popup/components/IntradayChart';

type Props = {
  name: string;
  code: string;
  price: number;
  changePct: number;
  prevClose: number;
  intradayData: Array<{ time: string; price: number }>;
  intradayPrevClose?: number;
  onBack: () => void;
};

function formatPrice(v: number): string {
  return Number.isFinite(v) ? v.toFixed(2) : '--';
}

function formatChangePct(v: number): string {
  if (!Number.isFinite(v)) return '--';
  const sign = v > 0 ? '+' : '';
  return `${sign}${v.toFixed(2)}%`;
}

function tone(value: number): string {
  if (value > 0) return 'up';
  if (value < 0) return 'down';
  return '';
}

export default function StockDetail({
  name, code, price, changePct, prevClose, intradayData, intradayPrevClose, onBack,
}: Props) {
  const t = tone(changePct);
  return (
    <div className="stock-detail">
      <div className="stock-detail-header">
        <button className="float-btn stock-detail-back" onClick={onBack} type="button">
          ←
        </button>
        <div className="stock-detail-title">
          <span className="stock-detail-name">{name}</span>
          <span className="stock-detail-code">{code}</span>
        </div>
        <div className={`stock-detail-price-section ${t ? `color-${t}` : ''}`}>
          <span className="stock-detail-price">{formatPrice(price)}</span>
          <span className="stock-detail-change">{formatChangePct(changePct)}</span>
        </div>
      </div>
      <div className="stock-detail-chart-wrap">
        <IntradayChart
          data={intradayData}
          prevClose={prevClose}
          intradayPrevClose={intradayPrevClose}
          changePct={changePct}
          width={280}
          height={90}
        />
      </div>
    </div>
  );
}
