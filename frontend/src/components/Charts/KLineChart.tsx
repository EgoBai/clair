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

interface IndicatorData {
  macd?: number;
  macdSignal?: number;
  macdHist?: number;
  kdjK?: number;
  kdjD?: number;
  kdjJ?: number;
  rsi?: number;
  [key: string]: number | undefined;
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
  indicatorData?: IndicatorData[];
  loading?: boolean;
}

const KLineChart = React.memo<KLineChartProps>(({
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
    interface LineSeriesOption {
      name: string;
      type: 'line';
      data: (number | null)[];
      smooth: boolean;
      symbol: string;
      lineStyle: { width: number; type?: string };
      xAxisIndex?: number;
      yAxisIndex?: number;
    }
    const maSeries: LineSeriesOption[] = [];
    const maDataSets: Map<number, (number | null)[]> = new Map();
    if (showMA) {
      for (const period of maLines) {
        const maValues = calculateMA(data.map(d => d.close), period);
        maDataSets.set(period, maValues);
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

    // 布林带 BOLL (MA20 ± 2σ)
    const bollSeries: LineSeriesOption[] = [];
    const bollMid = calculateMA(data.map(d => d.close), 20);
    const bollUpper: (number | null)[] = [];
    const bollLower: (number | null)[] = [];
    for (let i = 0; i < data.length; i++) {
      if (bollMid[i] === null) {
        bollUpper.push(null); bollLower.push(null);
      } else {
        let sumSq = 0, count = 0;
        for (let j = Math.max(0, i - 19); j <= i; j++) {
          sumSq += Math.pow(data[j].close - bollMid[i]!, 2);
          count++;
        }
        const std = Math.sqrt(sumSq / count);
        bollUpper.push(parseFloat((bollMid[i]! + 2 * std).toFixed(2)));
        bollLower.push(parseFloat((bollMid[i]! - 2 * std).toFixed(2)));
      }
    }
    bollSeries.push(
      { name: 'BOLL上轨', type: 'line', data: bollUpper, smooth: false, symbol: 'none', lineStyle: { width: 0.8, color: 'rgba(59,130,246,0.4)' } as any },
      { name: 'BOLL中轨', type: 'line', data: bollMid, smooth: false, symbol: 'none', lineStyle: { width: 1, color: 'rgba(59,130,246,0.6)' } as any },
      { name: 'BOLL下轨', type: 'line', data: bollLower, smooth: false, symbol: 'none', lineStyle: { width: 0.8, color: 'rgba(59,130,246,0.4)' } as any },
    );
    // BOLL 带区域
    bollSeries.push({
      name: 'BOLL带', type: 'line', data: bollUpper, smooth: false, symbol: 'none',
      lineStyle: { opacity: 0 },
      areaStyle: { color: 'rgba(59,130,246,0.05)' },
    } as any);

    // 检测均线交叉信号（金叉/死叉）- 使用短周期MA5和MA10
    interface CrossSignalPoint {
      coord: [number, number];
      symbol: string;
      symbolSize: number;
      itemStyle: { color: string };
      label: { show: boolean; formatter: string; position: string; fontSize: number; color: string };
    }
    const crossSignals: CrossSignalPoint[] = [];
    if (showMA && maLines.includes(5) && maLines.includes(10)) {
      const ma5 = maDataSets.get(5)!;
      const ma10 = maDataSets.get(10)!;
      for (let i = 1; i < data.length; i++) {
        const prev5 = ma5[i - 1], prev10 = ma10[i - 1];
        const curr5 = ma5[i], curr10 = ma10[i];
        if (prev5 === null || prev10 === null || curr5 === null || curr10 === null) continue;
        // 金叉: MA5 从下穿过 MA10
        if (prev5 <= prev10 && curr5 > curr10) {
          crossSignals.push({
            coord: [i, data[i].low],
            symbol: 'triangle',
            symbolSize: 12,
            itemStyle: { color: '#ef4444' },
            label: { show: true, formatter: '金叉', position: 'bottom', fontSize: 9, color: '#ef4444' },
          });
        }
        // 死叉: MA5 从上穿过 MA10
        if (prev5 >= prev10 && curr5 < curr10) {
          crossSignals.push({
            coord: [i, data[i].high],
            symbol: 'pin',
            symbolSize: 12,
            itemStyle: { color: '#22c55e' },
            label: { show: true, formatter: '死叉', position: 'top', fontSize: 9, color: '#22c55e' },
          });
        }
      }
    }

    // 计算EMA均线
    const emaSeries: LineSeriesOption[] = [];
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
    interface SubSeriesOption {
      name: string;
      type: string;
      data: unknown[];
      xAxisIndex: number;
      yAxisIndex: number;
      [key: string]: unknown;
    }
    interface SubYAxisOption {
      scale?: boolean;
      gridIndex: number;
      splitNumber?: number;
      axisLabel: { show: boolean };
      axisLine: { show: boolean };
      axisTick: { show: boolean };
      splitLine: { show: boolean };
      [key: string]: unknown;
    }
    let subChartSeries: SubSeriesOption[] = [];
    let subYAxis: SubYAxisOption = { scale: true, gridIndex: 1, splitNumber: 2, axisLabel: { show: false }, axisLine: { show: false }, axisTick: { show: false }, splitLine: { show: false } };

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
        axisPointer: { type: 'cross', crossStyle: { color: '#999' } },
        backgroundColor: 'rgba(255,255,255,0.96)',
        borderColor: '#e5e7eb',
        borderWidth: 1,
        padding: [8, 12],
        textStyle: { fontSize: 12, color: '#1f2937' },
        formatter: (params: { seriesType: string; dataIndex: number; seriesName: string; value: number[]; color: string }[]) => {
          const kline = params.find((p) => p.seriesType === 'candlestick');
          if (!kline) return '';

          const d = data[kline.dataIndex];
          if (!d) return '';

          const changePercent = d.open > 0 ? ((d.close - d.open) / d.open * 100).toFixed(2) : '0.00';
          const changeAmount = (d.close - d.open).toFixed(2);
          const changeDir = d.close >= d.open ? '+' : '';
          const color = d.close >= d.open ? '#ef4444' : '#22c55e';

          // 成交量柱形指示 (相对最大成交量比例)
          const maxVol = Math.max(...data.map(dd => dd.volume));
          const volPct = maxVol > 0 ? Math.round((d.volume / maxVol) * 100) : 0;
          const volBar = '█'.repeat(Math.min(Math.round(volPct / 5), 20)) + '░'.repeat(20 - Math.min(Math.round(volPct / 5), 20));

          let html = `
            <div style="font-size:12px;line-height:1.6;min-width:220px">
              <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px">
                <b style="font-size:13px">${d.tradeDate}</b>
                <span style="color:${color};font-weight:600;font-size:13px">
                  ${changeDir}${changeAmount} (${changeDir}${changePercent}%)
                </span>
              </div>
              <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:2px;font-size:11px">
                <div>开 <span style="color:${color};font-weight:500">${d.open.toFixed(2)}</span></div>
                <div>高 <span style="color:#ef4444;font-weight:500">${d.high.toFixed(2)}</span></div>
                <div>低 <span style="color:#22c55e;font-weight:500">${d.low.toFixed(2)}</span></div>
                <div>收 <span style="color:${color};font-weight:500">${d.close.toFixed(2)}</span></div>
              </div>
              <div style="margin-top:4px;font-size:11px;color:#6b7280">
                额: ${formatTurnover(d.turnover)}
              </div>
              <div style="margin-top:2px;font-size:11px">
                <span style="color:#6b7280">量: ${formatVolume(d.volume)}</span>
                <span style="margin-left:8px;font-family:monospace;color:#9ca3af">${volBar}</span>
              </div>
          `;

          // 附带MA值 - TradingView风格, 每个MA用对应颜色显示
          if (showMA && maSeries.length > 0) {
            html += '<div style="display:flex;gap:10px;font-size:11px;margin-top:4px;padding-top:4px;border-top:1px solid #f3f4f6">';
            const maColors = ['#f59e0b', '#3b82f6', '#8b5cf6', '#ec4899', '#14b8a6', '#f97316'];
            for (let si = 0; si < maSeries.length; si++) {
              const s = maSeries[si];
              const val = s.data[kline.dataIndex];
              if (val !== null && val !== undefined) {
                const c = maColors[si % maColors.length];
                html += `<span style="color:${c};font-weight:500">${s.name}: ${val.toFixed(2)}</span>`;
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
          'BOLL上轨', 'BOLL中轨', 'BOLL下轨',
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
          zoomOnMouseWheel: true,
          moveOnMouseMove: true,
          moveOnMouseWheel: false,
          preventDefaultMouseMove: true,
        },
        {
          type: 'slider',
          xAxisIndex: [0, 1],
          start: 70,
          end: 100,
          bottom: '2%',
          height: 18,
          fillerColor: 'rgba(59,130,246,0.08)',
          borderColor: '#e5e7eb',
          handleStyle: { color: '#3b82f6' },
        },
      ],
      animation: true,
      animationDuration: 200,
      animationDurationUpdate: 150,
      animationEasing: 'cubicOut',
      animationEasingUpdate: 'cubicOut',
      series: [
        {
          name: 'K线',
          type: 'candlestick',
          data: ohlcData,
          xAxisIndex: 0,
          yAxisIndex: 0,
          itemStyle: {
            color: '#cf2a2a',       // 阳线 (涨) — 中国红
            color0: '#1db468',      // 阴线 (跌) — 绿色
            borderColor: '#cf2a2a',
            borderColor0: '#1db468',
          },
          barWidth: '55%',
          // 富途风格：阳线空心，阴线实心
          emphasis: { itemStyle: { color: '#cf2a2a', color0: '#1db468' } },
          markPoint: crossSignals.length > 0 ? {
            data: crossSignals,
            animation: false,
          } : undefined,
        },
        ...maSeries.map(s => ({ ...s, xAxisIndex: 0, yAxisIndex: 0 })),
        ...bollSeries.map(s => ({ ...s, xAxisIndex: 0, yAxisIndex: 0 })),
        ...emaSeries.map(s => ({ ...s, xAxisIndex: 0, yAxisIndex: 0 })),
        ...subChartSeries,
      ],
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
});

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
