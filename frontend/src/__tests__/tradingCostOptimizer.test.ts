import { describe, it, expect } from 'vitest';

// 交易成本优化引擎
interface OrderParams {
  symbol: string;
  side: 'buy' | 'sell';
  shares: number;
  price: number;
  orderType: 'market' | 'limit';
}

interface CostBreakdown {
  commission: number;
  stampDuty: number;
  transferFee: number;
  slippage: number;
  total: number;
  effectivePrice: number;
}

interface SplitRecommendation {
  chunks: number;
  sharesPerChunk: number[];
  estimatedImpact: number;
  totalTime: number;
}

function calcCommission(shares: number, price: number, rate: number = 0.0003): number {
  const raw = shares * price * rate;
  return Math.max(raw, 5); // 最低5元
}

function calcStampDuty(side: string, amount: number): number {
  return side === 'sell' ? amount * 0.001 : 0; // 卖出千一
}

function calcTransferFee(shares: number): number {
  return shares * 0.00001; // 万分之0.1
}

function estimateSlippage(orderType: string, volume: number, shares: number): number {
  if (orderType === 'limit') return 0;
  const participation = shares / (volume || 1);
  return Math.min(participation * 0.002, 0.005); // 最大0.5%
}

function calcTotalCost(order: OrderParams, volume: number = 1000000): CostBreakdown {
  const amount = order.shares * order.price;
  const commission = calcCommission(order.shares, order.price);
  const stampDuty = calcStampDuty(order.side, amount);
  const transferFee = calcTransferFee(order.shares);
  const slippageRate = estimateSlippage(order.orderType, volume, order.shares);
  const slippage = amount * slippageRate;
  const total = commission + stampDuty + transferFee + slippage;
  const effectivePrice = order.price + (order.side === 'buy' ? 1 : -1) * (total / order.shares);
  return { commission, stampDuty, transferFee, slippage, total, effectivePrice };
}

function optimizeSplit(order: OrderParams, maxParticipation: number = 0.05, volume: number = 1000000): SplitRecommendation {
  const maxSharesPerChunk = Math.floor(volume * maxParticipation);
  if (order.shares <= maxSharesPerChunk) {
    return { chunks: 1, sharesPerChunk: [order.shares], estimatedImpact: estimateSlippage('market', volume, order.shares), totalTime: 1 };
  }
  const chunks = Math.ceil(order.shares / maxSharesPerChunk);
  const base = Math.floor(order.shares / chunks);
  const remainder = order.shares % chunks;
  const sharesPerChunk = Array(chunks).fill(base);
  for (let i = 0; i < remainder; i++) sharesPerChunk[i]++;
  const impact = estimateSlippage('market', volume, maxSharesPerChunk);
  return { chunks, sharesPerChunk, estimatedImpact: impact, totalTime: chunks * 5 };
}

function calcCostSavings(original: CostBreakdown, optimized: CostBreakdown): { saved: number; percent: number } {
  const saved = original.total - optimized.total;
  return { saved, percent: original.total > 0 ? (saved / original.total) * 100 : 0 };
}

describe('交易成本优化引擎', () => {
  const order: OrderParams = { symbol: '600519', side: 'buy', shares: 10000, price: 1800, orderType: 'market' };

  it('应计算佣金（最低5元）', () => {
    expect(calcCommission(100, 10)).toBe(5); // 0.3 < 5
    expect(calcCommission(10000, 1800)).toBe(10000 * 1800 * 0.0003);
  });

  it('买入不收印花税', () => {
    expect(calcStampDuty('buy', 1000000)).toBe(0);
  });

  it('卖出收千一印花税', () => {
    expect(calcStampDuty('sell', 1000000)).toBe(1000);
  });

  it('应计算过户费', () => {
    expect(calcTransferFee(10000)).toBeCloseTo(0.1, 5);
  });

  it('限价单无滑点', () => {
    expect(estimateSlippage('limit', 1000000, 1000)).toBe(0);
  });

  it('市价单有滑点', () => {
    const slippage = estimateSlippage('market', 1000000, 50000);
    expect(slippage).toBeGreaterThan(0);
    expect(slippage).toBeLessThanOrEqual(0.005);
  });

  it('应计算总成本', () => {
    const cost = calcTotalCost(order);
    expect(cost.commission).toBeGreaterThan(0);
    expect(cost.total).toBeGreaterThan(0);
    expect(cost.effectivePrice).toBeGreaterThan(order.price);
  });

  it('卖出应有印花税', () => {
    const sellOrder: OrderParams = { ...order, side: 'sell' };
    const cost = calcTotalCost(sellOrder);
    expect(cost.stampDuty).toBeGreaterThan(0);
    expect(cost.effectivePrice).toBeLessThan(order.price);
  });

  it('小单不应拆分', () => {
    const smallOrder: OrderParams = { ...order, shares: 1000 };
    const rec = optimizeSplit(smallOrder);
    expect(rec.chunks).toBe(1);
  });

  it('大单应拆分', () => {
    const bigOrder: OrderParams = { ...order, shares: 100000 };
    const rec = optimizeSplit(bigOrder, 0.05, 100000);
    expect(rec.chunks).toBeGreaterThan(1);
    expect(rec.sharesPerChunk.reduce((a, b) => a + b, 0)).toBe(bigOrder.shares);
  });

  it('应计算成本节约', () => {
    const orig = calcTotalCost({ ...order, orderType: 'market' });
    const opt = calcTotalCost({ ...order, orderType: 'limit' });
    const savings = calcCostSavings(orig, opt);
    expect(savings.saved).toBeGreaterThanOrEqual(0);
  });
});
