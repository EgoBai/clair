/**
 * 个股详情研究 Tab 面板 —— 财务 / 研报 / 公告 / 新闻
 *
 * 诚实边界：
 * 1. 每个面板只消费真实接口；取不到时显示「接口未部署 / 数据不可用 / 无结果」，
 *    绝不用 0、演示数据或全市场快讯冒充。
 * 2. 研报与公告的 URL 来自东方财富真实响应；缺字段显示「—」。
 * 3. 财务三表逐表独立加载：单表失败不抹掉其他表，失败表名如实列出。
 */

import React, { useCallback, useEffect, useState } from 'react';
import { Alert, Button, Card, Col, Row, Table, Tag } from 'antd';
import { ReloadOutlined } from '@ant-design/icons';
import { EmptyState, ErrorState, LoadingState } from '../Common/StateComponents';
import { DataSourceBadge } from '../discover/DataSourceIndicator';
import { apiService } from '../../services/api';
import { readJson } from '../../utils/api';

type JsonObject = Record<string, unknown>;

interface EndpointState<T> {
  payload: T | null;
  loading: boolean;
  error: string | null;
  reload: () => void;
}

/** 真实接口加载；404 与网络错误都转成可读中文原因。 */
function useEndpoint<T = JsonObject>(url: string | null): EndpointState<T> {
  const [payload, setPayload] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);
  const reload = useCallback(() => setTick((v) => v + 1), []);

  useEffect(() => {
    if (!url) {
      setLoading(false);
      return;
    }
    const ac = new AbortController();
    setLoading(true);
    setError(null);
    fetch(url, { signal: ac.signal })
      .then(async (resp) => {
        if (!resp.ok) {
          if (resp.status === 404) throw new Error('接口未部署（HTTP 404）');
          const text = await resp.text().catch(() => '');
          throw new Error(`请求失败（HTTP ${resp.status}）${text ? '：' + text.slice(0, 120) : ''}`);
        }
        return await readJson<T>(resp);
      })
      .then((data) => {
        if (!ac.signal.aborted) setPayload(data);
      })
      .catch((e) => {
        if (ac.signal.aborted || (e as Error)?.name === 'AbortError') return;
        setError((e as Error)?.message || '接口请求失败');
      })
      .finally(() => {
        if (!ac.signal.aborted) setLoading(false);
      });
    return () => ac.abort();
  }, [url, tick]);

  return { payload, loading, error, reload };
}

function toObject(v: unknown): JsonObject {
  return v && typeof v === 'object' && !Array.isArray(v) ? (v as JsonObject) : {};
}

function dataOf(payload: unknown): unknown {
  const root = toObject(payload);
  return root.data !== undefined ? root.data : payload;
}

function sourceOf(payload: unknown): string {
  const root = toObject(payload);
  const data = toObject(root.data);
  return String(root.dataSource ?? data.dataSource ?? '');
}

function messageOf(payload: unknown): string {
  const root = toObject(payload);
  const data = toObject(root.data);
  return String(root.message ?? root.error ?? data.message ?? '');
}

function itemsOf(payload: unknown, key = 'items'): JsonObject[] {
  const data = dataOf(payload);
  if (Array.isArray(data)) return data.map(toObject);
  const obj = toObject(data);
  if (Array.isArray(obj[key])) return (obj[key] as unknown[]).map(toObject);
  return [];
}

/** 金额：元 → 中文量级；缺数一律「—」，绝不用 0 顶替。 */
function fmtMoney(v: unknown): string {
  const n = Number(v);
  if (v === null || v === undefined || v === '' || !Number.isFinite(n)) return '—';
  const abs = Math.abs(n);
  if (abs >= 1e12) return `${(n / 1e12).toFixed(2)}万亿`;
  if (abs >= 1e8) return `${(n / 1e8).toFixed(2)}亿`;
  if (abs >= 1e4) return `${(n / 1e4).toFixed(2)}万`;
  return n.toFixed(2);
}

/** 百分比：接口本身已是百分数（32.53 = 32.53%）。 */
function fmtPct(v: unknown): string {
  const n = Number(v);
  if (v === null || v === undefined || v === '' || !Number.isFinite(n)) return '—';
  return `${n.toFixed(2)}%`;
}

function fmtText(v: unknown): string {
  if (v === null || v === undefined || v === '') return '—';
  return String(v);
}

function fmtDate(v: unknown): string {
  const s = String(v ?? '');
  if (!s) return '—';
  const m = s.match(/^\d{4}-\d{2}-\d{2}/);
  return m ? m[0] : s;
}

/** 外链标题：不用 <a href={动态值}>（会整页导航并丢 basename，守卫禁止表达式 href），
 *  改用按钮 + window.open，且显式 noopener,noreferrer 防 tabnabbing。 */
function ExternalTitleLink({ url, children }: { url: string; children: React.ReactNode }) {
  if (!/^https?:\/\//i.test(url)) return <>{children}</>;
  return (
    <button
      type="button"
      onClick={() => window.open(url, '_blank', 'noopener,noreferrer')}
      style={{
        background: 'none',
        border: 0,
        padding: 0,
        margin: 0,
        font: 'inherit',
        color: 'inherit',
        textAlign: 'left',
        cursor: 'pointer',
      }}
    >
      {children}
    </button>
  );
}

function SourceLabel({ state, text }: { state: 'live' | 'partial' | 'unavailable'; text?: string }) {
  if (state === 'live') {
    return (
      <Tag style={{ color: 'var(--color-up)', background: 'transparent', borderColor: 'var(--color-up)', margin: 0 }}>
        {text || '真实数据'}
      </Tag>
    );
  }
  return <DataSourceBadge state={{ kind: state, updatedAt: null, error: text }} />;
}

// ==================== 财务 ====================

interface FinancialState {
  summary: JsonObject | null;
  balance: JsonObject[];
  income: JsonObject[];
  cash: JsonObject[];
  failed: string[];
  loadError: string | null;
}

const EMPTY_FINANCIAL: FinancialState = {
  summary: null,
  balance: [],
  income: [],
  cash: [],
  failed: [],
  loadError: null,
};

function FinancialMetrics({ summary }: { summary: JsonObject }) {
  const bs = toObject(summary.balanceSheet);
  const is = toObject(summary.incomeStatement);
  const cf = toObject(summary.cashFlow);
  const ind = toObject(summary.indicators);
  const items = [
    { label: '营业总收入', value: fmtMoney(is.totalRevenue) },
    { label: '净利润', value: fmtMoney(is.netProfit) },
    { label: '毛利率', value: fmtPct(ind.grossMargin) },
    { label: '归母净利率', value: fmtPct(ind.netMargin) },
    { label: 'ROE', value: fmtPct(ind.roe) },
    { label: '资产负债率', value: fmtPct(ind.debtToAssetRatio) },
    { label: '经营现金流', value: fmtMoney(cf.netOperatingCashFlow) },
    { label: '自由现金流', value: fmtMoney(cf.freeCashFlow) },
    { label: '每股收益', value: fmtMoney(is.eps) },
    { label: '每股净资产', value: fmtMoney(bs.totalEquity) },
  ];
  return (
    <Row gutter={[12, 12]} style={{ marginBottom: 16 }}>
      {items.map((item) => (
        <Col xs={12} sm={8} md={6} lg={4} key={item.label}>
          <div style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border-subtle)', borderRadius: 6, padding: '10px 12px' }}>
            <div style={{ fontSize: 11, color: 'var(--text-tertiary)', marginBottom: 5 }}>{item.label}</div>
            <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-primary)', fontVariantNumeric: 'tabular-nums' }}>{item.value}</div>
          </div>
        </Col>
      ))}
    </Row>
  );
}

function statementColumns(kind: 'balance' | 'income' | 'cash') {
  const period = { title: '报告期', dataIndex: 'period', key: 'period', width: 110, render: fmtDate };
  if (kind === 'balance') {
    return [
      period,
      { title: '总资产', dataIndex: 'totalAssets', key: 'totalAssets', render: fmtMoney },
      { title: '流动资产', dataIndex: 'currentAssets', key: 'currentAssets', render: fmtMoney },
      { title: '总负债', dataIndex: 'totalLiabilities', key: 'totalLiabilities', render: fmtMoney },
      { title: '股东权益', dataIndex: 'totalEquity', key: 'totalEquity', render: fmtMoney },
      { title: '资产负债率', dataIndex: 'debtToAssetRatio', key: 'debtToAssetRatio', render: fmtPct },
    ];
  }
  if (kind === 'income') {
    return [
      period,
      { title: '营业总收入', dataIndex: 'totalRevenue', key: 'totalRevenue', render: fmtMoney },
      { title: '营业成本', dataIndex: 'operatingCost', key: 'operatingCost', render: fmtMoney },
      { title: '净利润', dataIndex: 'netProfit', key: 'netProfit', render: fmtMoney },
      { title: '归母净利润', dataIndex: 'parentNetProfit', key: 'parentNetProfit', render: fmtMoney },
      { title: 'EPS', dataIndex: 'eps', key: 'eps', render: fmtMoney },
      { title: '毛利率', dataIndex: 'grossMargin', key: 'grossMargin', render: fmtPct },
    ];
  }
  return [
    period,
    { title: '经营现金流', dataIndex: 'netOperatingCashFlow', key: 'netOperatingCashFlow', render: fmtMoney },
    { title: '投资现金流', dataIndex: 'netInvestingCashFlow', key: 'netInvestingCashFlow', render: fmtMoney },
    { title: '筹资现金流', dataIndex: 'netFinancingCashFlow', key: 'netFinancingCashFlow', render: fmtMoney },
    { title: '自由现金流', dataIndex: 'freeCashFlow', key: 'freeCashFlow', render: fmtMoney },
  ];
}

function FinancialTable({ kind, rows }: { kind: 'balance' | 'income' | 'cash'; rows: JsonObject[] }) {
  return (
    <Table
      size="small"
      pagination={false}
      scroll={{ x: 720 }}
      dataSource={rows.map((r, i) => ({ ...r, key: String(r.period ?? i) }))}
      columns={statementColumns(kind)}
    />
  );
}

export const StockFinancialsPanel: React.FC<{ symbol: string }> = ({ symbol }) => {
  const [state, setState] = useState<FinancialState>(EMPTY_FINANCIAL);
  const [loading, setLoading] = useState(true);
  const [tick, setTick] = useState(0);

  const load = useCallback(async () => {
    setLoading(true);
    const failed: string[] = [];
    let summary: JsonObject | null = null;
    let balance: JsonObject[] = [];
    let income: JsonObject[] = [];
    let cash: JsonObject[] = [];
    const results = await Promise.allSettled([
      apiService.get('/financials/summary', { symbol }),
      apiService.get('/financials/balance-sheet', { symbol, periods: 4 }),
      apiService.get('/financials/income-statement', { symbol, periods: 4 }),
      apiService.get('/financials/cash-flow', { symbol, periods: 4 }),
    ]);
    const [summaryRes, bsRes, isRes, cfRes] = results;

    if (summaryRes.status === 'fulfilled' && summaryRes.value?.success && summaryRes.value.data) {
      summary = toObject(summaryRes.value.data);
    } else {
      failed.push('财务摘要');
    }
    const pickPeriods = (res: PromiseSettledResult<{ success?: boolean; data?: { periods?: unknown } }>, name: string) => {
      if (res.status === 'fulfilled' && res.value?.success) {
        const periods = res.value.data?.periods;
        return Array.isArray(periods) ? periods.map(toObject) : [];
      }
      failed.push(name);
      return [];
    };
    balance = pickPeriods(bsRes as PromiseSettledResult<{ success?: boolean; data?: { periods?: unknown } }>, '资产负债表');
    income = pickPeriods(isRes as PromiseSettledResult<{ success?: boolean; data?: { periods?: unknown } }>, '利润表');
    cash = pickPeriods(cfRes as PromiseSettledResult<{ success?: boolean; data?: { periods?: unknown } }>, '现金流量表');

    setState({ summary, balance, income, cash, failed, loadError: failed.length ? `以下数据加载失败：${failed.join('、')}` : null });
    setLoading(false);
  }, [symbol]);

  useEffect(() => {
    void load();
  }, [load, tick]);

  if (loading) return <LoadingState tip="正在加载真实财务数据..." />;

  const hasAny = Boolean(state.summary) || state.balance.length + state.income.length + state.cash.length > 0;
  if (!hasAny) {
    return (
      <div data-testid="stock-financials-panel">
        <div style={{ marginBottom: 12 }}><SourceLabel state="unavailable" text={state.loadError || undefined} /></div>
        <ErrorState message={state.loadError || '财务接口未返回可用数据'} onRetry={() => setTick((v) => v + 1)} />
      </div>
    );
  }

  const summary = state.summary;
  return (
    <div data-testid="stock-financials-panel">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, gap: 12 }}>
        <div style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>
          数据源：东方财富财报；金额单位元。缺失字段显示「—」，不做估算。
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <SourceLabel state={state.failed.length ? 'partial' : 'live'} />
          <Button size="small" icon={<ReloadOutlined />} onClick={() => setTick((v) => v + 1)}>刷新</Button>
        </div>
      </div>

      {state.loadError && (
        <Alert
          type="warning"
          showIcon
          message="部分财务数据不可用"
          description={state.loadError}
          style={{ marginBottom: 12 }}
        />
      )}

      {summary ? <FinancialMetrics summary={summary} /> : (
        <Alert
          type="warning"
          showIcon
          message="财务摘要不可用"
          description="仍展示接口返回的三表期数；摘要指标缺失，不使用 0 或估算值填充。"
          style={{ marginBottom: 12 }}
        />
      )}

      <Row gutter={[16, 16]}>
        <Col xs={24} xl={12}>
          <Card size="small" title="资产负债表" styles={{ body: { padding: 0 } }}>
            {state.balance.length ? <FinancialTable kind="balance" rows={state.balance} /> : <EmptyState title="资产负债表无数据" description="接口未返回任何报告期。" />}
          </Card>
        </Col>
        <Col xs={24} xl={12}>
          <Card size="small" title="利润表" styles={{ body: { padding: 0 } }}>
            {state.income.length ? <FinancialTable kind="income" rows={state.income} /> : <EmptyState title="利润表无数据" description="接口未返回任何报告期。" />}
          </Card>
        </Col>
        <Col xs={24} xl={12}>
          <Card size="small" title="现金流量表" styles={{ body: { padding: 0 } }}>
            {state.cash.length ? <FinancialTable kind="cash" rows={state.cash} /> : <EmptyState title="现金流量表无数据" description="接口未返回任何报告期。" />}
          </Card>
        </Col>
      </Row>
    </div>
  );
};

// ==================== 研报 ====================

export const StockResearchReportsPanel: React.FC<{ symbol: string }> = ({ symbol }) => {
  const digits = symbol.replace(/\D/g, '');
  const { payload, loading, error, reload } = useEndpoint(`/api/news/research/reports?symbol=${digits}&limit=20`);

  if (loading) return <LoadingState tip="正在加载真实研报..." />;
  if (error) {
    return (
      <div data-testid="stock-reports-panel">
        <ErrorState message={`研报接口请求失败：${error}`} onRetry={reload} />
      </div>
    );
  }

  const source = sourceOf(payload);
  const message = messageOf(payload);
  const reports = itemsOf(payload);
  if (source === 'unavailable') {
    return (
      <div data-testid="stock-reports-panel">
        <div style={{ marginBottom: 12 }}><SourceLabel state="unavailable" text={message || undefined} /></div>
        <EmptyState
          title="研报源暂不可用"
          description={message || '东方财富研报库当前没有返回数据；本页不会用全市场快讯冒充研报。'}
        />
      </div>
    );
  }
  if (!reports.length) {
    return (
      <div data-testid="stock-reports-panel">
        <SourceLabel state="live" />
        <EmptyState title="暂无相关研报" description={message || '东方财富研报库没有返回该标的的研报。'} />
      </div>
    );
  }

  return (
    <div data-testid="stock-reports-panel">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, gap: 12 }}>
        <div style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>共 {reports.length} 篇 · 来源：东方财富研报库</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <SourceLabel state="live" />
          <Button size="small" icon={<ReloadOutlined />} onClick={reload}>刷新</Button>
        </div>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {reports.map((r, i) => {
          const title = String(r.title ?? '');
          const url = String(r.url ?? '');
          const validUrl = /^https?:\/\//.test(url);
          return (
            <Card key={String(r.id ?? i)} size="small" styles={{ body: { padding: '12px 14px' } }}>
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, justifyContent: 'space-between' }}>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)', lineHeight: 1.5 }}>
                    {validUrl ? <ExternalTitleLink url={url}>{title || '—'}</ExternalTitleLink> : (title || '—')}
                  </div>
                  <div style={{ marginTop: 6, fontSize: 12, color: 'var(--text-tertiary)', display: 'flex', flexWrap: 'wrap', gap: '4px 12px' }}>
                    <span>{fmtText(r.orgName)}</span>
                    <span>{fmtDate(r.publishDate)}</span>
                    <span>{fmtText(r.industryName)}</span>
                  </div>
                </div>
                {r.rating ? <Tag style={{ margin: 0, flexShrink: 0 }}>{String(r.rating)}</Tag> : null}
              </div>
              <div style={{ marginTop: 8, fontSize: 12, color: 'var(--text-secondary)', display: 'flex', flexWrap: 'wrap', gap: '4px 16px' }}>
                <span>预测今年 EPS：{fmtMoney(r.predictThisYearEps)}</span>
                <span>预测今年 PE：{fmtMoney(r.predictThisYearPe)}</span>
                <span>预测明年 EPS：{fmtMoney(r.predictNextYearEps)}</span>
                <span>预测明年 PE：{fmtMoney(r.predictNextYearPe)}</span>
              </div>
            </Card>
          );
        })}
      </div>
    </div>
  );
};

// ==================== 公告 ====================

export const StockAnnouncementsPanel: React.FC<{ symbol: string }> = ({ symbol }) => {
  const digits = symbol.replace(/\D/g, '');
  const { payload, loading, error, reload } = useEndpoint(`/api/news/announcements/${digits}?limit=20`);

  if (loading) return <LoadingState tip="正在加载真实公告..." />;
  if (error) {
    return (
      <div data-testid="stock-announcements-panel">
        <ErrorState message={`公告接口请求失败：${error}`} onRetry={reload} />
      </div>
    );
  }

  const source = sourceOf(payload);
  const message = messageOf(payload);
  const items = itemsOf(payload);
  if (source === 'unavailable') {
    return (
      <div data-testid="stock-announcements-panel">
        <div style={{ marginBottom: 12 }}><SourceLabel state="unavailable" text={message || undefined} /></div>
        <EmptyState
          title="公告源暂不可用"
          description={message || '东方财富公告库当前没有返回数据；本页不会编造公告标题或日期。'}
        />
      </div>
    );
  }
  if (!items.length) {
    return (
      <div data-testid="stock-announcements-panel">
        <SourceLabel state="live" />
        <EmptyState title="暂无公告" description={message || '东方财富公告库没有返回该标的的公告。'} />
      </div>
    );
  }

  return (
    <div data-testid="stock-announcements-panel">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, gap: 12 }}>
        <div style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>共 {items.length} 条 · 来源：东方财富公告库</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <SourceLabel state="live" />
          <Button size="small" icon={<ReloadOutlined />} onClick={reload}>刷新</Button>
        </div>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {items.map((it, i) => {
          const url = String(it.url ?? '');
          const validUrl = /^https?:\/\//.test(url);
          const tags = Array.isArray(it.tags) ? (it.tags as unknown[]).map(String) : [];
          return (
            <div key={String(it.id ?? i)} style={{ padding: '10px 0', borderBottom: '1px solid var(--border-subtle)' }}>
              <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start', justifyContent: 'space-between' }}>
                <div style={{ minWidth: 0, fontSize: 14, color: 'var(--text-primary)', lineHeight: 1.5 }}>
                  {validUrl ? <ExternalTitleLink url={url}>{fmtText(it.title)}</ExternalTitleLink> : fmtText(it.title)}
                </div>
                <span style={{ flexShrink: 0, fontSize: 12, color: 'var(--text-tertiary)' }}>{fmtDate(it.publishTime)}</span>
              </div>
              <div style={{ marginTop: 5, fontSize: 12, color: 'var(--text-tertiary)', display: 'flex', flexWrap: 'wrap', gap: '4px 10px' }}>
                <span>{fmtText(it.source)}</span>
                {tags.map((t) => <span key={t}>· {t}</span>)}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

// ==================== 新闻 ====================

export const StockNewsPanel: React.FC<{ symbol: string }> = ({ symbol }) => {
  const digits = symbol.replace(/\D/g, '');
  const { payload, loading, error, reload } = useEndpoint(`/api/news/stock-news/${digits}?limit=20`);

  if (loading) return <LoadingState tip="正在加载真实新闻..." />;
  if (error) {
    return (
      <div data-testid="stock-news-panel">
        <ErrorState message={`新闻接口请求失败：${error}`} onRetry={reload} />
      </div>
    );
  }

  const root = toObject(payload);
  const message = messageOf(payload);
  const note = String(root.note ?? toObject(root.data).note ?? '');
  const disclaimer = String(root.disclaimer ?? toObject(root.data).disclaimer ?? '');
  // Worker 返回 data 为数组；Express 返回 data.items —— 两种都得认
  const items = itemsOf(payload);
  const dataSource = sourceOf(payload);
  const isUnavailable = dataSource === 'unavailable';

  if (isUnavailable) {
    return (
      <div data-testid="stock-news-panel">
        <div style={{ marginBottom: 12 }}><SourceLabel state="unavailable" text={message || undefined} /></div>
        <EmptyState title="新闻源暂不可用" description={message || '个股新闻接口当前没有返回数据。'} />
      </div>
    );
  }
  if (!items.length) {
    return (
      <div data-testid="stock-news-panel">
        <SourceLabel state="live" />
        <EmptyState title="暂无相关新闻" description={note || message || '该标的当前没有可展示的新闻。'} />
        {disclaimer ? <div style={{ marginTop: 10, fontSize: 11, color: 'var(--text-tertiary)' }}>{disclaimer}</div> : null}
      </div>
    );
  }

  return (
    <div data-testid="stock-news-panel">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, gap: 12 }}>
        <div style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>共 {items.length} 条 · {note || '来源：东方财富资讯'}</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <SourceLabel state="live" />
          <Button size="small" icon={<ReloadOutlined />} onClick={reload}>刷新</Button>
        </div>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {items.map((it, i) => {
          const url = String(it.url ?? '');
          const validUrl = /^https?:\/\//.test(url);
          return (
            <div key={String(it.id ?? i)} style={{ padding: '10px 0', borderBottom: '1px solid var(--border-subtle)' }}>
              <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start', justifyContent: 'space-between' }}>
                <div style={{ minWidth: 0, fontSize: 14, color: 'var(--text-primary)', lineHeight: 1.5 }}>
                  {validUrl ? <ExternalTitleLink url={url}>{fmtText(it.title)}</ExternalTitleLink> : fmtText(it.title)}
                </div>
                <span style={{ flexShrink: 0, fontSize: 12, color: 'var(--text-tertiary)' }}>{fmtDate(it.publishTime ?? it.time)}</span>
              </div>
              <div style={{ marginTop: 5, fontSize: 12, color: 'var(--text-tertiary)' }}>
                {fmtText(it.source)}{it.summary ? ` · ${String(it.summary).slice(0, 100)}` : ''}
              </div>
            </div>
          );
        })}
      </div>
      {disclaimer ? <div style={{ marginTop: 10, fontSize: 11, color: 'var(--text-tertiary)' }}>{disclaimer}</div> : null}
    </div>
  );
};
