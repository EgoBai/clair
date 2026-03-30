/**
 * ETF 基金页面
 * ETF 列表、净值走势、折溢价率、持仓明细
 */

import React, { useState, useEffect } from 'react';
import { Card, Table, Tag, Tabs, Space, Statistic, Row, Col, Progress, Typography, Select, Button, Tooltip } from 'antd';
import { ArrowUpOutlined, ArrowDownOutlined, InfoCircleOutlined, ReloadOutlined } from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';

const { Title, Text } = Typography;
const { Option } = Select;

interface ETFData {
  symbol: string;
  name: string;
  type: string;
  benchmark: string;
  nav: number;
  preNav: number;
  changePercent: number;
  premiumRate: number;
  totalAssets: number;
  trackingError: number;
  dividendYield: number;
  expenseRatio: number;
  volume: number;
  turnover: number;
  holdings: number;
}

const typeLabels: Record<string, { label: string; color: string }> = {
  index: { label: '指数型', color: 'blue' },
  sector: { label: '行业型', color: 'orange' },
  qdii: { label: 'QDII', color: 'purple' },
  commodity: { label: '商品型', color: 'gold' },
  bond: { label: '债券型', color: 'green' },
  theme: { label: '主题型', color: 'cyan' },
};

function formatAmount(val: number): string {
  if (val >= 1e8) return (val / 1e8).toFixed(1) + '亿';
  if (val >= 1e4) return (val / 1e4).toFixed(0) + '万';
  return val.toFixed(0);
}

export default function ETFPage() {
  const navigate = useNavigate();
  const [etfList, setEtfList] = useState<ETFData[]>([]);
  const [loading, setLoading] = useState(true);
  const [typeFilter, setTypeFilter] = useState<string>('all');

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/etf/list');
      const json = await res.json();
      if (json.success) setEtfList(json.data);
    } catch (e) {
      console.error('加载 ETF 数据失败:', e);
    } finally {
      setLoading(false);
    }
  };

  const filteredList = typeFilter === 'all' ? etfList : etfList.filter(e => e.type === typeFilter);

  const columns = [
    {
      title: '代码',
      dataIndex: 'symbol',
      width: 80,
      render: (val: string) => <Text strong>{val}</Text>,
    },
    {
      title: '名称',
      dataIndex: 'name',
      width: 120,
      render: (val: string, record: ETFData) => (
        <Space>
          <a onClick={() => navigate(`/stocks/${record.symbol}`)}>{val}</a>
          <Tag color={typeLabels[record.type]?.color}>{typeLabels[record.type]?.label}</Tag>
        </Space>
      ),
    },
    {
      title: '最新净值',
      dataIndex: 'nav',
      width: 90,
      sorter: (a: ETFData, b: ETFData) => a.nav - b.nav,
      render: (val: number) => val.toFixed(4),
    },
    {
      title: '涨跌幅',
      dataIndex: 'changePercent',
      width: 90,
      sorter: (a: ETFData, b: ETFData) => a.changePercent - b.changePercent,
      render: (val: number) => {
        const color = val > 0 ? '#dc2626' : val < 0 ? '#16a34a' : '#6b7280';
        return <Text style={{ color }}>{val > 0 ? '+' : ''}{val.toFixed(2)}%</Text>;
      },
    },
    {
      title: '折溢价率',
      dataIndex: 'premiumRate',
      width: 90,
      sorter: (a: ETFData, b: ETFData) => a.premiumRate - b.premiumRate,
      render: (val: number) => {
        const color = val > 0 ? '#dc2626' : val < 0 ? '#16a34a' : '#6b7280';
        return <Text style={{ color }}>{val > 0 ? '+' : ''}{val.toFixed(2)}%</Text>;
      },
    },
    {
      title: '规模(亿)',
      dataIndex: 'totalAssets',
      width: 90,
      sorter: (a: ETFData, b: ETFData) => a.totalAssets - b.totalAssets,
      render: (val: number) => (val / 1e8).toFixed(0),
    },
    {
      title: '成交额',
      dataIndex: 'turnover',
      width: 90,
      sorter: (a: ETFData, b: ETFData) => a.turnover - b.turnover,
      render: (val: number) => formatAmount(val),
    },
    {
      title: '股息率',
      dataIndex: 'dividendYield',
      width: 80,
      render: (val: number) => val > 0 ? `${val}%` : '-',
    },
    {
      title: '管理费',
      dataIndex: 'expenseRatio',
      width: 80,
      render: (val: number) => `${val}%`,
    },
    {
      title: '跟踪误差',
      dataIndex: 'trackingError',
      width: 80,
      render: (val: number) => (
        <Tooltip title="年化跟踪误差">
          <Text type={val > 0.1 ? 'danger' : 'secondary'}>{val}%</Text>
        </Tooltip>
      ),
    },
  ];

  // 统计卡片数据
  const totalAssets = etfList.reduce((s, e) => s + e.totalAssets, 0);
  const avgChange = etfList.length > 0 ? etfList.reduce((s, e) => s + e.changePercent, 0) / etfList.length : 0;
  const risingCount = etfList.filter(e => e.changePercent > 0).length;
  const fallingCount = etfList.filter(e => e.changePercent < 0).length;

  return (
    <div style={{ padding: 24 }}>
      <Row gutter={[16, 16]} style={{ marginBottom: 24 }}>
        <Col xs={12} sm={6}>
          <Card size="small">
            <Statistic title="ETF 总数" value={etfList.length} />
          </Card>
        </Col>
        <Col xs={12} sm={6}>
          <Card size="small">
            <Statistic title="总规模" value={(totalAssets / 1e8).toFixed(0)} suffix="亿" />
          </Card>
        </Col>
        <Col xs={12} sm={6}>
          <Card size="small">
            <Statistic
              title="平均涨跌"
              value={avgChange}
              precision={2}
              suffix="%"
              valueStyle={{ color: avgChange > 0 ? '#dc2626' : avgChange < 0 ? '#16a34a' : '#6b7280' }}
              prefix={avgChange > 0 ? <ArrowUpOutlined /> : <ArrowDownOutlined />}
            />
          </Card>
        </Col>
        <Col xs={12} sm={6}>
          <Card size="small">
            <Statistic
              title="涨/跌"
              value={risingCount}
              valueStyle={{ color: '#dc2626' }}
              suffix={<Text style={{ fontSize: 14 }}> / <Text style={{ color: '#16a34a' }}>{fallingCount}</Text></Text>}
            />
          </Card>
        </Col>
      </Row>

      <Card
        title={
          <Space>
            <Title level={4} style={{ margin: 0 }}>ETF 基金</Title>
            <Select value={typeFilter} onChange={setTypeFilter} style={{ width: 120 }} size="small">
              <Option value="all">全部类型</Option>
              <Option value="index">指数型</Option>
              <Option value="sector">行业型</Option>
              <Option value="qdii">QDII</Option>
              <Option value="commodity">商品型</Option>
            </Select>
          </Space>
        }
        extra={<Button icon={<ReloadOutlined />} onClick={fetchData} loading={loading} size="small">刷新</Button>}
      >
        <Table
          columns={columns}
          dataSource={filteredList}
          rowKey="symbol"
          loading={loading}
          size="small"
          pagination={{ pageSize: 20, showSizeChanger: true }}
          scroll={{ x: 1000 }}
        />
      </Card>
    </div>
  );
}
