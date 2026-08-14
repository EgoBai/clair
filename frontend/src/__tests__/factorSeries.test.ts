/**
 * 财务因子序列前端接入测试（诚实数据版）
 *
 * 约定：EP/BP/GROWTH/ROE 四因子仅来自后端 /api/financials/factor-series 真实源，
 * 绝不回填随机 / 伪造因子值。
 * - getFactorSeries：真实形态 payload → real；dataSource='unavailable' / 请求失败 → 诚实空；
 * - buildICFactorData（财务 kind）：factorValue 取自最近一期年报，forwardReturn 由价格推导，全为有限数；
 * - 无财务因子序列的标的诚实跳过（不虚构因子值）。
 *
 * 策略：mock ../services/api 的 apiService.get，按 URL 分发样例响应，无需真实外网。
 */

import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest';

vi.mock('../services/api', () => ({
  apiService: { get: vi.fn() },
}));

import { apiService } from '../services/api';
import {
  getFactorSeries,
  getBatchFactorSeries,
  clearFactorSeriesCache,
  clearHistoryCache,
  getBatchHistory,
  buildICFactorData,
  type FactorSeries,
  type HistorySeries,
} from '../services/backtestDataService';

const apiGet = apiService.get as Mock;

// ==================== 确定性 mock 数据 ====================

/** 生成 2024 年起的确定性日线（无 Math.random） */
function makeKlinePayload(symbol: string, nDays = 400) {
  const baseDay = Date.UTC(2024, 0, 1);
  const dates: string[] = [];
  const prices: number[] = [];
  for (let i = 0; i < nDays; i++) {
    const d = new Date(baseDay + i * 86_400_000);
    dates.push(d.toISOString().slice(0, 10));
    prices.push(10 + (i % 97)); // 确定性正价
  }
  return {
    symbol,
    dataSource: 'real' as const,
    dates,
    opens: [...prices],
    highs: [...prices],
    lows: [...prices],
    prices,
    volumes: prices.map(() => 1000),
    amounts: prices.map(() => 1000),
  };
}

/** 两个年报期（升序），用于验证因子值随报告期切换 */
function makeFactorSeriesPayload(symbol: string) {
  return {
    symbol,
    dataSource: 'real' as const,
    periods: [
      { date: '2023-12-31', ep: 0.05, bp: 0.13, roe: 30, revenueGrowth: 20, profitGrowth: 18 },
      { date: '2024-12-31', ep: 0.048, bp: 0.125, roe: 29, revenueGrowth: 10, profitGrowth: 9 },
    ],
  };
}

const SYMBOLS = ['600519', '601318', '000858'];

function setupMocks(factorSymbols: string[] = SYMBOLS) {
  apiGet.mockImplementation((path: string, params?: { symbol?: string }) => {
    const symbol = params?.symbol ?? '';
    if (path === '/market/kline') {
      if (SYMBOLS.includes(symbol)) {
        return Promise.resolve({ success: true, data: makeKlinePayload(symbol) });
      }
      return Promise.resolve({
        success: true,
        data: { symbol, dataSource: 'unavailable', dates: [], opens: [], highs: [], lows: [], prices: [], volumes: [], amounts: [] },
      });
    }
    if (path === '/financials/factor-series') {
      if (factorSymbols.includes(symbol)) {
        return Promise.resolve({ success: true, data: makeFactorSeriesPayload(symbol) });
      }
      return Promise.resolve({
        success: true,
        data: { symbol, dataSource: 'unavailable', periods: [], message: '财务因子序列源不可用' },
      });
    }
    return Promise.resolve({ success: true, data: { dataSource: 'unavailable' } });
  });
}

function expectAllFinite(values: number[], label: string) {
  for (const v of values) {
    expect(Number.isFinite(v), `${label} 应全为有限数`).toBe(true);
  }
}

beforeEach(() => {
  clearHistoryCache();
  clearFactorSeriesCache();
  apiGet.mockReset();
  setupMocks();
});

// ==================== getFactorSeries 取数 ====================

describe('getFactorSeries 取数', () => {
  it('真实形态 payload → dataSource=real，periods 升序', async () => {
    const s = await getFactorSeries('600519', 8);
    expect(s.dataSource).toBe('real');
    expect(s.symbol).toBe('600519');
    expect(s.periods).toHaveLength(2);
    expect(s.periods[0].date).toBe('2023-12-31');
    expect(s.periods[1].date).toBe('2024-12-31');
    expect(s.periods[0].ep).toBe(0.05);
    expect(s.periods[1].ep).toBe(0.048);
    expect(s.periods[1].profitGrowth).toBe(9);
  });

  it('dataSource=unavailable → 诚实空，不伪造', async () => {
    const s = await getFactorSeries('999999', 8);
    expect(s.dataSource).toBe('unavailable');
    expect(s.periods).toEqual([]);
  });

  it('接口抛错时同样诚实降级为空序列', async () => {
    apiGet.mockRejectedValueOnce(new Error('network down'));
    const s = await getFactorSeries('600519', 8);
    expect(s.dataSource).toBe('unavailable');
    expect(s.periods).toEqual([]);
  });

  it('5 分钟缓存：同一标的二次取数不重复请求', async () => {
    await getFactorSeries('600519', 8);
    await getFactorSeries('600519', 8);
    const calls = apiGet.mock.calls.filter((c) => c[0] === '/financials/factor-series');
    expect(calls).toHaveLength(1);
  });

  it('getBatchFactorSeries 批量取数，全部标的返回', async () => {
    const map = await getBatchFactorSeries(SYMBOLS, 8, 3);
    expect(Object.keys(map).sort()).toEqual(SYMBOLS.sort());
    for (const s of Object.values(map)) {
      expect(s.dataSource).toBe('real');
    }
  });
});

// ==================== 四因子横截面构建 ====================

describe('财务因子横截面构建（EP/BP/GROWTH/ROE）', () => {
  async function fetchData(): Promise<{ batch: Record<string, HistorySeries>; factorSeries: Record<string, FactorSeries> }> {
    const batch = await getBatchHistory(SYMBOLS, 400, 3);
    const factorSeries = await getBatchFactorSeries(SYMBOLS, 8, 3);
    return { batch, factorSeries };
  }

  it('四因子均产出有限数且样本充足', async () => {
    const { batch, factorSeries } = await fetchData();
    const kinds: Array<'ep' | 'bp' | 'roe' | 'growth'> = ['ep', 'bp', 'roe', 'growth'];
    for (const kind of kinds) {
      const rows = buildICFactorData(batch, { kind, horizon: 21, step: 21 }, factorSeries);
      expect(rows.length, `${kind} 样本数`).toBeGreaterThan(20);
      expectAllFinite(rows.map((r) => r.factorValue), `${kind}.factorValue`);
      expectAllFinite(rows.map((r) => r.nextReturn), `${kind}.nextReturn`);
    }
  });

  it('factorValue 取最近一期年报（报告期 <= 采样日期），随报告期切换', async () => {
    const { batch, factorSeries } = await fetchData();
    const rows = buildICFactorData(batch, { kind: 'ep', horizon: 21, step: 21 }, factorSeries);

    const early = rows.filter((r) => r.date < '2024-12-31');
    const late = rows.filter((r) => r.date >= '2024-12-31');
    expect(early.length).toBeGreaterThan(0);
    expect(late.length).toBeGreaterThan(0);
    // 2024-12-31 之前采样 → 2023 年报 EP=0.05；之后 → 2024 年报 EP=0.048
    expect(early.every((r) => r.factorValue === 0.05)).toBe(true);
    expect(late.every((r) => r.factorValue === 0.048)).toBe(true);
  });

  it('无财务因子序列的标的诚实跳过（不虚构因子值）', async () => {
    // 仅 600519 有财务因子序列，601318/000858 无 → 其行应被跳过
    setupMocks(['600519']);
    const batch = await getBatchHistory(SYMBOLS, 400, 3);
    const factorSeries = await getBatchFactorSeries(SYMBOLS, 8, 3);

    const rows = buildICFactorData(batch, { kind: 'roe', horizon: 21, step: 21 }, factorSeries);
    expect(rows.length).toBeGreaterThan(0);
    const symbols = new Set(rows.map((r) => r.ticker));
    expect(symbols.has('600519')).toBe(true);
    expect(symbols.has('601318')).toBe(false);
    expect(symbols.has('000858')).toBe(false);
  });

  it('财务因子全空 → 该因子横截面为空（诚实空）', async () => {
    const { batch } = await fetchData();
    const emptyFs: Record<string, FactorSeries> = {};
    const rows = buildICFactorData(batch, { kind: 'bp', horizon: 21, step: 21 }, emptyFs);
    expect(rows).toEqual([]);
  });
});
