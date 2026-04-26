/**
 * 河流图组件 - 展示板块资金流向随时间变化
 * 类似于主题河流图，展示不同板块资金流入/流出趋势
 */

import React, { useMemo } from 'react';
import { Card, Typography, Space, Tag, Tooltip } from 'antd';
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid,
  ResponsiveContainer, Tooltip as RechartsTooltip, Legend,
} from 'recharts';

const { Text } = Typography;

export interface RiverDataPoint {
  time: string;
  [sector: string]: string | number;
}

interface RiverChartProps {
  data: RiverDataPoint[];
  sectors: { key: string; name: string; color: string }[];
  title?: string;
  height?: number;
}

const RiverChart = React.memo<RiverChartProps>(({
  data,
  sectors,
  title = '板块资金河流图',
  height = 350,
}) => {
  const chartData = useMemo(() => data, [data]);

  return (
    <Card
      size="small"
      title={
        <Space>
          <Text strong>{title}</Text>
          <Tag color="blue">资金流向</Tag>
        </Space>
      }
    >
      <ResponsiveContainer width="100%" height={height}>
        <AreaChart data={chartData} stackOffset="wiggle">
          <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
          <XAxis
            dataKey="time"
            tick={{ fontSize: 11 }}
            tickLine={false}
          />
          <YAxis
            tick={{ fontSize: 11 }}
            tickLine={false}
            axisLine={false}
            tickFormatter={(v) => `${(v / 10000).toFixed(0)}亿`}
          />
          <RechartsTooltip
            content={({ payload, label }) => {
              if (!payload?.length) return null;
              return (
                <div style={{
                  background: '#fff', padding: 8,
                  border: '1px solid #ddd', borderRadius: 4,
                  boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
                }}>
                  <Text strong>{label}</Text>
                  {payload.map((p: any) => (
                    <div key={p.name} style={{ color: p.color, fontSize: 12 }}>
                      {p.name}: {(p.value / 10000).toFixed(2)}亿
                    </div>
                  ))}
                </div>
              );
            }}
          />
          <Legend />
          {sectors.map(sector => (
            <Area
              key={sector.key}
              type="monotone"
              dataKey={sector.key}
              name={sector.name}
              stackId="1"
              stroke={sector.color}
              fill={sector.color}
              fillOpacity={0.6}
            />
          ))}
        </AreaChart>
      </ResponsiveContainer>
    </Card>
  );
});

export default RiverChart;
