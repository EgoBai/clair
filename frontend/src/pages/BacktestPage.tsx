/**
 * 策略回测仪表盘 📊
 * 输入股票代码 → 查看历史策略表现
 */
import React, { useState } from 'react';
import { Input, Button, Card, Spin, Empty, Tag, Typography, Divider, Table } from 'antd';
import { SearchOutlined, RiseOutlined, FallOutlined, TrophyOutlined } from '@ant-design/icons';

const { Title, Text } = Typography;

const COLOR_UP = '#cf2a2a';
const COLOR_DOWN = '#1db468';
const BG = '#f5f6f8';
const CARD_BG = '#ffffff';

interface BacktestResult {
  symbol: string;
  name: string;
  period: string;
  totalDays: number;
  totalSignals: number;
  totalTrades: number;
  winTrades: number;
  winRate: number;
  strategyReturn: number;
  buyHoldReturn: number;
  alpha: number;
  maxDrawdown: number;
  avgReturnPerTrade: number;
  recentSignals: Signal[];
  equityCurve: EquityPoint[];
}

interface Signal {
  day: number;
  date: string;
  price: number;
  signal: 'buy' | 'sell';
  cumulativeReturn: number;
}

interface EquityPoint {
  day: number;
  equity: number;
}

const BacktestPage: React.FC = () => {
  const [symbol, setSymbol] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<BacktestResult | null>(null);
  const [error, setError] = useState('');

  const runBacktest = async () => {
    if (!symbol.trim()) return;
    setLoading(true);
    setError('');
    try {
      const resp = await fetch(`/api/backtest/${symbol.trim()}`);
      const data = await resp.json();
      if (data.success && data.data) {
        setResult(data.data);
      } else {
        setError(data.note || '回测数据不足');
        setResult(null);
      }
    } catch {
      setError('请求失败');
    } finally {
      setLoading(false);
    }
  };

  const formatPct = (v: number) => {
    const sign = v >= 0 ? '+' : '';
    return { text: `${sign}${v.toFixed(2)}%`, color: v >= 0 ? COLOR_UP : COLOR_DOWN };
  };

  const signalColumns = [
    { title: '日期', dataIndex: 'date', width: 120, render: (d: string) => d?.slice(0, 10) },
    { title: '价格', dataIndex: 'price', width: 100, render: (p: number) => p?.toFixed(2) },
    {
      title: '信号', dataIndex: 'signal', width: 100,
      render: (s: string) => (
        <Tag color={s === 'buy' ? 'red' : 'green'}>{s === 'buy' ? '买入' : '卖出'}</Tag>
      ),
    },
    {
      title: '累计收益', dataIndex: 'cumulativeReturn', width: 120,
      render: (r: number) => {
        const fmt = formatPct(r);
        return <span style={{ color: fmt.color, fontWeight: 600 }}>{fmt.text}</span>;
      },
    },
  ];

  // Mini equity chart (ASCII-style bar chart)
  const maxEquity = result ? Math.max(...result.equityCurve.map(p => p.equity), 1.1) : 1;
  const minEquity = result ? Math.min(...result.equityCurve.map(p => p.equity), 0.9) : 1;

  return (
    <div style={{ background: BG, minHeight: '100vh', padding: '24px' }}>
      <div style={{ maxWidth: 1000, margin: '0 auto' }}>
        <Title level={3} style={{ marginBottom: 20 }}>
          <TrophyOutlined style={{ color: '#f59e0b', marginRight: 8 }} />
          策略回测
        </Title>

        <Card style={{ marginBottom: 20, borderRadius: 10 }}>
          <div style={{ display: 'flex', gap: 12 }}>
            <Input
              placeholder="输入股票代码（如：600519）"
              value={symbol}
              onChange={e => setSymbol(e.target.value)}
              onPressEnter={runBacktest}
              style={{ flex: 1 }}
              prefix={<SearchOutlined />}
            />
            <Button type="primary" onClick={runBacktest} loading={loading} icon={<SearchOutlined />}>
              回测
            </Button>
          </div>
        </Card>

        {loading && <div style={{ textAlign: 'center', padding: 40 }}><Spin size="large" /></div>}

        {error && <Empty description={error} />}

        {result && !loading && (
          <>
            {/* Summary cards */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 16 }}>
              <Card size="small" style={{ borderRadius: 8, textAlign: 'center' }}>
                <div style={{ fontSize: 11, color: '#8c8c8c' }}>策略收益</div>
                <div style={{ fontSize: 22, fontWeight: 800, color: formatPct(result.strategyReturn).color }}>
                  {formatPct(result.strategyReturn).text}
                </div>
                <div style={{ fontSize: 10, color: '#8c8c8c' }}>{result.period}</div>
              </Card>
              <Card size="small" style={{ borderRadius: 8, textAlign: 'center' }}>
                <div style={{ fontSize: 11, color: '#8c8c8c' }}>买入持有</div>
                <div style={{ fontSize: 22, fontWeight: 800, color: formatPct(result.buyHoldReturn).color }}>
                  {formatPct(result.buyHoldReturn).text}
                </div>
                <div style={{ fontSize: 11, color: '#8c8c8c' }}>
                  α值 <span style={{ color: result.alpha >= 0 ? COLOR_UP : COLOR_DOWN, fontWeight: 600 }}>
                    {result.alpha >= 0 ? '+' : ''}{result.alpha}%
                  </span>
                </div>
              </Card>
              <Card size="small" style={{ borderRadius: 8, textAlign: 'center' }}>
                <div style={{ fontSize: 11, color: '#8c8c8c' }}>胜率</div>
                <div style={{ fontSize: 22, fontWeight: 800, color: result.winRate >= 50 ? COLOR_UP : COLOR_DOWN }}>
                  {result.winRate}%
                </div>
                <div style={{ fontSize: 10, color: '#8c8c8c' }}>{result.winTrades}/{result.totalTrades} 笔</div>
              </Card>
              <Card size="small" style={{ borderRadius: 8, textAlign: 'center' }}>
                <div style={{ fontSize: 11, color: '#8c8c8c' }}>最大回撤</div>
                <div style={{ fontSize: 22, fontWeight: 800, color: COLOR_DOWN }}>
                  -{result.maxDrawdown}%
                </div>
                <div style={{ fontSize: 10, color: '#8c8c8c' }}>{result.totalDays}天/{result.totalSignals}信号</div>
              </Card>
            </div>

            {/* Equity curve */}
            <Card title="📈 权益曲线" size="small" style={{ marginBottom: 16, borderRadius: 8 }}>
              <div style={{ display: 'flex', alignItems: 'flex-end', gap: 1, height: 100, padding: '0 4px' }}>
                {result.equityCurve.map((p, i) => {
                  const height = ((p.equity - minEquity) / (maxEquity - minEquity)) * 100;
                  const isProfit = p.equity >= 1;
                  return (
                    <div
                      key={i}
                      title={`Day ${p.day}: ${((p.equity - 1) * 100).toFixed(1)}%`}
                      style={{
                        flex: 1,
                        height: `${Math.max(height, 1)}%`,
                        background: isProfit ? COLOR_UP : COLOR_DOWN,
                        opacity: 0.7,
                        borderRadius: '1px 1px 0 0',
                        minWidth: 3,
                      }}
                    />
                  );
                })}
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: '#8c8c8c', marginTop: 4 }}>
                <span>起始</span>
                <span style={{ color: result.strategyReturn >= 0 ? COLOR_UP : COLOR_DOWN }}>
                  {formatPct(result.strategyReturn).text}
                </span>
              </div>
            </Card>

            {/* Recent signals */}
            <Card title="📋 近期交易信号" size="small" style={{ borderRadius: 8 }}>
              <Table
                dataSource={result.recentSignals}
                columns={signalColumns}
                rowKey="day"
                size="small"
                pagination={false}
              />
            </Card>
          </>
        )}
      </div>
    </div>
  );
};

export default BacktestPage;
