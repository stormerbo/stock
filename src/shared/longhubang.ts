// -----------------------------------------------------------
// 龙虎榜 (Top Traders List) — Eastmoney datacenter-web API
// -----------------------------------------------------------

export type LonghuBangStock = {
  code: string;
  name: string;
  date: string;
  closePrice: number;
  changeRate: number;
  buyAmt: number;
  sellAmt: number;
  netBuyAmt: number;
  explanation: string;
  turnoverRate: number;
  freeCap: number;
  market: string;
  buyCount: number;
  sellCount: number;
};

function toNumber(value: unknown): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : Number.NaN;
}

function getLatestTradeDate(): string {
  const now = new Date();
  const day = now.getDay();
  const hour = now.getHours();

  // Before 16:00, use yesterday as the latest possible trade date
  // (today's 龙虎榜 data may not be published yet)
  if (hour < 16) {
    // On Monday, go back to Friday
    if (day === 1) return formatDate(now, -3);
    // On Sunday, go back to Friday
    if (day === 0) return formatDate(now, -2);
    return formatDate(now, -1);
  }

  // After 16:00, today's data should be available
  // Skip weekends
  if (day === 6) return formatDate(now, -1);
  if (day === 0) return formatDate(now, -2);
  return formatDate(now, 0);
}

function formatDate(date: Date, offset: number): string {
  const d = new Date(date);
  d.setDate(d.getDate() + offset);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** Merge duplicate entries for the same stock code (RPT_ORGANIZATION_TRADE_DETAILS
 *  can return multiple rows per stock when multiple institutions traded it).
 *  Sums buy/sell amounts, keeps the entry with max changeRate as the lead. */
function mergeByStockCode(rows: LonghuBangStock[]): LonghuBangStock[] {
  const map = new Map<string, LonghuBangStock>();

  for (const row of rows) {
    const existing = map.get(row.code);
    if (!existing) {
      map.set(row.code, { ...row });
      continue;
    }

    // Accumulate amounts
    existing.buyAmt += row.buyAmt;
    existing.sellAmt += row.sellAmt;
    existing.netBuyAmt += row.netBuyAmt;
    existing.buyCount += row.buyCount;
    existing.sellCount += row.sellCount;

    // Keep the higher changeRate entry's metadata
    if (Math.abs(row.changeRate) > Math.abs(existing.changeRate)) {
      existing.changeRate = row.changeRate;
      existing.closePrice = row.closePrice;
      existing.turnoverRate = row.turnoverRate;
      existing.date = row.date;
    }

    // Merge explanations (deduplicate)
    if (row.explanation && !existing.explanation.includes(row.explanation)) {
      existing.explanation = existing.explanation
        ? `${existing.explanation}；${row.explanation}`
        : row.explanation;
    }
  }

  return Array.from(map.values());
}

export async function fetchLonghuBang(): Promise<LonghuBangStock[]> {
  const tradeDate = getLatestTradeDate();
  const columns = [
    'SECURITY_CODE',
    'SECURITY_NAME_ABBR',
    'TRADE_DATE',
    'CLOSE_PRICE',
    'CHANGE_RATE',
    'BUY_AMT',
    'SELL_AMT',
    'NET_BUY_AMT',
    'EXPLANATION',
    'TURNOVERRATE',
    'FREECAP',
    'MARKET',
    'BUY_TIMES',
    'SELL_TIMES',
  ].join(',');

  const params = new URLSearchParams({
    sortColumns: 'NET_BUY_AMT,TRADE_DATE,SECURITY_CODE',
    sortTypes: '-1,-1,1',
    pageSize: '200',
    pageNumber: '1',
    reportName: 'RPT_ORGANIZATION_TRADE_DETAILS',
    columns,
    source: 'WEB',
    client: 'WEB',
    filter: `(TRADE_DATE>='${tradeDate}')`,
  });

  const url = `https://datacenter-web.eastmoney.com/api/data/v1/get?${params.toString()}`;

  try {
    const response = await fetch(url);
    const json = await response.json() as {
      result?: { data?: Array<Record<string, unknown>> };
    };

    const data = json.result?.data;
    if (!data || !Array.isArray(data)) return [];

    const rows = data.map((row) => ({
      code: String(row.SECURITY_CODE ?? ''),
      name: String(row.SECURITY_NAME_ABBR ?? ''),
      date: String(row.TRADE_DATE ?? ''),
      closePrice: toNumber(row.CLOSE_PRICE),
      changeRate: toNumber(row.CHANGE_RATE),
      buyAmt: toNumber(row.BUY_AMT),
      sellAmt: toNumber(row.SELL_AMT),
      netBuyAmt: toNumber(row.NET_BUY_AMT),
      explanation: String(row.EXPLANATION ?? ''),
      turnoverRate: toNumber(row.TURNOVERRATE),
      freeCap: toNumber(row.FREECAP),
      market: String(row.MARKET ?? ''),
      buyCount: toNumber(row.BUY_TIMES),
      sellCount: toNumber(row.SELL_TIMES),
    }));

    return mergeByStockCode(rows);
  } catch {
    return [];
  }
}
