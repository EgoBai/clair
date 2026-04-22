import React, { useState, useEffect, useMemo, useCallback } from 'react';

interface StockData {
  id: number;
  symbol: string;
  name: string;
  price: number;
  change: number;
  volume: number;
  marketCap: number;
  peRatio: number;
  sector: string;
  lastUpdated: string;
}

/**
 * 模拟复杂表格组件
 * 用于演示懒加载效果
 */
const ComplexTableDemo: React.FC = () => {
  const [data, setData] = useState<StockData[]>([]);
  const [loading, setLoading] = useState(true);
  const [sortBy, setSortBy] = useState<keyof StockData>('price');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');
  const [searchTerm, setSearchTerm] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 20;

  // 模拟数据加载
  useEffect(() => {
    const timer = setTimeout(() => {
      const sectors = ['科技', '金融', '医疗', '消费', '能源', '工业', '材料', '公用事业'];
      const newData: StockData[] = [];
      
      for (let i = 1; i <= 500; i++) {
        const price = 10 + Math.random() * 90;
        const change = (Math.random() - 0.5) * 10;
        const volume = Math.floor(Math.random() * 10000000) + 1000000;
        const marketCap = price * volume;
        const peRatio = 5 + Math.random() * 40;
        
        newData.push({
          id: i,
          symbol: `STOCK${1000 + i}`,
          name: `示例股票 ${i}`,
          price: parseFloat(price.toFixed(2)),
          change: parseFloat(change.toFixed(2)),
          volume,
          marketCap,
          peRatio: parseFloat(peRatio.toFixed(1)),
          sector: sectors[Math.floor(Math.random() * sectors.length)],
          lastUpdated: new Date(Date.now() - Math.random() * 86400000).toISOString()
        });
      }
      
      setData(newData);
      setLoading(false);
    }, 600); // 模拟加载延迟

    return () => clearTimeout(timer);
  }, []);

  // 处理排序
  const handleSort = useCallback((column: keyof StockData) => {
    if (sortBy === column) {
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
    } else {
      setSortBy(column);
      setSortOrder('desc');
    }
  }, [sortBy, sortOrder]);

  // 处理搜索
  const handleSearch = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setSearchTerm(e.target.value);
    setCurrentPage(1); // 搜索时回到第一页
  }, []);

  // 处理分页
  const handlePageChange = useCallback((page: number) => {
    setCurrentPage(page);
  }, []);

  // 处理行点击
  const handleRowClick = useCallback((stock: StockData) => {
    // removed: console.log
    // 在实际项目中，这里可能会导航到详情页或显示详情面板
    alert(`选中股票: ${stock.symbol} - ${stock.name}`);
  }, []);

  // 排序和过滤数据
  const processedData = useMemo(() => {
    let result = [...data];
    
    // 搜索过滤
    if (searchTerm.trim()) {
      const term = searchTerm.toLowerCase();
      result = result.filter(item =>
        item.symbol.toLowerCase().includes(term) ||
        item.name.toLowerCase().includes(term) ||
        item.sector.toLowerCase().includes(term)
      );
    }
    
    // 排序
    result.sort((a, b) => {
      const aVal = a[sortBy];
      const bVal = b[sortBy];
      const multiplier = sortOrder === 'asc' ? 1 : -1;
      
      if (typeof aVal === 'string' && typeof bVal === 'string') {
        return aVal.localeCompare(bVal) * multiplier;
      }
      
      return ((aVal as number) > (bVal as number) ? 1 : -1) * multiplier;
    });
    
    return result;
  }, [data, searchTerm, sortBy, sortOrder]);

  // 分页数据
  const paginatedData = useMemo(() => {
    const startIndex = (currentPage - 1) * itemsPerPage;
    return processedData.slice(startIndex, startIndex + itemsPerPage);
  }, [processedData, currentPage]);

  // 计算分页信息
  const totalPages = Math.ceil(processedData.length / itemsPerPage);
  const pageNumbers = useMemo(() => {
    const pages = [];
    const maxVisible = 5;
    
    let start = Math.max(1, currentPage - Math.floor(maxVisible / 2));
    const end = Math.min(totalPages, start + maxVisible - 1);
    
    if (end - start + 1 < maxVisible) {
      start = Math.max(1, end - maxVisible + 1);
    }
    
    for (let i = start; i <= end; i++) {
      pages.push(i);
    }
    
    return pages;
  }, [currentPage, totalPages]);

  // 格式化数字
  const formatNumber = useCallback((num: number): string => {
    if (num >= 1000000000) {
      return (num / 1000000000).toFixed(1) + 'B';
    }
    if (num >= 1000000) {
      return (num / 1000000).toFixed(1) + 'M';
    }
    if (num >= 1000) {
      return (num / 1000).toFixed(1) + 'K';
    }
    return num.toString();
  }, []);

  // 格式化日期
  const formatDate = useCallback((dateString: string): string => {
    const date = new Date(dateString);
    return date.toLocaleDateString('zh-CN', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  }, []);

  if (loading) {
    return (
      <div style={{ textAlign: 'center', padding: '40px' }}>
        <div style={{ fontSize: '48px', marginBottom: '16px' }}>📊</div>
        <div style={{ fontWeight: 'bold', marginBottom: '8px' }}>加载表格数据中...</div>
        <div style={{ color: '#718096' }}>模拟复杂表格组件加载</div>
      </div>
    );
  }

  return (
    <div>
      {/* 表格标题和搜索 */}
      <div style={{ marginBottom: '24px' }}>
        <h3 style={{ margin: '0 0 8px 0', color: '#2d3748' }}>复杂股票数据表格</h3>
        <p style={{ margin: '0 0 16px 0', color: '#718096', fontSize: '14px' }}>
          模拟包含500条数据的复杂表格，支持排序、搜索、分页
        </p>
        
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ flex: 1, maxWidth: '300px' }}>
            <input
              type="text"
              placeholder="搜索股票代码、名称或行业..."
              value={searchTerm}
              onChange={handleSearch}
              style={{
                width: '100%',
                padding: '8px 12px',
                border: '1px solid #e2e8f0',
                borderRadius: '4px',
                fontSize: '14px'
              }}
            />
          </div>
          
          <div style={{ fontSize: '14px', color: '#718096' }}>
            共 {processedData.length} 条数据，第 {currentPage} / {totalPages} 页
          </div>
        </div>
      </div>

      {/* 数据表格 */}
      <div style={{
        background: 'white',
        borderRadius: '8px',
        border: '1px solid #e2e8f0',
        overflow: 'hidden',
        marginBottom: '24px'
      }}>
        <div style={{
          maxHeight: '400px',
          overflowY: 'auto',
          overflowX: 'auto'
        }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
            <thead>
              <tr style={{ background: '#f7fafc', borderBottom: '1px solid #e2e8f0' }}>
                <TableHeader
                  column="symbol"
                  label="股票代码"
                  sortBy={sortBy}
                  sortOrder={sortOrder}
                  onSort={handleSort}
                />
                <TableHeader
                  column="name"
                  label="股票名称"
                  sortBy={sortBy}
                  sortOrder={sortOrder}
                  onSort={handleSort}
                />
                <TableHeader
                  column="price"
                  label="当前价格"
                  sortBy={sortBy}
                  sortOrder={sortOrder}
                  onSort={handleSort}
                />
                <TableHeader
                  column="change"
                  label="涨跌幅"
                  sortBy={sortBy}
                  sortOrder={sortOrder}
                  onSort={handleSort}
                />
                <TableHeader
                  column="volume"
                  label="成交量"
                  sortBy={sortBy}
                  sortOrder={sortOrder}
                  onSort={handleSort}
                />
                <TableHeader
                  column="marketCap"
                  label="市值"
                  sortBy={sortBy}
                  sortOrder={sortOrder}
                  onSort={handleSort}
                />
                <TableHeader
                  column="peRatio"
                  label="市盈率"
                  sortBy={sortBy}
                  sortOrder={sortOrder}
                  onSort={handleSort}
                />
                <TableHeader
                  column="sector"
                  label="行业"
                  sortBy={sortBy}
                  sortOrder={sortOrder}
                  onSort={handleSort}
                />
                <TableHeader
                  column="lastUpdated"
                  label="更新时间"
                  sortBy={sortBy}
                  sortOrder={sortOrder}
                  onSort={handleSort}
                />
              </tr>
            </thead>
            <tbody>
              {paginatedData.map((item) => (
                <tr
                  key={item.id}
                  onClick={() => handleRowClick(item)}
                  style={{
                    borderBottom: '1px solid #e2e8f0',
                    cursor: 'pointer',
                    transition: 'background 0.2s'
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.background = '#f7fafc';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = 'white';
                  }}
                >
                  <td style={{ padding: '12px', fontWeight: 'bold', color: '#2d3748' }}>
                    {item.symbol}
                  </td>
                  <td style={{ padding: '12px', color: '#4a5568' }}>{item.name}</td>
                  <td style={{ padding: '12px', fontWeight: 'bold', color: '#2d3748' }}>
                    ¥{item.price.toFixed(2)}
                  </td>
                  <td style={{
                    padding: '12px',
                    color: item.change >= 0 ? '#48bb78' : '#e53e3e',
                    fontWeight: 'bold'
                  }}>
                    {item.change >= 0 ? '+' : ''}{item.change.toFixed(2)}%
                  </td>
                  <td style={{ padding: '12px', color: '#4a5568' }}>
                    {formatNumber(item.volume)}
                  </td>
                  <td style={{ padding: '12px', color: '#4a5568' }}>
                    {formatNumber(item.marketCap)}
                  </td>
                  <td style={{ padding: '12px', color: '#4a5568' }}>
                    {item.peRatio.toFixed(1)}
                  </td>
                  <td style={{ padding: '12px' }}>
                    <span style={{
                      display: 'inline-block',
                      padding: '2px 8px',
                      background: getSectorColor(item.sector),
                      color: 'white',
                      borderRadius: '12px',
                      fontSize: '11px'
                    }}>
                      {item.sector}
                    </span>
                  </td>
                  <td style={{ padding: '12px', color: '#718096', fontSize: '12px' }}>
                    {formatDate(item.lastUpdated)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* 分页控件 */}
      {totalPages > 1 && (
        <div style={{
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          gap: '8px',
          marginBottom: '24px'
        }}>
          <button
            onClick={() => handlePageChange(Math.max(1, currentPage - 1))}
            disabled={currentPage === 1}
            style={{
              padding: '6px 12px',
              border: '1px solid #e2e8f0',
              background: 'white',
              borderRadius: '4px',
              cursor: currentPage === 1 ? 'not-allowed' : 'pointer',
              opacity: currentPage === 1 ? 0.5 : 1
            }}
          >
            上一页
          </button>
          
          {pageNumbers.map(page => (
            <button
              key={page}
              onClick={() => handlePageChange(page)}
              style={{
                padding: '6px 12px',
                border: '1px solid #e2e8f0',
                background: currentPage === page ? '#4299e1' : 'white',
                color: currentPage === page ? 'white' : '#4a5568',
                borderRadius: '4px',
                cursor: 'pointer',
                fontWeight: currentPage === page ? 'bold' : 'normal'
              }}
            >
              {page}
            </button>
          ))}
          
          <button
            onClick={() => handlePageChange(Math.min(totalPages, currentPage + 1))}
            disabled={currentPage === totalPages}
            style={{
              padding: '6px 12px',
              border: '1px solid #e2e8f0',
              background: 'white',
              borderRadius: '4px',
              cursor: currentPage === totalPages ? 'not-allowed' : 'pointer',
              opacity: currentPage === totalPages ? 0.5 : 1
            }}
          >
            下一页
          </button>
        </div>
      )}

      {/* 组件信息 */}
      <div style={{
        background: '#f0fff4',
        borderRadius: '8px',
        padding: '16px',
        border: '1px solid #c6f6d5'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', marginBottom: '8px' }}>
          <div style={{ fontSize: '20px', marginRight: '8px' }}>💡</div>
          <div style={{ fontWeight: 'bold', color: '#38a169' }}>组件信息</div>
        </div>
        <div style={{ fontSize: '14px', color: '#718096' }}>
          <p style={{ margin: '0 0 8px 0' }}>
            这是一个模拟的复杂表格组件，用于演示懒加载和性能优化功能。
          </p>
          <ul style={{ margin: 0, paddingLeft: '20px' }}>
            <li>包含500条模拟股票数据</li>
            <li>支持多列排序和搜索过滤</li>
            <li>实现分页功能（每页20条）</li>
            <li>使用useMemo优化计算性能</li>
            <li>通过React.lazy()实现按需加载</li>
          </ul>
        </div>
      </div>
    </div>
  );
};

/**
 * 表头组件
 */
const TableHeader: React.FC<{
  column: keyof StockData;
  label: string;
  sortBy: keyof StockData;
  sortOrder: 'asc' | 'desc';
  onSort: (column: keyof StockData) => void;
}> = ({ column, label, sortBy, sortOrder, onSort }) => {
  const isSorted = sortBy === column;
  
  return (
    <th
      onClick={() => onSort(column)}
      style={{
        padding: '12px',
        textAlign: 'left',
        fontWeight: 'bold',
        color: '#4a5568',
        cursor: 'pointer',
        userSelect: 'none',
        position: 'sticky',
        top: 0,
        background: '#f7fafc',
        borderBottom: '1px solid #e2e8f0',
        whiteSpace: 'nowrap'
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.background = '#edf2f7';
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.background = '#f7fafc';
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
        {label}
        {isSorted && (
          <span style={{ fontSize: '12px' }}>
            {sortOrder === 'asc' ? '↑' : '↓'}
          </span>
        )}
      </div>
    </th>
  );
};

/**
 * 获取行业颜色
 */
function getSectorColor(sector: string): string {
  const colors: Record<string, string> = {
    '科技': '#4299e1',
    '金融': '#48bb78',
    '医疗': '#ed64a6',
    '消费': '#ed8936',
    '能源': '#ecc94b',
    '工业': '#9f7aea',
    '材料': '#38b2ac',
    '公用事业': '#a0aec0'
  };
  
  return colors[sector] || '#718096';
}

export default ComplexTableDemo;