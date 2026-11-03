/**
 * 市场微观结构分析 — 批次 28b 影子迁移
 *
 * 生产真源（已 import 绑定）：
 * - calcRollingVwap（backend/src/services/orderFlowToxicityEngine.ts:406-419）
 * - orderImbalance（orderFlowToxicityEngine.ts:293-303，入参 Trade[]，tick rule 判方向）
 * - calcKyleLambda（orderFlowToxicityEngine.ts:374-397，返回 Math.abs(cov/varV)）
 * - calcAmihudIlliquidity（orderFlowToxicityEngine.ts:429-446，入参 Trade[]，返回滚动数组）
 * - detectIcebergOrders（orderFlowToxicityEngine.ts:492-545）
 * - generateOrderFlowSnapshot（orderFlowToxicityEngine.ts:557-599）
 * - OrderBookAnalyzer.addOrderBook / analyzeImbalance（backend/src/services/orderBookAnalyzer.ts:59-111）
 * - aggregateTicksToCandle（frontend/src/utils/chartDataProcessing.ts:20-48，tick→时间桶 K 线）
 *
 * 未迁移（生产无对应导出，测试侧保留）：
 * - calcSpread：后端无纯函数买卖价差；改用 OrderBookAnalyzer.analyzeImbalance 的 spread/spreadPercent 绑定
 * - calcVWAP 标量：生产只提供 calcRollingVwap 数组；测试侧取末值
 * - K 线 vwap 字段：生产 aggregateTicksToCandle 不含 vwap；测试侧用 calcRollingVwap 补齐（组合逻辑）
 *
 * 旧断言订正（旧值 -> 生产值，依据）：
 * 1. VWAP 空数据 旧 0 -> calcRollingVwap([]) 返回 []（orderFlowToxicityEngine.ts:407）
 * 2. VWAP 零成交量 旧 0 -> 单笔零量回退当前价 10（orderFlowToxicityEngine.ts:416）
 * 3. 相对价差 旧 relative 0.01 -> 生产字段为百分数 spreadPercent=1（orderBookAnalyzer.ts:90-91）
 * 4. BPS 旧直接 bps=10 -> 生产只有 spreadPercent，bps = spreadPercent*100 = 10
 * 5. 订单不平衡 旧 (0,0) -> 生产入参 Trade[]，空数组/单笔返回 0（orderFlowToxicityEngine.ts:293-303）
 * 6. Amihud 低流动性 旧 >0.0001（旧公式 |returns|/volume=5e-4）
 *    -> 生产 ret=|Δp|/p、除 dollarVolume，末值约 6e-6（orderFlowToxicityEngine.ts:429-446）
 * 7. Amihud 空数据 旧 0 -> 生产返回 []（orderFlowToxicityEngine.ts:430）
 * 8. Amihud 旧标量 -> 生产滚动数组，长度等于 trades.length（orderFlowToxicityEngine.ts:431-446）
 *
 * 新增覆盖说明：
 * - Kyle 正相关旧夹具为线性价格（价格变动恒定，生产 lambda=0，旧 isFinite 断言仍可通过）；
 *   改用凸型价格变化后断言 lambda > 0（生产取 Math.abs，orderFlowToxicityEngine.ts:396）
 */
import { describe, it, expect } from 'vitest';
import {
  calcAmihudIlliquidity,
  calcKyleLambda,
  calcRollingVwap,
  detectIcebergOrders,
  generateOrderFlowSnapshot,
  orderImbalance,
} from '../services/orderFlowToxicityEngine';
import type { Trade } from '../services/orderFlowToxicityEngine';
import { OrderBookAnalyzer } from '../services/orderBookAnalyzer';
import type { OrderBook } from '../services/orderBookAnalyzer';
import { aggregateTicksToCandle } from '../../../frontend/src/utils/chartDataProcessing';
import type { OHLCV as CandleOHLCV } from '../../../frontend/src/utils/chartDataProcessing';

describe('Market Microstructure Analysis', () => {
  interface Tick { price: number; volume: number; timestamp: number; }
  interface OHLCV extends CandleOHLCV { vwap: number; }

  const toTrade = (tick: Tick): Trade => ({ price: tick.price, volume: tick.volume, timestamp: tick.timestamp });
  const trade = (price: number, volume: number, timestamp: number): Trade => ({ price, volume, timestamp });

  const rollingVwap = (ticks: Tick[], window?: number): number[] => calcRollingVwap(ticks.map(toTrade), window);
  const lastVwap = (ticks: Tick[]): number => {
    const series = rollingVwap(ticks);
    return series.length > 0 ? series[series.length - 1] : 0;
  };

  const analyzeSpread = (bid: number, ask: number, stockCode = '600519') => {
    const analyzer = new OrderBookAnalyzer();
    const book: OrderBook = {
      stockCode,
      timestamp: '2024-01-02T09:30:00.000Z',
      bids: [{ price: bid, quantity: 100, orderCount: 1 }],
      asks: [{ price: ask, quantity: 100, orderCount: 1 }],
    };
    analyzer.addOrderBook(book);
    const result = analyzer.analyzeImbalance(stockCode);
    if (!result) throw new Error('order book not found');
    return result;
  };

  // 未迁移：生产 aggregateTicksToCandle 无 vwap 字段；测试侧用 calcRollingVwap 补齐
  const aggregateTicksToK = (ticks: Tick[], intervalMs: number): OHLCV[] =>
    aggregateTicksToCandle(ticks, intervalMs).map(candle => {
      const bucketTicks = ticks.filter(t => Math.floor(t.timestamp / intervalMs) * intervalMs === candle.timestamp);
      const series = calcRollingVwap(bucketTicks.map(toTrade), bucketTicks.length);
      return { ...candle, vwap: series[series.length - 1] ?? 0 };
    });

  describe('VWAP计算', () => {
    it('等量等价应等于价格', () => {
      const ticks: Tick[] = [
        { price: 10, volume: 100, timestamp: 1 },
        { price: 10, volume: 100, timestamp: 2 },
      ];
      expect(lastVwap(ticks)).toBe(10);
    });

    it('加权平均应正确', () => {
      const ticks: Tick[] = [
        { price: 10, volume: 100, timestamp: 1 },
        { price: 20, volume: 300, timestamp: 2 },
      ];
      expect(lastVwap(ticks)).toBeCloseTo(17.5);
    });

    it('空数据返回零（订正：生产 calcRollingVwap 返回空数组）', () => {
      expect(calcRollingVwap([])).toEqual([]);
      expect(lastVwap([])).toBe(0);
    });

    it('零成交量返回零（订正：生产零量回退当前价 10）', () => {
      const ticks: Tick[] = [{ price: 10, volume: 0, timestamp: 1 }];
      expect(rollingVwap(ticks)).toEqual([10]);
      expect(lastVwap(ticks)).toBe(10);
    });

    it('大量交易数据应稳定', () => {
      const ticks: Tick[] = Array.from({ length: 1000 }, (_, i) => ({
        price: 100 + Math.sin(i * 0.1) * 5,
        volume: 100 + (i * 37) % 900,
        timestamp: i,
      }));
      const vwap = lastVwap(ticks);
      expect(Number.isFinite(vwap)).toBe(true);
      expect(vwap).toBeGreaterThan(90);
      expect(vwap).toBeLessThan(110);
    });

    it('滚动窗口应逐笔计算（新增：window=2）', () => {
      const trades: Trade[] = [
        trade(10, 100, 1),
        trade(20, 300, 2),
        trade(30, 100, 3),
      ];
      expect(calcRollingVwap(trades, 2)).toEqual([10, 17.5, 22.5]);
    });
  });

  describe('买卖价差', () => {
    it('绝对价差应为正', () => {
      const spread = analyzeSpread(10, 10.05);
      expect(spread.spread).toBeCloseTo(0.05);
    });

    it('相对价差应为正比（订正：生产 spreadPercent 为百分数 1）', () => {
      const spread = analyzeSpread(10, 10.10);
      expect(spread.spreadPercent).toBeCloseTo(1);
    });

    it('BPS计算正确（订正：生产无 bps 字段，spreadPercent*100=10）', () => {
      const spread = analyzeSpread(100, 100.10);
      expect(spread.spreadPercent * 100).toBeCloseTo(10);
    });

    it('相同买卖价价差为零', () => {
      const spread = analyzeSpread(10, 10);
      expect(spread.spread).toBe(0);
      expect(spread.spreadPercent).toBe(0);
    });

    it('不同价位价差BPS应相近(相同比例)', () => {
      const s1 = analyzeSpread(10, 10.01);
      const s2 = analyzeSpread(100, 100.01);
      // spreadPercent 以 bestBid 为分母：10→10.01 约 10 bps，100→100.01 约 1 bp
      expect(Math.abs(s1.spreadPercent * 100 - s2.spreadPercent * 100)).toBeLessThan(10);
    });

    it('未添加订单簿应返回 undefined（新增：orderBookAnalyzer.ts:72-74）', () => {
      const analyzer = new OrderBookAnalyzer();
      expect(analyzer.analyzeImbalance('600000')).toBeUndefined();
    });
  });

  describe('订单簿不平衡', () => {
    it('买卖相等应为零', () => {
      const trades: Trade[] = [
        trade(10, 0, 0),
        trade(10.1, 100, 1),
        trade(9.9, 100, 2),
      ];
      expect(orderImbalance(trades)).toBe(0);
    });

    it('买方多应为正', () => {
      const trades: Trade[] = [
        trade(10, 0, 0),
        trade(10.1, 200, 1),
        trade(10.0, 100, 2),
      ];
      expect(orderImbalance(trades)).toBeGreaterThan(0);
    });

    it('卖方多应为负', () => {
      const trades: Trade[] = [
        trade(10, 0, 0),
        trade(9.9, 200, 1),
        trade(10.0, 100, 2),
      ];
      expect(orderImbalance(trades)).toBeLessThan(0);
    });

    it('范围在-1到1之间', () => {
      const buyHeavy: Trade[] = [trade(10, 0, 0), trade(10.1, 1000, 1), trade(9.9, 1, 2)];
      const sellHeavy: Trade[] = [trade(10, 0, 0), trade(9.9, 1000, 1), trade(10.1, 1, 2)];
      expect(orderImbalance(buyHeavy)).toBeGreaterThan(0.9);
      expect(orderImbalance(sellHeavy)).toBeLessThan(-0.9);
    });

    it('双边为零返回零（订正：生产入参 Trade[]，空数组/单笔返回 0）', () => {
      expect(orderImbalance([])).toBe(0);
      expect(orderImbalance([trade(10, 100, 1)])).toBe(0);
    });

    it('极端不平衡', () => {
      const trades: Trade[] = [trade(10, 0, 0), trade(10.1, 1000000, 1), trade(9.9, 1, 2)];
      expect(orderImbalance(trades)).toBeCloseTo(1, 1);
    });
  });

  describe('Kyle Lambda', () => {
    it('正相关应返回正值（旧夹具线性价格使生产 lambda=0，改为凸型价格变化）', () => {
      const trades: Trade[] = Array.from({ length: 20 }, (_, i) => trade(100 + i * i * 0.01, 100 + i * 10, i));
      const lambda = calcKyleLambda(trades);
      expect(Number.isFinite(lambda)).toBe(true);
      expect(lambda).toBeGreaterThan(0);
    });

    it('数据不足返回零', () => {
      expect(calcKyleLambda([trade(10, 100, 1)])).toBe(0);
    });

    it('空数据返回零', () => {
      expect(calcKyleLambda([])).toBe(0);
    });

    it('下行且量递减应返回正值（新增：生产取 Math.abs，L396）', () => {
      const trades: Trade[] = Array.from({ length: 20 }, (_, i) => trade(100 - i * i * 0.01, 100 + (20 - i) * 10, i));
      expect(calcKyleLambda(trades)).toBeGreaterThan(0);
    });
  });

  describe('Amihud非流动性', () => {
    it('高流动性应返回小值', () => {
      const trades: Trade[] = Array.from({ length: 50 }, (_, i) => trade(10 + i * 0.01, 1000000, i));
      const series = calcAmihudIlliquidity(trades);
      expect(series[series.length - 1]).toBeLessThan(0.0001);
    });

    it('低流动性应返回大值（订正：生产按 dollarVolume 归一，旧阈值 0.0001→约 6e-6）', () => {
      const highTrades: Trade[] = Array.from({ length: 50 }, (_, i) => trade(10 + i * 0.01, 1000000, i));
      const lowTrades: Trade[] = Array.from({ length: 50 }, (_, i) => trade(10 + i * 0.5, 100, i));
      const high = calcAmihudIlliquidity(highTrades);
      const low = calcAmihudIlliquidity(lowTrades);
      const highLast = high[high.length - 1];
      const lowLast = low[low.length - 1];
      expect(lowLast).toBeGreaterThan(1e-7);
      expect(lowLast).toBeGreaterThan(highLast * 100);
    });

    it('空数据返回零（订正：生产返回空数组）', () => {
      expect(calcAmihudIlliquidity([])).toEqual([]);
    });

    it('零成交量跳过（订正：零量笔不参与均值，结果为 0）', () => {
      const trades: Trade[] = [
        trade(10, 100, 0),
        trade(10.02, 0, 1),
        trade(10.04, 1000, 2),
      ];
      const series = calcAmihudIlliquidity(trades);
      expect(series.length).toBe(3);
      expect(series[1]).toBe(0);
      expect(series[2]).toBeGreaterThan(0);
    });

    it('滚动数组长度与首元素正确（新增：L429-446）', () => {
      const trades: Trade[] = [
        trade(10, 100, 0),
        trade(10.02, 1000, 1),
        trade(10.04, 800, 2),
        trade(10.06, 600, 3),
      ];
      const series = calcAmihudIlliquidity(trades);
      expect(series.length).toBe(trades.length);
      expect(series[0]).toBe(0);
      expect(series[series.length - 1]).toBeGreaterThan(0);
    });
  });

  describe('Tick聚合K线', () => {
    it('单时间窗口应产生一根K线', () => {
      const ticks: Tick[] = [
        { price: 10, volume: 100, timestamp: 100 },
        { price: 11, volume: 200, timestamp: 200 },
        { price: 10.5, volume: 150, timestamp: 300 },
      ];
      const klines = aggregateTicksToK(ticks, 1000);
      expect(klines.length).toBe(1);
      expect(klines[0].open).toBe(10);
      expect(klines[0].high).toBe(11);
      expect(klines[0].low).toBe(10);
      expect(klines[0].close).toBe(10.5);
      expect(klines[0].volume).toBe(450);
      expect(klines[0].vwap).toBeCloseTo(10.611, 2);
    });

    it('多时间窗口应产生多根K线', () => {
      const ticks: Tick[] = [
        { price: 10, volume: 100, timestamp: 100 },
        { price: 11, volume: 200, timestamp: 1100 },
        { price: 12, volume: 150, timestamp: 2100 },
      ];
      const klines = aggregateTicksToK(ticks, 1000);
      expect(klines.length).toBe(3);
    });

    it('空tick返回空', () => {
      expect(aggregateTicksToK([], 1000)).toEqual([]);
    });

    it('VWAP应包含在K线中', () => {
      const ticks: Tick[] = [
        { price: 10, volume: 100, timestamp: 100 },
        { price: 20, volume: 100, timestamp: 200 },
      ];
      const klines = aggregateTicksToK(ticks, 1000);
      expect(klines[0].vwap).toBeCloseTo(15);
    });

    it('100个tick聚合正确', () => {
      const ticks: Tick[] = Array.from({ length: 100 }, (_, i) => ({
        price: 100 + Math.sin(i * 0.3) * 3,
        volume: 100 + i,
        timestamp: i * 1000,
      }));
      const klines = aggregateTicksToK(ticks, 10000);
      expect(klines.length).toBe(10);
      klines.forEach(k => {
        expect(k.high).toBeGreaterThanOrEqual(k.low);
        expect(k.volume).toBeGreaterThan(0);
      });
    });

    it('时间桶边界应分开（新增：999/1000 分属两桶）', () => {
      const ticks: Tick[] = [
        { price: 10, volume: 100, timestamp: 999 },
        { price: 10.5, volume: 100, timestamp: 1000 },
      ];
      const klines = aggregateTicksToK(ticks, 1000);
      expect(klines.length).toBe(2);
      expect(klines[0].close).toBe(10);
      expect(klines[1].close).toBe(10.5);
    });
  });

  describe('冰山订单检测', () => {
    it('应识别集中成交的冰山单（新增：orderFlowToxicityEngine.ts:492-545）', () => {
      const trades: Trade[] = Array.from({ length: 20 }, (_, i) =>
        i < 18 ? trade(10, 100, i) : trade(10.5, 100, i),
      );
      const icebergs = detectIcebergOrders(trades, 20);
      expect(icebergs.length).toBe(1);
      expect(icebergs[0].price).toBe(10);
      expect(icebergs[0].estimatedHiddenVolume).toBe(3600);
      expect(icebergs[0].confidence).toBeCloseTo(0.81, 2);
    });

    it('分散成交不应识别（新增）', () => {
      const trades: Trade[] = Array.from({ length: 10 }, (_, i) =>
        i < 5 ? trade(10, 100, i) : trade(10.5, 100, i),
      );
      expect(detectIcebergOrders(trades, 10)).toEqual([]);
    });

    it('样本不足返回空（新增）', () => {
      const trades: Trade[] = Array.from({ length: 19 }, (_, i) => trade(10, 100, i));
      expect(detectIcebergOrders(trades, 20)).toEqual([]);
    });
  });

  describe('订单流快照', () => {
    it('应生成完整订单流快照（新增：orderFlowToxicityEngine.ts:557-599）', () => {
      const trades: Trade[] = [
        trade(10, 100, 1000),
        trade(10.1, 200, 2000),
        trade(10.3, 300, 3000),
        trade(10.6, 400, 4000),
      ];
      const snapshot = generateOrderFlowSnapshot(trades, 500);
      if (!snapshot) throw new Error('snapshot should not be null');
      expect(snapshot.timestamp).toBe(4000);
      expect(snapshot.vpin).toBe(1);
      expect(snapshot.vpinSmoothed).toBe(1);
      expect(snapshot.toxicityLevel).toBe('EXTREME');
      expect(snapshot.cumulativeDelta).toBe(900);
      expect(snapshot.deltaPct).toBe(1);
      expect(snapshot.tradeImbalance).toBe(1);
      expect(snapshot.tradeIntensity).toBe(4);
      expect(snapshot.rollingVwap).toBeCloseTo(10.35);
      expect(snapshot.amihudIlliquidity).toBeGreaterThan(0);
      expect(snapshot.kyleLambda).toBeGreaterThan(0);
      expect(Number.isFinite(snapshot.kyleLambda)).toBe(true);
    });

    it('样本不足返回null（新增）', () => {
      expect(generateOrderFlowSnapshot([], 500)).toBeNull();
      expect(generateOrderFlowSnapshot([trade(10, 100, 1)], 500)).toBeNull();
    });
  });
});
