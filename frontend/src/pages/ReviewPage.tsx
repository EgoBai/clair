import React, { useState } from 'react';
import {
  Table,
  Card,
  Tag,
  Button,
  Statistic,
  Row,
  Col,
  Typography,
  Space,
  message,
} from 'antd';
import {
  ArrowDownOutlined,
  TrophyOutlined,
  RiseOutlined,
  FallOutlined,
  RobotOutlined,
  LineChartOutlined,
  CalendarOutlined,
  ThunderboltOutlined,
} from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';

const { Title, Text, Paragraph } = Typography;

/* ------------------------------------------------------------------ */
/*  Theme tokens (matches DiscoverPage dark palette)                   */
/* ------------------------------------------------------------------ */
const THEME = {
  bg: '#0f1419',
  cardBg: '#1a2332',
  cardBorder: '#243447',
  text: '#e0e0e0',
  textSecondary: '#8899aa',
  up: '#cf2a2a',
  down: '#1db468',
  accent: '#3b82f6',
  accentHover: '#2563eb',
};

/* ------------------------------------------------------------------ */
/*  TypeScript interfaces                                              */
/* ------------------------------------------------------------------ */
interface TradeRecord {
  key: string;
  date: string;
  symbol: string;
  name: string;
  direction: 'buy' | 'sell';
  buyPrice: number;
  sellPrice: number | null;
  returnPct: number | null;
  strategy: string;
  status: 'holding' | 'closed';
}

interface StrategyPerformance {
  strategyName: string;
  strategyReturn: number;
  buyHoldReturn: number;
}

/* ------------------------------------------------------------------ */
/*  Mock data – 13 records covering wins, losses, holds, strategies    */
/* ------------------------------------------------------------------ */
const MOCK_TRADES: TradeRecord[] = [
  {
    key: '1',
    date: '2026-05-20',
    symbol: '600519.SH',
    name: '贵州茅台',
    direction: 'buy',
    buyPrice: 1680.00,
    sellPrice: null,
    returnPct: null,
    strategy: 'MA金叉',
    status: 'holding',
  },
  {
    key: '2',
    date: '2026-05-18',
    symbol: '000858.SZ',
    name: '五粮液',
    direction: 'buy',
    buyPrice: 152.30,
    sellPrice: 161.80,
    returnPct: 6.24,
    strategy: 'MACD底背离',
    status: 'closed',
  },
  {
    key: '3',
    date: '2026-05-16',
    symbol: '300750.SZ',
    name: '宁德时代',
    direction: 'buy',
    buyPrice: 218.50,
    sellPrice: 205.20,
    returnPct: -6.09,
    strategy: 'RSI超卖反弹',
    status: 'closed',
  },
  {
    key: '4',
    date: '2026-05-14',
    symbol: '002594.SZ',
    name: '比亚迪',
    direction: 'buy',
    buyPrice: 285.00,
    sellPrice: 312.40,
    returnPct: 9.61,
    strategy: '趋势突破',
    status: 'closed',
  },
  {
    key: '5',
    date: '2026-05-12',
    symbol: '600036.SH',
    name: '招商银行',
    direction: 'buy',
    buyPrice: 38.60,
    sellPrice: 40.25,
    returnPct: 4.27,
    strategy: '布林带收窄',
    status: 'closed',
  },
  {
    key: '6',
    date: '2026-05-10',
    symbol: '601899.SH',
    name: '紫金矿业',
    direction: 'buy',
    buyPrice: 18.92,
    sellPrice: 17.35,
    returnPct: -8.30,
    strategy: 'KDJ金叉',
    status: 'closed',
  },
  {
    key: '7',
    date: '2026-05-08',
    symbol: '000001.SZ',
    name: '平安银行',
    direction: 'buy',
    buyPrice: 13.80,
    sellPrice: 14.55,
    returnPct: 5.43,
    strategy: 'MA金叉',
    status: 'closed',
  },
  {
    key: '8',
    date: '2026-05-06',
    symbol: '002475.SZ',
    name: '立讯精密',
    direction: 'buy',
    buyPrice: 35.20,
    sellPrice: null,
    returnPct: null,
    strategy: '放量突破',
    status: 'holding',
  },
  {
    key: '9',
    date: '2026-04-30',
    symbol: '600900.SH',
    name: '长江电力',
    direction: 'buy',
    buyPrice: 27.45,
    sellPrice: 28.90,
    returnPct: 5.28,
    strategy: '股息策略',
    status: 'closed',
  },
  {
    key: '10',
    date: '2026-04-28',
    symbol: '300059.SZ',
    name: '东方财富',
    direction: 'buy',
    buyPrice: 16.80,
    sellPrice: 14.95,
    returnPct: -11.01,
    strategy: 'MACD底背离',
    status: 'closed',
  },
  {
    key: '11',
    date: '2026-04-25',
    symbol: '601318.SH',
    name: '中国平安',
    direction: 'buy',
    buyPrice: 52.10,
    sellPrice: 55.30,
    returnPct: 6.14,
    strategy: 'KDJ金叉',
    status: 'closed',
  },
  {
    key: '12',
    date: '2026-04-22',
    symbol: '002714.SZ',
    name: '牧原股份',
    direction: 'buy',
    buyPrice: 42.80,
    sellPrice: 39.50,
    returnPct: -7.71,
    strategy: '布林带收窄',
    status: 'closed',
  },
  {
    key: '13',
    date: '2026-04-20',
    symbol: '600585.SH',
    name: '海螺水泥',
    direction: 'buy',
    buyPrice: 26.30,
    sellPrice: 27.85,
    returnPct: 5.90,
    strategy: 'RSI超卖反弹',
    status: 'closed',
  },
];

/* ------------------------------------------------------------------ */
/*  Derived stats                                                      */
/* ------------------------------------------------------------------ */
const computeStats = (trades: TradeRecord[]) => {
  const closedTrades = trades.filter((t) => t.status === 'closed');
  const totalTrades = trades.length;
  const wins = closedTrades.filter((t) => (t.returnPct ?? 0) > 0).length;
  const winRate = closedTrades.length > 0 ? (wins / closedTrades.length) * 100 : 0;
  const totalReturn = closedTrades.reduce((acc, t) => acc + (t.returnPct ?? 0), 0);
  const avgReturn = closedTrades.length > 0 ? totalReturn / closedTrades.length : 0;
  const maxDrawdown = Math.min(...closedTrades.map((t) => t.returnPct ?? 0));

  return { totalTrades, wins, winRate, avgReturn, totalReturn, maxDrawdown };
};

const STRATEGY_PERFORMANCE: StrategyPerformance[] = [
  { strategyName: 'MA金叉', strategyReturn: 12.5, buyHoldReturn: 5.2 },
  { strategyName: 'MACD底背离', strategyReturn: -4.8, buyHoldReturn: 5.2 },
  { strategyName: '趋势突破', strategyReturn: 18.3, buyHoldReturn: 5.2 },
  { strategyName: '布林带收窄', strategyReturn: -2.4, buyHoldReturn: 5.2 },
  { strategyName: 'RSI超卖反弹', strategyReturn: 1.6, buyHoldReturn: 5.2 },
  { strategyName: 'KDJ金叉', strategyReturn: -2.2, buyHoldReturn: 5.2 },
  { strategyName: '放量突破', strategyReturn: 8.9, buyHoldReturn: 5.2 },
  { strategyName: '股息策略', strategyReturn: 5.3, buyHoldReturn: 5.2 },
];

/* ------------------------------------------------------------------ */
/*  Sub-components                                                     */
/* ------------------------------------------------------------------ */

const SectionTitle: React.FC<{ children: React.ReactNode; icon?: React.ReactNode }> = ({
  children,
  icon,
}) => (
  <div style={{ marginBottom: 16 }}>
    <Space align="center" size={8}>
      {icon}
      <Text style={{ color: THEME.text, fontSize: 18, fontWeight: 600 }}>{children}</Text>
    </Space>
  </div>
);

const StrategyBar: React.FC<{ label: string; value: number; color: string }> = ({
  label,
  value,
  color,
}) => {
  const maxWidth = 300;
  const maxAbs = 25;
  const width = Math.min(Math.abs(value) / maxAbs, 1) * maxWidth;
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8 }}>
      <div style={{ width: 100, textAlign: 'right', color: THEME.textSecondary, fontSize: 13 }}>
        {label}
      </div>
      <div
        style={{
          height: 22,
          width,
          borderRadius: 4,
          background: color,
          transition: 'width 0.3s ease',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'flex-end',
          paddingRight: 8,
        }}
      >
        <span style={{ color: '#fff', fontSize: 11, fontWeight: 600 }}>
          {value > 0 ? '+' : ''}
          {value.toFixed(1)}%
        </span>
      </div>
    </div>
  );
};

/* ------------------------------------------------------------------ */
/*  Main Component                                                     */
/* ------------------------------------------------------------------ */

const ReviewPage: React.FC = () => {
  const navigate = useNavigate();
  const [dateRange, setDateRange] = useState<string>('30days');
  const [aiAnalysis, setAiAnalysis] = useState<string>('');
  const [aiAnalysisLoading, setAiAnalysisLoading] = useState(false);

  const stats = computeStats(MOCK_TRADES);

  /* --- AI Trade Analysis ---------------------------------------------- */
  const handleAiAnalysis = async () => {
    setAiAnalysisLoading(true);
    try {
      const resp = await fetch('/api/ai/trade-analysis', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          trades: MOCK_TRADES.slice(0, 10),
          stats: {
            totalTrades: stats.totalTrades,
            winRate: stats.winRate,
            avgReturn: stats.avgReturn,
            totalReturn: stats.totalReturn,
            maxDrawdown: stats.maxDrawdown,
          },
        }),
      });
      const data = await resp.json();
      if (data.analysis) setAiAnalysis(data.analysis);
    } catch {
      // silent fail
    } finally {
      setAiAnalysisLoading(false);
    }
  };

  /* --- Table columns ---------------------------------------------- */
  const columns = [
    {
      title: '日期',
      dataIndex: 'date',
      key: 'date',
      width: 120,
      render: (v: string) => (
        <Text style={{ color: THEME.textSecondary, fontSize: 13 }}>{v}</Text>
      ),
    },
    {
      title: '代码',
      dataIndex: 'symbol',
      key: 'symbol',
      width: 120,
      render: (v: string) => (
        <Text style={{ color: THEME.accent, fontSize: 13, fontFamily: 'monospace' }}>{v}</Text>
      ),
    },
    {
      title: '名称',
      dataIndex: 'name',
      key: 'name',
      width: 100,
      render: (v: string) => (
        <Text style={{ color: THEME.text, fontSize: 13 }}>{v}</Text>
      ),
    },
    {
      title: '方向',
      dataIndex: 'direction',
      key: 'direction',
      width: 80,
      render: (v: string) => (
        <Tag
          color={v === 'buy' ? THEME.up : THEME.down}
          style={{
            borderRadius: 4,
            border: 'none',
            color: '#fff',
            fontWeight: 500,
          }}
        >
          {v === 'buy' ? '买入' : '卖出'}
        </Tag>
      ),
    },
    {
      title: '买入价',
      dataIndex: 'buyPrice',
      key: 'buyPrice',
      width: 100,
      render: (v: number) => (
        <Text style={{ color: THEME.text, fontSize: 13 }}>¥{v.toFixed(2)}</Text>
      ),
    },
    {
      title: '卖出价',
      dataIndex: 'sellPrice',
      key: 'sellPrice',
      width: 100,
      render: (v: number | null) =>
        v !== null ? (
          <Text style={{ color: THEME.text, fontSize: 13 }}>¥{v.toFixed(2)}</Text>
        ) : (
          <Text style={{ color: THEME.textSecondary, fontSize: 13 }}>-</Text>
        ),
    },
    {
      title: '收益率',
      dataIndex: 'returnPct',
      key: 'returnPct',
      width: 100,
      render: (v: number | null) => {
        if (v === null)
          return <Text style={{ color: THEME.textSecondary, fontSize: 13 }}>-</Text>;
        const color = v > 0 ? THEME.up : v < 0 ? THEME.down : THEME.text;
        return (
          <Text
            style={{
              color,
              fontSize: 13,
              fontWeight: 600,
            }}
          >
            {v > 0 ? '+' : ''}
            {v.toFixed(2)}%
          </Text>
        );
      },
    },
    {
      title: '策略来源',
      dataIndex: 'strategy',
      key: 'strategy',
      width: 120,
      render: (v: string) => (
        <Tag
          style={{
            background: 'rgba(59,130,246,0.15)',
            color: THEME.accent,
            border: '1px solid rgba(59,130,246,0.3)',
            borderRadius: 4,
            fontSize: 12,
          }}
        >
          {v}
        </Tag>
      ),
    },
    {
      title: '状态',
      dataIndex: 'status',
      key: 'status',
      width: 90,
      render: (v: string) => (
        <Tag
          color={v === 'holding' ? 'orange' : 'default'}
          style={{ borderRadius: 4, border: 'none', fontSize: 12 }}
        >
          {v === 'holding' ? '持有' : '已平仓'}
        </Tag>
      ),
    },
  ];

  const handleRowClick = (record: TradeRecord) => {
    // Navigate to stock detail page
    navigate(`/stock/${record.symbol}`);
  };

  const cardStyle: React.CSSProperties = {
    background: THEME.cardBg,
    border: `1px solid ${THEME.cardBorder}`,
    borderRadius: 12,
  };

  return (
    <div
      style={{
        minHeight: '100vh',
        background: THEME.bg,
        padding: '24px 32px',
        color: THEME.text,
      }}
    >
      {/* ============================================================ */}
      {/*  Header                                                       */}
      {/* ============================================================ */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-start',
          marginBottom: 28,
          flexWrap: 'wrap',
          gap: 16,
        }}
      >
        <div>
          <Title level={2} style={{ color: THEME.text, margin: 0 }}>
            📋 复盘中心
          </Title>
          <Text style={{ color: THEME.textSecondary, fontSize: 14, marginTop: 4, display: 'block' }}>
            回顾历史决策，优化未来策略
          </Text>
        </div>
        <Space size={8} wrap>
          {(['7days', '30days', '90days', 'custom'] as const).map((range) => {
            const labels = { '7days': '近7天', '30days': '近30天', '90days': '近90天', custom: '自定义' };
            const isActive = dateRange === range;
            return (
              <Button
                key={range}
                size="small"
                icon={range === 'custom' ? <CalendarOutlined /> : undefined}
                onClick={() => setDateRange(range)}
                style={{
                  background: isActive ? THEME.accent : 'transparent',
                  color: isActive ? '#fff' : THEME.textSecondary,
                  border: isActive ? 'none' : `1px solid ${THEME.cardBorder}`,
                  borderRadius: 6,
                  fontSize: 13,
                }}
              >
                {labels[range]}
              </Button>
            );
          })}
        </Space>
      </div>

      {/* ============================================================ */}
      {/*  Summary Stats Row                                            */}
      {/* ============================================================ */}
      <Row gutter={[16, 16]} style={{ marginBottom: 24 }}>
        {/* Total Trades */}
        <Col xs={24} sm={12} lg={6}>
          <Card style={cardStyle} bodyStyle={{ padding: 20 }}>
            <Statistic
              title={<span style={{ color: THEME.textSecondary, fontSize: 13 }}>总交易次数</span>}
              value={stats.totalTrades}
              prefix={<ThunderboltOutlined style={{ color: THEME.accent }} />}
              valueStyle={{ color: THEME.text, fontSize: 28, fontWeight: 700 }}
            />
          </Card>
        </Col>
        {/* Win Rate */}
        <Col xs={24} sm={12} lg={6}>
          <Card style={cardStyle} bodyStyle={{ padding: 20 }}>
            <Statistic
              title={<span style={{ color: THEME.textSecondary, fontSize: 13 }}>胜率</span>}
              value={stats.winRate}
              precision={1}
              suffix="%"
              prefix={<TrophyOutlined style={{ color: stats.winRate >= 50 ? THEME.down : THEME.up }} />}
              valueStyle={{
                color: stats.winRate >= 50 ? THEME.down : THEME.up,
                fontSize: 28,
                fontWeight: 700,
              }}
            />
          </Card>
        </Col>
        {/* Avg Return */}
        <Col xs={24} sm={12} lg={6}>
          <Card style={cardStyle} bodyStyle={{ padding: 20 }}>
            <Statistic
              title={<span style={{ color: THEME.textSecondary, fontSize: 13 }}>平均收益率</span>}
              value={stats.avgReturn}
              precision={2}
              suffix="%"
              prefix={
                stats.avgReturn >= 0 ? (
                  <RiseOutlined style={{ color: THEME.down }} />
                ) : (
                  <FallOutlined style={{ color: THEME.up }} />
                )
              }
              valueStyle={{
                color: stats.avgReturn >= 0 ? THEME.down : THEME.up,
                fontSize: 28,
                fontWeight: 700,
              }}
            />
          </Card>
        </Col>
        {/* Max Drawdown */}
        <Col xs={24} sm={12} lg={6}>
          <Card style={cardStyle} bodyStyle={{ padding: 20 }}>
            <Statistic
              title={<span style={{ color: THEME.textSecondary, fontSize: 13 }}>最大回撤</span>}
              value={stats.maxDrawdown}
              precision={2}
              suffix="%"
              prefix={<ArrowDownOutlined style={{ color: THEME.up }} />}
              valueStyle={{ color: THEME.up, fontSize: 28, fontWeight: 700 }}
            />
          </Card>
        </Col>
      </Row>

      {/* ============================================================ */}
      {/*  Trading Record Table                                         */}
      {/* ============================================================ */}
      <Card
        style={{ ...cardStyle, marginBottom: 24 }}
        bodyStyle={{ padding: 0 }}
        title={
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <LineChartOutlined style={{ color: THEME.accent }} />
            <Text style={{ color: THEME.text, fontSize: 16, fontWeight: 600 }}>
              交易记录
            </Text>
            <Tag
              style={{
                marginLeft: 8,
                background: 'rgba(59,130,246,0.15)',
                color: THEME.accent,
                border: 'none',
                borderRadius: 4,
              }}
            >
              共 {MOCK_TRADES.length} 笔
            </Tag>
          </div>
        }
      >
        <Table<TradeRecord>
          columns={columns}
          dataSource={MOCK_TRADES}
          pagination={false}
          onRow={(record) => ({
            onClick: () => handleRowClick(record),
            style: { cursor: 'pointer' },
            onMouseEnter: (e) => {
              (e.currentTarget as HTMLElement).style.background = 'rgba(59,130,246,0.06)';
            },
            onMouseLeave: (e) => {
              (e.currentTarget as HTMLElement).style.background = 'transparent';
            },
          })}
          size="middle"
          scroll={{ x: 930 }}
          style={{ background: 'transparent' }}
        />
      </Card>

      {/* ============================================================ */}
      {/*  Strategy Performance + AI Analysis  (two-col on desktop)     */}
      {/* ============================================================ */}
      <Row gutter={[16, 16]}>
        {/* Strategy Performance */}
        <Col xs={24} lg={14}>
          <Card style={{ ...cardStyle, height: '100%' }} bodyStyle={{ padding: 24 }}>
            <SectionTitle icon={<LineChartOutlined style={{ color: THEME.accent }} />}>
              策略回测 vs 买入持有
            </SectionTitle>

            {/* Bar chart */}
            <div style={{ marginBottom: 24 }}>
              {STRATEGY_PERFORMANCE.map((s) => (
                <div key={s.strategyName} style={{ marginBottom: 12 }}>
                  <StrategyBar
                    label={s.strategyName}
                    value={s.strategyReturn}
                    color={s.strategyReturn >= 0 ? THEME.accent : THEME.up}
                  />
                  <StrategyBar
                    label=""
                    value={s.buyHoldReturn}
                    color="rgba(224,224,224,0.15)"
                  />
                </div>
              ))}
            </div>

            {/* Legend */}
            <div style={{ display: 'flex', gap: 24, marginBottom: 20 }}>
              <Space size={6}>
                <div
                  style={{
                    width: 12,
                    height: 12,
                    borderRadius: 3,
                    background: THEME.accent,
                  }}
                />
                <Text style={{ color: THEME.textSecondary, fontSize: 12 }}>策略收益</Text>
              </Space>
              <Space size={6}>
                <div
                  style={{
                    width: 12,
                    height: 12,
                    borderRadius: 3,
                    background: 'rgba(224,224,224,0.15)',
                  }}
                />
                <Text style={{ color: THEME.textSecondary, fontSize: 12 }}>买入持有基准</Text>
              </Space>
            </div>

            {/* Key Metrics */}
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(3, 1fr)',
                gap: 12,
              }}
            >
              {[
                { label: 'Alpha', value: '+3.8%', desc: '超额收益' },
                { label: 'Sharpe', value: '1.25', desc: '夏普比率' },
                { label: '盈亏比', value: '2.1:1', desc: '胜率×赔率' },
              ].map((m) => (
                <div
                  key={m.label}
                  style={{
                    background: 'rgba(59,130,246,0.08)',
                    borderRadius: 8,
                    padding: '12px 14px',
                    textAlign: 'center',
                  }}
                >
                  <Text style={{ color: THEME.textSecondary, fontSize: 11, display: 'block' }}>
                    {m.label}
                  </Text>
                  <Text style={{ color: THEME.accent, fontSize: 20, fontWeight: 700, display: 'block' }}>
                    {m.value}
                  </Text>
                  <Text style={{ color: THEME.textSecondary, fontSize: 10, display: 'block' }}>
                    {m.desc}
                  </Text>
                </div>
              ))}
            </div>
          </Card>
        </Col>

        {/* AI Analysis + Quick Backtest */}
        <Col xs={24} lg={10}>
          {/* AI Behavior Analysis */}
          <Card
            style={{ ...cardStyle, marginBottom: 16 }}
            bodyStyle={{ padding: 24 }}
          >
            <SectionTitle icon={<RobotOutlined style={{ color: THEME.accent }} />}>
              AI 交易行为分析
            </SectionTitle>
            <div
              style={{
                background: 'rgba(59,130,246,0.06)',
                borderRadius: 8,
                padding: 20,
                marginBottom: 16,
                border: '1px solid rgba(59,130,246,0.15)',
              }}
            >
              <Paragraph style={{ color: THEME.textSecondary, fontSize: 13, margin: 0, lineHeight: 1.8 }}>
                基于您的交易记录，AI 将分析您的交易习惯、偏好和改进空间。包括：
              </Paragraph>
              <ul
                style={{
                  color: THEME.textSecondary,
                  fontSize: 13,
                  margin: '12px 0 0 16px',
                  lineHeight: 2,
                }}
              >
                <li>交易频率与时机偏好</li>
                <li>止损/止盈行为模式</li>
                <li>持仓周期分布</li>
                <li>策略使用偏好分析</li>
                <li>风险暴露评估</li>
              </ul>
            </div>
            <Button
              type="primary"
              icon={<RobotOutlined />}
              block
              style={{
                background: THEME.accent,
                borderColor: THEME.accent,
                borderRadius: 8,
                height: 42,
                fontWeight: 600,
              }}
              onClick={handleAiAnalysis}
              loading={aiAnalysisLoading}
            >
              {aiAnalysisLoading ? '分析中...' : '开始分析'}
            </Button>
            {aiAnalysis && (
              <div
                style={{
                  marginTop: 16,
                  padding: 16,
                  background: 'rgba(15,23,42,0.5)',
                  borderRadius: 8,
                  border: `1px solid ${THEME.cardBorder}`,
                  color: THEME.text,
                  fontSize: 13,
                  lineHeight: 1.8,
                  whiteSpace: 'pre-wrap',
                }}
              >
                {aiAnalysis}
              </div>
            )}
          </Card>

          {/* Quick Backtest Entry */}
          <Card
            style={cardStyle}
            bodyStyle={{ padding: 24 }}
          >
            <SectionTitle icon={<ThunderboltOutlined style={{ color: THEME.accent }} />}>
              快速回测
            </SectionTitle>
            <Paragraph style={{ color: THEME.textSecondary, fontSize: 13, marginBottom: 16 }}>
              选择个股，回测不同策略的历史表现，找到最适合的交易模式。
            </Paragraph>
            <Button
              type="primary"
              icon={<LineChartOutlined />}
              block
              size="large"
              style={{
                background: `linear-gradient(135deg, ${THEME.accent}, #6366f1)`,
                border: 'none',
                borderRadius: 8,
                height: 48,
                fontWeight: 600,
                fontSize: 15,
              }}
              onClick={() => navigate('/backtest')}
            >
              进入回测中心
            </Button>
            <div
              style={{
                marginTop: 12,
                display: 'flex',
                justifyContent: 'center',
                gap: 16,
              }}
            >
              {['策略回测', '参数优化', '组合回测'].map((label) => (
                <Text
                  key={label}
                  style={{
                    color: THEME.textSecondary,
                    fontSize: 12,
                    display: 'flex',
                    alignItems: 'center',
                    gap: 4,
                  }}
                >
                  <span style={{ color: THEME.accent, fontSize: 10 }}>●</span>
                  {label}
                </Text>
              ))}
            </div>
          </Card>
        </Col>
      </Row>
    </div>
  );
};

export default ReviewPage;
