/**
 * 限售股解禁日历页面
 * 参考东方财富限售股解禁数据展示
 */

import React, { useState, useEffect, useCallback } from 'react';
import logger from '../utils/logger';
import {
  Card, Table, Tag, Calendar, Space, Typography, Row, Col, Statistic,
  Button, Badge, Tooltip, Modal,
} from 'antd';
import {
  LockOutlined, CalendarOutlined, DollarOutlined, ReloadOutlined,
  WarningOutlined,
} from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import type { Dayjs } from 'dayjs';

const { Title, Text } = Typography;

interface LockupExpiry {
  id: number;
  symbol: string;
  name: string;
  expiryDate: string;
  lockupType: string;
  shareholder: string;
  totalShares: number;
  circulatingBefore: number;
  unlockRatio: number;
  marketValue: number;
  price: number;
}

interface LockupSummary {
  totalStocks: number;
  totalEvents: number;
  totalMarketValue: number;
  totalShares: number;
  avgUnlockRatio: number;
}

const formatAmount = (val: number): string => {
  if (val >= 1e8) return `${(val / 1e8).toFixed(2)}亿`;
  if (val >= 1e4) return `${(val / 1e4).toFixed(2)}万`;
  return val.toFixed(0);
};

const formatShares = (val: number): string => {
  if (val >= 1e8) return `${(val / 1e8).toFixed(2)}亿股`;
  if (val >= 1e4) return `${(val / 1e4).toFixed(2)}万股`;
  return `${val}股`;
};

const LockupCalendarPage: React.FC = () => {
  const [expiries, setExpiries] = useState<LockupExpiry[]>([]);
  const [byDate, setByDate] = useState<Record<string, LockupExpiry[]>>({});
  const [summary, setSummary] = useState<LockupSummary | null>(null);
  const [loading, setLoading] = useState(false);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [detailModal, setDetailModal] = useState(false);

  const fetchData = useCallback(async (year?: number, month?: number) => {
    setLoading(true);
    try {
      const now = new Date();
      const params = new URLSearchParams({
        year: String(year || now.getFullYear()),
        month: String(month || now.getMonth() + 1),
      });
      const res = await fetch(`/api/lockup/calendar?${params}`);
      const json = await res.json();
      if (json.success) {
        setExpiries(json.data.expiries);
        setByDate(json.data.byDate);
        setSummary(json.data.summary);
      }
    } catch (err) {
      logger.error('加载解禁数据失败:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  const dateCellRender = (date: Dayjs) => {
    const dateStr = date.format('YYYY-MM-DD');
    const dayExpiries = byDate[dateStr];
    if (!dayExpiries || dayExpiries.length === 0) return null;

    const totalMV = dayExpiries.reduce((s, e) => s + e.marketValue, 0);
    return (
      <div
        style={{ cursor: 'pointer' }}
        onClick={() => { setSelectedDate(dateStr); setDetailModal(true); }}
      >
        <Badge
          count={dayExpiries.length}
          size="small"
          style={{ backgroundColor: totalMV > 1e10 ? '#cf1322' : '#1890ff' }}
        />
        <div style={{ fontSize: 11, color: '#666' }}>
          {formatAmount(totalMV)}
        </div>
      </div>
    );
  };

  const handlePanelChange = (date: Dayjs) => {
    fetchData(date.year(), date.month() + 1);
  };

  const columns: ColumnsType<LockupExpiry> = [
    {
      title: '排名',
      key: 'rank',
      width: 60,
      render: (_: unknown, __: unknown, index: number) => {
        const rank = index + 1;
        const colors = ['#FFD700', '#C0C0C0', '#CD7F32'];
        return rank <= 3
          ? <Tag color={colors[rank - 1]}>{rank}</Tag>
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
      title: '解禁日期',
      dataIndex: 'expiryDate',
      width: 110,
      sorter: (a, b) => a.expiryDate.localeCompare(b.expiryDate),
    },
    {
      title: '解禁类型',
      dataIndex: 'lockupType',
      width: 140,
      render: (val: string) => <Tag>{val}</Tag>,
    },
    {
      title: '股东',
      dataIndex: 'shareholder',
      width: 100,
    },
    {
      title: '解禁股数',
      dataIndex: 'totalShares',
      width: 110,
      render: (val: number) => formatShares(val),
      sorter: (a, b) => a.totalShares - b.totalShares,
    },
    {
      title: '占流通股比',
      dataIndex: 'unlockRatio',
      width: 110,
      render: (val: number) => {
        const color = val > 10 ? '#cf1322' : val > 5 ? '#fa8c16' : '#3f8600';
        return <Text style={{ color }}>{val.toFixed(2)}%</Text>;
      },
      sorter: (a, b) => a.unlockRatio - b.unlockRatio,
      defaultSortOrder: 'descend',
    },
    {
      title: '解禁市值',
      dataIndex: 'marketValue',
      width: 110,
      render: (val: number) => (
        <Text strong style={{ color: '#1890ff' }}>{formatAmount(val)}</Text>
      ),
      sorter: (a, b) => a.marketValue - b.marketValue,
    },
  ];

  const selectedExpiries = selectedDate ? byDate[selectedDate] || [] : [];

  return (
    <div style={{ padding: 24 }}>
      <Row justify="space-between" align="middle" style={{ marginBottom: 16 }}>
        <Col>
          <Title level={4} style={{ margin: 0 }}>
            <LockOutlined /> 限售股解禁
          </Title>
        </Col>
        <Col>
          <Button icon={<ReloadOutlined />} onClick={() => fetchData()} loading={loading}>刷新</Button>
        </Col>
      </Row>

      {/* 统计卡片 */}
      {summary && (
        <Row gutter={16} style={{ marginBottom: 16 }}>
          <Col xs={12} sm={6}>
            <Card size="small">
              <Statistic title="解禁个股" value={summary.totalStocks} prefix={<LockOutlined />} />
            </Card>
          </Col>
          <Col xs={12} sm={6}>
            <Card size="small">
              <Statistic title="解禁事件" value={summary.totalEvents} prefix={<CalendarOutlined />} />
            </Card>
          </Col>
          <Col xs={12} sm={6}>
            <Card size="small">
              <Statistic
                title="总解禁市值"
                value={formatAmount(summary.totalMarketValue)}
                prefix={<DollarOutlined />}
              />
            </Card>
          </Col>
          <Col xs={12} sm={6}>
            <Card size="small">
              <Statistic
                title="平均占比"
                value={summary.avgUnlockRatio}
                precision={2}
                suffix="%"
                prefix={<WarningOutlined />}
              />
            </Card>
          </Col>
        </Row>
      )}

      <Row gutter={16}>
        {/* 日历 */}
        <Col xs={24} lg={14}>
          <Card title="解禁日历" loading={loading}>
            <Calendar
              dateCellRender={dateCellRender}
              onPanelChange={handlePanelChange}
              fullscreen={false}
            />
          </Card>
        </Col>

        {/* 解禁排行 */}
        <Col xs={24} lg={10}>
          <Card title="解禁市值排行" loading={loading}>
            <Table
              columns={columns}
              dataSource={expiries.slice(0, 10)}
              rowKey="id"
              size="small"
              pagination={false}
              scroll={{ x: 800 }}
            />
          </Card>
        </Col>
      </Row>

      {/* 详情弹窗 */}
      <Modal
        title={`${selectedDate} 解禁详情`}
        open={detailModal}
        onCancel={() => setDetailModal(false)}
        footer={null}
        width={800}
      >
        <Table
          columns={columns.filter(c => c.title !== '排名')}
          dataSource={selectedExpiries}
          rowKey="id"
          size="small"
          pagination={false}
        />
      </Modal>
    </div>
  );
};

export default LockupCalendarPage;
