/**
 * 大宗交易页面
 * 参考东方财富大宗交易数据展示
 */

import React, { useState, useEffect, useCallback } from 'react';
import logger from '../utils/logger';
import {
  Card, Table, Tag, DatePicker, Statistic, Row, Col, Space,
  Typography, Button, Tooltip, Segmented, Progress,
} from 'antd';
import {
  SwapOutlined, RiseOutlined, FallOutlined, DollarOutlined,
  ReloadOutlined, DownloadOutlined,
} from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';

const { Title, Text } = Typography;

interface BlockTrade {
  id: number;
  symbol: string;
  name: string;
  tradeDate: string;
  price: number;
  closePrice: number;
  volume: number;
  amount: number;
  discount: number;
  buyer: string;
  seller: string;
}

interface BlockTradeSummary {
  totalAmount: number;
  totalVolume: number;
  avgDiscount: number;
  premiumCount: number;
  discountCount: number;
  tradeCount: number;
}

const formatAmount = (val: number): string => {
  if (val >= 1e8) return `${(val / 1e8).toFixed(2)}亿`;
  if (val >= 1e4) return `${(val / 1e4).toFixed(2)}万`;
  return val.toFixed(0);
};

const formatVolume = (val: number): string => {
  if (val >= 1e4) return `${(val / 1e4).toFixed(0)}万股`;
  return `${val}股`;
};

const BlockTradesPage: React.FC = () => {
  const [trades, setTrades] = useState<BlockTrade[]>([]);
  const [summary, setSummary] = useState<BlockTradeSummary | null>(null);
  const [loading, setLoading] = useState(false);
  const [viewMode, setViewMode] = useState<string>('today');
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: String(page), pageSize: '20' });
      if (viewMode !== 'all') params.set('date', new Date().toISOString().split('T')[0]);

      const res = await fetch(`/api/block-trades?${params}`);
      const json = await res.json();
      if (json.success) {
        setTrades(json.data.trades);
        setSummary(json.data.summary);
        setTotal(json.data.pagination.total);
      }
    } catch (err) {
      logger.error('加载大宗交易失败:', err);
    } finally {
      setLoading(false);
    }
  }, [page, viewMode]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const columns: ColumnsType<BlockTrade> = [
    {
      title: '排名',
      key: 'rank',
      width: 60,
      render: (_: unknown, __: unknown, index: number) => {
        const rank = (page - 1) * 20 + index + 1;
        const colors = ['#FFD700', '#C0C0C0', '#CD7F32'];
        return rank <= 3
          ? <Tag color={colors[rank - 1]} style={{ fontWeight: 'bold' }}>{rank}</Tag>
          : <Text type="secondary">{rank}</Text>;
      },
    },
    {
      title: '股票',
      key: 'stock',
      width: 140,
      render: (_, record) => (
        <Space direction="vertical" size={0}>
          <a href={`/stock/${record.symbol}`} style={{ fontWeight: 600 }}>{record.name}</a>
          <Text type="secondary" style={{ fontSize: 12 }}>{record.symbol}</Text>
        </Space>
      ),
    },
    {
      title: '成交价',
      dataIndex: 'price',
      width: 100,
      render: (val: number) => <Text strong>{val.toFixed(2)}</Text>,
      sorter: (a, b) => a.price - b.price,
    },
    {
      title: '收盘价',
      dataIndex: 'closePrice',
      width: 100,
      render: (val: number) => val.toFixed(2),
    },
    {
      title: '成交量',
      dataIndex: 'volume',
      width: 110,
      render: (val: number) => formatVolume(val),
      sorter: (a, b) => a.volume - b.volume,
    },
    {
      title: '成交额',
      dataIndex: 'amount',
      width: 110,
      render: (val: number) => (
        <Text style={{ color: '#1890ff' }}>{formatAmount(val)}</Text>
      ),
      sorter: (a, b) => a.amount - b.amount,
      defaultSortOrder: 'descend',
    },
    {
      title: '折溢价率',
      dataIndex: 'discount',
      width: 100,
      render: (val: number) => {
        const color = val > 0 ? '#cf1322' : val < 0 ? '#3f8600' : '#999';
        const prefix = val > 0 ? '+' : '';
        return <Tag color={color === '#cf1322' ? 'red' : color === '#3f8600' ? 'green' : 'default'}>
          {prefix}{val.toFixed(2)}%
        </Tag>;
      },
      sorter: (a, b) => a.discount - b.discount,
    },
    {
      title: '买方营业部',
      dataIndex: 'buyer',
      width: 180,
      ellipsis: { showTitle: false },
      render: (val: string) => <Tooltip title={val}><Text>{val}</Text></Tooltip>,
    },
    {
      title: '卖方营业部',
      dataIndex: 'seller',
      width: 180,
      ellipsis: { showTitle: false },
      render: (val: string) => <Tooltip title={val}><Text>{val}</Text></Tooltip>,
    },
  ];

  return (
    <div style={{ padding: 24 }}>
      <Row justify="space-between" align="middle" style={{ marginBottom: 16 }}>
        <Col>
          <Title level={4} style={{ margin: 0 }}>
            <SwapOutlined /> 大宗交易
          </Title>
        </Col>
        <Col>
          <Space>
            <Segmented
              options={[
                { label: '今日', value: 'today' },
                { label: '全部', value: 'all' },
              ]}
              value={viewMode}
              onChange={(val) => setViewMode(val as string)}
            />
            <Button icon={<ReloadOutlined />} onClick={fetchData} loading={loading}>刷新</Button>
          </Space>
        </Col>
      </Row>

      {/* 统计卡片 */}
      {summary && (
        <Row gutter={16} style={{ marginBottom: 16 }}>
          <Col xs={12} sm={8} md={4}>
            <Card size="small">
              <Statistic title="成交笔数" value={summary.tradeCount} prefix={<SwapOutlined />} />
            </Card>
          </Col>
          <Col xs={12} sm={8} md={4}>
            <Card size="small">
              <Statistic title="总成交额" value={formatAmount(summary.totalAmount)} prefix={<DollarOutlined />} />
            </Card>
          </Col>
          <Col xs={12} sm={8} md={4}>
            <Card size="small">
              <Statistic
                title="平均折溢价"
                value={summary.avgDiscount}
                precision={2}
                suffix="%"
                valueStyle={{ color: summary.avgDiscount > 0 ? '#cf1322' : '#3f8600' }}
                prefix={summary.avgDiscount > 0 ? <RiseOutlined /> : <FallOutlined />}
              />
            </Card>
          </Col>
          <Col xs={12} sm={8} md={4}>
            <Card size="small">
              <Statistic title="溢价成交" value={summary.premiumCount} valueStyle={{ color: '#cf1322' }} />
            </Card>
          </Col>
          <Col xs={12} sm={8} md={4}>
            <Card size="small">
              <Statistic title="折价成交" value={summary.discountCount} valueStyle={{ color: '#3f8600' }} />
            </Card>
          </Col>
          <Col xs={12} sm={8} md={4}>
            <Card size="small">
              <Statistic title="总成交量" value={formatVolume(summary.totalVolume)} />
            </Card>
          </Col>
        </Row>
      )}

      {/* 溢价/折价比例 */}
      {summary && (
        <Card size="small" style={{ marginBottom: 16 }}>
          <Row align="middle" gutter={16}>
            <Col span={4}><Text type="secondary">溢价/折价分布</Text></Col>
            <Col span={16}>
              <Progress
                percent={summary.tradeCount ? Math.round(summary.premiumCount / summary.tradeCount * 100) : 0}
                success={{ percent: summary.tradeCount ? Math.round(summary.discountCount / summary.tradeCount * 100) : 0 }}
                format={() => `溢价${summary.premiumCount}笔 / 折价${summary.discountCount}笔`}
              />
            </Col>
          </Row>
        </Card>
      )}

      {/* 数据表格 */}
      <Card>
        <Table
          columns={columns}
          dataSource={trades}
          rowKey="id"
          loading={loading}
          size="small"
          pagination={{
            current: page,
            pageSize: 20,
            total,
            onChange: setPage,
            showSizeChanger: false,
            showTotal: (t) => `共 ${t} 条`,
          }}
          scroll={{ x: 1200 }}
        />
      </Card>
    </div>
  );
};

export default BlockTradesPage;
