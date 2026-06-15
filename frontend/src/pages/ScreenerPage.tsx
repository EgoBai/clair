/**
 * 股票筛选器 v4 — 策略驱动 + 核心指标 + 发掘页关联
 * 
 * 设计理念：
 * - 删除重复的指数显示（与发掘页重复）
 * - 添加核心筛选指标卡片（资金面、基本面、技术面、行业景气度）
 * - 推荐策略模板（价值投资、成长股、动量策略等）
 * - 支持从发掘页传入筛选条件
 */

import React, { useState, useMemo, useEffect, useCallback } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { apiFetch } from '../utils/api';
import { renderMarkdown } from '../utils/markdown';
import { Card, Button, Tag, Table, Spin, Empty, Typography, message, Space, Tooltip } from 'antd';
import {
  RiseOutlined, FireOutlined, ThunderboltOutlined,
  ReloadOutlined, SearchOutlined, FilterOutlined,
  FundOutlined, LineChartOutlined,
  StarOutlined, StarFilled, PlusOutlined, SettingOutlined,
  RobotOutlined, BulbOutlined,
  FallOutlined, RocketOutlined, SafetyOutlined,
} from '@ant-design/icons';

const { Title, Text } = Typography;

import { THEME, GOLD } from '../styles/theme-constants';
const BG = THEME.bg;
const CARD_BG = THEME.cardBg;
const BORDER = THEME.border;
const TEXT = THEME.text;
const TEXT_SEC = THEME.textSec;
const COLOR_UP = THEME.up;
const COLOR_DOWN = THEME.down;
const ACCENT = THEME.accent;

// 股票数据接口
interface StockData {
  symbol: string;
  name: string;
  price: number;
  changePercent: number;
  volume: string;
  marketCap: string;
  industry?: string;
  change: number;
  pe?: number;
  pb?: number;
  roe?: number;
  turnoverRate?: number;
}

// 筛选指标接口
interface FilterMetric {
  id: string;
  name: string;
  icon: React.ReactNode;
  color: string;
  category: 'capital' | 'fundamental' | 'technical' | 'industry';
  description: string;
  filter: (s: StockData) => boolean;
}

// 策略模板接口
interface StrategyTemplate {
  id: string;
  name: string;
  description: string;
  icon: React.ReactNode;
  color: string;
  metrics: string[];
  filter: (s: StockData) => boolean;
  fetchFromApi?: boolean;
  apiEndpoint?: string;
}

// 核心筛选指标 — 精简为4个最实用的
const FILTER_METRICS: FilterMetric[] = [
  {
    id: 'strong_momentum',
    name: '强势动量',
    icon: <RiseOutlined />,
    color: '#f59e0b',
    category: 'technical',
    description: '涨幅超过3%的强势股',
    filter: (s) => Number(s.changePercent) > 3,
  },
  {
    id: 'high_turnover',
    name: '高换手率',
    icon: <FireOutlined />,
    color: '#ef4444',
    category: 'capital',
    description: '换手率超过5%的活跃股',
    filter: (s) => Number(s.turnoverRate) > 5,
  },
  {
    id: 'large_cap',
    name: '大盘蓝筹',
    icon: <FundOutlined />,
    color: '#22c55e',
    category: 'fundamental',
    description: '市值超过100亿的大盘股',
    filter: (s) => Number(s.marketCap) > 1_000_000,
  },
  {
    id: 'hot_industry',
    name: '热门行业',
    icon: <ThunderboltOutlined />,
    color: '#f97316',
    category: 'industry',
    description: '当前热门行业的股票',
    filter: (s) => {
      const hotIndustries = ['电子', '计算机', '电力设备', '国防军工', '通信', '汽车'];
      return hotIndustries.some(ind => s.industry?.includes(ind));
    },
  },
  {
    id: 'oversold',
    name: '超跌反弹',
    icon: <FallOutlined />,
    color: '#8b5cf6',
    category: 'technical',
    description: '跌幅超过3%可能反弹的股票',
    filter: (s) => Number(s.changePercent) < -3,
  },
  {
    id: 'large_cap',
    name: '大盘蓝筹',
    icon: <FundOutlined />,
    color: '#22c55e',
    category: 'fundamental',
    description: '市值超过100亿的大盘股',
    filter: (s) => Number(s.marketCap) > 1_000_000,
  },
  {
    id: 'small_cap',
    name: '小盘成长',
    icon: <RocketOutlined />,
    color: '#ec4899',
    category: 'fundamental',
    description: '市值小于50亿的小盘股',
    filter: (s) => Number(s.marketCap) > 0 && Number(s.marketCap) < 500_000,
  },
  {
    id: 'defensive',
    name: '防御型',
    icon: <SafetyOutlined />,
    color: '#14b8a6',
    category: 'industry',
    description: '防御型行业（公用事业/银行/食品饮料）',
    filter: (s) => {
      const defensive = ['公用事业', '银行', '食品饮料', '医药生物', '交通运输'];
      return defensive.some(ind => s.industry?.includes(ind));
    },
  },
];

// 策略模板 — 4个核心策略
const STRATEGY_TEMPLATES: StrategyTemplate[] = [
  {
    id: 'value_investing',
    name: '价值投资',
    description: '大盘蓝筹 + 稳定盈利',
    icon: <FundOutlined />,
    color: '#22c55e',
    metrics: ['large_cap'],
    filter: (s) => Number(s.marketCap) > 1_000_000,
  },
  {
    id: 'momentum_strategy',
    name: '动量策略',
    description: '涨幅>3% + 换手>3%',
    icon: <LineChartOutlined />,
    color: '#f59e0b',
    metrics: ['strong_momentum', 'high_turnover'],
    filter: (s) => Number(s.changePercent) > 3 && Number(s.turnoverRate) > 3,
  },
  {
    id: 'small_growth',
    name: '小而美',
    description: '小盘 + 高换手 + 热门行业',
    icon: <RocketOutlined />,
    color: '#ec4899',
    metrics: ['small_cap', 'high_turnover', 'hot_industry'],
    filter: (s) => {
      const hotIndustries = ['电子', '计算机', '电力设备', '医药生物'];
      return Number(s.marketCap) > 0 && Number(s.marketCap) < 500_000 
        && Number(s.turnoverRate) > 3
        && hotIndustries.some(ind => s.industry?.includes(ind));
    },
  },
  {
    id: 'defensive_yield',
    name: '防御收益',
    description: '防御型行业 + 市值>50亿',
    icon: <SafetyOutlined />,
    color: '#14b8a6',
    metrics: ['defensive', 'large_cap'],
    filter: (s) => {
      const defensive = ['公用事业', '银行', '食品饮料', '医药生物', '交通运输'];
      return defensive.some(ind => s.industry?.includes(ind))
        && Number(s.marketCap) > 500_000;
    },
  },
  {
    id: 'oversold_bounce',
    name: '超跌反弹',
    description: '跌幅>3% + 高换手 + 非ST',
    icon: <FallOutlined />,
    color: '#8b5cf6',
    metrics: ['oversold', 'high_turnover'],
    filter: (s) => Number(s.changePercent) < -3 
      && Number(s.turnoverRate) > 3
      && !s.name?.includes('ST'),
  },
  {
    id: 'hot_chase',
    name: '热门追击',
    description: '热门行业 + 涨>2% + 市值>50亿',
    icon: <ThunderboltOutlined />,
    color: '#f97316',
    metrics: ['hot_industry', 'strong_momentum', 'large_cap'],
    filter: (s) => {
      const hot = ['电子', '计算机', '电力设备', '国防军工', '通信', '汽车'];
      return hot.some(ind => s.industry?.includes(ind))
        && Number(s.changePercent) > 2
        && Number(s.marketCap) > 500_000;
    },
  },
  {
    id: 'ai_gems',
    name: '潜力股发现',
    description: 'AI多因子评分：动量+成交+规模+行业',
    icon: <RocketOutlined />,
    color: '#ec4899',
    metrics: ['ai_gems'],
    filter: (s) => true, // 前端不做过滤，由API处理
    fetchFromApi: true, // 标记为API获取
    apiEndpoint: '/api/ai/gems',
  },
];

const ScreenerPage: React.FC = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  
  // 状态
  const [stocks, setStocks] = useState<StockData[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeMetrics, setActiveMetrics] = useState<string[]>([]);
  const [activeStrategy, setActiveStrategy] = useState<string | null>(null);
  const [searchText, setSearchText] = useState('');
  const [page, setPage] = useState(1);
  const pageSize = 50;

  // 对话式筛选状态
  const [aiFilterQuery, setAiFilterQuery] = useState('');
  const [aiFilterLoading, setAiFilterLoading] = useState(false);
  const [aiFilterResult, setAiFilterResult] = useState<string>('');
  const [aiFilterSymbols, setAiFilterSymbols] = useState<string[]>([]);
  const [aiFilterStocks, setAiFilterStocks] = useState<StockData[]>([]);

  // 自选列表状态
  const [watchlist, setWatchlist] = useState<string[]>([]);
  
  // API策略模板状态
  const [apiTemplates, setApiTemplates] = useState<any[]>([]);

  // 对话式筛选状态
  useEffect(() => {
    const saved = localStorage.getItem('watchlist');
    if (saved) {
      try { setWatchlist(JSON.parse(saved)); } catch {}
    }
  }, []);

  // 加载API策略模板
  useEffect(() => {
    apiFetch('/api/strategy-templates')
      .then(r => r.json())
      .then(data => {
        if (data.success && data.data?.templates) {
          setApiTemplates(data.data.templates);
        }
      })
      .catch(e => console.warn('加载策略模板失败:', e));
  }, []);

  // 切换自选
  const toggleWatchlist = (symbol: string) => {
    setWatchlist(prev => {
      const next = prev.includes(symbol) 
        ? prev.filter(s => s !== symbol)
        : [...prev, symbol];
      localStorage.setItem('watchlist', JSON.stringify(next));
      message.success(prev.includes(symbol) ? '已取消自选' : '已加入自选');
      return next;
    });
  };

  // 从URL参数读取初始筛选条件
  useEffect(() => {
    const metric = searchParams.get('metric');
    const strategy = searchParams.get('strategy');
    const industry = searchParams.get('industry');
    
    if (metric) {
      setActiveMetrics([metric]);
    } else if (strategy) {
      setActiveStrategy(strategy);
    } else if (industry) {
      // 根据行业设置筛选
      setActiveMetrics(['hot_industry']);
    }
  }, [searchParams]);

  // 获取数据
  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const listResp = await apiFetch('/api/stocks?pageSize=6000').then(r => r.json());
      const apiStocks = listResp?.data?.stocks || [];

      // 用symbol去重（防止同名不同代码的重复）
      const seen = new Set<string>();
      const deduped: any[] = [];
      for (const s of apiStocks) {
        if (!seen.has(s.symbol)) {
          seen.add(s.symbol);
          deduped.push(s);
        }
      }

      const merged: StockData[] = deduped.map((s: any) => ({
        symbol: s.symbol,
        name: (s.name || '').trim(),
        price: Number(s.current_price || 0),
        change: Number(s.change_amount || 0),
        changePercent: Number(s.change_percent || 0),
        volume: s.volume || '—',
        marketCap: s.market_cap || '—',
        industry: s.industry || '—',
        pe: s.pe_ratio || s.pe,
        pb: s.pb_ratio || s.pb,
        roe: s.roe,
        turnoverRate: s.turnover_rate,
      }));
      setStocks(merged);
    } catch (e) {
      console.error('加载数据失败:', e);
      message.error('数据加载失败，请稍后重试');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  // 筛选逻辑
  const filtered = useMemo(() => {
    let result = [...stocks];

    // AI对话式筛选（优先级最高）— 使用AI返回的真实数据
    if (aiFilterStocks.length > 0) {
      return aiFilterStocks;
    }
    if (aiFilterSymbols.length > 0) {
      result = result.filter(s => aiFilterSymbols.includes(s.symbol));
      return result;
    }

    // 应用策略筛选
    if (activeStrategy) {
      const strategy = STRATEGY_TEMPLATES.find(s => s.id === activeStrategy);
      if (strategy) {
        result = result.filter(strategy.filter);
      }
    }
    // 应用指标筛选（如果没有策略）
    else if (activeMetrics.length > 0) {
      result = result.filter(s => {
        return activeMetrics.every(metricId => {
          const metric = FILTER_METRICS.find(m => m.id === metricId);
          return metric ? metric.filter(s) : true;
        });
      });
    }

    // 搜索过滤
    if (searchText) {
      const q = searchText.toLowerCase();
      result = result.filter(s => 
        s.symbol.toLowerCase().includes(q) || 
        s.name.includes(q) ||
        s.industry?.includes(q)
      );
    }

    return result;
  }, [stocks, activeMetrics, activeStrategy, searchText]);

  // 对话式筛选
  const handleAiFilter = useCallback(async () => {
    if (!aiFilterQuery.trim()) return;
    setAiFilterLoading(true);
    setAiFilterResult('');
    setAiFilterSymbols([]);
    setAiFilterStocks([]);
    try {
      const resp = await apiFetch('/api/ai/filter', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: aiFilterQuery }),
      });
      const data = await resp.json();
      if (data?.success && data.data) {
        const results = (data.data.results || []) as any[];
        // 用AI返回的真实数据，不是本地stocks的过期数据
        const stocks: StockData[] = results.map((s: any) => ({
          symbol: s.symbol || '',
          name: s.name || '',
          price: Number(s.price || s.close_price || 0),
          change: Number(s.change_amount || 0),
          changePercent: Number(s.changePercent || s.change_percent || 0),
          volume: s.volume || '—',
          marketCap: s.marketCap || s.market_cap || '—',
          industry: s.industry || '—',
          pe: s.pe_ratio || s.pe,
          turnoverRate: s.turnoverRate || s.turnover_rate || 0,
        }));
        if (stocks.length > 0) {
          setAiFilterStocks(stocks);
          setAiFilterSymbols([]);
          setAiFilterResult(`找到 ${results.length} 只符合条件的股票`);
        } else {
          setAiFilterResult('未找到符合条件的股票');
        }
      }
    } catch {
      setAiFilterResult('筛选失败，请换个说法试试');
    } finally {
      setAiFilterLoading(false);
    }
  }, [aiFilterQuery]);

  // 分页
  const paged = useMemo(() => {
    return filtered.slice((page - 1) * pageSize, page * pageSize);
  }, [filtered, page]);

  // 切换指标
  const toggleMetric = (metricId: string) => {
    setActiveStrategy(null); // 清除策略
    setActiveMetrics(prev => 
      prev.includes(metricId) 
        ? prev.filter(id => id !== metricId)
        : [...prev, metricId]
    );
    setPage(1);
  };

  // 选择策略
  const selectStrategy = (strategyId: string) => {
    setActiveMetrics([]); // 清除指标
    setActiveStrategy(prev => prev === strategyId ? null : strategyId);
    setPage(1);

    // 潜力股发现 → 调用API
    if (strategyId === 'ai_gems') {
      fetchAiGems();
    }
  };

  // AI潜力股发现
  const [aiGems, setAiGems] = useState<any[]>([]);
  const [aiGemsLoading, setAiGemsLoading] = useState(false);
  const fetchAiGems = useCallback(async () => {
    setAiGemsLoading(true);
    try {
      const resp = await apiFetch('/api/ai/gems', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ topN: 20, minScore: 50 }),
      });
      const data = await resp.json();
      if (data?.success && data.data?.gems) {
        setAiGems(data.data.gems);
      }
    } catch (e) {
      message.error('潜力股数据加载失败');
    } finally {
      setAiGemsLoading(false);
    }
  }, []);

  // 表格列定义
  const columns = [
    {
      title: '代码',
      dataIndex: 'symbol',
      width: 95,
      render: (v: string) => (
        <span style={{ fontFamily: 'monospace', fontWeight: 600, color: ACCENT }}>{v.replace(/\.(SH|SZ)$/, '')}</span>
      ),
    },
    {
      title: '名称',
      dataIndex: 'name',
      ellipsis: true,
      render: (v: string, r: StockData) => (
        <span style={{ color: TEXT }}>{v}</span>
      ),
    },
    {
      title: '行业',
      dataIndex: 'industry',
      width: 80,
      render: (v: string) => (
        <Tag style={{ fontSize: 11 }}>{v}</Tag>
      ),
    },
    {
      title: '最新价',
      dataIndex: 'price',
      width: 85,
      align: 'right' as const,
      render: (v: number) => (
        <span style={{ fontFamily: 'monospace', color: TEXT }}>{Number(v).toFixed(2)}</span>
      ),
    },
    {
      title: '涨跌幅',
      dataIndex: 'changePercent',
      width: 85,
      align: 'right' as const,
      sorter: (a: StockData, b: StockData) => a.changePercent - b.changePercent,
      render: (v: number) => (
        <span style={{ 
          fontFamily: 'monospace', 
          fontWeight: 600,
          color: v >= 0 ? COLOR_UP : COLOR_DOWN 
        }}>
          {Number(v) >= 0 ? '+' : ''}{Number(v).toFixed(2)}%
        </span>
      ),
    },
    {
      title: '换手率',
      dataIndex: 'turnoverRate',
      width: 75,
      align: 'right' as const,
      render: (v?: number) => (
        <span style={{ fontFamily: 'monospace', color: TEXT_SEC }}>
          {v ? Number(v).toFixed(1) + '%' : '—'}
        </span>
      ),
    },
    {
      title: 'PE',
      dataIndex: 'pe',
      width: 65,
      align: 'right' as const,
      render: (v?: number) => (
        <span style={{ fontFamily: 'monospace', color: TEXT_SEC }}>
          {v ? Number(v).toFixed(1) : '—'}
        </span>
      ),
    },
    {
      title: '操作',
      width: 80,
      render: (_: any, r: StockData) => (
        <Space>
          <Tooltip title={watchlist.includes(r.symbol) ? '取消自选' : '加入自选'}>
            <Button
              type="text"
              size="small"
              icon={watchlist.includes(r.symbol) ? <StarFilled style={{ color: GOLD }} /> : <StarOutlined />}
              onClick={() => toggleWatchlist(r.symbol)}
            />
          </Tooltip>
          <Button 
            type="link" 
            size="small"
            onClick={() => navigate(`/stocks/${r.symbol}`)}
          >
            详情
          </Button>
        </Space>
      ),
    },
  ];

  return (
    <div className="screener-page" style={{ background: BG, minHeight: '100vh', padding: '24px' }}>
      <div style={{ maxWidth: 1200, margin: '0 auto' }}>
        
        {/* 页面标题 */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 24 }}>
          <div>
            <Title level={3} style={{ color: TEXT, marginBottom: 8 }}>
              <FilterOutlined style={{ marginRight: 8 }} />
              股票筛选
            </Title>
            <Text style={{ color: TEXT_SEC }}>
              选择核心指标或策略模板，快速筛选符合条件的股票
            </Text>
          </div>
          <Button 
            icon={<SettingOutlined />}
            onClick={() => navigate('/strategies')}
          >
            管理策略
          </Button>
        </div>

        {/* 策略模板 */}
        <Card 
          title={
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ color: TEXT }}>🎯 推荐策略</span>
              <Button 
                type="link" 
                size="small" 
                icon={<PlusOutlined />}
                onClick={() => navigate('/strategies')}
              >
                查看全部
              </Button>
            </div>
          }
          style={{ background: CARD_BG, border: `1px solid ${BORDER}`, marginBottom: 16 }}
          bodyStyle={{ padding: '16px' }}
        >
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 12 }}>
            {/* 系统预设策略 */}
            {STRATEGY_TEMPLATES.map(strategy => (
              <div
                key={strategy.id}
                onClick={() => selectStrategy(strategy.id)}
                style={{
                  background: activeStrategy === strategy.id ? strategy.color + '20' : BG,
                  border: `1px solid ${activeStrategy === strategy.id ? strategy.color : BORDER}`,
                  borderRadius: 8,
                  padding: '12px',
                  cursor: 'pointer',
                  transition: 'all 0.2s',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                  <span style={{ color: strategy.color, fontSize: 18 }}>{strategy.icon}</span>
                  <span style={{ color: TEXT, fontWeight: 600, fontSize: 14 }}>{strategy.name}</span>
                </div>
                <div style={{ color: TEXT_SEC, fontSize: 12 }}>{strategy.description}</div>
              </div>
            ))}
            
            {/* API策略模板（最多显示4个） */}
            {apiTemplates.slice(0, 4).map(template => (
              <div
                key={`api-${template.id}`}
                onClick={() => {
                  setActiveStrategy(null);
                  setActiveMetrics([]);
                  // 应用模板条件进行筛选
                  message.info(`已选择策略: ${template.name}`);
                }}
                style={{
                  background: BG,
                  border: `1px solid ${BORDER}`,
                  borderRadius: 8,
                  padding: '12px',
                  cursor: 'pointer',
                  transition: 'all 0.2s',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                  <span style={{ fontSize: 18 }}>{template.icon || '📊'}</span>
                  <span style={{ color: TEXT, fontWeight: 600, fontSize: 14 }}>{template.name}</span>
                </div>
                <div style={{ color: TEXT_SEC, fontSize: 12 }}>{template.description || '自定义策略'}</div>
              </div>
            ))}
          </div>
        </Card>

        {/* AI潜力股发现结果 */}
        {activeStrategy === 'ai_gems' && (
          <Card
            title={<span style={{ color: 'var(--text)', display: 'flex', alignItems: 'center', gap: 8 }}><RocketOutlined style={{ color: '#ec4899' }} /> 🔮 AI潜力股发现 — Top 20</span>}
            loading={aiGemsLoading}
            style={{ background: 'linear-gradient(135deg, rgba(236,72,153,0.06), rgba(139,92,246,0.03))', border: '1px solid rgba(236,72,153,0.2)', marginBottom: 16 }}
          >
            {aiGems.length > 0 && (
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                  <thead>
                    <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.1)' }}>
                      <th style={{ padding: '8px 12px', textAlign: 'left', color: 'var(--text-secondary)' }}>排名</th>
                      <th style={{ padding: '8px 12px', textAlign: 'left', color: 'var(--text-secondary)' }}>代码</th>
                      <th style={{ padding: '8px 12px', textAlign: 'left', color: 'var(--text-secondary)' }}>名称</th>
                      <th style={{ padding: '8px 12px', textAlign: 'right', color: 'var(--text-secondary)' }}>总分</th>
                      <th style={{ padding: '8px 12px', textAlign: 'right', color: 'var(--text-secondary)' }}>动量</th>
                      <th style={{ padding: '8px 12px', textAlign: 'right', color: 'var(--text-secondary)' }}>成交</th>
                      <th style={{ padding: '8px 12px', textAlign: 'right', color: 'var(--text-secondary)' }}>规模</th>
                      <th style={{ padding: '8px 12px', textAlign: 'right', color: 'var(--text-secondary)' }}>行业</th>
                    </tr>
                  </thead>
                  <tbody>
                    {aiGems.map((gem, i) => (
                      <tr key={gem.symbol} style={{ borderBottom: '1px solid rgba(255,255,255,0.05)', cursor: 'pointer' }}
                        onClick={() => navigate(`/stocks/${gem.symbol.replace(/\.(SH|SZ)$/, '')}`)}
                        onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.03)'}
                        onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                      >
                        <td style={{ padding: '8px 12px', color: 'var(--text-secondary)' }}>#{i + 1}</td>
                        <td style={{ padding: '8px 12px', fontFamily: 'monospace', color: 'var(--accent)' }}>{gem.symbol.replace(/\.(SH|SZ)$/, '')}</td>
                        <td style={{ padding: '8px 12px', color: 'var(--text)', fontWeight: 600 }}>{gem.name}</td>
                        <td style={{ padding: '8px 12px', textAlign: 'right', color: '#ec4899', fontWeight: 800, fontSize: 16 }}>{gem.score}</td>
                        <td style={{ padding: '8px 12px', textAlign: 'right', color: 'var(--text-secondary)' }}>{gem.momentumScore}</td>
                        <td style={{ padding: '8px 12px', textAlign: 'right', color: 'var(--text-secondary)' }}>{gem.volumeScore}</td>
                        <td style={{ padding: '8px 12px', textAlign: 'right', color: 'var(--text-secondary)' }}>{gem.sizeScore}</td>
                        <td style={{ padding: '8px 12px', textAlign: 'right' }}>
                          <Tag style={{ fontSize: 11 }}>{gem.industry}</Tag>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        )}

        {/* 对话式AI筛选 — 核心差异化功能 */}
        <Card style={{ marginBottom: 16, background: 'linear-gradient(135deg, rgba(139,92,246,0.08), rgba(139,92,246,0.03))', border: '1px solid rgba(139,92,246,0.25)' }}>
          <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
            <span style={{ fontSize: 18 }}>🤖</span>
            <input
              type="text"
              placeholder="用自然语言描述：如 涨幅超3%的科技股 或 市盈率低于20的银行股"
              value={aiFilterQuery}
              onChange={(e) => setAiFilterQuery(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') handleAiFilter(); }}
              style={{
                flex: 1,
                background: 'rgba(255,255,255,0.06)',
                border: '1px solid rgba(139,92,246,0.3)',
                borderRadius: 8,
                color: 'var(--text)',
                fontSize: 14,
                outline: 'none',
                padding: '8px 12px',
              }}
            />
            <Button
              type="primary"
              loading={aiFilterLoading}
              onClick={handleAiFilter}
              style={{ background: '#8b5cf6', borderColor: '#8b5cf6', borderRadius: 8 }}
            >
              🤖 AI筛选
            </Button>
          </div>
          {aiFilterResult && (
            <div style={{ marginTop: 8, fontSize: 12, color: 'var(--text-secondary)' }}>
              {aiFilterResult}
            </div>
          )}
        </Card>

        {/* 核心筛选指标 */}
        <Card 
          title={<span style={{ color: TEXT }}>🔍 核心指标</span>}
          style={{ background: CARD_BG, border: `1px solid ${BORDER}`, marginBottom: 16 }}
          bodyStyle={{ padding: '16px' }}
        >
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 12 }}>
            {FILTER_METRICS.map(metric => (
              <Tooltip key={metric.id} title={metric.description}>
                <div
                  onClick={() => toggleMetric(metric.id)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 10,
                    padding: '12px 16px',
                    background: activeMetrics.includes(metric.id) ? metric.color + '20' : BG,
                    border: `1px solid ${activeMetrics.includes(metric.id) ? metric.color : BORDER}`,
                    borderRadius: 8,
                    cursor: 'pointer',
                    transition: 'all 0.2s',
                  }}
                >
                  <span style={{ color: metric.color, fontSize: 18 }}>{metric.icon}</span>
                  <span style={{ 
                    color: activeMetrics.includes(metric.id) ? metric.color : TEXT,
                    fontSize: 14,
                    fontWeight: activeMetrics.includes(metric.id) ? 600 : 400,
                  }}>
                    {metric.name}
                  </span>
                </div>
              </Tooltip>
            ))}
          </div>
        </Card>

        {/* 搜索和统计 */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
            <span style={{ color: TEXT_SEC }}>
              筛选结果: <b style={{ color: ACCENT }}>{filtered.length}</b> 只股票
            </span>
            {activeStrategy && (
              <Tag color={STRATEGY_TEMPLATES.find(s => s.id === activeStrategy)?.color}>
                {STRATEGY_TEMPLATES.find(s => s.id === activeStrategy)?.name}
              </Tag>
            )}
            {activeMetrics.map(mId => {
              const m = FILTER_METRICS.find(fm => fm.id === mId);
              return m ? <Tag key={mId} color={m.color}>{m.name}</Tag> : null;
            })}
          </div>
          <Space>
            <input
              type="text"
              placeholder="搜索代码/名称/行业"
              value={searchText}
              onChange={(e) => { setSearchText(e.target.value); setPage(1); }}
              style={{
                background: BG,
                border: `1px solid ${BORDER}`,
                borderRadius: 6,
                padding: '6px 12px',
                color: TEXT,
                fontSize: 13,
                width: 200,
              }}
            />
            <Button 
              icon={<ReloadOutlined />} 
              onClick={fetchData}
              loading={loading}
            >
              刷新
            </Button>
          </Space>
        </div>

        {/* 股票列表 */}
        <Card 
          style={{ background: CARD_BG, border: `1px solid ${BORDER}` }}
          bodyStyle={{ padding: 0 }}
        >
          <Table
            dataSource={paged}
            columns={columns}
            loading={loading}
            rowKey="symbol"
            pagination={{
              current: page,
              pageSize,
              total: filtered.length,
              onChange: setPage,
              showSizeChanger: false,
              showTotal: (total) => `共 ${total} 只`,
            }}
            locale={{
              emptyText: <Empty description="暂无符合条件的股票" />,
            }}
            size="small"
            style={{ background: 'transparent' }}
          />
        </Card>
      </div>
    </div>
  );
};

export default ScreenerPage;
