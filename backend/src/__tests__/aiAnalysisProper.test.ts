import { describe, it, expect } from 'vitest';
import {
  MarketCommentaryGenerator,
  StopLossCalculator,
  SectorRotationPredictor,
} from '../utils/aiMarketAnalysis';

function makeMarketData(overrides: any = {}) {
  return {
    indexChange: 1.0,
    indexPrice: 3100,
    riseCount: 2500,
    fallCount: 1500,
    flatCount: 500,
    limitUpCount: 30,
    limitDownCount: 8,
    totalTurnover: 900000000000,
    northboundFlow: 5000000000,
    hotSectors: [{ name: '半导体', changePercent: 3.5 }],
    topGainers: [{ symbol: '600519', name: '贵州茅台', changePercent: 5 }],
    topLosers: [{ symbol: '000001', name: '平安银行', changePercent: -3 }],
    avgChangePercent: 0.5,
    ...overrides,
  };
}

describe('AI Analysis Proper', () => {
  describe('MarketCommentaryGenerator', () => {
    const generator = new MarketCommentaryGenerator();

    it('should generate daily summary for bullish market', () => {
      const commentary = generator.generateDailySummary(makeMarketData({
        indexChange: 2.5, riseCount: 3500, fallCount: 800, limitUpCount: 50, limitDownCount: 5,
        avgChangePercent: 1.5,
      }));
      expect(commentary).toBeDefined();
      expect(commentary.sentiment).toBe('bullish');
      expect(commentary.title.length).toBeGreaterThan(0);
    });

    it('should generate daily summary for bearish market', () => {
      const commentary = generator.generateDailySummary(makeMarketData({
        indexChange: -3.0, riseCount: 300, fallCount: 4000, limitUpCount: 3, limitDownCount: 80,
        avgChangePercent: -2,
      }));
      expect(commentary.sentiment).toBe('bearish');
    });

    it('should generate daily summary for neutral market', () => {
      const commentary = generator.generateDailySummary(makeMarketData({
        indexChange: 0.2, riseCount: 2200, fallCount: 2100, limitUpCount: 15, limitDownCount: 10,
        avgChangePercent: 0.1,
      }));
      expect(commentary.sentiment).toBe('neutral');
    });

    it('should include sections', () => {
      const commentary = generator.generateDailySummary(makeMarketData());
      expect(commentary.sections.length).toBeGreaterThanOrEqual(3);
      for (const section of commentary.sections) {
        expect(section).toHaveProperty('heading');
        expect(section).toHaveProperty('content');
        expect(section.content.length).toBeGreaterThan(0);
      }
    });

    it('should include confidence score', () => {
      const commentary = generator.generateDailySummary(makeMarketData({
        indexChange: 2.0, riseCount: 3000, fallCount: 1000,
      }));
      expect(commentary.confidence).toBeGreaterThanOrEqual(0);
      expect(commentary.confidence).toBeLessThanOrEqual(100);
    });

    it('should include keywords', () => {
      const commentary = generator.generateDailySummary(makeMarketData());
      expect(Array.isArray(commentary.keywords)).toBe(true);
    });

    it('should include timestamp', () => {
      const commentary = generator.generateDailySummary(makeMarketData());
      expect(commentary.generatedAt).toBeDefined();
    });
  });

  describe('StopLossCalculator', () => {
    const calculator = new StopLossCalculator();

    it('should calculate ATR-based stop loss', () => {
      const kline = Array.from({ length: 30 }, (_, i) => ({
        tradeDate: `2024-01-${String(i + 1).padStart(2, '0')}`,
        open: 100 + Math.random() * 5,
        close: 100 + Math.random() * 5,
        high: 103 + Math.random() * 3,
        low: 97 - Math.random() * 3,
        volume: 100000,
        amount: 10000000,
        symbol: '600519',
      }));
      const result = calculator.calculateByATR('600519', 100, kline);
      expect(result).toBeDefined();
      expect(result.suggestedStopLoss).toBeLessThan(100);
      expect(result.suggestedTakeProfit).toBeGreaterThan(100);
      expect(result.method).toBe('atr');
    });

    it('should support custom multiplier', () => {
      const kline = Array.from({ length: 30 }, (_, i) => ({
        tradeDate: `2024-01-${String(i + 1).padStart(2, '0')}`,
        open: 100, close: 100, high: 102, low: 98,
        volume: 100000, amount: 10000000, symbol: '600519',
      }));
      const r1 = calculator.calculateByATR('600519', 100, kline, 1);
      const r2 = calculator.calculateByATR('600519', 100, kline, 3);
      expect(r1.suggestedStopLoss).toBeGreaterThan(r2.suggestedStopLoss);
    });

    it('should include risk/reward ratio', () => {
      const kline = Array.from({ length: 30 }, (_, i) => ({
        tradeDate: `2024-01-${String(i + 1).padStart(2, '0')}`,
        open: 100, close: 100, high: 102, low: 98,
        volume: 100000, amount: 10000000, symbol: '600519',
      }));
      const result = calculator.calculateByATR('600519', 100, kline);
      expect(result.riskRewardRatio).toBeGreaterThan(0);
    });
  });

  describe('SectorRotationPredictor', () => {
    const predictor = new SectorRotationPredictor();

    it('should analyze sector rotation', () => {
      const sectors = [
        { sector: '半导体', changePercent5d: 5, changePercent20d: 12, volumeRatio: 1.5, capitalInflow: 5000000000, avgPE: 45, constituentCount: 50 },
        { sector: '银行', changePercent5d: -2, changePercent20d: 3, volumeRatio: 0.8, capitalInflow: -2000000000, avgPE: 5, constituentCount: 30 },
      ];
      const predictions = predictor.analyze(sectors);
      expect(predictions.length).toBe(2);
    });

    it('should include phase classification', () => {
      const sectors = [
        { sector: '白酒', changePercent5d: 3, changePercent20d: 10, volumeRatio: 1.2, capitalInflow: 3000000000, avgPE: 30, constituentCount: 20 },
      ];
      const predictions = predictor.analyze(sectors);
      for (const p of predictions) {
        expect(p.currentPhase).toBeDefined();
        expect(['accumulation', 'markup', 'distribution', 'decline']).toContain(p.currentPhase);
      }
    });

    it('should include predicted direction', () => {
      const sectors = [
        { sector: '消费', changePercent5d: 1, changePercent20d: 5, volumeRatio: 1.0, capitalInflow: 1000000000, avgPE: 20, constituentCount: 35 },
      ];
      const predictions = predictor.analyze(sectors);
      for (const p of predictions) {
        expect(['inflow', 'outflow', 'hold']).toContain(p.predictedDirection);
      }
    });

    it('should include analysis text', () => {
      const sectors = [
        { sector: '地产', changePercent5d: -5, changePercent20d: -15, volumeRatio: 0.5, capitalInflow: -5000000000, avgPE: 8, constituentCount: 25 },
      ];
      const predictions = predictor.analyze(sectors);
      for (const p of predictions) {
        expect(p.analysis.length).toBeGreaterThan(0);
      }
    });

    it('should handle empty sectors', () => {
      const predictions = predictor.analyze([]);
      expect(predictions).toEqual([]);
    });

    it('should include strength value', () => {
      const sectors = [
        { sector: 'A', changePercent5d: 1, changePercent20d: 3, volumeRatio: 1, capitalInflow: 1000000000, avgPE: 20, constituentCount: 30 },
      ];
      const predictions = predictor.analyze(sectors);
      for (const p of predictions) {
        expect(typeof p.strength).toBe('number');
      }
    });
  });
});
