/**
 * 宏观仪表盘页面（S2-2）
 * 核心指标卡片 / 宏观趋势图(CPI vs PPI) / 利率与流动性 / 宏观日历
 *
 * 后端 /api/macro/* 暂未就绪（技术债 T6 模式）：API 失败时注入确定性演示数据兜底
 * （LCG 固定种子 20240724，禁用 Math.random，保证刷新结果一致）。
 *
 * 引擎复用：
 *  - macroEconomicEngine.analyzeMacroTrend —— 计算核心卡片环比方向与变化
 *  - macroCalendarEngine.EconomicEvent    —— 宏观日历事件数据模型
 */

import React, { useState, useEffect } from 'react';
import logger from '../utils/logger';
import {
  Card, Row, Col, Table, Tag, Typography, Spin,
} from 'antd';
import {
  ArrowUpOutlined, ArrowDownOutlined, LineChartOutlined,
  CalendarOutlined, FundOutlined, BankOutlined,
} from '@ant-design/icons';
import {
  LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend, CartesianGrid,
} from 'recharts';
import { analyzeMacroTrend, type MacroIndicator as EngineMacroIndicator } from '../utils/macroEconomicEngine';
import type { EconomicEvent } from '../utils/macroCalendarEngine';

const { Title, Text } = Typography;

/** 中国股市配色：涨/正向=红，跌/负向=绿；主色金融蓝 */
const UP = '#cf1322';
const DOWN = '#3f8600';
const BLUE = '#2962FF';

/** 固定种子线性同余发生器（与 MarginTradingPage / LockupCalendarPage 一致） */
function makeRng(seed: number): () => number {
  let s = seed % 2147483647;
  if (s <= 0) s += 2147483646;
  return () => {
    s = (s * 16807) % 2147483647;
    return (s - 1) / 2147483646;
  };
}

const fmtDate = (d: Date): string => {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};

/** 近 n 个月标签（以 2024-07 为终点向前推） */
function monthLabels(n: number): string[] {
  const out: string[] = [];
  const d = new Date(2024, 6, 1);
  d.setMonth(d.getMonth() - (n - 1));
  for (let i = 0; i < n; i++) {
    out.push(`${String(d.getFullYear()).slice(2)}/${String(d.getMonth() + 1).padStart(2, '0')}`);
    d.setMonth(d.getMonth() + 1);
  }
  return out;
}

// ===================== 演示数据生成（确定性） =====================

interface CoreCard {
  label: string;
  unit: string;
  valueText: string;
  direction: 'up' | 'down' | 'flat';
  deltaText: string;
  series: number[];
}

interface RateRow {
  name: string;
  current: number;
  change: number;
  unit: string;
}

const EVENT_TEMPLATES: Array<{
  name: string;
  category: EconomicEvent['category'];
  importance: EconomicEvent['importance'];
  previous: number;
  forecast: number;
  unit: string;
}> = [
  { name: 'CPI 同比', category: 'inflation', importance: 'high', previous: 0.8, forecast: 1.0, unit: '%' },
  { name: 'PPI 同比', category: 'inflation', importance: 'high', previous: -1.6, forecast: -1.4, unit: '%' },
  { name: 'PMI 制造业', category: 'pmi', importance: 'high', previous: 50.4, forecast: 50.5, unit: '' },
  { name: '社融存量同比', category: 'monetary', importance: 'medium', previous: 8.9, forecast: 9.1, unit: '%' },
  { name: '新增信贷', category: 'monetary', importance: 'medium', previous: 1.2, forecast: 1.35, unit: '万亿' },
  { name: 'M2 同比', category: 'monetary', importance: 'medium', previous: 7.0, forecast: 7.1, unit: '%' },
  { name: 'GDP 当季同比', category: 'gdp', importance: 'high', previous: 5.0, forecast: 5.1, unit: '%' },
  { name: '工业增加值同比', category: 'other', importance: 'medium', previous: 5.1, forecast: 5.3, unit: '%' },
  { name: '固定资产投资同比', category: 'other', importance: 'low', previous: 3.6, forecast: 3.8, unit: '%' },
  { name: '社会消费品零售同比', category: 'other', importance: 'low', previous: 4.8, forecast: 5.0, unit: '%' },
  { name: '进出口同比', category: 'trade', importance: 'medium', previous: 6.0, forecast: 6.5, unit: '%' },
  { name: 'LPR 报价', category: 'monetary', importance: 'high', previous: 3.35, forecast: 3.35, unit: '%' },
  { name: 'MLF 续作利率', category: 'monetary', importance: 'medium', previous: 2.5, forecast: 2.5, unit: '%' },
  { name: '外汇储备', category: 'other', importance: 'low', previous: 3.22, forecast: 3.21, unit: '万亿' },
];

function buildMacroData(): {
  core: CoreCard[];
  trend24: Array<{ month: string; cpi: number; ppi: number }>;
  rates: RateRow[];
  calendar: EconomicEvent[];
} {
  const rng = makeRng(20240724);

  const walk = (n: number, base: number, vol: number, lo: number, hi: number): number[] => {
    const out: number[] = [];
    let v = base;
    for (let i = 0; i < n; i++) {
      v += (rng() - 0.5) * vol;
      v = Math.max(lo, Math.min(hi, v));
      out.push(Number(v.toFixed(2)));
    }
    return out;
  };

  const s = {
    gdp: walk(12, 5.0, 0.35, 4.3, 5.6),
    cpi: walk(12, 1.2, 0.4, 0.1, 2.8),
    ppi: walk(12, -1.5, 0.5, -3.2, 0.8),
    pmi: walk(12, 50.4, 0.6, 49.0, 52.0),
    sf: walk(12, 9.0, 0.5, 7.8, 10.5),
    lpr1y: walk(12, 3.35, 0.06, 3.25, 3.5),
    lpr5y: walk(12, 3.85, 0.06, 3.75, 4.0),
    dr007: walk(12, 1.85, 0.08, 1.6, 2.1),
    g10: walk(12, 2.3, 0.06, 2.1, 2.6),
  };

  const toCard = (
    label: string,
    unit: string,
    series: number[],
    category: EngineMacroIndicator['category'],
    valueText?: string,
  ): CoreCard => {
    const trend = analyzeMacroTrend(
      {
        name: label,
        value: series[series.length - 1],
        prevValue: series[series.length - 2],
        date: '2024-07',
        unit,
        category,
      },
      series,
    );
    const d = series[series.length - 1] - series[series.length - 2];
    return {
      label,
      unit,
      valueText: valueText ?? series[series.length - 1].toFixed(2),
      direction: trend.direction,
      deltaText: (d >= 0 ? '+' : '') + d.toFixed(2),
      series,
    };
  };

  const lpr1yLast = s.lpr1y[s.lpr1y.length - 1];
  const lpr5yLast = s.lpr5y[s.lpr5y.length - 1];
  const lprDelta = lpr1yLast - s.lpr1y[s.lpr1y.length - 2];
  const lprTrend = analyzeMacroTrend(
    { name: 'LPR', value: lpr1yLast, prevValue: s.lpr1y[s.lpr1y.length - 2], date: '2024-07', unit: '%', category: 'liquidity' },
    s.lpr1y,
  ).direction;

  const core: CoreCard[] = [
    toCard('GDP 同比', '%', s.gdp, 'growth'),
    toCard('CPI 同比', '%', s.cpi, 'inflation'),
    toCard('PPI 同比', '%', s.ppi, 'inflation'),
    toCard('PMI (制造业)', '', s.pmi, 'growth'),
    toCard('社融存量同比', '%', s.sf, 'liquidity'),
    {
      label: 'LPR (1Y/5Y)',
      unit: '%',
      valueText: `${lpr1yLast.toFixed(2)} / ${lpr5yLast.toFixed(2)}`,
      direction: lprTrend,
      deltaText: (lprDelta >= 0 ? '+' : '') + lprDelta.toFixed(2),
      series: s.lpr1y,
    },
  ];

  // 近 24 个月 CPI vs PPI
  const cpi24 = walk(24, 1.2, 0.4, 0.1, 2.8);
  const ppi24 = walk(24, -1.5, 0.5, -3.2, 0.8);
  const labels = monthLabels(24);
  const trend24 = labels.map((month, i) => ({ month, cpi: cpi24[i], ppi: ppi24[i] }));

  // 利率与流动性
  const rates: RateRow[] = [
    { name: 'LPR 1Y', current: lpr1yLast, change: lprDelta, unit: '%' },
    { name: 'LPR 5Y', current: lpr5yLast, change: lpr5yLast - s.lpr5y[s.lpr5y.length - 2], unit: '%' },
    { name: 'DR007', current: s.dr007[s.dr007.length - 1], change: s.dr007[s.dr007.length - 1] - s.dr007[s.dr007.length - 2], unit: '%' },
    { name: '10年期国债收益率', current: s.g10[s.g10.length - 1], change: s.g10[s.g10.length - 1] - s.g10[s.g10.length - 2], unit: '%' },
  ];

  // 宏观日历：未来 30 天
  const today = new Date();
  const calendar: EconomicEvent[] = EVENT_TEMPLATES.map((tpl, i) => {
    const offset = 1 + Math.floor(rng() * 30);
    const d = new Date(today);
    d.setDate(d.getDate() + offset);
    return {
      id: String(i + 1),
      name: tpl.name,
      date: fmtDate(d),
      country: 'CN' as const,
      importance: tpl.importance,
      previous: tpl.previous,
      forecast: tpl.forecast,
      unit: tpl.unit,
      category: tpl.category,
    };
  }).sort((a, b) => a.date.localeCompare(b.date));

  return { core, trend24, rates, calendar };
}

// ===================== 小组件 =====================

const Sparkline: React.FC<{ data: number[]; color: string; width?: number; height?: number }> = ({
  data, color, width = 130, height = 34,
}) => {
  if (data.length < 2) return null;
  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;
  const step = width / (data.length - 1);
  const points = data
    .map((v, i) => `${(i * step).toFixed(1)},${(height - ((v - min) / range) * (height - 6) - 3).toFixed(1)}`)
    .join(' ');
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`}>
      <polyline points={points} fill="none" stroke={color} strokeWidth={1.5} strokeLinejoin="round" />
    </svg>
  );
};

const DirArrow: React.FC<{ dir: 'up' | 'down' | 'flat' }> = ({ dir }) => {
  if (dir === 'up') return <ArrowUpOutlined style={{ color: UP }} />;
  if (dir === 'down') return <ArrowDownOutlined style={{ color: DOWN }} />;
  return <span style={{ color: '#8c8c8c' }}>—</span>;
};

const Stars: React.FC<{ level: EconomicEvent['importance'] }> = ({ level }) => {
  const n = level === 'high' ? 3 : level === 'medium' ? 2 : 1;
  return <span style={{ color: '#faad14', letterSpacing: 1 }}>{'★'.repeat(n)}{'☆'.repeat(3 - n)}</span>;
};

// ===================== 页面 =====================

const MacroPage: React.FC = () => {
  const [core, setCore] = useState<CoreCard[]>([]);
  const [trend24, setTrend24] = useState<Array<{ month: string; cpi: number; ppi: number }>>([]);
  const [rates, setRates] = useState<RateRow[]>([]);
  const [calendar, setCalendar] = useState<EconomicEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [isDemo, setIsDemo] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetch('/api/macro/overview')
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json();
      })
      .then(() => {
        if (cancelled) return;
        throw new Error('macro data shape unsupported, fallback to demo');
      })
      .catch((err) => {
        if (cancelled) return;
        logger.warn('宏观接口不可用，使用演示数据兜底:', err);
        const data = buildMacroData();
        setCore(data.core);
        setTrend24(data.trend24);
        setRates(data.rates);
        setCalendar(data.calendar);
        setIsDemo(true);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const rateColumns = [
    { title: '指标', dataIndex: 'name', key: 'name' },
    {
      title: '当前值',
      key: 'current',
      render: (_: unknown, r: RateRow) => (
        <Text strong style={{ color: BLUE }}>{r.current.toFixed(2)}{r.unit}</Text>
      ),
    },
    {
      title: '近期变化',
      key: 'change',
      render: (_: unknown, r: RateRow) => {
        const up = r.change >= 0;
        return (
          <span style={{ color: up ? UP : DOWN }}>
            {up ? <ArrowUpOutlined /> : <ArrowDownOutlined />}
            {Math.abs(r.change).toFixed(2)}{r.unit}
          </span>
        );
      },
    },
  ];

  const calColumns = [
    { title: '日期', dataIndex: 'date', key: 'date', width: 110 },
    {
      title: '事件',
      dataIndex: 'name',
      key: 'name',
      render: (val: string) => <Text strong>{val}</Text>,
    },
    {
      title: '重要度',
      dataIndex: 'importance',
      key: 'importance',
      width: 90,
      render: (val: EconomicEvent['importance']) => <Stars level={val} />,
    },
    {
      title: '前值',
      key: 'previous',
      width: 90,
      render: (_: unknown, e: EconomicEvent) =>
        `${e.previous}${e.unit ? ' ' + e.unit : ''}`,
    },
    {
      title: '预期',
      key: 'forecast',
      width: 90,
      render: (_: unknown, e: EconomicEvent) =>
        `${e.forecast}${e.unit ? ' ' + e.unit : ''}`,
    },
  ];

  return (
    <div style={{ padding: 24 }}>
      <Row justify="space-between" align="middle" style={{ marginBottom: 16 }}>
        <Col>
          <Title level={3} style={{ margin: 0 }}>
            <FundOutlined /> 宏观仪表盘
            {isDemo && <Tag color="orange" style={{ marginLeft: 12 }}>演示数据</Tag>}
          </Title>
          <Text type="secondary">中国宏观经济核心指标 · 利率与流动性 · 数据发布日历</Text>
        </Col>
      </Row>

      <Spin spinning={loading}>
        {/* 1. 核心指标卡片区 */}
        <Row gutter={[16, 16]} style={{ marginBottom: 24 }}>
          {core.map((c) => {
            const color = c.direction === 'up' ? UP : c.direction === 'down' ? DOWN : BLUE;
            return (
              <Col xs={12} sm={8} lg={4} key={c.label}>
                <Card size="small" styles={{ body: { padding: 14 } }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <Text type="secondary" style={{ fontSize: 13 }}>{c.label}</Text>
                    <Tag style={{ marginRight: 0, fontSize: 11 }}>{c.unit || '—'}</Tag>
                  </div>
                  <div style={{ fontSize: 22, fontWeight: 600, margin: '6px 0 2px' }}>{c.valueText}</div>
                  <div style={{ fontSize: 12, color, marginBottom: 6 }}>
                    <DirArrow dir={c.direction} /> {c.deltaText}
                    <Text type="secondary" style={{ marginLeft: 4 }}>环比</Text>
                  </div>
                  <Sparkline data={c.series} color={color} />
                </Card>
              </Col>
            );
          })}
        </Row>

        {/* 2. 宏观趋势图：CPI vs PPI 近24个月 */}
        <Card
          title={<span><LineChartOutlined /> CPI vs PPI 同比走势（近24个月）</span>}
          style={{ marginBottom: 24 }}
        >
          <div style={{ width: '100%', height: 320 }}>
            <ResponsiveContainer>
              <LineChart data={trend24} margin={{ top: 8, right: 24, left: 8, bottom: 8 }}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="month" tick={{ fontSize: 12 }} />
                <YAxis tick={{ fontSize: 12 }} tickFormatter={(v: number) => `${v}%`} />
                <Tooltip formatter={(value: unknown) => `${value}%`} />
                <Legend />
                <Line type="monotone" dataKey="cpi" name="CPI 同比" stroke={UP} dot={false} />
                <Line type="monotone" dataKey="ppi" name="PPI 同比" stroke={BLUE} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </Card>

        {/* 3. 利率与流动性 + 4. 宏观日历 */}
        <Row gutter={[16, 16]}>
          <Col xs={24} lg={10}>
            <Card
              title={<span><BankOutlined /> 利率与流动性</span>}
              style={{ marginBottom: 24 }}
            >
              <Table
                dataSource={rates}
                columns={rateColumns}
                rowKey="name"
                pagination={false}
                size="small"
              />
            </Card>
          </Col>
          <Col xs={24} lg={14}>
            <Card
              title={<span><CalendarOutlined /> 宏观日历（未来30天）</span>}
              style={{ marginBottom: 24 }}
            >
              <Table
                dataSource={calendar}
                columns={calColumns}
                rowKey="id"
                pagination={false}
                size="small"
                scroll={{ x: 480 }}
              />
            </Card>
          </Col>
        </Row>
      </Spin>
    </div>
  );
};

export default MacroPage;
