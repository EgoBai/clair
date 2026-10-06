/**
 * 指数详情页 — 富途/同花顺风格
 * 显示指数K线图、成分股涨跌榜
 *
 * 数据来源（2026-10-06 死链清算，逐一实测 HTTP 状态后改接）：
 * - 指数快照 ← GET /api/market/indices（app.ts:119 → stock.ts:282，腾讯实时源，dataSource:'real'）
 * - 指数 K 线 ← GET /api/market/kline?symbol=&days=（app.ts:119 → market.ts:63，东方财富日线）
 * - 成分股涨跌榜 ← GET /api/market/top-gainers|top-losers（stock.ts:306/316，本地真实行情库）
 *
 * 旧实现调用的 `/api/index/:symbol`、`/api/index/:symbol/kline`、`/api/index/:symbol/strategy`
 * 三条路径后端**从未注册**（实测均404），故本页面此前永远停在「指数数据不可用」空态。
 * `/api/index/:symbol/strategy`（技术分析）经查无等价端点：`/api/indicators/:symbol` 只认个股
 * （实测传 000001.SH 返回 404「股票未找到」），`/api/tech/batch` 对指数返回 dataSource:'unavailable'。
 * 因此技术分析卡片改为显式说明「未接入」而非展示 0 值。
 */
import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Breadcrumb, Typography, Card, Skeleton, Alert } from 'antd';
import { EmptyState } from '../components/Common/StateComponents';
import { ArrowLeftOutlined, RiseOutlined, FallOutlined, CompassOutlined } from '@ant-design/icons';
import ReactECharts from 'echarts-for-react';
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
  /** 成分股涨跌榜 —— 后端无「指数成分股」端点，此处承载的是全市场涨跌榜（见 fetchData 注释） */
  topGainers: Constituent[]; topLosers: Constituent[];
}

/** 涨跌榜条目（/api/market/top-gainers|top-losers 的行形状，snake_case） */
interface Constituent {
  symbol: string; name: string;
  close_price: string; change_percent: string;
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

  useEffect(() => {
    if (!symbol) return;
    const ac = new AbortController();
    (async () => {
      setLoading(true);
      setDetail(null);
      setKline([]);
      setUnavailable([]);

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

      // ---- 2) 涨跌榜：后端无「指数成分股」端点，只有全市场榜，语义如实标注为全市场 ----
      if (detailData) {
        const [gRes, lRes] = await Promise.allSettled([
          fetch('/api/market/top-gainers?limit=10', opts).then(r => r.json()),
          fetch('/api/market/top-losers?limit=10', opts).then(r => r.json()),
        ]);
        if (ac.signal.aborted) return;
        const pick = (r: PromiseSettledResult<any>, key: string): Constituent[] =>
          r.status === 'fulfilled' && Array.isArray(r.value?.data?.[key])
            ? r.value.data[key]
            : [];
        const gainers = pick(gRes, 'topGainers');
        const losers = pick(lRes, 'topLosers');
        if (gainers.length === 0 && losers.length === 0) {
          missing.push('涨跌榜：后端本地行情库无当日涨跌数据（非交易日或未同步）');
        }
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
          missing.push(`K线图：${d?.message || '后端 K 线源不可达'}`);
        }
      } catch (e) {
        if (ac.signal.aborted) return;
        missing.push('K线图：/api/market/kline 请求失败');
      }

      // ---- 4) 技术分析：确认后端无等价端点，如实告知未接入（不展示任何 0 值/推测值） ----
      missing.push('技术分析（综合评分/仓位建议/RSI）：后端暂无指数技术分析端点，功能未接入');

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

  const up = detail.changePercent >= 0;
  const changeColor = up ? COLOR_UP : COLOR_DOWN;

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
                {detail.closePrice.toFixed(2)}
              </div>
              <div style={{ fontSize: 18, fontWeight: 700, color: changeColor, marginTop: 4, fontFamily: 'monospace' }}>
                {up ? '+' : ''}{detail.changePercent.toFixed(2)}%
              </div>
            </div>
            <div style={{ display: 'flex', gap: 24, fontSize: 13, color: TEXT_SEC }}>
              <div>开盘 <span style={{ color: TEXT, fontWeight: 600 }}>{detail.openPrice.toFixed(2)}</span></div>
              <div>最高 <span style={{ color: COLOR_UP, fontWeight: 600 }}>{detail.highPrice.toFixed(2)}</span></div>
              <div>最低 <span style={{ color: COLOR_DOWN, fontWeight: 600 }}>{detail.lowPrice.toFixed(2)}</span></div>
              <div>成交额 <span style={{ color: TEXT, fontWeight: 600 }}>{formatBig(detail.turnover)}</span></div>
              <div>成交量 <span style={{ color: TEXT, fontWeight: 600 }}>{formatBig(detail.volume)}手</span></div>
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

        {/* Top Gainers / Losers —— 后端只有全市场涨跌榜，无「指数成分股」端点，故标题如实标注为全市场 */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
          {detail.topGainers?.length > 0 && (
            <Card
              title={<span style={{ fontWeight: 600, color: COLOR_UP }}><RiseOutlined /> 全市场涨幅榜 TOP10</span>}
              style={{ borderRadius: 12, border: '1px solid #e2e8f0' }}
              bodyStyle={{ padding: '8px 16px' }}
            >
              {detail.topGainers.map((s, i) => (
                <div key={s.symbol} onClick={() => navigate(`/stocks/${s.symbol}`)}
                  style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: i < 9 ? '1px solid #f1f5f9' : 'none', cursor: 'pointer', fontSize: 13 }}>
                  <span style={{ color: TEXT }}>{s.name}</span>
                  <span style={{ color: COLOR_UP, fontWeight: 600, fontFamily: 'monospace' }}>+{Number(s.change_percent).toFixed(2)}%</span>
                </div>
              ))}
            </Card>
          )}
          {detail.topLosers?.length > 0 && (
            <Card
              title={<span style={{ fontWeight: 600, color: COLOR_DOWN }}><FallOutlined /> 全市场跌幅榜 TOP10</span>}
              style={{ borderRadius: 12, border: '1px solid #e2e8f0' }}
              bodyStyle={{ padding: '8px 16px' }}
            >
              {detail.topLosers.map((s, i) => (
                <div key={s.symbol} onClick={() => navigate(`/stocks/${s.symbol}`)}
                  style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: i < 9 ? '1px solid #f1f5f9' : 'none', cursor: 'pointer', fontSize: 13 }}>
                  <span style={{ color: TEXT }}>{s.name}</span>
                  <span style={{ color: COLOR_DOWN, fontWeight: 600, fontFamily: 'monospace' }}>{Number(s.change_percent).toFixed(2)}%</span>
                </div>
              ))}
            </Card>
          )}
        </div>
      </div>
    </div>
  );
};

export default IndexDetailPage;
