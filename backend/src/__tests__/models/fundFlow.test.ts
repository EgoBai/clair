/**
 * FundFlow 模型测试
 */

import { describe, it, expect } from 'vitest';
import {
  validateFlowTimeframe,
  classifyFlowDirection,
  calculateFlowIntensity,
  formatFlowAmount,
  FLOW_THRESHOLDS,
  type FundFlow,
  type SectorFundFlow,
  type MarketFundFlow,
  type FlowSummary,
  type FlowRanking,
  type FlowAlert,
  type FlowTimeframe,
  type FlowAlertType,
} from '../../models/FundFlow';

describe('FundFlow Model', () => {
  describe('validateFlowTimeframe', () => {
    it('should validate correct timeframes', () => {
      expect(validateFlowTimeframe('realtime')).toBe(true);
      expect(validateFlowTimeframe('daily')).toBe(true);
      expect(validateFlowTimeframe('weekly')).toBe(true);
      expect(validateFlowTimeframe('monthly')).toBe(true);
    });

    it('should reject invalid timeframes', () => {
      expect(validateFlowTimeframe('yearly')).toBe(false);
      expect(validateFlowTimeframe('')).toBe(false);
      expect(validateFlowTimeframe('invalid')).toBe(false);
    });
  });

  describe('classifyFlowDirection', () => {
    it('should classify positive flow as inflow', () => {
      expect(classifyFlowDirection(1000000)).toBe('inflow');
      expect(classifyFlowDirection(0.01)).toBe('inflow');
    });

    it('should classify negative flow as outflow', () => {
      expect(classifyFlowDirection(-1000000)).toBe('outflow');
      expect(classifyFlowDirection(-0.01)).toBe('outflow');
    });

    it('should classify zero flow as neutral', () => {
      expect(classifyFlowDirection(0)).toBe('neutral');
    });
  });

  describe('calculateFlowIntensity', () => {
    it('should classify strong intensity', () => {
      expect(calculateFlowIntensity(15000000, 100000000)).toBe('strong');
    });

    it('should classify moderate intensity', () => {
      expect(calculateFlowIntensity(6000000, 100000000)).toBe('moderate');
    });

    it('should classify weak intensity', () => {
      expect(calculateFlowIntensity(1000000, 100000000)).toBe('weak');
    });

    it('should handle zero turnover', () => {
      expect(calculateFlowIntensity(1000000, 0)).toBe('weak');
    });
  });

  describe('formatFlowAmount', () => {
    it('should format amounts in 亿', () => {
      expect(formatFlowAmount(150000000)).toBe('+1.50亿');
      expect(formatFlowAmount(-200000000)).toBe('-2.00亿');
    });

    it('should format amounts in 万', () => {
      expect(formatFlowAmount(500000)).toBe('+50.00万');
      expect(formatFlowAmount(-300000)).toBe('-30.00万');
    });

    it('should format small amounts directly', () => {
      expect(formatFlowAmount(500)).toBe('+500.00');
      expect(formatFlowAmount(-300)).toBe('-300.00');
    });
  });

  describe('FLOW_THRESHOLDS', () => {
    it('should have correct threshold values', () => {
      expect(FLOW_THRESHOLDS.superLarge).toBe(100000000);
      expect(FLOW_THRESHOLDS.large).toBe(50000000);
      expect(FLOW_THRESHOLDS.medium).toBe(10000000);
      expect(FLOW_THRESHOLDS.small).toBe(1000000);
    });

    it('should have thresholds in descending order', () => {
      expect(FLOW_THRESHOLDS.superLarge).toBeGreaterThan(FLOW_THRESHOLDS.large);
      expect(FLOW_THRESHOLDS.large).toBeGreaterThan(FLOW_THRESHOLDS.medium);
      expect(FLOW_THRESHOLDS.medium).toBeGreaterThan(FLOW_THRESHOLDS.small);
    });
  });

  describe('Type interfaces', () => {
    it('should allow FundFlow creation', () => {
      const flow: FundFlow = {
        id: 1,
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
        createdAt: new Date(),
      };
      expect(flow.mainNetFlow).toBe(20000000);
    });

    it('should allow FlowSummary creation', () => {
      const summary: FlowSummary = {
        symbol: '000001.SZ',
        name: '平安银行',
        mainNetFlow: 50000000,
        mainNetFlowPercent: 2.5,
        changePercent: 3.2,
        trend: 'inflow',
        consecutiveDays: 3,
      };
      expect(summary.trend).toBe('inflow');
    });

    it('should allow MarketFundFlow creation', () => {
      const marketFlow: MarketFundFlow = {
        id: 1,
        tradeDate: new Date(),
        shMainNetFlow: 100000000,
        szMainNetFlow: -50000000,
        northBoundNetFlow: 80000000,
        southBoundNetFlow: 20000000,
        marginBalance: 1500000000000,
        marginBuy: 50000000000,
        marginSell: 30000000000,
        createdAt: new Date(),
      };
      expect(marketFlow.northBoundNetFlow).toBe(80000000);
    });
  });
});
