import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { ROUTE_PATHS } from '../routes';
import StockRow from '../components/StockRow';
import StatCard from '../components/StatCard';
import Pagination from '../components/Pagination';
import VirtualStockTable from '../components/VirtualStockTable';

// 模拟股票数据
const mockStocks = [
  { symbol: '000001', name: '平安银行', price: 12.34, change: 0.23, changePercent: 1.90, volume: '1.2亿', marketCap: '2400亿' },
  { symbol: '000002', name: '万科A', price: 15.67, change: -0.45, changePercent: -2.79, volume: '0.8亿', marketCap: '1800亿' },
  { symbol: '000333', name: '美的集团', price: 56.78, change: 1.23, changePercent: 2.21, volume: '0.5亿', marketCap: '4000亿' },
  { symbol: '000858', name: '五粮液', price: 156.78, change: 3.45, changePercent: 2.25, volume: '0.3亿', marketCap: '6000亿' },
  { symbol: '002415', name: '海康威视', price: 34.56, change: 0.78, changePercent: 2.31, volume: '0.4亿', marketCap: '3200亿' },
  { symbol: '300750', name: '宁德时代', price: 234.56, change: 8.45, changePercent: 3.73, volume: '0.6亿', marketCap: '10000亿' },
  { symbol: '600036', name: '招商银行', price: 32.45, change: -0.23, changePercent: -0.70, volume: '0.9亿', marketCap: '8000亿' },
  { symbol: '600519', name: '贵州茅台', price: 1678.90, change: 45.32, changePercent: 2.77, volume: '0.1亿', marketCap: '21000亿' },
  { symbol: '601318', name: '中国平安', price: 45.67, change: -0.89, changePercent: -1.91, volume: '1.1亿', marketCap: '8300亿' },
  { symbol: '601988', name: '中国银行', price: 3.45, change: -0.02, changePercent: -0.58, volume: '2.3亿', marketCap: '9500亿' },
];

const StockListPage: React.FC = () => {
  const [stocks, setStocks] = useState(mockStocks);
  const [loading, setLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [sortBy, setSortBy] = useState<'symbol' | 'name' | 'price' | 'changePercent'>('symbol');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc');
  const [currentPage, setCurrentPage] = useState(1);
  const [useVirtualScroll, setUseVirtualScroll] = useState(false);
  const itemsPerPage = 10;

  // 模拟数据加载
  useEffect(() => {
    setLoading(true);
    setTimeout(() => {
      setLoading(false);
    }, 500);
  }, []);

  // 使用useMemo缓存过滤和排序结果
  const filteredAndSortedStocks = useMemo(() => {
    // removed: console.log
    let result = [...stocks];
    
    // 过滤
    if (searchTerm.trim()) {
      result = result.filter(stock =>
        stock.symbol.toLowerCase().includes(searchTerm.toLowerCase()) ||
        stock.name.toLowerCase().includes(searchTerm.toLowerCase())
      );
    }
    
    // 排序
    result.sort((a, b) => {
      let aValue = a[sortBy] as string | number;
      let bValue = b[sortBy] as string | number;

      if (sortBy === 'symbol' || sortBy === 'name') {
        aValue = String(aValue).toLowerCase();
        bValue = String(bValue).toLowerCase();
      }

      if (sortOrder === 'asc') {
        return aValue > bValue ? 1 : -1;
      } else {
        return aValue < bValue ? 1 : -1;
      }
    });
    
    return result;
  }, [stocks, searchTerm, sortBy, sortOrder]);

  // 分页计算 - 使用useMemo缓存
  const { totalPages, startIndex, endIndex, currentStocks } = useMemo(() => {
    // removed: console.log
    const totalPages = Math.ceil(filteredAndSortedStocks.length / itemsPerPage);
    const startIndex = (currentPage - 1) * itemsPerPage;
    const endIndex = startIndex + itemsPerPage;
    const currentStocks = filteredAndSortedStocks.slice(startIndex, endIndex);
    
    return { totalPages, startIndex, endIndex, currentStocks };
  }, [filteredAndSortedStocks, currentPage, itemsPerPage]);

  // 统计信息计算 - 使用useMemo缓存
  const stats = useMemo(() => {
    // removed: console.log
    const totalStocks = stocks.length;
    const risingStocks = stocks.filter(s => s.changePercent > 0).length;
    const fallingStocks = stocks.filter(s => s.changePercent < 0).length;
    const totalMarketCap = stocks.reduce((sum, stock) => sum + stock.price, 0).toFixed(0);
    
    return {
      totalStocks,
      risingStocks,
      fallingStocks,
      totalMarketCap
    };
  }, [stocks]);

  // 处理排序点击 - 使用useCallback优化
  const handleSort = useCallback((column: typeof sortBy) => {
    setSortBy(column);
    setSortOrder(prevOrder => {
      if (sortBy === column) {
        return prevOrder === 'asc' ? 'desc' : 'asc';
      }
      return 'asc';
    });
  }, [sortBy]);

  // 刷新数据 - 使用useCallback优化
  const refreshData = useCallback(() => {
    setLoading(true);
    setTimeout(() => {
      // 在实际应用中这里应该调用API
      setLoading(false);
    }, 1000);
  }, []);

  // 处理搜索输入 - 使用useCallback优化
  const handleSearchChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setSearchTerm(e.target.value);
    setCurrentPage(1); // 搜索时重置到第一页
  }, []);

  // 处理分页变化 - 使用useCallback优化
  const handlePageChange = useCallback((page: number) => {
    setCurrentPage(page);
  }, []);

  // 切换虚拟滚动 - 使用useCallback优化
  const toggleVirtualScroll = useCallback(() => {
    setUseVirtualScroll(prev => !prev);
  }, []);

  // 渲染排序箭头
  const renderSortArrow = (column: typeof sortBy) => {
    if (sortBy !== column) return null;
    return sortOrder === 'asc' ? '↑' : '↓';
  };

  return (
    <div className="stock-list-page">
      {/* 页面标题和搜索 */}
      <div className="page-header">
        <div>
          <h1 className="page-title">📈 股票列表</h1>
          <p className="page-subtitle">实时A股市场行情数据</p>
        </div>
        <div className="header-actions">
          <div className="search-box">
            <input
              type="text"
              placeholder="搜索股票代码或名称..."
              value={searchTerm}
              onChange={handleSearchChange}
            />
            <button className="search-btn">🔍</button>
          </div>
          <button 
            className="refresh-btn"
            onClick={refreshData}
            disabled={loading}
          >
            {loading ? '刷新中...' : '🔄 刷新'}
          </button>
        </div>
      </div>

      {/* 统计信息 - 使用记忆化组件 */}
      <div className="stats-cards">
        <StatCard
          icon="📊"
          value={stats.totalStocks}
          label="总股票数"
        />
        <StatCard
          icon="📈"
          value={stats.risingStocks}
          label="上涨股票"
          className="positive"
        />
        <StatCard
          icon="📉"
          value={stats.fallingStocks}
          label="下跌股票"
          className="negative"
        />
        <StatCard
          icon="💰"
          value={stats.totalMarketCap}
          label="总市值(亿)"
        />
      </div>

      {/* 股票表格 */}
      <div className="stock-table-container">
        {loading ? (
          <div className="loading-state">
            <div className="loading-spinner"></div>
            <p>加载股票数据中...</p>
          </div>
        ) : (
          <>
            <div className="table-header">
              <h3>股票列表 ({filteredAndSortedStocks.length} 只股票)</h3>
              <div className="table-actions">
                <button 
                  className={`virtual-scroll-btn ${useVirtualScroll ? 'active' : ''}`}
                  onClick={toggleVirtualScroll}
                  title={useVirtualScroll ? '关闭虚拟滚动' : '开启虚拟滚动'}
                >
                  {useVirtualScroll ? '📊 关闭虚拟滚动' : '⚡ 开启虚拟滚动'}
                </button>
                <button className="export-btn">📥 导出数据</button>
                <button className="filter-btn">🔧 筛选设置</button>
              </div>
            </div>

            <div className="stock-table-wrapper">
              {useVirtualScroll ? (
                // 使用虚拟滚动表格
                <>
                  <div className="table-header-row">
                    <table className="stock-table-header">
                      <thead>
                        <tr>
                          <th onClick={() => handleSort('symbol')}>
                            代码 {renderSortArrow('symbol')}
                          </th>
                          <th onClick={() => handleSort('name')}>
                            名称 {renderSortArrow('name')}
                          </th>
                          <th onClick={() => handleSort('price')}>
                            价格 {renderSortArrow('price')}
                          </th>
                          <th onClick={() => handleSort('changePercent')}>
                            涨跌幅 {renderSortArrow('changePercent')}
                          </th>
                          <th>成交量</th>
                          <th>市值</th>
                          <th>操作</th>
                        </tr>
                      </thead>
                    </table>
                  </div>
                  <VirtualStockTable
                    stocks={filteredAndSortedStocks}
                    height={400}
                    rowHeight={50}
                  />
                </>
              ) : (
                // 使用普通表格（带分页）
                <table className="stock-table">
                  <thead>
                    <tr>
                      <th onClick={() => handleSort('symbol')}>
                        代码 {renderSortArrow('symbol')}
                      </th>
                      <th onClick={() => handleSort('name')}>
                        名称 {renderSortArrow('name')}
                      </th>
                      <th onClick={() => handleSort('price')}>
                        价格 {renderSortArrow('price')}
                      </th>
                      <th onClick={() => handleSort('changePercent')}>
                        涨跌幅 {renderSortArrow('changePercent')}
                      </th>
                      <th>成交量</th>
                      <th>市值</th>
                      <th>操作</th>
                    </tr>
                  </thead>
                  <tbody>
                    {currentStocks.map((stock) => (
                      <StockRow key={stock.symbol} stock={stock} />
                    ))}
                  </tbody>
                </table>
              )}
            </div>

            {/* 分页 - 只在非虚拟滚动模式下显示 */}
            {!useVirtualScroll && (
              <Pagination
                currentPage={currentPage}
                totalPages={totalPages}
                onPageChange={handlePageChange}
              />
            )}
          </>
        )}
      </div>

      {/* 性能提示 */}
      <div className="performance-tips">
        <h4>🎯 性能优化提示</h4>
        <ul>
          <li>✅ 使用React.memo记忆化组件，减少不必要的重新渲染</li>
          <li>✅ 使用useMemo缓存昂贵的计算结果</li>
          <li>✅ 使用useCallback避免函数重新创建</li>
          <li>✅ 组件级代码分割，按需加载</li>
          <li>✅ 虚拟滚动支持，处理大数据量 (点击"开启虚拟滚动"按钮)</li>
          <li>📊 当前模式: {useVirtualScroll ? '虚拟滚动(显示所有数据)' : '分页模式(显示当前页数据)'}</li>
        </ul>
      </div>
    </div>
  );
};

export default StockListPage;