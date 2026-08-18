/**
 * 宏观资金全景 (MacroHubPage) — #1 聚合收束入口
 *
 * 设计意图（做减法）：
 *  此前宏观/资金相关工具散落在侧栏 4 个分组里（宏观仪表盘、资金流向、北向资金、
 *  融资融券、ETF中心、事件日历、组合风控），认知负担重、与核心循环争抢注意力。
 *  本页把这 7 个辅助模块聚合为一个「全景入口」：每张卡片给出该模块当前的
 *  【实时核心指标 + 数据状态（real / partial / unavailable）+ 下钻链接】，
 *  用户在 1 屏内即可纵览全市场宏观资金面，需要深入时再点进对应详情页。
 *
 * 诚实数据红线：
 *  所有数据来自各自后端接口的真实响应；接口不可用（沙箱数据源不可达）时
 *  如实标记为 unavailable 并留空，绝不注入演示数据。
 *
 * 与核心循环的关系（守住 3）：
 *  本页只聚合「辅助/环境」类模块，核心循环页面（市场洞察 / 潜力雷达 / 产业地图 /
 *  策略选股 / 自选组合 / 投资笔记）保持独立且靠前，不被淹没。
 */

import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, Row, Col, Tag, Typography, Spin, Space } from 'antd';
import {
  GlobalOutlined,
  ArrowLeftOutlined,
  BankOutlined,
  PieChartOutlined,
  FundOutlined,
  CalendarOutlined,
  SafetyCertificateOutlined,
  RightOutlined,
  DashboardOutlined,
} from '@ant-design/icons';
import { ROUTE_PATHS } from '../routes/paths';

const { Title, Text, Paragraph } = Typography;

// ===================== 类型 =====================

type Status = 'real' | 'partial' | 'unavailable';

interface Metric {
  label: string;
  value: string;
}

interface ModuleState {
  status: Status;
  statusNote?: string;
  metrics: Metric[];
}

interface ModuleDef {
  id: string;
  label: string;
  icon: React.ComponentType<{ className?: string; style?: React.CSSProperties }>;
  path: string;
  load: () => Promise<ModuleState>;
}

// ===================== 工具 =====================

/** 统一拉取：成功返回 json.data，失败抛错（由上层 allSettled 捕获）。 */
async function getJson(url: string): Promise<any> {
  const res = await fetch(url, { signal: AbortSignal.timeout?.(8000) });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const json = await res.json();
  return json?.data;
}

const fmtYi = (v: any): string =>
  v == null ? '—' : `${(Number(v) / 1e8).toFixed(0)} 亿`;

const statusTag: Record<Status, { color: string; text: string }> = {
  real: { color: 'green', text: '实时' },
  partial: { color: 'gold', text: '部分' },
  unavailable: { color: 'default', text: '未接入' },
};

// ===================== 模块定义 =====================

const MODULES: ModuleDef[] = [
  {
    id: 'macro',
    label: '宏观仪表盘',
    icon: GlobalOutlined,
    path: ROUTE_PATHS.MACRO,
    load: async (): Promise<ModuleState> => {
      const d = await getJson('/api/macro/overview');
      const core: any[] = Array.isArray(d?.core) ? d.core : [];
      if (!core.length) {
        return { status: 'unavailable', statusNote: '宏观指标数据源未接入', metrics: [] };
      }
      const pick = (l: string) => core.find((c) => c.label === l);
      const rising = pick('上涨家数');
      const limit = pick('涨停家数');
      return {
        status: 'real',
        metrics: [
          { label: '上涨家数', value: rising?.valueText ?? '—' },
          { label: '涨停家数', value: limit?.valueText ?? '—' },
          { label: '指标卡片', value: `${core.length} 项` },
        ],
      };
    },
  },
  {
    id: 'north-bound',
    label: '北向资金',
    icon: ArrowLeftOutlined,
    path: ROUTE_PATHS.NORTH_BOUND,
    load: async (): Promise<ModuleState> => {
      const d = await getJson('/api/north-bound/overview');
      const flows: any[] = d?.flows ?? [];
      const holdings: any[] = d?.holdings ?? [];
      const sectors: any[] = d?.sectors ?? [];
      const status: Status =
        d?.dataSource === 'real'
          ? 'real'
          : flows.length || holdings.length || sectors.length
            ? 'partial'
            : 'unavailable';
      return {
        status,
        statusNote: d?.notes?.source,
        metrics: [
          { label: '净流入序列', value: `${flows.length}` },
          { label: '北向重仓', value: `${holdings.length}` },
          { label: '板块净流入', value: `${sectors.length}` },
        ],
      };
    },
  },
  {
    id: 'margin',
    label: '融资融券',
    icon: BankOutlined,
    path: ROUTE_PATHS.MARGIN_TRADING,
    load: async (): Promise<ModuleState> => {
      const d = await getJson('/api/margin/overview');
      const status: Status = d?.dataSource === 'real' ? 'real' : 'unavailable';
      return {
        status,
        statusNote: typeof d?.notes === 'string' ? d.notes : undefined,
        metrics: [
          { label: '融资余额', value: fmtYi(d?.totalFinancingBalance) },
          { label: '融券余额', value: fmtYi(d?.totalSecuritiesBalance) },
          { label: '融资标的', value: d?.financingStockCount == null ? '—' : `${d.financingStockCount}` },
        ],
      };
    },
  },
  {
    id: 'etf',
    label: 'ETF中心',
    icon: PieChartOutlined,
    path: ROUTE_PATHS.ETF,
    load: async (): Promise<ModuleState> => {
      const d = await getJson('/api/etf/list');
      const list: any[] = d?.data ?? [];
      const total = list.reduce((s: number, x: any) => s + (x.totalAssets || 0), 0);
      return {
        status: list.length ? 'real' : 'unavailable',
        metrics: [
          { label: 'ETF 数量', value: `${list.length}` },
          { label: '总规模', value: list.length ? fmtYi(total) : '—' },
        ],
      };
    },
  },
  {
    id: 'fund-flow',
    label: '资金流向',
    icon: FundOutlined,
    path: ROUTE_PATHS.FUND_FLOW,
    load: async (): Promise<ModuleState> => {
      const d = await getJson('/api/fund-flow/market');
      const m = d?.market ?? {};
      const status: Status =
        d?.dataSource === 'real' ? 'real' : m.totalStocks ? 'partial' : 'unavailable';
      return {
        status,
        statusNote: d?.note,
        metrics: [
          { label: '成交额', value: fmtYi(m.totalTurnover) },
          { label: '上涨 / 涨停', value: `${m.risingStocks ?? '—'} / ${m.limitUpCount ?? '—'}` },
          { label: '全市场', value: `${m.totalStocks ?? '—'} 只` },
        ],
      };
    },
  },
  {
    id: 'event-calendar',
    label: '事件日历',
    icon: CalendarOutlined,
    path: ROUTE_PATHS.EVENT_CALENDAR,
    load: async (): Promise<ModuleState> => {
      const d = await getJson('/api/event-calendar/events');
      const raw: any[] = d?.raw ?? [];
      const status: Status = d?.dataSource === 'real' ? 'real' : raw.length ? 'partial' : 'unavailable';
      return {
        status,
        statusNote: d?.meta?.source,
        metrics: [{ label: '近期事件', value: `${raw.length}` }],
      };
    },
  },
  {
    id: 'risk-center',
    label: '组合风控',
    icon: SafetyCertificateOutlined,
    path: ROUTE_PATHS.RISK_CENTER,
    load: async (): Promise<ModuleState> => {
      const d = await getJson('/api/risk-center/portfolio');
      const holdings: any[] = d?.holdings ?? [];
      return {
        status: holdings.length ? 'real' : 'unavailable',
        metrics: [{ label: '持仓数', value: `${holdings.length}` }],
      };
    },
  },
];

// ===================== 页面 =====================

const MacroHubPage: React.FC = () => {
  const navigate = useNavigate();
  const [states, setStates] = useState<Record<string, ModuleState>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    Promise.allSettled(MODULES.map((m) => m.load()))
      .then((results) => {
        if (cancelled) return;
        const map: Record<string, ModuleState> = {};
        results.forEach((r, i) => {
          const id = MODULES[i].id;
          if (r.status === 'fulfilled') {
            map[id] = r.value;
          } else {
            map[id] = { status: 'unavailable', statusNote: '接口请求失败', metrics: [] };
          }
        });
        setStates(map);
        setLoading(false);
      })
      .catch(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const availableCount = Object.values(states).filter((s) => s.status !== 'unavailable').length;

  return (
    <div style={{ padding: 24 }}>
      <Row justify="space-between" align="middle" style={{ marginBottom: 8 }}>
        <Col>
          <Title level={3} style={{ margin: 0 }}>
            <DashboardOutlined /> 宏观资金全景
          </Title>
          <Text type="secondary">
            一屏纵览宏观 / 资金面 7 大模块 · 实时指标与数据状态 · 点卡片下钻详情
          </Text>
        </Col>
        <Col>
          <Tag color={availableCount > 0 ? 'blue' : 'default'}>
            {availableCount}/{MODULES.length} 模块有数据
          </Tag>
        </Col>
      </Row>

      <Paragraph type="secondary" style={{ fontSize: 13, marginTop: 4 }}>
        辅助 / 环境类模块已聚合于此，核心循环（市场洞察 · 潜力雷达 · 产业地图 · 策略选股 · 自选组合 · 投资笔记）保持独立且靠前。
      </Paragraph>

      <Spin spinning={loading}>
        <Row gutter={[16, 16]} style={{ marginTop: 16 }}>
          {MODULES.map((mod) => {
            const st = states[mod.id];
            const Icon = mod.icon;
            const tag = st ? statusTag[st.status] : statusTag.unavailable;
            return (
              <Col xs={24} sm={12} lg={8} key={mod.id}>
                <Card
                  hoverable
                  onClick={() => navigate(mod.path)}
                  styles={{ body: { padding: 16 } }}
                  style={{ height: '100%' }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                    <Space>
                      <Icon style={{ fontSize: 18, color: '#2962FF' }} />
                      <Text strong style={{ fontSize: 15 }}>{mod.label}</Text>
                    </Space>
                    <Tag color={tag.color} style={{ marginRight: 0 }}>{tag.text}</Tag>
                  </div>

                  {st?.statusNote && (
                    <Text type="secondary" style={{ fontSize: 12, display: 'block', marginBottom: 8 }}>
                      {st.statusNote}
                    </Text>
                  )}

                  <div style={{ minHeight: 48 }}>
                    {st && st.metrics.length > 0 ? (
                      <Row gutter={[8, 8]}>
                        {st.metrics.map((m) => (
                          <Col span={12} key={m.label}>
                            <div>
                              <div style={{ fontSize: 12, color: '#8c8c8c' }}>{m.label}</div>
                              <div style={{ fontSize: 18, fontWeight: 600 }}>{m.value}</div>
                            </div>
                          </Col>
                        ))}
                      </Row>
                    ) : (
                      <Text type="secondary" style={{ fontSize: 13 }}>暂无可用数据</Text>
                    )}
                  </div>

                  <div style={{ marginTop: 12, textAlign: 'right' }}>
                    <Text style={{ color: '#2962FF', fontSize: 13 }}>
                      查看详情 <RightOutlined style={{ fontSize: 11 }} />
                    </Text>
                  </div>
                </Card>
              </Col>
            );
          })}
        </Row>
      </Spin>
    </div>
  );
};

export default MacroHubPage;
