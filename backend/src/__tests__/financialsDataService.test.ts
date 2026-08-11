/**
 * 财务报表数据服务测试（真实源映射 + 诚实空）
 *
 * 不 mock 服务模块本身，仅 stub 全局 fetch 模拟东财源响应。
 * 验证：真实源可用时正确映射字段；真实源失败/空数据时抛出 FinancialsUnavailableError（不回填伪造）。
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

function mockFetchOnce(payload: unknown, ok = true) {
  const fn = vi.fn().mockImplementation(async () => ({
    ok,
    status: 200,
    json: async () => payload,
  }));
  vi.stubGlobal('fetch', fn);
  return fn;
}

describe('financialsDataService (honest-data)', () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
    vi.resetModules();
  });
  afterEach(() => { vi.unstubAllGlobals(); });

  it('getFinancialIndicators 真实源可用时映射真实指标', async () => {
    mockFetchOnce({
      result: {
        pages: 1,
        data: [
          {
            SECUCODE: '600519.SH',
            SECURITY_CODE: '600519',
            SECURITY_NAME_ABBR: '贵州茅台',
            REPORTDATE: '2025-12-31 00:00:00',
            DATEMMDD: '年报',
            DATATYPE: '2025年 年报',
            DATAYEAR: '2025',
            BASIC_EPS: 65.66,
            DEDUCT_BASIC_EPS: 65.64,
            TOTAL_OPERATE_INCOME: 172054171890.91,
            PARENT_NETPROFIT: 82320067101.68,
            WEIGHTAVG_ROE: 32.53,
            BPS: 195.36,
            MGJYXJJE: 49.13,
            XSMLL: 91.18,
            YSTZ: -1.2,
            SJLTZ: -4.53,
            ZXGXL: 2.31,
          },
        ],
      },
    });
    const { getFinancialIndicators } = await import('../services/financialsDataService');
    const data = await getFinancialIndicators('600519', 4, 'annual');
    expect(data).toHaveLength(1);
    const d = data[0];
    expect(d.eps).toBeCloseTo(65.66, 2);
    expect(d.roe).toBeCloseTo(32.53, 2);
    expect(d.revenue).toBeCloseTo(172054171890.91, 0);
    expect(d.parentNetProfit).toBeCloseTo(82320067101.68, 0);
    expect(d.grossMargin).toBeCloseTo(91.18, 2);
    expect(d.revenueGrowth).toBeCloseTo(-1.2, 2);
    expect(d.profitGrowth).toBeCloseTo(-4.53, 2);
    // netMargin 由真实营收/净利推导（非随机）
    expect(d.netMargin).toBeCloseTo((82320067101.68 / 172054171890.91) * 100, 1);
    expect(d.reportDate).toBe('2025-12-31');
    expect(d.reportType).toBe('年报');
  });

  it('getFinancialIndicators 仅取年报（过滤季报）', async () => {
    mockFetchOnce({
      result: {
        data: [
          { REPORTDATE: '2025-12-31 00:00:00', DATEMMDD: '年报', DATAYEAR: '2025', BASIC_EPS: 65.66, TOTAL_OPERATE_INCOME: 1, PARENT_NETPROFIT: 1, WEIGHTAVG_ROE: 30, XSMLL: 90, YSTZ: 1, SJLTZ: 1 },
          { REPORTDATE: '2025-09-30 00:00:00', DATEMMDD: '三季报', DATAYEAR: '2025', BASIC_EPS: 48, TOTAL_OPERATE_INCOME: 1, PARENT_NETPROFIT: 1, WEIGHTAVG_ROE: 22, XSMLL: 90, YSTZ: 1, SJLTZ: 1 },
          { REPORTDATE: '2024-12-31 00:00:00', DATEMMDD: '年报', DATAYEAR: '2024', BASIC_EPS: 68.64, TOTAL_OPERATE_INCOME: 2, PARENT_NETPROFIT: 2, WEIGHTAVG_ROE: 34, XSMLL: 92, YSTZ: 2, SJLTZ: 2 },
        ],
      },
    });
    const { getFinancialIndicators } = await import('../services/financialsDataService');
    const data = await getFinancialIndicators('600519', 4, 'annual');
    expect(data).toHaveLength(2);
    expect(data.every((d) => d.reportType === '年报')).toBe(true);
  });

  it('getFinancialIndicators 真实源失败时抛出 FinancialsUnavailableError（不回填伪造）', async () => {
    const fn = vi.fn().mockRejectedValue(new Error('network down'));
    vi.stubGlobal('fetch', fn);
    const { getFinancialIndicators, FinancialsUnavailableError } = await import('../services/financialsDataService');
    await expect(getFinancialIndicators('600519', 4)).rejects.toBeInstanceOf(FinancialsUnavailableError);
  });

  it('getFinancialIndicators 源返回空数据时抛出 FinancialsUnavailableError', async () => {
    mockFetchOnce({ result: { data: [] } });
    const { getFinancialIndicators, FinancialsUnavailableError } = await import('../services/financialsDataService');
    await expect(getFinancialIndicators('999999', 4)).rejects.toBeInstanceOf(FinancialsUnavailableError);
  });

  it('normalizeSymbol 支持多种符号格式', async () => {
    // 间接验证：通过不同符号调用，确认不抛错且发请求时 code 形式正确
    const fn = mockFetchOnce({ result: { data: [] } });
    const { getFinancialIndicators } = await import('../services/financialsDataService');
    await expect(getFinancialIndicators('SH600519', 1)).rejects.toBeInstanceOf(Error);
    // 确实发起了请求（说明符号归一化后走到了 fetch）
    expect(fn).toHaveBeenCalled();
    const url = String(fn.mock.calls[0][0]);
    expect(url).toContain('600519.SH');
  });
});
