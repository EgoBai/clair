/**
 * 技术指标面板组件
 * 独立展示 MACD / KDJ / RSI / BOLL / VWAP / OBV / ADX(DMI) / CCI / W%R / BIAS / ATR
 * 可嵌入到详情页或独立面板
 */

import React, { useMemo } from 'react';
import ReactECharts from 'echarts-for-react';
import echarts from '@/utils/echarts';
import { Card, Tabs, Skeleton } from 'antd';

export interface IndicatorPoint {
  date: string;
  // MACD
  dif?: number;
  dea?: number;
  macd?: number;
  // KDJ
  k?: number;
  d?: number;
  j?: number;
  // RSI
  rsi6?: number;
  rsi12?: number;
  rsi24?: number;
  // BOLL
  bollUpper?: number;
  bollMiddle?: number;
  bollLower?: number;
  // VWAP
  vwap?: number;
  // OBV
  obv?: number;
  // ADX / DMI
  adx?: number;
  pdi?: number;
  mdi?: number;
  // CCI
  cci?: number;
  // W%R
  wr?: number;
  // BIAS
  bias6?: number;
  bias12?: number;
  bias24?: number;
  // ATR
  atr?: number;
}

interface IndicatorPanelProps {
  data: IndicatorPoint[];
  activeKey?: string;
  onTabChange?: (key: string) => void;
  height?: number;
  loading?: boolean;
}

// tooltip formatter 入参类型
type TooltipParams = { dataIndex: number; value: number; name: string; seriesName?: string; dataType?: string }[];

const IndicatorPanel = React.memo<IndicatorPanelProps>(({
  data,
  activeKey = 'macd',
  onTabChange,
  height = 220,
  loading = false,
}) => {
  const macdOption = useMemo(() => buildMACDOption(data), [data]);
  const kdjOption = useMemo(() => buildKDJOption(data), [data]);
  const rsiOption = useMemo(() => buildRSIOption(data), [data]);
  const bollOption = useMemo(() => buildBOLLOption(data), [data]);
  const vwapOption = useMemo(() => buildVWAPOption(data), [data]);
  const obvOption = useMemo(() => buildOBVOption(data), [data]);
  const adxOption = useMemo(() => buildADXOption(data), [data]);
  const cciOption = useMemo(() => buildCCIOption(data), [data]);
  const wrOption = useMemo(() => buildWROption(data), [data]);
  const biasOption = useMemo(() => buildBIASOption(data), [data]);
  const atrOption = useMemo(() => buildATROption(data), [data]);

  const tabs = [
    { key: 'macd', label: 'MACD', option: macdOption },
    { key: 'kdj', label: 'KDJ', option: kdjOption },
    { key: 'rsi', label: 'RSI', option: rsiOption },
    { key: 'boll', label: 'BOLL', option: bollOption },
    { key: 'vwap', label: 'VWAP', option: vwapOption },
    { key: 'obv', label: 'OBV', option: obvOption },
    { key: 'adx', label: 'ADX(DMI)', option: adxOption },
    { key: 'cci', label: 'CCI', option: cciOption },
    { key: 'wr', label: 'W%R', option: wrOption },
    { key: 'bias', label: 'BIAS', option: biasOption },
    { key: 'atr', label: 'ATR', option: atrOption },
  ];

  if (loading) {
    return (
      <Card size="small" style={{ marginTop: 8 }} styles={{ body: { padding: '8px 12px' } }}>
        <Skeleton active paragraph={{ rows: 4 }} />
      </Card>
    );
  }

  return (
    <Card
      size="small"
      style={{ marginTop: 8 }}
      styles={{ body: { padding: '8px 12px' } }}
    >
      <Tabs
        activeKey={activeKey}
        onChange={onTabChange}
        size="small"
        items={tabs.map(t => ({
          key: t.key,
          label: t.label,
          children: (
            <ReactECharts echarts={echarts}
              option={t.option}
              style={{ height: `${height}px`, width: '100%' }}
              notMerge={true}
              opts={{ renderer: 'canvas' }}
            />
          ),
        }))}
      />
    </Card>
  );
});

// ==================== 各指标配置构建 ====================

function buildMACDOption(data: IndicatorPoint[]) {
  if (!data.length) return emptyOption('MACD');

  const dates = data.map(d => d.date);
  const difs = data.map(d => d.dif ?? null);
  const deas = data.map(d => d.dea ?? null);
  const macds = data.map(d => {
    if (d.macd === undefined || d.macd === null) return null;
    return { value: d.macd, itemStyle: { color: d.macd >= 0 ? '#ef4444' : '#22c55e' } };
  });

  return {
    tooltip: {
      trigger: 'axis',
      formatter: (params: TooltipParams) => {
        const idx = params[0]?.dataIndex;
        const d = data[idx];
        if (!d) return '';
        return `
          <div style="font-size:12px;line-height:1.8">
            <b>${d.date}</b><br/>
            DIF: ${(d.dif ?? 0).toFixed(4)}<br/>
            DEA: ${(d.dea ?? 0).toFixed(4)}<br/>
            MACD: ${(d.macd ?? 0).toFixed(4)}
          </div>
        `;
      },
    },
    legend: { data: ['DIF', 'DEA', 'MACD'], top: 0, textStyle: { fontSize: 11 } },
    grid: { left: '8%', right: '5%', top: '12%', bottom: '10%' },
    xAxis: {
      type: 'category', data: dates,
      axisLabel: { formatter: (v: string) => v.slice(5), fontSize: 10 },
      boundaryGap: false,
    },
    yAxis: {
      type: 'value',
      axisLabel: { fontSize: 10 },
      splitLine: { lineStyle: { type: 'dashed', color: '#f0f0f0' } },
    },
    series: [
      { name: 'DIF', type: 'line', data: difs, symbol: 'none', lineStyle: { width: 1.5, color: '#3b82f6' } },
      { name: 'DEA', type: 'line', data: deas, symbol: 'none', lineStyle: { width: 1.5, color: '#f59e0b' } },
      { name: 'MACD', type: 'bar', data: macds, barMaxWidth: 6 },
    ],
    animation: true,
  };
}

function buildKDJOption(data: IndicatorPoint[]) {
  if (!data.length) return emptyOption('KDJ');

  const dates = data.map(d => d.date);
  return {
    tooltip: {
      trigger: 'axis',
      formatter: (params: TooltipParams) => {
        const idx = params[0]?.dataIndex;
        const d = data[idx];
        if (!d) return '';
        return `
          <div style="font-size:12px;line-height:1.8">
            <b>${d.date}</b><br/>
            K: ${(d.k ?? 0).toFixed(2)}<br/>
            D: ${(d.d ?? 0).toFixed(2)}<br/>
            J: ${(d.j ?? 0).toFixed(2)}
          </div>
        `;
      },
    },
    legend: { data: ['K', 'D', 'J'], top: 0, textStyle: { fontSize: 11 } },
    grid: { left: '8%', right: '5%', top: '12%', bottom: '10%' },
    xAxis: {
      type: 'category', data: dates,
      axisLabel: { formatter: (v: string) => v.slice(5), fontSize: 10 },
      boundaryGap: false,
    },
    yAxis: {
      type: 'value',
      min: 0, max: 100,
      axisLabel: { fontSize: 10 },
      splitLine: { lineStyle: { type: 'dashed', color: '#f0f0f0' } },
    },
    series: [
      { name: 'K', type: 'line', data: data.map(d => d.k ?? null), symbol: 'none', lineStyle: { width: 1.5, color: '#3b82f6' } },
      { name: 'D', type: 'line', data: data.map(d => d.d ?? null), symbol: 'none', lineStyle: { width: 1.5, color: '#f59e0b' } },
      { name: 'J', type: 'line', data: data.map(d => d.j ?? null), symbol: 'none', lineStyle: { width: 1.5, color: '#ef4444' } },
      // 超买超卖线
      { type: 'line', data: new Array(dates.length).fill(80), symbol: 'none', lineStyle: { color: '#ddd', type: 'dashed', width: 1 }, silent: true },
      { type: 'line', data: new Array(dates.length).fill(20), symbol: 'none', lineStyle: { color: '#ddd', type: 'dashed', width: 1 }, silent: true },
    ],
    animation: true,
  };
}

function buildRSIOption(data: IndicatorPoint[]) {
  if (!data.length) return emptyOption('RSI');

  const dates = data.map(d => d.date);
  return {
    tooltip: {
      trigger: 'axis',
      formatter: (params: TooltipParams) => {
        const idx = params[0]?.dataIndex;
        const d = data[idx];
        if (!d) return '';
        return `
          <div style="font-size:12px;line-height:1.8">
            <b>${d.date}</b><br/>
            RSI6: ${(d.rsi6 ?? 0).toFixed(2)}<br/>
            RSI12: ${(d.rsi12 ?? 0).toFixed(2)}<br/>
            RSI24: ${(d.rsi24 ?? 0).toFixed(2)}
          </div>
        `;
      },
    },
    legend: { data: ['RSI6', 'RSI12', 'RSI24'], top: 0, textStyle: { fontSize: 11 } },
    grid: { left: '8%', right: '5%', top: '12%', bottom: '10%' },
    xAxis: {
      type: 'category', data: dates,
      axisLabel: { formatter: (v: string) => v.slice(5), fontSize: 10 },
      boundaryGap: false,
    },
    yAxis: {
      type: 'value', min: 0, max: 100,
      axisLabel: { fontSize: 10 },
      splitLine: { lineStyle: { type: 'dashed', color: '#f0f0f0' } },
    },
    series: [
      { name: 'RSI6', type: 'line', data: data.map(d => d.rsi6 ?? null), symbol: 'none', lineStyle: { width: 1.5, color: '#3b82f6' } },
      { name: 'RSI12', type: 'line', data: data.map(d => d.rsi12 ?? null), symbol: 'none', lineStyle: { width: 1.5, color: '#f59e0b' } },
      { name: 'RSI24', type: 'line', data: data.map(d => d.rsi24 ?? null), symbol: 'none', lineStyle: { width: 1.5, color: '#8b5cf6' } },
      // 超买超卖区域
      { type: 'line', data: new Array(dates.length).fill(70), symbol: 'none', lineStyle: { color: '#fca5a5', type: 'dashed', width: 1 }, silent: true },
      { type: 'line', data: new Array(dates.length).fill(30), symbol: 'none', lineStyle: { color: '#86efac', type: 'dashed', width: 1 }, silent: true },
    ],
    animation: true,
  };
}

function buildBOLLOption(data: IndicatorPoint[]) {
  if (!data.length) return emptyOption('BOLL');

  const dates = data.map(d => d.date);
  return {
    tooltip: {
      trigger: 'axis',
      formatter: (params: TooltipParams) => {
        const idx = params[0]?.dataIndex;
        const d = data[idx];
        if (!d) return '';
        return `
          <div style="font-size:12px;line-height:1.8">
            <b>${d.date}</b><br/>
            上轨: ${(d.bollUpper ?? 0).toFixed(2)}<br/>
            中轨: ${(d.bollMiddle ?? 0).toFixed(2)}<br/>
            下轨: ${(d.bollLower ?? 0).toFixed(2)}
          </div>
        `;
      },
    },
    legend: { data: ['上轨', '中轨', '下轨'], top: 0, textStyle: { fontSize: 11 } },
    grid: { left: '8%', right: '5%', top: '12%', bottom: '10%' },
    xAxis: {
      type: 'category', data: dates,
      axisLabel: { formatter: (v: string) => v.slice(5), fontSize: 10 },
      boundaryGap: false,
    },
    yAxis: {
      type: 'value', scale: true,
      axisLabel: { fontSize: 10 },
      splitLine: { lineStyle: { type: 'dashed', color: '#f0f0f0' } },
    },
    series: [
      {
        name: '上轨', type: 'line', data: data.map(d => d.bollUpper ?? null),
        symbol: 'none', lineStyle: { width: 1, color: '#ef4444' },
        areaStyle: { color: 'rgba(239,68,68,0.05)' },
      },
      { name: '中轨', type: 'line', data: data.map(d => d.bollMiddle ?? null), symbol: 'none', lineStyle: { width: 1.5, color: '#3b82f6' } },
      {
        name: '下轨', type: 'line', data: data.map(d => d.bollLower ?? null),
        symbol: 'none', lineStyle: { width: 1, color: '#22c55e' },
        areaStyle: { color: 'rgba(34,197,94,0.05)' },
      },
    ],
    animation: true,
  };
}

// ===================== 新增 7 指标 =====================

function buildVWAPOption(data: IndicatorPoint[]) {
  if (!data.length) return emptyOption('VWAP');
  const dates = data.map(d => d.date);
  return {
    tooltip: {
      trigger: 'axis',
      formatter: (params: TooltipParams) => {
        const idx = params[0]?.dataIndex;
        const d = data[idx];
        if (!d) return '';
        return `
          <div style="font-size:12px;line-height:1.8">
            <b>${d.date}</b><br/>
            VWAP(累计): ${(d.vwap ?? 0).toFixed(4)}
          </div>
        `;
      },
    },
    legend: { data: ['VWAP'], top: 0, textStyle: { fontSize: 11 } },
    grid: { left: '8%', right: '5%', top: '12%', bottom: '10%' },
    xAxis: {
      type: 'category', data: dates,
      axisLabel: { formatter: (v: string) => v.slice(5), fontSize: 10 },
      boundaryGap: false,
    },
    yAxis: { type: 'value', scale: true, axisLabel: { fontSize: 10 }, splitLine: { lineStyle: { type: 'dashed', color: '#f0f0f0' } } },
    series: [
      {
        name: 'VWAP', type: 'line', data: data.map(d => d.vwap ?? null),
        symbol: 'none', lineStyle: { width: 1.5, color: '#3b82f6' },
        areaStyle: { color: 'rgba(59,130,246,0.06)' },
      },
    ],
    animation: true,
  };
}

function buildOBVOption(data: IndicatorPoint[]) {
  if (!data.length) return emptyOption('OBV');
  const dates = data.map(d => d.date);
  return {
    tooltip: {
      trigger: 'axis',
      formatter: (params: TooltipParams) => {
        const idx = params[0]?.dataIndex;
        const d = data[idx];
        if (!d) return '';
        return `
          <div style="font-size:12px;line-height:1.8">
            <b>${d.date}</b><br/>
            OBV(能量潮): ${(d.obv ?? 0).toLocaleString()}
          </div>
        `;
      },
    },
    legend: { data: ['OBV'], top: 0, textStyle: { fontSize: 11 } },
    grid: { left: '8%', right: '5%', top: '12%', bottom: '10%' },
    xAxis: {
      type: 'category', data: dates,
      axisLabel: { formatter: (v: string) => v.slice(5), fontSize: 10 },
      boundaryGap: false,
    },
    yAxis: { type: 'value', scale: true, axisLabel: { fontSize: 10 }, splitLine: { lineStyle: { type: 'dashed', color: '#f0f0f0' } } },
    series: [
      { name: 'OBV', type: 'line', data: data.map(d => d.obv ?? null), symbol: 'none', lineStyle: { width: 1.5, color: '#8b5cf6' } },
    ],
    animation: true,
  };
}

function buildADXOption(data: IndicatorPoint[]) {
  if (!data.length) return emptyOption('ADX(DMI)');
  const dates = data.map(d => d.date);
  return {
    tooltip: {
      trigger: 'axis',
      formatter: (params: TooltipParams) => {
        const idx = params[0]?.dataIndex;
        const d = data[idx];
        if (!d) return '';
        return `
          <div style="font-size:12px;line-height:1.8">
            <b>${d.date}</b><br/>
            +DI(多方): ${(d.pdi ?? 0).toFixed(2)}<br/>
            -DI(空方): ${(d.mdi ?? 0).toFixed(2)}<br/>
            ADX(趋势): ${(d.adx ?? 0).toFixed(2)}
          </div>
        `;
      },
    },
    legend: { data: ['+DI', '-DI', 'ADX'], top: 0, textStyle: { fontSize: 11 } },
    grid: { left: '8%', right: '5%', top: '12%', bottom: '10%' },
    xAxis: {
      type: 'category', data: dates,
      axisLabel: { formatter: (v: string) => v.slice(5), fontSize: 10 },
      boundaryGap: false,
    },
    yAxis: { type: 'value', min: 0, max: 100, axisLabel: { fontSize: 10 }, splitLine: { lineStyle: { type: 'dashed', color: '#f0f0f0' } } },
    series: [
      { name: '+DI', type: 'line', data: data.map(d => d.pdi ?? null), symbol: 'none', lineStyle: { width: 1.5, color: '#ef4444' } },
      { name: '-DI', type: 'line', data: data.map(d => d.mdi ?? null), symbol: 'none', lineStyle: { width: 1.5, color: '#22c55e' } },
      { name: 'ADX', type: 'line', data: data.map(d => d.adx ?? null), symbol: 'none', lineStyle: { width: 1.5, color: '#3b82f6' } },
    ],
    animation: true,
  };
}

function buildCCIOption(data: IndicatorPoint[]) {
  if (!data.length) return emptyOption('CCI');
  const dates = data.map(d => d.date);
  return {
    tooltip: {
      trigger: 'axis',
      formatter: (params: TooltipParams) => {
        const idx = params[0]?.dataIndex;
        const d = data[idx];
        if (!d) return '';
        return `
          <div style="font-size:12px;line-height:1.8">
            <b>${d.date}</b><br/>
            CCI(14): ${(d.cci ?? 0).toFixed(2)}
          </div>
        `;
      },
    },
    legend: { data: ['CCI'], top: 0, textStyle: { fontSize: 11 } },
    grid: { left: '8%', right: '5%', top: '12%', bottom: '10%' },
    xAxis: {
      type: 'category', data: dates,
      axisLabel: { formatter: (v: string) => v.slice(5), fontSize: 10 },
      boundaryGap: false,
    },
    yAxis: { type: 'value', scale: true, axisLabel: { fontSize: 10 }, splitLine: { lineStyle: { type: 'dashed', color: '#f0f0f0' } } },
    series: [
      { name: 'CCI', type: 'line', data: data.map(d => d.cci ?? null), symbol: 'none', lineStyle: { width: 1.5, color: '#3b82f6' } },
      // 超买 +100 / 超卖 -100 参考线
      { type: 'line', data: new Array(dates.length).fill(100), symbol: 'none', lineStyle: { color: '#ef4444', type: 'dashed', width: 1 }, silent: true },
      { type: 'line', data: new Array(dates.length).fill(-100), symbol: 'none', lineStyle: { color: '#22c55e', type: 'dashed', width: 1 }, silent: true },
    ],
    animation: true,
  };
}

function buildWROption(data: IndicatorPoint[]) {
  if (!data.length) return emptyOption('W%R');
  const dates = data.map(d => d.date);
  return {
    tooltip: {
      trigger: 'axis',
      formatter: (params: TooltipParams) => {
        const idx = params[0]?.dataIndex;
        const d = data[idx];
        if (!d) return '';
        return `
          <div style="font-size:12px;line-height:1.8">
            <b>${d.date}</b><br/>
            W%R(14): ${(d.wr ?? 0).toFixed(2)}
          </div>
        `;
      },
    },
    legend: { data: ['W%R'], top: 0, textStyle: { fontSize: 11 } },
    grid: { left: '8%', right: '5%', top: '12%', bottom: '10%' },
    xAxis: {
      type: 'category', data: dates,
      axisLabel: { formatter: (v: string) => v.slice(5), fontSize: 10 },
      boundaryGap: false,
    },
    yAxis: { type: 'value', min: -100, max: 0, axisLabel: { fontSize: 10 }, splitLine: { lineStyle: { type: 'dashed', color: '#f0f0f0' } } },
    series: [
      { name: 'W%R', type: 'line', data: data.map(d => d.wr ?? null), symbol: 'none', lineStyle: { width: 1.5, color: '#8b5cf6' } },
      // 超买 -20 / 超卖 -80 参考线
      { type: 'line', data: new Array(dates.length).fill(-20), symbol: 'none', lineStyle: { color: '#ef4444', type: 'dashed', width: 1 }, silent: true },
      { type: 'line', data: new Array(dates.length).fill(-80), symbol: 'none', lineStyle: { color: '#22c55e', type: 'dashed', width: 1 }, silent: true },
    ],
    animation: true,
  };
}

function buildBIASOption(data: IndicatorPoint[]) {
  if (!data.length) return emptyOption('BIAS');
  const dates = data.map(d => d.date);
  return {
    tooltip: {
      trigger: 'axis',
      formatter: (params: TooltipParams) => {
        const idx = params[0]?.dataIndex;
        const d = data[idx];
        if (!d) return '';
        return `
          <div style="font-size:12px;line-height:1.8">
            <b>${d.date}</b><br/>
            BIAS6: ${(d.bias6 ?? 0).toFixed(2)}%<br/>
            BIAS12: ${(d.bias12 ?? 0).toFixed(2)}%<br/>
            BIAS24: ${(d.bias24 ?? 0).toFixed(2)}%
          </div>
        `;
      },
    },
    legend: { data: ['BIAS6', 'BIAS12', 'BIAS24'], top: 0, textStyle: { fontSize: 11 } },
    grid: { left: '8%', right: '5%', top: '12%', bottom: '10%' },
    xAxis: {
      type: 'category', data: dates,
      axisLabel: { formatter: (v: string) => v.slice(5), fontSize: 10 },
      boundaryGap: false,
    },
    yAxis: { type: 'value', scale: true, axisLabel: { fontSize: 10 }, splitLine: { lineStyle: { type: 'dashed', color: '#f0f0f0' } } },
    series: [
      { name: 'BIAS6', type: 'line', data: data.map(d => d.bias6 ?? null), symbol: 'none', lineStyle: { width: 1.5, color: '#3b82f6' } },
      { name: 'BIAS12', type: 'line', data: data.map(d => d.bias12 ?? null), symbol: 'none', lineStyle: { width: 1.5, color: '#f59e0b' } },
      { name: 'BIAS24', type: 'line', data: data.map(d => d.bias24 ?? null), symbol: 'none', lineStyle: { width: 1.5, color: '#8b5cf6' } },
      // 0 轴参考线
      { type: 'line', data: new Array(dates.length).fill(0), symbol: 'none', lineStyle: { color: '#ddd', type: 'dashed', width: 1 }, silent: true },
    ],
    animation: true,
  };
}

function buildATROption(data: IndicatorPoint[]) {
  if (!data.length) return emptyOption('ATR');
  const dates = data.map(d => d.date);
  return {
    tooltip: {
      trigger: 'axis',
      formatter: (params: TooltipParams) => {
        const idx = params[0]?.dataIndex;
        const d = data[idx];
        if (!d) return '';
        return `
          <div style="font-size:12px;line-height:1.8">
            <b>${d.date}</b><br/>
            ATR(14): ${(d.atr ?? 0).toFixed(4)}
          </div>
        `;
      },
    },
    legend: { data: ['ATR'], top: 0, textStyle: { fontSize: 11 } },
    grid: { left: '8%', right: '5%', top: '12%', bottom: '10%' },
    xAxis: {
      type: 'category', data: dates,
      axisLabel: { formatter: (v: string) => v.slice(5), fontSize: 10 },
      boundaryGap: false,
    },
    yAxis: { type: 'value', scale: true, axisLabel: { fontSize: 10 }, splitLine: { lineStyle: { type: 'dashed', color: '#f0f0f0' } } },
    series: [
      {
        name: 'ATR', type: 'line', data: data.map(d => d.atr ?? null),
        symbol: 'none', lineStyle: { width: 1.5, color: '#f59e0b' },
        areaStyle: { color: 'rgba(245,158,11,0.06)' },
      },
    ],
    animation: true,
  };
}

function emptyOption(title: string) {
  return {
    title: { text: title, left: 'center', textStyle: { fontSize: 14 } },
    graphic: { type: 'text', left: 'center', top: 'middle', style: { text: '暂无数据', fill: '#999' } },
  };
}

export default IndicatorPanel;
