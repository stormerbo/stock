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
