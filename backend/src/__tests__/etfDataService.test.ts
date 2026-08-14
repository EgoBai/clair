/**
 * etfDataService 真实 ETF 数据服务测试（诚实数据版）
 *
 * 注意：etfDataService.ts 为在途未跟踪文件，本测试只读它、不修改它。
 *
 * 数据源：
 * - 实时行情：东方财富 push2 ulist（f2=价×1000, f3=涨跌幅×100, f20=总市值, f6=成交量）
 * - 单位净值：东方财富 fundf10 lsjz（Data.LSJZList）
 *
 * 约定：
 * - 行情源失败 → 抛 EtfUnavailableError（由路由层降级诚实空）；
 * - 净值源失败 → 不影响行情展示（premiumRate 退化为 0）；
 * - 未知 symbol → 返回 null（非错误）。
 *
 * 策略：stub 全局 fetch 按 URL 分发，绝不访问真实外网。
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  getEtfList,
  getEtfDetail,
  getEtfNavHistory,
  clearEtfCache,
  EtfUnavailableError,
  ETF_CATALOG,
} from '../services/etfDataService';

function jsonResponse(body: unknown, init?: { ok?: boolean; status?: number }) {
  return {
    ok: init?.ok ?? true,
    status: init?.status ?? 200,
    json: () => Promise.resolve(body),
  } as Response;
}

/** 为目录内全部 ETF 构造行情 diff（覆盖所有 symbol，避免逐只补抓） */
function buildFullQuotesDiff() {
  return ETF_CATALOG.map((c) => ({
    f12: c.symbol,
    f14: c.name,
    f2: 4725, // 价 ×1000 → 4.725
    f3: -65, // 涨跌幅 ×100 → -0.65
    f4: -31,
    f6: 2_000_000, // 成交量（份）
    f20: 117_543_694_897, // 总市值（元）
    f21: 9_450_000,
  }));
}

const NAV_PAYLOAD = {
  Data: {
    LSJZList: [
      { FSRQ: '2026-08-11', DWJZ: '4.7200', LJJZ: '4.7200', JZZZL: '-0.79' },
      { FSRQ: '2026-08-08', DWJZ: '4.7575', LJJZ: '4.7575', JZZZL: '0.12' },
    ],
  },
};

/** 按 URL 分发：ulist → 行情；lsjz → 净值 */
function stubFetch(opts: {
  quotesBody?: unknown;
  quotesOk?: boolean;
  quotesStatus?: number;
  navBody?: unknown;
  navOk?: boolean;
}) {
  const fn = vi.fn().mockImplementation(async (url: string) => {
    const u = String(url);
    if (u.includes('push2.eastmoney.com')) {
      return jsonResponse(opts.quotesBody ?? { data: { diff: buildFullQuotesDiff() } }, {
        ok: opts.quotesOk ?? true,
        status: opts.quotesStatus ?? 200,
      });
    }
    if (u.includes('api.fund.eastmoney.com')) {
      return jsonResponse(opts.navBody ?? NAV_PAYLOAD, { ok: opts.navOk ?? true });
    }
    throw new Error(`unexpected url: ${u}`);
  });
  vi.stubGlobal('fetch', fn);
  return fn;
}

describe('etfDataService (honest-data)', () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
    clearEtfCache();
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  describe('(a) 真实样例响应 → 字段映射正确', () => {
    it('getEtfList 行情 f2/f3 正确缩放并合并净值计算溢价率', async () => {
      stubFetch({});
      const list = await getEtfList();

      expect(list).toHaveLength(ETF_CATALOG.length);
      const item = list.find((e) => e.symbol === '510300')!;
      expect(item.name).toBe('沪深300ETF');
      // f2=4725 → price 4.725（内部）, f3=-65 → changePercent -0.65
      expect(item.changePercent).toBe(-0.65);
      expect(item.totalAssets).toBe(117_543_694_897);
      expect(item.volume).toBe(2_000_000);
      // nav=4.72, preNav=4.7575（历史第二条）
      expect(item.nav).toBe(4.72);
      expect(item.preNav).toBe(4.7575);
      // premiumRate = (4.725 - 4.72) / 4.72 * 100 ≈ 0.11
      expect(item.premiumRate).toBeCloseTo(0.11, 2);
      // turnover = price * volume = 4.725 * 2,000,000
      expect(item.turnover).toBe(4.725 * 2_000_000);
      // 静态目录字段透传
      expect(item.expenseRatio).toBe(0.15);
      expect(item.holdings).toBe(300);
    });

    it('getEtfDetail 返回单只 ETF 完整字段', async () => {
      stubFetch({});
      const detail = await getEtfDetail('159915');
      expect(detail).not.toBeNull();
      expect(detail!.symbol).toBe('159915');
      expect(detail!.name).toBe('创业板ETF');
      expect(detail!.type).toBe('index');
      expect(detail!.market).toBeUndefined(); // 不出现在 EtfItem 上
      expect(detail!.changePercent).toBe(-0.65);
      expect(detail!.nav).toBe(4.72);
    });

    it('getEtfNavHistory 映射净值历史（日期/单位净值/累计净值/日增长率）', async () => {
      stubFetch({});
      const res = await getEtfNavHistory('510300', 30);
      expect(res).not.toBeNull();
      expect(res!.symbol).toBe('510300');
      expect(res!.name).toBe('沪深300ETF');
      expect(res!.history).toHaveLength(2);
      expect(res!.history[0]).toEqual({
        date: '2026-08-11',
        nav: 4.72,
        accNav: 4.72,
        changePercent: -0.79,
      });
    });

    it('净值源失败时行情仍返回，premiumRate 退化为 0（诚实降级）', async () => {
      stubFetch({ navBody: {}, navOk: false });
      const list = await getEtfList();
      const item = list.find((e) => e.symbol === '510300')!;
      expect(item.nav).toBe(0);
      expect(item.premiumRate).toBe(0);
      expect(item.changePercent).toBe(-0.65); // 行情不受影响
    });
  });

  describe('(b) 源不可达 → 抛 EtfUnavailableError / 诚实 null', () => {
    it('行情源 HTTP 非 2xx → getEtfList 抛 EtfUnavailableError', async () => {
      stubFetch({ quotesOk: false, quotesStatus: 500 });
      await expect(getEtfList()).rejects.toBeInstanceOf(EtfUnavailableError);
    });

    it('行情 fetch reject（网络不可达）→ getEtfList 抛 EtfUnavailableError', async () => {
      vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network down')));
      await expect(getEtfList()).rejects.toBeInstanceOf(EtfUnavailableError);
    });

    it('getEtfDetail 行情源失败 → 抛 EtfUnavailableError', async () => {
      stubFetch({ quotesOk: false, quotesStatus: 503 });
      await expect(getEtfDetail('510300')).rejects.toBeInstanceOf(EtfUnavailableError);
    });

    it('未知 symbol → getEtfDetail / getEtfNavHistory 返回 null（不发请求）', async () => {
      const fetchMock = stubFetch({});
      expect(await getEtfDetail('999999')).toBeNull();
      expect(await getEtfNavHistory('999999', 30)).toBeNull();
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it('净值源失败 → getEtfNavHistory 抛 EtfUnavailableError', async () => {
      stubFetch({ navOk: false });
      await expect(getEtfNavHistory('510300', 30)).rejects.toBeInstanceOf(EtfUnavailableError);
    });
  });

  describe('(d) 净值缓存行为', () => {
    it('TTL 内同 symbol 净值只抓取一次', async () => {
      const fetchMock = stubFetch({});
      await getEtfNavHistory('510300', 5);
      await getEtfNavHistory('510300', 5);
      const navCalls = fetchMock.mock.calls.filter((c) =>
        String(c[0]).includes('api.fund.eastmoney.com'),
      );
      expect(navCalls).toHaveLength(1);
    });

    it('clearEtfCache 后重新抓取', async () => {
      const fetchMock = stubFetch({});
      await getEtfNavHistory('510300', 5);
      clearEtfCache();
      await getEtfNavHistory('510300', 5);
      const navCalls = fetchMock.mock.calls.filter((c) =>
        String(c[0]).includes('api.fund.eastmoney.com'),
      );
      expect(navCalls).toHaveLength(2);
    });
  });
});
