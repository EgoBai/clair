/**
 * 限售股解禁日历页面
 * 参考东方财富限售股解禁数据展示
 */

import React, { useState, useEffect, useCallback } from 'react';
import logger from '../utils/logger';
import { readResponseStatus, statusFromFailure } from '../services/apiGateway';
import { classifyApiResponse, type ApiStatus } from '../utils/apiStatus';
import { EmptyState } from '../components/Common/StateComponents';
import { ApiStatusNotice } from '../components/Common/ApiStatusNotice';
import {
  Card, Table, Tag, Calendar, Space, Typography, Row, Col, Statistic,
  Button, Badge, Modal,
} from 'antd';
import {
  LockOutlined, CalendarOutlined, DollarOutlined, ReloadOutlined,
  WarningOutlined,
} from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import type { Dayjs } from 'dayjs';

const { Title, Text } = Typography;

interface LockupExpiry {
  id: number;
  symbol: string;
  name: string;
  expiryDate: string;
  lockupType: string;
  shareholder: string;
  totalShares: number;
  circulatingBefore: number;
  unlockRatio: number;
  marketValue: number;
  price: number;
}

interface LockupSummary {
  totalStocks: number;
  totalEvents: number;
  totalMarketValue: number;
  totalShares: number;
  avgUnlockRatio: number;
}

/** 取数问题：format=结构读不出来；http=请求层失败（网络/非 2xx/响应不是 JSON） */
export type LockupProblem = 'format' | 'http' | null;

/** 响应判定三态（判定纪律与 event-calendar 页的 resolveEventCalendarView 一致） */
export type LockupView =
  | {
    kind: 'records';
    expiries: LockupExpiry[];
    byDate: Record<string, LockupExpiry[]>;
    summary: LockupSummary | null;
    status: ApiStatus;
  }
  | { kind: 'empty'; status: ApiStatus }
  | { kind: 'format'; reason: string; status: ApiStatus };

/**
 * 服务端把两种不同事实塞进同一个 `success:false + dataSource:'unavailable'` 桶，
 * 唯一能区分的是 message 文案（见 clair-worker handleLockupCalendar 与
 * backend/src/api/lockup-shares.ts 的 emptyCalendar）：
 *   `…无解禁记录（源可达，属正常空）` → 源可达、本月真的一条都没有
 *   `…报表不可达：…`                  → 上游取不到
 * 这里**只认服务端显式打的「属正常空」标记**才敢说「确实没有」；没有标记
 * （后端把两种事实合并成一句 notes，或将来文案改动）一律落回「暂无可用数据」+原文。
 * 退化方向是安全的：宁可说「取不到」，绝不能在拿不到时宣称「确实没有」。
 */
const NORMAL_EMPTY_MARKER = '属正常空';

/**
 * 服务端给的中文解释。Worker 放在顶层 `message`/`error`（classifyApiResponse 会读到），
 * Express 后端放在 `data.notes`（读不到）——这里补齐，保证两种后端的原文都能透出，
 * 空态文案永远带着服务端自己的解释，而不是前端代拟。
 */
function readServerNote(body: unknown): string | undefined {
  if (!body || typeof body !== 'object') return undefined;
  const rec = body as Record<string, unknown>;
  const data = rec.data;
  const inner = data && typeof data === 'object' && !Array.isArray(data)
    ? (data as Record<string, unknown>)
    : undefined;
  for (const c of [rec.message, rec.error, inner?.message, inner?.notes, rec.notes]) {
    if (typeof c === 'string' && c.trim() !== '') return c;
  }
  return undefined;
}

/**
 * 把 `/api/lockup/calendar` 的响应体判定成三态之一。
 *
 * 【为什么不能 `if (!json.success || !json.data) throw new Error('接口返回数据格式异常')`】
 * 本仓库对「该口径取不到数据」的既定表达是 HTTP 200 + `success:false` +
 * `dataSource:'unavailable'` + 中文 message（clair-worker 的 `unavailable()`，
 * 全站 20+ 端点同款，worker-contract.test.mjs 亦断言 unavailable ⇒ success:false）。
 * 实测线上三例（2026-11-01）：
 *   2026-11 → success:true + dataSource:'real' + expiries 150 条（真数据）
 *   2099-06 → success:false + unavailable + 「无解禁记录（源可达，属正常空）」
 *   2000-01 → success:false + unavailable + 「报表不可达：…」
 * 原写法把后两例一律抛成「接口返回数据格式异常」——把「没有记录/取不到」
 * 冒充成「接口坏了」，正是两种事实互相顶替。
 *
 * 因此：**先看服务端声明的状态，再看结构**。
 *   · status 非 ok（unavailable/failed/not-deployed）→ 按该状态如实展示，绝不判 format
 *   · status ok 但 `data.expiries` 不是数组          → format（结构真读不出来）
 *   · 其余                                            → 有记录 / 确实 0 条
 */
export function resolveLockupView(body: unknown, httpStatus: number): LockupView {
  const status = classifyApiResponse(httpStatus, body);

  // 服务端已声明「取不到/失败/未挂载」时，结构长什么样都不算 format ——
  // 否则就是把「没有数据源」说成「我们没解析出来」。
  if (status.kind !== 'ok') {
    // classifyApiResponse 只认顶层 error/message，后端把原因放 data.notes，这里补齐
    const reason = status.reason ?? readServerNote(body);
    return { kind: 'empty', status: reason ? { ...status, reason } : status };
  }

  const data = (body as { data?: unknown } | null | undefined)?.data;
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    return {
      kind: 'format',
      reason: '响应缺少 data 对象',
      status: {
        kind: 'failed',
        httpStatus,
        reason: '数据格式异常：响应缺少 data 对象',
      },
    };
  }

  const list = (data as { expiries?: unknown }).expiries;
  if (!Array.isArray(list)) {
    return {
      kind: 'format',
      reason: 'data.expiries 不是解禁记录数组',
      status: {
        kind: 'failed',
        httpStatus,
        reason: '数据格式异常：data.expiries 不是解禁记录数组',
      },
    };
  }

  // byDate / summary 缺失或形状不对时收敛为空，只影响展示，不冒充「结构坏了」，
  // 也不编造值：byDate 缺了就是没有日历索引，summary 缺了就是不显示统计卡。
  const byDateRaw = (data as { byDate?: unknown }).byDate;
  const byDate = (
    byDateRaw && typeof byDateRaw === 'object' && !Array.isArray(byDateRaw)
  ) ? byDateRaw as Record<string, LockupExpiry[]> : {};
  const summaryRaw = (data as { summary?: unknown }).summary;
  const summary = (
    summaryRaw && typeof summaryRaw === 'object' && !Array.isArray(summaryRaw)
  ) ? summaryRaw as LockupSummary : null;

  return list.length === 0
    ? { kind: 'empty', status }
    : { kind: 'records', expiries: list as LockupExpiry[], byDate, summary, status };
}

/**
 * 列表空态文案：四种事实互不冒充（另附请求失败/未挂载两支，同样不得写成「暂无数据」）。
 *
 *  - format      结构真读不出来        → 「数据格式异常」，绝不写成「暂无数据」
 *  - http/failed 请求层失败            → 说请求失败，不说「暂无」也不说「格式异常」
 *  - unavailable 上游取不到/无数据源   → 「暂无可用数据」+ 后端中文原文
 *  - 正常空      服务端确认真没有      → 「本期确实没有解禁记录」
 *  - filtered    有数据但筛选后为空    → 「当前条件下暂无解禁记录」
 */
export function resolveLockupEmptyView(args: {
  problem: LockupProblem;
  status?: ApiStatus | null;
  hasRecords: boolean;
  filteredEmpty: boolean;
  period?: string;
}): { title: string; description: string } {
  const { problem, status, hasRecords, filteredEmpty, period } = args;
  const scope = period ? `${period} 内` : '本期';
  const reason = status?.reason;

  if (problem === 'format') {
    return {
      title: '数据格式异常',
      description: `${reason ?? '响应结构无法解析'}。这不是「暂无解禁记录」，`
        + '而是接口返回的结构与前端契约不一致，需排查接口。',
    };
  }
  // 先认「端点未挂载」再认「请求失败」：登记表判出未挂载时（statusFromFailure
  // 会回查登记表），不能因为问题来自 catch 就把它说成「请求失败」。
  if (status?.kind === 'not-deployed') {
    return {
      title: '该接口未挂载',
      description: `${reason ?? '当前线上环境未部署此接口'}。需连接完整后端才能查看解禁数据，`
        + '这不是「暂无解禁记录」。',
    };
  }
  if (problem === 'http' || status?.kind === 'failed') {
    return {
      title: '解禁数据请求失败',
      description: `${reason ?? '接口未返回可用响应'}。这是请求失败，`
        + '不代表本月没有解禁记录，可稍后重试。',
    };
  }
  if (hasRecords && filteredEmpty) {
    return {
      title: '当前条件下暂无解禁记录',
      description: `${scope}有解禁记录，但当前筛选条件下没有匹配项。`,
    };
  }
  if (status?.kind === 'unavailable') {
    // 服务端显式标记「属正常空」→ 源可达、确实一条没有；其余（含文案改动后）落回「取不到」
    if (reason && reason.includes(NORMAL_EMPTY_MARKER)) {
      return {
        title: '本期确实没有解禁记录',
        description: `${reason}。这是服务端确认的真实空态，`
          + '不是接口异常，也不是数据格式问题。',
      };
    }
    return {
      title: '暂无可用数据',
      description: `${reason ?? '该口径当前没有可取的数据'}。接口已连通但取不到解禁数据，`
        + '未使用任何模拟值或 0 值填充。',
    };
  }
  return {
    title: '本期确实没有解禁记录',
    description: `接口正常返回，${scope}确实没有任何解禁记录。`
      + '这是真实空态，不是接口异常，也不是数据格式问题。',
  };
}

const formatAmount = (val: number): string => {
  if (val >= 1e8) return `${(val / 1e8).toFixed(2)}亿`;
  if (val >= 1e4) return `${(val / 1e4).toFixed(2)}万`;
  return val.toFixed(0);
};

const formatShares = (val: number): string => {
  if (val >= 1e8) return `${(val / 1e8).toFixed(2)}亿股`;
  if (val >= 1e4) return `${(val / 1e4).toFixed(2)}万股`;
  return `${val}股`;
};

/** 本地日期格式化为 YYYY-MM-DD（避免 toISOString 的时区偏移） */
const fmtDate = (d: Date): string => {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};

const LockupCalendarPage: React.FC = () => {
  const [expiries, setExpiries] = useState<LockupExpiry[]>([]);
  const [byDate, setByDate] = useState<Record<string, LockupExpiry[]>>({});
  const [summary, setSummary] = useState<LockupSummary | null>(null);
  const [loading, setLoading] = useState(false);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [detailModal, setDetailModal] = useState(false);

  /** 取数形态：未部署 / 数据不可得 / 请求失败 */
  const [loadStatus, setLoadStatus] = useState<ApiStatus | null>(null);
  /** 结构读不出来 / 请求层失败 —— 与「暂无记录」严格分开 */
  const [problem, setProblem] = useState<LockupProblem>(null);
  /** 当前查询的账期（YYYY-MM），用于空态文案说清是哪一期 */
  const [period, setPeriod] = useState<string | undefined>(undefined);

  const fetchData = useCallback(async (year?: number, month?: number) => {
    setLoading(true);
    setLoadStatus(null);
    setProblem(null);
    try {
      const now = new Date();
      const y = year || now.getFullYear();
      const m = month || now.getMonth() + 1;
      setPeriod(`${y}-${String(m).padStart(2, '0')}`);
      const params = new URLSearchParams({ year: String(y), month: String(m) });
      const url = `/api/lockup/calendar?${params}`;
      const res = await fetch(url);
      // 数据由后端 /api/lockup/calendar 实时提供；接口异常时如实置空，不使用伪造数据
      if (!res.ok) {
        // 判别放在这里而不是 catch 里：响应体只有此处能拿到 interceptor 的结论，
        // 一旦 throw 成 `HTTP ${status}` 字符串，形态信息就丢了。
        const st =
          readResponseStatus(res) ??
          statusFromFailure(new Error(`HTTP ${res.status}`), '/api/lockup/calendar');
        logger.warn('限售股解禁接口不可用，形态=', st.kind, st.httpStatus);
        setLoadStatus(st);
        setExpiries([]);
        setByDate({});
        setSummary(null);
        return;
      }
      const json = await res.json();
      const view = resolveLockupView(json, res.status);
      if (view.kind === 'format') {
        // 结构真读不出来：如实报「数据格式异常」，绝不说「暂无解禁记录」
        logger.warn('限售股解禁接口返回结构异常，已如实置空:', view.reason);
        setProblem('format');
        setLoadStatus(view.status);
        setExpiries([]);
        setByDate({});
        setSummary(null);
        return;
      }
      setLoadStatus(view.status);
      if (view.kind === 'empty') {
        setExpiries([]);
        setByDate({});
        setSummary(null);
        return;
      }
      setExpiries(view.expiries);
      setByDate(view.byDate);
      setSummary(view.summary);
    } catch (err) {
      // 真正的事故：网络失败 / 响应不是 JSON —— 与「暂无解禁记录」严格区分
      logger.warn('限售股解禁接口请求失败，已如实置空（非「暂无解禁记录」）:', err);
      setExpiries([]);
      setByDate({});
      setSummary(null);
      setProblem('http');
      setLoadStatus(statusFromFailure(err, '/api/lockup/calendar'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  const dateCellRender = (date: Dayjs) => {
    const dateStr = date.format('YYYY-MM-DD');
    const dayExpiries = byDate[dateStr];
    if (!dayExpiries || dayExpiries.length === 0) return null;

    const totalMV = dayExpiries.reduce((s, e) => s + e.marketValue, 0);
    return (
      <div
        style={{ cursor: 'pointer' }}
        onClick={() => { setSelectedDate(dateStr); setDetailModal(true); }}
      >
        <Badge
          count={dayExpiries.length}
          size="small"
          style={{ backgroundColor: totalMV > 1e10 ? '#cf1322' : '#1890ff' }}
        />
        <div style={{ fontSize: 11, color: '#666' }}>
          {formatAmount(totalMV)}
        </div>
      </div>
    );
  };

  const handlePanelChange = (date: Dayjs) => {
    fetchData(date.year(), date.month() + 1);
  };

  const columns: ColumnsType<LockupExpiry> = [
    {
      title: '排名',
      key: 'rank',
      width: 60,
      render: (_: unknown, __: unknown, index: number) => {
        const rank = index + 1;
        const colors = ['#FFD700', '#C0C0C0', '#CD7F32'];
        return rank <= 3
          ? <Tag color={colors[rank - 1]}>{rank}</Tag>
          : <Text type="secondary">{rank}</Text>;
      },
    },
    {
      title: '股票',
      key: 'stock',
      width: 140,
      render: (_, record) => (
        <Space direction="vertical" size={0}>
          <a href={`/stocks/${record.symbol}`} style={{ fontWeight: 600 }}>{record.name}</a>
          <Text type="secondary" style={{ fontSize: 12 }}>{record.symbol}</Text>
        </Space>
      ),
    },
    {
      title: '解禁日期',
      dataIndex: 'expiryDate',
      width: 110,
      sorter: (a, b) => a.expiryDate.localeCompare(b.expiryDate),
    },
    {
      title: '解禁类型',
      dataIndex: 'lockupType',
      width: 140,
      render: (val: string) => <Tag>{val}</Tag>,
    },
    {
      title: '股东',
      dataIndex: 'shareholder',
      width: 100,
    },
    {
      title: '解禁股数',
      dataIndex: 'totalShares',
      width: 110,
      render: (val: number) => formatShares(val),
      sorter: (a, b) => a.totalShares - b.totalShares,
    },
    {
      title: '占流通股比',
      dataIndex: 'unlockRatio',
      width: 110,
      render: (val: number) => {
        const color = val > 10 ? '#cf1322' : val > 5 ? '#fa8c16' : '#3f8600';
        return <Text style={{ color }}>{val.toFixed(2)}%</Text>;
      },
      sorter: (a, b) => a.unlockRatio - b.unlockRatio,
      defaultSortOrder: 'descend',
    },
    {
      title: '解禁市值',
      dataIndex: 'marketValue',
      width: 110,
      render: (val: number) => (
        <Text strong style={{ color: '#1890ff' }}>{formatAmount(val)}</Text>
      ),
      sorter: (a, b) => a.marketValue - b.marketValue,
    },
  ];

  const selectedExpiries = selectedDate ? byDate[selectedDate] || [] : [];

  /** 排行榜视图行（月内前 10），空态判定据此区分「筛选后为空」与「确实 0 条」 */
  const tableRows = expiries.slice(0, 10);
  const emptyView = resolveLockupEmptyView({
    problem,
    status: loadStatus,
    hasRecords: expiries.length > 0,
    filteredEmpty: expiries.length > 0 && tableRows.length === 0,
    period,
  });
  // 统计卡只在确有记录时展示：unavailable 态后端可能给 0 值 summary
  // （backend emptyCalendar 的 totalStocks:0 等），拿 0 顶替「取不到」即造假，必须不显示。
  const visibleSummary = summary && expiries.length > 0 ? summary : null;

  return (
    <div style={{ padding: 24 }}>
      <ApiStatusNotice status={loadStatus} moduleName="限售股解禁" onRetry={() => fetchData()} />
      <Row justify="space-between" align="middle" style={{ marginBottom: 16 }}>
        <Col>
          <Title level={4} style={{ margin: 0 }}>
            <LockOutlined /> 限售股解禁
          </Title>
        </Col>
        <Col>
          <Button icon={<ReloadOutlined />} onClick={() => fetchData()} loading={loading}>刷新</Button>
        </Col>
      </Row>

      {/* 统计卡片：仅在确有解禁记录时展示，杜绝拿 0 顶替「取不到」 */}
      {visibleSummary && (
        <Row gutter={16} style={{ marginBottom: 16 }}>
          <Col xs={12} sm={6}>
            <Card size="small">
              <Statistic title="解禁个股" value={visibleSummary.totalStocks} prefix={<LockOutlined />} />
            </Card>
          </Col>
          <Col xs={12} sm={6}>
            <Card size="small">
              <Statistic title="解禁事件" value={visibleSummary.totalEvents} prefix={<CalendarOutlined />} />
            </Card>
          </Col>
          <Col xs={12} sm={6}>
            <Card size="small">
              <Statistic
                title="总解禁市值"
                value={formatAmount(visibleSummary.totalMarketValue)}
                prefix={<DollarOutlined />}
              />
            </Card>
          </Col>
          <Col xs={12} sm={6}>
            <Card size="small">
              <Statistic
                title="平均占比"
                value={visibleSummary.avgUnlockRatio}
                precision={2}
                suffix="%"
                prefix={<WarningOutlined />}
              />
            </Card>
          </Col>
        </Row>
      )}

      <Row gutter={16}>
        {/* 日历 */}
        <Col xs={24} lg={14}>
          <Card title="解禁日历" loading={loading}>
            <Calendar
              dateCellRender={dateCellRender}
              onPanelChange={handlePanelChange}
              fullscreen={false}
            />
          </Card>
        </Col>

        {/* 解禁排行 */}
        <Col xs={24} lg={10}>
          <Card title="解禁市值排行" loading={loading}>
            <Table
              columns={columns}
              dataSource={tableRows}
              rowKey="id"
              size="small"
              pagination={false}
              scroll={{ x: 800 }}
              // 空态文案按事实分档，覆盖 antd 默认「暂无数据」——
              // 那句默认文案会把「格式异常/取不到/确实没有」混成一句。
              locale={{
                emptyText: (
                  <EmptyState title={emptyView.title} description={emptyView.description} />
                ),
              }}
            />
          </Card>
        </Col>
      </Row>

      {/* 详情弹窗 */}
      <Modal
        title={`${selectedDate} 解禁详情`}
        open={detailModal}
        onCancel={() => setDetailModal(false)}
        footer={null}
        width={800}
      >
        <Table
          columns={columns.filter(c => c.title !== '排名')}
          dataSource={selectedExpiries}
          rowKey="id"
          size="small"
          pagination={false}
        />
      </Modal>
    </div>
  );
};

export default LockupCalendarPage;
