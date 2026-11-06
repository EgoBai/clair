/**
 * 股票详情页 v2 — 芝士财富/富途风格
 * 深色主题卡片 + 红涨绿跌(A股惯例) + 清晰K线 + 高对比度
 */

import React, { useState, useEffect, useCallback, useMemo, Suspense } from 'react';
import { Link, useParams, useNavigate, useSearchParams } from 'react-router-dom';
import {
  Typography, Breadcrumb, Card, Row, Col, Space, Tag, Alert,
  Spin, Button, Segmented, Divider, Tooltip, Skeleton, Tabs,
} from 'antd';

const { Paragraph } = Typography;
import { LoadingState, EmptyKLine, EmptyState } from '../components/Common/StateComponents';
import { StockOutlined, CompassOutlined,
  ReloadOutlined, StarOutlined, StarFilled, LineChartOutlined,
  FundProjectionScreenOutlined, FullscreenOutlined, FullscreenExitOutlined,
} from '@ant-design/icons';
import type { KLineData } from '../components/Charts/KLineChart';
const KLineChart = React.lazy(() => import('../components/Charts/KLineChart'));
const IndicatorPanel = React.lazy(() => import('../components/Charts/IndicatorPanel'));
import { useStockActions, useWatchlist } from '../store/useStockStore';
import { analyze } from '../utils/strategy';
import { readJson } from '../utils/api';
import { computeIndicatorSeries } from '../utils/indicatorCalc';
import { getNthTradingDay, countTradingDays } from '../utils/tradingCalendarEngine';
import MultiSignalPanel from '../components/AI/MultiSignalPanel';
import ValuationPanel from '../components/valuation/ValuationPanel';
import CapitalFlowPanel from '../components/Market/CapitalFlowPanel';
import StockThesisPanel from '../components/Stock/StockThesisPanel';
import {
  StockFinancialsPanel,
  StockResearchReportsPanel,
  StockAnnouncementsPanel,
  StockNewsPanel,
} from '../components/Stock/StockResearchPanels';
import { useGamificationStore } from '../store/useGamificationStore';

const { Title, Text } = Typography;

/** 个股详情 tab：概览保留原有全部区块，其余为研究与披露数据。 */
const STOCK_TAB_KEYS = ['overview', 'financials', 'valuation', 'reports', 'announcements', 'news'] as const;
type StockTabKey = (typeof STOCK_TAB_KEYS)[number];
const isStockTabKey = (value: string | null): value is StockTabKey =>
  !!value && (STOCK_TAB_KEYS as readonly string[]).includes(value);

// 游戏化埋点：查看个股详情（每个不同标的仅记一次，防 StrictMode 重复计数）
const VIEWED_STOCKS = new Set<string>();

import { THEME } from '../styles/theme-constants';
// 配色方案
const COLOR_UP = THEME.up;
const COLOR_DOWN = THEME.down;
const COLOR_FLAT = THEME.flat;
const _BG_CARD = THEME.cardBg;
const BG_PAGE = THEME.bg;
const TEXT_PRIMARY = THEME.text;
const TEXT_SECONDARY = THEME.textSec;
const BORDER = THEME.border;

/** AI 评分色阶：只走设计令牌，避免暗/亮主题各自一套 hex */
type ScoreTone = { fg: string; bg: string; border: string };
const scoreTone = (score: number): ScoreTone => {
  if (score >= 70) return { fg: 'var(--color-down)', bg: 'var(--color-down-bg)', border: 'var(--color-down)' };
  if (score >= 50) return { fg: 'var(--color-warning)', bg: 'var(--color-warning-bg)', border: 'var(--color-warning)' };
  return { fg: 'var(--color-up)', bg: 'var(--color-up-bg)', border: 'var(--color-up)' };
};

interface StockInfo {
  symbol: string;
  name: string;
  fullName?: string;
  market: string;
  industry?: string;
}

interface QuoteData {
  closePrice: number;
  openPrice: number;
  highPrice: number;
  lowPrice: number;
  change: number;
  changePercent: number;
  volume: number;
  turnover: number;
  turnoverRate: number;
  peRatio: number;
  pbRatio: number;
  marketCap: number;
  circulatingMarketCap: number;
  amplitude: number;
  /**
   * 该行行情对应的**交易日**（后端 mapDailyQuoteRow 一直返回，此前前端接口漏声明）。
   *
   * 必须展示出来：退市 / 长期停牌标的的最后一行真实成交可能远在今天之前
   * （实测 14 只，最远 PT金田A 停在 2002-01-25、ST星源 停在 2024-03-05）。
   * 不披露 as-of 日期，用户会把陈旧收盘价误当成「当前价」——这属于
   * 诚实数据红线（数据是真的，但时效被隐瞒了）。
   */
  tradeDate?: string;
}

const StockDetailPage: React.FC = () => {
  const { symbol } = useParams<{ symbol: string }>();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const tabParam = searchParams.get('tab');
  const activeTab: StockTabKey = isStockTabKey(tabParam) ? tabParam : 'overview';
  const handleTabChange = useCallback((key: string) => {
    const next = new URLSearchParams(searchParams);
    // overview 是默认页：不带参数能让链接更短，也避免 ?tab=overview 与裸链接并存
    if (key === 'overview') next.delete('tab');
    else next.set('tab', key);
    setSearchParams(next, { replace: true });
  }, [searchParams, setSearchParams]);
  const watchlist = useWatchlist();
  const { toggleWatchlist } = useStockActions();

  const [stockInfo, setStockInfo] = useState<StockInfo | null>(null);
  const [latestQuote, setLatestQuote] = useState<QuoteData | null>(null);
  const [klineData, setKlineData] = useState<KLineData[]>([]);
  const [loading, setLoading] = useState(true);
  const [klineLoading, setKlineLoading] = useState(true);
  const [stockError, setStockError] = useState<string | null>(null);
  const [klineError, setKlineError] = useState<string | null>(null);
  const [klinePeriod, setKlinePeriod] = useState<string>('daily');
  const [subIndicator, setSubIndicator] = useState<'volume'|'macd'|'kdj'|'rsi'>('volume');
  const [indicatorParams, setIndicatorParams] = useState({
    maPeriod: 14,
    macdFast: 12,
    macdSlow: 26,
    macdSignal: 9,
    kdjPeriod: 9,
    rsiPeriod: 14,
  });
  const [klineFullscreen, setKlineFullscreen] = useState(false);
  const [isMobile, setIsMobile] = useState(window.innerWidth < 768);
  // 个股策略（/api/stocks/:symbol/strategy）：Worker 已注册并返回真实计算值
  // （2026-11-04 实测 200：score/rating/position/stopLoss/takeProfit/indicators/summary）。
  // 此前该端点在 Worker 未注册、页面只能常驻「未接入」；现在取到就展示，取不到如实说明。
  const [aiStrategy, setAiStrategy] = useState<any>(null);
  const [strategyLoading, setStrategyLoading] = useState(false);
  const [strategyError, setStrategyError] = useState<string | null>(null);
  const [aiDiagnosis, setAiDiagnosis] = useState<any>(null);
  const [diagnosisLoading, setDiagnosisLoading] = useState(false);
  const [diagnosisError, setDiagnosisError] = useState<string | null>(null);

  const changeColor = useMemo(() => {
    if (!latestQuote) return COLOR_FLAT;
    return Number(latestQuote.changePercent) >= 0 ? COLOR_UP : COLOR_DOWN;
  }, [latestQuote]);

  const isInWatchlist = symbol ? watchlist.includes(symbol) : false;

  // 技术指标中心: 从 K 线计算全部 11 个指标 (useMemo 缓存避免重复计算)
  const indicatorSeries = useMemo(
    () => computeIndicatorSeries(
      klineData.map(k => ({
        date: k.tradeDate,
        open: k.open,
        high: k.high,
        low: k.low,
        close: k.close,
        volume: k.volume,
      })),
    ),
    [klineData],
  );

  /** 数值 → 文本；缺数一律「—」（诚实红线：不用 0 顶替空态）。 */
  const fmtNum = (v?: number | null, digits = 2) =>
    v === null || v === undefined || !Number.isFinite(Number(v)) ? '—' : Number(v).toFixed(digits);

  const formatLargeNumber = (num?: number | null) => {
    if (num === null || num === undefined || !Number.isFinite(Number(num))) return '—';
    if (!num && num !== 0) return '-';
    if (Math.abs(num) >= 1e12) return `${(num / 1e12).toFixed(2)}万亿`;
    if (Math.abs(num) >= 1e8) return `${(num / 1e8).toFixed(2)}亿`;
    if (Math.abs(num) >= 1e4) return `${(num / 1e4).toFixed(2)}万`;
    return num.toFixed(2);
  };

  const formatVolume = (vol?: number | null) => {
    if (vol === null || vol === undefined || !Number.isFinite(Number(vol))) return '—';
    if (vol >= 1e8) return `${(vol / 1e8).toFixed(2)}亿`;
    if (vol >= 1e4) return `${(vol / 1e4).toFixed(2)}万`;
    return `${vol}`;
  };

  const formatTurnover = (val?: number | null) => {
    if (val === null || val === undefined || !Number.isFinite(Number(val))) return '—';
    if (val >= 1e8) return `${(val / 1e8).toFixed(2)}亿`;
    if (val >= 1e4) return `${(val / 1e4).toFixed(2)}万`;
    return val.toFixed(2);
  };

  const fetchStockData = useCallback(async () => {
    if (!symbol) return;
    setLoading(true);
    setStockError(null);
    try {
      // 去后缀，纯代码查询
      const pureSymbol = symbol.replace(/\.(SH|SZ)$/, '');
      const resp = await fetch(`/api/stocks/${pureSymbol}`);
      if (!resp.ok) throw new Error(`行情接口返回 HTTP ${resp.status}`);
      const data = await readJson<any>(resp);

      if (data.success && data.data) {
        const d = data.data;
        setStockInfo({
          symbol: d.symbol || symbol,
          name: d.name || symbol,
          fullName: d.fullName,
          market: d.market || '',
          industry: d.industry || '',
        });
        // 契约以 backend/src/api/stock.ts 为准（latestQuote）；线上 Worker 历史上只回 quote。
        // 两者都是真实行情，取到哪个用哪个 —— 不再因为字段名不一致把详情页渲染成「暂无行情数据」。
        const lq = d.latestQuote ?? d.quote;
        if (lq && Number(lq.closePrice) > 0) {
          setLatestQuote(lq);
        }
      } else {
        setStockError(`行情接口未返回该股数据${data?.message ? `：${data.message}` : ''}`);
      }
    } catch (e) {
      const message = (e as Error)?.message || String(e);
      setStockError(`个股行情请求失败：${message}；本页不展示该股行情数据（取不到 ≠ 该股没有行情）`);
    } finally {
      setLoading(false);
    }
  }, [symbol]);

  const fetchKlineData = useCallback(async () => {
    if (!symbol) return;
    setKlineLoading(true);
    setKlineError(null);
    try {
      const pureSymbol = symbol.replace(/\.(SH|SZ)$/, '');
      const resp = await fetch(`/api/stocks/${pureSymbol}/kline?period=${klinePeriod}`);
      if (!resp.ok) throw new Error(`K线接口返回 HTTP ${resp.status}`);
      const kResp = await readJson<any>(resp);
      // K-line data
      if (kResp.success && kResp.data?.quotes?.length > 0) {
        const kData: KLineData[] = kResp.data.quotes
          .map((q: any) => ({
            tradeDate: q.tradeDate,
            open: q.open || 0,
            close: q.close || 0,
            high: q.high || 0,
            low: q.low || 0,
            volume: q.volume || 0,
            turnover: q.turnover || 0,
          }));
        setKlineData(kData);
      }
    } catch (e) {
      const message = (e as Error)?.message || String(e);
      console.error('获取K线数据失败:', e);
      setKlineData([]);
      setKlineError(`K线数据请求失败：${message}；取不到 ≠ 该股没有K线`);
    } finally {
      setKlineLoading(false);
    }
  }, [symbol, klinePeriod]);

  useEffect(() => { fetchStockData(); }, [fetchStockData]);
  useEffect(() => { fetchKlineData(); }, [fetchKlineData]);

  // 个股策略信号（综合评分/仓位/止损止盈/技术指标）：真实接口，取不到如实降级
  useEffect(() => {
    let cancelled = false;
    if (!symbol) return;
    const run = async () => {
      setStrategyLoading(true);
      setStrategyError(null);
      try {
        const pureSymbol = symbol.replace(/\.(SH|SZ)$/, '');
        const resp = await fetch(`/api/stocks/${pureSymbol}/strategy`);
        if (resp.status === 404) {
          // 404 有两种可能：端点未注册，或该代码无行情 —— 不猜是哪一种，也不展示任何评分
          if (!cancelled) setStrategyError('该部署未返回个股策略数据（HTTP 404）：可能端点未注册或该代码无行情；本页不展示评分或信号数值');
          return;
        }
        if (!resp.ok) throw new Error(`策略接口返回 HTTP ${resp.status}`);
        const body = await readJson<any>(resp);
        const data = body?.data ?? body;
        if (!data) throw new Error('策略接口未返回数据');
        if (data.dataSource === 'unavailable') {
          if (!cancelled) setStrategyError(data.note || '策略暂不可得：K线样本不足，本次不返回评分');
          return;
        }
        if (!cancelled) setAiStrategy(data);
      } catch (e) {
        const message = (e as Error)?.message || String(e);
        if (!cancelled) setStrategyError(`策略请求失败：${message}；取不到 ≠ 该股没有策略信号`);
      } finally {
        if (!cancelled) setStrategyLoading(false);
      }
    };
    run();
    return () => { cancelled = true; };
  }, [symbol]);

  // 资金流向（CapitalFlowPanel）：上游不可用时 data 为 null，面板整体隐藏
  const [fundFlow, setFundFlow] = useState<any>(null);
  useEffect(() => {
    if (!symbol) return;
    setFundFlow(null);
    const ac = new AbortController();
    fetch(`/api/fund-flow/${symbol}`, { signal: ac.signal })
      .then(async (r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return readJson<any>(r);
      })
      .then(d => { if (!ac.signal.aborted && d?.data) setFundFlow(d.data); })
      .catch(() => { /* 诚实红线：失败即无面板，不注入演示数据 */ });
    return () => ac.abort();
  }, [symbol]);

  // 游戏化埋点：查看个股详情事件（stock_viewed）
  useEffect(() => {
    if (symbol && !VIEWED_STOCKS.has(symbol)) {
      VIEWED_STOCKS.add(symbol);
      useGamificationStore.getState().track('stock_viewed');
    }
  }, [symbol]);

  useEffect(() => {
    const handler = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener('resize', handler);
    return () => window.removeEventListener('resize', handler);
  }, []);

  useEffect(() => {
    const handler = () => {
      if (!document.fullscreenElement) setKlineFullscreen(false);
    };
    document.addEventListener('fullscreenchange', handler);
    return () => document.removeEventListener('fullscreenchange', handler);
  }, []);

  // 自动触发AI诊断（页面加载后延迟执行，避免阻塞首屏）
  useEffect(() => {
    if (!symbol) return;
    const timer = setTimeout(async () => {
      setDiagnosisLoading(true);
      setDiagnosisError(null);
      try {
        const resp = await fetch(`/api/ai/diagnose/${symbol}`);
        if (!resp.ok) throw new Error(`AI 诊断接口返回 HTTP ${resp.status}`);
        const data = await readJson<any>(resp);
        if (data.success && data.data) {
          setAiDiagnosis(data.data);
        } else {
          setDiagnosisError(`AI 诊断接口未返回结果${data?.message ? `：${data.message}` : ''}`);
        }
      } catch (e) {
        const message = (e as Error)?.message || String(e);
        setDiagnosisError(`AI 诊断请求失败：${message}；未生成任何评分或建议`);
      } finally {
        setDiagnosisLoading(false);
      }
    }, 2000);
    return () => clearTimeout(timer);
  }, [symbol]);

  const displaySymbol = symbol?.replace(/\.(SH|SZ)$/, '') || symbol || '';
  const marketLabel = stockInfo?.market === 'SH' ? '沪' : stockInfo?.market === 'SZ' ? '深' : stockInfo?.market === 'INDEX' ? '指' : '';

  if (!symbol) {
    return <div style={{ padding: 24, textAlign: 'center' }}><EmptyState title="未指定股票代码" /></div>;
  }

  const StatItem = ({ label, value, color }: { label: string; value: string; color?: string }) => (
    <div style={{ textAlign: 'center', padding: '8px 4px' }}>
      <div style={{ fontSize: 12, color: TEXT_SECONDARY, marginBottom: 6 }}>{label}</div>
      <div style={{ fontSize: 16, fontWeight: 700, color: color || TEXT_PRIMARY, fontFamily: '\'DIN Alternate\', monospace' }}>
        {value}
      </div>
    </div>
  );

  return (
    <div className="stock-detail-page" style={{ padding: '16px 24px', maxWidth: 1400, margin: '0 auto', background: BG_PAGE, minHeight: '100vh' }}>
      <Breadcrumb
        style={{ marginBottom: 12 }}
        items={[
          { href: '/', title: <><CompassOutlined /> 发掘</> },
          { href: '/stocks', title: <><StockOutlined /> 股票</> },
          { title: stockInfo?.name || displaySymbol },
        ]}
      />

      {stockError && (
        <Alert
          data-testid="stock-data-error"
          type="warning"
          showIcon
          message="个股行情取不到"
          description={stockError}
          style={{ marginBottom: 12 }}
        />
      )}

      <Spin spinning={loading}>
        {/* ===== 顶部: 股票名称 + 实时价格 ===== */}
        <Card
          style={{ marginBottom: 12, borderRadius: 8, border: `1px solid ${BORDER}` }}
          styles={{ body: { padding: '16px 24px' } }}
        >
          <Row align="middle" gutter={24}>
            <Col xs={24} lg={6}>
              <Space direction="vertical" size={2}>
                <Space align="center" size={8}>
                  <Title level={4} style={{ margin: 0, color: TEXT_PRIMARY }}>
                    {stockInfo?.name || displaySymbol}
                  </Title>
                  <Tag style={{ fontSize: 12, borderRadius: 4 }}>{displaySymbol}</Tag>
                  {marketLabel && (
                    <Tag color={marketLabel === '沪' ? 'red' : marketLabel === '深' ? 'green' : 'blue'} style={{ borderRadius: 4 }}>
                      {marketLabel === '沪' ? '沪市' : marketLabel === '深' ? '深市' : '指数'}
                    </Tag>
                  )}
                  <Tooltip title={isInWatchlist ? '取消自选' : '加入自选'}>
                    <Button type="text" size="small"
                      icon={isInWatchlist ? <StarFilled style={{ color: 'var(--color-warning)' }} /> : <StarOutlined />}
                      onClick={() => symbol && toggleWatchlist(symbol)} />
                  </Tooltip>
                </Space>
                {stockInfo?.industry && (
                  <Space size={4}>
                    <Text style={{ fontSize: 12, color: TEXT_SECONDARY }}>{stockInfo.industry}</Text>
                    <Button
                      type="link"
                      size="small"
                      icon={<CompassOutlined />}
                      style={{ fontSize: 12, padding: 0, color: 'var(--accent-solid)' }}
                      onClick={() => {
                        const industryParam = encodeURIComponent(stockInfo.industry ?? '');
                        navigate(`/industry-map?industry=${industryParam}`);
                      }}
                    >
                      查看产业链
                    </Button>
                  </Space>
                )}
              </Space>
            </Col>

            <Col xs={24} lg={9}>
              {latestQuote ? (
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 16, flexWrap: 'wrap' }}>
                  <span style={{ fontSize: 38, fontWeight: 800, color: changeColor, lineHeight: 1, fontFamily: '\'DIN Alternate\', monospace' }}>
                    {Number(latestQuote.closePrice).toFixed(2)}
                  </span>
                  <Space size={8}>
                    <span style={{ fontSize: 18, fontWeight: 700, color: changeColor, fontFamily: '\'DIN Alternate\', monospace' }}>
                      {Number(latestQuote.change) >= 0 ? '+' : ''}{Number(latestQuote.change).toFixed(2)}
                    </span>
                    <Tag color={Number(latestQuote.changePercent) >= 0 ? 'red' : 'green'}
                      style={{ fontSize: 15, padding: '2px 10px', fontWeight: 700, borderRadius: 4 }}>
                      {Number(latestQuote.changePercent) >= 0 ? '+' : ''}{Number(latestQuote.changePercent).toFixed(2)}%
                    </Tag>
                  </Space>
                </div>
              ) : (
                <Text style={{ color: TEXT_SECONDARY }}>暂无行情数据</Text>
              )}

              {/* ── 数据时效披露（诚实红线）─────────────────────────────
                  退市 / 长期停牌标的的最后一行真实成交可能远在今天之前：
                  实测 14 只（PT金田A 2002-01-25、ST星源 2024-03-05 等）。
                  价格本身是真实的，但不披露 as-of 日期，用户就会把陈旧收盘价
                  当成「当前价」。故这里恒定展示数据截止交易日，非本日时
                  额外给出醒目提示。

                  ⚠️ 日期必须**本地化**后再取 YYYY-MM-DD：后端返回的是 ISO UTC
                  （实测 "2024-03-04T16:00:00.000Z" = 北京时间 03-05）。
                  若直接 slice(0,10) 会少一天，显示错误日期比不显示更糟。 */}
              {latestQuote && (() => {
                const toLocalDateStr = (v: string | Date): string | null => {
                  const d = v instanceof Date ? v : new Date(v);
                  if (Number.isNaN(d.getTime())) return null;
                  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
                };
                const tdStr = latestQuote.tradeDate ? toLocalDateStr(latestQuote.tradeDate) : null;
                const now = new Date();
                const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;

                // 陈旧判据：数据日期早于「今天往前第 1 个交易日」才算陈旧。
                // 不能用「不等于今天」——周末/节假日/以及今天尚未收盘同步时，
                // 上一个交易日本就是最新数据，那样会误报（实测 600519.SH
                // 数据日期 2026-10-22、当天查询即被误判为「1 天未更新」）。
                // 复用项目既有 tradingCalendarEngine，不新造第二套交易日规则。
                const prevTradingDay = getNthTradingDay(todayStr, -1);
                const isStale = !!tdStr && tdStr < prevTradingDay;
                const staleTradingDays = isStale && tdStr
                  ? Math.abs(countTradingDays(tdStr, prevTradingDay))
                  : 0;

                return (
                  <div style={{ marginTop: 6, fontSize: 12, color: TEXT_SECONDARY }}>
                    数据截至 {tdStr || '未知日期'}
                    {isStale && (
                      <Tag color="warning" style={{ marginLeft: 8, fontSize: 11, borderRadius: 4 }}>
                        非最新行情，已 {staleTradingDays} 个交易日未更新（可能已退市或长期停牌）
                      </Tag>
                    )}
                  </div>
                );
              })()}
            </Col>

            <Col xs={24} lg={9} style={{ textAlign: 'right' }}>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, justifyContent: 'flex-end' }}>
                <Button size="small" icon={<ReloadOutlined />} onClick={() => { fetchStockData(); fetchKlineData(); }}>刷新</Button>
                <Button size="small" type="primary" icon={<FundProjectionScreenOutlined />} onClick={() => navigate(`/backtest?symbol=${displaySymbol}`)}>回测</Button>
                <Button size="small" icon={<LineChartOutlined />} onClick={() => navigate(`/financials/${displaySymbol}`)}>财务三表</Button>
                <Button size="small" icon={<LineChartOutlined />} onClick={() => navigate('/stocks')}>返回列表</Button>
              </div>
            </Col>
          </Row>
        </Card>

        <Tabs
          className="stock-detail-tabs"
          activeKey={activeTab}
          onChange={handleTabChange}
          destroyInactiveTabPane
          items={[
            {
              key: 'overview',
              label: '概览',
              children: (
                <>
        {/* ===== 关键指标 ===== */}
        {latestQuote && (
          <Card
            size="small"
            title={<span style={{ fontWeight: 700, color: TEXT_PRIMARY, fontSize: 14 }}>关键指标</span>}
            style={{ marginBottom: 12, borderRadius: 8, border: `1px solid ${BORDER}` }}
          >
            <Row gutter={[0, 8]}>
              <Col xs={12} sm={8} md={4}><StatItem label="现价" value={fmtNum(latestQuote.closePrice)} color={changeColor} /></Col>
              <Col xs={12} sm={8} md={4}><StatItem label="今开" value={fmtNum(latestQuote.openPrice)} /></Col>
              <Col xs={12} sm={8} md={4}><StatItem label="最高" value={fmtNum(latestQuote.highPrice)} color={COLOR_UP} /></Col>
              <Col xs={12} sm={8} md={4}><StatItem label="最低" value={fmtNum(latestQuote.lowPrice)} color={COLOR_DOWN} /></Col>
              <Col xs={12} sm={8} md={4}><StatItem label="成交量" value={formatVolume(latestQuote.volume)} /></Col>
              <Col xs={12} sm={8} md={4}><StatItem label="成交额" value={formatTurnover(latestQuote.turnover)} /></Col>
            </Row>
            <Divider style={{ margin: '8px 0', borderColor: BORDER }} />
            <Row gutter={[0, 8]}>
              <Col xs={12} sm={8} md={4}><StatItem label="涨跌幅" value={fmtNum(latestQuote.changePercent) === '—' ? '—' : `${Number(latestQuote.changePercent) >= 0 ? '+' : ''}${fmtNum(latestQuote.changePercent)}%`} color={changeColor} /></Col>
              <Col xs={12} sm={8} md={4}><StatItem label="振幅" value={fmtNum(latestQuote.amplitude) === '—' ? '—' : `${fmtNum(latestQuote.amplitude)}%`} /></Col>
              <Col xs={12} sm={8} md={4}><StatItem label="PE(动)" value={latestQuote.peRatio?.toFixed(2) || '-'} /></Col>
              <Col xs={12} sm={8} md={4}><StatItem label="PB" value={latestQuote.pbRatio?.toFixed(2) || '-'} /></Col>
              <Col xs={12} sm={8} md={4}><StatItem label="换手率" value={fmtNum(latestQuote.turnoverRate) === '—' ? '—' : `${fmtNum(latestQuote.turnoverRate)}%`} /></Col>
              <Col xs={12} sm={8} md={4}><StatItem label="总市值" value={formatLargeNumber(latestQuote.marketCap)} /></Col>
            </Row>
          </Card>
        )}

        {/* ===== 我的观点（本地观点卡，一只股票一张）===== */}
        {symbol && (
          <StockThesisPanel symbol={symbol} name={stockInfo?.name ?? symbol} />
        )}

        {/* ===== 资金流向（CapitalFlowPanel，上游不可用时整体隐藏）===== */}
        {/* 三档净额必须都是真实数字才渲染：任一为 null 说明上游缺档，
            整卡隐藏，绝不把缺失当 0（诚实红线）。 */}
        {fundFlow && fundFlow.latest &&
          Number.isFinite(fundFlow.latest.mainNet) &&
          Number.isFinite(fundFlow.latest.midNet) &&
          Number.isFinite(fundFlow.latest.smallNet) && (
          <Card
            size="small"
            title={<span style={{ fontWeight: 700, color: TEXT_PRIMARY, fontSize: 14 }}>资金流向 <span style={{ fontSize: 11, color: TEXT_SECONDARY, fontWeight: 400 }}>当日主力/散户净额（东财口径）</span></span>}
            style={{ marginBottom: 12, borderRadius: 8, border: `1px solid ${BORDER}` }}
          >
            <CapitalFlowPanel
              flowData={[{
                timestamp: Date.now(),
                mainInflow: Math.max(fundFlow.latest.mainNet, 0),
                mainOutflow: Math.max(-fundFlow.latest.mainNet, 0),
                retailInflow: Math.max(fundFlow.latest.midNet + fundFlow.latest.smallNet, 0),
                retailOutflow: Math.max(-(fundFlow.latest.midNet + fundFlow.latest.smallNet), 0),
                netMainFlow: fundFlow.latest.mainNet,
              }]}
              sectorFlows={fundFlow.sectorFlows || []}
            />
          </Card>
        )}

        {/* ===== K线图 ===== */}
        <Card
          className={klineFullscreen ? 'kline-fullscreen' : ''}
          size="small"
          title={
            <Space>
              <span style={{ fontWeight: 700, color: TEXT_PRIMARY, fontSize: 14 }}>K线图</span>
              <Segmented
                options={[
                  { label: '日K', value: 'daily' },
                  { label: '周K', value: 'weekly' },
                  { label: '月K', value: 'monthly' },
                ]}
                value={klinePeriod}
                onChange={(val) => setKlinePeriod(val as string)}
                size="small"
              />
              <Button
                size="small"
                icon={klineFullscreen ? <FullscreenExitOutlined /> : <FullscreenOutlined />}
                onClick={() => {
                  if (!klineFullscreen) {
                    document.documentElement.requestFullscreen?.().then(() => {
                      (screen.orientation as any)?.lock?.('landscape').catch(() => {});
                    });
                  } else {
                    document.exitFullscreen?.();
                    (screen.orientation as any)?.unlock?.();
                  }
                  setKlineFullscreen(!klineFullscreen);
                }}
                style={{ fontSize: 11 }}
              />
            </Space>
          }
          style={{ marginBottom: 12, borderRadius: 8, border: `1px solid ${BORDER}` }}
        >
          {klineData.length > 0 ? (
            <>
              <div style={{ display: 'flex', gap: 8, marginBottom: 8, justifyContent: 'flex-end' }}>
                {(['volume','macd','kdj','rsi'] as const).map(ind => (
                  <Button key={ind} size="small" type={subIndicator === ind ? 'primary' : 'default'}
                    onClick={() => setSubIndicator(ind)}
                    style={{
                      fontSize: 11,
                      padding: '0 8px',
                      ...(subIndicator === ind && {
                        background: 'var(--accent-solid)',
                        borderColor: 'var(--accent-solid)',
                      }),
                    }}>
                    {ind === 'volume' ? '成交量' : ind.toUpperCase()}
                  </Button>
                ))}
              </div>
              {subIndicator !== 'volume' && (
                <div style={{ display: 'flex', gap: 12, marginBottom: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                  <span style={{ color: TEXT_SECONDARY, fontSize: 11 }}>参数:</span>
                  {subIndicator === 'macd' && (
                    <>
                      <label style={{ color: TEXT_SECONDARY, fontSize: 11 }}>
                        快线 <input type="number" value={indicatorParams.macdFast}
                          onChange={e => setIndicatorParams(p => ({...p, macdFast: +e.target.value}))}
                          style={{ width: 40, background: 'transparent', border: `1px solid ${BORDER}`, color: TEXT_PRIMARY, borderRadius: 4, padding: '2px 4px', fontSize: 11 }} />
                      </label>
                      <label style={{ color: TEXT_SECONDARY, fontSize: 11 }}>
                        慢线 <input type="number" value={indicatorParams.macdSlow}
                          onChange={e => setIndicatorParams(p => ({...p, macdSlow: +e.target.value}))}
                          style={{ width: 40, background: 'transparent', border: `1px solid ${BORDER}`, color: TEXT_PRIMARY, borderRadius: 4, padding: '2px 4px', fontSize: 11 }} />
                      </label>
                      <label style={{ color: TEXT_SECONDARY, fontSize: 11 }}>
                        信号 <input type="number" value={indicatorParams.macdSignal}
                          onChange={e => setIndicatorParams(p => ({...p, macdSignal: +e.target.value}))}
                          style={{ width: 40, background: 'transparent', border: `1px solid ${BORDER}`, color: TEXT_PRIMARY, borderRadius: 4, padding: '2px 4px', fontSize: 11 }} />
                      </label>
                    </>
                  )}
                  {subIndicator === 'kdj' && (
                    <label style={{ color: TEXT_SECONDARY, fontSize: 11 }}>
                      周期 <input type="number" value={indicatorParams.kdjPeriod}
                        onChange={e => setIndicatorParams(p => ({...p, kdjPeriod: +e.target.value}))}
                        style={{ width: 40, background: 'transparent', border: `1px solid ${BORDER}`, color: TEXT_PRIMARY, borderRadius: 4, padding: '2px 4px', fontSize: 11 }} />
                    </label>
                  )}
                  {subIndicator === 'rsi' && (
                    <label style={{ color: TEXT_SECONDARY, fontSize: 11 }}>
                      周期 <input type="number" value={indicatorParams.rsiPeriod}
                        onChange={e => setIndicatorParams(p => ({...p, rsiPeriod: +e.target.value}))}
                        style={{ width: 40, background: 'transparent', border: `1px solid ${BORDER}`, color: TEXT_PRIMARY, borderRadius: 4, padding: '2px 4px', fontSize: 11 }} />
                    </label>
                  )}
                </div>
              )}
              <div className="kline-chart-responsive">
                <Suspense fallback={<Skeleton active paragraph={{ rows: 4 }} />}>
                  <KLineChart
                    data={klineData}
                    title={`${stockInfo?.name || symbol} - ${klinePeriod === 'daily' ? '日K' : klinePeriod === 'weekly' ? '周K' : '月K'}`}
                    height={isMobile ? 350 : 520}
                    loading={klineLoading}
                    showMA={true}
                    maLines={[5, 10, 20, 60]}
                    subIndicator={subIndicator}
                  />
                </Suspense>
              </div>
              {klineFullscreen && (
                <style>{`
                  .kline-fullscreen {
                    position: fixed; inset: 0; z-index: 9999;
                    background: var(--bg-base); padding: 16px;
                    display: flex; flex-direction: column;
                    margin: 0; border-radius: 0;
                  }
                  .kline-fullscreen .ant-card-body { flex: 1; display: flex; flex-direction: column; overflow: auto; }
                  .kline-fullscreen .kline-chart-responsive { flex: 1; display: flex; flex-direction: column; }
                `}</style>
              )}
            </>
          ) : (
            <div style={{ minHeight: 400, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              {klineLoading ? (
                <LoadingState />
              ) : klineError ? (
                <div data-testid="kline-error" style={{ width: '100%' }}>
                  <EmptyState title="K线数据取不到" description={klineError} />
                </div>
              ) : (
                <EmptyKLine />
              )}
            </div>
          )}
        </Card>

        {/* ===== AI策略建议 =====
            数据来自 Worker `/api/stocks/:symbol/strategy`（真实计算：均线排列/金叉死叉/MACD/
            RSI/支撑压力 → 综合评分与仓位建议）。取不到时按 dataSource 如实说明，
            不展示任何评分数字，也不用 0 顶替。 */}
        <Card
          size="small"
          title={<span style={{ fontWeight: 700, color: TEXT_PRIMARY, fontSize: 14 }}>🤖 AI策略建议</span>}
          extra={aiStrategy ? <Tag color="green">真实计算</Tag> : null}
          style={{ marginBottom: 12, borderRadius: 8, border: `1px solid ${BORDER}` }}
        >
          {strategyLoading ? (
            <Skeleton active paragraph={{ rows: 3 }} />
          ) : strategyError ? (
            <Alert
              type="warning"
              showIcon
              message="个股策略信号取不到"
              description={strategyError}
            />
          ) : aiStrategy ? (
            <>
              <Row gutter={[12, 12]}>
                <Col xs={12} md={6}>
                  <Text type="secondary" style={{ fontSize: 12 }}>综合评分</Text>
                  <div style={{ fontSize: 22, fontWeight: 800, color: TEXT_PRIMARY }}>
                    {fmtNum(aiStrategy.score, 0)}<span style={{ fontSize: 12, color: TEXT_SECONDARY }}> / 100</span>
                  </div>
                  {aiStrategy.rating ? <Tag color={aiStrategy.score >= 60 ? 'red' : aiStrategy.score >= 40 ? 'orange' : 'green'}>评级 {aiStrategy.rating}</Tag> : null}
                </Col>
                <Col xs={12} md={6}>
                  <Text type="secondary" style={{ fontSize: 12 }}>仓位建议</Text>
                  <div style={{ fontSize: 16, fontWeight: 700, color: TEXT_PRIMARY }}>
                    {aiStrategy.position || '—'}
                  </div>
                  <Text type="secondary" style={{ fontSize: 12 }}>
                    建议仓位 {fmtNum(aiStrategy.positionPct, 0)}%
                  </Text>
                </Col>
                <Col xs={12} md={6}>
                  <Text type="secondary" style={{ fontSize: 12 }}>止损 / 止盈</Text>
                  <div style={{ fontSize: 14, fontWeight: 600, color: COLOR_DOWN }}>
                    {fmtNum(aiStrategy.stopLoss)}（{fmtNum(aiStrategy.stopLossPct)}%）
                  </div>
                  <div style={{ fontSize: 14, fontWeight: 600, color: COLOR_UP }}>
                    {fmtNum(aiStrategy.takeProfit)}
                  </div>
                </Col>
                <Col xs={12} md={6}>
                  <Text type="secondary" style={{ fontSize: 12 }}>RSI(14) / MACD</Text>
                  <div style={{ fontSize: 14, fontWeight: 600, color: TEXT_PRIMARY }}>
                    {fmtNum(aiStrategy.indicators?.rsi14)}
                  </div>
                  <Text type="secondary" style={{ fontSize: 12 }}>
                    MACD {aiStrategy.indicators?.macd?.signal || '—'}
                  </Text>
                </Col>
              </Row>
              <Divider style={{ margin: '12px 0' }} />
              <Row gutter={[12, 8]}>
                <Col xs={24} md={12}>
                  <Text type="secondary" style={{ fontSize: 12 }}>均线排列</Text>
                  <div style={{ fontSize: 13, color: TEXT_PRIMARY }}>
                    {aiStrategy.indicators?.maAlignment || '—'}
                  </div>
                  <Text type="secondary" style={{ fontSize: 12 }}>
                    交叉 {aiStrategy.indicators?.crossover || '—'}
                  </Text>
                </Col>
                <Col xs={24} md={12}>
                  <Text type="secondary" style={{ fontSize: 12 }}>MA5 / MA10 / MA20 / MA60</Text>
                  <div style={{ fontSize: 13, color: TEXT_PRIMARY }}>
                    {[aiStrategy.indicators?.ma5, aiStrategy.indicators?.ma10, aiStrategy.indicators?.ma20, aiStrategy.indicators?.ma60]
                      .map((v) => fmtNum(v)).join(' / ')}
                  </div>
                </Col>
              </Row>
              {aiStrategy.summary ? (
                <Paragraph style={{ margin: '10px 0 0', color: TEXT_PRIMARY }}>{aiStrategy.summary}</Paragraph>
              ) : null}
              {/* aiNarrative 是结构化对象 {overall, trend, signals[], risk, timestamp}，
                  直接 {object} 渲染会抛 "Objects are not valid as a React child" 并炸掉整页（线上实测） */}
              {aiStrategy.aiNarrative && typeof aiStrategy.aiNarrative === 'object' ? (
                <>
                  {typeof aiStrategy.aiNarrative.overall === 'string' ? (
                    <Paragraph style={{ margin: '6px 0 0', color: TEXT_SECONDARY, fontSize: 13 }}>
                      {aiStrategy.aiNarrative.overall}
                    </Paragraph>
                  ) : null}
                  {typeof aiStrategy.aiNarrative.trend === 'string' ? (
                    <Paragraph style={{ margin: '4px 0 0', color: TEXT_SECONDARY, fontSize: 13 }}>
                      {aiStrategy.aiNarrative.trend}
                    </Paragraph>
                  ) : null}
                  {Array.isArray(aiStrategy.aiNarrative.signals) && aiStrategy.aiNarrative.signals.length > 0 ? (
                    <Paragraph style={{ margin: '4px 0 0', color: TEXT_SECONDARY, fontSize: 13 }}>
                      {aiStrategy.aiNarrative.signals.join('；')}
                    </Paragraph>
                  ) : null}
                  {typeof aiStrategy.aiNarrative.risk === 'string' ? (
                    <Paragraph style={{ margin: '4px 0 0', color: TEXT_SECONDARY, fontSize: 13 }}>
                      {aiStrategy.aiNarrative.risk}
                    </Paragraph>
                  ) : null}
                </>
              ) : typeof aiStrategy.aiNarrative === 'string' ? (
                <Paragraph style={{ margin: '6px 0 0', color: TEXT_SECONDARY, fontSize: 13 }}>{aiStrategy.aiNarrative}</Paragraph>
              ) : null}
            </>
          ) : (
            <Text type="secondary">暂无策略数据</Text>
          )}
        </Card>

        {/* ===== 多信号融合面板 ===== */}
        <MultiSignalPanel symbol={symbol || ''} />

        {/* ===== 技术指标中心 (S3-2) ===== */}
        {klineData.length > 0 && (
          <Card
            size="small"
            title={<span style={{ fontWeight: 700, color: TEXT_PRIMARY, fontSize: 14 }}>📈 技术指标中心</span>}
            style={{ marginBottom: 12, borderRadius: 8, border: `1px solid ${BORDER}` }}
          >
            <Suspense fallback={<Skeleton active paragraph={{ rows: 4 }} />}>
              <IndicatorPanel data={indicatorSeries} loading={klineLoading} />
            </Suspense>
          </Card>
        )}

        {/* ===== AI 诊断面板 ===== */}
        <Card
          size="small"
          title={
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontWeight: 700, color: TEXT_PRIMARY, fontSize: 14 }}>🔬 AI 深度诊断</span>
              <Button
                size="small"
                type="primary"
                loading={diagnosisLoading}
                onClick={async () => {
                  if (!symbol) return;
                  setDiagnosisLoading(true);
                  setDiagnosisError(null);
                  try {
                    const resp = await fetch(`/api/ai/diagnose/${symbol}`);
                    if (!resp.ok) throw new Error(`AI 诊断接口返回 HTTP ${resp.status}`);
                    const data = await readJson<any>(resp);
                    if (data.success && data.data) {
                      setAiDiagnosis(data.data);
                    } else {
                      setDiagnosisError(`AI 诊断接口未返回结果${data?.message ? `：${data.message}` : ''}`);
                    }
                  } catch (e) {
                    const message = (e as Error)?.message || String(e);
                    setDiagnosisError(`AI 诊断请求失败：${message}；未生成任何评分或建议`);
                  } finally {
                    setDiagnosisLoading(false);
                  }
                }}
              >
                {aiDiagnosis ? '重新诊断' : '开始诊断'}
              </Button>
            </div>
          }
          style={{ marginBottom: 12, borderRadius: 8, border: `1px solid ${BORDER}` }}
        >
          {diagnosisError && !aiDiagnosis && (
            <Alert
              data-testid="diagnosis-error"
              type="warning"
              showIcon
              message="AI 诊断取不到数据"
              description={diagnosisError}
              style={{ marginBottom: 12 }}
            />
          )}
          {aiDiagnosis ? (
            <div style={{ padding: '8px 0' }}>
              {/* 总分 */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 16 }}>
                <div style={{
                  width: 64, height: 64, borderRadius: 32,
                  background: scoreTone(aiDiagnosis.totalScore).bg,
                  border: `2px solid ${scoreTone(aiDiagnosis.totalScore).border}`,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  flexDirection: 'column',
                }}>
                  <div style={{ fontSize: 20, fontWeight: 800, color: scoreTone(aiDiagnosis.totalScore).fg, fontFamily: 'monospace' }}>
                    {aiDiagnosis.totalScore}
                  </div>
                  <div style={{ fontSize: 9, color: TEXT_SECONDARY }}>分</div>
                </div>
                <div>
                  <div style={{ fontSize: 16, fontWeight: 700, color: TEXT_PRIMARY }}>{aiDiagnosis.rating}</div>
                  <div style={{ fontSize: 12, color: TEXT_SECONDARY }}>综合评级</div>
                </div>
              </div>

              {/* 维度分数 */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(120px, 1fr))', gap: 8, marginBottom: 16 }}>
                {aiDiagnosis.dimensions?.map((d: any, i: number) => (
                  <div key={i} style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border-subtle)', borderRadius: 8, padding: '10px 12px' }}>
                    <div style={{ fontSize: 11, color: TEXT_SECONDARY, marginBottom: 4 }}>{d.name}</div>
                    <div style={{ fontSize: 18, fontWeight: 700, color: scoreTone(d.score).fg, fontFamily: 'monospace' }}>
                      {d.score}
                    </div>
                  </div>
                ))}
              </div>

              {/* 优势 */}
              {aiDiagnosis.strengths?.length > 0 && (
                <div style={{ marginBottom: 12 }}>
                  <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--color-down)', marginBottom: 6 }}>✅ 优势</div>
                  {aiDiagnosis.strengths.map((s: string, i: number) => (
                    <div key={i} style={{ fontSize: 12, color: TEXT_PRIMARY, padding: '3px 0', paddingLeft: 12 }}>• {s}</div>
                  ))}
                </div>
              )}

              {/* 风险 */}
              {aiDiagnosis.risks?.length > 0 && (
                <div style={{ marginBottom: 12 }}>
                  <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--color-up)', marginBottom: 6 }}>⚠️ 风险</div>
                  {aiDiagnosis.risks.map((r: string, i: number) => (
                    <div key={i} style={{ fontSize: 12, color: TEXT_PRIMARY, padding: '3px 0', paddingLeft: 12 }}>• {r}</div>
                  ))}
                </div>
              )}

              {/* 建议 */}
              {aiDiagnosis.suggestions?.length > 0 && (
                <div>
                  <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--accent-solid)', marginBottom: 6 }}>💡 建议</div>
                  {aiDiagnosis.suggestions.map((s: string, i: number) => (
                    <div key={i} style={{ fontSize: 12, color: TEXT_PRIMARY, padding: '3px 0', paddingLeft: 12 }}>• {s}</div>
                  ))}
                </div>
              )}
            </div>
          ) : (
            <div style={{ textAlign: 'center', padding: 20, color: TEXT_SECONDARY }}>
              <div style={{ fontSize: 40, marginBottom: 8 }}>🤖</div>
              <div>点击"开始诊断"，AI 将从估值、技术面、基本面三个维度进行综合分析</div>
            </div>
          )}
        </Card>

        {/* ===== 策略分析 (客户端) ===== */}
        {klineData.length >= 20 && (() => {
          const strategy = analyze(klineData);
          const trendColors = { up: COLOR_UP, down: COLOR_DOWN, sideways: 'var(--color-warning)' };
          const trendLabels = { up: '上升趋势', down: '下降趋势', sideways: '横盘整理' };
          return (
            <Card
              size="small"
              title={<span style={{ fontWeight: 700, color: TEXT_PRIMARY, fontSize: 14 }}>📊 策略分析</span>}
              style={{ marginBottom: 12, borderRadius: 8, border: `1px solid ${BORDER}` }}
            >
              <Row gutter={[16, 12]}>
                <Col xs={24} sm={8}>
                  <div style={{ textAlign: 'center', padding: 8 }}>
                    <div style={{ fontSize: 12, color: TEXT_SECONDARY, marginBottom: 4 }}>趋势判断</div>
                    <div style={{ fontSize: 20, fontWeight: 800, color: trendColors[strategy.trend] }}>
                      {trendLabels[strategy.trend]}
                    </div>
                    <div style={{ fontSize: 12, color: TEXT_SECONDARY, marginTop: 2 }}>
                      强度 {Number.isFinite(strategy.trendStrength) ? `${strategy.trendStrength.toFixed(0)}%` : '—'}
                    </div>
                  </div>
                </Col>
                <Col xs={24} sm={8}>
                  <div style={{ padding: 8 }}>
                    <div style={{ fontSize: 12, color: TEXT_SECONDARY, marginBottom: 6 }}>支撑位</div>
                    {strategy.sr.support.map((s, i) => (
                      <div key={i} style={{ fontSize: 13, fontWeight: 600, color: COLOR_DOWN, marginBottom: 2 }}>
                        ¥{s.price.toFixed(2)}
                        <span style={{ fontSize: 11, color: TEXT_SECONDARY, marginLeft: 6 }}>
                          {s.strength > 1 ? `${s.strength}重支撑` : ''}
                        </span>
                      </div>
                    ))}
                    {strategy.sr.support.length === 0 && <Text type="secondary" style={{ fontSize: 12 }}>暂无</Text>}
                  </div>
                </Col>
                <Col xs={24} sm={8}>
                  <div style={{ padding: 8 }}>
                    <div style={{ fontSize: 12, color: TEXT_SECONDARY, marginBottom: 6 }}>压力位</div>
                    {strategy.sr.resistance.map((r, i) => (
                      <div key={i} style={{ fontSize: 13, fontWeight: 600, color: COLOR_UP, marginBottom: 2 }}>
                        ¥{r.price.toFixed(2)}
                        <span style={{ fontSize: 11, color: TEXT_SECONDARY, marginLeft: 6 }}>
                          {r.strength > 1 ? `${r.strength}重压力` : ''}
                        </span>
                      </div>
                    ))}
                    {strategy.sr.resistance.length === 0 && <Text type="secondary" style={{ fontSize: 12 }}>暂无</Text>}
                  </div>
                </Col>
              </Row>
              {strategy.signals.length > 0 && (
                <>
                  <Divider style={{ margin: '8px 0' }} />
                  <div style={{ fontSize: 12, color: TEXT_SECONDARY, marginBottom: 4 }}>近期信号</div>
                  <Space wrap size={[4, 4]}>
                    {strategy.signals.slice(-3).reverse().map((s, i) => (
                      <Tag key={i} color={s.direction === 'buy' ? 'red' : s.direction === 'sell' ? 'green' : 'orange'}
                        style={{ fontSize: 11, borderRadius: 4 }}>
                        {s.date?.slice(0, 10)} {s.description}
                      </Tag>
                    ))}
                  </Space>
                </>
              )}
            </Card>
          );
        })()}

        {/* ===== 基本信息 ===== */}
        {stockInfo && (
          <Card
            size="small"
            title={<span style={{ fontWeight: 700, color: TEXT_PRIMARY, fontSize: 14 }}>基本信息</span>}
            style={{ borderRadius: 8, border: `1px solid ${BORDER}` }}
          >
            <Row gutter={[16, 8]}>
              <Col xs={12} sm={8} md={4}><StatItem label="股票代码" value={stockInfo.symbol} /></Col>
              <Col xs={12} sm={8} md={4}><StatItem label="股票名称" value={stockInfo.name} /></Col>
              <Col xs={12} sm={8} md={4}>
                <div style={{ textAlign: 'center', padding: '8px 4px' }}>
                  <div style={{ fontSize: 12, color: TEXT_SECONDARY, marginBottom: 6 }}>交易所</div>
                  <div style={{ fontSize: 14, fontWeight: 600, color: TEXT_PRIMARY }}>
                    {stockInfo.market === 'SH' ? '上交所' : stockInfo.market === 'SZ' ? '深交所' : stockInfo.market}
                  </div>
                </div>
              </Col>
              <Col xs={12} sm={8} md={4}><StatItem label="行业" value={stockInfo.industry || '-'} /></Col>
            </Row>
          </Card>
        )}
                </>
              ),
            },
            {
              key: 'financials',
              label: '财务',
              children: symbol ? <StockFinancialsPanel symbol={symbol} /> : null,
            },
            {
              key: 'valuation',
              label: '估值',
              children: symbol ? <ValuationPanel symbol={symbol} /> : null,
            },
            {
              key: 'reports',
              label: '研报',
              children: symbol ? (
                <div>
                  <div style={{ marginBottom: 12 }}>
                    <Link to={`/report-center?symbol=${symbol}`}>在研报中心查看该股全部研报</Link>
                  </div>
                  <StockResearchReportsPanel symbol={symbol} />
                </div>
              ) : null,
            },
            {
              key: 'announcements',
              label: '公告',
              children: symbol ? <StockAnnouncementsPanel symbol={symbol} /> : null,
            },
            {
              key: 'news',
              label: '新闻',
              children: symbol ? <StockNewsPanel symbol={symbol} /> : null,
            },
          ]}
        />
      </Spin>
    </div>
  );
};

export default StockDetailPage;
