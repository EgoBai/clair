/**
 * 策略回测仪表盘 v2 📊
 * 支持多策略选择 + 参数配置 + 深色主题
 */

import React, { useState } from 'react';
import { 
  Input, Button, Card, Tag, Typography, Table, 
  Select, Tooltip, message, Row, Col, Statistic, DatePicker, Alert
} from 'antd';
import dayjs, { type Dayjs } from 'dayjs';
import { LoadingState, EmptyState } from '../components/Common/StateComponents';
import { 
  SearchOutlined, TrophyOutlined,
  LineChartOutlined, ThunderboltOutlined,
  FundOutlined, BarChartOutlined, CalendarOutlined
} from '@ant-design/icons';
import { apiFetch } from '../utils/api';
import { useGamificationStore } from '../store/useGamificationStore';
// RangePicker 弹层（portal 到 body）的暗色适配，避免在深色页面弹出白底日历
import '../styles/antd-picker-dark.css';

const { Title, Text } = Typography;
const { Option } = Select;
const { RangePicker } = DatePicker;

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
// id 必须落在后端 backtestRunSchema.strategy 的枚举内
// （ma_cross / rsi_reversal / macd_trend / breakout / custom），
// 后端 backtest-routes.ts 的 STRATEGY_ALIAS 再映射到引擎的 StrategyType。
const STRATEGIES = [
  { id: 'ma_cross', name: '均线交叉', icon: <LineChartOutlined />, description: 'MA5/MA20金叉死叉', color: '#3b82f6' },
  { id: 'rsi_reversal', name: 'RSI策略', icon: <FundOutlined />, description: '超买超卖反转', color: '#8b5cf6' },
  { id: 'macd_trend', name: 'MACD策略', icon: <BarChartOutlined />, description: 'MACD金叉死叉', color: '#f59e0b' },
  { id: 'breakout', name: '布林带策略', icon: <ThunderboltOutlined />, description: '布林带突破', color: '#22c55e' },
];

// 回测区间约束 — 与后端 backtest-routes.ts 保持一致
const MIN_RANGE_DAYS = 30;   // 少于 30 个自然日覆盖不到 20 个交易日
const MAX_RANGE_DAYS = 3650; // 单次最多 10 年

/** 快捷区间：降低手动选日期的操作成本 */
const RANGE_PRESETS: { label: string; value: [Dayjs, Dayjs] }[] = [
  { label: '近1月', value: [dayjs().subtract(1, 'month'), dayjs()] },
  { label: '近3月', value: [dayjs().subtract(3, 'month'), dayjs()] },
  { label: '近1年', value: [dayjs().subtract(1, 'year'), dayjs()] },
  { label: '今年以来', value: [dayjs().startOf('year'), dayjs()] },
];

/** 默认区间：近 1 年 */
const DEFAULT_RANGE: [Dayjs, Dayjs] = [dayjs().subtract(1, 'year'), dayjs()];

export interface BacktestResult {
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
  const [dateRange, setDateRange] = useState<[Dayjs, Dayjs]>(DEFAULT_RANGE);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<BacktestResult | null>(null);
  const [error, setError] = useState('');
  const [isDemo, setIsDemo] = useState(false);

  /**
   * 区间前置校验 — 返回错误文案，null 表示通过。
   * 与后端 backtest-routes.ts 的规则一致，前端先拦一道减少无效请求。
   */
  const validateRange = (range: [Dayjs, Dayjs] | null): string | null => {
    if (!range || !range[0] || !range[1]) return '请选择回测区间';
    const [start, end] = range;
    if (start.isAfter(end, 'day')) {
      return `起始日期（${start.format('YYYY-MM-DD')}）不能晚于结束日期（${end.format('YYYY-MM-DD')}）`;
    }
    const today = dayjs();
    if (end.isAfter(today, 'day')) {
      return `结束日期（${end.format('YYYY-MM-DD')}）不能晚于今天，回测只能基于已发生的历史行情`;
    }
    const span = end.diff(start, 'day');
    if (span < MIN_RANGE_DAYS) {
      return `回测区间过短（${span} 天），至少需要 ${MIN_RANGE_DAYS} 个自然日才能覆盖 20 个交易日`;
    }
    if (span > MAX_RANGE_DAYS) {
      return `回测区间过长（${span} 天），单次最多支持 ${MAX_RANGE_DAYS} 天（约 10 年）`;
    }
    return null;
  };

  // 区间是否合法（用于禁用「开始回测」并给出即时提示）
  const rangeError = validateRange(dateRange);

  const runBacktest = async () => {
    if (!symbol.trim()) {
      message.warning('请输入股票代码');
      return;
    }
    const invalid = validateRange(dateRange);
    if (invalid) {
      setError(invalid);
      message.warning(invalid);
      return;
    }

    setLoading(true);
    setError('');
    const startDate = dateRange[0].format('YYYY-MM-DD');
    const endDate = dateRange[1].format('YYYY-MM-DD');

    try {
      const resp = await apiFetch('/api/backtest/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          symbol: symbol.trim(),
          strategy: strategy,
          startDate,
          endDate,
        })
      });
      const data = await resp.json();

      if (data.success && data.data) {
        setResult(data.data);
        setIsDemo(false);
        return;
      }

      // 后端明确拒绝（区间无效 / 数据不足 / 参数非法）→ 如实展示原因，
      // 不用演示数据掩盖，否则用户会误以为回测成功。
      const reason = data.details || data.error || '回测失败';
      setResult(null);
      setIsDemo(false);
      setError(reason);
      message.error(reason);
    } catch (e) {
      // 网络层失败（后端未启动）→ 如实置空，绝不回填演示数据
      setResult(null);
      setIsDemo(false);
      setError('回测服务暂不可用（后端未就绪或网络异常），请稍后重试');
      message.error('回测服务暂不可用');
      console.error('回测请求失败:', e);
    } finally {
      setLoading(false);
      // 游戏化埋点：运行回测事件（backtest_run）
      useGamificationStore.getState().track('backtest_run');
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
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 12 }}>
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
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
            <Input
              placeholder="输入股票代码（如：600519）"
              value={symbol}
              onChange={e => setSymbol(e.target.value)}
              onPressEnter={runBacktest}
              style={{ 
                flex: '1 1 200px',
                minWidth: 0,
                background: BG, 
                border: `1px solid ${BORDER}`,
                color: TEXT 
              }}
              prefix={<SearchOutlined style={{ color: TEXT_SEC }} />}
            />
            <RangePicker
              value={dateRange}
              onChange={(v) => {
                if (v && v[0] && v[1]) {
                  setDateRange([v[0], v[1]]);
                  setError('');
                }
              }}
              allowClear={false}
              presets={RANGE_PRESETS}
              // 未来日期不可选：回测只能基于已发生的行情
              disabledDate={(d) => !!d && d.isAfter(dayjs(), 'day')}
              format="YYYY-MM-DD"
              suffixIcon={<CalendarOutlined style={{ color: TEXT_SEC }} />}
              // 弹层挂到页面容器内，配合 antd-picker-dark.css 确保暗色生效
              popupClassName="clair-dark-picker"
              style={{ flex: '0 1 280px', background: BG, borderColor: BORDER }}
            />
            <Button 
              type="primary" 
              onClick={runBacktest} 
              loading={loading} 
              disabled={!!rangeError}
              icon={<SearchOutlined />}
              style={{ background: rangeError ? undefined : currentStrategy?.color }}
            >
              开始回测
            </Button>
          </div>

          {/* 区间说明 / 即时校验反馈 */}
          <div style={{ marginTop: 10 }}>
            {rangeError ? (
              <Alert type="warning" showIcon message={rangeError} style={{ background: 'transparent', border: `1px solid ${BORDER}` }} />
            ) : (
              <Text style={{ color: TEXT_SEC, fontSize: 12 }}>
                回测区间：{dateRange[0].format('YYYY-MM-DD')} 至 {dateRange[1].format('YYYY-MM-DD')}
                （共 {dateRange[1].diff(dateRange[0], 'day')} 个自然日）
                · 支持 {MIN_RANGE_DAYS}~{MAX_RANGE_DAYS} 天
              </Text>
            )}
          </div>
        </Card>

        {/* 加载状态 */}
        {loading && (
          <div style={{ textAlign: 'center', padding: 60 }}>
            <LoadingState />
            <div style={{ color: TEXT_SEC, marginTop: 16 }}>正在执行回测分析...</div>
          </div>
        )}

        {/* 错误信息 — 如实展示后端拒绝原因（区间过短/无数据等），不静默兜底 */}
        {error && !loading && (
          <Alert
            type="error"
            showIcon
            message="回测未能执行"
            description={
              <div style={{ color: TEXT_SEC }}>
                <div style={{ marginBottom: 6 }}>{error}</div>
                <div style={{ fontSize: 12 }}>可尝试：扩大回测区间、更换股票代码，或选择上方的快捷区间。</div>
              </div>
            }
            style={{ background: CARD_BG, border: `1px solid ${BORDER}`, marginBottom: 16 }}
          />
        )}

        {/* 回测结果 */}
        {result && !loading && (
          <>
            {/* 策略信息 */}
            <Card 
              title={
                <span style={{ color: TEXT }}>
                  {currentStrategy?.icon} {currentStrategy?.name} - {result.symbol}
                  {isDemo && <Tag color="gold" style={{ marginLeft: 8 }}>演示数据</Tag>}
                </span>
              }
              style={{ background: CARD_BG, border: `1px solid ${BORDER}`, marginBottom: 16 }}
              bodyStyle={{ padding: '16px' }}
            >
              <div style={{ color: TEXT_SEC, fontSize: 13 }}>
                回测区间: {result.startDate} 至 {result.endDate} | 共 {result.totalDays} 个交易日
              </div>
              {isDemo && (
                <div style={{ color: GOLD, fontSize: 12, marginTop: 6 }}>
                  ⚠️ 当前为演示数据，区间由演示生成器内置，与上方所选的
                  {dateRange[0].format('YYYY-MM-DD')} ~ {dateRange[1].format('YYYY-MM-DD')} 无关。
                </div>
              )}
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
                <EmptyState title="暂无权益数据" />
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
