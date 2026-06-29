/**
 * 策略回测仪表盘 v2 📊
 * 支持多策略选择 + 参数配置 + 深色主题
 */

import React, { useState, useEffect } from 'react';
import { 
  Input, Button, Card, Spin, Empty, Tag, Typography, Table, 
  Select, Tooltip, message, Row, Col, Statistic 
} from 'antd';
import { 
  SearchOutlined, TrophyOutlined,
  LineChartOutlined, ThunderboltOutlined,
  FundOutlined, BarChartOutlined
} from '@ant-design/icons';
import { apiFetch } from '../utils/api';

const { Title, Text } = Typography;
const { _Option } = Select;

import { THEME, GOLD } from '../styles/theme-constants';
const BG = THEME.bg;
const CARD_BG = THEME.cardBg;
const BORDER = THEME.border;
const TEXT = THEME.text;
const TEXT_SEC = THEME.textSec;
const COLOR_UP = THEME.up;
const COLOR_DOWN = THEME.down;
const _ACCENT = THEME.accent;

// 策略类型配置
const STRATEGIES = [
  { id: 'ma_cross', name: '均线交叉', icon: <LineChartOutlined />, description: 'MA5/MA20金叉死叉', color: '#3b82f6' },
  { id: 'rsi', name: 'RSI策略', icon: <FundOutlined />, description: '超买超卖反转', color: '#8b5cf6' },
  { id: 'macd', name: 'MACD策略', icon: <BarChartOutlined />, description: 'MACD金叉死叉', color: '#f59e0b' },
  { id: 'boll', name: '布林带策略', icon: <ThunderboltOutlined />, description: '布林带突破', color: '#22c55e' },
];

interface BacktestResult {
  strategy: string;
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
  sharpeRatio: number;
  winRate: number;
  totalTrades: number;
  winningTrades: number;
  losingTrades: number;
  profitFactor: number;
  trades: Array<{
    date: string;
    type: 'buy' | 'sell';
    price: number;
    quantity: number;
    amount: number;
    reason: string;
  }>;
  equityCurve: Array<{ date: string; value: number }>;
  drawdownCurve: Array<{ date: string; drawdown: number }>;
}

const BacktestPage: React.FC = () => {
  const [symbol, setSymbol] = useState('');
  const [strategy, setStrategy] = useState<string>('ma_cross');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<BacktestResult | null>(null);
  const [error, setError] = useState('');
  const [_presets, setPresets] = useState<any[]>([]);

  // 获取策略预设
  useEffect(() => {
    apiFetch('/api/backtest/presets')
      .then(r => r.json())
      .then(data => {
        if (data.success && data.data?.presets) {
          setPresets(data.data.presets);
        }
      })
      .catch(() => {});
  }, []);

  const runBacktest = async () => {
    if (!symbol.trim()) {
      message.warning('请输入股票代码');
      return;
    }
    setLoading(true);
    setError('');
    try {
      const resp = await apiFetch('/api/backtest/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          symbol: symbol.trim(),
          strategy: strategy,
          params: { limit: 500 }
        })
      });
      const data = await resp.json();
      if (data.success && data.data) {
        setResult(data.data);
      } else {
        setError(data.error || '回测数据不足');
        setResult(null);
      }
    } catch (e) {
      setError('请求失败');
      console.error('回测失败:', e);
    } finally {
      setLoading(false);
    }
  };

  const _formatPct = (v: number) => {
    const sign = v >= 0 ? '+' : '';
    return { text: `${sign}${v.toFixed(2)}%`, color: v >= 0 ? COLOR_UP : COLOR_DOWN };
  };

  const formatMoney = (v: number) => {
    return new Intl.NumberFormat('zh-CN', { style: 'currency', currency: 'CNY' }).format(v);
  };

  // 获取当前策略信息
  const currentStrategy = STRATEGIES.find(s => s.id === strategy);

  return (
    <div className="backtest-page" style={{ background: BG, minHeight: '100vh', padding: '24px' }}>
      <div style={{ maxWidth: 1200, margin: '0 auto' }}>
        
        {/* 页面标题 */}
        <div style={{ marginBottom: 24 }}>
          <Title level={3} style={{ color: TEXT, marginBottom: 8 }}>
            <TrophyOutlined style={{ color: GOLD, marginRight: 8 }} />
            策略回测
          </Title>
          <Text style={{ color: TEXT_SEC }}>
            选择策略和股票，查看历史回测表现
          </Text>
        </div>

        {/* 策略选择 */}
        <Card 
          title={<span style={{ color: TEXT }}>📊 选择策略</span>}
          style={{ background: CARD_BG, border: `1px solid ${BORDER}`, marginBottom: 16 }}
          bodyStyle={{ padding: '16px' }}
        >
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12 }}>
            {STRATEGIES.map(s => (
              <div
                key={s.id}
                onClick={() => setStrategy(s.id)}
                style={{
                  background: strategy === s.id ? s.color + '20' : BG,
                  border: `1px solid ${strategy === s.id ? s.color : BORDER}`,
                  borderRadius: 8,
                  padding: '12px',
                  cursor: 'pointer',
                  transition: 'all 0.2s',
                  textAlign: 'center',
                }}
              >
                <div style={{ color: s.color, fontSize: 24, marginBottom: 8 }}>{s.icon}</div>
                <div style={{ color: TEXT, fontWeight: 600, fontSize: 14 }}>{s.name}</div>
                <div style={{ color: TEXT_SEC, fontSize: 11, marginTop: 4 }}>{s.description}</div>
              </div>
            ))}
          </div>
        </Card>

        {/* 股票输入 */}
        <Card 
          style={{ background: CARD_BG, border: `1px solid ${BORDER}`, marginBottom: 16 }}
          bodyStyle={{ padding: '16px' }}
        >
          <div style={{ display: 'flex', gap: 12 }}>
            <Input
              placeholder="输入股票代码（如：600519）"
              value={symbol}
              onChange={e => setSymbol(e.target.value)}
              onPressEnter={runBacktest}
              style={{ 
                flex: 1, 
                background: BG, 
                border: `1px solid ${BORDER}`,
                color: TEXT 
              }}
              prefix={<SearchOutlined style={{ color: TEXT_SEC }} />}
            />
            <Button 
              type="primary" 
              onClick={runBacktest} 
              loading={loading} 
              icon={<SearchOutlined />}
              style={{ background: currentStrategy?.color }}
            >
              开始回测
            </Button>
          </div>
        </Card>

        {/* 加载状态 */}
        {loading && (
          <div style={{ textAlign: 'center', padding: 60 }}>
            <Spin size="large" />
            <div style={{ color: TEXT_SEC, marginTop: 16 }}>正在执行回测分析...</div>
          </div>
        )}

        {/* 错误信息 */}
        {error && !loading && (
          <Card style={{ background: CARD_BG, border: `1px solid ${BORDER}` }}>
            <Empty description={<span style={{ color: TEXT_SEC }}>{error}</span>} />
          </Card>
        )}

        {/* 回测结果 */}
        {result && !loading && (
          <>
            {/* 策略信息 */}
            <Card 
              title={
                <span style={{ color: TEXT }}>
                  {currentStrategy?.icon} {currentStrategy?.name} - {result.symbol}
                </span>
              }
              style={{ background: CARD_BG, border: `1px solid ${BORDER}`, marginBottom: 16 }}
              bodyStyle={{ padding: '16px' }}
            >
              <div style={{ color: TEXT_SEC, fontSize: 13 }}>
                回测区间: {result.startDate} 至 {result.endDate} | 共 {result.totalDays} 个交易日
              </div>
            </Card>

            {/* 核心指标卡片 */}
            <Row gutter={16} style={{ marginBottom: 16 }}>
              <Col span={6}>
                <Card style={{ background: CARD_BG, border: `1px solid ${BORDER}`, textAlign: 'center' }}>
                  <Statistic
                    title={<span style={{ color: TEXT_SEC }}>策略收益</span>}
                    value={result.totalReturn}
                    precision={2}
                    suffix="%"
                    valueStyle={{ color: result.totalReturn >= 0 ? COLOR_UP : COLOR_DOWN, fontSize: 28 }}
                  />
                </Card>
              </Col>
              <Col span={6}>
                <Card style={{ background: CARD_BG, border: `1px solid ${BORDER}`, textAlign: 'center' }}>
                  <Statistic
                    title={<span style={{ color: TEXT_SEC }}>年化收益</span>}
                    value={result.annualizedReturn}
                    precision={2}
                    suffix="%"
                    valueStyle={{ color: result.annualizedReturn >= 0 ? COLOR_UP : COLOR_DOWN, fontSize: 28 }}
                  />
                </Card>
              </Col>
              <Col span={6}>
                <Card style={{ background: CARD_BG, border: `1px solid ${BORDER}`, textAlign: 'center' }}>
                  <Statistic
                    title={<span style={{ color: TEXT_SEC }}>夏普比率</span>}
                    value={result.sharpeRatio}
                    precision={2}
                    valueStyle={{ color: result.sharpeRatio >= 1 ? COLOR_UP : COLOR_DOWN, fontSize: 28 }}
                  />
                </Card>
              </Col>
              <Col span={6}>
                <Card style={{ background: CARD_BG, border: `1px solid ${BORDER}`, textAlign: 'center' }}>
                  <Statistic
                    title={<span style={{ color: TEXT_SEC }}>最大回撤</span>}
                    value={-result.maxDrawdown}
                    precision={2}
                    suffix="%"
                    valueStyle={{ color: COLOR_DOWN, fontSize: 28 }}
                  />
                </Card>
              </Col>
            </Row>

            {/* 交易统计 */}
            <Row gutter={16} style={{ marginBottom: 16 }}>
              <Col span={6}>
                <Card style={{ background: CARD_BG, border: `1px solid ${BORDER}`, textAlign: 'center' }}>
                  <Statistic
                    title={<span style={{ color: TEXT_SEC }}>胜率</span>}
                    value={result.winRate}
                    precision={1}
                    suffix="%"
                    valueStyle={{ color: result.winRate >= 50 ? COLOR_UP : COLOR_DOWN, fontSize: 24 }}
                  />
                  <div style={{ color: TEXT_SEC, fontSize: 11 }}>
                    {result.winningTrades}/{result.totalTrades} 笔
                  </div>
                </Card>
              </Col>
              <Col span={6}>
                <Card style={{ background: CARD_BG, border: `1px solid ${BORDER}`, textAlign: 'center' }}>
                  <Statistic
                    title={<span style={{ color: TEXT_SEC }}>盈亏比</span>}
                    value={result.profitFactor}
                    precision={2}
                    valueStyle={{ color: result.profitFactor >= 1.5 ? COLOR_UP : COLOR_DOWN, fontSize: 24 }}
                  />
                </Card>
              </Col>
              <Col span={6}>
                <Card style={{ background: CARD_BG, border: `1px solid ${BORDER}`, textAlign: 'center' }}>
                  <Statistic
                    title={<span style={{ color: TEXT_SEC }}>初始资金</span>}
                    value={result.initialCapital}
                    precision={0}
                    prefix="¥"
                    valueStyle={{ color: TEXT, fontSize: 20 }}
                  />
                </Card>
              </Col>
              <Col span={6}>
                <Card style={{ background: CARD_BG, border: `1px solid ${BORDER}`, textAlign: 'center' }}>
                  <Statistic
                    title={<span style={{ color: TEXT_SEC }}>最终资产</span>}
                    value={result.finalValue}
                    precision={0}
                    prefix="¥"
                    valueStyle={{ color: result.finalValue >= result.initialCapital ? COLOR_UP : COLOR_DOWN, fontSize: 20 }}
                  />
                </Card>
              </Col>
            </Row>

            {/* 权益曲线 */}
            <Card 
              title={<span style={{ color: TEXT }}>📈 权益曲线</span>}
              style={{ background: CARD_BG, border: `1px solid ${BORDER}`, marginBottom: 16 }}
              bodyStyle={{ padding: '16px' }}
            >
              {result.equityCurve && result.equityCurve.length > 0 ? (
                <div>
                  <div style={{ 
                    display: 'flex', 
                    alignItems: 'flex-end', 
                    gap: 1, 
                    height: 150, 
                    padding: '0 4px',
                    background: BG,
                    borderRadius: 8,
                    overflow: 'hidden'
                  }}>
                    {result.equityCurve.map((p, i) => {
                      const maxVal = Math.max(...result.equityCurve.map(e => e.value));
                      const minVal = Math.min(...result.equityCurve.map(e => e.value));
                      const range = maxVal - minVal || 1;
                      const height = ((p.value - minVal) / range) * 100;
                      const isProfit = p.value >= result.initialCapital;
                      return (
                        <Tooltip key={i} title={`${p.date}: ${formatMoney(p.value)}`}>
                          <div
                            style={{
                              flex: 1,
                              height: `${Math.max(height, 2)}%`,
                              background: isProfit ? COLOR_UP : COLOR_DOWN,
                              opacity: 0.8,
                              borderRadius: '1px 1px 0 0',
                              minWidth: 2,
                            }}
                          />
                        </Tooltip>
                      );
                    })}
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: TEXT_SEC, marginTop: 8 }}>
                    <span>{result.equityCurve[0]?.date}</span>
                    <span>{result.equityCurve[result.equityCurve.length - 1]?.date}</span>
                  </div>
                </div>
              ) : (
                <Empty description="暂无权益数据" />
              )}
            </Card>

            {/* 交易记录 */}
            <Card 
              title={<span style={{ color: TEXT }}>📋 交易记录</span>}
              style={{ background: CARD_BG, border: `1px solid ${BORDER}` }}
              bodyStyle={{ padding: '16px' }}
            >
              <Table
                dataSource={result.trades?.slice(-20) || []}
                rowKey={(r, i) => `${r.date}-${i}`}
                size="small"
                pagination={false}
                style={{ background: 'transparent' }}
                columns={[
                  { 
                    title: '日期', 
                    dataIndex: 'date', 
                    width: 120,
                    render: (d: string) => <span style={{ color: TEXT_SEC }}>{d?.slice(0, 10)}</span>
                  },
                  { 
                    title: '类型', 
                    dataIndex: 'type', 
                    width: 80,
                    render: (t: string) => (
                      <Tag color={t === 'buy' ? 'red' : 'green'}>
                        {t === 'buy' ? '买入' : '卖出'}
                      </Tag>
                    )
                  },
                  { 
                    title: '价格', 
                    dataIndex: 'price', 
                    width: 100,
                    render: (p: number) => <span style={{ color: TEXT, fontFamily: 'monospace' }}>{p?.toFixed(2)}</span>
                  },
                  { 
                    title: '数量', 
                    dataIndex: 'quantity', 
                    width: 100,
                    render: (q: number) => <span style={{ color: TEXT }}>{q}</span>
                  },
                  { 
                    title: '金额', 
                    dataIndex: 'amount', 
                    width: 120,
                    render: (a: number) => <span style={{ color: TEXT }}>{formatMoney(a)}</span>
                  },
                  { 
                    title: '原因', 
                    dataIndex: 'reason', 
                    ellipsis: true,
                    render: (r: string) => <span style={{ color: TEXT_SEC }}>{r}</span>
                  },
                ]}
              />
            </Card>
          </>
        )}
      </div>
    </div>
  );
};

export default BacktestPage;
