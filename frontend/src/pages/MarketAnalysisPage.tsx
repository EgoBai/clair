/**
 * 市场分析页
 * 涨跌分布、行业板块、排行榜
 */

import React, { useEffect, useState } from 'react';
import { Card, Row, Col, Table, Tag, Spin, Tabs, Statistic, Space, Typography, Tooltip } from 'antd';
import {
  ArrowUpOutlined, ArrowDownOutlined, StockOutlined, PieChartOutlined,
  FieldTimeOutlined, ReloadOutlined,
} from '@ant-design/icons';
import ReactECharts from 'echarts-for-react';
import type { ColumnsType } from 'antd/es/table';
import { apiService } from '../services/api';
import { useAppStore } from '../store/useAppStore';

const { Title, Text } = Typography;

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

  const formatMarketCap = (cap: number) => {
    if (cap >= 1e12) return `${(cap / 1e12).toFixed(2)}万亿`;
    if (cap >= 1e8) return `${(cap / 1e8).toFixed(2)}亿`;
    return cap.toString();
  };

  const stockColumns: ColumnsType<any> = [
    {
      title: '#',
      width: 50,
      render: (_: any, __: any, index: number) => (
        <span style={{
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          width: 20,
          height: 20,
          borderRadius: 4,
          fontSize: 11,
          fontWeight: 600,
          color: index < 3 ? '#fff' : '#999',
          background: index === 0 ? '#EF4444' : index === 1 ? '#F97316' : index === 2 ? '#F59E0B' : '#f0f0f0',
        }}>
          {index + 1}
        </span>
      ),
    },
    {
      title: '代码',
      dataIndex: 'symbol',
      width: 100,
      render: (val: string) => <Text strong style={{ fontSize: 12 }}>{val}</Text>,
    },
    {
      title: '名称',
      dataIndex: 'name',
      width: 90,
      render: (val: string) => <Text style={{ fontSize: 12 }}>{val}</Text>,
    },
    {
      title: '最新价',
      dataIndex: 'closePrice',
      width: 80,
      align: 'right',
      render: (val: number, record) => {
        if (!val) return '-';
        const color = (record.changePercent ?? 0) >= 0 ? '#EF4444' : '#22C55E';
        return <Text style={{ fontFamily: 'monospace', fontSize: 12, color }}>{val.toFixed(2)}</Text>;
      },
    },
    {
      title: '涨跌幅',
      dataIndex: 'changePercent',
      width: 90,
      align: 'right',
      render: (val: number) => {
        if (val === undefined) return '-';
        return (
          <Tag color={val >= 0 ? 'red' : 'green'} style={{ fontFamily: 'monospace', fontSize: 11 }}>
            {val >= 0 ? '+' : ''}{val.toFixed(2)}%
          </Tag>
        );
      },
      sorter: (a, b) => (a.changePercent ?? 0) - (b.changePercent ?? 0),
    },
    {
      title: '成交额',
      dataIndex: 'turnover',
      width: 80,
      align: 'right',
      render: (val: number) => (
        <Text style={{ fontFamily: 'monospace', fontSize: 12 }}>{formatTurnover(val)}</Text>
      ),
    },
  ];

  // 涨跌分布环形图
  const pieOption = marketSummary ? {
    tooltip: { trigger: 'item', formatter: '{b}: {c}只 ({d}%)' },
    legend: { bottom: 5, textStyle: { fontSize: 11 } },
    series: [{
      type: 'pie',
      radius: ['40%', '65%'],
      center: ['50%', '45%'],
      label: { show: true, formatter: '{b}\n{c}只', fontSize: 11 },
      data: [
        { value: marketSummary.risingStocks, name: '上涨', itemStyle: { color: '#EF4444' } },
        { value: marketSummary.fallingStocks, name: '下跌', itemStyle: { color: '#22C55E' } },
        { value: marketSummary.unchangedStocks, name: '平盘', itemStyle: { color: '#94A3B8' } },
      ],
    }],
  } : {};

  // 行业柱状图
  const industryBarOption = industries.length > 0 ? {
    tooltip: {
      trigger: 'axis',
      axisPointer: { type: 'shadow' },
      formatter: (params: any) => {
        const p = params[0];
        return `${p.name}<br/>涨跌幅: ${p.value >= 0 ? '+' : ''}${p.value.toFixed(2)}%`;
      },
    },
    grid: { left: '15%', right: '8%', top: '8%', bottom: '18%' },
    xAxis: {
      type: 'category',
      data: industries.slice(0, 15).map((i: any) => i.industry || i.ind),
      axisLabel: { rotate: 45, fontSize: 10 },
    },
    yAxis: {
      type: 'value',
      name: '涨跌幅(%)',
      axisLabel: { formatter: '{value}%' },
    },
    series: [{
      type: 'bar',
      data: industries.slice(0, 15).map((i: any) => {
        const val = i.avgChangePercent ?? i.avg_change_percent ?? 0;
        return {
          value: val,
          itemStyle: {
            color: val >= 0 ? '#EF4444' : '#22C55E',
            borderRadius: [3, 3, 0, 0],
          },
        };
      }),
      barMaxWidth: 30,
    }],
  } : {};

  const tabItems = [
    {
      key: 'gainers',
      label: <Space><ArrowUpOutlined style={{ color: '#EF4444' }} /> 涨幅榜</Space>,
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
      label: <Space><ArrowDownOutlined style={{ color: '#22C55E' }} /> 跌幅榜</Space>,
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
      label: <Space><FieldTimeOutlined style={{ color: '#8B5CF6' }} /> 成交额榜</Space>,
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
        {/* 页面标题 */}
        <div style={{
          marginBottom: 12,
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
        }}>
          <Title level={5} style={{ margin: 0 }}>📊 市场分析</Title>
          <Tooltip title="刷新">
            <ReloadOutlined
              spin={loading}
              onClick={loadData}
              style={{ cursor: 'pointer', color: '#1890ff' }}
            />
          </Tooltip>
        </div>

        {/* 核心指标 */}
        {marketSummary && (
          <Row gutter={[12, 12]} style={{ marginBottom: 12 }}>
            <Col xs={12} sm={6}>
              <Card size="small">
                <Statistic
                  title="总股票数"
                  value={marketSummary.totalStocks}
                  prefix={<StockOutlined style={{ color: '#F59E0B' }} />}
                  suffix="只"
                  valueStyle={{ fontSize: 18 }}
                />
              </Card>
            </Col>
            <Col xs={12} sm={6}>
              <Card size="small">
                <Statistic
                  title="总市值"
                  value={formatMarketCap(marketSummary.totalMarketCap)}
                  valueStyle={{ fontSize: 18 }}
                />
              </Card>
            </Col>
            <Col xs={12} sm={6}>
              <Card size="small">
                <Statistic
                  title="上涨"
                  value={marketSummary.risingStocks}
                  valueStyle={{ color: '#EF4444', fontSize: 18 }}
                  prefix={<ArrowUpOutlined />}
                  suffix="只"
                />
              </Card>
            </Col>
            <Col xs={12} sm={6}>
              <Card size="small">
                <Statistic
                  title="下跌"
                  value={marketSummary.fallingStocks}
                  valueStyle={{ color: '#22C55E', fontSize: 18 }}
                  prefix={<ArrowDownOutlined />}
                  suffix="只"
                />
              </Card>
            </Col>
          </Row>
        )}

        <Row gutter={[12, 12]}>
          {/* 涨跌分布 */}
          <Col xs={24} md={8}>
            <Card
              title={<Space><PieChartOutlined /> 涨跌分布</Space>}
              size="small"
              style={{ height: '100%' }}
            >
              {marketSummary ? (
                <ReactECharts
                  option={pieOption}
                  style={{ height: '280px', width: '100%' }}
                  notMerge
                />
              ) : (
                <div style={{ height: 280, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#ccc' }}>
                  暂无数据
                </div>
              )}
            </Card>
          </Col>

          {/* 行业板块 */}
          <Col xs={24} md={16}>
            <Card title="行业板块涨跌" size="small" style={{ height: '100%' }}>
              {industries.length > 0 ? (
                <ReactECharts
                  option={industryBarOption}
                  style={{ height: '280px', width: '100%' }}
                  notMerge
                />
              ) : (
                <div style={{ height: 280, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#ccc' }}>
                  暂无行业数据
                </div>
              )}
            </Card>
          </Col>
        </Row>

        {/* 排行榜 */}
        <Card size="small" style={{ marginTop: 12 }}>
          <Tabs items={tabItems} size="small" />
        </Card>
      </Spin>
    </div>
  );
};

export default MarketAnalysisPage;
