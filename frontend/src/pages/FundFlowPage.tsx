/**
 * 资金流页面（Ticket D4）
 * 消费后端 /api/fund-flow/* 代理：
 *   GET /api/fund-flow/meta          —— provider 链诊断（状态条折叠面板）
 *   GET /api/fund-flow/global        —— 外资/全球视角
 *   GET /api/fund-flow/industry      —— 行业资金流排行
 *   GET /api/fund-flow/:symbol       —— 个股资金流 + 历史趋势
 *   POST /api/fund-flow/batch        —— 批量（类型已消费，供后续接入）
 * 后端不可达/报错时走诚实空态兜底（EmptyState / dsTag('unavailable')），绝不回退伪数据；
 * fundFlowPageDemo 仅提供类型契约，不含数据生成器（诚实数据红线，IP-20 收口）。
 * 涨红跌绿：净流入/上涨=var(--color-up)，净流出/下跌=var(--color-down)。
 */

import React, { useEffect, useMemo, useState } from 'react';
import {
  Card, Row, Col, Statistic, Table, Tag, Typography, Input, Button, Space, Collapse, Alert,
} from 'antd';
import { LoadingStateDetail, EmptyState } from '../components/Common/StateComponents';
import { ApiStatusNotice } from '../components/Common/ApiStatusNotice';
import { type ApiStatus } from '../utils/apiStatus';
import { SearchOutlined } from '@ant-design/icons';
import {
  ComposedChart, Bar, Line, XAxis, YAxis, CartesianGrid, Tooltip as RTooltip,
  ResponsiveContainer, Cell, Legend, LineChart,
} from 'recharts';
import { THEME } from '../styles/theme-constants';
import { formatLargeNumber } from '@/utils/formatters';
import {
  type FundFlowProviderName, type StockFundFlowResp, type IndustryFlowResp,
  type GlobalFlowResp, type FundFlowMeta, type GlobalIndicator, type MarketFundFlowResp,
} from '../utils/fundFlowPageDemo';
import { API_ORIGIN } from '../config/apiBase';
const { Title, Text } = Typography;

/**
 * 后端地址取自唯一真源 config/apiBase.ts（不再自行解析环境变量）。
 *
 * 为什么用 API_ORIGIN（根地址）而不是 API_BASE_URL（含 /api）：
 * 本页所有请求路径在调用处已写明 `/api/fund-flow/xxx`，由 apiFetch 拼成
 * `${API_BASE}${path}`。若取含 `/api` 的地址会拼出 `/api/api/fund-flow/xxx` → 必404。
 * dev 下 API_ORIGIN 为空串，路径相对，走 Vite proxy 到 127.0.0.1:3001（与改动前一致）。
 */
const API_BASE = API_ORIGIN;

/** 涨/流入=红，跌/流出=绿（中国习惯） */
const flowColor = (v: number): string => (v >= 0 ? THEME.up : THEME.down);
const fmtSigned = (v: number): string => `${v >= 0 ? '+' : '-'}${formatLargeNumber(Math.abs(v))}`;
const QUICK_SYMBOLS = ['600519.SH', '000001.SZ', '300750.SZ', '601318.SH'];

/**
 * 缺失值 → 「—」，**绝不兜成 0**。
 *
 * 诚实数据红线：后端把「取不到」表达为 `null`（`market` 整体为 null，或某字段为 null）。
 * 若前端写 `?? 0`，页面就会渲染出「0 家上涨 / 0 家下跌 / 0 家涨停」——
 * 用户读到的是「今天全市场平盘」，而事实是「数据没取到」。这两个事实必须分开说。
 */
const dashIfNull = (v: number | null | undefined): string => (v == null ? '—' : String(v));

/** 成交额格式化：null（未取到）→ 「—」，不得渲染成「0 亿」 */
const fmtTurnover = (v: number | null | undefined): string => {
  if (v == null) return '—';
  return v >= 1e12 ? `${(v / 1e12).toFixed(2)}万亿` : `${(v / 1e8).toFixed(0)}亿`;
};

/** dataSource → Tag：真实源 blue / demo gold「演示数据」 / unavailable gray「不可得」 / 未标注 gray */
function dsTag(ds?: FundFlowProviderName | 'unknown') {
  if (!ds || ds === 'unknown') return <Tag color="default">未标注</Tag>;
  // 'unavailable' 是「数据源没有给值」，不是某个 provider 的名字——不能沿用真实源的蓝色，
  // 否则「数据不可得」会被读成「已有真实数据来源」。
  if (ds === 'unavailable') return <Tag color="default">不可得</Tag>;
  const isDemo = ds === 'demo';
  return <Tag color={isDemo ? 'gold' : 'blue'}>{isDemo ? '演示数据' : ds}</Tag>;
}

/** 带超时与 {success:false} 识别的通用请求；异常由调用方决定兜底 */
async function apiFetch<T>(path: string, timeoutMs = 12000): Promise<T> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(`${API_BASE}${path}`, { signal: ctrl.signal });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const json = await res.json();
    if (json && json.success === false) throw new Error(json.error || 'backend error');
    return json.data as T;
  } finally {
    clearTimeout(timer);
  }
}

const FundFlowPage: React.FC = () => {
  // ── ① 市场概览：后端 /api/fund-flow/market（真实广度 + 诚实 5 档）──
  const [market, setMarket] = useState<MarketFundFlowResp | null>(null);
  const [marketLoading, setMarketLoading] = useState(true);
  /**
   * 市场概览的**降级形态**（唯一判别真源在 utils/apiStatus）。
   * 后端两种「取不到」必须给用户不同说法：
   *   - 200 + `market:null`      → unavailable（本地行情库当日无广度数据）
   *   - 请求失败/后端不可达       → failed（请求没完成）
   * 两种情况都**不能**渲染一排 0。
   */
  const [marketStatus, setMarketStatus] = useState<ApiStatus | null>(null);
  const marketDs = (market?.source ?? 'unknown') as FundFlowProviderName | 'unknown';

  // ── ⑤ /meta 诊断 ──
  const [meta, setMeta] = useState<FundFlowMeta | null>(null);
  const [metaLoading, setMetaLoading] = useState(true);

  // ── ② 个股资金流 ──
  const [symbol, setSymbol] = useState('600519.SH');
  const [stock, setStock] = useState<StockFundFlowResp | null>(null);
  const [stockDs, setStockDs] = useState<FundFlowProviderName | 'unknown'>('unknown');
  const [stockLoading, setStockLoading] = useState(false);
  const [stockNote, setStockNote] = useState('');

  // ── ③ 行业资金流 ──
  const [industry, setIndustry] = useState<IndustryFlowResp | null>(null);
  const [industryLoading, setIndustryLoading] = useState(true);

  // ── ④ 外资/全球视角 ──
  const [global, setGlobal] = useState<GlobalFlowResp | null>(null);
  const [globalDs, setGlobalDs] = useState<FundFlowProviderName | 'unknown'>('unknown');
  const [globalLoading, setGlobalLoading] = useState(true);

  // 拉取 meta / industry / global / market（并行，各自兜底）
  useEffect(() => {
    let alive = true;
    (async () => {
      setMetaLoading(true);
      try {
        const m = await apiFetch<FundFlowMeta>('/api/fund-flow/meta');
        if (alive) setMeta(m);
      } catch {
        if (alive) setMeta(null);
      } finally {
        if (alive) setMetaLoading(false);
      }
    })();

    (async () => {
      setMarketLoading(true);
      try {
        const r = await apiFetch<MarketFundFlowResp>('/api/fund-flow/market');
        if (alive) {
          setMarket(r);
          // 广度（涨跌家数/涨跌停/成交额）与 5 档结构是两块独立事实：
          // 只有广度本身缺失（market 为 null）才判 unavailable，5 档缺失由数据源 Tag 与下方空态各自表达。
          setMarketStatus(
            r.market
              ? null
              : { kind: 'unavailable', reason: r.note ?? '本地行情库无当日广度数据' },
          );
        }
      } catch (e) {
        if (alive) {
          setMarket(null);
          setMarketStatus({
            kind: 'failed',
            reason: e instanceof Error ? e.message : undefined,
          });
        }
      } finally {
        if (alive) setMarketLoading(false);
      }
    })();

    (async () => {
      setIndustryLoading(true);
      try {
        const r = await apiFetch<IndustryFlowResp>('/api/fund-flow/industry?limit=20');
        if (alive) setIndustry(r);
      } catch {
        if (alive) setIndustry(null);
      } finally {
        if (alive) setIndustryLoading(false);
      }
    })();

    (async () => {
      setGlobalLoading(true);
      try {
        const r = await apiFetch<GlobalFlowResp>('/api/fund-flow/global');
        if (alive) { setGlobal(r); setGlobalDs(r.dataSource); }
      } catch {
        if (alive) { setGlobal(null); setGlobalDs('unknown'); }
      } finally {
        if (alive) setGlobalLoading(false);
      }
    })();

    return () => { alive = false; };
  }, []);

  // 查询个股：成功取真实；404/网络异常→演示兜底
  const queryStock = async (sym: string) => {
    const s = (sym || '').trim();
    if (!s) return;
    setStockLoading(true);
    setStockNote('');
    try {
      const r = await apiFetch<StockFundFlowResp>(`/api/fund-flow/${encodeURIComponent(s)}?days=10`);
      setStock(r);
      setStockDs(r.dataSource);
    } catch {
      setStock(null);
      setStockDs('unknown');
      setStockNote('后端不可达或未收录该标的，暂无可展示数据');
    } finally {
      setStockLoading(false);
    }
  };

  useEffect(() => { queryStock(symbol); }, []);

  // ── ② 个股趋势图数据 ──
  const stockTrend = useMemo(
    () => (stock?.history ?? []).map((h) => ({
      date: h.tradeDate.slice(5),
      mainNet: h.mainNet, superLargeNet: h.superLargeNet, largeNet: h.largeNet,
      mediumNet: h.mediumNet, smallNet: h.smallNet,
    })),
    [stock],
  );
  const stockCurrent = stock?.current;

  // ── ③ 行业条形 + 表格 ──
  const industryBar = useMemo(
    () => (industry?.industries ?? []).map((i) => ({
      industry: i.industry, mainNet: i.mainNet, netInflow: i.netInflow, stockCount: i.stockCount,
    })),
    [industry],
  );
  const industryColumns = [
    { title: '行业', dataIndex: 'industry', key: 'industry', width: 120 },
    { title: '主力净额', dataIndex: 'mainNet', key: 'mainNet', width: 130,
      render: (v: number) => <Text style={{ color: flowColor(v) }}>{fmtSigned(v)}</Text> },
    { title: '净流入', dataIndex: 'netInflow', key: 'netInflow', width: 130,
      render: (v: number) => <Text style={{ color: flowColor(v) }}>{fmtSigned(v)}</Text> },
    { title: '成分股数', dataIndex: 'stockCount', key: 'stockCount', width: 100 },
  ];

  const cardStyle = { background: THEME.cardBg, borderColor: THEME.border };
  const titleColor = { color: THEME.text };

  return (
    <div style={{ background: THEME.bg, padding: 24, minHeight: '100vh' }}>
      <Title level={3} style={{ color: THEME.text, marginBottom: 4 }}>资金流向</Title>
      <Text style={{ color: THEME.textSec }}>
        主力/内资个股·行业 / 外资全球视角 · 后端代理 /api/fund-flow/*
      </Text>

      {/* ⑤ 数据源状态条 + provider 链诊断 */}
      <Card size="small" style={{ ...cardStyle, marginTop: 16 }}>
        <Space wrap size={[12, 8]} align="center">
          <Text strong style={titleColor}>数据源：</Text>
          <span>市场概览 {dsTag(marketDs)}</span>
          <span>个股 {dsTag(stockDs)}</span>
          <span>行业 {dsTag('unknown')}</span>
          <span>外资 {dsTag(globalDs)}</span>
          {metaLoading && <Text type="secondary" style={{ fontSize: 12 }}>诊断加载中…</Text>}
        </Space>
        <Collapse ghost size="small" style={{ marginTop: 8 }}>
          <Collapse.Panel key="meta" header="provider 链诊断（/api/fund-flow/meta）">
            {meta ? (
              <div>
                <div style={{ marginBottom: 8 }}>
                  <Text style={{ color: THEME.textSec }}>生效链路：</Text>
                  <Space wrap size={[6, 4]} style={{ marginLeft: 8 }}>
                    {/* meta 缺字段（后端降级）时不崩，如实显示「—」 */}
                    {(meta.activeProviders ?? []).map((p) => dsTag(p))}
                  </Space>
                </div>
                <div>
                  <Text style={{ color: THEME.textSec }}>密钥配置：</Text>
                  <span style={{ marginLeft: 8, color: THEME.text }}>
                    {Object.entries(meta.keysConfigured ?? {}).map(([k, v]) => `${k}=${v ? '✓' : '✗'}`).join('  ') || '—'}
                  </span>
                </div>
              </div>
            ) : <EmptyState title="暂无诊断信息" />}
          </Collapse.Panel>
        </Collapse>
      </Card>

      {/* ① 市场资金概览 */}
      <Card
        size="small"
        style={{ ...cardStyle, marginTop: 16 }}
        title={<span style={titleColor}>市场资金概览 {dsTag(marketDs)}</span>}
      >
        {marketLoading ? (
          <LoadingStateDetail />
        ) : market ? (
          <>
            {/* 市场广度缺失时的可解释降级：绝不用一排 0 冒充「全市场平盘」 */}
            {marketStatus && (
              <div data-testid="fund-flow-market-degraded">
                <ApiStatusNotice
                  status={marketStatus}
                  moduleName="市场广度"
                  style={{ marginBottom: 12 }}
                  extra="上涨/下跌/涨跌停家数与成交额均未取到，下方以「—」占位——这不代表全市场平盘、也不代表零成交。"
                />
              </div>
            )}
            {/* 真实市场广度 + 成交额（来自本地行情库）；缺失一律「—」 */}
            <Row gutter={[16, 16]} style={{ marginBottom: 8 }}>
              {[
                { l: '全市场成交额', v: fmtTurnover(market.market?.totalTurnover), c: THEME.text },
                { l: '上涨家数', v: dashIfNull(market.market?.risingStocks), c: THEME.up },
                { l: '下跌家数', v: dashIfNull(market.market?.fallingStocks), c: THEME.down },
                { l: '涨停', v: dashIfNull(market.market?.limitUpCount), c: THEME.up },
                { l: '跌停', v: dashIfNull(market.market?.limitDownCount), c: THEME.down },
              ].map((it) => (
                <Col xs={12} sm={8} md={4} key={it.l}>
                  <Statistic title={<span style={{ color: THEME.textSec }}>{it.l}</span>}
                    value={it.v} valueStyle={{ color: it.c, fontSize: 15 }} />
                </Col>
              ))}
            </Row>
            {/* 5 档主力资金结构：真实可达则展示，否则诚实空态 */}
            {market.tiers?.main != null ? (
              <Row gutter={[16, 16]}>
                {[
                  { l: '主力净额', v: market.tiers.main },
                  { l: '超大单', v: market.tiers.superLarge },
                  { l: '大单', v: market.tiers.large },
                  { l: '中单', v: market.tiers.medium },
                  { l: '小单', v: market.tiers.small },
                ].map((it) => (
                  <Col xs={12} sm={8} md={4} key={it.l}>
                    {/* 单档缺失（如超大单为 null）→ 「—」，不得经 Number(null) 变成「+0」 */}
                    <Statistic title={<span style={{ color: THEME.textSec }}>{it.l}</span>}
                      value={it.v == null ? '—' : fmtSigned(it.v)}
                      valueStyle={{ color: it.v == null ? THEME.textSec : flowColor(it.v), fontSize: 15 }} />
                  </Col>
                ))}
              </Row>
            ) : (
              <EmptyState
                title="5 档主力/超大单/大单/中单/小单净流入：数据源未接入"
                description={market.note}
              />
            )}
          </>
        ) : marketStatus ? (
          // 请求失败/后端不可达：说「没取到」，不能说「暂无数据」（后者会被读成「今天真的没有」）
          <ApiStatusNotice
            status={marketStatus}
            moduleName="市场概览"
            extra="这表示未能取到数据，不代表全市场没有涨跌家数。"
          />
        ) : (
          <EmptyState title="暂无数据" />
        )}
      </Card>

      {/* ② 个股资金流查询 */}
      <Card
        size="small"
        style={{ ...cardStyle, marginTop: 16 }}
        title={<span style={titleColor}>个股资金流 {dsTag(stockDs)}</span>}
      >
        <Space wrap style={{ marginBottom: 12 }}>
          <Input
            value={symbol}
            onChange={(e) => setSymbol(e.target.value)}
            onPressEnter={() => queryStock(symbol)}
            placeholder="输入代码，如 600519.SH"
            style={{ width: 220 }}
            prefix={<SearchOutlined />}
          />
          <Button type="primary" icon={<SearchOutlined />} loading={stockLoading} onClick={() => queryStock(symbol)}>
            查询
          </Button>
          <Space size={4}>
            {QUICK_SYMBOLS.map((s) => (
              <Tag key={s} style={{ cursor: 'pointer' }} color="blue" onClick={() => { setSymbol(s); queryStock(s); }}>
                {s}
              </Tag>
            ))}
          </Space>
        </Space>
        {stockNote && <Alert type="warning" showIcon message={stockNote} style={{ marginBottom: 12 }} />}

        {stockLoading ? (
          <LoadingStateDetail />
        ) : stockCurrent ? (
          <>
            <Row gutter={[16, 16]} style={{ marginBottom: 8 }}>
              {[
                { l: '名称/代码', v: `${stockCurrent.name || stockCurrent.symbol}`, c: THEME.text },
                { l: '主力净额', v: fmtSigned(stockCurrent.mainNet), c: flowColor(stockCurrent.mainNet) },
                { l: '超大单', v: fmtSigned(stockCurrent.superLargeNet), c: flowColor(stockCurrent.superLargeNet) },
                { l: '大单', v: fmtSigned(stockCurrent.largeNet), c: flowColor(stockCurrent.largeNet) },
                { l: '中单', v: fmtSigned(stockCurrent.mediumNet), c: flowColor(stockCurrent.mediumNet) },
                { l: '小单', v: fmtSigned(stockCurrent.smallNet), c: flowColor(stockCurrent.smallNet) },
              ].map((it) => (
                <Col xs={12} sm={8} md={4} key={it.l}>
                  <Statistic title={<span style={{ color: THEME.textSec }}>{it.l}</span>}
                    value={it.v} valueStyle={{ color: it.c, fontSize: 15 }} />
                </Col>
              ))}
            </Row>
            <ResponsiveContainer width="100%" height={300}>
              <ComposedChart data={stockTrend} margin={{ top: 10, right: 16, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={THEME.border} />
                <XAxis dataKey="date" tick={{ fontSize: 11, fill: THEME.textSec }} />
                <YAxis tick={{ fontSize: 11, fill: THEME.textSec }}
                  tickFormatter={(v: number) => formatLargeNumber(Math.abs(v))} />
                <RTooltip
                  contentStyle={{ background: THEME.cardBg, borderColor: THEME.border, color: THEME.text }}
                  formatter={(value: any, name: any) => [fmtSigned(Number(value)), String(name)]}
                />
                <Legend wrapperStyle={{ color: THEME.textSec }} />
                <Bar dataKey="mainNet" name="主力净额" barSize={20}>
                  {stockTrend.map((d, i) => <Cell key={i} fill={flowColor(d.mainNet)} />)}
                </Bar>
                <Line dataKey="superLargeNet" name="超大单" stroke={THEME.accent} dot={false} strokeWidth={1.5} />
                <Line dataKey="largeNet" name="大单" stroke="#36cfc9" dot={false} strokeWidth={1.5} />
                <Line dataKey="mediumNet" name="中单" stroke={THEME.textSec} dot={false} strokeWidth={1} strokeDasharray="4 2" />
                <Line dataKey="smallNet" name="小单" stroke="#9254de" dot={false} strokeWidth={1} strokeDasharray="4 2" />
              </ComposedChart>
            </ResponsiveContainer>
          </>
        ) : <EmptyState title="暂无数据" />}
      </Card>

      {/* ③ 行业资金流排行 */}
      <Row gutter={[16, 16]} style={{ marginTop: 16 }}>
        <Col xs={24} lg={13}>
          <Card
            size="small" style={cardStyle}
            title={<span style={titleColor}>行业主力净流入排行 <Tag color="default">未标注</Tag></span>}
          >
            {industryLoading ? (
              <LoadingStateDetail />
            ) : industryBar.length ? (
              <ResponsiveContainer width="100%" height={Math.max(320, industryBar.length * 22)}>
                <ComposedChart layout="vertical" data={industryBar} margin={{ top: 8, right: 24, left: 8, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke={THEME.border} />
                  <XAxis type="number" tick={{ fontSize: 11, fill: THEME.textSec }}
                    tickFormatter={(v: number) => formatLargeNumber(Math.abs(v))} />
                  <YAxis type="category" dataKey="industry" tick={{ fontSize: 11, fill: THEME.textSec }} width={96} />
                  <RTooltip
                    contentStyle={{ background: THEME.cardBg, borderColor: THEME.border, color: THEME.text }}
                    formatter={(value: any, name: any) => [fmtSigned(Number(value)), String(name)]}
                  />
                  <Bar dataKey="mainNet" name="主力净额" barSize={16}>
                    {industryBar.map((d, i) => <Cell key={i} fill={flowColor(d.mainNet)} />)}
                  </Bar>
                </ComposedChart>
              </ResponsiveContainer>
            ) : <EmptyState title="暂无数据" />}
          </Card>
        </Col>
        <Col xs={24} lg={11}>
          <Card size="small" style={cardStyle} title={<span style={titleColor}>行业明细</span>}>
            <Table
              dataSource={industryBar}
              columns={industryColumns}
              rowKey="industry"
              size="small"
              pagination={false}
              scroll={{ x: 480 }}
            />
          </Card>
        </Col>
      </Row>

      {/* ④ 外资 / 全球视角 */}
      <Card
        size="small" style={{ ...cardStyle, marginTop: 16 }}
        title={<span style={titleColor}>外资 / 全球资金视角 {dsTag(globalDs)}</span>}
      >
        {globalLoading ? (
          <LoadingStateDetail />
        ) : global ? (
          <Row gutter={[16, 16]}>
            {global?.indicators?.map((ind: GlobalIndicator) => (
              <Col xs={24} sm={12} md={6} key={ind.key}>
                <Card size="small" style={{ background: THEME.surface, borderColor: THEME.border }}>
                  <Statistic
                    title={<span style={{ color: THEME.textSec }}>{ind.label}</span>}
                    value={ind.latest}
                    precision={2}
                    suffix={ind.unit}
                    valueStyle={{ color: THEME.text, fontSize: 18 }}
                  />
                  <ResponsiveContainer width="100%" height={140}>
                    <LineChart data={ind.series} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke={THEME.border} />
                      <XAxis dataKey="date" tick={{ fontSize: 9, fill: THEME.textSec }} hide />
                      <YAxis tick={{ fontSize: 9, fill: THEME.textSec }} width={34} domain={['auto', 'auto']} />
                      <RTooltip
                        contentStyle={{ background: THEME.cardBg, borderColor: THEME.border, color: THEME.text }}
                        formatter={(v: any) => [Number(v).toFixed(2), ind.unit]}
                      />
                      <Line type="monotone" dataKey="value" stroke={THEME.accent} dot={false} strokeWidth={1.5} />
                    </LineChart>
                  </ResponsiveContainer>
                </Card>
              </Col>
            ))}
          </Row>
        ) : <EmptyState title="暂无数据" />}
      </Card>

      <div style={{ height: 24 }} />
    </div>
  );
};

export default FundFlowPage;
