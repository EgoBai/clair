/**
 * 策略对比组件
 * 多策略性能对比、风险收益散点图、策略推荐排名
 */

import React, { useMemo, useState } from 'react';
import { Card, Row, Col, Table, Tag, Space, Typography, Tooltip, Radio } from 'antd';
import {
  RadarChart, Radar, PolarGrid, PolarAngleAxis, PolarRadiusAxis,
  ResponsiveContainer, ScatterChart, Scatter, XAxis, YAxis, CartesianGrid,
  BarChart, Bar, Cell, Legend, Tooltip as RechartsTooltip,
} from 'recharts';
import type { StrategyInsight } from '../../utils/aiModelExplainer';
import { generateStrategyInsight } from '../../utils/aiModelExplainer';

const { Text } = Typography;

interface StrategyComparisonProps {
  strategies?: string[];
}

const STRATEGY_NAMES: Record<string, string> = {
  value: '价值投资',
  growth: '成长突破',
  technical: '技术形态',
  momentum: '动量追踪',
  contrarian: '逆向布局',
};

const STRATEGY_COLORS: Record<string, string> = {
  value: '#52c41a',
  growth: '#1890ff',
  technical: '#722ed1',
  momentum: '#fa8c16',
  contrarian: '#13c2c2',
};

const RISK_LABELS: Record<string, string> = {
  low: '低风险',
  medium: '中风险',
  high: '高风险',
};

const StrategyComparison: React.FC<StrategyComparisonProps> = ({
  strategies = ['value', 'growth', 'technical', 'momentum', 'contrarian'],
}) => {
  const [sortBy, setSortBy] = useState<'sharpe' | 'return' | 'winRate'>('sharpe');

  const insights = useMemo(
    () => strategies.map(s => generateStrategyInsight(s)),
    [strategies]
  );

  // 雷达图数据
  const radarData = useMemo(() => {
    const metrics = ['胜率', '收益', '夏普', '回撤控制', '稳定性'];
    return metrics.map(metric => {
      const point: Record<string, any> = { metric };
      insights.forEach(ins => {
        const name = STRATEGY_NAMES[ins.strategy] || ins.strategy;
        switch (metric) {
          case '胜率': point[name] = ins.performance.winRate; break;
          case '收益': point[name] = Math.min(ins.performance.avgReturn * 2, 100); break;
          case '夏普': point[name] = ins.performance.sharpeRatio * 50; break;
          case '回撤控制': point[name] = 100 + ins.performance.maxDrawdown; break;
          case '稳定性': point[name] = ins.performance.calmarRatio * 50; break;
        }
      });
      return point;
    });
  }, [insights]);

  // 散点图数据（风险收益）
  const scatterData = useMemo(() =>
    insights.map(ins => ({
      name: STRATEGY_NAMES[ins.strategy],
      risk: Math.abs(ins.performance.maxDrawdown),
      return: ins.performance.avgReturn,
      color: STRATEGY_COLORS[ins.strategy],
    })),
    [insights]
  );

  // 排序后的策略排名
  const rankedInsights = useMemo(() => {
    const sorted = [...insights];
    switch (sortBy) {
      case 'sharpe': sorted.sort((a, b) => b.performance.sharpeRatio - a.performance.sharpeRatio); break;
      case 'return': sorted.sort((a, b) => b.performance.avgReturn - a.performance.avgReturn); break;
      case 'winRate': sorted.sort((a, b) => b.performance.winRate - a.performance.winRate); break;
    }
    return sorted;
  }, [insights, sortBy]);

  const columns = [
    {
      title: '排名',
      key: 'rank',
      width: 60,
      render: (_: any, __: any, idx: number) => (
        <Tag color={['#FFD700', '#C0C0C0', '#CD7F32'][idx] || 'default'}>{idx + 1}</Tag>
      ),
    },
    {
      title: '策略',
      key: 'strategy',
      render: (_: any, r: StrategyInsight) => (
        <Tag color={STRATEGY_COLORS[r.strategy]}>{STRATEGY_NAMES[r.strategy]}</Tag>
      ),
    },
    {
      title: '胜率',
      dataIndex: ['performance', 'winRate'],
      render: (v: number) => <Text strong>{v}%</Text>,
      sorter: (a: StrategyInsight, b: StrategyInsight) => b.performance.winRate - a.performance.winRate,
    },
    {
      title: '平均收益',
      dataIndex: ['performance', 'avgReturn'],
      render: (v: number) => <Text style={{ color: '#cf1322' }}>+{v}%</Text>,
      sorter: (a: StrategyInsight, b: StrategyInsight) => b.performance.avgReturn - a.performance.avgReturn,
    },
    {
      title: '最大回撤',
      dataIndex: ['performance', 'maxDrawdown'],
      render: (v: number) => <Text style={{ color: '#3f8600' }}>{v}%</Text>,
    },
    {
      title: '夏普比率',
      dataIndex: ['performance', 'sharpeRatio'],
      render: (v: number) => <Text strong>{v}</Text>,
    },
    {
      title: '风险等级',
      key: 'risk',
      render: (_: any, r: StrategyInsight) => (
        <Tag color={r.riskLevel === 'low' ? 'green' : r.riskLevel === 'medium' ? 'orange' : 'red'}>
          {RISK_LABELS[r.riskLevel]}
        </Tag>
      ),
    },
    {
      title: '适合持有',
      dataIndex: 'bestPeriod',
      ellipsis: true,
    },
  ];

  return (
    <div>
      <Row gutter={[16, 16]}>
        {/* 策略雷达对比 */}
        <Col span={12}>
          <Card size="small" title="策略多维对比">
            <ResponsiveContainer width="100%" height={300}>
              <RadarChart data={radarData}>
                <PolarGrid />
                <PolarAngleAxis dataKey="metric" tick={{ fontSize: 11 }} />
                <PolarRadiusAxis angle={30} domain={[0, 100]} tick={{ fontSize: 10 }} />
                {strategies.map(s => (
                  <Radar
                    key={s}
                    name={STRATEGY_NAMES[s]}
                    dataKey={STRATEGY_NAMES[s]}
                    stroke={STRATEGY_COLORS[s]}
                    fill={STRATEGY_COLORS[s]}
                    fillOpacity={0.1}
                  />
                ))}
                <Legend />
              </RadarChart>
            </ResponsiveContainer>
          </Card>
        </Col>

        {/* 风险收益散点图 */}
        <Col span={12}>
          <Card size="small" title="风险收益分布">
            <ResponsiveContainer width="100%" height={300}>
              <ScatterChart margin={{ top: 20, right: 20, bottom: 20, left: 20 }}>
                <CartesianGrid />
                <XAxis type="number" dataKey="risk" name="最大回撤" unit="%" tick={{ fontSize: 11 }} />
                <YAxis type="number" dataKey="return" name="平均收益" unit="%" tick={{ fontSize: 11 }} />
                <RechartsTooltip
                  content={({ payload }) => {
                    if (!payload?.length) return null;
                    const d = payload[0].payload;
                    return (
                      <div style={{ background: '#fff', padding: 8, border: '1px solid #ddd', borderRadius: 4 }}>
                        <Text strong>{d.name}</Text><br />
                        <Text>收益: {d.return}%</Text><br />
                        <Text>回撤: -{d.risk}%</Text>
                      </div>
                    );
                  }}
                />
                <Scatter data={scatterData} fill="#8884d8">
                  {scatterData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Scatter>
              </ScatterChart>
            </ResponsiveContainer>
          </Card>
        </Col>

        {/* 策略排名表 */}
        <Col span={24}>
          <Card
            size="small"
            title="策略排名"
            extra={
              <Radio.Group size="small" value={sortBy} onChange={e => setSortBy(e.target.value)}>
                <Radio.Button value="sharpe">夏普比率</Radio.Button>
                <Radio.Button value="return">平均收益</Radio.Button>
                <Radio.Button value="winRate">胜率</Radio.Button>
              </Radio.Group>
            }
          >
            <Table
              size="small"
              columns={columns}
              dataSource={rankedInsights}
              rowKey="strategy"
              pagination={false}
            />
          </Card>
        </Col>
      </Row>
    </div>
  );
};

export default StrategyComparison;
