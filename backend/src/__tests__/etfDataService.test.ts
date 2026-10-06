/**
 * etfDataService 真实 ETF 数据服务测试（诚实数据版）
 *
 * 数据源（P0-5A 换源后）：
 * - 实时行情：腾讯 qt.gtimg.cn（GBK 文本；[3]现价 [6]成交量(手) [32]涨跌幅% [37]成交额(万) [45]总市值(亿)）
 *   —— 原为东方财富 push2 ulist，该 host 从本机网络不可达（HTTP 000）
 * - 单位净值：东方财富 fundf10 lsjz（Data.LSJZList）—— 本机可达，**未换源**
 *
 * 约定：
 * - 行情源失败 → 抛 EtfUnavailableError（由路由层降级诚实空）；
 * - 净值源失败 → 不影响行情展示，但 premiumRate 置 null（缺真实净值，折溢价不可计算）；
 * - 未知 symbol → 返回 null（非错误）。
 *
 * 策略：stub 全局 fetch 按 URL 分发，绝不访问真实外网。
 * 行情字节按 GBK 编码（与真实回包一致），以验证生产的 GBK 解码路径。
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as iconv from 'iconv-lite';
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

/**
 * 构造腾讯格式行情文本（生产代码按 GBK 解码后 `~` 分隔，下标与真实返回一致）：
 * [1]名称 [2]代码 [3]现价 [4]昨收 [6]成交量(手) [32]涨跌幅% [37]成交额(万) [45]总市值(亿)
 */
function txLine(code: string, name: string, price: number, chgPct: number, volumeLot: number, amountWan: number, capYi: number): string {
  const f = new Array(49).fill('');
  f[1] = name;
  f[2] = code;
  f[3] = String(price);
  f[4] = String(+(price / (1 + chgPct / 100)).toFixed(4));
  f[6] = String(volumeLot);
  f[32] = String(chgPct);
  f[37] = String(amountWan);
  f[45] = String(capYi);
  return `v_${code}="${f.join('~')}";`;
}

/**
 * 为目录内全部 ETF 构造腾讯行情（覆盖所有 symbol）。
 * 数值对齐原东财 fixture 的语义：价 4.725、涨跌幅 -0.65%、成交量 20000 手、
 * 成交额 9,450,000 元 → 945万、总市值 1175.43694897 亿。
 */
function buildTencentQuotesText() {
  return ETF_CATALOG.map((c) =>
    txLine(c.symbol, c.name, 4.725, -0.65, 20_000, 945, 1175.43694897),
  ).join('\n');
}

const NAV_PAYLOAD = {
  Data: {
    LSJZList: [
      { FSRQ: '2026-08-11', DWJZ: '4.7200', LJJZ: '4.7200', JZZZL: '-0.79' },
      { FSRQ: '2026-08-08', DWJZ: '4.7575', LJJZ: '4.7575', JZZZL: '0.12' },
    ],
  },
};

/** 按 URL 分发：qt.gtimg.cn → 行情（GBK 文本）；api.fund.eastmoney.com → 净值 */
function stubFetch(opts: {
  quotesBody?: unknown;
  quotesOk?: boolean;
  quotesStatus?: number;
  navBody?: unknown;
  navOk?: boolean;
}) {
  const fn = vi.fn().mockImplementation(async (url: string) => {
    const u = String(url);
    if (u.includes('qt.gtimg.cn')) {
      const ok = opts.quotesOk ?? true;
      const status = opts.quotesStatus ?? 200;
      if (!ok) {
        return { ok: false, status } as Response;
      }
      const text = (opts.quotesBody as string | undefined) ?? buildTencentQuotesText();
      // 腾讯真实回包是 GBK 字节；必须按 GBK 编码，否则中文名在生产解码后成乱码
      const buf = iconv.encode(text, 'gbk');
      return {
        ok: true,
        status: 200,
        arrayBuffer: async () => buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength),
      } as unknown as Response;
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
    it('getEtfList 行情按腾讯字段解析并合并净值计算溢价率', async () => {
      stubFetch({});
      const list = await getEtfList();

      expect(list).toHaveLength(ETF_CATALOG.length);
      const item = list.find((e) => e.symbol === '510300')!;
      expect(item.name).toBe('沪深300ETF');
      // 腾讯 [3] 现价=4.725 直接是真值（非 ×1000 缩放）；[32] 涨跌幅 -0.65
      expect(item.price).toBe(4.725);
      expect(item.changePercent).toBe(-0.65);
      // [45] 总市值 1175.43694897 亿 → 元
      expect(item.totalAssets).toBeCloseTo(117_543_694_897, -2);
      // [6] 成交量 20000 手 → ×100 = 2,000,000 份
      expect(item.volume).toBe(2_000_000);
      // [37] 成交额 945 万元 → 元
      expect(item.turnover).toBe(9_450_000);
      // nav=4.72, preNav=4.7575（历史第二条）
      expect(item.nav).toBe(4.72);
      expect(item.preNav).toBe(4.7575);
      // premiumRate = (4.725 - 4.72) / 4.72 * 100 ≈ 0.11
      expect(item.premiumRate).toBeCloseTo(0.11, 2);
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

    it('带后缀符号与裸码行为一致（510300.SH / sh.510300 → 510300）', async () => {
      const fetchMock = stubFetch({});
      const bare = await getEtfNavHistory('510300', 30);
      const suffixed = await getEtfNavHistory('510300.SH', 30);
      const prefixed = await getEtfNavHistory('sh.510300', 30);
      expect(suffixed).toEqual(bare);
      expect(prefixed).toEqual(bare);
      // 全部命中缓存：真实净值源只应被请求一次
      const navCalls = fetchMock.mock.calls.filter((c) =>
        String(c[0]).includes('api.fund.eastmoney.com'),
      );
      expect(navCalls).toHaveLength(1);
      expect(String(navCalls[0][0])).toContain('fundCode=510300');
      // 详情同样归一
      const detail = await getEtfDetail('159915.SZ');
      expect(detail).not.toBeNull();
      expect(detail!.symbol).toBe('159915');
    });

    it('净值源失败时行情仍返回，premiumRate 为 null（诚实不可用，非 0）', async () => {
      stubFetch({ navBody: {}, navOk: false });
      const list = await getEtfList();
      const item = list.find((e) => e.symbol === '510300')!;
      expect(item.nav).toBe(0);
      // 无真实净值 → 折溢价不可计算 → null；置 0 会被读成「折溢价为 0」这一市场结论
      expect(item.premiumRate).toBeNull();
      expect(item.changePercent).toBe(-0.65); // 行情不受影响
      expect(item.price).toBe(4.725);
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

    it('未知 symbol → getEtfDetail 返回 null（不发请求）', async () => {
      const fetchMock = stubFetch({});
      expect(await getEtfDetail('999999')).toBeNull();
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it('目录外代码仍尝试真实净值源；源失败 → getEtfNavHistory 抛 EtfUnavailableError', async () => {
      stubFetch({ navOk: false });
      await expect(getEtfNavHistory('999999', 30)).rejects.toBeInstanceOf(EtfUnavailableError);
    });

    it('目录外代码（如个股 600519）净值源无数据 → 抛 EtfUnavailableError（诚实 unavailable，非伪造）', async () => {
      stubFetch({ navBody: { Data: { LSJZList: [] } } });
      await expect(getEtfNavHistory('600519', 30)).rejects.toBeInstanceOf(EtfUnavailableError);
      await expect(getEtfNavHistory('600519.SH', 30)).rejects.toBeInstanceOf(EtfUnavailableError);
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
