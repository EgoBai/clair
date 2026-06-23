/**
 * 行业板块分析页面
 * 成分股、权重、估值、PE分布、市值分布
 */

import { useState, useEffect } from 'react';
import logger from '../utils/logger';
import { useParams, useNavigate } from 'react-router-dom';
import { Card, Table, Tag, Row, Col, Statistic, Spin, Select, Space, Progress } from 'antd';
import { ArrowUpOutlined, ArrowDownOutlined } from '@ant-design/icons';
import {
  BarChart, Bar, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip,
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

const COLORS = ['#1890ff', '#52c41a', '#faad14', '#ff4d4f', '#722ed1', '#13c2c2', '#eb2f96', '#fadb14'];

export default function SectorDetailPage() {
  const { code } = useParams<{ code?: string }>();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [sectorList, setSectorList] = useState<SectorSummary[]>([]);
  const [selectedSector, setSelectedSector] = useState<SectorDetail | null>(null);
  const [activeCode, setActiveCode] = useState(code || '');

  useEffect(() => {
    loadSectorList();
  }, []);

  useEffect(() => {
    if (activeCode) loadSectorDetail(activeCode);
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

  if (loading) return <div style={{ textAlign: 'center', padding: 100 }}><Spin size="large" /></div>;

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
                    <Tooltip />
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
                    <Tooltip />
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
