/**
 * 首页 v2 — 富途牛牛/芝士财富 参考设计
 * 暗色导航 + 浅色内容区 + 指数卡片 + 涨跌榜 + 快捷入口
 */

import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Spin, Alert, Card, Tag, Table } from 'antd';
import { ArrowUpOutlined, ArrowDownOutlined, ReloadOutlined, RiseOutlined, FallOutlined, StockOutlined, SearchOutlined, StarOutlined, LineChartOutlined, CompassOutlined } from '@ant-design/icons';
import { ROUTE_PATHS } from '../routes';
import { useStocks, useStockStats, initializeSampleData } from '../store/useStockStore';
import { SimpleErrorBoundary } from '../components/Common/UnifiedErrorBoundary';

const BG = '#f5f6f8';
const COLOR_UP = '#cf2a2a';
const COLOR_DOWN = '#1db468';
const TEXT = '#1a1a1a';
const TEXT_SEC = '#8c8c8c';
const BORDER = '#e8e8e8';
const CARD_BG = '#ffffff';

const formatBigNumber = (n: number): string => {
  if (n >= 1e8) return (n / 1e8).toFixed(1) + '亿';
  if (n >= 1e4) return (n / 1e4).toFixed(1) + '万';
  return String(n);
};

interface MarketIndex {
  name: string; symbol: string; closePrice: number;
  changePercent: number; volume: number; category?: string;
}
interface StockQuote {
  symbol: string; name: string; closePrice: number;
  changePercent: number; change: number; volume: number; turnover: number;
}

const HomePage: React.FC = () => {
  const navigate = useNavigate();
  const stocks = useStocks();
  const stats = useStockStats();

  const [indices, setIndices] = useState<MarketIndex[]>([]);
  const [topGainers, setTopGainers] = useState<StockQuote[]>([]);
  const [topLosers, setTopLosers] = useState<StockQuote[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [time, setTime] = useState(new Date());

  useEffect(() => { loadData(); const t = setInterval(() => setTime(new Date()), 60000); return () => clearInterval(t); }, []);
  useEffect(() => { if (stocks.length === 0) initializeSampleData(); }, [stocks.length]);

  const loadData = async () => {
    setLoading(true); setError(null);
    try {
      const [indicesRes, stocksRes] = await Promise.all([
        fetch('/api/market/indices').then(r => r.ok ? r.json() : null).catch(() => null),
        fetch('/api/stocks?limit=50').then(r => r.ok ? r.json() : null).catch(() => null),
      ]);
      setIndices(indicesRes?.data?.indices || []);

      const stockList = stocksRes?.data?.stocks || [];
      if (stockList.length > 0) {
        const symbols = stockList.map((s: any) => s.symbol);
        const quotesRes = await fetch('/api/stocks/batch/quotes', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ symbols }),
        }).then(r => r.ok ? r.json() : null).catch(() => null);

        const stocksData = quotesRes?.data?.stocks || [];
        const withQuotes: StockQuote[] = stocksData
          .filter((s: any) => s.latestQuote)
          .map((s: any) => ({
            symbol: s.symbol?.replace(/\.(SH|SZ)$/, '') || s.symbol,
            name: s.name || s.symbol,
            closePrice: s.latestQuote.closePrice || 0,
            changePercent: s.latestQuote.changePercent || 0,
            change: s.latestQuote.change || 0,
            volume: s.latestQuote.volume || 0,
            turnover: s.latestQuote.turnover || 0,
          }));
        const sorted = [...withQuotes].sort((a, b) => b.changePercent - a.changePercent);
        setTopGainers(sorted.slice(0, 5));
        setTopLosers(sorted.slice(-5).reverse());
      }
    } catch { setError('数据加载失败'); }
    finally { setLoading(false); }
  };

  const rankCols = [
    { title: '#', width: 40, render: (_: any, __: any, i: number) => (
      <span style={{ fontWeight: 700, color: i < 3 ? COLOR_UP : TEXT_SEC, fontSize: 12 }}>{i + 1}</span>
    )},
    { title: '代码', dataIndex: 'symbol', width: 80, render: (v: string) => (
      <Link to={`/stocks/${v}`} style={{ color: '#2563eb', fontWeight: 600, fontFamily: 'monospace', fontSize: 12 }}>{v}</Link>
    )},
    { title: '名称', dataIndex: 'name', ellipsis: true, render: (v: string) => <span style={{ fontSize: 12 }}>{v}</span> },
    { title: '最新价', dataIndex: 'closePrice', align: 'right' as const, width: 80,
      render: (v: number) => <span style={{ fontFamily: 'monospace', fontWeight: 600, fontSize: 12 }}>{v?.toFixed(2)}</span> },
    { title: '涨跌幅', dataIndex: 'changePercent', align: 'right' as const, width: 80,
      render: (v: number) => (
        <span style={{ color: v >= 0 ? COLOR_UP : COLOR_DOWN, fontWeight: 700, fontFamily: 'monospace', fontSize: 12 }}>
          {v >= 0 ? '+' : ''}{v?.toFixed(2)}%
        </span>
      )},
  ];

  // 富途风格：指数卡片用微妙红绿色调，不是大色块
  const mainIndices = indices.slice(0, 3);

  return (
    <SimpleErrorBoundary name="HomePage">
      <div style={{ background: BG, minHeight: '100vh' }}>
        {/* ===== Hero Banner ===== */}
        <div style={{
          background: 'linear-gradient(135deg, #0f172a 0%, #1e293b 50%, #0f172a 100%)',
          padding: '32px 32px 40px', color: '#fff',
        }}>
          <div style={{ maxWidth: 1400, margin: '0 auto' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 16, marginBottom: 28 }}>
              <div>
                <h1 style={{ fontSize: 26, fontWeight: 800, margin: 0, letterSpacing: '-0.5px' }}>市场概览</h1>
                <div style={{ fontSize: 13, color: '#94a3b8', marginTop: 4 }}>
                  {time.toLocaleDateString('zh-CN', { month: 'long', day: 'numeric', weekday: 'long' })} · 腾讯财经实时数据
                </div>
              </div>
              <button onClick={loadData} disabled={loading} style={{
                padding: '8px 18px', background: 'rgba(255,255,255,0.1)', color: '#fff', border: '1px solid rgba(255,255,255,0.15)',
                borderRadius: 8, cursor: loading ? 'not-allowed' : 'pointer', fontSize: 13, fontWeight: 500, display: 'flex', alignItems: 'center', gap: 6,
              }}>
                <ReloadOutlined spin={loading} /> 刷新
              </button>
            </div>

            {/* 三大指数 - 富途风格：暗底 + 微妙色条 */}
            {loading && indices.length === 0 ? (
              <div style={{ textAlign: 'center', padding: 30 }}><Spin /></div>
            ) : (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 14 }}>
                {indices.map((idx) => {
                  const up = idx.changePercent >= 0;
                  return (
                    <div key={idx.symbol} style={{
                      background: 'rgba(255,255,255,0.05)', borderRadius: 12, padding: '18px 22px',
                      border: '1px solid rgba(255,255,255,0.08)', position: 'relative', overflow: 'hidden',
                      cursor: 'pointer', transition: 'background .2s',
                    }}
                      onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.08)'}
                      onMouseLeave={e => e.currentTarget.style.background = 'rgba(255,255,255,0.05)'}
                      onClick={() => {
                        const sym = idx.symbol || '';
                        if (sym) navigate(`/stocks/${sym}`);
                      }}
                    >
                      {/* 左侧色条 */}
                      <div style={{
                        position: 'absolute', left: 0, top: 0, bottom: 0, width: 3,
                        background: up ? COLOR_UP : COLOR_DOWN,
                      }} />
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                        <div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                            <span style={{ fontSize: 13, color: '#cbd5e1', fontWeight: 500 }}>{idx.name}</span>
                            {idx.category && (
                              <Tag style={{ fontSize: 10, borderRadius: 4, margin: 0, padding: '0 5px', lineHeight: '16px', background: 'rgba(255,255,255,0.1)', color: '#94a3b8', border: 'none' }}>
                                {idx.category}
                              </Tag>
                            )}
                          </div>
                          <div style={{ fontSize: 28, fontWeight: 800, fontFamily: '"DIN Alternate", monospace', color: '#f1f5f9' }}>
                            {idx.closePrice?.toLocaleString?.() || idx.closePrice || '—'}
                          </div>
                        </div>
                        <div style={{ textAlign: 'right' }}>
                          <div style={{
                            fontSize: 16, fontWeight: 700, fontFamily: 'monospace',
                            color: up ? COLOR_UP : COLOR_DOWN,
                            background: up ? 'rgba(207,42,42,0.15)' : 'rgba(29,180,104,0.15)',
                            padding: '4px 10px', borderRadius: 6,
                          }}>
                            {up ? '+' : ''}{idx.changePercent?.toFixed(2)}%
                          </div>
                          <div style={{ fontSize: 11, color: '#64748b', marginTop: 4 }}>
                            量 {formatBigNumber(idx.volume || 0)}
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* ===== Content Area ===== */}
        <div style={{ maxWidth: 1400, margin: '0 auto', padding: '20px 24px' }}>
          {error && <Alert message={error} type="warning" showIcon closable onClose={() => setError(null)} style={{ marginBottom: 16 }} />}

          {/* Quick Nav */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 10, marginBottom: 20 }}>
            {[
              { to: '/discover', icon: <CompassOutlined />, label: '发掘', color: '#3b82f6' },
              { to: ROUTE_PATHS.WATCHLIST, icon: <StarOutlined />, label: '自选', color: '#f59e0b' },
              { to: ROUTE_PATHS.SCREENER, icon: <SearchOutlined />, label: '筛选', color: '#8b5cf6' },
              { to: ROUTE_PATHS.MARKET, icon: <LineChartOutlined />, label: '市场', color: '#0891b2' },
            ].map(item => (
              <Link key={item.to} to={item.to} style={{
                background: CARD_BG, borderRadius: 10, border: `1px solid ${BORDER}`,
                padding: '14px 16px', textDecoration: 'none', display: 'flex', alignItems: 'center', gap: 10,
                transition: 'all .15s',
              }}
                onMouseEnter={e => { e.currentTarget.style.borderColor = item.color; e.currentTarget.style.boxShadow = `0 2px 8px ${item.color}20`; }}
                onMouseLeave={e => { e.currentTarget.style.borderColor = BORDER; e.currentTarget.style.boxShadow = 'none'; }}
              >
                <span style={{ fontSize: 18, color: item.color }}>{item.icon}</span>
                <span style={{ fontWeight: 600, fontSize: 13, color: TEXT }}>{item.label}</span>
              </Link>
            ))}
          </div>

          {/* Stats Row */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 10, marginBottom: 20 }}>
            {[
              { label: '股票总数', value: stats.totalStocks, color: '#2563eb', bg: '#eff6ff' },
              { label: '上涨', value: stats.risingStocks, color: COLOR_UP, bg: '#fef2f2' },
              { label: '下跌', value: stats.fallingStocks, color: COLOR_DOWN, bg: '#f0fdf4' },
              { label: '总市值(亿)', value: stats.totalMarketCap.toFixed(0), color: '#7c3aed', bg: '#faf5ff' },
            ].map((s, i) => (
              <div key={i} style={{ background: s.bg, borderRadius: 10, border: `1px solid ${s.color}20`, padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 10 }}>
                <div>
                  <div style={{ fontSize: 11, color: TEXT_SEC, marginBottom: 2 }}>{s.label}</div>
                  <div style={{ fontSize: 20, fontWeight: 700, color: s.color, fontFamily: '"DIN Alternate", monospace' }}>{s.value}</div>
                </div>
              </div>
            ))}
          </div>

          {/* Gainers + Losers Side by Side */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 16, marginBottom: 20 }}>
            {/* Gainers */}
            <Card size="small" style={{ borderRadius: 10, border: `1px solid ${BORDER}` }}
              title={<span style={{ fontWeight: 700, color: TEXT, fontSize: 14 }}><RiseOutlined style={{ color: COLOR_UP, marginRight: 6 }} />涨幅榜 TOP5</span>}
              extra={<Tag color="red" style={{ borderRadius: 4, fontWeight: 600 }}>{stats.risingStocks} 只上涨</Tag>}>
              {topGainers.length > 0 ? (
                <Table dataSource={topGainers} columns={rankCols} pagination={false} size="small" rowKey="symbol" showHeader={false}
                  onRow={r => ({ onClick: () => navigate(`/stocks/${r.symbol}`), style: { cursor: 'pointer' } })} />
              ) : <div style={{ textAlign: 'center', padding: 20, color: TEXT_SEC }}>{loading ? <Spin size="small" /> : '暂无数据'}</div>}
            </Card>

            {/* Losers */}
            <Card size="small" style={{ borderRadius: 10, border: `1px solid ${BORDER}` }}
              title={<span style={{ fontWeight: 700, color: TEXT, fontSize: 14 }}><FallOutlined style={{ color: COLOR_DOWN, marginRight: 6 }} />跌幅榜 TOP5</span>}
              extra={<Tag color="green" style={{ borderRadius: 4, fontWeight: 600 }}>{stats.fallingStocks} 只下跌</Tag>}>
              {topLosers.length > 0 ? (
                <Table dataSource={topLosers} columns={rankCols} pagination={false} size="small" rowKey="symbol" showHeader={false}
                  onRow={r => ({ onClick: () => navigate(`/stocks/${r.symbol}`), style: { cursor: 'pointer' } })} />
              ) : <div style={{ textAlign: 'center', padding: 20, color: TEXT_SEC }}>{loading ? <Spin size="small" /> : '暂无数据'}</div>}
            </Card>
          </div>

          {/* Footer */}
          <div style={{ padding: 16, background: CARD_BG, borderRadius: 10, border: `1px solid ${BORDER}`, fontSize: 12, color: TEXT_SEC, display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
            <span>数据源: 腾讯财经实时行情</span>
            <span>股票数据: {stocks.length} 只 · 更新于 {time.toLocaleTimeString('zh-CN')}</span>
          </div>
        </div>
      </div>
    </SimpleErrorBoundary>
  );
};

export default React.memo(HomePage);
