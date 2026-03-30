/**
 * 行业板块热力图（色块图）
 * 参考 TradingView 的热力图
 */

import React, { useMemo } from 'react';
import { Typography, Tooltip } from 'antd';
import { useNavigate } from 'react-router-dom';

const { Text } = Typography;

interface IndustryData {
  industry: string;
  avgChangePercent: number;
  totalTurnover?: number;
  stockCount?: number;
}

interface IndustryHeatmapProps {
  data: IndustryData[];
  width?: number;
  height?: number;
}

// 根据涨跌幅获取颜色
function getColor(changePercent: number): string {
  if (changePercent >= 5) return '#cc0000';
  if (changePercent >= 3) return '#dd3333';
  if (changePercent >= 1.5) return '#ee6666';
  if (changePercent >= 0.5) return '#ffaaaa';
  if (changePercent >= 0) return '#ffdddd';
  if (changePercent >= -0.5) return '#ddffdd';
  if (changePercent >= -1.5) return '#aaffaa';
  if (changePercent >= -3) return '#66ee66';
  if (changePercent >= -5) return '#33dd33';
  return '#00cc00';
}

// 根据背景色获取对比文字色
function getTextColor(changePercent: number): string {
  return Math.abs(changePercent) >= 1.5 ? '#fff' : '#333';
}

export default function IndustryHeatmap({ data, width = 800, height = 400 }: IndustryHeatmapProps) {
  const navigate = useNavigate();

  // 简单的 Treemap 布局算法
  const blocks = useMemo(() => {
    if (!data || data.length === 0) return [];

    // 按成交额排序（大的在前）
    const sorted = [...data].sort((a, b) => (b.totalTurnover || 0) - (a.totalTurnover || 0));

    // 计算面积权重（基于成交额）
    const totalTurnover = sorted.reduce((sum, d) => sum + (d.totalTurnover || d.stockCount || 1), 0);

    // 简化布局：行列网格
    const cols = Math.ceil(Math.sqrt(sorted.length * (width / height)));
    const rows = Math.ceil(sorted.length / cols);
    const cellW = width / cols;
    const cellH = height / rows;

    return sorted.map((item, index) => {
      const col = index % cols;
      const row = Math.floor(index / cols);
      const weight = (item.totalTurnover || item.stockCount || 1) / totalTurnover;
      const scale = Math.max(0.7, Math.min(1.3, 0.8 + weight * 10));

      return {
        ...item,
        x: col * cellW,
        y: row * cellH,
        w: cellW - 2,
        h: cellH - 2,
        color: getColor(item.avgChangePercent),
        textColor: getTextColor(item.avgChangePercent),
        fontSize: Math.max(10, Math.min(14, cellW / 8)),
      };
    });
  }, [data, width, height]);

  if (!data || data.length === 0) {
    return (
      <div style={{
        width, height,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: '#fafafa', borderRadius: 8,
      }}>
        <Text type="secondary">暂无行业数据</Text>
      </div>
    );
  }

  return (
    <div className="industry-heatmap" style={{ position: 'relative', width, height }}>
      <svg width={width} height={height} style={{ borderRadius: 8, overflow: 'hidden' }}>
        {blocks.map((block, i) => (
          <Tooltip
            key={i}
            title={
              <div>
                <div><strong>{block.industry}</strong></div>
                <div>平均涨跌: {block.avgChangePercent > 0 ? '+' : ''}{block.avgChangePercent.toFixed(2)}%</div>
                {block.totalTurnover && <div>成交额: {(block.totalTurnover / 1e8).toFixed(2)}亿</div>}
                {block.stockCount && <div>成分股: {block.stockCount}只</div>}
              </div>
            }
          >
            <g
              style={{ cursor: 'pointer' }}
              onClick={() => navigate(`/market?industry=${encodeURIComponent(block.industry)}`)}
            >
              <rect
                x={block.x + 1}
                y={block.y + 1}
                width={block.w}
                height={block.h}
                fill={block.color}
                rx={4}
                stroke="#fff"
                strokeWidth={1}
              />
              <text
                x={block.x + block.w / 2}
                y={block.y + block.h / 2 - 8}
                textAnchor="middle"
                dominantBaseline="middle"
                fill={block.textColor}
                fontSize={block.fontSize}
                fontWeight={600}
              >
                {block.industry.length > 4 ? block.industry.slice(0, 4) + '…' : block.industry}
              </text>
              <text
                x={block.x + block.w / 2}
                y={block.y + block.h / 2 + 10}
                textAnchor="middle"
                dominantBaseline="middle"
                fill={block.textColor}
                fontSize={Math.max(9, block.fontSize - 2)}
              >
                {block.avgChangePercent > 0 ? '+' : ''}{block.avgChangePercent.toFixed(2)}%
              </text>
            </g>
          </Tooltip>
        ))}
      </svg>
    </div>
  );
}
