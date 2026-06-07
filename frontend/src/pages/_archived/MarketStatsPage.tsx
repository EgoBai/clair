/**
 * 市场统计总览页面
 * 涨跌分布、板块热度、市场宽度、情绪指标
 */

import React, { useState, useEffect } from 'react';
import {
  Card,
  Row,
  Col,
  Statistic,
  Progress,
  Table,
  Tag,
  Space,
  Spin,
  Radio,
  Tooltip,
  Badge,
  Segmented,
} from 'antd';
import {
  ArrowUpOutlined,
  ArrowDownOutlined,
  FireOutlined,
  ThunderboltOutlined,
  DashboardOutlined,
  HeartOutlined,
  RiseOutlined,
  FallOutlined,
} from '@ant-design/icons';

interface DistributionRange {
  label: string;
  min: number;
  max: number;
  count: number;
  color: string;
}

interface SectorHeat {
  name: string;
  changePercent: number;
  turnover: number;
  stockCount: number;
  leading: string;
  heatScore: number;
  phase: string;
}

interface MarketBreadth {
  advancing: number;
  declining: number;
  unchanged: number;
  adRatio: number;
  newHighs: number;
  newLows: number;
  aboveMA20: number;
  aboveMA60: number;
  aboveMA120: number;
  mcclellan: number;
  armsIndex: number;
}

interface MarketSentiment {
  greedFearIndex: number;
  vixEquivalent: number;
  marginBalance: number;
  marginChange: number;
  northboundFlow: number;
  northbound5d: number;
  limitUpCount: number;
  limitDownCount: number;
  mood: string;
}

const MarketStatsPage: React.FC = () => {
  const [loading, setLoading] = useState(true);
  const [distribution, setDistribution] = useState<{
    ranges: DistributionRange[];
    summary: { rising: number; falling: number; limitUp: number; limitDown: number };
  } | null>(null);
  const [sectors, setSectors] = useState<SectorHeat[]>([]);
  const [breadth, setBreadth] = useState<MarketBreadth | null>(null);
  const [sentiment, setSentiment] = useState<MarketSentiment | null>(null);
  const [activeTab, setActiveTab] = useState<string>('distribution');

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);
    try {
      // 模拟数据加载
      await new Promise(r => setTimeout(r, 500));

      // 涨跌分布
      const distRanges: DistributionRange[] = [
        { label: '涨停', min: 9.9, max: 10.1, count: 25, color: '#dc2626' },
        { label: '涨幅>7%', min: 7, max: 9.9, count: 42, color: '#ef4444' },
        { label: '涨幅5-7%', min: 5, max: 7, count: 68, color: '#f87171' },
        { label: '涨幅3-5%', min: 3, max: 5, count: 125, color: '#fca5a5' },
        { label: '涨幅1-3%', min: 1, max: 3, count: 285, color: '#fecaca' },
        { label: '涨幅0-1%', min: 0, max: 1, count: 420, color: '#fee2e2' },
        { label: '平盘', min: -0.01, max: 0.01, count: 85, color: '#9ca3af' },
        { label: '跌幅0-1%', min: -1, max: 0, count: 380, color: '#d1fae5' },
        { label: '跌幅1-3%', min: -3, max: -1, count: 265, color: '#a7f3d0' },
        { label: '跌幅3-5%', min: -5, max: -3, count: 115, color: '#6ee7b7' },
        { label: '跌幅5-7%', min: -7, max: -5, count: 52, color: '#34d399' },
        { label: '跌幅>7%', min: -10.1, max: -7, count: 28, color: '#10b981' },
        { label: '跌停', min: -10.1, max: -9.9, count: 10, color: '#059669' },
      ];

      setDistribution({
        ranges: distRanges,
        summary: {
          rising: distRanges.filter(r => r.min > 0).reduce((s, r) => s + r.count, 0),
          falling: distRanges.filter(r => r.max <= 0 && r.min < -0.01).reduce((s, r) => s + r.count, 0),
          limitUp: 25,
          limitDown: 10,
        },
      });

      // 板块热度
      setSectors([
        { name: '人工智能', changePercent: 3.5, turnover: 850e8, stockCount: 128, leading: '科大讯飞', heatScore: 95, phase: '主升' },
        { name: '半导体', changePercent: 2.8, turnover: 720e8, stockCount: 95, leading: '中芯国际', heatScore: 88, phase: '主升' },
        { name: '新能源车', changePercent: 2.1, turnover: 650e8, stockCount: 82, leading: '比亚迪', heatScore: 82, phase: '主升' },
        { name: '白酒', changePercent: 1.5, turnover: 480e8, stockCount: 20, leading: '贵州茅台', heatScore: 75, phase: '吸筹' },
        { name: '医药生物', changePercent: 0.8, turnover: 520e8, stockCount: 156, leading: '恒瑞医药', heatScore: 70, phase: '吸筹' },
        { name: '银行', changePercent: 0.3, turnover: 380e8, stockCount: 42, leading: '工商银行', heatScore: 55, phase: '吸筹' },
        { name: '房地产', changePercent: -0.5, turnover: 280e8, stockCount: 112, leading: '万科A', heatScore: 40, phase: '派发' },
        { name: '钢铁', changePercent: -1.2, turnover: 150e8, stockCount: 35, leading: '宝钢股份', heatScore: 30, phase: '下跌' },
      ]);

      // 市场宽度
      setBreadth({
        advancing: 2450,
        declining: 2180,
        unchanged: 570,
        adRatio: 1.12,
        newHighs: 35,
        newLows: 12,
        aboveMA20: 2850,
        aboveMA60: 2100,
        aboveMA120: 1650,
        mcclellan: 270,
        armsIndex: 0.95,
      });

      // 情绪指标
      setSentiment({
        greedFearIndex: 55,
        vixEquivalent: 22.5,
        marginBalance: 16500,
        marginChange: 85,
        northboundFlow: 28.5,
        northbound5d: 120,
        limitUpCount: 25,
        limitDownCount: 10,
        mood: 'neutral',
      });
    } finally {
      setLoading(false);
    }
  };

  const getSentimentColor = (index: number) => {
    if (index >= 75) return '#dc2626';
    if (index >= 55) return '#f97316';
    if (index >= 45) return '#eab308';
    if (index >= 25) return '#22c55e';
    return '#16a34a';
  };

  const getSentimentLabel = (index: number) => {
    if (index >= 75) return '极度贪婪';
    if (index >= 55) return '贪婪';
    if (index >= 45) return '中性';
    if (index >= 25) return '恐惧';
    return '极度恐惧';
  };

  const maxCount = distribution ? Math.max(...distribution.ranges.map(r => r.count)) : 1;

  const sectorColumns = [
    {
      title: '排名',
      key: 'rank',
      width: 60,
      render: (_: unknown, __: unknown, index: number) => {
        if (index === 0) return <Tag color="gold">🥇</Tag>;
        if (index === 1) return <Tag color="silver">🥈</Tag>;
        if (index === 2) return <Tag color="bronze">🥉</Tag>;
        return index + 1;
      },
    },
    { title: '板块', dataIndex: 'name', key: 'name', render: (v: string) => <strong>{v}</strong> },
    {
      title: '涨跌幅',
      dataIndex: 'changePercent',
      key: 'changePercent',
      sorter: (a: SectorHeat, b: SectorHeat) => a.changePercent - b.changePercent,
      render: (v: number) => (
        <span style={{ color: v >= 0 ? '#ef4444' : '#22c55e', fontWeight: 600 }}>
          {v >= 0 ? '+' : ''}{v.toFixed(2)}%
        </span>
      ),
    },
    {
      title: '成交额',
      dataIndex: 'turnover',
      key: 'turnover',
      render: (v: number) => `${(v / 1e8).toFixed(0)}亿`,
    },
    { title: '成分股数', dataIndex: 'stockCount', key: 'stockCount' },
    {
      title: '阶段',
      dataIndex: 'phase',
      key: 'phase',
      render: (v: string) => {
        const colors: Record<string, string> = { '主升': 'red', '吸筹': 'blue', '派发': 'orange', '下跌': 'green' };
        const icons: Record<string, string> = { '主升': '🔥', '吸筹': '💎', '派发': '⚠️', '下跌': '📉' };
        return <Tag color={colors[v]}>{icons[v]} {v}</Tag>;
      },
    },
    {
      title: '热度',
      dataIndex: 'heatScore',
      key: 'heatScore',
      sorter: (a: SectorHeat, b: SectorHeat) => a.heatScore - b.heatScore,
      render: (v: number) => (
        <Progress
          percent={v}
          size="small"
          strokeColor={v >= 80 ? '#ef4444' : v >= 60 ? '#f97316' : '#3b82f6'}
          format={() => v}
        />
      ),
    },
  ];

  if (loading) {
    return (
      <div style={{ textAlign: 'center', padding: '100px 0' }}>
        <Spin size="large" />
      </div>
    );
  }

  return (
    <div style={{ padding: '24px' }}>
      <Row gutter={[16, 16]}>
        {/* 核心指标卡片 */}
        <Col span={6}>
          <Card>
            <Statistic
              title="上涨家数"
              value={distribution?.summary.rising}
              prefix={<ArrowUpOutlined style={{ color: '#ef4444' }} />}
              valueStyle={{ color: '#ef4444' }}
            />
          </Card>
        </Col>
        <Col span={6}>
          <Card>
            <Statistic
              title="下跌家数"
              value={distribution?.summary.falling}
              prefix={<ArrowDownOutlined style={{ color: '#22c55e' }} />}
              valueStyle={{ color: '#22c55e' }}
            />
          </Card>
        </Col>
        <Col span={6}>
          <Card>
            <Statistic
              title="涨停家数"
              value={distribution?.summary.limitUp}
              prefix={<RiseOutlined style={{ color: '#dc2626' }} />}
              valueStyle={{ color: '#dc2626' }}
            />
          </Card>
        </Col>
        <Col span={6}>
          <Card>
            <Statistic
              title="跌停家数"
              value={distribution?.summary.limitDown}
              prefix={<FallOutlined style={{ color: '#059669' }} />}
              valueStyle={{ color: '#059669' }}
            />
          </Card>
        </Col>

        {/* 涨跌分布 */}
        <Col span={24}>
          <Card
            title={<><FireOutlined /> 涨跌分布</>}
            extra={
              <Badge
                color={breadth && breadth.adRatio >= 1 ? '#ef4444' : '#22c55e'}
                text={`涨跌比: ${breadth?.adRatio}`}
              />
            }
          >
            {distribution && (
              <div>
                {distribution.ranges.map((range, i) => (
                  <div key={i} style={{ display: 'flex', alignItems: 'center', marginBottom: 4 }}>
                    <span style={{ width: 80, fontSize: 12, textAlign: 'right', marginRight: 8 }}>
                      {range.label}
                    </span>
                    <Progress
                      percent={Math.round((range.count / maxCount) * 100)}
                      strokeColor={range.color}
                      showInfo={false}
                      style={{ flex: 1 }}
                    />
                    <span style={{ width: 50, textAlign: 'right', fontSize: 12, marginLeft: 8 }}>
                      {range.count}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </Col>

        {/* 板块热度 */}
        <Col span={16}>
          <Card
            title={<><ThunderboltOutlined /> 板块热度排行</>}
            extra={<span style={{ color: '#999' }}>按热度评分排序</span>}
          >
            <Table
              dataSource={sectors}
              columns={sectorColumns}
              rowKey="name"
              pagination={false}
              size="small"
            />
          </Card>
        </Col>

        {/* 市场情绪 */}
        <Col span={8}>
          <Card title={<><HeartOutlined /> 市场情绪</>}>
            {sentiment && (
              <Space direction="vertical" style={{ width: '100%' }} size="large">
                <div style={{ textAlign: 'center' }}>
                  <div style={{ fontSize: 14, color: '#666', marginBottom: 8 }}>贪婪恐惧指数</div>
                  <Progress
                    type="dashboard"
                    percent={sentiment.greedFearIndex}
                    strokeColor={getSentimentColor(sentiment.greedFearIndex)}
                    format={(v) => (
                      <div>
                        <div style={{ fontSize: 24, fontWeight: 700 }}>{v}</div>
                        <div style={{ fontSize: 12, color: '#666' }}>
                          {getSentimentLabel(v || 0)}
                        </div>
                      </div>
                    )}
                  />
                </div>
                <Row gutter={[8, 8]}>
                  <Col span={12}>
                    <Statistic
                      title="融资余额(亿)"
                      value={sentiment.marginBalance}
                      precision={0}
                      valueStyle={{ fontSize: 14 }}
                    />
                  </Col>
                  <Col span={12}>
                    <Statistic
                      title="北向净流入(亿)"
                      value={sentiment.northboundFlow}
                      precision={1}
                      valueStyle={{
                        fontSize: 14,
                        color: sentiment.northboundFlow >= 0 ? '#ef4444' : '#22c55e',
                      }}
                      prefix={sentiment.northboundFlow >= 0 ? <ArrowUpOutlined /> : <ArrowDownOutlined />}
                    />
                  </Col>
                  <Col span={12}>
                    <Statistic
                      title="涨跌停比"
                      value={`${sentiment.limitUpCount}:${sentiment.limitDownCount}`}
                      valueStyle={{ fontSize: 14 }}
                    />
                  </Col>
                  <Col span={12}>
                    <Statistic
                      title="波动率指数"
                      value={sentiment.vixEquivalent}
                      precision={1}
                      valueStyle={{ fontSize: 14 }}
                    />
                  </Col>
                </Row>
              </Space>
            )}
          </Card>
        </Col>

        {/* 市场宽度 */}
        {breadth && (
          <Col span={24}>
            <Card title={<><DashboardOutlined /> 市场宽度指标</>}>
              <Row gutter={[16, 16]}>
                <Col span={4}>
                  <Card size="small">
                    <Statistic title="上涨" value={breadth.advancing} valueStyle={{ color: '#ef4444', fontSize: 16 }} />
                  </Card>
                </Col>
                <Col span={4}>
                  <Card size="small">
                    <Statistic title="下跌" value={breadth.declining} valueStyle={{ color: '#22c55e', fontSize: 16 }} />
                  </Card>
                </Col>
                <Col span={4}>
                  <Card size="small">
                    <Statistic title="创新高" value={breadth.newHighs} valueStyle={{ color: '#dc2626', fontSize: 16 }} />
                  </Card>
                </Col>
                <Col span={4}>
                  <Card size="small">
                    <Statistic title="创新低" value={breadth.newLows} valueStyle={{ color: '#16a34a', fontSize: 16 }} />
                  </Card>
                </Col>
                <Col span={4}>
                  <Card size="small">
                    <Statistic title="站上20日线" value={breadth.aboveMA20} valueStyle={{ fontSize: 16 }} />
                    <Progress percent={Math.round((breadth.aboveMA20 / 5200) * 100)} size="small" strokeColor="#3b82f6" />
                  </Card>
                </Col>
                <Col span={4}>
                  <Card size="small">
                    <Statistic title="McClellan" value={breadth.mcclellan} valueStyle={{ fontSize: 16, color: breadth.mcclellan >= 0 ? '#ef4444' : '#22c55e' }} />
                  </Card>
                </Col>
              </Row>
            </Card>
          </Col>
        )}
      </Row>
    </div>
  );
};

export default MarketStatsPage;
