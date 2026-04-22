/**
 * 资金流向图表组件
 * 主力/散户资金流入流出柱状图 + 行业资金流向排行
 * 参考东方财富资金流向设计
 */

import React, { useMemo } from 'react';
import ReactECharts from 'echarts-for-react';

export interface FundFlowItem {
  date: string;
  mainNet: number;        // 主力净额（万）
  superLargeNet: number;  // 超大单净额
  largeNet: number;       // 大单净额
  mediumNet: number;      // 中单净额
  smallNet: number;       // 小单净额
}

interface FundFlowChartProps {
  data: FundFlowItem[];
  title?: string;
  height?: number;
  loading?: boolean;
}

/** 个股资金流向柱状图 */
export const FundFlowChart: React.FC<FundFlowChartProps> = ({
  data,
  title = '资金流向',
  height = 350,
  loading = false,
}) => {
  const option = useMemo(() => {
    if (!data || data.length === 0) {
      return {
        title: { text: title, left: 'center' },
        graphic: { type: 'text', left: 'center', top: 'middle', style: { text: '暂无数据', fill: '#999' } },
      };
    }

    const dates = data.map(d => d.date);
    const mainNets = data.map(d => d.mainNet);
    const superLargeNets = data.map(d => d.superLargeNet);
    const largeNets = data.map(d => d.largeNet);
    const mediumNets = data.map(d => d.mediumNet);
    const smallNets = data.map(d => d.smallNet);

    return {
      title: { text: title, left: 'center', textStyle: { fontSize: 14 } },
      tooltip: {
        trigger: 'axis',
        formatter: (params: { dataIndex: number; value: number; name: string }[]) => {
          const idx = params[0]?.dataIndex;
          if (idx === undefined) return '';
          const d = data[idx];
          return `
            <div style="font-size:12px;line-height:1.8">
              <b>${d.date}</b><br/>
              主力净额: <b style="color:${d.mainNet >= 0 ? '#ef4444' : '#22c55e'}">${formatAmount(d.mainNet)}</b><br/>
              超大单: <span style="color:${d.superLargeNet >= 0 ? '#ef4444' : '#22c55e'}">${formatAmount(d.superLargeNet)}</span><br/>
              大单: <span style="color:${d.largeNet >= 0 ? '#ef4444' : '#22c55e'}">${formatAmount(d.largeNet)}</span><br/>
              中单: <span style="color:${d.mediumNet >= 0 ? '#ef4444' : '#22c55e'}">${formatAmount(d.mediumNet)}</span><br/>
              小单: <span style="color:${d.smallNet >= 0 ? '#ef4444' : '#22c55e'}">${formatAmount(d.smallNet)}</span>
            </div>
          `;
        },
      },
      legend: {
        data: ['主力净额', '超大单', '大单', '中单', '小单'],
        top: 28,
        textStyle: { fontSize: 11 },
      },
      grid: { left: '10%', right: '8%', top: '15%', bottom: '12%' },
      xAxis: {
        type: 'category',
        data: dates,
        axisLabel: { formatter: (v: string) => v.slice(5), fontSize: 10 },
      },
      yAxis: {
        type: 'value',
        axisLabel: { formatter: (v: number) => formatAmountShort(v), fontSize: 10 },
        splitLine: { lineStyle: { type: 'dashed', color: '#eee' } },
      },
      series: [
        {
          name: '主力净额',
          type: 'bar',
          data: mainNets.map(v => ({
            value: v,
            itemStyle: { color: v >= 0 ? '#ef4444' : '#22c55e', borderRadius: [2, 2, 0, 0] },
          })),
          barWidth: '40%',
        },
        {
          name: '超大单',
          type: 'line',
          data: superLargeNets,
          smooth: true,
          symbol: 'circle',
          symbolSize: 4,
          lineStyle: { width: 1.5 },
        },
        {
          name: '大单',
          type: 'line',
          data: largeNets,
          smooth: true,
          symbol: 'circle',
          symbolSize: 4,
          lineStyle: { width: 1.5 },
        },
        {
          name: '中单',
          type: 'line',
          data: mediumNets,
          smooth: true,
          symbol: 'circle',
          symbolSize: 4,
          lineStyle: { width: 1, type: 'dashed' },
        },
        {
          name: '小单',
          type: 'line',
          data: smallNets,
          smooth: true,
          symbol: 'circle',
          symbolSize: 4,
          lineStyle: { width: 1, type: 'dashed' },
        },
      ],
      animation: true,
    };
  }, [data, title]);

  return (
    <ReactECharts
      option={option}
      style={{ height: `${height}px`, width: '100%' }}
      showLoading={loading}
      notMerge={true}
    />
  );
};

// ==================== 行业资金流向排行 ====================

export interface IndustryFlowItem {
  industry: string;
  netInflow: number;
  mainNet: number;
  stockCount: number;
}

interface IndustryFlowChartProps {
  data: IndustryFlowItem[];
  title?: string;
  height?: number;
}

export const IndustryFlowChart: React.FC<IndustryFlowChartProps> = ({
  data,
  title = '行业资金流向',
  height = 400,
}) => {
  const option = useMemo(() => {
    if (!data || data.length === 0) {
      return {
        title: { text: title, left: 'center' },
        graphic: { type: 'text', left: 'center', top: 'middle', style: { text: '暂无数据', fill: '#999' } },
      };
    }

    // 按主力净额排序，取前15
    const sorted = [...data].sort((a, b) => b.mainNet - a.mainNet).slice(0, 15);

    return {
      title: { text: title, left: 'center', textStyle: { fontSize: 14 } },
      tooltip: {
        trigger: 'axis',
        axisPointer: { type: 'shadow' },
        formatter: (params: { dataIndex: number; value: number; name: string }[]) => {
          const idx = params[0]?.dataIndex;
          const d = sorted[idx];
          if (!d) return '';
          return `
            <div style="font-size:12px;line-height:1.8">
              <b>${d.industry}</b><br/>
              主力净额: <b style="color:${d.mainNet >= 0 ? '#ef4444' : '#22c55e'}">${formatAmount(d.mainNet)}</b><br/>
              净流入: ${formatAmount(d.netInflow)}<br/>
              成分股: ${d.stockCount}只
            </div>
          `;
        },
      },
      grid: { left: '22%', right: '10%', top: '8%', bottom: '5%' },
      xAxis: {
        type: 'value',
        axisLabel: { formatter: (v: number) => formatAmountShort(v), fontSize: 10 },
        splitLine: { lineStyle: { type: 'dashed', color: '#eee' } },
      },
      yAxis: {
        type: 'category',
        data: sorted.map(d => d.industry),
        inverse: true,
        axisLabel: { fontSize: 11 },
        axisTick: { show: false },
      },
      series: [{
        type: 'bar',
        data: sorted.map(d => ({
          value: d.mainNet,
          itemStyle: {
            color: d.mainNet >= 0
              ? { type: 'linear', x: 0, y: 0, x2: 1, y2: 0, colorStops: [{ offset: 0, color: '#fca5a5' }, { offset: 1, color: '#ef4444' }] }
              : { type: 'linear', x: 0, y: 0, x2: 1, y2: 0, colorStops: [{ offset: 0, color: '#22c55e' }, { offset: 1, color: '#86efac' }] },
            borderRadius: [0, 4, 4, 0],
          },
        })),
        barWidth: '60%',
        label: {
          show: true,
          position: 'right',
          formatter: (p: { value: number }) => formatAmountShort(p.value),
          fontSize: 10,
          color: '#666',
        },
      }],
      animation: true,
    };
  }, [data, title]);

  return (
    <ReactECharts option={option} style={{ height: `${height}px`, width: '100%' }} notMerge={true} />
  );
};

// ==================== 工具函数 ====================

function formatAmount(val: number): string {
  if (Math.abs(val) >= 1e8) return `${(val / 1e8).toFixed(2)}亿`;
  if (Math.abs(val) >= 1e4) return `${(val / 1e4).toFixed(2)}万`;
  return `${val.toFixed(0)}`;
}

function formatAmountShort(val: number): string {
  if (Math.abs(val) >= 1e8) return `${(val / 1e8).toFixed(1)}亿`;
  if (Math.abs(val) >= 1e4) return `${(val / 1e4).toFixed(0)}万`;
  return `${val.toFixed(0)}`;
}

export default FundFlowChart;
