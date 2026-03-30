import { describe, it, expect } from 'vitest';

// 财务比率计算引擎
describe('财务比率计算引擎', () => {
  describe('估值指标', () => {
    function peRatio(price: number, eps: number): number | null {
      if (eps <= 0) return null;
      return price / eps;
    }

    function pbRatio(price: number, bvps: number): number | null {
      if (bvps <= 0) return null;
      return price / bvps;
    }

    function psRatio(marketCap: number, revenue: number): number | null {
      if (revenue <= 0) return null;
      return marketCap / revenue;
    }

    function pcfRatio(marketCap: number, operatingCashFlow: number): number | null {
      if (operatingCashFlow <= 0) return null;
      return marketCap / operatingCashFlow;
    }

    function evToEbitda(ev: number, ebitda: number): number | null {
      if (ebitda <= 0) return null;
      return ev / ebitda;
    }

    function pegRatio(pe: number, growthRate: number): number | null {
      if (growthRate <= 0) return null;
      return pe / growthRate;
    }

    it('计算PE', () => {
      expect(peRatio(50, 5)).toBe(10);
    });

    it('亏损公司PE为null', () => {
      expect(peRatio(50, -2)).toBeNull();
    });

    it('零利润PE为null', () => {
      expect(peRatio(50, 0)).toBeNull();
    });

    it('计算PB', () => {
      expect(pbRatio(20, 10)).toBe(2);
    });

    it('负净资产PB为null', () => {
      expect(pbRatio(20, -5)).toBeNull();
    });

    it('计算PS', () => {
      expect(psRatio(100e8, 50e8)).toBe(2);
    });

    it('负收入PS为null', () => {
      expect(psRatio(100e8, -10e8)).toBeNull();
    });

    it('计算PCF', () => {
      expect(pcfRatio(200e8, 20e8)).toBe(10);
    });

    it('负现金流PCF为null', () => {
      expect(pcfRatio(200e8, -5e8)).toBeNull();
    });

    it('计算EV/EBITDA', () => {
      expect(evToEbitda(500e8, 50e8)).toBe(10);
    });

    it('负EBITDA返回null', () => {
      expect(evToEbitda(500e8, -10e8)).toBeNull();
    });

    it('计算PEG', () => {
      expect(pegRatio(20, 25)).toBe(0.8);
    });

    it('负增长率PEG为null', () => {
      expect(pegRatio(20, -5)).toBeNull();
    });

    it('零增长率PEG为null', () => {
      expect(pegRatio(20, 0)).toBeNull();
    });

    it('低PEG可能被低估', () => {
      const peg = pegRatio(15, 30);
      expect(peg).toBeLessThan(1);
    });
  });

  describe('盈利能力指标', () => {
    function grossMargin(grossProfit: number, revenue: number): number {
      return revenue === 0 ? 0 : (grossProfit / revenue) * 100;
    }

    function operatingMargin(operatingIncome: number, revenue: number): number {
      return revenue === 0 ? 0 : (operatingIncome / revenue) * 100;
    }

    function netMargin(netIncome: number, revenue: number): number {
      return revenue === 0 ? 0 : (netIncome / revenue) * 100;
    }

    function roe(netIncome: number, equity: number): number {
      return equity === 0 ? 0 : (netIncome / equity) * 100;
    }

    function roa(netIncome: number, totalAssets: number): number {
      return totalAssets === 0 ? 0 : (netIncome / totalAssets) * 100;
    }

    function roic(nopat: number, investedCapital: number): number {
      return investedCapital === 0 ? 0 : (nopat / investedCapital) * 100;
    }

    it('计算毛利率', () => {
      expect(grossMargin(60, 100)).toBe(60);
    });

    it('零收入毛利率为0', () => {
      expect(grossMargin(60, 0)).toBe(0);
    });

    it('计算营业利润率', () => {
      expect(operatingMargin(20, 100)).toBe(20);
    });

    it('计算净利润率', () => {
      expect(netMargin(15, 100)).toBe(15);
    });

    it('计算ROE', () => {
      expect(roe(10, 100)).toBe(10);
    });

    it('零净资产ROE为0', () => {
      expect(roe(10, 0)).toBe(0);
    });

    it('计算ROA', () => {
      expect(roa(10, 200)).toBe(5);
    });

    it('计算ROIC', () => {
      expect(roic(15, 100)).toBe(15);
    });

    it('毛利率高于营业利润率', () => {
      expect(grossMargin(60, 100)).toBeGreaterThan(operatingMargin(20, 100));
    });

    it('营业利润率高于净利润率', () => {
      expect(operatingMargin(20, 100)).toBeGreaterThan(netMargin(15, 100));
    });

    it('ROE为杜邦分析核心', () => {
      const netMarginVal = 10;
      const assetTurnover = 0.5;
      const equityMultiplier = 3;
      const roeVal = netMarginVal * assetTurnover * equityMultiplier;
      expect(roeVal).toBe(15);
    });
  });

  describe('偿债能力指标', () => {
    function currentRatio(currentAssets: number, currentLiabilities: number): number {
      return currentLiabilities === 0 ? Infinity : currentAssets / currentLiabilities;
    }

    function quickRatio(currentAssets: number, inventory: number, currentLiabilities: number): number {
      return currentLiabilities === 0 ? Infinity : (currentAssets - inventory) / currentLiabilities;
    }

    function debtToEquity(totalDebt: number, equity: number): number {
      return equity === 0 ? Infinity : totalDebt / equity;
    }

    function debtToAssets(totalDebt: number, totalAssets: number): number {
      return totalAssets === 0 ? 0 : totalDebt / totalAssets;
    }

    function interestCoverage(ebit: number, interestExpense: number): number {
      return interestExpense === 0 ? Infinity : ebit / interestExpense;
    }

    it('流动比率>1为安全', () => {
      expect(currentRatio(200, 100)).toBe(2);
      expect(currentRatio(200, 100)).toBeGreaterThan(1);
    });

    it('零流动负债流动比率为无穷', () => {
      expect(currentRatio(100, 0)).toBe(Infinity);
    });

    it('速动比率排除存货', () => {
      expect(quickRatio(200, 50, 100)).toBe(1.5);
    });

    it('速动比率低于流动比率', () => {
      const current = currentRatio(200, 100);
      const quick = quickRatio(200, 50, 100);
      expect(quick).toBeLessThan(current);
    });

    it('计算资产负债率', () => {
      expect(debtToEquity(100, 200)).toBe(0.5);
    });

    it('零净资产负债率为无穷', () => {
      expect(debtToEquity(100, 0)).toBe(Infinity);
    });

    it('计算负债占总资产比', () => {
      expect(debtToAssets(100, 300)).toBeCloseTo(0.333, 2);
    });

    it('利息保障倍数', () => {
      expect(interestCoverage(50, 10)).toBe(5);
    });

    it('利息保障倍数<1有风险', () => {
      expect(interestCoverage(5, 10)).toBeLessThan(1);
    });
  });

  describe('营运能力指标', () => {
    function inventoryTurnover(cogs: number, avgInventory: number): number {
      return avgInventory === 0 ? 0 : cogs / avgInventory;
    }

    function receivableTurnover(revenue: number, avgReceivables: number): number {
      return avgReceivables === 0 ? 0 : revenue / avgReceivables;
    }

    function assetTurnover(revenue: number, avgTotalAssets: number): number {
      return avgTotalAssets === 0 ? 0 : revenue / avgTotalAssets;
    }

    function daysInventory(turnover: number): number {
      return turnover === 0 ? 0 : 365 / turnover;
    }

    function daysReceivable(turnover: number): number {
      return turnover === 0 ? 0 : 365 / turnover;
    }

    it('计算存货周转率', () => {
      expect(inventoryTurnover(500, 100)).toBe(5);
    });

    it('零存货周转率为0', () => {
      expect(inventoryTurnover(500, 0)).toBe(0);
    });

    it('计算应收账款周转率', () => {
      expect(receivableTurnover(1000, 200)).toBe(5);
    });

    it('计算总资产周转率', () => {
      expect(assetTurnover(1000, 2000)).toBe(0.5);
    });

    it('存货周转天数', () => {
      expect(daysInventory(5)).toBe(73);
    });

    it('应收账款周转天数', () => {
      expect(daysReceivable(10)).toBe(36.5);
    });

    it('零周转率天数为0', () => {
      expect(daysInventory(0)).toBe(0);
    });

    it('高周转率对应低天数', () => {
      expect(daysInventory(10)).toBeLessThan(daysInventory(5));
    });
  });

  describe('成长能力指标', () => {
    function revenueGrowth(current: number, previous: number): number {
      return previous === 0 ? 0 : ((current - previous) / previous) * 100;
    }

    function earningsGrowth(current: number, previous: number): number {
      return previous === 0 ? 0 : ((current - previous) / previous) * 100;
    }

    function cagr(beginValue: number, endValue: number, years: number): number {
      if (beginValue <= 0 || years <= 0) return 0;
      return (Math.pow(endValue / beginValue, 1 / years) - 1) * 100;
    }

    it('计算收入增长率', () => {
      expect(revenueGrowth(120, 100)).toBe(20);
    });

    it('负增长', () => {
      expect(revenueGrowth(80, 100)).toBe(-20);
    });

    it('零基准增长率', () => {
      expect(revenueGrowth(100, 0)).toBe(0);
    });

    it('计算利润增长率', () => {
      expect(earningsGrowth(150, 100)).toBe(50);
    });

    it('计算CAGR', () => {
      const result = cagr(100, 200, 3);
      expect(result).toBeCloseTo(25.99, 1);
    });

    it('3年翻倍CAGR约26%', () => {
      const result = cagr(100, 200, 3);
      expect(result).toBeGreaterThan(25);
      expect(result).toBeLessThan(27);
    });

    it('负基数CAGR为0', () => {
      expect(cagr(-100, 200, 3)).toBe(0);
    });

    it('零年CAGR为0', () => {
      expect(cagr(100, 200, 0)).toBe(0);
    });

    it('1年CAGR等于增长率', () => {
      const result = cagr(100, 120, 1);
      expect(result).toBeCloseTo(20, 1);
    });
  });

  describe('杜邦分析', () => {
    function dupontAnalysis(netMargin: number, assetTurnover: number, equityMultiplier: number): { roe: number; components: { margin: number; turnover: number; leverage: number } } {
      const roe = netMargin * assetTurnover * equityMultiplier;
      return { roe, components: { margin: netMargin, turnover: assetTurnover, leverage: equityMultiplier } };
    }

    it('ROE=利润率×资产周转率×权益乘数', () => {
      const result = dupontAnalysis(10, 0.5, 3);
      expect(result.roe).toBe(15);
    });

    it('高杠杆提升ROE', () => {
      const low = dupontAnalysis(10, 0.5, 2);
      const high = dupontAnalysis(10, 0.5, 4);
      expect(high.roe).toBeGreaterThan(low.roe);
    });

    it('高周转率提升ROE', () => {
      const low = dupontAnalysis(10, 0.3, 2);
      const high = dupontAnalysis(10, 0.6, 2);
      expect(high.roe).toBeGreaterThan(low.roe);
    });

    it('三要素相等ROE=要素立方', () => {
      const result = dupontAnalysis(2, 2, 2);
      expect(result.roe).toBe(8);
    });

    it('零利润率ROE为0', () => {
      expect(dupontAnalysis(0, 0.5, 3).roe).toBe(0);
    });
  });
});
