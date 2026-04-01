import { describe, it, expect } from 'vitest';

/**
 * 交易成本分析引擎测试
 */

interface ExecutionReport {
  symbol: string;
  side: 'buy' | 'sell';
  quantity: number;
  price: number;
  timestamp: Date;
  venue: string;
  orderType: 'market' | 'limit' | 'stop';
  commission: number;
  slippage: number;
}

interface TCAMetrics {
  totalCost: number;
  costBps: number;
  marketImpact: number;
  timingCost: number;
  commissionCost: number;
  slippageCost: number;
  implementation_shortfall: number;
  vwapPerformance: number;
  participationRate: number;
}

interface CostModel {
  fixedCost: number;
  variableCost: number;
  marketImpactCoeff: number;
  timingRiskCoeff: number;
}

function analyzeExecutionCost(
  executions: ExecutionReport[],
  arrivalPrice: number,
  vwap: number,
  avgDailyVolume: number
): TCAMetrics {
  if (executions.length === 0) {
    return { totalCost: 0, costBps: 0, marketImpact: 0, timingCost: 0, commissionCost: 0, slippageCost: 0, implementation_shortfall: 0, vwapPerformance: 0, participationRate: 0 };
  }
  const totalQty = executions.reduce((s, e) => s + e.quantity, 0);
  const totalValue = executions.reduce((s, e) => s + e.quantity * e.price, 0);
  const avgPrice = totalValue / totalQty;
  const totalCommission = executions.reduce((s, e) => s + e.commission, 0);
  const totalSlippage = executions.reduce((s, e) => s + e.slippage * e.quantity, 0);
  const side = executions[0].side;
  const shortfall = side === 'buy' ? (avgPrice - arrivalPrice) / arrivalPrice : (arrivalPrice - avgPrice) / arrivalPrice;
  const vwapPerf = side === 'buy' ? (vwap - avgPrice) / vwap : (avgPrice - vwap) / vwap;
  const participationRate = totalQty / avgDailyVolume;
  const marketImpact = 0.1 * Math.sqrt(participationRate) * (side === 'buy' ? 1 : -1);
  const timingCost = shortfall - marketImpact;
  const costBps = shortfall * 10000;
  return {
    totalCost: shortfall * totalValue,
    costBps,
    marketImpact: marketImpact * 10000,
    timingCost: timingCost * 10000,
    commissionCost: totalCommission,
    slippageCost: totalSlippage,
    implementation_shortfall: shortfall * 10000,
    vwapPerformance: vwapPerf * 10000,
    participationRate: participationRate * 100,
  };
}

function buildCostModel(historicalExecutions: ExecutionReport[]): CostModel {
  if (historicalExecutions.length === 0) {
    return { fixedCost: 0, variableCost: 0, marketImpactCoeff: 0, timingRiskCoeff: 0 };
  }
  const commissions = historicalExecutions.map(e => e.commission);
  const slippages = historicalExecutions.map(e => e.slippage);
  const fixedCost = commissions.reduce((s, c) => s + c, 0) / commissions.length;
  const variableCost = slippages.reduce((s, sl) => s + Math.abs(sl), 0) / slippages.length;
  const avgQty = historicalExecutions.reduce((s, e) => s + e.quantity, 0) / historicalExecutions.length;
  const marketImpactCoeff = variableCost * Math.sqrt(avgQty);
  const slippageStd = Math.sqrt(slippages.reduce((s, sl) => s + (sl - variableCost) ** 2, 0) / slippages.length);
  return {
    fixedCost: parseFloat(fixedCost.toFixed(4)),
    variableCost: parseFloat(variableCost.toFixed(6)),
    marketImpactCoeff: parseFloat(marketImpactCoeff.toFixed(4)),
    timingRiskCoeff: parseFloat(slippageStd.toFixed(6)),
  };
}

function compareVenues(executions: ExecutionReport[]): Array<{ venue: string; avgSlippage: number; avgCommission: number; costBps: number; count: number }> {
  const venueMap = new Map<string, ExecutionReport[]>();
  executions.forEach(e => {
    if (!venueMap.has(e.venue)) venueMap.set(e.venue, []);
    venueMap.get(e.venue)!.push(e);
  });
  return Array.from(venueMap.entries()).map(([venue, execs]) => {
    const avgSlippage = execs.reduce((s, e) => s + e.slippage, 0) / execs.length;
    const avgCommission = execs.reduce((s, e) => s + e.commission, 0) / execs.length;
    const costBps = avgSlippage * 10000 + avgCommission * 100;
    return { venue, avgSlippage: parseFloat(avgSlippage.toFixed(6)), avgCommission: parseFloat(avgCommission.toFixed(4)), costBps: parseFloat(costBps.toFixed(2)), count: execs.length };
  }).sort((a, b) => a.costBps - b.costBps);
}

describe('交易成本分析引擎', () => {
  const makeExec = (overrides: Partial<ExecutionReport> = {}): ExecutionReport => ({
    symbol: '600519', side: 'buy', quantity: 1000, price: 1800.5,
    timestamp: new Date(), venue: 'SH', orderType: 'market',
    commission: 5, slippage: 0.001, ...overrides,
  });

  describe('analyzeExecutionCost', () => {
    it('should return zeros for empty executions', () => {
      const metrics = analyzeExecutionCost([], 1800, 1800, 1000000);
      expect(metrics.totalCost).toBe(0);
      expect(metrics.costBps).toBe(0);
    });

    it('should calculate positive shortfall for buy above arrival', () => {
      const execs = [makeExec({ price: 1810 })];
      const metrics = analyzeExecutionCost(execs, 1800, 1805, 1000000);
      expect(metrics.implementation_shortfall).toBeGreaterThan(0);
    });

    it('should calculate negative shortfall for buy below arrival', () => {
      const execs = [makeExec({ price: 1790 })];
      const metrics = analyzeExecutionCost(execs, 1800, 1795, 1000000);
      expect(metrics.implementation_shortfall).toBeLessThan(0);
    });

    it('should calculate participation rate', () => {
      const execs = [makeExec({ quantity: 10000 })];
      const metrics = analyzeExecutionCost(execs, 1800, 1800, 100000);
      expect(metrics.participationRate).toBe(10);
    });

    it('should sum commissions and slippage', () => {
      const execs = [makeExec({ commission: 5, slippage: 0.002 }), makeExec({ commission: 3, slippage: 0.001 })];
      const metrics = analyzeExecutionCost(execs, 1800, 1800, 1000000);
      expect(metrics.commissionCost).toBe(8);
      expect(metrics.slippageCost).toBeCloseTo(3, 1); // 0.002*1000 + 0.001*1000 = 3
    });

    it('sell side should invert impact direction', () => {
      const buyExecs = [makeExec({ side: 'buy', price: 1810 })];
      const sellExecs = [makeExec({ side: 'sell', price: 1810 })];
      const buyMetrics = analyzeExecutionCost(buyExecs, 1800, 1805, 1000000);
      const sellMetrics = analyzeExecutionCost(sellExecs, 1800, 1805, 1000000);
      expect(Math.sign(buyMetrics.marketImpact)).not.toBe(Math.sign(sellMetrics.marketImpact));
    });
  });

  describe('buildCostModel', () => {
    it('should return zeros for empty data', () => {
      expect(buildCostModel([])).toEqual({ fixedCost: 0, variableCost: 0, marketImpactCoeff: 0, timingRiskCoeff: 0 });
    });

    it('should calculate model from executions', () => {
      const execs = [makeExec(), makeExec({ commission: 10, slippage: 0.002 })];
      const model = buildCostModel(execs);
      expect(model.fixedCost).toBeGreaterThan(0);
      expect(model.variableCost).toBeGreaterThan(0);
    });
  });

  describe('compareVenues', () => {
    it('should group by venue and sort by cost', () => {
      const execs = [
        makeExec({ venue: 'A', slippage: 0.002 }),
        makeExec({ venue: 'A', slippage: 0.003 }),
        makeExec({ venue: 'B', slippage: 0.001 }),
      ];
      const result = compareVenues(execs);
      expect(result).toHaveLength(2);
      expect(result[0].costBps).toBeLessThanOrEqual(result[1].costBps);
      expect(result.find(v => v.venue === 'A')?.count).toBe(2);
    });
  });
});
