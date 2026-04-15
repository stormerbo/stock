import { create } from 'zustand';
import type { Holding, Settings, SortField, SortOrder } from '@/types';

// UI 状态
interface UIState {
  // 弹窗显示状态
  showAddModal: boolean;
  activeAddTab: 'single' | 'batch';

  // 排序状态
  sortField: SortField;
  sortOrder: SortOrder;

  // 搜索状态
  searchKeyword: string;

  // 加载状态
  isLoading: boolean;
  isRefreshing: boolean;

  // Actions
  setShowAddModal: (show: boolean) => void;
  setActiveAddTab: (tab: 'single' | 'batch') => void;
  setSort: (field: SortField, order?: SortOrder) => void;
  setSearchKeyword: (keyword: string) => void;
  setIsLoading: (loading: boolean) => void;
  setIsRefreshing: (refreshing: boolean) => void;
}

// 数据状态
interface DataState {
  holdings: Holding[];
  settings: Settings;
  
  setHoldings: (holdings: Holding[]) => void;
  setSettings: (settings: Settings) => void;
}

// 合并 Store
interface AppStore extends UIState, DataState {}

export const useStore = create<AppStore>((set, get) => ({
  // UI State 初始值
  showAddModal: false,
  activeAddTab: 'single',
  sortField: 'default',
  sortOrder: 'asc',
  searchKeyword: '',
  isLoading: false,
  isRefreshing: false,

  // Data State 初始值
  holdings: [],
  settings: {
    refreshInterval: 10,
    colorMode: 'red-up',
    decimals: 2,
    lastModified: 0,
  },

  // Actions
  setShowAddModal: (show) => set({ showAddModal: show }),
  setActiveAddTab: (tab) => set({ activeAddTab: tab }),

  setSort: (field, order) => {
    const current = get();
    if (current.sortField === field && !order) {
      // 切换排序方向
      set({ sortOrder: current.sortOrder === 'asc' ? 'desc' : 'asc' });
    } else {
      set({ sortField: field, sortOrder: order || 'desc' });
    }
  },

  setSearchKeyword: (keyword) => set({ searchKeyword: keyword }),
  setIsLoading: (loading) => set({ isLoading: loading }),
  setIsRefreshing: (refreshing) => set({ isRefreshing: refreshing }),

  setHoldings: (holdings) => set({ holdings }),
  setSettings: (settings) => set({ settings }),
}));
