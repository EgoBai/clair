/**
 * 龙虎榜页面
 * 龙虎榜数据、席位分析、营业部排行
 * 参考东方财富龙虎榜模块
 */

import React, { useState, useEffect } from 'react';
import logger from '../utils/logger';
import {
  Card, Row, Col, Statistic, Table, Tag, Typography, Space,
} from 'antd';
import { Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell,
} from 'recharts';
import {
  TrophyOutlined, ArrowUpOutlined, ArrowDownOutlined, BankOutlined,
} from '@ant-design/icons';
import { fetchTopTraderOverviewTyped, fetchTopTraderSeatRank } from '../services/api';
import type { TopTraderOverview, SeatRankEntry } from '../../../shared/types';
import { LoadingStateDetail, EmptyState } from '../components/Common/StateComponents';

const { Title, Text } = Typography;

const COLORS = ['#cf1322', '#3f8600', '#1890ff', '#fa8c16', '#722ed1', '#13c2c2'];

/** 本地日期格式化为 YYYY-MM-DD（避免 toISOString 的时区偏移） */
const fmtDate = (d: Date): string => {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};


const TopTradersPage: React.FC = () => {
  const [overview, setOverview] = useState<TopTraderOverview | null>(null);
  const [seatRank, setSeatRank] = useState<SeatRankEntry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);
    try {
      const [overviewRes, seatRes] = await Promise.all([
        fetchTopTraderOverviewTyped(),
        fetchTopTraderSeatRank(20),
      ]);
      // 后端接口返回空数据：如实置空，绝不注入伪造演示数据
      if (!overviewRes || !seatRes || seatRes.length === 0) {
        throw new Error('龙虎榜接口返回数据为空');
      }
      setOverview(overviewRes);
      setSeatRank(seatRes);
    } catch (err) {
      // 数据由后端 /api/analytics/* 实时提供；接口异常或为空时如实置空，不做演示兜底
      logger.warn('龙虎榜接口不可用，已如实置空:', err);
      setOverview(null);
      setSeatRank([]);
    } finally {
      setLoading(false);
    }
  };

  const stockColumns = [
    { title: '代码', dataIndex: 'symbol', key: 'symbol' },
    { title: '名称', dataIndex: 'name', key: 'name', render: (v: string) => <Text strong>{v}</Text> },
    {
      title: '净买入',
      dataIndex: 'netAmount',
      key: 'netAmount',
      render: (val: number) => (
        <span style={{ color: val > 0 ? '#cf1322' : '#3f8600' }}>
          {val > 0 ? '+' : ''}{formatAmount(val)}
        </span>
      ),
      sorter: (a: Record<string, unknown>, b: Record<string, unknown>) => (a.netAmount as number) - (b.netAmount as number),
    },
    { title: '上榜原因', dataIndex: 'reason', key: 'reason',
      render: (v: string) => <Tag color="blue">{v}</Tag> },
  ];

  const seatColumns = [
    { title: '排名', dataIndex: 'rank', key: 'rank', width: 60,
      render: (val: number) => val <= 3
        ? <Tag color={['gold', 'silver', 'bronze'][val - 1]}>{val}</Tag>
        : val },
    { title: '营业部/机构', dataIndex: 'seatName', key: 'seatName',
      render: (v: string, r: SeatRankEntry) => (
        <Space>
          {r.isOrganizational && <BankOutlined style={{ color: '#722ed1' }} />}
          <Text>{v}</Text>
        </Space>
      ) },
    { title: '买入总额', dataIndex: 'totalBuyAmount', key: 'totalBuyAmount',
      render: (v: number) => <span style={{ color: '#cf1322' }}>{formatAmount(v)}</span> },
    { title: '卖出总额', dataIndex: 'totalSellAmount', key: 'totalSellAmount',
      render: (v: number) => <span style={{ color: '#3f8600' }}>{formatAmount(v)}</span> },
    { title: '净买入', dataIndex: 'netAmount', key: 'netAmount',
      render: (v: number) => (
        <span style={{ color: v > 0 ? '#cf1322' : '#3f8600', fontWeight: 500 }}>
          {v > 0 ? '+' : ''}{formatAmount(v)}
        </span>
      ),
      sorter: (a: SeatRankEntry, b: SeatRankEntry) => a.netAmount - b.netAmount },
    { title: '上榜次数', dataIndex: 'appearCount', key: 'appearCount',
      render: (v: number) => <Tag>{v}次</Tag> },
  ];

  // 行业分布饼图数据
  const industryData = overview?.industryDistribution
    ? Object.entries(overview.industryDistribution).map(([name, value]) => ({ name, value }))
    : [];

  // 加载态：早返回，保留页面标题避免加载时闪失
  if (loading) {
    return (
      <div style={{ padding: 24 }}>
        <Title level={3}>
          <TrophyOutlined /> 龙虎榜
        </Title>
        <LoadingStateDetail
          title="正在加载龙虎榜数据..."
          description="席位资金流向与上榜个股统计计算中"
        />
      </div>
    );
  }

  return (
    <div style={{ padding: 24 }}>
      <Title level={3}>
        <TrophyOutlined /> 龙虎榜
      </Title>

      {!overview && seatRank.length === 0 ? (
        <EmptyState
          title="暂无龙虎榜数据"
          description="后端龙虎榜接口暂未接入或当前无可展示数据，数据源恢复后将自动填充。"
        />
      ) : (
        <>
          {overview && (
            <>
              {/* 概览 */}
              <Row gutter={16} style={{ marginBottom: 24 }}>
                <Col span={6}>
                  <Card>
                    <Statistic
                      title="上榜股票数"
                      value={overview.totalStocks}
                      suffix="只"
                      prefix={<TrophyOutlined />}
                    />
                  </Card>
                </Col>
                <Col span={6}>
                  <Card>
                    <Statistic
                      title="买入席位占优"
                      value={overview.buyDominantCount}
                      suffix="只"
                      valueStyle={{ color: '#cf1322' }}
                      prefix={<ArrowUpOutlined />}
                    />
                  </Card>
                </Col>
                <Col span={6}>
                  <Card>
                    <Statistic
                      title="卖出席位占优"
                      value={overview.sellDominantCount}
                      suffix="只"
                      valueStyle={{ color: '#3f8600' }}
                      prefix={<ArrowDownOutlined />}
                    />
                  </Card>
                </Col>
                <Col span={6}>
                  <Card>
                    <Statistic
                      title="净买入总额"
                      value={formatAmount(overview.totalNetAmount)}
                      valueStyle={{ color: overview.totalNetAmount > 0 ? '#cf1322' : '#3f8600' }}
                    />
                  </Card>
                </Col>
              </Row>

              <Row gutter={16} style={{ marginBottom: 24 }}>
                <Col span={12}>
                  <Card title="净买入 TOP" size="small">
                    <Table
                      dataSource={overview.topBuyStocks}
                      columns={stockColumns}
                      rowKey="symbol"
                      pagination={false}
                      size="small"
                    />
                  </Card>
                </Col>
                <Col span={12}>
                  <Card title="净卖出 TOP" size="small">
                    <Table
                      dataSource={overview.topSellStocks}
                      columns={stockColumns}
                      rowKey="symbol"
                      pagination={false}
                      size="small"
                    />
                  </Card>
                </Col>
              </Row>
            </>
          )}

          {/* 营业部排行 */}
          <Card title={<><BankOutlined /> 营业部/机构排行</>} style={{ marginBottom: 24 }}>
            <Table
              dataSource={seatRank}
              columns={seatColumns}
              rowKey="seatName"
              pagination={{ pageSize: 10 }}
              size="small"
            />
          </Card>

          {/* 行业分布 */}
          {industryData.length > 0 && (
            <Card title="上榜行业分布" size="small">
              <ResponsiveContainer width="100%" height={300}>
                <PieChart>
                  <Pie
                    data={industryData}
                    cx="50%"
                    cy="50%"
                    outerRadius={100}
                    dataKey="value"
                    label={({ name, percent }: { name?: string; percent?: number }) => `${name} ${((percent ?? 0) * 100).toFixed(0)}%`}
                  >
                    {industryData.map((_, i) => (
                      <Cell key={i} fill={COLORS[i % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
            </Card>
          )}
        </>
      )}
    </div>
  );
};

function formatAmount(val: number): string {
  const abs = Math.abs(val);
  if (abs >= 1e8) return (val / 1e8).toFixed(2) + '亿';
  if (abs >= 1e4) return (val / 1e4).toFixed(2) + '万';
  return val.toFixed(2);
}

export default TopTradersPage;
