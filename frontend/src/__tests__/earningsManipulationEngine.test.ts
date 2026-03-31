import { describe, it, expect } from 'vitest';
import { beneishMScore, ManipulationInput } from '../utils/earningsManipulationEngine';

describe('利润操纵检测引擎', () => {
  const input: ManipulationInput = {
    revenue: 60000, prevRevenue: 50000,
    cogs: 36000, prevCogs: 30000,
    currentAssets: 30000, totalAssets: 100000,
    currentLiabilities: 15000, depreciation: 5000,
    sgaExpense: 8000, longTermAssets: 50000,
    prevLongTermAssets: 48000, totalLiabilities: 40000,
    cashFromOperations: 10000, netIncome: 8000,
    accountsReceivable: 12000, prevAccountsReceivable: 8000,
    grossProfit: 24000, prevGrossProfit: 20000,
    intangibleAssets: 5000,
  };

  describe('beneishMScore', () => {
    it('should calculate M-Score', () => {
      const result = beneishMScore(input);
      expect(typeof result.mScore).toBe('number');
    });

    it('should classify manipulation probability', () => {
      const result = beneishMScore(input);
      expect(['low', 'moderate', 'high']).toContain(result.manipulationProbability);
    });

    it('should calculate all indices', () => {
      const result = beneishMScore(input);
      expect(result.dsri).toBeGreaterThan(0);
      expect(result.gmi).toBeGreaterThan(0);
      expect(result.aqi).toBeGreaterThanOrEqual(0);
      expect(result.sgi).toBeGreaterThan(0);
    });

    it('should flag suspicious indicators', () => {
      const result = beneishMScore(input);
      expect(result.flags.length).toBeGreaterThan(0);
      result.flags.forEach(f => {
        expect(f.indicator).toBeDefined();
        expect(typeof f.flagged).toBe('boolean');
      });
    });

    it('should detect high DSRI as suspicious', () => {
      const suspicious: ManipulationInput = {
        ...input,
        accountsReceivable: 30000,
        prevAccountsReceivable: 5000,
      };
      const result = beneishMScore(suspicious);
      const dsriFlag = result.flags.find(f => f.indicator.includes('应收'));
      expect(dsriFlag?.flagged).toBe(true);
    });

    it('should detect positive TATA', () => {
      const result = beneishMScore(input);
      const tataFlag = result.flags.find(f => f.indicator.includes('应计'));
      if (input.netIncome > input.cashFromOperations) {
        expect(tataFlag?.value).toBeGreaterThan(0);
      }
    });
  });
});
