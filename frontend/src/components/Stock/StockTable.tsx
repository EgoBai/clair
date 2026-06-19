import React, { useMemo, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { ROUTE_PATHS } from '../../routes';

interface Stock {
  symbol: string;
  name: string;
  price: number;
  change: number;
  changePercent: number;
  volume: string;
  marketCap: string;
}

interface StockTableProps {
  stocks: Stock[];
  loading?: boolean;
  sortBy?: 'symbol' | 'name' | 'price' | 'changePercent';
  sortOrder?: 'asc' | 'desc';
  onSort?: (column: 'symbol' | 'name' | 'price' | 'changePercent') => void;
  currentPage?: number;
  itemsPerPage?: number;
  onPageChange?: (page: number) => void;
  showPagination?: boolean;
}

/**
 * 股票表格组件
 * 
 * @example
 * ```tsx
 * <StockTable
 *   stocks={stocks}
 *   loading={loading}
 *   sortBy={sortBy}
 *   sortOrder={sortOrder}
 *   onSort={handleSort}
 *   currentPage={currentPage}
 *   itemsPerPage={10}
 *   onPageChange={handlePageChange}
 * />
 * ```
 */
export const StockTable: React.FC<StockTableProps> = React.memo(({
  stocks,
  loading = false,
  sortBy = 'symbol',
  sortOrder = 'asc',
  onSort,
  currentPage = 1,
  itemsPerPage = 10,
  onPageChange,
  showPagination = true
}) => {
  // 计算分页
  const { totalPages, currentStocks } = useMemo(() => {
    const totalPages = Math.ceil(stocks.length / itemsPerPage);
    const startIndex = (currentPage - 1) * itemsPerPage;
    const endIndex = startIndex + itemsPerPage;
    const currentStocks = stocks.slice(startIndex, endIndex);
    
    return { totalPages, currentStocks };
  }, [stocks, currentPage, itemsPerPage]);

  // 处理排序点击
  const handleSort = useCallback((column: 'symbol' | 'name' | 'price' | 'changePercent') => {
    onSort?.(column);
  }, [onSort]);

  // 处理分页
  const handlePageChange = useCallback((page: number) => {
    onPageChange?.(page);
  }, [onPageChange]);

  // 渲染排序箭头
  const renderSortArrow = (column: typeof sortBy) => {
    if (sortBy !== column) return null;
    return sortOrder === 'asc' ? '↑' : '↓';
  };

  if (loading) {
    return (
      <div className="stock-table-loading">
        <div className="loading-spinner"></div>
        <p>加载股票数据中...</p>
      </div>
    );
  }

  if (stocks.length === 0) {
    return (
      <div className="stock-table-empty">
        <div className="empty-icon">📊</div>
        <h3>暂无股票数据</h3>
        <p>请检查搜索条件或刷新数据</p>
      </div>
    );
  }

  return (
    <div className="stock-table-container">
      <div className="table-header">
        <h3>股票列表 ({stocks.length} 只股票)</h3>
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
                  <button className="watch-btn">⭐</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* 分页 */}
      {showPagination && totalPages > 1 && (
        <div className="pagination">
          <button
            className="page-btn"
            onClick={() => handlePageChange(Math.max(1, currentPage - 1))}
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
                  onClick={() => handlePageChange(pageNum)}
                >
                  {pageNum}
                </button>
              );
            })}
          </div>
          
          <button
            className="page-btn"
            onClick={() => handlePageChange(Math.min(totalPages, currentPage + 1))}
            disabled={currentPage === totalPages}
          >
            下一页
          </button>
          
          <div className="page-info">
            第 {currentPage} 页，共 {totalPages} 页
          </div>
        </div>
      )}

      <style>{`
        .stock-table-container {
          background: var(--card-bg, #fff);
          border-radius: 12px;
          overflow: hidden;
          box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08);
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
        .stock-table-loading {
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

        .stock-table-loading p {
          color: #666;
          font-size: 14px;
        }

        /* 空状态 */
        .stock-table-empty {
          padding: 60px;
          text-align: center;
        }

        .empty-icon {
          font-size: 48px;
          margin-bottom: 16px;
        }

        .stock-table-empty h3 {
          margin: 0 0 8px;
          font-size: 16px;
          font-weight: 600;
          color: #333;
        }

        .stock-table-empty p {
          margin: 0;
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

        /* 响应式设计 */
        @media (max-width: 768px) {
          .table-header {
            flex-direction: column;
            gap: 12px;
            align-items: flex-start;
          }

          .table-actions {
            width: 100%;
            justify-content: flex-start;
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
        }
      `}</style>
    </div>
  );
});

// 默认导出
export default StockTable;