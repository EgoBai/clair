/**
 * 融资融券页面
 * 融资余额走势、融券余量、融资融券排行
 * 参考东方财富融资融券模块
 *
 * 数据由后端 /api/margin/* 实时提供；接口异常或为空时如实置空，绝不注入伪造演示数据。
 */

import React, { useState, useEffect } from 'react';
import logger from '../utils/logger';
import {
  Card, Row, Col, Statistic, Table, Radio, Tag, Typography, Spin, Alert,
} from 'antd';
import {
  ArrowUpOutlined, ArrowDownOutlined, DollarOutlined, StockOutlined,
} from '@ant-design/icons';
import {
  LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend, CartesianGrid,
} from 'recharts';
import { fetchMarginOverviewTyped, fetchMarginRank, fetchMarginTrend } from '../services/api';
import type { MarginOverview, MarginRankEntry } from '../../../shared/types';

const { Title, Text } = Typography;

/** 两融余额趋势（融资/融券），约30个交易日 */
interface MarginRecord {
  tradeDate: string;
  financingBalance: number;
  financingBuyAmount: number;
  financingRepayAmount: number;
  financingNetBuy: number;
  securitiesBalance: number;
  securitiesNetSell: number;
  totalBalance: number;
}


const MarginTradingPage: React.FC = () => {
  const [overview, setOverview] = useState<(MarginOverview & { dataSource?: string; notes?: string }) | null>(null);
  const [trend, setTrend] = useState<MarginRecord[]>([]);
  const [financingRank, setFinancingRank] = useState<MarginRankEntry[]>([]);
  const [securitiesRank, setSecuritiesRank] = useState<MarginRankEntry[]>([]);
  const [rankType, setRankType] = useState<string>('financing');
  const [loading, setLoading] = useState(true);

  const rankData = rankType === 'financing' ? financingRank : securitiesRank;

  useEffect(() => {
    loadData();
  }, []);

  useEffect(() => {
    loadRank(rankType);
  }, [rankType]);

  const loadData = async () => {
    setLoading(true);
    try {
      const [overviewRes, rankRes, trendRes] = await Promise.all([
        fetchMarginOverviewTyped(),
        fetchMarginRank('financing'),
        fetchMarginTrend(30),
      ]);
      setOverview(overviewRes);
      setFinancingRank(rankRes);
      // 真实两融趋势：/api/margin/trend 返回的 records 映射为图表数据；不可达时为空数组（诚实空态）
      setTrend((trendRes?.records ?? []) as MarginRecord[]);
    } catch (err) {
      logger.error('加载融资融券数据失败（后端未就绪或接口异常），已如实置空:', err);
      // 诚实数据红线：后端不可达时清空展示，绝不回填演示数据
      setOverview(null);
      setTrend([]);
      setFinancingRank([]);
      setSecuritiesRank([]);
    } finally {
      setLoading(false);
    }
  };

  const loadRank = async (type: string) => {
    try {
      const data = await fetchMarginRank(type);
      if (type === 'financing') setFinancingRank(data);
      else setSecuritiesRank(data);
    } catch (err) {
      logger.error('加载排行失败（后端未就绪或接口异常），已如实置空:', err);
      // 诚实数据红线：后端不可达时清空展示，绝不回填演示数据
      setFinancingRank([]);
      setSecuritiesRank([]);
    }
  };

  const rankColumns = [
    { title: '排名', dataIndex: 'rank', key: 'rank', width: 60,
      render: (val: number) => val <= 3
        ? <Tag color={['gold', 'silver', 'bronze'][val - 1]}>{val}</Tag>
        : val },
    { title: '代码', dataIndex: 'symbol', key: 'symbol' },
    { title: '名称', dataIndex: 'name', key: 'name' },
    {
      title: rankType === 'financing' ? '融资余额' : '融券余量',
      dataIndex: rankType === 'financing' ? 'financingBalance' : 'securitiesBalance',
      key: 'balance',
      render: (val: number) => rankType === 'financing'
        ? formatAmount(val) : val.toLocaleString() + ' 股',
    },
    {
      title: '变动',
      dataIndex: rankType === 'financing' ? 'financingChange' : 'securitiesChange',
      key: 'change',
      render: (val: number) => (
        <span style={{ color: val > 0 ? '#cf1322' : '#3f8600' }}>
          {val > 0 ? <ArrowUpOutlined /> : <ArrowDownOutlined />}
          {rankType === 'financing' ? formatAmount(Math.abs(val)) : Math.abs(val).toLocaleString()}
        </span>
      ),
    },
  ];

  return (
    <div style={{ padding: 24 }}>
      <Title level={3}>
        <DollarOutlined /> 融资融券
      </Title>

      {/* 诚实数据来源提示：真实源不可达时显性告知，禁止静默空态 */}
      {overview?.dataSource === 'unavailable' && (
        <Alert
          type="warning"
          showIcon
          style={{ marginBottom: 16 }}
          message="融资融券数据不可用"
          description="东方财富融资融券数据中心在沙箱下不可达，当前无真实数据。后端已去除随机演示数据，页面如实留空；数据源恢复后自动填充。"
        />
      )}

      <Spin spinning={loading}>
        {/* 概览卡片（仅真实数据可用时渲染） */}
        {overview && overview.totalFinancingBalance != null && (
          <Row gutter={16} style={{ marginBottom: 24 }}>
            <Col span={6}>
              <Card>
                <Statistic
                  title="市场融资余额"
                  value={formatAmountShort(overview.totalFinancingBalance)}
                  prefix={<DollarOutlined style={{ color: '#cf1322' }} />}
                  valueStyle={{ color: '#cf1322' }}
                />
              </Card>
            </Col>
            <Col span={6}>
              <Card>
                <Statistic
                  title="市场融券余量"
                  value={formatAmountShort(overview.totalSecuritiesBalance)}
                  prefix={<StockOutlined style={{ color: '#3f8600' }} />}
                  valueStyle={{ color: '#3f8600' }}
                />
              </Card>
            </Col>
            <Col span={6}>
              <Card>
                <Statistic
                  title="融资标的数"
                  value={overview.financingStockCount}
                  suffix="只"
                />
              </Card>
            </Col>
            <Col span={6}>
              <Card>
                <Statistic
                  title="融券标的数"
                  value={overview.securitiesStockCount}
                  suffix="只"
                />
              </Card>
            </Col>
          </Row>
        )}

        {/* 两融余额趋势 */}
        {trend.length > 0 && (
          <Card title="两融余额趋势（近30个交易日）" style={{ marginBottom: 24 }}>
            <div style={{ width: '100%', height: 300 }}>
              <ResponsiveContainer>
                <LineChart data={trend} margin={{ top: 8, right: 24, left: 8, bottom: 8 }}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="tradeDate" tick={{ fontSize: 12 }} />
                  <YAxis
                    tickFormatter={(v: number) => formatAmountShort(v)}
                    tick={{ fontSize: 12 }}
                  />
                  <Tooltip
                    formatter={(value, name) => [
                      name === '融券余量(股)'
                        ? Number(value).toLocaleString() + ' 股'
                        : formatAmount(Number(value)),
                      name as string,
                    ]}
                  />
                  <Legend />
                  <Line
                    type="monotone"
                    dataKey="financingBalance"
                    name="融资余额"
                    stroke="#cf1322"
                    dot={false}
                  />
                  <Line
                    type="monotone"
                    dataKey="securitiesBalance"
                    name="融券余量(股)"
                    stroke="#3f8600"
                    dot={false}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </Card>
        )}

        {/* 排行榜 */}
        <Card title="融资融券排行">
          <Radio.Group
            value={rankType}
            onChange={e => setRankType(e.target.value)}
            style={{ marginBottom: 16 }}
          >
            <Radio.Button value="financing">融资余额排行</Radio.Button>
            <Radio.Button value="securities">融券余量排行</Radio.Button>
          </Radio.Group>

          <Table
            dataSource={rankData}
            columns={rankColumns}
            rowKey="symbol"
            pagination={false}
            size="small"
          />
        </Card>
      </Spin>
    </div>
  );
};

function formatAmount(val: number): string {
  if (val >= 1e12) return (val / 1e12).toFixed(2) + '万亿';
  if (val >= 1e8) return (val / 1e8).toFixed(2) + '亿';
  if (val >= 1e4) return (val / 1e4).toFixed(2) + '万';
  return val.toFixed(2);
}

function formatAmountShort(val: number): string {
  if (val >= 1e12) return (val / 1e12).toFixed(1) + '万亿';
  if (val >= 1e8) return (val / 1e8).toFixed(1) + '亿';
  return val.toLocaleString();
}

export default MarginTradingPage;
