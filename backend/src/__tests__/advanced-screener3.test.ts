import { describe, it, expect } from 'vitest';

/**
 * 高级筛选器 - 基本面筛选测试
 */

interface FundamentalCriteria {
  minMarketCap?: number;
  maxPE?: number;
  minROE?: number;
  maxDebtRatio?: number;
  minRevenueGrowth?: number;
  minProfitGrowth?: number;
  sectors?: string[];
  minDividendYield?: number;
}

interface StockFundamental {
  code: string;
  name: string;
  sector: string;
  marketCap: number;
  pe: number;
  roe: number;
  debtRatio: number;
  revenueGrowth: number;
  profitGrowth: number;
  dividendYield: number;
}

function filterByFundamental(stocks: StockFundamental[], criteria: FundamentalCriteria): StockFundamental[] {
  return stocks.filter(s => {
    if (criteria.minMarketCap && s.marketCap < criteria.minMarketCap) return false;
    if (criteria.maxPE && s.pe > criteria.maxPE) return false;
    if (criteria.minROE && s.roe < criteria.minROE) return false;
    if (criteria.maxDebtRatio && s.debtRatio > criteria.maxDebtRatio) return false;
    if (criteria.minRevenueGrowth && s.revenueGrowth < criteria.minRevenueGrowth) return false;
    if (criteria.minProfitGrowth && s.profitGrowth < criteria.minProfitGrowth) return false;
    if (criteria.sectors && criteria.sectors.length > 0 && !criteria.sectors.includes(s.sector)) return false;
    if (criteria.minDividendYield && s.dividendYield < criteria.minDividendYield) return false;
    return true;
  });
}

function calcQualityScore(stock: StockFundamental): number {
  let score = 0;
  if (stock.roe > 15) score += 25;
  else if (stock.roe > 10) score += 15;
  else if (stock.roe > 5) score += 5;

  if (stock.debtRatio < 0.3) score += 25;
  else if (stock.debtRatio < 0.5) score += 15;
  else if (stock.debtRatio < 0.7) score += 5;

  if (stock.revenueGrowth > 20) score += 25;
  else if (stock.revenueGrowth > 10) score += 15;
  else if (stock.revenueGrowth > 0) score += 5;

  if (stock.profitGrowth > 20) score += 25;
  else if (stock.profitGrowth > 10) score += 15;
  else if (stock.profitGrowth > 0) score += 5;

  return score;
}

function rankByQuality(stocks: StockFundamental[]): StockFundamental[] {
  return [...stocks].sort((a, b) => calcQualityScore(b) - calcQualityScore(a));
}

describe('Advanced Screener - Fundamental', () => {
  const stocks: StockFundamental[] = [
    { code: '600519', name: '贵州茅台', sector: '白酒', marketCap: 25000e8, pe: 35, roe: 30, debtRatio: 0.15, revenueGrowth: 25, profitGrowth: 22, dividendYield: 1.5 },
    { code: '000001', name: '平安银行', sector: '银行', marketCap: 3000e8, pe: 5.5, roe: 12, debtRatio: 0.92, revenueGrowth: 8, profitGrowth: 10, dividendYield: 3.5 },
    { code: '300750', name: '宁德时代', sector: '新能源', marketCap: 10000e8, pe: 50, roe: 20, debtRatio: 0.45, revenueGrowth: 50, profitGrowth: 60, dividendYield: 0.3 },
    { code: '000858', name: '五粮液', sector: '白酒', marketCap: 8000e8, pe: 28, roe: 25, debtRatio: 0.2, revenueGrowth: 12, profitGrowth: 15, dividendYield: 1.2 },
  ];

  describe('基本面筛选', () => {
    it('应该按市值筛选', () => {
      const result = filterByFundamental(stocks, { minMarketCap: 5000e8 });
      expect(result.length).toBe(3);
    });

    it('应该按PE筛选', () => {
      const result = filterByFundamental(stocks, { maxPE: 30 });
      expect(result.length).toBe(2);
    });

    it('应该按ROE筛选', () => {
      const result = filterByFundamental(stocks, { minROE: 20 });
      expect(result.length).toBe(3);
    });

    it('应该按行业筛选', () => {
      const result = filterByFundamental(stocks, { sectors: ['白酒'] });
      expect(result.length).toBe(2);
    });

    it('应该按负债率筛选', () => {
      const result = filterByFundamental(stocks, { maxDebtRatio: 0.5 });
      expect(result.length).toBe(3);
    });

    it('应该按股息率筛选', () => {
      const result = filterByFundamental(stocks, { minDividendYield: 1.0 });
      expect(result.length).toBe(3);
    });

    it('应该支持多条件组合', () => {
      const result = filterByFundamental(stocks, {
        minROE: 15,
        maxDebtRatio: 0.5,
        minRevenueGrowth: 10,
      });
      expect(result.length).toBe(3);
    });
  });

  describe('质量评分', () => {
    it('应该计算质量分数', () => {
      const score = calcQualityScore(stocks[0]);
      expect(score).toBeGreaterThan(0);
      expect(score).toBeLessThanOrEqual(100);
    });

    it('茅台应该有高分', () => {
      const moutaiScore = calcQualityScore(stocks[0]);
      const bankScore = calcQualityScore(stocks[1]);
      expect(moutaiScore).toBeGreaterThan(bankScore);
    });

    it('应该按质量排序', () => {
      const ranked = rankByQuality(stocks);
      expect(ranked[0].code).toBe('600519'); // 茅台
    });
  });
});
