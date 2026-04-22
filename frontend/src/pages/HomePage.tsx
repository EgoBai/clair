import React, { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { Spin, Alert } from 'antd';
import { ROUTE_PATHS } from '../routes';
import {
  useStocks,
  useStockStats,
  useUserPreferences,
  initializeSampleData
} from '../store/useStockStore';
import StockWatchlistButton from '../components/Stock/StockWatchlistButton';
import { SimpleErrorBoundary } from '../components/Common/UnifiedErrorBoundary';
import { apiService } from '../services/api';

// 格式化大数字为亿/万
const formatBigNumber = (num: number): string => {
  if (num >= 1e8) return (num / 1e8).toFixed(1) + '亿';
  if (num >= 1e4) return (num / 1e4).toFixed(1) + '万';
  return num.toFixed(0);
};

// 格式化时间为相对时间
const formatRelativeTime = (dateStr: string): string => {
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 1) return '刚刚';
  if (diffMin < 60) return `${diffMin}分钟前`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}小时前`;
  return `${Math.floor(diffHr / 24)}天前`;
};

// 后备数据（API不可用时使用）
const fallbackMarketData = [
  { name: '上证指数', symbol: '000001.SH', closePrice: 3254.32, changePercent: 0.38, volume: 420000000, turnover: 420000000000 },
  { name: '深证成指', symbol: '399001.SZ', closePrice: 11234.56, changePercent: -0.21, volume: 380000000, turnover: 380000000000 },
  { name: '创业板指', symbol: '399006.SZ', closePrice: 2345.67, changePercent: 1.97, volume: 120000000, turnover: 120000000000 },
];

const HomePage: React.FC = () => {
  // 从状态管理获取数据
  const stocks = useStocks();
  const stats = useStockStats();
  const userPreferences = useUserPreferences();

  const [marketData, setMarketData] = useState<any[]>(fallbackMarketData);
  const [topGainers, setTopGainers] = useState<any[]>([]);
  const [topLosers, setTopLosers] = useState<any[]>([]);
  const [news, setNews] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [time, setTime] = useState(new Date());

  // 从API加载真实数据
  const loadDashboardData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [summaryRes, gainersRes, losersRes, newsRes] = await Promise.allSettled([
        apiService.getMarketSummary(),
        apiService.getTopGainers(undefined, 5),
        apiService.getTopLosers(undefined, 5),
        apiService.getNews({ limit: 5 }),
      ]);

      // 市场概况
      if (summaryRes.status === 'fulfilled' && summaryRes.value.success && summaryRes.value.data) {
        const summary = summaryRes.value.data as unknown as Record<string, unknown>;
        // 如果API返回的是单个摘要对象，转换为数组显示
        if (summary.indices && Array.isArray(summary.indices)) {
          setMarketData(summary.indices as typeof marketData);
        } else if (summary.close_price !== undefined) {
          setMarketData([summary as unknown as typeof marketData[0]]);
        }
      }

      // 涨幅榜
      if (gainersRes.status === 'fulfilled' && gainersRes.value.success && gainersRes.value.data) {
        const data = gainersRes.value.data as Record<string, unknown>;
        setTopGainers((data.topGainers || data.top_gainers || []) as typeof topGainers);
      }

      // 跌幅榜
      if (losersRes.status === 'fulfilled' && losersRes.value.success && losersRes.value.data) {
        const data = losersRes.value.data as Record<string, unknown>;
        setTopLosers((data.topLosers || data.top_losers || []) as typeof topLosers);
      }

      // 新闻
      if (newsRes.status === 'fulfilled' && newsRes.value.success && newsRes.value.data) {
        const data = newsRes.value.data as Record<string, unknown> | unknown[];
        const newsList = Array.isArray(data) ? data : ((data as Record<string, unknown>).news || (data as Record<string, unknown>).items || []) as typeof news;
        setNews(newsList.slice(0, 5));
      }

      // 如果所有请求都失败，显示错误
      const allFailed = [summaryRes, gainersRes, losersRes, newsRes].every(
        r => r.status === 'rejected' || (r.status === 'fulfilled' && !r.value.success)
      );
      if (allFailed) {
        setError('部分数据加载失败，显示缓存数据');
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : '数据加载失败');
    } finally {
      setLoading(false);
    }
  }, []);

  // 初始化示例数据（仅用于演示）& 加载真实数据
  useEffect(() => {
    if (stocks.length === 0) {
      initializeSampleData();
    }
    loadDashboardData();
  }, [stocks.length, loadDashboardData]);

  // 更新时间
  useEffect(() => {
    const timer = setInterval(() => {
      setTime(new Date());
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  // 刷新数据
  const refreshData = () => {
    loadDashboardData();
  };

  // 格式化时间
  const formatTime = (date: Date) => {
    return date.toLocaleString('zh-CN', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false
    });
  };

  return (
    <SimpleErrorBoundary name="HomePage">
      <div className="home-page">
      {/* 页面标题和时间 */}
      <div className="page-header">
        <div>
          <h1 className="page-title">📊 A股行情分析系统</h1>
          <p className="page-subtitle">实时市场数据与专业分析工具</p>
        </div>
        <div className="time-display">
          <div className="current-time">{formatTime(time)}</div>
          <button 
            className="refresh-btn"
            onClick={refreshData}
            disabled={loading}
          >
            {loading ? '刷新中...' : '🔄 刷新数据'}
          </button>
        </div>
      </div>

      {/* 快速操作卡片 */}
      <div className="quick-actions">
        <h2 className="section-title">🚀 快速操作</h2>
        <div className="action-grid">
          <Link to={ROUTE_PATHS.STOCKS} className="action-card">
            <div className="action-icon">📈</div>
            <div className="action-content">
              <h3>查看股票列表</h3>
              <p>浏览所有A股股票实时行情</p>
            </div>
          </Link>
          
          <Link to={ROUTE_PATHS.WATCHLIST} className="action-card">
            <div className="action-icon">⭐</div>
            <div className="action-content">
              <h3>管理自选股</h3>
              <p>关注您感兴趣的股票</p>
            </div>
          </Link>
          
          <Link to={ROUTE_PATHS.SCREENER} className="action-card">
            <div className="action-icon">🔍</div>
            <div className="action-content">
              <h3>股票筛选器</h3>
              <p>按条件筛选优质股票</p>
            </div>
          </Link>
          
          <Link to={ROUTE_PATHS.MARKET} className="action-card">
            <div className="action-icon">📊</div>
            <div className="action-content">
              <h3>市场分析</h3>
              <p>查看市场趋势和数据分析</p>
            </div>
          </Link>
        </div>
      </div>

      {/* 错误提示 */}
      {error && (
        <Alert type="warning" message={error} showIcon closable onClose={() => setError(null)}
          style={{ marginBottom: 16 }} />
      )}

      {/* 主要指数 */}
      <div className="market-indices">
        <h2 className="section-title">📈 主要指数</h2>
        {loading && marketData.length === 0 ? (
          <div style={{ textAlign: 'center', padding: 40 }}><Spin size="large" /></div>
        ) : (
          <div className="indices-grid">
            {marketData.map((index, i) => (
              <div key={index.symbol || i} className="index-card">
                <div className="index-header">
                  <h3 className="index-name">{index.name || index.stock_name || '—'}</h3>
                  <span className="index-symbol">{index.symbol || index.stock_code || ''}</span>
                </div>
                <div className="index-price">
                  ¥{(index.close_price ?? index.closePrice ?? index.price ?? 0).toFixed(2)}
                </div>
                <div className={`index-change ${(index.change_percent ?? index.changePercent ?? 0) >= 0 ? 'positive' : 'negative'}`}>
                  {(index.change_percent ?? index.changePercent ?? 0) >= 0 ? '+' : ''}
                  {(index.change_percent ?? index.changePercent ?? 0).toFixed(2)}%
                </div>
                <div className="index-volume">
                  <span>成交量: {formatBigNumber(index.volume ?? 0)}</span>
                  <span>成交额: {formatBigNumber(index.turnover ?? 0)}</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 排行榜 */}
      <div className="rankings-section">
        <div className="ranking-column">
          <h2 className="section-title">📈 涨幅榜</h2>
          <div className="ranking-list">
            {loading && topGainers.length === 0 ? (
              <div style={{ textAlign: 'center', padding: 20 }}><Spin /></div>
            ) : topGainers.length === 0 ? (
              <div style={{ textAlign: 'center', padding: 20, color: '#999' }}>暂无数据</div>
            ) : topGainers.map((stock, index) => (
              <div key={stock.symbol || stock.stock_code || index} className="ranking-item">
                <div className="ranking-rank">{index + 1}</div>
                <div className="ranking-info">
                  <div className="stock-symbol">{stock.symbol || stock.stock_code}</div>
                  <div className="stock-name">{stock.name || stock.stock_name}</div>
                </div>
                <div className="stock-price">
                  ¥{(stock.close_price ?? stock.price ?? 0).toFixed(2)}
                </div>
                <div className="stock-change positive">
                  +{(stock.change_percent ?? stock.changePercent ?? 0).toFixed(2)}%
                </div>
              </div>
            ))}
          </div>
          <Link to={ROUTE_PATHS.STOCKS} className="view-more">
            查看更多涨幅榜 →
          </Link>
        </div>

        <div className="ranking-column">
          <h2 className="section-title">📉 跌幅榜</h2>
          <div className="ranking-list">
            {loading && topLosers.length === 0 ? (
              <div style={{ textAlign: 'center', padding: 20 }}><Spin /></div>
            ) : topLosers.length === 0 ? (
              <div style={{ textAlign: 'center', padding: 20, color: '#999' }}>暂无数据</div>
            ) : topLosers.map((stock, index) => (
              <div key={stock.symbol || stock.stock_code || index} className="ranking-item">
                <div className="ranking-rank">{index + 1}</div>
                <div className="ranking-info">
                  <div className="stock-symbol">{stock.symbol || stock.stock_code}</div>
                  <div className="stock-name">{stock.name || stock.stock_name}</div>
                </div>
                <div className="stock-price">
                  ¥{(stock.close_price ?? stock.price ?? 0).toFixed(2)}
                </div>
                <div className="stock-change negative">
                  {(stock.change_percent ?? stock.changePercent ?? 0).toFixed(2)}%
                </div>
              </div>
            ))}
          </div>
          <Link to={ROUTE_PATHS.STOCKS} className="view-more">
            查看更多跌幅榜 →
          </Link>
        </div>
      </div>

      {/* 市场新闻 */}
      <div className="market-news">
        <h2 className="section-title">📰 市场新闻</h2>
        <div className="news-list">
          {loading && news.length === 0 ? (
            <div style={{ textAlign: 'center', padding: 20 }}><Spin /></div>
          ) : news.length === 0 ? (
            <div style={{ textAlign: 'center', padding: 20, color: '#999' }}>暂无新闻</div>
          ) : news.map((item, index) => (
            <div key={item.id || index} className="news-item">
              <div className="news-content">
                <h3 className="news-title">{item.title || item.headline}</h3>
                <div className="news-meta">
                  <span className="news-source">{item.source || item.source_name || '未知来源'}</span>
                  <span className="news-time">
                    {item.time || item.publish_time || item.created_at
                      ? formatRelativeTime(item.time || item.publish_time || item.created_at)
                      : ''}
                  </span>
                </div>
              </div>
              <button className="news-read-btn">阅读</button>
            </div>
          ))}
        </div>
      </div>

      {/* 系统状态 */}
      <div className="system-status">
        <h2 className="section-title">⚙️ 系统状态</h2>
        <div className="status-grid">
          <div className="status-item online">
            <div className="status-icon">📊</div>
            <div className="status-content">
              <h3>股票数据</h3>
              <p>{stats.totalStocks} 只股票</p>
            </div>
          </div>
          <div className={`status-item ${stats.risingStocks > stats.fallingStocks ? 'online' : 'warning'}`}>
            <div className="status-icon">📈</div>
            <div className="status-content">
              <h3>上涨股票</h3>
              <p>{stats.risingStocks} 只</p>
            </div>
          </div>
          <div className={`status-item ${stats.fallingStocks > stats.risingStocks ? 'warning' : 'online'}`}>
            <div className="status-icon">📉</div>
            <div className="status-content">
              <h3>下跌股票</h3>
              <p>{stats.fallingStocks} 只</p>
            </div>
          </div>
          <div className="status-item online">
            <div className="status-icon">💰</div>
            <div className="status-content">
              <h3>总市值</h3>
              <p>{stats.totalMarketCap.toFixed(0)} 亿</p>
            </div>
          </div>
        </div>
      </div>

      <style>{`
        .home-page {
          max-width: 1400px;
          margin: 0 auto;
        }

        /* 页面头部 */
        .page-header {
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
          margin-bottom: 32px;
          padding-bottom: 20px;
          border-bottom: 1px solid #eaeaea;
        }

        .page-title {
          font-size: 28px;
          font-weight: 700;
          margin: 0;
          background: linear-gradient(90deg, #667eea, #764ba2);
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
          background-clip: text;
        }

        .page-subtitle {
          color: #666;
          margin: 8px 0 0;
          font-size: 16px;
        }

        .time-display {
          text-align: right;
        }

        .current-time {
          font-size: 14px;
          color: #666;
          margin-bottom: 8px;
          font-family: 'Monaco', 'Consolas', monospace;
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

        /* 快速操作 */
        .quick-actions {
          margin-bottom: 32px;
        }

        .section-title {
          font-size: 20px;
          font-weight: 600;
          margin: 0 0 20px;
          color: #333;
        }

        .action-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
          gap: 20px;
        }

        .action-card {
          background: white;
          border-radius: 12px;
          padding: 24px;
          text-decoration: none;
          color: inherit;
          display: flex;
          align-items: center;
          gap: 16px;
          box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08);
          transition: all 0.2s;
        }

        .action-card:hover {
          transform: translateY(-4px);
          box-shadow: 0 8px 24px rgba(0, 0, 0, 0.12);
        }

        .action-icon {
          font-size: 32px;
        }

        .action-content h3 {
          margin: 0 0 8px;
          font-size: 16px;
          font-weight: 600;
          color: #333;
        }

        .action-content p {
          margin: 0;
          font-size: 14px;
          color: #666;
        }

        /* 主要指数 */
        .market-indices {
          margin-bottom: 32px;
        }

        .indices-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
          gap: 20px;
        }

        .index-card {
          background: white;
          border-radius: 12px;
          padding: 20px;
          box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08);
        }

        .index-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 16px;
        }

        .index-name {
          margin: 0;
          font-size: 16px;
          font-weight: 600;
          color: #333;
        }

        .index-symbol {
          font-size: 12px;
          color: #666;
          background: #f5f5f5;
          padding: 2px 8px;
          border-radius: 4px;
        }

        .index-price {
          font-size: 28px;
          font-weight: 700;
          color: #333;
          margin-bottom: 8px;
        }

        .index-change {
          font-size: 16px;
          font-weight: 600;
          margin-bottom: 12px;
        }

        .index-change.positive {
          color: #52c41a;
        }

        .index-change.negative {
          color: #ff4d4f;
        }

        .index-volume {
          display: flex;
          justify-content: space-between;
          font-size: 12px;
          color: #666;
        }

        /* 排行榜 */
        .rankings-section {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
          gap: 32px;
          margin-bottom: 32px;
        }

        .ranking-list {
          background: white;
          border-radius: 12px;
          overflow: hidden;
          box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08);
        }

        .ranking-item {
          display: flex;
          align-items: center;
          padding: 12px 16px;
          border-bottom: 1px solid #f0f0f0;
          transition: background 0.2s;
        }

        .ranking-item:hover {
          background: #fafafa;
        }

        .ranking-item:last-child {
          border-bottom: none;
        }

        .ranking-rank {
          width: 32px;
          height: 32px;
          background: #f5f5f5;
          border-radius: 6px;
          display: flex;
          align-items: center;
          justify-content: center;
          font-weight: 600;
          margin-right: 12px;
        }

        .ranking-info {
          flex: 1;
        }

        .stock-symbol {
          font-weight: 600;
          color: #333;
          font-size: 14px;
        }

        .stock-name {
          font-size: 12px;
          color: #666;
          margin-top: 2px;
        }

        .stock-price {
          font-weight: 600;
          color: #333;
          margin: 0 16px;
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

        .view-more {
          display: inline-block;
          margin-top: 12px;
          color: #667eea;
          text-decoration: none;
          font-size: 14px;
          font-weight: 500;
        }

        .view-more:hover {
          text-decoration: underline;
        }

        /* 市场新闻 */
        .market-news {
          margin-bottom: 32px;
        }

        .news-list {
          background: white;
          border-radius: 12px;
          overflow: hidden;
          box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08);
        }

        .news-item {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 16px;
          border-bottom: 1px solid #f0f0f0;
          transition: background 0.2s;
        }

        .news-item:hover {
          background: #fafafa;
        }

        .news-item:last-child {
          border-bottom: none;
        }

        .news-content {
          flex: 1;
        }

        .news-title {
          margin: 0 0 8px;
          font-size: 14px;
          font-weight: 500;
          color: #333;
        }

        .news-meta {
          display: flex;
          gap: 12px;
          font-size: 12px;
          color: #999;
        }

        .news-read-btn {
          padding: 6px 12px;
          background: #f5f5f5;
          border: none;
          border-radius: 4px;
          color: #666;
          font-size: 12px;
          cursor: pointer;
          transition: all 0.2s;
        }

        .news-read-btn:hover {
          background: #e0e0e0;
          color: #333;
        }

        /* 系统状态 */
        .system-status {
          margin-bottom: 32px;
        }

        .status-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
          gap: 20px;
        }

        .status-item {
          background: white;
          border-radius: 12px;
          padding: 20px;
          display: flex;
          align-items: center;
          gap: 16px;
          box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08);
        }

        .status-item.online {
          border-left: 4px solid #52c41a;
        }

        .status-item.warning {
          border-left: 4px solid #faad14;
        }

        .status-item.offline {
          border-left: 4px solid #ff4d4f;
        }

        .status-icon {
          font-size: 24px;
        }

        .status-content h3 {
          margin: 0 0 4px;
          font-size: 14px;
          font-weight: 600;
          color: #333;
        }

        .status-content p {
          margin: 0;
          font-size: 12px;
          color: #666;
        }

        /* 响应式设计 */
        @media (max-width: 768px) {
          .page-header {
            flex-direction: column;
            gap: 16px;
          }

          .time-display {
            text-align: left;
            width: 100%;
          }

          .action-grid {
            grid-template-columns: 1fr;
          }

          .indices-grid {
            grid-template-columns: 1fr;
          }

          .rankings-section {
            grid-template-columns: 1fr;
          }

          .status-grid {
            grid-template-columns: 1fr;
          }
        }

        /* 动画效果 */
        @keyframes fadeIn {
          from { opacity: 0; transform: translateY(10px); }
          to { opacity: 1; transform: translateY(0); }
        }

        .home-page > * {
          animation: fadeIn 0.5s ease-out;
        }

        .home-page > *:nth-child(1) { animation-delay: 0.1s; }
        .home-page > *:nth-child(2) { animation-delay: 0.2s; }
        .home-page > *:nth-child(3) { animation-delay: 0.3s; }
        .home-page > *:nth-child(4) { animation-delay: 0.4s; }
        .home-page > *:nth-child(5) { animation-delay: 0.5s; }
        .home-page > *:nth-child(6) { animation-delay: 0.6s; }
      `}</style>
      </div>
    </SimpleErrorBoundary>
  );
};

export default HomePage;