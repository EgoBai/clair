/**
 * 事件日历页面（S2-3）
 * 封装 eventCalendarEngine：parseEvents / filterEvents / detectEventClusters /
 *   generateRiskCalendar / analyzeEventImpact
 * 展示未来 90 天 A 股事件（财报/股东大会/解禁/分红除权/宏观/新股/指数调仓/并购等）
 */
import React, { useState, useEffect, useCallback, useMemo } from 'react';
import logger from '../utils/logger';
import {
  Card, Tag, Row, Col, Statistic, Segmented, Space, Typography,
  Button, Badge, Tooltip, Modal, Descriptions,
} from 'antd';
import { EmptyState } from '../components/Common/StateComponents';
import {
  CalendarOutlined, ReloadOutlined, FireOutlined, ExclamationCircleOutlined,
  WarningOutlined, RiseOutlined, FallOutlined,
} from '@ant-design/icons';
import {
  parseEvents, filterEvents, detectEventClusters, generateRiskCalendar,
  analyzeEventImpact,
  type CalendarEvent, type EventType, type EventImpact, type EventCluster,
} from '../utils/eventCalendarEngine';
import {
  DataSourceBanner, resolveDataSource,
  type DataSourceState,
} from '../components/discover/DataSourceIndicator';
const { Title, Text } = Typography;
/** 本地日期格式化 YYYY-MM-DD（避免 toISOString 时区偏移） */
const fmtDate = (d: Date): string => {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};
const WEEKDAY = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];
const weekday = (dateStr: string): string => WEEKDAY[new Date(dateStr).getDay()];
const TYPE_POOL: EventType[] = [
  'earnings', 'ex_dividend', 'ipo', 'lockup_expiry',
  'index_rebalance', 'economic', 'split', 'merger',
];
const TYPE_META: Record<EventType, { label: string; color: string }> = {
  earnings:       { label: '财报发布', color: '#2962FF' },
  ex_dividend:    { label: '分红除权', color: '#52c41a' },
  ipo:            { label: '新股上市', color: '#13c2c2' },
  lockup_expiry:  { label: '限售解禁', color: '#fa8c16' },
  index_rebalance: { label: '指数调仓', color: '#722ed1' },
  economic:       { label: '宏观数据', color: '#eb2f96' },
  split:          { label: '送转除权', color: '#a0d911' },
  merger:         { label: '并购重组', color: '#f5222d' },
};
// 影响级别配色：high红 / medium橙 / low灰（涨红约定，高影响用红）
const IMPACT_COLOR: Record<EventImpact, string> = {
  high: '#cf1322', medium: '#fa8c16', low: '#8c8c8c',
};
const IMPACT_LABEL: Record<EventImpact, string> = {
  high: '高影响', medium: '中影响', low: '低影响',
};
interface RawEvent {
  date: string; type: string; symbol?: string;
  title: string; description?: string; estimatedEffect?: number;
}

/** 页面可区分的三种事实（互不冒充，见 resolveEventCalendarView 注释） */
export type EventCalendarProblem = 'format' | 'http' | null;

/** 响应三态判定结果 */
export type EventCalendarView =
  | { kind: 'events'; raw: RawEvent[]; state: DataSourceState }
  | { kind: 'empty'; state: DataSourceState }
  | { kind: 'format'; reason: string; state: DataSourceState };

/**
 * 把 `/api/event-calendar/events` 的响应体判定成三态之一。
 *
 * 【为什么不能 `if (!json.success) throw new Error('数据格式异常')`】
 * 本仓库对「该模块没有接入真实数据源」的既定表达是
 *   HTTP 200 + `success:false` + `dataSource:'unavailable'` + 中文 `message`
 * —— clair-worker 20+ 个端点统一走 `unavailable()`，且
 * `clair-worker/test/worker-contract.test.mjs` 硬断言
 * 「unavailable 态下 success 必须为 false」。也就是说 **`success:false` 是一个
 * 有语义的正常响应**，不是结构坏了。
 * 原来的写法把它和「data/raw 读不出来」合并进同一个异常分支，于是线上出现
 * 「接口 200、Worker 明明写清了原因，页面却说『数据格式异常』」——
 * 这是把「我们没有这个数据源」冒充成「接口坏了」，两种事实互相顶替。
 *
 * 因此这里只把**结构真的读不出来**（缺 data 或 data.raw 不是数组）判为 format：
 *   · events —— 事件数组非空            → 正常渲染
 *   · empty  —— 数组为空（任何原因）     → 配 state（不可用时带 Worker 的中文原因）
 *   · format —— data.raw 不是数组        → 明确失败，绝不能说「暂无事件」
 */
export function resolveEventCalendarView(body: any): EventCalendarView {
  const data = body?.data;
  if (!data || typeof data !== 'object') {
    const reason = '响应缺少 data 对象';
    return {
      kind: 'format',
      reason,
      state: { kind: 'unavailable', updatedAt: null, error: `数据格式异常：${reason}` },
    };
  }
  const rawList = (data as { raw?: unknown }).raw;
  if (!Array.isArray(rawList)) {
    const reason = 'data.raw 不是事件数组';
    return {
      kind: 'format',
      reason,
      state: { kind: 'unavailable', updatedAt: null, error: `数据格式异常：${reason}` },
    };
  }

  // meta 优先取后端契约（顶层或 data 内）；Worker 版没有 meta，用
  // dataSource + message 合成等价元信息，让 Banner 能显示真实原因而不是空原因。
  const declaredMeta = body?.meta ?? (data as { meta?: unknown }).meta;
  const meta = declaredMeta ?? (
    typeof body?.dataSource === 'string' && body.dataSource
      ? {
        source: body.dataSource,
        updatedAt: null,
        error: typeof body.message === 'string' ? body.message
          : (typeof body.error === 'string' ? body.error : undefined),
      }
      : undefined
  );
  const state = resolveDataSource(meta ? { meta } : body, rawList.length === 0, false);

  return rawList.length === 0
    ? { kind: 'empty', state }
    : { kind: 'events', raw: rawList as RawEvent[], state };
}

/**
 * 列表空态文案：四种事实互不冒充。
 *
 *  - format      结构读不出来        → 说接口结构异常，绝不说「暂无事件」
 *  - http        请求失败/非 2xx      → 说接口失败
 *  - unavailable 接口正常但无数据源   → 摊开后端/Worker 给的中文原因
 *  - 其余        接口正常且确实 0 条   → 「当前筛选条件下暂无事件」
 */
export function resolveEventCalendarEmptyView(args: {
  hasEvents: boolean;
  problem: EventCalendarProblem;
  state?: DataSourceState;
}): { title: string; description: string } {
  const { hasEvents, problem, state } = args;
  if (hasEvents) {
    return {
      title: '当前筛选条件下暂无事件',
      description: '已有事件数据，但当前区间/类型/影响级别筛选下没有匹配项。',
    };
  }
  if (problem === 'format') {
    return {
      title: '事件日历数据格式异常',
      description: `${state?.error || '响应结构无法解析'}。这不是「当前没有事件」，`
        + '而是接口返回的结构与前端契约不一致。',
    };
  }
  if (problem === 'http') {
    return {
      title: '事件日历接口请求失败',
      description: state?.error || '接口未返回可用响应，暂时无法获取事件日历。',
    };
  }
  if (state?.kind === 'unavailable' && state.error) {
    return { title: '事件日历暂无可用数据', description: state.error };
  }
  return {
    title: '当前筛选条件下暂无事件',
    description: '接口正常返回，未来 90 天内确实没有可展示的事件。',
  };
}

const EventCalendarPage: React.FC = () => {
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [loading, setLoading] = useState(false);
  const [problem, setProblem] = useState<EventCalendarProblem>(null);
  const [dataSource, setDataSource] = useState<DataSourceState | undefined>(undefined);
  const [range, setRange] = useState<string>('all');      // all | week | 30-90
  const [selectedTypes, setSelectedTypes] = useState<Set<EventType>>(new Set());
  const [minImpact, setMinImpact] = useState<string>('all'); // all | medium | high
  const [detail, setDetail] = useState<CalendarEvent | null>(null);
  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/event-calendar/events');
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      const view = resolveEventCalendarView(json);
      // 只有「结构读不出来」才是格式异常；success:false + unavailable 是正常响应
      setProblem(view.kind === 'format' ? 'format' : null);
      setEvents(view.kind === 'events' ? parseEvents(view.raw) : []);
      setDataSource(view.state);
    } catch (err) {
      // 真正的事故：网络/非 2xx/响应不是 JSON —— 与「暂无事件」严格区分
      logger.warn('事件日历接口请求失败，已如实置空（非「暂无事件」）:', err);
      setEvents([]);
      setProblem('http');
      setDataSource({ kind: 'unavailable', updatedAt: null, error: (err as Error).message });
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => { fetchData(); }, [fetchData]);
  const today = useMemo(() => fmtDate(new Date()), []);
  const maxDate = useMemo(() => {
    const d = new Date(); d.setDate(d.getDate() + 90); return fmtDate(d);
  }, []);
  const weekEnd = useMemo(() => {
    const d = new Date(); d.setDate(d.getDate() + 6); return fmtDate(d);
  }, []);
  // 应用筛选（封装 filterEvents）
  const filtered = useMemo(() => {
    const types = selectedTypes.size ? [...selectedTypes] : undefined;
    let start = today, end = maxDate;
    if (range === 'week') end = weekEnd;
    if (range === '30-90') {
      const d = new Date(); d.setDate(d.getDate() + 30); start = fmtDate(d);
    }
    const min = minImpact === 'high' ? 'high' : minImpact === 'medium' ? 'medium' : undefined;
    return filterEvents(events, {
      types, startDate: start, endDate: end, minImpact: min as EventImpact | undefined,
    }).sort((a, b) => a.date.localeCompare(b.date));
  }, [events, selectedTypes, range, minImpact, today, maxDate, weekEnd]);
  // 按日期分组
  const groups = useMemo(() => {
    const map = new Map<string, CalendarEvent[]>();
    for (const e of filtered) {
      if (!map.has(e.date)) map.set(e.date, []);
      map.get(e.date)!.push(e);
    }
    return [...map.entries()].map(([date, evs]) => ({ date, events: evs }));
  }, [filtered]);
  // 事件聚集检测（封装 detectEventClusters）
  const clusters = useMemo(() => detectEventClusters(filtered), [filtered]);
  const clusterByDate = useMemo(() => {
    const m = new Map<string, EventCluster>();
    clusters.forEach(c => m.set(c.date, c));
    return m;
  }, [clusters]);
  // 统计卡
  const stats = useMemo(() => {
    const high = filtered.filter(e => e.impact === 'high').length;
    const week = filtered.filter(e => e.date >= today && e.date <= weekEnd).length;
    const symbols = new Set(filtered.map(e => e.symbol).filter(Boolean));
    return { total: filtered.length, high, week, symbols: symbols.size };
  }, [filtered, today, weekEnd]);
  // 风险日历（封装 generateRiskCalendar）
  const topRiskDays = useMemo(() => {
    return generateRiskCalendar(filtered, today, maxDate)
      .filter(d => d.riskScore > 0)
      .sort((a, b) => b.riskScore - a.riskScore)
      .slice(0, 5);
  }, [filtered, today, maxDate]);
  // 详情分析（封装 analyzeEventImpact）
  const analysis = useMemo(
    () => (detail ? analyzeEventImpact(detail, events, {}) : null),
    [detail, events],
  );
  /**
   * 列表空态文案：四种事实互不冒充（实现见 resolveEventCalendarEmptyView）。
   */
  const emptyView = useMemo(
    () => resolveEventCalendarEmptyView({
      hasEvents: events.length > 0, problem, state: dataSource,
    }),
    [events.length, problem, dataSource],
  );
  const toggleType = (t: EventType) => {
    setSelectedTypes(prev => {
      const n = new Set(prev);
      n.has(t) ? n.delete(t) : n.add(t);
      return n;
    });
  };
  const rangeOptions = [
    { label: '全部(90天)', value: 'all' },
    { label: '本周', value: 'week' },
    { label: '30-90天', value: '30-90' },
  ];
  const impactOptions = [
    { label: '全部影响', value: 'all' },
    { label: '中及以上', value: 'medium' },
    { label: '仅高影响', value: 'high' },
  ];
  return (
    <div style={{ padding: 24 }}>
      <Row justify="space-between" align="middle" style={{ marginBottom: 16 }}>
        <Col>
          <Title level={4} style={{ margin: 0 }}>
            <CalendarOutlined /> 事件日历
          </Title>
          <Text type="secondary" style={{ fontSize: 12 }}>
            未来 90 天 A 股事件 · 数据由后端 event-calendar 接口实时聚合
          </Text>
        </Col>
        <Col>
          <Button icon={<ReloadOutlined />} onClick={() => fetchData()} loading={loading}>刷新</Button>
        </Col>
      </Row>
      {/* 诚实数据来源 Banner：空数据/不可用须显性告知，禁止静默降级 */}
      <DataSourceBanner
        entries={[{ name: '事件日历', state: dataSource ?? { kind: 'loading', updatedAt: null } }]}
        onRetry={() => fetchData()}
        retrying={loading}
      />
      {/* 顶部统计卡 */}
      <Row gutter={16} style={{ marginBottom: 16 }}>
        <Col xs={12} sm={6}>
          <Card size="small">
            <Statistic title="事件总数" value={stats.total} prefix={<CalendarOutlined />} />
          </Card>
        </Col>
        <Col xs={12} sm={6}>
          <Card size="small">
            <Statistic title="本周事件" value={stats.week} prefix={<FireOutlined />} />
          </Card>
        </Col>
        <Col xs={12} sm={6}>
          <Card size="small">
            <Statistic
              title="高影响事件"
              value={stats.high}
              prefix={<WarningOutlined />}
              valueStyle={{ color: IMPACT_COLOR.high }}
            />
          </Card>
        </Col>
        <Col xs={12} sm={6}>
          <Card size="small">
            <Statistic title="涉及个股" value={stats.symbols} prefix={<RiseOutlined />} />
          </Card>
        </Col>
      </Row>
      {/* 筛选条 */}
      <Card size="small" style={{ marginBottom: 16 }}>
        <Space wrap size={[12, 12]}>
          <Segmented options={rangeOptions} value={range} onChange={v => setRange(v as string)} />
          <Segmented options={impactOptions} value={minImpact} onChange={v => setMinImpact(v as string)} />
          <Space wrap size={[4, 4]}>
            <Tag.CheckableTag
              checked={selectedTypes.size === 0}
              onChange={() => setSelectedTypes(new Set())}
            >
              全部类型
            </Tag.CheckableTag>
            {TYPE_POOL.map(t => (
              <Tag.CheckableTag key={t} checked={selectedTypes.has(t)} onChange={() => toggleType(t)}>
                <span style={{ color: selectedTypes.has(t) ? TYPE_META[t].color : undefined }}>
                  {TYPE_META[t].label}
                </span>
              </Tag.CheckableTag>
            ))}
          </Space>
        </Space>
      </Card>
      <Row gutter={16}>
        {/* 事件列表（按日期分组） */}
        <Col xs={24} lg={16}>
          <Card title="事件列表" loading={loading} style={{ minHeight: 480 }}>
            {groups.length === 0 ? (
              <EmptyState title={emptyView.title} description={emptyView.description} />
            ) : (
              <Space direction="vertical" size={16} style={{ width: '100%' }}>
                {groups.map(g => {
                  const cluster = clusterByDate.get(g.date);
                  return (
                    <div key={g.date}>
                      <Space align="center" style={{ marginBottom: 8 }}>
                        <Text strong style={{ fontSize: 15 }}>{g.date}</Text>
                        <Text type="secondary">{weekday(g.date)}</Text>
                        <Badge count={g.events.length} showZero color="#2962FF" />
                        {cluster && (
                          <Tooltip title={`建议：${cluster.recommendedAction}`}>
                            <Tag color={cluster.riskLevel === 'high' ? 'red' : 'orange'}>
                              <ExclamationCircleOutlined /> 事件聚集·{cluster.riskLevel === 'high' ? '高风险' : '中风险'}
                            </Tag>
                          </Tooltip>
                        )}
                      </Space>
                      <Space direction="vertical" size={8} style={{ width: '100%', paddingLeft: 8 }}>
                        {g.events.map(e => (
                          <div
                            key={e.id}
                            onClick={() => setDetail(e)}
                            style={{
                              cursor: 'pointer', padding: '8px 12px', borderRadius: 6,
                              border: '1px solid #303030', borderLeft: `3px solid ${IMPACT_COLOR[e.impact]}`,
                            }}
                          >
                            <Space size={8} wrap>
                              <Tag color={TYPE_META[e.type].color}>{TYPE_META[e.type].label}</Tag>
                              <Tag style={{ color: IMPACT_COLOR[e.impact], borderColor: IMPACT_COLOR[e.impact] }}>
                                {IMPACT_LABEL[e.impact]}
                              </Tag>
                              {e.symbol && <Text code>{e.symbol}</Text>}
                              <Text strong>{e.title}</Text>
                            </Space>
                            <div style={{ marginTop: 4 }}>
                              <Text type="secondary" style={{ fontSize: 12 }}>{e.description}</Text>
                              {e.estimatedEffect !== undefined && (
                                <Text
                                  style={{
                                    fontSize: 12, marginLeft: 8,
                                    color: e.estimatedEffect >= 0 ? '#cf1322' : '#3f8600',
                                  }}
                                >
                                  {e.estimatedEffect >= 0 ? <RiseOutlined /> : <FallOutlined />}
                                  {' '}预估影响 {e.estimatedEffect > 0 ? '+' : ''}{e.estimatedEffect}%
                                </Text>
                              )}
                            </div>
                          </div>
                        ))}
                      </Space>
                    </div>
                  );
                })}
              </Space>
            )}
          </Card>
        </Col>
        {/* 侧栏：聚集预警 + 风险日 */}
        <Col xs={24} lg={8}>
          <Card title="事件聚集预警" style={{ marginBottom: 16 }} loading={loading}>
            {clusters.length === 0 ? (
              <EmptyState title="无聚集" />
            ) : (
              <Space direction="vertical" size={10} style={{ width: '100%' }}>
                {clusters.slice(0, 6).map(c => (
                  <div key={c.date} style={{ padding: '6px 10px', borderRadius: 6, border: '1px solid #303030' }}>
                    <Space>
                      <Tag color={c.riskLevel === 'high' ? 'red' : c.riskLevel === 'medium' ? 'orange' : 'default'}>
                        {c.date}
                      </Tag>
                      <Text type="secondary">{c.events.length} 起事件</Text>
                    </Space>
                    <div style={{ marginTop: 4 }}>
                      <Text style={{ fontSize: 12, color: IMPACT_COLOR[c.riskLevel === 'high' ? 'high' : 'medium'] }}>
                        {c.recommendedAction}
                      </Text>
                    </div>
                  </div>
                ))}
              </Space>
            )}
          </Card>
          <Card title="未来高风险日" loading={loading}>
            {topRiskDays.length === 0 ? (
              <EmptyState title="无风险日" />
            ) : (
              <Space direction="vertical" size={10} style={{ width: '100%' }}>
                {topRiskDays.map(d => (
                  <div key={d.date} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <Text style={{ width: 92, fontSize: 12 }}>{d.date}</Text>
                    <div style={{ flex: 1, height: 8, background: '#303030', borderRadius: 4, overflow: 'hidden' }}>
                      <div style={{
                        width: `${d.riskScore}%`, height: '100%',
                        background: d.riskScore >= 60 ? '#cf1322' : d.riskScore >= 30 ? '#fa8c16' : '#2962FF',
                      }} />
                    </div>
                    <Text style={{ width: 48, textAlign: 'right', fontSize: 12 }}>{d.riskScore}</Text>
                  </div>
                ))}
              </Space>
            )}
          </Card>
        </Col>
      </Row>
      {/* 事件详情：影响分析 */}
      <Modal
        title={detail ? `${detail.title} · 影响分析` : ''}
        open={!!detail}
        onCancel={() => setDetail(null)}
        footer={null}
        width={640}
      >
        {detail && analysis && (
          <Space direction="vertical" size={12} style={{ width: '100%' }}>
            <Descriptions column={2} size="small" bordered>
              <Descriptions.Item label="类型">
                <Tag color={TYPE_META[detail.type].color}>{TYPE_META[detail.type].label}</Tag>
              </Descriptions.Item>
              <Descriptions.Item label="影响级别">
                <Tag style={{ color: IMPACT_COLOR[detail.impact], borderColor: IMPACT_COLOR[detail.impact] }}>
                  {IMPACT_LABEL[detail.impact]}
                </Tag>
              </Descriptions.Item>
              <Descriptions.Item label="日期">{detail.date}</Descriptions.Item>
              <Descriptions.Item label="标的">{detail.symbol || '—'}</Descriptions.Item>
              <Descriptions.Item label="描述" span={2}>{detail.description || '—'}</Descriptions.Item>
            </Descriptions>
            <Card type="inner" title="历史影响分析（同类事件）" size="small">
              <Row gutter={12}>
                <Col span={8}><Statistic title="样本数" value={analysis.historicalImpact.sampleSize} /></Col>
                <Col span={8}>
                  <Statistic
                    title="平均绝对波动"
                    value={analysis.historicalImpact.avgAbsChange}
                    precision={2}
                    suffix="%"
                  />
                </Col>
                <Col span={8}>
                  <Statistic
                    title="正向概率"
                    value={analysis.historicalImpact.positiveRate * 100}
                    precision={0}
                    suffix="%"
                  />
                </Col>
              </Row>
              <Row gutter={12} style={{ marginTop: 8 }}>
                <Col span={8}>
                  <Statistic title="最大涨幅" value={analysis.historicalImpact.maxGain} precision={2} suffix="%"
                    valueStyle={{ color: '#cf1322' }} />
                </Col>
                <Col span={8}>
                  <Statistic title="最大跌幅" value={analysis.historicalImpact.maxLoss} precision={2} suffix="%"
                    valueStyle={{ color: '#3f8600' }} />
                </Col>
                <Col span={8}>
                  <Statistic title="风险调整分" value={Number(analysis.riskAdjustedScore.toFixed(2))} />
                </Col>
              </Row>
            </Card>
          </Space>
        )}
      </Modal>
    </div>
  );
};
export default EventCalendarPage;
