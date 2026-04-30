// -----------------------------------------------------------
// Fundamental data from multiple sources
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
  profitGrowth: number;         // 净利润增长率 (%)
};

export async function fetchFundamentals(code: string): Promise<FundamentalData> {
  // 先从腾讯行情接口获取 PE、总市值等基础数据
  const tencentData = await fetchTencentFundamentals(code);
  if (tencentData) return tencentData;

  // 腾讯失败时走东财 ulist.np
  const emData = await fetchEastmoneyFundamentals(code);
  return emData ?? createEmptyFundamentalData();
}

// -----------------------------------------------------------
// Tencent finance quote — 已验证 PE(39)、总市值(45) 等字段可用
// -----------------------------------------------------------

async function fetchTencentFundamentals(code: string): Promise<FundamentalData | null> {
  try {
    const plain = normalizeStockCode(code);
    const tencentCode = toTencentStockCode(plain);
    if (!tencentCode) return null;

    const text = await fetchTextViaExtension(`https://qt.gtimg.cn/q=${tencentCode}`);
    const matched = text.match(new RegExp(`v_${tencentCode}="([^"]*)"`));
    const parts = matched?.[1]?.split('~') ?? [];
    if (parts.length < 46) return null;

    // Tencent quote field mapping:
    // 39 = PE(动态), 45 = 总市值(亿), 44 = 流通市值(亿)?, 38 = 换手率
    const peTtm = toNumber(parts[39]);
    const totalMarketCapYi = toNumber(parts[45]);
    // 腾讯没有 PB/ROE/EPS 等字段，这些走东财补充
    const em = await fetchEastmoneyFundamentals(code);

    return {
      peTtm,
      pb: em?.pb ?? Number.NaN,
      totalMarketCapYi,
      circulatingMarketCapYi: em?.circulatingMarketCapYi ?? Number.NaN,
      dividendYield: em?.dividendYield ?? Number.NaN,
      roe: em?.roe ?? Number.NaN,
      eps: em?.eps ?? Number.NaN,
      bvps: em?.bvps ?? Number.NaN,
      grossMargin: em?.grossMargin ?? Number.NaN,
      revenueGrowth: em?.revenueGrowth ?? Number.NaN,
      profitGrowth: em?.profitGrowth ?? Number.NaN,
    };
  } catch {
    return null;
  }
}

// -----------------------------------------------------------
// East Money — 补充腾讯没有的字段
// -----------------------------------------------------------

function toEastmoneySecid(code: string): string {
  const plain = code.trim().toLowerCase().replace(/^(sh|sz)/, '');
  if (!/^\d{6}$/.test(plain)) return '';
  const market = /^[569]/.test(plain) ? 1 : 0;
  return `${market}.${plain}`;
}

type EastmoneyUlistRow = {
  f9?: number;    // 总市值
  f20?: number;   // 流通市值
  f23?: number;   // PB
  f37?: number;   // 股息率
  f45?: number;   // ROE
  f46?: number;   // 每股净资产
  f49?: number;   // EPS
  f50?: number;   // 毛利率
  f52?: number;   // 营收增长率
  f57?: number;   // 净利润增长率
};

async function fetchEastmoneyFundamentals(code: string): Promise<FundamentalData | null> {
  try {
    const secid = toEastmoneySecid(code);
    if (!secid) return null;

    // 使用和行情报价相同的 ulist.np 接口（已验证可用）
    const text = await fetchTextViaExtension(
      `https://push2.eastmoney.com/api/qt/ulist.np/get?fltt=2&fields=f9,f20,f23,f37,f45,f46,f49,f50,f52,f57&secids=${secid}`,
    );
    if (!text) return null;

    const raw = text.trim();
    const start = raw.indexOf('{');
    const end = raw.lastIndexOf('}');
    const json = JSON.parse(raw.slice(start, end + 1)) as {
      data?: { diff?: EastmoneyUlistRow[] };
    };
    const row = json.data?.diff?.[0];
    if (!row) return null;

    return {
      peTtm: Number.NaN, // 用腾讯的
      pb: toNumber(row.f23),
      totalMarketCapYi: toNumber(row.f9),
      circulatingMarketCapYi: toNumber(row.f20),
      dividendYield: toNumber(row.f37),
      roe: toNumber(row.f45),
      eps: toNumber(row.f49),
      bvps: toNumber(row.f46),
      grossMargin: toNumber(row.f50),
      revenueGrowth: toNumber(row.f52),
      profitGrowth: toNumber(row.f57),
    };
  } catch {
    return null;
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
  return Number.isFinite(data.peTtm) || Number.isFinite(data.pb) || Number.isFinite(data.totalMarketCapYi);
}
