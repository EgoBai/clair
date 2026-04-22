/**
 * 股票对比分析页面
 * 多指标雷达图 + 横向对比表格 + 柱状图
 */

import React, { useState, useEffect, useCallback } from 'react';
import logger from '../utils/logger';
import { Card, Select, Table, Tag, Row, Col, Spin, Button, Empty, Tabs, Statistic } from 'antd';
import { PlusOutlined, DeleteOutlined } from '@ant-design/icons';
import {
  RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, Radar, Legend,
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  LineChart, Line,
} from 'recharts';

interface CompareStock {
  symbol: string;
  name: string;
  metrics: Record<string, number>;
  radarScores: Record<string, number>;
  price: number;
  changePercent: number;
  marketCap: number;
  volume: number;
}

interface MetricDef {
  label: string;
  key: string;
  unit: string;
  higher: 'better' | 'worse' | 'neutral';
}

const STOCK_OPTIONS = [
  { value: '600519', label: '贵州茅台' },
  { value: '000858', label: '五粮液' },
  { value: '000001', label: '平安银行' },
  { value: '000333', label: '美的集团' },
  { value: '000651', label: '格力电器' },
  { value: '002415', label: '海康威视' },
  { value: '601318', label: '中国平安' },
  { value: '600036', label: '招商银行' },
  { value: '002594', label: '比亚迪' },
  { value: '300750', label: '宁德时代' },
  { value: '601012', label: '隆基绿能' },
  { value: '002714', label: '牧原股份' },
];

const COLORS = ['#1890ff', '#52c41a', '#faad14', '#ff4d4f', '#722ed1'];

export default function StockComparePage() {
  const [selectedSymbols, setSelectedSymbols] = useState<string[]>(['600519', '000858', '000001']);
  const [stocks, setStocks] = useState<CompareStock[]>([]);
  const [metrics, setMetrics] = useState<MetricDef[]>([]);
  const [radarData, setRadarData] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  const fetchCompare = useCallback(async () => {
    if (selectedSymbols.length < 2) return;
    setLoading(true);
    try {
      const [compareRes, radarRes] = await Promise.all([
        fetch(`/api/compare?symbols=${selectedSymbols.join(',')}`),
        fetch(`/api/compare/radar?symbols=${selectedSymbols.join(',')}`),
      ]);

      const compareData = await compareRes.json();
      const radarDataRes = await radarRes.json();

      if (compareData.success) {
        setStocks(compareData.data.stocks);
        setMetrics(compareData.data.metrics);
      }
      if (radarDataRes.success) {
        interface RadarIndicator { label: string; fullMark: number; key: string }
        interface RadarStock { name: string; scores: Record<string, number> }
        const indicators: RadarIndicator[] = radarDataRes.data.indicators;
        const radar = indicators.map((ind) => {
          const row: Record<string, string | number> = { metric: ind.label, fullMark: ind.fullMark };
          radarDataRes.data.stocks.forEach((s: RadarStock) => {
            row[s.name] = s.scores[ind.key];
          });
          return row;
        });
        setRadarData(radar);
      }
    } catch (error) {
      logger.error('获取对比数据失败:', error);
    } finally {
      setLoading(false);
    }
  }, [selectedSymbols]);

  useEffect(() => {
    fetchCompare();
  }, [fetchCompare]);

  const addStock = (symbol: string) => {
    if (selectedSymbols.length < 5 && !selectedSymbols.includes(symbol)) {
      setSelectedSymbols([...selectedSymbols, symbol]);
    }
  };

  const removeStock = (symbol: string) => {
    if (selectedSymbols.length > 2) {
      setSelectedSymbols(selectedSymbols.filter(s => s !== symbol));
    }
  };

  // 对比表格列
  const compareColumns = [
    {
      title: '指标',
      dataIndex: 'label',
      key: 'label',
      width: 140,
      fixed: true,
    },
    ...stocks.map((stock, i) => ({
      title: (
        <span>
          {stock.name}
          {selectedSymbols.length > 2 && (
            <DeleteOutlined
              style={{ marginLeft: 8, color: '#ff4d4f', fontSize: 12 }}
              onClick={() => removeStock(stock.symbol)}
            />
          )}
        </span>
      ),
      dataIndex: stock.symbol,
      key: stock.symbol,
      align: 'right' as const,
      render: (v: number, record: Record<string, unknown>) => {
        const def = metrics.find(m => m.key === record.key);
        const isPositive = def?.higher === 'better' ? v > 0 : def?.higher === 'worse' ? v < 0 : null;
        return (
          <span style={{ color: isPositive === true ? '#52c41a' : isPositive === false ? '#ff4d4f' : undefined }}>
            {v}{def?.unit || ''}
          </span>
        );
      },
    })),
  ];

  const compareDataSource = metrics.map((m, i) => {
    const row: Record<string, string | number> = { key: m.key, label: m.label };
    stocks.forEach(s => {
      row[s.symbol] = s.metrics[m.key];
    });
    return row;
  });

  // 柱状图数据
  const barData = metrics.slice(0, 8).map(m => {
    const row: Record<string, string | number> = { metric: m.label.replace(/[()]/g, '') };
    stocks.forEach(s => {
      row[s.name] = s.metrics[m.key];
    });
    return row;
  });

  return (
    <div style={{ padding: 16 }}>
      <h2 style={{ marginBottom: 16 }}>📊 股票对比分析</h2>

      {/* 选择器 */}
      <Card size="small" style={{ marginBottom: 16 }}>
        <Row gutter={16} align="middle">
          <Col flex="auto">
            <span style={{ marginRight: 8 }}>已选 ({selectedSymbols.length}/5):</span>
            {selectedSymbols.map(s => {
              const opt = STOCK_OPTIONS.find(o => o.value === s);
              return <Tag key={s} color="blue" closable={selectedSymbols.length > 2} onClose={() => removeStock(s)}>{opt?.label || s}</Tag>;
            })}
          </Col>
          <Col>
            <Select
              placeholder="添加股票"
              style={{ width: 160 }}
              onSelect={addStock}
              options={STOCK_OPTIONS.filter(o => !selectedSymbols.includes(o.value))}
              disabled={selectedSymbols.length >= 5}
            />
          </Col>
          <Col>
            <Button type="primary" onClick={fetchCompare} loading={loading}>刷新对比</Button>
          </Col>
        </Row>
      </Card>

      {loading ? (
        <div style={{ textAlign: 'center', padding: 80 }}><Spin size="large" /></div>
      ) : stocks.length < 2 ? (
        <Empty description="请至少选择2只股票进行对比" />
      ) : (
        <>
          {/* 价格速览 */}
          <Row gutter={[16, 16]} style={{ marginBottom: 16 }}>
            {stocks.map((stock, i) => (
              <Col key={stock.symbol} xs={24 / stocks.length} style={{ minWidth: 180 }}>
                <Card size="small" style={{ borderLeft: `3px solid ${COLORS[i]}` }}>
                  <Statistic
                    title={stock.name}
                    value={stock.price}
                    precision={2}
                    suffix={
                      <Tag color={stock.changePercent >= 0 ? 'red' : 'green'}>
                        {stock.changePercent >= 0 ? '+' : ''}{stock.changePercent}%
                      </Tag>
                    }
                  />
                </Card>
              </Col>
            ))}
          </Row>

          <Tabs
            items={[
              {
                key: 'radar',
                label: '雷达图对比',
                children: (
                  <Card size="small">
                    <ResponsiveContainer width="100%" height={400}>
                      <RadarChart data={radarData}>
                        <PolarGrid />
                        <PolarAngleAxis dataKey="metric" tick={{ fontSize: 12 }} />
                        <PolarRadiusAxis />
                        {stocks.map((stock, i) => (
                          <Radar key={stock.symbol} name={stock.name} dataKey={stock.name}
                            stroke={COLORS[i]} fill={COLORS[i]} fillOpacity={0.15} strokeWidth={2} />
                        ))}
                        <Legend />
                      </RadarChart>
                    </ResponsiveContainer>
                  </Card>
                ),
              },
              {
                key: 'bar',
                label: '柱状图对比',
                children: (
                  <Card size="small">
                    <ResponsiveContainer width="100%" height={400}>
                      <BarChart data={barData}>
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis dataKey="metric" tick={{ fontSize: 10 }} angle={-30} textAnchor="end" height={60} />
                        <YAxis />
                        <Tooltip />
                        <Legend />
                        {stocks.map((stock, i) => (
                          <Bar key={stock.symbol} dataKey={stock.name} fill={COLORS[i]} />
                        ))}
                      </BarChart>
                    </ResponsiveContainer>
                  </Card>
                ),
              },
              {
                key: 'table',
                label: '详细对比表',
                children: (
                  <Card size="small">
                    <Table
                      columns={compareColumns}
                      dataSource={compareDataSource}
                      pagination={false}
                      size="small"
                      bordered
                      scroll={{ x: 800 }}
                    />
                  </Card>
                ),
              },
            ]}
          />
        </>
      )}
    </div>
  );
}
