/**
 * 分时图组件
 * 实时价格曲线 + 均价线 + 成交量柱
 * 参考 TradingView / 同花顺分时图设计
 */

import React, { useMemo, useRef } from 'react';
import ReactECharts from 'echarts-for-react';

export interface TimeLineData {
  time: string;       // HH:mm
  price: number;
  avgPrice: number;
  volume: number;
  open: number;       // 昨收价（基准价）
}

interface TimeLineChartProps {
  data: TimeLineData[];
  title?: string;
  height?: number;
  loading?: boolean;
}

const TimeLineChart: React.FC<TimeLineChartProps> = ({
  data,
  title,
  height = 400,
  loading = false,
}) => {
  const chartRef = useRef<ReactECharts>(null);

  const option = useMemo(() => {
    if (!data || data.length === 0) {
      return {
        title: { text: title || '分时图', left: 'center' },
        graphic: {
          type: 'text',
          left: 'center',
          top: 'middle',
          style: { text: '暂无数据', fontSize: 16, fill: '#999' },
        },
      };
    }

    const times = data.map(d => d.time);
    const prices = data.map(d => d.price);
    const avgPrices = data.map(d => d.avgPrice);
    const volumes = data.map(d => d.volume);
    const basePrice = data[0].open;

    // 计算价格范围用于着色
    const maxPrice = Math.max(...prices, basePrice);
    const minPrice = Math.min(...prices, basePrice);
    const priceRange = maxPrice - minPrice || 1;
    const pricePadding = priceRange * 0.1;

    // 成交量颜色（相对涨跌）
    const volumeColors = data.map(d => d.price >= basePrice ? '#ef4444' : '#22c55e');

    return {
      title: title ? { text: title, left: 'center', textStyle: { fontSize: 14 } } : undefined,
      tooltip: {
        trigger: 'axis',
        axisPointer: { type: 'cross' },
        formatter: (params: { dataIndex: number; value: number; name: string; seriesName?: string; dataType?: string }[]) => {
          const idx = params[0]?.dataIndex;
          if (idx === undefined) return '';
          const d = data[idx];
          const changePercent = basePrice > 0
            ? ((d.price - basePrice) / basePrice * 100).toFixed(2)
            : '0.00';
          const changeDir = d.price >= basePrice ? '+' : '';
          const color = d.price >= basePrice ? '#ef4444' : '#22c55e';

          return `
            <div style="font-size:12px;line-height:1.8">
              <b>${d.time}</b><br/>
              价格: <span style="color:${color};font-weight:bold">${d.price.toFixed(2)}</span>
              <span style="color:${color}">(${changeDir}${changePercent}%)</span><br/>
              均价: ${d.avgPrice.toFixed(2)}<br/>
              成交: ${formatVolume(d.volume)}
            </div>
          `;
        },
      },
      grid: [
        { left: '10%', right: '8%', top: '8%', height: '62%' },
        { left: '10%', right: '8%', top: '75%', height: '18%' },
      ],
      xAxis: [
        {
          type: 'category',
          data: times,
          gridIndex: 0,
          axisLine: { lineStyle: { color: '#ddd' } },
          axisTick: { show: false },
          axisLabel: {
            formatter: (val: string, idx: number) => {
              // 仅显示整点和半点
              if (idx % Math.max(1, Math.floor(times.length / 8)) === 0) return val;
              return '';
            },
            fontSize: 10,
          },
          splitLine: { show: false },
          boundaryGap: false,
        },
        {
          type: 'category',
          data: times,
          gridIndex: 1,
          axisLine: { lineStyle: { color: '#ddd' } },
          axisTick: { show: false },
          axisLabel: { show: false },
          splitLine: { show: false },
          boundaryGap: false,
        },
      ],
      yAxis: [
        {
          type: 'value',
          gridIndex: 0,
          min: minPrice - pricePadding,
          max: maxPrice + pricePadding,
          axisLabel: { formatter: (v: number) => v.toFixed(2), fontSize: 10 },
          splitLine: {
            lineStyle: { type: 'dashed', color: '#eee' },
          },
          axisLine: { show: false },
          axisTick: { show: false },
        },
        {
          type: 'value',
          gridIndex: 1,
          axisLabel: { show: false },
          axisLine: { show: false },
          axisTick: { show: false },
          splitLine: { show: false },
        },
      ],
      series: [
        // 价格曲线（渐变填充）
        {
          name: '价格',
          type: 'line',
          data: prices,
          symbol: 'none',
          smooth: true,
          lineStyle: { width: 1.5, color: '#3b82f6' },
          areaStyle: {
            color: {
              type: 'linear',
              x: 0, y: 0, x2: 0, y2: 1,
              colorStops: [
                { offset: 0, color: 'rgba(59,130,246,0.25)' },
                { offset: 1, color: 'rgba(59,130,246,0.02)' },
              ],
            },
          },
          xAxisIndex: 0,
          yAxisIndex: 0,
          markLine: {
            silent: true,
            symbol: 'none',
            lineStyle: { type: 'dashed', color: '#999', width: 1 },
            data: [{ yAxis: basePrice, label: { formatter: `昨收 ${basePrice.toFixed(2)}`, fontSize: 10 } }],
          },
        },
        // 均价线
        {
          name: '均价',
          type: 'line',
          data: avgPrices,
          symbol: 'none',
          smooth: true,
          lineStyle: { width: 1, color: '#f59e0b', type: 'dashed' },
          xAxisIndex: 0,
          yAxisIndex: 0,
        },
        // 成交量柱
        {
          name: '成交量',
          type: 'bar',
          data: volumes.map((vol, i) => ({
            value: vol,
            itemStyle: { color: volumeColors[i], opacity: 0.7 },
          })),
          barMaxWidth: 4,
          xAxisIndex: 1,
          yAxisIndex: 1,
        },
      ],
      animation: true,
      animationDuration: 200,
    };
  }, [data, title]);

  return (
    <ReactECharts
      ref={chartRef}
      option={option}
      style={{ height: `${height}px`, width: '100%' }}
      showLoading={loading}
      notMerge={true}
      opts={{ renderer: 'canvas' }}
    />
  );
};

function formatVolume(vol: number): string {
  if (vol >= 1e8) return `${(vol / 1e8).toFixed(2)}亿手`;
  if (vol >= 1e4) return `${(vol / 1e4).toFixed(2)}万手`;
  return `${vol}手`;
}

export default TimeLineChart;
