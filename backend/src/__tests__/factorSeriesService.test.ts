/**
 * 财务因子序列服务测试（诚实数据版）
 *
 * 约定：EP/BP/ROE/成长率 时序只来自真实源（东财主要财务指标 + 历史收盘价），
 * 绝不回填随机 / 伪造因子值。
 * - 真实源可用时正确推导 EP=EPS/收盘价、BP=BPS/收盘价、ROE、营收/净利同比；
 * - 任一源失败（指标 / K 线）→ 抛 FactorSeriesUnavailableError；
 * - 无年报期 / 报告期无对应收盘价 → 诚实空（UnavailableError）；
 * - symbol 归一化通过请求 URL 断言。
 *
 * 策略：stub 全局 fetch 按 URL 分发样例响应，无需真实外网即可跑绿。
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  getFactorSeries,
  FactorSeriesUnavailableError,
} from '../services/factorSeriesService';

function jsonResponse(body: unknown, init?: { ok?: boolean; status?: number }) {
  return {
    ok: init?.ok ?? true,
    status: init?.status ?? 200,
    json: () => Promise.resolve(body),
  } as Response;
}

/** 指标源样例：两个年报期（倒序），外加一条季报（应被 annual 过滤） */
const INDICATOR_ROWS = [
  {
    REPORTDATE: '2025-12-31 00:00:00',
    DATEMMDD: '年报',
    DATAYEAR: '2025',
    BASIC_EPS: 65.66,
    BPS: 195.36,
    WEIGHTAVG_ROE: 32.53,
    YSTZ: -1.2,
    SJLTZ: -4.53,
  },
  {
    REPORTDATE: '2024-12-31 00:00:00',
    DATEMMDD: '年报',
    DATAYEAR: '2024',
    BASIC_EPS: 68.64,
    BPS: 180.0,
    WEIGHTAVG_ROE: 34.0,
    YSTZ: 2.0,
    SJLTZ: 2.5,
  },
  {
    REPORTDATE: '2025-09-30 00:00:00',
    DATEMMDD: '三季报',
    DATAYEAR: '2025',
    BASIC_EPS: 48.0,
  },
];

/** K 线样例：覆盖 2024 / 2025 年报期末的收盘价 */
const KLINE_KLINES = [
  '2024-12-30,1590.00,1600.00,1605.00,1590.00,10000,160000000',
  '2024-12-31,1600.00,1605.00,1610.00,1595.00,12000,192600000',
  '2025-12-30,1680.00,1680.00,1685.00,1675.00,8000,134400000',
  '2025-12-31,1685.00,1700.00,1705.00,1680.00,10000,170000000',
];

interface StubOpts {
  indicatorRows?: unknown[] | null;
  indicatorOk?: boolean;
  indicatorStatus?: number;
  klineRows?: string[] | null;
  klineOk?: boolean;
  klineStatus?: number;
  rejectIndicator?: boolean;
  rejectKline?: boolean;
}

/** 按 URL 分发：datacenter-web → 指标；push2his → K 线 */
function stubFetch(opts: StubOpts = {}) {
  const fn = vi.fn().mockImplementation(async (url: string) => {
    const u = String(url);
    if (u.includes('datacenter-web.eastmoney.com')) {
      if (opts.rejectIndicator) throw new Error('indicator network down');
      if (opts.indicatorOk === false) return jsonResponse({}, { ok: false, status: opts.indicatorStatus ?? 500 });
      const rows = opts.indicatorRows === undefined ? INDICATOR_ROWS : opts.indicatorRows;
      return jsonResponse({ result: rows === null ? null : { data: rows, pages: 1 } });
    }
    if (u.includes('push2his.eastmoney.com')) {
      if (opts.rejectKline) throw new Error('kline network down');
      if (opts.klineOk === false) return jsonResponse({}, { ok: false, status: opts.klineStatus ?? 500 });
      const rows = opts.klineRows === undefined ? KLINE_KLINES : opts.klineRows;
      return jsonResponse({ data: { code: '600519', klines: rows === null ? null : rows } });
    }
    throw new Error(`unexpected url: ${u}`);
  });
  vi.stubGlobal('fetch', fn);
  return fn;
}

describe('factorSeriesService (honest-data)', () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
    vi.resetModules();
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  describe('(a) 真实样例响应 → 因子映射正确', () => {
    it('推导 EP/BP/ROE/成长率并升序返回', async () => {
      stubFetch();
      const res = await getFactorSeries('600519', 8);

      expect(res.symbol).toBe('600519');
      expect(res.periods).toHaveLength(2);
      // 升序：2024 → 2025
      expect(res.periods[0].date).toBe('2024-12-31');
      expect(res.periods[1].date).toBe('2025-12-31');

      const p2024 = res.periods[0];
      const p2025 = res.periods[1];

      // EP = EPS / 报告期收盘价
      expect(p2025.ep).toBeCloseTo(65.66 / 1700, 6);
      expect(p2024.ep).toBeCloseTo(68.64 / 1605, 6);
      // BP = BPS / 报告期收盘价
      expect(p2025.bp).toBeCloseTo(195.36 / 1700, 6);
      expect(p2024.bp).toBeCloseTo(180.0 / 1605, 6);
      // ROE / 成长率直接来自指标源（净利润/净资产、同比）
      expect(p2025.roe).toBeCloseTo(32.53, 2);
      expect(p2024.roe).toBeCloseTo(34.0, 2);
      expect(p2025.revenueGrowth).toBeCloseTo(-1.2, 2);
      expect(p2025.profitGrowth).toBeCloseTo(-4.53, 2);
      expect(p2024.revenueGrowth).toBeCloseTo(2.0, 2);
      expect(p2024.profitGrowth).toBeCloseTo(2.5, 2);

      // 全为有限数
      for (const p of res.periods) {
        for (const v of [p.ep, p.bp, p.roe, p.revenueGrowth, p.profitGrowth]) {
          expect(Number.isFinite(v)).toBe(true);
        }
      }
    });

    it('仅年报被采纳（季报被过滤）', async () => {
      stubFetch();
      const res = await getFactorSeries('600519', 8);
      expect(res.periods.map((p) => p.date)).toEqual(['2024-12-31', '2025-12-31']);
    });

    it('报告期早于 K 线覆盖范围时诚实跳过该期', async () => {
      // 仅保留 2025 年报期末收盘价，2024 期无对应收盘价 → 跳过
      stubFetch({
        klineRows: [
          '2025-12-30,1680.00,1680.00,1685.00,1675.00,8000,134400000',
          '2025-12-31,1685.00,1700.00,1705.00,1680.00,10000,170000000',
        ],
      });
      const res = await getFactorSeries('600519', 8);
      expect(res.periods).toHaveLength(1);
      expect(res.periods[0].date).toBe('2025-12-31');
      expect(res.periods[0].ep).toBeCloseTo(65.66 / 1700, 6);
    });
  });

  describe('(b) 双源任一失败 → 抛 FactorSeriesUnavailableError', () => {
    it('指标源不可达 → FactorSeriesUnavailableError', async () => {
      stubFetch({ rejectIndicator: true });
      await expect(getFactorSeries('600519', 8)).rejects.toBeInstanceOf(FactorSeriesUnavailableError);
    });

    it('K 线源不可达 → FactorSeriesUnavailableError', async () => {
      stubFetch({ rejectKline: true });
      await expect(getFactorSeries('600519', 8)).rejects.toBeInstanceOf(FactorSeriesUnavailableError);
    });

    it('K 线源返回结构异常（data.klines 缺失）→ FactorSeriesUnavailableError', async () => {
      stubFetch({ klineRows: null });
      await expect(getFactorSeries('600519', 8)).rejects.toBeInstanceOf(FactorSeriesUnavailableError);
    });

    it('指标源 HTTP 500 → FactorSeriesUnavailableError', async () => {
      stubFetch({ indicatorOk: false, indicatorStatus: 500 });
      await expect(getFactorSeries('600519', 8)).rejects.toBeInstanceOf(FactorSeriesUnavailableError);
    });
  });

  describe('(c) 无年报期 → 诚实空（UnavailableError）', () => {
    it('指标源返回空 → FactorSeriesUnavailableError', async () => {
      stubFetch({ indicatorRows: [] });
      await expect(getFactorSeries('600519', 8)).rejects.toBeInstanceOf(FactorSeriesUnavailableError);
    });

    it('全是季报（无年报）→ FactorSeriesUnavailableError', async () => {
      stubFetch({
        indicatorRows: [
          { REPORTDATE: '2025-09-30 00:00:00', DATEMMDD: '三季报', DATAYEAR: '2025' },
        ],
      });
      await expect(getFactorSeries('600519', 8)).rejects.toBeInstanceOf(FactorSeriesUnavailableError);
    });
  });

  describe('(d) symbol 归一化（通过请求 URL 断言）', () => {
    it('SH600519 → 指标源 secucode=600519.SH、K 线源 secid=1.600519', async () => {
      const fetchMock = stubFetch();
      await getFactorSeries('SH600519', 8);
      const urls = fetchMock.mock.calls.map((c) => String(c[0]));
      expect(urls.find((u) => u.includes('datacenter-web'))!).toContain(encodeURIComponent('600519.SH'));
      expect(urls.find((u) => u.includes('push2his'))!).toContain('secid=1.600519');
    });

    it('000001.SZ → K 线源 secid=0.000001', async () => {
      const fetchMock = stubFetch();
      await getFactorSeries('000001.SZ', 8);
      const urls = fetchMock.mock.calls.map((c) => String(c[0]));
      expect(urls.find((u) => u.includes('push2his'))!).toContain('secid=0.000001');
    });
  });
});
