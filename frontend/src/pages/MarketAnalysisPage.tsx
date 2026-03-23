/**
 * 市场分析页
 */

import React, { useEffect, useState } from 'react';
import { Card, Row, Col, Table, Tag, Spin, Tabs, Statistic, Space } from 'antd';
import {
  ArrowUpOutlined, ArrowDownOutlined, StockOutlined, PieChartOutlined
} from '@ant-design/icons';
import ReactECharts from 'echarts-for-react';
import type { ColumnsType } from 'antd/es/table';
import { apiService } from '../services/api';
import { useAppStore } from '../store/useAppStore';

const MarketAnalysisPage: React.FC = () => {
  const { marketSummary, setMarketSummary } = useAppStore();
  const [loading, setLoading] = useState(false);
  const [topGainers, setTopGainers] = useState<any[]>([]);
  const [topLosers, setTopLosers] = useState<any[]>([]);
  const [topTurnover, setTopTurnover] = useState<any[]>([]);
  const [industries, setIndustries] = useState<any[]>([]);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);
    try {
      const [summaryRes, gainersRes, losersRes, turnoverRes, industriesRes] = await Promise.all([
        apiService.getMarketSummary().catch(() => ({ success: false, data: null })),
        apiService.getTopGainers(undefined, 20).catch(() => ({ success: false, data: { topGainers: [] } })),
        apiService.getTopLosers(undefined, 20).catch(() => ({ success: false, data: { topLosers: [] } })),
        apiService.getTopTurnover(undefined, 20).catch(() => ({ success: false, data: { topTurnover: [] } })),
        apiService.getIndustryPerformance().catch(() => ({ success: false, data: { industries: [] } })),
      ]);

      if (summaryRes.success) setMarketSummary(summaryRes.data);
      if (gainersRes.success) setTopGainers(gainersRes.data.topGainers);
      if (losersRes.success) setTopLosers(losersRes.data.topLosers);
      if (turnoverRes.success) setTopTurnover(turnoverRes.data.topTurnover);
      if (industriesRes.success) setIndustries(industriesRes.data.industries || []);
    } catch (error) {
      console.error('加载市场数据失败:', error);
    } finally {
      setLoading(false);
    }
  };

  const formatTurnover = (turnover: number) => {
    if (turnover >= 1e8) return `${(turnover / 1e8).toFixed(2)}亿`;
    if (turnover >= 1e4) return `${(turnover / 1e4).toFixed(2)}万`;
    return turnover.toString();
  };

  const stockColumns: ColumnsType<any> = [
    {
      title: '排名',
      width: 60,
      render: (_: any, __: any, index: number) => index + 1,
    },
    {
      title: '代码',
      dataIndex: 'symbol',
      width: 100,
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
      align: 'right',
      render: (val: number) => val?.toFixed(2) ?? '-',
    },
    {
      title: '涨跌幅',
      dataIndex: 'changePercent',
      width: 90,
      align: 'right',
      render: (val: number) => (
        <Tag color={val >= 0 ? 'red' : 'green'}>
          {val >= 0 ? '+' : ''}{val?.toFixed(2)}%
        </Tag>
      ),
    },
    {
      title: '成交额',
      dataIndex: 'turnover',
      width: 90,
      align: 'right',
      render: (val: number) => formatTurnover(val),
    },
  ];

  // 涨跌分布饼图
  const pieOption = marketSummary ? {
    tooltip: { trigger: 'item' },
    legend: { bottom: '5%', center: 'center' },
    series: [{
      type: 'pie',
      radius: ['40%', '65%'],
      center: ['50%', '45%'],
      label: { show: true, formatter: '{b}: {c} ({d}%)' },
      data: [
        { value: marketSummary.risingStocks, name: '上涨', itemStyle: { color: '#ef4444' } },
        { value: marketSummary.fallingStocks, name: '下跌', itemStyle: { color: '#22c55e' } },
        { value: marketSummary.unchangedStocks, name: '平盘', itemStyle: { color: '#94a3b8' } },
      ],
    }],
  } : {};

  // 行业柱状图
  const industryBarOption = industries.length > 0 ? {
    tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' } },
    grid: { left: '15%', right: '5%', bottom: '15%' },
    xAxis: {
      type: 'category',
      data: industries.slice(0, 15).map((i: any) => i.industry || i.ind),
      axisLabel: { rotate: 45, fontSize: 10 },
    },
    yAxis: { type: 'value', name: '涨跌幅(%)' },
    series: [{
      type: 'bar',
      data: industries.slice(0, 15).map((i: any) => ({
        value: i.avgChangePercent ?? i.avg_change_percent ?? 0,
        itemStyle: {
          color: (i.avgChangePercent ?? i.avg_change_percent ?? 0) >= 0 ? '#ef4444' : '#22c55e',
        },
      })),
    }],
  } : {};

  const tabItems = [
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
          scroll={{ y: 400 }}
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
          scroll={{ y: 400 }}
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
          scroll={{ y: 400 }}
        />
      ),
    },
  ];

  return (
    <div style={{ padding: '16px' }}>
      <Spin spinning={loading}>
        {/* 市场统计 */}
        {marketSummary && (
          <Row gutter={[16, 16]} style={{ marginBottom: 16 }}>
            <Col xs={12} sm={6}>
              <Card size="small">
                <Statistic title="总股票数" value={marketSummary.totalStocks} prefix={<StockOutlined />} />
              </Card>
            </Col>
            <Col xs={12} sm={6}>
              <Card size="small">
                <Statistic
                  title="总市值"
                  value={marketSummary.totalMarketCap >= 1e12
                    ? `${(marketSummary.totalMarketCap / 1e12).toFixed(2)}万亿`
                    : `${(marketSummary.totalMarketCap / 1e8).toFixed(2)}亿`}
                />
              </Card>
            </Col>
            <Col xs={12} sm={6}>
              <Card size="small">
                <Statistic
                  title="上涨"
                  value={marketSummary.risingStocks}
                  valueStyle={{ color: '#ef4444' }}
                  prefix={<ArrowUpOutlined />}
                />
              </Card>
            </Col>
            <Col xs={12} sm={6}>
              <Card size="small">
                <Statistic
                  title="下跌"
                  value={marketSummary.fallingStocks}
                  valueStyle={{ color: '#22c55e' }}
                  prefix={<ArrowDownOutlined />}
                />
              </Card>
            </Col>
          </Row>
        )}

        <Row gutter={[16, 16]}>
          {/* 涨跌分布 */}
          <Col xs={24} md={8}>
            <Card title={<Space><PieChartOutlined /> 涨跌分布</Space>} size="small">
              <ReactECharts
                option={pieOption}
                style={{ height: '300px', width: '100%' }}
                notMerge
              />
            </Card>
          </Col>

          {/* 行业板块 */}
          <Col xs={24} md={16}>
            <Card title="行业板块涨跌" size="small">
              <ReactECharts
                option={industryBarOption}
                style={{ height: '300px', width: '100%' }}
                notMerge
              />
            </Card>
          </Col>
        </Row>

        {/* 涨跌榜 */}
        <Card size="small" style={{ marginTop: 16 }}>
          <Tabs items={tabItems} size="small" />
        </Card>
      </Spin>
    </div>
  );
};

export default MarketAnalysisPage;
