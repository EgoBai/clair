/**
 * 市场概览组件
 * 展示A股市场整体情况：涨跌分布、主要指数、热门行业
 */

import React, { useState, useEffect } from 'react';
import { Card, Row, Col, Statistic, Table, Tag, Space, Tabs, Spin } from 'antd';
import {
  ArrowUpOutlined,
  ArrowDownOutlined,
  StockOutlined,
  PieChartOutlined,
} from '@ant-design/icons';
import ReactECharts from 'echarts-for-react';
import type { ColumnsType } from 'antd/es/table';

interface MarketIndex {
  symbol: string;
  name: string;
  close: number;
  change: number;
  changePercent: number;
}

interface TopStock {
  symbol: string;
  name: string;
  closePrice: number;
  changePercent: number;
  volume: number;
  turnover: number;
}

interface MarketSummary {
  totalStocks: number;
  totalMarketCap: number;
  totalTurnover: number;
  risingStocks: number;
  fallingStocks: number;
  unchangedStocks: number;
}

interface MarketOverviewProps {
  indices?: MarketIndex[];
  summary?: MarketSummary;
  topGainers?: TopStock[];
  topLosers?: TopStock[];
  topTurnover?: TopStock[];
  loading?: boolean;
}

const MarketOverview: React.FC<MarketOverviewProps> = ({
  indices = [],
  summary,
  topGainers = [],
  topLosers = [],
  topTurnover = [],
  loading = false,
}) => {
  const formatMarketCap = (cap: number) => {
    if (cap >= 1e12) return `${(cap / 1e12).toFixed(2)}万亿`;
    if (cap >= 1e8) return `${(cap / 1e8).toFixed(2)}亿`;
    return cap.toString();
  };

  const formatTurnover = (turnover: number) => {
    if (turnover >= 1e8) return `${(turnover / 1e8).toFixed(2)}亿`;
    if (turnover >= 1e4) return `${(turnover / 1e4).toFixed(2)}万`;
    return turnover.toString();
  };

  // 涨跌分布饼图配置
  const pieOption = summary
    ? {
        tooltip: { trigger: 'item' },
        legend: { bottom: '5%', center: 'center' },
        series: [
          {
            type: 'pie',
            radius: ['40%', '65%'],
            center: ['50%', '45%'],
            label: { show: true, formatter: '{b}: {c} ({d}%)' },
            data: [
              {
                value: summary.risingStocks,
                name: '上涨',
                itemStyle: { color: '#ef4444' },
              },
              {
                value: summary.fallingStocks,
                name: '下跌',
                itemStyle: { color: '#22c55e' },
              },
              {
                value: summary.unchangedStocks,
                name: '平盘',
                itemStyle: { color: '#94a3b8' },
              },
            ],
          },
        ],
      }
    : {};

  // 涨跌榜列表列
  const stockColumns: ColumnsType<TopStock> = [
    {
      title: '代码',
      dataIndex: 'symbol',
      width: 100,
      render: (val: string) => <span style={{ fontWeight: 500 }}>{val}</span>,
    },
    {
      title: '名称',
      dataIndex: 'name',
      width: 100,
    },
    {
      title: '最新价',
      dataIndex: 'closePrice',
      width: 80,
      render: (val: number) => val?.toFixed(2),
    },
    {
      title: '涨跌幅',
      dataIndex: 'changePercent',
      width: 80,
      render: (val: number) => (
        <Tag color={val >= 0 ? 'red' : 'green'}>
          {val >= 0 ? '+' : ''}
          {val?.toFixed(2)}%
        </Tag>
      ),
      sorter: (a, b) => a.changePercent - b.changePercent,
    },
    {
      title: '成交额',
      dataIndex: 'turnover',
      width: 80,
      render: (val: number) => formatTurnover(val),
    },
  ];

  const items = [
    {
      key: 'gainers',
      label: '涨幅榜',
      children: (
        <Table
          dataSource={topGainers}
          columns={stockColumns}
          rowKey="symbol"
          size="small"
          pagination={false}
          scroll={{ y: 300 }}
        />
      ),
    },
    {
      key: 'losers',
      label: '跌幅榜',
      children: (
        <Table
          dataSource={topLosers}
          columns={stockColumns}
          rowKey="symbol"
          size="small"
          pagination={false}
          scroll={{ y: 300 }}
        />
      ),
    },
    {
      key: 'turnover',
      label: '成交额榜',
      children: (
        <Table
          dataSource={topTurnover}
          columns={stockColumns}
          rowKey="symbol"
          size="small"
          pagination={false}
          scroll={{ y: 300 }}
        />
      ),
    },
  ];

  return (
    <Spin spinning={loading}>
      <Row gutter={[16, 16]}>
        {/* 主要指数 */}
        <Col span={24}>
          <Card
            title={
              <Space>
                <StockOutlined />
                主要指数
              </Space>
            }
            size="small"
          >
            <Row gutter={16}>
              {indices.map((index) => (
                <Col xs={12} sm={8} md={6} lg={4} key={index.symbol}>
                  <Card size="small" style={{ textAlign: 'center' }}>
                    <Statistic
                      title={index.name}
                      value={index.close}
                      precision={2}
                      valueStyle={{
                        color: index.changePercent >= 0 ? '#ef4444' : '#22c55e',
                        fontSize: 16,
                      }}
                      prefix={
                        index.changePercent >= 0 ? (
                          <ArrowUpOutlined />
                        ) : (
                          <ArrowDownOutlined />
                        )
                      }
                      suffix={`${index.changePercent >= 0 ? '+' : ''}${index.changePercent.toFixed(2)}%`}
                    />
                  </Card>
                </Col>
              ))}
            </Row>
          </Card>
        </Col>

        {/* 市场统计 + 涨跌分布 */}
        {summary && (
          <>
            <Col xs={24} md={12}>
              <Card
                title={
                  <Space>
                    <PieChartOutlined />
                    市场统计
                  </Space>
                }
                size="small"
              >
                <Row gutter={16}>
                  <Col span={8}>
                    <Statistic title="总股票数" value={summary.totalStocks} />
                  </Col>
                  <Col span={8}>
                    <Statistic
                      title="总市值"
                      value={formatMarketCap(summary.totalMarketCap)}
                    />
                  </Col>
                  <Col span={8}>
                    <Statistic
                      title="总成交额"
                      value={formatTurnover(summary.totalTurnover)}
                    />
                  </Col>
                </Row>
              </Card>
            </Col>
            <Col xs={24} md={12}>
              <Card title="涨跌分布" size="small">
                <ReactECharts
                  option={pieOption}
                  style={{ height: '250px', width: '100%' }}
                  notMerge={true}
                />
              </Card>
            </Col>
          </>
        )}

        {/* 涨跌榜 */}
        <Col span={24}>
          <Card size="small">
            <Tabs items={items} size="small" />
          </Card>
        </Col>
      </Row>
    </Spin>
  );
};

export default React.memo(MarketOverview);
