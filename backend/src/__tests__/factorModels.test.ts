import { describe, it, expect } from 'vitest';

// Quantitative Factor Models
interface StockFactor {
  symbol: string;
  pe: number;
  pb: number;
  roe: number;
  revenueGrowth: number;
  profitGrowth: number;
  debtRatio: number;
  currentRatio: number;
  dividendYield: number;
  turnoverRate: number;
  marketCap: number;
  price: number;
  ma20: number;
  ma60: number;
  rsi: number;
}

function calculateFamaFrench3(
  stock: StockFactor,
  marketReturn: number,
  riskFreeRate: number
): { marketPremium: number; sizeFactor: number; valueFactor: number; expectedReturn: number } {
  const marketPremium = marketReturn - riskFreeRate;
  const sizeFactor = stock.marketCap < 100e8 ? 0.02 : -0.01; // Small cap premium
  const valueFactor = stock.pe < 15 ? 0.015 : stock.pe > 30 ? -0.01 : 0;
  const expectedReturn = riskFreeRate + marketPremium + sizeFactor + valueFactor;
  return { marketPremium, sizeFactor, valueFactor, expectedReturn };
}

function calculatePiotroskiFscore(stock: StockFactor): number {
  let score = 0;
  if (stock.roe > 0) score++;
  if (stock.revenueGrowth > 0) score++;
  if (stock.profitGrowth > 0) score++;
  if (stock.debtRatio < 0.5) score++;
  if (stock.currentRatio > 1) score++;
  if (stock.pe > 0 && stock.pe < 25) score++;
  if (stock.pb > 0 && stock.pb < 3) score++;
  if (stock.dividendYield > 0.02) score++;
  return score;
}

function calculateAltmanZScore(
  totalAssets: number,
  totalLiabilities: number,
  ebit: number,
  revenue: number,
  marketCap: number,
  retainedEarnings: number
): { score: number; zone: 'safe' | 'grey' | 'distress' } {
  if (totalAssets === 0) return { score: 0, zone: 'distress' };
  const workingCapital = totalAssets - totalLiabilities;
  const A = workingCapital / totalAssets;
  const B = retainedEarnings / totalAssets;
  const C = ebit / totalAssets;
  const D = marketCap / totalLiabilities;
  const E = revenue / totalAssets;
  const score = 1.2 * A + 1.4 * B + 3.3 * C + 0.6 * D + 1.0 * E;
  return {
    score,
    zone: score > 2.99 ? 'safe' : score < 1.81 ? 'distress' : 'grey'
  };
}

function momentumScore(prices: number[], period: number = 20): number {
  if (prices.length < period) return 0;
  const current = prices[prices.length - 1];
  const past = prices[prices.length - period];
  return past === 0 ? 0 : (current - past) / past;
}

function calculateQualityScore(stock: StockFactor): number {
  let score = 0;
  // Profitability
  if (stock.roe > 0.15) score += 25;
  else if (stock.roe > 0.1) score += 15;
  else if (stock.roe > 0) score += 5;
  
  // Growth
  if (stock.revenueGrowth > 0.2) score += 25;
  else if (stock.revenueGrowth > 0.1) score += 15;
  else if (stock.revenueGrowth > 0) score += 5;
  
  // Financial Health
  if (stock.debtRatio < 0.3) score += 25;
  else if (stock.debtRatio < 0.5) score += 15;
  else if (stock.debtRatio < 0.7) score += 5;
  
  // Dividend
  if (stock.dividendYield > 0.03) score += 25;
  else if (stock.dividendYield > 0.01) score += 15;
  else if (stock.dividendYield > 0) score += 5;
  
  return Math.min(100, score);
}

function multiFactorRanking(stocks: StockFactor[]): { symbol: string; totalScore: number; factors: Record<string, number> }[] {
  return stocks.map(s => {
    const valueScore = (1 / Math.max(s.pe, 0.1)) * 30 + (1 / Math.max(s.pb, 0.1)) * 20;
    const qualityScore = s.roe * 100 * 0.3 + (1 - s.debtRatio) * 100 * 0.2;
    const growthScore = s.revenueGrowth * 100 * 0.3 + s.profitGrowth * 100 * 0.2;
    const technicalScore = s.price > s.ma20 ? 25 : s.price > s.ma60 ? 15 : 0;
    const totalScore = valueScore + qualityScore + growthScore + technicalScore;
    return {
      symbol: s.symbol,
      totalScore,
      factors: { value: valueScore, quality: qualityScore, growth: growthScore, technical: technicalScore }
    };
  }).sort((a, b) => b.totalScore - a.totalScore);
}

describe('Quantitative Factor Models', () => {
  const sampleStock: StockFactor = {
    symbol: '600519', pe: 25, pb: 8, roe: 0.3,
    revenueGrowth: 0.15, profitGrowth: 0.12, debtRatio: 0.2,
    currentRatio: 2.5, dividendYield: 0.015, turnoverRate: 0.5,
    marketCap: 2e12, price: 1800, ma20: 1780, ma60: 1750, rsi: 55
  };

  describe('Fama-French 3 Factor', () => {
    it('should calculate market premium', () => {
      const result = calculateFamaFrench3(sampleStock, 0.08, 0.02);
      expect(result.marketPremium).toBeCloseTo(0.06, 2);
    });

    it('should give size premium for small caps', () => {
      const smallCap = { ...sampleStock, marketCap: 5e8 };
      const largeCap = { ...sampleStock, marketCap: 5e12 };
      const smallResult = calculateFamaFrench3(smallCap, 0.08, 0.02);
      const largeResult = calculateFamaFrench3(largeCap, 0.08, 0.02);
      expect(smallResult.sizeFactor).toBeGreaterThan(largeResult.sizeFactor);
    });

    it('should give value premium for low PE', () => {
      const valueStock = { ...sampleStock, pe: 10 };
      const growthStock = { ...sampleStock, pe: 50 };
      const valueResult = calculateFamaFrench3(valueStock, 0.08, 0.02);
      const growthResult = calculateFamaFrench3(growthStock, 0.08, 0.02);
      expect(valueResult.valueFactor).toBeGreaterThan(growthResult.valueFactor);
    });

    it('should calculate expected return', () => {
      const result = calculateFamaFrench3(sampleStock, 0.08, 0.02);
      expect(result.expectedReturn).toBeDefined();
      expect(typeof result.expectedReturn).toBe('number');
    });
  });

  describe('Piotroski F-Score', () => {
    it('should score profitable stocks higher', () => {
      const good = { ...sampleStock, roe: 0.2, revenueGrowth: 0.15, profitGrowth: 0.1, debtRatio: 0.3, currentRatio: 2, pe: 15, pb: 2, dividendYield: 0.03 };
      const bad = { ...sampleStock, roe: -0.05, revenueGrowth: -0.1, profitGrowth: -0.2, debtRatio: 0.8, currentRatio: 0.5, pe: 50, pb: 8, dividendYield: 0 };
      expect(calculatePiotroskiFscore(good)).toBeGreaterThan(calculatePiotroskiFscore(bad));
    });

    it('should range from 0 to 8', () => {
      const score = calculatePiotroskiFscore(sampleStock);
      expect(score).toBeGreaterThanOrEqual(0);
      expect(score).toBeLessThanOrEqual(8);
    });

    it('should give max score for perfect stock', () => {
      const perfect: StockFactor = {
        ...sampleStock, roe: 0.3, revenueGrowth: 0.2, profitGrowth: 0.15,
        debtRatio: 0.2, currentRatio: 3, pe: 12, pb: 1.5, dividendYield: 0.04
      };
      expect(calculatePiotroskiFscore(perfect)).toBe(8);
    });

    it('should give 0 for worst stock', () => {
      const worst: StockFactor = {
        ...sampleStock, roe: -0.1, revenueGrowth: -0.2, profitGrowth: -0.3,
        debtRatio: 0.9, currentRatio: 0.3, pe: 100, pb: 10, dividendYield: 0
      };
      expect(calculatePiotroskiFscore(worst)).toBe(0);
    });
  });

  describe('Altman Z-Score', () => {
    it('should classify safe companies', () => {
      const result = calculateAltmanZScore(1e9, 3e8, 1e8, 2e9, 5e9, 4e8);
      expect(result.zone).toBe('safe');
    });

    it('should classify distressed companies', () => {
      const result = calculateAltmanZScore(1e9, 9e8, 1e6, 5e8, 1e8, -1e8);
      expect(result.zone).toBe('distress');
    });

    it('should handle zero assets', () => {
      const result = calculateAltmanZScore(0, 1e8, 1e7, 1e8, 1e9, 1e7);
      expect(result.zone).toBe('distress');
      expect(result.score).toBe(0);
    });

    it('should have score > 0 for healthy company', () => {
      const result = calculateAltmanZScore(1e9, 2e8, 2e8, 3e9, 8e9, 5e8);
      expect(result.score).toBeGreaterThan(0);
    });
  });

  describe('Momentum Score', () => {
    it('should return positive for uptrend', () => {
      const prices = Array(30).fill(0).map((_, i) => 100 + i * 2);
      expect(momentumScore(prices, 20)).toBeGreaterThan(0);
    });

    it('should return negative for downtrend', () => {
      const prices = Array(30).fill(0).map((_, i) => 200 - i * 2);
      expect(momentumScore(prices, 20)).toBeLessThan(0);
    });

    it('should return 0 for insufficient data', () => {
      expect(momentumScore([1, 2, 3], 20)).toBe(0);
    });

    it('should return 0 for flat prices', () => {
      const prices = Array(25).fill(100);
      expect(momentumScore(prices, 20)).toBe(0);
    });

    it('should handle zero past price', () => {
      expect(momentumScore([0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 10], 10)).toBe(0);
    });
  });

  describe('Quality Score', () => {
    it('should score 0-100', () => {
      const score = calculateQualityScore(sampleStock);
      expect(score).toBeGreaterThanOrEqual(0);
      expect(score).toBeLessThanOrEqual(100);
    });

    it('should give higher score for better fundamentals', () => {
      const good = { ...sampleStock, roe: 0.25, revenueGrowth: 0.3, debtRatio: 0.15, dividendYield: 0.04 };
      const bad = { ...sampleStock, roe: 0.01, revenueGrowth: -0.1, debtRatio: 0.8, dividendYield: 0 };
      expect(calculateQualityScore(good)).toBeGreaterThan(calculateQualityScore(bad));
    });

    it('should cap at 100', () => {
      const perfect = { ...sampleStock, roe: 0.5, revenueGrowth: 0.5, debtRatio: 0.05, dividendYield: 0.05 };
      expect(calculateQualityScore(perfect)).toBeLessThanOrEqual(100);
    });
  });

  describe('Multi-Factor Ranking', () => {
    it('should rank stocks by total score', () => {
      const stocks: StockFactor[] = [
        { ...sampleStock, symbol: 'A', pe: 10, pb: 1, roe: 0.2, revenueGrowth: 0.2, profitGrowth: 0.15, debtRatio: 0.2 },
        { ...sampleStock, symbol: 'B', pe: 50, pb: 10, roe: 0.05, revenueGrowth: 0.01, profitGrowth: -0.1, debtRatio: 0.8 },
        { ...sampleStock, symbol: 'C', pe: 20, pb: 3, roe: 0.15, revenueGrowth: 0.1, profitGrowth: 0.08, debtRatio: 0.4 },
      ];
      const ranked = multiFactorRanking(stocks);
      expect(ranked[0].symbol).toBe('A');
      expect(ranked[ranked.length - 1].symbol).toBe('B');
    });

    it('should include all factor scores', () => {
      const ranked = multiFactorRanking([sampleStock]);
      expect(ranked[0].factors).toHaveProperty('value');
      expect(ranked[0].factors).toHaveProperty('quality');
      expect(ranked[0].factors).toHaveProperty('growth');
      expect(ranked[0].factors).toHaveProperty('technical');
    });

    it('should handle empty array', () => {
      expect(multiFactorRanking([])).toHaveLength(0);
    });

    it('should handle single stock', () => {
      const ranked = multiFactorRanking([sampleStock]);
      expect(ranked).toHaveLength(1);
      expect(ranked[0].symbol).toBe('600519');
    });
  });
});
