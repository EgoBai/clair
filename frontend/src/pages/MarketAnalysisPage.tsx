/**
 * 市场分析页 v2 — 排行榜可点击 + 真实行业数据
 * 现代设计：白底卡片 + 清晰层次
 */

import React, { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Typography, Breadcrumb, Row, Col, Card, Tabs, Spin, Alert, Table, Tag, Progress } from 'antd';
import { HomeOutlined, LineChartOutlined, RiseOutlined, FallOutlined, DollarOutlined } from '@ant-design/icons';
import MarketSentiment from '../components/Market/MarketSentiment';

const { Title } = Typography;

const BG = '#f5f6f8';
const BORDER = '#e8e8e8';
const TEXT = '#1a1a1a';
const TEXT_SEC = '#8c8c8c';
const COLOR_UP = '#cf2a2a';
const COLOR_DOWN = '#1db468';

interface MarketData {
  indices: any[];
  topGainers: any[];
  topLosers: any[];
  topTurnover: any[];
  industries: any[];
  summary: any;
  sectorCounts: { up: number; down: number; total: number };
}

const MarketAnalysisPage: React.FC = () => {
  const navigate = useNavigate();
  const [data, setData] = useState<MarketData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const [summaryRes, indicesRes, industryRes] = await Promise.allSettled([
          fetch('/api/market/summary').then(r => r.ok ? r.json() : null),
          fetch('/api/market/indices').then(r => r.ok ? r.json() : null),
          fetch('/api/market/industries').then(r => r.ok ? r.json() : null),
        ]);
        if (cancelled) return;

        const summary = summaryRes.status === 'fulfilled' ? (summaryRes.value?.data || {}) : {};
        const indices = (indicesRes.status === 'fulfilled' ? indicesRes.value?.data?.indices : []) || [];
        const industries = (industryRes.status === 'fulfilled' ? industryRes.value?.data?.industries : []) || [];

        // Get stock data for rankings
        const stocksRes = await fetch('/api/stocks?limit=100').then(r => r.ok ? r.json() : null).catch(() => null);
        const stockList = stocksRes?.data?.stocks || [];

        let topGainers: any[] = [], topLosers: any[] = [], topTurnover: any[] = [];
        let sectorUp = 0, sectorDown = 0;

        if (stockList.length > 0) {
          const symbols = stockList.map((s: any) => s.symbol);
          const quotesRes = await fetch('/api/stocks/batch/quotes', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ symbols }),
          }).then(r => r.ok ? r.json() : null).catch(() => null);

          const stocksData = quotesRes?.data?.stocks || [];
          const withQuotes = stocksData.filter((s: any) => s.latestQuote);

          const sorted = [...withQuotes].sort((a, b) => (b.latestQuote?.changePercent || 0) - (a.latestQuote?.changePercent || 0));

          topGainers = sorted.slice(0, 10).map((s: any) => ({
            symbol: s.symbol || '',
            name: s.name || s.symbol,
            closePrice: s.latestQuote?.closePrice || 0,
            changePercent: s.latestQuote?.changePercent || 0,
            turnover: s.latestQuote?.turnover || 0,
          }));

          topLosers = [...sorted].sort((a, b) => (a.latestQuote?.changePercent || 0) - (b.latestQuote?.changePercent || 0)).slice(0, 10).map((s: any) => ({
            symbol: s.symbol || '',
            name: s.name || s.symbol,
            closePrice: s.latestQuote?.closePrice || 0,
            changePercent: s.latestQuote?.changePercent || 0,
            turnover: s.latestQuote?.turnover || 0,
          }));

          const turnoverSorted = [...withQuotes].sort((a, b) => (b.latestQuote?.turnover || 0) - (a.latestQuote?.turnover || 0));
          topTurnover = turnoverSorted.slice(0, 10).map((s: any) => ({
            symbol: s.symbol || '',
            name: s.name || s.symbol,
            closePrice: s.latestQuote?.closePrice || 0,
            changePercent: s.latestQuote?.changePercent || 0,
            turnover: s.latestQuote?.turnover || 0,
          }));

          // Compute industry summary from stocks
          const industryMap = new Map<string, { count: number; totalChange: number }>();
          withQuotes.forEach((s: any) => {
            const ind = s.industry || '其他';
            if (!industryMap.has(ind)) industryMap.set(ind, { count: 0, totalChange: 0 });
            const e = industryMap.get(ind)!;
            e.count++;
            e.totalChange += s.latestQuote?.changePercent || 0;
          });
          const computedIndustries = Array.from(industryMap.entries()).map(([name, v]) => ({
            industry: name,
            stock_count: v.count,
            avg_change_percent: Math.round((v.totalChange / v.count) * 100) / 100,
          }));

          // Use backend industry data if available, otherwise computed
          if (industries.length === 0) {
            // Merge computed into the industries array
            computedIndustries.forEach(ind => {
              if (!industries.find((i: any) => i.industry === ind.industry)) {
                industries.push(ind);
              }
            });
          }

          sectorUp = computedIndustries.filter((i: any) => i.avg_change_percent > 0).length;
          sectorDown = computedIndustries.filter((i: any) => i.avg_change_percent < 0).length;
        }

        if (cancelled) return;
        setData({
          indices, topGainers, topLosers, topTurnover, industries,
          summary,
          sectorCounts: { up: sectorUp, down: sectorDown, total: industries.length || sectorUp + sectorDown },
        });
      } catch (err) {
        if (!cancelled) setError('数据加载失败');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => { cancelled = true; };
  }, []);

  const formatNumber = (n: number) => {
    if (n >= 1e8) return `${(n / 1e8).toFixed(1)}亿`;
    if (n >= 1e4) return `${(n / 1e4).toFixed(1)}万`;
    return String(n);
  };
  const formatPercent = (n: number) => `${n >= 0 ? '+' : ''}${n.toFixed(2)}%`;

  const getSectorColor = (cp: number) => {
    if (cp > 2) return '#b91c1c'; if (cp > 1) return '#dc2626';
    if (cp > 0.3) return '#ef4444'; if (cp > -0.3) return '#e5e7eb';
    if (cp > -1) return '#22c555'; if (cp > -2) return '#16a34a'; return '#15803d';
  };
  const getSectorText = (cp: number) => Math.abs(cp) >= 0.3 ? '#fff' : '#333';

  const rankColumns = [
    { title: '代码', dataIndex: 'symbol', key: 'symbol', width: 90,
      render: (v: string) => <span style={{ fontFamily: 'monospace', fontWeight: 600, color: '#3b82f6' }}>{v.replace(/\.(SH|SZ)$/, '')}</span> },
    { title: '名称', dataIndex: 'name', key: 'name', ellipsis: true },
    { title: '最新价', dataIndex: 'closePrice', key: 'price', align: 'right' as const,
      render: (v: number) => v?.toFixed(2) },
    { title: '涨跌幅', dataIndex: 'changePercent', key: 'change', align: 'right' as const,
      render: (v: number) => <span style={{ color: v >= 0 ? COLOR_UP : COLOR_DOWN, fontWeight: 700, fontFamily: 'monospace' }}>{formatPercent(v)}</span> },
    { title: '成交额', dataIndex: 'turnover', key: 'turnover', align: 'right' as const,
      render: (v: number) => <span style={{ fontFamily: 'monospace' }}>{formatNumber(v || 0)}</span> },
  ];

  const handleRowClick = useCallback((symbol: string) => {
    navigate(`/stocks/${symbol}`);
  }, [navigate]);

  if (loading) return <div style={{ textAlign: 'center', padding: 100, background: BG }}><Spin size="large" /></div>;
  if (error) return <div style={{ padding: 100, textAlign: 'center', background: BG }}><Alert message={error} type="error" showIcon /></div>;
  if (!data) return null;

  return (
    <div style={{ padding: '16px 24px', maxWidth: 1400, margin: '0 auto', background: BG, minHeight: '100vh' }}>
      <Breadcrumb style={{ marginBottom: 12 }} items={[
        { href: '/', title: <><HomeOutlined /> 首页</> },
        { title: <><LineChartOutlined /> 市场分析</> },
      ]} />
      <Title level={4} style={{ marginBottom: 16, color: TEXT }}>
        <LineChartOutlined style={{ marginRight: 8, color: '#3b82f6' }} />市场分析
      </Title>

      <Row gutter={[12, 12]}>
        {/* All Major Indices */}
        <Col span={24}>
          <Card size="small" title={<span style={{ fontWeight: 700, color: TEXT }}>主要指数</span>}
            style={{ borderRadius: 8, border: `1px solid ${BORDER}` }}>
            {data.indices.length > 0 ? (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(170px, 1fr))', gap: 10 }}>
                {data.indices.map((idx: any, i: number) => (
                  <div key={i} style={{
                    padding: '14px 16px', borderRadius: 10,
                    background: idx.changePercent >= 0 ? '#fef2f2' : '#f0fdf4',
                    border: `1px solid ${idx.changePercent >= 0 ? '#fecaca' : '#bbf7d0'}`,
                    display: 'flex', flexDirection: 'column', gap: 4,
                    cursor: 'pointer', transition: 'all .15s',
                  }}
                    onClick={() => { const sym = idx.symbol; if (sym) navigate(`/stocks/${sym}`); }}
                    onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-2px)'; e.currentTarget.style.boxShadow = '0 4px 12px rgba(0,0,0,0.08)'; }}
                    onMouseLeave={e => { e.currentTarget.style.transform = ''; e.currentTarget.style.boxShadow = ''; }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ fontWeight: 700, fontSize: 13, color: TEXT }}>{idx.name}</span>
                      <Tag style={{ fontSize: 10, borderRadius: 4, margin: 0, padding: '0 6px', lineHeight: '18px' }}
                        color={idx.category === '综合' ? 'blue' : idx.category === '大盘' ? 'purple' : idx.category === '科创' ? 'cyan' : 'default'}>
                        {idx.category || ''}
                      </Tag>
                    </div>
                    <div style={{ fontSize: 20, fontWeight: 800, fontFamily: '"DIN Alternate",monospace', color: TEXT }}>
                      {idx.closePrice?.toLocaleString()}
                    </div>
                    <div style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 13 }}>
                      <span style={{ color: idx.changePercent >= 0 ? COLOR_UP : COLOR_DOWN, fontWeight: 700, fontFamily: 'monospace' }}>
                        {idx.changePercent >= 0 ? '+' : ''}{idx.changePercent?.toFixed(2)}%
                      </span>
                      <span style={{ color: TEXT_SEC, fontSize: 11 }}>量 {formatNumber(idx.volume)}</span>
                    </div>
                  </div>
                ))}
              </div>
            ) : <Alert message="暂无指数数据" type="info" showIcon />}
          </Card>
        </Col>

        {/* Sentiment + Overview */}
        <Col xs={24} lg={12}>
          <MarketSentiment
            riseCount={data.summary?.risingStocks || 0}
            fallCount={data.summary?.fallingStocks || 0}
            flatCount={data.summary?.unchangedStocks || 0}
            limitUp={0} limitDown={0}
            totalTurnover={data.summary?.totalTurnover || 0}
            avgChangePercent={data.summary?.risingStocks && data.summary?.fallingStocks
              ? ((data.summary.risingStocks - data.summary.fallingStocks) / Math.max(data.summary.totalStocks || 1, 1)) * 3 : 0}
          />
        </Col>
        <Col xs={24} lg={12}>
          <Card size="small" title={<span style={{ fontWeight: 700, color: TEXT }}>市场概览</span>}
            style={{ borderRadius: 8, border: `1px solid ${BORDER}` }}>
            <Row gutter={[16, 16]}>
              <Col span={8}><div style={{ textAlign: 'center' }}>
                <div style={{ fontSize: 12, color: TEXT_SEC }}>总股票数</div>
                <div style={{ fontSize: 24, fontWeight: 700, color: TEXT }}>{data.summary?.totalStocks || 0}</div>
              </div></Col>
              <Col span={8}><div style={{ textAlign: 'center' }}>
                <div style={{ fontSize: 12, color: COLOR_UP }}>上涨</div>
                <div style={{ fontSize: 24, fontWeight: 700, color: COLOR_UP }}>{data.summary?.risingStocks || 0}</div>
              </div></Col>
              <Col span={8}><div style={{ textAlign: 'center' }}>
                <div style={{ fontSize: 12, color: COLOR_DOWN }}>下跌</div>
                <div style={{ fontSize: 24, fontWeight: 700, color: COLOR_DOWN }}>{data.summary?.fallingStocks || 0}</div>
              </div></Col>
            </Row>
          </Card>
        </Col>

        {/* Rankings */}
        <Col span={24}>
          <Card size="small" style={{ borderRadius: 8, border: `1px solid ${BORDER}` }}
            styles={{ body: { padding: '8px 16px' } }}>
            <Tabs defaultActiveKey="gainers" items={[
              {
                key: 'gainers', label: <span><RiseOutlined style={{ color: COLOR_UP }} /> 涨幅榜</span>,
                children: data.topGainers.length > 0 ? (
                  <Table dataSource={data.topGainers} columns={rankColumns} pagination={false} size="small"
                    rowKey="symbol" showHeader={true}
                    onRow={(record) => ({ onClick: () => handleRowClick(record.symbol), style: { cursor: 'pointer' } })} />
                ) : <div style={{ textAlign: 'center', padding: 30, color: TEXT_SEC }}>暂无数据</div>,
              },
              {
                key: 'losers', label: <span><FallOutlined style={{ color: COLOR_DOWN }} /> 跌幅榜</span>,
                children: data.topLosers.length > 0 ? (
                  <Table dataSource={data.topLosers} columns={rankColumns} pagination={false} size="small"
                    rowKey="symbol"
                    onRow={(record) => ({ onClick: () => handleRowClick(record.symbol), style: { cursor: 'pointer' } })} />
                ) : <div style={{ textAlign: 'center', padding: 30, color: TEXT_SEC }}>暂无数据</div>,
              },
              {
                key: 'turnover', label: <span><DollarOutlined /> 成交额榜</span>,
                children: data.topTurnover.length > 0 ? (
                  <Table dataSource={data.topTurnover} columns={rankColumns} pagination={false} size="small"
                    rowKey="symbol"
                    onRow={(record) => ({ onClick: () => handleRowClick(record.symbol), style: { cursor: 'pointer' } })} />
                ) : <div style={{ textAlign: 'center', padding: 30, color: TEXT_SEC }}>暂无数据</div>,
              },
            ]} />
          </Card>
        </Col>

        {/* Industry Heatmap */}
        <Col xs={24} lg={14}>
          <Card size="small" title={<span style={{ fontWeight: 700, color: TEXT }}>行业板块</span>}
            style={{ borderRadius: 8, border: `1px solid ${BORDER}` }}>
            {data.industries.length > 0 ? (
              <>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(110px, 1fr))', gap: 6 }}>
                  {data.industries.map((ind: any) => {
                    const cp = ind.avg_change_percent || 0;
                    return (
                      <div key={ind.industry} style={{
                        background: getSectorColor(cp), color: getSectorText(cp),
                        padding: '10px 8px', borderRadius: 8, textAlign: 'center',
                        cursor: 'pointer', transition: 'transform .15s',
                      }}
                        onClick={() => navigate(`/discover?focus=${encodeURIComponent(ind.industry)}`)}
                        onMouseEnter={e => (e.currentTarget.style.transform = 'scale(1.04)')}
                        onMouseLeave={e => (e.currentTarget.style.transform = 'scale(1)')}>
                        <div style={{ fontSize: 12, fontWeight: 500, marginBottom: 2 }}>{ind.industry}</div>
                        <div style={{ fontSize: 15, fontWeight: 700, fontFamily: 'monospace' }}>
                          {cp >= 0 ? '+' : ''}{cp.toFixed(2)}%
                        </div>
                        <div style={{ fontSize: 10, opacity: 0.8, marginTop: 2 }}>{ind.stock_count}只</div>
                      </div>
                    );
                  })}
                </div>
                <div style={{ marginTop: 12, display: 'flex', justifyContent: 'space-between', fontSize: 12, color: TEXT_SEC }}>
                  <span>上涨板块: <span style={{ color: COLOR_UP, fontWeight: 600 }}>{data.sectorCounts.up}</span></span>
                  <span>下跌板块: <span style={{ color: COLOR_DOWN, fontWeight: 600 }}>{data.sectorCounts.down}</span></span>
                  <span>共 {data.sectorCounts.total} 个板块</span>
                </div>
              </>
            ) : <div style={{ textAlign: 'center', padding: 40, color: TEXT_SEC }}>计算中...加载股票数据后自动生成行业板块</div>}
          </Card>
        </Col>

        {/* Sector Ranking */}
        <Col xs={24} lg={10}>
          <Card size="small" title={<span style={{ fontWeight: 700, color: TEXT }}>板块排行</span>}
            style={{ borderRadius: 8, border: `1px solid ${BORDER}` }}>
            {data.industries.length > 0 ? (
              <div style={{ maxHeight: 400, overflowY: 'auto' }}>
                {[...data.industries].sort((a: any, b: any) => (b.avg_change_percent || 0) - (a.avg_change_percent || 0)).map((ind: any, i: number) => (
                  <div key={ind.industry} style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    padding: '8px 4px', borderBottom: i < data.industries.length - 1 ? `1px solid ${BORDER}` : 'none', fontSize: 13,
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 1 }}>
                      <span style={{
                        width: 22, height: 22, borderRadius: '50%',
                        background: i < 3 ? COLOR_UP : i >= data.industries.length - 3 ? COLOR_DOWN : '#e5e5e5',
                        color: (i < 3 || i >= data.industries.length - 3) ? '#fff' : '#666',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontSize: 11, fontWeight: 600, flexShrink: 0,
                      }}>{i + 1}</span>
                      <span style={{ fontWeight: 500, color: TEXT }}>{ind.industry}</span>
                      <Tag style={{ fontSize: 10 }}>{ind.stock_count}只</Tag>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <Progress percent={Math.min(Math.abs(ind.avg_change_percent || 0) * 20, 100)}
                        showInfo={false} strokeColor={(ind.avg_change_percent || 0) >= 0 ? COLOR_UP : COLOR_DOWN}
                        size="small" style={{ width: 50 }} />
                      <span style={{ fontWeight: 700, fontFamily: 'monospace', color: (ind.avg_change_percent || 0) >= 0 ? COLOR_UP : COLOR_DOWN, minWidth: 60, textAlign: 'right' }}>
                        {(ind.avg_change_percent || 0) >= 0 ? '+' : ''}{(ind.avg_change_percent || 0).toFixed(2)}%
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            ) : <div style={{ textAlign: 'center', padding: 40, color: TEXT_SEC }}>暂无数据</div>}
          </Card>
        </Col>
      </Row>
    </div>
  );
};

export default MarketAnalysisPage;
