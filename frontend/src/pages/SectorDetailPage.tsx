/**
 * 行业板块分析页面
 * 成分股、权重、估值、PE分布、市值分布
 * P0-2: 5维度雷达图 + 解读仪表盘
 */

import { useState, useEffect } from 'react';
import logger from '../utils/logger';
import { useParams, useNavigate } from 'react-router-dom';
import { Card, Table, Tag, Row, Col, Statistic, Select, Space, Progress, Tooltip, Skeleton } from 'antd';
import { LoadingState } from '../components/Common/StateComponents';
import { ArrowUpOutlined, ArrowDownOutlined } from '@ant-design/icons';
import ReactECharts from 'echarts-for-react';
import echarts from '../utils/echarts';
import {
  BarChart, Bar, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip,
  ResponsiveContainer,
} from 'recharts';

interface SectorSummary {
  name: string;
  code: string;
  stockCount: number;
  avgPE: number;
  avgPB: number;
  avgROE: number;
  changePercent: number;
  totalMarketCap: number;
  turnover: number;
  fundFlow: number;
}

interface SectorDetail extends SectorSummary {
  topStocks: {
    symbol: string;
    name: string;
    weight: number;
    price: number;
    changePercent: number;
    marketCap: number;
    pe: number;
    pb: number;
    turnover: number;
  }[];
  peDistribution: { range: string; count: number }[];
  marketCapDistribution: { range: string; count: number; total: number }[];
}

// 多维分析 API 返回类型
interface MultidimDim {
  score: number;
  label: string;
  detail: string;
}

interface MultidimResult {
  industry: string;
  totalScore: number;
  dimensions: {
    crowding: MultidimDim;
    diffusion: MultidimDim;
    concentration: MultidimDim;
    retail: MultidimDim;
    recovery: MultidimDim;
  };
  metadata: {
    stockCount: number;
    avgPE: number;
    medianPE: number;
    aboveMA20Pct: number;
    top5TurnoverPct: number;
    smallCapTurnoverSurge: number;
    ma5Change: number;
    ma20Change: number;
  };
}

const COLORS = ['#1890ff', '#52c41a', '#faad14', '#ff4d4f', '#722ed1', '#13c2c2', '#eb2f96', '#fadb14'];

// 雷达图维度颜色
const RADAR_COLORS = {
  crowding: '#f59e0b',      // 拥挤度 - 琥珀
  diffusion: '#3b82f6',     // 扩散程度 - 蓝
  concentration: '#10b981', // 资金集中度 - 绿
  retail: '#f97316',        // 小白指数 - 橙
  recovery: '#8b5cf6',      // 回补程度 - 紫
};

const DIM_ICONS: Record<string, string> = {
  crowding: '👥',
  diffusion: '📊',
  concentration: '💰',
  retail: '🐟',
  recovery: '🔄',
};

const DIM_NAMES: Record<string, string> = {
  crowding: '拥挤度',
  diffusion: '扩散程度',
  concentration: '资金集中度',
  retail: '小白指数',
  recovery: '回补程度',
};

// 总分评级
function getTotalRank(totalScore: number): { label: string; color: string } {
  if (totalScore >= 80) return { label: '优秀', color: '#10b981' };
  if (totalScore >= 60) return { label: '良好', color: '#3b82f6' };
  if (totalScore >= 40) return { label: '一般', color: '#f59e0b' };
  return { label: '偏弱', color: '#ef4444' };
}

export default function SectorDetailPage() {
  const { symbol } = useParams<{ symbol?: string }>();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [sectorList, setSectorList] = useState<SectorSummary[]>([]);
  const [selectedSector, setSelectedSector] = useState<SectorDetail | null>(null);
  const [activeCode, setActiveCode] = useState(symbol || '');
  const [multidimData, setMultidimData] = useState<MultidimResult | null>(null);
  const [multidimLoading, setMultidimLoading] = useState(false);

  useEffect(() => {
    loadSectorList();
  }, []);

  useEffect(() => {
    if (activeCode) {
      loadSectorDetail(activeCode);
      loadMultidimAnalysis(activeCode);
    }
  }, [activeCode]);

  const loadSectorList = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/sectors/analysis');
      const data = await res.json();
      if (data.success) {
        setSectorList(data.data.sectors);
        if (!activeCode && data.data.sectors.length > 0) {
          setActiveCode(data.data.sectors[0].code);
        }
      }
    } catch (e) {
      logger.error('加载板块列表失败:', e);
    } finally {
      setLoading(false);
    }
  };

  const loadSectorDetail = async (sectorCode: string) => {
    try {
      const res = await fetch(`/api/sectors/analysis/${sectorCode}`);
      const data = await res.json();
      if (data.success) setSelectedSector(data.data);
    } catch (e) {
      logger.error('加载板块详情失败:', e);
    }
  };

  const loadMultidimAnalysis = async (sectorCode: string) => {
    setMultidimLoading(true);
    try {
      const res = await fetch(`/api/sectors/${encodeURIComponent(sectorCode)}/multidim`);
      const data = await res.json();
      if (data.success) {
        setMultidimData(data.data);
      } else {
        setMultidimData(null);
      }
    } catch (e) {
      logger.error('加载多维分析失败:', e);
      setMultidimData(null);
    } finally {
      setMultidimLoading(false);
    }
  };

  // ============== 雷达图配置 ==============
  const buildRadarOption = () => {
    if (!multidimData) return {};

    const dims = multidimData.dimensions;
    const keys: (keyof typeof dims)[] = ['crowding', 'diffusion', 'concentration', 'retail', 'recovery'];

    const indicator = keys.map((k) => ({
      name: DIM_NAMES[k],
      max: 20,
    }));

    const values = keys.map((k) => dims[k].score);

    return {
      radar: {
        indicator,
        center: ['50%', '52%'],
        radius: '70%',
        axisName: {
          color: '#94a3b8',
          fontSize: 12,
          padding: [3, 5],
        },
        splitArea: {
          areaStyle: {
            color: ['rgba(59, 130, 246, 0.02)', 'rgba(59, 130, 246, 0.02)'],
          },
        },
        splitLine: {
          lineStyle: {
            color: 'rgba(148, 163, 184, 0.2)',
          },
        },
        axisLine: {
          lineStyle: {
            color: 'rgba(148, 163, 184, 0.3)',
          },
        },
      },
      series: [
        {
          type: 'radar',
          data: [
            {
              value: values,
              name: multidimData.industry,
              areaStyle: {
                color: {
                  type: 'radial',
                  x: 0.5, y: 0.5, r: 0.5,
                  colorStops: [
                    { offset: 0, color: 'rgba(59, 130, 246, 0.35)' },
                    { offset: 1, color: 'rgba(139, 92, 246, 0.12)' },
                  ],
                },
              },
              lineStyle: {
                color: '#3b82f6',
                width: 2,
              },
              itemStyle: {
                color: '#3b82f6',
              },
            },
          ],
        },
      ],
    };
  };

  const stockColumns = [
    { title: '排名', key: 'rank', width: 60, render: (_: unknown, __: unknown, i: number) => i + 1 },
    { title: '代码', dataIndex: 'symbol', key: 'symbol', width: 90 },
    { title: '名称', dataIndex: 'name', key: 'name' },
    {
      title: '权重', dataIndex: 'weight', key: 'weight', width: 80,
      render: (v: number) => <Progress percent={v} size="small" showInfo format={p => `${p}%`} />,
    },
    {
      title: '价格', dataIndex: 'price', key: 'price', align: 'right' as const,
      render: (v: number) => v.toFixed(2),
    },
    {
      title: '涨跌幅', dataIndex: 'changePercent', key: 'changePercent', align: 'right' as const,
      render: (v: number) => (
        <Tag color={v >= 0 ? 'red' : 'green'}>
          {v >= 0 ? '+' : ''}{v.toFixed(2)}%
        </Tag>
      ),
    },
    {
      title: '市值(亿)', dataIndex: 'marketCap', key: 'marketCap', align: 'right' as const,
      render: (v: number) => v.toFixed(2),
    },
    { title: 'PE', dataIndex: 'pe', key: 'pe', align: 'right' as const, render: (v: number) => v.toFixed(1) },
    { title: 'PB', dataIndex: 'pb', key: 'pb', align: 'right' as const, render: (v: number) => v.toFixed(2) },
    { title: '换手率%', dataIndex: 'turnover', key: 'turnover', align: 'right' as const },
  ];

  if (loading) return (
    <div style={{ padding: 16, maxWidth: 1400, margin: '0 auto' }}>
      <Skeleton active paragraph={{ rows: 1 }} style={{ marginBottom: 16 }} />
      <Skeleton active paragraph={{ rows: 6 }} />
    </div>
  );

  // 获取维度解读数据
  const dimKeys: (keyof MultidimResult['dimensions'])[] = ['crowding', 'diffusion', 'concentration', 'retail', 'recovery'];

  return (
    <div style={{ padding: 16 }}>
      <Row justify="space-between" align="middle" style={{ marginBottom: 16 }}>
        <h2 style={{ margin: 0 }}>📈 行业板块分析</h2>
        <Space>
          <Select
            value={activeCode}
            onChange={setActiveCode}
            style={{ width: 200 }}
            options={sectorList.map(s => ({ value: s.code, label: `${s.name} (${s.changePercent >= 0 ? '+' : ''}${s.changePercent}%)` }))}
          />
        </Space>
      </Row>

      {/* 板块概览 */}
      <Row gutter={[16, 16]} style={{ marginBottom: 16 }}>
        {sectorList.slice(0, 8).map(s => (
          <Col key={s.code} xs={12} sm={8} md={6} lg={3}>
            <Card
              size="small"
              hoverable
              style={{
                cursor: 'pointer',
                borderLeft: `3px solid ${s.changePercent >= 0 ? '#ff4d4f' : '#52c41a'}`,
                background: activeCode === s.code ? '#f0f5ff' : undefined,
              }}
              onClick={() => setActiveCode(s.code)}
            >
              <Statistic
                title={s.name}
                value={s.changePercent}
                precision={2}
                prefix={s.changePercent >= 0 ? <ArrowUpOutlined /> : <ArrowDownOutlined />}
                suffix="%"
                valueStyle={{ color: s.changePercent >= 0 ? '#ff4d4f' : '#52c41a', fontSize: 16 }}
              />
              <div style={{ color: '#999', fontSize: 12, marginTop: 4 }}>
                PE {s.avgPE} | {s.stockCount}只
              </div>
            </Card>
          </Col>
        ))}
      </Row>

      {/* ========== P0-2: 多维雷达图 + 解读仪表盘 ========== */}
      {multidimLoading ? (
        <Card size="small" style={{ marginBottom: 16, textAlign: 'center', padding: 40 }}>
          <LoadingState />
        </Card>
      ) : multidimData ? (
        <Card
          size="small"
          style={{ marginBottom: 16 }}
          title={
            <Space>
              <span>🎯 板块多维雷达图</span>
              <Tag color={getTotalRank(multidimData.totalScore).color}>
                综合得分: {multidimData.totalScore}/100 ({getTotalRank(multidimData.totalScore).label})
              </Tag>
            </Space>
          }
        >
          <Row gutter={[24, 24]}>
            {/* 雷达图 */}
            <Col xs={24} md={12} lg={10}>
              <ReactECharts
                echarts={echarts}
                option={buildRadarOption()}
                style={{ height: 380 }}
                notMerge
              />
            </Col>

            {/* 维度解读 */}
            <Col xs={24} md={12} lg={14}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12, height: '100%', justifyContent: 'center' }}>
                {dimKeys.map((key) => {
                  const dim = multidimData.dimensions[key];
                  const color = RADAR_COLORS[key];
                  const icon = DIM_ICONS[key];
                  const name = DIM_NAMES[key];
                  const scorePct = (dim.score / 20) * 100;

                  return (
                    <div key={key} style={{
                      display: 'flex',
                      alignItems: 'flex-start',
                      gap: 12,
                      padding: '10px 14px',
                      borderRadius: 8,
                      background: 'rgba(255,255,255,0.03)',
                      border: '1px solid rgba(255,255,255,0.06)',
                      transition: 'all 0.2s',
                    }}>
                      {/* 图标 */}
                      <div style={{
                        width: 40, height: 40, borderRadius: 10,
                        background: `${color}15`,
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontSize: 20, flexShrink: 0,
                      }}>
                        {icon}
                      </div>

                      {/* 内容 */}
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                          <span style={{ fontWeight: 600, fontSize: 14, color: '#e2e8f0' }}>{name}</span>
                          <Tag color={dim.score >= 14 ? 'green' : dim.score >= 9 ? 'orange' : 'red'} style={{ margin: 0, fontSize: 11 }}>
                            {dim.score}/20
                          </Tag>
                          <span style={{ fontSize: 12, color: color, fontWeight: 500 }}>{dim.label}</span>
                        </div>

                        {/* 进度条 */}
                        <div style={{
                          height: 4, borderRadius: 2, background: 'rgba(255,255,255,0.06)',
                          marginBottom: 6, overflow: 'hidden',
                        }}>
                          <div style={{
                            height: '100%', borderRadius: 2,
                            width: `${scorePct}%`,
                            background: `linear-gradient(90deg, ${color}, ${color}88)`,
                            transition: 'width 0.5s ease',
                          }} />
                        </div>

                        {/* 详细解读 */}
                        <Tooltip title={dim.detail}>
                          <span style={{
                            fontSize: 12, color: '#94a3b8',
                            lineHeight: 1.5,
                            display: '-webkit-box',
                            WebkitLineClamp: 2,
                            WebkitBoxOrient: 'vertical',
                            overflow: 'hidden',
                          }}>
                            {dim.detail}
                          </span>
                        </Tooltip>
                      </div>
                    </div>
                  );
                })}
              </div>
            </Col>
          </Row>
        </Card>
      ) : null}

      {selectedSector && (
        <>
          {/* 板块详情指标 */}
          <Row gutter={[16, 16]} style={{ marginBottom: 16 }}>
            <Col xs={12} sm={8} md={6}>
              <Card size="small"><Statistic title="平均PE" value={selectedSector.avgPE} precision={1} /></Card>
            </Col>
            <Col xs={12} sm={8} md={6}>
              <Card size="small"><Statistic title="平均PB" value={selectedSector.avgPB} precision={2} /></Card>
            </Col>
            <Col xs={12} sm={8} md={6}>
              <Card size="small"><Statistic title="平均ROE" value={selectedSector.avgROE} precision={1} suffix="%" /></Card>
            </Col>
            <Col xs={12} sm={8} md={6}>
              <Card size="small">
                <Statistic
                  title="资金流向"
                  value={selectedSector.fundFlow}
                  precision={2}
                  suffix="亿"
                  valueStyle={{ color: selectedSector.fundFlow >= 0 ? '#ff4d4f' : '#52c41a' }}
                />
              </Card>
            </Col>
          </Row>

          {/* 图表 */}
          <Row gutter={[16, 16]} style={{ marginBottom: 16 }}>
            <Col xs={24} md={12}>
              <Card title="PE分布" size="small">
                <ResponsiveContainer width="100%" height={250}>
                  <BarChart data={selectedSector.peDistribution}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="range" />
                    <YAxis />
                    <RechartsTooltip />
                    <Bar dataKey="count" name="公司数" fill="#1890ff" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </Card>
            </Col>
            <Col xs={24} md={12}>
              <Card title="市值分布" size="small">
                <ResponsiveContainer width="100%" height={250}>
                  <PieChart>
                    <Pie data={selectedSector.marketCapDistribution} cx="50%" cy="50%" outerRadius={80}
                      label={({ range, count }: any) => `${range}(${count})`} labelLine={false}>
                      {selectedSector.marketCapDistribution.map((_, i) => (
                        <Cell key={i} fill={COLORS[i % COLORS.length]} />
                      ))}
                    </Pie>
                    <RechartsTooltip />
                  </PieChart>
                </ResponsiveContainer>
              </Card>
            </Col>
          </Row>

          {/* 成分股表格 */}
          <Card title={`${selectedSector.name} - 重仓成分股`} size="small">
            <Table
              columns={stockColumns}
              dataSource={selectedSector.topStocks}
              rowKey="symbol"
              pagination={false}
              size="small"
              onRow={(record) => ({
                onClick: () => navigate(`/stock/${record.symbol}`),
                style: { cursor: 'pointer' },
              })}
            />
          </Card>
        </>
      )}
    </div>
  );
}
