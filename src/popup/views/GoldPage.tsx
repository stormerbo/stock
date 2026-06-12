import type { GoldQuote } from '../types';
import { formatNumber } from '../utils/format';

type Props = {
  quotes: GoldQuote[];
  onOpenDetail: (quote: GoldQuote) => void;
};

const SECTION_ORDER: Array<{ key: GoldQuote['market']; title: string }> = [
  { key: 'domestic', title: '国内金价' },
  { key: 'international', title: '国际金价' },
];

function formatSignedNumber(value: number, digits = 2): string {
  if (!Number.isFinite(value)) return '--';
  const abs = formatNumber(Math.abs(value), digits);
  return `${value > 0 ? '+' : value < 0 ? '-' : ''}${abs}`;
}

function toneClass(value: number): '' | 'up' | 'down' {
  if (!Number.isFinite(value)) return '';
  if (value > 0) return 'up';
  if (value < 0) return 'down';
  return '';
}

function renderTable(items: GoldQuote[], onOpenDetail: (quote: GoldQuote) => void) {
  if (items.length === 0) {
    return (
      <div className="table-panel">
        <div className="table-empty-cell">金价数据暂不可用</div>
      </div>
    );
  }

  return (
    <div className="table-panel">
      <table className="data-table fund-table">
        <thead>
          <tr>
            <th>品种</th>
            <th>最新价</th>
            <th>涨跌额</th>
            <th>涨跌幅</th>
            <th>单位</th>
            <th>更新时间</th>
          </tr>
        </thead>
        <tbody>
          {items.map((quote) => (
            <tr key={quote.code}>
              <td
                className="name-col stock-detail-trigger"
                onClick={() => onOpenDetail(quote)}
                role="button"
                tabIndex={0}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault();
                    onOpenDetail(quote);
                  }
                }}
              >
                <span className="primary">
                  <span className="name-inline">
                    <span className="name-text">{quote.label}</span>
                  </span>
                </span>
                <span className="secondary">{quote.symbol || quote.code}</span>
              </td>
              <td className={toneClass(quote.change)}>
                {Number.isFinite(quote.price) ? formatNumber(quote.price, 2) : '--'}
              </td>
              <td className={toneClass(quote.change)}>
                {formatSignedNumber(quote.change)}
              </td>
              <td className={toneClass(quote.changePct)}>
                {Number.isFinite(quote.changePct) ? `${quote.changePct > 0 ? '+' : ''}${formatNumber(quote.changePct, 2)}%` : '--'}
              </td>
              <td>{quote.unit}</td>
              <td>{quote.updatedAt === '-' ? '--' : quote.updatedAt}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function GoldPage({ quotes, onOpenDetail }: Props) {
  return (
    <div style={{ display: 'grid', gap: 12 }}>
      {SECTION_ORDER.map((section) => {
        const items = quotes.filter((quote) => quote.market === section.key);
        return (
          <section key={section.key} style={{ display: 'grid', gap: 8 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 2px' }}>
              <strong style={{ fontSize: 13, color: 'var(--text-0)' }}>{section.title}</strong>
              <span style={{ fontSize: 11, color: 'var(--text-2)' }}>
                {items.length > 0 ? `${items.length} 个报价` : '暂无数据'}
              </span>
            </div>
            {renderTable(items, onOpenDetail)}
          </section>
        );
      })}
    </div>
  );
}
