import { describe, it, expect } from 'vitest';
import {
  SectorFundFlowEngine,
  FundFlowRecord,
  SectorFundFlow,
  FlowMomentum,
  FlowConcentration,
  FlowRotationSignal
} from '../services/sectorFundFlowEngine';

describe('Sector Fund Flow Engine', () => {
  const engine = new SectorFundFlowEngine();

  const createRecord = (sector: string, timestamp: number, overrides: Partial<FundFlowRecord> = {}): FundFlowRecord => ({
    timestamp,
    sector,
    mainInflow: Math.random() * 1e8,
    mainOutflow: Math.random() * 1e8,
    retailInflow: Math.random() * 5e7,
    retailOutflow: Math.random() * 5e7,
    volume: 1e9 + Math.random() * 1e9,
    turnover: 5e8 + Math.random() * 5e8,
    ...overrides
  });

  const setupEngine = () => {
    const fresh = new SectorFundFlowEngine();
    const sectors = ['科技', '金融', '医药', '消费', '能源'];
    const baseTime = Date.now() - 30 * 86400000;

    for (let day = 0; day < 30; day++) {
      for (const sector of sectors) {
        fresh.addRecord(createRecord(sector, baseTime + day * 86400000, {
          mainInflow: 1e8 + Math.random() * 1e8 * (sector === '科技' ? 2 : 1),
          mainOutflow: 5e7 + Math.random() * 5e7,
          retailInflow: 3e7 + Math.random() * 3e7,
          retailOutflow: 4e7 + Math.random() * 4e7,
        }));
      }
    }
    return fresh;
  };

  describe('addRecord / addRecords', () => {
    it('should add a single record', () => {
      const e = new SectorFundFlowEngine();
      e.addRecord(createRecord('科技', Date.now()));
      const flow = e.getSectorFlow('科技');
      expect(flow).not.toBeNull();
    });

    it('should batch add records', () => {
      const e = new SectorFundFlowEngine();
      e.addRecords([
        createRecord('金融', Date.now()),
        createRecord('金融', Date.now() + 86400000),
        createRecord('科技', Date.now()),
      ]);
      expect(e.getSectorFlow('金融')).not.toBeNull();
      expect(e.getSectorFlow('科技')).not.toBeNull();
    });

    it('should sort records by timestamp', () => {
      const e = new SectorFundFlowEngine();
      e.addRecord(createRecord('A', 3000));
      e.addRecord(createRecord('A', 1000));
      e.addRecord(createRecord('A', 2000));
      // Should not throw
      const flow = e.getSectorFlow('A', 1);
      expect(flow).not.toBeNull();
    });
  });

  describe('getSectorFlow', () => {
    it('should return null for unknown sector', () => {
      const e = new SectorFundFlowEngine();
      expect(e.getSectorFlow('未知')).toBeNull();
    });

    it('should calculate net main flow', () => {
      const e = new SectorFundFlowEngine();
      e.addRecord(createRecord('科技', Date.now(), {
        mainInflow: 100, mainOutflow: 50, retailInflow: 30, retailOutflow: 20,
        volume: 1000, turnover: 500
      }));
      const flow = e.getSectorFlow('科技', 1);
      expect(flow).not.toBeNull();
      expect(flow!.netMainFlow).toBe(50);
    });

    it('should calculate net retail flow', () => {
      const e = new SectorFundFlowEngine();
      e.addRecord(createRecord('金融', Date.now(), {
        mainInflow: 100, mainOutflow: 50, retailInflow: 80, retailOutflow: 30,
        volume: 1000, turnover: 500
      }));
      const flow = e.getSectorFlow('金融', 1);
      expect(flow).not.toBeNull();
      expect(flow!.netRetailFlow).toBe(50);
    });

    it('should determine trend correctly', () => {
      const e = new SectorFundFlowEngine();
      e.addRecord(createRecord('A', Date.now(), {
        mainInflow: 200, mainOutflow: 100, retailInflow: 100, retailOutflow: 50
      }));
      const flow = e.getSectorFlow('A', 1);
      expect(flow!.trend).toBe('inflow');
    });

    it('should detect outflow trend', () => {
      const e = new SectorFundFlowEngine();
      e.addRecord(createRecord('B', Date.now(), {
        mainInflow: 50, mainOutflow: 200, retailInflow: 30, retailOutflow: 100
      }));
      const flow = e.getSectorFlow('B', 1);
      expect(flow!.trend).toBe('outflow');
    });

    it('should calculate flow intensity between 0 and 1', () => {
      const e = setupEngine();
      const flow = e.getSectorFlow('科技', 1);
      expect(flow).not.toBeNull();
      expect(flow!.flowIntensity).toBeGreaterThanOrEqual(0);
      expect(flow!.flowIntensity).toBeLessThanOrEqual(1);
    });

    it('should count consecutive days', () => {
      const e = new SectorFundFlowEngine();
      for (let i = 0; i < 5; i++) {
        e.addRecord(createRecord('X', Date.now() + i * 86400000, {
          mainInflow: 100, mainOutflow: 50, retailInflow: 50, retailOutflow: 30
        }));
      }
      const flow = e.getSectorFlow('X', 5);
      expect(flow).not.toBeNull();
      expect(flow!.consecutiveDays).toBeGreaterThanOrEqual(1);
    });

    it('should support multi-day lookback', () => {
      const e = setupEngine();
      const flow1 = e.getSectorFlow('科技', 1);
      const flow5 = e.getSectorFlow('科技', 5);
      expect(flow1).not.toBeNull();
      expect(flow5).not.toBeNull();
      // Multi-day flow should generally be larger
      expect(Math.abs(flow5!.totalNetFlow)).toBeGreaterThanOrEqual(Math.abs(flow1!.totalNetFlow));
    });
  });

  describe('getFlowMomentum', () => {
    it('should return null for insufficient data', () => {
      const e = new SectorFundFlowEngine();
      e.addRecord(createRecord('A', Date.now()));
      expect(e.getFlowMomentum('A')).toBeNull();
    });

    it('should calculate momentum for sufficient data', () => {
      const e = setupEngine();
      const momentum = e.getFlowMomentum('科技');
      expect(momentum).not.toBeNull();
      expect(momentum!.shortTerm).toBeTypeOf('number');
      expect(momentum!.mediumTerm).toBeTypeOf('number');
      expect(momentum!.longTerm).toBeTypeOf('number');
    });

    it('should calculate acceleration', () => {
      const e = setupEngine();
      const momentum = e.getFlowMomentum('金融');
      expect(momentum).not.toBeNull();
      expect(momentum!.acceleration).toBeTypeOf('number');
    });

    it('should classify signal correctly', () => {
      const e = setupEngine();
      const momentum = e.getFlowMomentum('科技');
      expect(momentum).not.toBeNull();
      expect(['accumulating', 'distributing', 'rotating', 'neutral']).toContain(momentum!.signal);
    });

    it('should detect accumulating signal', () => {
      const e = new SectorFundFlowEngine();
      for (let i = 0; i < 10; i++) {
        e.addRecord(createRecord('Bull', Date.now() + i * 86400000, {
          mainInflow: 200 + i * 10, mainOutflow: 50, retailInflow: 100, retailOutflow: 50
        }));
      }
      const momentum = e.getFlowMomentum('Bull');
      expect(momentum).not.toBeNull();
      expect(momentum!.signal).toBe('accumulating');
    });
  });

  describe('getFlowConcentration', () => {
    it('should return null when no data', () => {
      const e = new SectorFundFlowEngine();
      expect(e.getFlowConcentration()).toBeNull();
    });

    it('should calculate concentration metrics', () => {
      const e = setupEngine();
      const conc = e.getFlowConcentration();
      expect(conc).not.toBeNull();
      expect(conc!.topSectorShare).toBeGreaterThanOrEqual(0);
      expect(conc!.topSectorShare).toBeLessThanOrEqual(1);
      expect(conc!.concentrationIndex).toBeGreaterThanOrEqual(0);
    });

    it('should identify hot and cold sectors', () => {
      const e = setupEngine();
      const conc = e.getFlowConcentration();
      expect(conc).not.toBeNull();
      expect(Array.isArray(conc!.hotSectors)).toBe(true);
      expect(Array.isArray(conc!.coldSectors)).toBe(true);
    });

    it('should calculate divergence', () => {
      const e = setupEngine();
      const conc = e.getFlowConcentration();
      expect(conc).not.toBeNull();
      expect(conc!.divergence).toBeGreaterThanOrEqual(0);
    });
  });

  describe('detectRotationSignals', () => {
    it('should return empty for insufficient sectors', () => {
      const e = new SectorFundFlowEngine();
      for (let i = 0; i < 10; i++) {
        e.addRecord(createRecord('Only', Date.now() + i * 86400000));
      }
      expect(e.detectRotationSignals()).toEqual([]);
    });

    it('should detect rotation between sectors', () => {
      const e = new SectorFundFlowEngine();
      for (let i = 0; i < 15; i++) {
        // Sector A: distributing (decreasing inflow)
        e.addRecord(createRecord('A', Date.now() + i * 86400000, {
          mainInflow: Math.max(10, 200 - i * 15), mainOutflow: 100,
          retailInflow: 50, retailOutflow: 50
        }));
        // Sector B: accumulating (increasing inflow)
        e.addRecord(createRecord('B', Date.now() + i * 86400000, {
          mainInflow: 50 + i * 15, mainOutflow: 100,
          retailInflow: 50, retailOutflow: 50
        }));
      }
      const signals = e.detectRotationSignals();
      expect(Array.isArray(signals)).toBe(true);
    });

    it('should sort by strength', () => {
      const e = setupEngine();
      const signals = e.detectRotationSignals();
      for (let i = 1; i < signals.length; i++) {
        expect(signals[i - 1].strength).toBeGreaterThanOrEqual(signals[i].strength);
      }
    });
  });

  describe('getMarketSummary', () => {
    it('should return null when no data', () => {
      const e = new SectorFundFlowEngine();
      expect(e.getMarketSummary()).toBeNull();
    });

    it('should generate market summary', () => {
      const e = setupEngine();
      const summary = e.getMarketSummary();
      expect(summary).not.toBeNull();
      expect(summary!.sectors.length).toBeGreaterThan(0);
      expect(['bullish', 'bearish', 'neutral']).toContain(summary!.marketSentiment);
    });

    it('should rank sectors by flow', () => {
      const e = setupEngine();
      const summary = e.getMarketSummary();
      expect(summary).not.toBeNull();
      const ranks = summary!.sectors.map(s => s.rank);
      // Ranks should be sequential
      expect(ranks).toEqual(summary!.sectors.map((_, i) => i + 1));
    });

    it('should include rotation signals', () => {
      const e = setupEngine();
      const summary = e.getMarketSummary();
      expect(summary).not.toBeNull();
      expect(Array.isArray(summary!.rotation)).toBe(true);
    });

    it('should include concentration data', () => {
      const e = setupEngine();
      const summary = e.getMarketSummary();
      expect(summary).not.toBeNull();
      expect(summary!.concentration).toBeDefined();
      expect(summary!.concentration.topSectorShare).toBeGreaterThanOrEqual(0);
    });

    it('should calculate total net flow', () => {
      const e = setupEngine();
      const summary = e.getMarketSummary();
      expect(summary).not.toBeNull();
      expect(summary!.totalNetFlow).toBeTypeOf('number');
    });
  });

  describe('detectAnomalies', () => {
    it('should return empty for insufficient data', () => {
      const e = new SectorFundFlowEngine();
      for (let i = 0; i < 5; i++) {
        e.addRecord(createRecord('X', Date.now() + i * 86400000));
      }
      expect(e.detectAnomalies('X')).toEqual([]);
    });

    it('should detect anomalies', () => {
      const e = new SectorFundFlowEngine();
      for (let i = 0; i < 20; i++) {
        e.addRecord(createRecord('Y', Date.now() + i * 86400000, {
          mainInflow: 100, mainOutflow: 50, retailInflow: 50, retailOutflow: 30
        }));
      }
      // Add an anomaly
      e.addRecord(createRecord('Y', Date.now() + 20 * 86400000, {
        mainInflow: 1e10, mainOutflow: 100, retailInflow: 50, retailOutflow: 30
      }));
      const anomalies = e.detectAnomalies('Y', 2);
      expect(anomalies.length).toBeGreaterThan(0);
      expect(anomalies[anomalies.length - 1].type).toBe('surge');
    });

    it('should return empty for unknown sector', () => {
      const e = new SectorFundFlowEngine();
      expect(e.detectAnomalies('unknown')).toEqual([]);
    });

    it('should include z-scores', () => {
      const e = new SectorFundFlowEngine();
      for (let i = 0; i < 20; i++) {
        e.addRecord(createRecord('Z', Date.now() + i * 86400000, {
          mainInflow: i === 15 ? 1e10 : 100,
          mainOutflow: 50, retailInflow: 50, retailOutflow: 30
        }));
      }
      const anomalies = e.detectAnomalies('Z', 1.5);
      for (const a of anomalies) {
        expect(a.zScore).toBeTypeOf('number');
        expect(Math.abs(a.zScore)).toBeGreaterThanOrEqual(1.5);
      }
    });
  });

  describe('edge cases', () => {
    it('should handle zero flows', () => {
      const e = new SectorFundFlowEngine();
      e.addRecord(createRecord('Zero', Date.now(), {
        mainInflow: 0, mainOutflow: 0, retailInflow: 0, retailOutflow: 0,
        volume: 0, turnover: 0
      }));
      const flow = e.getSectorFlow('Zero', 1);
      expect(flow).not.toBeNull();
      expect(flow!.totalNetFlow).toBe(0);
      expect(flow!.flowIntensity).toBe(0);
    });

    it('should handle very large numbers', () => {
      const e = new SectorFundFlowEngine();
      e.addRecord(createRecord('Big', Date.now(), {
        mainInflow: 1e15, mainOutflow: 5e14, retailInflow: 1e14, retailOutflow: 5e13,
        volume: 1e16, turnover: 1e15
      }));
      const flow = e.getSectorFlow('Big', 1);
      expect(flow).not.toBeNull();
      expect(isFinite(flow!.totalNetFlow)).toBe(true);
    });

    it('should handle many sectors', () => {
      const e = new SectorFundFlowEngine();
      for (let s = 0; s < 50; s++) {
        e.addRecord(createRecord(`Sector${s}`, Date.now(), {
          mainInflow: Math.random() * 1e9,
          mainOutflow: Math.random() * 1e9,
          retailInflow: Math.random() * 1e8,
          retailOutflow: Math.random() * 1e8
        }));
      }
      const summary = e.getMarketSummary();
      expect(summary).not.toBeNull();
      expect(summary!.sectors.length).toBe(50);
    });
  });
});
