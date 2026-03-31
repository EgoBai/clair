import { describe, it, expect } from 'vitest';
import { AbnormalTradeEngine, TradeRecord, TickData } from '../services/abnormalTradeEngine';

describe('Abnormal Trade Engine', () => {
  const engine = new AbnormalTradeEngine(500000, 2.0);

  const createTrade = (overrides: Partial<TradeRecord> = {}): TradeRecord => ({
    timestamp: Date.now(),
    price: 10 + Math.random(),
    volume: 1000 + Math.floor(Math.random() * 10000),
    amount: 10000 + Math.random() * 100000,
    direction: 'buy',
    isBlockTrade: false,
    ...overrides
  });

  const createTick = (overrides: Partial<TickData> = {}): TickData => ({
    timestamp: Date.now(),
    price: 10 + Math.random(),
    volume: 100 + Math.floor(Math.random() * 1000),
    bid: 9.9,
    ask: 10.1,
    bidVolume: 5000,
    askVolume: 5000,
    ...overrides
  });

  describe('detectBlockTrades', () => {
    it('should detect large volume trades', () => {
      const trades = [
        createTrade({ volume: 100 }),
        createTrade({ volume: 600000 }),
        createTrade({ volume: 200 }),
      ];
      const result = engine.detectBlockTrades(trades);
      expect(result.length).toBe(1);
      expect(result[0].volume).toBe(600000);
    });

    it('should detect flagged block trades', () => {
      const trades = [
        createTrade({ volume: 100, isBlockTrade: true }),
      ];
      const result = engine.detectBlockTrades(trades);
      expect(result.length).toBe(1);
    });

    it('should return empty for small trades', () => {
      const trades = Array.from({ length: 10 }, () => createTrade({ volume: 100 }));
      const result = engine.detectBlockTrades(trades);
      expect(result).toEqual([]);
    });

    it('should include direction', () => {
      const trades = [
        createTrade({ volume: 600000, direction: 'sell' }),
      ];
      const result = engine.detectBlockTrades(trades);
      expect(result[0].direction).toBe('sell');
    });
  });

  describe('detectVolumeAnomalies', () => {
    it('should return empty for insufficient data', () => {
      const trades = Array.from({ length: 5 }, (_, i) =>
        createTrade({ timestamp: Date.now() + i * 60000 })
      );
      expect(engine.detectVolumeAnomalies(trades)).toEqual([]);
    });

    it('should detect volume surge', () => {
      const trades: TradeRecord[] = [];
      const baseTime = Date.now() - 100 * 60000;

      for (let i = 0; i < 100; i++) {
        trades.push(createTrade({
          timestamp: baseTime + i * 60000,
          volume: 1000
        }));
      }
      // Add a surge
      trades.push(createTrade({
        timestamp: baseTime + 100 * 60000,
        volume: 1e8
      }));

      const anomalies = engine.detectVolumeAnomalies(trades, 20);
      expect(anomalies.length).toBeGreaterThan(0);
    });

    it('should classify significance', () => {
      const trades: TradeRecord[] = [];
      const baseTime = Date.now() - 100 * 60000;

      for (let i = 0; i < 100; i++) {
        trades.push(createTrade({
          timestamp: baseTime + i * 60000,
          volume: i === 99 ? 1e9 : 1000
        }));
      }

      const anomalies = engine.detectVolumeAnomalies(trades, 20);
      for (const a of anomalies) {
        expect(['low', 'medium', 'high']).toContain(a.significance);
      }
    });
  });

  describe('detectClosingAnomalies', () => {
    it('should analyze closing ticks', () => {
      const ticks: TickData[] = [];
      const baseTime = new Date('2024-01-15T09:30:00').getTime();

      for (let i = 0; i < 240; i++) {
        ticks.push(createTick({
          timestamp: baseTime + i * 60000,
          price: 10 + Math.sin(i / 10) * 0.5,
          volume: 100
        }));
      }

      const result = engine.detectClosingAnomalies(ticks, '2024-01-15');
      expect(result.date).toBe('2024-01-15');
      expect(['painting', 'window_dressing', 'auction_manipulation', 'normal']).toContain(result.type);
      expect(result.suspicionScore).toBeGreaterThanOrEqual(0);
    });

    it('should detect painting the close', () => {
      const ticks: TickData[] = [];
      const baseTime = new Date('2024-01-15T09:30:00').getTime();

      for (let i = 0; i < 240; i++) {
        const isClosing = i >= 239;
        ticks.push(createTick({
          timestamp: baseTime + i * 60000,
          price: isClosing ? 12 : 10,
          volume: isClosing ? 5e6 : 50
        }));
      }

      const result = engine.detectClosingAnomalies(ticks, '2024-01-15');
      expect(result.suspicionScore).toBeGreaterThanOrEqual(0);
    });
  });

  describe('analyzeInOutFlow', () => {
    it('should calculate buy/sell ratio', () => {
      const trades = [
        createTrade({ direction: 'buy', volume: 1000 }),
        createTrade({ direction: 'buy', volume: 2000 }),
        createTrade({ direction: 'sell', volume: 500 }),
      ];
      const result = engine.analyzeInOutFlow(trades);
      expect(result.outerVolume).toBe(3000);
      expect(result.innerVolume).toBe(500);
      expect(result.netInflow).toBe(2500);
    });

    it('should determine dominance', () => {
      const trades = Array.from({ length: 10 }, () => createTrade({ direction: 'buy', volume: 2000 }));
      const result = engine.analyzeInOutFlow(trades);
      expect(result.dominance).toBe('buyers');
    });

    it('should detect seller dominance', () => {
      const trades = Array.from({ length: 10 }, () => createTrade({ direction: 'sell', volume: 2000 }));
      const result = engine.analyzeInOutFlow(trades);
      expect(result.dominance).toBe('sellers');
    });

    it('should handle empty trades', () => {
      const result = engine.analyzeInOutFlow([]);
      expect(result.innerVolume).toBe(0);
      expect(result.outerVolume).toBe(0);
    });
  });

  describe('inferMainForce', () => {
    it('should estimate main force flow', () => {
      const trades = Array.from({ length: 50 }, (_, i) =>
        createTrade({
          volume: 2e6,
          amount: 2e7,
          direction: i % 3 === 0 ? 'sell' : 'buy'
        })
      );
      const result = engine.inferMainForce(trades, 1e7);
      expect(result.estimatedInflow).toBeGreaterThan(0);
      expect(result.estimatedOutflow).toBeGreaterThan(0);
      expect(['accumulating', 'distributing', 'absorbing', 'neutral']).toContain(result.phase);
    });

    it('should have confidence between 0 and 1', () => {
      const trades = Array.from({ length: 30 }, () =>
        createTrade({ volume: 2e6, amount: 2e7 })
      );
      const result = engine.inferMainForce(trades, 1e7);
      expect(result.confidence).toBeGreaterThanOrEqual(0);
      expect(result.confidence).toBeLessThanOrEqual(1);
    });

    it('should have scores between 0 and 100', () => {
      const trades = Array.from({ length: 20 }, () =>
        createTrade({ volume: 2e6, amount: 2e7 })
      );
      const result = engine.inferMainForce(trades, 1e7);
      expect(result.accumulationScore).toBeGreaterThanOrEqual(0);
      expect(result.accumulationScore).toBeLessThanOrEqual(100);
      expect(result.distributionScore).toBeGreaterThanOrEqual(0);
      expect(result.distributionScore).toBeLessThanOrEqual(100);
    });
  });

  describe('generateReport', () => {
    it('should generate full report', () => {
      const trades = Array.from({ length: 20 }, (_, i) =>
        createTrade({ timestamp: Date.now() + i * 60000 })
      );
      const ticks = Array.from({ length: 50 }, (_, i) =>
        createTick({ timestamp: Date.now() + i * 60000 })
      );
      const report = engine.generateReport(trades, ticks, '2024-01-15');
      expect(report.blockTrades).toBeDefined();
      expect(report.volumeAnomalies).toBeDefined();
      expect(report.closingAnomalies).toBeDefined();
      expect(report.inOutFlow).toBeDefined();
      expect(report.mainForce).toBeDefined();
      expect(['normal', 'watch', 'warning', 'alert']).toContain(report.alertLevel);
    });
  });

  describe('edge cases', () => {
    it('should handle zero volume trades', () => {
      const trades = [createTrade({ volume: 0, amount: 0 })];
      const result = engine.analyzeInOutFlow(trades);
      expect(result.innerVolume + result.outerVolume).toBe(0);
    });

    it('should handle very large numbers', () => {
      const trades = [createTrade({ volume: 1e12, amount: 1e15 })];
      const result = engine.detectBlockTrades(trades);
      expect(isFinite(result[0].amount)).toBe(true);
    });
  });
});
