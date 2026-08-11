/**
 * 财务报表诚实数据测试
 *
 * 约定（PROJECT-BRIEF 诚实数据红线）：
 * - financials 路由与服务不得使用 Math.random / 硬编码伪造财务数据；
 * - 真实源（东方财富）可用时返回真实三表与指标，标注 dataSource:'real'；
 * - 真实源不可达时抛出 FinancialsUnavailableError，路由层降级为 dataSource:'unavailable' + 空 data，
 *   绝不回填随机/模拟值。
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import express from 'express';
import request from 'supertest';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname2 = dirname(fileURLToPath(import.meta.url));

// ==================== 诚实数据红线：源文件不得包含 Math.random ====================

describe('financials 诚实数据红线', () => {
  const files = [
    join(__dirname2, '../api/financials.ts'),
    join(__dirname2, '../services/financialsDataService.ts'),
  ];
  for (const f of files) {
    it(`${f.split('/').pop()} 不含 Math.random 伪造`, () => {
      const src = readFileSync(f, 'utf-8');
      expect(src).not.toContain('Math.random');
    });
  }
});

// ==================== 路由层：真实路径 + 诚实空降级 ====================

// mock 整个服务模块，隔离路由层的网络依赖
vi.mock('../services/financialsDataService', () => {
  class FinancialsUnavailableError extends Error {
    constructor(msg = '财报真实源暂不可用') {
      super(msg);
      this.name = 'FinancialsUnavailableError';
    }
  }
  return {
    FinancialsUnavailableError,
    getFinancialIndicators: vi.fn(),
    getBalanceSheet: vi.fn(),
    getIncomeStatement: vi.fn(),
    getCashFlow: vi.fn(),
    getFinancialSummary: vi.fn(),
  };
});

import {
  getBalanceSheet,
  getIncomeStatement,
  getCashFlow,
  getFinancialSummary,
  getFinancialIndicators,
  FinancialsUnavailableError,
} from '../services/financialsDataService';
import financialsRouter from '../api/financials';

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use('/api', financialsRouter);
  return app;
}

describe('financials 路由 (honest-data)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('GET /api/financials/balance-sheet', () => {
    it('真实源可用时返回 dataSource:"real" 与真实三表', async () => {
      (getBalanceSheet as any).mockResolvedValue([
        { symbol: '600519', period: '2025-12-31', totalAssets: 298944579918.7, currentRatio: 4.45 },
      ]);
      const res = await request(buildApp()).get('/api/financials/balance-sheet?symbol=600519&periods=1');
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.dataSource).toBe('real');
      expect(res.body.data.periods).toHaveLength(1);
      expect(res.body.data.periods[0].totalAssets).toBeCloseTo(298944579918.7, 0);
      expect(getBalanceSheet).toHaveBeenCalledWith('600519', 1);
    });

    it('真实源失败时返回 dataSource:"unavailable" + 空数组（不伪造）', async () => {
      (getBalanceSheet as any).mockRejectedValue(new FinancialsUnavailableError('timeout'));
      const res = await request(buildApp()).get('/api/financials/balance-sheet?symbol=600519');
      expect(res.status).toBe(200);
      expect(res.body.data.dataSource).toBe('unavailable');
      expect(res.body.data.periods).toEqual([]);
      expect(res.body.data.data).toBeNull();
      expect(res.body.data.message).toContain('timeout');
    });
  });

  describe('GET /api/financials/income-statement', () => {
    it('真实源可用时返回 dataSource:"real"', async () => {
      (getIncomeStatement as any).mockResolvedValue([
        { symbol: '600519', period: '2025-12-31', totalRevenue: 172054171890.91, eps: 65.66 },
      ]);
      const res = await request(buildApp()).get('/api/financials/income-statement?symbol=600519');
      expect(res.body.data.dataSource).toBe('real');
      expect(res.body.data.periods[0].eps).toBeCloseTo(65.66, 2);
    });

    it('真实源失败时诚实空', async () => {
      (getIncomeStatement as any).mockRejectedValue(new FinancialsUnavailableError());
      const res = await request(buildApp()).get('/api/financials/income-statement?symbol=600519');
      expect(res.body.data.dataSource).toBe('unavailable');
      expect(res.body.data.periods).toEqual([]);
    });
  });

  describe('GET /api/financials/cash-flow', () => {
    it('真实源可用时返回 dataSource:"real"', async () => {
      (getCashFlow as any).mockResolvedValue([{ symbol: '600519', netOperatingCashFlow: 92463692168.43 }]);
      const res = await request(buildApp()).get('/api/financials/cash-flow?symbol=600519');
      expect(res.body.data.dataSource).toBe('real');
      expect(res.body.data.periods[0].netOperatingCashFlow).toBeCloseTo(92463692168.43, 0);
    });

    it('真实源失败时诚实空', async () => {
      (getCashFlow as any).mockRejectedValue(new FinancialsUnavailableError());
      const res = await request(buildApp()).get('/api/financials/cash-flow?symbol=600519');
      expect(res.body.data.dataSource).toBe('unavailable');
    });
  });

  describe('GET /api/financials/summary', () => {
    it('真实源可用时返回汇总 + indicators（含真实 revenueGrowth/profitGrowth，非 Math.random）', async () => {
      (getFinancialSummary as any).mockResolvedValue({
        symbol: '600519',
        period: '2025-12-31',
        balanceSheet: { totalAssets: 298944579918.7, currentRatio: 4.45, debtToAssetRatio: 19.04 },
        incomeStatement: { totalRevenue: 172054171890.91, parentNetProfit: 82320067101.68, eps: 65.66 },
        cashFlow: { freeCashFlow: 90690000000, operatingCashToNetProfit: 112.4 },
        indicators: {
          grossMargin: 91.18, netMargin: 47.84, roe: 32.53, roa: 27.54,
          currentRatio: 4.45, quickRatio: 3.49, debtToAssetRatio: 19.04,
          totalAssetTurnover: 0.58, inventoryTurnover: 0.25,
          operatingCashToNetProfit: 112.4, freeCashFlow: 90690000000,
          revenueGrowth: -1.2, profitGrowth: -4.53, eps: 65.66, bps: 195.36,
        },
      });
      const res = await request(buildApp()).get('/api/financials/summary?symbol=600519');
      expect(res.body.data.dataSource).toBe('real');
      expect(res.body.data.indicators.revenueGrowth).toBeCloseTo(-1.2, 2);
      expect(res.body.data.indicators.profitGrowth).toBeCloseTo(-4.53, 2);
      expect(res.body.data.indicators.roe).toBeCloseTo(32.53, 2);
    });

    it('真实源失败时返回 dataSource:"unavailable" + null 字段（不伪造）', async () => {
      (getFinancialSummary as any).mockRejectedValue(new FinancialsUnavailableError('down'));
      const res = await request(buildApp()).get('/api/financials/summary?symbol=600519');
      expect(res.body.data.dataSource).toBe('unavailable');
      expect(res.body.data.balanceSheet).toBeNull();
      expect(res.body.data.incomeStatement).toBeNull();
      expect(res.body.data.cashFlow).toBeNull();
      expect(res.body.data.indicators).toBeNull();
    });
  });

  describe('GET /api/financials/trends', () => {
    it('真实源可用时返回指标时序（dataSource:"real"）', async () => {
      (getFinancialIndicators as any).mockResolvedValue([
        { reportDate: '2025-12-31', dataYear: '2025', roe: 32.53, eps: 65.66, grossMargin: 91.18, netMargin: 47.84, revenueGrowth: -1.2, profitGrowth: -4.53, parentNetProfit: 82320067101.68 },
        { reportDate: '2024-12-31', dataYear: '2024', roe: 34.0, eps: 68.64, grossMargin: 92.0, netMargin: 49.5, revenueGrowth: 15.66, profitGrowth: 15.3, parentNetProfit: 86228146421.62 },
      ]);
      const res = await request(buildApp()).get('/api/financials/trends?symbol=600519&metric=roe&periods=2');
      expect(res.body.data.dataSource).toBe('real');
      expect(res.body.data.values).toHaveLength(2);
      // reverse 后首项为最早年份
      expect(res.body.data.values[0].value).toBeCloseTo(34.0, 1);
    });

    it('metric=eps 时返回真实 EPS 时序', async () => {
      (getFinancialIndicators as any).mockResolvedValue([
        { reportDate: '2025-12-31', dataYear: '2025', eps: 65.66 },
      ]);
      const res = await request(buildApp()).get('/api/financials/trends?symbol=600519&metric=eps');
      expect(res.body.data.dataSource).toBe('real');
      expect(res.body.data.values[0].value).toBeCloseTo(65.66, 2);
    });

    it('metric=roa 时结合资产负债表真实计算（不调用 Math.random）', async () => {
      (getFinancialIndicators as any).mockResolvedValue([
        { reportDate: '2025-12-31', dataYear: '2025', parentNetProfit: 82320067101.68, roe: 32.53, eps: 65.66, grossMargin: 91.18, netMargin: 47.84, revenueGrowth: -1.2, profitGrowth: -4.53 },
      ]);
      (getBalanceSheet as any).mockResolvedValue([
        { totalAssets: 298944579918.7, currentRatio: 4.45, debtToAssetRatio: 19.04 },
      ]);
      const res = await request(buildApp()).get('/api/financials/trends?symbol=600519&metric=roa');
      expect(res.body.data.dataSource).toBe('real');
      // roa = parentNetProfit / totalAssets * 100 ≈ 27.54
      expect(res.body.data.values[0].value).toBeCloseTo(27.54, 1);
    });

    it('无效 metric 返回 400 校验错误', async () => {
      const res = await request(buildApp()).get('/api/financials/trends?symbol=600519&metric=bogus');
      expect(res.status).toBe(400);
    });

    it('真实源失败时返回 dataSource:"unavailable" + 空时序', async () => {
      (getFinancialIndicators as any).mockRejectedValue(new FinancialsUnavailableError('down'));
      const res = await request(buildApp()).get('/api/financials/trends?symbol=600519&metric=roe');
      expect(res.body.data.dataSource).toBe('unavailable');
      expect(res.body.data.values).toEqual([]);
    });
  });
});
