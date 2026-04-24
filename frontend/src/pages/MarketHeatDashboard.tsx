/**
 * 市场热度仪表盘
 * 综合展示：热度指数、涨跌分布、行业热力图、资金流向、市场情绪
 */
import React, { useEffect, useState, useCallback } from 'react';
import logger from '../utils/logger';
import { Card, Row, Col, Statistic, Progress, Spin, Space, Tag, Typography, Radio, Button, Tooltip, Divider } from 'antd';
import {
  ArrowUpOutlined,
  ArrowDownOutlined,
  FireOutlined,
  ThunderboltOutlined,
  SyncOutlined,
  DollarOutlined,
  RiseOutlined,
  FallOutlined,
  MinusOutlined,
  InfoCircleOutlined,
} from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import ReactECharts from 'echarts-for-react';
import { apiService } from '../services/api';

const { Title, Text } = Typography;

interface MarketHeatData {
  rising: number;
  falling: number;
  flat: number;
  limitUp: number;
  limitDown: number;
  totalAmount: number;
  northboundFlow: number;
  avgChange: number;
  heatIndex: number;
  sentimentLevel: string;
  sectorData: Array<{
    name: string;
    changePercent: number;
    amount: number;
    risingCount: number;
    totalStocks: number;
  }>;
  volumeDistribution: Array<{ range: string; count: number }>;
}

const MarketHeatDashboard: React.FC = () => {
  const navigate = useNavigate();
  const [data, setData] = useState<MarketHeatData | null>(null);
  const [loading, setLoading] = useState(true);
  const [viewMode, setViewMode] = useState<'overview' | 'sectors' | 'flow'>('overview');

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      // 并行加载多个数据源
      const api = apiService as unknown as Record<string, (...args: unknown[]) => Promise<unknown>>;
      const [summaryRes, sectorsRes, flowRes] = await Promise.all([
        apiService.getMarketSummary().catch(() => ({ success: false, data: null })),
        (api.getSectorAnalysis?.() as Promise<{ success: boolean; data?: { sectors?: Array<{ name: string; changePercent: number; amount: number; risingCount: number; totalStocks: number }> } }>)?.catch(() => ({ success: false, data: { sectors: [] } })) ?? Promise.resolve({ success: false, data: { sectors: [] } }),
        (api.getFundFlowOverview?.() as Promise<{ success: boolean }>)?.catch(() => ({ success: false })) ?? Promise.resolve({ success: false }),
      ]);

      const summary: any = summaryRes.success ? summaryRes.data : null;
      const total = (summary?.rising || 0) + (summary?.falling || 0) + (summary?.flat || 0);

      // 计算热度指数 (0-100)
      let heatIndex = 50;
      if (summary) {
        const advRatio = total > 0 ? (summary.rising || 0) / total : 0.5;
        heatIndex = Math.min(100, Math.max(0,
          50 + (advRatio - 0.5) * 60 +
          ((summary.limitUp || 0) > (summary.limitDown || 0) ? 5 : -5) +
          ((summary.northboundFlow || 0) > 0 ? 5 : -5)
        ));
      }

      // 情绪判断
      let sentimentLevel = '中性';
      if (heatIndex > 80) sentimentLevel = '极度贪婪';
      else if (heatIndex > 60) sentimentLevel = '贪婪';
      else if (heatIndex < 20) sentimentLevel = '极度恐慌';
      else if (heatIndex < 40) sentimentLevel = '恐慌';

      setData({
        rising: summary?.rising || 0,
        falling: summary?.falling || 0,
        flat: summary?.flat || 0,
        limitUp: summary?.limitUp || 0,
        limitDown: summary?.limitDown || 0,
        totalAmount: summary?.totalAmount || 0,
        northboundFlow: summary?.northboundFlow || 0,
        avgChange: summary?.avgChange || 0,
        heatIndex,
        sentimentLevel,
        sectorData: sectorsRes.success ? (sectorsRes.data?.sectors || []) : [],
        volumeDistribution: [],
      });
    } catch (e) {
      logger.error('Failed to load market heat data:', e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  const getSentimentColor = (level: string): string => {
    const map: Record<string, string> = {
      '极度贪婪': '#3f8600', '贪婪': '#7cb342', '中性': '#faad14',
      '恐慌': '#d46b08', '极度恐慌': '#cf1322',
    };
    return map[level] || '#888';
  };

  const getSentimentIcon = (level: string) => {
    if (level.includes('贪婪')) return <RiseOutlined />;
    if (level.includes('恐慌')) return <FallOutlined />;
    return <MinusOutlined />;
  };

  if (loading) {
    return (
      <div style={{ textAlign: 'center', padding: 60 }}>
        <Spin size="large" tip="加载市场热度数据..." />
      </div>
    );
  }

  const total = (data?.rising || 0) + (data?.falling || 0) + (data?.flat || 0);
  const risingPct = total > 0 ? ((data?.rising || 0) / total * 100) : 50;
  const fallingPct = total > 0 ? ((data?.falling || 0) / total * 100) : 50;

  return (
    <div>
      <Row justify="space-between" align="middle" style={{ marginBottom: 16 }}>
        <Col>
          <Title level={4} style={{ margin: 0 }}>
            <FireOutlined style={{ color: '#ff4d4f', marginRight: 8 }} />
            市场热度仪表盘
          </Title>
        </Col>
        <Col>
          <Space>
            <Radio.Group value={viewMode} onChange={e => setViewMode(e.target.value)} size="small">
              <Radio.Button value="overview">概览</Radio.Button>
              <Radio.Button value="sectors">行业</Radio.Button>
              <Radio.Button value="flow">资金</Radio.Button>
            </Radio.Group>
            <Button icon={<SyncOutlined />} onClick={loadData} loading={loading} size="small">刷新</Button>
          </Space>
        </Col>
      </Row>

      {/* 核心指标行 */}
      <Row gutter={[12, 12]}>
        {/* 市场情绪 */}
        <Col xs={24} sm={12} md={6}>
          <Card size="small">
            <div style={{ textAlign: 'center' }}>
              <Text type="secondary">市场情绪</Text>
              <div style={{ margin: '8px 0' }}>
                <Progress
                  type="circle"
                  percent={Math.round(data?.heatIndex || 50)}
                  size={100}
                  strokeColor={getSentimentColor(data?.sentimentLevel || '中性')}
                  format={(val) => (
                    <div>
                      <div style={{ fontSize: 24, fontWeight: 'bold' }}>{val}</div>
                      <div style={{ fontSize: 11 }}>{data?.sentimentLevel}</div>
                    </div>
                  )}
                />
              </div>
              <Tag color={getSentimentColor(data?.sentimentLevel || '中性')} icon={getSentimentIcon(data?.sentimentLevel || '中性')}>
                {data?.sentimentLevel}
              </Tag>
            </div>
          </Card>
        </Col>

        {/* 涨跌分布 */}
        <Col xs={24} sm={12} md={6}>
          <Card size="small" title="涨跌分布" extra={<Tag>{total} 只</Tag>}>
            <Space direction="vertical" style={{ width: '100%' }}>
              <div>
                <Space>
                  <ArrowUpOutlined style={{ color: '#ff4d4f' }} />
                  <Text>上涨</Text>
                  <Text strong style={{ color: '#ff4d4f' }}>{data?.rising}</Text>
                </Space>
                <Progress percent={parseFloat(risingPct.toFixed(1))} strokeColor="#ff4d4f" showInfo={false} size="small" />
              </div>
              <div>
                <Space>
                  <ArrowDownOutlined style={{ color: '#52c41a' }} />
                  <Text>下跌</Text>
                  <Text strong style={{ color: '#52c41a' }}>{data?.falling}</Text>
                </Space>
                <Progress percent={parseFloat(fallingPct.toFixed(1))} strokeColor="#52c41a" showInfo={false} size="small" />
              </div>
              <Divider style={{ margin: '8px 0' }} />
              <Row gutter={16}>
                <Col span={12}>
                  <Statistic title="涨停" value={data?.limitUp || 0} valueStyle={{ color: '#ff4d4f', fontSize: 18 }} prefix={<ArrowUpOutlined />} />
                </Col>
                <Col span={12}>
                  <Statistic title="跌停" value={data?.limitDown || 0} valueStyle={{ color: '#52c41a', fontSize: 18 }} prefix={<ArrowDownOutlined />} />
                </Col>
              </Row>
            </Space>
          </Card>
        </Col>

        {/* 成交额 */}
        <Col xs={24} sm={12} md={6}>
          <Card size="small">
            <Statistic
              title="两市成交额"
              value={data?.totalAmount ? (data.totalAmount / 1e8) : 0}
              precision={0}
              suffix="亿"
              valueStyle={{ color: '#1677ff', fontSize: 22 }}
              prefix={<DollarOutlined />}
            />
            <div style={{ marginTop: 12 }}>
              <Tooltip title="日均成交额参考: 8000亿-12000亿为正常水平">
                <Text type="secondary">
                  <InfoCircleOutlined /> 北向资金:
                  <Text strong style={{ color: (data?.northboundFlow || 0) > 0 ? '#ff4d4f' : '#52c41a', marginLeft: 4 }}>
                    {(data?.northboundFlow || 0) > 0 ? '+' : ''}{((data?.northboundFlow || 0) / 1e8).toFixed(0)}亿
                  </Text>
                </Text>
              </Tooltip>
            </div>
          </Card>
        </Col>

        {/* 平均涨跌幅 */}
        <Col xs={24} sm={12} md={6}>
          <Card size="small">
            <Statistic
              title="市场平均涨跌"
              value={data?.avgChange || 0}
              precision={2}
              suffix="%"
              valueStyle={{
                color: (data?.avgChange || 0) > 0 ? '#ff4d4f' : (data?.avgChange || 0) < 0 ? '#52c41a' : '#888',
                fontSize: 22,
              }}
              prefix={(data?.avgChange || 0) > 0 ? <RiseOutlined /> : (data?.avgChange || 0) < 0 ? <FallOutlined /> : <MinusOutlined />}
            />
          </Card>
        </Col>
      </Row>

      {/* 涨跌分布可视化 */}
      <Row gutter={[12, 12]} style={{ marginTop: 12 }}>
        <Col xs={24} md={12}>
          <Card title="涨跌家数分布" size="small">
            <ReactECharts
              option={{
                tooltip: { trigger: 'item' },
                series: [{
                  type: 'pie',
                  radius: ['40%', '70%'],
                  data: [
                    { value: data?.rising || 0, name: '上涨', itemStyle: { color: '#ff4d4f' } },
                    { value: data?.falling || 0, name: '下跌', itemStyle: { color: '#52c41a' } },
                    { value: data?.flat || 0, name: '平盘', itemStyle: { color: '#888' } },
                  ],
                  label: { show: true, formatter: '{b}: {c} ({d}%)' },
                }],
              }}
              style={{ height: 250 }}
              notMerge
            />
          </Card>
        </Col>
        <Col xs={24} md={12}>
          <Card
            title="行业涨跌热力"
            size="small"
            extra={
              <Button type="link" size="small" onClick={() => navigate('/sectors')}>
                查看全部 →
              </Button>
            }
          >
            {data?.sectorData && data.sectorData.length > 0 ? (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 4 }}>
                {data.sectorData.slice(0, 12).map((s, i) => (
                  <Tooltip key={i} title={`${s.name}: ${s.changePercent > 0 ? '+' : ''}${s.changePercent.toFixed(2)}%`}>
                    <div
                      style={{
                        backgroundColor: s.changePercent > 0
                          ? `rgba(255,77,79,${Math.min(1, Math.abs(s.changePercent) / 5)})`
                          : `rgba(82,196,26,${Math.min(1, Math.abs(s.changePercent) / 5)})`,
                        borderRadius: 4,
                        padding: '6px 4px',
                        textAlign: 'center',
                        cursor: 'pointer',
                      }}
                      onClick={() => navigate(`/sectors`)}
                    >
                      <div style={{ color: '#fff', fontSize: 11, fontWeight: 'bold' }}>{s.name}</div>
                      <div style={{ color: '#fff', fontSize: 13 }}>
                        {s.changePercent > 0 ? '+' : ''}{s.changePercent.toFixed(1)}%
                      </div>
                    </div>
                  </Tooltip>
                ))}
              </div>
            ) : (
              <div style={{ textAlign: 'center', padding: 40, color: '#999' }}>行业数据加载中...</div>
            )}
          </Card>
        </Col>
      </Row>
    </div>
  );
};

export default MarketHeatDashboard;
