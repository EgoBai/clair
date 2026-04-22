/**
 * 股东持股变化图组件
 * 十大股东持股比例 + 持股变化趋势
 */

import React from 'react';
import { Card, Table, Tag, Progress, Typography } from 'antd';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  LineChart, Line, Legend,
} from 'recharts';
import { ArrowUpOutlined, ArrowDownOutlined, BankOutlined, UserOutlined } from '@ant-design/icons';
import type { ShareholderInfo, TopShareholders } from '../../../../shared/types';

const { Text } = Typography;

interface ShareholderChartProps {
  data: TopShareholders | null;
  loading?: boolean;
}

export const ShareholderChart: React.FC<ShareholderChartProps> = ({ data, loading }) => {
  if (!data) return <Card loading={loading} title="十大股东" />;

  const columns = [
    {
      title: '排名',
      dataIndex: 'rank',
      key: 'rank',
      width: 50,
      render: (v: number) => v <= 3
        ? <Tag color={['gold', 'silver', 'bronze'][v - 1]}>{v}</Tag>
        : v,
    },
    {
      title: '股东名称',
      dataIndex: 'name',
      key: 'name',
      render: (v: string, r: ShareholderInfo) => (
        <span>
          {r.isOrganizational
            ? <BankOutlined style={{ color: '#722ed1', marginRight: 4 }} />
            : <UserOutlined style={{ color: '#1890ff', marginRight: 4 }} />}
          {v}
        </span>
      ),
    },
    {
      title: '持股数',
      dataIndex: 'shares',
      key: 'shares',
      render: (val: number) => formatShares(val),
      align: 'right' as const,
    },
    {
      title: '持股比例',
      dataIndex: 'percent',
      key: 'percent',
      width: 180,
      render: (val: number) => (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <Progress
            percent={val}
            size="small"
            showInfo={false}
            strokeColor={val > 10 ? '#722ed1' : val > 5 ? '#1890ff' : '#52c41a'}
            style={{ flex: 1 }}
          />
          <span style={{ fontSize: 12, minWidth: 45 }}>{val.toFixed(2)}%</span>
        </div>
      ),
    },
    {
      title: '变动',
      dataIndex: 'changeType',
      key: 'changeType',
      width: 100,
      render: (type: string, r: ShareholderInfo) => {
        if (type === 'new') return <Tag color="blue">新进</Tag>;
        if (type === 'increase') return (
          <Tag color="red"><ArrowUpOutlined /> +{r.changeShares ? formatShares(r.changeShares) : ''}</Tag>
        );
        if (type === 'decrease') return (
          <Tag color="green"><ArrowDownOutlined /> {r.changeShares ? formatShares(r.changeShares) : ''}</Tag>
        );
        return <Tag>不变</Tag>;
      },
    },
  ];

  // 柱状图数据
  const barData = data.shareholders.map(s => ({
    name: s.name.length > 6 ? s.name.substring(0, 6) + '...' : s.name,
    percent: s.percent,
    shares: s.shares,
  }));

  return (
    <Card title={`十大股东 (${data.reportDate})`} loading={loading} size="small">
      <div style={{ marginBottom: 16, display: 'flex', gap: 24 }}>
        <Text type="secondary">
          前十合计持股：
          <Text strong>{data.topTenTotalPercent.toFixed(2)}%</Text>
        </Text>
        {data.changeFromLast && (
          <>
            <Text type="secondary">
              股东人数：
              <Text strong>{data.changeFromLast.totalHolders.toLocaleString()}</Text>
            </Text>
            <Text type="secondary">
              筹码集中度变化：
              <Text strong style={{
                color: data.changeFromLast.concentrationChange > 0 ? '#cf1322' : '#3f8600',
              }}>
                {data.changeFromLast.concentrationChange > 0 ? '+' : ''}
                {(data.changeFromLast.concentrationChange * 100).toFixed(2)}%
              </Text>
            </Text>
          </>
        )}
      </div>

      {/* 持股比例柱状图 */}
      <ResponsiveContainer width="100%" height={180}>
        <BarChart data={barData} layout="vertical" margin={{ left: 60 }}>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis type="number" domain={[0, 'dataMax']} tickFormatter={v => `${v}%`} />
          <YAxis type="category" dataKey="name" width={80} tick={{ fontSize: 11 }} />
          <Tooltip formatter={(val) => [`${Number(val).toFixed(2)}%`, '持股比例']} />
          <Bar dataKey="percent" fill="#1890ff" radius={[0, 4, 4, 0]} barSize={14} />
        </BarChart>
      </ResponsiveContainer>

      {/* 持股明细表 */}
      <Table
        dataSource={data.shareholders}
        columns={columns}
        rowKey="rank"
        pagination={false}
        size="small"
        style={{ marginTop: 16 }}
      />
    </Card>
  );
};

function formatShares(val: number): string {
  if (val >= 1e8) return (val / 1e8).toFixed(2) + '亿股';
  if (val >= 1e4) return (val / 1e4).toFixed(2) + '万股';
  return val.toLocaleString() + '股';
}

export default ShareholderChart;
