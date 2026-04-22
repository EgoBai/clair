/**
 * 盘口数据组件
 * 买一~买五、卖一~卖五、委比
 * 参考东方财富盘口样式
 */

import React, { useMemo } from 'react';
import { Table, Progress, Card, Statistic, Row, Col, Tag } from 'antd';
import type { OrderBook, OrderBookLevel } from '../../../../shared/types';

interface OrderBookPanelProps {
  data: OrderBook | null;
  loading?: boolean;
}

export const OrderBookPanel: React.FC<OrderBookPanelProps> = ({ data, loading }) => {
  const bidColumns = [
    {
      title: '买盘',
      dataIndex: 'price',
      key: 'price',
      render: (val: number) => (
        <span style={{ color: '#cf1322', fontWeight: 500 }}>{val.toFixed(2)}</span>
      ),
    },
    {
      title: '成交量',
      dataIndex: 'volume',
      key: 'volume',
      align: 'right' as const,
      render: (val: number) => formatVolumeShort(val),
    },
  ];

  const askColumns = [
    {
      title: '卖盘',
      dataIndex: 'price',
      key: 'price',
      render: (val: number) => (
        <span style={{ color: '#3f8600', fontWeight: 500 }}>{val.toFixed(2)}</span>
      ),
    },
    {
      title: '成交量',
      dataIndex: 'volume',
      key: 'volume',
      align: 'right' as const,
      render: (val: number) => formatVolumeShort(val),
    },
  ];

  const bidAskRatioColor = data && data.bidAskRatio > 0 ? '#cf1322' : data && data.bidAskRatio < 0 ? '#3f8600' : '#8c8c8c';

  return (
    <Card title="盘口数据" loading={loading} size="small">
      {data && (
        <>
          <Row gutter={16} style={{ marginBottom: 16 }}>
            <Col span={8}>
              <Statistic
                title="委比"
                value={data.bidAskRatio}
                precision={2}
                suffix="%"
                valueStyle={{ color: bidAskRatioColor, fontSize: 16 }}
              />
            </Col>
            <Col span={8}>
              <Statistic
                title="总买量"
                value={formatVolumeShort(data.totalBidVolume)}
                valueStyle={{ color: '#cf1322', fontSize: 16 }}
              />
            </Col>
            <Col span={8}>
              <Statistic
                title="总卖量"
                value={formatVolumeShort(data.totalAskVolume)}
                valueStyle={{ color: '#3f8600', fontSize: 16 }}
              />
            </Col>
          </Row>

          <div style={{ display: 'flex', gap: 16 }}>
            <div style={{ flex: 1 }}>
              <Table
                dataSource={[...data.asks].reverse()}
                columns={askColumns}
                pagination={false}
                size="small"
                rowKey={(_, i) => `ask-${i}`}
                showHeader={false}
              />
            </div>
            <div style={{ flex: 1 }}>
              <Table
                dataSource={data.bids}
                columns={bidColumns}
                pagination={false}
                size="small"
                rowKey={(_, i) => `bid-${i}`}
                showHeader={false}
              />
            </div>
          </div>

          <div style={{ marginTop: 12 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: 12, color: '#8c8c8c' }}>买卖力量对比</span>
              <Progress
                percent={50 + data.bidAskRatio / 2}
                strokeColor="#cf1322"
                trailColor="#3f8600"
                showInfo={false}
                size="small"
              />
            </div>
          </div>
        </>
      )}
    </Card>
  );
};

// 格式化成交量(短)
function formatVolumeShort(vol: number): string {
  if (vol >= 1e8) return (vol / 1e8).toFixed(1) + '亿';
  if (vol >= 1e4) return (vol / 1e4).toFixed(0) + '万';
  return vol.toString();
}

export default OrderBookPanel;
