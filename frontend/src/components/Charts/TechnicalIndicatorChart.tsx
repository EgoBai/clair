/**
 * 技术指标图表组件
 * 支持 MACD、KDJ、RSI、布林带 等指标
 */

import React, { useMemo } from 'react';
import ReactECharts from 'echarts-for-react';
import echarts from '@/utils/echarts';

export interface IndicatorData {
  tradeDate: string;
  close?: number;
  // MACD
  macd?: number;
  macdSignal?: number;
  macdHistogram?: number;
  // KDJ
  kdjK?: number;
  kdjD?: number;
  kdjJ?: number;
  // RSI
  rsi?: number;
  // 布林带
  bollUpper?: number;
  bollMiddle?: number;
  bollLower?: number;
}

interface TechnicalIndicatorChartProps {
  data: IndicatorData[];
  type: 'macd' | 'kdj' | 'rsi' | 'boll';
  title?: string;
  height?: number;
  loading?: boolean;
}

const TechnicalIndicatorChart = React.memo<TechnicalIndicatorChartProps>(({
  data,
  type,
  title,
  height = 350,
  loading = false,
}) => {
  const option = useMemo(() => {
    if (!data || data.length === 0) {
      return {
        title: { text: title || type.toUpperCase(), left: 'center' },
        graphic: {
          type: 'text',
          left: 'center',
          top: 'middle',
          style: { text: '暂无数据', fontSize: 16, fill: '#999' },
        },
      };
    }

    const dates = data.map(d => d.tradeDate);

    switch (type) {
      case 'macd':
        return buildMACDOption(data, dates, title);
      case 'kdj':
        return buildKDJOption(data, dates, title);
      case 'rsi':
        return buildRSIOption(data, dates, title);
      case 'boll':
        return buildBOLLOption(data, dates, title);
      default:
        return {};
    }
  }, [data, type, title]);

  return (
    <ReactECharts echarts={echarts}
      option={option}
      style={{ height: `${height}px`, width: '100%' }}
      showLoading={loading}
      notMerge={true}
    />
  );
});

function buildMACDOption(data: IndicatorData[], dates: string[], title?: string) {
  const macdValues = data.map(d => d.macd ?? null);
  const signalValues = data.map(d => d.macdSignal ?? null);
  const histogramValues = data.map(d => {
    const val = d.macdHistogram;
    if (val === undefined || val === null) return null;
    return {
      value: val,
      itemStyle: { color: val >= 0 ? '#ef4444' : '#22c55e' },
    };
  });

  return {
    title: { text: title || 'MACD', left: 'center', textStyle: { fontSize: 14 } },
    tooltip: { trigger: 'axis', axisPointer: { type: 'cross' } },
    legend: { data: ['DIF', 'DEA', 'MACD'], top: 25 },
    grid: { left: '10%', right: '8%', top: '18%', bottom: '12%' },
    xAxis: {
      type: 'category',
      data: dates,
      axisLabel: { formatter: (val: string) => val.slice(5) },
    },
    yAxis: { type: 'value', scale: true },
    dataZoom: [
      { type: 'inside', start: 70, end: 100 },
      { type: 'slider', start: 70, end: 100, bottom: '2%' },
    ],
    series: [
      {
        name: 'DIF',
        type: 'line',
        data: macdValues,
        symbol: 'none',
        lineStyle: { width: 1.5, color: '#3b82f6' },
      },
      {
        name: 'DEA',
        type: 'line',
        data: signalValues,
        symbol: 'none',
        lineStyle: { width: 1.5, color: '#f59e0b' },
      },
      {
        name: 'MACD',
        type: 'bar',
        data: histogramValues,
        barMaxWidth: 8,
      },
    ],
    animation: false,
  };
}

function buildKDJOption(data: IndicatorData[], dates: string[], title?: string) {
  return {
    title: { text: title || 'KDJ', left: 'center', textStyle: { fontSize: 14 } },
    tooltip: { trigger: 'axis', axisPointer: { type: 'cross' } },
    legend: { data: ['K', 'D', 'J'], top: 25 },
    grid: { left: '10%', right: '8%', top: '18%', bottom: '12%' },
    xAxis: {
      type: 'category',
      data: dates,
      axisLabel: { formatter: (val: string) => val.slice(5) },
    },
    yAxis: { type: 'value', scale: true },
    dataZoom: [
      { type: 'inside', start: 70, end: 100 },
      { type: 'slider', start: 70, end: 100, bottom: '2%' },
    ],
    series: [
      {
        name: 'K',
        type: 'line',
        data: data.map(d => d.kdjK ?? null),
        symbol: 'none',
        lineStyle: { width: 1.5, color: '#3b82f6' },
      },
      {
        name: 'D',
        type: 'line',
        data: data.map(d => d.kdjD ?? null),
        symbol: 'none',
        lineStyle: { width: 1.5, color: '#f59e0b' },
      },
      {
        name: 'J',
        type: 'line',
        data: data.map(d => d.kdjJ ?? null),
        symbol: 'none',
        lineStyle: { width: 1.5, color: '#ef4444' },
      },
    ],
    visualMap: {
      show: false,
      pieces: [
        { gt: 80, color: '#ef4444' },
        { lt: 20, color: '#22c55e' },
      ],
      seriesIndex: 0,
    },
    animation: false,
  };
}

function buildRSIOption(data: IndicatorData[], dates: string[], title?: string) {
  return {
    title: { text: title || 'RSI', left: 'center', textStyle: { fontSize: 14 } },
    tooltip: { trigger: 'axis', axisPointer: { type: 'cross' } },
    legend: { data: ['RSI'], top: 25 },
    grid: { left: '10%', right: '8%', top: '18%', bottom: '12%' },
    xAxis: {
      type: 'category',
      data: dates,
      axisLabel: { formatter: (val: string) => val.slice(5) },
    },
    yAxis: { type: 'value', min: 0, max: 100 },
    dataZoom: [
      { type: 'inside', start: 70, end: 100 },
      { type: 'slider', start: 70, end: 100, bottom: '2%' },
    ],
    series: [
      {
        name: 'RSI',
        type: 'line',
        data: data.map(d => d.rsi ?? null),
        symbol: 'none',
        lineStyle: { width: 1.5, color: '#8b5cf6' },
        areaStyle: { color: 'rgba(139, 92, 246, 0.1)' },
      },
    ],
    visualMap: {
      show: false,
      pieces: [
        { gt: 70, color: '#ef4444' },
        { lt: 30, color: '#22c55e' },
        { gte: 30, lte: 70, color: '#8b5cf6' },
      ],
      seriesIndex: 0,
    },
    animation: false,
  };
}

function buildBOLLOption(data: IndicatorData[], dates: string[], title?: string) {
  return {
    title: { text: title || '布林带', left: 'center', textStyle: { fontSize: 14 } },
    tooltip: { trigger: 'axis', axisPointer: { type: 'cross' } },
    legend: { data: ['上轨', '中轨', '下轨', '收盘价'], top: 25 },
    grid: { left: '10%', right: '8%', top: '18%', bottom: '12%' },
    xAxis: {
      type: 'category',
      data: dates,
      axisLabel: { formatter: (val: string) => val.slice(5) },
    },
    yAxis: { type: 'value', scale: true },
    dataZoom: [
      { type: 'inside', start: 70, end: 100 },
      { type: 'slider', start: 70, end: 100, bottom: '2%' },
    ],
    series: [
      {
        name: '上轨',
        type: 'line',
        data: data.map(d => d.bollUpper ?? null),
        symbol: 'none',
        lineStyle: { width: 1, color: '#ef4444', type: 'dashed' },
      },
      {
        name: '中轨',
        type: 'line',
        data: data.map(d => d.bollMiddle ?? null),
        symbol: 'none',
        lineStyle: { width: 1.5, color: '#3b82f6' },
      },
      {
        name: '下轨',
        type: 'line',
        data: data.map(d => d.bollLower ?? null),
        symbol: 'none',
        lineStyle: { width: 1, color: '#22c55e', type: 'dashed' },
      },
      {
        name: '收盘价',
        type: 'line',
        data: data.map(d => d.close ?? null),
        symbol: 'none',
        lineStyle: { width: 1, color: '#666' },
      },
    ],
    animation: false,
  };
}

export default TechnicalIndicatorChart;
