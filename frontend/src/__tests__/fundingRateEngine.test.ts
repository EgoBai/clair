import { describe, it, expect } from 'vitest';
import {
  analyzeFundingRate,
  analyzeOpenInterest,
  analyzeLongShortSentiment,
  FundingRateData,
} from '../utils/fundingRateEngine';

function makeFundingData(n = 30): FundingRateData[] {
  return Array.from({ length: n }, (_, i) => ({
    ticker: 'BTC-USDT-PERP',
    date: `2026-03-${String(i + 1).padStart(2, '0')}`,
    fundingRate: (Math.random() - 0.4) * 0.05,
    openInterest: 1e9 + Math.random() * 5e8,
    longShortRatio: 0.8 + Math.random() * 0.8,
    markPrice: 60000 + Math.random() * 5000,
    indexPrice: 60000 + Math.random() * 4000,
    basis: Math.random() * 200 - 100,
  }));
}

describe('Funding Rate Engine', () => {
  describe('analyzeFundingRate', () => {
    it('应分析当前费率', () => {
      const result = analyzeFundingRate(makeFundingData());
      expect(typeof result.currentRate).toBe('number');
    });

    it('应计算均值', () => {
      const result = analyzeFundingRate(makeFundingData());
      expect(typeof result.avgRate7d).toBe('number');
      expect(typeof result.avgRate30d).toBe('number');
    });

    it('应计算年化费率', () => {
      const result = analyzeFundingRate(makeFundingData());
      expect(typeof result.annualizedRate).toBe('number');
    });

    it('应判断情绪', () => {
      const result = analyzeFundingRate(makeFundingData());
      expect(['extreme_long', 'long', 'neutral', 'short', 'extreme_short']).toContain(result.sentiment);
    });

    it('应判断趋势', () => {
      const result = analyzeFundingRate(makeFundingData());
      expect(['rising', 'falling', 'stable']).toContain(result.trend);
    });

    it('应识别套利机会', () => {
      const result = analyzeFundingRate(makeFundingData());
      expect(typeof result.arbitrageOpportunity).toBe('boolean');
    });

    it('应生成建议', () => {
      const result = analyzeFundingRate(makeFundingData());
      expect(result.recommendation.length).toBeGreaterThan(0);
    });

    it('应处理空数据', () => {
      const result = analyzeFundingRate([]);
      expect(result.currentRate).toBe(0);
    });
  });

  describe('analyzeOpenInterest', () => {
    it('应分析持仓量', () => {
      const result = analyzeOpenInterest(makeFundingData());
      expect(result.currentOI).toBeGreaterThan(0);
    });

    it('应计算变化率', () => {
      const result = analyzeOpenInterest(makeFundingData());
      expect(typeof result.oiChange24h).toBe('number');
    });

    it('应判断信号', () => {
      const result = analyzeOpenInterest(makeFundingData());
      expect(['building', 'unwinding', 'stable']).toContain(result.oiSignal);
    });

    it('应评估爆仓风险', () => {
      const result = analyzeOpenInterest(makeFundingData());
      expect(result.liquidationRisk).toBeGreaterThanOrEqual(0);
      expect(result.liquidationRisk).toBeLessThanOrEqual(100);
    });
  });

  describe('analyzeLongShortSentiment', () => {
    it('应分析多空比', () => {
      const result = analyzeLongShortSentiment(makeFundingData());
      expect(result.longShortRatio).toBeGreaterThan(0);
    });

    it('应检测分歧', () => {
      const result = analyzeLongShortSentiment(makeFundingData());
      expect(typeof result.divergence).toBe('boolean');
    });

    it('应给出逆向信号', () => {
      const result = analyzeLongShortSentiment(makeFundingData());
      expect(['long', 'short', 'neutral']).toContain(result.contrarianSignal);
    });

    it('应检测极端读数', () => {
      const result = analyzeLongShortSentiment(makeFundingData());
      expect(typeof result.extremeReading).toBe('boolean');
    });
  });
});
