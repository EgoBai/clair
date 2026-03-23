/**
 * K线图组件
 * 使用 ECharts 绘制A股K线图，支持MA均线和成交量副图
 */

import React, { useMemo } from 'react';
import ReactECharts from 'echarts-for-react';
import dayjs from 'dayjs';

export interface KLineData {
  tradeDate: string;
  open: number;
  close: number;
  high: number;
  low: number;
  volume: number;
  turnover: number;
}

interface KLineChartProps {
  data: KLineData[];
  title?: string;
  height?: number;
  showMA?: boolean;
  maLines?: number[];
  loading?: boolean;
}

const KLineChart: React.FC<KLineChartProps> = ({
  data,
  title,
  height = 500,
  showMA = true,
  maLines = [5, 10, 20, 60],
  loading = false,
}) => {
  const option = useMemo(() => {
    if (!data || data.length === 0) {
      return {
        title: {
          text: title || 'K线图',
          left: 'center',
        },
        graphic: {
          type: 'text',
          left: 'center',
          top: 'middle',
          style: { text: '暂无数据', fontSize: 16, fill: '#999' },
        },
      };
    }

    const dates = data.map(d => d.tradeDate);
    const ohlcData = data.map(d => [d.open, d.close, d.low, d.high]);
    const volumes = data.map(d => d.volume);

    // 计算MA均线
    const maSeries: any[] = [];
    if (showMA) {
      for (const period of maLines) {
        const maValues = calculateMA(data, period);
        maSeries.push({
          name: `MA${period}`,
          type: 'line',
          data: maValues,
          smooth: false,
          symbol: 'none',
          lineStyle: { width: 1 },
        });
      }
    }

    return {
      title: {
        text: title,
        left: 'center',
        textStyle: { fontSize: 14 },
      },
      tooltip: {
        trigger: 'axis',
        axisPointer: { type: 'cross' },
        formatter: (params: any) => {
          const kline = params.find((p: any) => p.seriesType === 'candlestick');
          if (!kline) return '';

          const d = data[kline.dataIndex];
          const changeClass = d.close >= d.open ? 'color: #ef4444' : 'color: #22c55e';

          return `
            <div style="font-size:12px">
              <b>${d.tradeDate}</b><br/>
              开盘: <span style="${d.open >= d.close ? 'color:#22c55e' : 'color:#ef4444'}">${d.open.toFixed(2)}</span><br/>
              收盘: <span style="${changeClass}">${d.close.toFixed(2)}</span><br/>
              最高: <span style="color:#ef4444">${d.high.toFixed(2)}</span><br/>
              最低: <span style="color:#22c55e">${d.low.toFixed(2)}</span><br/>
              成交量: ${formatVolume(d.volume)}<br/>
              成交额: ${formatTurnover(d.turnover)}
            </div>
          `;
        },
      },
      legend: {
        data: showMA ? maLines.map(p => `MA${p}`) : [],
        top: 30,
      },
      grid: [
        { left: '10%', right: '8%', top: '12%', height: '55%' },
        { left: '10%', right: '8%', top: '72%', height: '18%' },
      ],
      xAxis: [
        {
          type: 'category',
          data: dates,
          gridIndex: 0,
          axisLine: { onZero: false },
          axisTick: { show: false },
          splitLine: { show: false },
          axisLabel: { show: false },
        },
        {
          type: 'category',
          data: dates,
          gridIndex: 1,
          axisLine: { onZero: false },
          axisTick: { show: false },
          splitLine: { show: false },
          axisLabel: {
            formatter: (val: string) => {
              return dayjs(val).format('MM-DD');
            },
          },
        },
      ],
      yAxis: [
        {
          scale: true,
          gridIndex: 0,
          splitArea: { show: true },
        },
        {
          scale: true,
          gridIndex: 1,
          splitNumber: 2,
          axisLabel: { show: false },
          axisLine: { show: false },
          axisTick: { show: false },
          splitLine: { show: false },
        },
      ],
      dataZoom: [
        {
          type: 'inside',
          xAxisIndex: [0, 1],
          start: 70,
          end: 100,
        },
        {
          type: 'slider',
          xAxisIndex: [0, 1],
          start: 70,
          end: 100,
          bottom: '2%',
        },
      ],
      series: [
        {
          name: 'K线',
          type: 'candlestick',
          data: ohlcData,
          xAxisIndex: 0,
          yAxisIndex: 0,
          itemStyle: {
            color: '#ef4444',       // 阳线
            color0: '#22c55e',      // 阴线
            borderColor: '#ef4444',
            borderColor0: '#22c55e',
          },
        },
        ...maSeries.map(s => ({
          ...s,
          xAxisIndex: 0,
          yAxisIndex: 0,
        })),
        {
          name: '成交量',
          type: 'bar',
          data: volumes.map((vol, i) => ({
            value: vol,
            itemStyle: {
              color: data[i].close >= data[i].open ? '#ef4444' : '#22c55e',
            },
          })),
          xAxisIndex: 1,
          yAxisIndex: 1,
        },
      ],
      animation: false,
    };
  }, [data, title, showMA, maLines]);

  return (
    <ReactECharts
      option={option}
      style={{ height: `${height}px`, width: '100%' }}
      showLoading={loading}
      notMerge={true}
    />
  );
};

// 计算移动平均线
function calculateMA(data: KLineData[], period: number): (number | null)[] {
  const result: (number | null)[] = [];

  for (let i = 0; i < data.length; i++) {
    if (i < period - 1) {
      result.push(null);
    } else {
      let sum = 0;
      for (let j = 0; j < period; j++) {
        sum += data[i - j].close;
      }
      result.push(parseFloat((sum / period).toFixed(2)));
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

export default KLineChart;
