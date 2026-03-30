import { describe, it, expect } from 'vitest';

// 财务指标深度计算测试 — 55用例
describe('财务指标深度计算', () => {

  // 估值指标
  describe('估值指标', () => {
    function calcPE(price: number, eps: number) {
      if (eps <= 0) return Infinity;
      return price / eps;
    }

    function calcPB(price: number, bvps: number) {
      if (bvps <= 0) return Infinity;
      return price / bvps;
    }

    function calcPS(price: number, sps: number) {
      if (sps <= 0) return Infinity;
      return price / sps;
    }

    function calcEV_EBITDA(marketCap: number, debt: number, cash: number, ebitda: number) {
      if (ebitda <= 0) return Infinity;
      return (marketCap + debt - cash) / ebitda;
    }

    it('PE = 价格/每股收益', () => {
      expect(calcPE(100, 5)).toBe(20);
    });

    it('负收益PE为Infinity', () => {
      expect(calcPE(100, -2)).toBe(Infinity);
    });

    it('零收益PE为Infinity', () => {
      expect(calcPE(100, 0)).toBe(Infinity);
    });

    it('PB = 价格/每股净资产', () => {
      expect(calcPB(50, 25)).toBe(2);
    });

    it('负净资产PB为Infinity', () => {
      expect(calcPB(50, -5)).toBe(Infinity);
    });

    it('PS = 价格/每股营收', () => {
      expect(calcPS(30, 10)).toBe(3);
    });

    it('EV/EBITDA计算正确', () => {
      expect(calcEV_EBITDA(1000, 200, 100, 150)).toBeCloseTo(7.333, 2);
    });

    it('负EBITDA EV/EBITDA为Infinity', () => {
      expect(calcEV_EBITDA(1000, 200, 100, -50)).toBe(Infinity);
    });

    it('PE应为正数', () => {
      expect(calcPE(50, 2)).toBeGreaterThan(0);
    });

    it('不同价格PE不同', () => {
      expect(calcPE(100, 5)).not.toBe(calcPE(50, 5));
    });
  });

  // 盈利能力
  describe('盈利能力', () => {
    function grossMargin(revenue: number, cogs: number) {
      return revenue === 0 ? 0 : (revenue - cogs) / revenue;
    }

    function netMargin(revenue: number, netIncome: number) {
      return revenue === 0 ? 0 : netIncome / revenue;
    }

    function roe(netIncome: number, equity: number) {
      return equity === 0 ? 0 : netIncome / equity;
    }

    function roa(netIncome: number, assets: number) {
      return assets === 0 ? 0 : netIncome / assets;
    }

    it('毛利率计算正确', () => {
      expect(grossMargin(100, 60)).toBeCloseTo(0.4, 5);
    });

    it('毛利率净利率关系', () => {
      const gm = grossMargin(100, 60);
      const nm = netMargin(100, 20);
      expect(gm).toBeGreaterThan(nm);
    });

    it('零收入毛利率为0', () => {
      expect(grossMargin(0, 10)).toBe(0);
    });

    it('ROE计算正确', () => {
      expect(roe(10, 100)).toBeCloseTo(0.1, 5);
    });

    it('ROA计算正确', () => {
      expect(roa(10, 200)).toBeCloseTo(0.05, 5);
    });

    it('ROE应大于ROA（有杠杆时）', () => {
      // 净利润10，权益100，总资产200
      expect(roe(10, 100)).toBeGreaterThan(roa(10, 200));
    });

    it('零权益ROE为0', () => {
      expect(roe(10, 0)).toBe(0);
    });

    it('负利润ROE为负', () => {
      expect(roe(-10, 100)).toBeLessThan(0);
    });

    it('100%毛利率', () => {
      expect(grossMargin(100, 0)).toBe(1);
    });

    it('亏损净利率为负', () => {
      expect(netMargin(100, -10)).toBeLessThan(0);
    });
  });

  // 杜邦分析
  describe('杜邦分析', () => {
    function dupontROE(netMargin: number, assetTurnover: number, equityMultiplier: number) {
      return netMargin * assetTurnover * equityMultiplier;
    }

    it('杜邦三因子相乘等于ROE', () => {
      expect(dupontROE(0.1, 0.5, 2)).toBeCloseTo(0.1, 5);
    });

    it('高杠杆应提高ROE', () => {
      const lowLev = dupontROE(0.1, 0.5, 1.5);
      const highLev = dupontROE(0.1, 0.5, 3);
      expect(highLev).toBeGreaterThan(lowLev);
    });

    it('高周转应提高ROE', () => {
      const lowTurn = dupontROE(0.1, 0.3, 2);
      const highTurn = dupontROE(0.1, 0.8, 2);
      expect(highTurn).toBeGreaterThan(lowTurn);
    });

    it('零边际利润ROE为0', () => {
      expect(dupontROE(0, 0.5, 2)).toBe(0);
    });

    it('负因子ROE为负', () => {
      expect(dupontROE(-0.1, 0.5, 2)).toBeLessThan(0);
    });
  });

  // 偿债能力
  describe('偿债能力', () => {
    function currentRatio(currentAssets: number, currentLiabilities: number) {
      return currentLiabilities === 0 ? Infinity : currentAssets / currentLiabilities;
    }

    function quickRatio(currentAssets: number, inventory: number, currentLiabilities: number) {
      return currentLiabilities === 0 ? Infinity : (currentAssets - inventory) / currentLiabilities;
    }

    function debtToAssets(totalDebt: number, totalAssets: number) {
      return totalAssets === 0 ? 0 : totalDebt / totalAssets;
    }

    function interestCoverage(ebit: number, interestExpense: number) {
      return interestExpense === 0 ? Infinity : ebit / interestExpense;
    }

    it('流动比率>1表示短期偿债能力充足', () => {
      expect(currentRatio(200, 100)).toBeGreaterThan(1);
    });

    it('速动比率应小于流动比率', () => {
      expect(quickRatio(200, 50, 100)).toBeLessThan(currentRatio(200, 100));
    });

    it('资产负债率应在0-1之间', () => {
      const ratio = debtToAssets(50, 100);
      expect(ratio).toBeGreaterThanOrEqual(0);
      expect(ratio).toBeLessThanOrEqual(1);
    });

    it('利息保障倍数>1表示能覆盖利息', () => {
      expect(interestCoverage(50, 20)).toBeGreaterThan(1);
    });

    it('零负债利息保障为Infinity', () => {
      expect(interestCoverage(50, 0)).toBe(Infinity);
    });

    it('资不抵债资产负债率>1', () => {
      expect(debtToAssets(150, 100)).toBeGreaterThan(1);
    });

    it('零负债流动比率为Infinity', () => {
      expect(currentRatio(100, 0)).toBe(Infinity);
    });
  });

  // 营运能力
  describe('营运能力', () => {
    function inventoryTurnover(cogs: number, avgInventory: number) {
      return avgInventory === 0 ? 0 : cogs / avgInventory;
    }

    function receivableTurnover(revenue: number, avgReceivable: number) {
      return avgReceivable === 0 ? 0 : revenue / avgReceivable;
    }

    function totalAssetTurnover(revenue: number, avgAssets: number) {
      return avgAssets === 0 ? 0 : revenue / avgAssets;
    }

    function daysInventory(turnover: number) {
      return turnover === 0 ? 0 : 365 / turnover;
    }

    it('存货周转率计算正确', () => {
      expect(inventoryTurnover(600, 100)).toBe(6);
    });

    it('应收账款周转率计算正确', () => {
      expect(receivableTurnover(1000, 200)).toBe(5);
    });

    it('总资产周转率计算正确', () => {
      expect(totalAssetTurnover(500, 1000)).toBeCloseTo(0.5, 5);
    });

    it('存货天数=365/周转率', () => {
      expect(daysInventory(6)).toBeCloseTo(60.833, 1);
    });

    it('零存货周转天数为0', () => {
      expect(daysInventory(0)).toBe(0);
    });

    it('零平均存货周转率为0', () => {
      expect(inventoryTurnover(100, 0)).toBe(0);
    });

    it('高周转率天数应少', () => {
      expect(daysInventory(10)).toBeLessThan(daysInventory(5));
    });
  });
});
