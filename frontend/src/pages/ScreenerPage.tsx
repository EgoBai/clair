/**
 * 股票筛选器 v3 — 5核心预设 + 真实API行情 + 简洁现代
 */
import React, { useState, useMemo, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { apiFetch } from '../utils/api';
import { Card, Button, Tag, Table, Spin, Empty, Typography, InputNumber, message, Badge, Space, Segmented } from 'antd';
import {
  RiseOutlined, FallOutlined, FireOutlined, ThunderboltOutlined,
  DollarOutlined, ReloadOutlined, SearchOutlined,
} from '@ant-design/icons';

const { Title, Text } = Typography;
const COLOR_UP = '#cf2a2a';
const COLOR_DOWN = '#1db468';

interface StockData {
  symbol: string; name: string; price: number; changePercent: number;
  volume: string; marketCap: string; industry?: string; change: number;
}

interface Preset {
  id: string; name: string; icon: React.ReactNode; color: string;
  filter: (s: StockData) => boolean;
  sortKey: keyof StockData; sortDir: 'asc' | 'desc';
}

const PRESETS: Preset[] = [
  { id: 'hot', name: '今日热门', icon: <FireOutlined />, color: '#ef4444',
    filter: s => s.changePercent > 3, sortKey: 'changePercent', sortDir: 'desc' },
  { id: 'gainers', name: '涨幅榜', icon: <RiseOutlined />, color: '#ef4444',
    filter: s => s.changePercent > 0, sortKey: 'changePercent', sortDir: 'desc' },
  { id: 'losers', name: '跌幅榜', icon: <FallOutlined />, color: '#22c55e',
    filter: s => s.changePercent < 0, sortKey: 'changePercent', sortDir: 'asc' },
  { id: 'value', name: '价值洼地', icon: <DollarOutlined />, color: '#3b82f6',
    filter: s => s.price > 0 && s.price < 50 && s.changePercent < 2 && s.changePercent > -5,
    sortKey: 'price', sortDir: 'asc' },
  { id: 'limit_up', name: '涨停板', icon: <ThunderboltOutlined />, color: '#dc2626',
    filter: s => s.changePercent >= 9, sortKey: 'changePercent', sortDir: 'desc' },
];

const ScreenerPage: React.FC = () => {
  const navigate = useNavigate();
  const [stocks, setStocks] = useState<StockData[]>([]);
  const [loading, setLoading] = useState(true);
  const [activePreset, setActivePreset] = useState('hot');
  const [minPrice, setMinPrice] = useState<number | null>(null);
  const [maxPrice, setMaxPrice] = useState<number | null>(null);
  const [minChange, setMinChange] = useState<number | null>(null);
  const [maxChange, setMaxChange] = useState<number | null>(null);
  const [searchText, setSearchText] = useState('');
  const [page, setPage] = useState(1);
  const pageSize = 20;

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      // 获取股票列表 + 批量行情
      const [listResp, quotesResp] = await Promise.all([
        apiFetch('/api/stocks?limit=120').then(r => r.json()),
        apiFetch('/api/stocks/batch/quotes', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ symbols: [] }), // 空数组拿全部
        }).then(r => r.json()),
      ]);

      const apiStocks = listResp?.data?.stocks || [];
      const quotesData = quotesResp?.data?.stocks || [];
      const quoteMap: Record<string, any> = {};
      for (const q of quotesData) quoteMap[q.symbol] = q;

      const merged: StockData[] = apiStocks.map((s: any) => {
        const q = quoteMap[s.symbol]?.latestQuote || {};
        return {
          symbol: s.symbol,
          name: s.name,
          price: q.closePrice ?? q.price ?? s.price ?? 0,
          change: q.change ?? 0,
          changePercent: q.changePercent ?? 0,
          volume: q.volume ? (q.volume / 1e8).toFixed(1) + '亿' : (s.volume || '—'),
          marketCap: q.marketCap ? (q.marketCap / 1e8).toFixed(0) + '亿' : (s.marketCap || '—'),
          industry: s.industry || '—',
        };
      });
      setStocks(merged);
    } catch (e) {
      console.warn('筛选器数据加载失败:', e);
      message.warning('数据加载失败，请稍后重试');
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  // 定时刷新(60秒)
  useEffect(() => {
    const timer = setInterval(fetchData, 60000);
    return () => clearInterval(timer);
  }, [fetchData]);

  const preset = PRESETS.find(p => p.id === activePreset) || PRESETS[0];

  const filtered = useMemo(() => {
    let result = stocks.filter(preset.filter);

    if (minPrice != null) result = result.filter(s => s.price >= minPrice);
    if (maxPrice != null) result = result.filter(s => s.price <= maxPrice);
    if (minChange != null) result = result.filter(s => s.changePercent >= minChange);
    if (maxChange != null) result = result.filter(s => s.changePercent <= maxChange);
    if (searchText) {
      const q = searchText.toLowerCase();
      result = result.filter(s => s.symbol.toLowerCase().includes(q) || s.name.includes(q));
    }

    result.sort((a, b) => {
      const av = a[preset.sortKey] as number, bv = b[preset.sortKey] as number;
      return preset.sortDir === 'desc' ? bv - av : av - bv;
    });
    return result;
  }, [stocks, activePreset, minPrice, maxPrice, minChange, maxChange, searchText, preset]);

  const paged = filtered.slice((page - 1) * pageSize, page * pageSize);

  const columns = [
    { title: '#', width: 45, render: (_: unknown, __: unknown, i: number) => (
      <span style={{ color: i < 3 ? '#f59e0b' : '#999', fontWeight: 700, fontSize: 13 }}>
        {(page - 1) * pageSize + i + 1}
      </span>
    )},
    { title: '代码', dataIndex: 'symbol', width: 95, render: (v: string) => (
      <Button type="link" size="small" style={{ fontFamily: 'monospace', fontWeight: 600, padding: 0 }}
        onClick={() => navigate(`/stocks/${v}`)}>{v.replace(/\.(SH|SZ)$/, '')}</Button>
    )},
    { title: '名称', dataIndex: 'name', ellipsis: true, render: (v: string, r: StockData) => (
      <Text style={{ cursor: 'pointer' }} onClick={() => navigate(`/stocks/${r.symbol}`)}>{v}</Text>
    )},
    { title: '行业', dataIndex: 'industry', width: 80, render: (v: string) => (
      <Tag color="geekblue" style={{ fontSize: 11, margin: 0, borderRadius: 4 }}>{v}</Tag>
    )},
    { title: '最新价', dataIndex: 'price', width: 85, align: 'right' as const,
      render: (v: number) => <span style={{ fontFamily: 'monospace', fontWeight: 600 }}>¥{v.toFixed(2)}</span> },
    { title: '涨跌幅', dataIndex: 'changePercent', width: 85, align: 'right' as const,
      render: (v: number) => (
        <span style={{ fontFamily: 'monospace', fontWeight: 700, color: v >= 0 ? COLOR_UP : COLOR_DOWN, fontSize: 13 }}>
          {v >= 0 ? '+' : ''}{v.toFixed(2)}%
        </span>
      )},
    { title: '成交量', dataIndex: 'volume', width: 80, align: 'right' as const,
      render: (v: string) => <Text type="secondary" style={{ fontSize: 12 }}>{v}</Text> },
  ];

  return (
    <div style={{ padding: '16px 24px', maxWidth: 1400, margin: '0 auto', background: '#f5f6f8', minHeight: '100vh' }}>
      {/* 头部 */}
      <div style={{ marginBottom: 14, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <Title level={4} style={{ margin: 0, color: '#1a1a1a' }}>
            <SearchOutlined style={{ marginRight: 8, color: '#3b82f6' }} />股票筛选
          </Title>
          <Text type="secondary" style={{ fontSize: 12 }}>选择筛选策略，一键锁定目标标的</Text>
        </div>
        <Button icon={<ReloadOutlined spin={loading} />} onClick={fetchData} size="small">刷新数据</Button>
      </div>

      {/* 预设标签 — 用 Segmented 更简洁 */}
      <Segmented
        value={activePreset}
        onChange={(v) => { setActivePreset(v as string); setPage(1); }}
        options={PRESETS.map(p => ({
          value: p.id,
          label: <Space size={4}>{p.icon}<span>{p.name}</span></Space>,
        }))}
        style={{ marginBottom: 14, background: '#fff', padding: 3 }}
      />

      {/* 高级筛选栏 — 折叠式 */}
      <Card size="small" style={{ marginBottom: 12, borderRadius: 10, border: '1px solid #e8e8e8' }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
          <Text strong style={{ fontSize: 12, marginRight: 2 }}>价格:</Text>
          <InputNumber placeholder="最低" value={minPrice} onChange={v => { setMinPrice(v); setPage(1); }}
            size="small" style={{ width: 85 }} prefix="¥" />
          <Text type="secondary">—</Text>
          <InputNumber placeholder="最高" value={maxPrice} onChange={v => { setMaxPrice(v); setPage(1); }}
            size="small" style={{ width: 85 }} prefix="¥" />
          <Text strong style={{ fontSize: 12, marginLeft: 8, marginRight: 2 }}>涨幅:</Text>
          <InputNumber placeholder="最低%" value={minChange} onChange={v => { setMinChange(v); setPage(1); }}
            size="small" style={{ width: 85 }} />
          <Text type="secondary">—</Text>
          <InputNumber placeholder="最高%" value={maxChange} onChange={v => { setMaxChange(v); setPage(1); }}
            size="small" style={{ width: 85 }} />
          <div style={{ flex: 1, minWidth: 180 }}>
            <input placeholder="搜索代码/名称..." value={searchText}
              onChange={e => { setSearchText(e.target.value); setPage(1); }}
              style={{ width: '100%', padding: '4px 10px', border: '1px solid #d9d9d9', borderRadius: 6, fontSize: 13, outline: 'none' }} />
          </div>
          <Button size="small"
            onClick={() => { setMinPrice(null); setMaxPrice(null); setMinChange(null); setMaxChange(null); setSearchText(''); setPage(1); }}>
            重置
          </Button>
        </div>
      </Card>

      {/* 结果 */}
      <Card style={{ borderRadius: 10, border: '1px solid #e8e8e8' }} styles={{ body: { padding: '10px 16px' } }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
          <Space>
            <Badge count={filtered.length} style={{ backgroundColor: preset.color }} />
            <Text type="secondary" style={{ fontSize: 13 }}>
              <span style={{ fontWeight: 600, color: preset.color, marginRight: 4 }}>{preset.name}</span>只匹配
            </Text>
          </Space>
        </div>
        <Table columns={columns} dataSource={paged} rowKey="symbol" size="middle"
          loading={loading}
          pagination={{ current: page, pageSize, total: filtered.length, onChange: setPage, showTotal: t => `共 ${t} 只`, showSizeChanger: false }}
          scroll={{ x: 650 }} locale={{ emptyText: <Empty description="没有符合条件的股票" /> }}
          onRow={r => ({ style: { cursor: 'pointer' }, onClick: () => navigate(`/stocks/${r.symbol}`) })} />
      </Card>
    </div>
  );
};

export default ScreenerPage;
