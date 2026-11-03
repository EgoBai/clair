/**
 * 交易成本优化引擎测试 — 影子测试迁移（批次 23）
 *
 * 已绑定生产实现（frontend/src/utils/）：
 * - tradingCostEngine.ts:80    calcCommission(amount, rate = 0.00025, minFee = 5)
 * - tradingCostEngine.ts:91    estimateSlippage(order, market)
 * - tradingCostEngine.ts:143   estimateTotalCost(order, market)
 * - tradingCostEngine.ts:198   suggestSlicing(order, market)
 * - aStockTradeCostEngine.ts:82 calculateTradeCost(price, quantity, side)
 *
 * 旧断言错在哪（旧值 → 生产值）：
 * | 旧断言 | 生产行为 | 依据 |
 * | calcCommission(shares, price) = 5400 | 入参是成交额：18,000,000 × 0.00025 = 4500 | tradingCostEngine.ts:80-86 |
 * | 限价单滑点 = 0 | estimateSlippage 不读 orderType，限价 = 市价 = 0.0104 | tradingCostEngine.ts:91-116 |
 * | 市价滑点 <= 0.005 | 生产没有上限，spread/2 × 波动率系数 = 0.0104 | tradingCostEngine.ts:96,113 |
 * | 过户费按股数 10000 × 0.00001 | 生产按成交额：tradeAmount × 0.00001 | aStockTradeCostEngine.ts:105 |
 * | 总成本字段 total / effectivePrice | 生产返回 totalCost / estimatedFillPrice | tradingCostEngine.ts:143-192 |
 * | optimizeSplit 自造分块 | 生产 suggestSlicing 按 ADV × 参与率切片 | tradingCostEngine.ts:198-257 |
 *
 * 未迁移（生产无对应实现，保留本地 helper 与用例）：
 * - calcCostSavings：生产没有成本节约 API；suggestSlicing 的 15% 只是注释常数。
 *
 * 本地保留业务规则：成本节约（用生产 estimateTotalCost 的 totalCost 求差）。
 * 生产缺陷候选：
 * - estimateSlippage 忽略 orderType：限价单仍计滑点，且与市价单完全相同。
 * - 滑点没有上限（本夹具 0.0104 已超过旧假设的 0.005）。
 * - estimateTotalCost 不含印花税/过户费，A 股卖出成本会被低估（需配合 calculateTradeCost）。
 * 新增：滑点随规模/紧迫度 1 例、拆单每片上限 1 例。
 */

import { describe, it, expect } from 'vitest';
import {
  calcCommission,
  estimateSlippage,
  estimateTotalCost,
  suggestSlicing,
  type OrderParams,
  type MarketCondition,
} from '../utils/tradingCostEngine';
import { calculateTradeCost } from '../utils/aStockTradeCostEngine';

const order: OrderParams = {
  ticker: '600519',
  side: 'buy',
  quantity: 10000,
  price: 1800,
  urgency: 'medium',
  orderType: 'market',
};

const market: MarketCondition = {
  ticker: '600519',
  avgDailyVolume: 50_000_000,
  bidAskSpread: 0.02,
  volatility: 0.02,
  depth: [],
  participationRate: 0.05,
};

// 未迁移：生产没有成本节约 API（suggestSlicing 的 15% 只是注释常数）。
function calcCostSavings(originalTotal: number, optimizedTotal: number): { saved: number; percent: number } {
  const saved = originalTotal - optimizedTotal;
  return { saved, percent: originalTotal > 0 ? (saved / originalTotal) * 100 : 0 };
}

describe('交易成本优化引擎', () => {
  it('应计算佣金（最低5元，入参为成交额）', () => {
    expect(calcCommission(100 * 10)).toBe(5); // 1000 × 0.00025 = 0.25 < 5
    expect(calcCommission(10000 * 1800)).toBe(4500); // 旧断言 5400：费率与入参口径都错
    expect(calcCommission(1_000_000, 0.0003)).toBe(300);
  });

  it('买入不收印花税', () => {
    expect(calculateTradeCost(100, 10000, 'buy').stampDuty).toBe(0);
  });

  it('卖出收千一印花税', () => {
    expect(calculateTradeCost(100, 10000, 'sell').stampDuty).toBe(1000);
  });

  it('应计算过户费（按成交额，不按股数）', () => {
    const one = calculateTradeCost(10, 1000, 'buy'); // 成交额 10,000
    expect(one.transferFee).toBeCloseTo(0.1, 5);
    const two = calculateTradeCost(10, 2000, 'buy'); // 成交额 20,000
    expect(two.transferFee).toBeCloseTo(0.2, 5);
  });

  it('限价单滑点与市价单相同（生产忽略 orderType）', () => {
    const limit = estimateSlippage({ ...order, orderType: 'limit' }, market);
    const marketSlippage = estimateSlippage(order, market);
    expect(limit).toBeCloseTo(0.0104, 6); // 旧断言 0
    expect(limit).toBe(marketSlippage); // 生产缺陷候选
  });

  it('市价单有滑点且无 0.5% 上限', () => {
    const slippage = estimateSlippage(order, market);
    expect(slippage).toBeGreaterThan(0);
    expect(slippage).toBeCloseTo(0.0104, 6); // 旧断言 <= 0.005
  });

  it('应计算总成本', () => {
    const cost = estimateTotalCost(order, market);
    expect(cost.breakdown.commission).toBe(4500);
    expect(cost.totalCost).toBeGreaterThan(0);
    expect(cost.costBps).toBeGreaterThan(0);
    expect(cost.estimatedFillPrice).toBeGreaterThan(order.price);
    expect(cost.estimatedFillPrice).toBeCloseTo(1818.9753, 4);
  });

  it('卖出应有印花税且成交价低于标价', () => {
    const sellOrder: OrderParams = { ...order, side: 'sell' };
    const sellCost = estimateTotalCost(sellOrder, market);
    const tradeCost = calculateTradeCost(order.price, order.quantity, 'sell');

    expect(tradeCost.stampDuty).toBe(18000); // 18,000,000 × 0.001
    expect(sellCost.estimatedFillPrice).toBeLessThan(order.price);
  });

  it('小单不应拆分', () => {
    const rec = suggestSlicing({ ...order, quantity: 1000 }, market);
    expect(rec.slices.length).toBe(1);
    expect(rec.slices[0]!.quantity).toBe(1000);
    expect(rec.algo).toBe('iceberg');
  });

  it('大单应拆分且分块之和等于委托量', () => {
    const bigOrder: OrderParams = { ...order, quantity: 10_000_000 };
    const rec = suggestSlicing(bigOrder, market);

    expect(rec.slices.length).toBe(2);
    expect(rec.slices.reduce((sum, slice) => sum + slice.quantity, 0)).toBe(bigOrder.quantity);
    expect(rec.algo).toBe('iceberg');
    expect(rec.estimatedDuration).toBe(1800);
  });

  it('应计算成本节约（生产 orderType 不影响总成本）', () => {
    const original = estimateTotalCost({ ...order, orderType: 'market' }, market).totalCost;
    const optimized = estimateTotalCost({ ...order, orderType: 'limit' }, market).totalCost;
    const savings = calcCostSavings(original, optimized);

    expect(savings.saved).toBeGreaterThanOrEqual(0);
    expect(savings.saved).toBeCloseTo(0, 10); // 生产缺陷候选：限价单没有成本优势
  });

  it('滑点随订单规模与紧迫度上升', () => {
    const base = estimateSlippage(order, market);
    const large = estimateSlippage({ ...order, quantity: 10_000_000 }, market);
    const immediate = estimateSlippage({ ...order, urgency: 'immediate' }, market);

    expect(large).toBeGreaterThan(base);
    expect(large).toBeCloseTo(0.0208, 10);
    expect(immediate).toBeGreaterThan(base);
    expect(immediate).toBeCloseTo(0.026, 10);
  });

  it('拆单每片不超过 ADV × 参与率', () => {
    const rec = suggestSlicing({ ...order, quantity: 10_000_000 }, market);
    const maxSlice = Math.floor(market.avgDailyVolume * 0.1);

    rec.slices.forEach((slice) => {
      expect(slice.quantity).toBeLessThanOrEqual(maxSlice);
    });
    expect(rec.estimatedCost).toBeGreaterThan(0);
  });
});
