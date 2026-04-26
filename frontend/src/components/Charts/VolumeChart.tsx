/**
 * 成交量图表组件
 * 展示股票成交量和成交额趋势
 */

import React, { useMemo } from 'react';
import ReactECharts from 'echarts-for-react';
import dayjs from 'dayjs';

export interface VolumeData {
  tradeDate: string;
  volume: number;
  turnover: number;
  changePercent: number;
}

interface VolumeChartProps {
  data: VolumeData[];
  title?: string;
  height?: number;
  showTurnover?: boolean;
  loading?: boolean;
}

const VolumeChart: React.FC<VolumeChartProps> = React.memo(({
  data,
  title = '成交量',
  height = 300,
  showTurnover = false,
  loading = false,
}) => {
  const option = useMemo(() => {
    if (!data || data.length === 0) {
      return {
        title: { text: title, left: 'center' },
        graphic: {
          type: 'text',
          left: 'center',
          top: 'middle',
          style: { text: '暂无数据', fontSize: 16, fill: '#999' },
        },
      };
    }

    const dates = data.map(d => dayjs(d.tradeDate).format('MM-DD'));
    const volumes = data.map(d => ({
      value: d.volume,
      itemStyle: {
        color: d.changePercent >= 0 ? '#ef4444' : '#22c55e',
      },
    }));
    const turnovers = data.map(d => d.turnover);

    // 计算5日和10日均量
    const ma5 = calculateMA(data.map(d => d.volume), 5);
    const ma10 = calculateMA(data.map(d => d.volume), 10);

    const series: any[] = [
      {
        name: '成交量',
        type: 'bar',
        data: volumes,
        barMaxWidth: 20,
      },
      {
        name: 'MA5',
        type: 'line',
        data: ma5,
        smooth: true,
        symbol: 'none',
        lineStyle: { width: 1, color: '#f59e0b' },
      },
      {
        name: 'MA10',
        type: 'line',
        data: ma10,
        smooth: true,
        symbol: 'none',
        lineStyle: { width: 1, color: '#3b82f6' },
      },
    ];

    if (showTurnover) {
      series.push({
        name: '成交额',
        type: 'line',
        data: turnovers,
        smooth: true,
        symbol: 'none',
        yAxisIndex: 1,
        lineStyle: { width: 1, color: '#8b5cf6' },
      });
    }

    return {
      title: {
        text: title,
        left: 'center',
        textStyle: { fontSize: 14 },
      },
      tooltip: {
        trigger: 'axis',
        formatter: (params: { dataIndex: number; value: number; name: string; seriesName?: string; dataType?: string }[]) => {
          const idx = params[0]?.dataIndex;
          if (idx === undefined || !data[idx]) return '';

          const d = data[idx];
          return `
            <div style="font-size:12px">
              <b>${d.tradeDate}</b><br/>
              成交量: ${formatVolume(d.volume)}<br/>
              成交额: ${formatTurnover(d.turnover)}<br/>
              涨跌幅: ${d.changePercent >= 0 ? '+' : ''}${d.changePercent.toFixed(2)}%
            </div>
          `;
        },
      },
      legend: {
        data: showTurnover ? ['成交量', 'MA5', 'MA10', '成交额'] : ['成交量', 'MA5', 'MA10'],
        top: 30,
      },
      grid: {
        left: '10%',
        right: showTurnover ? '10%' : '8%',
        top: '18%',
        bottom: '12%',
      },
      xAxis: {
        type: 'category',
        data: dates,
        axisLabel: {
          formatter: (val: string) => val,
        },
      },
      yAxis: [
        {
          type: 'value',
          name: '成交量',
          axisLabel: {
            formatter: (val: number) => {
              if (val >= 1e8) return `${(val / 1e8).toFixed(0)}亿`;
              if (val >= 1e4) return `${(val / 1e4).toFixed(0)}万`;
              return val.toString();
            },
          },
        },
        ...(showTurnover
          ? [
              {
                type: 'value',
                name: '成交额',
                position: 'right' as const,
                axisLabel: {
                  formatter: (val: number) => {
                    if (val >= 1e8) return `${(val / 1e8).toFixed(0)}亿`;
                    if (val >= 1e4) return `${(val / 1e4).toFixed(0)}万`;
                    return val.toString();
                  },
                },
              },
            ]
          : []),
      ],
      dataZoom: [
        {
          type: 'inside',
          start: 70,
          end: 100,
        },
        {
          type: 'slider',
          start: 70,
          end: 100,
          bottom: '2%',
        },
      ],
      series,
      animation: false,
    };
  }, [data, title, showTurnover]);

  return (
    <ReactECharts
      option={option}
      style={{ height: `${height}px`, width: '100%' }}
      showLoading={loading}
      notMerge={true}
    />
  );
});

function calculateMA(values: number[], period: number): (number | null)[] {
  const result: (number | null)[] = [];
  for (let i = 0; i < values.length; i++) {
    if (i < period - 1) {
      result.push(null);
    } else {
      let sum = 0;
      for (let j = 0; j < period; j++) {
        sum += values[i - j];
      }
      result.push(Math.round(sum / period));
    }
  }
  return result;
}

function formatVolume(vol: number): string {
  if (vol >= 1e8) return `${(vol / 1e8).toFixed(2)}亿手`;
  if (vol >= 1e4) return `${(vol / 1e4).toFixed(2)}万手`;
  return `${vol}手`;
}

function formatTurnover(turnover: number): string {
  if (turnover >= 1e8) return `${(turnover / 1e8).toFixed(2)}亿`;
  if (turnover >= 1e4) return `${(turnover / 1e4).toFixed(2)}万`;
  return `${turnover}`;
}

export default VolumeChart;
