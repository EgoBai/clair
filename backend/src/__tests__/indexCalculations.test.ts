/**
 * 指数与市场指标计算测试（影子治理批次 14：断言绑定生产实现）
 *
 * 迁移原则：删除内联复制，改为 import 生产实现；旧断言与生产冲突处以生产为准。
 *
 * 生产来源（已迁移）：
 * - calculateChange / calculateAmplitude / calculateTurnoverRate ← backend/src/models/Stock.ts:225 / :231 / :236
 *   口径修正：calculateChange 返回 { change, changePercent }；旧内联只返回百分比，且 prevClose=0 时整体返回 0。
 *   生产仅在 prevClose=0 时把 changePercent 归零，change 仍为 close - prevClose。
 * - calculateDividendYield ← backend/src/utils/exRights.ts:424
 *   口径修正：生产守卫 currentPrice <= 0 → 0（旧内联只拦 === 0，负价会算出负股息率）。
 * - formatMarketCap ← shared/formatters.ts:20
 *   口径修正：cap < 1e4 时生产直接返回原始数值字符串（旧内联返回 toFixed(2)）；空值返回 '-'。
 * - calculateWACC ← frontend/src/utils/financialAnalysisEngine.ts:311（后端无实现，生产唯一实现）
 * - ROE / 负债率 / 毛利率 / 净利率 / 流动比率 ← frontend/src/utils/financialAnalysisEngine.ts:88 calculateRatios
 *   口径修正：生产返回小数比率（非百分比）；“负债率”对应 debtToAssets；
 *   流动负债=0 时生产返回 0（旧内联返回 Infinity）。
 * - calculateVWAP ← frontend/src/utils/featureEngineeringEngine.ts:172
 *   口径修正：生产入参为 high/low/close/volume 并返回累计序列（末值=加权均价）；无成交量时回退 close[i]（旧内联返回 0）。
 *
 * 生产无对应导出，保留内联（未迁移，见下方函数注释）：
 * - calculatePE / calculatePB / calculateMarketCap
 */

import { describe, it, expect } from 'vitest';

import {
  calculateChange,
  calculateAmplitude,
  calculateTurnoverRate,
} from '../models/Stock';
import { calculateDividendYield } from '../utils/exRights';
import { formatMarketCap } from '@shared/formatters';
import {
  calculateRatios,
  calculateWACC,
} from '../../../frontend/src/utils/financialAnalysisEngine';
import type { FinancialStatement } from '../../../frontend/src/utils/financialAnalysisEngine';
import { calculateVWAP } from '../../../frontend/src/utils/featureEngineeringEngine';

/**
 * 未迁移：生产无 PE 倍数导出。
 * 生产只有 scorePE 打分（backend/src/utils/futureValueUtils.ts:163）与 eps 原值（calculateRatios），
 * 硬造成生产代码会形成新的影子实现，故保留此内联 helper。
 */
function calculatePE(price: number, eps: number): number | null {
  if (eps <= 0) return null;
  return price / eps;
}

/**
 * 未迁移：生产无 PB 倍数导出（同 calculatePE，生产仅有 scorePB 打分与 bvps 原值）。
 */
function calculatePB(price: number, bvps: number): number | null {
  if (bvps <= 0) return null;
  return price / bvps;
}

/**
 * 未迁移：生产无市值计算导出（price * shares 直接内联在数据映射中）。
 * 格式化部分已迁移至 shared/formatters.ts 的 formatMarketCap。
 */
function calculateMarketCap(price: number, shares: number): number {
  return price * shares;
}

/** calculateRatios 的生产入参：财务报表（未覆盖字段置 0，避免干扰被测比率） */
function makeStatement(overrides: Partial<FinancialStatement>): FinancialStatement {
  return {
    ticker: '600519',
    date: '2024-12-31',
    revenue: 0,
    netIncome: 0,
    grossProfit: 0,
    operatingIncome: 0,
    totalAssets: 0,
    totalEquity: 0,
    totalLiabilities: 0,
    currentAssets: 0,
    currentLiabilities: 0,
    cash: 0,
    inventory: 0,
    accountsReceivable: 0,
    operatingCashFlow: 0,
    investingCashFlow: 0,
    financingCashFlow: 0,
    capex: 0,
    interestExpense: 0,
    shares: 0,
    ...overrides,
  };
}

describe('Index & Market Calculations', () => {
  describe('Price Change Calculation（生产返回 { change, changePercent }）', () => {
    it('should calculate positive change', () => {
      const result = calculateChange(110, 100);
      expect(result.change).toBe(10);
      expect(result.changePercent).toBeCloseTo(10, 10);
    });

    it('should calculate negative change', () => {
      const result = calculateChange(90, 100);
      expect(result.change).toBe(-10);
      expect(result.changePercent).toBeCloseTo(-10, 10);
    });

    it('should return 0 for no change', () => {
      expect(calculateChange(100, 100)).toEqual({ change: 0, changePercent: 0 });
    });

    it('previous price = 0：changePercent 归零，change 仍为价差（生产口径，旧断言整体为 0 已废弃）', () => {
      const result = calculateChange(100, 0);
      expect(result.changePercent).toBe(0);
      expect(result.change).toBe(100);
    });

    it('should calculate fractional change', () => {
      const result = calculateChange(100.5, 100);
      expect(result.change).toBeCloseTo(0.5, 10);
      expect(result.changePercent).toBeCloseTo(0.5, 10);
    });
  });

  describe('Amplitude Calculation', () => {
    it('should calculate daily amplitude', () => {
      expect(calculateAmplitude(110, 90, 100)).toBe(20);
    });

    it('should return 0 for flat price', () => {
      expect(calculateAmplitude(100, 100, 100)).toBe(0);
    });

    it('should handle zero previous close', () => {
      expect(calculateAmplitude(10, 5, 0)).toBe(0);
    });
  });

  describe('Turnover Rate（生产入参为流通股本）', () => {
    it('should calculate turnover rate', () => {
      expect(calculateTurnoverRate(1000000, 100000000)).toBe(1);
    });

    it('should return 0 for zero circulating shares', () => {
      expect(calculateTurnoverRate(1000, 0)).toBe(0);
    });

    it('should calculate high turnover', () => {
      expect(calculateTurnoverRate(50000000, 100000000)).toBe(50);
    });
  });

  describe('PE Ratio（内联：生产无对应导出）', () => {
    it('should calculate PE ratio', () => {
      expect(calculatePE(50, 5)).toBe(10);
    });

    it('should return null for negative EPS', () => {
      expect(calculatePE(50, -1)).toBeNull();
    });

    it('should return null for zero EPS', () => {
      expect(calculatePE(50, 0)).toBeNull();
    });
  });

  describe('PB Ratio（内联：生产无对应导出）', () => {
    it('should calculate PB ratio', () => {
      expect(calculatePB(30, 10)).toBe(3);
    });

    it('should return null for negative BVPS', () => {
      expect(calculatePB(30, -5)).toBeNull();
    });
  });

  describe('Dividend Yield（生产 exRights.calculateDividendYield）', () => {
    it('should calculate dividend yield', () => {
      expect(calculateDividendYield(2, 50)).toBeCloseTo(4, 10);
    });

    it('should return 0 for zero price', () => {
      expect(calculateDividendYield(2, 0)).toBe(0);
    });

    it('负股价同样返回 0（生产守卫 <= 0；旧内联只拦 === 0）', () => {
      expect(calculateDividendYield(2, -50)).toBe(0);
    });
  });

  describe('ROE（生产 calculateRatios.roe，小数口径）', () => {
    it('should calculate ROE', () => {
      const ratios = calculateRatios(makeStatement({ netIncome: 100, totalEquity: 1000 }));
      expect(ratios.roe).toBeCloseTo(0.1, 10); // 旧断言为百分比 10
    });

    it('should return 0 for zero equity', () => {
      const ratios = calculateRatios(makeStatement({ netIncome: 100, totalEquity: 0 }));
      expect(ratios.roe).toBe(0);
    });
  });

  describe('Debt Ratio（生产 calculateRatios.debtToAssets，小数口径）', () => {
    it('should calculate debt ratio', () => {
      const ratios = calculateRatios(makeStatement({ totalLiabilities: 400, totalAssets: 1000 }));
      expect(ratios.debtToAssets).toBeCloseTo(0.4, 10); // 旧断言为百分比 40
    });

    it('should return 0 for zero assets', () => {
      const ratios = calculateRatios(makeStatement({ totalLiabilities: 100, totalAssets: 0 }));
      expect(ratios.debtToAssets).toBe(0);
    });
  });

  describe('Gross Margin（生产 calculateRatios.grossMargin，小数口径）', () => {
    it('should calculate gross margin', () => {
      // 旧内联入参为 (revenue, cogs)；生产入参 grossProfit = revenue - cogs
      const ratios = calculateRatios(makeStatement({ revenue: 1000, grossProfit: 400 }));
      expect(ratios.grossMargin).toBeCloseTo(0.4, 10); // 旧断言为百分比 40
    });

    it('should return 0 for zero revenue', () => {
      const ratios = calculateRatios(makeStatement({ revenue: 0, grossProfit: 0 }));
      expect(ratios.grossMargin).toBe(0);
    });

    it('should handle negative margin', () => {
      const ratios = calculateRatios(makeStatement({ revenue: 100, grossProfit: -20 }));
      expect(ratios.grossMargin).toBeCloseTo(-0.2, 10); // 旧断言为百分比 -20
    });
  });

  describe('Net Margin（生产 calculateRatios.netMargin，小数口径）', () => {
    it('should calculate net margin', () => {
      const ratios = calculateRatios(makeStatement({ netIncome: 100, revenue: 1000 }));
      expect(ratios.netMargin).toBeCloseTo(0.1, 10); // 旧断言为百分比 10
    });

    it('should handle loss', () => {
      const ratios = calculateRatios(makeStatement({ netIncome: -50, revenue: 1000 }));
      expect(ratios.netMargin).toBeCloseTo(-0.05, 10); // 旧断言为百分比 -5
    });
  });

  describe('Current Ratio（生产 calculateRatios.currentRatio）', () => {
    it('should calculate current ratio', () => {
      const ratios = calculateRatios(makeStatement({ currentAssets: 500, currentLiabilities: 250 }));
      expect(ratios.currentRatio).toBe(2);
    });

    it('零流动负债返回 0（生产守卫；旧断言 Infinity 已废弃）', () => {
      const ratios = calculateRatios(makeStatement({ currentAssets: 500, currentLiabilities: 0 }));
      expect(ratios.currentRatio).toBe(0);
    });
  });

  describe('WACC（生产 financialAnalysisEngine.calculateWACC）', () => {
    it('should calculate weighted average cost of capital', () => {
      const wacc = calculateWACC(0.6, 0.1, 0.4, 0.05, 0.25);
      expect(wacc).toBeCloseTo(0.075);
    });

    it('should handle all equity financing', () => {
      const wacc = calculateWACC(1, 0.1, 0, 0.05, 0.25);
      expect(wacc).toBeCloseTo(0.1);
    });

    it('税率缺省为 0.25（生产默认参数）', () => {
      expect(calculateWACC(0.6, 0.1, 0.4, 0.05)).toBeCloseTo(0.075);
    });
  });

  describe('Market Cap Calculation', () => {
    it('should calculate market cap（内联：生产无对应导出）', () => {
      expect(calculateMarketCap(100, 1e9)).toBe(1e11);
    });

    it('should format as 万亿（shared/formatters.formatMarketCap）', () => {
      expect(formatMarketCap(2e12)).toBe('2.00万亿');
    });

    it('should format as 亿', () => {
      expect(formatMarketCap(5e10)).toBe('500.00亿');
    });

    it('should format as 万', () => {
      expect(formatMarketCap(5e5)).toBe('50.00万');
    });

    it('小于 1 万按 toFixed(2) 输出（P2/P3 统一 shared 与 frontend 口径后）', () => {
      expect(formatMarketCap(9999)).toBe('9999.00');
    });
  });

  describe('Weighted Average Price（生产 featureEngineeringEngine.calculateVWAP）', () => {
    // 生产 VWAP 以 (high+low+close)/3 为典型价；令 high=low=close 即还原“加权均价”口径
    it('should calculate VWAP（返回累计序列，末值为加权均价）', () => {
      const prices = [10, 11, 12];
      const volumes = [1000, 2000, 1000];
      const vwap = calculateVWAP(prices, prices, prices, volumes);
      expect(vwap.length).toBe(prices.length);
      expect(vwap[vwap.length - 1]).toBeCloseTo(11);
    });

    it('should handle equal volumes', () => {
      const prices = [10, 20];
      const vwap = calculateVWAP(prices, prices, prices, [100, 100]);
      expect(vwap[vwap.length - 1]).toBe(15);
    });

    it('无成交量时回退收盘价（生产口径；旧断言返回 0 已废弃）', () => {
      const prices = [10, 20];
      expect(calculateVWAP(prices, prices, prices, [0, 0])).toEqual([10, 20]);
    });
  });
});
