/**
 * 个股对比图（多股叠加K线/走势对比）
 * 支持归一化百分比对比
 * 参考 TradingView 的多股叠加对比
 */

import React, { useRef, useEffect, useMemo } from 'react';
import { Typography, Tag, Space, Empty, Select, Skeleton } from 'antd';
import { StockOutlined } from '@ant-design/icons';

const { Text } = Typography;

interface CompareStock {
  symbol: string;
  name: string;
  data: { date: string; close: number }[];
  color: string;
}

interface StockCompareChartProps {
  stocks: CompareStock[];
  width?: number;
  height?: number;
  normalize?: boolean;
  loading?: boolean;
}

const COLORS = [
  '#1890ff', '#f5222d', '#52c41a', '#fa8c16',
  '#722ed1', '#13c2c2', '#eb2f96', '#a0d911',
];

function StockCompareChart({
  stocks,
  width = 800,
  height = 400,
  normalize = true,
  loading = false,
}: StockCompareChartProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const chartData = useMemo(() => {
    if (!stocks || stocks.length === 0) return null;

    // 收集所有日期
    const allDates = new Set<string>();
    stocks.forEach((s) => s.data.forEach((d) => allDates.add(d.date)));
    const sortedDates = Array.from(allDates).sort();

    // 构建归一化数据
    const series = stocks.map((stock, idx) => {
      const dateMap = new Map(stock.data.map((d) => [d.date, d.close]));
      const basePrice = stock.data[0]?.close || 1;

      const values = sortedDates.map((date) => {
        const close = dateMap.get(date);
        if (close == null) return null;
        return normalize ? ((close - basePrice) / basePrice) * 100 : close;
      });

      return {
        symbol: stock.symbol,
        name: stock.name,
        color: stock.color || COLORS[idx % COLORS.length],
        values,
      };
    });

    // 计算 Y 轴范围
    let minY = Infinity, maxY = -Infinity;
    series.forEach((s) => {
      s.values.forEach((v) => {
        if (v == null) return;
        minY = Math.min(minY, v);
        maxY = Math.max(maxY, v);
      });
    });
    if (minY === Infinity) { minY = -10; maxY = 10; }
    const padding = (maxY - minY) * 0.1 || 5;
    minY -= padding;
    maxY += padding;

    return { sortedDates, series, minY, maxY };
  }, [stocks, normalize]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !chartData) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    canvas.width = width * dpr;
    canvas.height = height * dpr;
    ctx.scale(dpr, dpr);

    const marginLeft = 60;
    const marginRight = 20;
    const marginTop = 30;
    const marginBottom = 50;
    const plotW = width - marginLeft - marginRight;
    const plotH = height - marginTop - marginBottom;

    // 清空
    ctx.clearRect(0, 0, width, height);
    ctx.fillStyle = '#fafafa';
    ctx.fillRect(0, 0, width, height);

    const { sortedDates, series, minY, maxY } = chartData;

    // 基准线 (0%)
    if (normalize) {
      const zeroY = marginTop + plotH * (1 - (0 - minY) / (maxY - minY));
      ctx.strokeStyle = '#999';
      ctx.lineWidth = 1;
      ctx.setLineDash([5, 5]);
      ctx.beginPath();
      ctx.moveTo(marginLeft, zeroY);
      ctx.lineTo(marginLeft + plotW, zeroY);
      ctx.stroke();
      ctx.setLineDash([]);

      // 0% 标签
      ctx.fillStyle = '#999';
      ctx.font = '11px sans-serif';
      ctx.textAlign = 'right';
      ctx.fillText('0%', marginLeft - 8, zeroY + 4);
    }

    // Y 轴刻度
    const yTicks = 5;
    for (let i = 0; i <= yTicks; i++) {
      const val = minY + (maxY - minY) * (i / yTicks);
      const y = marginTop + plotH * (1 - i / yTicks);

      ctx.strokeStyle = '#f0f0f0';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(marginLeft, y);
      ctx.lineTo(marginLeft + plotW, y);
      ctx.stroke();

      ctx.fillStyle = '#999';
      ctx.font = '11px sans-serif';
      ctx.textAlign = 'right';
      ctx.fillText(
        normalize ? `${val.toFixed(1)}%` : val.toFixed(2),
        marginLeft - 8,
        y + 4
      );
    }

    // X 轴标签
    const xLabelCount = Math.min(8, sortedDates.length);
    const xStep = Math.max(1, Math.floor(sortedDates.length / xLabelCount));
    ctx.fillStyle = '#999';
    ctx.font = '11px sans-serif';
    ctx.textAlign = 'center';
    for (let i = 0; i < sortedDates.length; i += xStep) {
      const x = marginLeft + (i / (sortedDates.length - 1)) * plotW;
      ctx.fillText(sortedDates[i].slice(5), x, height - marginBottom + 20);
    }

    // 绘制折线
    series.forEach((s) => {
      ctx.strokeStyle = s.color;
      ctx.lineWidth = 2;
      ctx.beginPath();
      let started = false;

      s.values.forEach((v, i) => {
        if (v == null) return;
        const x = marginLeft + (i / (sortedDates.length - 1)) * plotW;
        const y = marginTop + plotH * (1 - (v - minY) / (maxY - minY));

        if (!started) {
          ctx.moveTo(x, y);
          started = true;
        } else {
          ctx.lineTo(x, y);
        }
      });
      ctx.stroke();
    });

    // 图例
    series.forEach((s, i) => {
      const legendX = marginLeft + i * 120;
      const legendY = 12;
      ctx.fillStyle = s.color;
      ctx.fillRect(legendX, legendY - 6, 16, 3);
      ctx.fillStyle = '#333';
      ctx.font = '12px sans-serif';
      ctx.textAlign = 'left';
      ctx.fillText(`${s.symbol} ${s.name}`, legendX + 20, legendY);
    });

  }, [chartData, width, height, normalize]);

  if (!stocks || stocks.length === 0) {
    return (
      <div style={{
        width, height,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: '#fafafa', borderRadius: 8,
      }}>
        <Empty description="添加股票进行对比" image={Empty.PRESENTED_IMAGE_SIMPLE} />
      </div>
    );
  }

  if (loading) {
    return (
      <div style={{ width, height, display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#fafafa', borderRadius: 8 }}>
        <Skeleton active paragraph={{ rows: 4 }} style={{ width: '80%' }} />
      </div>
    );
  }

  return (
    <div className="stock-compare-chart">
      <canvas
        ref={canvasRef}
        style={{ width, height, borderRadius: 8 }}
      />
    </div>
  );
}

export default StockCompareChart;
