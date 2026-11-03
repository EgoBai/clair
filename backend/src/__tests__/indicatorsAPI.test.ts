/**
 * 技术指标计算测试（影子治理批次 14：断言绑定生产实现）
 *
 * 生产实现（唯一真源）：backend/src/indicators/technical.ts
 * - calculateMA:120 / calculateEMA:139 / calculateMACD:168 / calculateRSI:233
 *   / calculateKDJ:289 / calculateBollingerBands:356
 * - calculateAllIndicators:389 —— GET /api/indicators/:symbol 的 indicators 字段即它的返回值
 *
 * 口径修正（旧内联 → 生产）：
 * - MA / EMA / BOLL 返回与输入等长的数组，预热期为 null（旧内联只返回窗口起点之后的有效值）
 * - EMA 首个有效值用 SMA 播种，位于 index = period-1（旧内联用 data[0] 播种，首值即 data[0]）
 * - RSI 返回 (number|null)[]，首个值位于 index = period，采用 Wilder 平滑（旧内联返回单个 number）
 * - KDJ 入参为 high[] / low[] / close[]，首个有效 bar 直接置 K=D=50（旧内联用 2/3*50 递推首值）
 * - BOLL 返回 { upper, middle, lower }，标准差按总体口径除以 period（旧内联字段名为 mid）
 * - 数据不足时生产返回等长 null 数组，不返回空数组，也不返回标量 null
 *
 * 数据全部确定性构造（无 Math.random）：旧文件用随机游走生成 K 线，断言无法复现，已替换为固定波形。
 */

import { describe, it, expect } from 'vitest';
import {
  calculateMA,
  calculateEMA,
  calculateMACD,
  calculateRSI,
  calculateKDJ,
  calculateBollingerBands,
  calculateAllIndicators,
} from '../indicators/technical';
import type { OHLCV } from '../indicators/technical';

/** 确定性 K 线生成：固定起点 + 线性漂移 + 正弦波动，保证多次运行完全一致 */
function makeOHLCV(count: number, trend: 'up' | 'down' | 'sideways' = 'up'): OHLCV[] {
  const rows: OHLCV[] = [];
  const base = Date.UTC(2024, 0, 1);
  for (let i = 0; i < count; i++) {
    const drift = trend === 'up' ? 0.8 : trend === 'down' ? -0.8 : 0;
    const price = 100 + drift * i + Math.sin(i / 3) * 1.2;
    const open = +(price - 0.3).toFixed(2);
    const close = +price.toFixed(2);
    const high = +(Math.max(open, close) + 0.5).toFixed(2);
    const low = +(Math.min(open, close) - 0.5).toFixed(2);
    rows.push({
      tradeDate: new Date(base + i * 86400000).toISOString().slice(0, 10),
      open,
      close,
      high,
      low,
      volume: 1_000_000 + i * 1000,
    });
  }
  return rows;
}

describe('技术指标 API', () => {
  describe('MA 均线计算（生产 calculateMA）', () => {
    it('MA5 应计算5日简单移动平均（末值 = 窗口均值）', () => {
      const closes = [10, 20, 30, 40, 50];
      const ma5 = calculateMA(closes, 5);
      expect(ma5.length).toBe(closes.length);
      expect(ma5.slice(0, 4)).toEqual([null, null, null, null]);
      expect(ma5[4]).toBe(30);
    });

    it('MA5 窗口不足时应逐点返回 null（不返回标量 null）', () => {
      const ma5 = calculateMA([10, 20, 30], 5);
      expect(ma5).toEqual([null, null, null]);
    });

    it('MA 应平滑价格波动', () => {
      // 使用确定性数据：波动较大的价格序列
      const closes = [100, 110, 95, 120, 90, 115, 105, 125, 92, 118, 108, 130, 88, 122, 112];
      const ma5 = calculateMA(closes, 5);
      expect(ma5.length).toBe(closes.length);
      // 第一个有效值：(100+110+95+120+90)/5 = 103；最后一个：(108+130+88+122+112)/5 = 112
      expect(ma5[4]).toBe(103);
      expect(ma5[14]).toBe(112);
      // MA5 最大值应不大于原始最大值，最小值应不小于原始最小值
      const valid = ma5.filter((v): v is number => v !== null);
      expect(valid.length).toBe(closes.length - 4);
      expect(Math.max(...valid)).toBeLessThanOrEqual(Math.max(...closes));
      expect(Math.min(...valid)).toBeGreaterThanOrEqual(Math.min(...closes));
    });
  });

  describe('MACD 指标计算（生产 calculateEMA / calculateMACD）', () => {
    it('EMA12 和 EMA26 应分别计算（等长数组 + 预热期为 null）', () => {
      const closes = Array.from({ length: 30 }, (_, i) => 100 + i);
      const ema12 = calculateEMA(closes, 12);
      const ema26 = calculateEMA(closes, 26);
      expect(ema12.length).toBe(closes.length);
      expect(ema26.length).toBe(closes.length);
      // 首个有效值位于 index = period-1，且用 SMA 播种
      expect(ema12[10]).toBeNull();
      expect(ema12[11]).toBe(105.5); // (100+...+111)/12
      expect(ema26[24]).toBeNull();
      expect(ema26[25]).toBe(112.5); // (100+...+125)/26
    });

    it('DIF = EMA12 - EMA26（生产 calculateMACD 的 macd 序列）', () => {
      const closes = Array.from({ length: 30 }, (_, i) => 100 + i);
      const ema12 = calculateEMA(closes, 12);
      const ema26 = calculateEMA(closes, 26);
      const { macd } = calculateMACD(closes, 12, 26, 9);
      const last = closes.length - 1;
      const dif = ema12[last]! - ema26[last]!;
      expect(Number.isFinite(macd[last])).toBe(true);
      expect(macd[last]!).toBeCloseTo(dif, 2);
    });

    it('HIST = DIF - DEA，且信号线需 longPeriod+signalPeriod-1 根 K 线预热', () => {
      // 30 根 < 25+9 = 34 → 信号线与柱状图整段为 null（生产不补 0）
      const short = Array.from({ length: 30 }, (_, i) => 100 + i);
      const shortResult = calculateMACD(short, 12, 26, 9);
      expect(shortResult.signal.every(v => v === null)).toBe(true);
      expect(shortResult.histogram.every(v => v === null)).toBe(true);

      const closes = Array.from({ length: 40 }, (_, i) => 100 + i);
      const { macd, signal, histogram } = calculateMACD(closes, 12, 26, 9);
      const last = closes.length - 1;
      expect(signal[last]).toBeTypeOf('number');
      expect(histogram[last]!).toBeCloseTo(macd[last]! - signal[last]!, 2);
    });

    it('上涨趋势中 DIF 应大于 0', () => {
      const closes = Array.from({ length: 50 }, (_, i) => 100 + i);
      const { macd } = calculateMACD(closes, 12, 26, 9);
      expect(macd[macd.length - 1]!).toBeGreaterThan(0);
    });
  });

  describe('RSI 指标计算（生产 calculateRSI，Wilder 平滑）', () => {
    it('RSI 应在 0-100 范围内（预热期 null，首个值位于 index = period）', () => {
      const closes = Array.from({ length: 30 }, (_, i) => 100 + Math.sin(i / 2) * 5);
      const rsi = calculateRSI(closes);
      expect(rsi.length).toBe(closes.length);
      for (let i = 0; i < 14; i++) expect(rsi[i]).toBeNull();
      const last = rsi[rsi.length - 1]!;
      expect(Number.isFinite(last)).toBe(true);
      expect(last).toBeGreaterThanOrEqual(0);
      expect(last).toBeLessThanOrEqual(100);
    });

    it('Wilder 平滑逐点递推（period=2 的确定性序列）', () => {
      // diff: +2, -1, +2 → 初始 avgGain=1, avgLoss=0.5 → RSI=66.6667
      // 第二点 avgGain=(1*1+2)/2=1.5, avgLoss=(0.5*1+0)/2=0.25 → RSI=85.7143
      const rsi = calculateRSI([10, 12, 11, 13], 2);
      expect(rsi[1]).toBeNull();
      expect(rsi[2]!).toBeCloseTo(66.6667, 3);
      expect(rsi[3]!).toBeCloseTo(85.7143, 3);
    });

    it('全上涨数据 RSI 应为 100（avgLoss=0 的生产口径）', () => {
      const closes = Array.from({ length: 20 }, (_, i) => 100 + i);
      const rsi = calculateRSI(closes);
      expect(rsi[rsi.length - 1]).toBe(100);
    });

    it('全下跌数据 RSI 应为 0（avgGain=0 的生产口径）', () => {
      const closes = Array.from({ length: 20 }, (_, i) => 120 - i);
      const rsi = calculateRSI(closes);
      expect(rsi[rsi.length - 1]).toBe(0);
    });

    it('RSI 数据不足应返回等长 null 数组（旧断言返回标量 null 已废弃）', () => {
      expect(calculateRSI([100, 101, 102])).toEqual([null, null, null]);
    });
  });

  describe('KDJ 指标计算（生产 calculateKDJ，入参 high/low/close 三数组）', () => {
    it('KDJ 值应在合理范围（K、D ∈ [0,100]，J 有限）', () => {
      const data = makeOHLCV(20, 'sideways');
      const kdj = calculateKDJ(
        data.map(d => d.high),
        data.map(d => d.low),
        data.map(d => d.close),
      );
      expect(kdj.k.length).toBe(data.length);
      expect(kdj.d.length).toBe(data.length);
      expect(kdj.j.length).toBe(data.length);
      for (let i = 0; i < 8; i++) {
        expect(kdj.k[i]).toBeNull();
        expect(kdj.d[i]).toBeNull();
        expect(kdj.j[i]).toBeNull();
      }
      for (let i = 8; i < data.length; i++) {
        expect(Number.isFinite(kdj.k[i]!)).toBe(true);
        expect(Number.isFinite(kdj.d[i]!)).toBe(true);
        expect(Number.isFinite(kdj.j[i]!)).toBe(true);
        expect(kdj.k[i]!).toBeGreaterThanOrEqual(0);
        expect(kdj.k[i]!).toBeLessThanOrEqual(100);
        expect(kdj.d[i]!).toBeGreaterThanOrEqual(0);
        expect(kdj.d[i]!).toBeLessThanOrEqual(100);
      }
    });

    it('首个有效 bar 的 K、D 初始化为 50，J = 3K - 2D（生产口径）', () => {
      const data = makeOHLCV(30, 'sideways');
      const kdj = calculateKDJ(
        data.map(d => d.high),
        data.map(d => d.low),
        data.map(d => d.close),
      );
      expect(kdj.k[8]).toBe(50);
      expect(kdj.d[8]).toBe(50);
      expect(kdj.j[8]).toBe(50);
      for (let i = 9; i < data.length; i++) {
        expect(kdj.j[i]!).toBeCloseTo(3 * kdj.k[i]! - 2 * kdj.d[i]!, 2);
      }
    });

    it('KDJ 数据不足应返回等长 null 数组（旧断言要求空数组已废弃）', () => {
      const data = makeOHLCV(5, 'up');
      const kdj = calculateKDJ(
        data.map(d => d.high),
        data.map(d => d.low),
        data.map(d => d.close),
      );
      expect(kdj.k).toEqual([null, null, null, null, null]);
      expect(kdj.d).toEqual([null, null, null, null, null]);
      expect(kdj.j).toEqual([null, null, null, null, null]);
    });
  });

  describe('布林带 (BOLL)（生产 calculateBollingerBands）', () => {
    it('中轨为 MA，上下轨 = 中轨 ± 2σ（总体标准差）', () => {
      const closes = [10, 20, 30, 40, 50];
      const boll = calculateBollingerBands(closes, 5, 2);
      expect(boll.middle.length).toBe(5);
      expect(boll.upper.slice(0, 4)).toEqual([null, null, null, null]);
      expect(boll.middle[4]).toBe(30);
      // σ = sqrt(200) ≈ 14.1421 → upper ≈ 58.2843，lower ≈ 1.7157
      expect(boll.upper[4]!).toBeCloseTo(58.2843, 4);
      expect(boll.lower[4]!).toBeCloseTo(1.7157, 4);
    });

    it('中轨应在上下轨之间', () => {
      const closes = makeOHLCV(40, 'up').map(d => d.close);
      const boll = calculateBollingerBands(closes, 20, 2);
      for (let i = 19; i < closes.length; i++) {
        expect(boll.upper[i]!).toBeGreaterThan(boll.middle[i]!);
        expect(boll.middle[i]!).toBeGreaterThan(boll.lower[i]!);
      }
    });

    it('上下轨距离应与标准差成正比', () => {
      // 稳定序列 σ=0 → 宽度 0；10 个 100 / 10 个 120 交替 → σ=10 → 宽度 40
      const stable = Array.from({ length: 30 }, () => 100);
      const volatile = Array.from({ length: 30 }, (_, i) => (i % 2 === 0 ? 100 : 120));
      const bollStable = calculateBollingerBands(stable, 20, 2);
      const bollVolatile = calculateBollingerBands(volatile, 20, 2);
      const lastIdx = stable.length - 1;
      const stableWidth = bollStable.upper[lastIdx]! - bollStable.lower[lastIdx]!;
      const volatileWidth = bollVolatile.upper[lastIdx]! - bollVolatile.lower[lastIdx]!;
      expect(stableWidth).toBe(0);
      expect(volatileWidth).toBe(40);
      expect(volatileWidth).toBeGreaterThan(stableWidth);
    });
  });

  describe('指标聚合输出契约（生产 calculateAllIndicators）', () => {
    it('完整指标输出应包含 MA/MACD/KDJ/RSI/BOLL 全部字段', () => {
      const data = makeOHLCV(60, 'up');
      const result = calculateAllIndicators(data);
      expect(result.length).toBe(data.length); // 路由 count = indicators.length
      const last = result[result.length - 1];
      expect(last.tradeDate).toBe(data[data.length - 1].tradeDate);
      for (const key of [
        'ma5', 'ma10', 'ma20', 'ma60',
        'rsi', 'macd', 'macdSignal', 'macdHistogram',
        'kdjK', 'kdjD', 'kdjJ',
        'bollUpper', 'bollMiddle', 'bollLower',
      ] as const) {
        expect(last[key]).toBeTypeOf('number');
      }
      expect(last.bollUpper!).toBeGreaterThan(last.bollMiddle!);
      expect(last.bollMiddle!).toBeGreaterThan(last.bollLower!);
      expect(last.kdjK!).toBeGreaterThanOrEqual(0);
      expect(last.kdjK!).toBeLessThanOrEqual(100);
    });

    it('预热期指标字段应为 undefined（生产不补 0）', () => {
      const result = calculateAllIndicators(makeOHLCV(5, 'up'));
      expect(result[0].ma5).toBeUndefined();
      expect(result[0].rsi).toBeUndefined();
      expect(result[0].macd).toBeUndefined();
      expect(result[0].kdjK).toBeUndefined();
      expect(result[0].bollUpper).toBeUndefined();
    });
  });
});
