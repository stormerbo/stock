import type { StockQuote, StockBasic, TushareResponse } from '@/types';
import { TUSHARE_BASE_URL } from '@/utils/constants';
import { addMarketSuffix } from '@/utils/stock';

// API Token 存储
let apiToken: string | null = null;

export function setApiToken(token: string) {
  apiToken = token;
}

export function getApiToken(): string | null {
  return apiToken;
}

// 通用请求函数
async function request<T>(
  apiName: string,
  params?: Record<string, unknown>,
  fields?: string
): Promise<T[]> {
  if (!apiToken) {
    throw new Error('未配置 Tushare Token');
  }

  const body = {
    api_name: apiName,
    token: apiToken,
    params,
    fields,
  };

  const response = await fetch(TUSHARE_BASE_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    throw new Error(`HTTP error: ${response.status}`);
  }

  const data: TushareResponse<T> = await response.json();

  if (data.code !== 0) {
    throw new Error(`API error: ${data.msg}`);
  }

  return parseResponse(data.data);
}

// 解析响应数据
function parseResponse<T>(data: { fields: string[]; items: T[][] }): T[] {
  const { fields, items } = data;
  return items.map((item) => {
    const obj = {} as T;
    fields.forEach((field, index) => {
      (obj as Record<string, unknown>)[field] = item[index];
    });
    return obj;
  });
}

// 获取实时行情
export async function getRealtimeQuote(codes: string[]): Promise<StockQuote[]> {
  if (!codes.length) return [];

  const codeStr = codes.map(addMarketSuffix).join(',');

  const data = await request<{
    ts_code: string;
    name: string;
    open: number;
    high: number;
    low: number;
    close: number;
    pre_close: number;
    change: number;
    pct_change: number;
    vol: number;
    amount: number;
  }>('quotation_daily', { ts_code: codeStr });

  return data.map((item) => ({
    code: item.ts_code,
    name: item.name,
    open: item.open,
    high: item.high,
    low: item.low,
    close: item.close,
    preClose: item.pre_close,
    change: item.change,
    pctChange: item.pct_change,
    volume: item.vol,
    amount: item.amount,
  }));
}

// 获取股票基础信息
export async function getStockBasic(codes: string[]): Promise<StockBasic[]> {
  if (!codes.length) return [];

  const codeStr = codes.map(addMarketSuffix).join(',');

  const data = await request<{
    ts_code: string;
    name: string;
    area?: string;
    industry?: string;
    market?: string;
  }>('stock_basic', { ts_code: codeStr, list_status: 'L' },
    'ts_code,name,area,industry,market');

  return data.map((item) => ({
    code: item.ts_code,
    name: item.name,
    area: item.area,
    industry: item.industry,
    market: item.market,
  }));
}

// 股票列表缓存
let stockListCache: Array<{
  ts_code: string;
  name: string;
  market: string;
  exchange: string;
}> | null = null;
let cacheTime = 0;
const CACHE_DURATION = 5 * 60 * 1000; // 5分钟缓存

// 获取所有股票列表（带缓存）
async function getAllStocks(): Promise<StockBasic[]> {
  const now = Date.now();
  
  // 使用缓存
  if (stockListCache && (now - cacheTime) < CACHE_DURATION) {
    return stockListCache.map(item => ({
      code: item.ts_code,
      name: item.name,
      market: item.market,
    }));
  }

  // 获取新数据
  const data = await request<{
    ts_code: string;
    name: string;
    market: string;
    exchange: string;
  }>('stock_basic', { list_status: 'L' }, 'ts_code,name,market,exchange');

  stockListCache = data;
  cacheTime = now;

  return data.map(item => ({
    code: item.ts_code,
    name: item.name,
    market: item.market,
  }));
}

// 搜索股票
export async function searchStocks(keyword: string): Promise<StockBasic[]> {
  if (keyword.length < 2) return [];

  try {
    const allStocks = await getAllStocks();
    const lowerKeyword = keyword.toLowerCase();

    return allStocks
      .filter((item) => {
        const code = item.code.toLowerCase();
        const name = item.name.toLowerCase();
        return code.includes(lowerKeyword) || name.includes(lowerKeyword);
      })
      .slice(0, 20);
  } catch (error) {
    console.error('搜索股票失败:', error);
    throw error;
  }
}

// 清除缓存（用于刷新或Token变更时）
export function clearStockCache() {
  stockListCache = null;
  cacheTime = 0;
}

// 验证 Token
export async function validateToken(): Promise<{ valid: boolean; error?: string }> {
  try {
    await request('stock_basic', { limit: 1 });
    return { valid: true };
  } catch (error) {
    return { valid: false, error: (error as Error).message };
  }
}
