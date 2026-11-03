/**
 * /api/compare —— 同业对比的「缺失即 null」契约
 *
 * 背景：`grossMargin` 对银行/保险是**无此口径**（无营业成本科目），后端给 null。
 * 两个必须守住的点：
 *   1. 路由层不得把 null 洗成 0（否则页面出现「毛利率 0.0%」这种假数）；
 *   2. 指标文案必须写「归母净利率」，与东财/同花顺的归母口径对齐，避免
 *      「净利率」这个名字下并存两种算法。
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import express from 'express';
import request from 'supertest';

const mocks = vi.hoisted(() => ({
  getStocksWithLatestQuotes: vi.fn(),
  getFinancialIndicators: vi.fn(),
  getBalanceSheet: vi.fn(),
}));

vi.mock('../db/dbFactory', () => ({
  getDb: () => ({ getStocksWithLatestQuotes: mocks.getStocksWithLatestQuotes }),
}));

vi.mock('../services/financialsDataService', () => ({
  getFinancialIndicators: mocks.getFinancialIndicators,
  getBalanceSheet: mocks.getBalanceSheet,
  FinancialsUnavailableError: class FinancialsUnavailableError extends Error {},
}));

import compareRouter from '../api/stock-compare';

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use('/api', compareRouter);
  return app;
}

/** 银行：毛利率无口径（null），归母净利率有值 */
const BANK_INDICATOR = {
  reportDate: '2025-12-31',
  dataYear: '2025',
  roe: 6.76,
  grossMargin: null,
  netMargin: 28.75,
  revenueGrowth: 1.88,
  profitGrowth: 10.52,
  dividendYield: 3.1,
  ocfPerShare: 2.0,
};

describe('GET /api/compare 诚实契约（缺失为 null，不洗成 0）', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getStocksWithLatestQuotes.mockImplementation(async (syms: string[]) =>
      syms.map((s) => ({
        symbol: s,
        name: s === '600000' ? '浦发银行' : '贵州茅台',
        latestQuote: null,
      })),
    );
    mocks.getFinancialIndicators.mockResolvedValue([BANK_INDICATOR]);
    mocks.getBalanceSheet.mockResolvedValue([{ debtToAssetRatio: 91.82, currentRatio: 0 }]);
  });

  it('银行股 grossMargin 原样返回 null（不是 0，也不是空字符串）', async () => {
    const res = await request(buildApp()).get('/api/compare?symbols=600000,600519');

    expect(res.status).toBe(200);
    const stocks = res.body.data.stocks as Array<{ metrics: Record<string, unknown> }>;
    expect(stocks).toHaveLength(2);
    for (const s of stocks) {
      expect(s.metrics.grossMargin).toBeNull();
      expect(s.metrics.grossMargin).not.toBe(0);
    }
  });

  it('净利率字段按归母口径透传，指标文案写「归母净利率」且不残留裸「净利率」', async () => {
    const res = await request(buildApp()).get('/api/compare?symbols=600000,600519');

    const stocks = res.body.data.stocks as Array<{ metrics: Record<string, unknown> }>;
    expect(stocks[0].metrics.netMargin).toBe(28.75);

    const labels = (res.body.data.metrics as Array<{ label: string; key: string }>).map((m) => m.label);
    expect(labels).toContain('归母净利率');
    expect(labels).not.toContain('净利率');
  });
});
