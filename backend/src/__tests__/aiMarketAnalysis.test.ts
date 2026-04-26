import { describe, it, expect } from 'vitest';
import {
  MarketCommentaryGenerator,
  StopLossCalculator,
  SectorRotationPredictor,
  defaultCommentaryGenerator,
  defaultStopLossCalculator,
  defaultSectorPredictor,
} from '../utils/aiMarketAnalysis';

// ==================== MarketCommentaryGenerator ====================

describe('MarketCommentaryGenerator', () => {
  const generator = new MarketCommentaryGenerator();
  const mockBullish = {
    indexChange: 2.5,
    indexPrice: 3500.50,
    riseCount: 2800,
    fallCount: 800,
    flatCount: 200,
    limitUpCount: 85,
    limitDownCount: 3,
    totalTurnover: 120000000000, // 1200亿
    northboundFlow: 8000000000, // 80亿
    hotSectors: [
      { name: '半导体', changePercent: 3.5 },
      { name: '人工智能', changePercent: 2.8 },
      { name: '新能源', changePercent: 2.1 },
      { name: '医药', changePercent: 1.5 },
    ],
    topGainers: [
      { symbol: '000001.SZ', name: '平安银行', changePercent: 10.0 },
    ],
    topLosers: [
      { symbol: '600001.SH', name: '某股', changePercent: -5.0 },
    ],
    avgChangePercent: 1.2,
  };

  describe('generateDailySummary', () => {
    it('should return a complete MarketCommentary', () => {
      const result = generator.generateDailySummary(mockBullish);
      expect(result.id).toMatch(/^commentary-/);
      expect(result.date).toBeDefined();
      expect(result.type).toBe('daily_summary');
      expect(result.title).toContain('涨');
      expect(result.summary).toContain('强势');
      expect(result.sections).toHaveLength(5);
      expect(result.keywords).toContain('上涨');
      expect(result.sentiment).toBe('bullish');
      expect(result.confidence).toBeGreaterThan(0);
      expect(result.generatedAt).toBeDefined();
    });

    it('should generate bearish commentary for negative index', () => {
      const result = generator.generateDailySummary({ ...mockBullish, indexChange: -2.0, riseCount: 500, fallCount: 3200 });
      expect(result.sentiment).toBe('bearish');
      expect(result.title).toContain('跌');
      expect(result.summary).toContain('疲弱');
    });

    it('should generate neutral commentary for flat market', () => {
      const result = generator.generateDailySummary({ ...mockBullish, indexChange: 0.1, riseCount: 1500, fallCount: 2000 });
      expect(result.sentiment).toBe('neutral');
      expect(result.title).toContain('震荡整理');
    });

    it('should handle zero rise/fall counts (suspension day)', () => {
      const result = generator.generateDailySummary({
        ...mockBullish,
        indexChange: 0, riseCount: 0, fallCount: 0, flatCount: 0,
        limitUpCount: 0, limitDownCount: 0,
        totalTurnover: 0, northboundFlow: 0,
        hotSectors: [],
        topGainers: [], topLosers: [],
        avgChangePercent: 0,
      });
      expect(result.sections).toHaveLength(5);
      expect(result.sentiment).toBe('neutral');
    });

    it('should handle large turnover (>1万亿)', () => {
      const result = generator.generateDailySummary({
        ...mockBullish,
        totalTurnover: 2500000000000, // 2.5万亿
      });
      expect(result.summary).toContain('万亿');
      expect(result.summary).toContain('充沛');
    });
  });

  describe('analyzeSentiment', () => {
    it('should return bullish when indexChange > 1 and rise ratio > 0.6', () => {
      const sentiment = (generator as any).analyzeSentiment({ indexChange: 1.5, riseCount: 2000, fallCount: 1000 });
      expect(sentiment).toBe('bullish');
    });

    it('should return bearish when indexChange < -1 and rise ratio < 0.4', () => {
      const sentiment = (generator as any).analyzeSentiment({ indexChange: -1.5, riseCount: 800, fallCount: 2200 });
      expect(sentiment).toBe('bearish');
    });

    it('should return neutral for mixed signals', () => {
      const sentiment = (generator as any).analyzeSentiment({ indexChange: 0.2, riseCount: 1500, fallCount: 1500 });
      expect(sentiment).toBe('neutral');
    });

    it('should return neutral when riseCount + fallCount = 0', () => {
      const sentiment = (generator as any).analyzeSentiment({ indexChange: 0.5, riseCount: 0, fallCount: 0 });
      expect(sentiment).toBe('neutral');
    });
  });

  describe('extractKeywords', () => {
    it('should return keywords based on index direction', () => {
      const kw = (generator as any).extractKeywords({
        indexChange: 1.5,
        hotSectors: [{ name: '半导体' }, { name: '新能源' }],
      });
      expect(kw).toContain('上涨');
      expect(kw).toContain('反弹');
      expect(kw).toContain('半导体');
    });

    it('should add 震荡/盘整 for flat market', () => {
      const kw = (generator as any).extractKeywords({
        indexChange: 0.1,
        hotSectors: [],
      });
      expect(kw).toContain('震荡');
    });
  });

  describe('calculateConfidence', () => {
    it('should calculate confidence between 30 and 95', () => {
      const c = (generator as any).calculateConfidence({ indexChange: 1, riseCount: 2000, fallCount: 1000 });
      expect(c).toBeGreaterThanOrEqual(30);
      expect(c).toBeLessThanOrEqual(95);
    });

    it('should return higher confidence for stronger signals', () => {
      const c1 = (generator as any).calculateConfidence({ indexChange: 3, riseCount: 3000, fallCount: 200 });
      const c2 = (generator as any).calculateConfidence({ indexChange: 0.1, riseCount: 1500, fallCount: 1500 });
      expect(c1).toBeGreaterThan(c2);
    });
  });
});

// ==================== StopLossCalculator ====================

describe('StopLossCalculator', () => {
  const calc = new StopLossCalculator();

  const makeKLine = (close: number, high: number, low: number) => ({
    tradeDate: '2024-01-02', open: close, close, high, low, volume: 10000, turnover: 0,
  });

  const klineData = [
    makeKLine(100, 102, 99),
    makeKLine(101, 103, 100),
    makeKLine(102, 104, 101),
    makeKLine(101, 102, 100),
    makeKLine(103, 105, 102),
    makeKLine(104, 106, 103),
    makeKLine(103, 104, 102),
    makeKLine(105, 107, 104),
    makeKLine(106, 108, 105),
    makeKLine(107, 109, 106),
    makeKLine(106, 107, 105),
    makeKLine(108, 110, 107),
    makeKLine(109, 111, 108),
    makeKLine(108, 109, 107),
    makeKLine(110, 112, 109),
  ];

  describe('calculateByATR', () => {
    it('should return StopLossRecommendation with valid fields', () => {
      const result = calc.calculateByATR('000001.SZ', 110, klineData);
      expect(result.symbol).toBe('000001.SZ');
      expect(result.currentPrice).toBe(110);
      expect(result.suggestedStopLoss).toBeLessThan(110);
      expect(result.suggestedTakeProfit).toBeGreaterThan(110);
      expect(result.method).toBe('atr');
      expect(result.riskRewardRatio).toBe(1.5);
      expect(result.confidence).toBe(75);
    });

    it('should accept custom multiplier', () => {
      const r1 = calc.calculateByATR('T', 100, klineData, 1);
      const r2 = calc.calculateByATR('T', 100, klineData, 3);
      // With higher multiplier, stopLossPercent should be larger
      expect(Math.abs(r1.suggestedStopLoss - 100)).toBeLessThan(
        Math.abs(r2.suggestedStopLoss - 100),
      );
    });

    it('should ensure stop loss is non-negative', () => {
      const result = calc.calculateByATR('T', 1, klineData, 100);
      expect(result.suggestedStopLoss).toBeGreaterThanOrEqual(0);
    });

    it('should handle insufficient data', () => {
      const result = calc.calculateByATR('T', 100, [makeKLine(100, 101, 99)], 2);
      expect(result.suggestedStopLoss).toBe(100); // ATR=0 when data too short
    });
  });

  describe('calculateByMA', () => {
    it('should return StopLossRecommendation using moving average', () => {
      const result = calc.calculateByMA('000001.SZ', 110, klineData, 10);
      expect(result.symbol).toBe('000001.SZ');
      expect(result.method).toBe('moving_average');
      expect(result.riskRewardRatio).toBe(2);
      expect(result.confidence).toBe(70);
      expect(result.suggestedStopLoss).toBeLessThan(110);
      expect(result.suggestedTakeProfit).toBeGreaterThan(110);
    });

    it('should use custom period', () => {
      const r1 = calc.calculateByMA('T', 110, klineData, 5);
      const r2 = calc.calculateByMA('T', 110, klineData, 10);
      expect(r1.suggestedStopLoss).not.toBe(r2.suggestedStopLoss);
      expect(r1.reasoning).toContain('5日');
      expect(r2.reasoning).toContain('10日');
    });
  });

  describe('calculateByPercent', () => {
    it('should return StopLossRecommendation with percent method', () => {
      const result = calc.calculateByPercent('000001.SZ', 100, 5, 10);
      expect(result.method).toBe('percent');
      expect(result.suggestedStopLoss).toBe(95);
      expect(result.suggestedTakeProfit).toBe(110);
      expect(result.stopLossPercent).toBe(5);
      expect(result.takeProfitPercent).toBe(10);
      expect(result.riskRewardRatio).toBe(2);
    });

    it('should use default values', () => {
      const result = calc.calculateByPercent('T', 100);
      expect(result.suggestedStopLoss).toBe(95);
      expect(result.suggestedTakeProfit).toBe(110);
    });
  });
});

// ==================== SectorRotationPredictor ====================

describe('SectorRotationPredictor', () => {
  const predictor = new SectorRotationPredictor();

  const mockSectors = [
    { sector: '半导体', changePercent5d: 5.2, changePercent20d: 8.1, volumeRatio: 1.5, capitalInflow: 2000000000, avgPE: 50, constituentCount: 100 },
    { sector: '白酒', changePercent5d: -4.5, changePercent20d: -8.2, volumeRatio: 0.8, capitalInflow: -500000000, avgPE: 30, constituentCount: 40 },
    { sector: '医药', changePercent5d: 1.2, changePercent20d: 3.5, volumeRatio: 1.1, capitalInflow: 100000000, avgPE: 40, constituentCount: 200 },
    { sector: '新能源', changePercent5d: 15.0, changePercent20d: 25.0, volumeRatio: 2.0, capitalInflow: 5000000000, avgPE: 35, constituentCount: 150 },
  ];

  describe('analyze', () => {
    it('should return predictions for all input sectors', () => {
      const result = predictor.analyze(mockSectors);
      expect(result).toHaveLength(4);
      expect(result.map(r => r.sector)).toEqual(['半导体', '白酒', '医药', '新能源']);
    });

    it('each prediction should have all required fields', () => {
      const result = predictor.analyze(mockSectors);
      for (const r of result) {
        expect(r).toHaveProperty('sector');
        expect(r).toHaveProperty('currentPhase');
        expect(r).toHaveProperty('predictedDirection');
        expect(r).toHaveProperty('strength');
        expect(r).toHaveProperty('timeframe');
        expect(r).toHaveProperty('catalysts');
        expect(r).toHaveProperty('risks');
        expect(r).toHaveProperty('analysis');
        expect(['accumulation', 'markup', 'distribution', 'decline']).toContain(r.currentPhase);
        expect(['rotate_in', 'rotate_out', 'hold']).toContain(r.predictedDirection);
      }
    });

    it('should predict markup phase for strong sectors', () => {
      const result = predictor.analyze(mockSectors);
      const semi = result.find(r => r.sector === '半导体');
      expect(semi!.currentPhase).toBe('markup');
      expect(semi!.predictedDirection).toBe('rotate_in');
      expect(semi!.strength).toBeGreaterThan(50);
    });

    it('should predict decline phase for weak sectors', () => {
      const result = predictor.analyze(mockSectors);
      const baijiu = result.find(r => r.sector === '白酒');
      expect(baijiu!.currentPhase).toBe('decline');
      expect(baijiu!.predictedDirection).toBe('rotate_out');
    });

    it('should include catalysts for strong sectors', () => {
      const result = predictor.analyze(mockSectors);
      const new_energy = result.find(r => r.sector === '新能源');
      expect(new_energy!.catalysts.length).toBeGreaterThan(0);
      expect(new_energy!.risks.some(r => r.includes('涨幅过大'))).toBe(true);
    });

    it('should include risks for over-heated sectors', () => {
      const result = predictor.analyze(mockSectors);
      const new_energy = result.find(r => r.sector === '新能源');
      expect(new_energy!.risks.some(r => r.includes('涨幅过大'))).toBe(true);
    });
  });

  describe('determinePhase', () => {
    it('should return markup for strong momentum', () => {
      const phase = (predictor as any).determinePhase({
        changePercent5d: 4, changePercent20d: 6, volumeRatio: 1.5,
      });
      expect(phase).toBe('markup');
    });

    it('should return decline for negative momentum', () => {
      const phase = (predictor as any).determinePhase({
        changePercent5d: -4, changePercent20d: -6, volumeRatio: 0.8,
      });
      expect(phase).toBe('decline');
    });

    it('should return accumulation for reversal pattern (5d +, 20d -)', () => {
      const phase = (predictor as any).determinePhase({
        changePercent5d: 1, changePercent20d: -2, volumeRatio: 1.2,
      });
      // 5d > 0 and 20d < 0 and vol > 1 → accumulation
      const result = (predictor as any).determinePhase({
        changePercent5d: 1, changePercent20d: -1, volumeRatio: 1.1,
      });
      expect(result).toBe('accumulation');
    });

    it('should return distribution for divergence (5d -, 20d +)', () => {
      const result = (predictor as any).determinePhase({
        changePercent5d: -1, changePercent20d: 6, volumeRatio: 1.0,
      });
      expect(result).toBe('distribution');
    });

    it('should return accumulation as default fallback', () => {
      const result = (predictor as any).determinePhase({
        changePercent5d: 0, changePercent20d: 0, volumeRatio: 1.0,
      });
      expect(result).toBe('accumulation');
    });
  });

  describe('calculateMomentum', () => {
    it('should return positive momentum for rising sector', () => {
      const m = (predictor as any).calculateMomentum({
        changePercent5d: 5, changePercent20d: 10, volumeRatio: 1.5, capitalInflow: 1e9,
      });
      expect(m).toBeGreaterThan(0);
    });

    it('should return negative momentum for declining sector', () => {
      const m = (predictor as any).calculateMomentum({
        changePercent5d: -5, changePercent20d: -10, volumeRatio: 0.5, capitalInflow: -1e9,
      });
      expect(m).toBeLessThan(0);
    });
  });

  describe('calculateStrength', () => {
    it('should return strength between 0-100', () => {
      const s = (predictor as any).calculateStrength(
        { volumeRatio: 1.5, capitalInflow: 1e9 },
        10,
      );
      expect(s).toBeGreaterThanOrEqual(0);
      expect(s).toBeLessThanOrEqual(100);
    });
  });

  describe('private generateSectorAnalysis', () => {
    it('should return analysis string containing phase description', () => {
      const a = (predictor as any).generateSectorAnalysis(
        { changePercent5d: 5, capitalInflow: 1e9 },
        'markup', 'rotate_in', 8.5,
      );
      expect(a).toContain('主升浪');
      expect(a).toContain('8.5');
    });
  });
});

// ==================== Default singletons ====================

describe('default singletons', () => {
  it('should export defaultCommentaryGenerator', () => {
    expect(defaultCommentaryGenerator).toBeInstanceOf(MarketCommentaryGenerator);
  });

  it('should export defaultStopLossCalculator', () => {
    expect(defaultStopLossCalculator).toBeInstanceOf(StopLossCalculator);
  });

  it('should export defaultSectorPredictor', () => {
    expect(defaultSectorPredictor).toBeInstanceOf(SectorRotationPredictor);
  });
});
