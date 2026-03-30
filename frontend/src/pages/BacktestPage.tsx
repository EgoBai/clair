/**
 * 策略回测页面
 * 支持选择策略、股票、参数，运行回测并可视化结果
 */

import React, { useState, useCallback, useMemo } from 'react';
import {
  Card, Row, Col, Select, InputNumber, Button, Table, Tag, Statistic,
  Space, Divider, Typography, Alert, Radio, Tooltip, Form, Spin,
} from 'antd';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip as RTooltip,
  ResponsiveContainer, AreaChart, Area, ReferenceDot, BarChart, Bar,
  Legend, ComposedChart,
} from 'recharts';
import {
  ThunderboltOutlined, BarChartOutlined, RiseOutlined, FallOutlined,
  SwapOutlined, InfoCircleOutlined, SearchOutlined,
} from '@ant-design/icons';
import { apiService } from '../services/api';
import { formatPrice, formatChangePercent, formatTurnover } from '../../../../shared/formatters';
import { useDebounce } from '../hooks/useHooks';

const { Title, Text } = Typography;
const { Option } = Select;

// ==================== 类型 ====================

interface BacktestResult {
  strategy: string;
  params: any;
  symbol: string;
  startDate: string;
  endDate: string;
  totalDays: number;
  initialCapital: number;
  finalValue: number;
  totalReturn: number;
  annualizedReturn: number;
  benchmarkReturn: number;
  maxDrawdown: number;
  maxDrawdownDate: string;
  sharpeRatio: number;
  sortinoRatio: number;
  volatility: number;
  totalTrades: number;
  winningTrades: number;
  losingTrades: number;
  winRate: number;
  avgWin: number;
  avgLoss: number;
  profitFactor: number;
  trades: any[];
  equityCurve: { date: string; value: number }[];
  drawdownCurve: { date: string; drawdown: number }[];
}

// ==================== 策略配置 ====================

const STRATEGY_OPTIONS = [
  { value: 'ma_cross', label: '均线交叉', desc: '短期均线上穿长期均线买入' },
  { value: 'rsi', label: 'RSI超买超卖', desc: 'RSI低于超卖线买入，高于超买线卖出' },
  { value: 'macd', label: 'MACD金叉死叉', desc: 'DIF上穿DEA买入，下穿卖出' },
];

// ==================== 组件 ====================

function BacktestPage() {
  const [symbol, setSymbol] = useState('000001.SZ');
  const [strategy, setStrategy] = useState('ma_cross');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<BacktestResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [chartType, setChartType] = useState<'equity' | 'drawdown'>('equity');
  const [form] = Form.useForm();

  // 默认参数
  const defaultParams: Record<string, any> = {
    ma_cross: { fastPeriod: 5, slowPeriod: 20 },
    rsi: { rsiPeriod: 14, rsiOversold: 30, rsiOverbought: 70 },
    macd: { macdFast: 12, macdSlow: 26, macdSignal: 9 },
  };

  const handleRun = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = {
        ...defaultParams[strategy],
        initialCapital: 100000,
        commission: 0.0003,
      };
      const response = await apiService.runBacktest(symbol, strategy, params);
      if (response.success) {
        setResult(response.data);
      } else {
        setError(response.error || '回测失败');
      }
    } catch (err: any) {
      setError(err.message || '回测执行出错');
    } finally {
      setLoading(false);
    }
  }, [symbol, strategy]);

  // 收益曲线数据
  const equityData = useMemo(() => {
    if (!result?.equityCurve) return [];
    // 降采样避免过多数据点
    const step = Math.max(1, Math.floor(result.equityCurve.length / 200));
    return result.equityCurve.filter((_, i) => i % step === 0).map((d) => ({
      date: d.date.slice(5),
      value: Math.round(d.value),
    }));
  }, [result?.equityCurve]);

  // 回撤曲线数据
  const drawdownData = useMemo(() => {
    if (!result?.drawdownCurve) return [];
    const step = Math.max(1, Math.floor(result.drawdownCurve.length / 200));
    return result.drawdownCurve.filter((_, i) => i % step === 0).map((d) => ({
      date: d.date.slice(5),
      drawdown: -d.drawdown,
    }));
  }, [result?.drawdownCurve]);

  // 交易记录表格列
  const tradeColumns = [
    {
      title: '日期',
      dataIndex: 'date',
      key: 'date',
      width: 100,
    },
    {
      title: '操作',
      dataIndex: 'type',
      key: 'type',
      width: 60,
      render: (type: string) => (
        <Tag color={type === 'buy' ? 'red' : 'green'}>
          {type === 'buy' ? '买入' : type === 'sell' ? '卖出' : '平仓'}
        </Tag>
      ),
    },
    {
      title: '价格',
      dataIndex: 'price',
      key: 'price',
      width: 80,
      render: (v: number) => v?.toFixed(2),
    },
    {
      title: '数量',
      dataIndex: 'quantity',
      key: 'quantity',
      width: 80,
      render: (v: number) => v?.toLocaleString(),
    },
    {
      title: '金额',
      dataIndex: 'amount',
      key: 'amount',
      width: 100,
      render: (v: number) => formatTurnover(v),
    },
    {
      title: '信号',
      dataIndex: 'reason',
      key: 'reason',
      ellipsis: true,
    },
  ];

  // 收益率分布
  const returnColor = (v: number) => v >= 0 ? '#EF4444' : '#22C55E';

  return (
    <div style={{ padding: 24 }}>
      <Title level={3}>
        <ThunderboltOutlined style={{ marginRight: 8 }} />
        策略回测
      </Title>

      {/* 配置面板 */}
      <Card style={{ marginBottom: 16 }}>
        <Row gutter={16} align="middle">
          <Col span={5}>
            <Text strong>股票代码</Text>
            <Select
              value={symbol}
              onChange={setSymbol}
              style={{ width: '100%', marginTop: 4 }}
              placeholder="选择股票"
            >
              <Option value="000001.SZ">平安银行 000001</Option>
              <Option value="600519.SH">贵州茅台 600519</Option>
              <Option value="000858.SZ">五粮液 000858</Option>
              <Option value="300750.SZ">宁德时代 300750</Option>
              <Option value="601318.SH">中国平安 601318</Option>
            </Select>
          </Col>
          <Col span={6}>
            <Text strong>策略类型</Text>
            <Select
              value={strategy}
              onChange={setStrategy}
              style={{ width: '100%', marginTop: 4 }}
            >
              {STRATEGY_OPTIONS.map((s) => (
                <Option key={s.value} value={s.value}>
                  <Tooltip title={s.desc}>{s.label}</Tooltip>
                </Option>
              ))}
            </Select>
          </Col>
          <Col span={5}>
            <Text strong>初始资金</Text>
            <InputNumber
              value={100000}
              disabled
              style={{ width: '100%', marginTop: 4 }}
              formatter={(v) => `¥${v}`.replace(/\B(?=(\d{3})+(?!\d))/g, ',')}
            />
          </Col>
          <Col span={4}>
            <Text strong>佣金费率</Text>
            <InputNumber
              value={0.03}
              disabled
              style={{ width: '100%', marginTop: 4 }}
              formatter={(v) => `${v}%`}
            />
          </Col>
          <Col span={4}>
            <Button
              type="primary"
              icon={<SearchOutlined />}
              onClick={handleRun}
              loading={loading}
              size="large"
              style={{ marginTop: 20 }}
              block
            >
              运行回测
            </Button>
          </Col>
        </Row>
      </Card>

      {error && (
        <Alert type="error" message={error} style={{ marginBottom: 16 }} closable onClose={() => setError(null)} />
      )}

      {loading && (
        <Card style={{ textAlign: 'center', padding: 60 }}>
          <Spin size="large" />
          <div style={{ marginTop: 16 }}>
            <Text type="secondary">正在执行回测计算...</Text>
          </div>
        </Card>
      )}

      {result && !loading && (
        <>
          {/* 核心指标 */}
          <Row gutter={16} style={{ marginBottom: 16 }}>
            <Col span={4}>
              <Card>
                <Statistic
                  title="总收益率"
                  value={result.totalReturn}
                  precision={2}
                  suffix="%"
                  valueStyle={{ color: returnColor(result.totalReturn) }}
                  prefix={result.totalReturn >= 0 ? <RiseOutlined /> : <FallOutlined />}
                />
              </Card>
            </Col>
            <Col span={4}>
              <Card>
                <Statistic
                  title="年化收益率"
                  value={result.annualizedReturn}
                  precision={2}
                  suffix="%"
                  valueStyle={{ color: returnColor(result.annualizedReturn) }}
                />
              </Card>
            </Col>
            <Col span={4}>
              <Card>
                <Statistic
                  title="最大回撤"
                  value={result.maxDrawdown}
                  precision={2}
                  suffix="%"
                  valueStyle={{ color: '#22C55E' }}
                />
              </Card>
            </Col>
            <Col span={4}>
              <Card>
                <Statistic
                  title="夏普比率"
                  value={result.sharpeRatio}
                  precision={2}
                  valueStyle={{ color: result.sharpeRatio > 1 ? '#EF4444' : '#6B7280' }}
                />
              </Card>
            </Col>
            <Col span={4}>
              <Card>
                <Statistic
                  title="胜率"
                  value={result.winRate}
                  precision={1}
                  suffix="%"
                />
              </Card>
            </Col>
            <Col span={4}>
              <Card>
                <Statistic
                  title="基准收益"
                  value={result.benchmarkReturn}
                  precision={2}
                  suffix="%"
                  valueStyle={{ color: returnColor(result.benchmarkReturn) }}
                />
              </Card>
            </Col>
          </Row>

          {/* 图表 */}
          <Card
            title="收益曲线"
            extra={
              <Radio.Group value={chartType} onChange={(e) => setChartType(e.target.value)} size="small">
                <Radio.Button value="equity">权益曲线</Radio.Button>
                <Radio.Button value="drawdown">回撤曲线</Radio.Button>
              </Radio.Group>
            }
            style={{ marginBottom: 16 }}
          >
            <ResponsiveContainer width="100%" height={350}>
              {chartType === 'equity' ? (
                <AreaChart data={equityData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                  <XAxis dataKey="date" tick={{ fontSize: 11 }} interval="preserveStartEnd" />
                  <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => `${(v / 10000).toFixed(0)}万`} />
                  <RTooltip
                    formatter={(v: number) => [`¥${v.toLocaleString()}`, '资产']}
                    labelFormatter={(l: string) => `日期: ${l}`}
                  />
                  <defs>
                    <linearGradient id="equityGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#3B82F6" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="#3B82F6" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <Area type="monotone" dataKey="value" stroke="#3B82F6" fill="url(#equityGrad)" strokeWidth={2} />
                </AreaChart>
              ) : (
                <AreaChart data={drawdownData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                  <XAxis dataKey="date" tick={{ fontSize: 11 }} interval="preserveStartEnd" />
                  <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => `${v}%`} />
                  <RTooltip
                    formatter={(v: number) => [`${v.toFixed(2)}%`, '回撤']}
                    labelFormatter={(l: string) => `日期: ${l}`}
                  />
                  <defs>
                    <linearGradient id="ddGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#22C55E" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="#22C55E" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <Area type="monotone" dataKey="drawdown" stroke="#22C55E" fill="url(#ddGrad)" strokeWidth={2} />
                </AreaChart>
              )}
            </ResponsiveContainer>
          </Card>

          {/* 详细指标 + 交易记录 */}
          <Row gutter={16}>
            <Col span={8}>
              <Card title="详细指标" size="small">
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                  <Statistic title="初始资金" value={result.initialCapital} prefix="¥" formatter={(v) => Number(v).toLocaleString()} />
                  <Statistic title="最终资金" value={result.finalValue} prefix="¥" formatter={(v) => Number(v).toLocaleString()} />
                  <Statistic title="总交易次数" value={result.totalTrades} />
                  <Statistic title="盈利次数" value={result.winningTrades} valueStyle={{ color: '#EF4444' }} />
                  <Statistic title="亏损次数" value={result.losingTrades} valueStyle={{ color: '#22C55E' }} />
                  <Statistic title="盈亏比" value={result.profitFactor} precision={2} />
                  <Statistic title="波动率" value={result.volatility} precision={2} suffix="%" />
                  <Statistic title="索提诺比率" value={result.sortinoRatio} precision={2} />
                </div>
              </Card>
            </Col>
            <Col span={16}>
              <Card title={`交易记录 (${result.trades?.length || 0}笔)`} size="small">
                <Table
                  columns={tradeColumns}
                  dataSource={result.trades || []}
                  rowKey={(r, i) => `${r.date}-${r.type}-${i}`}
                  size="small"
                  pagination={{ pageSize: 8, size: 'small' }}
                  scroll={{ y: 300 }}
                />
              </Card>
            </Col>
          </Row>
        </>
      )}

      {/* 空状态 */}
      {!result && !loading && (
        <Card style={{ textAlign: 'center', padding: 60 }}>
          <ThunderboltOutlined style={{ fontSize: 48, color: '#d9d9d9', marginBottom: 16 }} />
          <div>
            <Text type="secondary">选择股票和策略，点击"运行回测"开始</Text>
          </div>
        </Card>
      )}
    </div>
  );
}

export default BacktestPage;
