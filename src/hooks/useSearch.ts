import { useQuery } from '@tanstack/react-query';
import { searchStocks } from '@/api/tencent';

// Query Keys
export const searchKeys = {
  all: ['search'] as const,
  keyword: (keyword: string) => [...searchKeys.all, keyword] as const,
};

// 搜索股票
export function useSearchStocks(keyword: string) {
  return useQuery({
    queryKey: searchKeys.keyword(keyword),
    queryFn: async () => {
      if (keyword.length < 2) return [];
      return searchStocks(keyword);
    },
    enabled: keyword.length >= 2,
    staleTime: 60000, // 1分钟内缓存搜索结果
  });
}
