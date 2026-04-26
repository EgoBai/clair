import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { ROUTE_PATHS } from '../routes';
import {
  useStocks,
  useStockStats,
  useStockActions,
  useWatchlist,
  initializeSampleData,
} from '../store/useStockStore';

const StockListPage: React.FC = () => {
  const stocks = useStocks();
  const stats = useStockStats();
  const watchlist = useWatchlist();
  const { toggleWatchlist } = useStockActions();
  const [loading, setLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [sortBy, setSortBy] = useState<'symbol' | 'name' | 'price' | 'changePercent'>('symbol');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc');
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 10;

  // 初始化数据：如果 store 为空，加载示例数据
  useEffect(() => {
    if (stocks.length === 0) {
      initializeSampleData();
    }
  }, []);

  // 使用useMemo缓存过滤和排序结果
  const filteredAndSortedStocks = useMemo(() => {
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
    const totalPages = Math.ceil(filteredAndSortedStocks.length / itemsPerPage);
    const startIndex = (currentPage - 1) * itemsPerPage;
    const endIndex = startIndex + itemsPerPage;
    const currentStocks = filteredAndSortedStocks.slice(startIndex, endIndex);
    
    return { totalPages, startIndex, endIndex, currentStocks };
  }, [filteredAndSortedStocks, currentPage, itemsPerPage]);

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
    // 从 store 重新初始化数据
    initializeSampleData();
    setLoading(false);
  }, []);

  // 处理搜索输入 - 使用useCallback优化
  const handleSearchChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setSearchTerm(e.target.value);
    setCurrentPage(1); // 搜索时重置到第一页
  }, []);

  // 处理分页 - 使用useCallback优化
  const handlePageChange = useCallback((page: number) => {
    setCurrentPage(page);
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
              onChange={(e) => setSearchTerm(e.target.value)}
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

      {/* 统计信息 */}
      <div className="stats-cards">
        <div className="stat-card">
          <div className="stat-icon">📊</div>
          <div className="stat-content">
            <div className="stat-value">{stats.totalStocks}</div>
            <div className="stat-label">总股票数</div>
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-icon">📈</div>
          <div className="stat-content">
            <div className="stat-value positive">
              {stats.risingStocks}
            </div>
            <div className="stat-label">上涨股票</div>
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-icon">📉</div>
          <div className="stat-content">
            <div className="stat-value negative">
              {stats.fallingStocks}
            </div>
            <div className="stat-label">下跌股票</div>
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-icon">💰</div>
          <div className="stat-content">
            <div className="stat-value">
              {stats.totalMarketCap.toFixed(0)}
            </div>
            <div className="stat-label">总市值(亿)</div>
          </div>
        </div>
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
                <button className="export-btn">📥 导出数据</button>
                <button className="filter-btn">🔧 筛选设置</button>
              </div>
            </div>

            <div className="stock-table-wrapper">
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
                    <tr key={stock.symbol}>
                      <td className="stock-symbol">
                        <Link to={`${ROUTE_PATHS.STOCKS}/${stock.symbol}`}>
                          {stock.symbol}
                        </Link>
                      </td>
                      <td className="stock-name">{stock.name}</td>
                      <td className="stock-price">¥{stock.price.toFixed(2)}</td>
                      <td className={`stock-change ${stock.changePercent >= 0 ? 'positive' : 'negative'}`}>
                        {stock.changePercent >= 0 ? '+' : ''}{stock.changePercent.toFixed(2)}%
                      </td>
                      <td className="stock-volume">{stock.volume}</td>
                      <td className="stock-market-cap">{stock.marketCap}</td>
                      <td className="stock-actions">
                        <Link 
                          to={`${ROUTE_PATHS.STOCKS}/${stock.symbol}`}
                          className="view-btn"
                        >
                          查看详情
                        </Link>
                        <button 
                          className="watch-btn"
                          onClick={() => toggleWatchlist(stock.symbol)}
                        >
                          {watchlist.includes(stock.symbol) ? '⭐' : '☆'}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* 分页 */}
            {totalPages > 1 && (
              <div className="pagination">
                <button
                  className="page-btn"
                  onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                  disabled={currentPage === 1}
                >
                  上一页
                </button>
                
                <div className="page-numbers">
                  {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                    let pageNum;
                    if (totalPages <= 5) {
                      pageNum = i + 1;
                    } else if (currentPage <= 3) {
                      pageNum = i + 1;
                    } else if (currentPage >= totalPages - 2) {
                      pageNum = totalPages - 4 + i;
                    } else {
                      pageNum = currentPage - 2 + i;
                    }
                    
                    return (
                      <button
                        key={pageNum}
                        className={`page-number ${currentPage === pageNum ? 'active' : ''}`}
                        onClick={() => setCurrentPage(pageNum)}
                      >
                        {pageNum}
                      </button>
                    );
                  })}
                </div>
                
                <button
                  className="page-btn"
                  onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                  disabled={currentPage === totalPages}
                >
                  下一页
                </button>
                
                <div className="page-info">
                  第 {currentPage} 页，共 {totalPages} 页
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {/* 快速链接 */}
      <div className="quick-links">
        <h3>📋 快速访问</h3>
        <div className="links-grid">
          <Link to={ROUTE_PATHS.MARKET} className="link-card">
            <div className="link-icon">📊</div>
            <div className="link-content">
              <h4>市场分析</h4>
              <p>查看市场趋势和数据分析</p>
            </div>
          </Link>
          <Link to={ROUTE_PATHS.WATCHLIST} className="link-card">
            <div className="link-icon">⭐</div>
            <div className="link-content">
              <h4>自选股</h4>
              <p>管理您关注的股票</p>
            </div>
          </Link>
          <Link to={ROUTE_PATHS.SCREENER} className="link-card">
            <div className="link-icon">🔍</div>
            <div className="link-content">
              <h4>股票筛选</h4>
              <p>按条件筛选优质股票</p>
            </div>
          </Link>
          <Link to={ROUTE_PATHS.DASHBOARD} className="link-card">
            <div className="link-icon">📋</div>
            <div className="link-content">
              <h4>仪表板</h4>
              <p>性能监控和统计</p>
            </div>
          </Link>
        </div>
      </div>

      <style>{`
        .stock-list-page {
          max-width: 1400px;
          margin: 0 auto;
        }

        /* 页面头部 */
        .page-header {
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
          margin-bottom: 24px;
          flex-wrap: wrap;
          gap: 16px;
        }

        .page-title {
          font-size: 24px;
          font-weight: 700;
          margin: 0;
          color: #333;
        }

        .page-subtitle {
          color: #666;
          margin: 4px 0 0;
          font-size: 14px;
        }

        .header-actions {
          display: flex;
          gap: 12px;
          align-items: center;
        }

        .search-box {
          display: flex;
          background: white;
          border: 1px solid #ddd;
          border-radius: 6px;
          overflow: hidden;
        }

        .search-box input {
          padding: 8px 12px;
          border: none;
          outline: none;
          font-size: 14px;
          min-width: 200px;
        }

        .search-btn {
          padding: 8px 16px;
          background: #f5f5f5;
          border: none;
          border-left: 1px solid #ddd;
          cursor: pointer;
          color: #666;
        }

        .refresh-btn {
          padding: 8px 16px;
          background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
          color: white;
          border: none;
          border-radius: 6px;
          cursor: pointer;
          font-size: 14px;
          font-weight: 500;
          transition: all 0.2s;
        }

        .refresh-btn:hover:not(:disabled) {
          transform: translateY(-1px);
          box-shadow: 0 4px 12px rgba(102, 126, 234, 0.3);
        }

        .refresh-btn:disabled {
          opacity: 0.6;
          cursor: not-allowed;
        }

        /* 统计卡片 */
        .stats-cards {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
          gap: 16px;
          margin-bottom: 24px;
        }

        .stat-card {
          background: white;
          border-radius: 12px;
          padding: 20px;
          display: flex;
          align-items: center;
          gap: 16px;
          box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08);
        }

        .stat-icon {
          font-size: 32px;
        }

        .stat-content {
          flex: 1;
        }

        .stat-value {
          font-size: 24px;
          font-weight: 700;
          color: #333;
        }

        .stat-value.positive {
          color: #52c41a;
        }

        .stat-value.negative {
          color: #ff4d4f;
        }

        .stat-label {
          font-size: 12px;
          color: #666;
          margin-top: 4px;
        }

        /* 股票表格 */
        .stock-table-container {
          background: white;
          border-radius: 12px;
          overflow: hidden;
          box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08);
          margin-bottom: 24px;
        }

        .table-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 20px;
          border-bottom: 1px solid #f0f0f0;
        }

        .table-header h3 {
          margin: 0;
          font-size: 16px;
          font-weight: 600;
          color: #333;
        }

        .table-actions {
          display: flex;
          gap: 8px;
        }

        .export-btn, .filter-btn {
          padding: 6px 12px;
          background: #f5f5f5;
          border: 1px solid #ddd;
          border-radius: 4px;
          font-size: 12px;
          cursor: pointer;
          transition: all 0.2s;
        }

        .export-btn:hover, .filter-btn:hover {
          background: #e0e0e0;
        }

        .stock-table-wrapper {
          overflow-x: auto;
        }

        .stock-table {
          width: 100%;
          border-collapse: collapse;
          font-size: 14px;
        }

        .stock-table th {
          background: #f8f9fa;
          padding: 12px 16px;
          text-align: left;
          font-weight: 600;
          color: #333;
          border-bottom: 2px solid #e9ecef;
          cursor: pointer;
          user-select: none;
          transition: background 0.2s;
        }

        .stock-table th:hover {
          background: #e9ecef;
        }

        .stock-table td {
          padding: 12px 16px;
          border-bottom: 1px solid #e9ecef;
          color: #555;
        }

        .stock-table tr:hover {
          background: #f8f9fa;
        }

        .stock-symbol a {
          color: #667eea;
          text-decoration: none;
          font-weight: 600;
        }

        .stock-symbol a:hover {
          text-decoration: underline;
        }

        .stock-name {
          font-weight: 500;
        }

        .stock-price {
          font-weight: 600;
          color: #333;
        }

        .stock-change {
          font-weight: 600;
          padding: 4px 8px;
          border-radius: 4px;
          font-size: 12px;
        }

        .stock-change.positive {
          background: rgba(82, 196, 26, 0.1);
          color: #52c41a;
        }

        .stock-change.negative {
          background: rgba(255, 77, 79, 0.1);
          color: #ff4d4f;
        }

        .stock-volume, .stock-market-cap {
          color: #666;
        }

        .stock-actions {
          display: flex;
          gap: 8px;
        }

        .view-btn {
          padding: 4px 8px;
          background: #667eea;
          color: white;
          border: none;
          border-radius: 4px;
          font-size: 12px;
          cursor: pointer;
          text-decoration: none;
        }

        .watch-btn {
          padding: 4px 8px;
          background: #f5f5f5;
          border: 1px solid #ddd;
          border-radius: 4px;
          font-size: 12px;
          cursor: pointer;
        }

        .watch-btn:hover {
          background: #ffd700;
        }

        /* 加载状态 */
        .loading-state {
          padding: 60px;
          text-align: center;
        }

        .loading-spinner {
          width: 40px;
          height: 40px;
          border: 3px solid #f3f3f3;
          border-top: 3px solid #667eea;
          border-radius: 50%;
          animation: spin 1s linear infinite;
          margin: 0 auto 16px;
        }

        @keyframes spin {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }

        .loading-state p {
          color: #666;
          font-size: 14px;
        }

        /* 分页 */
        .pagination {
          display: flex;
          justify-content: center;
          align-items: center;
          padding: 20px;
          gap: 16px;
          border-top: 1px solid #f0f0f0;
        }

        .page-btn {
          padding: 8px 16px;
          background: #f5f5f5;
          border: 1px solid #ddd;
          border-radius: 4px;
          cursor: pointer;
          font-size: 14px;
          transition: all 0.2s;
        }

        .page-btn:hover:not(:disabled) {
          background: #e0e0e0;
        }

        .page-btn:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }

        .page-numbers {
          display: flex;
          gap: 4px;
        }

        .page-number {
          width: 36px;
          height: 36px;
          display: flex;
          align-items: center;
          justify-content: center;
          background: #f5f5f5;
          border: 1px solid #ddd;
          border-radius: 4px;
          cursor: pointer;
          font-size: 14px;
          transition: all 0.2s;
        }

        .page-number:hover {
          background: #e0e0e0;
        }

        .page-number.active {
          background: #667eea;
          color: white;
          border-color: #667eea;
        }

        .page-info {
          font-size: 14px;
          color: #666;
        }

        /* 快速链接 */
        .quick-links {
          margin-bottom: 32px;
        }

        .quick-links h3 {
          font-size: 18px;
          font-weight: 600;
          margin: 0 0 16px;
          color: #333;
        }

        .links-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
          gap: 16px;
        }

        .link-card {
          background: white;
          border-radius: 12px;
          padding: 20px;
          text-decoration: none;
          color: inherit;
          display: flex;
          align-items: center;
          gap: 16px;
          box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08);
          transition: all 0.2s;
        }

        .link-card:hover {
          transform: translateY(-4px);
          box-shadow: 0 8px 24px rgba(0, 0, 0, 0.12);
        }

        .link-icon {
          font-size: 24px;
        }

        .link-content h4 {
          margin: 0 0 4px;
          font-size: 14px;
          font-weight: 600;
          color: #333;
        }

        .link-content p {
          margin: 0;
          font-size: 12px;
          color: #666;
        }

        /* 响应式设计 */
        @media (max-width: 768px) {
          .page-header {
            flex-direction: column;
          }

          .header-actions {
            width: 100%;
          }

          .search-box input {
            flex: 1;
            min-width: auto;
          }

          .stats-cards {
            grid-template-columns: repeat(2, 1fr);
          }

          .stock-table {
            font-size: 12px;
          }

          .stock-table th,
          .stock-table td {
            padding: 8px;
          }

          .pagination {
            flex-wrap: wrap;
          }

          .links-grid {
            grid-template-columns: 1fr;
          }
        }

        @media (max-width: 480px) {
          .stats-cards {
            grid-template-columns: 1fr;
          }

          .table-header {
            flex-direction: column;
            gap: 12px;
            align-items: flex-start;
          }

          .table-actions {
            width: 100%;
            justify-content: flex-start;
          }
        }
      `}</style>
    </div>
  );
};

export default StockListPage;