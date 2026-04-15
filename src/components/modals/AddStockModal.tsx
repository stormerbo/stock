import { useState, useMemo } from 'react';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Tabs, TabPanel } from '@/components/ui/Tabs';
import { useSearchStocks } from '@/hooks/useSearch';
import { useAddHolding, useBatchAddHoldings } from '@/hooks/useHoldings';
import { parseBatchInput, addMarketSuffix } from '@/utils/stock';
import { getStockName } from '@/api/tencent';
import { Search, Loader2 } from 'lucide-react';


interface AddStockModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentCount: number;
}

export function AddStockModal({ isOpen, onClose, currentCount }: AddStockModalProps) {
  const [activeTab, setActiveTab] = useState<'single' | 'batch'>('single');
  const [searchKeyword, setSearchKeyword] = useState('');
  const [selectedStock, setSelectedStock] = useState<{ code: string; name: string } | null>(null);
  const [costPrice, setCostPrice] = useState('');
  const [shares, setShares] = useState('');
  const [batchText, setBatchText] = useState('');
  const [error, setError] = useState('');

  const searchQuery = useSearchStocks(searchKeyword);
  const addHolding = useAddHolding();
  const batchAdd = useBatchAddHoldings();

  const remainingSlots = useMemo(() => 100 - currentCount, [currentCount]);

  const handleSearch = (e: React.ChangeEvent<HTMLInputElement>) => {
    setSearchKeyword(e.target.value);
    setSelectedStock(null);
  };

  const handleSelectStock = (stock: { code: string; name: string }) => {
    setSelectedStock(stock);
    setSearchKeyword('');
  };

  const handleAdd = () => {
    if (activeTab === 'single') {
      if (!selectedStock) {
        setError('请选择股票');
        return;
      }
      // 成本价和持仓数量可选，空值默认为0
      const price = costPrice.trim() ? parseFloat(costPrice) : 0;
      const count = shares.trim() ? parseInt(shares) : 0;
      
      // 如果有输入值，验证有效性
      if (costPrice.trim() && (isNaN(price) || price < 0)) {
        setError('请输入有效的成本价');
        return;
      }
      if (shares.trim() && (isNaN(count) || count < 0)) {
        setError('请输入有效的持仓数量');
        return;
      }

      addHolding.mutate(
        {
          code: selectedStock.code,
          name: selectedStock.name,
          costPrice: price,
          shares: count,
        },
        {
          onSuccess: () => {
            handleClose();
          },
          onError: (err: Error) => {
            setError(err.message);
          },
        }
      );
    } else {
      const items = parseBatchInput(batchText);
      if (items.length === 0) {
        setError('未能解析有效数据，请检查格式');
        return;
      }
      if (items.length > remainingSlots) {
        setError(`最多还能添加 ${remainingSlots} 个股票`);
        return;
      }

      batchAdd.mutate(items, {
        onSuccess: (result) => {
          if (result.success.length > 0) {
            handleClose();
          }
          if (result.failed.length > 0) {
            setError(`${result.failed.length} 个失败: ${result.failed.map((f) => f.reason).join(', ')}`);
          }
        },
        onError: (err: Error) => {
          setError(err.message);
        },
      });
    }
  };

  const handleClose = () => {
    setActiveTab('single');
    setSearchKeyword('');
    setSelectedStock(null);
    setCostPrice('');
    setShares('');
    setBatchText('');
    setError('');
    onClose();
  };

  const isLoading = addHolding.isPending || batchAdd.isPending;

  return (
    <Modal
      isOpen={isOpen}
      onClose={handleClose}
      title="添加股票"
      subtitle={`${currentCount} / 100`}
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="default" onClick={handleClose}>
            取消
          </Button>
          <Button onClick={handleAdd} disabled={isLoading}>
            {isLoading ? '添加中...' : '添加'}
          </Button>
        </div>
      }
    >
      <Tabs
        tabs={[
          { id: 'single', label: '单个添加' },
          { id: 'batch', label: '批量导入' },
        ]}
        activeTab={activeTab}
        onChange={(tab) => setActiveTab(tab as 'single' | 'batch')}
      />

      {error && <p className="text-sm text-red-500 mb-3">{error}</p>}

      <TabPanel isActive={activeTab === 'single'}>
        {!selectedStock ? (
          <>
            <div className="relative mb-3">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={16} />
              <input
                type="text"
                value={searchKeyword}
                onChange={handleSearch}
                placeholder="搜索股票名称或代码（至少输入2个字符）"
                className="w-full pl-9 pr-3 py-2 border border-gray-300 rounded text-sm focus:outline-none focus:border-primary-500"
              />
              {searchQuery.isLoading && (
                <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 text-primary-500 animate-spin" size={16} />
              )}
            </div>
            
            {/* 搜索结果下拉列表 */}
            {searchKeyword.length >= 2 && (
              <div className="border border-gray-200 rounded bg-white shadow-lg max-h-48 overflow-auto z-50 relative">
                {searchQuery.isLoading ? (
                  <div className="px-3 py-4 text-center text-sm text-gray-500 flex items-center justify-center gap-2">
                    <Loader2 className="animate-spin" size={14} />
                    搜索中...
                  </div>
                ) : searchQuery.error ? (
                  <div className="px-3 py-4 text-center text-sm text-red-500">
                    搜索失败: {searchQuery.error.message || '请检查网络连接'}
                  </div>
                ) : searchQuery.data && searchQuery.data.length > 0 ? (
                  <>
                    <div className="px-3 py-1.5 text-xs text-gray-400 bg-gray-50 border-b border-gray-100">
                      找到 {searchQuery.data.length} 个结果
                    </div>
                    {searchQuery.data.map((stock) => (
                      <button
                        key={stock.code}
                        onClick={() => handleSelectStock(stock)}
                        className="w-full px-3 py-2.5 text-left hover:bg-gray-50 flex justify-between items-center border-b border-gray-100 last:border-b-0 transition-colors"
                      >
                        <span className="text-sm font-medium text-gray-900">{stock.name}</span>
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-gray-500 font-mono">
                            {stock.code.replace(/\.(SZ|SH|BJ)$/i, '')}
                          </span>
                          <span className={`text-xs px-1.5 py-0.5 rounded ${
                            stock.code.endsWith('.SH') ? 'bg-red-50 text-red-600' :
                            stock.code.endsWith('.SZ') ? 'bg-blue-50 text-blue-600' :
                            'bg-gray-100 text-gray-600'
                          }`}>
                            {stock.code.endsWith('.SH') ? '上证' :
                             stock.code.endsWith('.SZ') ? '深证' : '北交'}
                          </span>
                        </div>
                      </button>
                    ))}
                  </>
                ) : (
                  <div className="px-3 py-4 text-center text-sm text-gray-500">
                    未找到匹配的股票，请尝试其他关键词
                  </div>
                )}
              </div>
            )}
          </>
        ) : (
          <div className="space-y-4">
            <div className="flex items-center justify-between p-3 bg-primary-50 rounded">
              <span className="font-medium">{selectedStock.name}</span>
              <button
                onClick={() => setSelectedStock(null)}
                className="text-xs text-primary-500 hover:underline"
              >
                重新选择
              </button>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Input
                label="成本价（可选）"
                type="number"
                step="0.01"
                value={costPrice}
                onChange={(e) => setCostPrice(e.target.value)}
                placeholder="留空则为0"
              />
              <Input
                label="持仓数量（可选）"
                type="number"
                step="1"
                value={shares}
                onChange={(e) => setShares(e.target.value)}
                placeholder="留空则为0"
              />
            </div>
          </div>
        )}
      </TabPanel>

      <TabPanel isActive={activeTab === 'batch'}>
        <textarea
          value={batchText}
          onChange={(e) => setBatchText(e.target.value)}
          placeholder="格式：代码,成本价,持仓数（成本价和持仓数可选）&#10;例如：&#10;300014,70.32,1000&#10;002594,198.50,500&#10;000001&#10;600519,1000"
          className="w-full h-36 p-3 border border-gray-300 rounded text-sm font-mono resize-none focus:outline-none focus:border-primary-500"
        />
        <p className="text-xs text-gray-500 mt-2">
          支持格式：代码 或 代码,成本价,持仓数（每行一个，后两者可选）
        </p>
      </TabPanel>
    </Modal>
  );
}
