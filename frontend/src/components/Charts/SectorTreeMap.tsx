/**
 * 板块树图组件 - 展示行业板块涨跌分布
 * 使用Treemap可视化板块表现
 */

import React, { useMemo } from 'react';
import { Card, Typography, Space, Tag } from 'antd';
import { Treemap, ResponsiveContainer, Tooltip as RechartsTooltip } from 'recharts';

const { Text } = Typography;

export interface SectorNode {
  name: string;
  changePercent: number;
  volume: number;
  stocks?: number;
}

export interface SectorGroup {
  name: string;
  children: SectorNode[];
}

interface SectorTreeMapProps {
  sectors: SectorGroup[];
  title?: string;
  height?: number;
}

const getColor = (changePercent: number): string => {
  if (changePercent >= 3) return '#cf1322';
  if (changePercent >= 1) return '#f5222d';
  if (changePercent >= 0) return '#fa541c';
  if (changePercent >= -1) return '#3f8600';
  if (changePercent >= -3) return '#237804';
  return '#135200';
};

const SectorTreeMap = React.memo<SectorTreeMapProps>(({
  sectors,
  title = '板块涨跌分布',
  height = 400,
}) => {
  const treeData = useMemo(() =>
    sectors.map(group => ({
      name: group.name,
      children: group.children.map(child => ({
        name: child.name,
        size: Math.max(child.volume, 1000),
        changePercent: child.changePercent,
        stocks: child.stocks || 0,
        color: getColor(child.changePercent),
      })),
    })),
    [sectors]
  );

  const CustomContent = (props: any) => {
    const { x, y, width, height: h, name, changePercent, color } = props;
    if (width < 40 || h < 25) return null;

    return (
      <g>
        <rect
          x={x} y={y} width={width} height={h}
          fill={color || '#1890ff'} fillOpacity={0.8}
          stroke="#fff" strokeWidth={1}
          rx={2}
        />
        {width > 60 && h > 30 && (
          <>
            <text
              x={x + width / 2} y={y + h / 2 - 6}
              textAnchor="middle" fill="#fff"
              fontSize={Math.min(12, width / 6)} fontWeight="bold"
            >
              {name}
            </text>
            <text
              x={x + width / 2} y={y + h / 2 + 10}
              textAnchor="middle" fill="#fff"
              fontSize={Math.min(10, width / 8)}
            >
              {changePercent > 0 ? '+' : ''}{changePercent?.toFixed(2)}%
            </text>
          </>
        )}
      </g>
    );
  };

  return (
    <Card
      size="small"
      title={
        <Space>
          <Text strong>{title}</Text>
          <Tag color="orange">板块分布</Tag>
        </Space>
      }
    >
      <ResponsiveContainer width="100%" height={height}>
        <Treemap
          data={treeData}
          dataKey="size"
          nameKey="name"
          content={<CustomContent />}
          animationDuration={300}
        >
          <RechartsTooltip
            content={({ payload }) => {
              if (!payload?.length) return null;
              const d = payload[0].payload;
              return (
                <div style={{
                  background: '#fff', padding: 8,
                  border: '1px solid #ddd', borderRadius: 4,
                }}>
                  <Text strong>{d.name}</Text><br />
                  <Text style={{ color: d.changePercent >= 0 ? '#cf1322' : '#3f8600' }}>
                    涨跌幅: {d.changePercent > 0 ? '+' : ''}{d.changePercent?.toFixed(2)}%
                  </Text>
                  {d.stocks > 0 && (
                    <>
                      <br />
                      <Text type="secondary">成分股: {d.stocks}只</Text>
                    </>
                  )}
                </div>
              );
            }}
          />
        </Treemap>
      </ResponsiveContainer>
    </Card>
  );
});

export default SectorTreeMap;
