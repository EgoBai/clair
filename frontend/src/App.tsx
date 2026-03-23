import React, { useState, useEffect, useCallback, useMemo } from 'react';
import './App.css';

// ==================== 类型定义 ====================
interface Stock {
  id: number;
  symbol: string;
  name: string;
  market: string;
  industry?: string;
  isActive: boolean;
}

interface DailyQuote {
  id: number;
  stockId: number;
  tradeDate: string;
  openPrice: number;
  closePrice: number;
  highPrice: number;
  lowPrice: number;
  changePercent: number;
  volume: number;
  turnover: number;
  marketCap: number;
}

interface StockWithQuote extends Stock {
  latestQuote?: DailyQuote;
}

interface MarketSummary {
  date: string;
  totalStocks: number;
  totalMarketCap: number;
  totalVolume: number;
  totalTurnover: number;
  risingStocks: number;
  fallingStocks: number;
  unchangedStocks: number;
}

// ==================== 工具函数 ====================
const formatNumber = (num: number, decimals: number = 2): string => {
  return num.toLocaleString('zh-CN', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
};

const formatMarketCap = (cap: number): string => {
  if (cap >= 1e12) return `${(cap / 1e12).toFixed(2)}万亿`;
  if (cap >= 1e8) return `${(cap / 1e8).toFixed(2)}亿`;
  if (cap >= 1e4) return `${(cap / 1e4).toFixed(2)}万`;
  return cap.toString();
};

const formatVolume = (vol: number): string => {
  if (vol >= 1e8) return `${(vol / 1e8).toFixed(2)}亿手`;
  if (vol >= 1e4) return `${(vol / 1e4).toFixed(2)}万手`;
  return `${vol}手`;
};

const formatTurnover = (turnover: number): string => {
  if (turnover >= 1e8) return `${(turnover / 1e8).toFixed(2)}亿`;
  if (turnover >= 1e4) return `${(turnover / 1e4).toFixed(2)}万`;
  return turnover.toString();
};

// ==================== API 服务 ====================
const API_BASE = '/api';

const api = {
  async getStocks(params?: Record<string, string>): Promise<any> {
    const query = params ? '?' + new URLSearchParams(params).toString() : '';
    const res = await fetch(`${API_BASE}/stocks${query}`);
    return res.json();
  },
  
  async getStockDetail(symbol: string): Promise<any> {
    const res = await fetch(`${API_BASE}/stocks/${symbol}`);
    return res.json();
  },
  
  async getStockQuotes(symbol: string, days?: number): Promise<any> {
    const query = days ? `?days=${days}` : '';
    const res = await fetch(`${API_BASE}/stocks/${symbol}/quotes${query}`);
    return res.json();
  },
  
  async getMarketSummary(): Promise<any> {
    const res = await fetch(`${API_BASE}/market/summary`);
    return res.json();
  },
  
  async getTopGainers(limit?: number): Promise<any> {
    const query = limit ? `?limit=${limit}` : '';
    const res = await fetch(`${API_BASE}/market/top-gainers${query}`);
    return res.json();
  },
  
  async getTopLosers(limit?: number): Promise<any> {
    const query = limit ? `?limit=${limit}` : '';
    const res = await fetch(`${API_BASE}/market/top-losers${query}`);
    return res.json();
  },
};

// ==================== 组件 ====================

// 骨架屏组件
const Skeleton: React.FC<{ width?: string; height?: string }> = ({ 
  width = '100%', 
  height = '20px' 
}) => (
  <div className="skeleton" style={{ width, height }} />
);

// 市场概况卡片
const MarketSummaryCard: React.FC<{ summary: MarketSummary }> = ({ summary }) => {
  const upRatio = summary.totalStocks > 0 
    ? ((summary.risingStocks / summary.totalStocks) * 100).toFixed(1) 
    : '0';
  
  return (
    <section className="market-summary">
      <h2>📊 市场概况</h2>
      <div className="summary-grid">
        <div className="summary-card">
          <div className="summary-label">总股票数</div>
          <div className="summary-value">{formatNumber(summary.totalStocks, 0)}</div>
        </div>
        <div className="summary-card">
          <div className="summary-label">总市值</div>
          <div className="summary-value">{formatMarketCap(summary.totalMarketCap)}</div>
        </div>
        <div className="summary-card">
          <div className="summary-label">上涨</div>
          <div className="summary-value positive">{summary.risingStocks}</div>
        </div>
        <div className="summary-card">
          <div className="summary-label">下跌</div>
          <div className="summary-value negative">{summary.fallingStocks}</div>
        </div>
        <div className="summary-card">
          <div className="summary-label">上涨占比</div>
          <div className="summary-value">{upRatio}%</div>
        </div>
        <div className="summary-card">
          <div className="summary-label">总成交额</div>
          <div className="summary-value">{formatTurnover(summary.totalTurnover)}</div>
        </div>
      </div>
    </section>
  );
};

// 股票卡片
const StockCard: React.FC<{
  stock: StockWithQuote;
  isSelected: boolean;
  onClick: () => void;
}> = ({ stock, isSelected, onClick }) => (
  <div
    className={`stock-card ${isSelected ? 'selected' : ''}`}
    onClick={onClick}
  >
    <div className="stock-header">
      <span className="stock-symbol">{stock.symbol}</span>
      <span className="stock-name">{stock.name}</span>
    </div>
    {stock.latestQuote ? (
      <div className="stock-quote">
        <div className="price">
          <span className="current-price">
            ¥{formatNumber(stock.latestQuote.closePrice)}
          </span>
          <span className={`change ${stock.latestQuote.changePercent >= 0 ? 'positive' : 'negative'}`}>
            {stock.latestQuote.changePercent >= 0 ? '+' : ''}
            {stock.latestQuote.changePercent.toFixed(2)}%
          </span>
        </div>
        <div className="volume">
          成交量: {formatVolume(stock.latestQuote.volume)}
        </div>
      </div>
    ) : (
      <div className="stock-quote">
        <Skeleton width="60%" height="28px" />
        <Skeleton width="40%" height="16px" />
      </div>
    )}
  </div>
);

// 股票详情面板
const StockDetailPanel: React.FC<{
  stock: StockWithQuote;
  quotes: DailyQuote[];
}> = ({ stock, quotes }) => {
  if (!stock.latestQuote) return null;
  
  const q = stock.latestQuote;
  
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
        <div className="detail-item">
          <span className="label">当前价格</span>
          <span className="value">¥{formatNumber(q.closePrice)}</span>
        </div>
        <div className="detail-item">
          <span className="label">涨跌幅</span>
          <span className={`value ${q.changePercent >= 0 ? 'positive' : 'negative'}`}>
            {q.changePercent >= 0 ? '+' : ''}{q.changePercent.toFixed(2)}%
          </span>
        </div>
        <div className="detail-item">
          <span className="label">开盘价</span>
          <span className="value">¥{formatNumber(q.openPrice)}</span>
        </div>
        <div className="detail-item">
          <span className="label">最高价</span>
          <span className="value" style={{ color: 'var(--color-rise)' }}>
            ¥{formatNumber(q.highPrice)}
          </span>
        </div>
        <div className="detail-item">
          <span className="label">最低价</span>
          <span className="value" style={{ color: 'var(--color-fall)' }}>
            ¥{formatNumber(q.lowPrice)}
          </span>
        </div>
        <div className="detail-item">
          <span className="label">成交量</span>
          <span className="value">{formatVolume(q.volume)}</span>
        </div>
        <div className="detail-item">
          <span className="label">成交额</span>
          <span className="value">{formatTurnover(q.turnover)}</span>
        </div>
        <div className="detail-item">
          <span className="label">总市值</span>
          <span className="value">{formatMarketCap(q.marketCap)}</span>
        </div>
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
  const [stocks, setStocks] = useState<StockWithQuote[]>([]);
  const [selectedStock, setSelectedStock] = useState<StockWithQuote | null>(null);
  const [stockQuotes, setStockQuotes] = useState<DailyQuote[]>([]);
  const [marketSummary, setMarketSummary] = useState<MarketSummary | null>(null);
  const [loading, setLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [activeTab, setActiveTab] = useState<'all' | 'gainers' | 'losers'>('all');

  // 加载数据
  useEffect(() => {
    loadStocks();
    loadMarketSummary();
  }, []);

  const loadStocks = async () => {
    setLoading(true);
    try {
      const data = await api.getStocks({ pageSize: '20' });
      if (data.success) {
        setStocks(data.data.stocks);
      }
    } catch (error) {
      console.error('加载股票列表失败:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadMarketSummary = async () => {
    try {
      const data = await api.getMarketSummary();
      if (data.success) {
        setMarketSummary(data.data);
      }
    } catch (error) {
      console.error('加载市场概况失败:', error);
    }
  };

  const handleSearch = async () => {
    if (!searchTerm.trim()) {
      loadStocks();
      return;
    }
    setLoading(true);
    try {
      const data = await api.getStocks({ symbol: searchTerm, name: searchTerm });
      if (data.success) {
        setStocks(data.data.stocks);
      }
    } catch (error) {
      console.error('搜索失败:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleStockClick = async (stock: StockWithQuote) => {
    setSelectedStock(stock);
    // 加载历史行情
    try {
      const data = await api.getStockQuotes(stock.symbol, 120);
      if (data.success) {
        setStockQuotes(data.data.quotes || []);
      }
    } catch (error) {
      console.error('加载行情数据失败:', error);
    }
  };

  const handleTabChange = async (tab: 'all' | 'gainers' | 'losers') => {
    setActiveTab(tab);
    setLoading(true);
    try {
      let data;
      if (tab === 'gainers') {
        data = await api.getTopGainers(20);
      } else if (tab === 'losers') {
        data = await api.getTopLosers(20);
      } else {
        data = await api.getStocks({ pageSize: '20' });
      }
      if (data.success) {
        setStocks(data.data.stocks || data.data || []);
      }
    } catch (error) {
      console.error('加载数据失败:', error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="app">
      {/* 头部 */}
      <header className="header">
        <div className="header-content">
          <h1>📈 A股行情分析</h1>
          <p className="subtitle">实时股票行情与智能数据分析</p>
        </div>
      </header>

      {/* 主要内容 */}
      <main className="main-content">
        {/* 市场概况 */}
        {marketSummary && <MarketSummaryCard summary={marketSummary} />}

        {/* 股票列表 */}
        <section className="stocks-section">
          <div className="section-header">
            <div style={{ display: 'flex', gap: 'var(--spacing-md)', alignItems: 'center' }}>
              <h2>股票列表</h2>
              <div style={{ display: 'flex', gap: '4px' }}>
                {(['all', 'gainers', 'losers'] as const).map(tab => (
                  <button
                    key={tab}
                    onClick={() => handleTabChange(tab)}
                    style={{
                      padding: '4px 12px',
                      border: '1px solid var(--color-border)',
                      borderRadius: 'var(--radius-full)',
                      background: activeTab === tab ? 'var(--color-primary)' : 'transparent',
                      color: activeTab === tab ? 'white' : 'var(--color-text)',
                      cursor: 'pointer',
                      fontSize: '0.85rem',
                    }}
                  >
                    {tab === 'all' ? '全部' : tab === 'gainers' ? '涨幅榜' : '跌幅榜'}
                  </button>
                ))}
              </div>
            </div>
            <div className="search-box">
              <input
                type="text"
                placeholder="搜索股票代码或名称..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                onKeyPress={(e) => e.key === 'Enter' && handleSearch()}
              />
              <button onClick={handleSearch}>🔍 搜索</button>
            </div>
          </div>

          {loading ? (
            <div className="loading">加载中</div>
          ) : (
            <div className="stocks-grid">
              {stocks.map((stock) => (
                <StockCard
                  key={stock.id || stock.symbol}
                  stock={stock}
                  isSelected={selectedStock?.id === stock.id}
                  onClick={() => handleStockClick(stock)}
                />
              ))}
              {stocks.length === 0 && (
                <div style={{ 
                  gridColumn: '1 / -1', 
                  textAlign: 'center', 
                  padding: 'var(--spacing-xl)',
                  color: 'var(--color-text-muted)' 
                }}>
                  暂无数据，请先启动数据采集服务
                </div>
              )}
            </div>
          )}
        </section>

        {/* 选中股票详情 */}
        {selectedStock && (
          <StockDetailPanel stock={selectedStock} quotes={stockQuotes} />
        )}
      </main>

      {/* 页脚 */}
      <footer className="footer">
        <p>A股行情分析 © 2026 | 数据仅供参考，投资有风险</p>
      </footer>
    </div>
  );
}

export default App;
