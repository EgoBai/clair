import { describe, it, expect } from 'vitest';
import {
  calculatePortfolioRisk,
  calculateStopLoss,
  calculatePositionSize,
  checkRiskLimits,
  type Position,
  type StopLossConfig,
  type PositionSizeConfig,
  type RiskLimit,
} from '../utils/riskManagementEngine';

function createPosition(overrides: Partial<Position> = {}): Position {
  return {
    symbol: 'TEST',
    quantity: 100,
    avgCost: 100,
    currentPrice: 105,
    sector: 'Tech',
    ...overrides
  };
}

describe('风险管理引擎', () => {
  describe('calculatePortfolioRisk', () => {
    it('should calculate total PnL', () => {
      const positions = [
        createPosition({ symbol: 'A', quantity: 100, avgCost: 100, currentPrice: 110 }),
        createPosition({ symbol: 'B', quantity: 50, avgCost: 200, currentPrice: 190 }),
      ];
      const marketReturns = Array(60).fill(0.001);
      const portReturns = Array(60).fill(0.002);

      const risk = calculatePortfolioRisk(positions, marketReturns, portReturns);
      expect(risk.totalValue).toBe(100 * 110 + 50 * 190);
      expect(risk.totalPnL).toBe(100 * 10 + 50 * (-10));
    });

    it('should calculate VaR', () => {
      const positions = [createPosition()];
      const marketReturns = Array(60).fill(0.001);
      const portReturns = Array.from({ length: 60 }, () => (Math.random() - 0.5) * 0.04);

      const risk = calculatePortfolioRisk(positions, marketReturns, portReturns);
      expect(risk.var95).toBeGreaterThanOrEqual(0);
      expect(risk.var99).toBeGreaterThanOrEqual(risk.var95);
    });

    it('should calculate drawdown', () => {
      const positions = [createPosition()];
      const marketReturns = Array(60).fill(0.001);
      const portReturns = [0.01, 0.01, -0.05, -0.03, 0.02, 0.01, -0.02, ...Array(53).fill(0.001)];

      const risk = calculatePortfolioRisk(positions, marketReturns, portReturns);
      expect(risk.maxDrawdown).toBeGreaterThan(0);
      expect(risk.currentDrawdown).toBeGreaterThanOrEqual(0);
    });

    it('should calculate sector exposure', () => {
      const positions = [
        createPosition({ symbol: 'A', quantity: 100, currentPrice: 100, sector: 'Tech' }),
        createPosition({ symbol: 'B', quantity: 100, currentPrice: 100, sector: 'Finance' }),
      ];

      const risk = calculatePortfolioRisk(positions, [], []);
      expect(risk.sectorExposure.get('Tech')).toBeCloseTo(0.5, 5);
      expect(risk.sectorExposure.get('Finance')).toBeCloseTo(0.5, 5);
    });

    it('should handle empty positions', () => {
      const risk = calculatePortfolioRisk([], [], []);
      expect(risk.totalValue).toBe(0);
      expect(risk.totalPnL).toBe(0);
    });
  });

  describe('calculateStopLoss', () => {
    it('fixed stop loss', () => {
      const config: StopLossConfig = { type: 'fixed', value: 0.05 };
      const stop = calculateStopLoss(100, 105, 108, 2, config);
      expect(stop).toBeCloseTo(95, 5);
    });

    it('trailing stop loss', () => {
      const config: StopLossConfig = { type: 'trailing', value: 0.05 };
      const stop = calculateStopLoss(100, 105, 110, 2, config);
      expect(stop).toBeCloseTo(104.5, 1); // 110 * 0.95
    });

    it('ATR stop loss', () => {
      const config: StopLossConfig = { type: 'atr', value: 2 };
      const stop = calculateStopLoss(100, 105, 108, 3, config);
      expect(stop).toBeCloseTo(99, 5); // 105 - 3*2
    });
  });

  describe('calculatePositionSize', () => {
    it('fixed percentage', () => {
      const config: PositionSizeConfig = {
        method: 'fixed_pct',
        maxPositionPct: 0.2,
        riskPerTrade: 0.02,
        maxCorrelatedExposure: 0.4,
      };
      const shares = calculatePositionSize(100000, 100, 95, config);
      expect(shares).toBe(200); // 100000 * 0.2 / 100
    });

    it('risk parity', () => {
      const config: PositionSizeConfig = {
        method: 'risk_parity',
        maxPositionPct: 0.5,
        riskPerTrade: 0.02,
        maxCorrelatedExposure: 0.4,
      };
      const shares = calculatePositionSize(100000, 100, 95, config);
      // riskAmount = 100000 * 0.02 = 2000, riskPerShare = 5, shares = 400
      // maxShares = 100000 * 0.5 / 100 = 500, so 400 < 500
      expect(shares).toBe(400);
    });

    it('should respect max position limit', () => {
      const config: PositionSizeConfig = {
        method: 'risk_parity',
        maxPositionPct: 0.1,
        riskPerTrade: 0.1,
        maxCorrelatedExposure: 0.4,
      };
      const shares = calculatePositionSize(100000, 100, 99, config);
      // risk_parity would give 100000*0.1/1 = 10000, but max is 100000*0.1/100 = 100
      expect(shares).toBeLessThanOrEqual(100);
    });

    it('should return 0 for zero risk per share', () => {
      const config: PositionSizeConfig = {
        method: 'risk_parity',
        maxPositionPct: 0.2,
        riskPerTrade: 0.02,
        maxCorrelatedExposure: 0.4,
      };
      const shares = calculatePositionSize(100000, 100, 100, config);
      expect(shares).toBe(0);
    });
  });

  describe('checkRiskLimits', () => {
    it('should alert on high drawdown', () => {
      const risk = {
        totalValue: 100000, totalPnL: 5000, totalPnLPct: 0.05,
        var95: 5000, var99: 8000, cvar95: 6000,
        maxDrawdown: 0.15, currentDrawdown: 0.09,
        beta: 1.1, trackingError: 0.05, concentrationRisk: 0.3,
        sectorExposure: new Map([['Tech', 0.5]]),
        correlationRisk: 0.6,
      };

      const limits: RiskLimit = {
        maxDrawdown: 0.1, maxDailyLoss: 0.03, maxPositionSize: 0.25,
        maxSectorExposure: 0.4, maxCorrelation: 0.5, maxLeverage: 2,
      };

      const alerts = checkRiskLimits(risk, limits, []);
      expect(alerts.some(a => a.type === 'drawdown')).toBe(true);
    });

    it('should alert on sector concentration', () => {
      const risk = {
        totalValue: 100000, totalPnL: 0, totalPnLPct: 0,
        var95: 0, var99: 0, cvar95: 0,
        maxDrawdown: 0, currentDrawdown: 0,
        beta: 1, trackingError: 0, concentrationRisk: 0.2,
        sectorExposure: new Map([['Tech', 0.6]]),
        correlationRisk: 0.3,
      };

      const limits: RiskLimit = {
        maxDrawdown: 0.2, maxDailyLoss: 0.05, maxPositionSize: 0.3,
        maxSectorExposure: 0.4, maxCorrelation: 0.5, maxLeverage: 2,
      };

      const alerts = checkRiskLimits(risk, limits, []);
      expect(alerts.some(a => a.type === 'sector_exposure')).toBe(true);
    });

    it('should return no alerts for safe portfolio', () => {
      const risk = {
        totalValue: 100000, totalPnL: 1000, totalPnLPct: 0.01,
        var95: 1000, var99: 2000, cvar95: 1500,
        maxDrawdown: 0.05, currentDrawdown: 0.01,
        beta: 1, trackingError: 0.02, concentrationRisk: 0.1,
        sectorExposure: new Map([['Tech', 0.3]]),
        correlationRisk: 0.2,
      };

      const limits: RiskLimit = {
        maxDrawdown: 0.2, maxDailyLoss: 0.05, maxPositionSize: 0.3,
        maxSectorExposure: 0.5, maxCorrelation: 0.7, maxLeverage: 2,
      };

      const alerts = checkRiskLimits(risk, limits, []);
      expect(alerts.length).toBe(0);
    });
  });
});
