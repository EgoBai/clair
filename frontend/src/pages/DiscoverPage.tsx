/**
 * 发掘页 v3 🔭 — 核心循环入口
 * 大盘 → 板块景气度评分 → 个股深挖
 * 陪伴式引导：全宽AI解读 + 关键数据高亮 + 双栏布局
 */

import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Table, Tag, Spin, Empty, Typography, Badge, Progress, Tooltip, message, Button, Alert, Result } from 'antd';
import { CompassOutlined, RightOutlined, StarOutlined, ArrowLeftOutlined, FilterOutlined, ApartmentOutlined, ReloadOutlined } from '@ant-design/icons';

const { Title, Text, Paragraph } = Typography;

import { safeGetItem, safeSetItem } from '../utils/safeStorage';
import EChartsWrapper from '../components/Charts/EChartsWrapper';
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
  totalScore: number;
  dimensions: {
    crowding:      { score: number; label: string };
    diffusion:     { score: number; label: string };
    concentration: { score: number; label: string };
    retail:        { score: number; label: string };
    recovery:      { score: number; label: string };
    panic:        { score: number; label: string };
    volatility:   { score: number; label: string };
    momIndex:     { score: number; label: string };
    searchHeat:   { score: number; label: string };
    spreadDegree: { score: number; label: string };
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
  const [l2Industries, setL2Industries] = useState<Array<{name: string; stock_count: number; avg_change: string; avg_turnover: string; total_cap: string}>>([]);
  const [news, setNews] = useState<any[]>([]);
  const [loadError, setLoadError] = useState(false);
  const [summaryError, setSummaryError] = useState(false);  // /api/market/summary 错误降级

  // Load market overview + scores (fast, show immediately)
  useEffect(() => {
    (async () => {
      setLoading(true);
      setInsightLoading(true);
      setLoadError(false);
      setSummaryError(false);
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
        }
        // sectors
        if (results[1].status === 'fulfilled') {
          setScores(results[1].value.data?.sectors || []);
      // 预加载前15板块的多维度数据
      const top15List = results[1].value.data?.sectors || [];
      if (top15List.length > 0) {
        Promise.allSettled(
          top15List.slice(0, 15).map((s: SectorScore) =>
            fetch(`/api/sectors/${encodeURIComponent(s.industry)}/multidim-v2`).then(r => r.json())
          )
        ).then(mdResults => {
          const map: Record<string, MultidimData> = {};
          top15List.slice(0, 15).forEach((s: SectorScore, i: number) => {
            if (mdResults[i].status === 'fulfilled' && mdResults[i].value?.data) {
              map[s.industry] = mdResults[i].value.data;
            }
          });
          setMultidimMap(map);
        }).catch(() => {});
      }
        } else {
          hasCriticalError = true;
        }
        // summary — 单独追踪降级
        if (results[2].status === 'fulfilled' && results[2].value?.data) {
          setMarketSummary(results[2].value.data);
        } else {
          setSummaryError(true);
        }
      } catch {
        setLoadError(true);
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
      fetch('/api/industries?level=2')
        .then(r => r.json())
        .then(d => {
          if (d.success && d.data?.industries) {
            setL2Industries(d.data.industries);
          }
        })
        .catch(() => {});
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

  // 板块涨跌口径（统一数据源：scores[].avg_change_percent）
  const upCount = scores.filter(s => Number(s.avg_change_percent) > 0).length;
  const downCount = scores.filter(s => Number(s.avg_change_percent) < 0).length;
  const upPct = scores.length > 0 ? Math.round((upCount / scores.length) * 100) : 0;
  const topScores = scores.slice(0, 3); // 按景气度评分排序（板块热度榜，非涨幅榜）

  // 真实市场涨跌家数（来自 /api/market/summary，5541只全量统计）
  const realUpStocks = marketSummary?.risingStocks ?? 0;
  const realDownStocks = marketSummary?.fallingStocks ?? 0;
  const _realFlatStocks = marketSummary?.unchangedStocks ?? 0;
  const realLimitUp = marketSummary?.limitUpCount ?? 0;
  const realLimitDown = marketSummary?.limitDownCount ?? 0;
  const realTotalStocks = marketSummary?.totalStocks ?? 0;
  const realTurnover = marketSummary?.totalTurnover ?? 0; // 元
  const breadthPct = realTotalStocks > 0 ? Math.round((realUpStocks / realTotalStocks) * 100) : 0;

  // 真·领涨/领跌：按真实涨跌幅排序，标签与内容一致（修复 P1-1）
  const sortedByChange = [...scores].sort(
    (a, b) => Number(b.avg_change_percent ?? b.avgChange ?? 0) - Number(a.avg_change_percent ?? a.avgChange ?? 0)
  );
  const topGainers = sortedByChange.slice(0, 5);
  const topLosers = sortedByChange.slice(-3).reverse();
  const hasGainers = topGainers.length > 0 && Number(topGainers[0].avg_change_percent ?? topGainers[0].avgChange ?? 0) > 0;
  const leaderTitle = hasGainers ? '🏆 领涨板块' : '💪 相对抗跌'; // 普跌日不再把负涨幅称作"领涨"

  // Skeleton 加载骨架屏 + 数据加载错误降级
  if (loading) return (
    <div style={{ background: BG, minHeight: '100vh', color: TEXT }}>
      <div style={{ maxWidth: 1400, margin: '0 auto', padding: '24px 24px 40px' }}>
        {/* 头部骨架 */}
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

        {/* AI解读区骨架 */}
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
          <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 0.8fr', gap: 24 }}>
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
                      width: `${80 + j * 10}%`, height: 13, borderRadius: 4, marginBottom: 8,
                      background: 'linear-gradient(90deg, #334155 25%, #475569 50%, #334155 75%)',
                      backgroundSize: '200% 100%', animation: 'skeleton-shimmer 1.5s infinite',
                    }} />
                  ))}
                </div>
              ))}
            </div>
            <div>
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} style={{
                  display: 'flex', justifyContent: 'space-between', marginBottom: 12,
                  padding: '6px 8px', borderRadius: 6, background: 'var(--bg-surface)',
                }}>
                  <div style={{
                    width: 80, height: 14, borderRadius: 4,
                    background: 'linear-gradient(90deg, #334155 25%, #475569 50%, #334155 75%)',
                    backgroundSize: '200% 100%', animation: 'skeleton-shimmer 1.5s infinite',
                  }} />
                  <div style={{
                    width: 50, height: 14, borderRadius: 4,
                    background: 'linear-gradient(90deg, #334155 25%, #475569 50%, #334155 75%)',
                    backgroundSize: '200% 100%', animation: 'skeleton-shimmer 1.5s infinite',
                  }} />
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* 板块骨架 */}
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} style={{
            borderRadius: 10, padding: '12px 16px', marginBottom: 8,
            background: 'var(--card-bg)', border: '1px solid var(--border-subtle)',
            display: 'flex', alignItems: 'center', gap: 16,
          }}>
            <div style={{
              width: 50, height: 50, borderRadius: 8,
              background: 'linear-gradient(90deg, #334155 25%, #475569 50%, #334155 75%)',
              backgroundSize: '200% 100%', animation: 'skeleton-shimmer 1.5s infinite',
            }} />
            <div style={{ flex: 1 }}>
              <div style={{
                width: 130, height: 15, borderRadius: 4, marginBottom: 8,
                background: 'linear-gradient(90deg, #334155 25%, #475569 50%, #334155 75%)',
                backgroundSize: '200% 100%', animation: 'skeleton-shimmer 1.5s infinite',
              }} />
              <div style={{
                width: 260, height: 12, borderRadius: 4,
                background: 'linear-gradient(90deg, #334155 25%, #475569 50%, #334155 75%)',
                backgroundSize: '200% 100%', animation: 'skeleton-shimmer 1.5s infinite',
              }} />
            </div>
          </div>
        ))}

        <style>{`
          @keyframes skeleton-shimmer {
            0% { background-position: 200% 0; }
            100% { background-position: -200% 0; }
          }
        `}</style>
      </div>
    </div>
  );

  // 关键数据加载失败，显示带重试按钮的降级 UI
  if (loadError) return (
    <div style={{ background: BG, minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <Result
        status="error"
        title="数据加载失败"
        subTitle="无法获取市场数据，请检查网络连接后重试"
        extra={
          <Button type="primary" onClick={() => window.location.reload()} icon={<ReloadOutlined />}>
            重新加载
          </Button>
        }
      />
    </div>
  );

  const moodEmoji = insight?.moodEmoji || '📊';
  // 使用真实市场数据替代旧的 AI insight 虚构数据
  const marketBreadth = { up: realUpStocks, down: realDownStocks };

  return (
    <div className="discover-page" style={{ background: BG, minHeight: '100vh', color: TEXT }}>
      <div className="discover-container" style={{ maxWidth: 1400, margin: '0 auto', padding: '24px 24px 40px' }}>

        {/* Header */}
        <div style={{ marginBottom: 20, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <CompassOutlined style={{ fontSize: 22, color: ACCENT }} />
              <Title level={3} style={{ margin: 0, color: TEXT, fontWeight: 700 }}>
                {view === 'market' ? '发掘' : selectedSector?.industry || ''}
              </Title>
            </div>
            <Text style={{ color: TEXT_SEC, fontSize: 13 }}>
              {view === 'market' ? '板块景气度评分 → 点击板块查看个股详情' : (
                <span style={{ cursor: 'pointer', color: ACCENT }} onClick={() => { setView('market'); setSelectedSector(null); }}>
                  <ArrowLeftOutlined /> 返回大盘总览
                </span>
              )}
            </Text>
          </div>
        </div>

        {view === 'market' ? (
          <>
            {/* 市场摘要 API 降级提示 */}
            {summaryError && (
              <Alert
                type="warning"
                message="部分数据加载失败"
                description="市场涨跌家数等统计数据暂不可用，部分指标可能显示为 0。其他数据正常展示。"
                style={{ marginBottom: 16, borderRadius: 8 }}
                showIcon
                action={
                  <Button size="small" onClick={() => window.location.reload()} icon={<ReloadOutlined />}>
                    重试
                  </Button>
                }
              />
            )}

            {/* ====== AI 市场解读 v3：全宽双栏布局 ====== */}
            <div className="card-modern animate-fade-in" style={{ padding: '28px 32px', marginBottom: 20 }}>
              {/* 顶部情绪栏 */}
              <div style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                marginBottom: 24, paddingBottom: 20, borderBottom: '1px solid var(--border-subtle)',
                flexWrap: 'wrap', gap: 16,
              }}>
                {/* 左侧：情绪 */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                  <div style={{ fontSize: 44, lineHeight: 1 }}>{moodEmoji}</div>
                  <div>
                    <div style={{ fontSize: 22, fontWeight: 800, color: TEXT, letterSpacing: '-0.02em', marginBottom: 2 }}>
                      {insight?.mood || '加载中...'}
                    </div>
                    <div style={{ fontSize: 12, color: TEXT_SEC, display: 'flex', alignItems: 'center', gap: 6 }}>
                      <span className="badge-modern badge-accent" style={{ fontSize: 10 }}>AI 实时解读</span>
                      <span>综合{scores.length}板块 · 多维度分析</span>
                    </div>
                  </div>
                </div>

                {/* 右侧：核心指标 */}
                <div style={{ display: 'flex', gap: 24, alignItems: 'center', flexWrap: 'wrap' }}>
                  <div style={{ textAlign: 'center' }}>
                    <div style={{ fontSize: 10, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 6 }}>个股涨跌</div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                      <span style={{ fontFamily: 'monospace', fontSize: 16, fontWeight: 800, color: COLOR_UP }}>{marketBreadth.up}</span>
                      <div style={{ width: 64, height: 4, borderRadius: 2, background: 'var(--color-down-bg)', overflow: 'hidden' }}>
                        <div style={{ width: `${breadthPct}%`, height: '100%', background: COLOR_UP, borderRadius: 2 }} />
                      </div>
                      <span style={{ fontFamily: 'monospace', fontSize: 16, fontWeight: 800, color: COLOR_DOWN }}>{marketBreadth.down}</span>
                    </div>
                    <div style={{ fontSize: 11, color: TEXT_SEC }}>全市场 {marketBreadth.up}涨{marketBreadth.down}跌</div>
                  </div>

                  <div style={{ textAlign: 'center' }}>
                    <div style={{ fontSize: 10, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 6 }}>指数均幅</div>
                    <div style={{ fontFamily: 'monospace', fontSize: 24, fontWeight: 800, color: (insight?.avgIndexChange ?? 0) >= 0 ? COLOR_UP : COLOR_DOWN, lineHeight: 1 }}>
                      {insight ? `${(insight.avgIndexChange ?? 0) > 0 ? '+' : ''}${Number(insight.avgIndexChange ?? 0).toFixed(2)}%` : '—'}
                    </div>
                  </div>

                  {realLimitUp > 0 && (
                    <div style={{ textAlign: 'center' }}>
                      <div style={{ fontSize: 10, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 6 }}>涨停</div>
                      <div style={{ fontFamily: 'monospace', fontSize: 24, fontWeight: 800, color: COLOR_UP, lineHeight: 1 }}>{realLimitUp}</div>
                    </div>
                  )}
                  {realLimitDown > 0 && (
                    <div style={{ textAlign: 'center' }}>
                      <div style={{ fontSize: 10, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 6 }}>跌停</div>
                      <div style={{ fontFamily: 'monospace', fontSize: 24, fontWeight: 800, color: COLOR_DOWN, lineHeight: 1 }}>{realLimitDown}</div>
                    </div>
                  )}
                </div>
              </div>

              {/* 正文：双栏布局 */}
              <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 0.8fr', gap: 24 }}>
                {/* 左栏：AI分析 */}
                <div>
                  {insight?.sections ? (
                    insight.sections.map((sec: any, i: number) => (
                      <div key={i} style={{ marginBottom: i < insight.sections.length - 1 ? 22 : 0 }}>
                        <div style={{
                          fontSize: 15, fontWeight: 700, color: ACCENT,
                          marginBottom: 10, display: 'flex', alignItems: 'center', gap: 8, padding: '6px 0',
                        }}>
                          <span style={{ fontSize: 18 }}>{sec.icon}</span>
                          <span>{sec.title}</span>
                          {i === 0 && <span style={{ fontSize: 10, background: 'var(--accent-light)', color: ACCENT, padding: '1px 6px', borderRadius: 4 }}>核心</span>}
                        </div>
                        <div style={{ fontSize: 14, color: 'var(--text-primary)', lineHeight: 1.85 }}>
                          {sec.text.split('\n').filter((l: string) => l.trim()).map((line: string, j: number) =>
                            <React.Fragment key={j}>{renderInsightLine(line)}</React.Fragment>
                          )}
                        </div>
                      </div>
                    ))
                  ) : insightLoading ? (
                    <div style={{ padding: '20px 0', color: TEXT_SEC }}>
                      <Spin size="small" /> AI正在分析市场数据...
                    </div>
                  ) : (
                    <div style={{ fontSize: 14, color: 'var(--text-primary)', lineHeight: 1.85 }}>
                      <div style={{ marginBottom: 10, fontWeight: 700, color: ACCENT }}>
                        <span style={{ fontSize: 18, marginRight: 8 }}>📊</span>市场速览
                      </div>
                      {(() => {
                        const top3 = topScores.slice(0, 3);
                        const topNames = top3.map(s => `${s.industry}(${s.score}分${Number(s.avg_change_percent) >= 0 ? '+' : ''}${Number(s.avg_change_percent).toFixed(1)}%)`).join('、');
                        const hotSectors = scores.filter(s => s.limit_up_count > 0).slice(0, 3);
                        const hotNames = hotSectors.map(s => `${s.industry}${s.limit_up_count}只涨停`).join('、');
                        const stockUpPct = realTotalStocks > 0 ? Math.round((realUpStocks / realTotalStocks) * 100) : 0;
                        if (stockUpPct >= 50) {
                          return <div>市场情绪偏乐观，<b style={{ color: COLOR_UP }}>{realUpStocks}/{realTotalStocks}</b> 只个股上涨（{stockUpPct}%）。领涨板块：{topNames}。{hotSectors.length > 0 ? `涨停集中：${hotNames}。` : ''}资金活跃度高，建议聚焦景气评分 &gt; 50 的板块。</div>;
                        } else if (stockUpPct >= 20) {
                          return <div>市场结构性分化，<b style={{ color: COLOR_UP }}>{realUpStocks}</b> 涨 <b style={{ color: COLOR_DOWN }}>{realDownStocks}</b> 跌。强势板块：{topNames}。{hotSectors.length > 0 ? `局部热点：${hotNames}。` : ''}结构性行情下，轻指数重板块。</div>;
                        } else {
                          return <div>市场情绪偏谨慎，仅 <b>{stockUpPct}%</b> 个股上涨。成交额 {formatBig(realTurnover)}。抗跌板块：{topNames}。防御策略为主，关注低估值、高股息品种。</div>;
                        }
                      })()}
                    </div>
                  )}
                </div>

                {/* 右栏：关键数据 */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                  <div style={{ background: 'var(--bg-surface)', borderRadius: 10, padding: '16px', border: '1px solid var(--border-subtle)' }}>
                    <div style={{ fontSize: 13, fontWeight: 700, color: TEXT, marginBottom: 12 }}>📊 关键信号</div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                        <span style={{ fontSize: 12, color: TEXT_SEC }}>上涨家数</span>
                        <span style={{ fontFamily: 'monospace', fontSize: 16, fontWeight: 700, color: COLOR_UP }}>{realUpStocks}</span>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                        <span style={{ fontSize: 12, color: TEXT_SEC }}>下跌家数</span>
                        <span style={{ fontFamily: 'monospace', fontSize: 16, fontWeight: 700, color: COLOR_DOWN }}>{realDownStocks}</span>
                      </div>
                      <div style={{ height: 1, background: 'var(--border-subtle)' }} />
                      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                        <span style={{ fontSize: 12, color: TEXT_SEC }}>涨停家数</span>
                        <span style={{ fontFamily: 'monospace', fontSize: 16, fontWeight: 700, color: COLOR_UP }}>{realLimitUp} 只</span>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                        <span style={{ fontSize: 12, color: TEXT_SEC }}>跌停家数</span>
                        <span style={{ fontFamily: 'monospace', fontSize: 16, fontWeight: 700, color: COLOR_DOWN }}>{realLimitDown} 只</span>
                      </div>
                      <div style={{ height: 1, background: 'var(--border-subtle)' }} />
                      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                        <span style={{ fontSize: 12, color: TEXT_SEC }}>市场总成交</span>
                        <span style={{ fontFamily: 'monospace', fontSize: 16, fontWeight: 700, color: TEXT }}>{formatBig(realTurnover)}</span>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                        <span style={{ fontSize: 12, color: TEXT_SEC }}>景气 &gt; 70</span>
                        <span style={{ fontFamily: 'monospace', fontSize: 16, fontWeight: 700, color: '#22c55e' }}>
                          {(Array.isArray(insight?.topSectors) ? insight.topSectors.filter((s: any) => s.score >= 70).length : topScores.filter(s => s.score >= 70).length)} 个
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* 领涨板块（按真实涨跌幅排序，标签与内容一致） */}
                  {topGainers.length > 0 && (
                    <div style={{ background: 'var(--bg-surface)', borderRadius: 10, padding: '16px', border: '1px solid var(--border-subtle)' }}>
                      <div style={{ fontSize: 13, fontWeight: 700, color: TEXT, marginBottom: 12 }}>{leaderTitle}</div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                        {topGainers.slice(0, 5).map((s: any) => (
                          <div key={s.industry}
                            onClick={() => navigate(`/screener?industry=${encodeURIComponent(s.industry)}`)}
                            style={{
                              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                              padding: '6px 8px', borderRadius: 6, cursor: 'pointer',
                              background: 'var(--bg-primary)', transition: 'all .15s',
                            }}
                            onMouseEnter={e => e.currentTarget.style.background = 'var(--border)'}
                            onMouseLeave={e => e.currentTarget.style.background = 'var(--bg-primary)'}
                          >
                            <span style={{ fontSize: 12, fontWeight: 600, color: TEXT }}>{s.industry}</span>
                            <span style={{
                              fontFamily: 'monospace', fontSize: 12, fontWeight: 700,
                              color: Number(s.avg_change_percent || s.avgChange || 0) >= 0 ? COLOR_UP : COLOR_DOWN,
                            }}>
                              {Number(s.avg_change_percent || s.avgChange || 0) >= 0 ? '+' : ''}
                              {Number(s.avg_change_percent ?? s.avgChange ?? 0).toFixed(1)}%
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* 弱势板块（按真实涨跌幅排序） */}
                  {topLosers.length > 0 && (
                    <div style={{ background: 'var(--bg-surface)', borderRadius: 10, padding: '16px', border: '1px solid var(--border-subtle)' }}>
                      <div style={{ fontSize: 13, fontWeight: 700, color: TEXT, marginBottom: 12 }}>📉 弱势板块</div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                        {topLosers.slice(0, 3).map((s: any) => (
                          <div key={s.industry}
                            onClick={() => navigate(`/screener?industry=${encodeURIComponent(s.industry)}`)}
                            style={{
                              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                              padding: '6px 8px', borderRadius: 6, cursor: 'pointer',
                              background: 'var(--bg-primary)', transition: 'all .15s',
                            }}
                          >
                            <span style={{ fontSize: 12, fontWeight: 600, color: TEXT }}>{s.industry}</span>
                            <span style={{ fontFamily: 'monospace', fontSize: 12, fontWeight: 700, color: COLOR_DOWN }}>
                              {Number(s.avg_change_percent || s.avgChange || 0).toFixed(1)}%
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* 底部操作 */}
              <div style={{ marginTop: 20, paddingTop: 16, borderTop: '1px solid var(--border-subtle)', display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
                <Button type="primary" size="small" icon={<FilterOutlined />} onClick={() => navigate('/screener')} style={{ background: ACCENT, borderColor: ACCENT, borderRadius: 6 }}>立即筛选</Button>
                <Button size="small" icon={<ApartmentOutlined />} onClick={() => navigate('/industry-map')} style={{ borderRadius: 6 }}>产业地图</Button>
                <span style={{ fontSize: 11, color: TEXT_SEC, marginLeft: 'auto' }}>数据实时更新 · 点击板块查看详情</span>
              </div>
            </div>

            {/* 资讯速览 */}
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

            {/* 指数 + 宽度 */}
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

            {/* 板块景气度评分 */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
              <div>
                <Text strong style={{ color: TEXT, fontSize: 15 }}>🏢 板块景气度评分</Text>
                <div style={{ fontSize: 11, color: TEXT_SEC, marginTop: 2 }}>
                  综合评分 = 板块热度×50% + 成交活跃×30% + 赚钱效应×20%
                </div>
              </div>
              <div>
                <div style={{ display: 'flex', gap: 4, background: 'var(--bg-surface)', borderRadius: 8, padding: 2 }}>
                  {(['industry', 'concept'] as const).map(t => (
                    <div key={t} onClick={() => setSectorType(t)} style={{
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
                  <div style={{ display: 'flex', gap: 4, marginTop: 4 }}>
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
              </div>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {sectorType === 'industry' && industryLevel === 2
                ? l2Industries.slice(0, 20).map(s => (
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
                        {Number(s.avg_change) >= 0 ? '+' : ''}{s.avg_change}%
                      </div>
                    </div>
                  ))
                : scores.slice(0, 15).map(s => (
                    <div key={s.industry} onClick={() => openSector(s)}
                      style={{
                        background: CARD_BG, borderRadius: 10, border: `1px solid ${BORDER}`, padding: '12px 16px',
                        cursor: 'pointer', transition: 'border-color .15s', display: 'flex', alignItems: 'center', gap: 16,
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
                        <div style={{ display: 'flex', gap: 16, fontSize: 11, color: TEXT_SEC }}>
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
                        
                          {multidimMap[s.industry] && (
                            <div style={{ display: 'flex', gap: 4, marginTop: 4, flexWrap: 'wrap' }}>
                              {Object.entries(multidimMap[s.industry].dimensions).map(([key, dim]: [string, any]) => {
                                const colorMap: Record<string, string> = {
                                  crowding: dim.score >= 14 ? '#22c55e' : dim.score >= 8 ? '#f59e0b' : '#ef4444',
                                  diffusion: dim.score >= 14 ? '#22c55e' : dim.score >= 8 ? '#f59e0b' : '#ef4444',
                                  concentration: dim.score >= 14 ? '#22c55e' : dim.score >= 8 ? '#f59e0b' : '#ef4444',
                                  retail: dim.score >= 14 ? '#ef4444' : dim.score >= 8 ? '#f59e0b' : '#22c55e',
                                  recovery: dim.score >= 14 ? '#22c55e' : dim.score >= 8 ? '#f59e0b' : '#ef4444',
                                  panic: dim.score >= 14 ? '#ef4444' : dim.score >= 8 ? '#f59e0b' : '#22c55e',
                                  volatility: dim.score >= 14 ? '#ef4444' : dim.score >= 8 ? '#f59e0b' : '#22c55e',
                                  momIndex: dim.score >= 14 ? '#ef4444' : dim.score >= 8 ? '#f59e0b' : '#22c55e',
                                  searchHeat: dim.score >= 14 ? '#22c55e' : dim.score >= 8 ? '#f59e0b' : '#ef4444',
                                  spreadDegree: dim.score >= 14 ? '#22c55e' : dim.score >= 8 ? '#f59e0b' : '#ef4444',
                                };
                                const labelMap: Record<string, string> = {
                                  crowding: '拥挤', diffusion: '扩散', concentration: '集中', retail: '小白', recovery: '回补', panic: '恐慌', volatility: '动摇', momIndex: '宝妈', searchHeat: '搜索', spreadDegree: '传播',
                                };
                                return (
                                  <Tooltip key={key} title={`${labelMap[key]}: ${dim.label} (${dim.score}/20)`}>
                                    <span style={{
                                      fontSize: 10, padding: '1px 5px', borderRadius: 3,
                                      background: `${colorMap[key]}18`, color: colorMap[key],
                                      border: `1px solid ${colorMap[key]}40`,
                                    }}>
                                      {labelMap[key]}{dim.score}
                                    </span>
                                  </Tooltip>
                                );
                              })}
                              <Tooltip title={`多维度综合: ${multidimMap[s.industry].totalScore}/100`}>
                                <span style={{
                                  fontSize: 10, padding: '1px 5px', borderRadius: 3, fontWeight: 700,
                                  background: '#3b82f618', color: '#3b82f6',
                                  border: '1px solid #3b82f640',
                                }}>
                                  综合{multidimMap[s.industry].totalScore}
                                </span>
                              </Tooltip>
                            </div>
                          )}</div>
                      </div>

                      <RightOutlined style={{ color: TEXT_SEC, fontSize: 12 }} />
                    </div>
                  ))
              }
            </div>
            {/* ====== 多维景气热力图 (ECharts) ====== */}
            {Object.keys(multidimMap).length > 0 && (() => {
              const multidimSorted = Object.entries(multidimMap)
                .map(([industry, data]) => ({ industry, ...data }))
                .sort((a, b) => b.totalScore - a.totalScore)
                .slice(0, 10);
              const dimKeys = ['crowding', 'diffusion', 'concentration', 'retail', 'recovery', 'panic', 'volatility', 'momIndex', 'searchHeat', 'spreadDegree'] as const;
              const dimLabels: Record<string, string> = {
                                  crowding: '拥挤', diffusion: '扩散', concentration: '集中', retail: '小白', recovery: '回补', panic: '恐慌', volatility: '动摇', momIndex: '宝妈', searchHeat: '搜索', spreadDegree: '传播',
              };
              // Rows (yAxis): sector names (top to bottom = highest score first)
              const yLabels = multidimSorted.map(s => s.industry);
              // Columns (xAxis): 10 dimensions + 综合
              const xLabels = [...dimKeys.map(k => dimLabels[k]), '综合'];

              // Build heatmap data: [colIndex, rowIndex, value]
              const heatData: [number, number, number][] = [];
              multidimSorted.forEach((item, rowIdx) => {
                dimKeys.forEach((k, colIdx) => {
                  heatData.push([colIdx, rowIdx, item.dimensions[k].score]);
                });
                heatData.push([dimKeys.length, rowIdx, item.totalScore]);
              });

              // Hover detail map
              const hoverDetail: Record<string, string> = {};
              multidimSorted.forEach((item) => {
                dimKeys.forEach(k => {
                  hoverDetail[`${item.industry}__${k}`] = item.dimensions[k].label;
                });
                hoverDetail[`${item.industry}__综合`] = `板块景气多维度综合评分 ${item.totalScore}/100`;
              });

              // Color: 红(0-5)→黄(6-12)→绿(13-20) (综合列 0-100 映射到 0-20 色阶)
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
                    const industry = yLabels[rowIdx];
                    const dimName = xLabels[colIdx];
                    const key = `${industry}__${dimName}`;
                    const detail = hoverDetail[key] || '';
                    const sectorObj = multidimSorted[rowIdx];
                    const dimKey = colIdx < dimKeys.length ? dimKeys[colIdx] : null;
                    const isInverse = dimKey === 'retail' || dimKey === 'panic' || dimKey === 'volatility' || dimKey === 'momIndex';
                    const colorHex = val >= 14 ? '#22c55e' : val >= 8 ? '#f59e0b' : '#ef4444';
                    const retailColorHex = val >= 14 ? '#ef4444' : val >= 8 ? '#f59e0b' : '#22c55e';
                    return `<div style="font-weight:700;margin-bottom:4px">${industry}</div>
                      <div style="color:#94a3b8">${dimName}: <span style="color:${isInverse ? retailColorHex : colorHex};font-weight:700;font-size:16px">${val}分</span></div>
                      <div style="color:#64748b;font-size:11px;margin-top:2px;max-width:200px">${detail}</div>
                      <div style="color:#475569;font-size:10px;margin-top:4px">点击查看板块详情</div>`;
                  },
                },
                grid: {
                  left: 110, right: 60, top: 30, bottom: 50,
                  containLabel: false,
                },
                xAxis: {
                  type: 'category' as const,
                  data: xLabels,
                  position: 'top' as const,
                  axisLabel: {
                    color: '#94a3b8',
                    fontSize: 11,
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
                    width: 100,
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
                  inRange: {
                    color: ['#ef4444', '#ef4444', '#f59e0b', '#f59e0b', '#22c55e', '#22c55e'],
                  },
                  pieces: [
                    { min: 0, max: 5, color: '#ef4444', label: '低(0-5)' },
                    { min: 6, max: 12, color: '#f59e0b', label: '中(6-12)' },
                    { min: 13, max: 20, color: '#22c55e', label: '高(13-20)' },
                  ],
                  outOfRange: { color: '#334155' },
                },
                series: [{
                  type: 'heatmap' as const,
                  data: heatData,
                  label: {
                    show: true,
                    color: '#1e293b',
                    fontSize: 11,
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

              return (
                <div style={{ marginTop: 24 }}>
                  <div style={{ marginBottom: 12 }}>
                    <Text strong style={{ color: TEXT, fontSize: 15 }}>🌡️ 多维景气热力</Text>
                    <div style={{ fontSize: 11, color: TEXT_SEC, marginTop: 2 }}>
                      Top10板块 × 10维度评分 · 按综合分降序 · 红(0-5)→黄(6-12)→绿(13-20)
                    </div>
                  </div>
                  <div style={{ background: CARD_BG, borderRadius: 10, border: `1px solid ${BORDER}`, overflow: 'hidden', padding: '8px 0' }}>
                    <EChartsWrapper
                      option={option}
                      style={{ width: '100%', height: 420 }}
                      onEvents={{
                        click: (params: any) => {
                          if (params.data) {
                            const rowIdx = (params.data as [number, number, number])[1];
                            const industry = yLabels[rowIdx];
                            const s = scores.find(x => x.industry === industry);
                            if (s) openSector(s);
                          }
                        },
                      }}
                    />
                  </div>
                </div>
              );
            })()}

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
              <Table dataSource={sectorStocks} rowKey="symbol" size="middle" pagination={false}
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
