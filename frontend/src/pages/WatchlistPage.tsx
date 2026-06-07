/**
 * 📊 追踪中心 — Tracking Center
 * 全功能自选股追踪页面：分组管理 + 实时行情 + 异动提醒 + AI总结 + 策略信号
 */

import React, { useState, useCallback, useEffect, useRef, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Table, Button, Input, Modal, message, Tag, Space, Typography,
  Popconfirm, Empty, Card, Row, Col, Statistic, Badge, Tooltip, Spin,
} from 'antd';
import {
  PlusOutlined, SearchOutlined, FolderOutlined, StarFilled,
  CloseOutlined, ReloadOutlined, LineChartOutlined, EyeOutlined,
  DeleteOutlined, BellOutlined, AlertOutlined, RobotOutlined,
  HomeOutlined, ArrowUpOutlined, ArrowDownOutlined, MinusOutlined,
  InfoCircleOutlined, ThunderboltOutlined,
} from '@ant-design/icons';
import { apiFetch } from '../utils/api';
import type { ColumnsType } from 'antd/es/table';

/* ─── Theme Constants ─── */
const BG = '#0f1419';
const CARD_BG = '#1a2332';
const CARD_BORDER = '#2a3a4a';
const TEXT = '#e0e0e0';
const TEXT_SEC = '#8899aa';
const COLOR_UP = '#cf2a2a';
const COLOR_DOWN = '#1db468';
const ACCENT = '#3b82f6';
const GOLD = '#f59e0b';
const STORAGE_KEY = 'astock_watchlist_v2';

const { Text, Title, Paragraph } = Typography;

/* ─── Interfaces ─── */
interface WatchlistGroup {
  id: string;
  name: string;
  stocks: WatchlistStock[];
  isDefault?: boolean;
}

interface WatchlistStock {
  symbol: string;
  name: string;
  market: string;
  sortIndex: number;
  groupId: string;
}

interface StockQuote {
  symbol: string;
  name: string;
  price: number;
  changePercent: number;
  change: number;
  volume?: number;
  turnoverRate?: number;
  industry?: string;
}

interface AlertItem {
  symbol: string;
  name: string;
  alerts: Array<{
    type: string;
    level: string;
    message: string;
  }>;
}

interface StrategySignal {
  signal: 'buy' | 'sell' | 'hold';
  score: number;
}

/* ─── Helper: default groups ─── */
function getDefaultGroups(): WatchlistGroup[] {
  return [{ id: 'default', name: '默认分组', stocks: [], isDefault: true }];
}

/* ─── Sub-Component: AddStockModal ─── */
const AddStockModal: React.FC<{
  open: boolean;
  onClose: () => void;
  onAdd: (symbol: string, name: string, market: string) => void;
}> = ({ open, onClose, onAdd }) => {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<Array<{
    symbol: string;
    name: string;
    market?: string;
    industry?: string;
  }>>([]);
  const [searching, setSearching] = useState(false);

  const doSearch = useCallback(async (q: string) => {
    if (!q.trim()) { setResults([]); return; }
    setSearching(true);
    try {
      const resp = await apiFetch(`/api/search?q=${encodeURIComponent(q)}&limit=15`);
      const data = await resp.json();
      setResults(data.success ? (data.data?.results || []) : []);
    } catch {
      setResults([]);
    } finally {
      setSearching(false);
    }
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => doSearch(query), 300);
    return () => clearTimeout(timer);
  }, [query, doSearch]);

  const handleClose = () => {
    onClose();
    setQuery('');
    setResults([]);
  };

  return (
    <Modal
      title="🔍 添加自选股"
      open={open}
      onCancel={handleClose}
      footer={null}
      width={500}
      styles={{
        content: { background: CARD_BG, border: `1px solid ${CARD_BORDER}` },
        header: { background: CARD_BG, borderBottom: `1px solid ${CARD_BORDER}` },
      }}
    >
      <Input
        prefix={<SearchOutlined style={{ color: TEXT_SEC }} />}
        placeholder="输入代码或名称搜索（如：茅台、601318）"
        value={query}
        onChange={e => setQuery(e.target.value)}
        onPressEnter={() => doSearch(query)}
        size="middle"
        allowClear
        autoFocus
        style={{
          marginBottom: 12,
          background: '#0f1419',
          border: `1px solid ${CARD_BORDER}`,
          color: TEXT,
        }}
      />
      {searching && (
        <div style={{ textAlign: 'center', padding: 20, color: TEXT_SEC }}>
          <Spin size="small" /> 搜索中...
        </div>
      )}
      {!searching && results.length > 0 && (
        <div style={{ maxHeight: 360, overflow: 'auto' }}>
          {results.map(item => (
            <div
              key={item.symbol}
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                padding: '10px 12px',
                borderRadius: 8,
                cursor: 'pointer',
                transition: 'background .15s',
                borderBottom: `1px solid ${CARD_BORDER}`,
              }}
              onMouseEnter={e => { e.currentTarget.style.background = '#1e2d3d'; }}
              onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}
              onClick={() => onAdd(item.symbol, item.name, item.market || '')}
            >
              <Space>
                <Text strong style={{ fontFamily: 'monospace', color: ACCENT }}>
                  {item.symbol.replace(/\.(SH|SZ)$/, '')}
                </Text>
                <Text style={{ color: TEXT }}>{item.name}</Text>
                {item.industry && (
                  <Tag style={{ fontSize: 11, margin: 0, background: '#1e3a5f', color: ACCENT, border: 'none' }}>
                    {item.industry}
                  </Tag>
                )}
              </Space>
              <Tag
                color={item.market === 'SH' ? 'blue' : item.market === 'SZ' ? 'green' : 'default'}
                style={{ borderRadius: 4 }}
              >
                {item.market === 'SH' ? '沪市' : item.market === 'SZ' ? '深市' : item.market || '—'}
              </Tag>
            </div>
          ))}
        </div>
      )}
      {!searching && query && results.length === 0 && (
        <Empty description={<span style={{ color: TEXT_SEC }}>未找到匹配的股票</span>} />
      )}
      {!query && (
        <Empty
          description={<span style={{ color: TEXT_SEC }}>输入代码或名称开始搜索</span>}
          image={Empty.PRESENTED_IMAGE_SIMPLE}
        />
      )}
    </Modal>
  );
};

/* ─── Sub-Component: CreateGroupModal ─── */
const CreateGroupModal: React.FC<{
  open: boolean;
  onClose: () => void;
  onCreate: (name: string) => void;
}> = ({ open, onClose, onCreate }) => {
  const [name, setName] = useState('');

  const handleOk = () => {
    if (name.trim()) {
      onCreate(name.trim());
      setName('');
      onClose();
    }
  };

  return (
    <Modal
      title="📁 新建分组"
      open={open}
      onCancel={() => { onClose(); setName(''); }}
      onOk={handleOk}
      okText="创建"
      okButtonProps={{ disabled: !name.trim() }}
      styles={{
        content: { background: CARD_BG, border: `1px solid ${CARD_BORDER}` },
        header: { background: CARD_BG, borderBottom: `1px solid ${CARD_BORDER}` },
      }}
    >
      <Input
        placeholder="请输入分组名称"
        value={name}
        onChange={e => setName(e.target.value)}
        onPressEnter={handleOk}
        autoFocus
        style={{
          marginTop: 12,
          background: '#0f1419',
          border: `1px solid ${CARD_BORDER}`,
          color: TEXT,
        }}
      />
    </Modal>
  );
};

/* ─── Main Component ─── */
const WatchlistPage: React.FC = () => {
  const navigate = useNavigate();

  /* State */
  const [groups, setGroups] = useState<WatchlistGroup[]>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) return JSON.parse(saved);
    } catch { /* ignore */ }
    return getDefaultGroups();
  });
  const [activeGroup, setActiveGroup] = useState('default');
  const [addModalOpen, setAddModalOpen] = useState(false);
  const [createGroupModalOpen, setCreateGroupModalOpen] = useState(false);
  const [quotes, setQuotes] = useState<Record<string, StockQuote>>({});
  const [quotesLoading, setQuotesLoading] = useState(false);
  const [alerts, setAlerts] = useState<AlertItem[]>([]);
  const [alertsLoading, setAlertsLoading] = useState(false);
  const [signals, setSignals] = useState<Record<string, StrategySignal>>({});
  const [lastRefresh, setLastRefresh] = useState<Date>(new Date());
  const [aiSummary, setAiSummary] = useState<string>('');
  const [aiSummaryLoading, setAiSummaryLoading] = useState(false);

  const fetchTimerRef = useRef<ReturnType<typeof setInterval>>();
  const refreshIconRef = useRef<HTMLDivElement>(null);

  /* Derived state */
  const currentGroup = useMemo(
    () => groups.find(g => g.id === activeGroup) || groups[0],
    [groups, activeGroup],
  );
  const symbols = useMemo(() => currentGroup.stocks.map(s => s.symbol), [currentGroup]);
  const totalCount = useMemo(() => groups.reduce((s, g) => s + g.stocks.length, 0), [groups]);

  /* ─── Stats ─── */
  const stats = useMemo(() => {
    const qValues = Object.values(quotes);
    const avgChange = qValues.length > 0
      ? qValues.reduce((s, q) => s + q.changePercent, 0) / qValues.length
      : 0;
    const alertCount = alerts.reduce((s, a) => s + a.alerts.length, 0);
    return { total: symbols.length, avgChange, alertCount };
  }, [quotes, alerts, symbols.length]);

  /* ─── Persist groups ─── */
  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(groups));
  }, [groups]);

  /* ─── Fetch quotes ─── */
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
            volume: q.volume,
            turnoverRate: q.turnoverRate,
            industry: q.industry || s.industry,
          };
        }
      }
      setQuotes(map);
      setLastRefresh(new Date());
    } catch {
      // silent fail
    } finally {
      setQuotesLoading(false);
    }
  }, [symbols.join(',')]);

  /* ─── Fetch alerts ─── */
  const fetchAlerts = useCallback(async () => {
    if (symbols.length === 0) { setAlerts([]); return; }
    setAlertsLoading(true);
    try {
      const resp = await apiFetch(`/api/alerts?symbols=${symbols.join(',')}`);
      const data = await resp.json();
      setAlerts(data.data || []);
    } catch {
      setAlerts([]);
    } finally {
      setAlertsLoading(false);
    }
  }, [symbols.join(',')]);

  /* ─── Fetch strategy signals ─── */
  const fetchSignals = useCallback(async () => {
    if (symbols.length === 0) { setSignals({}); return; }
    const newSignals: Record<string, StrategySignal> = {};
    await Promise.allSettled(
      symbols.map(async (sym) => {
        try {
          const resp = await apiFetch(`/api/stocks/${sym}/strategy`);
          const data = await resp.json();
          if (data.success && data.data) {
            newSignals[sym] = {
              signal: data.data.signal || 'hold',
              score: data.data.score ?? 50,
            };
          }
        } catch {
          // fail silently per spec
        }
      }),
    );
    setSignals(newSignals);
  }, [symbols.join(',')]);

  /* ─── Fetch AI summary ─── */
  const fetchAiSummary = useCallback(async () => {
    if (symbols.length === 0) { setAiSummary(''); return; }
    setAiSummaryLoading(true);
    try {
      const quoteData = symbols.map(sym => {
        const q = quotes[sym];
        return {
          price: q?.price || 0,
          changePercent: q?.changePercent || 0,
          turnoverRate: q?.turnoverRate || 0,
        };
      });
      const resp = await apiFetch('/api/ai/watchlist-summary', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ symbols, quotes: quoteData }),
      });
      const data = await resp.json();
      if (data.summary) setAiSummary(data.summary);
    } catch {
      // silent fail
    } finally {
      setAiSummaryLoading(false);
    }
  }, [symbols.join(','), JSON.stringify(quotes)]);

  /* ─── Initial fetch + auto-refresh (30s) ─── */
  useEffect(() => {
    fetchQuotes();
    fetchAlerts();
    fetchSignals();

    fetchTimerRef.current = setInterval(() => {
      fetchQuotes();
      fetchAlerts();
      fetchSignals();
    }, 30000);

    return () => {
      if (fetchTimerRef.current) clearInterval(fetchTimerRef.current);
    };
  }, [fetchQuotes, fetchAlerts, fetchSignals]);

  /* ─── Fetch AI summary when quotes update ─── */
  useEffect(() => {
    if (symbols.length > 0 && Object.keys(quotes).length > 0) {
      fetchAiSummary();
    }
  }, [quotes, fetchAiSummary]);

  /* ─── Manual refresh ─── */
  const handleManualRefresh = () => {
    fetchQuotes();
    fetchAlerts();
    fetchSignals();
    message.success('已刷新');
  };

  /* ─── Group management ─── */
  const handleCreateGroup = (name: string) => {
    const id = `g_${Date.now()}`;
    setGroups(prev => [...prev, { id, name, stocks: [] }]);
    setActiveGroup(id);
    message.success(`分组「${name}」已创建`);
  };

  const handleDeleteGroup = (groupId: string) => {
    setGroups(prev => {
      const group = prev.find(g => g.id === groupId);
      if (group?.isDefault) {
        message.warning('默认分组不能删除');
        return prev;
      }
      const stocks = group?.stocks || [];
      return prev
        .filter(g => g.id !== groupId)
        .map(g => g.id === 'default'
          ? { ...g, stocks: [...g.stocks, ...stocks.map(s => ({ ...s, groupId: 'default' })) ] }
          : g,
        );
    });
    if (activeGroup === groupId) setActiveGroup('default');
    message.info('分组已删除');
  };

  const handleRenameGroup = (groupId: string, currentName: string) => {
    const newName = prompt('重命名分组', currentName);
    if (!newName?.trim()) return;
    setGroups(prev => prev.map(g => g.id === groupId ? { ...g, name: newName.trim() } : g));
    message.success('分组已重命名');
  };

  /* ─── Stock management ─── */
  const handleAddStock = useCallback((symbol: string, name: string, market: string) => {
    setGroups(prev => prev.map(g => {
      if (g.id !== activeGroup) return g;
      if (g.stocks.find(s => s.symbol === symbol)) {
        message.warning(`${symbol} 已在列表中`);
        return g;
      }
      const newStock: WatchlistStock = {
        symbol, name, market,
        sortIndex: g.stocks.length,
        groupId: activeGroup,
      };
      return { ...g, stocks: [...g.stocks, newStock] };
    }));
    setAddModalOpen(false);
    message.success(`${name} 已添加到追踪列表`);
  }, [activeGroup]);

  const handleRemoveStock = useCallback((symbol: string, stockName: string) => {
    setGroups(prev => prev.map(g => ({
      ...g,
      stocks: g.stocks.filter(s => s.symbol !== symbol),
    })));
    setQuotes(prev => { const n = { ...prev }; delete n[symbol]; return n; });
    setSignals(prev => { const n = { ...prev }; delete n[symbol]; return n; });
    message.success(`${stockName} 已移除`);
  }, []);

  /* ─── Navigation ─── */
  const goToDetail = (symbol: string) => navigate(`/stocks/${symbol}`);
  const goToBacktest = (symbol: string, e: React.MouseEvent) => {
    e.stopPropagation();
    navigate(`/backtest?symbol=${symbol}`);
  };

  /* ─── Table columns ─── */
  const columns: ColumnsType<WatchlistStock> = [
    {
      title: '代码',
      dataIndex: 'symbol',
      width: 110,
      render: (sym: string) => (
        <Text
          strong
          style={{ cursor: 'pointer', color: ACCENT, fontFamily: 'monospace', fontSize: 13 }}
          onClick={() => goToDetail(sym)}
        >
          {sym.replace(/\.(SH|SZ)$/, '')}
        </Text>
      ),
    },
    {
      title: '名称',
      dataIndex: 'name',
      width: 90,
      render: (n: string, r: WatchlistStock) => (
        <Text
          style={{ cursor: 'pointer', color: TEXT }}
          onClick={() => goToDetail(r.symbol)}
        >
          {n}
        </Text>
      ),
    },
    {
      title: '行业',
      width: 100,
      render: (_: unknown, r: WatchlistStock) => {
        const q = quotes[r.symbol];
        if (!q?.industry) return <Text type="secondary" style={{ fontSize: 12, color: TEXT_SEC }}>—</Text>;
        return (
          <Tag
            style={{
              fontSize: 11,
              margin: 0,
              background: '#1e3a5f',
              color: ACCENT,
              border: 'none',
              borderRadius: 4,
            }}
          >
            {q.industry}
          </Tag>
        );
      },
    },
    {
      title: '最新价',
      width: 95,
      align: 'right' as const,
      render: (_: unknown, r: WatchlistStock) => {
        const q = quotes[r.symbol];
        if (!q) return <Text type="secondary" style={{ fontSize: 12, color: TEXT_SEC }}>—</Text>;
        return (
          <span style={{
            fontFamily: 'monospace',
            fontWeight: 600,
            color: q.changePercent >= 0 ? COLOR_UP : COLOR_DOWN,
            fontSize: 13,
          }}>
            ¥{q.price.toFixed(2)}
          </span>
        );
      },
    },
    {
      title: '涨跌幅',
      width: 90,
      align: 'right' as const,
      render: (_: unknown, r: WatchlistStock) => {
        const q = quotes[r.symbol];
        if (!q) return <Text type="secondary" style={{ fontSize: 12, color: TEXT_SEC }}>—</Text>;
        const color = q.changePercent >= 0 ? COLOR_UP : COLOR_DOWN;
        return (
          <span style={{
            fontFamily: 'monospace',
            fontWeight: 600,
            color,
            fontSize: 13,
            display: 'inline-flex',
            alignItems: 'center',
            gap: 3,
          }}>
            {q.changePercent > 0 ? <ArrowUpOutlined style={{ fontSize: 10 }} /> : q.changePercent < 0 ? <ArrowDownOutlined style={{ fontSize: 10 }} /> : <MinusOutlined style={{ fontSize: 10 }} />}
            {q.changePercent >= 0 ? '+' : ''}{q.changePercent.toFixed(2)}%
          </span>
        );
      },
    },
    {
      title: '换手率',
      width: 80,
      align: 'right' as const,
      render: (_: unknown, r: WatchlistStock) => {
        const q = quotes[r.symbol];
        if (!q?.turnoverRate) return <Text type="secondary" style={{ fontSize: 12, color: TEXT_SEC }}>—</Text>;
        return (
          <span style={{ fontFamily: 'monospace', fontSize: 12, color: TEXT_SEC }}>
            {q.turnoverRate.toFixed(2)}%
          </span>
        );
      },
    },
    {
      title: '信号',
      width: 80,
      align: 'center' as const,
      render: (_: unknown, r: WatchlistStock) => {
        const sig = signals[r.symbol];
        if (!sig) return <Text type="secondary" style={{ fontSize: 11, color: TEXT_SEC }}>—</Text>;
        const colorMap: Record<string, { bg: string; text: string; label: string }> = {
          buy: { bg: 'rgba(207,42,42,0.15)', text: COLOR_UP, label: '买入' },
          sell: { bg: 'rgba(29,180,104,0.15)', text: COLOR_DOWN, label: '卖出' },
          hold: { bg: 'rgba(136,153,170,0.15)', text: TEXT_SEC, label: '持有' },
        };
        const c = colorMap[sig.signal] || colorMap.hold;
        return (
          <Tag
            style={{
              fontSize: 11,
              margin: 0,
              background: c.bg,
              color: c.text,
              border: 'none',
              borderRadius: 4,
              fontWeight: 600,
            }}
          >
            {c.label}
          </Tag>
        );
      },
    },
    {
      title: '操作',
      width: 110,
      align: 'center' as const,
      render: (_: unknown, r: WatchlistStock) => (
        <Space size={4}>
          <Tooltip title="查看详情">
            <Button
              type="text"
              size="small"
              icon={<EyeOutlined />}
              style={{ color: ACCENT }}
              onClick={(e) => { e.stopPropagation(); goToDetail(r.symbol); }}
            />
          </Tooltip>
          <Tooltip title="快速回测">
            <Button
              type="text"
              size="small"
              icon={<LineChartOutlined />}
              style={{ color: GOLD }}
              onClick={(e) => goToBacktest(r.symbol, e)}
            />
          </Tooltip>
          <Popconfirm
            title="确定移除此股票？"
            description={`${r.name}（${r.symbol}）将从追踪列表中移除`}
            onConfirm={() => handleRemoveStock(r.symbol, r.name)}
            okText="移除"
            cancelText="取消"
            okButtonProps={{ danger: true }}
          >
            <Button
              type="text"
              size="small"
              icon={<DeleteOutlined />}
              danger
              onClick={e => e.stopPropagation()}
            />
          </Popconfirm>
        </Space>
      ),
    },
  ];

  /* ─── Render ─── */
  return (
    <div style={{ minHeight: '100vh', background: BG, padding: '24px 32px' }}>
      <div style={{ maxWidth: 1400, margin: '0 auto' }}>

        {/* ── Header ── */}
        <div style={{ marginBottom: 24 }}>
          <Row gutter={[24, 16]} align="middle">
            <Col flex="auto">
              <Space align="center" size={12}>
                <span style={{ fontSize: 28 }}>📊</span>
                <Title level={3} style={{ color: TEXT, margin: 0, fontWeight: 700 }}>
                  追踪中心
                </Title>
                <Text style={{ color: TEXT_SEC, fontSize: 13 }}>
                  {lastRefresh.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', second: '2-digit' })} 更新
                </Text>
              </Space>
            </Col>
            <Col>
              <Space size={12}>
                <Button
                  icon={<ReloadOutlined spin={quotesLoading} />}
                  onClick={handleManualRefresh}
                  style={{
                    background: CARD_BG,
                    borderColor: CARD_BORDER,
                    color: TEXT,
                  }}
                >
                  刷新
                </Button>
              </Space>
            </Col>
          </Row>
        </div>

        {/* ── Summary Stats ── */}
        <Row gutter={16} style={{ marginBottom: 20 }}>
          <Col xs={24} sm={8}>
            <Card
              style={{
                background: CARD_BG,
                border: `1px solid ${CARD_BORDER}`,
                borderRadius: 10,
              }}
              styles={{ body: { padding: '16px 20px' } }}
            >
              <Statistic
                title={<span style={{ color: TEXT_SEC, fontSize: 13 }}>追踪总数</span>}
                value={totalCount}
                suffix={<span style={{ fontSize: 13, color: TEXT_SEC }}>只</span>}
                valueStyle={{ color: ACCENT, fontSize: 28, fontWeight: 700 }}
                prefix={<StarFilled style={{ color: GOLD, fontSize: 18 }} />}
              />
            </Card>
          </Col>
          <Col xs={24} sm={8}>
            <Card
              style={{
                background: CARD_BG,
                border: `1px solid ${CARD_BORDER}`,
                borderRadius: 10,
              }}
              styles={{ body: { padding: '16px 20px' } }}
            >
              <Statistic
                title={<span style={{ color: TEXT_SEC, fontSize: 13 }}>今日平均涨跌</span>}
                value={Math.abs(stats.avgChange)}
                precision={2}
                suffix="%"
                valueStyle={{
                  color: stats.avgChange >= 0 ? COLOR_UP : COLOR_DOWN,
                  fontSize: 28,
                  fontWeight: 700,
                }}
                prefix={stats.avgChange >= 0
                  ? <ArrowUpOutlined style={{ color: COLOR_UP, fontSize: 16 }} />
                  : stats.avgChange < 0
                    ? <ArrowDownOutlined style={{ color: COLOR_DOWN, fontSize: 16 }} />
                    : <MinusOutlined style={{ color: TEXT_SEC, fontSize: 16 }} />
                }
              />
            </Card>
          </Col>
          <Col xs={24} sm={8}>
            <Card
              style={{
                background: CARD_BG,
                border: `1px solid ${CARD_BORDER}`,
                borderRadius: 10,
              }}
              styles={{ body: { padding: '16px 20px' } }}
            >
              <Statistic
                title={<span style={{ color: TEXT_SEC, fontSize: 13 }}>异动提醒</span>}
                value={stats.alertCount}
                suffix={<span style={{ fontSize: 13, color: TEXT_SEC }}>条</span>}
                valueStyle={{
                  color: stats.alertCount > 0 ? GOLD : TEXT_SEC,
                  fontSize: 28,
                  fontWeight: 700,
                }}
                prefix={<BellOutlined style={{ color: stats.alertCount > 0 ? GOLD : TEXT_SEC, fontSize: 18 }} />}
              />
            </Card>
          </Col>
        </Row>

        {/* ── 策略信号概览 ── */}
        {symbols.length > 0 && Object.keys(signals).length > 0 && (
          <Card
            style={{
              background: CARD_BG,
              border: `1px solid ${CARD_BORDER}`,
              borderRadius: 10,
              marginBottom: 20,
            }}
            styles={{ body: { padding: '16px 20px' } }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
              <LineChartOutlined style={{ color: ACCENT, fontSize: 16 }} />
              <Text strong style={{ color: TEXT, fontSize: 14 }}>策略信号</Text>
              <Text style={{ color: TEXT_SEC, fontSize: 12 }}>基于技术分析的交易建议</Text>
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              {Object.entries(signals).map(([sym, sig]) => {
                const signalColor = sig.signal === 'buy' ? COLOR_UP : sig.signal === 'sell' ? COLOR_DOWN : TEXT_SEC;
                const signalText = sig.signal === 'buy' ? '买入' : sig.signal === 'sell' ? '卖出' : '持有';
                const q = quotes[sym];
                return (
                  <div
                    key={sym}
                    onClick={() => navigate(`/stocks/${sym}`)}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 8,
                      padding: '8px 12px', background: 'rgba(15,23,42,0.5)',
                      border: `1px solid ${CARD_BORDER}`, borderRadius: 6,
                      cursor: 'pointer', transition: 'border-color .15s',
                    }}
                    onMouseEnter={e => e.currentTarget.style.borderColor = ACCENT}
                    onMouseLeave={e => e.currentTarget.style.borderColor = CARD_BORDER}
                  >
                    <span style={{ fontFamily: 'monospace', fontWeight: 600, color: TEXT, fontSize: 13 }}>
                      {sym.replace(/\.(SH|SZ)$/, '')}
                    </span>
                    <Tag color={signalColor} style={{ margin: 0, fontSize: 11 }}>{signalText}</Tag>
                    <span style={{ fontFamily: 'monospace', color: signalColor, fontSize: 12, fontWeight: 600 }}>
                      {sig.score}分
                    </span>
                  </div>
                );
              })}
            </div>
          </Card>
        )}

        {/* ── Alerts Banner ── */}
        {alerts.length > 0 && (
          <Card
            style={{
              background: 'linear-gradient(135deg, rgba(245,158,11,0.08), rgba(245,158,11,0.02))',
              border: '1px solid rgba(245,158,11,0.3)',
              borderRadius: 10,
              marginBottom: 20,
            }}
            styles={{ body: { padding: '14px 18px' } }}
          >
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8, marginBottom: 8 }}>
              <AlertOutlined style={{ color: GOLD, fontSize: 16, marginTop: 2 }} />
              <Text strong style={{ color: GOLD, fontSize: 14 }}>异动提醒</Text>
              {alertsLoading && <Spin size="small" style={{ marginLeft: 8 }} />}
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {alerts.map(stock =>
                stock.alerts.map((a, i) => (
                  <div
                    key={`${stock.symbol}-${i}`}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 8,
                      fontSize: 13,
                    }}
                  >
                    <Text
                      strong
                      style={{
                        color: GOLD,
                        fontFamily: 'monospace',
                        cursor: 'pointer',
                        fontSize: 12,
                      }}
                      onClick={() => goToDetail(stock.symbol)}
                    >
                      {stock.name}
                    </Text>
                    <Tag
                      color={
                        a.level === 'critical' ? 'red'
                          : a.level === 'warning' ? 'orange'
                            : 'blue'
                      }
                      style={{
                        fontSize: 10,
                        lineHeight: '16px',
                        padding: '0 6px',
                        margin: 0,
                        borderRadius: 4,
                      }}
                    >
                      {a.type === 'limit_move' ? '涨跌停'
                        : a.type === 'big_move' ? '大幅波动'
                          : a.type === 'volume_spike' ? '放量'
                            : a.type === 'price_break' ? '突破'
                              : '异动'}
                    </Tag>
                    <Text style={{ color: '#9ca3af', fontSize: 12 }}>{a.message}</Text>
                  </div>
                )),
              )}
            </div>
          </Card>
        )}

        {/* ── Group Tabs + Stock Table ── */}
        <Card
          style={{
            background: CARD_BG,
            border: `1px solid ${CARD_BORDER}`,
            borderRadius: 10,
            marginBottom: 20,
          }}
          styles={{ body: { padding: '14px 18px' } }}
        >
          {/* Group bar */}
          <div style={{
            display: 'flex',
            gap: 8,
            marginBottom: 16,
            flexWrap: 'wrap',
            alignItems: 'center',
          }}>
            {groups.map(g => (
              <div
                key={g.id}
                onClick={() => setActiveGroup(g.id)}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 5,
                  background: activeGroup === g.id ? ACCENT : '#0f1a2a',
                  color: activeGroup === g.id ? '#fff' : TEXT_SEC,
                  padding: '5px 6px 5px 12px',
                  borderRadius: 8,
                  cursor: 'pointer',
                  fontSize: 13,
                  fontWeight: activeGroup === g.id ? 600 : 400,
                  transition: 'all .15s',
                  userSelect: 'none',
                  border: `1px solid ${activeGroup === g.id ? ACCENT : CARD_BORDER}`,
                }}
              >
                <FolderOutlined style={{ fontSize: 13 }} />
                <span onDoubleClick={(e) => { e.stopPropagation(); handleRenameGroup(g.id, g.name); }}>
                  {g.name}
                </span>
                <Badge
                  count={g.stocks.length}
                  style={{
                    backgroundColor: activeGroup === g.id ? 'rgba(255,255,255,0.25)' : '#374151',
                    color: activeGroup === g.id ? '#fff' : TEXT_SEC,
                    boxShadow: 'none',
                    fontSize: 11,
                    fontWeight: 600,
                  }}
                />
                <Button
                  type="text"
                  size="small"
                  icon={<PlusOutlined />}
                  style={{
                    color: activeGroup === g.id ? '#fff' : '#666',
                    minWidth: 24,
                    height: 24,
                    padding: 0,
                    fontSize: 12,
                  }}
                  onClick={(e) => {
                    e.stopPropagation();
                    setActiveGroup(g.id);
                    setAddModalOpen(true);
                  }}
                />
                {!g.isDefault && (
                  <Popconfirm
                    title={`删除分组「${g.name}」？`}
                    description="组内股票将移至默认分组"
                    onConfirm={() => handleDeleteGroup(g.id)}
                    okText="删除"
                    cancelText="取消"
                    okButtonProps={{ danger: true }}
                  >
                    <Button
                      type="text"
                      size="small"
                      icon={<CloseOutlined />}
                      style={{
                        color: activeGroup === g.id ? 'rgba(255,255,255,0.7)' : '#666',
                        minWidth: 20,
                        height: 24,
                        padding: 0,
                        fontSize: 10,
                      }}
                      onClick={e => e.stopPropagation()}
                    />
                  </Popconfirm>
                )}
              </div>
            ))}
            <Button
              type="dashed"
              size="small"
              icon={<PlusOutlined />}
              style={{
                borderRadius: 8,
                fontSize: 12,
                borderColor: CARD_BORDER,
                color: TEXT_SEC,
              }}
              onClick={() => setCreateGroupModalOpen(true)}
            >
              新分组
            </Button>

            <div style={{ flex: 1 }} />

            <Button
              type="primary"
              size="small"
              icon={<PlusOutlined />}
              onClick={() => setAddModalOpen(true)}
              style={{ borderRadius: 6 }}
            >
              添加股票
            </Button>
          </div>

          {/* Stock Table */}
          {symbols.length === 0 ? (
            <Empty
              image={<ThunderboltOutlined style={{ fontSize: 48, color: ACCENT, opacity: 0.4 }} />}
              imageStyle={{ height: 60 }}
              description={
                <div style={{ color: TEXT_SEC }}>
                  <Text style={{ color: TEXT_SEC, fontSize: 15, display: 'block', marginBottom: 6 }}>
                    追踪列表为空
                  </Text>
                  <Text style={{ color: TEXT_SEC, fontSize: 13, opacity: 0.7 }}>
                    点击「添加股票」开始追踪您关注的 A 股
                  </Text>
                </div>
              }
            >
              <Button
                type="primary"
                icon={<PlusOutlined />}
                onClick={() => setAddModalOpen(true)}
                style={{ borderRadius: 8, height: 38 }}
              >
                添加第一只股票
              </Button>
            </Empty>
          ) : (
            <Table
              dataSource={currentGroup.stocks}
              columns={columns}
              rowKey="symbol"
              size="middle"
              pagination={false}
              loading={quotesLoading && symbols.length > 0}
              scroll={{ y: 500 }}
              style={{ background: 'transparent' }}
              onRow={r => ({
                style: {
                  cursor: 'pointer',
                  borderBottom: `1px solid ${CARD_BORDER}`,
                },
                onClick: () => goToDetail(r.symbol),
              })}
              components={{
                header: {
                  cell: (props: any) => (
                    <th
                      {...props}
                      style={{
                        ...props.style,
                        background: '#0f1a2a',
                        color: TEXT_SEC,
                        borderBottom: `1px solid ${CARD_BORDER}`,
                        fontSize: 12,
                        fontWeight: 600,
                        padding: '10px 8px',
                      }}
                    />
                  ),
                },
                body: {
                  row: (props: any) => (
                    <tr
                      {...props}
                      style={{
                        ...props.style,
                        background: 'transparent',
                      }}
                    />
                  ),
                },
              }}
            />
          )}
        </Card>

        {/* ── AI Summary Card ── */}
        <Card
          style={{
            background: 'linear-gradient(135deg, rgba(59,130,246,0.06), rgba(59,130,246,0.02))',
            border: `1px solid rgba(59,130,246,0.2)`,
            borderRadius: 10,
            marginBottom: 20,
          }}
          styles={{ body: { padding: '20px 24px' } }}
        >
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
            <RobotOutlined style={{ color: ACCENT, fontSize: 20, marginTop: 2 }} />
            <div style={{ flex: 1 }}>
              <Text strong style={{ color: ACCENT, fontSize: 15, display: 'block', marginBottom: 8 }}>
                AI 追踪总结
              </Text>
              {symbols.length === 0 ? (
                <Text style={{ color: TEXT_SEC, fontSize: 13, lineHeight: 1.6 }}>
                  添加股票到追踪列表后，AI 将为您生成个性化追踪总结，包括板块分析、资金流向、技术面信号等。
                </Text>
              ) : aiSummaryLoading ? (
                <div style={{ color: TEXT_SEC, fontSize: 13, lineHeight: 1.6 }}>
                  <Spin size="small" style={{ marginRight: 8 }} />
                  AI 正在分析您的自选股组合...
                </div>
              ) : aiSummary ? (
                <div style={{ color: TEXT, fontSize: 13, lineHeight: 1.8, whiteSpace: 'pre-wrap' }}>
                  {aiSummary}
                </div>
              ) : (
                <div style={{ color: TEXT, fontSize: 13, lineHeight: 1.8 }}>
                  <Paragraph style={{ color: TEXT, marginBottom: 8 }}>
                    当前追踪 <Text strong style={{ color: ACCENT }}>{symbols.length}</Text> 只股票，
                    {stats.avgChange >= 0 ? '今日整体' : '今日整体'}
                    <Text
                      strong
                      style={{
                        color: stats.avgChange >= 0 ? COLOR_UP : COLOR_DOWN,
                        margin: '0 4px',
                      }}
                    >
                      {stats.avgChange >= 0 ? '上涨' : '下跌'} {Math.abs(stats.avgChange).toFixed(2)}%
                    </Text>
                    。
                    {stats.alertCount > 0 && (
                      <>
                        共有 <Text strong style={{ color: GOLD }}>{stats.alertCount}</Text> 条异动提醒需要注意。
                      </>
                    )}
                    {stats.alertCount === 0 && '暂无异常波动。'}
                  </Paragraph>
                  <Paragraph style={{ color: TEXT_SEC, fontSize: 12, marginBottom: 0 }}>
                    💡 建议关注信号为「买入」的标的，结合换手率和成交量变化综合判断。
                    每30秒自动刷新行情数据。
                  </Paragraph>
                </div>
              )}
            </div>
            <Tooltip title="AI 功能开发中，更多分析即将上线">
              <InfoCircleOutlined style={{ color: TEXT_SEC, fontSize: 14 }} />
            </Tooltip>
          </div>
        </Card>
      </div>

      {/* ── Modals ── */}
      <AddStockModal
        open={addModalOpen}
        onClose={() => setAddModalOpen(false)}
        onAdd={handleAddStock}
      />
      <CreateGroupModal
        open={createGroupModalOpen}
        onClose={() => setCreateGroupModalOpen(false)}
        onCreate={handleCreateGroup}
      />
    </div>
  );
};

export default WatchlistPage;
