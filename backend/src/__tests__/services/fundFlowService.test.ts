/**
 * FundFlow Service 测试
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { FundFlowService } from '../../services/fundFlowService';

describe('FundFlowService', () => {
  let service: FundFlowService;

  beforeEach(() => {
    service = new FundFlowService();
  });

  describe('addStockFlow and getLatestStockFlow', () => {
    it('should add and retrieve stock flow', () => {
      const flow = service.addStockFlow({
        stockId: 1,
        stockSymbol: '000001.SZ',
        tradeDate: new Date(),
        timeframe: 'daily',
        mainInflow: 50000000,
        mainOutflow: 30000000,
        mainNetFlow: 20000000,
        retailInflow: 10000000,
        retailOutflow: 15000000,
        retailNetFlow: -5000000,
        superLargeInflow: 20000000,
        superLargeOutflow: 10000000,
        largeInflow: 15000000,
        largeOutflow: 10000000,
        mediumInflow: 10000000,
        mediumOutflow: 8000000,
        smallInflow: 5000000,
        smallOutflow: 7000000,
      });

      expect(flow.mainNetFlow).toBe(20000000);

      const latest = service.getLatestStockFlow('000001.SZ');
      expect(latest?.mainNetFlow).toBe(20000000);
    });

    it('should return undefined for non-existent symbol', () => {
      expect(service.getLatestStockFlow('INVALID')).toBeUndefined();
    });
  });

  describe('getStockFlowHistory', () => {
    it('should return flow history', () => {
      for (let i = 0; i < 5; i++) {
        service.addStockFlow({
          stockId: 1,
          stockSymbol: '000001.SZ',
          tradeDate: new Date(Date.now() + i * 86400000),
          timeframe: 'daily',
          mainInflow: 50000000 + i * 1000000,
          mainOutflow: 30000000,
          mainNetFlow: 20000000 + i * 1000000,
          retailInflow: 10000000,
          retailOutflow: 15000000,
          retailNetFlow: -5000000,
          superLargeInflow: 20000000,
          superLargeOutflow: 10000000,
          largeInflow: 15000000,
          largeOutflow: 10000000,
          mediumInflow: 10000000,
          mediumOutflow: 8000000,
          smallInflow: 5000000,
          smallOutflow: 7000000,
        });
      }

      const history = service.getStockFlowHistory('000001.SZ', 3);
      expect(history).toHaveLength(3);
    });
  });

  describe('calculateFlowSummary', () => {
    it('should calculate flow summary', () => {
      service.addStockFlow({
        stockId: 1,
        stockSymbol: '000001.SZ',
        tradeDate: new Date(),
        timeframe: 'daily',
        mainInflow: 50000000,
        mainOutflow: 30000000,
        mainNetFlow: 20000000,
        retailInflow: 10000000,
        retailOutflow: 15000000,
        retailNetFlow: -5000000,
        superLargeInflow: 20000000,
        superLargeOutflow: 10000000,
        largeInflow: 15000000,
        largeOutflow: 10000000,
        mediumInflow: 10000000,
        mediumOutflow: 8000000,
        smallInflow: 5000000,
        smallOutflow: 7000000,
      });

      const summary = service.calculateFlowSummary('000001.SZ', '平安银行');
      expect(summary).toBeDefined();
      expect(summary?.trend).toBe('inflow');
      expect(summary?.consecutiveDays).toBe(1);
    });

    it('should return null for non-existent symbol', () => {
      expect(service.calculateFlowSummary('INVALID', '')).toBeNull();
    });
  });

  describe('getFlowRanking', () => {
    it('should return flow ranking', () => {
      service.addStockFlow({
        stockId: 1,
        stockSymbol: '000001.SZ',
        tradeDate: new Date(),
        timeframe: 'daily',
        mainInflow: 50000000,
        mainOutflow: 30000000,
        mainNetFlow: 20000000,
        retailInflow: 10000000,
        retailOutflow: 15000000,
        retailNetFlow: -5000000,
        superLargeInflow: 20000000,
        superLargeOutflow: 10000000,
        largeInflow: 15000000,
        largeOutflow: 10000000,
        mediumInflow: 10000000,
        mediumOutflow: 8000000,
        smallInflow: 5000000,
        smallOutflow: 7000000,
      });

      const ranking = service.getFlowRanking(10);
      expect(ranking.date).toBeInstanceOf(Date);
      expect(Array.isArray(ranking.topInflow)).toBe(true);
      expect(Array.isArray(ranking.topOutflow)).toBe(true);
    });
  });

  describe('addMarketFlow and getLatestMarketFlow', () => {
    it('should add and retrieve market flow', () => {
      service.addMarketFlow({
        tradeDate: new Date(),
        shMainNetFlow: 100000000,
        szMainNetFlow: -50000000,
        northBoundNetFlow: 80000000,
        southBoundNetFlow: 20000000,
        marginBalance: 1500000000000,
        marginBuy: 50000000000,
        marginSell: 30000000000,
      });

      const latest = service.getLatestMarketFlow();
      expect(latest?.northBoundNetFlow).toBe(80000000);
    });

    it('should return undefined when no flows', () => {
      expect(service.getLatestMarketFlow()).toBeUndefined();
    });
  });

  describe('alerts', () => {
    it('should add and retrieve alerts', () => {
      service.addAlert({
        stockId: 1,
        stockSymbol: '000001.SZ',
        alertType: 'main_inflow_surge',
        threshold: 100000000,
        currentValue: 0,
        isActive: true
      });

      const unread = service.getUnreadAlerts();
      expect(unread.length).toBeGreaterThan(0);
    });

    it('should mark alert as read', () => {
      const alert = service.addAlert({
        stockId: 1,
        stockSymbol: '000001.SZ',
        alertType: 'main_inflow_surge',
        threshold: 100000000,
        currentValue: 0,
        isActive: true
      });

      service.markAlertRead(alert.id);
      const unread = service.getUnreadAlerts();
      expect(unread.find(a => a.id === alert.id)).toBeUndefined();
    });
  });

  describe('detectAbnormalFlows', () => {
    it('should detect massive flows', () => {
      service.addStockFlow({
        stockId: 1,
        stockSymbol: '000001.SZ',
        tradeDate: new Date(),
        timeframe: 'daily',
        mainInflow: 200000000,
        mainOutflow: 0,
        mainNetFlow: 200000000,
        retailInflow: 0,
        retailOutflow: 0,
        retailNetFlow: 0,
        superLargeInflow: 200000000,
        superLargeOutflow: 0,
        largeInflow: 0,
        largeOutflow: 0,
        mediumInflow: 0,
        mediumOutflow: 0,
        smallInflow: 0,
        smallOutflow: 0,
      });

      const abnormal = service.detectAbnormalFlows();
      expect(abnormal.massiveInflow).toContain('000001.SZ');
    });
  });

  describe('calculateFlowStrength', () => {
    it('should calculate flow strength', () => {
      service.addStockFlow({
        stockId: 1,
        stockSymbol: '000001.SZ',
        tradeDate: new Date(),
        timeframe: 'daily',
        mainInflow: 60000000,
        mainOutflow: 40000000,
        mainNetFlow: 20000000,
        retailInflow: 10000000,
        retailOutflow: 15000000,
        retailNetFlow: -5000000,
        superLargeInflow: 20000000,
        superLargeOutflow: 10000000,
        largeInflow: 15000000,
        largeOutflow: 10000000,
        mediumInflow: 10000000,
        mediumOutflow: 8000000,
        smallInflow: 5000000,
        smallOutflow: 7000000,
      });

      const strength = service.calculateFlowStrength('000001.SZ');
      expect(strength).toBeDefined();
      expect(strength?.score).toBe(20);
    });

    it('should return null for non-existent symbol', () => {
      expect(service.calculateFlowStrength('INVALID')).toBeNull();
    });
  });
});
