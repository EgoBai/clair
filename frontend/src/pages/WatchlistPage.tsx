/**
 * 📊 追踪中心 — Tracking Center
 * 全功能自选股追踪页面：分组管理 + 实时行情 + 异动提醒 + AI总结 + 策略信号
 * 
 * 修复 v2:
 *  - 表格列完整: 代码/名称/最新价/涨跌幅/PE/PB/市值/信号/操作
 *  - quotes 正确提取 peRatio/pbRatio/marketCap 字段
 *  - AI 建议/总结不可用时自动生成规则化替代内容
 */

import React, { useState, useCallback, useEffect, useRef, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Table, Button, Input, Modal, message, Tag, Space, Typography,
  Popconfirm, Empty, Card, Row, Col, Statistic, Badge, Tooltip, Spin,
} from 'antd';
import { EmptyState, EmptySearch } from '../components/Common/StateComponents';
import {
  PlusOutlined, SearchOutlined, FolderOutlined, StarFilled,
  CloseOutlined, ReloadOutlined, LineChartOutlined, EyeOutlined,
  DeleteOutlined, BellOutlined, AlertOutlined, RobotOutlined, ArrowUpOutlined, ArrowDownOutlined, MinusOutlined,
  InfoCircleOutlined, ThunderboltOutlined, UpOutlined, DownOutlined,
} from '@ant-design/icons';
import { safeGetItem, safeSetItem } from '../utils/safeStorage';
import { toast } from '../components/ui/toast';
import { apiFetch } from '../utils/api';
import { renderMarkdown } from '../utils/markdown';
import type { ColumnsType } from 'antd/es/table';

import { THEME, GOLD } from '../styles/theme-constants';
/* ─── Theme Constants ─── */
const BG = THEME.bg;
const CARD_BG = THEME.cardBg;
const CARD_BORDER = THEME.border;
const TEXT = THEME.text;
const TEXT_SEC = THEME.textSec;
const COLOR_UP = THEME.up;
const COLOR_DOWN = THEME.down;
const ACCENT = THEME.accent;
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
  peRatio?: number;
  pbRatio?: number;
  marketCap?: number;
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

/* ─── Helper: format market cap ─── */
function formatMarketCap(value: number | undefined | null): string {
  if (value == null || value === 0) return '—';
  const abs = Math.abs(value);
  if (abs >= 1e12) return (value / 1e12).toFixed(2) + '万亿';
  if (abs >= 1e8) return (value / 1e8).toFixed(2) + '亿';
  if (abs >= 1e4) return (value / 1e4).toFixed(2) + '万';
  return value.toFixed(0);
}

/* ─── Helper: rule-based AI summary ─── */
function generateRuleBasedSummary(
  symbols: string[],
  quotes: Record<string, StockQuote>,
  signals: Record<string, StrategySignal>,
  alerts: AlertItem[],
): string {
  if (symbols.length === 0) return '';

  const parts: string[] = [];

  // 总体表现
  const qValues = Object.values(quotes);
  const avgChange = qValues.length > 0
    ? qValues.reduce((s, q) => s + Number(q.changePercent || 0), 0) / qValues.length
    : 0;

  const upCount = qValues.filter(q => Number(q.changePercent) > 0).length;
  const downCount = qValues.filter(q => Number(q.changePercent) < 0).length;
  const flatCount = qValues.filter(q => Number(q.changePercent) === 0).length;

  parts.push(`**📈 今日追踪概览**`);
  parts.push(`- 追踪 **${symbols.length}** 只股票，今日平均涨跌 **${avgChange >= 0 ? '+' : ''}${avgChange.toFixed(2)}%**`);
  parts.push(`- 上涨 **${upCount}** 只，下跌 **${downCount}** 只${flatCount > 0 ? `，持平 ${flatCount} 只` : ''}`);

  // 涨跌分析
  if (qValues.length > 0) {
    const sorted = [...qValues].sort((a, b) => Number(b.changePercent) - Number(a.changePercent));
    // 重点关注极端表现
    const topGainers = sorted.filter(q => Number(q.changePercent) > 3);
    const topLosers = sorted.filter(q => Number(q.changePercent) < -3);

    if (topGainers.length > 0) {
      const list = topGainers.map(q => `${q.name}(**+${Number(q.changePercent).toFixed(2)}%**)`).join('、');
      parts.push(`\n**🔺 涨幅较大**：${list}`);
    }
    if (topLosers.length > 0) {
      const list = topLosers.map(q => `${q.name}(**${Number(q.changePercent).toFixed(2)}%**)`).join('、');
      parts.push(`\n**🔻 跌幅较大**：${list}`);
    }
  }

  // PE 估值分析
  const withPE = qValues.filter(q => q.peRatio != null && q.peRatio > 0);
  if (withPE.length > 0) {
    const avgPE = withPE.reduce((s, q) => s + (q.peRatio as number), 0) / withPE.length;
    const highPE = withPE.filter(q => (q.peRatio as number) > 50);
    const lowPE = withPE.filter(q => (q.peRatio as number) > 0 && (q.peRatio as number) < 15);
    parts.push(`\n**📊 估值概览**：平均 PE **${avgPE.toFixed(1)}** 倍`);
    if (lowPE.length > 0) {
      const list = lowPE.map(q => `${q.name}(PE ${(q.peRatio as number).toFixed(1)})`).join('、');
      parts.push(`- 低估值标的：${list}`);
    }
    if (highPE.length > 0) {
      const list = highPE.map(q => `${q.name}(PE ${(q.peRatio as number).toFixed(1)})`).join('、');
      parts.push(`- 高估值标的：${list}`);
    }
  }

  // 策略信号
  if (Object.keys(signals).length > 0) {
    const buySignals = Object.entries(signals).filter(([, s]) => s.signal === 'buy');
    const sellSignals = Object.entries(signals).filter(([, s]) => s.signal === 'sell');
    if (buySignals.length > 0) {
      const list = buySignals.map(([sym, s]) => `${quotes[sym]?.name || sym}(**${s.score}分**)`).join('、');
      parts.push(`\n**✅ 买入信号**：${list}`);
    }
    if (sellSignals.length > 0) {
      const list = sellSignals.map(([sym, s]) => `${quotes[sym]?.name || sym}(**${s.score}分**)`).join('、');
      parts.push(`\n**⚠️ 卖出信号**：${list}`);
    }
  }

  // 异动提醒
  const alertCount = alerts.reduce((s, a) => s + (a.alerts?.length || 0), 0);
  if (alertCount > 0) {
    parts.push(`\n**🚨 异动提醒**：共 **${alertCount}** 条，涉及 ${alerts.map(a => a.name).join('、')}`);
  } else {
    parts.push(`\n**✅ 无异动**：当前追踪组合表现平稳，暂无异常波动。`);
  }

  // 建议
  parts.push(`\n**💡 操作建议**：`);
  if (avgChange > 2) {
    parts.push(`- 组合整体强势，可适当关注获利了结时机`);
  } else if (avgChange < -2) {
    parts.push(`- 组合偏弱，注意控制仓位风险，等待市场企稳信号`);
  } else {
    parts.push(`- 组合整体平稳，可关注低估值标的的加仓机会`);
  }

  return parts.join('\n');
}

/* ─── Helper: rule-based AI recommendations ─── */
function generateRuleBasedRecommendations(
  symbols: string[],
  quotes: Record<string, StockQuote>,
): string {
  if (symbols.length === 0) return '';

  const parts: string[] = [];
  const qValues = Object.values(quotes);

  parts.push(`**🎯 基于您的关注偏好分析**\n`);

  // 行业偏好分析
  const industries = qValues
    .filter(q => q.industry)
    .map(q => q.industry as string);
  const industryCount: Record<string, number> = {};
  industries.forEach(ind => { industryCount[ind] = (industryCount[ind] || 0) + 1; });
  const topIndustries = Object.entries(industryCount)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3);

  if (topIndustries.length > 0) {
    const indList = topIndustries.map(([ind, cnt]) => `**${ind}**(${cnt}只)`).join('、');
    parts.push(`- 行业偏好：${indList}`);
  }

  // 风格偏好
  const withPE = qValues.filter(q => q.peRatio != null && q.peRatio > 0);
  if (withPE.length > 0) {
    const avgPE = withPE.reduce((s, q) => s + (q.peRatio as number), 0) / withPE.length;
    const avgPB = qValues.filter(q => q.pbRatio != null).reduce((s, q) => s + (q.pbRatio as number), 0) /
      qValues.filter(q => q.pbRatio != null).length || 0;

    let style = '';
    if (avgPE > 40) style = '成长型偏好，偏向高估值成长股';
    else if (avgPE > 20) style = '均衡型偏好，兼顾价值与成长';
    else style = '价值型偏好，偏向低估值蓝筹';

    parts.push(`- 估值风格：${style}（平均 PE ${avgPE.toFixed(1)}，PB ${avgPB.toFixed(2)}）`);
  }

  // 市值偏好
  const withMC = qValues.filter(q => q.marketCap != null && q.marketCap > 0);
  if (withMC.length > 0) {
    const avgMC = withMC.reduce((s, q) => s + (q.marketCap as number), 0) / withMC.length;
    let size = '';
    if (avgMC > 1e11) size = '大盘蓝筹偏好';
    else if (avgMC > 5e10) size = '中盘股偏好';
    else size = '中小盘偏好';
    parts.push(`- 市值偏好：${size}（平均市值 ${formatMarketCap(avgMC)}）`);
  }

  // 推荐逻辑
  parts.push(`\n**📋 推荐关注方向**\n`);

  if (topIndustries.length > 0) {
    const primaryIndustry = topIndustries[0][0];

    // 同行业补涨标的
    parts.push(`1. **同行业补涨标的**：在 **${primaryIndustry}** 板块中，关注涨幅落后的优质个股，存在补涨机会`);

    // 产业链延伸
    const chainMap: Record<string, string> = {
      '白酒': '食品饮料、消费升级相关标的',
      '新能源': '锂电材料、光伏、储能产业链',
      '汽车': '智能驾驶、汽车零部件、充电桩',
      '半导体': '芯片设计、封装测试、半导体设备',
      '医药': '创新药、医疗器械、CXO服务',
      '银行': '券商、保险等金融板块',
      '房地产': '建材、家居、物业管理',
    };
    const chain = chainMap[primaryIndustry] || '相关产业链上下游';
    parts.push(`2. **产业链延伸**：关注 ${chain}`);

    // 估值对比
    if (withPE.length > 0) {
      const lowPEStocks = withPE.filter(q => (q.peRatio as number) > 0 && (q.peRatio as number) < 20);
      if (lowPEStocks.length > 0) {
        const sample = lowPEStocks.slice(0, 2).map(q => q.name).join('、');
        parts.push(`3. **低估值机会**：当前组合中 ${sample} 等 PE 较低，可在同类行业中寻找估值更优的标的`);
      }
    }
  }

  // 动量延续
  const strongStocks = qValues.filter(q => Number(q.changePercent) > 2);
  if (strongStocks.length > 0) {
    const sample = strongStocks.slice(0, 2).map(q => q.name).join('、');
    parts.push(`4. **动量延续**：${sample} 表现强势，关注同板块的跟涨机会`);
  }

  // 风险提示
  parts.push(`\n**⚠️ 风险提示**`);
  parts.push(`- 以上推荐基于规则化分析，不构成投资建议`);
  parts.push(`- 建议结合基本面和资金面综合判断`);
  parts.push(`- 分散配置，控制单只股票仓位不超过 20%`);
  parts.push(`- 设置止损位，严格执行交易纪律`);

  return parts.join('\n');
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
          background: 'var(--bg-page)',
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
        <EmptySearch query={query} />
      )}
      {!query && (
        <EmptyState
          icon={<SearchOutlined />}
          title="输入代码或名称开始搜索"
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
          background: 'var(--bg-page)',
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
      const saved = safeGetItem(STORAGE_KEY);
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
  const [aiRecommendations, setAiRecommendations] = useState<string>('');
  const [aiRecommendationsLoading, setAiRecommendationsLoading] = useState(false);

  const fetchTimerRef = useRef<ReturnType<typeof setInterval>>();
  const _refreshIconRef = useRef<HTMLDivElement>(null);

  /* Derived state */
  const currentGroup = useMemo(
    () => groups.find(g => g.id === activeGroup) || groups[0],
    [groups, activeGroup],
  );
  const symbols = useMemo(() => currentGroup?.stocks?.map(s => s.symbol) || [], [currentGroup]);
  const totalCount = useMemo(() => groups.reduce((s, g) => s + g.stocks.length, 0), [groups]);

  /* ─── Stats ─── */
  const stats = useMemo(() => {
    const qValues = Object.values(quotes);
    const avgChange = qValues.length > 0
      ? qValues.reduce((s, q) => s + Number(q.changePercent || 0), 0) / qValues.length
      : 0;
    const alertCount = alerts.reduce((s, a) => s + (a.alerts?.length || 0), 0);
    return { total: symbols.length, avgChange, alertCount };
  }, [quotes, alerts, symbols.length]);

  /* ─── Persist groups ─── */
  useEffect(() => {
    safeSetItem(STORAGE_KEY, JSON.stringify(groups));
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
            price: q.closePrice ?? q.close_price ?? q.price ?? 0,
            changePercent: q.changePercent ?? q.change_percent ?? 0,
            change: q.change ?? q.change_amount ?? 0,
            volume: q.volume,
            turnoverRate: q.turnoverRate ?? q.turnover_rate,
            industry: q.industry || s.industry,
            peRatio: q.peRatio ?? q.pe_ratio ?? undefined,
            pbRatio: q.pbRatio ?? q.pb_ratio ?? undefined,
            marketCap: q.marketCap ?? q.market_cap ?? undefined,
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
      setAlerts(data.data?.alerts || []);
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

  /* ─── Fetch AI summary (with rule-based fallback) ─── */
  const fetchAiSummary = useCallback(async () => {
    if (symbols.length === 0) { setAiSummary(''); return; }
    setAiSummaryLoading(true);

    // Generate rule-based fallback immediately
    const fallbackSummary = generateRuleBasedSummary(symbols, quotes, signals, alerts);
    setAiSummary(fallbackSummary);

    try {
      const quoteData = symbols.map(sym => {
        const q = quotes[sym];
        return {
          symbol: sym,
          name: q?.name || '',
          price: q?.price || 0,
          changePercent: q?.changePercent || 0,
          turnoverRate: q?.turnoverRate || 0,
          peRatio: q?.peRatio,
          pbRatio: q?.pbRatio,
          marketCap: q?.marketCap,
        };
      });
      const resp = await apiFetch('/api/ai/watchlist-summary', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ symbols, quotes: quoteData }),
      });
      const data = await resp.json();
      if (data.summary) setAiSummary(data.summary);
      // If API returns nothing, the fallback is already set above
    } catch {
      // Use the already-set rule-based fallback
    } finally {
      setAiSummaryLoading(false);
    }
  }, [symbols.join(','), JSON.stringify(quotes), JSON.stringify(signals), JSON.stringify(alerts)]);

  /* ─── Fetch AI recommendations (with rule-based fallback) ─── */
  const fetchAiRecommendations = useCallback(async () => {
    if (symbols.length === 0) { setAiRecommendations(''); return; }
    setAiRecommendationsLoading(true);

    // Generate rule-based fallback immediately
    const fallbackRecs = generateRuleBasedRecommendations(symbols, quotes);
    setAiRecommendations(fallbackRecs);

    try {
      const stockList = symbols.map(sym => {
        const q = quotes[sym];
        const namePart = q?.name ?? '';
        const industryPart = q?.industry ?? '';
        const pePart = q?.peRatio ?? 'N/A';
        const pbPart = q?.pbRatio ?? 'N/A';
        return `${sym}(${namePart}, ${industryPart}, PE:${pePart}, PB:${pbPart})`;
      }).join('、');

      const resp = await apiFetch('/api/ai/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: `用户正在关注这些股票：${stockList}。

请基于用户的关注偏好，推荐3-5只相似的、值得关注的A股。推荐理由要具体，说明为什么这些股票值得加入自选。

格式要求：
1. 先分析用户的偏好特征（行业/风格）
2. 推荐股票（代码、名称、理由）
3. 风险提示`,
          stream: false,
        }),
      });
      const data = await resp.json();
      if (data?.content) {
        setAiRecommendations(data.content);
      }
      // If API returns nothing, the fallback is already set above
    } catch {
      // Use the already-set rule-based fallback
    } finally {
      setAiRecommendationsLoading(false);
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

  /* ─── Auto-fetch AI recommendations after quotes load ─── */
  useEffect(() => {
    if (symbols.length > 0 && Object.keys(quotes).length > 0) {
      fetchAiRecommendations();
    }
  }, [quotes, fetchAiRecommendations]);

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
    toast('已添加到自选股', { type: 'success' });
  }, [activeGroup]);

  const handleRemoveStock = useCallback((symbol: string, stockName: string) => {
    setGroups(prev => prev.map(g => ({
      ...g,
      stocks: g.stocks.filter(s => s.symbol !== symbol),
    })));
    setQuotes(prev => { const n = { ...prev }; delete n[symbol]; return n; });
    setSignals(prev => { const n = { ...prev }; delete n[symbol]; return n; });
    toast('已从自选股移除', { type: 'info' });
  }, []);

  const handleMoveStock = useCallback((symbol: string, direction: 'up' | 'down') => {
    setGroups(prev => prev.map(g => {
      if (g.id !== activeGroup) return g;
      const idx = g.stocks.findIndex(s => s.symbol === symbol);
      if (idx === -1) return g;
      const newIdx = direction === 'up' ? idx - 1 : idx + 1;
      if (newIdx < 0 || newIdx >= g.stocks.length) return g;
      const newStocks = [...g.stocks];
      [newStocks[idx], newStocks[newIdx]] = [newStocks[newIdx], newStocks[idx]];
      return { ...g, stocks: newStocks };
    }));
  }, [activeGroup]);

  const handleMoveStockToGroup = useCallback((symbol: string, targetGroupId: string) => {
    setGroups(prev => {
      const sourceGroup = prev.find(g => g.id === activeGroup);
      const targetGroup = prev.find(g => g.id === targetGroupId);
      if (!sourceGroup || !targetGroup) return prev;
      const stock = sourceGroup.stocks.find(st => st.symbol === symbol);
      if (!stock) return prev;
      return prev.map(g => {
        if (g.id === activeGroup) return { ...g, stocks: g.stocks.filter(st => st.symbol !== symbol) };
        if (g.id === targetGroupId) return { ...g, stocks: [...g.stocks, { ...stock, groupId: targetGroupId }] };
        return g;
      });
    });
    toast('已移动到新分组', { type: 'success' });
  }, [activeGroup, groups]);

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
            color: Number(q.changePercent) >= 0 ? COLOR_UP : COLOR_DOWN,
            fontSize: 13,
          }}>
            ¥{Number(q.price).toFixed(2)}
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
        const color = Number(q.changePercent) >= 0 ? COLOR_UP : COLOR_DOWN;
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
            {Number(q.changePercent) > 0 ? <ArrowUpOutlined style={{ fontSize: 10 }} /> : Number(q.changePercent) < 0 ? <ArrowDownOutlined style={{ fontSize: 10 }} /> : <MinusOutlined style={{ fontSize: 10 }} />}
            {Number(q.changePercent) >= 0 ? '+' : ''}{Number(q.changePercent).toFixed(2)}%
          </span>
        );
      },
    },
    {
      title: 'PE',
      width: 70,
      align: 'right' as const,
      className: 'hide-mobile',
      render: (_: unknown, r: WatchlistStock) => {
        const q = quotes[r.symbol];
        if (!q || q.peRatio == null || q.peRatio === 0) return <Text type="secondary" style={{ fontSize: 12, color: TEXT_SEC }}>—</Text>;
        const peColor = q.peRatio > 50 ? COLOR_UP : q.peRatio > 20 ? GOLD : COLOR_DOWN;
        return (
          <span style={{ fontFamily: 'monospace', fontSize: 12, color: peColor, fontWeight: 600 }}>
            {Number(q.peRatio).toFixed(1)}
          </span>
        );
      },
    },
    {
      title: 'PB',
      width: 70,
      align: 'right' as const,
      className: 'hide-mobile',
      render: (_: unknown, r: WatchlistStock) => {
        const q = quotes[r.symbol];
        if (!q || q.pbRatio == null || q.pbRatio === 0) return <Text type="secondary" style={{ fontSize: 12, color: TEXT_SEC }}>—</Text>;
        return (
          <span style={{ fontFamily: 'monospace', fontSize: 12, color: TEXT, fontWeight: 600 }}>
            {Number(q.pbRatio).toFixed(2)}
          </span>
        );
      },
    },
    {
      title: '市值',
      width: 85,
      align: 'right' as const,
      className: 'hide-mobile',
      render: (_: unknown, r: WatchlistStock) => {
        const q = quotes[r.symbol];
        if (!q || q.marketCap == null) return <Text type="secondary" style={{ fontSize: 12, color: TEXT_SEC }}>—</Text>;
        return (
          <span style={{ fontFamily: 'monospace', fontSize: 12, color: TEXT_SEC, fontWeight: 500 }}>
            {formatMarketCap(q.marketCap)}
          </span>
        );
      },
    },
    {
      title: '换手率',
      className: 'hide-mobile',
      width: 75,
      align: 'right' as const,
      render: (_: unknown, r: WatchlistStock) => {
        const q = quotes[r.symbol];
        if (!q?.turnoverRate) return <Text type="secondary" style={{ fontSize: 12, color: TEXT_SEC }}>—</Text>;
        return (
          <span style={{ fontFamily: 'monospace', fontSize: 12, color: TEXT_SEC }}>
            {Number(q.turnoverRate).toFixed(2)}%
          </span>
        );
      },
    },
    {
      title: '信号',
      width: 70,
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
      width: 160,
      align: 'center' as const,
      render: (_: unknown, r: WatchlistStock, index: number) => {
        const stockList = currentGroup?.stocks || [];
        return (
          <Space size={2} wrap>
            <div style={{ display: 'inline-flex', gap: 1 }}>
              <Tooltip title="上移">
                <Button
                  type="text"
                  size="small"
                  icon={<UpOutlined />}
                  disabled={index === 0}
                  onClick={(e) => { e.stopPropagation(); handleMoveStock(r.symbol, 'up'); }}
                  style={{ fontSize: 10, padding: '0 4px', color: index === 0 ? '#333' : TEXT_SEC }}
                />
              </Tooltip>
              <Tooltip title="下移">
                <Button
                  type="text"
                  size="small"
                  icon={<DownOutlined />}
                  disabled={index === stockList.length - 1}
                  onClick={(e) => { e.stopPropagation(); handleMoveStock(r.symbol, 'down'); }}
                  style={{ fontSize: 10, padding: '0 4px', color: index === stockList.length - 1 ? '#333' : TEXT_SEC }}
                />
              </Tooltip>
            </div>
            {groups.length > 1 && (
              <select
                value={activeGroup}
                onChange={(e) => {
                  e.stopPropagation();
                  handleMoveStockToGroup(r.symbol, e.target.value);
                }}
                onClick={(e) => e.stopPropagation()}
                style={{
                  fontSize: 10,
                  padding: '1px 4px',
                  borderRadius: 4,
                  background: 'transparent',
                  border: `1px solid ${CARD_BORDER}`,
                  color: TEXT_SEC,
                  cursor: 'pointer',
                  lineHeight: '16px',
                }}
              >
                {groups.map(g => (
                  <option key={g.id} value={g.id}>{g.id === activeGroup ? '当前' : g.name}</option>
                ))}
              </select>
            )}
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
        );
      },
    },
  ];

  /* ─── Render ─── */
  return (
    <div className="watchlist-page" style={{ minHeight: '100vh', background: BG, padding: '24px 32px' }}>
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
                return (
                  <div
                    key={sym}
                    onClick={() => navigate(`/stocks/${sym}`)}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 8,
                      padding: '8px 12px', background: 'var(--bg-surface)',
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
                  background: activeGroup === g.id ? ACCENT : 'var(--bg-surface)',
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
              dataSource={currentGroup?.stocks || []}
              columns={columns}
              rowKey="symbol"
              size="middle"
              pagination={false}
              loading={quotesLoading && symbols.length > 0}
              scroll={{ x: 'max-content', y: 500 }}
              style={{ background: 'transparent' }}
              onRow={r => ({
                style: {
                  cursor: 'pointer',
                  borderBottom: `1px solid ${CARD_BORDER}`,
                },
              onClick: () => goToDetail(r.symbol),
            })}
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
                <div
                  style={{ color: TEXT, fontSize: 13, lineHeight: 1.8 }}
                  dangerouslySetInnerHTML={{ __html: renderMarkdown(aiSummary) }}
                />
              ) : (
                <div
                  style={{ color: TEXT, fontSize: 13, lineHeight: 1.8 }}
                  dangerouslySetInnerHTML={{
                    __html: renderMarkdown(generateRuleBasedSummary(symbols, quotes, signals, alerts))
                  }}
                />
              )}
            </div>
            <Tooltip title="基于行情数据的智能分析">
              <InfoCircleOutlined style={{ color: TEXT_SEC, fontSize: 14 }} />
            </Tooltip>
          </div>
        </Card>

        {/* ── AI Recommendations Card ── */}
        <Card
          style={{
            background: 'linear-gradient(135deg, rgba(139,92,246,0.06), rgba(139,92,246,0.02))',
            border: '1px solid rgba(139,92,246,0.2)',
            borderRadius: 10,
            marginBottom: 20,
          }}
          styles={{ body: { padding: '20px 24px' } }}
        >
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
            <RobotOutlined style={{ color: '#8b5cf6', fontSize: 20, marginTop: 2 }} />
            <div style={{ flex: 1 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                <Text strong style={{ color: '#8b5cf6', fontSize: 15 }}>
                  🎯 AI 推荐发现
                </Text>
                <Button
                  type="primary"
                  size="small"
                  loading={aiRecommendationsLoading}
                  onClick={fetchAiRecommendations}
                  disabled={symbols.length === 0}
                  style={{ background: '#8b5cf6', borderColor: '#8b5cf6' }}
                >
                  {aiRecommendations ? '重新推荐' : '获取推荐'}
                </Button>
              </div>
              {aiRecommendationsLoading ? (
                <div style={{ color: TEXT_SEC, fontSize: 13, lineHeight: 1.6 }}>
                  <Spin size="small" style={{ marginRight: 8 }} />
                  AI 正在分析您的关注偏好...
                </div>
              ) : aiRecommendations ? (
                <div
                  style={{ color: TEXT, fontSize: 13, lineHeight: 1.8 }}
                  dangerouslySetInnerHTML={{ __html: renderMarkdown(aiRecommendations) }}
                />
              ) : (
                <div
                  style={{ color: TEXT, fontSize: 13, lineHeight: 1.8 }}
                  dangerouslySetInnerHTML={{
                    __html: renderMarkdown(generateRuleBasedRecommendations(symbols, quotes))
                  }}
                />
              )}
            </div>
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
