import { describe, it, expect } from 'vitest';
import { calcEMA, calcMACD, calcMA, calcRSI } from '../utils/futureValueUtils';
import { calcBollingerBands } from '../services/chartDataEngine';
import { StopLossCalculator } from '../utils/aiMarketAnalysis';
import type { KLineData } from '../types';

/**
 * 交易策略引擎测试（批次 9：绑定生产实现）
 *
 * 生产实现（唯一真源）：
 * - backend/src/utils/futureValueUtils.ts：
 *   calcMA 前 period-1 为 null、index=period-1 起为 SMA 滑窗；
 *   calcEMA 前 period-1 为 null、index=period-1 用 SMA 作种子；
 *   calcRSI 为 Wilder 平滑、index=period 起有值，数据不足全 null，avgLoss=0 时返回 100；
 *   calcMACD 的 dif 自 index 25 起，dea 由 dif 补 0 后的 9 周期 EMA 得到、自 index 33 起，
 *   histogram = 2*(dif-dea)。
 * - backend/src/services/chartDataEngine.ts 的 calcBollingerBands：需显式传 period/mult，
 *   返回数组自 index period-1 起、长度 n-period+1、中轨键名为 mid，数据不足返回空数组。
 * - backend/src/utils/aiMarketAnalysis.ts 的 StopLossCalculator：
 *   ATR 止损 = 价格 - atr*multiplier，止盈 = 价格 + atr*multiplier*1.5（风险回报比固定 1.5）；
 *   百分比止盈止损的止盈幅度是独立参数，不按止损倍数推算。
 *
 * 未迁移（后端无导出的纯信号函数，保留本地 helper，不虚构生产代码）：
 * - maCrossoverSignals / detectMACDCross：信号计算在内部的 backtestEngine.ts 里
 *   （generateSignalMA / generateSignalMACD 未导出，模块只导出 runBacktest），故保留本地实现；
 *   其指标数值改用生产 calcMA / calcMACD，并跳过生产实现返回的 null 预热期。
 */

/** 均线交叉信号：指标值取生产 calcMA，null 表示预热期（未迁移，见文件头） */
const maCrossoverSignals = (
  prices: number[],
  shortPeriod: number,
  longPeriod: number
): Array<{ index: number; type: 'buy' | 'sell' }> => {
  const shortMA = calcMA(prices, shortPeriod);
  const longMA = calcMA(prices, longPeriod);
  const signals: Array<{ index: number; type: 'buy' | 'sell' }> = [];
  for (let i = 1; i < prices.length; i++) {
    const s0 = shortMA[i - 1];
    const l0 = longMA[i - 1];
    const s1 = shortMA[i];
    const l1 = longMA[i];
    if (s0 === null || l0 === null || s1 === null || l1 === null) continue;
    if (s0 <= l0 && s1 > l1) signals.push({ index: i, type: 'buy' });
    else if (s0 >= l0 && s1 < l1) signals.push({ index: i, type: 'sell' });
  }
  return signals;
};

/** MACD 金叉死叉信号：指标值取生产 calcMACD，null 表示预热期（未迁移，见文件头） */
const detectMACDCross = (
  dif: Array<number | null>,
  dea: Array<number | null>
): Array<{ index: number; type: 'golden' | 'dead' }> => {
  const signals: Array<{ index: number; type: 'golden' | 'dead' }> = [];
  for (let i = 1; i < dif.length; i++) {
    const d0 = dif[i - 1];
    const e0 = dea[i - 1];
    const d1 = dif[i];
    const e1 = dea[i];
    if (d0 === null || e0 === null || d1 === null || e1 === null) continue;
    if (e0 >= d0 && e1 < d1) signals.push({ index: i, type: 'golden' });
    else if (e0 <= d0 && e1 > d1) signals.push({ index: i, type: 'dead' });
  }
  return signals;
};

/** 构造恒定真实波幅的 K 线：ATR(14) 恰好等于 tr（未迁移，纯测试数据构造） */
const makeKline = (tr: number, n = 15, price = 100): KLineData[] =>
  Array.from({ length: n }, (_, i) => ({
    tradeDate: `2026-03-${String(i + 1).padStart(2, '0')}`,
    open: price,
    close: price,
    high: price + tr / 2,
    low: price - tr / 2,
    volume: 1000,
    turnover: 100000,
  }));

describe('交易策略引擎', () => {
  describe('均线交叉策略', () => {
    it('计算MA5', () => {
      const prices = [10, 11, 12, 13, 14, 15, 16, 17, 18, 19];
      const ma = calcMA(prices, 5);
      for (let i = 0; i < 4; i++) {
        expect(ma[i]).toBeNull();
      }
      expect(ma[4]).toBe(12);
      expect(ma[5]).toBe(13);
    });

    it('金叉信号', () => {
      // 短均线从下方穿越长均线
      const prices = [10, 10, 10, 10, 10, 20, 20, 20, 20, 20];
      const signals = maCrossoverSignals(prices, 3, 5);
      expect(signals).toEqual([{ index: 5, type: 'buy' }]);
    });

    it('死叉信号', () => {
      const prices = [20, 20, 20, 20, 20, 10, 10, 10, 10, 10];
      const signals = maCrossoverSignals(prices, 3, 5);
      expect(signals).toEqual([{ index: 5, type: 'sell' }]);
    });

    it('无交叉', () => {
      const prices = Array(20).fill(100);
      const signals = maCrossoverSignals(prices, 3, 5);
      expect(signals.length).toBe(0);
    });

    it('空数据', () => {
      expect(maCrossoverSignals([], 3, 5)).toEqual([]);
    });

    it('数据不足', () => {
      expect(maCrossoverSignals([1, 2], 3, 5)).toEqual([]);
    });

    it('信号交替', () => {
      const prices = [];
      for (let i = 0; i < 30; i++) {
        prices.push(i % 2 === 0 ? 100 : 80);
      }
      const signals = maCrossoverSignals(prices, 3, 5);
      expect(signals.length).toBeGreaterThan(0);
      signals.forEach(s => expect(['buy', 'sell']).toContain(s.type));
    });
  });

  describe('EMA指标', () => {
    it('前 period-1 为 null，首值为 SMA 种子', () => {
      const ema = calcEMA([1, 2, 3, 4, 5, 6, 7, 8, 9, 10], 5);
      for (let i = 0; i < 4; i++) {
        expect(ema[i]).toBeNull();
      }
      expect(ema[4]).toBe(3);
      expect(ema[5]).toBe(4);
      expect(ema[9]).toBe(8);
    });
  });

  describe('RSI指标', () => {
    it('全涨RSI=100', () => {
      const prices = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16];
      const rsi = calcRSI(prices, 14);
      expect(rsi[rsi.length - 1]).toBe(100);
    });

    it('全跌RSI=0', () => {
      const prices = [16, 15, 14, 13, 12, 11, 10, 9, 8, 7, 6, 5, 4, 3, 2, 1];
      const rsi = calcRSI(prices, 14);
      expect(rsi[rsi.length - 1]).toBe(0);
    });

    it('RSI范围0-100', () => {
      const prices = [10, 12, 11, 13, 9, 14, 8, 15, 11, 13, 10, 12, 14, 9, 11, 13];
      const rsi = calcRSI(prices, 14);
      const valid = rsi.filter((v): v is number => v !== null);
      expect(valid.length).toBeGreaterThan(0);
      valid.forEach(v => {
        expect(v).toBeGreaterThanOrEqual(0);
        expect(v).toBeLessThanOrEqual(100);
      });
    });

    it('数据不足返回null', () => {
      const rsi = calcRSI([1, 2, 3], 14);
      expect(rsi.every(v => v === null)).toBe(true);
    });

    it('平坦价格RSI=100', () => {
      const prices = Array(16).fill(100);
      const rsi = calcRSI(prices, 14);
      expect(rsi[rsi.length - 1]).toBe(100);
    });

    it('输出长度正确', () => {
      const rsi = calcRSI([1, 2, 3, 4, 5, 6, 7, 8, 9, 10], 5);
      expect(rsi.length).toBe(10);
    });
  });

  describe('布林带', () => {
    const prices = Array.from({ length: 25 }, (_, i) => 100 + Math.sin(i) * 10);

    it('上>中>下', () => {
      const boll = calcBollingerBands(prices, 20, 2);
      const last = boll[boll.length - 1];
      expect(last.upper).toBeGreaterThan(last.mid);
      expect(last.mid).toBeGreaterThan(last.lower);
    });

    it('平坦价格零带宽', () => {
      const flat = Array(25).fill(100);
      const boll = calcBollingerBands(flat, 20, 2);
      const last = boll[boll.length - 1];
      expect(last.upper).toBe(100);
      expect(last.mid).toBe(100);
      expect(last.lower).toBe(100);
    });

    it('数据不足', () => {
      // 生产口径：不足 period 个数据返回空数组（不是用 0 填充）
      expect(calcBollingerBands([1, 2, 3], 20, 2)).toEqual([]);
    });

    it('自定义倍数', () => {
      const prices2 = Array.from({ length: 25 }, (_, i) => 100 + i * 0.5);
      const boll2 = calcBollingerBands(prices2, 20, 2);
      const boll3 = calcBollingerBands(prices2, 20, 3);
      const last2 = boll2[boll2.length - 1];
      const last3 = boll3[boll3.length - 1];
      expect(last3.upper - last3.lower).toBeGreaterThan(last2.upper - last2.lower);
    });

    it('输出长度', () => {
      // 生产口径：长度为 n-period+1（不从 0 填充到 n）
      const boll = calcBollingerBands([1, 2, 3, 4, 5], 3, 2);
      expect(boll.length).toBe(3);
      expect(boll[0].mid).toBe(2);
    });
  });

  describe('MACD策略', () => {
    it('DIF和DEA长度一致', () => {
      const prices = Array.from({ length: 50 }, (_, i) => 100 + i);
      const { dif, dea, histogram } = calcMACD(prices);
      expect(dif.length).toBe(50);
      expect(dea.length).toBe(50);
      expect(histogram.length).toBe(50);
      // 生产口径：DIF 自 index 25 起有值，DEA 自 index 33 起有值
      expect(dif[24]).toBeNull();
      expect(dif[25]).not.toBeNull();
      expect(dea[32]).toBeNull();
      expect(dea[33]).not.toBeNull();
    });

    it('金叉死叉检测', () => {
      const prices = Array.from({ length: 100 }, (_, i) =>
        i < 50 ? 100 - i * 0.5 : 75 + (i - 50) * 1.5
      );
      const { dif, dea } = calcMACD(prices);
      const golden = detectMACDCross(dif, dea).filter(s => s.type === 'golden');
      expect(golden.length).toBe(1);
      expect(golden[0].index).toBe(54);
    });

    it('无交叉-平坦', () => {
      const prices = Array(50).fill(100);
      const { dif, dea } = calcMACD(prices);
      expect(detectMACDCross(dif, dea)).toEqual([]);
    });

    it('信号类型正确', () => {
      const prices = Array.from({ length: 100 }, (_, i) => 100 + Math.sin(i * 0.3) * 20);
      const { dif, dea } = calcMACD(prices);
      const signals = detectMACDCross(dif, dea);
      expect(signals.length).toBeGreaterThan(0);
      signals.forEach(s => expect(['golden', 'dead']).toContain(s.type));
    });

    it('柱状图=DIF-DEA的2倍', () => {
      const prices = Array.from({ length: 50 }, (_, i) => 100 + i * 0.5);
      const { dif, dea, histogram } = calcMACD(prices);
      for (let i = 0; i < prices.length; i++) {
        if (dif[i] === null || dea[i] === null || histogram[i] === null) continue;
        expect(histogram[i]).toBeCloseTo(2 * ((dif[i] as number) - (dea[i] as number)), 5);
      }
    });
  });

  describe('止损止盈', () => {
    const calc = new StopLossCalculator();

    it('ATR止损', () => {
      const r = calc.calculateByATR('000001', 100, makeKline(5), 2);
      expect(r.suggestedStopLoss).toBe(90);
      // 生产口径：止盈 = 1.5 倍 ATR（风险回报比固定 1.5），不是 2 倍
      expect(r.suggestedTakeProfit).toBe(115);
      expect(r.riskRewardRatio).toBe(1.5);
    });

    it('百分比止损', () => {
      const r = calc.calculateByPercent('000001', 100, 5, 10);
      expect(r.suggestedStopLoss).toBe(95);
      expect(r.suggestedTakeProfit).toBe(110);
      expect(r.riskRewardRatio).toBe(2);
    });

    it('默认参数', () => {
      const r = calc.calculateByATR('000001', 100, makeKline(3));
      expect(r.suggestedStopLoss).toBe(94);
      expect(r.suggestedTakeProfit).toBe(109);
      expect(r.method).toBe('atr');
    });

    it('止损价<入场价', () => {
      const r = calc.calculateByATR('000001', 100, makeKline(5), 2);
      expect(r.suggestedStopLoss).toBeLessThan(100);
    });

    it('止盈价>入场价', () => {
      const r = calc.calculateByATR('000001', 100, makeKline(5), 2);
      expect(r.suggestedTakeProfit).toBeGreaterThan(100);
    });

    it('高ATR宽区间', () => {
      const low = calc.calculateByATR('000001', 100, makeKline(2), 2);
      const high = calc.calculateByATR('000001', 100, makeKline(10), 2);
      expect(high.suggestedTakeProfit - high.suggestedStopLoss).toBeGreaterThan(
        low.suggestedTakeProfit - low.suggestedStopLoss
      );
    });

    it('止损价为正数', () => {
      // 价格低于 ATR 幅度时止损被钳制为 0，不出现负价
      const r = calc.calculateByATR('000001', 10, makeKline(10), 2);
      expect(r.suggestedStopLoss).toBe(0);
      expect(r.suggestedStopLoss).toBeGreaterThanOrEqual(0);
    });
  });
});
