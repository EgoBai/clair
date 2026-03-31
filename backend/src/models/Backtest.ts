/**
 * 回测数据模型
 * 定义策略回测相关的数据结构
 */

export interface BacktestStrategy {
  id: number;
  userId: number;
  name: string;
  description?: string;
  type: StrategyType;
  parameters: StrategyParameters;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export type StrategyType = 
  | 'momentum'      // 动量策略
  | 'mean_reversion'// 均值回归
  | 'value'         // 价值策略
  | 'growth'        // 成长策略
  | 'trend_following' // 趋势跟踪
  | 'breakout'      // 突破策略
  | 'custom';       // 自定义

export interface StrategyParameters {
  holdingPeriod?: number;    // 持仓周期
  stopLoss?: number;         // 止损比例
  takeProfit?: number;       // 止盈比例
  maxPositions?: number;     // 最大持仓数
  rebalanceFrequency?: 'daily' | 'weekly' | 'monthly';
  filters?: StrategyFilter[];
  signals?: StrategySignal[];
}

export interface StrategyFilter {
  field: string;
  operator: '>' | '<' | '>=' | '<=' | '==' | 'in' | 'between';
  value: number | string | number[];
}

export interface StrategySignal {
  indicator: string;
  condition: 'cross_above' | 'cross_below' | 'above' | 'below';
  threshold?: number;
  lookback?: number;
}

export interface BacktestRun {
  id: number;
  strategyId: number;
  startDate: Date;
  endDate: Date;
  initialCapital: number;
  commission: number;        // 手续费率
  slippage: number;          // 滑点
  status: BacktestStatus;
  startedAt?: Date;
  completedAt?: Date;
  createdAt: Date;
}

export type BacktestStatus = 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';

export interface BacktestResult {
  id: number;
  runId: number;
  totalReturn: number;       // 总收益率
  annualizedReturn: number;  // 年化收益率
  benchmarkReturn: number;   // 基准收益率
  excessReturn: number;      // 超额收益
  sharpeRatio: number;       // 夏普比率
  sortinoRatio: number;      // 索提诺比率
  maxDrawdown: number;       // 最大回撤
  maxDrawdownDuration: number; // 最大回撤持续天数
  volatility: number;        // 波动率
  winRate: number;           // 胜率
  profitLossRatio: number;   // 盈亏比
  totalTrades: number;       // 总交易次数
  avgHoldingPeriod: number;  // 平均持仓周期
  turnoverRate: number;      // 换手率
  alpha: number;             // Alpha
  beta: number;              // Beta
  informationRatio: number;  // 信息比率
  calmarRatio: number;       // 卡尔玛比率
  createdAt: Date;
}

export interface BacktestTrade {
  id: number;
  runId: number;
  stockId: number;
  stockSymbol: string;
  direction: 'long' | 'short';
  entryDate: Date;
  entryPrice: number;
  exitDate?: Date;
  exitPrice?: number;
  quantity: number;
  pnl?: number;
  pnlPercent?: number;
  holdingDays?: number;
  exitReason?: 'stop_loss' | 'take_profit' | 'signal' | 'period_end';
  createdAt: Date;
}

export interface BacktestEquity {
  id: number;
  runId: number;
  date: Date;
  equity: number;            // 账户净值
  cash: number;              // 现金
  positionValue: number;     // 持仓市值
  benchmarkValue: number;    // 基准净值
  drawdown: number;          // 当前回撤
  createdAt: Date;
}

export interface BacktestReport {
  strategy: BacktestStrategy;
  run: BacktestRun;
  result: BacktestResult;
  trades: BacktestTrade[];
  equityCurve: BacktestEquity[];
  monthlyReturns: MonthlyReturn[];
  yearlyReturns: YearlyReturn[];
}

export interface MonthlyReturn {
  year: number;
  month: number;
  return: number;
}

export interface YearlyReturn {
  year: number;
  return: number;
  benchmark: number;
  excess: number;
}

// 验证函数
export function validateStrategyType(type: string): type is StrategyType {
  return ['momentum', 'mean_reversion', 'value', 'growth', 'trend_following', 'breakout', 'custom'].includes(type);
}

export function validateBacktestPeriod(start: Date, end: Date): boolean {
  return start < end && end <= new Date();
}

export function calculateSharpeRatio(
  returns: number[],
  riskFreeRate: number = 0.03
): number {
  if (returns.length < 2) return 0;
  const avgReturn = returns.reduce((a, b) => a + b, 0) / returns.length;
  const variance = returns.reduce((sum, r) => sum + Math.pow(r - avgReturn, 2), 0) / (returns.length - 1);
  const stdDev = Math.sqrt(variance);
  if (stdDev === 0) return 0;
  return (avgReturn * 252 - riskFreeRate) / (stdDev * Math.sqrt(252));
}

export function calculateMaxDrawdown(equityCurve: number[]): number {
  if (equityCurve.length === 0) return 0;
  let maxEquity = equityCurve[0];
  let maxDrawdown = 0;
  for (const equity of equityCurve) {
    if (equity > maxEquity) maxEquity = equity;
    const drawdown = (maxEquity - equity) / maxEquity;
    if (drawdown > maxDrawdown) maxDrawdown = drawdown;
  }
  return maxDrawdown;
}
