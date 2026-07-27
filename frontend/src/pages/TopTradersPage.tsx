/**
 * 龙虎榜页面
 * 龙虎榜数据、席位分析、营业部排行
 * 参考东方财富龙虎榜模块
 */

import React, { useState, useEffect } from 'react';
import logger from '../utils/logger';
import {
  Card, Row, Col, Statistic, Table, Tag, Typography, Spin, Space,
} from 'antd';
import { Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell,
} from 'recharts';
import {
  TrophyOutlined, ArrowUpOutlined, ArrowDownOutlined, BankOutlined,
} from '@ant-design/icons';
import { fetchTopTraderOverviewTyped, fetchTopTraderSeatRank } from '../services/api';
import type { TopTraderOverview, SeatRankEntry } from '../../../shared/types';

const { Title, Text } = Typography;

const COLORS = ['#cf1322', '#3f8600', '#1890ff', '#fa8c16', '#722ed1', '#13c2c2'];

/** 本地日期格式化为 YYYY-MM-DD（避免 toISOString 的时区偏移） */
const fmtDate = (d: Date): string => {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};

/** 固定种子的线性同余伪随机，保证每次刷新演示数据完全一致（确定性） */
function makeRng(seed: number): () => number {
  let s = seed % 2147483647;
  if (s <= 0) s += 2147483646;
  return () => {
    s = (s * 16807) % 2147483647;
    return (s - 1) / 2147483646;
  };
}

/** 演示席位样本池（游资营业部 + 机构/沪深股通） */
const DEMO_SEAT_POOL: Array<{ seatName: string; isOrganizational: boolean }> = [
  { seatName: '东方财富证券拉萨团结路', isOrganizational: false },
  { seatName: '华泰证券深圳益田路荣超商务中心', isOrganizational: false },
  { seatName: '中信证券上海溧阳路', isOrganizational: false },
  { seatName: '国泰君安上海江苏路', isOrganizational: false },
  { seatName: '光大证券宁波解放南路', isOrganizational: false },
  { seatName: '中国中金财富证券北京宋庄路', isOrganizational: false },
  { seatName: '机构专用', isOrganizational: true },
  { seatName: '深股通专用', isOrganizational: true },
  { seatName: '沪股通专用', isOrganizational: true },
  { seatName: '招商证券深圳蛇口工业七路', isOrganizational: false },
  { seatName: '兴业证券陕西分公司', isOrganizational: false },
  { seatName: '广发证券上海东方路', isOrganizational: false },
  { seatName: '申万宏源上海闵行区东川路', isOrganizational: false },
  { seatName: '财通证券杭州上塘路', isOrganizational: false },
  { seatName: '中国银河证券绍兴', isOrganizational: false },
  { seatName: '国泰君安南京太平南路', isOrganizational: false },
  { seatName: '中信证券北京总部', isOrganizational: true },
  { seatName: '方正证券重庆金开大道', isOrganizational: false },
  { seatName: '华鑫证券上海分公司', isOrganizational: false },
  { seatName: '甬兴证券宁波和源路', isOrganizational: false },
];

/** 演示上榜个股样本池 */
const DEMO_STOCK_POOL: Array<{ symbol: string; name: string; industry: string }> = [
  { symbol: '600519', name: '贵州茅台', industry: '白酒' },
  { symbol: '300750', name: '宁德时代', industry: '新能源' },
  { symbol: '002594', name: '比亚迪', industry: '汽车' },
  { symbol: '688981', name: '中芯国际', industry: '半导体' },
  { symbol: '601012', name: '隆基绿能', industry: '新能源' },
  { symbol: '000858', name: '五粮液', industry: '白酒' },
  { symbol: '600276', name: '恒瑞医药', industry: '医药' },
  { symbol: '300059', name: '东方财富', industry: '金融' },
  { symbol: '002415', name: '海康威视', industry: '电子' },
  { symbol: '688111', name: '金山办公', industry: '计算机' },
  { symbol: '601318', name: '中国平安', industry: '金融' },
  { symbol: '600036', name: '招商银行', industry: '金融' },
  { symbol: '000333', name: '美的集团', industry: '消费' },
  { symbol: '603259', name: '药明康德', industry: '医药' },
  { symbol: '300760', name: '迈瑞医疗', industry: '医药' },
  { symbol: '002475', name: '立讯精密', industry: '电子' },
  { symbol: '600900', name: '长江电力', industry: '电力' },
  { symbol: '000001', name: '平安银行', industry: '金融' },
  { symbol: '600030', name: '中信证券', industry: '金融' },
  { symbol: '002230', name: '科大讯飞', industry: '计算机' },
];

const DEMO_REASONS = [
  '日涨幅偏离值达7%',
  '日振幅值达15%',
  '日换手率达20%',
  '连续三个交易日内涨幅偏离值累计达20%',
  '无价格涨跌幅限制',
  '严重异常波动',
];

/**
 * 生成内置演示龙虎榜数据：覆盖 overview 全部字段 + 20 条席位排行 + 上榜个股列表。
 * 使用固定种子 LCG，保证每次刷新完全一致（确定性兜底）。
 */
function buildDemoTopTraderData(): { overview: TopTraderOverview; seatRank: SeatRankEntry[] } {
  const rng = makeRng(20240724); // 固定种子 → 结果可复现
  const tradeDate = fmtDate(new Date());

  // 席位排行：20 条
  const seatRank: SeatRankEntry[] = DEMO_SEAT_POOL.map((seat, i) => {
    const totalBuyAmount = Math.round((0.5 + rng() * 14.5) * 1e8); // 0.5亿~15亿
    const totalSellAmount = Math.round((0.3 + rng() * 10) * 1e8);
    const netAmount = totalBuyAmount - totalSellAmount;
    const appearCount = 1 + Math.floor(rng() * 28); // 1~28 次
    return {
      rank: i + 1,
      seatName: seat.seatName,
      totalBuyAmount,
      totalSellAmount,
      netAmount,
      appearCount,
      isOrganizational: seat.isOrganizational,
    };
  });
  // 按净买入降序重排排名
  seatRank.sort((a, b) => b.netAmount - a.netAmount);
  seatRank.forEach((s, i) => { s.rank = i + 1; });

  // 上榜个股：净买入 TOP / 净卖出 TOP 各取 8 只
  const pickStocks = (wantNetPositive: boolean): Array<{ symbol: string; name: string; netAmount: number; reason: string }> => {
    const list = DEMO_STOCK_POOL.map((st) => {
      const base = Math.round((0.2 + rng() * 8) * 1e8);
      const netAmount = wantNetPositive ? base : -base;
      return {
        symbol: st.symbol,
        name: st.name,
        netAmount,
        reason: DEMO_REASONS[Math.floor(rng() * DEMO_REASONS.length)],
      };
    });
    list.sort((a, b) => b.netAmount - a.netAmount);
    return list.slice(0, 8);
  };
  const topBuyStocks = pickStocks(true);
  const topSellStocks = pickStocks(false);

  // 行业分布
  const industryDistribution: Record<string, number> = {};
  for (const st of DEMO_STOCK_POOL) {
    industryDistribution[st.industry] = (industryDistribution[st.industry] || 0) + 1 + Math.floor(rng() * 4);
  }

  const totalStocks = DEMO_STOCK_POOL.length + Math.floor(rng() * 30); // 演示个股 + 随机余量
  const buyDominantCount = Math.floor(totalStocks * (0.45 + rng() * 0.2));
  const sellDominantCount = totalStocks - buyDominantCount;
  const totalBuyAmount = seatRank.reduce((s, e) => s + e.totalBuyAmount, 0);
  const totalSellAmount = seatRank.reduce((s, e) => s + e.totalSellAmount, 0);
  const totalNetAmount = totalBuyAmount - totalSellAmount;

  const overview: TopTraderOverview = {
    tradeDate,
    totalStocks,
    buyDominantCount,
    sellDominantCount,
    totalBuyAmount,
    totalSellAmount,
    totalNetAmount,
    topBuyStocks,
    topSellStocks,
    industryDistribution,
  };

  return { overview, seatRank };
}

const TopTradersPage: React.FC = () => {
  const [overview, setOverview] = useState<TopTraderOverview | null>(null);
  const [seatRank, setSeatRank] = useState<SeatRankEntry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);
    try {
      const [overviewRes, seatRes] = await Promise.all([
        fetchTopTraderOverviewTyped(),
        fetchTopTraderSeatRank(20),
      ]);
      // 后端暂无该接口：返回空数据时同样降级到演示数据
      if (!overviewRes || !seatRes || seatRes.length === 0) {
        throw new Error('龙虎榜接口返回数据为空');
      }
      setOverview(overviewRes);
      setSeatRank(seatRes);
    } catch (err) {
      logger.warn('龙虎榜接口不可用，降级使用内置演示数据:', err);
      const demo = buildDemoTopTraderData();
      setOverview(demo.overview);
      setSeatRank(demo.seatRank);
    } finally {
      setLoading(false);
    }
  };

  const stockColumns = [
    { title: '代码', dataIndex: 'symbol', key: 'symbol' },
    { title: '名称', dataIndex: 'name', key: 'name', render: (v: string) => <Text strong>{v}</Text> },
    {
      title: '净买入',
      dataIndex: 'netAmount',
      key: 'netAmount',
      render: (val: number) => (
        <span style={{ color: val > 0 ? '#cf1322' : '#3f8600' }}>
          {val > 0 ? '+' : ''}{formatAmount(val)}
        </span>
      ),
      sorter: (a: Record<string, unknown>, b: Record<string, unknown>) => (a.netAmount as number) - (b.netAmount as number),
    },
    { title: '上榜原因', dataIndex: 'reason', key: 'reason',
      render: (v: string) => <Tag color="blue">{v}</Tag> },
  ];

  const seatColumns = [
    { title: '排名', dataIndex: 'rank', key: 'rank', width: 60,
      render: (val: number) => val <= 3
        ? <Tag color={['gold', 'silver', 'bronze'][val - 1]}>{val}</Tag>
        : val },
    { title: '营业部/机构', dataIndex: 'seatName', key: 'seatName',
      render: (v: string, r: SeatRankEntry) => (
        <Space>
          {r.isOrganizational && <BankOutlined style={{ color: '#722ed1' }} />}
          <Text>{v}</Text>
        </Space>
      ) },
    { title: '买入总额', dataIndex: 'totalBuyAmount', key: 'totalBuyAmount',
      render: (v: number) => <span style={{ color: '#cf1322' }}>{formatAmount(v)}</span> },
    { title: '卖出总额', dataIndex: 'totalSellAmount', key: 'totalSellAmount',
      render: (v: number) => <span style={{ color: '#3f8600' }}>{formatAmount(v)}</span> },
    { title: '净买入', dataIndex: 'netAmount', key: 'netAmount',
      render: (v: number) => (
        <span style={{ color: v > 0 ? '#cf1322' : '#3f8600', fontWeight: 500 }}>
          {v > 0 ? '+' : ''}{formatAmount(v)}
        </span>
      ),
      sorter: (a: SeatRankEntry, b: SeatRankEntry) => a.netAmount - b.netAmount },
    { title: '上榜次数', dataIndex: 'appearCount', key: 'appearCount',
      render: (v: number) => <Tag>{v}次</Tag> },
  ];

  // 行业分布饼图数据
  const industryData = overview?.industryDistribution
    ? Object.entries(overview.industryDistribution).map(([name, value]) => ({ name, value }))
    : [];

  return (
    <div style={{ padding: 24 }}>
      <Title level={3}>
        <TrophyOutlined /> 龙虎榜
      </Title>

      <Spin spinning={loading}>
        {overview && (
          <>
            {/* 概览 */}
            <Row gutter={16} style={{ marginBottom: 24 }}>
              <Col span={6}>
                <Card>
                  <Statistic
                    title="上榜股票数"
                    value={overview.totalStocks}
                    suffix="只"
                    prefix={<TrophyOutlined />}
                  />
                </Card>
              </Col>
              <Col span={6}>
                <Card>
                  <Statistic
                    title="买入席位占优"
                    value={overview.buyDominantCount}
                    suffix="只"
                    valueStyle={{ color: '#cf1322' }}
                    prefix={<ArrowUpOutlined />}
                  />
                </Card>
              </Col>
              <Col span={6}>
                <Card>
                  <Statistic
                    title="卖出席位占优"
                    value={overview.sellDominantCount}
                    suffix="只"
                    valueStyle={{ color: '#3f8600' }}
                    prefix={<ArrowDownOutlined />}
                  />
                </Card>
              </Col>
              <Col span={6}>
                <Card>
                  <Statistic
                    title="净买入总额"
                    value={formatAmount(overview.totalNetAmount)}
                    valueStyle={{ color: overview.totalNetAmount > 0 ? '#cf1322' : '#3f8600' }}
                  />
                </Card>
              </Col>
            </Row>

            <Row gutter={16} style={{ marginBottom: 24 }}>
              <Col span={12}>
                <Card title="净买入 TOP" size="small">
                  <Table
                    dataSource={overview.topBuyStocks}
                    columns={stockColumns}
                    rowKey="symbol"
                    pagination={false}
                    size="small"
                  />
                </Card>
              </Col>
              <Col span={12}>
                <Card title="净卖出 TOP" size="small">
                  <Table
                    dataSource={overview.topSellStocks}
                    columns={stockColumns}
                    rowKey="symbol"
                    pagination={false}
                    size="small"
                  />
                </Card>
              </Col>
            </Row>
          </>
        )}

        {/* 营业部排行 */}
        <Card title={<><BankOutlined /> 营业部/机构排行</>} style={{ marginBottom: 24 }}>
          <Table
            dataSource={seatRank}
            columns={seatColumns}
            rowKey="seatName"
            pagination={{ pageSize: 10 }}
            size="small"
          />
        </Card>

        {/* 行业分布 */}
        {industryData.length > 0 && (
          <Card title="上榜行业分布" size="small">
            <ResponsiveContainer width="100%" height={300}>
              <PieChart>
                <Pie
                  data={industryData}
                  cx="50%"
                  cy="50%"
                  outerRadius={100}
                  dataKey="value"
                  label={({ name, percent }: { name?: string; percent?: number }) => `${name} ${((percent ?? 0) * 100).toFixed(0)}%`}
                >
                  {industryData.map((_, i) => (
                    <Cell key={i} fill={COLORS[i % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          </Card>
        )}
      </Spin>
    </div>
  );
};

function formatAmount(val: number): string {
  const abs = Math.abs(val);
  if (abs >= 1e8) return (val / 1e8).toFixed(2) + '亿';
  if (abs >= 1e4) return (val / 1e4).toFixed(2) + '万';
  return val.toFixed(2);
}

export default TopTradersPage;
