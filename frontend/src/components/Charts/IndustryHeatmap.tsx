/**
 * 行业板块热力图（色块图）
 * 实现 Squarified Treemap 算法，面积与成交额成比例
 * 参考 TradingView 热力图 + Bloomberg Market Map
 */

import React, { useMemo, useState } from 'react';
import { Typography, Tooltip, Skeleton, Space, Tag } from 'antd';
import { useNavigate } from 'react-router-dom';
import { AppstoreOutlined } from '@ant-design/icons';

const { Text } = Typography;

interface IndustryData {
  industry: string;
  avgChangePercent: number;
  totalTurnover?: number;
  stockCount?: number;
  risingCount?: number;
  topStock?: { name: string; changePercent: number };
}

interface IndustryHeatmapProps {
  data: IndustryData[];
  width?: number;
  height?: number;
  loading?: boolean;
}

// ============= Squarified Treemap Algorithm =============
interface LayoutNode {
  x: number; y: number; w: number; h: number;
  data: IndustryData;
}

function squarifyItems(
  items: { data: IndustryData; value: number }[],
  x: number, y: number, w: number, h: number
): LayoutNode[] {
  if (items.length === 0 || w <= 0 || h <= 0) return [];

  const totalValue = items.reduce((s, it) => s + it.value, 0);
  if (totalValue <= 0) return [];

  const results: LayoutNode[] = [];
  const sorted = [...items].sort((a, b) => b.value - a.value);

  let cx = x, cy = y, cw = w, ch = h;
  let remaining = [...sorted];

  while (remaining.length > 0) {
    const isHorizontal = cw >= ch;
    const totalRemaining = remaining.reduce((s, it) => s + it.value, 0);

    let row: typeof remaining = [];
    let rowSum = 0;
    let bestWorstRatio = Infinity;

    for (let i = 0; i < remaining.length; i++) {
      const candidate = [...row, remaining[i]];
      const candidateSum = rowSum + remaining[i].value;
      const rowLength = isHorizontal ? cw : ch;
      const rowThickness = (candidateSum / totalRemaining) * (isHorizontal ? ch : cw);

      let worstRatio = 0;
      for (const item of candidate) {
        const itemLength = (item.value / candidateSum) * rowLength;
        const ratio = Math.max(rowThickness / itemLength, itemLength / rowThickness);
        worstRatio = Math.max(worstRatio, ratio);
      }

      if (worstRatio <= bestWorstRatio) {
        bestWorstRatio = worstRatio;
        row = candidate;
        rowSum = candidateSum;
      } else {
        break;
      }
    }

    const rowThickness = (rowSum / totalRemaining) * (isHorizontal ? ch : cw);
    let offset = isHorizontal ? cx : cy;

    for (const item of row) {
      const itemLength = (item.value / rowSum) * (isHorizontal ? cw : ch);

      if (isHorizontal) {
        results.push({ x: offset, y: cy, w: itemLength, h: rowThickness, data: item.data });
      } else {
        results.push({ x: cx, y: offset, w: rowThickness, h: itemLength, data: item.data });
      }
      offset += itemLength;
    }

    if (isHorizontal) {
      cy += rowThickness;
      ch -= rowThickness;
    } else {
      cx += rowThickness;
      cw -= rowThickness;
    }

    remaining = remaining.slice(row.length);
  }

  return results;
}

// ============= Color Logic =============
const COLOR_PALETTE = [
  { threshold: 9.5, color: '#7f1d1d' },
  { threshold: 7, color: '#991b1b' },
  { threshold: 5, color: '#b91c1c' },
  { threshold: 3, color: '#dc2626' },
  { threshold: 1.5, color: '#ef4444' },
  { threshold: 0.5, color: '#f87171' },
  { threshold: 0, color: '#fca5a5' },
  { threshold: -0.5, color: '#86efac' },
  { threshold: -1.5, color: '#4ade80' },
  { threshold: -3, color: '#22c55e' },
  { threshold: -5, color: '#16a34a' },
  { threshold: -7, color: '#15803d' },
  { threshold: -9.5, color: '#166534' },
];

function getColor(changePercent: number): string {
  for (const stop of COLOR_PALETTE) {
    if (changePercent >= stop.threshold) return stop.color;
  }
  return '#14532d';
}

function getTextColor(changePercent: number): string {
  return Math.abs(changePercent) >= 2 ? '#fff' : '#f0f0f0';
}

// ============= Component =============
const IndustryHeatmap = React.memo<IndustryHeatmapProps>(({ data, width = 800, height = 400, loading = false }) => {
  const navigate = useNavigate();
  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null);

  const layout = useMemo(() => {
    if (!data || data.length === 0) return [];

    const items = data.map(d => ({
      data: d,
      value: Math.max(d.totalTurnover || d.stockCount || 1, 1),
    }));

    return squarifyItems(items, 0, 0, width, height);
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

  if (loading) {
    return (
      <div style={{ width, height, display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#fafafa', borderRadius: 8 }}>
        <Skeleton active paragraph={{ rows: 3 }} style={{ width: '80%' }} />
      </div>
    );
  }

  return (
    <div className="industry-heatmap" style={{ position: 'relative', width, height }}>
      <svg width={width} height={height} style={{ borderRadius: 8, overflow: 'hidden', background: '#1a1a2e' }}>
        {layout.map((block, i) => {
          const { data: d, x, y, w, h } = block;
          if (w < 4 || h < 4) return null;

          const color = getColor(d.avgChangePercent);
          const textColor = getTextColor(d.avgChangePercent);
          const isHovered = hoveredIdx === i;
          const isLarge = w * h > (width * height) * 0.03;
          const isMedium = w > 50 && h > 35;

          return (
            <Tooltip
              key={i}
              title={
                <div style={{ fontSize: 12, lineHeight: 1.8 }}>
                  <div><strong>{d.industry}</strong></div>
                  <div>平均涨跌: <span style={{ color: d.avgChangePercent >= 0 ? '#ef4444' : '#22c55e' }}>
                    {d.avgChangePercent >= 0 ? '+' : ''}{d.avgChangePercent.toFixed(2)}%
                  </span></div>
                  {d.totalTurnover && <div>成交额: {(d.totalTurnover / 1e8).toFixed(2)}亿</div>}
                  {d.stockCount && <div>成分股: {d.stockCount}只</div>}
                  {d.risingCount != null && d.stockCount && (
                    <div>上涨: {d.risingCount}/{d.stockCount} ({(d.risingCount / d.stockCount * 100).toFixed(0)}%)</div>
                  )}
                  {d.topStock && (
                    <div>龙头: {d.topStock.name} ({d.topStock.changePercent >= 0 ? '+' : ''}{d.topStock.changePercent.toFixed(2)}%)</div>
                  )}
                </div>
              }
            >
              <g
                style={{ cursor: 'pointer' }}
                onClick={() => navigate(`/market?industry=${encodeURIComponent(d.industry)}`)}
                onMouseEnter={() => setHoveredIdx(i)}
                onMouseLeave={() => setHoveredIdx(null)}
              >
                <rect
                  x={x + 0.5} y={y + 0.5}
                  width={Math.max(w - 1, 0)} height={Math.max(h - 1, 0)}
                  fill={color} rx={2}
                  stroke={isHovered ? '#fff' : 'rgba(255,255,255,0.12)'}
                  strokeWidth={isHovered ? 2 : 0.5}
                  opacity={isHovered ? 1 : 0.9}
                />
                {isLarge && (
                  <>
                    <text
                      x={x + w / 2} y={y + h / 2 - (isMedium ? 10 : 6)}
                      textAnchor="middle" dominantBaseline="middle"
                      fill={textColor} fontSize={Math.min(14, w / 6)}
                      fontWeight={700} style={{ textShadow: '0 1px 2px rgba(0,0,0,0.4)' }}
                    >
                      {d.industry.length > Math.floor(w / 12)
                        ? d.industry.slice(0, Math.floor(w / 12)) + '…'
                        : d.industry}
                    </text>
                    <text
                      x={x + w / 2} y={y + h / 2 + (isMedium ? 8 : 4)}
                      textAnchor="middle" dominantBaseline="middle"
                      fill={textColor} fontSize={Math.min(16, w / 5)}
                      fontWeight={800} style={{ textShadow: '0 1px 3px rgba(0,0,0,0.5)' }}
                    >
                      {d.avgChangePercent >= 0 ? '+' : ''}{d.avgChangePercent.toFixed(2)}%
                    </text>
                    {isMedium && d.stockCount && (
                      <text
                        x={x + w / 2} y={y + h / 2 + 22}
                        textAnchor="middle" dominantBaseline="middle"
                        fill={textColor} fontSize={Math.min(10, w / 8)} opacity={0.75}
                      >
                        {d.stockCount}只 · {(Math.max(d.totalTurnover || 0, 0) / 1e8).toFixed(0)}亿
                      </text>
                    )}
                  </>
                )}
                {!isLarge && w > 30 && h > 20 && (
                  <text
                    x={x + w / 2} y={y + h / 2}
                    textAnchor="middle" dominantBaseline="middle"
                    fill={textColor} fontSize={Math.max(8, Math.min(11, w / 5))}
                    fontWeight={600}
                  >
                    {d.avgChangePercent >= 0 ? '+' : ''}{d.avgChangePercent.toFixed(1)}%
                  </text>
                )}
              </g>
            </Tooltip>
          );
        })}
      </svg>
    </div>
  );
});

export default IndustryHeatmap;
