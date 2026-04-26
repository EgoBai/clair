/**
 * K线图+成交量组合组件
 * 上下联动，点击K线显示详情
 */

import React, { useMemo, useState, useCallback } from 'react';
import { Card, Typography, Space, Tag, Row, Col, Statistic } from 'antd';
import {
  ComposedChart, Bar, Line, XAxis, YAxis, CartesianGrid,
  ResponsiveContainer, Tooltip as RechartsTooltip, ReferenceLine,
  Brush,
} from 'recharts';

const { Text } = Typography;

export interface CandlestickData {
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  ma5?: number;
  ma10?: number;
  ma20?: number;
}

interface CandlestickWithVolumeProps {
  data: CandlestickData[];
  stockName?: string;
  stockCode?: string;
  height?: number;
  showMA?: boolean;
  showBrush?: boolean;
}

const CandlestickWithVolume = React.memo<CandlestickWithVolumeProps>(({
  data,
  stockName = '',
  stockCode = '',
  height = 500,
  showMA = true,
  showBrush = true,
}) => {
  const [selectedBar, setSelectedBar] = useState<CandlestickData | null>(null);

  const chartData = useMemo(() =>
    data.map(d => ({
      ...d,
      fill: d.close >= d.open ? '#cf1322' : '#3f8600',
      volFill: d.close >= d.open ? '#cf132240' : '#3f860040',
      body: [Math.min(d.open, d.close), Math.max(d.open, d.close)],
      wick: [d.low, d.high],
    })),
    [data]
  );

  const priceDomain = useMemo(() => {
    const prices = data.flatMap(d => [d.high, d.low]);
    const min = Math.min(...prices);
    const max = Math.max(...prices);
    const padding = (max - min) * 0.05;
    return [Math.floor((min - padding) * 100) / 100, Math.ceil((max + padding) * 100) / 100];
  }, [data]);

  const volDomain = useMemo(() => {
    const maxVol = Math.max(...data.map(d => d.volume));
    return [0, maxVol * 1.2];
  }, [data]);

  const latest = data[data.length - 1];
  const prevClose = data.length > 1 ? data[data.length - 2].close : latest.open;
  const change = latest.close - prevClose;
  const changePct = (change / prevClose * 100);

  const handleBarClick = useCallback((barData: any) => {
    if (barData?.activePayload?.[0]) {
      setSelectedBar(barData.activePayload[0].payload);
    }
  }, []);

  // 自定义K线形状
  const CandlestickShape = (props: any) => {
    const { x, y, width, height: h, payload } = props;
    if (!payload) return null;

    const { open, close, high, low } = payload;
    const isUp = close >= open;
    const color = isUp ? '#cf1322' : '#3f8600';
    const bodyTop = Math.min(open, close);
    const bodyBottom = Math.max(open, close);

    // 这里简化为柱状图显示
    return (
      <rect
        x={x} y={y} width={width} height={Math.max(h, 1)}
        fill={color} stroke={color}
      />
    );
  };

  return (
    <Card
      size="small"
      title={
        <Space>
          <Text strong>{stockName} K线图</Text>
          {stockCode && <Tag>{stockCode}</Tag>}
        </Space>
      }
      extra={
        selectedBar && (
          <Space size={16}>
            <Statistic title="日期" value={selectedBar.date} />
            <Statistic title="开盘" value={selectedBar.open} precision={2} />
            <Statistic title="最高" value={selectedBar.high} precision={2} valueStyle={{ color: '#cf1322' }} />
            <Statistic title="最低" value={selectedBar.low} precision={2} valueStyle={{ color: '#3f8600' }} />
            <Statistic title="收盘" value={selectedBar.close} precision={2}
              valueStyle={{ color: selectedBar.close >= selectedBar.open ? '#cf1322' : '#3f8600' }} />
            <Statistic title="成交量" value={(selectedBar.volume / 10000).toFixed(2)} suffix="万手" />
          </Space>
        )
      }
    >
      {/* 最新行情摘要 */}
      <Row gutter={16} style={{ marginBottom: 12 }}>
        <Col>
          <Text strong style={{ fontSize: 20, color: change >= 0 ? '#cf1322' : '#3f8600' }}>
            {latest.close.toFixed(2)}
          </Text>
        </Col>
        <Col>
          <Text style={{ color: change >= 0 ? '#cf1322' : '#3f8600' }}>
            {change >= 0 ? '+' : ''}{change.toFixed(2)} ({changePct >= 0 ? '+' : ''}{changePct.toFixed(2)}%)
          </Text>
        </Col>
      </Row>

      {/* 价格图 */}
      <ResponsiveContainer width="100%" height={height * 0.7}>
        <ComposedChart data={chartData} onClick={handleBarClick}>
          <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
          <XAxis dataKey="date" tick={{ fontSize: 10 }} tickLine={false} />
          <YAxis domain={priceDomain} tick={{ fontSize: 10 }} tickLine={false} />
          <RechartsTooltip
            content={({ payload }) => {
              if (!payload?.length) return null;
              const d = payload[0].payload;
              return (
                <div style={{ background: '#fff', padding: 8, border: '1px solid #ddd', borderRadius: 4 }}>
                  <Text strong>{d.date}</Text><br />
                  <Text>开: {d.open} 高: {d.high}</Text><br />
                  <Text>低: {d.low} 收: {d.close}</Text><br />
                  <Text>量: {(d.volume / 10000).toFixed(2)}万</Text>
                </div>
              );
            }}
          />
          {/* 用柱子模拟K线 - open/close区间 */}
          <Bar dataKey="body" fill="#1890ff" isAnimationActive={false}>
            {chartData.map((entry, index) => (
              <rect key={index} fill={entry.fill} />
            ))}
          </Bar>
          {/* 均线 */}
          {showMA && (
            <>
              <Line type="monotone" dataKey="ma5" stroke="#faad14" dot={false} strokeWidth={1} name="MA5" />
              <Line type="monotone" dataKey="ma10" stroke="#1890ff" dot={false} strokeWidth={1} name="MA10" />
              <Line type="monotone" dataKey="ma20" stroke="#722ed1" dot={false} strokeWidth={1} name="MA20" />
            </>
          )}
          {showBrush && <Brush dataKey="date" height={20} stroke="#1890ff" />}
        </ComposedChart>
      </ResponsiveContainer>

      {/* 成交量图 */}
      <ResponsiveContainer width="100%" height={height * 0.25}>
        <ComposedChart data={chartData}>
          <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
          <XAxis dataKey="date" tick={{ fontSize: 10 }} tickLine={false} hide />
          <YAxis domain={volDomain} tick={{ fontSize: 10 }} tickLine={false}
            tickFormatter={(v) => `${(v / 10000).toFixed(0)}万`} />
          <Bar dataKey="volume" fill="#1890ff" fillOpacity={0.5}>
            {chartData.map((entry, index) => (
              <rect key={index} fill={entry.volFill} />
            ))}
          </Bar>
        </ComposedChart>
      </ResponsiveContainer>
    </Card>
  );
});

export default CandlestickWithVolume;
