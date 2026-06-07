/**
 * 股东增减持页面
 * 参考东方财富股东增减持数据展示
 */

import React, { useState, useEffect, useCallback } from 'react';
import logger from '../utils/logger';
import { apiService } from '../services/api';
import {
  Card, Table, Tag, Space, Typography, Row, Col, Statistic,
  Button, Segmented, Select, Tooltip,
} from 'antd';
import {
  TeamOutlined, RiseOutlined, FallOutlined, UserAddOutlined,
  UserDeleteOutlined, ReloadOutlined,
} from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';

const { Title, Text } = Typography;

interface ShareholderChange {
  id: number;
  symbol: string;
  name: string;
  shareholderName: string;
  shareholderType: 'institution' | 'individual';
  changeType: 'increase' | 'decrease' | 'new' | 'exit';
  heldShares: number;
  changeShares: number;
  heldPercent: number;
  changePercent: number;
  announceDate: string;
  source: string;
}

interface ChangeSummary {
  increaseCount: number;
  decreaseCount: number;
  newCount: number;
  exitCount: number;
}

const formatShares = (val: number): string => {
  const abs = Math.abs(val);
  if (abs >= 1e8) return `${(val / 1e8).toFixed(2)}亿股`;
  if (abs >= 1e4) return `${(val / 1e4).toFixed(2)}万股`;
  return `${val}股`;
};

const changeTypeConfig: Record<string, { color: string; icon: React.ReactNode; label: string }> = {
  increase: { color: '#cf1322', icon: <RiseOutlined />, label: '增持' },
  decrease: { color: '#3f8600', icon: <FallOutlined />, label: '减持' },
  new: { color: '#1890ff', icon: <UserAddOutlined />, label: '新进' },
  exit: { color: '#999', icon: <UserDeleteOutlined />, label: '退出' },
};

const ShareholderChangesPage: React.FC = () => {
  const [changes, setChanges] = useState<ShareholderChange[]>([]);
  const [summary, setSummary] = useState<ChangeSummary | null>(null);
  const [loading, setLoading] = useState(false);
  const [filterType, setFilterType] = useState<string>('all');
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const params: Record<string, unknown> = { page, pageSize: '20' };
      if (filterType !== 'all') params.type = filterType;

      const res = await apiService.get<{
        changes: ShareholderChange[];
        summary: ChangeSummary;
        pagination: { total: number };
      }>('/shareholder-changes', params);
      if (res.success) {
        setChanges(res.data.changes);
        setSummary(res.data.summary);
        setTotal(res.data.pagination.total);
      }
    } catch (err) {
      logger.error('加载增减持数据失败:', err);
    } finally {
      setLoading(false);
    }
  }, [page, filterType]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const columns: ColumnsType<ShareholderChange> = [
    {
      title: '股票',
      key: 'stock',
      width: 140,
      fixed: 'left',
      render: (_, record) => (
        <Space direction="vertical" size={0}>
          <a href={`/stock/${record.symbol}`} style={{ fontWeight: 600 }}>{record.name}</a>
          <Text type="secondary" style={{ fontSize: 12 }}>{record.symbol}</Text>
        </Space>
      ),
    },
    {
      title: '股东名称',
      dataIndex: 'shareholderName',
      width: 200,
      ellipsis: { showTitle: false },
      render: (val: string, record) => (
        <Space>
          <Tooltip title={val}>
            <Text>{val}</Text>
          </Tooltip>
          <Tag color={record.shareholderType === 'institution' ? 'blue' : 'default'}>
            {record.shareholderType === 'institution' ? '机构' : '个人'}
          </Tag>
        </Space>
      ),
    },
    {
      title: '变动类型',
      dataIndex: 'changeType',
      width: 100,
      filters: [
        { text: '增持', value: 'increase' },
        { text: '减持', value: 'decrease' },
        { text: '新进', value: 'new' },
        { text: '退出', value: 'exit' },
      ],
      render: (val: string) => {
        const config = changeTypeConfig[val];
        return (
          <Tag color={config.color} icon={config.icon}>{config.label}</Tag>
        );
      },
    },
    {
      title: '变动股数',
      dataIndex: 'changeShares',
      width: 120,
      render: (val: number) => {
        const color = val > 0 ? '#cf1322' : '#3f8600';
        return <Text style={{ color }}>{formatShares(val)}</Text>;
      },
      sorter: (a, b) => a.changeShares - b.changeShares,
    },
    {
      title: '变动比例',
      dataIndex: 'changePercent',
      width: 100,
      render: (val: number) => {
        const prefix = val > 0 ? '+' : '';
        const color = val > 0 ? '#cf1322' : '#3f8600';
        return <Text style={{ color }}>{prefix}{val.toFixed(2)}%</Text>;
      },
      sorter: (a, b) => a.changePercent - b.changePercent,
    },
    {
      title: '持有股数',
      dataIndex: 'heldShares',
      width: 120,
      render: (val: number) => formatShares(val),
      sorter: (a, b) => a.heldShares - b.heldShares,
    },
    {
      title: '持股比例',
      dataIndex: 'heldPercent',
      width: 100,
      render: (val: number) => `${val.toFixed(2)}%`,
      sorter: (a, b) => a.heldPercent - b.heldPercent,
    },
    {
      title: '公告日期',
      dataIndex: 'announceDate',
      width: 120,
      sorter: (a, b) => a.announceDate.localeCompare(b.announceDate),
    },
    {
      title: '来源',
      dataIndex: 'source',
      width: 100,
      render: (val: string) => <Tag>{val}</Tag>,
    },
  ];

  return (
    <div style={{ padding: 24 }}>
      <Row justify="space-between" align="middle" style={{ marginBottom: 16 }}>
        <Col>
          <Title level={4} style={{ margin: 0 }}>
            <TeamOutlined /> 股东增减持
          </Title>
        </Col>
        <Col>
          <Space>
            <Select
              value={filterType}
              onChange={setFilterType}
              style={{ width: 120 }}
              options={[
                { label: '全部', value: 'all' },
                { label: '增持', value: 'increase' },
                { label: '减持', value: 'decrease' },
                { label: '新进', value: 'new' },
                { label: '退出', value: 'exit' },
              ]}
            />
            <Button icon={<ReloadOutlined />} onClick={fetchData} loading={loading}>刷新</Button>
          </Space>
        </Col>
      </Row>

      {/* 统计卡片 */}
      {summary && (
        <Row gutter={16} style={{ marginBottom: 16 }}>
          <Col xs={12} sm={6}>
            <Card size="small">
              <Statistic
                title="增持"
                value={summary.increaseCount}
                prefix={<RiseOutlined />}
                valueStyle={{ color: '#cf1322' }}
              />
            </Card>
          </Col>
          <Col xs={12} sm={6}>
            <Card size="small">
              <Statistic
                title="减持"
                value={summary.decreaseCount}
                prefix={<FallOutlined />}
                valueStyle={{ color: '#3f8600' }}
              />
            </Card>
          </Col>
          <Col xs={12} sm={6}>
            <Card size="small">
              <Statistic
                title="新进"
                value={summary.newCount}
                prefix={<UserAddOutlined />}
                valueStyle={{ color: '#1890ff' }}
              />
            </Card>
          </Col>
          <Col xs={12} sm={6}>
            <Card size="small">
              <Statistic
                title="退出"
                value={summary.exitCount}
                prefix={<UserDeleteOutlined />}
                valueStyle={{ color: '#999' }}
              />
            </Card>
          </Col>
        </Row>
      )}

      {/* 数据表格 */}
      <Card>
        <Table
          columns={columns}
          dataSource={changes}
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
          scroll={{ x: 1100 }}
        />
      </Card>
    </div>
  );
};

export default ShareholderChangesPage;
