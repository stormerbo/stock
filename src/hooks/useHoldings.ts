import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  getHoldings,
  addHolding as addHoldingApi,
  updateHolding as updateHoldingApi,
  deleteHolding as deleteHoldingApi,
  togglePin as togglePinApi,
  toggleWatch as toggleWatchApi,
  batchAddHoldings as batchAddHoldingsApi,
  cacheStockNames,
} from '@/utils/storage';
import { getStockBasic } from '@/api/tencent';
import type { Holding } from '@/types';

// Query Keys
export const holdingKeys = {
  all: ['holdings'] as const,
  list: () => [...holdingKeys.all, 'list'] as const,
};

// 获取持仓列表
export function useHoldings() {
  return useQuery({
    queryKey: holdingKeys.list(),
    queryFn: getHoldings,
    staleTime: Infinity, // 手动管理缓存
  });
}

// 添加持仓
export function useAddHolding() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async (params: {
      code: string;
      name: string;
      costPrice: number;
      shares: number;
      pinned?: boolean;
    }) => {
      return addHoldingApi({ ...params, pinned: params.pinned ?? false });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: holdingKeys.list() });
    },
  });
}

// 批量添加持仓
export function useBatchAddHoldings() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async (items: Array<{ code: string; costPrice: number; shares: number }>) => {
      // 获取股票名称（腾讯接口不需要Token）
      const codes = items.map(i => i.code);
      const stocks = await getStockBasic(codes);
      const nameMap = stocks.reduce<Record<string, string>>((map, s) => {
        const code = s.code.replace(/\.(SZ|SH|BJ)$/i, '');
        map[code] = s.name;
        return map;
      }, {});
      
      await cacheStockNames(nameMap);
      return batchAddHoldingsApi(items, nameMap);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: holdingKeys.list() });
    },
  });
}

// 更新持仓
export function useUpdateHolding() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async (params: {
      code: string;
      updates: Partial<Pick<Holding, 'costPrice' | 'shares' | 'pinned'>>;
    }) => {
      return updateHoldingApi(params.code, params.updates);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: holdingKeys.list() });
    },
  });
}

// 删除持仓
export function useDeleteHolding() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: deleteHoldingApi,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: holdingKeys.list() });
    },
  });
}

// 切换置顶
export function useTogglePin() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: togglePinApi,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: holdingKeys.list() });
    },
  });
}

// 切换特别关注
export function useToggleWatch() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: toggleWatchApi,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: holdingKeys.list() });
    },
  });
}
