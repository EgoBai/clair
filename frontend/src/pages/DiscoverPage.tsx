/**
 * 发掘页 v3 🔭 — 核心循环入口
 * 大盘 → 板块景气度评分 → 个股深挖
 * 陪伴式引导：全宽AI解读 + 关键数据高亮 + 双栏布局
 * v3.1: 统一展示(行业/概念) + 评分优化(公式标注/分数格式/颜色渐变)
 */

import React, { useState, useEffect, useMemo, useCallback, Suspense } from 'react';
import { useNavigate } from 'react-router-dom';
import { Table, Tag, Spin, Empty, Typography, Badge, Progress, Tooltip, message, Button, Alert, Result } from 'antd';
import { LoadingState } from '../components/Common/StateComponents';
import { CompassOutlined, RightOutlined, StarOutlined, ArrowLeftOutlined, FilterOutlined, ApartmentOutlined, ReloadOutlined } from '@ant-design/icons';

const { Title, Text, Paragraph } = Typography;

import { safeGetItem, safeSetItem } from '../utils/safeStorage';
import { DEMO_MARKET_SUMMARY, DEMO_L2_INDUSTRIES, buildDemoMultidim, buildDemoScores } from '../utils/demoData';
const EChartsWrapper = React.lazy(() => import('../components/Charts/EChartsWrapper'));
import { THEME, GOLD } from '../styles/theme-constants';
const BG = THEME.bg;
const CARD_BG = THEME.cardBg;
const BORDER = THEME.border;
const TEXT = THEME.text;
const TEXT_SEC = THEME.textSec;
const COLOR_UP = THEME.up;
const COLOR_DOWN = THEME.down;
const ACCENT = THEME.accent;

interface IndexData { name: string; symbol: string; closePrice: number; changePercent: number; volume: number; category?: string; }
interface SectorScore { industry: string;
 score: number; changeScore: number; volumeScore: number; breadthScore: number; momentumScore?: number; stock_count: number; avg_change_percent: number; total_turnover: number; limit_up_count: number; avgChange?: number; }

interface MultidimData {
  industry: string;
  totalScore: number;
  maxScore: number;
  boomScore: number;
  crowdingScore: number;
  dimensions: {
    crowding:      { score: number; label: string };
    diffusion:     { score: number; label: string };
    concentration: { score: number; label: string };
    retail:        { score: number; label: string };
    recovery:      { score: number; label: string };
    panic:         { score: number; label: string };
    volatility:    { score: number; label: string };
    momIndex:      { score: number; label: string };
    searchHeat:    { score: number; label: string };
    spreadDegree:  { score: number; label: string };
    momentumPosition: { score: number; label: string };
    zScore:        { score: number; label: string };
    leverage:      { score: number; label: string };
    fundFlow:      { score: number; label: string };
  };
}

interface StockData { symbol: string; name: string; price: number; changePercent: number; turnoverRate?: number; peRatio?: number; market: string; }

/** Highlight numbers in text: percentages in green/red, plain numbers in monospace bold */
function renderInsightLine(line: string) {
  const trimmed = line.trim();
  if (!trimmed) return null;
  
  const isBullet = trimmed.startsWith('·') || trimmed.startsWith('-') || trimmed.startsWith('•');
  
  const parts = trimmed.split(/(\*\*[^*]+\*\*)/g).map((part, idx) => {
    if (part.startsWith('**') && part.endsWith('**')) {
      return <b key={idx} style={{ color: 'var(--color-highlight, #60a5fa)', fontWeight: 700 }}>{part.slice(2, -2)}</b>;
    }
    // Color percentages and key numbers
    const segments = part.split(/([+-]?\d+\.?\d*%|[+-]?\d+\.?\d*[万亿]|[+-]?\d+\.?\d*倍)/g);
    return <React.Fragment key={idx}>
      {segments.map((seg, sIdx) => {
        if (/^[+-]?\d+/.test(seg)) {
          const isPositive = seg.startsWith('+') || (!seg.startsWith('-') && /^\d/.test(seg) && (seg.includes('%') || seg.includes('亿') || seg.includes('万')));
          if (seg.includes('%') || seg.includes('涨') || seg.includes('跌')) {
            return <span key={sIdx} style={{ fontWeight: 700, fontFamily: 'monospace', color: isPositive && !seg.includes('跌') ? COLOR_UP : seg.includes('跌') ? COLOR_DOWN : 'var(--text-primary)' }}>{seg}</span>;
          }
          return <span key={sIdx} style={{ fontWeight: 600, fontFamily: 'monospace', color: 'var(--text-primary)' }}>{seg}</span>;
        }
        return <span key={sIdx}>{seg}</span>;
      })}
    </React.Fragment>;
  });

  return (
    <div style={{
      marginBottom: 6, paddingLeft: isBullet ? 16 : 0,
      color: 'var(--text-primary)', display: 'flex', alignItems: 'flex-start', gap: 6,
    }}>
      {isBullet && <span style={{ color: ACCENT, flexShrink: 0, marginTop: 2 }}>›</span>}
      <span>{parts}</span>
    </div>
  );
}

// 维度颜色: 0-5红, 6-10黄, 11-15绿, 16-20蓝
const getDimColor = (score: number): string => {
  if (score <= 5) return '#ef4444';
  if (score <= 10) return '#f59e0b';
  if (score <= 15) return '#22c55e';
  return '#3b82f6';
};
const getDimBg = (score: number): string => {
  const c = getDimColor(score);
  return c + '18';
};
const getDimBorder = (score: number): string => {
  const c = getDimColor(score);
  return c + '40';
};

// 维度公式说明映射
const dimFormulaMap: Record<string, string> = {
  crowding: '拥挤度=PE分位数×15+资金集中度×5 (越高越拥挤)',
  diffusion: '扩散程度=站上MA20的股票占比×20',
  concentration: '集中度=前5大权重股成交占比×20',
  retail: '散户情绪=散户买入占比×20 (越高越危险)',
  recovery: '回补动能=MACD金叉股票占比×20',
  panic: '恐慌指数=(1-VIX归一化)×20 (越低越恐慌)',
  volatility: '波动率=历史波动率分位×20 (越高越动荡)',
  momIndex: '动量指数=RSI>60的股票占比×20',
  searchHeat: '搜索热度=百度搜索指数归一化×20',
  spreadDegree: '传播度=舆情扩散速率×20',
  momentumPosition: '动量仓位=机构仓位变化率×20',
  zScore: 'Z值=(PE-均值)/标准差×20归一化',
  leverage: '杠杆率=融资余额/流通市值×20',
  fundFlow: '基金流向=ETF资金净流入归一化×20',
};
const dimLabelMap: Record<string, string> = {
  crowding: '拥挤度', diffusion: '扩散度', concentration: '集中度', retail: '散户情绪',
  recovery: '回补动能', panic: '恐慌指数', volatility: '波动率', momIndex: '动量指数',
  searchHeat: '搜索热度', spreadDegree: '传播度', momentumPosition: '动量仓位',
  zScore: 'Z值', leverage: '杠杆率', fundFlow: '基金流向',
};

const DiscoverPage: React.FC = () => {
  const navigate = useNavigate();
  const [indices, setIndices] = useState<IndexData[]>([]);
  const [scores, setScores] = useState<SectorScore[]>([]);
  const [multidimMap, setMultidimMap] = useState<Record<string, MultidimData>>({});
  const [marketSummary, setMarketSummary] = useState<any>(null);
  const [selectedSector, setSelectedSector] = useState<SectorScore | null>(null);
  const [sectorStocks, setSectorStocks] = useState<StockData[]>([]);
  const [view, setView] = useState<'market' | 'sector'>('market');
  const [loading, setLoading] = useState(true);
  const [insight, setInsight] = useState<any>(null);
  const [insightLoading, setInsightLoading] = useState(false);
  const [sectorType, setSectorType] = useState<'industry' | 'concept'>('industry');
  const [industryLevel, setIndustryLevel] = useState<1 | 2>(1);
  const [l2Industries, setL2Industries] = useState<Array<{parent?: string; name: string; stock_count: number; avg_change: string; avg_turnover: string; total_cap: string}>>([]);
  const [news, setNews] = useState<any[]>([]);
  const [loadError, setLoadError] = useState(false);
  const [summaryError, setSummaryError] = useState(false);
  const [usingDemoData, setUsingDemoData] = useState(false);
  // 列表 / 热力图 视图切换（热力图作为独立可切换区块）
  const [displayMode, setDisplayMode] = useState<'list' | 'heatmap'>('list');
  // 列表排序维度：综合评分(默认) / 景气度 / 交易拥挤度 / 涨跌幅
  const [sortBy, setSortBy] = useState<'default' | 'boom' | 'crowding' | 'change'>('default');
  // 热力图内部行排序（按景气度 / 按拥挤度）
  const [heatmapSort, setHeatmapSort] = useState<'boom' | 'crowding'>('boom');
  const [isMobileHeatmap, setIsMobileHeatmap] = useState(window.innerWidth < 768);
  useEffect(() => {
    const handler = () => setIsMobileHeatmap(window.innerWidth < 768);
    window.addEventListener('resize', handler);
    return () => window.removeEventListener('resize', handler);
  }, []);

  // Load market overview + scores (fast, show immediately)
  useEffect(() => {
    (async () => {
      setLoading(true);
      setInsightLoading(true);
      setLoadError(false);
      setSummaryError(false);
      setUsingDemoData(false);
      const apiPath = sectorType === 'industry' ? '/api/sectors/momentum' : '/api/sectors/concept';
      
      let mRes: any = null;
      let hasCriticalError = false;
      
      try {
        const results = await Promise.allSettled([
          fetch('/api/market/indices').then(r => r.json()),
          fetch(apiPath).then(r => r.json()),
          fetch('/api/market/summary').then(r => r.json()),
        ]);
        
        // indices
        if (results[0].status === 'fulfilled') {
          setIndices(results[0].value.data?.indices || []);
        } else {
          setIndices((DEMO_MARKET_SUMMARY.indices || []).map(idx => ({
            name: idx.name, symbol: idx.symbol,
            closePrice: idx.close_price, changePercent: idx.change_percent, volume: 0,
          })));
          setUsingDemoData(true);
        }
        // sectors
        if (results[1].status === 'fulfilled') {
          const secs = (results[1].value.data?.sectors || []) as SectorScore[];
          // 200 但 sectors 为空 → 演示兜底（概念/行业区分）
          let finalScores: SectorScore[];
          if (secs.length > 0) {
            finalScores = secs;
          } else {
            finalScores = buildDemoScores(sectorType);
            setUsingDemoData(true);
          }
          setScores(finalScores);

          // 统一预加载多维度数据 (v3 batch API) — 行业/概念均适用
          const codes = finalScores.slice(0, 15).map(s => s.industry);
          if (codes.length > 0) {
            fetch('/api/sectors/multidim-v3/batch', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ codes, mode: sectorType }),
            }).then(r => r.json()).then(d => {
              const map: Record<string, MultidimData> = {};
              if (d?.data?.sectors) {
                d.data.sectors.forEach((item: MultidimData) => {
                  map[item.industry] = item;
                });
              }
              // v3 未返回有效数据 → 演示多因子兜底
              setMultidimMap(Object.keys(map).length > 0 ? map : buildDemoMultidim(finalScores));
            }).catch(() => {
              // 降级: v3不可用 → 逐个请求 v2
              console.warn('[DiscoverPage] multidim-v3 batch failed, fallback to v2');
              Promise.allSettled(codes.map((code: string) =>
                fetch(`/api/sectors/${encodeURIComponent(code)}/multidim-v2`).then(r => r.json())
              )).then(results => {
                const map: Record<string, MultidimData> = {};
                results.forEach((r: any) => {
                  if (r.status === 'fulfilled' && r.value?.data) {
                    map[r.value.data.industry || r.value.data.sectorName] = r.value.data;
                  }
                });
                // v2 仍为空 → 演示多因子兜底
                setMultidimMap(Object.keys(map).length > 0 ? map : buildDemoMultidim(finalScores));
              }).catch(() => {
                setMultidimMap(buildDemoMultidim(finalScores));
              });
            });
          } else {
            setMultidimMap({});
          }
        } else {
          // sectors 请求失败（rejected）→ 概念/行业区分兜底
          const finalScores = buildDemoScores(sectorType);
          setScores(finalScores);
          setMultidimMap(buildDemoMultidim(finalScores));
          setUsingDemoData(true);
        }
        // summary
        if (results[2].status === 'fulfilled' && results[2].value?.data) {
          setMarketSummary(results[2].value.data);
        } else {
          setMarketSummary(DEMO_MARKET_SUMMARY);
          setSummaryError(true);
          setUsingDemoData(true);
        }
      } catch {
        setIndices((DEMO_MARKET_SUMMARY.indices || []).map(idx => ({
          name: idx.name, symbol: idx.symbol,
          closePrice: idx.close_price, changePercent: idx.change_percent, volume: 0,
        })));
        const demoScores = buildDemoScores(sectorType);
        setScores(demoScores);
        setMultidimMap(buildDemoMultidim(demoScores));
        setMarketSummary(DEMO_MARKET_SUMMARY);
        setUsingDemoData(true);
      }
      
      if (hasCriticalError) setLoadError(true);
      setLoading(false);

      // AI insight: instant rule-based (0 delay)
      fetch('/api/ai/market-insight').then(r => r.json()).then(d => {
        if (d?.data) { setInsight(d.data); setInsightLoading(false); }
      }).catch(() => setInsightLoading(false));

      // LLM enhanced insight loads in background
      fetch('/api/ai/market-insight-llm').then(r => r.json()).then(d => {
        if (d?.data) setInsight(d.data);
      }).catch(() => {});

      // News loads in background
      fetch('/api/news?limit=6').then(r => r.json()).then(d => setNews(d.data || [])).catch(() => {});
    })();
  }, [sectorType]);

  // Load L2 industries
  useEffect(() => {
    if (sectorType === 'industry' && industryLevel === 2) {
      setL2Industries([]);
      fetch('/api/industries?level=2')
        .then(r => r.json())
        .then(d => {
          if (d.success && d.data?.industries && d.data.industries.length > 0) {
            setL2Industries(d.data.industries);
          } else {
            // 空数据 / 结构异常 → 演示二级行业兜底
            setL2Industries(DEMO_L2_INDUSTRIES);
            setUsingDemoData(true);
          }
        })
        .catch(() => {
          setL2Industries(DEMO_L2_INDUSTRIES);
          setUsingDemoData(true);
        });
    }
  }, [sectorType, industryLevel]);

  // Load sector stocks
  const openSector = useCallback(async (s: SectorScore) => {
    setSelectedSector(s);
    setView('sector');
    try {
      const r = await fetch(`/api/sectors/${encodeURIComponent(s.industry)}/stocks?pageSize=50`);
      const d = await r.json();
      const rawStocks = d.data?.items || d.data?.stocks || [];
      setSectorStocks(rawStocks.map((st: any) => ({
        symbol: st.symbol || '', name: st.name || st.symbol,
        price: st.latestQuote?.closePrice || 0,
        changePercent: st.latestQuote?.changePercent || 0,
        turnoverRate: st.latestQuote?.turnoverRate,
        peRatio: st.latestQuote?.peRatio,
        market: st.market || '',
      })).sort((a: StockData, b: StockData) => b.changePercent - a.changePercent));
    } catch { setSectorStocks([]); }
  }, []);

  const formatBig = (n: number) => n >= 1e8 ? (n / 1e8).toFixed(1) + '亿' : n >= 1e4 ? (n / 1e4).toFixed(1) + '万' : String(n);

  const scoreColor = (s: number) => s >= 70 ? '#22c55e' : s >= 45 ? '#f59e0b' : s >= 25 ? '#f97316' : '#6b7280';
  const scoreLabel = (s: number) => s >= 70 ? '高景气' : s >= 45 ? '较活跃' : s >= 25 ? '一般' : '冷门';

  // 板块涨跌口径
  const upCount = scores.filter(s => Number(s.avg_change_percent) > 0).length;
  const downCount = scores.filter(s => Number(s.avg_change_percent) < 0).length;
  const upPct = scores.length > 0 ? Math.round((upCount / scores.length) * 100) : 0;
  const topScores = scores.slice(0, 3);

  // 真实市场涨跌家数
  const realUpStocks = marketSummary?.risingStocks ?? 0;
  const realDownStocks = marketSummary?.fallingStocks ?? 0;
  const _realFlatStocks = marketSummary?.unchangedStocks ?? 0;
  const realLimitUp = marketSummary?.limitUpCount ?? 0;
  const realLimitDown = marketSummary?.limitDownCount ?? 0;
  const realTotalStocks = marketSummary?.totalStocks ?? 0;
  const realTurnover = marketSummary?.totalTurnover ?? 0;
  const breadthPct = realTotalStocks > 0 ? Math.round((realUpStocks / realTotalStocks) * 100) : 0;

  // 涨跌幅排序
  const sortedByChange = [...scores].sort(
    (a, b) => Number(b.avg_change_percent ?? b.avgChange ?? 0) - Number(a.avg_change_percent ?? a.avgChange ?? 0)
  );
  const topGainers = sortedByChange.slice(0, 5);
  const topLosers = sortedByChange.slice(-3).reverse();
  const hasGainers = topGainers.length > 0 && Number(topGainers[0].avg_change_percent ?? topGainers[0].avgChange ?? 0) > 0;
  const leaderTitle = hasGainers ? '🏆 领涨板块' : '💪 相对抗跌';

  // ---- 列表排序（P1：景气/拥挤为排序维度，与热力图解耦） ----
  const sortedScores = useMemo(() => {
    const arr = [...scores];
    if (sortBy === 'change') {
      return arr.sort((a, b) =>
        Number(b.avg_change_percent ?? b.avgChange ?? 0) - Number(a.avg_change_percent ?? a.avgChange ?? 0));
    }
    if (sortBy === 'crowding') {
      return arr.sort((a, b) =>
        (multidimMap[b.industry]?.crowdingScore ?? -1) - (multidimMap[a.industry]?.crowdingScore ?? -1));
    }
    // 'default' / 'boom' → 综合评分（景气度同综合）
    return arr.sort((a, b) => b.score - a.score);
  }, [scores, sortBy, multidimMap]);

  // 二级行业列表排序（仅有涨跌幅可排序，boom/crowding 无多因子数据则保持原序）
  const sortedL2 = useMemo(() => {
    const arr = [...l2Industries];
    if (sortBy === 'change' || sortBy === 'default') {
      return arr.sort((a, b) => Number(b.avg_change ?? 0) - Number(a.avg_change ?? 0));
    }
    return arr;
  }, [l2Industries, sortBy]);

  // 当前展示的板块列表（用于热力图取数，P6：避免 L2 时显示 L1 数据）
  const isL2 = sectorType === 'industry' && industryLevel === 2;
  const listIndustries = useMemo(
    () => isL2 ? l2Industries.map(l => l.name) : sortedScores.map(s => s.industry),
    [isL2, l2Industries, sortedScores]
  );
  const heatmapRows = useMemo(
    () => listIndustries.map(name => multidimMap[name]).filter((d): d is MultidimData => !!d),
    [listIndustries, multidimMap]
  );

  // ---- Heatmap rendering helpers ----
  // 热力图只展示 11 维多因子矩阵(0-20 量程)，景气度/拥挤度作为排序维度 + 行尾标注，不再单列色阶列
  const renderHeatmap = (sortBy: 'boom' | 'crowding', industryList: string[]) => {
    // 仅基于当前展示的板块列表取数，缺失多因子数据的板块跳过(P6)
    const rows = industryList
      .map(name => multidimMap[name])
      .filter((d): d is MultidimData => !!d)
      .map(d => ({ industry: d.industry, boomScore: d.boomScore, crowdingScore: d.crowdingScore, dimensions: d.dimensions }))
      .sort((a, b) => (sortBy === 'boom' ? b.boomScore - a.boomScore : b.crowdingScore - a.crowdingScore))
      .slice(0, 10);

    if (rows.length === 0) return null;

    // 11 个固定因子维度
    const boomKeys = ['diffusion', 'recovery', 'momentumPosition', 'searchHeat', 'spreadDegree'] as const;
    const crowdingKeys = ['crowding', 'concentration', 'zScore', 'leverage', 'panic', 'fundFlow'] as const;
    const allDimKeys = [...boomKeys, ...crowdingKeys];
    const dimLabels: Record<string, string> = {
      diffusion: '扩散度', recovery: '回补动能', momentumPosition: '动量仓位', searchHeat: '搜索热度', spreadDegree: '传播度',
      crowding: '拥挤度', concentration: '集中度', zScore: 'Z值', leverage: '杠杆率', panic: '恐慌指数', fundFlow: '基金流向',
    };

    // 行尾标注 景气/拥挤 汇总分（不进入色阶）
    const yLabels = rows.map(r => `${r.industry}  景${r.boomScore}/拥${r.crowdingScore}`);
    const xLabels = allDimKeys.map(k => dimLabels[k]);

    // 构建热力图数据（缺失维度不渲染该格，避免误涂色阶）
    const heatData: [number, number, number][] = [];
    rows.forEach((item, rowIdx) => {
      allDimKeys.forEach((k, colIdx) => {
        const dim = (item.dimensions as any)[k];
        if (dim) heatData.push([colIdx, rowIdx, dim.score]);
      });
    });

    // Hover 详情
    const hoverDetail: Record<string, string> = {};
    rows.forEach(item => {
      allDimKeys.forEach(k => {
        const dim = (item.dimensions as any)[k];
        if (!dim) return;
        const label = dim.label || dimLabels[k];
        const formula = dimFormulaMap[k] || '';
        hoverDetail[`${item.industry}__${dimLabels[k]}`] = formula ? `${label}\n${formula}` : label;
      });
    });

    const option = {
      tooltip: {
        position: 'top' as const,
        backgroundColor: 'rgba(15,23,42,0.95)',
        borderColor: 'var(--border-subtle, #334155)',
        textStyle: { color: '#e2e8f0', fontSize: 12 },
        formatter: (params: any) => {
          const data = params.data as [number, number, number];
          if (!data) return '';
          const colIdx = data[0];
          const rowIdx = data[1];
          const val = data[2];
          const industry = rows[rowIdx].industry;
          const dimName = xLabels[colIdx];
          const detail = hoverDetail[`${industry}__${dimName}`] || '';
          return `<div style="font-weight:700;margin-bottom:4px">${industry}</div>
            <div style="color:#94a3b8">${dimName}: <span style="color:${getDimColor(val)};font-weight:700;font-size:16px">${val}分</span></div>
            <div style="color:#64748b;font-size:11px;margin-top:2px;max-width:260px;white-space:pre-line">${detail}</div>
            <div style="color:#475569;font-size:10px;margin-top:4px">点击查看板块详情</div>`;
        },
      },
      grid: {
        left: typeof window !== 'undefined' && window.innerWidth < 480 ? 60 : 110,
        right: typeof window !== 'undefined' && window.innerWidth < 480 ? 40 : 60,
        top: 30, bottom: 50,
        containLabel: false,
      },
      xAxis: {
        type: 'category' as const,
        data: xLabels,
        position: 'top' as const,
        axisLabel: {
          color: '#94a3b8',
          fontSize: 10,
          fontWeight: 600,
          rotate: 0,
        },
        axisLine: { show: false },
        axisTick: { show: false },
        splitArea: { show: true },
      },
      yAxis: {
        type: 'category' as const,
        data: yLabels,
        axisLabel: {
          color: '#e2e8f0',
          fontSize: 11,
          fontWeight: 600,
          width: typeof window !== 'undefined' && window.innerWidth < 480 ? 60 : 100,
          overflow: 'truncate' as const,
        },
        axisLine: { show: false },
        axisTick: { show: false },
        splitArea: { show: true },
      },
      visualMap: {
        min: 0,
        max: 20,
        calculable: true,
        orient: 'vertical' as const,
        right: 0,
        top: 'center',
        itemWidth: 10,
        itemHeight: 140,
        textStyle: { color: '#94a3b8', fontSize: 10 },
        pieces: [
          { min: 0, max: 5, color: '#ef4444', label: '低(0-5)' },
          { min: 6, max: 10, color: '#f59e0b', label: '中(6-10)' },
          { min: 11, max: 15, color: '#22c55e', label: '高(11-15)' },
          { min: 16, max: 20, color: '#3b82f6', label: '极强(16-20)' },
        ],
        outOfRange: { color: '#334155' },
      },
      series: [{
        type: 'heatmap' as const,
        data: heatData,
        label: {
          show: true,
          color: '#1e293b',
          fontSize: 10,
          fontWeight: 800,
        },
        emphasis: {
          itemStyle: {
            shadowBlur: 10,
            shadowColor: 'rgba(0,0,0,0.5)',
            borderColor: '#fff',
            borderWidth: 1,
          },
        },
        itemStyle: {
          borderColor: 'var(--border-subtle, #1e293b)',
          borderWidth: 1,
          borderRadius: 2,
        },
      }],
    };
    
    // 热力图内部排序控件（按景气度 / 按拥挤度 重排行）
    const sortControl = (
      <div style={{ display: 'flex', gap: 4, background: 'var(--bg-surface)', borderRadius: 8, padding: 2 }}>
        {([['boom', '按景气度'], ['crowding', '按拥挤度']] as const).map(([k, label]) => (
          <div key={k} onClick={() => setHeatmapSort(k)} style={{
            padding: '2px 10px', borderRadius: 6, fontSize: 11, cursor: 'pointer',
            fontWeight: heatmapSort === k ? 700 : 400,
            color: heatmapSort === k ? TEXT : TEXT_SEC,
            background: heatmapSort === k ? (k === 'boom' ? 'rgba(34,197,94,0.15)' : 'rgba(245,158,11,0.15)') : 'transparent',
            transition: 'all .15s',
          }}>{label}</div>
        ))}
      </div>
    );

    return (
      <div>
        <div style={{ marginBottom: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <Text strong style={{ color: TEXT, fontSize: 15 }}>📊 多维因子热力图</Text>
            {sortControl}
          </div>
          <div style={{ fontSize: 11, color: TEXT_SEC, marginTop: 2 }}>
            维度 × 板块 · 11 个多因子维度(0-20 色阶) · 行尾标注 景气/拥挤 汇总分(0-100)
          </div>
          <div style={{ fontSize: 11, color: TEXT_SEC, marginTop: 2 }}>
            <span style={{ color: '#ef4444' }}>红(0-5)</span>→
            <span style={{ color: '#f59e0b' }}>黄(6-10)</span>→
            <span style={{ color: '#22c55e' }}>绿(11-15)</span>→
            <span style={{ color: '#3b82f6' }}>蓝(16-20)</span>
          </div>
        </div>
        <div style={{ background: CARD_BG, borderRadius: 10, border: `1px solid ${BORDER}`, overflow: 'hidden', padding: '8px 0' }}>
          <Suspense fallback={<div style={{ height: 460, display: 'flex', alignItems: 'center', justifyContent: 'center' }}><LoadingState /></div>}>
            <EChartsWrapper
              option={option}
              style={{ width: '100%', height: 460 }}
              onEvents={{
                click: (params: any) => {
                  if (params.data) {
                    const rowIdx = (params.data as [number, number, number])[1];
                    const industry = rows[rowIdx].industry;
                    const s = scores.find(x => x.industry === industry);
                    if (s) openSector(s);
                  }
                },
              }}
            />
          </Suspense>
        </div>
      </div>
    );
  };

  // ---- Mobile heatmap（与桌面一致：11 维度集合，缺失维度跳过）----
  const renderMobileHeatmap = (industryList: string[]) => {
    const rows = industryList
      .map(name => multidimMap[name])
      .filter((d): d is MultidimData => !!d)
      .sort((a, b) => b.totalScore - a.totalScore)
      .slice(0, 10);
    if (rows.length === 0) return null;

    const allDimKeys = ['diffusion', 'recovery', 'momentumPosition', 'searchHeat', 'spreadDegree', 'crowding', 'concentration', 'zScore', 'leverage', 'panic', 'fundFlow'] as const;
    const dimShort: Record<string, string> = {
      diffusion: '扩散', recovery: '回补', momentumPosition: '动量', searchHeat: '搜索', spreadDegree: '传播',
      crowding: '拥挤', concentration: '集中', zScore: 'Z值', leverage: '杠杆', panic: '恐慌', fundFlow: '基金',
    };

    return (
      <div style={{ marginTop: 24 }}>
        <div style={{ marginBottom: 12 }}>
          <Text strong style={{ color: TEXT, fontSize: 15 }}>🌡️ 多维景气热力</Text>
          <div style={{ fontSize: 11, color: TEXT_SEC, marginTop: 2 }}>Top{rows.length}板块 · 点击查看详情</div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {rows.map(item => (
            <div key={item.industry}
              onClick={() => {
                const s = scores.find(x => x.industry === item.industry);
                if (s) openSector(s);
              }}
              style={{
                background: CARD_BG, borderRadius: 8, border: `1px solid ${BORDER}`,
                padding: '10px 12px', cursor: 'pointer',
                display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8,
              }}
            >
              <div style={{ minWidth: 0 }}>
                <div style={{ color: TEXT, fontWeight: 600, fontSize: 13 }}>{item.industry}</div>
                <div style={{ display: 'flex', gap: 4, marginTop: 4, flexWrap: 'wrap' }}>
                  {allDimKeys.map(k => {
                    const dim = (item.dimensions as any)[k];
                    if (!dim) return null;
                    const label = dimShort[k] || k;
                    return (
                      <Tag key={k} style={{ fontSize: 10, margin: 0, padding: '0 4px', lineHeight: '16px',
                        background: getDimBg(dim.score), color: getDimColor(dim.score), border: `1px solid ${getDimBorder(dim.score)}` }}>
                        {label}{dim.score}
                      </Tag>
                    );
                  })}
                </div>
              </div>
              <div style={{ textAlign: 'right', flexShrink: 0 }}>
                <div style={{ fontSize: 14, fontWeight: 800, color: '#22c55e' }}>景{item.boomScore}</div>
                <div style={{ fontSize: 13, fontWeight: 800, color: '#f59e0b' }}>拥{item.crowdingScore}</div>
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  };

  // ---- Score list item renderer ----
  const renderScoreItem = (s: SectorScore) => {
    const md = multidimMap[s.industry];
    return (
      <div key={s.industry} onClick={() => openSector(s)}
        style={{
          background: CARD_BG, borderRadius: 10, border: `1px solid ${BORDER}`, padding: '12px 16px',
          cursor: 'pointer', transition: 'border-color .15s', display: 'flex', alignItems: 'flex-start', gap: 16,
        }}
        onMouseEnter={e => e.currentTarget.style.borderColor = ACCENT}
        onMouseLeave={e => e.currentTarget.style.borderColor = BORDER}
      >
        {/* Score Badge */}
        <div style={{ textAlign: 'center', minWidth: 50 }}>
          <div style={{ fontSize: 22, fontWeight: 800, color: scoreColor(s.score), fontFamily: 'monospace' }}>{s.score}</div>
          <Tag style={{ fontSize: 10, margin: 0, borderRadius: 4, padding: '0 4px', lineHeight: '16px' }}
            color={s.score >= 70 ? 'green' : s.score >= 45 ? 'gold' : 'default'}>{scoreLabel(s.score)}</Tag>
        </div>

        {/* Sector Info */}
        <div style={{ flex: 1 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
            <Text strong style={{ color: TEXT, fontSize: 13 }}>{s.industry}</Text>
            <Tag style={{ fontSize: 10, borderRadius: 4, margin: 0 }}>{s.stock_count}只</Tag>
            {s.limit_up_count > 0 && <Tag color="red" style={{ fontSize: 10, borderRadius: 4, margin: 0 }}>🔥{s.limit_up_count}涨停</Tag>}
            <Button
              type="link" size="small" icon={<ApartmentOutlined />}
              style={{ fontSize: 10, padding: 0, color: '#1890ff' }}
              onClick={(e) => { e.stopPropagation(); navigate(`/industry-map?industry=${encodeURIComponent(s.industry)}`); }}
            >产业链</Button>
          </div>
          <div style={{ display: 'flex', gap: 16, fontSize: 11, color: TEXT_SEC, flexWrap: 'wrap' }}>
            <Tooltip title="板块热度 (50%)：平均涨跌幅的绝对值，涨得越猛得分越高">
              <span>🔥 {s.changeScore}</span>
            </Tooltip>
            <Tooltip title="成交活跃 (30%)：总成交金额，成交越大说明市场越关注">
              <span>💰 {s.volumeScore}</span>
            </Tooltip>
            <Tooltip title="赚钱效应 (20%)：涨停家数，涨停越多说明板块内更容易赚钱">
              <span>🎯 {s.breadthScore}</span>
            </Tooltip>
            <span style={{ color: Number(s.avg_change_percent) >= 0 ? COLOR_UP : COLOR_DOWN, fontWeight: 600 }}>
              {Number(s.avg_change_percent) >= 0 ? '+' : ''}{Number(s.avg_change_percent).toFixed(2)}%
            </span>
            <span>额{formatBig(Number(s.total_turnover))}</span>
          </div>

          {/* Multidim dimension chips */}
          {md && (
            <div style={{ display: 'flex', gap: 4, marginTop: 8, flexWrap: 'wrap' }}>
              {/* Boom group dimensions */}
              {['diffusion', 'recovery', 'momentumPosition', 'searchHeat', 'spreadDegree'].map(key => {
                const dim = (md.dimensions as any)[key];
                if (!dim) return null;
                const label = dimLabelMap[key] || key;
                const formula = dimFormulaMap[key] || '';
                const score = dim.score;
                return (
                  <Tooltip key={key} title={<div style={{ whiteSpace: 'pre-line' }}>{`${label}: ${dim.label}\n分数: ${score}/20${formula ? '\n公式: '+formula : ''}`}</div>}>
                    <span style={{
                      fontSize: 10, padding: '2px 6px', borderRadius: 3, fontWeight: 600,
                      background: getDimBg(score), color: getDimColor(score),
                      border: `1px solid ${getDimBorder(score)}`, cursor: 'help',
                    }}>
                      {label.slice(0, 2)}{score}/20
                    </span>
                  </Tooltip>
                );
              })}
              <span style={{ color: BORDER, fontSize: 10, alignSelf: 'center' }}>|</span>
              {/* Crowding group dimensions */}
              {['crowding', 'concentration', 'zScore', 'leverage', 'panic', 'fundFlow'].map(key => {
                const dim = (md.dimensions as any)[key];
                if (!dim) return null;
                const label = dimLabelMap[key] || key;
                const formula = dimFormulaMap[key] || '';
                const score = dim.score;
                return (
                  <Tooltip key={key} title={<div style={{ whiteSpace: 'pre-line' }}>{`${label}: ${dim.label}\n分数: ${score}/20${formula ? '\n公式: '+formula : ''}`}</div>}>
                    <span style={{
                      fontSize: 10, padding: '2px 6px', borderRadius: 3, fontWeight: 600,
                      background: getDimBg(score), color: getDimColor(score),
                      border: `1px solid ${getDimBorder(score)}`, cursor: 'help',
                    }}>
                      {label.slice(0, 2)}{score}/20
                    </span>
                  </Tooltip>
                );
              })}
              <Tooltip title={`景气度: ${md.boomScore}/100 (扩散+回补+动量仓位+搜索+传播)`}>
                <span style={{
                  fontSize: 10, padding: '2px 6px', borderRadius: 3, fontWeight: 700,
                  background: '#22c55e18', color: '#22c55e',
                  border: '1px solid #22c55e40',
                }}>
                  📈{md.boomScore}
                </span>
              </Tooltip>
              <Tooltip title={`拥挤度: ${md.crowdingScore}/100 (拥挤度+集中度+Z值+杠杆+恐慌+基金流向)`}>
                <span style={{
                  fontSize: 10, padding: '2px 6px', borderRadius: 3, fontWeight: 700,
                  background: '#f59e0b18', color: '#f59e0b',
                  border: '1px solid #f59e0b40',
                }}>
                  🔥{md.crowdingScore}
                </span>
              </Tooltip>
            </div>
          )}
        </div>

        <RightOutlined style={{ color: TEXT_SEC, fontSize: 12 }} />
      </div>
    );
  };

  // Skeleton 加载骨架屏
  if (loading) return (
    <div style={{ background: BG, minHeight: '100vh', color: TEXT }}>
      <div style={{ maxWidth: 1400, margin: '0 auto', padding: '24px 24px 40px' }}>
        <div style={{ marginBottom: 20 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
            <div style={{
              width: 22, height: 22, borderRadius: 4,
              background: 'linear-gradient(90deg, #1e293b 25%, #334155 50%, #1e293b 75%)',
              backgroundSize: '200% 100%', animation: 'skeleton-shimmer 1.5s infinite',
            }} />
            <div style={{
              width: 120, height: 28, borderRadius: 6,
              background: 'linear-gradient(90deg, #1e293b 25%, #334155 50%, #1e293b 75%)',
              backgroundSize: '200% 100%', animation: 'skeleton-shimmer 1.5s infinite',
            }} />
          </div>
          <div style={{
            width: 280, height: 14, borderRadius: 4, marginTop: 6,
            background: 'linear-gradient(90deg, #1e293b 25%, #334155 50%, #1e293b 75%)',
            backgroundSize: '200% 100%', animation: 'skeleton-shimmer 1.5s infinite',
          }} />
        </div>

        <div style={{
          borderRadius: 12, padding: '28px 32px', marginBottom: 20,
          background: 'var(--card-bg)', border: '1px solid var(--border-subtle)',
        }}>
          <div style={{ display: 'flex', gap: 16, marginBottom: 20 }}>
            <div style={{
              width: 48, height: 48, borderRadius: 12,
              background: 'linear-gradient(90deg, #334155 25%, #475569 50%, #334155 75%)',
              backgroundSize: '200% 100%', animation: 'skeleton-shimmer 1.5s infinite',
            }} />
            <div>
              <div style={{
                width: 160, height: 22, borderRadius: 4, marginBottom: 6,
                background: 'linear-gradient(90deg, #334155 25%, #475569 50%, #334155 75%)',
                backgroundSize: '200% 100%', animation: 'skeleton-shimmer 1.5s infinite',
              }} />
              <div style={{
                width: 240, height: 14, borderRadius: 4,
                background: 'linear-gradient(90deg, #334155 25%, #475569 50%, #334155 75%)',
                backgroundSize: '200% 100%', animation: 'skeleton-shimmer 1.5s infinite',
              }} />
            </div>
          </div>
          <div className="ai-insight-grid" style={{ display: "grid", gridTemplateColumns: "minmax(0, 1.2fr) minmax(0, 0.8fr)", gap: 24 }}>
            <div>
              {Array.from({ length: 3 }).map((_, i) => (
                <div key={i} style={{ marginBottom: 18 }}>
                  <div style={{
                    width: i === 0 ? '55%' : '40%', height: 16, borderRadius: 4, marginBottom: 10,
                    background: 'linear-gradient(90deg, #334155 25%, #475569 50%, #334155 75%)',
                    backgroundSize: '200% 100%', animation: 'skeleton-shimmer 1.5s infinite',
                  }} />
                  {Array.from({ length: 2 }).map((__, j) => (
                    <div key={j} style={{
                      width: '75%', height: 12, borderRadius: 4, marginTop: 6, marginLeft: 16,
                      background: 'linear-gradient(90deg, #334155 25%, #475569 50%, #334155 75%)',
                      backgroundSize: '200% 100%', animation: 'skeleton-shimmer 1.5s infinite',
                    }} />
                  ))}
                </div>
              ))}
            </div>
            <div>
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
                  <div style={{
                    width: 64, height: 12, borderRadius: 4,
                    background: 'linear-gradient(90deg, #334155 25%, #475569 50%, #334155 75%)',
                    backgroundSize: '200% 100%', animation: 'skeleton-shimmer 1.5s infinite',
                  }} />
                  <div style={{
                    flex: 1, height: 12, borderRadius: 4,
                    background: 'linear-gradient(90deg, #334155 25%, #475569 50%, #334155 75%)',
                    backgroundSize: '200% 100%', animation: 'skeleton-shimmer 1.5s infinite',
                  }} />
                </div>
              ))}
            </div>
          </div>
        </div>

        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} style={{
            height: 72, borderRadius: 10, marginBottom: 8,
            background: 'linear-gradient(90deg, #1e293b 25%, #334155 50%, #1e293b 75%)',
            backgroundSize: '200% 100%', animation: 'skeleton-shimmer 1.5s infinite',
          }} />
        ))}
      </div>
    </div>
  );

  if (loadError) return (
    <div style={{ background: BG, minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <Result status="error" title="数据加载失败" subTitle="请检查网络连接后重试"
        extra={<Button type="primary" onClick={() => window.location.reload()}>刷新页面</Button>} />
    </div>
  );

  return (
    <div style={{ background: BG, minHeight: '100vh', color: TEXT }}>
      <div style={{ maxWidth: 1400, margin: '0 auto', padding: '24px 24px 40px' }}>
        {/* Header */}
        <div style={{ marginBottom: 20 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
            <CompassOutlined style={{ fontSize: 22, color: ACCENT }} />
            <Title level={3} style={{ color: TEXT, margin: 0, fontWeight: 800 }}>发掘·板块景气度</Title>
            {usingDemoData && <Tag color="orange" style={{ borderRadius: 6 }}>演示数据</Tag>}
            {summaryError && !usingDemoData && <Tag color="yellow" style={{ borderRadius: 6 }}>简化数据</Tag>}
          </div>
          <div style={{ fontSize: 12, color: TEXT_SEC }}>
            大盘概览 → 板块景气度评估 → 个股深挖 · 当前{sectorType === 'industry' ? '行业' : '概念'}分类
          </div>
        </div>

        {/* AI Insight Section */}
        <div style={{
          borderRadius: 12, padding: '20px 24px', marginBottom: 20,
          background: 'var(--card-bg)', border: '1px solid var(--border-subtle)',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
            <span style={{ fontSize: 24 }}>🧠</span>
            <Title level={5} style={{ color: TEXT, margin: 0 }}>AI 市场解读</Title>
            <Tag color="purple" style={{ fontSize: 10 }}>实时分析</Tag>
          </div>
          {insightLoading && !insight ? (
            <div style={{ color: TEXT_SEC, fontSize: 13 }}>正在生成市场解读...</div>
          ) : insight ? (
            <div className="ai-insight-grid" style={{ display: "grid", gridTemplateColumns: "minmax(0, 1.2fr) minmax(0, 0.8fr)", gap: 24 }}>
              <div>
                {insight.summary && <Paragraph style={{ color: TEXT, fontSize: 13, marginBottom: 12, whiteSpace: 'pre-wrap' }}>{insight.summary}</Paragraph>}
                {insight.points && insight.points.map((pt: string, i: number) => (
                  <div key={i}>{renderInsightLine(pt)}</div>
                ))}
              </div>
              <div>
                {insight.metrics && Object.entries(insight.metrics).map(([k, v]: [string, any]) => (
                  <div key={k} style={{ marginBottom: 8, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontSize: 12, color: TEXT_SEC }}>{k}</span>
                    <span style={{ fontFamily: 'monospace', fontWeight: 600, color: TEXT }}>{typeof v === 'number' ? v.toFixed(2) : String(v)}</span>
                  </div>
                ))}
                {!insight.metrics && (
                  <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
                    <div style={{ textAlign: 'center' }}>
                      <div style={{ fontSize: 24, fontWeight: 800, color: realUpStocks > realDownStocks ? COLOR_UP : COLOR_DOWN }}>{realUpStocks}</div>
                      <div style={{ fontSize: 10, color: TEXT_SEC }}>上涨家数</div>
                    </div>
                    <div style={{ textAlign: 'center' }}>
                      <div style={{ fontSize: 24, fontWeight: 800, color: COLOR_DOWN }}>{realDownStocks}</div>
                      <div style={{ fontSize: 10, color: TEXT_SEC }}>下跌家数</div>
                    </div>
                    <div style={{ textAlign: 'center' }}>
                      <div style={{ fontSize: 24, fontWeight: 800, color: ACCENT }}>{breadthPct}%</div>
                      <div style={{ fontSize: 10, color: TEXT_SEC }}>上涨占比</div>
                    </div>
                    <div style={{ textAlign: 'center' }}>
                      <div style={{ fontSize: 24, fontWeight: 800, color: '#22c55e' }}>{realLimitUp}</div>
                      <div style={{ fontSize: 10, color: TEXT_SEC }}>涨停</div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          ) : null}
        </div>

        {/* News */}
        {news.length > 0 && (
          <div style={{ background: CARD_BG, border: `1px solid ${BORDER}`, borderRadius: 12, padding: '12px 16px', marginBottom: 20 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
              <span style={{ fontSize: 14 }}>📰</span>
              <span style={{ fontSize: 13, fontWeight: 700, color: TEXT }}>实时资讯</span>
              <span style={{ fontSize: 10, color: TEXT_SEC, marginLeft: 'auto' }}>东方财富</span>
            </div>
            <div className="news-grid" style={{ gap: 8 }}>
              {news.slice(0, 6).map((item, i) => (
                <div key={i} className="news-item" style={{
                  background: 'var(--bg-surface)', border: `1px solid ${BORDER}`,
                  borderRadius: 6, padding: '8px 10px', cursor: 'pointer',
                }} onClick={() => item.url && window.open(item.url, '_blank')}>
                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: 6 }}>
                    <Tag color={item.sentiment === 'positive' ? 'red' : item.sentiment === 'negative' ? 'green' : 'default'} 
                      style={{ fontSize: 10, lineHeight: '16px', padding: '0 4px', margin: 0, flexShrink: 0 }}>
                      {item.sentiment === 'positive' ? '利好' : item.sentiment === 'negative' ? '利空' : '中性'}
                    </Tag>
                    <div style={{ fontSize: 12, color: TEXT, lineHeight: 1.5, flex: 1 }}>
                      {item.title?.length > 40 ? item.title.slice(0, 40) + '...' : item.title}
                    </div>
                  </div>
                  <div style={{ fontSize: 10, color: TEXT_SEC, marginTop: 4 }}>{item.time?.slice(0, 10) || ''}</div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Index + Breadth */}
        <div className="index-breadth-grid" style={{ gap: 12, marginBottom: 20 }}>
          <div className="index-grid" style={{ gap: 8 }}>
            {indices.map(idx => {
              const up = idx.changePercent >= 0;
              return (
                <div key={idx.symbol} onClick={() => navigate(`/index/${idx.symbol}`)} style={{ background: CARD_BG, borderRadius: 10, border: `1px solid ${BORDER}`, padding: '10px 12px', cursor: 'pointer' }}>
                  <div style={{ fontSize: 11, color: TEXT_SEC }}>{idx.name}</div>
                  <div style={{ fontSize: 15, fontWeight: 700, fontFamily: 'monospace', color: TEXT }}>{idx.closePrice?.toLocaleString()}</div>
                  <span style={{ fontSize: 12, fontWeight: 600, fontFamily: 'monospace', color: up ? COLOR_UP : COLOR_DOWN }}>{up ? '+' : ''}{idx.changePercent?.toFixed(2)}%</span>
                </div>
              );
            })}
          </div>
          <div style={{ background: CARD_BG, borderRadius: 10, border: `1px solid ${BORDER}`, padding: '14px 16px' }}>
            <div style={{ fontSize: 12, color: TEXT_SEC, marginBottom: 8 }}>板块宽度</div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 6 }}>
              <span style={{ color: COLOR_UP }}>{upCount} 涨</span>
              <span style={{ color: COLOR_DOWN }}>{downCount} 跌</span>
              <span style={{ color: TEXT_SEC }}>{upPct}%</span>
            </div>
            <div style={{ display: 'flex', height: 6, borderRadius: 3, overflow: 'hidden', marginBottom: 12 }}>
              <div style={{ width: `${upPct}%`, background: COLOR_UP }} />
              <div style={{ width: `${100 - upPct}%`, background: COLOR_DOWN }} />
            </div>
            <div style={{ fontSize: 11, color: TEXT_SEC, lineHeight: 1.6 }}>
              {topScores.slice(0, 2).map(s => (
                <div key={s.industry}>🏆 {s.industry} 景气度 <span style={{ color: scoreColor(s.score), fontWeight: 600 }}>{s.score}分</span></div>
              ))}
            </div>
          </div>
        </div>

        {/* 领涨/领跌面板 */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 20 }}>
          <div style={{ background: CARD_BG, border: `1px solid ${BORDER}`, borderRadius: 12, padding: "12px 16px" }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: TEXT, marginBottom: 8 }}>{leaderTitle}</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {topGainers.slice(0, 5).map(s => (
                <div key={s.industry} onClick={() => openSector(s)} style={{
                  display: "flex", justifyContent: "space-between", alignItems: "center",
                  padding: "6px 8px", borderRadius: 6, cursor: "pointer",
                  background: "var(--bg-primary)", transition: "all .15s",
                }}>
                  <span style={{ fontSize: 12, fontWeight: 600, color: TEXT }}>{s.industry}</span>
                  <span style={{ fontFamily: "monospace", fontSize: 12, fontWeight: 700, color: COLOR_UP }}>
                    +{Number(s.avg_change_percent || s.avgChange || 0).toFixed(1)}%
                  </span>
                </div>
              ))}
            </div>
          </div>
          <div style={{ background: CARD_BG, border: `1px solid ${BORDER}`, borderRadius: 12, padding: "12px 16px" }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: TEXT, marginBottom: 8 }}>📉 领跌板块</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {topLosers.slice(0, 3).map(s => (
                <div key={s.industry} onClick={() => openSector(s)} style={{
                  display: "flex", justifyContent: "space-between", alignItems: "center",
                  padding: "6px 8px", borderRadius: 6, cursor: "pointer",
                  background: "var(--bg-primary)", transition: "all .15s",
                }}>
                  <span style={{ fontSize: 12, fontWeight: 600, color: TEXT }}>{s.industry}</span>
                  <span style={{ fontFamily: "monospace", fontSize: 12, fontWeight: 700, color: COLOR_DOWN }}>
                    {Number(s.avg_change_percent || s.avgChange || 0).toFixed(1)}%
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
        {/* ====== 板块景气度主区域 ====== */}
        {view === 'market' ? (
          <>
            {/* Section Header + Tabs */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12, flexWrap: 'wrap', gap: 8 }}>
              <div>
                <Text strong style={{ color: TEXT, fontSize: 15 }}>🏢 板块景气度评分</Text>
                <div style={{ fontSize: 11, color: TEXT_SEC, marginTop: 2 }}>
                  综合评分 = 板块热度×50% + 成交活跃×30% + 赚钱效应×20%
                </div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                {/* 分类 toggle */}
                <div style={{ display: 'flex', gap: 4, background: 'var(--bg-surface)', borderRadius: 8, padding: 2 }}>
                  {(['industry', 'concept'] as const).map(t => (
                    <div key={t} onClick={() => { setSectorType(t); setDisplayMode('list'); }} style={{
                      padding: '3px 12px', borderRadius: 6, fontSize: 12, cursor: 'pointer',
                      fontWeight: sectorType === t ? 700 : 400,
                      color: sectorType === t ? TEXT : TEXT_SEC,
                      background: sectorType === t ? 'var(--border)' : 'transparent',
                      transition: 'all .15s',
                    }}>
                      {t === 'industry' ? '行业板块' : '概念板块'}
                    </div>
                  ))}
                </div>
                {sectorType === 'industry' && (
                  <div style={{ display: 'flex', gap: 4 }}>
                    {([1, 2] as const).map(lv => (
                      <div key={lv} onClick={() => setIndustryLevel(lv)} style={{
                        padding: '2px 8px', borderRadius: 4, fontSize: 11, cursor: 'pointer',
                        fontWeight: industryLevel === lv ? 600 : 400,
                        color: industryLevel === lv ? ACCENT : TEXT_SEC,
                        background: industryLevel === lv ? 'rgba(59,130,246,0.1)' : 'transparent',
                        transition: 'all .15s',
                      }}>
                        {lv === 1 ? '一级' : '二级'}
                      </div>
                    ))}
                  </div>
                )}
                {/* 排序维度（景气/拥挤为排序维度，与热力图解耦） */}
                <div style={{ display: 'flex', gap: 4, background: 'var(--bg-surface)', borderRadius: 8, padding: 2 }}>
                  {([['default', '综合评分'], ['boom', '景气度'], ['crowding', '交易拥挤度'], ['change', '涨跌幅']] as const).map(([k, label]) => (
                    <div key={k} onClick={() => setSortBy(k)} style={{
                      padding: '3px 10px', borderRadius: 6, fontSize: 12, cursor: 'pointer',
                      fontWeight: sortBy === k ? 700 : 400,
                      color: sortBy === k ? TEXT : TEXT_SEC,
                      background: sortBy === k ? 'var(--border)' : 'transparent',
                      transition: 'all .15s',
                    }}>{label}</div>
                  ))}
                </div>
                {/* 列表 / 热力图 切换（热力图作为独立可切换区块） */}
                <div style={{ display: 'flex', gap: 4, background: 'var(--bg-surface)', borderRadius: 8, padding: 2 }}>
                  {([['list', '列表'], ['heatmap', '热力图']] as const).map(([k, label]) => (
                    <div key={k} onClick={() => setDisplayMode(k)} style={{
                      padding: '3px 10px', borderRadius: 6, fontSize: 12, cursor: 'pointer',
                      fontWeight: displayMode === k ? 700 : 400,
                      color: displayMode === k ? TEXT : TEXT_SEC,
                      background: displayMode === k ? 'var(--border)' : 'transparent',
                      transition: 'all .15s',
                    }}>{label}</div>
                  ))}
                </div>
              </div>
            </div>

            {/* Display Mode Content */}
            {displayMode === 'list' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {sectorType === 'industry' && industryLevel === 2 ? (
                  /* 二级板块按一级行业(parent)分组渲染 */
                  Array.from(new Set(sortedL2.map(l => l.parent || '二级行业'))).map(parent => (
                    <div key={parent}>
                      <div style={{ fontSize: 13, fontWeight: 700, color: TEXT, margin: '4px 0 8px', display: 'flex', alignItems: 'center', gap: 6 }}>
                        <span style={{ color: ACCENT }}>▸</span>{parent}
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                        {sortedL2.filter(l => (l.parent || '二级行业') === parent).map(s => (
                          <div key={s.name} onClick={() => navigate(`/screener?industry=${encodeURIComponent(s.name)}`)}
                            style={{
                              background: CARD_BG, borderRadius: 10, border: `1px solid ${BORDER}`, padding: '10px 16px',
                              cursor: 'pointer', transition: 'border-color .15s', display: 'flex', alignItems: 'center', gap: 16,
                            }}
                            onMouseEnter={e => e.currentTarget.style.borderColor = ACCENT}
                            onMouseLeave={e => e.currentTarget.style.borderColor = BORDER}
                          >
                            <div style={{ flex: 1 }}>
                              <div style={{ color: TEXT, fontWeight: 600, fontSize: 14 }}>{s.name}</div>
                              <div style={{ color: TEXT_SEC, fontSize: 11, marginTop: 2 }}>{s.stock_count}只 · 涨幅 {s.avg_change}% · 换手 {s.avg_turnover}%</div>
                            </div>
                            <div style={{ color: Number(s.avg_change) >= 0 ? COLOR_UP : COLOR_DOWN, fontWeight: 700, fontSize: 16 }}>
                              {s.avg_change}%
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))
                ) : (
                  sortedScores.slice(0, 15).map(s => renderScoreItem(s))
                )}
              </div>
            )}

            {displayMode === 'heatmap' && (
              heatmapRows.length === 0
                ? <Empty description="当前板块暂无多因子数据" style={{ marginTop: 24 }} />
                : (isMobileHeatmap ? renderMobileHeatmap(listIndustries) : renderHeatmap(heatmapSort, listIndustries))
            )}

            {/* Bottom actions */}
            <div style={{ marginTop: 20, paddingTop: 16, borderTop: '1px solid var(--border-subtle)', display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
              <Button type="primary" size="small" icon={<FilterOutlined />} onClick={() => navigate('/screener')} style={{ background: ACCENT, borderColor: ACCENT, borderRadius: 6 }}>立即筛选</Button>
              <Button size="small" icon={<ApartmentOutlined />} onClick={() => navigate('/industry-map')} style={{ borderRadius: 6 }}>产业地图</Button>
              <span style={{ fontSize: 11, color: TEXT_SEC, marginLeft: 'auto' }}>数据实时更新 · 点击板块查看详情</span>
            </div>
          </>
        ) : (
          /* Sector Detail View */
          <div>
            {selectedSector && (
              <div style={{ marginBottom: 20, background: CARD_BG, borderRadius: 12, border: `1px solid ${BORDER}`, padding: '16px 20px' }}>
                <div className="sector-detail-stats" style={{ display: 'flex', gap: 24, flexWrap: 'wrap' }}>
                  <div style={{ textAlign: 'center', minWidth: 80 }}>
                    <div style={{ fontSize: 28, fontWeight: 800, color: scoreColor(selectedSector.score), fontFamily: 'monospace' }}>{selectedSector.score}</div>
                    <div style={{ fontSize: 11, color: TEXT_SEC }}>景气度评分</div>
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', marginBottom: 8 }}>
                      <span style={{ fontSize: 12, color: TEXT_SEC }}>涨跌幅: <span style={{ color: selectedSector.avg_change_percent >= 0 ? COLOR_UP : COLOR_DOWN, fontWeight: 600 }}>{selectedSector.avg_change_percent >= 0 ? '+' : ''}{selectedSector.avg_change_percent.toFixed(2)}%</span></span>
                      <span style={{ fontSize: 12, color: TEXT_SEC }}>成交额: {formatBig(selectedSector.total_turnover)}</span>
                      <span style={{ fontSize: 12, color: TEXT_SEC }}>{selectedSector.stock_count}只 · {selectedSector.limit_up_count}涨停</span>
                    </div>
                    <div style={{ display: 'flex', gap: 8, fontSize: 11, color: TEXT_SEC }}>
                      <span>技术面 {selectedSector.changeScore}分</span>
                      <Progress percent={selectedSector.changeScore} showInfo={false} size="small" strokeColor={COLOR_UP} style={{ width: 60 }} />
                      <span>资金面 {selectedSector.volumeScore}分</span>
                      <Progress percent={selectedSector.volumeScore} showInfo={false} size="small" strokeColor={ACCENT} style={{ width: 60 }} />
                      <span>宽度 {selectedSector.breadthScore}分</span>
                      <Progress percent={selectedSector.breadthScore} showInfo={false} size="small" strokeColor={GOLD} style={{ width: 60 }} />
                    </div>
                  </div>
                  <div className="sector-detail-actions">
                    <Button type="primary" icon={<FilterOutlined />}
                      onClick={() => navigate(`/screener?industry=${encodeURIComponent(selectedSector.industry)}`)}
                      style={{ background: ACCENT, borderColor: ACCENT }}>筛选该板块</Button>
                  </div>
                </div>
              </div>
            )}

            <Title level={5} style={{ color: TEXT, marginBottom: 12 }}>板块内个股 <Badge count={sectorStocks.length} style={{ backgroundColor: ACCENT }} /></Title>
            <div style={{ background: CARD_BG, borderRadius: 10, border: `1px solid ${BORDER}`, overflow: 'hidden' }}>
              <Table dataSource={sectorStocks} rowKey="symbol" size="middle" pagination={false} scroll={{ x: "max-content" }}
                className="dark-table"
                locale={{ emptyText: <Empty description="暂无数据" /> }}
                columns={[
                  { title: '#', width: 45, render: (_: any, __: any, i: number) => (
                    <span style={{ color: i < 3 ? GOLD : TEXT_SEC, fontWeight: 700 }}>{i + 1}</span>
                  )},
                  { title: '代码', dataIndex: 'symbol', width: 95, render: (v: string) => (
                    <a onClick={() => navigate(`/stocks/${v}`)} style={{ color: ACCENT, fontWeight: 600, fontFamily: 'monospace', cursor: 'pointer' }}>{v.replace(/\.(SH|SZ)$/, '')}</a>
                  )},
                  { title: '名称', dataIndex: 'name', ellipsis: true, render: (v: string) => <span style={{ color: TEXT }}>{v}</span> },
                  { title: '最新价', dataIndex: 'price', align: 'right' as const, width: 85, render: (v: number) => <span style={{ fontFamily: 'monospace', fontWeight: 600, color: TEXT }}>{v?.toFixed(2)}</span> },
                  { title: '涨跌幅', dataIndex: 'changePercent', align: 'right' as const, width: 85, render: (v: number) => (
                    <span style={{ color: v >= 0 ? COLOR_UP : COLOR_DOWN, fontWeight: 700, fontFamily: 'monospace' }}>{v >= 0 ? '+' : ''}{v?.toFixed(2)}%</span>
                  )},
                  { title: '换手率', dataIndex: 'turnoverRate', align: 'right' as const, width: 75, render: (v?: number) => <span style={{ color: TEXT_SEC, fontSize: 12 }}>{v?.toFixed(2) ?? '-'}%</span> },
                  { title: 'PE', dataIndex: 'peRatio', align: 'right' as const, width: 65, render: (v?: number) => <span style={{ color: TEXT_SEC, fontSize: 12 }}>{v?.toFixed(1) ?? '-'}</span> },
                  { title: '', width: 40, render: (_: any, r: StockData) => (
                    <StarOutlined style={{ color: GOLD, cursor: 'pointer', fontSize: 15, background: 'rgba(245,158,11,0.12)', borderRadius: 4, padding: '2px 3px' }}
                      onClick={e => {
                        e.stopPropagation();
                        try {
                          const KEY = 'astock_watchlist_v2';
                          const saved = safeGetItem(KEY);
                          const groups = saved ? JSON.parse(saved) : [{ id: 'default', name: '默认分组', stocks: [], isDefault: true }];
                          const def = groups.find((g: any) => g.id === 'default') || groups[0];
                          if (def.stocks.find((s: any) => s.symbol === r.symbol)) {
                            message.warning(`${r.name} 已在自选列表中`);
                            return;
                          }
                          def.stocks.push({ symbol: r.symbol, name: r.name, market: r.market || '', sortIndex: def.stocks.length, groupId: def.id });
                          safeSetItem(KEY, JSON.stringify(groups));
                          message.success(`已将 ${r.name} 添加到自选股`);
                        } catch { message.error('添加失败'); }
                      }} />
                  )},
                ]}
                onRow={r => ({ onClick: () => navigate(`/stocks/${r.symbol}`), style: { cursor: 'pointer' } })} />
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default DiscoverPage;
