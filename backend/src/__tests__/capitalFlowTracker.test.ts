import { describe, it, expect, beforeEach } from 'vitest';
import {
  CapitalFlowEngine,
  CapitalFlow,
  FlowType,
  FlowDirection
} from '../services/capitalFlowTracker';

describe('CapitalFlowEngine', () => {
  let engine: CapitalFlowEngine;

  beforeEach(() => {
    engine = new CapitalFlowEngine();
  });

  const makeFlow = (overrides: Partial<CapitalFlow> = {}): CapitalFlow => ({
    stockCode: '600519',
    stockName: '贵州茅台',
    timestamp: new Date().toISOString(),
    flowType: 'main',
    amount: 10000,
    direction: 'inflow',
    percentage: 5.5,
    ...overrides
  });

  describe('addFlow', () => {
    it('should add a flow for a stock', () => {
      const flow = makeFlow();
      engine.addFlow(flow);
      const flows = engine.getStockFlows('600519');
      expect(flows).toHaveLength(1);
      expect(flows[0].stockCode).toBe('600519');
    });

    it('should handle multiple flows for same stock', () => {
      engine.addFlow(makeFlow({ amount: 1000 }));
      engine.addFlow(makeFlow({ amount: 2000 }));
      engine.addFlow(makeFlow({ amount: 3000 }));
      expect(engine.getStockFlows('600519')).toHaveLength(3);
    });

    it('should track flows for different stocks separately', () => {
      engine.addFlow(makeFlow({ stockCode: '600519' }));
      engine.addFlow(makeFlow({ stockCode: '000858' }));
      expect(engine.getStockFlows('600519')).toHaveLength(1);
      expect(engine.getStockFlows('000858')).toHaveLength(1);
    });
  });

  describe('addFlows', () => {
    it('should add multiple flows at once', () => {
      const flows = [
        makeFlow({ stockCode: '600519' }),
        makeFlow({ stockCode: '000858' }),
        makeFlow({ stockCode: '601318' })
      ];
      engine.addFlows(flows);
      expect(engine.getStockFlows('600519')).toHaveLength(1);
      expect(engine.getStockFlows('000858')).toHaveLength(1);
      expect(engine.getStockFlows('601318')).toHaveLength(1);
    });

    it('should handle empty array', () => {
      engine.addFlows([]);
      expect(engine.getStockFlows('600519')).toHaveLength(0);
    });
  });

  describe('getStockFlows', () => {
    it('should return empty array for unknown stock', () => {
      expect(engine.getStockFlows('999999')).toHaveLength(0);
    });

    it('should filter by flow type', () => {
      engine.addFlow(makeFlow({ flowType: 'main' }));
      engine.addFlow(makeFlow({ flowType: 'northbound' }));
      engine.addFlow(makeFlow({ flowType: 'main' }));
      
      const mainFlows = engine.getStockFlows('600519', 'main');
      expect(mainFlows).toHaveLength(2);
      mainFlows.forEach(f => expect(f.flowType).toBe('main'));
    });

    it('should return all flows when no filter', () => {
      engine.addFlow(makeFlow({ flowType: 'main' }));
      engine.addFlow(makeFlow({ flowType: 'northbound' }));
      engine.addFlow(makeFlow({ flowType: 'margin' }));
      expect(engine.getStockFlows('600519')).toHaveLength(3);
    });
  });

  describe('calculateSummary', () => {
    it('should calculate inflow and outflow totals', () => {
      engine.addFlow(makeFlow({ direction: 'inflow', amount: 50000, flowType: 'main' }));
      engine.addFlow(makeFlow({ direction: 'outflow', amount: 30000, flowType: 'main' }));
      
      const summary = engine.calculateSummary('600519', '1d');
      expect(summary.totalInflow).toBe(50000);
      expect(summary.totalOutflow).toBe(30000);
      expect(summary.netFlow).toBe(20000);
    });

    it('should calculate main flow net', () => {
      engine.addFlow(makeFlow({ direction: 'inflow', amount: 80000, flowType: 'main' }));
      engine.addFlow(makeFlow({ direction: 'outflow', amount: 20000, flowType: 'main' }));
      engine.addFlow(makeFlow({ direction: 'inflow', amount: 10000, flowType: 'northbound' }));
      
      const summary = engine.calculateSummary('600519', '1d');
      expect(summary.mainInflow).toBe(80000);
      expect(summary.mainOutflow).toBe(20000);
      expect(summary.mainNetFlow).toBe(60000);
    });

    it('should calculate northbound net', () => {
      engine.addFlow(makeFlow({ direction: 'inflow', amount: 30000, flowType: 'northbound' }));
      engine.addFlow(makeFlow({ direction: 'outflow', amount: 10000, flowType: 'northbound' }));
      
      const summary = engine.calculateSummary('600519', '1d');
      expect(summary.northboundNet).toBe(20000);
    });

    it('should determine accumulating trend', () => {
      engine.addFlow(makeFlow({ direction: 'inflow', amount: 100000, flowType: 'main' }));
      engine.addFlow(makeFlow({ direction: 'inflow', amount: 50000, flowType: 'retail' }));
      
      const summary = engine.calculateSummary('600519', '1d');
      expect(summary.flowTrend).toBe('accumulating');
    });

    it('should determine distributing trend', () => {
      engine.addFlow(makeFlow({ direction: 'outflow', amount: 100000, flowType: 'main' }));
      engine.addFlow(makeFlow({ direction: 'outflow', amount: 50000, flowType: 'retail' }));
      
      const summary = engine.calculateSummary('600519', '1d');
      expect(summary.flowTrend).toBe('distributing');
    });

    it('should calculate strength 0-100', () => {
      engine.addFlow(makeFlow({ direction: 'inflow', amount: 100000 }));
      engine.addFlow(makeFlow({ direction: 'outflow', amount: 10000 }));
      
      const summary = engine.calculateSummary('600519', '1d');
      expect(summary.strength).toBeGreaterThanOrEqual(0);
      expect(summary.strength).toBeLessThanOrEqual(100);
    });

    it('should handle no flows gracefully', () => {
      const summary = engine.calculateSummary('600519', '1d');
      expect(summary.totalInflow).toBe(0);
      expect(summary.totalOutflow).toBe(0);
      expect(summary.netFlow).toBe(0);
      expect(summary.flowTrend).toBe('neutral');
    });
  });

  describe('updateSectorFlow', () => {
    it('should aggregate sector flows', () => {
      const stockFlows = [
        { stockCode: '600519', period: '1d', totalInflow: 50000, totalOutflow: 30000, netFlow: 20000, mainInflow: 40000, mainOutflow: 20000, mainNetFlow: 20000, northboundNet: 5000, flowTrend: 'accumulating' as const, strength: 80 },
        { stockCode: '000858', period: '1d', totalInflow: 40000, totalOutflow: 20000, netFlow: 20000, mainInflow: 30000, mainOutflow: 15000, mainNetFlow: 15000, northboundNet: 3000, flowTrend: 'accumulating' as const, strength: 70 }
      ];
      
      engine.updateSectorFlow('baijiu', '白酒', stockFlows);
      const sector = engine.getSectorFlow('baijiu');
      
      expect(sector).toBeDefined();
      expect(sector!.sectorName).toBe('白酒');
      expect(sector!.netFlow).toBe(40000);
      expect(sector!.stockCount).toBe(2);
      expect(sector!.avgNetFlow).toBe(20000);
    });

    it('should rank stocks by net flow', () => {
      const stockFlows = [
        { stockCode: '600519', period: '1d', totalInflow: 30000, totalOutflow: 10000, netFlow: 20000, mainInflow: 25000, mainOutflow: 5000, mainNetFlow: 20000, northboundNet: 5000, flowTrend: 'accumulating' as const, strength: 80 },
        { stockCode: '000858', period: '1d', totalInflow: 50000, totalOutflow: 10000, netFlow: 40000, mainInflow: 45000, mainOutflow: 5000, mainNetFlow: 40000, northboundNet: 8000, flowTrend: 'accumulating' as const, strength: 90 },
        { stockCode: '000568', period: '1d', totalInflow: 20000, totalOutflow: 25000, netFlow: -5000, mainInflow: 15000, mainOutflow: 20000, mainNetFlow: -5000, northboundNet: -2000, flowTrend: 'distributing' as const, strength: 30 }
      ];
      
      engine.updateSectorFlow('baijiu', '白酒', stockFlows);
      const sector = engine.getSectorFlow('baijiu');
      
      expect(sector!.topInflow[0].code).toBe('000858');
      expect(sector!.topOutflow[0].code).toBe('000568');
    });
  });

  describe('getAllSectorFlows', () => {
    it('should return sectors sorted by net flow descending', () => {
      engine.updateSectorFlow('tech', '科技', []);
      engine.updateSectorFlow('finance', '金融', []);
      
      const sectors = engine.getAllSectorFlows();
      expect(Array.isArray(sectors)).toBe(true);
    });

    it('should return empty array when no sectors', () => {
      expect(engine.getAllSectorFlows()).toHaveLength(0);
    });
  });

  describe('detectAnomaly', () => {
    it('should detect anomalous flow amounts', () => {
      // Add 20 normal flows
      for (let i = 0; i < 20; i++) {
        engine.addFlow(makeFlow({ amount: 1000 + Math.random() * 100 }));
      }
      // Add an anomaly
      engine.addFlow(makeFlow({ amount: 50000 }));
      
      expect(engine.detectAnomaly('600519', 3)).toBe(true);
    });

    it('should not flag normal flows as anomaly', () => {
      for (let i = 0; i < 20; i++) {
        engine.addFlow(makeFlow({ amount: 1000 + Math.random() * 50 }));
      }
      
      expect(engine.detectAnomaly('600519', 3)).toBe(false);
    });

    it('should return false for insufficient data', () => {
      engine.addFlow(makeFlow({ amount: 99999 }));
      expect(engine.detectAnomaly('600519')).toBe(false);
    });

    it('should return false for unknown stock', () => {
      expect(engine.detectAnomaly('999999')).toBe(false);
    });
  });

  describe('flow types', () => {
    it('should support all flow types', () => {
      const types: FlowType[] = ['main', 'northbound', 'margin', 'institutional', 'retail'];
      types.forEach(type => {
        engine.addFlow(makeFlow({ flowType: type }));
      });
      expect(engine.getStockFlows('600519')).toHaveLength(5);
    });

    it('should support all flow directions', () => {
      const directions: FlowDirection[] = ['inflow', 'outflow', 'neutral'];
      directions.forEach(dir => {
        engine.addFlow(makeFlow({ direction: dir }));
      });
      expect(engine.getStockFlows('600519')).toHaveLength(3);
    });
  });
});
