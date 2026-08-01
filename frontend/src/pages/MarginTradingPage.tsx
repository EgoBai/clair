/**
 * 融资融券页面
 * 融资余额走势、融券余量、融资融券排行
 * 参考东方财富融资融券模块
 *
 * 后端 /api/margin/* 暂未就绪：API 失败时注入确定性演示数据兜底
 * （LCG 固定种子，禁用 Math.random，保证刷新结果一致）。
 */

import React, { useState, useEffect } from 'react';
import logger from '../utils/logger';
import {
  Card, Row, Col, Statistic, Table, Radio, Tag, Typography, Spin,
} from 'antd';
import {
  ArrowUpOutlined, ArrowDownOutlined, DollarOutlined, StockOutlined,
} from '@ant-design/icons';
import {
  LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend, CartesianGrid,
} from 'recharts';
import { fetchMarginOverviewTyped, fetchMarginRank } from '../services/api';
import type { MarginOverview, MarginRankEntry } from '../../../shared/types';

const { Title, Text } = Typography;

/** 两融余额趋势（融资/融券），约30个交易日 */
interface MarginRecord {
  tradeDate: string;
  financingBalance: number;
  financingBuyAmount: number;
  financingRepayAmount: number;
  financingNetBuy: number;
  securitiesBalance: number;
  securitiesNetSell: number;
  totalBalance: number;
}

const DEMO_STOCKS = [
  { symbol: '600519', name: '贵州茅台' },
  { symbol: '601318', name: '中国平安' },
  { symbol: '600036', name: '招商银行' },
  { symbol: '000858', name: '五粮液' },
  { symbol: '601012', name: '隆基绿能' },
  { symbol: '300750', name: '宁德时代' },
  { symbol: '600276', name: '恒瑞医药' },
  { symbol: '000333', name: '美的集团' },
  { symbol: '002594', name: '比亚迪' },
  { symbol: '601888', name: '中国中免' },
  { symbol: '600030', name: '中信证券' },
  { symbol: '000651', name: '格力电器' },
  { symbol: '601166', name: '兴业银行' },
  { symbol: '600887', name: '伊利股份' },
  { symbol: '000001', name: '平安银行' },
  { symbol: '002415', name: '海康威视' },
  { symbol: '601398', name: '工商银行' },
  { symbol: '300059', name: '东方财富' },
  { symbol: '600009', name: '上海机场' },
  { symbol: '600000', name: '浦发银行' },
];

/** 线性同余发生器（LCG）：固定种子 → 结果可复现，禁用 Math.random */
function makeRng(seed: number): () => number {
  let s = seed % 2147483647;
  if (s <= 0) s += 2147483646;
  return () => {
    s = (s * 16807) % 2147483647;
    return (s - 1) / 2147483646;
  };
}

function fmtDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** 生成最近 30 个交易日的融资融券余额趋势 */
function buildDemoTrend(rng: () => number): MarginRecord[] {
  const records: MarginRecord[] = [];
  let financingBalance = 1.5e12; // 融资余额 1.5万亿
  let securitiesBalance = 9.2e9; // 融券余量（股）
  const cursor = new Date();
  let added = 0;
  while (added < 30) {
    const dow = cursor.getDay();
    if (dow !== 0 && dow !== 6) {
      const finDelta = (rng() - 0.45) * 4e10;
      financingBalance = Math.max(1.0e12, financingBalance + finDelta);
      const secDelta = (rng() - 0.5) * 5e8;
      securitiesBalance = Math.max(5e9, securitiesBalance + secDelta);
      const financingBuy = 6e10 + rng() * 4e10;
      const financingRepay = Math.max(0, financingBuy - finDelta);
      // 融券余额按 ~10元/股折算为金额，纳入融资融券总余额
      const totalBalance = financingBalance + securitiesBalance * 10;
      records.push({
        tradeDate: fmtDate(cursor),
        financingBalance: Math.round(financingBalance),
        financingBuyAmount: Math.round(financingBuy),
        financingRepayAmount: Math.round(financingRepay),
        financingNetBuy: Math.round(finDelta),
        securitiesBalance: Math.round(securitiesBalance),
        securitiesNetSell: Math.round(secDelta),
        totalBalance: Math.round(totalBalance),
      });
      added++;
    }
    cursor.setDate(cursor.getDate() - 1);
  }
  return records.reverse();
}

/** 生成融资/融券排行（各 18 条） */
function buildDemoRank(rng: () => number): MarginRankEntry[] {
  return DEMO_STOCKS.slice(0, 18).map((stock, i) => ({
    rank: i + 1,
    symbol: stock.symbol,
    name: stock.name,
    financingBalance: Math.round(1e9 + rng() * 9e9),       // 1亿~10亿
    financingChange: Math.round((rng() - 0.5) * 1e9),
    securitiesBalance: Math.round(1e6 + rng() * 9e6),      // 股
    securitiesChange: Math.round((rng() - 0.5) * 1e6),
  }));
}

/** 汇总确定性演示数据：概览 + 趋势 + 融资/融券两类排行 */
function buildDemoMarginData() {
  const rng = makeRng(20240724);
  const trend = buildDemoTrend(rng);
  const financingRank = buildDemoRank(rng).sort((a, b) => b.financingBalance - a.financingBalance)
    .map((e, i) => ({ ...e, rank: i + 1 }));
  const securitiesRank = buildDemoRank(rng).sort((a, b) => b.securitiesBalance - a.securitiesBalance)
    .map((e, i) => ({ ...e, rank: i + 1 }));

  const last = trend[trend.length - 1];
  const overview: MarginOverview = {
    totalFinancingBalance: last.financingBalance,
    totalSecuritiesBalance: last.securitiesBalance,
    financingStockCount: 3200 + Math.floor(rng() * 100),
    securitiesStockCount: 1800 + Math.floor(rng() * 100),
    topFinancingIncrease: [...financingRank]
      .sort((a, b) => b.financingChange - a.financingChange)
      .slice(0, 5)
      .map((e) => ({ symbol: e.symbol, name: e.name, change: e.financingChange })),
    topSecuritiesIncrease: [...securitiesRank]
      .sort((a, b) => b.securitiesChange - a.securitiesChange)
      .slice(0, 5)
      .map((e) => ({ symbol: e.symbol, name: e.name, change: e.securitiesChange })),
  };

  return { overview, trend, financingRank, securitiesRank };
}

const MarginTradingPage: React.FC = () => {
  const [overview, setOverview] = useState<MarginOverview | null>(null);
  const [trend, setTrend] = useState<MarginRecord[]>([]);
  const [financingRank, setFinancingRank] = useState<MarginRankEntry[]>([]);
  const [securitiesRank, setSecuritiesRank] = useState<MarginRankEntry[]>([]);
  const [rankType, setRankType] = useState<string>('financing');
  const [loading, setLoading] = useState(true);

  const rankData = rankType === 'financing' ? financingRank : securitiesRank;

  useEffect(() => {
    loadData();
  }, []);

  useEffect(() => {
    loadRank(rankType);
  }, [rankType]);

  const loadData = async () => {
    setLoading(true);
    try {
      const [overviewRes, rankRes] = await Promise.all([
        fetchMarginOverviewTyped(),
        fetchMarginRank('financing'),
      ]);
      setOverview(overviewRes);
      setFinancingRank(rankRes);
      // 趋势暂无独立市场级 API，优先尝试融资排行推导；失败则走兜底
      if (!rankRes || rankRes.length === 0) throw new Error('empty margin rank');
    } catch (err) {
      logger.error('加载融资融券数据失败（后端未就绪或接口异常），已如实置空:', err);
      // 诚实数据红线：后端不可达时清空展示，绝不回填演示数据
      setOverview(null);
      setTrend([]);
      setFinancingRank([]);
      setSecuritiesRank([]);
    } finally {
      setLoading(false);
    }
  };

  const loadRank = async (type: string) => {
    try {
      const data = await fetchMarginRank(type);
      if (type === 'financing') setFinancingRank(data);
      else setSecuritiesRank(data);
    } catch (err) {
      logger.error('加载排行失败（后端未就绪或接口异常），已如实置空:', err);
      // 诚实数据红线：后端不可达时清空展示，绝不回填演示数据
      setFinancingRank([]);
      setSecuritiesRank([]);
    }
  };

  const rankColumns = [
    { title: '排名', dataIndex: 'rank', key: 'rank', width: 60,
      render: (val: number) => val <= 3
        ? <Tag color={['gold', 'silver', 'bronze'][val - 1]}>{val}</Tag>
        : val },
    { title: '代码', dataIndex: 'symbol', key: 'symbol' },
    { title: '名称', dataIndex: 'name', key: 'name' },
    {
      title: rankType === 'financing' ? '融资余额' : '融券余量',
      dataIndex: rankType === 'financing' ? 'financingBalance' : 'securitiesBalance',
      key: 'balance',
      render: (val: number) => rankType === 'financing'
        ? formatAmount(val) : val.toLocaleString() + ' 股',
    },
    {
      title: '变动',
      dataIndex: rankType === 'financing' ? 'financingChange' : 'securitiesChange',
      key: 'change',
      render: (val: number) => (
        <span style={{ color: val > 0 ? '#cf1322' : '#3f8600' }}>
          {val > 0 ? <ArrowUpOutlined /> : <ArrowDownOutlined />}
          {rankType === 'financing' ? formatAmount(Math.abs(val)) : Math.abs(val).toLocaleString()}
        </span>
      ),
    },
  ];

  return (
    <div style={{ padding: 24 }}>
      <Title level={3}>
        <DollarOutlined /> 融资融券
      </Title>

      <Spin spinning={loading}>
        {/* 概览卡片 */}
        {overview && (
          <Row gutter={16} style={{ marginBottom: 24 }}>
            <Col span={6}>
              <Card>
                <Statistic
                  title="市场融资余额"
                  value={formatAmountShort(overview.totalFinancingBalance)}
                  prefix={<DollarOutlined style={{ color: '#cf1322' }} />}
                  valueStyle={{ color: '#cf1322' }}
                />
              </Card>
            </Col>
            <Col span={6}>
              <Card>
                <Statistic
                  title="市场融券余量"
                  value={formatAmountShort(overview.totalSecuritiesBalance)}
                  prefix={<StockOutlined style={{ color: '#3f8600' }} />}
                  valueStyle={{ color: '#3f8600' }}
                />
              </Card>
            </Col>
            <Col span={6}>
              <Card>
                <Statistic
                  title="融资标的数"
                  value={overview.financingStockCount}
                  suffix="只"
                />
              </Card>
            </Col>
            <Col span={6}>
              <Card>
                <Statistic
                  title="融券标的数"
                  value={overview.securitiesStockCount}
                  suffix="只"
                />
              </Card>
            </Col>
          </Row>
        )}

        {/* 两融余额趋势 */}
        {trend.length > 0 && (
          <Card title="两融余额趋势（近30个交易日）" style={{ marginBottom: 24 }}>
            <div style={{ width: '100%', height: 300 }}>
              <ResponsiveContainer>
                <LineChart data={trend} margin={{ top: 8, right: 24, left: 8, bottom: 8 }}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="tradeDate" tick={{ fontSize: 12 }} />
                  <YAxis
                    tickFormatter={(v: number) => formatAmountShort(v)}
                    tick={{ fontSize: 12 }}
                  />
                  <Tooltip
                    formatter={(value, name) => [
                      name === '融券余量(股)'
                        ? Number(value).toLocaleString() + ' 股'
                        : formatAmount(Number(value)),
                      name as string,
                    ]}
                  />
                  <Legend />
                  <Line
                    type="monotone"
                    dataKey="financingBalance"
                    name="融资余额"
                    stroke="#cf1322"
                    dot={false}
                  />
                  <Line
                    type="monotone"
                    dataKey="securitiesBalance"
                    name="融券余量(股)"
                    stroke="#3f8600"
                    dot={false}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </Card>
        )}

        {/* 排行榜 */}
        <Card title="融资融券排行">
          <Radio.Group
            value={rankType}
            onChange={e => setRankType(e.target.value)}
            style={{ marginBottom: 16 }}
          >
            <Radio.Button value="financing">融资余额排行</Radio.Button>
            <Radio.Button value="securities">融券余量排行</Radio.Button>
          </Radio.Group>

          <Table
            dataSource={rankData}
            columns={rankColumns}
            rowKey="symbol"
            pagination={false}
            size="small"
          />
        </Card>
      </Spin>
    </div>
  );
};

function formatAmount(val: number): string {
  if (val >= 1e12) return (val / 1e12).toFixed(2) + '万亿';
  if (val >= 1e8) return (val / 1e8).toFixed(2) + '亿';
  if (val >= 1e4) return (val / 1e4).toFixed(2) + '万';
  return val.toFixed(2);
}

function formatAmountShort(val: number): string {
  if (val >= 1e12) return (val / 1e12).toFixed(1) + '万亿';
  if (val >= 1e8) return (val / 1e8).toFixed(1) + '亿';
  return val.toLocaleString();
}

export default MarginTradingPage;
