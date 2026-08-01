/**
 * 股票对比分析页面
 * 多指标雷达图 + 横向对比表格 + 柱状图
 */

import { useState, useEffect, useCallback } from 'react';
import logger from '../utils/logger';
import { apiService } from '../services/api';
import { Card, Select, Table, Tag, Row, Col, Spin, Button, Empty, Tabs, Statistic } from 'antd';
import { DeleteOutlined } from '@ant-design/icons';
import {
  RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, Radar, Legend,
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
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

// ==================== 演示数据（降级用，确定性生成，不发起网络请求） ====================
// 后端无 /compare 接口时，依据股票代码确定性生成合理演示指标，保证页面可独立预览。

const DEMO_METRICS: MetricDef[] = [
  { label: '市盈率(PE)', key: 'pe', unit: '', higher: 'worse' },
  { label: '市净率(PB)', key: 'pb', unit: '', higher: 'worse' },
  { label: 'ROE(%)', key: 'roe', unit: '%', higher: 'better' },
  { label: '营收增长(%)', key: 'revenueGrowth', unit: '%', higher: 'better' },
  { label: '净利润增长(%)', key: 'profitGrowth', unit: '%', higher: 'better' },
  { label: '毛利率(%)', key: 'grossMargin', unit: '%', higher: 'better' },
  { label: '资产负债率(%)', key: 'debtRatio', unit: '%', higher: 'worse' },
  { label: '股息率(%)', key: 'dividendYield', unit: '%', higher: 'better' },
];

// 雷达图维度（与下方 radarScores 的 key 对应）
const DEMO_RADAR_INDICATORS = [
  { label: '估值优势', key: 'valuation', fullMark: 100 },
  { label: '成长能力', key: 'growth', fullMark: 100 },
  { label: '盈利能力', key: 'profitability', fullMark: 100 },
  { label: '财务安全', key: 'safety', fullMark: 100 },
  { label: '分红回报', key: 'dividend', fullMark: 100 },
];

// 基于字符串的确定性哈希，保证相同代码生成相同演示数据
function hashSeed(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

// 确定性伪随机：同 (seed, salt) 返回固定 0~1 小数，避免每次刷新数值抖动
function seededRand(seed: number, salt: number): number {
  const x = Math.sin(seed * 31.7 + salt * 12.3) * 43758.5453;
  return x - Math.floor(x);
}

function randInRange(seed: number, salt: number, min: number, max: number): number {
  return +(min + seededRand(seed, salt) * (max - min)).toFixed(2);
}

// 为一组股票代码生成演示对比数据
function buildDemoCompare(symbols: string[]): {
  stocks: CompareStock[];
  metrics: MetricDef[];
  radarData: Record<string, string | number>[];
} {
  const stocks: CompareStock[] = symbols.map((sym) => {
    const opt = STOCK_OPTIONS.find((o) => o.value === sym);
    const name = opt?.label || sym;
    const seed = hashSeed(sym);
    const metrics: Record<string, number> = {
      pe: randInRange(seed, 1, 10, 60),            // 市盈率 10~60
      pb: randInRange(seed, 2, 1, 15),             // 市净率 1~15
      roe: randInRange(seed, 3, 5, 30),            // ROE 5%~30%
      revenueGrowth: randInRange(seed, 4, 0, 40),  // 营收增长 0%~40%
      profitGrowth: randInRange(seed, 5, -10, 50), // 净利润增长 -10%~50%
      grossMargin: randInRange(seed, 6, 10, 75),   // 毛利率 10%~75%
      debtRatio: randInRange(seed, 7, 20, 70),     // 资产负债率 20%~70%
      dividendYield: randInRange(seed, 8, 0, 5),   // 股息率 0%~5%
    };
    const radarScores: Record<string, number> = {
      valuation: Math.round(randInRange(seed, 11, 40, 95)),
      growth: Math.round(randInRange(seed, 12, 40, 95)),
      profitability: Math.round(randInRange(seed, 13, 40, 95)),
      safety: Math.round(randInRange(seed, 14, 40, 95)),
      dividend: Math.round(randInRange(seed, 15, 40, 95)),
    };
    return {
      symbol: sym,
      name,
      metrics,
      radarScores,
      price: +randInRange(seed, 20, 10, 2000).toFixed(2),
      changePercent: +randInRange(seed, 21, -5, 5).toFixed(2),
      marketCap: Math.floor(randInRange(seed, 22, 1e10, 3e12)),
      volume: Math.floor(randInRange(seed, 23, 1e7, 5e8)),
    };
  });

  // 雷达图数据：每个维度一行，列为各股票名称
  const radarData = DEMO_RADAR_INDICATORS.map((ind) => {
    const row: Record<string, string | number> = { metric: ind.label, fullMark: ind.fullMark };
    stocks.forEach((s) => {
      row[s.name] = s.radarScores[ind.key];
    });
    return row;
  });

  return { stocks, metrics: DEMO_METRICS, radarData };
}

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
      const symbols = selectedSymbols.join(',');
      const [compareRes, radarRes] = await Promise.all([
        apiService.get<{ stocks: CompareStock[]; metrics: MetricDef[] }>('/compare', { symbols }),
        apiService.get<{ indicators: { label: string; fullMark: number; key: string }[]; stocks: { name: string; scores: Record<string, number> }[] }>('/compare/radar', { symbols }),
      ]);

      // 后端无 /compare 接口（success 为 false 会进入下方 catch），此处仅处理成功且非空的情况
      if (compareRes.success && compareRes.data?.stocks?.length) {
        setStocks(compareRes.data.stocks);
        setMetrics(compareRes.data.metrics);
      } else {
        // 接口返回成功但无数据，同样降级
        throw new Error('对比接口返回空数据');
      }

      if (radarRes.success) {
        const indicators = radarRes.data.indicators;
        const radar = indicators.map((ind) => {
          const row: Record<string, string | number> = { metric: ind.label, fullMark: ind.fullMark };
          radarRes.data.stocks.forEach((s) => {
            row[s.name] = s.scores[ind.key];
          });
          return row;
        });
        setRadarData(radar);
      }
    } catch (error) {
      // 诚实数据红线：真实接口不可用（不存在/网络错误/返回空）时如实置空，绝不回填演示数据
      logger.warn('获取对比数据失败，已如实置空:', error);
      setStocks([]);
      setMetrics([]);
      setRadarData([]);
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
