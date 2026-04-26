'use client'

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

const formatBigNumber = (num: number): string => {
  if (num >= 1e8) return (num / 1e8).toFixed(1) + '亿';
  if (num >= 1e4) return (num / 1e4).toFixed(1) + '万';
  return num.toFixed(0);
};

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

const HomePage: React.FC = () => {
  const stocks = useStocks();
  const stats = useStockStats();
  const userPreferences = useUserPreferences();

  const [marketData, setMarketData] = useState<any[]>([{ name: '加载中...', symbol: '', closePrice: 0, changePercent: 0, volume: 0, turnover: 0 }]);
  const [topGainers, setTopGainers] = useState<any[]>([]);
  const [topLosers, setTopLosers] = useState<any[]>([]);
  const [news, setNews] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [time, setTime] = useState(new Date());

  // ===== 直接fetch真实数据（绕过有bug的apiService）=====
  useEffect(() => {
    let cancelled = false;
    const baseUrl = '/api';

    async function load() {
      setLoading(true);
      try {
        const [summaryRes, gainersRes, losersRes, newsRes] = await Promise.allSettled([
          fetch(`${baseUrl}/market/summary`).then(r => r.ok ? r.json() : Promise.reject(r.status)),
          fetch(`${baseUrl}/market/top-gainers?limit=5`).then(r => r.ok ? r.json() : Promise.reject(r.status)),
          fetch(`${baseUrl}/market/top-losers?limit=5`).then(r => r.ok ? r.json() : Promise.reject(r.status)),
          fetch(`${baseUrl}/news?limit=5`).then(r => r.ok ? r.json() : Promise.reject(r.status)),
        ]);

        if (cancelled) return;

        // 指数数据
        if (summaryRes.status === 'fulfilled') {
          const d = summaryRes.value as any;
          if (d.data?.indices?.length) {
            setMarketData(d.data.indices);
          }
        }

        // 涨幅榜
        if (gainersRes.status === 'fulfilled') {
          const d = gainersRes.value as any;
          setTopGainers((d.data?.topGainers || d.data?.top_gainers || []).slice(0, 5));
        }

        // 跌幅榜
        if (losersRes.status === 'fulfilled') {
          const d = losersRes.value as any;
          setTopLosers((d.data?.topLosers || d.data?.top_losers || []).slice(0, 5));
        }

        // 新闻
        if (newsRes.status === 'fulfilled') {
          const d = newsRes.value as any;
          const list = Array.isArray(d.data) ? d.data : (d.data?.news || d.data?.items || []);
          setNews(list.slice(0, 5));
        }
      } catch (err) {
        if (!cancelled) setError('数据加载中，请稍候...');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => { cancelled = true; };
  }, []);  // 仅挂载时执行一次

  // 更新时间
  useEffect(() => {
    const timer = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  // 确保有示例数据
  useEffect(() => {
    if (stocks.length === 0) initializeSampleData();
  }, [stocks.length]);

  const indexCards = marketData.map((idx: any) => {
    const isPositive = (idx.changePercent || 0) >= 0;
    return (
      <div key={idx.symbol || idx.name}
        style={{
          background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
          borderRadius: 16, padding: '18px 20px', color: 'white',
          minWidth: 200, flex: 1,
        }}>
        <div style={{ fontSize: 13, opacity: 0.85, marginBottom: 6 }}>{idx.name}</div>
        <div style={{ fontSize: 26, fontWeight: 700, marginBottom: 4 }}>
          {idx.closePrice?.toLocaleString?.() || idx.closePrice || '—'}
        </div>
        <div style={{ fontSize: 13, opacity: 0.9 }}>
          <span style={{ color: isPositive ? '#4ade80' : '#f87171' }}>
            {isPositive ? '+' : ''}{(idx.changePercent || 0).toFixed(2)}%
          </span>
          <span style={{ marginLeft: 12 }}>量 {formatBigNumber(idx.volume || 0)}</span>
        </div>
      </div>
    );
  });

  return (
    <SimpleErrorBoundary name="HomePage">
      <div style={{ padding: '24px 32px', maxWidth: 1400, margin: '0 auto' }}>
        {/* Header */}
        <div style={{ marginBottom: 28 }}>
          <h1 style={{ fontSize: 28, fontWeight: 700, margin: 0 }}>📊 A股行情分析系统</h1>
          <p style={{ color: '#888', margin: '4px 0 0', fontSize: 14 }}>
            实时市场数据 · 腾讯财经 & 东方财富
          </p>
          <div style={{ marginTop: 8, fontSize: 13, color: '#aaa' }}>
            {time.toLocaleString('zh-CN', { hour12: false })}
            <button onClick={() => window.location.reload()} style={{ marginLeft: 12, padding: '4px 12px', border: '1px solid #ddd', borderRadius: 6, background: '#fff', cursor: 'pointer', fontSize: 12 }}>
              🔄 刷新数据
            </button>
          </div>
        </div>

        {error && <Alert message={error} type="warning" showIcon style={{ marginBottom: 16 }} closable onClose={() => setError(null)} />}

        {/* 快速操作 */}
        <div style={{ display: 'flex', gap: 12, marginBottom: 24, flexWrap: 'wrap' }}>
          {[
            { to: ROUTE_PATHS.STOCKS, label: '📈 股票列表', desc: '浏览所有A股股票实时行情' },
            { to: ROUTE_PATHS.WATCHLIST, label: '⭐ 自选股', desc: '关注您感兴趣的股票' },
            { to: ROUTE_PATHS.SCREENER, label: '🔍 股票筛选器', desc: '按条件筛选优质股票' },
            { to: ROUTE_PATHS.MARKET, label: '📊 市场分析', desc: '查看市场趋势和数据分析' },
          ].map(item => (
            <Link key={item.to} to={item.to}
              style={{
                flex: '1 1 200px', padding: 16, background: '#fff',
                borderRadius: 12, boxShadow: '0 1px 4px rgba(0,0,0,0.06)',
                textDecoration: 'none', color: '#333',
                transition: 'box-shadow .2s',
              }}
              onMouseEnter={e => (e.currentTarget.style.boxShadow = '0 4px 16px rgba(0,0,0,0.1)')}
              onMouseLeave={e => (e.currentTarget.style.boxShadow = '0 1px 4px rgba(0,0,0,0.06)')}
            >
              <div style={{ fontWeight: 600, marginBottom: 4 }}>{item.label}</div>
              <div style={{ fontSize: 12, color: '#999' }}>{item.desc}</div>
            </Link>
          ))}
        </div>

        {/* 主要指数 */}
        <div style={{ marginBottom: 28 }}>
          <h2 style={{ fontSize: 18, fontWeight: 600, marginBottom: 14 }}>📈 主要指数</h2>
          {loading && marketData[0]?.name === '加载中...' ? (
            <Spin tip="加载指数数据..." />
          ) : (
            <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
              {indexCards}
            </div>
          )}
        </div>

        {/* 涨幅榜 + 跌幅榜 */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20, marginBottom: 28 }}>
          <div>
            <h2 style={{ fontSize: 16, fontWeight: 600, marginBottom: 10 }}>📈 涨幅榜</h2>
            {topGainers.length === 0 ? <div style={{ color: '#999', fontSize: 13 }}>暂无数据</div> : (
              <div style={{ background: '#fff', borderRadius: 10, padding: 12, boxShadow: '0 1px 4px rgba(0,0,0,0.04)' }}>
                {topGainers.map((s: any, i: number) => (
                  <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: i < topGainers.length - 1 ? '1px solid #f0f0f0' : 'none', fontSize: 13 }}>
                    <span style={{ fontWeight: 500 }}>{s.symbol || s.name}</span>
                    <span style={{ color: '#f43f5e' }}>+{(s.changePercent || s.latestQuote?.changePercent || 0).toFixed(2)}%</span>
                  </div>
                ))}
              </div>
            )}
          </div>
          <div>
            <h2 style={{ fontSize: 16, fontWeight: 600, marginBottom: 10 }}>📉 跌幅榜</h2>
            {topLosers.length === 0 ? <div style={{ color: '#999', fontSize: 13 }}>暂无数据</div> : (
              <div style={{ background: '#fff', borderRadius: 10, padding: 12, boxShadow: '0 1px 4px rgba(0,0,0,0.04)' }}>
                {topLosers.map((s: any, i: number) => (
                  <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: i < topLosers.length - 1 ? '1px solid #f0f0f0' : 'none', fontSize: 13 }}>
                    <span style={{ fontWeight: 500 }}>{s.symbol || s.name}</span>
                    <span style={{ color: '#22c55e' }}>{(s.changePercent || s.latestQuote?.changePercent || 0).toFixed(2)}%</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* 市场新闻 */}
        <div style={{ marginBottom: 28 }}>
          <h2 style={{ fontSize: 16, fontWeight: 600, marginBottom: 10 }}>📰 市场新闻</h2>
          {news.length === 0 ? <div style={{ color: '#999', fontSize: 13 }}>暂无新闻</div> : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {news.map((n: any, i: number) => (
                <a key={i} href={n.url || '#'} target="_blank" rel="noopener noreferrer"
                  style={{
                    display: 'block', padding: '10px 14px', background: '#fff',
                    borderRadius: 8, textDecoration: 'none', color: '#333',
                    boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
                    fontSize: 14,
                  }}>
                  <div style={{ fontWeight: 500 }}>{n.title}</div>
                  <div style={{ fontSize: 11, color: '#999', marginTop: 4 }}>
                    {n.source} · {n.publishTime ? new Date(n.publishTime).toLocaleString('zh-CN') : ''}
                  </div>
                </a>
              ))}
            </div>
          )}
        </div>

        {/* 系统状态 */}
        <div style={{ padding: 16, background: '#f8fafc', borderRadius: 10, fontSize: 12, color: '#888' }}>
          <strong style={{ color: '#555' }}>⚙️ 系统状态</strong>
          <div style={{ display: 'flex', gap: 24, marginTop: 8 }}>
            <span>股票数据: {stocks.length} 只</span>
            <span>上涨: {stats.risingStocks || 0}</span>
            <span>下跌: {stats.fallingStocks || 0}</span>
            <span>总市值: {formatBigNumber(stats.totalMarketCap || 0)}</span>
          </div>
          <div style={{ marginTop: 4, color: '#aaa' }}>数据源: 腾讯财经实时行情 + 东方财富新闻</div>
        </div>
      </div>
    </SimpleErrorBoundary>
  );
};

export default React.memo(HomePage);
