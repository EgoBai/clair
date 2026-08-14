/**
 * realMarketData 真实市场数据服务测试（诚实数据版）
 *
 * 数据源：
 * - 三大指数：腾讯财经 qt.gtimg.cn（文本格式 v_sh000001="..."）
 * - 涨跌分布：东方财富 push2 ulist（JSON，f3=涨跌幅 f6=成交额 f12=代码）
 *
 * 约定：
 * - 指数源失败 → getRealMarketData 直接 reject（指数为必返回字段）；
 * - 涨跌分布源失败/数据不完整 → breadth 降级为 null（绝不影响指数）；
 * - 绝不回填演示/硬编码数据。
 *
 * 策略：stub 全局 fetch，按 URL 分发样例响应，无需真实外网。
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { getRealMarketData } from '../services/realMarketData';

// 腾讯指数文本样例：f[1]=名称 f[3]=现价 f[4]=昨收
const TENCENT_TEXT =
  'v_sh000001="1~上证指数~000001~3234.56~3220.10~0~0~0~0~0~0";\n' +
  'v_sz399001="1~深证成指~399001~11000.00~10900.00~0~0~0~0~0~0";\n' +
  'v_sz399006="1~创业板指~399006~2200.00~2250.00~0~0~0~0~0~0";';

interface BreadthItem {
  f3: number;
  f6: number;
  f12: string;
}

/** 构造 >=1000 条的全市场涨跌分布样例（东财 push2 diff 结构） */
function buildBreadthList(): BreadthItem[] {
  const list: BreadthItem[] = [];
  // 600 上涨（含 30 只主板涨停 9.9%）
  for (let i = 0; i < 600; i++) {
    const limitUp = i < 30;
    list.push({ f3: limitUp ? 9.9 : 1.5, f6: 1e8, f12: `600${String(i).padStart(3, '0')}` });
  }
  // 400 下跌（含 10 只主板跌停 -9.9%）
  for (let i = 0; i < 400; i++) {
    const limitDown = i < 10;
    list.push({ f3: limitDown ? -9.9 : -1.5, f6: 5e7, f12: `000${String(i).padStart(3, '0')}` });
  }
  // 200 平盘
  for (let i = 0; i < 200; i++) {
    list.push({ f3: 0, f6: 2e7, f12: `002${String(i).padStart(3, '0')}` });
  }
  // 创业板 20cm 涨停/跌停各 1 只（30 开头，阈值 ±19.8）
  list.push({ f3: 19.9, f6: 1e8, f12: '300001' });
  list.push({ f3: -19.9, f6: 5e7, f12: '300002' });
  return list;
}

function jsonResponse(body: unknown, init?: { ok?: boolean; status?: number }) {
  return {
    ok: init?.ok ?? true,
    status: init?.status ?? 200,
    json: () => Promise.resolve(body),
    text: () => Promise.resolve(typeof body === 'string' ? body : JSON.stringify(body)),
  } as Response;
}

function textResponse(text: string, init?: { ok?: boolean; status?: number }) {
  return {
    ok: init?.ok ?? true,
    status: init?.status ?? 200,
    text: () => Promise.resolve(text),
    json: () => Promise.reject(new Error('not json')),
  } as Response;
}

/** 按 URL 分发 mock：qt.gtimg.cn → 指数文本；push2 → 涨跌分布 JSON */
function stubFetch(handlers: {
  indices?: Response | (() => Promise<Response>);
  breadth?: Response | (() => Promise<Response>);
}) {
  const fn = vi.fn().mockImplementation(async (url: string) => {
    if (String(url).includes('qt.gtimg.cn')) {
      const h = handlers.indices;
      if (!h) throw new Error('indices fetch not stubbed');
      return typeof h === 'function' ? h() : h;
    }
    if (String(url).includes('push2.eastmoney.com')) {
      const h = handlers.breadth;
      if (!h) throw new Error('breadth fetch not stubbed');
      return typeof h === 'function' ? h() : h;
    }
    throw new Error(`unexpected url: ${url}`);
  });
  vi.stubGlobal('fetch', fn);
  return fn;
}

describe('realMarketData (honest-data)', () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  describe('(a) 真实样例响应 → 字段映射正确', () => {
    it('腾讯指数文本正确解析为三大指数行情', async () => {
      stubFetch({
        indices: textResponse(TENCENT_TEXT),
        breadth: jsonResponse({ data: { diff: buildBreadthList() } }),
      });
      const data = await getRealMarketData();

      // 上证指数：(3234.56 - 3220.10) / 3220.10 * 100 ≈ 0.45
      expect(data.shanghai.name).toBe('上证指数');
      expect(data.shanghai.price).toBe(3234.56);
      expect(data.shanghai.changePct).toBeCloseTo(0.45, 2);
      // 深证成指：(11000 - 10900) / 10900 * 100 ≈ 0.92
      expect(data.shenzhen.price).toBe(11000);
      expect(data.shenzhen.changePct).toBeCloseTo(0.92, 2);
      // 创业板指：(2200 - 2250) / 2250 * 100 ≈ -2.22
      expect(data.chinext.price).toBe(2200);
      expect(data.chinext.changePct).toBeCloseTo(-2.22, 2);
    });

    it('东财 push2 涨跌分布正确聚合（家数/涨跌停/成交额/量能比）', async () => {
      stubFetch({
        indices: textResponse(TENCENT_TEXT),
        breadth: jsonResponse({ data: { diff: buildBreadthList() } }),
      });
      const data = await getRealMarketData();
      const b = data.breadth!;

      expect(b).not.toBeNull();
      // 上涨 600 + 创业板涨停 1 = 601；下跌 400 + 创业板跌停 1 = 401；平盘 200
      expect(b.up).toBe(601);
      expect(b.down).toBe(401);
      expect(b.flat).toBe(200);
      // 涨停：主板 30 + 创业板 1 = 31；跌停：主板 10 + 创业板 1 = 11
      expect(b.limitUp).toBe(31);
      expect(b.limitDown).toBe(11);
      // 上涨成交额 = 601 * 1e8；下跌成交额 = 401 * 5e7
      expect(b.upVolume).toBe(601 * 1e8);
      expect(b.downVolume).toBe(401 * 5e7);
      // 量能比 = upVolume / downVolume
      expect(b.volumeRatio).toBeCloseTo(601 * 1e8 / (401 * 5e7), 3);
      // 总成交额（亿元）= (upVolume + downVolume + 200 * 2e7) / 1e8
      const expectedYi = +(((601 * 1e8) + (401 * 5e7) + (200 * 2e7)) / 1e8).toFixed(1);
      expect(b.turnoverYi).toBe(expectedYi);
    });

    it('兼容 data.list 字段（diff 缺失时兜底）', async () => {
      stubFetch({
        indices: textResponse(TENCENT_TEXT),
        breadth: jsonResponse({ data: { list: buildBreadthList() } }),
      });
      const data = await getRealMarketData();
      expect(data.breadth).not.toBeNull();
      expect(data.breadth!.up).toBe(601);
    });
  });

  describe('(b) 源不可达 → 指数抛出 / 宽度降级 null', () => {
    it('指数源 HTTP 非 2xx（4xx 不重试）→ getRealMarketData reject', async () => {
      stubFetch({ indices: textResponse('', { ok: false, status: 403 }) });
      await expect(getRealMarketData()).rejects.toThrow(/HTTP 403/);
    });

    it('指数文本缺失三大指数 → reject（解析失败）', async () => {
      stubFetch({
        indices: textResponse('v_sh000001="1~上证指数~000001~3234.56~3220.10";'),
      });
      await expect(getRealMarketData()).rejects.toThrow(/指数行情解析失败/);
    });

    it('涨跌分布源失败 → breadth 为 null，指数仍真实返回', async () => {
      const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      stubFetch({
        indices: textResponse(TENCENT_TEXT),
        breadth: jsonResponse({}, { ok: false, status: 403 }),
      });
      const data = await getRealMarketData();
      expect(data.shanghai.price).toBe(3234.56);
      expect(data.breadth).toBeNull();
      errSpy.mockRestore();
    });

    it('涨跌分布数据不完整（<1000 条）→ breadth 为 null', async () => {
      const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      stubFetch({
        indices: textResponse(TENCENT_TEXT),
        breadth: jsonResponse({ data: { diff: [{ f3: 1, f6: 1e8, f12: '600000' }] } }),
      });
      const data = await getRealMarketData();
      expect(data.breadth).toBeNull();
      errSpy.mockRestore();
    });

    it('涨跌分布 fetch reject（网络不可达）→ breadth 为 null 不抛出', async () => {
      const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      stubFetch({
        indices: textResponse(TENCENT_TEXT),
        breadth: () => Promise.reject(new Error('network down')),
      });
      const data = await getRealMarketData();
      expect(data.breadth).toBeNull();
      expect(data.chinext.changePct).toBeCloseTo(-2.22, 2);
      errSpy.mockRestore();
    });
  });

  describe('(c) 边界映射', () => {
    it('昨收为 0 时 changePct 诚实置 0（避免除零）', async () => {
      const text =
        'v_sh000001="1~上证指数~000001~3234.56~0~";\n' +
        'v_sz399001="1~深证成指~399001~11000.00~10900.00~";\n' +
        'v_sz399006="1~创业板指~399006~2200.00~2250.00~";';
      stubFetch({
        indices: textResponse(text),
        breadth: jsonResponse({}, { ok: false, status: 403 }),
      });
      const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      const data = await getRealMarketData();
      expect(data.shanghai.changePct).toBe(0);
      errSpy.mockRestore();
    });

    it('全部下跌时量能比诚实置 0（downVolume=0 且 upVolume=0 的极端情形走 0）', async () => {
      // 构造 1000 条全平盘：up=0 down=0 → volumeRatio=0
      const list = Array.from({ length: 1200 }, (_, i) => ({
        f3: 0,
        f6: 1e7,
        f12: `600${String(i).padStart(3, '0')}`,
      }));
      stubFetch({
        indices: textResponse(TENCENT_TEXT),
        breadth: jsonResponse({ data: { diff: list } }),
      });
      const data = await getRealMarketData();
      expect(data.breadth!.volumeRatio).toBe(0);
      expect(data.breadth!.flat).toBe(1200);
    });
  });
});
