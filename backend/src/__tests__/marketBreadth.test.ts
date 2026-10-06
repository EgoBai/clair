/**
 * 市场宽度分析服务测试（诚实数据版）
 *
 * 约定：marketBreadth 不生成任何随机/模拟数据。
 * - 真实源 = 腾讯 qt.gtimg.cn 逐标的行情 + DB 真实股票清单（mock getDb）
 * - 覆盖不足/源不可达 → 抛出 BreadthUnavailableError（由路由层降级为诚实空）
 * - newHighs/newLows 无真实源 → 恒为 null（**不是 0**，0 会被读成「今日无新高」）
 * - 板块宽度/历史时序尚未接入真实源，返回空（前端按“未接入”处理）
 *
 * 策略：stub 全局 fetch 返回腾讯格式文本，绝不访问真实外网。
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

vi.mock('../db/dbFactory', () => ({
  getDb: vi.fn(),
}));

import { getDb } from '../db/dbFactory';
import { marketBreadthService, BreadthUnavailableError, toTencentQuoteSymbol } from '../services/marketBreadth';

/** 构造一条腾讯格式行情文本（GBK 解码后的 `~` 分隔形态，下标按生产代码） */
function txLine(opts: {
  symbol: string;
  name?: string;
  price: number;
  prevClose: number;
  changePercent: number;
  amountWan?: number;
  limitUp?: number;
  limitDown?: number;
}): string {
  const f = new Array(49).fill('');
  f[1] = opts.name ?? '测试股';
  f[2] = opts.symbol;
  f[3] = String(opts.price);
  f[4] = String(opts.prevClose);
  f[32] = String(opts.changePercent);
  f[37] = String(opts.amountWan ?? 10000);
  f[47] = String(opts.limitUp ?? 0);
  f[48] = String(opts.limitDown ?? 0);
  return `v_${opts.symbol}="${f.join('~')}";`;
}

/** stub fetch：按请求 URL 里的代码返回对应行情行（模拟腾讯按代码逐个回包） */
function stubFetch(linesByCode: Record<string, string>) {
  vi.stubGlobal('fetch', vi.fn(async (url: string) => {
    if (!String(url).includes('qt.gtimg.cn')) throw new Error(`unexpected fetch: ${url}`);
    const q = String(url).split('q=')[1] ?? '';
    const out: string[] = [];
    for (const code of q.split(',')) {
      const hit = linesByCode[code];
      if (hit) out.push(hit);
    }
    const buf = new TextEncoder().encode(out.join('\n'));
    return {
      ok: true,
      status: 200,
      arrayBuffer: async () => buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength),
    } as unknown as Response;
  }));
}

/** 3 只标的清单：涨 / 跌 / 平 */
const LISTING = [
  { symbol: '600000.SH', name: '浦发银行', market: 'SH' },
  { symbol: '000001.SZ', name: '平安银行', market: 'SZ' },
  { symbol: '600519.SH', name: '贵州茅台', market: 'SH' },
];

const LINES = {
  sh600000: txLine({ symbol: 'sh600000', name: '浦发银行', price: 9.48, prevClose: 9.18, changePercent: 3.27, amountWan: 10000, limitUp: 10.10, limitDown: 8.26 }),
  sz000001: txLine({ symbol: 'sz000001', name: '平安银行', price: 11.35, prevClose: 11.57, changePercent: -1.94, amountWan: 20000, limitUp: 12.49, limitDown: 10.22 }),
  sh600519: txLine({ symbol: 'sh600519', name: '贵州茅台', price: 1500, prevClose: 1500, changePercent: 0, amountWan: 30000 }),
};

describe('toTencentQuoteSymbol', () => {
  it('带后缀 symbol + market → sh/sz/bj 前缀', () => {
    expect(toTencentQuoteSymbol('600000.SH', 'SH')).toBe('sh600000');
    expect(toTencentQuoteSymbol('000001.SZ', 'SZ')).toBe('sz000001');
    expect(toTencentQuoteSymbol('430047.BJ', 'BJ')).toBe('bj430047');
  });

  it('内存库式裸码 + market 同样正确', () => {
    expect(toTencentQuoteSymbol('600000', 'SH')).toBe('sh600000');
    expect(toTencentQuoteSymbol('sh600000')).toBe('sh600000');
  });

  it('非法代码返回 null（不构造脏请求）', () => {
    expect(toTencentQuoteSymbol('ABCDEF', 'SH')).toBeNull();
    expect(toTencentQuoteSymbol('', 'SH')).toBeNull();
  });
});

describe('MarketBreadthService (honest-data)', () => {
  beforeEach(() => {
    marketBreadthService.clearCache();
    vi.clearAllMocks();
    (getDb as any).mockReturnValue({ getStocks: vi.fn(async () => LISTING) });
    stubFetch(LINES);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  describe('calculateBreadth', () => {
    it('真实源可用时返回真实涨跌分布（由腾讯行情本地聚合）', async () => {
      const data = await marketBreadthService.calculateBreadth();

      expect(data.advancing).toBe(1);
      expect(data.declining).toBe(1);
      expect(data.unchanged).toBe(1);
      expect(data.totalStocks).toBe(3);
      expect(data.advanceDeclineRatio).toBeCloseTo(1, 2);
      expect(data.dataSource).toBe('tencent');
      expect(data.quotedSymbols).toBe(3);
      expect(data.requestedSymbols).toBe(3);
      expect(data.uncoveredSymbols).toBe(0);
      expect(['bullish', 'bearish', 'neutral']).toContain(data.marketSentiment);
      expect(data.sentimentScore).toBeGreaterThanOrEqual(-100);
      expect(data.sentimentScore).toBeLessThanOrEqual(100);
    });

    it('成交额按涨/跌分桶累加（万元→元，真实换算）', async () => {
      const data = await marketBreadthService.calculateBreadth();
      expect(data.upVolume).toBe(10000 * 10_000);
      expect(data.downVolume).toBe(20000 * 10_000);
      expect(data.turnover).toBe(60000 * 10_000);
      expect(data.volumeRatio).toBeCloseTo(0.5, 3);
    });

    it('涨跌停按交易所涨跌停价判定（非涨跌幅阈值近似）', async () => {
      const data = await marketBreadthService.calculateBreadth();
      // 浦发银行现价 9.48，未触涨停 10.10 / 跌停 8.26 → 两者均不计数
      expect(data.limitUp).toBe(0);
      expect(data.limitDown).toBe(0);
    });

    it('现价等于涨停价时计入 limitUp（±20% 制度同样适用）', async () => {
      (getDb as any).mockReturnValue({
        getStocks: vi.fn(async () => [{ symbol: '300750.SZ', name: '宁德时代', market: 'SZ' }]),
      });
      stubFetch({
        sz300750: txLine({ symbol: 'sz300750', name: '宁德时代', price: 220, prevClose: 183.34, changePercent: 20, limitUp: 220, limitDown: 146.67 }),
      });
      marketBreadthService.clearCache();

      const data = await marketBreadthService.calculateBreadth();
      expect(data.limitUp).toBe(1);
      expect(data.limitDown).toBe(0);
      expect(data.advancing).toBe(1);
    });

    it('newHighs/newLows 恒为 null —— 不是 0（0 会被误读成「今日无新高」）', async () => {
      const data = await marketBreadthService.calculateBreadth();
      expect(data.newHighs).toBeNull();
      expect(data.newLows).toBeNull();
      expect(data.unavailableFields).toEqual(['newHighs', 'newLows']);
      expect(data.message).toContain('null');
    });

    it('真实源完全无报价时抛 BreadthUnavailableError（诚实空，不回填模拟）', async () => {
      stubFetch({});
      marketBreadthService.clearCache();

      await expect(marketBreadthService.calculateBreadth()).rejects.toBeInstanceOf(
        BreadthUnavailableError
      );
    });

    it('覆盖率过低时抛 BreadthUnavailableError（拒绝输出半个市场）', async () => {
      // 3 只清单只返回 1 只 → 覆盖率 33% < 50% 阈值
      stubFetch({ sh600000: LINES.sh600000 });
      marketBreadthService.clearCache();

      await expect(marketBreadthService.calculateBreadth()).rejects.toThrow(/覆盖率过低/);
    });

    it('股票清单为空时抛 BreadthUnavailableError', async () => {
      (getDb as any).mockReturnValue({ getStocks: vi.fn(async () => []) });
      marketBreadthService.clearCache();

      await expect(marketBreadthService.calculateBreadth()).rejects.toBeInstanceOf(
        BreadthUnavailableError
      );
    });

    it('源侧无报价的标的计入 uncovered 且不计入涨跌家数', async () => {
      // 退市/长期停牌：腾讯返回 0 价格 → 被跳过，不进上涨/下跌/平盘
      stubFetch({
        sh600000: LINES.sh600000,
        sz000001: txLine({ symbol: 'sz000001', name: '退市股', price: 0, prevClose: 0, changePercent: 0 }),
        sh600519: LINES.sh600519,
      });
      marketBreadthService.clearCache();

      const data = await marketBreadthService.calculateBreadth();
      expect(data.quotedSymbols).toBe(2);
      expect(data.uncoveredSymbols).toBe(1);
      expect(data.totalStocks).toBe(2);
    });

    it('应该缓存真实结果（两次调用时间戳一致）', async () => {
      const a = await marketBreadthService.calculateBreadth();
      const b = await marketBreadthService.calculateBreadth();
      expect(a.timestamp).toBe(b.timestamp);
      expect(fetch).toHaveBeenCalledTimes(1);
    });

    it('应该发出更新事件', async () => {
      const listener = vi.fn();
      marketBreadthService.on('breadth:update', listener);

      await marketBreadthService.calculateBreadth();

      expect(listener).toHaveBeenCalledTimes(1);
      expect(listener).toHaveBeenCalledWith(
        expect.objectContaining({ advancing: 1, declining: 1 })
      );
    });
  });

  describe('getSectorBreadth', () => {
    it('未接入真实源时返回空数组（诚实空，不实随机板块）', async () => {
      const sectors = await marketBreadthService.getSectorBreadth();
      expect(Array.isArray(sectors)).toBe(true);
      expect(sectors.length).toBe(0);
    });
  });

  describe('getBreadthHistory', () => {
    it('未接入时序源时返回空序列', async () => {
      const history = await marketBreadthService.getBreadthHistory('5d');
      expect(history).toHaveProperty('period', '5d');
      expect(history.data.length).toBe(0);
    });

    it('支持不同时间周期键', async () => {
      const periods: Array<'1d' | '5d' | '1m' | '3m'> = ['1d', '5d', '1m', '3m'];
      for (const p of periods) {
        const history = await marketBreadthService.getBreadthHistory(p);
        expect(history.period).toBe(p);
        expect(history.data.length).toBe(0);
      }
    });
  });

  describe('getMcClellanOscillator', () => {
    it('无历史时返回中性指标（诚实，不生成随机曲线）', async () => {
      const result = await marketBreadthService.getMcClellanOscillator();
      expect(result).toHaveProperty('value');
      expect(result).toHaveProperty('signal');
      expect(result).toHaveProperty('trend');
      expect(['overbought', 'oversold', 'neutral']).toContain(result.signal);
    });
  });

  describe('clearCache', () => {
    it('应该清除所有缓存', async () => {
      await marketBreadthService.getSectorBreadth();
      await marketBreadthService.getBreadthHistory('5d');

      const statsBefore = marketBreadthService.getCacheStats();
      expect(statsBefore.sectors + statsBefore.history).toBeGreaterThan(0);

      marketBreadthService.clearCache();

      const statsAfter = marketBreadthService.getCacheStats();
      expect(statsAfter.breadth).toBe(0);
      expect(statsAfter.sectors).toBe(0);
      expect(statsAfter.history).toBe(0);
    });
  });

  describe('getCacheStats', () => {
    it('应该返回缓存统计', () => {
      const stats = marketBreadthService.getCacheStats();
      expect(stats).toHaveProperty('breadth');
      expect(stats).toHaveProperty('sectors');
      expect(stats).toHaveProperty('history');
      expect(typeof stats.breadth).toBe('number');
      expect(typeof stats.sectors).toBe('number');
      expect(typeof stats.history).toBe('number');
    });
  });
});