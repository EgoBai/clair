import { describe, it, expect } from 'vitest';
import { calcMA, zScore } from '../utils/futureValueUtils';
import { calculateMaxDrawdown, calculateSharpeRatio } from '../models/Backtest';

/**
 * 量化策略引擎测试
 *
 * 一、绑定真源
 * - calcMA ← backend/src/utils/futureValueUtils.ts:39（返回 (number|null)[]，前 period-1 位为 null，滑动窗口均值不额外舍入）
 * - zScore ← backend/src/utils/futureValueUtils.ts:19（std === 0 时返回 0，不再除以兜底 1）
 * - calculateMaxDrawdown ← backend/src/models/Backtest.ts:164（价格序列口径：空数组返回 0，逐点 (峰值-当前)/峰值 取最大）
 * - calculateSharpeRatio ← backend/src/models/Backtest.ts:152（样本方差 n-1；年化式 (avg*252 - rf)/(std*sqrt(252))；length<2 直接返回 0）
 *
 * 二、旧断言订正
 * - 夏普公式：旧内联 calcSharpe 用总体方差（除以 n）且为 (avg - rf/252)/std*sqrt(252)；生产用样本方差（n-1）且为 (avg*252 - rf)/(std*sqrt(252))。本组 10 条均为关系/有限性断言，生产值仍满足：252 个 0.001 → 2.145e16；252 个 -0.001 → -2.7e16；100 个 0 → 0；确定性序列 0.001+sin(i*0.7)*0.005 → 3.946068。
 * - '应该年化夏普比率' 的随机夹具（252 个 0.001±0.005 抖动）替换为确定性序列 0.001 + Math.sin(i * 0.7) * 0.005，|sharpe| > 0 仍成立。
 * - 均值回归 z：旧内联 z = (price - mean) / (std || 1)，std = 0 时给出 -50 / +100 量级伪 z；'快速反弹' 旧夹具 [100×5, 50×10, 150×5] + period 5 正是靠 std=0 的伪 z 成交（旧值 z=-50 买入、z=+100 卖出），生产 zScore 在 std === 0 时返回 0，该夹具变为 0 笔。夹具改为 [10×100, 40, 40, 200] + period 10：i=11 当前 40 对比前 10 根（9×100+40）z=-3 买入，i=12 当前 200 对比（8×100+40+40）z=4.67 卖出；断言 sells.length > 0 不变。
 * - '应该正确计算z-score触发点' 去掉零断言 if 守卫：生产 zScore 下 [20×100, 50, 50, 50] + period 10 在 i=21 产生 1 笔 buy@50，补 expect(trades.length).toBeGreaterThan(0) 后 price<100 断言必执行。
 * - '不同lookback应该影响触发时点' 去掉零断言 if 守卫：原夹具 lb=3 时动量恒约 3%（低于 5% 买入阈值）为 0 笔、lb=10 时 2 笔（首笔 i=10）；改用 lb=10 与 lb=20（同一夹具，首笔分别为 i=10、i=20），补两条 length>0 前置后比较触发时点。
 * - '应该正确记录交易价格' 原夹具 100+i（日涨幅约 1%，低于 5% 买入阈值）下 trades 为空、for-of 断言零执行；夹具改为 100+i*10（i=5 起涨幅 50% 触发买入），补 length>0 前置后 price/qty 断言必执行。
 * - '应该始终买入在卖出之前'、'交易金额应该为正数'、'买卖应该交替出现' 的 for-of 断言补非空前置，确保每条断言实际执行。
 *
 * 三、未迁移·生产缺口
 * - momentumStrategy / meanReversionStrategy / dualMAStrategy 的信号生成逻辑：生产仓无同契约导出（rotationEngine.momentumRotation 入参是资产收益面板；models/Backtest.ts:145 的 'mean_reversion' 仅为策略类型枚举；utils/backtestEngine.ts 的 ma_cross 在 runBacktest 内部、入参为 KLineData/StrategyParams），保留内联。
 * - Trade / BacktestResult 接口仅为测试夹具，保留内联。
 */

interface Trade { date: string; type: 'buy' | 'sell'; price: number; qty: number; }
interface BacktestResult { trades: Trade[]; totalReturn: number; maxDrawdown: number; sharpeRatio: number; winRate: number; }

const momentumStrategy = (prices: number[], lookback: number = 20): Trade[] => {
  const trades: Trade[] = [];
  let position = 0;
  for (let i = lookback; i < prices.length; i++) {
    const momentum = (prices[i] - prices[i - lookback]) / prices[i - lookback];
    if (momentum > 0.05 && position === 0) {
      trades.push({ date: String(i), type: 'buy', price: prices[i], qty: 100 });
      position = 100;
    } else if (momentum < -0.03 && position > 0) {
      trades.push({ date: String(i), type: 'sell', price: prices[i], qty: position });
      position = 0;
    }
  }
  return trades;
};

const meanReversionStrategy = (prices: number[], period: number = 20): Trade[] => {
  const trades: Trade[] = [];
  let position = 0;
  for (let i = period; i < prices.length; i++) {
    const window = prices.slice(i - period, i);
    const mean = window.reduce((a, b) => a + b, 0) / period;
    const std = Math.sqrt(window.reduce((a, b) => a + (b - mean) ** 2, 0) / period);
    const z = zScore(prices[i], mean, std);
    if (z < -2 && position === 0) {
      trades.push({ date: String(i), type: 'buy', price: prices[i], qty: 100 });
      position = 100;
    } else if (z > 2 && position > 0) {
      trades.push({ date: String(i), type: 'sell', price: prices[i], qty: position });
      position = 0;
    }
  }
  return trades;
};

const dualMAStrategy = (prices: number[], fast: number = 5, slow: number = 20): Trade[] => {
  const trades: Trade[] = [];
  let position = 0;
  const fastMA = calcMA(prices, fast);
  const slowMA = calcMA(prices, slow);
  for (let i = slow; i < prices.length; i++) {
    const fastNow = fastMA[i] as number;
    const slowNow = slowMA[i] as number;
    const fastPrev = fastMA[i - 1] as number;
    const slowPrev = slowMA[i - 1] as number;
    if (fastPrev <= slowPrev && fastNow > slowNow && position === 0) {
      trades.push({ date: String(i), type: 'buy', price: prices[i], qty: 100 });
      position = 100;
    } else if (fastPrev >= slowPrev && fastNow < slowNow && position > 0) {
      trades.push({ date: String(i), type: 'sell', price: prices[i], qty: position });
      position = 0;
    }
  }
  return trades;
};

describe('量化策略引擎', () => {
  describe('动量策略', () => {
    it('应该在上升趋势中产生买入信号', () => {
      const prices = Array.from({ length: 50 }, (_, i) => 100 + i * 1);
      const trades = momentumStrategy(prices, 10);
      expect(trades.length).toBeGreaterThan(0);
      expect(trades[0].type).toBe('buy');
    });

    it('应该在下跌趋势中产生卖出信号', () => {
      const prices = [100, 102, 105, 108, 110, 112, 115, 118, 120, 122, 125, 120, 115, 110, 105, 100, 95, 90, 85, 80, 75, 70];
      const trades = momentumStrategy(prices, 5);
      const sells = trades.filter(t => t.type === 'sell');
      expect(sells.length).toBeGreaterThan(0);
    });

    it('应该使用正确的回看周期', () => {
      const prices = Array.from({ length: 100 }, (_, i) => 100 + Math.sin(i / 5) * 10);
      const trades5 = momentumStrategy(prices, 5);
      const trades20 = momentumStrategy(prices, 20);
      expect(trades5.length).not.toBe(trades20.length);
    });

    it('空数组应该返回空交易', () => {
      expect(momentumStrategy([], 10)).toEqual([]);
    });

    it('价格不变应该不产生交易', () => {
      const prices = Array(30).fill(100);
      expect(momentumStrategy(prices, 10)).toEqual([]);
    });

    it('应该正确记录交易价格', () => {
      const prices = Array.from({ length: 30 }, (_, i) => 100 + i * 10);
      const trades = momentumStrategy(prices, 5);
      expect(trades.length).toBeGreaterThan(0);
      for (const t of trades) {
        expect(t.price).toBeGreaterThan(0);
        expect(t.qty).toBeGreaterThan(0);
      }
    });

    it('应该始终买入在卖出之前', () => {
      const prices = Array.from({ length: 60 }, (_, i) => 100 + Math.sin(i / 3) * 20);
      const trades = momentumStrategy(prices, 5);
      expect(trades.length).toBeGreaterThan(0);
      let hadBuy = false;
      for (const t of trades) {
        if (t.type === 'buy') hadBuy = true;
        if (t.type === 'sell') expect(hadBuy).toBe(true);
      }
    });

    it('波动行情应该产生多次交易', () => {
      const prices = Array.from({ length: 100 }, (_, i) => 100 + (i % 10 < 5 ? i % 10 : 10 - i % 10) * 5);
      const trades = momentumStrategy(prices, 3);
      expect(trades.length).toBeGreaterThan(2);
    });

    it('单边上涨应该只有买入', () => {
      const prices = Array.from({ length: 50 }, (_, i) => 100 + i * 2);
      const trades = momentumStrategy(prices, 10);
      const buys = trades.filter(t => t.type === 'buy');
      const sells = trades.filter(t => t.type === 'sell');
      expect(buys.length).toBeGreaterThanOrEqual(sells.length);
    });

    it('不同lookback应该影响触发时点', () => {
      const prices = Array.from({ length: 60 }, (_, i) => i < 30 ? 100 + i : 130 - (i - 30));
      const t10 = momentumStrategy(prices, 10);
      const t20 = momentumStrategy(prices, 20);
      expect(t10.length).toBeGreaterThan(0);
      expect(t20.length).toBeGreaterThan(0);
      expect(parseInt(t10[0].date)).not.toBe(parseInt(t20[0].date));
    });
  });

  describe('均值回归策略', () => {
    it('应该在价格低于均值2个标准差时买入', () => {
      const prices = [100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 80, 80, 80, 80, 80, 80, 80, 80, 80, 80, 60];
      const trades = meanReversionStrategy(prices, 10);
      expect(trades.some(t => t.type === 'buy')).toBe(true);
    });

    it('稳定价格不应触发交易', () => {
      const prices = Array(30).fill(100);
      expect(meanReversionStrategy(prices, 10)).toEqual([]);
    });

    it('应该正确计算z-score触发点', () => {
      const prices = Array.from({ length: 20 }, () => 100).concat([50, 50, 50]);
      const trades = meanReversionStrategy(prices, 10);
      expect(trades.length).toBeGreaterThan(0);
      expect(trades[0].price).toBeLessThan(100);
    });

    it('零标准差时生产 zScore 应该返回0', () => {
      expect(zScore(150, 100, 0)).toBe(0);
      expect(zScore(50, 100, 0)).toBe(0);
    });

    it('空数据应该返回空交易', () => {
      expect(meanReversionStrategy([], 10)).toEqual([]);
    });

    it('不同周期应该产生不同结果', () => {
      const prices = Array.from({ length: 50 }, (_, i) => 100 + Math.sin(i / 3) * 30);
      const t5 = meanReversionStrategy(prices, 5);
      const t15 = meanReversionStrategy(prices, 15);
      expect(t5.length).not.toBe(t15.length);
    });

    it('快速反弹应该触发卖出', () => {
      const prices = [...Array(10).fill(100), 40, 40, 200];
      const trades = meanReversionStrategy(prices, 10);
      const sells = trades.filter(t => t.type === 'sell');
      expect(sells.length).toBeGreaterThan(0);
    });

    it('渐变价格应该减少交易频率', () => {
      const gradual = Array.from({ length: 50 }, (_, i) => 100 + i * 0.1);
      const sharp = Array.from({ length: 50 }, (_, i) => 100 + (i % 2 === 0 ? 0 : 20));
      const tGradual = meanReversionStrategy(gradual, 10);
      const tSharp = meanReversionStrategy(sharp, 10);
      expect(tSharp.length).toBeGreaterThanOrEqual(tGradual.length);
    });

    it('交易金额应该为正数', () => {
      const prices = Array.from({ length: 40 }, (_, i) => 100 + Math.sin(i / 2) * 50);
      const trades = meanReversionStrategy(prices, 5);
      expect(trades.length).toBeGreaterThan(0);
      for (const t of trades) {
        expect(t.price).toBeGreaterThan(0);
        expect(t.qty).toBeGreaterThan(0);
      }
    });
  });

  describe('最大回撤计算', () => {
    it('上升曲线回撤为0', () => {
      const prices = [1, 2, 3, 4, 5];
      expect(calculateMaxDrawdown(prices)).toBe(0);
    });

    it('下降曲线回撤应大于0', () => {
      const prices = [100, 90, 80, 70, 60];
      expect(calculateMaxDrawdown(prices)).toBeGreaterThan(0);
    });

    it('应该正确计算最大回撤', () => {
      const prices = [100, 120, 80, 110, 60, 90];
      const dd = calculateMaxDrawdown(prices);
      expect(dd).toBeCloseTo((120 - 60) / 120, 5);
    });

    it('单值数组回撤为0', () => {
      expect(calculateMaxDrawdown([100])).toBe(0);
    });

    it('等值数组回撤为0', () => {
      expect(calculateMaxDrawdown([50, 50, 50, 50])).toBe(0);
    });

    it('V型走势回撤正确', () => {
      const prices = [100, 110, 120, 60, 130];
      expect(calculateMaxDrawdown(prices)).toBeCloseTo((120 - 60) / 120, 5);
    });

    it('回撤不应该超过100%', () => {
      const prices = [100, 50, 1, 0.1];
      expect(calculateMaxDrawdown(prices)).toBeLessThanOrEqual(1);
    });

    it('多次波动取最大回撤', () => {
      const prices = [100, 90, 95, 85, 100, 70, 95];
      const dd = calculateMaxDrawdown(prices);
      expect(dd).toBeCloseTo((100 - 70) / 100, 5);
    });

    it('大数值应该正确处理', () => {
      const prices = [1e6, 1.2e6, 0.8e6, 1.1e6];
      const dd = calculateMaxDrawdown(prices);
      expect(dd).toBeCloseTo((1.2e6 - 0.8e6) / 1.2e6, 5);
    });

    it('微小波动回撤接近0', () => {
      const prices = Array.from({ length: 100 }, (_, i) => 100 + Math.sin(i) * 0.001);
      expect(calculateMaxDrawdown(prices)).toBeLessThan(0.01);
    });
  });

  describe('夏普比率计算', () => {
    it('零波动收益夏普应为正', () => {
      const returns = Array(252).fill(0.001);
      expect(calculateSharpeRatio(returns)).toBeGreaterThan(0);
    });

    it('负收益夏普应为负', () => {
      const returns = Array(252).fill(-0.001);
      expect(calculateSharpeRatio(returns)).toBeLessThan(0);
    });

    it('零标准差应该返回0', () => {
      const returns = Array(100).fill(0);
      expect(calculateSharpeRatio(returns)).toBe(0);
    });

    it('应该年化夏普比率', () => {
      const returns = Array.from({ length: 252 }, (_, i) => 0.001 + Math.sin(i * 0.7) * 0.005);
      const sharpe = calculateSharpeRatio(returns);
      expect(Math.abs(sharpe)).toBeGreaterThan(0);
    });

    it('高波动低收益夏普应较低', () => {
      const lowVol = Array(252).fill(0.001);
      const highVol = Array.from({ length: 252 }, (_, i) => i % 2 === 0 ? 0.01 : -0.01);
      expect(calculateSharpeRatio(lowVol)).toBeGreaterThan(calculateSharpeRatio(highVol));
    });

    it('不同无风险利率影响夏普', () => {
      const returns = Array.from({ length: 252 }, () => 0.002);
      const s1 = calculateSharpeRatio(returns, 0);
      const s2 = calculateSharpeRatio(returns, 0.1);
      expect(s1).toBeGreaterThan(s2);
    });

    it('空数组应该返回0', () => {
      expect(calculateSharpeRatio([])).toBe(0);
    });

    it('单一收益率应该返回有效值', () => {
      const result = calculateSharpeRatio([0.01]);
      expect(typeof result).toBe('number');
      expect(isNaN(result)).toBe(false);
    });

    it('收益分布对称时夏普应接近0', () => {
      const returns = Array.from({ length: 252 }, (_, i) => i % 2 === 0 ? 0.01 : -0.01);
      const sharpe = calculateSharpeRatio(returns, 0);
      expect(Math.abs(sharpe)).toBeLessThan(0.5);
    });

    it('应该处理极值收益', () => {
      const returns = [0.5, -0.3, 0.2, -0.1, 0.4, -0.5, 0.3, -0.2];
      const sharpe = calculateSharpeRatio(returns);
      expect(isFinite(sharpe)).toBe(true);
    });
  });

  describe('双均线策略', () => {
    it('金叉应该产生买入信号', () => {
      const prices = Array.from({ length: 40 }, (_, i) => i < 20 ? 100 - i * 0.5 : 90 + (i - 20) * 1.5);
      const trades = dualMAStrategy(prices, 3, 10);
      expect(trades.some(t => t.type === 'buy')).toBe(true);
    });

    it('死叉应该产生卖出信号', () => {
      // Start flat (no golden cross), then rise (golden cross), then fall (death cross)
      const flat = Array(15).fill(100);
      const rise = Array.from({ length: 15 }, (_, i) => 100 + i * 2);
      const fall = Array.from({ length: 20 }, (_, i) => 130 - i * 3);
      const prices = [...flat, ...rise, ...fall];
      const trades = dualMAStrategy(prices, 3, 10);
      const sells = trades.filter(t => t.type === 'sell');
      expect(sells.length).toBeGreaterThan(0);
    });

    it('趋势不明朗应该减少交易', () => {
      const flat = Array(50).fill(100);
      const trades = dualMAStrategy(flat, 5, 20);
      expect(trades.length).toBe(0);
    });

    it('短周期参数应该更敏感', () => {
      const prices = Array.from({ length: 60 }, (_, i) => 100 + Math.sin(i / 5) * 15);
      const t3 = dualMAStrategy(prices, 3, 10);
      const t10 = dualMAStrategy(prices, 10, 30);
      expect(t3.length).toBeGreaterThanOrEqual(t10.length);
    });

    it('买卖应该交替出现', () => {
      const prices = Array.from({ length: 80 }, (_, i) => 100 + Math.sin(i / 4) * 20);
      const trades = dualMAStrategy(prices, 5, 20);
      expect(trades.length).toBeGreaterThan(0);
      for (let i = 1; i < trades.length; i++) {
        expect(trades[i].type).not.toBe(trades[i - 1].type);
      }
    });
  });
});
