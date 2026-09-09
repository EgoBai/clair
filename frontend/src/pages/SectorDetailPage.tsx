/**
 * 行业板块分析页面（v3-lite 口径）
 *
 * 数据链路（与 DiscoverPage / IndustryMapPage 同源，全部为真实接口，无演示数据）：
 *   1. 板块列表  GET /api/sectors/momentum          —— 申万一级行业实时动量（行业名即 v3 引擎键）
 *   2. 多维矩阵  GET /api/sectors/{行业名}/multidim-v3 —— v3-lite 14 维引擎
 *        - 实时截面 5 维（crowding/concentration/panic/volatility/spreadDegree）恒可算
 *        - 板块指数日 K 3 维（recovery/leverage/fundFlow）依赖历史 K 线积累
 *        - 其余维度数据可得前后端如实返回 score:null —— 前端显示「数据积累中」，绝不猜数/硬编码
 *   3. 成分股    GET /api/sectors/{行业名}/stocks     —— 板块内个股实时行情
 *
 * 展示口径：维度分值为后端 0-20 原始分（与 DiscoverPage 的 `{score}/20` 芯片同口径）；
 * 组合分为后端 0-100 归一（景气度 boomScore / 拥挤度 crowdingScore，缺失时返回 null）。
 */

import { useCallback, useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  Breadcrumb, Card, Col, Empty, Row, Select, Skeleton, Space, Statistic, Table, Tag, Tooltip,
} from 'antd';
import { CompassOutlined, NodeIndexOutlined, ReloadOutlined,
} from '@ant-design/icons';
import { LoadingState } from '../components/Common/StateComponents';
import { THEME } from '../styles/theme-constants';

const TEXT = THEME.text;
const TEXT_SEC = THEME.textSec;
const COLOR_UP = THEME.up;
const COLOR_DOWN = THEME.down;

/* ============================== 类型（对齐 v3-lite 契约） ============================== */

/** /api/sectors/momentum 板块项（子集，额外字段忽略） */
interface SectorMomentumItem {
  industry: string;
  score: number;
  changeScore?: number;
  volumeScore?: number;
  breadthScore?: number;
  momentumScore?: number;
  stock_count?: number;
  avg_change_percent?: number;
  total_turnover?: number;
  limit_up_count?: number | null;
}

/** 单个维度：score 可为 null（后端已停止用硬编码中性分充数） */
interface MultidimDim {
  score: number | null;
  label: string;
  detail: string;
}

/** GET /api/sectors/:industry/multidim-v3 → data */
interface MultidimV3Result {
  industry: string;
  /** 可算维度的原始分合计；无任何可算维度时为 null */
  totalScore: number | null;
  maxScore?: number;
  availableDimCount?: number;
  nullDimCount?: number;
  /** 组合分（0-100）：成分维不齐全时后端返回 null，不予展示部分分 */
  boomScore?: number | null;
  crowdingScore?: number | null;
  dimensions?: Record<string, MultidimDim>;
  metadata?: {
    stockCount?: number;
    medianPE?: number | null;
    boardKlineSource?: string | null;
    boardKlineDays?: number;
    [k: string]: unknown;
  };
}

/** /api/sectors/:industry/stocks → data.items */
interface ConstituentStock {
  symbol: string;
  name: string;
  market?: string;
  industry?: string;
  latestQuote?: {
    closePrice?: number | null;
    changePercent?: number | null;
    turnoverRate?: number | null;
    peRatio?: number | null;
  } | null;
}

/* ============================== 维度展示注册表（与 DiscoverPage DIM_REGISTRY 同名同口径） ============================== */

type Polarity = 'pos' | 'neg'; // pos: 分越高越健康；neg: 分越高越危险（如拥挤/恐慌/波动）
type GroupKey = 'realtime' | 'boardK' | 'stockHist' | 'peHist' | 'subIndustry';

interface DimMeta {
  label: string;
  icon: string;
  polarity: Polarity;
  accent: string;
  group: GroupKey;
  /** 该维后端缺数据时展示的积累说明（data 可得前的诚实空态文案） */
  awaiting: string;
}

const DIM_META: Record<string, DimMeta> = {
  // —— 实时截面 5 维（后端恒可算）——
  crowding:      { label: '拥挤度',     icon: '🧑‍🤝‍🧑', polarity: 'neg', accent: '#f59e0b', group: 'realtime',  awaiting: '估值分位需板块样本，实时截面积累中' },
  concentration: { label: '集中度',     icon: '💰',    polarity: 'neg', accent: '#10b981', group: 'realtime',  awaiting: '板块成交数据积累中' },
  panic:         { label: '恐慌指数',   icon: '🛡️',   polarity: 'neg', accent: '#ef4444', group: 'realtime',  awaiting: '板块个股行情积累中' },
  volatility:    { label: '波动率',     icon: '🌊',    polarity: 'neg', accent: '#3b82f6', group: 'realtime',  awaiting: '个股振幅数据积累中' },
  spreadDegree:  { label: '涨停扩散',   icon: '🔥',    polarity: 'pos', accent: '#f97316', group: 'realtime',  awaiting: '板块个股行情积累中' },
  // —— 板块指数日 K 3 维（依赖 push2his / KV 每日积累）——
  recovery:      { label: '回补动能',   icon: '🔄',    polarity: 'pos', accent: '#8b5cf6', group: 'boardK',    awaiting: '板块指数历史K线积累中（不足 21 日）' },
  leverage:      { label: '杠杆率',     icon: '⚖️',   polarity: 'neg', accent: '#0ea5e9', group: 'boardK',    awaiting: '板块指数历史K线积累中（不足 21 日）' },
  fundFlow:      { label: '基金流向',   icon: '💧',    polarity: 'pos', accent: '#06b6d4', group: 'boardK',    awaiting: '板块指数历史K线积累中（不足 21 日）' },
  // —— 个股日 K 底座（历史积累中，后端如实 null）——
  diffusion:        { label: '扩散度',     icon: '📊', polarity: 'pos', accent: '#3b82f6', group: 'stockHist', awaiting: '需个股MA20站上比例，个股日K底座积累中' },
  retail:           { label: '散户情绪',   icon: '🐟', polarity: 'neg', accent: '#f97316', group: 'stockHist', awaiting: '需小盘股换手环比，个股日K底座积累中' },
  momIndex:         { label: '动量指数',   icon: '📈', polarity: 'pos', accent: '#22c55e', group: 'stockHist', awaiting: '需低价股成交额前值，个股日K底座积累中' },
  momentumPosition: { label: '动量仓位',   icon: '🚀', polarity: 'pos', accent: '#a855f7', group: 'stockHist', awaiting: '需个股近5日涨幅分布，个股日K底座积累中' },
  // —— 其他积累维 ——
  zScore:     { label: 'Z值',     icon: '📐', polarity: 'neg', accent: '#64748b', group: 'peHist',      awaiting: '需板块PE历史≥20日，KV 每日积累中' },
  searchHeat: { label: '概念广度', icon: '🔎', polarity: 'pos', accent: '#eab308', group: 'subIndustry', awaiting: 'worker 无子行业分类数据' },
};

const GROUPS: { key: GroupKey; title: string }[] = [
  { key: 'realtime',    title: '实时截面 · 即时可算' },
  { key: 'boardK',      title: '板块指数历史 K 线 · 积累中' },
  { key: 'stockHist',   title: '个股日 K 底座 · 积累中' },
  { key: 'peHist',      title: '板块 PE 历史 · 积累中' },
  { key: 'subIndustry', title: '子行业数据 · 不可得' },
];

const GROUP_ICONS: Record<GroupKey, string> = {
  realtime: '⚡', boardK: '📅', stockHist: '🗄️', peHist: '📐', subIndustry: '🚫',
};

/** 布局顺序 = 引擎返回的顺序（与 DiscoverPage 同集合） */
const DIM_ORDER = [
  'crowding', 'diffusion', 'concentration', 'retail', 'recovery',
  'panic', 'volatility', 'momIndex', 'searchHeat', 'spreadDegree',
  'momentumPosition', 'zScore', 'leverage', 'fundFlow',
] as const;

/* ============================== 工具 ============================== */

/** 容忍 number | numeric string | null，统一归一；null/NaN 返回 null（绝不用 0 冒充缺值） */
const toNum = (v: unknown): number | null => {
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  if (typeof v === 'string' && v.trim() !== '' && Number.isFinite(Number(v))) return Number(v);
  return null;
};

const fmt2 = (v: number | null | undefined): string => (v == null ? '—' : v.toFixed(2));
const fmtInt = (v: number | null | undefined): string => (v == null ? '—' : String(Math.round(v)));

/** 大额格式化（与 DiscoverPage formatBig 同口径） */
function formatBig(n: number): string {
  const abs = Math.abs(n);
  if (abs >= 1e8) return `${(n / 1e8).toFixed(1)}亿`;
  if (abs >= 1e4) return `${(n / 1e4).toFixed(1)}万`;
  return String(n);
}

/** 板块综合评分（0-100，来自 /api/sectors/momentum）的着色与档位文案 */
function scoreColor(s: number): string {
  return s >= 70 ? '#22c55e' : s >= 45 ? '#f59e0b' : s >= 25 ? '#f97316' : '#6b7280';
}
function scoreLabel(s: number): string {
  return s >= 70 ? '高景气' : s >= 45 ? '较活跃' : s >= 25 ? '一般' : '冷门';
}

/** 维度分值 Tag 着色：pos 高分=好(绿)，neg 高分=危险(红) */
function dimTone(score: number, polarity: Polarity): string {
  if (polarity === 'neg') return score >= 14 ? 'red' : score >= 9 ? 'orange' : 'green';
  return score >= 14 ? 'green' : score >= 9 ? 'orange' : 'red';
}

const klineSourceLabel = (src: string | null | undefined): string => {
  if (!src) return '—';
  if (src === 'kv') return 'KV 缓存';
  if (src === 'em-board') return '东财实时';
  if (src === 'stale-kv') return 'KV 陈旧';
  return src;
};

/* ============================== 页面 ============================== */

export default function SectorDetailPage() {
  const { symbol } = useParams<{ symbol?: string }>();
  const navigate = useNavigate();

  const decodeRoute = useCallback(() => {
    if (!symbol) return '';
    try { return decodeURIComponent(symbol); } catch { return symbol; }
  }, [symbol]);

  const [sectorList, setSectorList] = useState<SectorMomentumItem[]>([]);
  const [listLoading, setListLoading] = useState(true);
  const [listError, setListError] = useState<string | null>(null);
  const [activeIndustry, setActiveIndustry] = useState<string>(decodeRoute);
  // multidim v3-lite
  const [multidimData, setMultidimData] = useState<MultidimV3Result | null>(null);
  const [multidimLoading, setMultidimLoading] = useState(false);
  const [multidimError, setMultidimError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  // 成分股
  const [stocks, setStocks] = useState<ConstituentStock[]>([]);
  const [stocksLoading, setStocksLoading] = useState(false);
  const [stocksError, setStocksError] = useState<string | null>(null);

  const selected = sectorList.find(s => s.industry === activeIndustry) ?? null;

  /* ---- 板块列表（申万一级，与 v3 引擎键一致）---- */
  useEffect(() => {
    const ac = new AbortController();
    (async () => {
      setListLoading(true);
      setListError(null);
      try {
        const r = await fetch('/api/sectors/momentum', { signal: ac.signal });
        const d = await r.json();
        const list = (Array.isArray(d?.data?.sectors) ? d.data.sectors : []) as SectorMomentumItem[];
        if (ac.signal.aborted) return;
        setSectorList(list);
        if (list.length === 0) {
          // 诚实红线：接口无数据如实置空，绝不注入演示数据
          setListError('板块列表接口未返回数据');
        }
        // URL 无行业参数时选中列表首位；URL 带行业名则保持（即使不在列表，也按真实行业名请求 v3）
        setActiveIndustry(prev => prev || (list[0]?.industry ?? ''));
      } catch (e) {
        if (ac.signal.aborted) return;
        setListError('板块列表接口请求失败，多维分析无法选择板块');
      } finally {
        if (!ac.signal.aborted) setListLoading(false);
      }
    })();
    return () => ac.abort();
  }, []);

  /* ---- 多维矩阵 v3-lite（单板块 GET） ---- */
  useEffect(() => {
    if (!activeIndustry) return;
    const ac = new AbortController();
    (async () => {
      setMultidimLoading(true);
      setMultidimError(null);
      setMultidimData(null);
      try {
        const r = await fetch(`/api/sectors/${encodeURIComponent(activeIndustry)}/multidim-v3`, { signal: ac.signal });
        const d = await r.json().catch(() => ({}));
        if (ac.signal.aborted) return;
        const payload = d?.data;
        const hasDims = payload && typeof payload === 'object' && payload.dimensions && typeof payload.dimensions === 'object';
        if (r.ok && hasDims) {
          setMultidimData(payload as MultidimV3Result);
        } else {
          setMultidimError(
            r.status === 404
              ? `「${activeIndustry}」不在 v3-lite 申万行业覆盖范围内，或该板块暂无计算数据`
              : (d?.error || d?.message || `多维矩阵接口返回异常（HTTP ${r.status}）`)
          );
        }
      } catch (e) {
        if (ac.signal.aborted) return;
        setMultidimError('多维矩阵接口网络请求失败');
      } finally {
        if (!ac.signal.aborted) setMultidimLoading(false);
      }
    })();
    return () => ac.abort();
  }, [activeIndustry, reloadKey]);

  /* ---- 板块成分股（实时） ---- */
  useEffect(() => {
    if (!activeIndustry) return;
    const ac = new AbortController();
    (async () => {
      setStocksLoading(true);
      setStocksError(null);
      setStocks([]);
      try {
        const r = await fetch(`/api/sectors/${encodeURIComponent(activeIndustry)}/stocks?pageSize=50`, { signal: ac.signal });
        const d = await r.json().catch(() => ({}));
        if (ac.signal.aborted) return;
        const items = (d?.success && Array.isArray(d?.data?.items)) ? (d.data.items as ConstituentStock[]) : [];
        setStocks(items);
        if (items.length === 0) setStocksError('该板块暂无成分股数据');
      } catch (e) {
        if (ac.signal.aborted) return;
        setStocksError('成分股接口请求失败');
      } finally {
        if (!ac.signal.aborted) setStocksLoading(false);
      }
    })();
    return () => ac.abort();
  }, [activeIndustry]);

  /* ---------- 展示变量 ---------- */

  const selectOptions = [
    ...sectorList.map(s => ({
      value: s.industry,
      label: `${s.industry}（${(toNum(s.avg_change_percent) ?? 0) >= 0 ? '+' : ''}${fmt2(toNum(s.avg_change_percent))}%）`,
    })),
    // URL 直达但不在列表中的行业：仍保留一个可选项，避免 Select 白框
    ...(activeIndustry && !sectorList.some(s => s.industry === activeIndustry)
      ? [{ value: activeIndustry, label: activeIndustry }]
      : []),
  ];

  const dims = multidimData?.dimensions;
  const dimKeysPresent = dims ? (Object.keys(dims) as string[]).filter(k => DIM_META[k]) : [];

  const dimsByGroup = (g: GroupKey) => DIM_ORDER.filter(k => dimKeysPresent.includes(k) && DIM_META[k].group === g);
  const groupAvail = (g: GroupKey) => dimsByGroup(g).filter(k => toNum(dims?.[k].score) != null).length;

  const boomVal = toNum(multidimData?.boomScore);
  const crowdVal = toNum(multidimData?.crowdingScore);
  const totalVal = toNum(multidimData?.totalScore);
  const maxScore = toNum(multidimData?.maxScore) ?? 280;
  const availCount = toNum(multidimData?.availableDimCount);
  const nullCount = toNum(multidimData?.nullDimCount);
  const meta = multidimData?.metadata;

  const stockColumns = [
    { title: '排名', key: 'rank', width: 56, render: (_: unknown, __: ConstituentStock, i: number) => i + 1 },
    { title: '代码', dataIndex: 'symbol', key: 'symbol', width: 84 },
    { title: '名称', dataIndex: 'name', key: 'name' },
    {
      title: '市场', dataIndex: 'market', key: 'market', width: 56,
      render: (v: string) => (v ? <Tag style={{ fontSize: 10, lineHeight: '16px', margin: 0, padding: '0 4px' }}>{v}</Tag> : '—'),
    },
    {
      title: '最新价', key: 'price', align: 'right' as const, width: 84,
      render: (_: unknown, rec: ConstituentStock) => {
        const p = toNum(rec.latestQuote?.closePrice);
        return <span style={{ fontFamily: 'monospace' }}>{p == null ? '—' : p.toFixed(2)}</span>;
      },
    },
    {
      title: '涨跌幅', key: 'changePercent', align: 'right' as const, width: 92,
      render: (_: unknown, rec: ConstituentStock) => {
        const v = toNum(rec.latestQuote?.changePercent);
        if (v == null) return '—';
        return <Tag color={v >= 0 ? 'red' : 'green'} style={{ margin: 0 }}>{v >= 0 ? '+' : ''}{v.toFixed(2)}%</Tag>;
      },
    },
    {
      title: '换手率%', key: 'turnoverRate', align: 'right' as const, width: 84,
      render: (_: unknown, rec: ConstituentStock) => {
        const v = toNum(rec.latestQuote?.turnoverRate);
        return v == null ? '—' : v.toFixed(2);
      },
    },
    {
      title: 'PE', key: 'peRatio', align: 'right' as const, width: 76,
      render: (_: unknown, rec: ConstituentStock) => {
        const v = toNum(rec.latestQuote?.peRatio);
        return v == null ? '—' : v.toFixed(1);
      },
    },
  ];

  if (listLoading) {
    return (
      <div style={{ padding: 16, maxWidth: 1400, margin: '0 auto' }}>
        <Skeleton active paragraph={{ rows: 1 }} style={{ marginBottom: 16 }} />
        <Skeleton active paragraph={{ rows: 6 }} />
      </div>
    );
  }

  return (
    <div style={{ padding: 16 }}>
      <Breadcrumb
        style={{ marginBottom: 12 }}
        items={[
          { href: '/', title: <><CompassOutlined /> 发掘</> },
          { href: '/industry-map', title: <><NodeIndexOutlined /> 产业地图</> },
          { title: selected?.industry || activeIndustry || '行业板块' },
        ]}
      />
      <Row justify="space-between" align="middle" style={{ marginBottom: 16 }}>
        <h2 style={{ margin: 0, color: TEXT }}>📈 行业板块分析</h2>
        <Space>
          <Select
            value={activeIndustry || undefined}
            onChange={setActiveIndustry}
            style={{ width: 240 }}
            showSearch
            options={selectOptions}
            placeholder="选择行业板块"
          />
        </Space>
      </Row>

      {/* 板块概览（前 10，点击切换） */}
      {sectorList.length > 0 && (
        <Row gutter={[12, 12]} style={{ marginBottom: 16 }}>
          {sectorList.slice(0, 10).map(s => {
            const change = toNum(s.avg_change_percent) ?? 0;
            const sc = toNum(s.score) ?? 0;
            const active = s.industry === activeIndustry;
            return (
              <Col key={s.industry} xs={12} sm={8} md={6} lg={4} xl={3}>
                <Card
                  size="small"
                  hoverable
                  style={{
                    cursor: 'pointer',
                    borderColor: active ? THEME.accent : undefined,
                    background: active ? THEME.surface : undefined,
                  }}
                  onClick={() => setActiveIndustry(s.industry)}
                >
                  <div style={{ fontWeight: 600, fontSize: 13, color: TEXT, marginBottom: 4 }}>{s.industry}</div>
                  <Statistic
                    title="综合评分"
                    value={sc}
                    suffix="/100"
                    valueStyle={{ color: scoreColor(sc), fontSize: 18 }}
                  />
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: TEXT_SEC, marginTop: 4 }}>
                    <span style={{ color: change >= 0 ? COLOR_UP : COLOR_DOWN, fontWeight: 600 }}>
                      {change >= 0 ? '+' : ''}{change.toFixed(2)}%
                    </span>
                    <span>{toNum(s.stock_count) ?? '—'}只</span>
                  </div>
                </Card>
              </Col>
            );
          })}
        </Row>
      )}

      {!listError && sectorList.length === 0 && (
        <Card size="small" style={{ marginBottom: 16 }}>
          <Empty image={null} description="暂无可用板块数据（/api/sectors/momentum 未返回数据）" />
        </Card>
      )}
      {listError && sectorList.length === 0 && (
        <Card size="small" style={{ marginBottom: 16 }}>
          <Empty image={null} description={listError} />
        </Card>
      )}

      {/* ========== 板块多维矩阵（v3-lite 口径） ========== */}
      {activeIndustry ? (
        multidimLoading ? (
          <Card size="small" style={{ marginBottom: 16, textAlign: 'center', padding: 40 }}>
            <LoadingState />
          </Card>
        ) : multidimData ? (
          <Card
            size="small"
            style={{ marginBottom: 16 }}
            title={
              <Space wrap size={[8, 8]}>
                <span style={{ color: TEXT }}>🎯 板块多维矩阵</span>
                {totalVal == null ? (
                  <Tag color="default" style={{ margin: 0 }}>综合得分暂不计算</Tag>
                ) : (
                  <Tooltip title={`v3-lite 将可算维度原始分（0-20/维）求和；全部 14 维齐备时满分 ${maxScore}。组合分（景气/拥挤）0-100 仅在成分维齐全时给出。`}>
                    <Tag color="blue" style={{ margin: 0 }}>
                      综合 {totalVal} · 可算 {availCount ?? '—'}/14 · 缺失 {nullCount ?? '—'}
                    </Tag>
                  </Tooltip>
                )}
                <Tag color="default" style={{ margin: 0, fontSize: 11 }}>
                  v3-lite 真实计算 · 无演示值
                </Tag>
              </Space>
            }
            extra={
              <Space size={8} wrap style={{ fontSize: 12, color: TEXT_SEC }}>
                <span>成分股 {fmtInt(toNum(meta?.stockCount))} 只</span>
                <span>PE中位 {fmt2(meta?.medianPE != null ? toNum(meta.medianPE) : null)}</span>
                <span>板块K线源 {klineSourceLabel(meta?.boardKlineSource)} · {fmtInt(toNum(meta?.boardKlineDays))} 日</span>
              </Space>
            }
          >
            {/* 组合分横条：景气度 / 拥挤度（0-100，后端仅在成分维齐全时给出） */}
            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 14 }}>
              <GroupScoreChip label="📈 景气度" value={boomVal} tone="#22c55e" hint="扩散+回补+动量仓位+概念广度+涨停扩散（5维×20）" />
              <GroupScoreChip label="🔥 拥挤度" value={crowdVal} tone="#f59e0b" hint="拥挤度+集中度+Z值+杠杆+恐慌+基金流向（归一至100）" />
            </div>

            <Row gutter={[16, 8]}>
              {GROUPS.map(g => {
                const keys = dimsByGroup(g.key);
                if (keys.length === 0) return null;
                return (
                  <Col xs={24} md={12} xl={8} key={g.key}>
                    <div style={{ fontSize: 12, fontWeight: 700, color: TEXT_SEC, marginBottom: 6, display: 'flex', justifyContent: 'space-between' }}>
                      <span>{GROUP_ICONS[g.key]} {g.title}</span>
                      <span style={{ opacity: 0.8 }}>
                        {groupAvail(g.key)}/{keys.length}
                      </span>
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                      {keys.map(k => {
                        const metaK = DIM_META[k];
                        const dim = dims?.[k];
                        const score = toNum(dim?.score);
                        const available = score != null;
                        return (
                          <Tooltip key={k} title={available ? dim?.detail : (dim?.detail || metaK.awaiting)}>
                            <div style={{
                              display: 'flex', alignItems: 'center', gap: 10,
                              padding: '8px 10px', borderRadius: 8,
                              background: 'var(--bg-secondary)', border: '1px solid var(--border-default)',
                              cursor: 'help',
                            }}>
                              <span style={{ fontSize: 16, flexShrink: 0 }}>{metaK.icon}</span>
                              <div style={{ flex: 1, minWidth: 0 }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 3 }}>
                                  <span style={{ fontSize: 12, fontWeight: 600, color: TEXT }}>{metaK.label}</span>
                                  {available ? (
                                    <Tag color={dimTone(score as number, metaK.polarity)} style={{ margin: 0, fontSize: 11, lineHeight: '16px' }}>
                                      {score}/20
                                    </Tag>
                                  ) : (
                                    <Tag color="default" style={{ margin: 0, fontSize: 11, lineHeight: '16px' }}>
                                      ⏳ 数据积累中
                                    </Tag>
                                  )}
                                </div>
                                <div
                                  style={{
                                    height: 4, borderRadius: 2, background: 'var(--border-default)', overflow: 'hidden',
                                  }}
                                >
                                  {available && (
                                    <div style={{
                                      height: '100%', borderRadius: 2,
                                      width: `${Math.min(100, (score as number) * 5)}%`,
                                      background: `linear-gradient(90deg, ${metaK.accent}, ${metaK.accent}88)`,
                                    }} />
                                  )}
                                </div>
                                <div style={{
                                  fontSize: 11, color: TEXT_SEC, marginTop: 3,
                                  overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                                }}>
                                  {available ? dim?.label : (dim?.label === '历史缺失' || !dim?.label ? metaK.awaiting : dim?.label)}
                                </div>
                              </div>
                            </div>
                          </Tooltip>
                        );
                      })}
                    </div>
                  </Col>
                );
              })}
            </Row>
          </Card>
        ) : (
          <Card size="small" style={{ marginBottom: 16 }}>
            <Empty
              image={null}
              description={
                <div style={{ color: TEXT_SEC, fontSize: 12, lineHeight: 1.8 }}>
                  <div style={{ fontSize: 13, color: TEXT, marginBottom: 4 }}>🎯 板块多维矩阵暂不可用</div>
                  <div>{multidimError || '多维矩阵接口未返回数据'}</div>
                  <div style={{ marginTop: 6, opacity: 0.8 }}>
                    v3-lite 引擎对缺失数据如实返回 null，本页不做任何降级估算——宁可留白，不用假数据填充。
                    可尝试切换其它申万行业，或点击重试。
                  </div>
                </div>
              }
            >
              <Space>
                <Tag icon={<ReloadOutlined />} color="blue" style={{ cursor: 'pointer' }} onClick={() => setReloadKey(k => k + 1)}>
                  重试
                </Tag>
              </Space>
            </Empty>
          </Card>
        )
      ) : null}

      {/* ========== 板块实时概览（来自 /api/sectors/momentum，0-100 综合评分） ========== */}
      {selected && (
        <Row gutter={[12, 12]} style={{ marginBottom: 16 }}>
          <Col xs={12} sm={8} md={6}>
            <Tooltip title="板块动量评分（0-100）= 动量35% + 涨跌25% + 广度25% + 量能15%（成分<10 只按比例折减），口径同发掘页">
              <Card size="small">
                <div style={{ color: TEXT_SEC, fontSize: 12, marginBottom: 4 }}>综合评分</div>
                <span style={{ fontSize: 26, fontWeight: 800, color: scoreColor(toNum(selected.score) ?? 0), fontFamily: 'monospace' }}>
                  {fmtInt(toNum(selected.score))}
                </span>
                <Tag color="default" style={{ marginLeft: 8, fontSize: 11 }}>{scoreLabel(toNum(selected.score) ?? 0)}</Tag>
              </Card>
            </Tooltip>
          </Col>
          <Col xs={12} sm={8} md={6}>
            <Card size="small">
              <div style={{ color: TEXT_SEC, fontSize: 12, marginBottom: 4 }}>平均涨跌幅</div>
              {(() => {
                const v = toNum(selected.avg_change_percent);
                return v == null
                  ? <span style={{ fontSize: 22, fontWeight: 700, color: TEXT }}>—</span>
                  : (
                    <span style={{ fontSize: 22, fontWeight: 700, color: v >= 0 ? COLOR_UP : COLOR_DOWN, fontFamily: 'monospace' }}>
                      {v >= 0 ? '+' : ''}{v.toFixed(2)}%
                    </span>
                  );
              })()}
            </Card>
          </Col>
          <Col xs={12} sm={8} md={6}>
            <Card size="small">
              <div style={{ color: TEXT_SEC, fontSize: 12, marginBottom: 4 }}>上涨广度</div>
              {(() => {
                const v = toNum(selected.breadthScore);
                return v == null
                  ? <span style={{ fontSize: 22, fontWeight: 700, color: TEXT }}>—</span>
                  : <span style={{ fontSize: 22, fontWeight: 700, color: TEXT, fontFamily: 'monospace' }}>{v.toFixed(0)}%</span>;
              })()}
            </Card>
          </Col>
          <Col xs={12} sm={8} md={6}>
            <Card size="small">
              <div style={{ color: TEXT_SEC, fontSize: 12, marginBottom: 4 }}>成分股 / 涨停</div>
              <span style={{ fontSize: 22, fontWeight: 700, color: TEXT, fontFamily: 'monospace' }}>
                {fmtInt(toNum(selected.stock_count))}
              </span>
              <span style={{ fontSize: 13, color: TEXT_SEC, marginLeft: 8 }}>
                只
              </span>
              <span style={{ marginLeft: 10, fontSize: 16 }}>
                {(() => {
                  const lu = toNum(selected.limit_up_count);
                  if (lu == null) return <span style={{ color: TEXT_SEC, fontSize: 13 }}>涨停 —</span>;
                  return (
                    <span style={{ color: lu > 0 ? '#ff4d4f' : TEXT_SEC, fontSize: 13 }}>
                      🔥 涨停 {lu}
                    </span>
                  );
                })()}
              </span>
            </Card>
          </Col>
        </Row>
      )}

      {/* ========== 板块成分股（实时行情） ========== */}
      <Card
        title={<span style={{ color: TEXT }}>{selected?.industry || activeIndustry} — 板块成分股（按涨跌幅排序）</span>}
        size="small"
        styles={{ body: { paddingTop: 0 } }}
      >
        <Table
          columns={stockColumns}
          dataSource={stocks}
          rowKey="symbol"
          loading={stocksLoading}
          pagination={false}
          size="small"
          locale={{ emptyText: stocksError ? <Empty image={null} description={stocksError} /> : undefined }}
          onRow={(record) => ({
            onClick: () => navigate(`/stocks/${record.symbol}`),
            style: { cursor: 'pointer' },
          })}
        />
      </Card>
    </div>
  );
}

/** 组合分小横条：value 为 null 表示成分维不齐 → 「数据积累中」 */
function GroupScoreChip({ label, value, tone, hint }: { label: string; value: number | null; tone: string; hint: string }) {
  const available = value != null;
  return (
    <Tooltip title={available ? `${hint}\n综合景气需该组全部维度可算，满分 100` : `成分维未齐备，综合分暂不计算（${hint}）`}>
      <div style={{
        flex: '1 1 180px', maxWidth: 260,
        padding: '10px 14px', borderRadius: 10,
        background: 'var(--bg-secondary)', border: '1px solid var(--border-default)',
        cursor: 'help',
      }}>
        <div style={{ fontSize: 12, color: TEXT_SEC, marginBottom: 4 }}>{label}</div>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
          {available ? (
            <>
              <span style={{ fontSize: 24, fontWeight: 800, color: tone, fontFamily: 'monospace' }}>{value}</span>
              <span style={{ fontSize: 11, color: TEXT_SEC }}>/100</span>
            </>
          ) : (
            <span style={{ fontSize: 14, fontWeight: 600, color: TEXT_SEC }}>⏳ 数据积累中</span>
          )}
        </div>
      </div>
    </Tooltip>
  );
}
