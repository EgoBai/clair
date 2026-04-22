import React, { useState, useEffect, useCallback, useMemo } from 'react';
import logger from './utils/logger';
import './App.css';
import {
  ApiResponse,
  Stock,
  StockQuoteCamel,
  StockWithQuoteCamel,
  MarketSummaryCamel,
  SearchResponse,
  StockDetailResponse,
  MarketRankResponse,
  toCamelCase
} from './types/api';
import {
  formatNumber,
  formatMarketCap,
  formatVolume,
  formatTurnover,
  formatPercent,
  formatDate,
  formatCurrency
} from './utils/formatters';
import {
  Skeleton,
  MarketSummaryCard,
  StockCard,
  LoadingState,
  ErrorState,
  EmptyState
} from './utils/optimizedComponents';

// ==================== API 服务 ====================
const API_BASE = '/api';

const api = {
  async getStocks(params?: Record<string, string>): Promise<ApiResponse<SearchResponse>> {
    const query = params ? '?' + new URLSearchParams(params).toString() : '';
    const res = await fetch(`${API_BASE}/stocks${query}`);
    const data = await res.json();
    return toCamelCase(data);
  },
  
  async getStockDetail(symbol: string): Promise<ApiResponse<StockDetailResponse>> {
    const res = await fetch(`${API_BASE}/stocks/${symbol}`);
    const data = await res.json();
    return toCamelCase(data);
  },
  
  async getStockQuotes(symbol: string, days?: number): Promise<ApiResponse<StockQuoteCamel[]>> {
    const query = days ? `?days=${days}` : '';
    const res = await fetch(`${API_BASE}/stocks/${symbol}/quotes${query}`);
    const data = await res.json();
    return toCamelCase(data);
  },
  
  async getMarketSummary(): Promise<ApiResponse<MarketSummaryCamel>> {
    const res = await fetch(`${API_BASE}/market/summary`);
    const data = await res.json();
    return toCamelCase(data);
  },
  
  async getTopGainers(limit?: number): Promise<ApiResponse<StockWithQuoteCamel[]>> {
    const query = limit ? `?limit=${limit}` : '';
    const res = await fetch(`${API_BASE}/market/top-gainers${query}`);
    const data = await res.json();
    return toCamelCase(data);
  },
  
  async getTopLosers(limit?: number): Promise<ApiResponse<StockWithQuoteCamel[]>> {
    const query = limit ? `?limit=${limit}` : '';
    const res = await fetch(`${API_BASE}/market/top-losers${query}`);
    const data = await res.json();
    return toCamelCase(data);
  },
};

// ==================== 股票详情面板 ====================
const StockDetailPanel: React.FC<{
  stock: StockWithQuoteCamel;
  quotes: StockQuoteCamel[];
}> = ({ stock, quotes }) => {
  const q = stock.latestQuote;
  
  if (!q) return null;
  
  const detailItems = useMemo(() => [
    { label: '当前价格', value: `¥${formatNumber(q.closePrice)}`, className: '' },
    { label: '涨跌幅', value: `${q.changePercent >= 0 ? '+' : ''}${q.changePercent.toFixed(2)}%`, className: q.changePercent >= 0 ? 'positive' : 'negative' },
    { label: '开盘价', value: `¥${formatNumber(q.openPrice)}`, className: '' },
    { label: '最高价', value: `¥${formatNumber(q.highPrice)}`, className: 'positive' },
    { label: '最低价', value: `¥${formatNumber(q.lowPrice)}`, className: 'negative' },
    { label: '成交量', value: formatVolume(q.volume), className: '' },
    { label: '成交额', value: formatTurnover(q.turnover), className: '' },
    { label: '总市值', value: formatMarketCap(q.marketCap), className: '' },
  ], [q]);
  
  return (
    <section className="stock-detail">
      <h2>
        <span style={{ color: 'var(--color-primary)' }}>{stock.symbol}</span>
        {' - '}
        {stock.name}
        {stock.industry && (
          <span style={{ 
            fontSize: '0.85rem', 
            color: 'var(--color-text-muted)',
            marginLeft: '8px' 
          }}>
            {stock.industry}
          </span>
        )}
      </h2>
      
      <div className="detail-grid">
        {detailItems.map((item, index) => (
          <div key={index} className="detail-item">
            <span className="label">{item.label}</span>
            <span className={`value ${item.className}`}>{item.value}</span>
          </div>
        ))}
      </div>
      
      {/* K线图占位 */}
      {quotes.length > 0 && (
        <div style={{ 
          marginTop: 'var(--spacing-lg)', 
          padding: 'var(--spacing-lg)',
          background: 'var(--color-bg)',
          borderRadius: 'var(--radius-md)',
          textAlign: 'center',
          color: 'var(--color-text-muted)'
        }}>
          📈 K线图组件（集成 ECharts 后显示）
          <br />
          <small>已加载 {quotes.length} 条历史数据</small>
        </div>
      )}
    </section>
  );
};

// ==================== 主应用 ====================
function App() {
  const [stocks, setStocks] = useState<StockWithQuoteCamel[]>([]);
  const [selectedStock, setSelectedStock] = useState<StockWithQuoteCamel | null>(null);
  const [stockQuotes, setStockQuotes] = useState<StockQuoteCamel[]>([]);
  const [marketSummary, setMarketSummary] = useState<MarketSummaryCamel | null>(null);
  const [loading, setLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [activeTab, setActiveTab] = useState<'all' | 'gainers' | 'losers'>('all');
  const [error, setError] = useState<string | null>(null);

  // 加载股票列表
  const loadStocks = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await api.getStocks();
      if (response.success && response.data) {
        setStocks(response.data.results || []);
      } else {
        setError(response.message || '加载股票列表失败');
      }
    } catch (err) {
      setError('网络请求失败，请检查网络连接');
      logger.error('加载股票列表失败:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  // 加载市场概况
  const loadMarketSummary = useCallback(async () => {
    try {
      const response = await api.getMarketSummary();
      if (response.success && response.data) {
        setMarketSummary(response.data);
      }
    } catch (err) {
      logger.error('加载市场概况失败:', err);
    }
  }, []);

  // 加载股票详情
  const loadStockDetail = useCallback(async (symbol: string) => {
    setLoading(true);
    setError(null);
    try {
      const [detailResponse, quotesResponse] = await Promise.all([
        api.getStockDetail(symbol),
        api.getStockQuotes(symbol, 30)
      ]);

      if (detailResponse.success && detailResponse.data) {
        setSelectedStock(detailResponse.data.stock);
      } else {
        setError(detailResponse.message || '加载股票详情失败');
      }

      if (quotesResponse.success && quotesResponse.data) {
        setStockQuotes(quotesResponse.data);
      }
    } catch (err) {
      setError('加载股票详情失败');
      logger.error('加载股票详情失败:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  // 加载数据
  useEffect(() => {
    loadStocks();
    loadMarketSummary();
  }, [loadStocks, loadMarketSummary]);

  // 切换标签页
  const handleTabChange = useCallback(async (tab: 'all' | 'gainers' | 'losers') => {
    setActiveTab(tab);
    setLoading(true);
    setError(null);
    
    try {
      let response;
      if (tab === 'gainers') {
        response = await api.getTopGainers(20);
      } else if (tab === 'losers') {
        response = await api.getTopLosers(20);
      } else {
        response = await api.getStocks();
      }

      if (response.success && response.data) {
        if (tab === 'all') {
          setStocks((response.data as SearchResponse).results || []);
        } else {
          setStocks(response.data as StockWithQuoteCamel[]);
        }
      } else {
        setError(response.message || '加载数据失败');
      }
    } catch (err) {
      setError('网络请求失败');
      logger.error('切换标签页失败:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  // 处理股票选择
  const handleStockSelect = useCallback((stock: StockWithQuoteCamel) => {
    setSelectedStock(stock);
    loadStockDetail(stock.symbol);
  }, [loadStockDetail]);

  // 处理搜索
  const handleSearch = useCallback(async () => {
    if (!searchTerm.trim()) {
      loadStocks();
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const response = await api.getStocks({ search: searchTerm });
      if (response.success && response.data) {
        setStocks(response.data.results || []);
      } else {
        setError(response.message || '搜索失败');
      }
    } catch (err) {
      setError('搜索请求失败');
      logger.error('搜索失败:', err);
    } finally {
      setLoading(false);
    }
  }, [searchTerm, loadStocks]);

  // 过滤股票列表
  const filteredStocks = useMemo(() => {
    if (!searchTerm.trim()) return stocks;
    return stocks.filter(stock => 
      stock.symbol.toLowerCase().includes(searchTerm.toLowerCase()) ||
      stock.name.toLowerCase().includes(searchTerm.toLowerCase())
    );
  }, [stocks, searchTerm]);

  // 渲染内容
  const renderContent = useMemo(() => {
    if (error) {
      return <ErrorState message={error} onRetry={loadStocks} />;
    }

    if (loading && stocks.length === 0) {
      return <LoadingState />;
    }

    if (stocks.length === 0) {
      return <EmptyState message="暂无股票数据" />;
    }

    return (
      <div className="app-content">
        {/* 市场概况 */}
        {marketSummary && <MarketSummaryCard summary={marketSummary} />}

        {/* 股票列表 */}
        <section className="stock-list-section">
          <div className="section-header">
            <h2>📈 股票列表</h2>
            <div className="tabs">
              <button 
                className={`tab ${activeTab === 'all' ? 'active' : ''}`}
                onClick={() => handleTabChange('all')}
              >
                全部
              </button>
              <button 
                className={`tab ${activeTab === 'gainers' ? 'active' : ''}`}
                onClick={() => handleTabChange('gainers')}
              >
                涨幅榜
              </button>
              <button 
                className={`tab ${activeTab === 'losers' ? 'active' : ''}`}
                onClick={() => handleTabChange('losers')}
              >
                跌幅榜
              </button>
            </div>
          </div>

          <div className="stock-grid">
            {filteredStocks.map(stock => (
              <StockCard
                key={stock.symbol}
                stock={stock}
                isSelected={selectedStock?.symbol === stock.symbol}
                onClick={() => handleStockSelect(stock)}
              />
            ))}
          </div>
        </section>

        {/* 股票详情 */}
        {selectedStock && (
          <StockDetailPanel stock={selectedStock} quotes={stockQuotes} />
        )}
      </div>
    );
  }, [error, loading, stocks, marketSummary, activeTab, filteredStocks, selectedStock, stockQuotes, handleTabChange, handleStockSelect, loadStocks]);

  return (
    <div className="app">
      {/* 顶部导航 */}
      <header className="app-header">
        <div className="header-content">
          <h1 className="app-title">📊 A股行情分析系统</h1>
          <div className="search-box">
            <input
              type="text"
              placeholder="搜索股票代码或名称..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
            />
            <button onClick={handleSearch}>搜索</button>
          </div>
        </div>
      </header>

      {/* 主要内容 */}
      <main className="app-main">
        {renderContent}
      </main>

      {/* 底部信息 */}
      <footer className="app-footer">
        <p>数据更新时间: {new Date().toLocaleString('zh-CN')}</p>
        <p>© 2026 A股行情分析系统 - 仅供学习研究使用</p>
      </footer>
    </div>
  );
}

export default App;