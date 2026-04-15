import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  getSettings,
  setSettings as setSettingsApi,
} from '@/utils/storage';

// Query Keys
export const settingsKeys = {
  all: ['settings'] as const,
  detail: () => [...settingsKeys.all, 'detail'] as const,
};

// 获取设置
export function useSettings() {
  return useQuery({
    queryKey: settingsKeys.detail(),
    queryFn: getSettings,
    staleTime: Infinity,
  });
}

// 更新设置
export function useSetSettings() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: setSettingsApi,
    onSuccess: (data) => {
      queryClient.setQueryData(settingsKeys.detail(), data);
      
      // 通知 background 更新刷新间隔
      chrome.runtime.sendMessage({
        action: 'updateSettings',
        settings: data,
      });
    },
  });
}
