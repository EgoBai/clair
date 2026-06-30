/**
 * 股票筛选器 v5 — 8大策略模板 + 多维度核心指标 + 筛选说明
 * 
 * 对标：芝士财富/同花顺选股功能
 * 策略：价值投资、动量策略、小而美、防御收益、超跌反弹、热门追击、
 *       低估值修复、高股息策略
 * 指标：行情/估值/财务/技术/行业 5维度
 */

import React, { useState, useMemo, useEffect, useCallback } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { apiFetch } from '../utils/api';
import { Card, Button, Tag, Table, Empty, Typography, message, Space, Tooltip } from 'antd';
import {
  RiseOutlined, FireOutlined, ThunderboltOutlined,
  ReloadOutlined, FilterOutlined,
  FundOutlined,
  StarOutlined, StarFilled,
  RobotOutlined,
  FallOutlined, RocketOutlined, SafetyOutlined,
  DollarOutlined, TrophyOutlined, PercentageOutlined,
  InfoCircleOutlined,
} from '@ant-design/icons';

const { Title, Text } = Typography;

import { THEME, GOLD } from '../styles/theme-constants';
import { useWatchlistStore } from '../hooks/useWatchlistStore';
import { parseStockList } from '@shared/types';
const BG = THEME.bg;
const CARD_BG = THEME.cardBg;
const BORDER = THEME.border;
const TEXT = THEME.text;
const TEXT_SEC = THEME.textSec;
const COLOR_UP = THEME.up;
const COLOR_DOWN = THEME.down;
const ACCENT = THEME.accent;

interface StockData {
  symbol: string;
  name: string;
  price: number;
  changePercent: number;
  change: number;
  volume: string;
  marketCap: string;
  marketCapNum: number;
  industry?: string;
  pe?: number;
  pb?: number;
  roe?: number;
  turnoverRate?: number;
  amplitude?: number;
  high?: number;
  low?: number;
  open?: number;
  prevClose?: number;
}

interface FilterMetric {
  id: string;
  name: string;
  icon: React.ReactNode;
  color: string;
  category: string;
  description: string;
  tooltip: string;
  filter: (s: StockData) => boolean;
}

interface StrategyTemplate {
  id: string;
  name: string;
  description: string;
  icon: React.ReactNode;
  color: string;
  metrics: string[];
  filter: (s: StockData) => boolean;
  explanation: string;
  fetchFromApi?: boolean;
  apiEndpoint?: string;
}

// ===== 核心筛选指标 — 10个多维度 =====
const FILTER_METRICS: FilterMetric[] = [
  {
    id: 'strong_momentum', name: '强势动量', icon: <RiseOutlined />, color: '#f59e0b',
    category: '行情', description: '涨幅 > 3%', tooltip: '当日涨幅超过3%的强势股，反映短期资金追捧程度',
    filter: (s) => Number(s.changePercent) > 3,
  },
  {
    id: 'high_turnover', name: '高换手率', icon: <FireOutlined />, color: '#ef4444',
    category: '行情', description: '换手率 > 5%', tooltip: '换手率超过5%，说明市场交投活跃，流动性好',
    filter: (s) => Number(s.turnoverRate) > 5,
  },
  {
    id: 'high_amplitude', name: '高振幅', icon: <ThunderboltOutlined />, color: '#f97316',
    category: '行情', description: '振幅 > 7%', tooltip: '日内振幅超过7%，波动剧烈，适合短线操作',
    filter: (s) => Number(s.amplitude) > 7,
  },
  {
    id: 'low_pe', name: '低市盈率', icon: <PercentageOutlined />, color: '#22c55e',
    category: '估值', description: 'PE < 15', tooltip: '市盈率低于15倍，估值处于偏低水平，安全边际较高',
    filter: (s) => Number(s.pe) > 0 && Number(s.pe) < 15,
  },
  {
    id: 'low_pb', name: '低市净率', icon: <DollarOutlined />, color: '#14b8a6',
    category: '估值', description: 'PB < 1.5', tooltip: '市净率低于1.5倍，接近净资产价值，防御性强',
    filter: (s) => Number(s.pb) > 0 && Number(s.pb) < 1.5,
  },
  {
    id: 'large_cap', name: '大盘蓝筹', icon: <FundOutlined />, color: '#3b82f6',
    category: '财务', description: '市值 > 200亿', tooltip: '市值超过200亿，流动性好，机构关注度高',
    filter: (s) => Number(s.marketCapNum) > 2000000,
  },
  {
    id: 'small_cap', name: '小盘成长', icon: <RocketOutlined />, color: '#ec4899',
    category: '财务', description: '市值 < 50亿', tooltip: '市值小于50亿，弹性大，适合小资金博弈',
    filter: (s) => Number(s.marketCapNum) > 0 && Number(s.marketCapNum) < 500000,
  },
  {
    id: 'oversold', name: '超跌反弹', icon: <FallOutlined />, color: '#8b5cf6',
    category: '技术', description: '跌幅 > 5%', tooltip: '当日跌幅超过5%，短期超卖，存在技术性反弹机会',
    filter: (s) => Number(s.changePercent) < -5,
  },
  {
    id: 'hot_industry', name: '热门行业', icon: <FireOutlined />, color: '#f59e0b',
    category: '行业', description: '科技/新能源/军工', tooltip: '电子、计算机、电力设备、国防军工、通信、汽车等热门赛道',
    filter: (s) => {
      const hot = ['电子', '计算机', '电力设备', '国防军工', '通信', '汽车', '医药生物'];
      return hot.some(ind => s.industry?.includes(ind));
    },
  },
  {
    id: 'defensive', name: '防御型', icon: <SafetyOutlined />, color: '#14b8a6',
    category: '行业', description: '公用事业/银行/食品', tooltip: '公用事业、银行、食品饮料、医药生物、交通运输等防御型行业',
    filter: (s) => {
      const def = ['公用事业', '银行', '食品饮料', '医药生物', '交通运输', '煤炭'];
      return def.some(ind => s.industry?.includes(ind));
    },
  },
];

// ===== 8大推荐策略模板 =====
const STRATEGY_TEMPLATES: StrategyTemplate[] = [
  {
    id: 'value_investing', name: '价值投资', description: '大盘蓝筹 + 低估值',
    icon: <TrophyOutlined />, color: '#22c55e',
    metrics: ['large_cap', 'low_pe'],
    filter: (s) => Number(s.marketCapNum) > 2000000 && Number(s.pe) > 0 && Number(s.pe) < 20,
    explanation: '筛选市值>200亿且PE<20的蓝筹股，适合中长期价值投资。核心逻辑：大市值保证流动性，低估值提供安全边际。',
  },
  {
    id: 'momentum_strategy', name: '动量策略', description: '强势上涨 + 活跃成交',
    icon: <RiseOutlined />, color: '#f59e0b',
    metrics: ['strong_momentum', 'high_turnover'],
    filter: (s) => Number(s.changePercent) > 3 && Number(s.turnoverRate) > 3,
    explanation: '筛选涨幅>3%且换手>3%的强势股，适合趋势跟踪。核心逻辑：追涨强势标的，量价配合确认动能。',
  },
  {
    id: 'small_growth', name: '小而美', description: '小盘 + 活跃 + 热门赛道',
    icon: <RocketOutlined />, color: '#ec4899',
    metrics: ['small_cap', 'high_turnover', 'hot_industry'],
    filter: (s) => {
      const hot = ['电子', '计算机', '电力设备', '医药生物', '国防军工', '通信', '汽车'];
      return Number(s.marketCapNum) > 0 && Number(s.marketCapNum) < 500000
        && Number(s.turnoverRate) > 3
        && hot.some(ind => s.industry?.includes(ind));
    },
    explanation: '筛选市值<50亿、换手>3%且处于热门赛道的成长股。核心逻辑：小市值弹性大，叠加行业风口提升胜率。',
  },
  {
    id: 'defensive_yield', name: '防御收益', description: '防御行业 + 估值合理',
    icon: <SafetyOutlined />, color: '#14b8a6',
    metrics: ['defensive', 'large_cap', 'low_pb'],
    filter: (s) => {
      const def = ['公用事业', '银行', '食品饮料', '医药生物', '交通运输', '煤炭'];
      return def.some(ind => s.industry?.includes(ind))
        && Number(s.marketCapNum) > 500000
        && Number(s.pb) > 0 && Number(s.pb) < 2;
    },
    explanation: '筛选防御型行业中市值>50亿且PB<2的标的。核心逻辑：弱市中防御板块抗跌，低PB提供下行保护。',
  },
  {
    id: 'oversold_bounce', name: '超跌反弹', description: '深跌 + 高换手',
    icon: <FallOutlined />, color: '#8b5cf6',
    metrics: ['oversold', 'high_turnover'],
    filter: (s) => Number(s.changePercent) < -5 && Number(s.turnoverRate) > 3 && !s.name?.includes('ST'),
    explanation: '筛选跌幅>5%、换手>3%的非ST股。核心逻辑：短期超卖后资金博弈反弹，高换手说明有资金承接。',
  },
  {
    id: 'hot_chase', name: '热门追击', description: '热门赛道 + 趋势确认',
    icon: <ThunderboltOutlined />, color: '#f97316',
    metrics: ['hot_industry', 'strong_momentum', 'large_cap'],
    filter: (s) => {
      const hot = ['电子', '计算机', '电力设备', '国防军工', '通信', '汽车', '医药生物'];
      return hot.some(ind => s.industry?.includes(ind))
        && Number(s.changePercent) > 2
        && Number(s.marketCapNum) > 500000;
    },
    explanation: '筛选热门赛道中涨>2%且市值>50亿的标的。核心逻辑：热点行业+资金确认+流动性保障，三重过滤提高胜率。',
  },
  {
    id: 'low_valuation', name: '低估值修复', description: 'PE<15 + PB<1.5 + 盈利',
    icon: <DollarOutlined />, color: '#3b82f6',
    metrics: ['low_pe', 'low_pb', 'large_cap'],
    filter: (s) => Number(s.pe) > 0 && Number(s.pe) < 15
      && Number(s.pb) > 0 && Number(s.pb) < 1.5
      && Number(s.marketCapNum) > 500000,
    explanation: 'PE<15、PB<1.5且市值>50亿的低估标的。核心逻辑：双低估值+大市值，适合逆向布局等待估值修复。',
  },
  {
    id: 'ai_gems', name: 'AI潜力发现', description: 'AI多因子综合评分',
    icon: <RobotOutlined />, color: '#ec4899',
    metrics: ['ai_gems'],
    filter: (_s) => true,
    fetchFromApi: true,
    apiEndpoint: '/api/ai/gems',
    explanation: 'AI模型综合动量、成交、规模、行业四维因子打分。机器挖掘人眼难以发现的潜力标的，适合辅助决策。',
  },
];

const ScreenerPage: React.FC = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const [stocks, setStocks] = useState<StockData[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeMetrics, setActiveMetrics] = useState<string[]>([]);
  const [activeStrategy, setActiveStrategy] = useState<string | null>(null);
  const [searchText, setSearchText] = useState('');
  const [page, setPage] = useState(1);
  const [showExplanations, setShowExplanations] = useState(false);
  const pageSize = 50;

  const [aiFilterQuery, setAiFilterQuery] = useState('');
  const [aiFilterLoading, setAiFilterLoading] = useState(false);
  const [aiFilterResult, setAiFilterResult] = useState<string>('');
  const [aiFilterSymbols, setAiFilterSymbols] = useState<string[]>([]);
  const [aiFilterStocks, setAiFilterStocks] = useState<StockData[]>([]);
  const [aiGems, setAiGems] = useState<any[]>([]);
  const [aiGemsLoading, setAiGemsLoading] = useState(false);

  // 技术指标缓存
  interface TechData { change5d?: number | null; change20d?: number | null; ma20?: number; maDeviation?: number | null; rsi14?: number | null; volatility20d?: number | null; }
  const [techData, setTechData] = useState<Record<string, TechData>>({});
  const [_techLoading, setTechLoading] = useState(false);

  const watchlistStore = useWatchlistStore();

  // 将任意来源(全量列表/涨跌榜/板块)的原始股票数组统一转为 StockData[]
  const toStockData = useCallback((rawList: any[]): StockData[] => {
    const seen = new Set<string>();
    const deduped: any[] = [];
    for (const s of rawList) {
      if (s && s.symbol && !seen.has(s.symbol)) { seen.add(s.symbol); deduped.push(s); }
    }
    const parsed = parseStockList(deduped);
    return parsed.map(s => ({
      symbol: s.symbol, name: s.name,
      price: s.price, changePercent: s.changePercent,
      change: s.price * s.changePercent / 100,
      volume: String(s.volume || '—'),
      marketCap: String(s.marketCap || '—'),
      marketCapNum: Number(s.marketCap || 0),
      industry: s.industry || '—',
      pe: s.peRatio ?? undefined, pb: s.pbRatio ?? undefined,
      turnoverRate: s.turnoverRate,
      amplitude: s.amplitude ?? undefined,
    }));
  }, []);

  // Load data — 打开即默认展示全市场(对标同花顺/富途)，多端点容错保证页面非空
  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      let merged: StockData[] = [];

      // 1) 主数据源：全市场股票列表。用相对路径走全局 fetch 代理
      //    (dev→Vite proxy→Express 返回 5541 只；prod→main.tsx→clair-api.pages.dev)
      //    信封兼容多种返回结构，避免后端形态差异导致解析为空。
      try {
        const resp = await fetch('/api/stocks?pageSize=6000');
        if (resp.ok) {
          const listResp = await resp.json();
          const apiStocks =
            listResp?.data?.stocks ??
            listResp?.data?.items ??
            (Array.isArray(listResp?.data) ? listResp.data : null) ??
            listResp?.stocks ??
            listResp?.items ??
            (Array.isArray(listResp) ? listResp : null) ??
            [];
          merged = toStockData(apiStocks);
        }
      } catch { /* 全量端点不可用 → 进入兜底 */ }

      // 2) 兜底：生产 Worker 未暴露 /api/stocks 全量端点时，
      //    用实时涨跌榜(gainers+losers)保证默认页有真实非空数据，而非空白。
      if (merged.length === 0) {
        try {
          const resp = await fetch('/api/stocks/top');
          if (resp.ok) {
            const top = await resp.json();
            const d = top?.data ?? {};
            merged = toStockData([...(d.gainers ?? []), ...(d.losers ?? [])]);
          }
        } catch { /* ignore */ }
      }

      // 默认按涨跌幅降序(对标同花顺/富途：打开即见涨幅榜)；搜索/策略在此基础上进一步过滤
      merged.sort((a, b) => Number(b.changePercent) - Number(a.changePercent));
      setStocks(merged);
      if (merged.length === 0) message.warning('暂时无法加载行情数据，请点击刷新重试');
    } catch (e) {
      console.error('加载数据失败:', e);
      message.error('数据加载失败');
    } finally { setLoading(false); }
  }, [toStockData]);

  useEffect(() => { fetchData(); }, [fetchData]);

  // 为当前页股票加载技术指标
  const fetchTechBatch = useCallback(async (symbols: string[]) => {
    if (!symbols.length) return;
    // Skip already-loaded symbols
    const toLoad = symbols.filter(s => !techData[s]);
    if (!toLoad.length) return;
    
    setTechLoading(true);
    try {
      const resp = await apiFetch('/api/tech/batch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ symbols: toLoad }),
      });
      const data = await resp.json();
      if (data?.success && data.data) {
        setTechData(prev => ({ ...prev, ...data.data }));
      }
    } catch (e) {
      // Silent fail — tech indicators are supplementary
    } finally { setTechLoading(false); }
  }, [techData]);

  useEffect(() => {
    const metric = searchParams.get('metric');
    const strategy = searchParams.get('strategy');
    const industry = searchParams.get('industry');
    if (metric) setActiveMetrics([metric]);
    else if (strategy) setActiveStrategy(strategy);
    else if (industry) setActiveMetrics(['hot_industry']);
  }, [searchParams]);

  const toggleWatchlist = (symbol: string, name?: string) => {
    const added = watchlistStore.toggle({ symbol, name: name || symbol });
    message.success(added ? '已加入自选' : '已取消自选');
  };

  const toggleMetric = (metricId: string) => {
    setActiveStrategy(null);
    setActiveMetrics(prev => prev.includes(metricId) ? prev.filter(id => id !== metricId) : [...prev, metricId]);
    setPage(1);
  };

  const selectStrategy = (strategyId: string) => {
    setActiveMetrics([]);
    setActiveStrategy(prev => prev === strategyId ? null : strategyId);
    setPage(1);
    if (strategyId === 'ai_gems') fetchAiGems();
  };

  const fetchAiGems = useCallback(async () => {
    setAiGemsLoading(true);
    try {
      const resp = await apiFetch('/api/ai/gems', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ topN: 50, minScore: 40 }),
      });
      const data = await resp.json();
      if (data?.success && data.data?.gems) setAiGems(data.data.gems);
    } catch { message.error('潜力股数据加载失败'); }
    finally { setAiGemsLoading(false); }
  }, []);

  const handleAiFilter = useCallback(async () => {
    if (!aiFilterQuery.trim()) return;
    setAiFilterLoading(true);
    setAiFilterResult(''); setAiFilterSymbols([]); setAiFilterStocks([]);
    try {
      const isWatchlistQuery = /自选|我的股票|我的持仓|重点关注/.test(aiFilterQuery);
      let watchlistSymbols: string[] | undefined;
      if (isWatchlistQuery) {
        try {
          const saved = localStorage.getItem('astock_watchlist_v2');
          if (saved) {
            const groups = JSON.parse(saved);
            watchlistSymbols = groups.flatMap((g: any) => g.stocks || []).map((s: any) => s.symbol);
          }
        } catch { /* localStorage 读取/解析失败时回退到 watchlistStore */ }
        if (!watchlistSymbols || watchlistSymbols.length === 0) watchlistSymbols = watchlistStore.items.map(i => i.symbol);
      }
      if (isWatchlistQuery && (!watchlistSymbols || watchlistSymbols.length === 0)) {
        setAiFilterResult('您的自选股列表为空，请先添加自选股');
        setAiFilterLoading(false); return;
      }
      const resp = await apiFetch('/api/ai/filter', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: aiFilterQuery, watchlistSymbols }),
      });
      const data = await resp.json();
      if (data?.success && data.data) {
        const results = (data.data.results || []) as any[];
        const stocks: StockData[] = results.map((s: any) => ({
          symbol: s.symbol || '', name: s.name || '',
          price: Number(s.price || s.close_price || 0),
          change: Number(s.change_amount || 0),
          changePercent: Number(s.changePercent || s.change_percent || 0),
          volume: s.volume || '—', marketCap: s.marketCap || s.market_cap || '—',
          marketCapNum: Number(s.marketCap || s.market_cap || 0),
          industry: s.industry || '—', pe: s.pe_ratio || s.pe,
          turnoverRate: s.turnoverRate || s.turnover_rate || 0,
        }));
        if (stocks.length > 0) {
          setAiFilterStocks(stocks);
          setAiFilterResult(`找到 ${results.length} 只符合条件的股票`);
        } else setAiFilterResult('未找到符合条件的股票');
      }
    } catch { setAiFilterResult('筛选失败，请换个说法试试'); }
    finally { setAiFilterLoading(false); }
  }, [aiFilterQuery, watchlistStore.items]);

  const filtered = useMemo(() => {
    if (aiFilterStocks.length > 0) return aiFilterStocks;
    if (aiFilterSymbols.length > 0) return stocks.filter(s => aiFilterSymbols.includes(s.symbol));
    let result = [...stocks];
    if (activeStrategy) {
      const strategy = STRATEGY_TEMPLATES.find(s => s.id === activeStrategy);
      if (strategy) result = result.filter(strategy.filter);
    } else if (activeMetrics.length > 0) {
      result = result.filter(s => activeMetrics.every(mid => {
        const m = FILTER_METRICS.find(fm => fm.id === mid);
        return m ? m.filter(s) : true;
      }));
    }
    if (searchText) {
      const q = searchText.toLowerCase();
      result = result.filter(s => s.symbol.toLowerCase().includes(q) || s.name.includes(q) || s.industry?.includes(q));
    }
    return result;
  }, [stocks, activeMetrics, activeStrategy, searchText, aiFilterStocks, aiFilterSymbols]);

  const paged = useMemo(() => filtered.slice((page - 1) * pageSize, page * pageSize), [filtered, page]);

  const activeStrategyObj = activeStrategy ? STRATEGY_TEMPLATES.find(s => s.id === activeStrategy) : null;
  const activeMetricLabels = activeMetrics.map(mid => FILTER_METRICS.find(fm => fm.id === mid)?.name).filter(Boolean);

  // Group metrics by category for display
  const metricCategories = useMemo(() => {
    const cats: Record<string, FilterMetric[]> = {};
    for (const m of FILTER_METRICS) {
      if (!cats[m.category]) cats[m.category] = [];
      cats[m.category].push(m);
    }
    return cats;
  }, []);

  // 页面切换时加载当前页的技术指标
  useEffect(() => {
    const symbols = paged.map(s => s.symbol);
    fetchTechBatch(symbols);
  }, [paged, fetchTechBatch]);

  const columns = [
    { title: '代码', dataIndex: 'symbol', width: 95,
      render: (v: string) => <span style={{ fontFamily: 'monospace', fontWeight: 600, color: ACCENT }}>{v.replace(/\.(SH|SZ)$/, '')}</span>
    },
    { title: '名称', dataIndex: 'name', ellipsis: true,
      render: (v: string) => <span style={{ color: TEXT }}>{v}</span>
    },
    { title: '行业', dataIndex: 'industry', width: 80,
      render: (v: string) => <Tag style={{ fontSize: 11, margin: 0 }}>{v}</Tag>
    },
    { title: '最新价', dataIndex: 'price', width: 80, align: 'right' as const,
      render: (v: number) => <span style={{ fontFamily: 'monospace', color: TEXT, fontWeight: 600 }}>{Number(v).toFixed(2)}</span>
    },
    { title: '涨跌幅', dataIndex: 'changePercent', width: 85, align: 'right' as const,
      sorter: (a: StockData, b: StockData) => a.changePercent - b.changePercent,
      render: (v: number) => <span style={{ fontFamily: 'monospace', fontWeight: 700, color: v >= 0 ? COLOR_UP : COLOR_DOWN }}>
        {v >= 0 ? '+' : ''}{Number(v).toFixed(2)}%
      </span>
    },
    { title: '换手率', dataIndex: 'turnoverRate', width: 75, align: 'right' as const,
      render: (v?: number) => <span style={{ fontFamily: 'monospace', color: TEXT_SEC, fontSize: 12 }}>
        {v != null ? `${Number(v).toFixed(1)}%` : '—'}
      </span>
    },
    { title: '振幅', dataIndex: 'amplitude', width: 70, align: 'right' as const,
      render: (v?: number) => <span style={{ fontFamily: 'monospace', color: TEXT_SEC, fontSize: 12 }}>
        {v != null ? `${Number(v).toFixed(1)}%` : '—'}
      </span>
    },
    { title: 'PE', dataIndex: 'pe', width: 60, align: 'right' as const,
      render: (v?: number) => <span style={{ fontFamily: 'monospace', color: TEXT_SEC, fontSize: 12 }}>
        {v && v > 0 ? Number(v).toFixed(1) : '—'}
      </span>
    },
    { title: 'PB', dataIndex: 'pb', width: 60, align: 'right' as const,
      render: (v?: number) => <span style={{ fontFamily: 'monospace', color: TEXT_SEC, fontSize: 12 }}>
        {v && v > 0 ? Number(v).toFixed(2) : '—'}
      </span>
    },
    { title: '5日', width: 65, align: 'right' as const,
      render: (_: any, r: StockData) => {
        const t = techData[r.symbol];
        if (!t?.change5d && t?.change5d !== 0) return <span style={{ color: TEXT_SEC, fontSize: 11 }}>—</span>;
        const v = t.change5d!;
        return <span style={{ fontFamily: 'monospace', fontWeight: 600, fontSize: 11, color: v >= 0 ? COLOR_UP : COLOR_DOWN }}>{v >= 0 ? '+' : ''}{v.toFixed(1)}%</span>;
      }
    },
    { title: '20日', width: 65, align: 'right' as const,
      render: (_: any, r: StockData) => {
        const t = techData[r.symbol];
        if (!t?.change20d && t?.change20d !== 0) return <span style={{ color: TEXT_SEC, fontSize: 11 }}>—</span>;
        const v = t.change20d!;
        return <span style={{ fontFamily: 'monospace', fontWeight: 600, fontSize: 11, color: v >= 0 ? COLOR_UP : COLOR_DOWN }}>{v >= 0 ? '+' : ''}{v.toFixed(1)}%</span>;
      }
    },
    { title: 'MA偏离', width: 70, align: 'right' as const,
      render: (_: any, r: StockData) => {
        const t = techData[r.symbol];
        if (!t?.maDeviation && t?.maDeviation !== 0) return <span style={{ color: TEXT_SEC, fontSize: 11 }}>—</span>;
        const v = t.maDeviation!;
        return <span style={{ fontFamily: 'monospace', fontWeight: 600, fontSize: 11, color: v >= 0 ? COLOR_UP : COLOR_DOWN }}>{v >= 0 ? '+' : ''}{v.toFixed(1)}%</span>;
      }
    },
    { title: 'RSI', width: 50, align: 'right' as const,
      render: (_: any, r: StockData) => {
        const t = techData[r.symbol];
        if (t?.rsi14 == null) return <span style={{ color: TEXT_SEC, fontSize: 11 }}>—</span>;
        const v = t.rsi14;
        return <span style={{ fontFamily: 'monospace', fontWeight: 700, fontSize: 11, color: v >= 70 ? COLOR_DOWN : v <= 30 ? COLOR_UP : TEXT_SEC }}>{v}</span>;
      }
    },
    { title: '市值', dataIndex: 'marketCap', width: 85, align: 'right' as const,
      render: (v: string) => {
        const n = Number(v);
        if (n >= 1e4) return <span style={{ fontFamily: 'monospace', color: TEXT_SEC, fontSize: 12 }}>{(n/1e4).toFixed(0)}亿</span>;
        if (n > 0) return <span style={{ fontFamily: 'monospace', color: TEXT_SEC, fontSize: 12 }}>{n.toFixed(0)}万</span>;
        return <span style={{ color: TEXT_SEC }}>—</span>;
      }
    },
    { title: '操作', width: 80,
      render: (_: any, r: StockData) => (
        <Space size={4}>
          <Tooltip title={watchlistStore.has(r.symbol) ? '取消自选' : '加入自选'}>
            <Button type="text" size="small"
              icon={watchlistStore.has(r.symbol) ? <StarFilled style={{ color: GOLD }} /> : <StarOutlined />}
              onClick={() => toggleWatchlist(r.symbol, r.name)}
            />
          </Tooltip>
          <Button type="link" size="small" onClick={() => navigate(`/stocks/${r.symbol}`)}>详情</Button>
        </Space>
      ),
    },
  ];

  return (
    <div className="screener-page" style={{ background: BG, minHeight: '100vh', padding: '24px' }}>
      <div style={{ maxWidth: 1300, margin: '0 auto' }}>

        {/* 页面标题 */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
          <div>
            <Title level={3} style={{ color: TEXT, marginBottom: 8 }}>
              <FilterOutlined style={{ marginRight: 8 }} /> 策略选股
            </Title>
            <Text style={{ color: TEXT_SEC }}>8大策略模板 + 10个核心指标 × 5维度筛选</Text>
          </div>
        </div>

        {/* === 推荐策略（8个） === */}
        <Card
          title={<span style={{ color: TEXT, display: 'flex', alignItems: 'center', gap: 8 }}>
            <TrophyOutlined style={{ color: GOLD }} /> 推荐策略
            <Button type="link" size="small" onClick={() => setShowExplanations(!showExplanations)}
              icon={<InfoCircleOutlined />}>
              {showExplanations ? '收起说明' : '展开说明'}
            </Button>
          </span>}
          style={{ background: CARD_BG, border: `1px solid ${BORDER}`, marginBottom: 16 }}
          bodyStyle={{ padding: '16px' }}
        >
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10 }}>
            {STRATEGY_TEMPLATES.map(strategy => (
              <div key={strategy.id}
                onClick={() => selectStrategy(strategy.id)}
                style={{
                  background: activeStrategy === strategy.id ? `${strategy.color}18` : 'var(--bg-secondary)',
                  border: `1px solid ${activeStrategy === strategy.id ? strategy.color : BORDER}`,
                  borderRadius: 8, padding: '12px', cursor: 'pointer', transition: 'all 0.2s',
                  position: 'relative',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                  <span style={{ color: strategy.color, fontSize: 18 }}>{strategy.icon}</span>
                  <span style={{ color: TEXT, fontWeight: 700, fontSize: 13 }}>{strategy.name}</span>
                  {strategy.fetchFromApi && <Tag color="purple" style={{ fontSize: 9, margin: 0, padding: '0 4px', lineHeight: '16px' }}>AI</Tag>}
                </div>
                <div style={{ color: TEXT_SEC, fontSize: 11, marginBottom: 6 }}>{strategy.description}</div>
                <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                  {strategy.metrics.slice(0, 3).map(mid => {
                    const m = FILTER_METRICS.find(fm => fm.id === mid);
                    return m ? <Tag key={mid} style={{ fontSize: 9, margin: 0, padding: '0 4px', lineHeight: '16px', background: `${m.color}20`, color: m.color, border: 'none' }}>{m.name}</Tag> : null;
                  })}
                </div>
              </div>
            ))}
          </div>

          {/* 策略说明展开区 */}
          {showExplanations && activeStrategyObj && (
            <div style={{ marginTop: 16, padding: '14px 16px', background: 'var(--bg-secondary)', borderRadius: 8, borderLeft: `3px solid ${activeStrategyObj.color}` }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                <span style={{ color: activeStrategyObj.color, fontSize: 18 }}>{activeStrategyObj.icon}</span>
                <span style={{ color: TEXT, fontWeight: 700, fontSize: 14 }}>{activeStrategyObj.name} — 策略说明</span>
              </div>
              <div style={{ fontSize: 13, color: 'var(--text-primary)', lineHeight: 1.7 }}>
                {activeStrategyObj.explanation}
              </div>
              <div style={{ marginTop: 8, display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                <span style={{ fontSize: 11, color: TEXT_SEC }}>筛选指标：</span>
                {activeStrategyObj.metrics.map(mid => {
                  const m = FILTER_METRICS.find(fm => fm.id === mid);
                  return m ? (
                    <Tooltip key={mid} title={m.tooltip}>
                      <Tag style={{ fontSize: 10, cursor: 'help' }}>{m.name}: {m.description}</Tag>
                    </Tooltip>
                  ) : <Tag key={mid} style={{ fontSize: 10 }}>{mid}</Tag>;
                })}
              </div>
            </div>
          )}
        </Card>

        {/* === 核心指标（按维度分组） === */}
        <Card
          title={<span style={{ color: TEXT }}><FilterOutlined style={{ marginRight: 6 }} />核心指标 <span style={{ fontSize: 12, color: TEXT_SEC, fontWeight: 400 }}>— 行情 · 估值 · 财务 · 技术 · 行业 5维度</span></span>}
          style={{ background: CARD_BG, border: `1px solid ${BORDER}`, marginBottom: 16 }}
          bodyStyle={{ padding: '12px 16px' }}
        >
          {Object.entries(metricCategories).map(([cat, metrics]) => (
            <div key={cat} style={{ marginBottom: 8 }}>
              <div style={{ fontSize: 11, fontWeight: 600, color: TEXT_SEC, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 6 }}>
                {cat === '行情' && '📈 '}{cat === '估值' && '💰 '}{cat === '财务' && '🏢 '}{cat === '技术' && '⚡ '}{cat === '行业' && '🏭 '}
                {cat}
              </div>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {metrics.map(metric => (
                  <Tooltip key={metric.id} title={metric.tooltip}>
                    <div onClick={() => toggleMetric(metric.id)}
                      style={{
                        display: 'flex', alignItems: 'center', gap: 6, padding: '6px 12px',
                        background: activeMetrics.includes(metric.id) ? `${metric.color}18` : 'var(--bg-secondary)',
                        border: `1px solid ${activeMetrics.includes(metric.id) ? metric.color : BORDER}`,
                        borderRadius: 6, cursor: 'pointer', transition: 'all 0.15s',
                      }}
                    >
                      <span style={{ color: metric.color, fontSize: 14 }}>{metric.icon}</span>
                      <span style={{ color: activeMetrics.includes(metric.id) ? metric.color : TEXT, fontSize: 12, fontWeight: activeMetrics.includes(metric.id) ? 600 : 400 }}>
                        {metric.name}
                      </span>
                    </div>
                  </Tooltip>
                ))}
              </div>
            </div>
          ))}
        </Card>

        {/* AI 筛选 + 搜索 + 控制栏 */}
        <div style={{ display: 'flex', gap: 12, alignItems: 'center', marginBottom: 16, flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flex: 1, minWidth: 300 }}>
            <span style={{ fontSize: 16 }}>🤖</span>
            <input type="text" placeholder="自然语言筛选：如 涨幅超3%的科技股 或 市盈率低于20的银行股"
              value={aiFilterQuery} onChange={(e) => setAiFilterQuery(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') handleAiFilter(); }}
              style={{ flex: 1, background: 'var(--bg-secondary)', border: '1px solid var(--border-default)', borderRadius: 8, color: 'var(--text-primary)', fontSize: 13, outline: 'none', padding: '8px 12px' }}
            />
            <Button type="primary" loading={aiFilterLoading} onClick={handleAiFilter} style={{ borderRadius: 8 }}>AI筛选</Button>
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <span style={{ color: TEXT_SEC, fontSize: 13 }}>
              共 <b style={{ color: ACCENT }}>{filtered.length}</b> 只
            </span>
            {activeStrategyObj && <Tag color={activeStrategyObj.color}>{activeStrategyObj.name}</Tag>}
            {activeMetricLabels.map(name => <Tag key={name} color="blue">{name}</Tag>)}
          </div>
          <input type="text" placeholder="搜索代码/名称"
            value={searchText} onChange={(e) => { setSearchText(e.target.value); setPage(1); }}
            style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border-default)', borderRadius: 8, padding: '8px 12px', color: 'var(--text-primary)', fontSize: 13, width: 150, outline: 'none' }}
          />
          <Button icon={<ReloadOutlined />} onClick={fetchData} loading={loading} style={{ borderRadius: 8 }}>刷新</Button>
        </div>

        {/* AI筛选结果 */}
        {aiFilterResult && (
          <div style={{ marginBottom: 12, padding: '8px 12px', background: 'var(--accent-light)', borderRadius: 8, fontSize: 13, color: ACCENT }}>
            🤖 {aiFilterResult}
          </div>
        )}

        {/* AI潜力股 */}
        {activeStrategy === 'ai_gems' && (
          <Card
            title={<span style={{ color: TEXT, display: 'flex', alignItems: 'center', gap: 8 }}><RobotOutlined style={{ color: '#ec4899' }} /> AI潜力股 — Top 20</span>}
            loading={aiGemsLoading}
            style={{ background: 'linear-gradient(135deg, rgba(236,72,153,0.06), rgba(139,92,246,0.03))', border: '1px solid rgba(236,72,153,0.2)', marginBottom: 16 }}
          >
            {aiGems.length > 0 && (
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                  <thead>
                    <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.1)' }}>
                      <th style={{ padding: '8px 12px', textAlign: 'left', color: TEXT_SEC }}>#</th>
                      <th style={{ padding: '8px 12px', textAlign: 'left', color: TEXT_SEC }}>代码</th>
                      <th style={{ padding: '8px 12px', textAlign: 'left', color: TEXT_SEC }}>名称</th>
                      <th style={{ padding: '8px 12px', textAlign: 'right', color: TEXT_SEC }}>总分</th>
                      <th style={{ padding: '8px 12px', textAlign: 'right', color: TEXT_SEC }}>动量</th>
                      <th style={{ padding: '8px 12px', textAlign: 'right', color: TEXT_SEC }}>成交</th>
                      <th style={{ padding: '8px 12px', textAlign: 'right', color: TEXT_SEC }}>规模</th>
                      <th style={{ padding: '8px 12px', textAlign: 'right', color: TEXT_SEC }}>行业</th>
                    </tr>
                  </thead>
                  <tbody>
                    {aiGems.map((gem, i) => (
                      <tr key={gem.symbol} style={{ borderBottom: '1px solid rgba(255,255,255,0.05)', cursor: 'pointer' }}
                        onClick={() => navigate(`/stocks/${gem.symbol.replace(/\.(SH|SZ)$/, '')}`)}
                        onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.03)'}
                        onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                      >
                        <td style={{ padding: '8px 12px', color: TEXT_SEC }}>#{i + 1}</td>
                        <td style={{ padding: '8px 12px', fontFamily: 'monospace', color: ACCENT }}>{gem.symbol.replace(/\.(SH|SZ)$/, '')}</td>
                        <td style={{ padding: '8px 12px', color: TEXT, fontWeight: 600 }}>{gem.name}</td>
                        <td style={{ padding: '8px 12px', textAlign: 'right', color: '#ec4899', fontWeight: 800, fontSize: 16 }}>{gem.score}</td>
                        <td style={{ padding: '8px 12px', textAlign: 'right', color: TEXT_SEC }}>{gem.momentumScore}</td>
                        <td style={{ padding: '8px 12px', textAlign: 'right', color: TEXT_SEC }}>{gem.volumeScore}</td>
                        <td style={{ padding: '8px 12px', textAlign: 'right', color: TEXT_SEC }}>{gem.sizeScore}</td>
                        <td style={{ padding: '8px 12px', textAlign: 'right' }}><Tag style={{ fontSize: 11 }}>{gem.industry}</Tag></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        )}

        {/* 股票列表 */}
        <Card style={{ background: CARD_BG, border: `1px solid ${BORDER}` }} bodyStyle={{ padding: 0 }}>
          <Table
            dataSource={paged} columns={columns} loading={loading}
            rowKey="symbol" size="small"
            pagination={{
              current: page, pageSize, total: filtered.length,
              onChange: setPage, showSizeChanger: false,
              showTotal: (total) => `共 ${total} 只`,
            }}
            locale={{ emptyText: <Empty description="暂无符合条件的股票" /> }}
            style={{ background: 'transparent' }}
          />
        </Card>
      </div>
    </div>
  );
};

export default ScreenerPage;
