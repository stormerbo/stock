import { useState } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Button } from '@/components/ui/Button';

import { Toast } from '@/components/ui/Toast';
import { useSettings, useSetSettings } from '@/hooks/useSettings';
import { useHoldings } from '@/hooks/useHoldings';
import { exportData, importData, clearAll } from '@/utils/storage';
import { CheckCircle } from 'lucide-react';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
});

function AppContent() {
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  const settingsQuery = useSettings();
  const holdingsQuery = useHoldings();
  const setSettings = useSetSettings();

  const settings = settingsQuery.data;
  const holdingsCount = holdingsQuery.data?.length || 0;

  const handleSaveSettings = () => {
    setSettings.mutate(settings || {}, {
      onSuccess: () => setToast({ message: '设置已保存', type: 'success' }),
      onError: (err: Error) => setToast({ message: err.message, type: 'error' }),
    });
  };

  const handleExport = async () => {
    try {
      const data = await exportData();
      const blob = new Blob([data], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `stock-tracker-backup-${new Date().toISOString().split('T')[0]}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      setToast({ message: '数据已导出', type: 'success' });
    } catch (err) {
      setToast({ message: '导出失败', type: 'error' });
    }
  };

  const handleImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      const text = await file.text();
      const result = await importData(text);
      if (result.success) {
        holdingsQuery.refetch();
        setToast({ message: '数据导入成功', type: 'success' });
      } else {
        setToast({ message: result.error || '导入失败', type: 'error' });
      }
    } catch {
      setToast({ message: '导入失败', type: 'error' });
    }
    e.target.value = '';
  };

  const handleClear = async () => {
    if (!confirm('确定要清除所有数据吗？\n\n这将删除所有持仓和设置，不可恢复！')) return;

    try {
      await clearAll();
      holdingsQuery.refetch();
      settingsQuery.refetch();
      setToast({ message: '数据已清除', type: 'success' });
    } catch (err) {
      setToast({ message: '清除失败', type: 'error' });
    }
  };

  if (settingsQuery.isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center text-gray-400">
        加载中...
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-100 py-10 px-4">
      <div className="max-w-2xl mx-auto bg-white rounded-lg shadow-sm overflow-hidden">
        <header className="px-6 py-5 border-b border-gray-100 bg-gray-50">
          <h1 className="text-xl font-semibold text-gray-900">设置</h1>
        </header>

        <main className="p-6 space-y-8">
          {/* API 配置 */}
          <section>
            <h2 className="text-sm font-semibold text-gray-900 mb-4 pb-2 border-b border-gray-100">
              API 配置
            </h2>
            <div className="flex items-center justify-between py-2">
              <div>
                <div className="font-medium text-gray-900">数据来源</div>
                <div className="text-sm text-gray-500">腾讯财经（免费，无需配置）</div>
              </div>
              <div className="flex items-center gap-3">
                <span className="flex items-center gap-1 text-sm text-green-600">
                  <CheckCircle size={14} />
                  已启用
                </span>
              </div>
            </div>
            <p className="text-sm text-gray-500 mt-2">
              数据来源于腾讯财经公开接口，无需注册和配置 Token。
            </p>
          </section>

          {/* 刷新设置 */}
          <section>
            <h2 className="text-sm font-semibold text-gray-900 mb-4 pb-2 border-b border-gray-100">
              刷新设置
            </h2>
            <div className="flex items-center justify-between py-2">
              <div>
                <div className="font-medium text-gray-900">自动刷新间隔</div>
                <div className="text-sm text-gray-500">最低 5 秒，建议 10-30 秒</div>
              </div>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  min={5}
                  max={300}
                  value={settings?.refreshInterval || 10}
                  onChange={(e) =>
                    setSettings.mutate({
                      ...settings,
                      refreshInterval: parseInt(e.target.value) || 10,
                    })
                  }
                  className="w-20 px-3 py-2 border border-gray-300 rounded text-sm text-center focus:outline-none focus:border-primary-500"
                />
                <span className="text-sm text-gray-600">秒</span>
              </div>
            </div>
          </section>

          {/* 显示设置 */}
          <section>
            <h2 className="text-sm font-semibold text-gray-900 mb-4 pb-2 border-b border-gray-100">
              显示设置
            </h2>
            <div className="space-y-4">
              <div className="flex items-center justify-between py-2">
                <div>
                  <div className="font-medium text-gray-900">涨跌颜色</div>
                  <div className="text-sm text-gray-500">红涨绿跌 或 绿涨红跌</div>
                </div>
                <select
                  value={settings?.colorMode || 'red-up'}
                  onChange={(e) =>
                    setSettings.mutate({
                      ...settings,
                      colorMode: e.target.value as 'red-up' | 'green-up',
                    })
                  }
                  className="px-3 py-2 border border-gray-300 rounded text-sm bg-white focus:outline-none focus:border-primary-500"
                >
                  <option value="red-up">红涨绿跌（A股）</option>
                  <option value="green-up">绿涨红跌（港美股）</option>
                </select>
              </div>

              <div className="flex items-center justify-between py-2">
                <div>
                  <div className="font-medium text-gray-900">价格小数位</div>
                  <div className="text-sm text-gray-500">显示精度</div>
                </div>
                <select
                  value={settings?.decimals || 2}
                  onChange={(e) =>
                    setSettings.mutate({
                      ...settings,
                      decimals: parseInt(e.target.value),
                    })
                  }
                  className="px-3 py-2 border border-gray-300 rounded text-sm bg-white focus:outline-none focus:border-primary-500"
                >
                  <option value={2}>2位</option>
                  <option value={3}>3位</option>
                  <option value={4}>4位</option>
                </select>
              </div>
            </div>
          </section>

          {/* 数据管理 */}
          <section>
            <h2 className="text-sm font-semibold text-gray-900 mb-4 pb-2 border-b border-gray-100">
              数据管理
            </h2>
            <div className="space-y-3">
              <div className="flex items-center justify-between py-2">
                <div>
                  <div className="font-medium text-gray-900">备份持仓数据</div>
                  <div className="text-sm text-gray-500">导出为 JSON 文件</div>
                </div>
                <Button variant="default" size="sm" onClick={handleExport}>
                  导出
                </Button>
              </div>

              <div className="flex items-center justify-between py-2">
                <div>
                  <div className="font-medium text-gray-900">恢复持仓数据</div>
                  <div className="text-sm text-gray-500">从 JSON 文件导入</div>
                </div>
                <label>
                  <input type="file" accept=".json" onChange={handleImport} className="hidden" />
                  <span className="inline-flex items-center px-4 py-2 border border-gray-300 rounded text-sm font-medium text-gray-700 bg-white hover:border-primary-500 hover:text-primary-500 cursor-pointer transition-colors">
                    导入
                  </span>
                </label>
              </div>

              <div className="flex items-center justify-between py-2">
                <div>
                  <div className="font-medium text-gray-900">持仓数量</div>
                  <div className="text-sm text-gray-500">最多支持 100 个</div>
                </div>
                <span className="text-primary-500 font-medium">{holdingsCount} / 100</span>
              </div>

              <div className="flex items-center justify-between py-3 border-t border-gray-100 mt-2">
                <div>
                  <div className="font-medium text-red-600">清除所有数据</div>
                  <div className="text-sm text-gray-500">删除所有持仓和设置，不可恢复</div>
                </div>
                <Button variant="danger" size="sm" onClick={handleClear}>
                  清除
                </Button>
              </div>
            </div>
          </section>

          {/* 关于 */}
          <section>
            <h2 className="text-sm font-semibold text-gray-900 mb-4 pb-2 border-b border-gray-100">
              关于
            </h2>
            <div className="space-y-2 text-sm text-gray-600">
              <div className="flex justify-between">
                <span>版本</span>
                <span>v1.0.0</span>
              </div>
              <div className="flex justify-between">
                <span>数据来源</span>
                <span>腾讯财经</span>
              </div>
            </div>
          </section>
        </main>

        <footer className="px-6 py-4 border-t border-gray-100 bg-gray-50">
          <div className="flex justify-end">
            <Button onClick={handleSaveSettings} disabled={setSettings.isPending}>
              {setSettings.isPending ? '保存中...' : '保存设置'}
            </Button>
          </div>
        </footer>
      </div>

      {toast && (
        <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />
      )}
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
