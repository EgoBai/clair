/**
 * AI 智能选股页面
 * 参考同花顺i问财智能选股
 */

import React, { useState, useEffect, useCallback } from 'react';
import {
  Card, Row, Col, Typography, Tag, Space, Button, Segmented, Table,
  Progress, Tooltip, Statistic, Divider, Badge, Spin,
} from 'antd';
import {
  RobotOutlined, ThunderboltOutlined, RiseOutlined, FallOutlined,
  LineChartOutlined, FireOutlined, BulbOutlined, WarningOutlined,
  ReloadOutlined, CheckCircleOutlined,
} from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';

const { Title, Text, Paragraph } = Typography;

interface StockRecommendation {
  symbol: string;
  name: string;
  score: number;
  reason: string;
  price: number;
  changePercent: number;
}

interface StrategyRecommendation {
  strategy: string;
  name: string;
  description: string;
  stocks: StockRecommendation[];
}

interface SectorRotation {
  name: string;
  code: string;
  phase: string;
  momentum: number;
  trend: string;
}

const AIStockSelectionPage: React.FC = () => {
  const [recommendations, setRecommendations] = useState<StrategyRecommendation[]>([]);
  const [sectorRotation, setSectorRotation] = useState<{
    sectors: SectorRotation[];
    hotSectors: string[];
    watchSectors: string[];
    avoidSectors: string[];
    rotationSignal: string;
  } | null>(null);
  const [alertSuggestions, setAlertSuggestions] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [activeStrategy, setActiveStrategy] = useState<string>('all');

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [recRes, rotRes, alertRes] = await Promise.all([
        fetch('/api/ai/recommendations'),
        fetch('/api/ai/sector-rotation'),
        fetch('/api/ai/alert-suggestions'),
      ]);

      const [recJson, rotJson, alertJson] = await Promise.all([
        recRes.json(),
        rotRes.json(),
        alertRes.json(),
      ]);

      if (recJson.success) setRecommendations(recJson.data.recommendations);
      if (rotJson.success) setSectorRotation(rotJson.data);
      if (alertJson.success) setAlertSuggestions(alertJson.data.suggestions);
    } catch (err) {
      console.error('加载AI选股数据失败:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  const strategyIcons: Record<string, React.ReactNode> = {
    value: <BulbOutlined />,
    growth: <RiseOutlined />,
    technical: <LineChartOutlined />,
    momentum: <ThunderboltOutlined />,
    contrarian: <FallOutlined />,
  };

  const strategyColors: Record<string, string> = {
    value: '#52c41a',
    growth: '#1890ff',
    technical: '#722ed1',
    momentum: '#fa8c16',
    contrarian: '#13c2c2',
  };

  const phaseConfig: Record<string, { color: string; label: string }> = {
    '主升': { color: '#cf1322', label: '🔥 主升' },
    '吸筹': { color: '#1890ff', label: '💎 吸筹' },
    '派发': { color: '#fa8c16', label: '⚠️ 派发' },
    '下跌': { color: '#999', label: '📉 下跌' },
  };

  const stockColumns: ColumnsType<StockRecommendation> = [
    {
      title: '排名',
      key: 'rank',
      width: 60,
      render: (_: any, __: any, idx: number) => (
        <Tag color={['#FFD700', '#C0C0C0', '#CD7F32'][idx] || 'default'}>{idx + 1}</Tag>
      ),
    },
    {
      title: '股票',
      key: 'stock',
      width: 140,
      render: (_, r) => (
        <Space direction="vertical" size={0}>
          <a href={`/stock/${r.symbol}`} style={{ fontWeight: 600 }}>{r.name}</a>
          <Text type="secondary" style={{ fontSize: 12 }}>{r.symbol}</Text>
        </Space>
      ),
    },
    {
      title: '推荐评分',
      dataIndex: 'score',
      width: 140,
      render: (val: number) => (
        <Space>
          <Progress
            percent={val}
            size="small"
            strokeColor={val >= 90 ? '#52c41a' : val >= 80 ? '#1890ff' : '#fa8c16'}
            style={{ width: 80 }}
          />
          <Text strong>{val}</Text>
        </Space>
      ),
      sorter: (a, b) => b.score - a.score,
    },
    {
      title: '现价',
      dataIndex: 'price',
      width: 80,
      render: (val: number) => val.toFixed(2),
    },
    {
      title: '涨跌幅',
      dataIndex: 'changePercent',
      width: 90,
      render: (val: number) => {
        const color = val > 0 ? '#cf1322' : val < 0 ? '#3f8600' : '#999';
        const prefix = val > 0 ? '+' : '';
        return <Text style={{ color }}>{prefix}{val.toFixed(2)}%</Text>;
      },
    },
    {
      title: '推荐理由',
      dataIndex: 'reason',
      ellipsis: { showTitle: false },
      render: (val: string) => <Tooltip title={val}><Text>{val}</Text></Tooltip>,
    },
  ];

  const filteredRecs = activeStrategy === 'all'
    ? recommendations
    : recommendations.filter(r => r.strategy === activeStrategy);

  return (
    <div style={{ padding: 24 }}>
      <Row justify="space-between" align="middle" style={{ marginBottom: 16 }}>
        <Col>
          <Title level={4} style={{ margin: 0 }}>
            <RobotOutlined /> AI 智能选股
          </Title>
        </Col>
        <Col>
          <Button icon={<ReloadOutlined />} onClick={fetchData} loading={loading}>刷新</Button>
        </Col>
      </Row>

      {/* 行业轮动信号 */}
      {sectorRotation && (
        <Card
          size="small"
          style={{ marginBottom: 16, borderColor: '#1890ff' }}
          title={<><FireOutlined /> 行业轮动信号</>}
        >
          <Paragraph style={{ marginBottom: 8, color: '#1890ff', fontWeight: 600 }}>
            {sectorRotation.rotationSignal}
          </Paragraph>
          <Row gutter={16}>
            <Col>
              <Text type="secondary">🔥 热门板块：</Text>
              {sectorRotation.hotSectors.map(s => (
                <Tag key={s} color="red">{s}</Tag>
              ))}
            </Col>
            <Col>
              <Text type="secondary">💎 关注板块：</Text>
              {sectorRotation.watchSectors.map(s => (
                <Tag key={s} color="blue">{s}</Tag>
              ))}
            </Col>
            <Col>
              <Text type="secondary">⚠️ 回避板块：</Text>
              {sectorRotation.avoidSectors.map(s => (
                <Tag key={s} color="default">{s}</Tag>
              ))}
            </Col>
          </Row>

          <Divider style={{ margin: '12px 0' }} />

          {/* 行业动量排名 */}
          <Row gutter={[8, 8]}>
            {sectorRotation.sectors.slice(0, 10).map(s => (
              <Col key={s.code} xs={12} sm={8} md={6} lg={4}>
                <Card size="small" hoverable style={{ textAlign: 'center' }}>
                  <div style={{ fontWeight: 600, marginBottom: 4 }}>{s.name}</div>
                  <Tag color={phaseConfig[s.phase]?.color}>{phaseConfig[s.phase]?.label}</Tag>
                  <div style={{ marginTop: 4 }}>
                    <Progress
                      percent={s.momentum}
                      size="small"
                      strokeColor={s.momentum > 80 ? '#cf1322' : s.momentum > 60 ? '#1890ff' : '#999'}
                      format={() => `动量${s.momentum}`}
                    />
                  </div>
                  <Tag color={s.trend === '流入' ? 'green' : s.trend === '流出' ? 'red' : 'default'}>
                    {s.trend}
                  </Tag>
                </Card>
              </Col>
            ))}
          </Row>
        </Card>
      )}

      {/* 策略选择 */}
      <Segmented
        options={[
          { label: '全部策略', value: 'all' },
          { label: '💰 价值投资', value: 'value' },
          { label: '📈 成长突破', value: 'growth' },
          { label: '📊 技术形态', value: 'technical' },
          { label: '🚀 动量追踪', value: 'momentum' },
          { label: '🔄 逆向布局', value: 'contrarian' },
        ]}
        value={activeStrategy}
        onChange={(val) => setActiveStrategy(val as string)}
        style={{ marginBottom: 16 }}
      />

      {/* 选股推荐 */}
      <Spin spinning={loading}>
        {filteredRecs.map(rec => (
          <Card
            key={rec.strategy}
            title={
              <Space>
                <Tag color={strategyColors[rec.strategy]} icon={strategyIcons[rec.strategy]}>
                  {rec.name}
                </Tag>
                <Text type="secondary">{rec.description}</Text>
              </Space>
            }
            style={{ marginBottom: 16 }}
            size="small"
          >
            <Table
              columns={stockColumns}
              dataSource={rec.stocks}
              rowKey="symbol"
              size="small"
              pagination={false}
            />
          </Card>
        ))}
      </Spin>

      {/* 智能预警建议 */}
      {alertSuggestions.length > 0 && (
        <Card
          title={<><WarningOutlined /> 智能预警建议</>}
          size="small"
        >
          <Row gutter={[16, 16]}>
            {alertSuggestions.map((s, i) => (
              <Col key={i} xs={24} sm={12} md={8}>
                <Card size="small" hoverable>
                  <Space direction="vertical" size={4} style={{ width: '100%' }}>
                    <Space>
                      <Badge
                        color={s.priority === 'high' ? '#cf1322' : s.priority === 'medium' ? '#fa8c16' : '#999'}
                      />
                      <Text strong>{s.title}</Text>
                    </Space>
                    <Text type="secondary" style={{ fontSize: 12 }}>{s.description}</Text>
                    <Text code style={{ fontSize: 11 }}>{s.condition}</Text>
                    {s.stocks.length > 0 && (
                      <Space wrap>
                        {s.stocks.map((st: string) => (
                          <Tag key={st} color="blue">{st}</Tag>
                        ))}
                      </Space>
                    )}
                  </Space>
                </Card>
              </Col>
            ))}
          </Row>
        </Card>
      )}
    </div>
  );
};

export default AIStockSelectionPage;
