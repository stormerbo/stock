// -----------------------------------------------------------
// Fundamental data from East Money API (correct field mapping)
// -----------------------------------------------------------

import { fetchTextViaExtension, normalizeStockCode, toNumber, toTencentStockCode } from './fetch';

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
  profitGrowth: number;         // 净利润同比增长 (%)
};

function toEastmoneySecid(code: string): string {
  const plain = code.trim().toLowerCase().replace(/^(sh|sz)/, '');
  if (!/^\d{6}$/.test(plain)) return '';
  const market = /^[569]/.test(plain) ? 1 : 0;
  return `${market}.${plain}`;
}

/**
 * 从东方财富 ulist.np 接口获取基本面数据（和行情报价同接口，已验证可用）。
 *
 * 字段编号来源：东方财富页面逆向整理 (CSDN)
 *   f9   = 市盈率(动态)    f20  = 总市值
 *   f21  = 流通市值         f23  = 市净率
 *   f37  = 净资产收益率     f41  = 营收同比
 *   f46  = 净利润同比       f49  = 毛利率
 *   f112 = 每股收益         f113 = 每股净资产
 *   f133 = 股息率
 */
export async function fetchFundamentals(code: string): Promise<FundamentalData> {
  const secid = toEastmoneySecid(code);
  if (!secid) return createEmpty();

  try {
    const text = await fetchTextViaExtension(
      `https://push2.eastmoney.com/api/qt/ulist.np/get?fltt=2&fields=f9,f20,f21,f23,f37,f41,f46,f49,f112,f113,f133&secids=${secid}`,
    );
    if (!text) return createEmpty();

    // ulist.np 返回 { data: { diff: [{...}] } }
    const raw = text.trim();
    const start = raw.indexOf('{');
    const end = raw.lastIndexOf('}');
    const json = JSON.parse(raw.slice(start, end + 1)) as {
      data?: { diff?: Record<string, number | undefined>[] };
    };
    const d = json.data?.diff?.[0];
    if (!d) return createEmpty();

    // ulist.np 返回的市值单位是元，转为亿
    const marketCap = toNumber(d.f20);
    const circMarketCap = toNumber(d.f21);

    return {
      peTtm: toNumber(d.f9),
      pb: toNumber(d.f23),
      totalMarketCapYi: Number.isFinite(marketCap) ? marketCap / 1e8 : Number.NaN,
      circulatingMarketCapYi: Number.isFinite(circMarketCap) ? circMarketCap / 1e8 : Number.NaN,
      dividendYield: toNumber(d.f133),
      roe: toNumber(d.f37),
      eps: toNumber(d.f112),
      bvps: toNumber(d.f113),
      grossMargin: toNumber(d.f49),
      revenueGrowth: toNumber(d.f41),
      profitGrowth: toNumber(d.f46),
    };
  } catch {
    return createEmpty();
  }
}

function createEmpty(): FundamentalData {
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
  return Number.isFinite(data.peTtm) || Number.isFinite(data.pb)
    || Number.isFinite(data.totalMarketCapYi) || Number.isFinite(data.roe);
}
