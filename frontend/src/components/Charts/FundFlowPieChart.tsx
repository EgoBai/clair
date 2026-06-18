/**
 * 资金流向饼图组件
 * 主力/超大单/大单/中单/小单资金分布
 */

import React from 'react';
import { Card, Tooltip as AntTooltip } from 'antd';
import {
  PieChart, Pie, Cell, ResponsiveContainer, Legend, Tooltip,
} from 'recharts';

interface FundFlowPieChartProps {
  mainNet: number;
  superLargeNet: number;
  largeNet: number;
  mediumNet: number;
  smallNet: number;
  loading?: boolean;
  title?: string;
}

const COLORS = ['#cf1322', '#ff4d4f', '#ff7a45', '#3f8600', '#52c41a'];

export const FundFlowPieChart = React.memo<FundFlowPieChartProps>(({
  mainNet, superLargeNet, largeNet, mediumNet, smallNet, loading, title = '资金流向分布',
}) => {
  const data = [
    { name: '主力净额', value: Math.abs(mainNet), raw: mainNet },
    { name: '超大单', value: Math.abs(superLargeNet), raw: superLargeNet },
    { name: '大单', value: Math.abs(largeNet), raw: largeNet },
    { name: '中单', value: Math.abs(mediumNet), raw: mediumNet },
    { name: '小单', value: Math.abs(smallNet), raw: smallNet },
  ].filter(d => d.value > 0);

  const total = data.reduce((s, d) => s + d.raw, 0);

  const renderLabel = ({ name, percent }: { name?: string; percent?: number }) =>
    `${name} ${((percent ?? 0) * 100).toFixed(1)}%`;

  const customTooltip = ({ active, payload }: any) => {
    if (!active || !payload?.length) return null;
    const d = payload[0].payload;
    return (
      <div style={{
        background: '#fff', padding: '8px 12px', border: '1px solid #eee',
        borderRadius: 4, boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
      }}>
        <div style={{ fontWeight: 500 }}>{d.name}</div>
        <div style={{ color: d.raw > 0 ? '#cf1322' : '#3f8600' }}>
          {d.raw > 0 ? '+' : ''}{formatAmount(d.raw)}
        </div>
      </div>
    );
  };

  return (
    <Card title={title} loading={loading} size="small">
      <ResponsiveContainer width="100%" height={280}>
        <PieChart>
          <Pie
            data={data}
            cx="50%"
            cy="45%"
            innerRadius={50}
            outerRadius={90}
            dataKey="value"
            label={renderLabel}
            labelLine={{ stroke: '#999' }}
          >
            {data.map((_, i) => (
              <Cell key={i} fill={COLORS[i % COLORS.length]} />
            ))}
          </Pie>
          <Tooltip content={customTooltip} />
          <Legend verticalAlign="bottom" height={36} />
        </PieChart>
      </ResponsiveContainer>
      <div style={{ textAlign: 'center', marginTop: -8, fontSize: 13, color: '#8c8c8c' }}>
        净流入合计：
        <span style={{ color: total > 0 ? '#cf1322' : '#3f8600', fontWeight: 500 }}>
          {total > 0 ? '+' : ''}{formatAmount(total)}
        </span>
      </div>
    </Card>
  );
});

// 行业资金流向饼图
interface IndustryFlowPieProps {
  data: Array<{ industry: string; netInflow: number; stockCount: number }>;
  loading?: boolean;
}

const INDUSTRY_COLORS = [
  '#1890ff', '#52c41a', '#fa8c16', '#722ed1', '#eb2f96',
  '#13c2c2', '#faad14', '#f5222d', '#2f54eb', '#a0d911',
];

export const IndustryFlowPieChart = React.memo<IndustryFlowPieProps>(({ data, loading }) => {
  const chartData = data.map(d => ({
    name: d.industry,
    value: Math.abs(d.netInflow),
    raw: d.netInflow,
  }));

  return (
    <Card title="行业资金流向" loading={loading} size="small">
      <ResponsiveContainer width="100%" height={300}>
        <PieChart>
          <Pie
            data={chartData}
            cx="50%"
            cy="45%"
            outerRadius={100}
            dataKey="value"
            label={({ name, percent }: { name?: string; percent?: number }) => `${name} ${((percent ?? 0) * 100).toFixed(0)}%`}
          >
            {chartData.map((_, i) => (
              <Cell key={i} fill={INDUSTRY_COLORS[i % INDUSTRY_COLORS.length]} />
            ))}
          </Pie>
          <Tooltip
            formatter={(val, name, props) =>
              [formatAmount(props.payload.raw), name]}
          />
        </PieChart>
      </ResponsiveContainer>
    </Card>
  );
});

function formatAmount(val: number): string {
  const abs = Math.abs(val);
  if (abs >= 1e8) return (val / 1e8).toFixed(2) + '亿';
  if (abs >= 1e4) return (val / 1e4).toFixed(2) + '万';
  return val.toFixed(2);
}

export default FundFlowPieChart;
