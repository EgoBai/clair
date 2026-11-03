import { describe, it, expect } from 'vitest';
import type { Trade } from '../services/orderFlowToxicityEngine';
import {
  calcKyleLambda,
  calcVPIN,
  classifyTrade,
  detectIcebergOrders,
  orderImbalance,
} from '../services/orderFlowToxicityEngine';

/**
 * 订单流分析测试（影子测试迁移 · 批次 18）
 *
 * 生产真源：backend/src/services/orderFlowToxicityEngine.ts
 *   → classifyTrade(L60-62) / calcVPIN(L134-150) / orderImbalance(L293-303) /
 *     calcKyleLambda(L374-397) / detectIcebergOrders(L492-545)
 *
 * 迁移（旧内联 → 生产）：
 *   calcVPIN → calcVPIN；calcTradeImbalance → orderImbalance；calcKyleLambda → calcKyleLambda；
 *   detectIcebergOrders → detectIcebergOrders；calcTickRule → 本地 tickSigns(方向委托 classifyTrade)。
 *
 * 旧断言错在哪（旧行号指迁移前版本）：
 *   1) 方向判定：旧数据用 side 字段（Tick.side，旧 L5）；生产以 tick rule「price >= 前价 → BUY」
 *      判定（classifyTrade L60-62），side/aggressor 不参与。旧「均衡」用例是恒价 100 + 交替 side
 *      （旧 L111-118、L134-140），生产会全判 BUY：VPIN = [1, 1]（旧断言 < 0.5 失败）、
 *      交易不平衡 = 1（旧断言 |x| < 0.2 失败）。
 *   2) VPIN：旧第二参 buckets 是「桶数量」（旧 L7-19），按条数切片、每桶 |买量-卖量|/总量；
 *      生产第二参 bucketSize 是「成交量阈值」（L134-150），累计成交量达阈值才出桶、从第 2 笔起累计、
 *      空/单笔返回 []。100 笔 × 100 量：旧 buckets=10 → 10 个桶；生产 bucketSize=1000 → 9 个桶
 *      （末 900 量不足一桶）。
 *   3) 交易不平衡：旧从第 0 笔累计 side 字段（旧 L22-29）；生产 orderImbalance 从第 1 笔起累计、
 *      方向由 tick rule 判定（L293-303）。全买入两者均为 1；「均衡」改为一涨一跌等量成交，
 *      生产值 -1/99 ≈ -0.010101（旧数据在生产下为 1）。
 *   4) Kyle Lambda：旧用收益率 Δp/p、<2 笔返回 0、带符号 Cov/Var（可负，本数据旧值
 *      1.000050005001011e-6）；生产用价格差 Δp、要求 >=3 笔、返回 |Cov/Var|（本数据
 *      1.0000000000000511e-4）。
 *   5) 冰山订单：旧签名 (ticks, threshold) 按「连续同向成交占比」返回 {time, side, count}
 *      （旧 L50-61）；生产签名 (trades, windowSize=20, volumeThreshold=0.7) 按「最后窗口内
 *      各价位成交量占比」返回 {price, estimatedHiddenVolume, confidence}（L492-545）。
 *      旧断言 `length >= 0` 恒真、`< 25` 平凡成立，已换成具体价位/量/阈值断言。
 *   6) 数据生成器 makeTicks 使用随机数生成（旧 L83-90，不确定且本治理禁用），
 *      改为确定性价格序列 makeTrades。
 *
 * 未迁移（生产无对应导出，保留本地 helper，不虚构生产代码）：
 *   - calcMicroPrice：生产 orderFlowToxicityEngine 无盘口 micro price 导出
 *     （backend/src/api/_archived/order-book.ts:194 仅为归档注释，非生产导出）。
 *   - tickSigns：生产只有 classifyTrade(trade, prevPrice): 'BUY' | 'SELL'，无 ±1 序列 API；
 *     方向判定全部委托生产 classifyTrade，本地仅做符号映射。
 */

type Trend = 'up' | 'down' | 'alternate';

/**
 * 确定性行情构造（旧 makeTicks 的随机数生成已移除）：
 * up/down 每笔 ±0.01；alternate 为一涨一跌（偶数笔涨、奇数笔跌），成交量恒定。
 */
function makeTrades(count: number, trend: Trend, startPrice = 100, volume = 100): Trade[] {
  const trades: Trade[] = [];
  let price = startPrice;
  for (let i = 0; i < count; i++) {
    if (i > 0) {
      if (trend === 'up') price += 0.01;
      else if (trend === 'down') price -= 0.01;
      else price += i % 2 === 0 ? 0.01 : -0.01;
    }
    trades.push({ price: Number(price.toFixed(2)), volume, timestamp: 1_000 + i * 1_000 });
  }
  return trades;
}

/** 未迁移：生产无 ±1 交易符号序列 API；方向判定委托 classifyTrade（首笔以自身价格为前价）。 */
function tickSigns(trades: Trade[]): number[] {
  return trades.map((t, i) =>
    classifyTrade(t, i === 0 ? t.price : trades[i - 1].price) === 'BUY' ? 1 : -1
  );
}

/** 未迁移：生产无盘口 micro price 导出（见文件头说明）。 */
function calcMicroPrice(
  bids: { price: number; volume: number }[],
  asks: { price: number; volume: number }[]
): number {
  if (bids.length === 0 || asks.length === 0) return 0;
  const bestBid = bids[0].price, bestAsk = asks[0].price;
  const bidVol = bids[0].volume, askVol = asks[0].volume;
  const total = bidVol + askVol;
  return total === 0 ? (bestBid + bestAsk) / 2 : (bestBid * askVol + bestAsk * bidVol) / total;
}

describe('订单流分析', () => {
  describe('VPIN计算', () => {
    it('应该返回正确数量的桶', () => {
      // 生产按成交量桶：99 笔各 100 量 = 9900 量，bucketSize=1000 → 9 桶，5000 → 1 桶
      expect(calcVPIN(makeTrades(100, 'up'), 1000)).toHaveLength(9);
      expect(calcVPIN(makeTrades(100, 'up'), 5000)).toHaveLength(1);
    });

    it('VPIN应该在0到1之间', () => {
      const vpin = calcVPIN(makeTrades(100, 'alternate'), 500);
      expect(vpin.length).toBeGreaterThan(0);
      for (const v of vpin) {
        expect(v).toBeGreaterThanOrEqual(0);
        expect(v).toBeLessThanOrEqual(1);
      }
    });

    it('单向订单流VPIN应该接近1', () => {
      // 价格单调上行 → 每笔 tick rule 均判 BUY → 每桶 |V_buy - 0| / V_bucket = 1
      const vpin = calcVPIN(makeTrades(50, 'up'), 500);
      expect(vpin).toHaveLength(9);
      expect(vpin.every(v => v === 1)).toBe(true);
    });

    it('均衡订单流VPIN应该接近0', () => {
      // 一涨一跌、各 100 量、桶 200 → 每桶买卖各 100
      expect(calcVPIN(makeTrades(6, 'alternate'), 200)).toEqual([0, 0]);
    });

    it('同价成交按tick规则全判BUY（旧按side字段误判为均衡）', () => {
      const flat: Trade[] = Array.from({ length: 6 }, (_, i) => ({
        price: 100,
        volume: 100,
        timestamp: i,
      }));
      // price >= 前价 → BUY（classifyTrade L60-62），故每桶全为买方量
      expect(calcVPIN(flat, 200)).toEqual([1, 1]);
      expect(orderImbalance(flat)).toBe(1);
    });

    it('空数据不应该崩溃', () => {
      expect(calcVPIN([], 1000)).toEqual([]);
      // 生产要求至少 2 笔（L135），单笔返回空数组
      expect(calcVPIN([{ price: 100, volume: 100, timestamp: 0 }], 1000)).toEqual([]);
    });
  });

  describe('交易不平衡', () => {
    it('全买入应该返回1', () => {
      expect(orderImbalance(makeTrades(10, 'up'))).toBe(1);
    });

    it('全卖出应该返回-1', () => {
      expect(orderImbalance(makeTrades(10, 'down'))).toBe(-1);
    });

    it('均衡应该接近0', () => {
      // 100 笔一涨一跌：tick rule 判 49 笔 BUY、50 笔 SELL → (49-50)/99
      expect(orderImbalance(makeTrades(100, 'alternate'))).toBeCloseTo(-1 / 99, 10);
    });

    it('空数据应该返回0', () => {
      expect(orderImbalance([])).toBe(0);
      expect(orderImbalance([{ price: 100, volume: 100, timestamp: 0 }])).toBe(0);
    });

    it('应该在-1到1之间', () => {
      const imbalance = orderImbalance(makeTrades(50, 'alternate'));
      expect(imbalance).toBeCloseTo(-1 / 49, 10);
      expect(imbalance).toBeGreaterThanOrEqual(-1);
      expect(imbalance).toBeLessThanOrEqual(1);
    });
  });

  describe('Kyle Lambda', () => {
    it('应该返回数值', () => {
      const lambda = calcKyleLambda(makeTrades(50, 'alternate'));
      // 生产用价格差 Δp（非收益率）且取绝对值；旧自抄值 1.000050005001011e-6
      expect(lambda).toBeGreaterThanOrEqual(0);
      expect(lambda).toBeCloseTo(1e-4, 8);
    });

    it('数据不足应该返回0', () => {
      // 生产要求 >= 3 笔（L375），旧自抄为 < 2 笔
      expect(calcKyleLambda([{ price: 100, volume: 100, timestamp: 0 }])).toBe(0);
      expect(
        calcKyleLambda([
          { price: 100, volume: 100, timestamp: 0 },
          { price: 101, volume: 100, timestamp: 1 },
        ])
      ).toBe(0);
    });

    it('应该为有限值', () => {
      expect(Number.isFinite(calcKyleLambda(makeTrades(50, 'alternate')))).toBe(true);
      // 恒定方向 → 带符号成交量方差为 0 → 生产返回 0
      expect(calcKyleLambda(makeTrades(30, 'up'))).toBe(0);
    });
  });

  describe('冰山订单检测', () => {
    /** 前 20 笔常规成交 + 最后 20 笔窗口：17 笔集中在 100.00（各 1000 股）、3 笔在 100.02（各 100 股） */
    function makeConcentratedTrades(): Trade[] {
      const trades: Trade[] = [];
      for (let i = 0; i < 20; i++) {
        trades.push({ price: 100.5, volume: 500, timestamp: 1_000 + i });
      }
      for (let i = 0; i < 17; i++) {
        trades.push({ price: 100, volume: 1_000, timestamp: 2_000 + i });
      }
      for (let i = 0; i < 3; i++) {
        trades.push({ price: 100.02, volume: 100, timestamp: 3_000 + i });
      }
      return trades;
    }

    it('应该检测集中于单一价位的隐藏大单', () => {
      const icebergs = detectIcebergOrders(makeConcentratedTrades());
      // 最后窗口 17300 量中 17000 量在 100.00（占比 0.9827 > 0.7，且 17 笔 >= 3）
      expect(icebergs).toHaveLength(1);
      expect(icebergs[0].price).toBe(100);
      expect(icebergs[0].estimatedHiddenVolume).toBe(34_000);
      expect(icebergs[0].confidence).toBeCloseTo(0.8352601156069364, 10);
    });

    it('分散成交不应产生冰山信号', () => {
      const dispersed: Trade[] = Array.from({ length: 20 }, (_, i) => ({
        price: Number((100 + i * 0.01).toFixed(2)),
        volume: 1_000,
        timestamp: 1_000 + i,
      }));
      // 每个价位占比仅 0.05，均低于默认 volumeThreshold=0.7
      expect(detectIcebergOrders(dispersed)).toEqual([]);
    });

    it('提高成交量占比阈值会减少检测', () => {
      // 100.00 占比 0.9827：阈值 0.9 命中，阈值 0.99 不命中
      expect(detectIcebergOrders(makeConcentratedTrades(), 20, 0.9)).toHaveLength(1);
      expect(detectIcebergOrders(makeConcentratedTrades(), 20, 0.99)).toHaveLength(0);
    });

    it('结果应该包含必要字段', () => {
      const icebergs = detectIcebergOrders(makeConcentratedTrades());
      expect(icebergs.length).toBe(1);
      for (const ib of icebergs) {
        expect(typeof ib.price).toBe('number');
        expect(ib.price).toBeGreaterThan(0);
        expect(ib.estimatedHiddenVolume).toBeGreaterThan(0);
        expect(ib.confidence).toBeGreaterThan(0);
        expect(ib.confidence).toBeLessThanOrEqual(1);
      }
    });

    it('窗口不足应该返回空数组', () => {
      // 生产要求 trades.length >= windowSize（L497）
      expect(detectIcebergOrders(makeTrades(10, 'up'))).toEqual([]);
    });
  });

  describe('微观价格', () => {
    it('应该在买卖价之间', () => {
      const bids = [{ price: 99, volume: 500 }, { price: 98, volume: 300 }];
      const asks = [{ price: 101, volume: 400 }, { price: 102, volume: 200 }];
      const mp = calcMicroPrice(bids, asks);
      // (99*400 + 101*500) / 900
      expect(mp).toBeCloseTo(90_100 / 900, 10);
      expect(mp).toBeGreaterThan(99);
      expect(mp).toBeLessThan(101);
    });

    it('均衡盘应该接近中间价', () => {
      const bids = [{ price: 100, volume: 500 }];
      const asks = [{ price: 101, volume: 500 }];
      expect(calcMicroPrice(bids, asks)).toBeCloseTo(100.5, 10);
    });

    it('空盘应该返回0', () => {
      expect(calcMicroPrice([], [])).toBe(0);
    });

    it('买盘量大时微观价格偏向卖价（买压）', () => {
      const bids = [{ price: 99, volume: 10_000 }];
      const asks = [{ price: 101, volume: 100 }];
      const mp = calcMicroPrice(bids, asks);
      // (99*100 + 101*10000) / 10100 ≈ 100.98：买量大时价格向卖价偏移
      expect(mp).toBeCloseTo(1_019_900 / 10_100, 10);
      expect(mp).toBeGreaterThan(100.5);
    });
  });

  describe('Tick规则', () => {
    it('应该返回与输入等长的数组', () => {
      const trades = makeTrades(20, 'alternate');
      expect(tickSigns(trades)).toHaveLength(trades.length);
    });

    it('所有值应该是1或-1', () => {
      const signs = tickSigns(makeTrades(10, 'up'));
      for (const s of signs) {
        expect([1, -1]).toContain(s);
      }
      // 生产判定：price >= 前价（含持平）→ BUY，否则 SELL
      expect(classifyTrade({ price: 100, volume: 1, timestamp: 0 }, 100)).toBe('BUY');
      expect(classifyTrade({ price: 99.99, volume: 1, timestamp: 0 }, 100)).toBe('SELL');
    });
  });
});
