/**
 * 自选股面板 v4 — 简化UI + 每分组快速添加 + 实时行情 + 现代交互
 */
import React, { useState, useCallback, useEffect, useRef } from 'react';
import {
  Table, Button, Input, Modal, message, Tag, Space, Typography,
  Popconfirm, Card, Empty, List,
} from 'antd';
import {
  PlusOutlined, SearchOutlined,
  FolderOutlined, StarFilled,
  CloseOutlined, ReloadOutlined,
} from '@ant-design/icons';
import { apiFetch } from '../../utils/api';
import type { ColumnsType } from 'antd/es/table';

const { Text } = Typography;
const STORAGE_KEY = 'astock_watchlist_v2';
const COLOR_UP = '#cf2a2a';
const COLOR_DOWN = '#1db468';

interface WatchlistGroup { id: string; name: string; stocks: WatchlistStock[]; isDefault?: boolean; }
interface WatchlistStock { symbol: string; name: string; market: string; sortIndex: number; groupId: string; }
interface StockQuote { symbol: string; name: string; price: number; changePercent: number; change: number; }

const WatchlistPanel: React.FC<{ onStockClick?: (symbol: string) => void }> = React.memo(({ onStockClick }) => {
  const [groups, setGroups] = useState<WatchlistGroup[]>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) return JSON.parse(saved);
    } catch (e) {
      // ignore parse error
    }
    return [{ id: 'default', name: '默认分组', stocks: [], isDefault: true }];
  });
  const [activeGroup, setActiveGroup] = useState('default');
  const [addModalOpen, setAddModalOpen] = useState(false);
  const [quotes, setQuotes] = useState<Record<string, StockQuote>>({});
  const [quotesLoading, setQuotesLoading] = useState(false);
  const fetchTimer = useRef<ReturnType<typeof setTimeout>>();
  const [alerts, setAlerts] = useState<any[]>([]);

  // 持久化
  useEffect(() => { localStorage.setItem(STORAGE_KEY, JSON.stringify(groups)); }, [groups]);

  // 实时行情
  const currentGroup = groups.find(g => g.id === activeGroup) || groups[0];
  const symbols = currentGroup.stocks.map(s => s.symbol);

  const fetchQuotes = useCallback(async () => {
    if (symbols.length === 0) { setQuotes({}); return; }
    setQuotesLoading(true);
    try {
      const resp = await apiFetch('/api/stocks/batch/quotes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ symbols }),
      });
      const data = await resp.json();
      const map: Record<string, StockQuote> = {};
      if (data.success && data.data?.stocks) {
        for (const s of data.data.stocks) {
          const q = s.latestQuote || s;
          map[s.symbol] = {
            symbol: s.symbol,
            name: s.name,
            price: q.closePrice ?? q.price ?? 0,
            changePercent: q.changePercent ?? 0,
            change: q.change ?? 0,
          };
        }
      }
      setQuotes(map);
    } catch (e) {
      // ignore fetch error
    } finally { setQuotesLoading(false); }
  }, [symbols.join(',')]);

  useEffect(() => { fetchQuotes(); }, [fetchQuotes]);

  // 异动提醒
  useEffect(() => {
    if (symbols.length === 0) { setAlerts([]); return; }
    fetch(`/api/alerts?symbols=${symbols.join(',')}`)
      .then(r => r.json())
      .then(d => setAlerts(d.data || []))
      .catch(() => {});
  }, [symbols.join(',')]);

  // 定时刷新(30秒)
  useEffect(() => {
    fetchTimer.current = setInterval(fetchQuotes, 30000);
    return () => clearInterval(fetchTimer.current);
  }, [fetchQuotes]);

  // 添加自选股
  const handleAddStock = useCallback((symbol: string, name: string, market: string) => {
    setGroups(prev => prev.map(g => {
      if (g.id !== activeGroup) return g;
      if (g.stocks.find(s => s.symbol === symbol)) {
        message.warning(`${symbol} 已在列表中`);
        return g;
      }
      const newStock: WatchlistStock = { symbol, name, market, sortIndex: g.stocks.length, groupId: activeGroup };
      return { ...g, stocks: [...g.stocks, newStock] };
    }));
    message.success(`${symbol} 已添加`);
  }, [activeGroup]);

  const handleRemoveStock = useCallback((symbol: string) => {
    setGroups(prev => prev.map(g => ({ ...g, stocks: g.stocks.filter(s => s.symbol !== symbol) })));
    setQuotes(prev => { const n = { ...prev }; delete n[symbol]; return n; });
  }, []);

  const handleCreateGroup = () => {
    const name = prompt('新分组名称');
    if (!name?.trim()) return;
    const id = `g_${Date.now()}`;
    setGroups(prev => [...prev, { id, name: name.trim(), stocks: [] }]);
    setActiveGroup(id);
  };

  const handleDeleteGroup = (groupId: string) => {
    setGroups(prev => {
      const group = prev.find(g => g.id === groupId);
      if (group?.isDefault) { message.warning('默认分组不能删除'); return prev; }
      const stocks = group?.stocks || [];
      return prev.filter(g => g.id !== groupId).map(g =>
        g.id === 'default' ? { ...g, stocks: [...g.stocks, ...stocks.map(s => ({ ...s, groupId: 'default' }))] } : g
      );
    });
    if (activeGroup === groupId) setActiveGroup('default');
  };

  const handleRenameGroup = (groupId: string, currentName: string) => {
    const name = prompt('重命名分组', currentName);
    if (!name?.trim()) return;
    setGroups(prev => prev.map(g => g.id === groupId ? { ...g, name: name.trim() } : g));
  };

  const columns: ColumnsType<WatchlistStock> = [
    { title: '代码', dataIndex: 'symbol', width: 100,
      render: (s: string) => <Text strong style={{ cursor: 'pointer', color: '#3b82f6', fontFamily: 'monospace' }}
        onClick={() => onStockClick?.(s)}>{s.replace(/\.(SH|SZ)$/, '')}</Text> },
    { title: '名称', dataIndex: 'name', width: 100,
      render: (n: string, r: WatchlistStock) => <Text style={{ cursor: 'pointer' }} onClick={() => onStockClick?.(r.symbol)}>{n}</Text> },
    { title: '最新价', width: 90, align: 'right' as const,
      render: (_: unknown, r: WatchlistStock) => {
        const q = quotes[r.symbol];
        if (!q) return <Text type="secondary" style={{ fontSize: 12 }}>—</Text>;
        return <span style={{ fontFamily: 'monospace', fontWeight: 600, color: q.changePercent >= 0 ? COLOR_UP : COLOR_DOWN }}>
          ¥{q.price.toFixed(2)}</span>;
      }},
    { title: '涨跌幅', width: 85, align: 'right' as const,
      render: (_: unknown, r: WatchlistStock) => {
        const q = quotes[r.symbol];
        if (!q) return <Text type="secondary" style={{ fontSize: 12 }}>—</Text>;
        return <span style={{ fontFamily: 'monospace', fontWeight: 600, color: q.changePercent >= 0 ? COLOR_UP : COLOR_DOWN, fontSize: 13 }}>
          {q.changePercent >= 0 ? '+' : ''}{q.changePercent.toFixed(2)}%</span>;
      }},
    { title: '', width: 40,
      render: (_: unknown, r: WatchlistStock) =>
        <Popconfirm title="确定移除？" onConfirm={() => handleRemoveStock(r.symbol)}>
          <Button type="text" danger size="small" icon={<CloseOutlined />} />
        </Popconfirm> },
  ];

  const totalCount = groups.reduce((s, g) => s + g.stocks.length, 0);

  return (
    <Card
      title={<Space><StarFilled style={{ color: '#f59e0b', fontSize: 16 }} /><span style={{ fontWeight: 600 }}>自选股</span><Tag color="blue" style={{ marginLeft: 4 }}>{totalCount}</Tag></Space>}
      extra={<Space>
        <Button size="small" icon={<ReloadOutlined spin={quotesLoading} />} onClick={fetchQuotes} disabled={symbols.length === 0}>刷新</Button>
        <Button size="small" type="primary" icon={<PlusOutlined />} onClick={() => setAddModalOpen(true)}>添加股票</Button>
      </Space>}
      style={{ borderRadius: 10, border: '1px solid #e8e8e8', marginBottom: 16 }}
      styles={{ body: { padding: '10px 16px' } }}
    >
      {/* 异动提醒 */}
      {alerts.length > 0 && (
        <div style={{ background: '#fff7e6', border: '1px solid #ffd591', borderRadius: 6, padding: '8px 12px', marginBottom: 10 }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: '#d46b08', marginBottom: 6 }}>⚠️ 异动提醒</div>
          {alerts.map(stock => stock.alerts.map((a: any, i: number) => (
            <div key={`${stock.symbol}-${i}`} style={{ fontSize: 12, marginBottom: 3, display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ fontWeight: 600, color: '#d46b08', fontFamily: 'monospace', cursor: 'pointer' }}
                onClick={() => onStockClick?.(stock.symbol)}>{stock.name}</span>
              <Tag color={a.level === 'critical' ? 'red' : a.level === 'warning' ? 'orange' : 'blue'} 
                style={{ fontSize: 10, lineHeight: '16px', padding: '0 4px', margin: 0 }}>
                {a.type === 'limit_move' ? '涨跌停' : a.type === 'big_move' ? '大幅波动' : a.type === 'volume_spike' ? '放量' : '异动'}
              </Tag>
              <span style={{ color: '#555' }}>{a.message}</span>
            </div>
          )))}
        </div>
      )}
      {/* 分组标签栏 — 每分组带加号按钮 */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 12, flexWrap: 'wrap', alignItems: 'center' }}>
        {groups.map(g => (
          <div key={g.id}
            onClick={() => setActiveGroup(g.id)}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 4,
              background: activeGroup === g.id ? '#3b82f6' : '#f0f0f0',
              color: activeGroup === g.id ? '#fff' : '#555',
              padding: '3px 4px 3px 10px', borderRadius: 8,
              cursor: 'pointer', fontSize: 13, fontWeight: activeGroup === g.id ? 600 : 400,
              transition: 'all .12s', userSelect: 'none',
            }}>
            <FolderOutlined style={{ fontSize: 13 }} />
            <span onDoubleClick={(e) => { e.stopPropagation(); handleRenameGroup(g.id, g.name); }}>
              {g.name}
            </span>
            <Tag style={{ margin: 0, fontSize: 11, lineHeight: '16px', padding: '0 5px', background: activeGroup === g.id ? 'rgba(255,255,255,0.25)' : '#d9d9d9', color: activeGroup === g.id ? '#fff' : '#666', border: 'none' }}>
              {g.stocks.length}
            </Tag>
            {/* 每分组添加按钮 */}
            <Button type="text" size="small" icon={<PlusOutlined />}
              style={{ color: activeGroup === g.id ? '#fff' : '#999', minWidth: 24, height: 24, padding: 0, fontSize: 12 }}
              onClick={(e) => { e.stopPropagation(); setActiveGroup(g.id); setAddModalOpen(true); }} />
            {/* 删除非默认分组 */}
            {!g.isDefault && (
              <Button type="text" size="small" icon={<CloseOutlined />}
                style={{ color: activeGroup === g.id ? 'rgba(255,255,255,0.7)' : '#bbb', minWidth: 20, height: 24, padding: 0, fontSize: 10 }}
                onClick={(e) => { e.stopPropagation(); handleDeleteGroup(g.id); }} />
            )}
          </div>
        ))}
        <Button type="dashed" size="small" icon={<PlusOutlined />} style={{ borderRadius: 6, fontSize: 12 }} onClick={handleCreateGroup}>
          新分组
        </Button>
      </div>

      {/* 股票列表 */}
      <Table dataSource={currentGroup.stocks} columns={columns} rowKey="symbol" size="middle"
        pagination={false} locale={{ emptyText: <Empty description="点击 + 添加自选股" image={Empty.PRESENTED_IMAGE_SIMPLE} /> }}
        loading={quotesLoading && symbols.length > 0}
        scroll={{ y: 400 }}
        onRow={r => ({ style: { cursor: 'pointer' }, onClick: () => onStockClick?.(r.symbol) })} />

      <AddStockModal open={addModalOpen} onClose={() => setAddModalOpen(false)} onAdd={handleAddStock} />
    </Card>
  );
});

// ============ 搜索弹窗 ============

const AddStockModal: React.FC<{
  open: boolean; onClose: () => void;
  onAdd: (symbol: string, name: string, market: string) => void;
}> = ({ open, onClose, onAdd }) => {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<{ symbol: string; name: string; market?: string; industry?: string }[]>([]);
  const [searching, setSearching] = useState(false);

  const doSearch = useCallback(async (q: string) => {
    if (!q.trim()) { setResults([]); return; }
    setSearching(true);
    try {
      const resp = await apiFetch(`/api/search?q=${encodeURIComponent(q)}&limit=15`);
      const data = await resp.json();
      setResults(data.success ? (data.data?.results || []) : []);
    } catch { setResults([]); }
    finally { setSearching(false); }
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => doSearch(query), 300);
    return () => clearTimeout(timer);
  }, [query, doSearch]);

  return (
    <Modal title="添加自选股" open={open} onCancel={() => { onClose(); setQuery(''); setResults([]); }} footer={null} width={460}>
      <Input prefix={<SearchOutlined />} placeholder="输入代码或名称搜索（如：茅台、601318）"
        value={query} onChange={e => setQuery(e.target.value)} onPressEnter={() => doSearch(query)}
        size="middle" allowClear autoFocus style={{ marginBottom: 12 }} />
      {searching && <div style={{ textAlign: 'center', padding: 20, color: '#999' }}>搜索中...</div>}
      {!searching && results.length > 0 && (
        <List size="small" style={{ maxHeight: 360, overflow: 'auto' }} dataSource={results}
          renderItem={item => (
            <List.Item style={{ cursor: 'pointer', padding: '8px 12px', borderRadius: 6, transition: 'background .1s' }}
              onMouseEnter={e => { e.currentTarget.style.background = '#f0f5ff'; }}
              onMouseLeave={e => { e.currentTarget.style.background = ''; }}
              onClick={() => onAdd(item.symbol, item.name, item.market || '')}>
              <div style={{ display: 'flex', justifyContent: 'space-between', width: '100%', alignItems: 'center' }}>
                <Space>
                  <Text strong style={{ fontFamily: 'monospace', color: '#3b82f6' }}>
                    {item.symbol.replace(/\.(SH|SZ)$/, '')}
                  </Text>
                  <Text>{item.name}</Text>
                  {item.industry && <Tag style={{ fontSize: 11, margin: 0 }} color="geekblue">{item.industry}</Tag>}
                </Space>
                <Tag color={item.market === 'SH' ? 'blue' : 'green'} style={{ borderRadius: 4 }}>
                  {item.market === 'SH' ? '沪市' : item.market === 'SZ' ? '深市' : item.market || '—'}
                </Tag>
              </div>
            </List.Item>
          )} />
      )}
      {!searching && query && results.length === 0 && <Empty description="未找到匹配的股票" />}
      {!query && <Empty description="输入代码或名称开始搜索" image={Empty.PRESENTED_IMAGE_SIMPLE} />}
    </Modal>
  );
};

export default WatchlistPanel;
