import { useEffect, useState } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { LineChart, Settings, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Overview } from '@/components/Overview';
import { StockTable } from '@/components/StockTable';
import { AddStockModal } from '@/components/modals/AddStockModal';
import { useStore } from '@/store';
import {
  useHoldings,
  useUpdateHolding,
  useDeleteHolding,
  useTogglePin,
  useToggleWatch,
} from '@/hooks/useHoldings';
import { useQuotes } from '@/hooks/useQuotes';
import { useSettings } from '@/hooks/useSettings';
import { useCalculations } from '@/hooks/useCalculations';
import { useSortedHoldings } from '@/hooks/useSortedHoldings';
import { formatTime } from '@/utils/format';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
});

function AppContent() {
  const [lastUpdate, setLastUpdate] = useState(0);

  const {
    showAddModal,
    sortField,
    sortOrder,
    isRefreshing,
    setShowAddModal,
    setSort,
    setIsRefreshing,
    settings,
    holdings,
    setSettings,
    setHoldings,
  } = useStore();

  // 加载数据
  const holdingsQuery = useHoldings();
  const settingsQuery = useSettings();
  const togglePin = useTogglePin();
  const toggleWatch = useToggleWatch();
  const updateHolding = useUpdateHolding();
  const deleteHolding = useDeleteHolding();

  // 行情数据（腾讯财经无需Token）
  const codes = holdings.map((h) => h.code);
  const quotesQuery = useQuotes(codes, true);

  // 计算数据
  const { holdingsWithQuotes, overview } = useCalculations(
    holdings,
    quotesQuery.data || []
  );

  // 排序
  const sortedHoldings = useSortedHoldings(holdingsWithQuotes, sortField, sortOrder);

  // 同步数据到 store
  useEffect(() => {
    if (holdingsQuery.data) {
      setHoldings(holdingsQuery.data);
    }
  }, [holdingsQuery.data]);

  useEffect(() => {
    if (settingsQuery.data) {
      setSettings(settingsQuery.data);
    }
  }, [settingsQuery.data]);

  // 更新最后更新时间
  useEffect(() => {
    if (quotesQuery.data) {
      setLastUpdate(Date.now());
    }
  }, [quotesQuery.data]);

  // 监听刷新消息
  useEffect(() => {
    const listener = (message: { action: string }) => {
      if (message.action === 'refresh') {
        handleRefresh();
      }
    };
    chrome.runtime.onMessage.addListener(listener as (message: unknown) => void);
    return () => chrome.runtime.onMessage.removeListener(listener as (message: unknown) => void);
  }, []);

  const handleRefresh = async () => {
    setIsRefreshing(true);
    await quotesQuery.refetch();
    setIsRefreshing(false);
  };

  const handleSort = (field: typeof sortField) => {
    setSort(field);
  };

  const handleTogglePin = (code: string) => {
    togglePin.mutate(code);
  };

  const handleToggleWatch = (code: string) => {
    toggleWatch.mutate(code);
  };

  const handleUpdate = (code: string, costPrice: number, shares: number) => {
    updateHolding.mutate({
      code,
      updates: { costPrice, shares },
    });
  };

  const handleDelete = (code: string) => {
    if (confirm('确定要删除这个持仓吗？')) {
      deleteHolding.mutate(code);
    }
  };

  const openSettings = () => {
    chrome.runtime.openOptionsPage();
  };

  const isLoading = holdingsQuery.isLoading || settingsQuery.isLoading;

  return (
    <div className="flex h-[600px] w-[800px]">
      {/* 左侧边栏 */}
      <aside className="w-14 bg-gray-50 border-r border-gray-200 flex flex-col items-center py-4 gap-2">
        <div className="w-10 h-10 bg-primary-50 text-primary-500 rounded-lg flex items-center justify-center">
          <LineChart size={20} />
        </div>
        <button
          onClick={openSettings}
          className="w-10 h-10 text-gray-500 hover:bg-gray-200 hover:text-gray-700 rounded-lg flex items-center justify-center transition-colors"
        >
          <Settings size={20} />
        </button>
      </aside>

      {/* 主内容 */}
      <main className="flex-1 flex flex-col min-w-0">
        {/* 顶部概览 */}
        <header className="px-5 py-4 border-b border-gray-100">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-3">
              <h1 className="text-lg font-semibold text-gray-900">我的持仓</h1>
              <span className="text-xs px-2 py-0.5 bg-gray-100 text-gray-600 rounded">
                {holdings.length} / 100
              </span>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={handleRefresh}
                disabled={isRefreshing}
                className="p-2 text-gray-500 hover:bg-gray-100 rounded-lg transition-colors disabled:opacity-50"
              >
                <RefreshCw size={18} className={isRefreshing ? 'animate-spin' : ''} />
              </button>
            </div>
          </div>
          <Overview data={overview} colorMode={settings.colorMode} />
        </header>

        {/* 股票列表 */}
        <div className="flex-1 overflow-auto">
          {isLoading ? (
            <div className="flex items-center justify-center h-full text-gray-400">
              加载中...
            </div>
          ) : holdings.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-gray-400 gap-3">
              <LineChart size={48} className="opacity-30" />
              <p>暂无持仓，点击下方按钮添加</p>
            </div>
          ) : (
            <StockTable
              holdings={sortedHoldings}
              colorMode={settings.colorMode}
              sortField={sortField}
              sortOrder={sortOrder}
              onSort={handleSort}
              onTogglePin={handleTogglePin}
              onToggleWatch={handleToggleWatch}
              onUpdate={handleUpdate}
              onDelete={handleDelete}
            />
          )}
        </div>

        {/* 底部操作栏 */}
        <footer className="px-5 py-3 border-t border-gray-100 flex items-center justify-between">
          <span className="text-xs text-gray-400">
            {lastUpdate > 0 ? `最后更新: ${formatTime(lastUpdate)}` : '未更新'}
          </span>
          <div className="flex gap-2">
            <Button
              variant="default"
              size="sm"
              onClick={() => {
                useStore.setState({ activeAddTab: 'batch' });
                setShowAddModal(true);
              }}
            >
              批量导入
            </Button>
            <Button size="sm" onClick={() => setShowAddModal(true)}>
              + 添加股票
            </Button>
          </div>
        </footer>
      </main>

      {/* 弹窗 */}
      <AddStockModal
        isOpen={showAddModal}
        onClose={() => setShowAddModal(false)}
        currentCount={holdings.length}
      />
    </div>
  );
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AppContent />
    </QueryClientProvider>
  );
}
