// 策略回测相关类型定义（leaf 模块：不依赖 components / pages / utils）
//
// BacktestResult 原定义在 pages/BacktestPage.tsx，
// 因 utils/backtestDemo.ts 需要复用该返回类型而产生 utils -> pages 越层 import，
// 故搬迁至此层。原文件保留 re-export 以兼容既有消费方。

/** 策略回测结果（字段与后端 /api/backtest/run 返回契约一致） */
export interface BacktestResult {
  strategy: string;
  symbol: string;
  startDate: string;
  endDate: string;
  totalDays: number;
  initialCapital: number;
  finalValue: number;
  totalReturn: number;
  // 以下三项在数学上可能无定义（无交易 / 收益无波动 / 区间过短），
  // 后端如实返回 null，前端显示「—」，不用 0 冒充
  annualizedReturn: number | null;
  benchmarkReturn: number | null;
  maxDrawdown: number;
  sharpeRatio: number | null;
  winRate: number;
  totalTrades: number;
  winningTrades: number;
  losingTrades: number;
  profitFactor: number | null;
  name?: string;
  note?: string | null;
  warnings?: string[];
  source?: string;
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
