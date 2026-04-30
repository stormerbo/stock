// -----------------------------------------------------------
// Fundamental data — 腾讯行情(PE/总市值) + 东财 ulist.np(补充)
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
 * 获取基本面数据：
 * 1. PE、总市值 来自腾讯行情（与详情页 K 线图一致）
 * 2. PB、ROE、EPS 等来自东财 ulist.np
 */
export async function fetchFundamentals(code: string): Promise<FundamentalData> {
  // 腾讯行情（已验证 parts[39]=PE, parts[45]=总市值亿）
  const tencentPE = await fetchTencentPe(code);

  // 东财 ulist.np 补充数据
  const em = await fetchEastmoneyFundamentals(code);

  return {
    peTtm: tencentPE.peTtm,
    pb: em?.pb ?? Number.NaN,
    totalMarketCapYi: tencentPE.totalMarketCapYi,
    circulatingMarketCapYi: em?.circulatingMarketCapYi ?? Number.NaN,
    dividendYield: em?.dividendYield ?? Number.NaN,
    roe: em?.roe ?? Number.NaN,
    eps: em?.eps ?? Number.NaN,
    bvps: em?.bvps ?? Number.NaN,
    grossMargin: em?.grossMargin ?? Number.NaN,
    revenueGrowth: em?.revenueGrowth ?? Number.NaN,
    profitGrowth: em?.profitGrowth ?? Number.NaN,
  };
}

async function fetchTencentPe(code: string): Promise<{ peTtm: number; totalMarketCapYi: number }> {
  try {
    const plain = normalizeStockCode(code);
    const tencentCode = toTencentStockCode(plain);
    if (!tencentCode) return { peTtm: Number.NaN, totalMarketCapYi: Number.NaN };

    const text = await fetchTextViaExtension(`https://qt.gtimg.cn/q=${tencentCode}`);
    const matched = text.match(new RegExp(`v_${tencentCode}="([^"]*)"`));
    const parts = matched?.[1]?.split('~') ?? [];
    // 39=PE 45=总市值(亿)
    return {
      peTtm: toNumber(parts[39]),
      totalMarketCapYi: toNumber(parts[45]),
    };
  } catch {
    return { peTtm: Number.NaN, totalMarketCapYi: Number.NaN };
  }
}

async function fetchEastmoneyFundamentals(code: string): Promise<FundamentalData | null> {
  try {
    const secid = toEastmoneySecid(code);
    if (!secid) return null;

    const text = await fetchTextViaExtension(
      `https://push2.eastmoney.com/api/qt/ulist.np/get?fltt=2&fields=f21,f23,f37,f41,f46,f49,f112,f113,f133&secids=${secid}`,
    );
    if (!text) return null;

    const raw = text.trim();
    const start = raw.indexOf('{');
    const end = raw.lastIndexOf('}');
    const json = JSON.parse(raw.slice(start, end + 1)) as {
      data?: { diff?: Record<string, number | undefined>[] };
    };
    const d = json.data?.diff?.[0];
    if (!d) return null;

    // ulist.np 返回的市值单位是元，转为亿
    const circMarketCap = toNumber(d.f21);

    return {
      peTtm: Number.NaN, // 用腾讯的
      pb: toNumber(d.f23),
      totalMarketCapYi: Number.NaN, // 用腾讯的
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
    return null;
  }
}

export function isFundamentalDataValid(data: FundamentalData): boolean {
  return Number.isFinite(data.peTtm) || Number.isFinite(data.pb)
    || Number.isFinite(data.totalMarketCapYi) || Number.isFinite(data.roe);
}

