/**
 * 指数详情页 — 富途/同花顺风格
 * 显示指数K线图、成分股涨跌榜
 *
 * 数据来源（2026-10-28 更新，逐一实测 HTTP 状态后改接）：
 * - 指数快照 ← GET /api/market/indices（app.ts:119 → stock.ts:282，腾讯实时源，dataSource:'real'）
 * - 指数 K 线 ← GET /api/market/kline?symbol=&days=（app.ts:119 → market.ts:63，东方财富日线）
 * - 指数技术分析 ← GET /api/market/index-tech/:symbol（后端新增，三态兼容：real / unavailable / 404）
 * - 成分股涨跌榜 ← GET /api/market/index-top-movers/:symbol?limit=（后端新增，real 时按 scopeLabel 如实标注口径）
 *   不可用（404 / dataSource!=='real'）时回退 GET /api/market/top-gainers|top-losers（stock.ts:306/316，全市场榜，
 *   本地行情库不含北交所），并在卡片底部如实标注「成分股行情暂不可用」。
 *
 * 旧实现调用的 `/api/index/:symbol`、`/api/index/:symbol/kline`、`/api/index/:symbol/strategy`
 * 三条路径后端**从未注册**（实测均404）。
 *
 * 诚实渲染纪律（复自 hkConnectNullAdapt / marketPulseNullGauge 两轮修复）：
 *   null / undefined / NaN 一律显示「—」，绝不退化成 0 或 NaN 字符串。
 *   线上 Worker 的 /api/market/indices 对部分指数不返回 openPrice/highPrice/lowPrice/turnover
 *   （实测 sz399006 仅含 closePrice/changePercent/volume），旧实现 Number(undefined)→NaN
 *   直接渲染出「开盘 NaN」，本版已改为 null 容错。
 */
import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Breadcrumb, Typography, Card, Skeleton, Alert } from 'antd';
import { EmptyState } from '../components/Common/StateComponents';
import { ArrowLeftOutlined, RiseOutlined, FallOutlined, CompassOutlined } from '@ant-design/icons';import ReactECharts from 'echarts-for-react';
import echarts from '@/utils/echarts';

const { Title, Text } = Typography;

import { THEME } from '../styles/theme-constants';
const BG = THEME.bg;
const _CARD_BG = THEME.cardBg;
const TEXT = THEME.text;
const TEXT_SEC = THEME.textSec;
const COLOR_UP = THEME.up;
const COLOR_DOWN = THEME.down;
const _ACCENT = THEME.accent;

interface IndexDetail {
  symbol: string; name: string; displaySymbol: string;
  closePrice: number; changePercent: number; volume: number; turnover: number;
  highPrice: number; lowPrice: number; openPrice: number;
  /** 涨跌榜 —— 优先成分股榜（index-top-movers），回退全市场榜（top-gainers|top-losers），口径见 moversMeta */
  topGainers: Constituent[]; topLosers: Constituent[];
}

/** 涨跌榜条目（index-top-movers / top-gainers|top-losers 的行形状，snake_case；null 容错见 renderRows） */
interface Constituent {
  symbol: string; name: string;
  close_price: string | number | null; change_percent: string | number | null;
}

/** 涨跌榜口径元数据 —— 决定卡片标题与底部口径小字是「成分股」还是「全市场」 */
interface MoversMeta {
  /** true = 后端成分股榜真实返回；false = 已回退全市场榜 */
  constituents: boolean;
  scopeLabel: string | null;
  tradeDate: string | null;
}

/** 指数技术分析（GET /api/market/index-tech/:symbol 的 data，字段均可缺失/null） */
interface TechDetail {
  indexSymbol?: string; indexName?: string; asOf?: string; source?: string;
  ma?: { ma5?: number | null; ma10?: number | null; ma20?: number | null; ma60?: number | null };
  rsi14?: number | null;
  compositeScore?: number | null;
  positionAdvice?: string | Record<string, unknown> | null;
}

interface KLineQuote {
  tradeDate: string; openPrice: number; closePrice: number;
  highPrice: number; lowPrice: number; volume: number;
}

const IndexDetailPage: React.FC = () => {
  const { symbol } = useParams<{ symbol: string }>();
  const navigate = useNavigate();
  const [detail, setDetail] = useState<IndexDetail | null>(null);
  const [kline, setKline] = useState<KLineQuote[]>([]);
  const [loading, setLoading] = useState(true);
  /** 诚实标注：哪些子区块因无后端支撑而未展示 */
  const [unavailable, setUnavailable] = useState<string[]>([]);
  /** 技术分析：null = 端点不可用/未部署（页面显示诚实 Alert，绝不显示 0 值） */
  const [tech, setTech] = useState<TechDetail | null>(null);
  /** 涨跌榜口径：constituents=true 用 scopeLabel 命名，false 标注「全市场」 */
  const [moversMeta, setMoversMeta] = useState<MoversMeta>({ constituents: false, scopeLabel: null, tradeDate: null });

  /** null / undefined / NaN → '—'，绝不渲染出 'NaN' 或退化成 0（诚实红线） */
  const fmtNum = (v: unknown, digits = 2): string => {
    const n = Number(v);
    return v == null || !Number.isFinite(n) ? '—' : n.toFixed(digits);
  };
  const fmtPct = (v: unknown): string => {
    const n = Number(v);
    return v == null || !Number.isFinite(n) ? '—' : `${n >= 0 ? '+' : ''}${n.toFixed(2)}%`;
  };

  useEffect(() => {
    if (!symbol) return;
    const ac = new AbortController();
    (async () => {
      setLoading(true);
      setDetail(null);
      setKline([]);
      setUnavailable([]);
      setTech(null);
      setMoversMeta({ constituents: false, scopeLabel: null, tradeDate: null });

      const opts = { signal: ac.signal };
      const missing: string[] = [];

      // ---- 1) 指数快照：/api/market/indices 返回全部指数，按 symbol 过滤出当前这一条 ----
      let detailData: IndexDetail | null = null;
      try {
        const res = await fetch('/api/market/indices', opts);
        const body = await res.json();
        const list: any[] = body?.data?.indices || [];
        const hit = list.find(i => i.symbol === symbol);
        if (hit) {
          detailData = {
            symbol: hit.symbol,
            name: hit.name,
            displaySymbol: hit.symbol,
            closePrice: Number(hit.closePrice),
            changePercent: Number(hit.changePercent),
            volume: Number(hit.volume),
            turnover: Number(hit.turnover),
            highPrice: Number(hit.highPrice),
            lowPrice: Number(hit.lowPrice),
            openPrice: Number(hit.openPrice),
            topGainers: [],
            topLosers: [],
          };
        } else if (list.length === 0) {
          missing.push('指数快照：后端实时指数源不可达（dataSource=unavailable）');
        } else {
          missing.push(`指数快照：后端返回的 ${list.length} 条指数中没有 ${symbol}，该代码可能已不支持`);
        }
      } catch (e) {
        if (ac.signal.aborted) return;
        missing.push('指数快照：/api/market/indices 请求失败');
      }

      // ---- 2) 涨跌榜：优先成分股榜 /api/market/index-top-movers/:symbol，
      //         不可用（404 / dataSource!=='real'）时回退全市场榜并如实标注口径 ----
      if (detailData) {
        let gainers: Constituent[] = [];
        let losers: Constituent[] = [];
        let constituents = false;
        let scopeLabel: string | null = null;
        let tradeDate: string | null = null;

        try {
          const res = await fetch(`/api/market/index-top-movers/${encodeURIComponent(symbol)}?limit=10`, opts);
          const body = await res.json().catch(() => null);
          if (res.ok && body?.dataSource === 'real' && body?.data && typeof body.data === 'object') {
            const d = body.data;
            gainers = Array.isArray(d.topGainers) ? d.topGainers : [];
            losers = Array.isArray(d.topLosers) ? d.topLosers : [];
            scopeLabel = typeof d.scopeLabel === 'string' && d.scopeLabel.trim() ? d.scopeLabel.trim() : null;
            tradeDate = typeof d.tradeDate === 'string' && d.tradeDate.trim() ? d.tradeDate.trim()
              : typeof d.asOf === 'string' && d.asOf.trim() ? d.asOf.trim() : null;
            constituents = gainers.length > 0 || losers.length > 0;
          }
        } catch (e) {
          if (ac.signal.aborted) return;
          // 请求本身失败 → 走全市场回退
        }

        if (!constituents) {
          const [gRes, lRes] = await Promise.allSettled([
            fetch('/api/market/top-gainers?limit=10', opts).then(r => r.json()),
            fetch('/api/market/top-losers?limit=10', opts).then(r => r.json()),
          ]);
          if (ac.signal.aborted) return;
          const pick = (r: PromiseSettledResult<any>, key: string): Constituent[] =>
            r.status === 'fulfilled' && Array.isArray(r.value?.data?.[key])
              ? r.value.data[key]
              : [];
          gainers = pick(gRes, 'topGainers');
          losers = pick(lRes, 'topLosers');
          if (gainers.length === 0 && losers.length === 0) {
            missing.push('涨跌榜：后端本地行情库无当日涨跌数据（非交易日或未同步）');
          }
        }
        setMoversMeta({ constituents, scopeLabel, tradeDate });
        detailData = { ...detailData, topGainers: gainers, topLosers: losers };
      }

      // ---- 3) 指数 K 线：/api/market/kline 返回并行数组，需转成 candlestick 所需的行数组 ----
      try {
        const res = await fetch(`/api/market/kline?symbol=${encodeURIComponent(symbol)}&days=120`, opts);
        const body = await res.json();
        const d = body?.data;
        if (body?.dataSource === 'real' && Array.isArray(d?.dates) && d.dates.length > 0) {
          setKline(d.dates.map((date: string, i: number) => ({
            tradeDate: date,
            openPrice: Number(d.opens?.[i] ?? 0),
            closePrice: Number(d.prices?.[i] ?? 0),
            highPrice: Number(d.highs?.[i] ?? 0),
            lowPrice: Number(d.lows?.[i] ?? 0),
            volume: Number(d.volumes?.[i] ?? 0),
          })));
        } else {
          // 后端 dataSource='unavailable' 时会把上游错误原文（如 "fetch failed"）塞进 message，
          // 直接抛给用户不友好；这里保留其作为归因线索，但用中文说明白「是什么坏了」。
          const reason = typeof d?.message === 'string' && d.message.trim() && d.message !== 'fetch failed'
            ? `（后端归因：${d.message.trim()}）`
            : '（后端历史 K 线源当前不可达）';
          missing.push(`K线图：真实历史 K 线源不可达，本页不展示任何 K 线数据${reason}`);
        }
      } catch (e) {
        if (ac.signal.aborted) return;
        missing.push('K线图：/api/market/kline 请求失败');
      }

      // ---- 4) 技术分析：/api/market/index-tech/:symbol，三态兼容（real / unavailable / 404）----
      // 不可用时不显示任何数值（绝不用 0 冒充），只在本页 Alert 里如实说明。
      let techData: TechDetail | null = null;
      try {
        const res = await fetch(`/api/market/index-tech/${encodeURIComponent(symbol)}`, opts);
        const body = await res.json().catch(() => null);
        if (res.ok && body?.dataSource === 'real' && body?.data && typeof body.data === 'object') {
          techData = body.data as TechDetail;
        }
      } catch (e) {
        if (ac.signal.aborted) return;
      }
      if (!techData) {
        missing.push('技术分析：数据源暂不可用（后端端点未部署或源失败）');
      }
      setTech(techData);

      if (ac.signal.aborted) return;
      setDetail(detailData);
      setUnavailable(missing);
      setLoading(false);
    })();
    return () => ac.abort();
  }, [symbol]);

  if (loading) return (
    <div style={{ padding: 16, maxWidth: 1400, margin: '0 auto' }}>
      <Skeleton active paragraph={{ rows: 1 }} style={{ marginBottom: 16 }} />
      <Skeleton active paragraph={{ rows: 6 }} />
    </div>
  );
  if (!detail) return <div style={{ padding: 40, textAlign: 'center' }}><EmptyState title="指数数据不可用" /></div>;

  // Worker 数据里 openPrice/highPrice 等字段可能整体缺失（实测 sz399006），
  // 旧实现 Number(undefined)=NaN 直接渲染「开盘 NaN」；这里统一 null 容错为「—」。
  const closeNum = Number.isFinite(Number(detail.closePrice)) ? Number(detail.closePrice) : null;
  const pctNum = Number.isFinite(Number(detail.changePercent)) ? Number(detail.changePercent) : null;
  const up = pctNum != null && pctNum >= 0;
  const changeColor = pctNum == null ? TEXT_SEC : up ? COLOR_UP : COLOR_DOWN;

  // K-line chart option
  const klineDates = kline.map(q => q.tradeDate);
  const klineValues = kline.map(q => [q.openPrice, q.closePrice, q.lowPrice, q.highPrice]);

  const chartOption = {
    backgroundColor: 'transparent',
    tooltip: { trigger: 'axis', axisPointer: { type: 'cross' } },
    grid: { left: '3%', right: '3%', top: 20, bottom: 40 },
    xAxis: { type: 'category', data: klineDates, axisLabel: { fontSize: 10, color: '#94a3b8' }, axisLine: { lineStyle: { color: '#e2e8f0' } } },
    yAxis: { type: 'value', scale: true, axisLabel: { fontSize: 10, color: '#94a3b8' }, splitLine: { lineStyle: { color: '#f1f5f9' } } },
    series: [{
      type: 'candlestick',
      data: klineValues,
      itemStyle: { color: COLOR_UP, color0: COLOR_DOWN, borderColor: COLOR_UP, borderColor0: COLOR_DOWN },
    }],
  };

  const formatBig = (n: number) => n >= 1e12 ? (n / 1e12).toFixed(2) + '万亿' : n >= 1e8 ? (n / 1e8).toFixed(1) + '亿' : n >= 1e4 ? (n / 1e4).toFixed(1) + '万' : String(n);
  const formatBigSafe = (v: unknown) => {
    const n = Number(v);
    return Number.isFinite(n) ? formatBig(n) : '—';
  };

  /** 技术分析卡的仓位建议：字符串直接用；对象则平铺键值；缺失显示「—」 */
  const adviceText = (pa: TechDetail['positionAdvice']): string => {
    if (pa == null) return '—';
    if (typeof pa === 'string') return pa.trim() || '—';
    if (typeof pa === 'object') {
      const entries = Object.entries(pa).filter(([, v]) => v != null && String(v).trim() !== '');
      return entries.length > 0 ? entries.map(([k, v]) => `${k}：${String(v)}`).join('；') : '—';
    }
    return '—';
  };

  /** 涨跌榜卡片标题：成分股榜用后端 scopeLabel（跌幅榜由涨幅榜文案派生），回退时如实标注「全市场」 */
  const moversTitle = (kind: 'gainers' | 'losers'): string => {
    if (moversMeta.constituents && moversMeta.scopeLabel) {
      return kind === 'gainers'
        ? moversMeta.scopeLabel
        : (moversMeta.scopeLabel.includes('涨幅榜')
            ? moversMeta.scopeLabel.replace('涨幅榜', '跌幅榜')
            : moversMeta.scopeLabel);
    }
    return kind === 'gainers' ? '全市场涨幅榜 TOP10' : '全市场跌幅榜 TOP10';
  };

  return (
    <div style={{ background: BG, minHeight: '100vh' }}>
      <div style={{ maxWidth: 1200, margin: '0 auto', padding: '20px 24px' }}>
        <Breadcrumb
          style={{ marginBottom: 12 }}
          items={[
            { href: '/', title: <><CompassOutlined /> 发掘</> },
            { title: detail.name },
          ]}
        />

        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 20 }}>
          <ArrowLeftOutlined style={{ cursor: 'pointer', color: TEXT_SEC, fontSize: 18 }} onClick={() => navigate(-1)} />
          <div style={{ flex: 1 }}>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 12 }}>
              <Title level={3} style={{ margin: 0, color: TEXT, fontWeight: 700 }}>{detail.name}</Title>
              <Text style={{ color: TEXT_SEC, fontSize: 13, fontFamily: 'monospace' }}>{detail.displaySymbol}</Text>
            </div>
          </div>
        </div>

        {/* Price Card */}
        <Card style={{ marginBottom: 16, borderRadius: 12, border: '1px solid #e2e8f0' }}>
          <div style={{ display: 'flex', alignItems: 'flex-end', gap: 16, flexWrap: 'wrap' }}>
            <div>
              <div style={{ fontSize: 36, fontWeight: 800, color: TEXT, fontFamily: 'monospace', lineHeight: 1.1 }}>
                {closeNum != null ? closeNum.toFixed(2) : '—'}
              </div>
              <div style={{ fontSize: 18, fontWeight: 700, color: changeColor, marginTop: 4, fontFamily: 'monospace' }}>
                {pctNum != null ? `${up ? '+' : ''}${pctNum.toFixed(2)}%` : '—'}
              </div>
            </div>
            <div style={{ display: 'flex', gap: 24, fontSize: 13, color: TEXT_SEC }}>
              <div>开盘 <span style={{ color: TEXT, fontWeight: 600 }}>{fmtNum(detail.openPrice)}</span></div>
              <div>最高 <span style={{ color: COLOR_UP, fontWeight: 600 }}>{fmtNum(detail.highPrice)}</span></div>
              <div>最低 <span style={{ color: COLOR_DOWN, fontWeight: 600 }}>{fmtNum(detail.lowPrice)}</span></div>
              <div>成交额 <span style={{ color: TEXT, fontWeight: 600 }}>{formatBigSafe(detail.turnover)}</span></div>
              <div>成交量 <span style={{ color: TEXT, fontWeight: 600 }}>{formatBigSafe(detail.volume)}手</span></div>
            </div>
          </div>
        </Card>

        {/* K-line Chart */}
        {kline.length > 0 && (
          <Card
            title={<span style={{ fontWeight: 600 }}>K线图</span>}
            style={{ marginBottom: 16, borderRadius: 12, border: '1px solid #e2e8f0' }}
          >
            <ReactECharts echarts={echarts} option={chartOption} style={{ height: 400 }} />
          </Card>
        )}

        {/* 技术分析：仅在后端 index-tech 端点真实返回（dataSource==='real'）时渲染，
            否则走上方 unavailable Alert 的诚实说明，绝不显示 0 值 */}
        {tech && (
          <Card
            title={<span style={{ fontWeight: 600 }}>技术分析</span>}
            extra={<span style={{ fontSize: 12, color: TEXT_SEC }}>
              {tech.asOf ? `截至 ${tech.asOf}` : ''}{tech.source ? ` · 数据源 ${tech.source}` : ''}
            </span>}
            style={{ marginBottom: 16, borderRadius: 12, border: '1px solid #e2e8f0' }}
          >
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: 12, marginBottom: 8 }}>
              {([['MA5', tech.ma?.ma5], ['MA10', tech.ma?.ma10], ['MA20', tech.ma?.ma20], ['MA60', tech.ma?.ma60]] as const).map(([label, v]) => (
                <div key={label}>
                  <div style={{ fontSize: 12, color: TEXT_SEC }}>{label}</div>
                  <div style={{ fontSize: 16, fontWeight: 700, fontFamily: 'monospace', color: TEXT }}>{fmtNum(v)}</div>
                </div>
              ))}
              <div>
                <div style={{ fontSize: 12, color: TEXT_SEC }}>RSI14</div>
                <div style={{ fontSize: 16, fontWeight: 700, fontFamily: 'monospace', color: TEXT }}>{fmtNum(tech.rsi14)}</div>
              </div>
              <div>
                <div style={{ fontSize: 12, color: TEXT_SEC }}>综合评分</div>
                <div style={{ fontSize: 16, fontWeight: 700, fontFamily: 'monospace', color: TEXT }}>{fmtNum(tech.compositeScore)}</div>
              </div>
            </div>
            <div style={{ fontSize: 13, color: TEXT }}>
              <span style={{ color: TEXT_SEC }}>仓位建议：</span>{adviceText(tech.positionAdvice)}
            </div>
            <div style={{ fontSize: 11, color: TEXT_SEC, marginTop: 6 }}>仓位建议为规则计算，仅供参考，不构成投资建议</div>
          </Card>
        )}

        {/* 未接入/不可用区块的诚实说明：不展示 0 值、不留空白 */}
        {unavailable.length > 0 && (
          <Alert
            type="info"
            showIcon
            style={{ marginBottom: 16 }}
            message="本指数的部分数据暂不可用"
            description={
              <ul style={{ margin: 0, paddingLeft: 18, fontSize: 13, lineHeight: 1.8 }}>
                {unavailable.map(u => <li key={u}>{u}</li>)}
              </ul>
            }
          />
        )}

        {/* 涨跌榜 —— 成分股榜（index-top-movers）真实返回时用后端 scopeLabel 命名；
            回退时标题如实标注为「全市场」，并在底部说明成分股行情不可用 */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
          {detail.topGainers?.length > 0 && (
            <Card
              title={<span style={{ fontWeight: 600, color: COLOR_UP }}><RiseOutlined /> {moversTitle('gainers')}</span>}
              style={{ borderRadius: 12, border: '1px solid #e2e8f0' }}
              bodyStyle={{ padding: '8px 16px' }}
            >
              {detail.topGainers.map((s, i) => (
                <div key={s.symbol} onClick={() => navigate(`/stocks/${s.symbol}`)}
                  style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: i < detail.topGainers.length - 1 ? '1px solid #f1f5f9' : 'none', cursor: 'pointer', fontSize: 13 }}>
                  <span style={{ color: TEXT, flex: 1 }}>{s.name}</span>
                  <span style={{ color: TEXT_SEC, fontFamily: 'monospace', marginRight: 12 }}>{fmtNum(s.close_price)}</span>
                  <span style={{ color: COLOR_UP, fontWeight: 600, fontFamily: 'monospace', minWidth: 72, textAlign: 'right' }}>{fmtPct(s.change_percent)}</span>
                </div>
              ))}
              <div style={{ paddingTop: 6, fontSize: 11, color: TEXT_SEC }}>
                {moversMeta.constituents
                  ? `成分口径：${moversMeta.scopeLabel ?? '指数成分股'}${moversMeta.tradeDate ? ` · 行情日期 ${moversMeta.tradeDate}` : ''}`
                  : '成分股行情暂不可用，以下为全市场榜（本地行情库不含北交所）'}
              </div>
            </Card>
          )}
          {detail.topLosers?.length > 0 && (
            <Card
              title={<span style={{ fontWeight: 600, color: COLOR_DOWN }}><FallOutlined /> {moversTitle('losers')}</span>}
              style={{ borderRadius: 12, border: '1px solid #e2e8f0' }}
              bodyStyle={{ padding: '8px 16px' }}
            >
              {detail.topLosers.map((s, i) => (
                <div key={s.symbol} onClick={() => navigate(`/stocks/${s.symbol}`)}
                  style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: i < detail.topLosers.length - 1 ? '1px solid #f1f5f9' : 'none', cursor: 'pointer', fontSize: 13 }}>
                  <span style={{ color: TEXT, flex: 1 }}>{s.name}</span>
                  <span style={{ color: TEXT_SEC, fontFamily: 'monospace', marginRight: 12 }}>{fmtNum(s.close_price)}</span>
                  <span style={{ color: COLOR_DOWN, fontWeight: 600, fontFamily: 'monospace', minWidth: 72, textAlign: 'right' }}>{fmtPct(s.change_percent)}</span>
                </div>
              ))}
              <div style={{ paddingTop: 6, fontSize: 11, color: TEXT_SEC }}>
                {moversMeta.constituents
                  ? `成分口径：${moversMeta.scopeLabel ?? '指数成分股'}${moversMeta.tradeDate ? ` · 行情日期 ${moversMeta.tradeDate}` : ''}`
                  : '成分股行情暂不可用，以下为全市场榜（本地行情库不含北交所）'}
              </div>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
};

export default IndexDetailPage;
