/**
 * 行业热力图组件
 * 参考 TradingView 树状图热力图样式
 */
import React, { useMemo } from 'react';
import { Card, Typography, Tooltip, Space, Tag, Skeleton } from 'antd';
import { FireOutlined, ThunderboltOutlined } from '@ant-design/icons';

const { Text } = Typography;

interface SectorHeatData {
  name: string;
  code: string;
  changePercent: number;
  turnover: number;
  risingCount: number;
  totalStocks: number;
  representative?: { symbol: string; name: string; changePercent: number };
}

interface SectorHeatmapProps {
  data: SectorHeatData[];
  onSectorClick?: (sector: SectorHeatData) => void;
  colorMode?: 'change' | 'volume';
  loading?: boolean;
}

const SectorHeatmap: React.FC<SectorHeatmapProps> = ({ data, onSectorClick, colorMode = 'change', loading = false }) => {
  const sortedData = useMemo(() => {
    return [...data].sort((a, b) => {
      if (colorMode === 'volume') return b.turnover - a.turnover;
      return Math.abs(b.changePercent) - Math.abs(a.changePercent);
    });
  }, [data, colorMode]);

  const getColor = (changePercent: number): string => {
    if (changePercent > 5) return '#cc0000';
    if (changePercent > 3) return '#dd2222';
    if (changePercent > 1) return '#ee4444';
    if (changePercent > 0) return '#ff6666';
    if (changePercent === 0) return '#888888';
    if (changePercent > -1) return '#66bb6a';
    if (changePercent > -3) return '#44aa44';
    if (changePercent > -5) return '#228822';
    return '#006600';
  };

  const getOpacity = (turnover: number): number => {
    const maxTurnover = Math.max(...data.map(d => d.turnover), 1);
    return 0.6 + (turnover / maxTurnover) * 0.4;
  };

  if (!data || data.length === 0) {
    return (
      <Card title="行业热力图">
        <div style={{ textAlign: 'center', padding: 40, color: '#999' }}>暂无数据</div>
      </Card>
    );
  }

  if (loading) {
    return (
      <Card title="行业热力图" size="small">
        <Skeleton active paragraph={{ rows: 6 }} />
      </Card>
    );
  }

  return (
    <Card
      title={
        <Space>
          <FireOutlined style={{ color: '#ff4d4f' }} />
          <span>行业热力图</span>
          <Tag color="blue">{data.length} 个行业</Tag>
        </Space>
      }
      size="small"
    >
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(120px, 1fr))',
          gap: 4,
          minHeight: 200,
        }}
      >
        {sortedData.map((sector) => {
          const color = getColor(sector.changePercent);
          const opacity = getOpacity(sector.turnover);
          const risingRatio = sector.totalStocks > 0 ? (sector.risingCount / sector.totalStocks * 100).toFixed(0) : '0';
          return (
            <Tooltip
              key={sector.code}
              title={
                <div>
                  <div><strong>{sector.name}</strong></div>
                  <div>涨跌幅: {sector.changePercent > 0 ? '+' : ''}{sector.changePercent.toFixed(2)}%</div>
                  <div>上涨: {sector.risingCount}/{sector.totalStocks} ({risingRatio}%)</div>
                  <div>成交额: {(sector.turnover / 1e8).toFixed(0)}亿</div>
                  {sector.representative && (
                    <div>龙头: {sector.representative.name} {sector.representative.changePercent > 0 ? '+' : ''}{sector.representative.changePercent.toFixed(2)}%</div>
                  )}
                </div>
              }
            >
              <div
                onClick={() => onSectorClick?.(sector)}
                style={{
                  backgroundColor: color,
                  opacity,
                  borderRadius: 4,
                  padding: '8px 6px',
                  cursor: onSectorClick ? 'pointer' : 'default',
                  textAlign: 'center',
                  minHeight: 60,
                  display: 'flex',
                  flexDirection: 'column',
                  justifyContent: 'center',
                  transition: 'transform 0.15s ease',
                  transform: 'scale(1)',
                }}
                onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.transform = 'scale(1.05)'; }}
                onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.transform = 'scale(1)'; }}
              >
                <Text
                  strong
                  style={{
                    color: '#fff',
                    fontSize: 13,
                    textShadow: '0 1px 2px rgba(0,0,0,0.3)',
                    whiteSpace: 'nowrap',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                  }}
                >
                  {sector.name}
                </Text>
                <Text
                  style={{
                    color: '#fff',
                    fontSize: 16,
                    fontWeight: 'bold',
                    textShadow: '0 1px 2px rgba(0,0,0,0.3)',
                  }}
                >
                  {sector.changePercent > 0 ? '+' : ''}{sector.changePercent.toFixed(2)}%
                </Text>
              </div>
            </Tooltip>
          );
        })}
      </div>
    </Card>
  );
};

export default SectorHeatmap;
export type { SectorHeatData };
