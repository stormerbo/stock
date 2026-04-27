// -----------------------------------------------------------
// Fundamental data from East Money API
// -----------------------------------------------------------

export type FundamentalData = {
  peTtm: number;                // 市盈率 (动态)
  pb: number;                   // 市净率
  totalMarketCapYi: number;     // 总市值(亿)
  circulatingMarketCapYi: number; // 流通市值(亿)
  dividendYield: number;        // 股息率 (%)
  roe: number;                  // 净资产收益率 (%)
  eps: number;                  // 每股收益
  bvps: number;                 // 每股净资产
  grossMargin: number;          // 毛利率 (%)
  revenueGrowth: number;        // 营收增长率 (%)
  profitGrowth: number;         // 净利润增长率 (%)
};

function toNumber(value: unknown): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : Number.NaN;
}

function toEastmoneySecid(code: string): string {
  const plain = code.trim().toLowerCase().replace(/^(sh|sz)/, '');
  if (!/^\d{6}$/.test(plain)) return '';
  const market = /^[569]/.test(plain) ? 1 : 0;
  return `${market}.${plain}`;
}

type EastmoneyFundamentalResponse = {
  data?: {
    f9?: number;   // PE
    f20?: number;  // 总市值
    f21?: number;  // 流通市值
    f23?: number;  // PB
    f37?: number;  // 股息率
    f49?: number;  // ROE
    f50?: number;  // 每股净资产
    f52?: number;  // EPS
    f59?: number;  // 毛利率
    f61?: number;  // 营收增长率
    f62?: number;  // 净利润增长率
  };
};

export async function fetchFundamentals(code: string): Promise<FundamentalData> {
  const secid = toEastmoneySecid(code);
  if (!secid) {
    return createEmptyFundamentalData();
  }

  try {
    const response = await fetch(
      `https://push2.eastmoney.com/api/qt/stock/get?secid=${secid}&fields=f9,f20,f21,f23,f37,f49,f50,f52,f59,f61,f62`,
    );
    if (!response.ok) {
      return createEmptyFundamentalData();
    }
    const json = (await response.json()) as EastmoneyFundamentalResponse;
    const d = json.data;
    if (!d) {
      return createEmptyFundamentalData();
    }

    return {
      peTtm: toNumber(d.f9),
      pb: toNumber(d.f23),
      totalMarketCapYi: toNumber(d.f20),
      circulatingMarketCapYi: toNumber(d.f21),
      dividendYield: toNumber(d.f37),
      roe: toNumber(d.f49),
      eps: toNumber(d.f52),
      bvps: toNumber(d.f50),
      grossMargin: toNumber(d.f59),
      revenueGrowth: toNumber(d.f61),
      profitGrowth: toNumber(d.f62),
    };
  } catch {
    return createEmptyFundamentalData();
  }
}

function createEmptyFundamentalData(): FundamentalData {
  return {
    peTtm: Number.NaN,
    pb: Number.NaN,
    totalMarketCapYi: Number.NaN,
    circulatingMarketCapYi: Number.NaN,
    dividendYield: Number.NaN,
    roe: Number.NaN,
    eps: Number.NaN,
    bvps: Number.NaN,
    grossMargin: Number.NaN,
    revenueGrowth: Number.NaN,
    profitGrowth: Number.NaN,
  };
}

export function isFundamentalDataValid(data: FundamentalData): boolean {
  return Number.isFinite(data.peTtm) || Number.isFinite(data.totalMarketCapYi);
}
