/**
 * macroDataService 宏观 CPI/PPI 数据服务测试（诚实数据版）
 *
 * 直接测服务实现：stub 全局 fetch 模拟东财 datacenter-web 响应。
 * 约定（与 newsDataService 一致）：
 * - 源返回真实包 → 合并解析出 {month,cpi,ppi}；
 * - 源 HTTP 非 2xx / 返回 {success:false} 错误包 / 无 data → 抛 MacroUnavailableError；
 * - 绝不返回伪造/随机的 CPI/PPI 数字。
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { getMacroCpiPpi, MacroUnavailableError } from '../services/macroDataService';

// 模拟东财 datacenter-web 真实包结构（已在本环境 egress 验证）
function cpiPayload(rows: any[]) {
  return { version: 'x', result: { pages: 1, count: rows.length, data: rows }, success: true, message: 'ok', code: 0 };
}
function ppiPayload(rows: any[]) {
  return { version: 'x', result: { pages: 1, count: rows.length, data: rows }, success: true, message: 'ok', code: 0 };
}

function makeFetch(handler: (url: string) => any) {
  return vi.fn(async (url: string) => {
    const body = handler(url);
    return {
      ok: true,
      status: 200,
      json: async () => body,
    } as Response;
  });
}

beforeEach(() => {
  vi.restoreAllMocks();
});
afterEach(() => {
  vi.unstubAllGlobals();
});

describe('getMacroCpiPpi — 真实源合并解析', () => {
  it('合并 CPI(NATIONAL_SAME) 与 PPI(BASE_SAME) 为按月升序序列', async () => {
    const fetchMock = makeFetch((url) => {
      if (url.includes('RPT_ECONOMY_CPI')) {
        return cpiPayload([
          { REPORT_DATE: '2026-07-01 00:00:00', TIME: '2026年07月份', NATIONAL_SAME: 0.5, NATIONAL_SEQUENTIAL: -0.1 },
          { REPORT_DATE: '2026-06-01 00:00:00', TIME: '2026年06月份', NATIONAL_SAME: 1.0, NATIONAL_SEQUENTIAL: -0.3 },
          { REPORT_DATE: '2026-05-01 00:00:00', TIME: '2026年05月份', NATIONAL_SAME: 1.2, NATIONAL_SEQUENTIAL: -0.1 },
        ]);
      }
      // PPI
      return ppiPayload([
        { REPORT_DATE: '2026-07-01 00:00:00', TIME: '2026年07月份', BASE: 103.5, BASE_SAME: 3.5, BASE_ACCUMULATE: 101.8 },
        { REPORT_DATE: '2026-06-01 00:00:00', TIME: '2026年06月份', BASE: 103.2, BASE_SAME: 3.1, BASE_ACCUMULATE: 101.6 },
        { REPORT_DATE: '2026-05-01 00:00:00', TIME: '2026年05月份', BASE: 102.9, BASE_SAME: 2.8, BASE_ACCUMULATE: 101.4 },
      ]);
    });
    vi.stubGlobal('fetch', fetchMock);

    const pts = await getMacroCpiPpi(24);

    // 3 个月两会齐全 → 3 个点，升序
    expect(pts).toHaveLength(3);
    expect(pts[0]).toEqual({ month: '2026-05', cpi: 1.2, ppi: 2.8 });
    expect(pts[1]).toEqual({ month: '2026-06', cpi: 1.0, ppi: 3.1 });
    expect(pts[2]).toEqual({ month: '2026-07', cpi: 0.5, ppi: 3.5 });
    // 两个源各请求一次
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('缺失月份的 PPI 不编造：仅保留两会齐全的月份', async () => {
    const fetchMock = makeFetch((url) => {
      if (url.includes('RPT_ECONOMY_CPI')) {
        return cpiPayload([
          { REPORT_DATE: '2026-07-01 00:00:00', NATIONAL_SAME: 0.5 },
          { REPORT_DATE: '2026-06-01 00:00:00', NATIONAL_SAME: 1.0 }, // PPI 无此月
        ]);
      }
      return ppiPayload([{ REPORT_DATE: '2026-07-01 00:00:00', BASE_SAME: 3.5 }]);
    });
    vi.stubGlobal('fetch', fetchMock);

    const pts = await getMacroCpiPpi(24);
    expect(pts).toHaveLength(1);
    expect(pts[0].month).toBe('2026-07');
  });
});

describe('getMacroCpiPpi — 诚实降级', () => {
  it('HTTP 非 2xx → 抛 MacroUnavailableError', async () => {
    const fetchMock = vi.fn(async () => ({ ok: false, status: 502, json: async () => ({}) }) as Response);
    vi.stubGlobal('fetch', fetchMock);
    await expect(getMacroCpiPpi(24)).rejects.toBeInstanceOf(MacroUnavailableError);
  });

  it('源返回 {success:false} 错误包（9501 报表不存在）→ 抛 MacroUnavailableError', async () => {
    const fetchMock = makeFetch(() => ({ version: null, result: null, success: false, message: '报表配置不存在,RPT_ECONOMY_CPI', code: 9501 }));
    vi.stubGlobal('fetch', fetchMock);
    await expect(getMacroCpiPpi(24)).rejects.toBeInstanceOf(MacroUnavailableError);
  });

  it('源返回空 data → 抛 MacroUnavailableError（不返回伪造序列）', async () => {
    const fetchMock = makeFetch((url) =>
      url.includes('RPT_ECONOMY_CPI') ? cpiPayload([]) : ppiPayload([]),
    );
    vi.stubGlobal('fetch', fetchMock);
    await expect(getMacroCpiPpi(24)).rejects.toBeInstanceOf(MacroUnavailableError);
  });

  it('异常值（NATIONAL_SAME 非数字）被跳过，不污染结果', async () => {
    const fetchMock = makeFetch((url) => {
      if (url.includes('RPT_ECONOMY_CPI')) {
        return cpiPayload([
          { REPORT_DATE: '2026-07-01 00:00:00', NATIONAL_SAME: 'n/a' }, // 无效
          { REPORT_DATE: '2026-06-01 00:00:00', NATIONAL_SAME: 1.0 },
        ]);
      }
      return ppiPayload([
        { REPORT_DATE: '2026-07-01 00:00:00', BASE_SAME: 3.5 },
        { REPORT_DATE: '2026-06-01 00:00:00', BASE_SAME: 3.1 },
      ]);
    });
    vi.stubGlobal('fetch', fetchMock);

    const pts = await getMacroCpiPpi(24);
    expect(pts).toHaveLength(1);
    expect(pts[0].month).toBe('2026-06'); // 仅有效月份
  });
});
