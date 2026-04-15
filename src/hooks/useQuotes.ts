import { useQuery, useQueryClient } from '@tanstack/react-query';
import { getRealtimeQuote, setApiToken } from '@/api/tencent';
import type { StockQuote } from '@/types';

// Query Keys
export const quoteKeys = {
  all: ['quotes'] as const,
  list: (codes: string[]) => [...quoteKeys.all, { codes }] as const,
};

// 获取实时行情
export function useQuotes(codes: string[], enabled = true) {
  return useQuery({
    queryKey: quoteKeys.list(codes),
    queryFn: async () => {
      return getRealtimeQuote(codes);
    },
    enabled: enabled && codes.length > 0,
    staleTime: 5000, // 5秒内视为新鲜数据
    refetchInterval: 10000, // 每10秒自动刷新
  });
}

// 手动刷新
export function useRefreshQuotes() {
  const queryClient = useQueryClient();
  
  return async (codes: string[]) => {
    await queryClient.invalidateQueries({
      queryKey: quoteKeys.list(codes),
    });
  };
}

// 获取单个股票行情
export function getQuoteByCode(quotes: StockQuote[], code: string): StockQuote | undefined {
  return quotes.find((q) => q.code.includes(code));
}
