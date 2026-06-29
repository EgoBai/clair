/**
 * 市场热力图 - Bloomberg Terminal 风格
 * 实现 Squarified Treemap 算法，面积与市值/成交额成比例
 * 参考: Bruls, Huizing, van Wijk "Squarified Treemaps" (2000)
 */

import React, { useMemo, useState, useCallback } from 'react';
import { Card, Typography, Space, Tag, Tooltip } from 'antd';
import { AppstoreOutlined } from '@ant-design/icons';

const { Text } = Typography;

export interface MarketHeatItem {
  name: string;
  code: string;
  changePercent: number;
  marketCap?: number;
  turnover?: number;
  volume?: number;
  risingCount?: number;
  totalStocks?: number;
  representative?: { name: string; changePercent: number; symbol: string };
}

interface MarketHeatmapProps {
  data: MarketHeatItem[];
  sizeField?: 'marketCap' | 'turnover' | 'volume';
  colorField?: 'changePercent';
  onCellClick?: (item: MarketHeatItem) => void;
  height?: number;
  loading?: boolean;
  title?: string;
}

// ============= Squarified Treemap Layout =============

interface LayoutRect {
  x: number;
  y: number;
  w: number;
  h: number;
  data: MarketHeatItem;
}

function squarify(
  items: { data: MarketHeatItem; value: number }[],
  x: number, y: number, w: number, h: number
): LayoutRect[] {
  if (items.length === 0 || w <= 0 || h <= 0) return [];

  const totalValue = items.reduce((s, it) => s + it.value, 0);
  if (totalValue <= 0) return [];

  const results: LayoutRect[] = [];
  const sorted = [...items].sort((a, b) => b.value - a.value);

  let cx = x, cy = y, cw = w, ch = h;
  let remaining = [...sorted];

  while (remaining.length > 0) {
    const isHorizontal = cw >= ch;
    const _side = isHorizontal ? ch : cw;
    const totalRemaining = remaining.reduce((s, it) => s + it.value, 0);

    // Find the best row using worst aspect ratio
    let row: typeof remaining = [];
    let rowSum = 0;
    let bestWorstRatio = Infinity;

    for (let i = 0; i < remaining.length; i++) {
      const candidate = [...row, remaining[i]];
      const candidateSum = rowSum + remaining[i].value;
      const rowLength = isHorizontal ? cw : ch;
      const rowThickness = (candidateSum / totalRemaining) * (isHorizontal ? ch : cw);

      let worstRatio = 0;
      let _offset = 0;
      for (const item of candidate) {
        const itemLength = (item.value / candidateSum) * rowLength;
        const ratio = rowThickness > itemLength
          ? rowThickness / itemLength
          : itemLength / rowThickness;
        worstRatio = Math.max(worstRatio, ratio);
        _offset += itemLength;
      }

      if (worstRatio <= bestWorstRatio) {
        bestWorstRatio = worstRatio;
        row = candidate;
        rowSum = candidateSum;
      } else {
        break;
      }
    }

    // Layout this row
    const rowThickness = (rowSum / totalRemaining) * (isHorizontal ? ch : cw);
    let offset = isHorizontal ? cx : cy;

    for (const item of row) {
      const itemLength = (item.value / rowSum) * (isHorizontal ? cw : ch);

      if (isHorizontal) {
        results.push({
          x: offset, y: cy,
          w: itemLength, h: rowThickness,
          data: item.data,
        });
      } else {
        results.push({
          x: cx, y: offset,
          w: rowThickness, h: itemLength,
          data: item.data,
        });
      }
      offset += itemLength;
    }

    // Update remaining area
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

const COLOR_STOPS = [
  { threshold: 9.5, color: '#7f1d1d' },   // deep red
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

function getHeatColor(changePercent: number): string {
  for (const stop of COLOR_STOPS) {
    if (changePercent >= stop.threshold) return stop.color;
  }
  return '#14532d'; // deepest green
}

function getTextColor(changePercent: number): string {
  return Math.abs(changePercent) >= 3 ? '#fff' : '#f0f0f0';
}

// ============= Main Component =============

const MarketHeatmap = React.memo<MarketHeatmapProps>(({
  data,
  sizeField = 'turnover',
  onCellClick,
  height = 500,
  loading = false,
  title = '市场热力图',
}) => {
  const [hoveredCode, setHoveredCode] = useState<string | null>(null);

  const layout = useMemo(() => {
    if (!data || data.length === 0) return [];

    const items = data.map(d => ({
      data: d,
      value: Math.max(d[sizeField] || d.turnover || d.marketCap || 1, 1),
    }));

    return squarify(items, 0, 0, 800, height);
  }, [data, sizeField, height]);

  const maxArea = useMemo(() => {
    if (layout.length === 0) return 1;
    return Math.max(...layout.map(r => r.w * r.h));
  }, [layout]);

  const renderCell = useCallback((rect: LayoutRect, index: number) => {
    const { data: d, x, y, w, h } = rect;
    if (w < 3 || h < 3) return null;

    const color = getHeatColor(d.changePercent);
    const textColor = getTextColor(d.changePercent);
    const isHovered = hoveredCode === d.code;
    const area = w * h;
    const isLarge = area > maxArea * 0.04;
    const isMedium = area > maxArea * 0.015;
    const isSmall = area > maxArea * 0.005;

    const risingRatio = d.totalStocks && d.risingCount !== null
      ? `${d.risingCount}/${d.totalStocks}`
      : null;

    return (
      <Tooltip
        key={`${d.code}-${index}`}
        title={
          <div style={{ fontSize: 12, lineHeight: 1.8 }}>
            <div><strong>{d.name}</strong> ({d.code})</div>
            <div>涨跌幅: <span style={{ color: d.changePercent >= 0 ? '#ef4444' : '#22c55e' }}>
              {d.changePercent >= 0 ? '+' : ''}{d.changePercent.toFixed(2)}%
            </span></div>
            {d.turnover && <div>成交额: {(d.turnover / 1e8).toFixed(2)}亿</div>}
            {d.marketCap && <div>市值: {(d.marketCap / 1e8).toFixed(0)}亿</div>}
            {risingRatio && <div>涨/跌: {risingRatio}</div>}
            {d.representative && (
              <div>龙头: {d.representative.name} ({d.representative.changePercent >= 0 ? '+' : ''}{d.representative.changePercent.toFixed(2)}%)</div>
            )}
          </div>
        }
        mouseEnterDelay={0.1}
      >
        <g
          style={{ cursor: onCellClick ? 'pointer' : 'default' }}
          onClick={() => onCellClick?.(d)}
          onMouseEnter={() => setHoveredCode(d.code)}
          onMouseLeave={() => setHoveredCode(null)}
        >
          <rect
            x={x + 0.5} y={y + 0.5}
            width={Math.max(w - 1, 0)} height={Math.max(h - 1, 0)}
            fill={color}
            rx={2}
            stroke={isHovered ? '#fff' : 'rgba(255,255,255,0.15)'}
            strokeWidth={isHovered ? 2 : 0.5}
            opacity={isHovered ? 1 : 0.92}
          />
          {isLarge && (
            <>
              <text
                x={x + w / 2} y={y + h / 2 - (isMedium ? 10 : 6)}
                textAnchor="middle" dominantBaseline="middle"
                fill={textColor} fontSize={Math.min(14, w / 6)}
                fontWeight={700} style={{ textShadow: '0 1px 2px rgba(0,0,0,0.4)' }}
              >
                {d.name.length > w / 12 ? d.name.slice(0, Math.floor(w / 12)) : d.name}
              </text>
              <text
                x={x + w / 2} y={y + h / 2 + (isMedium ? 8 : 4)}
                textAnchor="middle" dominantBaseline="middle"
                fill={textColor} fontSize={Math.min(16, w / 5)}
                fontWeight={800} style={{ textShadow: '0 1px 3px rgba(0,0,0,0.5)' }}
              >
                {d.changePercent >= 0 ? '+' : ''}{d.changePercent.toFixed(2)}%
              </text>
              {isMedium && risingRatio && (
                <text
                  x={x + w / 2} y={y + h / 2 + 24}
                  textAnchor="middle" dominantBaseline="middle"
                  fill={textColor} fontSize={Math.min(10, w / 8)}
                  opacity={0.8}
                >
                  涨跌 {risingRatio}
                </text>
              )}
            </>
          )}
          {!isLarge && isSmall && (
            <text
              x={x + w / 2} y={y + h / 2}
              textAnchor="middle" dominantBaseline="middle"
              fill={textColor} fontSize={Math.max(8, Math.min(11, w / 5))}
              fontWeight={600}
            >
              {d.changePercent >= 0 ? '+' : ''}{d.changePercent.toFixed(1)}%
            </text>
          )}
        </g>
      </Tooltip>
    );
  }, [hoveredCode, maxArea, onCellClick]);

  if (loading) {
    return (
      <Card title={title} size="small">
        <div style={{ height, display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#fafafa', borderRadius: 8 }}>
          <Text type="secondary">加载中...</Text>
        </div>
      </Card>
    );
  }

  if (!data || data.length === 0) {
    return (
      <Card title={title} size="small">
        <div style={{ height, display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#fafafa', borderRadius: 8 }}>
          <Text type="secondary">暂无数据</Text>
        </div>
      </Card>
    );
  }

  // Find viewBox bounds
  const maxX = layout.reduce((m, r) => Math.max(m, r.x + r.w), 800);
  const maxY = layout.reduce((m, r) => Math.max(m, r.y + r.h), height);

  return (
    <Card
      size="small"
      title={
        <Space>
          <AppstoreOutlined style={{ color: '#1890ff' }} />
          <span>{title}</span>
          <Tag color="blue">{data.length} 只</Tag>
        </Space>
      }
    >
      <svg
        width="100%"
        height={height}
        viewBox={`0 0 ${maxX} ${maxY}`}
        style={{ borderRadius: 8, overflow: 'hidden', background: '#1a1a2e' }}
      >
        {layout.map((rect, i) => renderCell(rect, i))}
      </svg>
      {/* Color Legend */}
      <div style={{
        display: 'flex', justifyContent: 'center', gap: 2,
        marginTop: 8, padding: '4px 0',
      }}>
        {[9, 7, 5, 3, 1.5, 0.5, 0, -0.5, -1.5, -3, -5, -7, -9].map(v => (
          <Tooltip key={v} title={v >= 0 ? `+${v}%` : `${v}%`}>
            <div style={{
              width: 20, height: 12,
              backgroundColor: getHeatColor(v),
              borderRadius: 2,
            }} />
          </Tooltip>
        ))}
        <Text style={{ fontSize: 10, marginLeft: 8, color: '#999' }}>涨 ← → 跌</Text>
      </div>
    </Card>
  );
});

export default MarketHeatmap;
