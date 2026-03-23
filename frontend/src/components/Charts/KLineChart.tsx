/**
 * 增强K线图组件
 * 支持: K线+成交量+技术指标三合一看图、MA/EMA均线、十字光标、画线工具
 * 参考 TradingView 交互设计
 */

import React, { useMemo, useRef, useCallback } from 'react';
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
  showEMA?: boolean;
  emaLines?: number[];
  subIndicator?: 'volume' | 'macd' | 'kdj' | 'rsi' | 'none';
  indicatorData?: any[];
  loading?: boolean;
}

const KLineChart: React.FC<KLineChartProps> = ({
  data,
  title,
  height = 500,
  showMA = true,
  maLines = [5, 10, 20, 60],
  showEMA = false,
  emaLines = [12, 26],
  subIndicator = 'volume',
  indicatorData = [],
  loading = false,
}) => {
  const chartRef = useRef<ReactECharts>(null);

  // K线导出为图片
  const exportImage = useCallback(() => {
    const instance = chartRef.current?.getEchartsInstance();
    if (instance) {
      const url = instance.getDataURL({ type: 'png', pixelRatio: 2, backgroundColor: '#fff' });
      const link = document.createElement('a');
      link.download = `${title || 'kline'}-${dayjs().format('YYYYMMDD')}.png`;
      link.href = url;
      link.click();
    }
  }, [title]);

  const option = useMemo(() => {
    if (!data || data.length === 0) {
      return {
        title: { text: title || 'K线图', left: 'center' },
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
        const maValues = calculateMA(data.map(d => d.close), period);
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

    // 计算EMA均线
    const emaSeries: any[] = [];
    if (showEMA) {
      for (const period of emaLines) {
        const emaValues = calculateEMA(data.map(d => d.close), period);
        emaSeries.push({
          name: `EMA${period}`,
          type: 'line',
          data: emaValues,
          smooth: false,
          symbol: 'none',
          lineStyle: { width: 1.2, type: 'dashed' },
        });
      }
    }

    // 副图指标
    let subChartSeries: any[] = [];
    let subYAxis: any = { scale: true, gridIndex: 1, splitNumber: 2, axisLabel: { show: false }, axisLine: { show: false }, axisTick: { show: false }, splitLine: { show: false } };

    if (subIndicator === 'volume') {
      subChartSeries = [{
        name: '成交量',
        type: 'bar',
        data: volumes.map((vol, i) => ({
          value: vol,
          itemStyle: { color: data[i].close >= data[i].open ? '#ef4444' : '#22c55e' },
        })),
        xAxisIndex: 1,
        yAxisIndex: 1,
      }];
    } else if (subIndicator === 'macd' && indicatorData.length > 0) {
      subChartSeries = [
        {
          name: 'DIF',
          type: 'line',
          data: indicatorData.map(d => d.macd ?? null),
          symbol: 'none',
          lineStyle: { width: 1.5, color: '#3b82f6' },
          xAxisIndex: 1,
          yAxisIndex: 1,
        },
        {
          name: 'DEA',
          type: 'line',
          data: indicatorData.map(d => d.macdSignal ?? null),
          symbol: 'none',
          lineStyle: { width: 1.5, color: '#f59e0b' },
          xAxisIndex: 1,
          yAxisIndex: 1,
        },
        {
          name: 'MACD柱',
          type: 'bar',
          data: indicatorData.map(d => {
            const val = d.macdHistogram;
            if (val === undefined || val === null) return null;
            return { value: val, itemStyle: { color: val >= 0 ? '#ef4444' : '#22c55e' } };
          }),
          barMaxWidth: 6,
          xAxisIndex: 1,
          yAxisIndex: 1,
        },
      ];
    } else if (subIndicator === 'kdj' && indicatorData.length > 0) {
      subChartSeries = [
        {
          name: 'K', type: 'line',
          data: indicatorData.map(d => d.kdjK ?? null),
          symbol: 'none', lineStyle: { width: 1.5, color: '#3b82f6' },
          xAxisIndex: 1, yAxisIndex: 1,
        },
        {
          name: 'D', type: 'line',
          data: indicatorData.map(d => d.kdjD ?? null),
          symbol: 'none', lineStyle: { width: 1.5, color: '#f59e0b' },
          xAxisIndex: 1, yAxisIndex: 1,
        },
        {
          name: 'J', type: 'line',
          data: indicatorData.map(d => d.kdjJ ?? null),
          symbol: 'none', lineStyle: { width: 1.5, color: '#ef4444' },
          xAxisIndex: 1, yAxisIndex: 1,
        },
      ];
    } else if (subIndicator === 'rsi' && indicatorData.length > 0) {
      subChartSeries = [{
        name: 'RSI', type: 'line',
        data: indicatorData.map(d => d.rsi ?? null),
        symbol: 'none',
        lineStyle: { width: 1.5, color: '#8b5cf6' },
        areaStyle: { color: 'rgba(139,92,246,0.08)' },
        xAxisIndex: 1, yAxisIndex: 1,
      }];
      subYAxis = { min: 0, max: 100, gridIndex: 1, axisLabel: { show: false }, axisLine: { show: false }, axisTick: { show: false }, splitLine: { show: false } };
    }

    const hasSub = subIndicator !== 'none';

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
          if (!d) return '';

          const changePercent = d.open > 0 ? ((d.close - d.open) / d.open * 100).toFixed(2) : '0.00';
          const changeDir = d.close >= d.open ? '+' : '';

          let html = `
            <div style="font-size:12px;line-height:1.8">
              <b>${d.tradeDate}</b>
              <span style="float:right;color:${d.close >= d.open ? '#ef4444' : '#22c55e'}">${changeDir}${changePercent}%</span><br/>
              开: <span style="color:${d.close >= d.open ? '#ef4444' : '#22c55e'}">${d.open.toFixed(2)}</span>
              高: <span style="color:#ef4444">${d.high.toFixed(2)}</span>
              低: <span style="color:#22c55e">${d.low.toFixed(2)}</span>
              收: <span style="color:${d.close >= d.open ? '#ef4444' : '#22c55e'}">${d.close.toFixed(2)}</span><br/>
              量: ${formatVolume(d.volume)}
              额: ${formatTurnover(d.turnover)}
            </div>
          `;

          // 附带MA值
          if (showMA && maSeries.length > 0) {
            html += '<div style="font-size:11px;margin-top:4px">';
            for (const s of maSeries) {
              const val = s.data[kline.dataIndex];
              if (val !== null && val !== undefined) {
                html += `<span style="margin-right:8px">${s.name}: ${val.toFixed(2)}</span>`;
              }
            }
            html += '</div>';
          }

          return html;
        },
      },
      legend: {
        data: [
          ...(showMA ? maLines.map(p => `MA${p}`) : []),
          ...(showEMA ? emaLines.map(p => `EMA${p}`) : []),
        ],
        top: 28,
        textStyle: { fontSize: 11 },
      },
      axisPointer: {
        link: [{ xAxisIndex: 'all' }],
        label: { backgroundColor: '#777' },
      },
      grid: [
        { left: '10%', right: '8%', top: '12%', height: hasSub ? '50%' : '75%' },
        { left: '10%', right: '8%', top: '68%', height: hasSub ? '18%' : '0%' },
      ],
      xAxis: [
        {
          type: 'category',
          data: dates,
          gridIndex: 0,
          axisLine: { onZero: false },
          axisTick: { show: false },
          splitLine: { show: false },
          axisLabel: { show: !hasSub },
          boundaryGap: false,
        },
        {
          type: 'category',
          data: dates,
          gridIndex: 1,
          axisLine: { onZero: false },
          axisTick: { show: false },
          splitLine: { show: false },
          axisLabel: {
            formatter: (val: string) => dayjs(val).format('MM-DD'),
          },
          boundaryGap: false,
        },
      ],
      yAxis: [
        {
          scale: true,
          gridIndex: 0,
          splitArea: { show: true },
          axisLabel: { formatter: (val: number) => val.toFixed(2) },
        },
        subYAxis,
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
          height: 18,
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
          barWidth: '60%',
        },
        ...maSeries.map(s => ({ ...s, xAxisIndex: 0, yAxisIndex: 0 })),
        ...emaSeries.map(s => ({ ...s, xAxisIndex: 0, yAxisIndex: 0 })),
        ...subChartSeries,
      ],
      animation: true,
      animationDuration: 300,
    };
  }, [data, title, showMA, maLines, showEMA, emaLines, subIndicator, indicatorData]);

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

// === 工具函数 ===

function calculateMA(prices: number[], period: number): (number | null)[] {
  const result: (number | null)[] = [];
  for (let i = 0; i < prices.length; i++) {
    if (i < period - 1) {
      result.push(null);
    } else {
      let sum = 0;
      for (let j = 0; j < period; j++) sum += prices[i - j];
      result.push(parseFloat((sum / period).toFixed(2)));
    }
  }
  return result;
}

function calculateEMA(prices: number[], period: number): (number | null)[] {
  const result: (number | null)[] = [];
  const multiplier = 2 / (period + 1);
  for (let i = 0; i < prices.length; i++) {
    if (i < period - 1) {
      result.push(null);
    } else if (i === period - 1) {
      let sum = 0;
      for (let j = 0; j < period; j++) sum += prices[i - j];
      result.push(parseFloat((sum / period).toFixed(2)));
    } else {
      const prev = result[i - 1]!;
      result.push(parseFloat(((prices[i] - prev) * multiplier + prev).toFixed(2)));
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
