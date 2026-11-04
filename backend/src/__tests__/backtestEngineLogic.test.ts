/**
 * 影子测试迁移 — 回测引擎核心
 *
 * 绑定真源：
 * - Bar → shared/types.ts:136 KLineData（tradeDate/open/high/low/close/volume/turnover；旧 Bar 的 date 字段不存在）
 * - Trade → backend/src/utils/backtestEngine.ts:35（date/type/price/quantity/amount/commission/reason/signal；
 *   旧 entryDate/exitDate/entryPrice/exitPrice/pnl/pnlPercent/direction 字段不存在）
 * - SMA → frontend/src/utils/chartDataProcessing.ts:73 calculateSMA（前 period-1 为 null）
 * - EMA → frontend/src/utils/chartDataProcessing.ts:89 calculateEMA（前 period-1 为 null，index=period-1 用 SMA 作种子）
 * - 回测执行 → backend/src/utils/backtestEngine.ts:308 runBacktest
 *   （<10 条 throw :313；initialCapital || 1,000,000 :317；commission || 0.0003 :318；slippage || 0.001 :319；
 *    A股 100 股整手 :361；T+1 :381；卖出印花税 0.001 :336）
 * - 总收益/回撤/胜率/盈亏比 → 生产 BacktestResult 百分数口径（:68/:73/:84/:87，:478/:481/:597/:600）
 * - 最大回撤（权益曲线）→ backend/src/models/Backtest.ts:164 calculateMaxDrawdown（返回 0..1 分数）
 *
 * 旧断言订正：
 * - EMA 预热：旧 ema[0]=prices[0]（从首价直接递推）→ 生产前 period-1 为 null，index=period-1 用 SMA 种子
 *   （chartDataProcessing.ts:89-105）；长度不足 period 时全部 null
 * - EMA k 因子：旧 [100,106] 用 ema[0]=100 递推 → 生产需 ≥period 条，种子为前 period 条 SMA（chartDataProcessing.ts:96-105）
 * - EMA 单值：旧 [42] → 生产 [null]（长度 < period 全 null）
 * - 无交易夹具：旧 5 条 K 线 → 生产 <10 条直接 throw（backtestEngine.ts:313），改用 12 条横盘
 * - 数据不足：旧返回 0 交易 → 生产 throw 'K线数据不足，至少需要10条记录'（backtestEngine.ts:313）
 * - 初始资金 0：旧仅要求不崩溃 → 生产 `|| 1000000` 兜底（backtestEngine.ts:317），断言 initialCapital=1000000
 * - 手续费：旧 commission:0 表示零成本 → 生产 `|| 0.0003` 兜底（:318），0 与默认 0.0003 同值；
 *   改为比较 0.0003 vs 0.01，并断言 0 与 0.0003 结果相等
 * - 滑点：旧 slippage:0 表示零滑点 → 生产 `|| 0.001` 兜底（:319），0 与默认 0.001 同值；改为比较 0.001 vs 0.01
 * - 最大持仓 maxPosition：生产 StrategyParams 无该字段 → 改为断言 A股 100 股整手约束（:361）
 * - 回测 Trade 字段：旧 pnl/pnlPercent/direction → 生产 amount/commission/reason/signal（:35-44）
 * - 涨跌剧烈夹具：旧 25 条中 1 条 1 元涨跌停式跳变 → 生产同一夹具可正常返回（0 交易）；断言 totalDays 与有限收益
 *
 * 未迁移·生产缺口：
 * - generateSignalMA：生产未导出（backtestEngine.ts:215，本地 helper 无法直接单测）→ 已由生产 runBacktest 端到端覆盖
 * - 撮合/滑点/印花税/整手：生产无独立导出，逻辑内嵌 runBacktest（:355-439）→ 由 runBacktest 用例覆盖，不再保留自抄实现
 * - calculateMaxDrawdown（按 DailyPortfolio 的百分比版本）为私有（backtestEngine.ts:505）→ 仅通过 runBacktest 覆盖；
 *   可导出的 models/Backtest.ts:164 为分数口径，单独用例覆盖
 */
import { describe, it, expect } from 'vitest';
import { runBacktest, type StrategyParams } from '../utils/backtestEngine';
import type { KLineData } from '../types';
import { calculateSMA, calculateEMA } from '../../../frontend/src/utils/chartDataProcessing';
import { calculateMaxDrawdown } from '../models/Backtest';

const dateAt = (index: number) =>
  new Date(Date.UTC(2024, 0, 1) + index * 86400000).toISOString().slice(0, 10);

// 确定性 LCG（替代旧夹具的随机数）
const createLcg = (seed: number) => {
  let state = seed >>> 0;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 0x100000000;
  };
};

const generateTestData = (count: number, startPrice = 100, seed = 20240301): KLineData[] => {
  const random = createLcg(seed);
  const bars: KLineData[] = [];
  let price = startPrice;
  for (let i = 0; i < count; i++) {
    const change = (random() - 0.48) * 3;
    price = Math.max(1, price + change);
    const high = price * (1 + random() * 0.02);
    const low = price * (1 - random() * 0.02);
    const volume = Math.floor(random() * 1000000 + 100000);
    bars.push({
      tradeDate: dateAt(i),
      open: price - change * 0.5,
      high,
      low,
      close: price,
      volume,
      turnover: volume * price,
    });
  }
  return bars;
};

const flatBars = (count: number, price = 100): KLineData[] =>
  Array.from({ length: count }, (_, i) => ({
    tradeDate: dateAt(i),
    open: price,
    high: price,
    low: price,
    close: price,
    volume: 1000,
    turnover: price * 1000,
  }));

const defaultParams: StrategyParams = {
  type: 'ma_cross',
  fastPeriod: 5,
  slowPeriod: 20,
  initialCapital: 100000,
  commission: 0.001,
  slippage: 0.001,
};

describe('回测引擎逻辑', () => {
  describe('SMA计算', () => {
    it('应该正确计算简单移动平均', () => {
      const prices = [1, 2, 3, 4, 5];
      const sma3 = calculateSMA(prices, 3);
      expect(sma3[0]).toBeNull();
      expect(sma3[1]).toBeNull();
      expect(sma3[2]).toBe(2); // (1+2+3)/3
      expect(sma3[3]).toBe(3); // (2+3+4)/3
      expect(sma3[4]).toBe(4); // (3+4+5)/3
    });

    it('period=1应该返回原值', () => {
      const prices = [10, 20, 30];
      const sma1 = calculateSMA(prices, 1);
      expect(sma1).toEqual([10, 20, 30]);
    });

    it('应该处理相同值', () => {
      const prices = [5, 5, 5, 5];
      const sma = calculateSMA(prices, 2);
      expect(sma[1]).toBe(5);
      expect(sma[2]).toBe(5);
    });

    it('应该处理负值', () => {
      const prices = [-1, -2, -3, -4];
      const sma = calculateSMA(prices, 2);
      expect(sma[1]).toBe(-1.5);
    });
  });

  describe('EMA计算', () => {
    it('预热期为null并以SMA为种子', () => {
      const prices = [100, 102, 104, 106, 108, 110];
      const ema = calculateEMA(prices, 5);
      expect(ema.slice(0, 4)).toEqual([null, null, null, null]);
      expect(ema[4]).toBe(104); // 前 5 条 SMA
      expect(ema[5]).toBe(106); // 110*k + 104*(1-k), k=1/3
    });

    it('应该对价格变化做出反应', () => {
      const prices = [100, 110, 120, 130, 140];
      const ema = calculateEMA(prices, 3);
      expect(ema[0]).toBeNull();
      expect(ema[1]).toBeNull();
      // EMA应该跟随上升趋势
      for (let i = 3; i < ema.length; i++) {
        expect(ema[i]!).toBeGreaterThan(ema[i - 1]!);
      }
    });

    it('k因子计算正确', () => {
      // k = 2/(period+1), period=5 => k=1/3；生产在 index=period-1 用 SMA 作种子
      const prices = [100, 100, 100, 100, 100, 106];
      const ema = calculateEMA(prices, 5);
      const k = 2 / 6;
      const seed = 100;
      expect(ema[4]).toBe(seed);
      expect(ema[5]).toBeCloseTo(prices[5] * k + seed * (1 - k), 5);
    });

    it('应该处理单个价格', () => {
      const ema = calculateEMA([42], 10);
      expect(ema).toEqual([null]);
    });
  });

  describe('回测执行', () => {
    it('应该返回完整的回测结果结构', () => {
      const bars = generateTestData(50);
      const result = runBacktest(bars, defaultParams);
      expect(result).toHaveProperty('trades');
      expect(result).toHaveProperty('totalReturn');
      expect(result).toHaveProperty('maxDrawdown');
      expect(result).toHaveProperty('winRate');
      expect(result).toHaveProperty('profitFactor');
      expect(result).toHaveProperty('sharpeRatio');
      expect(result.strategy).toBe('ma_cross');
      expect(result.totalDays).toBe(50);
      expect(result.initialCapital).toBe(100000);
      expect(result.dailyPortfolio).toHaveLength(50);
      expect(result.equityCurve).toHaveLength(50);
    });

    it('没有交易时返回合理值', () => {
      const bars = flatBars(12);
      const result = runBacktest(bars, defaultParams);
      expect(result.trades).toHaveLength(0);
      expect(result.winRate).toBe(0);
      expect(result.profitFactor).toBe(0);
      expect(result.totalReturn).toBe(0);
    });

    it('交易记录应该有正确的字段', () => {
      const bars = generateTestData(100);
      const result = runBacktest(bars, defaultParams);
      expect(result.trades.length).toBeGreaterThan(0);
      for (const trade of result.trades) {
        expect(trade).toHaveProperty('date');
        expect(trade).toHaveProperty('type');
        expect(trade).toHaveProperty('price');
        expect(trade).toHaveProperty('quantity');
        expect(trade).toHaveProperty('amount');
        expect(trade).toHaveProperty('commission');
        expect(trade).toHaveProperty('reason');
        expect(trade).toHaveProperty('signal');
        expect(['buy', 'sell']).toContain(trade.type);
        expect(trade.price).toBeGreaterThan(0);
        expect(trade.quantity).toBeGreaterThan(0);
        expect(trade.amount).toBeGreaterThan(0);
        expect(trade.commission).toBeGreaterThanOrEqual(0);
      }
    });

    it('总回报率应该合理', () => {
      const bars = generateTestData(200);
      const result = runBacktest(bars, defaultParams);
      expect(typeof result.totalReturn).toBe('number');
      expect(isFinite(result.totalReturn)).toBe(true);
      expect(Math.abs(result.totalReturn)).toBeLessThan(1000);
    });

    it('最大回撤应该在0-100之间', () => {
      const bars = generateTestData(200);
      const result = runBacktest(bars, defaultParams);
      expect(result.maxDrawdown).toBeGreaterThanOrEqual(0);
      expect(result.maxDrawdown).toBeLessThanOrEqual(100);
    });

    it('胜率应该在0-100之间', () => {
      const bars = generateTestData(200);
      const result = runBacktest(bars, defaultParams);
      expect(result.winRate).toBeGreaterThanOrEqual(0);
      expect(result.winRate).toBeLessThanOrEqual(100);
    });

    it('手续费应该影响回报', () => {
      const bars = generateTestData(100);
      const defaultCommission = runBacktest(bars, { ...defaultParams, commission: 0.0003 });
      const zeroCommission = runBacktest(bars, { ...defaultParams, commission: 0 });
      const withCommission = runBacktest(bars, { ...defaultParams, commission: 0.01 });
      expect(withCommission.trades.length).toBeGreaterThan(0);
      // 生产 commission || 0.0003：传 0 与显式 0.0003 等价（backtestEngine.ts:318）
      expect(zeroCommission.totalReturn).toBe(defaultCommission.totalReturn);
      expect(withCommission.totalReturn).toBeLessThan(defaultCommission.totalReturn);
    });

    it('滑点应该影响回报', () => {
      const bars = generateTestData(100);
      const defaultSlippage = runBacktest(bars, { ...defaultParams, slippage: 0.001 });
      const zeroSlippage = runBacktest(bars, { ...defaultParams, slippage: 0 });
      const withSlippage = runBacktest(bars, { ...defaultParams, slippage: 0.01 });
      expect(withSlippage.trades.length).toBeGreaterThan(0);
      // 生产 slippage || 0.001：传 0 与显式 0.001 等价（backtestEngine.ts:319）
      expect(zeroSlippage.totalReturn).toBe(defaultSlippage.totalReturn);
      expect(withSlippage.totalReturn).toBeLessThan(defaultSlippage.totalReturn);
    });

    it('交易数量应该为A股整手（100股）', () => {
      const bars = generateTestData(100);
      const result = runBacktest(bars, defaultParams);
      expect(result.trades.length).toBeGreaterThan(0);
      for (const trade of result.trades) {
        expect(trade.quantity % 100).toBe(0);
      }
    });

    it('初始资金不足1手时产生告警', () => {
      const bars = generateTestData(100);
      const result = runBacktest(bars, { ...defaultParams, initialCapital: 500 });
      expect(result.trades).toHaveLength(0);
      expect(result.warnings).toHaveLength(1);
      expect(result.warnings[0]).toContain('不足以买入1手');
    });
  });

  describe('边界条件', () => {
    it('应该处理数据不足的情况', () => {
      const bars = [flatBars(1)[0]];
      expect(() => runBacktest(bars, defaultParams)).toThrow('K线数据不足，至少需要10条记录');
    });

    it('应该处理价格剧烈波动', () => {
      const prices = [100, 50, 150, 150, 150, 150, 150, 150, 150, 150, 150, 150, 150, 150, 150, 150, 150, 150, 150, 150, 150, 150, 150, 150, 150];
      const bars: KLineData[] = prices.map((price, i) => ({
        tradeDate: dateAt(i),
        open: price,
        high: price,
        low: price,
        close: price,
        volume: 1000,
        turnover: price * 1000,
      }));
      const result = runBacktest(bars, defaultParams);
      expect(result.totalDays).toBe(25);
      expect(isFinite(result.totalReturn)).toBe(true);
      expect(result.maxDrawdown).toBeGreaterThanOrEqual(0);
      expect(result.maxDrawdown).toBeLessThanOrEqual(100);
    });

    it('初始资金为0不应该崩溃', () => {
      const bars = generateTestData(30);
      const result = runBacktest(bars, { ...defaultParams, initialCapital: 0 });
      // 生产 initialCapital || 1000000：0 兜底为 100 万（backtestEngine.ts:317）
      expect(result.initialCapital).toBe(1000000);
      expect(isFinite(result.totalReturn)).toBe(true);
    });
  });

  describe('最大回撤（权益曲线）', () => {
    it('按峰值回撤返回最大分数', () => {
      // 峰值 120 回撤到 90：(120-90)/120 = 0.25
      expect(calculateMaxDrawdown([100, 120, 90, 110])).toBe(0.25);
      expect(calculateMaxDrawdown([100, 80, 120, 90])).toBe(0.25);
    });

    it('空权益曲线返回0', () => {
      expect(calculateMaxDrawdown([])).toBe(0);
    });
  });
});

