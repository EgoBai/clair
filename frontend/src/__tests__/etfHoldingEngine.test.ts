import { describe, it, expect } from 'vitest';
import {
  analyzeETFHoldings,
  type ETFHolding,
  type ETFHoldingSnapshot,
} from '../utils/etfHoldingEngine';

/**
 * ETF持仓变动跟踪引擎测试 —— 导入真实模块 src/utils/etfHoldingEngine.ts
 *
 * 旧测试内联重实现了 detectHoldingChanges / calculateConcentration，并与真实模块存在差异：
 *  - 真实模块 changeType 由 sharesChangePct 决定，而非 weight；
 *  - 真实 HHI = Σ(weight*100)^2，effectiveN = 10000/hhiIndex。
 * 因此改为直接驱动真实导出的 analyzeETFHoldings。
 */

function makeSnapshot(holdings: ETFHolding[], date = '2024-03-31'): ETFHoldingSnapshot {
  return {
    etfCode: '510300',
    etfName: '沪深300ETF',
    date,
    totalValue: holdings.reduce((s, h) => s + h.marketValue, 0),
    holdings,
  };
}

const h = (stockCode: string, shares: number, weight: number, marketValue: number, stockName = stockCode): ETFHolding => ({
  stockCode,
  stockName,
  shares,
  marketValue,
  weight,
  changeFromPrev: 0,
});

describe('ETF持仓变动跟踪引擎', () => {
  describe('持仓变动检测 (analyzeETFHoldings.changes)', () => {
    it('检测新增持仓', () => {
      const prev = makeSnapshot([]);
      const curr = makeSnapshot([h('600519', 100, 0.05, 180000, '茅台')]);
      const { changes } = analyzeETFHoldings(curr, prev);
      expect(changes).toHaveLength(1);
      expect(changes[0].changeType).toBe('new');
      expect(changes[0].prevShares).toBe(0);
      expect(changes[0].currShares).toBe(100);
      expect(changes[0].sharesChangePct).toBe(Infinity);
    });

    it('检测剔除持仓', () => {
      const prev = makeSnapshot([h('600519', 100, 0.05, 180000, '茅台')]);
      const curr = makeSnapshot([]);
      const { changes } = analyzeETFHoldings(curr, prev);
      expect(changes).toHaveLength(1);
      expect(changes[0].changeType).toBe('removed');
      expect(changes[0].sharesChangePct).toBe(-1);
      expect(changes[0].currWeight).toBe(0);
    });

    it('检测增持 (按股份变化)', () => {
      const prev = makeSnapshot([h('600519', 100, 0.05, 180000, '茅台')]);
      const curr = makeSnapshot([h('600519', 200, 0.08, 360000, '茅台')]);
      const { changes } = analyzeETFHoldings(curr, prev);
      expect(changes).toHaveLength(1);
      expect(changes[0].changeType).toBe('increase');
      expect(changes[0].sharesChangePct).toBeCloseTo(1);
      expect(changes[0].prevShares).toBe(100);
      expect(changes[0].currShares).toBe(200);
    });

    it('检测减持 (按股份变化)', () => {
      const prev = makeSnapshot([h('600519', 100, 0.05, 180000, '茅台')]);
      const curr = makeSnapshot([h('600519', 50, 0.03, 90000, '茅台')]);
      const { changes } = analyzeETFHoldings(curr, prev);
      expect(changes).toHaveLength(1);
      expect(changes[0].changeType).toBe('decrease');
      expect(changes[0].sharesChangePct).toBeCloseTo(-0.5);
    });

    it('持仓完全一致时返回空变动', () => {
      const holdings = [h('600519', 100, 0.05, 180000, '茅台')];
      const { changes } = analyzeETFHoldings(makeSnapshot(holdings), makeSnapshot(holdings));
      expect(changes).toHaveLength(0);
    });
  });

  describe('持仓集中度 (analyzeETFHoldings.concentration)', () => {
    it('计算 top5 / top10 / top20 权重', () => {
      const holdings: ETFHolding[] = Array.from({ length: 10 }, (_, i) =>
        h(`${i}`, 100, 0.1 - i * 0.005, 100000, `S${i}`)
      );
      const { concentration } = analyzeETFHoldings(makeSnapshot(holdings));
      expect(concentration.top5Weight).toBeCloseTo(0.45, 5);
      expect(concentration.top10Weight).toBeCloseTo(0.775, 5);
    });

    it('等权时有效持仓数最大', () => {
      const holdings: ETFHolding[] = Array.from({ length: 100 }, (_, i) =>
        h(`${i}`, 100, 0.01, 10000, `S${i}`)
      );
      const { concentration } = analyzeETFHoldings(makeSnapshot(holdings));
      expect(concentration.hhiIndex).toBeCloseTo(100, 5);
      expect(concentration.effectiveN).toBeCloseTo(100, 0);
    });

    it('单一持仓时集中度最高', () => {
      const holdings = [h('600519', 100, 1, 180000, '茅台')];
      const { concentration } = analyzeETFHoldings(makeSnapshot(holdings));
      expect(concentration.top5Weight).toBe(1);
      expect(concentration.hhiIndex).toBe(10000);
      expect(concentration.effectiveN).toBeCloseTo(1, 1);
    });
  });

  describe('行业分布 (analyzeETFHoldings.sectorDist)', () => {
    it('根据 sectorMap 聚合行业权重', () => {
      const sectorMap = { '600519': '食品饮料', '000001': '金融' };
      const curr = makeSnapshot([
        h('600519', 100, 0.3, 180000, '茅台'),
        h('000001', 200, 0.2, 120000, '平安银行'),
        h('300750', 300, 0.1, 90000, '宁德时代'),
      ]);
      const { sectorDist } = analyzeETFHoldings(curr, undefined, sectorMap);
      const food = sectorDist.find(s => s.sector === '食品饮料');
      const fin = sectorDist.find(s => s.sector === '金融');
      const other = sectorDist.find(s => s.sector === '其他');
      expect(food?.weight).toBeCloseTo(0.3);
      expect(fin?.weight).toBeCloseTo(0.2);
      expect(other?.weight).toBeCloseTo(0.1);
    });

    it('无 sectorMap 时归为其他', () => {
      const curr = makeSnapshot([h('600519', 100, 0.5, 180000, '茅台')]);
      const { sectorDist } = analyzeETFHoldings(curr);
      expect(sectorDist).toHaveLength(1);
      expect(sectorDist[0].sector).toBe('其他');
      expect(sectorDist[0].weight).toBeCloseTo(0.5);
    });
  });

  describe('持仓偏离度 (analyzeETFHoldings.drift)', () => {
    it('无前一期时偏离度为 0', () => {
      const curr = makeSnapshot([h('600519', 100, 0.05, 180000, '茅台')]);
      const { drift } = analyzeETFHoldings(curr);
      expect(drift.trackingError).toBe(0);
      expect(drift.maxDeviation).toBe(0);
      expect(drift.driftScore).toBe(0);
    });

    it('前后权重变化时计算偏离', () => {
      const prev = makeSnapshot([h('600519', 100, 0.5, 180000, '茅台')]);
      const curr = makeSnapshot([h('600519', 100, 0.4, 180000, '茅台')]);
      const { drift } = analyzeETFHoldings(curr, prev);
      expect(drift.trackingError).toBeGreaterThan(0);
      expect(drift.maxDeviation).toBeCloseTo(0.1);
      expect(Array.isArray(drift.deviationStocks)).toBe(true);
    });
  });

  describe('风险预警 (analyzeETFHoldings.riskAlerts)', () => {
    it('高集中度触发集中度预警', () => {
      const curr = makeSnapshot([h('600519', 100, 1, 180000, '茅台')]);
      const { riskAlerts } = analyzeETFHoldings(curr);
      expect(riskAlerts.some(a => a.includes('前5大持仓占比超过50%'))).toBe(true);
      expect(riskAlerts.some(a => a.includes('HHI指数超过2500'))).toBe(true);
    });

    it('高偏离触发偏离预警', () => {
      const prev = makeSnapshot([h('600519', 100, 1, 180000, '茅台')]);
      const curr = makeSnapshot([h('600519', 100, 0.5, 180000, '茅台')]);
      const { riskAlerts } = analyzeETFHoldings(curr, prev);
      expect(riskAlerts.some(a => a.includes('持仓偏离度偏高'))).toBe(true);
    });

    it('正常持仓无预警', () => {
      const holdings: ETFHolding[] = Array.from({ length: 20 }, (_, i) =>
        h(`${i}`, 100, 0.05, 10000, `S${i}`)
      );
      const curr = makeSnapshot(holdings);
      const { riskAlerts } = analyzeETFHoldings(curr);
      expect(riskAlerts).toHaveLength(0);
    });
  });
});
