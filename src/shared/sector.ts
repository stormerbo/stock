// -----------------------------------------------------------
// Industry sector data — paginated with delay, cached
// -----------------------------------------------------------

export type SectorData = {
  code: string;
  name: string;
  price: number;
  changePct: number;
  changeAmt: number;
  marketCap: number;
  leadingStockName: string;
  leadingStockCode: string;
  leadingStockChangePct: number;
};

export type SectorStock = {
  code: string;
  name: string;
  price: number;
  changePct: number;
};

function toNumber(value: unknown): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : Number.NaN;
}

const FIELDS = [
  'f2',   // latest price
  'f3',   // change%
  'f4',   // change amount
  'f12',  // sector code
  'f14',  // sector name
  'f20',  // total market cap
  'f128', // leading stock name
  'f136', // leading stock change%
  'f152', // leading stock code
].join(',');

function parseRows(rows: Array<Record<string, unknown>>): SectorData[] {
  return rows.map((row) => ({
    code: String(row.f12 ?? ''),
    name: String(row.f14 ?? ''),
    price: toNumber(row.f2),
    changePct: toNumber(row.f3),
    changeAmt: toNumber(row.f4),
    marketCap: toNumber(row.f20),
    leadingStockName: String(row.f128 ?? ''),
    leadingStockCode: String(row.f152 ?? ''),
    leadingStockChangePct: toNumber(row.f136),
  }));
}

async function fetchOnePage(page: number): Promise<SectorData[]> {
  const url = `https://push2.eastmoney.com/api/qt/clist/get?pn=${page}&pz=100&po=1&np=1&fltt=2&invt=2&fid=f3&fs=m:90+t:2&fields=${FIELDS}`;
  const response = await fetch(url);
  const json = await response.json() as {
    data?: { total: number; diff?: Array<Record<string, unknown>> };
  };
  const diff = json.data?.diff;
  if (!diff || !Array.isArray(diff)) return [];
  return parseRows(diff as Array<Record<string, unknown>>);
}

// In-memory cache
let _cache: SectorData[] | null = null;
let _cacheTs = 0;

export async function fetchSectorList(): Promise<SectorData[]> {
  // Return cache if fresh (60s)
  if (_cache && _cache.length > 0 && Date.now() - _cacheTs < 60_000) {
    return _cache;
  }

  const allRows: SectorData[] = [];
  const DELAY_MS = 500;

  // Fetch pages one by one with delay between each
  for (let page = 1; page <= 6; page += 1) {
    try {
      const rows = await fetchOnePage(page);
      if (rows.length === 0) break;
      allRows.push(...rows);
      if (rows.length < 100) break; // last partial page, done
    } catch {
      break; // failed page, stop but keep what we have
    }

    // Delay before next page to avoid rate limiting
    if (page < 6) {
      await new Promise((r) => setTimeout(r, DELAY_MS));
    }
  }

  if (allRows.length > 0) {
    _cache = allRows;
    _cacheTs = Date.now();
  }

  return allRows;
}

// -----------------------------------------------------------
// Sector constituent stocks
// -----------------------------------------------------------

const STOCK_FIELDS = ['f2', 'f3', 'f12', 'f14'].join(',');

async function fetchStocksOnePage(sectorCode: string, page: number): Promise<SectorStock[]> {
  const url = `https://push2his.eastmoney.com/api/qt/clist/get?pn=${page}&pz=100&po=1&np=1&fltt=2&invt=2&fid=f3&fs=b:${encodeURIComponent(sectorCode)}&fields=${STOCK_FIELDS}`;
  const response = await fetch(url);
  const json = await response.json() as {
    data?: { total: number; diff?: Array<Record<string, unknown>> };
  };
  const diff = json.data?.diff;
  if (!diff || !Array.isArray(diff)) return [];
  return (diff as Array<Record<string, unknown>>).map((row) => ({
    code: String(row.f12 ?? ''),
    name: String(row.f14 ?? ''),
    price: toNumber(row.f2),
    changePct: toNumber(row.f3),
  }));
}

// In-memory cache for constituent stocks (keyed by sector code)
const _stockCache = new Map<string, { data: SectorStock[]; ts: number }>();

export async function fetchSectorStocks(sectorCode: string): Promise<SectorStock[]> {
  const cached = _stockCache.get(sectorCode);
  if (cached && cached.data.length > 0 && Date.now() - cached.ts < 120_000) {
    return cached.data;
  }

  const allRows: SectorStock[] = [];

  for (let page = 1; page <= 3; page += 1) {
    try {
      const rows = await fetchStocksOnePage(sectorCode, page);
      if (rows.length === 0) break;
      allRows.push(...rows);
      if (rows.length < 100) break;
    } catch {
      break;
    }
  }

  if (allRows.length > 0) {
    _stockCache.set(sectorCode, { data: allRows, ts: Date.now() });
  }

  return allRows;
}

// -----------------------------------------------------------
// Stock-to-sector mapping — fetch sectors for a single stock
// -----------------------------------------------------------

import { guessSector } from './sector-map';

export type StockSector = {
  code: string;
  name: string;
  changePct: number;
};

/** Sector name → Eastmoney BK code (static mapping, no API required) */
const SECTOR_TO_BK: Record<string, string> = {
  '白酒': 'BK0477',
  '银行': 'BK0475',
  '保险': 'BK0474',
  '证券': 'BK0473',
  '新能源': 'BK0493',
  '汽车': 'BK0481',
  '医药': 'BK0465',
  '半导体': 'BK0484',
  '互联网': 'BK0450',
  '科技': 'BK0448',
  '家电': 'BK0456',
  '地产': 'BK0451',
  '煤炭': 'BK0437',
  '有色金属': 'BK0478',
  '钢铁': 'BK0479',
  '军工': 'BK0463',
  '食品饮料': 'BK0483',
  '电力': 'BK0428',
  '交通运输': 'BK0429',
  '建筑': 'BK0443',
  '通信': 'BK0445',
  '化工': 'BK0438',
  '农林牧渔': 'BK0431',
  '纺织服装': 'BK0433',
  '公用事业': 'BK0427',
};

/**
 * Get the sector that a stock belongs to with its Eastmoney BK code.
 * Uses hardcoded name→code mapping (no API required).
 * Returns sector name even without BK code match.
 */
export async function fetchStockSectors(stockCode: string): Promise<StockSector[]> {
  try {
    const sectorName = guessSector(stockCode);
    if (!sectorName || sectorName === '其他') return [];

    const bkCode = SECTOR_TO_BK[sectorName] ?? '';

    return [{
      code: bkCode,
      name: sectorName,
      changePct: Number.NaN, // TODO: add live changePct from board quote API
    }];
  } catch {
    return [];
  }
}
