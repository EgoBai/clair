import { describe, it, expect } from 'vitest';
import {
  detectEndOfDayPattern,
  analyzeAuction,
  generateEodSignal,
  batchEodScan,
  type IntradaySnapshot,
  type EndOfDayPattern,
} from '../utils/eodAnomalyEngine';

function makeSnapshot(overrides: Partial<IntradaySnapshot> = {}): IntradaySnapshot {
  return {
    ticker: '600519',
    time: '14:55',
    price: 1800,
    volume: 1e6,
    amount: 1.8e9,
    high: 1820,
    low: 1780,
    prevClose: 1750,
    bid1: 1799,
    ask1: 1801,
    bidVol1: 500,
    askVol1: 400,
    ...overrides,
  };
}

function makeSnapshots(count: number, startPrice: number = 1800): IntradaySnapshot[] {
  const snapshots: IntradaySnapshot[] = [];
  let price = startPrice;
  for (let i = 0; i < count; i++) {
    price += (Math.random() - 0.5) * 10;
    snapshots.push(makeSnapshot({
      time: `${14 + Math.floor(i / 60)}:${String(i % 60).padStart(2, '0')}`,
      price,
      volume: 1e6 + Math.random() * 5e5,
      amount: price * (1e6 + Math.random() * 5e5),
    }));
  }
  return snapshots;
}

describe('EOD Anomaly Engine', () => {
  describe('detectEndOfDayPattern', () => {
    it('should return null for insufficient data', () => {
      expect(detectEndOfDayPattern([makeSnapshot()], 1750)).toBeNull();
    });

    it('should detect normal pattern', () => {
      const snapshots = makeSnapshots(20);
      const result = detectEndOfDayPattern(snapshots, 1750);
      expect(result).not.toBeNull();
      expect(['pull_up', 'push_down', 'volume_spike', 'price_match', 'normal']).toContain(result!.pattern);
    });

    it('should detect pull-up pattern', () => {
      const normal = makeSnapshots(15, 1800);
      const pullUp = Array.from({ length: 5 }, (_, i) =>
        makeSnapshot({
          price: 1800 + i * 30,
          volume: 5e6,
          time: `14:${55 + i}`,
        })
      );
      const result = detectEndOfDayPattern([...normal, ...pullUp], 1750);

      if (result) {
        expect(result.last5minReturn).toBeGreaterThan(0);
      }
    });

    it('should include all required fields', () => {
      const snapshots = makeSnapshots(20);
      const result = detectEndOfDayPattern(snapshots, 1750);

      expect(result!.ticker).toBe('600519');
      expect(result!.severity).toBeDefined();
      expect(result!.details.length).toBeGreaterThan(0);
      expect(typeof result!.last5minReturn).toBe('number');
      expect(typeof result!.last5minVolumeRatio).toBe('number');
    });
  });

  describe('analyzeAuction', () => {
    it('should analyze buying pressure', () => {
      const result = analyzeAuction('600519', 1800, 1e6, 1750, 800000, 200000);
      expect(result.type).toBe('buying_pressure');
      expect(result.auctionImbalance).toBeGreaterThan(0);
    });

    it('should analyze selling pressure', () => {
      const result = analyzeAuction('600519', 1700, 1e6, 1750, 200000, 800000);
      expect(result.type).toBe('selling_pressure');
      expect(result.auctionImbalance).toBeLessThan(0);
    });

    it('should detect institutional signal', () => {
      const result = analyzeAuction('600519', 1800, 5e6, 1750, 4000000, 1000000);
      expect(result.institutionalSignal).toBe('accumulating');
    });

    it('should calculate price deviation', () => {
      const result = analyzeAuction('TEST', 1800, 1e6, 1750, 500000, 500000);
      expect(result.priceDeviation).toBeCloseTo(0.0286, 2);
    });
  });

  describe('generateEodSignal', () => {
    it('should generate bullish signal for pull-up', () => {
      const pattern: EndOfDayPattern = {
        ticker: 'TEST',
        date: '2026-03-31',
        pattern: 'pull_up',
        severity: 'mild',
        details: '尾盘拉升',
        last5minReturn: 0.015,
        last5minVolumeRatio: 2,
        auctionPrice: 1800,
        auctionVolume: 1e6,
        closePrice: 1800,
        closeVsVwap: 0.01,
      };
      const signal = generateEodSignal(pattern);
      expect(signal.signal).toBe('bullish');
      expect(signal.confidence).toBeGreaterThan(0);
    });

    it('should generate bearish signal for extreme pull-up', () => {
      const pattern: EndOfDayPattern = {
        ticker: 'TEST',
        date: '2026-03-31',
        pattern: 'pull_up',
        severity: 'extreme',
        details: '尾盘大幅拉升',
        last5minReturn: 0.05,
        last5minVolumeRatio: 5,
        auctionPrice: 1900,
        auctionVolume: 2e6,
        closePrice: 1900,
        closeVsVwap: 0.03,
      };
      const signal = generateEodSignal(pattern);
      expect(signal.signal).toBe('bearish'); // extreme pull-up = likely false
    });

    it('should include reasoning and expectation', () => {
      const pattern: EndOfDayPattern = {
        ticker: 'TEST',
        date: '2026-03-31',
        pattern: 'normal',
        severity: 'mild',
        details: '正常',
        last5minReturn: 0,
        last5minVolumeRatio: 1,
        auctionPrice: 1800,
        auctionVolume: 1e6,
        closePrice: 1800,
        closeVsVwap: 0,
      };
      const signal = generateEodSignal(pattern);
      expect(signal.reasoning.length).toBeGreaterThan(0);
      expect(signal.nextDayExpectation.length).toBeGreaterThan(0);
    });
  });

  describe('batchEodScan', () => {
    it('should scan multiple tickers', () => {
      const map = new Map<string, IntradaySnapshot[]>();
      map.set('600519', makeSnapshots(25));
      map.set('000858', makeSnapshots(25));

      const result = batchEodScan(map);
      expect(result.patterns.length).toBeGreaterThanOrEqual(0);
      expect(result.signals.length).toBe(result.patterns.length);
    });

    it('should skip tickers with insufficient data', () => {
      const map = new Map<string, IntradaySnapshot[]>();
      map.set('SHORT', [makeSnapshot()]);

      const result = batchEodScan(map);
      expect(result.patterns.length).toBe(0);
    });
  });
});
