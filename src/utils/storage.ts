import type {
  Holding,
  Settings,
  TushareConfig,
  StorageMeta,
} from '@/types';
import { STORAGE_KEYS, DEFAULT_SETTINGS, MAX_HOLDINGS } from './constants';

/**
 * Chrome Storage 封装
 */

// 获取存储数据
export async function getStorage<T>(key: string): Promise<T | null> {
  const result = await chrome.storage.sync.get(key);
  return (result[key] as T) || null;
}

// 设置存储数据
export async function setStorage<T>(key: string, value: T): Promise<void> {
  await chrome.storage.sync.set({ [key]: value });
}

// 获取元数据
export async function getMeta(): Promise<StorageMeta> {
  const meta = await getStorage<StorageMeta>(STORAGE_KEYS.META);
  return meta || { lastSyncAt: 0, version: 1 };
}

// 更新元数据
export async function updateMeta(): Promise<void> {
  const meta = await getMeta();
  meta.lastSyncAt = Date.now();
  await setStorage(STORAGE_KEYS.META, meta);
}

// 获取 Tushare Token
export async function getTushareToken(): Promise<string | null> {
  const data = await getStorage<TushareConfig>(STORAGE_KEYS.TUSHARE);
  return data?.token || null;
}

// 保存 Tushare Token
export async function setTushareToken(token: string): Promise<void> {
  await setStorage(STORAGE_KEYS.TUSHARE, {
    token,
    lastModified: Date.now(),
  });
  await updateMeta();
}

// 检查是否已配置 Token
export async function hasTushareToken(): Promise<boolean> {
  const token = await getTushareToken();
  return !!token;
}

// 获取设置
export async function getSettings(): Promise<Settings> {
  const settings = await getStorage<Settings>(STORAGE_KEYS.SETTINGS);
  return { ...DEFAULT_SETTINGS, lastModified: 0, ...settings };
}

// 保存设置
export async function setSettings(settings: Partial<Settings>): Promise<Settings> {
  const current = await getSettings();
  const merged: Settings = {
    ...current,
    ...settings,
    lastModified: Date.now(),
  };
  await setStorage(STORAGE_KEYS.SETTINGS, merged);
  await updateMeta();
  return merged;
}

// 获取持仓列表
export async function getHoldings(): Promise<Holding[]> {
  const holdings = await getStorage<Holding[]>(STORAGE_KEYS.HOLDINGS);
  return holdings || [];
}

// 保存持仓列表
export async function setHoldings(holdings: Holding[]): Promise<void> {
  await setStorage(STORAGE_KEYS.HOLDINGS, holdings);
  await updateMeta();
}

// 添加持仓
export async function addHolding(
  holding: Omit<Holding, 'addedAt' | 'lastModified' | 'sortOrder' | 'pinned' | 'watched'> & {
    pinned?: boolean;
    watched?: boolean;
  }
): Promise<Holding> {
  const holdings = await getHoldings();

  // 检查是否已存在
  if (holdings.some((h) => h.code === holding.code)) {
    throw new Error('该股票已存在');
  }

  // 检查上限
  if (holdings.length >= MAX_HOLDINGS) {
    throw new Error(`已达到最大持仓数量限制（${MAX_HOLDINGS}个）`);
  }

  const now = Date.now();
  const newHolding: Holding = {
    ...holding,
    pinned: holding.pinned || false,
    watched: holding.watched ?? false,
    sortOrder: holdings.length,
    addedAt: now,
    lastModified: now,
  };

  holdings.push(newHolding);
  await setHoldings(holdings);
  return newHolding;
}

// 批量添加持仓
export async function batchAddHoldings(
  items: Array<{ code: string; costPrice: number; shares: number }>,
  stockNames: Record<string, string> = {}
): Promise<{ success: typeof items; failed: (typeof items[0] & { reason: string })[] }> {
  const current = await getHoldings();
  const results = { success: [] as typeof items, failed: [] as (typeof items[0] & { reason: string })[] };
  const now = Date.now();

  for (const item of items) {
    // 检查是否已存在
    if (current.some((h) => h.code === item.code)) {
      results.failed.push({ ...item, reason: '已存在' });
      continue;
    }

    // 检查上限
    if (current.length >= MAX_HOLDINGS) {
      results.failed.push({ ...item, reason: '已达到上限' });
      break;
    }

    current.push({
      code: item.code,
      name: stockNames[item.code] || item.code,
      costPrice: item.costPrice,
      shares: item.shares,
      pinned: false,
      watched: false,
      sortOrder: current.length,
      addedAt: now,
      lastModified: now,
    });
    results.success.push(item);
  }

  await setHoldings(current);
  return results;
}

// 更新持仓
export async function updateHolding(
  code: string,
  updates: Partial<Pick<Holding, 'costPrice' | 'shares' | 'pinned' | 'sortOrder'>>
): Promise<Holding> {
  const holdings = await getHoldings();
  const index = holdings.findIndex((h) => h.code === code);

  if (index === -1) {
    throw new Error('持仓不存在');
  }

  holdings[index] = {
    ...holdings[index],
    ...updates,
    lastModified: Date.now(),
  };

  await setHoldings(holdings);
  return holdings[index];
}

// 删除持仓
export async function deleteHolding(code: string): Promise<void> {
  const holdings = await getHoldings();
  const filtered = holdings.filter((h) => h.code !== code);

  if (filtered.length === holdings.length) {
    throw new Error('持仓不存在');
  }

  await setHoldings(filtered);
}

// 切换置顶状态
export async function togglePin(code: string): Promise<Holding> {
  const holdings = await getHoldings();
  const index = holdings.findIndex((h) => h.code === code);

  if (index === -1) {
    throw new Error('持仓不存在');
  }

  holdings[index].pinned = !holdings[index].pinned;
  holdings[index].lastModified = Date.now();

  await setHoldings(holdings);
  return holdings[index];
}

// 切换特别关注状态
export async function toggleWatch(code: string): Promise<Holding> {
  const holdings = await getHoldings();
  const index = holdings.findIndex((h) => h.code === code);

  if (index === -1) {
    throw new Error('持仓不存在');
  }

  holdings[index].watched = !holdings[index].watched;
  holdings[index].lastModified = Date.now();

  await setHoldings(holdings);
  return holdings[index];
}

// 更新排序顺序
export async function updateSortOrder(sortedCodes: string[]): Promise<void> {
  const holdings = await getHoldings();
  const now = Date.now();

  for (let i = 0; i < sortedCodes.length; i++) {
    const h = holdings.find((item) => item.code === sortedCodes[i]);
    if (h) {
      h.sortOrder = i;
      h.lastModified = now;
    }
  }

  await setHoldings(holdings);
}

// 缓存股票名称
export async function cacheStockNames(
  nameMap: Record<string, string>
): Promise<void> {
  const existing = (await getStorage<Record<string, string>>(STORAGE_KEYS.STOCK_NAMES)) || {};
  const merged = { ...existing, ...nameMap };
  await setStorage(STORAGE_KEYS.STOCK_NAMES, merged);
}

// 获取缓存的股票名称
export async function getStockName(code: string): Promise<string> {
  const names = (await getStorage<Record<string, string>>(STORAGE_KEYS.STOCK_NAMES)) || {};
  return names[code] || code;
}

// 导出所有数据
export async function exportData(): Promise<string> {
  const data = await chrome.storage.sync.get(null);
  return JSON.stringify(data, null, 2);
}

// 导入数据
export async function importData(jsonString: string): Promise<{ success: boolean; error?: string }> {
  try {
    const data = JSON.parse(jsonString);

    // 验证数据格式
    if (!data.holdings || !Array.isArray(data.holdings)) {
      throw new Error('数据格式不正确');
    }

    // 检查持仓数量
    if (data.holdings.length > MAX_HOLDINGS) {
      throw new Error(`导入数据超过${MAX_HOLDINGS}个持仓限制`);
    }

    await chrome.storage.sync.set(data);
    return { success: true };
  } catch (error) {
    return { success: false, error: (error as Error).message };
  }
}

// 清除所有数据
export async function clearAll(): Promise<void> {
  await chrome.storage.sync.clear();
}
