/**
 * 回测页确定性演示数据兜底
 *
 * 背景：本项目后端 /api/backtest/run 缺失（技术债 T6），统一用「确定性 LCG
 * 演示数据兜底」让页面无后端也能出完整结果。沿用 reportDemoData.ts 的
 * createLCG / mapRange / round2 模式，基种子 20260725，并以 symbol+strategy
 * 参与种子，保证不同股票/策略结果不同但可复现。
 *
 * 颜色约定：涨红跌绿（中国习惯），页面用 THEME.up/THEME.down，本文件不碰 UI。
 */
import type { BacktestResult } from '../pages/BacktestPage';

const BASE_SEED = 20260725;

/** 线性同余发生器（LCG）：给定种子返回 [0,1) 的确定性序列 */
function createLCG(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 0xffffffff;
  };
}

/** 将 [0,1) 映射到 [min,max] */
function mapRange(r: number, min: number, max: number): number {
  return min + r * (max - min);
}
const round2 = (x: number): number => Number(x.toFixed(2));

/** 把字符串混入种子（避免 symbol/strategy 同种子） */
function hashStr(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = (Math.imul(h, 31) + s.charCodeAt(i)) >>> 0;
  }
  return h;
}

function dateStr(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** 在 [start,end] 内取 n 个交易日（跳过周末，不足则向后补） */
function tradingDates(start: Date, end: Date, n: number): string[] {
  const dates: string[] = [];
  const d = new Date(start);
  while (d <= end && dates.length < n) {
    const day = d.getDay();
    if (day !== 0 && day !== 6) dates.push(dateStr(d));
    d.setDate(d.getDate() + 1);
  }
  while (dates.length < n) {
    const last = new Date(dates[dates.length - 1] || start);
    do { last.setDate(last.getDate() + 1); } while (last.getDay() === 0 || last.getDay() === 6);
    dates.push(dateStr(last));
  }
  return dates;
}

const BUY_REASONS = ['金叉信号触发', 'RSI 超卖反弹', 'MACD 红柱放大', '布林带下轨支撑', '放量突破前高'];
const SELL_REASONS = ['死叉信号出现', 'RSI 超买回落', 'MACD 顶背离', '触及止盈位', '跌破止损线'];

/**
 * 生成确定性的回测演示结果。相同 (symbol, strategy) 永远得到相同输出。
 */
export function generateBacktestDemo(symbol: string, strategy: string): BacktestResult {
  const seed = (BASE_SEED ^ hashStr(symbol) ^ hashStr(strategy)) >>> 0;
  const rng = createLCG(seed);

  const initialCapital = 100000;
  const n = 250;
  const today = new Date();
  const start = new Date(today);
  start.setDate(start.getDate() - 360);
  const dates = tradingDates(start, today, n);
  const startDate = dates[0];
  const endDate = dates[dates.length - 1];
  const totalDays = dates.length;

  // 权益曲线：带轻微上升漂移的随机游走
  const mu = mapRange(rng(), -0.0008, 0.0020);
  const vol = mapRange(rng(), 0.012, 0.025);
  const equityCurve: Array<{ date: string; value: number }> = [];
  let value = initialCapital;
  for (let i = 0; i < n; i++) {
    const r = mu + (rng() - 0.5) * 2 * vol;
    value = value * (1 + r);
    equityCurve.push({ date: dates[i], value: round2(value) });
  }
  const finalValue = round2(value);
  const totalReturn = round2((finalValue / initialCapital - 1) * 100);
  const annualizedReturn = round2((Math.pow(finalValue / initialCapital, 252 / totalDays) - 1) * 100);

  // 最大回撤 & 回撤曲线
  let peak = equityCurve[0].value;
  let maxDD = 0;
  const drawdownCurve: Array<{ date: string; drawdown: number }> = [];
  for (const p of equityCurve) {
    if (p.value > peak) peak = p.value;
    const dd = (peak - p.value) / peak;
    if (dd > maxDD) maxDD = dd;
    drawdownCurve.push({ date: p.date, drawdown: round2(dd * 100) });
  }
  const maxDrawdown = round2(maxDD * 100);

  // 夏普比率（由日收益推导，并收敛到合理区间 -0.5~2.5）
  const rets: number[] = [];
  for (let i = 1; i < equityCurve.length; i++) {
    rets.push(equityCurve[i].value / equityCurve[i - 1].value - 1);
  }
  const mean = rets.reduce((a, b) => a + b, 0) / rets.length;
  const variance = rets.reduce((a, b) => a + (b - mean) ** 2, 0) / rets.length;
  const std = Math.sqrt(variance) || 1e-9;
  let sharpe = (mean / std) * Math.sqrt(252);
  sharpe = round2(Math.max(-0.5, Math.min(2.5, sharpe)));

  // 交易记录：15-40 笔买卖对（每对 1 买 1 卖）
  const numPairs = Math.floor(mapRange(rng(), 15, 41));
  const basePrice = mapRange(rng(), 8, 480);
  const trades: BacktestResult['trades'] = [];
  let grossProfit = 0;
  let grossLoss = 0;
  let winningTrades = 0;
  for (let k = 0; k < numPairs; k++) {
    const idx = Math.floor(mapRange(rng(), 0, n - 1));
    const buyDate = dates[idx];
    const buyPrice = round2(basePrice * mapRange(rng(), 0.9, 1.05));
    const qty = Math.max(100, Math.round((initialCapital * mapRange(rng(), 0.05, 0.15)) / buyPrice / 100) * 100);
    const sellIdx = Math.min(n - 1, idx + Math.floor(mapRange(rng(), 3, 30)));
    const sellDate = dates[sellIdx];
    const sellPrice = round2(buyPrice * (1 + mapRange(rng(), -0.14, 0.16)));
    const pnl = (sellPrice - buyPrice) * qty;
    if (pnl >= 0) { winningTrades++; grossProfit += pnl; } else { grossLoss += -pnl; }
    trades.push({
      date: buyDate, type: 'buy', price: buyPrice, quantity: qty,
      amount: round2(buyPrice * qty), reason: BUY_REASONS[Math.floor(rng() * BUY_REASONS.length)],
    });
    trades.push({
      date: sellDate, type: 'sell', price: sellPrice, quantity: qty,
      amount: round2(sellPrice * qty), reason: SELL_REASONS[Math.floor(rng() * SELL_REASONS.length)],
    });
  }
  const totalTrades = numPairs;
  const losingTrades = numPairs - winningTrades;
  const winRate = round2(winningTrades / numPairs * 100);
  const profitFactor = round2(grossLoss === 0 ? (grossProfit > 0 ? 9.99 : 1) : grossProfit / grossLoss);
  const benchmarkReturn = round2(mapRange(rng(), -10, 25));

  return {
    strategy, symbol, startDate, endDate, totalDays,
    initialCapital, finalValue, totalReturn, annualizedReturn,
    benchmarkReturn, maxDrawdown, sharpeRatio: sharpe,
    winRate, totalTrades, winningTrades, losingTrades, profitFactor,
    trades, equityCurve, drawdownCurve,
  };
}
