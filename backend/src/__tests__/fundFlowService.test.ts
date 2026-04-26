import { describe, it, expect, beforeEach } from 'vitest';
import { FundFlowService } from '../services/fundFlowService';

describe('FundFlowService', () => {
  let service: FundFlowService;

  beforeEach(() => {
    service = new FundFlowService();
  });

  const makeFlow = (symbol: string, overrides: Partial<any> = {}) => ({
    stockId: 1,
    stockSymbol: symbol,
    tradeDate: new Date(),
    timeframe: 'daily' as const,
    mainInflow: 500000,
    mainOutflow: 300000,
    mainNetFlow: 200000,
    retailInflow: 100000,
    retailOutflow: 150000,
    retailNetFlow: -50000,
    superLargeInflow: 200000,
    superLargeOutflow: 100000,
    largeInflow: 300000,
    largeOutflow: 200000,
    mediumInflow: 80000,
    mediumOutflow: 90000,
    smallInflow: 70000,
    smallOutflow: 60000,
    ...overrides,
  });

  describe('addStockFlow', () => {
    it('should add a stock flow and return with id', () => {
      const flow = service.addStockFlow(makeFlow('600519'));
      expect(flow.id).toBeGreaterThan(0);
      expect(flow.stockSymbol).toBe('600519');
      expect(flow.createdAt).toBeInstanceOf(Date);
    });

    it('should accumulate flows for same stock', () => {
      service.addStockFlow(makeFlow('600519'));
      service.addStockFlow(makeFlow('600519', { mainNetFlow: 300000 }));
      const history = service.getStockFlowHistory('600519');
      expect(history).toHaveLength(2);
    });
  });

  describe('getLatestStockFlow', () => {
    it('should return undefined for unknown stock', () => {
      expect(service.getLatestStockFlow('UNKNOWN')).toBeUndefined();
    });

    it('should return the latest flow', () => {
      service.addStockFlow(makeFlow('600519', { mainNetFlow: 100 }));
      service.addStockFlow(makeFlow('600519', { mainNetFlow: 200 }));
      const latest = service.getLatestStockFlow('600519');
      expect(latest?.mainNetFlow).toBe(200);
    });
  });

  describe('getStockFlowHistory', () => {
    it('should respect limit parameter', () => {
      for (let i = 0; i < 50; i++) {
        service.addStockFlow(makeFlow('600519', { mainNetFlow: i }));
      }
      expect(service.getStockFlowHistory('600519', 10)).toHaveLength(10);
    });

    it('should return empty for unknown stock', () => {
      expect(service.getStockFlowHistory('UNKNOWN')).toHaveLength(0);
    });
  });

  describe('calculateFlowSummary', () => {
    it('should return null for empty flows', () => {
      expect(service.calculateFlowSummary('UNKNOWN', 'Test')).toBeNull();
    });

    it('should calculate trend as inflow when mainNetFlow > 0', () => {
      service.addStockFlow(makeFlow('600519', { mainNetFlow: 200000, mainInflow: 500000, mainOutflow: 300000 }));
      const summary = service.calculateFlowSummary('600519', '茅台');
      expect(summary).not.toBeNull();
      expect(summary!.trend).toBe('inflow');
      expect(summary!.symbol).toBe('600519');
      expect(summary!.consecutiveDays).toBe(1);
    });

    it('should calculate trend as outflow when mainNetFlow < 0', () => {
      service.addStockFlow(makeFlow('600519', { mainNetFlow: -200000 }));
      const summary = service.calculateFlowSummary('600519', '茅台');
      expect(summary!.trend).toBe('outflow');
    });

    it('should count consecutive inflow days', () => {
      service.addStockFlow(makeFlow('600519', { mainNetFlow: 100000 }));
      service.addStockFlow(makeFlow('600519', { mainNetFlow: 200000 }));
      service.addStockFlow(makeFlow('600519', { mainNetFlow: 300000 }));
      const summary = service.calculateFlowSummary('600519', '茅台');
      expect(summary!.consecutiveDays).toBe(3);
    });

    it('should reset consecutive days when direction changes', () => {
      service.addStockFlow(makeFlow('600519', { mainNetFlow: 100000 }));
      service.addStockFlow(makeFlow('600519', { mainNetFlow: -200000 }));
      service.addStockFlow(makeFlow('600519', { mainNetFlow: 300000 }));
      const summary = service.calculateFlowSummary('600519', '茅台');
      expect(summary!.consecutiveDays).toBe(1);
    });
  });

  describe('getFlowRanking', () => {
    it('should return top inflow and outflow stocks', () => {
      service.addStockFlow(makeFlow('600519', { mainNetFlow: 500000, mainInflow: 600000, mainOutflow: 100000 }));
      service.addStockFlow(makeFlow('000858', { mainNetFlow: -300000, mainInflow: 100000, mainOutflow: 400000 }));
      service.addStockFlow(makeFlow('000001', { mainNetFlow: 200000, mainInflow: 400000, mainOutflow: 200000 }));

      const ranking = service.getFlowRanking();
      expect(ranking.topInflow.length).toBeGreaterThan(0);
      expect(ranking.topOutflow.length).toBeGreaterThan(0);
      expect(ranking.topInflow[0].mainNetFlow).toBeGreaterThanOrEqual(ranking.topInflow[1]?.mainNetFlow || -Infinity);
    });

    it('should return empty when no flows', () => {
      const ranking = service.getFlowRanking();
      expect(ranking.topInflow).toHaveLength(0);
      expect(ranking.topOutflow).toHaveLength(0);
    });
  });

  describe('market flows', () => {
    it('should add and retrieve market flow', () => {
      const flow = service.addMarketFlow({
        tradeDate: new Date(),
        shMainNetFlow: 1000000,
        szMainNetFlow: 500000,
        northBoundNetFlow: 800000,
        southBoundNetFlow: 200000,
        marginBalance: 5000000,
        marginBuy: 300000,
        marginSell: 100000,
      });
      expect(flow.id).toBeGreaterThan(0);

      const latest = service.getLatestMarketFlow();
      expect(latest?.northBoundNetFlow).toBe(800000);
    });

    it('should return undefined when no market flows', () => {
      expect(service.getLatestMarketFlow()).toBeUndefined();
    });

    it('should get northbound flow history', () => {
      for (let i = 0; i < 5; i++) {
        service.addMarketFlow({
          tradeDate: new Date(),
          shMainNetFlow: 0, szMainNetFlow: 0,
          northBoundNetFlow: i * 100000,
          southBoundNetFlow: 0, marginBalance: 0, marginBuy: 0, marginSell: 0,
        });
      }
      expect(service.getNorthBoundFlowHistory(3)).toHaveLength(3);
    });
  });

  describe('sector flows', () => {
    it('should add sector flow and get ranking', () => {
      service.addSectorFlow({
        sectorId: 1, sectorName: '科技', tradeDate: new Date(),
        mainNetFlow: 500000, mainInflow: 600000, mainOutflow: 100000,
        changePercent: 2.5, stockCount: 50,
        leadingInflowStock: '600519', leadingOutflowStock: '000858',
      });
      service.addSectorFlow({
        sectorId: 2, sectorName: '医药', tradeDate: new Date(),
        mainNetFlow: 300000, mainInflow: 400000, mainOutflow: 100000,
        changePercent: 1.2, stockCount: 40,
        leadingInflowStock: '000001', leadingOutflowStock: '000002',
      });

      const ranking = service.getSectorFlowRanking();
      expect(ranking).toHaveLength(2);
      expect(ranking[0].sectorName).toBe('科技');
    });
  });

  describe('alerts', () => {
    it('should add and retrieve unread alerts', () => {
      const alert = service.addAlert({
        stockSymbol: '600519',
        stockId: 0,
        alertType: 'main_inflow_surge',
        threshold: 1000000,
        isActive: true,
        currentValue: 0,
      });
      expect(alert.id).toBeGreaterThan(0);
      expect(alert.isRead).toBe(false);

      const unread = service.getUnreadAlerts();
      expect(unread).toHaveLength(1);
    });

    it('should mark alert as read', () => {
      const alert = service.addAlert({
        stockSymbol: '600519',
        stockId: 0,
        alertType: 'main_inflow_surge',
        threshold: 1000000,
        isActive: true,
        currentValue: 0,
      });

      service.markAlertRead(alert.id);
      expect(service.getUnreadAlerts()).toHaveLength(0);
    });
  });

  describe('detectAbnormalFlows', () => {
    it('should detect massive inflow', () => {
      service.addStockFlow(makeFlow('600519', { mainNetFlow: 200000000 }));
      const result = service.detectAbnormalFlows();
      expect(result.massiveInflow).toContain('600519');
    });

    it('should detect massive outflow', () => {
      service.addStockFlow(makeFlow('600519', { mainNetFlow: -200000000 }));
      const result = service.detectAbnormalFlows();
      expect(result.massiveOutflow).toContain('600519');
    });

    it('should detect consecutive inflow', () => {
      for (let i = 0; i < 6; i++) {
        service.addStockFlow(makeFlow('600519', { mainNetFlow: 100000 }));
      }
      const result = service.detectAbnormalFlows();
      expect(result.consecutiveInflow).toContain('600519');
    });
  });

  describe('calculateFlowStrength', () => {
    it('should return null for unknown stock', () => {
      expect(service.calculateFlowStrength('UNKNOWN')).toBeNull();
    });

    it('should return strong_inflow for high net ratio', () => {
      service.addStockFlow(makeFlow('600519', { mainInflow: 900000, mainOutflow: 100000, mainNetFlow: 800000 }));
      const result = service.calculateFlowStrength('600519');
      expect(result!.strength).toBe('strong_inflow');
      expect(result!.score).toBeGreaterThan(20);
    });

    it('should return strong_outflow for negative net ratio', () => {
      service.addStockFlow(makeFlow('600519', { mainInflow: 100000, mainOutflow: 900000, mainNetFlow: -800000 }));
      const result = service.calculateFlowStrength('600519');
      expect(result!.strength).toBe('strong_outflow');
    });

    it('should return neutral when no flow', () => {
      service.addStockFlow(makeFlow('600519', { mainInflow: 0, mainOutflow: 0, mainNetFlow: 0 }));
      const result = service.calculateFlowStrength('600519');
      expect(result!.strength).toBe('neutral');
      expect(result!.score).toBe(0);
    });
  });
});
