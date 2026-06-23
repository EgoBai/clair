/**
 * 多图表联动组件
 * 支持: K线 + 成交量 + 资金流向 + 技术指标 四图联动
 * 十字光标、缩放、数据区域缩放均同步
 * 参考 Bloomberg Terminal 多图联动设计
 */

import React, { useMemo, useRef, useCallback, useEffect } from 'react';
import { Card, Space, Tag, Typography } from 'antd';
import { LinkOutlined } from '@ant-design/icons';
import ReactECharts from 'echarts-for-react';
import dayjs from 'dayjs';

const { Text } = Typography;

export interface LinkedKLineData {
  tradeDate: string;
  open: number;
  close: number;
  high: number;
  low: number;
  volume: number;
  turnover: number;
}

export interface LinkedFundData {
  date: string;
  mainNet: number;
}

interface LinkedChartsProps {
  klineData: LinkedKLineData[];
  fundData?: LinkedFundData[];
  height?: number;
  loading?: boolean;
  stockName?: string;
  subIndicator?: 'volume' | 'turnover' | 'amount';
}

const LinkedCharts: React.FC<LinkedChartsProps> = React.memo(({
  klineData,
  fundData,
  height = 520,
  loading = false,
  stockName = '',
  subIndicator = 'volume',
}) => {
  const klineRef = useRef<ReactECharts>(null);
  const subRef = useRef<ReactECharts>(null);
  const fundRef = useRef<ReactECharts>(null);

  // Synchronize axis pointer and zoom across charts
  const bindEvents = useCallback(() => {
    const klineInstance = klineRef.current?.getEchartsInstance();
    const subInstance = subRef.current?.getEchartsInstance();
    const fundInstance = fundRef.current?.getEchartsInstance();

    if (!klineInstance) return;

    // Axis pointer sync
    klineInstance.on('updateAxisPointer', (params: unknown) => {
      const p = params as { axesInfo?: { value: number }[] };
      const idx = p.axesInfo?.[0]?.value;
      if (idx !== undefined) {
        subInstance?.dispatchAction({ type: 'showTip', seriesIndex: 0, dataIndex: idx });
        fundInstance?.dispatchAction({ type: 'showTip', seriesIndex: 0, dataIndex: idx });
      }
    });

    // Zoom sync
    klineInstance.on('dataZoom', () => {
      const opt = klineInstance.getOption() as { dataZoom?: { start: number; end: number }[] };
      const dz = opt.dataZoom?.[0];
      if (dz) {
        subInstance?.dispatchAction({
          type: 'dataZoom',
          start: dz.start,
          end: dz.end,
        });
        fundInstance?.dispatchAction({
          type: 'dataZoom',
          start: dz.start,
          end: dz.end,
        });
      }
    });
  }, []);

  useEffect(() => {
    const timer = setTimeout(bindEvents, 300);
    return () => clearTimeout(timer);
  }, [bindEvents, klineData]);

  // ============= K线图 Option =============
  const klineOption = useMemo(() => {
    if (!klineData || klineData.length === 0) {
      return {
        title: { text: `${stockName} K线`, left: 'center', textStyle: { fontSize: 13 } },
        graphic: { type: 'text', left: 'center', top: 'middle', style: { text: '暂无数据', fill: '#999' } },
      };
    }

    const dates = klineData.map(d => d.tradeDate);
    const ohlcData = klineData.map(d => [d.open, d.close, d.low, d.high]);

    // MA calculation
    const calcMA = (period: number) => {
      const result: (number | null)[] = [];
      for (let i = 0; i < klineData.length; i++) {
        if (i < period - 1) { result.push(null); continue; }
        let sum = 0;
        for (let j = 0; j < period; j++) sum += klineData[i - j].close;
        result.push(parseFloat((sum / period).toFixed(2)));
      }
      return result;
    };

    return {
      title: { text: `${stockName} K线`, left: 'center', textStyle: { fontSize: 13 } },
      tooltip: {
        trigger: 'axis',
        axisPointer: { type: 'cross', crossStyle: { color: '#999' } },
        backgroundColor: 'rgba(255,255,255,0.96)',
        borderColor: '#e5e7eb',
        formatter: (params: { seriesType: string; dataIndex: number; value: number[] }[]) => {
          const kline = params.find((p) => p.seriesType === 'candlestick');
          if (!kline) return '';
          const d = klineData[kline.dataIndex];
          if (!d) return '';
          const chg = d.open > 0 ? ((d.close - d.open) / d.open * 100).toFixed(2) : '0.00';
          const color = d.close >= d.open ? '#ef4444' : '#22c55e';
          return `<div style="font-size:12px;line-height:1.7">
            <b>${d.tradeDate}</b><br/>
            开:${d.open.toFixed(2)} 高:${d.high.toFixed(2)}<br/>
            低:${d.low.toFixed(2)} 收:<span style="color:${color}">${d.close.toFixed(2)}</span><br/>
            <span style="color:${color}">${d.close >= d.open ? '+' : ''}${chg}%</span>
          </div>`;
        },
      },
      legend: {
        data: ['MA5', 'MA10', 'MA20'],
        top: 22, textStyle: { fontSize: 10 },
      },
      axisPointer: { link: [{ xAxisIndex: 'all' }] },
      grid: { left: '10%', right: '8%', top: '14%', height: '68%' },
      xAxis: {
        type: 'category', data: dates,
        axisLine: { onZero: false },
        splitLine: { show: false },
        axisLabel: { show: false },
        boundaryGap: false,
      },
      yAxis: { scale: true, splitArea: { show: true } },
      dataZoom: [
        { type: 'inside', xAxisIndex: 0, start: 70, end: 100 },
      ],
      series: [
        {
          name: 'K线', type: 'candlestick', data: ohlcData,
          itemStyle: { color: '#ef4444', color0: '#22c55e', borderColor: '#ef4444', borderColor0: '#22c55e' },
          barWidth: '60%',
        },
        { name: 'MA5', type: 'line', data: calcMA(5), smooth: false, symbol: 'none', lineStyle: { width: 1, color: '#f59e0b' } },
        { name: 'MA10', type: 'line', data: calcMA(10), smooth: false, symbol: 'none', lineStyle: { width: 1, color: '#3b82f6' } },
        { name: 'MA20', type: 'line', data: calcMA(20), smooth: false, symbol: 'none', lineStyle: { width: 1, color: '#8b5cf6' } },
      ],
    };
  }, [klineData, stockName]);

  // ============= Sub chart (volume/turnover) =============
  const subOption = useMemo(() => {
    if (!klineData || klineData.length === 0) return {};

    const dates = klineData.map(d => d.tradeDate);
    const values = subIndicator === 'turnover'
      ? klineData.map(d => d.turnover)
      : klineData.map(d => d.volume);
    const label = subIndicator === 'turnover' ? '成交额' : '成交量';

    return {
      tooltip: {
        trigger: 'axis',
        axisPointer: { type: 'cross' },
        formatter: (params: { seriesType: string; dataIndex: number; value: number[] }[]) => {
          const idx = params[0]?.dataIndex;
          if (idx === undefined) return '';
          const d = klineData[idx];
          const v = values[idx];
          const formatted = subIndicator === 'turnover'
            ? `${(v / 1e8).toFixed(2)}亿`
            : v >= 1e8 ? `${(v / 1e8).toFixed(2)}亿手` : `${(v / 1e4).toFixed(2)}万手`;
          return `<div style="font-size:12px">${d.tradeDate}<br/>${label}: ${formatted}</div>`;
        },
      },
      axisPointer: { link: [{ xAxisIndex: 'all' }] },
      grid: { left: '10%', right: '8%', top: '8%', height: '72%' },
      xAxis: {
        type: 'category', data: dates,
        axisLine: { onZero: false },
        splitLine: { show: false },
        axisLabel: { formatter: (v: string) => dayjs(v).format('MM-DD'), fontSize: 10 },
        boundaryGap: false,
      },
      yAxis: {
        type: 'value', splitNumber: 2,
        axisLabel: { show: false },
        splitLine: { show: false },
      },
      dataZoom: [{ type: 'inside', xAxisIndex: 0, start: 70, end: 100 }],
      series: [{
        type: 'bar',
        data: values.map((v, i) => ({
          value: v,
          itemStyle: { color: klineData[i].close >= klineData[i].open ? '#ef4444' : '#22c55e' },
        })),
        barMaxWidth: 6,
      }],
    };
  }, [klineData, subIndicator]);

  // ============= Fund flow chart =============
  const fundOption = useMemo(() => {
    if (!fundData || fundData.length === 0) return {};

    const dates = fundData.map(d => d.date);
    const values = fundData.map(d => d.mainNet);

    return {
      tooltip: {
        trigger: 'axis',
        axisPointer: { type: 'cross' },
        formatter: (params: { seriesType: string; dataIndex: number; value: number[] }[]) => {
          const idx = params[0]?.dataIndex;
          if (idx === undefined) return '';
          const d = fundData[idx];
          return `<div style="font-size:12px">
            ${d.date}<br/>
            主力净额: <span style="color:${d.mainNet >= 0 ? '#ef4444' : '#22c55e'}">
              ${formatAmount(d.mainNet)}
            </span>
          </div>`;
        },
      },
      axisPointer: { link: [{ xAxisIndex: 'all' }] },
      grid: { left: '10%', right: '8%', top: '8%', height: '72%' },
      xAxis: {
        type: 'category', data: dates,
        splitLine: { show: false },
        axisLabel: { formatter: (v: string) => dayjs(v).format('MM-DD'), fontSize: 10 },
        boundaryGap: false,
      },
      yAxis: {
        type: 'value', splitNumber: 2,
        axisLabel: { formatter: (v: number) => formatAmountShort(v), fontSize: 10 },
        splitLine: { lineStyle: { type: 'dashed', color: '#f0f0f0' } },
      },
      dataZoom: [{ type: 'inside', xAxisIndex: 0, start: 70, end: 100 }],
      series: [{
        type: 'bar',
        data: values.map(v => ({
          value: v,
          itemStyle: { color: v >= 0 ? '#ef4444' : '#22c55e', borderRadius: [2, 2, 0, 0] },
        })),
        barMaxWidth: 8,
      }],
    };
  }, [fundData]);

  const chartHeight = fundData ? Math.floor(height / 3) : Math.floor(height * 0.7);
  const subHeight = fundData ? Math.floor(height / 3) - 20 : Math.floor(height * 0.25);
  const fundHeight = Math.floor(height / 3) - 20;

  return (
    <Card
      size="small"
      title={
        <Space>
          <LinkOutlined style={{ color: '#1890ff' }} />
          <span>{stockName} 多图联动</span>
          <Tag color="green">联动</Tag>
        </Space>
      }
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        {/* Main K-line */}
        <ReactECharts
          ref={klineRef}
          option={klineOption}
          style={{ height: `${chartHeight}px`, width: '100%' }}
          showLoading={loading}
          notMerge={true}
          opts={{ renderer: 'canvas' }}
        />
        {/* Volume/Turnover */}
        <ReactECharts
          ref={subRef}
          option={subOption}
          style={{ height: `${subHeight}px`, width: '100%' }}
          notMerge={true}
          opts={{ renderer: 'canvas' }}
        />
        {/* Fund flow (optional) */}
        {fundData && fundData.length > 0 && (
          <ReactECharts
            ref={fundRef}
            option={fundOption}
            style={{ height: `${fundHeight}px`, width: '100%' }}
            notMerge={true}
            opts={{ renderer: 'canvas' }}
          />
        )}
      </div>
    </Card>
  );
});

function formatAmount(val: number): string {
  if (Math.abs(val) >= 1e8) return `${(val / 1e8).toFixed(2)}亿`;
  if (Math.abs(val) >= 1e4) return `${(val / 1e4).toFixed(2)}万`;
  return val.toFixed(0);
}

function formatAmountShort(val: number): string {
  if (Math.abs(val) >= 1e8) return `${(val / 1e8).toFixed(1)}亿`;
  if (Math.abs(val) >= 1e4) return `${(val / 1e4).toFixed(0)}万`;
  return val.toFixed(0);
}

export default LinkedCharts;
