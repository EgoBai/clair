/**
 * 融资融券页面
 * 融资余额走势、融券余量、融资融券排行
 * 参考东方财富融资融券模块
 */

import React, { useState, useEffect } from 'react';
import logger from '../utils/logger';
import {
  Card, Row, Col, Statistic, Table, Tabs, Radio, Space, Tag, Typography, Spin,
} from 'antd';
import {
  LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Legend, Area, AreaChart,
} from 'recharts';
import {
  ArrowUpOutlined, ArrowDownOutlined, DollarOutlined, StockOutlined,
} from '@ant-design/icons';
import { fetchMarginOverview, fetchMarginData, fetchMarginRank } from '../services/api';
import type { MarginOverview } from '../../../shared/types';

const { Title, Text } = Typography;

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
  const [overview, setOverview] = useState<MarginOverview | null>(null);
  const [rankData, setRankData] = useState<any[]>([]);
  const [rankType, setRankType] = useState<string>('financing');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadData();
  }, []);

  useEffect(() => {
    loadRank(rankType);
  }, [rankType]);

  const loadData = async () => {
    setLoading(true);
    try {
      const [overviewRes, rankRes] = await Promise.all([
        fetchMarginOverview(),
        fetchMarginRank('financing'),
      ]);
      setOverview(overviewRes);
      setRankData(rankRes);
    } catch (err) {
      logger.error('加载融资融券数据失败:', err);
    } finally {
      setLoading(false);
    }
  };

  const loadRank = async (type: string) => {
    try {
      const data = await fetchMarginRank(type);
      setRankData(data);
    } catch (err) {
      logger.error('加载排行失败:', err);
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

      <Spin spinning={loading}>
        {/* 概览卡片 */}
        {overview && (
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
