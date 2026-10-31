/**
 * P0-MACROCARDS：/api/macro/overview 不得在无数据时输出「值全是编造的卡片」
 *
 * 缺陷（已实测坐实，非推演；取证见 .probe-logs/BEFORE_empty.json）：
 *   1. `api/macro.ts` 的 buildCoreCards 用 `summary?.risingStocks ?? 0`——
 *      db.getMarketSummary() 在**当日无行情时返回 null**（Database.ts:483
 *      `if (dailyQuotes.length === 0) return null`；InMemoryDatabase 同契约）。
 *      null 被吞成 0。
 *   2. buildCoreCards **恒返回 6 张卡片**，于是路由层
 *      `anyReal = core.length > 0` **恒为 true**。
 *   3. 结果：空库（schema 齐全、daily_quotes 0 行）时 dataSource:'partial'，
 *      且输出 6 张 valueText 全为 "0" 的卡片。
 *
 * 为什么这比「无数据却声称 real」更隐蔽（也是本单的核心）：
 *   判据问的是「**有没有卡片**」，而不是「**卡片里的值是否真实**」。
 *   数组非空 → 过了「有无数据」的判据 → 但每张卡片的值都是编造的 0。
 *   数组非空这个信号与数据真实性完全脱钩。
 *
 * 另外两处同款编造（实测发现，比工单描述的更严重）：
 *   - `series` 用 `[v-200, v-100, v-50, v]` 凭空造斜坡；**真实库下也是编造的**
 *   - `上涨板块占比` 的 series 前两点 `[0.35, 0.42, ...]` 是**源码里的硬编码字面量**
 *
 * 本测试锁定的契约：
 *   1. DB 返回 null → dataSource 不得声称 core 有数据；响应中**不含**
 *      `"valueText":"0"` / 全 0 series；
 *   2. DB 返回 null → 卡片值为「不可用」而非 0（真实为 0 与查不到语义不同）；
 *   3. DB 返回真实数据 → 仍必须有值，且与 DB 一致（防过度修复）；
 *   4. 真实为 0 时才写 0（0/null 的语义分界不能被反向修复掉）；
 *   5. 回归锁定：源码内不得再出现 `core.length > 0` 判据与 `?? 0` 吞 null。
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import express from 'express';
import request from 'supertest';

// macro.ts 会 import 宏观数据服务（真实源），本测试不涉及，隔离掉避免外网依赖
vi.mock('../services/macroDataService', () => ({
  getMacroCpiPpi: vi.fn(async () => {
    throw new Error('macro source disabled in test');
  }),
  MacroUnavailableError: class MacroUnavailableError extends Error {},
}));

// 稳定单例：各用例需替换其方法，故不能每次 getDb() 都新建对象
const dbMock = {
  getMarketSummary: vi.fn(),
  getSectorMomentumScore: vi.fn(),
};
vi.mock('../db/dbFactory', () => ({ getDb: vi.fn(() => dbMock) }));

/**
 * 把「今天」钉死成确定的交易日 —— 本文件的一切期望值都由它推导，不再读墙钟。
 *
 * 原缺陷（CI 连续红灯，run 41107319093）：
 *   生产侧 `today()` 取**交易所时区**（Asia/Shanghai）的日历日，测试侧的 mock
 *   却用 `new Date()` 的**进程本地**日历日推算回溯天数。CI runner 是 UTC，
 *   当真实时刻为 18:30Z 时交易所已是次日 02:30 → today() = T+1，而本地 now 仍是 T
 *   → 锚点落到「未来一天」，mock 对 T+1 也返回了数据（真实库里周六不可能有行情）
 *   → series 多一个点，`expected [0,0,0] to deeply equal [0,0]`。
 *   同一份代码在 +08:00 下全绿，纯粹因为两者恰好重合。
 *
 * 修法：mock 掉 tradingCalendar，让 resolveQueryDate / today 恒返回固定锚点，
 * 使 series、historyDates 的期望值变成常量，与进程时区无关。
 */
const FIXED_ANCHOR = vi.hoisted(() => '2026-06-10');
vi.mock('../utils/tradingCalendar', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../utils/tradingCalendar')>();
  return {
    ...actual, // 其余函数保持真实实现，避免牵连本模块其它能力
    today: vi.fn(() => FIXED_ANCHOR),
    // dataAvailable: true 表示「PG 已确证该交易日有行情」，生产代码直接采信此日
    resolveQueryDate: vi.fn(async () => ({
      date: FIXED_ANCHOR,
      isFallback: false,
      reason: null,
      dataAvailable: true,
      notes: [] as string[],
    })),
  };
});

import macroRouter from '../api/macro';

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use('/api/macro', macroRouter);
  return app;
}

/** 响应体全文，用于「不得出现某段内容」的反向断言 */
function allText(res: { body: any }): string {
  return JSON.stringify(res.body);
}

/** 是否为「全 0 数组」（长度>0 且每个元素都是 0） */
function isAllZero(arr: unknown): boolean {
  return Array.isArray(arr) && arr.length > 0 && arr.every((v) => v === 0);
}

// ---------------------------------------------------------------------------
// 日历工具：只做「本地日历日」的纯算术，不读墙钟、不依赖进程时区
// ---------------------------------------------------------------------------
const pad2 = (n: number) => String(n).padStart(2, '0');

/** 把 Date 折算成「本地日历日序号」：同一日历日内任意时刻都得同一个整数 */
const localDayNum = (x: Date): number =>
  Math.round(Date.UTC(x.getFullYear(), x.getMonth(), x.getDate()) / 86_400_000);

/** 日序号 → YYYY-MM-DD */
const dayNumStr = (n: number): string => {
  const t = new Date(n * 86_400_000);
  return `${t.getUTCFullYear()}-${pad2(t.getUTCMonth() + 1)}-${pad2(t.getUTCDate())}`;
};

/** Date → 该时刻所在本地日历日的 YYYY-MM-DD（等价于 DB 层 knex 按本地分量渲染 trade_date） */
const localDayStr = (x: Date): string => dayNumStr(localDayNum(x));

/**
 * 锚点日序号：由 FIXED_ANCHOR 字符串本身（纯日历算术）得出，不经过任何 Date 折算。
 *
 * P0-MACROTZ 之后，生产代码用「锚点日历日的本地零点」（macro.ts localMidnight）
 * 作为查库键，因此 DB 键的本地日历日恒等于 FIXED_ANCHOR —— 期望值可以在任何时区
 * 都写成同一个常量。若生产回退成 UTC 零点键，负偏移时区下 mock 看到的本地日历日
 * 会退一天，下面的断言会立刻变红（Europe/UTC 以东则两种构造本就是同一时刻）。
 */
const ANCHOR_DAY = (() => {
  const [y, m, d] = FIXED_ANCHOR.split('-').map(Number);
  return Math.round(Date.UTC(y, m - 1, d) / 86_400_000);
})();

/** 6 张卡片的标签顺序是稳定契约，前端按索引渲染 */
const LABELS = ['上涨家数', '下跌家数', '涨停家数', '上涨板块占比', '板块平均涨幅', '全市场成交额'];

describe('P0-MACROCARDS · /api/macro/overview：dataSource 必须由「卡片值是否真实」推导', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ==================== 场景 B：DB 返回 null（缺陷复现场景） ====================
  describe('场景 B｜db.getMarketSummary() 返回 null 且板块也为空', () => {
    beforeEach(() => {
      // 这正是 Database.ts:483 / InMemoryDatabase 的无行情契约
      dbMock.getMarketSummary.mockResolvedValue(null);
      dbMock.getSectorMomentumScore.mockResolvedValue([]);
    });

    it('dataSource 不得因「core 数组非空」而声称有数据（核心断言）', async () => {
      const res = await request(buildApp()).get('/api/macro/overview');

      expect(res.status).toBe(200);
      // core 数组仍是 6 个位置（前端按索引渲染），但每张都不可用 →
      // 整块对 dataSource 的贡献必须是 0
      expect(res.body.data.core).toHaveLength(6);
      expect(res.body.data.blockDataSource.core).toBe('unavailable');
      expect(res.body.data.blockDataSource.coreBreadth).toBe('unavailable');
      expect(res.body.data.blockDataSource.coreSectors).toBe('unavailable');
      // trend24 源在测试中被禁用 → 无任何块有真实数据 → 必须 unavailable
      expect(res.body.dataSource).toBe('unavailable');
    });

    it('绝不得出现 "valueText":"0"（核心断言）', async () => {
      const res = await request(buildApp()).get('/api/macro/overview');
      const text = allText(res);

      expect(text).not.toContain('"valueText":"0"');
      expect(text).not.toContain('"valueText":"+"');
      // 0% 这类占比也不该出现
      expect(text).not.toMatch(/"valueText":"\+?0(\.00)?%"/);
    });

    it('每张卡片都必须标为不可用，且 series 不是全 0 数组', async () => {
      const res = await request(buildApp()).get('/api/macro/overview');
      const core = res.body.data.core;

      expect(core.map((c: any) => c.label)).toEqual(LABELS);
      for (const card of core) {
        expect(card.available, `${card.label} 必须标 available=false`).toBe(false);
        expect(card.valueText, `${card.label} 必须是「不可用」`).toBe('不可用');
        expect(card.valueText).not.toBe('0');
        expect(isAllZero(card.series), `${card.label} 的 series 不得是全 0 数组`).toBe(false);
      }
    });

    it('notes 必须如实说明原因（不得留空或糊弄）', async () => {
      const res = await request(buildApp()).get('/api/macro/overview');

      expect(res.body.notes.core).toMatch(/不可用|无当日数据/);
      expect(res.body.notes.coreBreadth).toBeTruthy();
      expect(res.body.notes.coreSectors).toBeTruthy();
    });
  });

  // ==================== 场景 B2：只有 breadth 缺失，板块独立可用 ====================
  describe('场景 B2｜breadth 缺失但板块数据独立可用（不得把真实数据一并丢弃）', () => {
    beforeEach(() => {
      dbMock.getMarketSummary.mockResolvedValue(null);
      dbMock.getSectorMomentumScore.mockResolvedValue([
        { industry: '半导体', score: 78, avg_change_percent: 2.3, limit_up_count: 3, stock_count: 120 },
        { industry: '白酒', score: 61, avg_change_percent: -0.4, limit_up_count: 0, stock_count: 40 },
      ]);
    });

    it('板块卡片保留真实值，涨跌家数卡片标为不可用', async () => {
      const res = await request(buildApp()).get('/api/macro/overview');
      const core = res.body.data.core;
      const by = (l: string) => core.find((c: any) => c.label === l);

      // 板块维度：真实值必须保留（涨停 3+0=3 家；1/2 板块上涨 → 50%）
      expect(by('涨停家数').available).toBe(true);
      expect(by('涨停家数').valueText).toBe('3');
      expect(by('上涨板块占比').valueText).toBe('50');
      // breadth 维度：不可得
      expect(by('上涨家数').available).toBe(false);
      expect(by('上涨家数').valueText).toBe('不可用');
      expect(by('全市场成交额').valueText).toBe('不可用');

      expect(res.body.data.blockDataSource.coreBreadth).toBe('unavailable');
      expect(res.body.data.blockDataSource.coreSectors).toBe('real');
      expect(res.body.data.blockDataSource.core).toBe('real');
      // 有任一块真实数据 → partial（不是 unavailable）
      expect(res.body.dataSource).toBe('partial');
    });
  });

  // ==================== 场景 A：DB 返回真实数据（防过度修复） ====================
  describe('场景 A｜db.getMarketSummary() 返回真实数据', () => {
    /** 记录 DB 实际被查询的入参日期，用于核对 historyDates 是否与传入日期一致 */
    const summaryCalls: Date[] = [];

    beforeEach(() => {
      summaryCalls.length = 0;
      dbMock.getMarketSummary.mockImplementation(async (d: Date) => {
        summaryCalls.push(d);
        // 回溯天数 = 锚点日序号 − 入参所在本地日历日的序号。
        // 全程只用日历日算术：既不读墙钟（new Date() 曾经让 CI 在 18:30Z 后翻车），
        // 也按生产代码的真实键口径（锚点本地零点）解析 —— DB 键正是靠本地分量
        // 命中 `trade_date`，故这里用本地日历日而非 UTC 日历日。
        const back = ANCHOR_DAY - localDayNum(d);
        // 未来日 / 超过 3 个自然日的历史 → 无行情（周六不可能有数据，不得编造）
        if (back < 0 || back > 2) return null;
        const rising = [1622, 2338, 1074][back];
        const falling = [3448, 2691, 3983][back];
        return {
          date: d,
          totalStocks: 5541,
          totalTurnover: 1.64163398e12,
          risingStocks: rising,
          fallingStocks: falling,
          unchangedStocks: 5541 - rising - falling,
        };
      });
      dbMock.getSectorMomentumScore.mockResolvedValue([
        { industry: '半导体', score: 78, avg_change_percent: 2.3, limit_up_count: 3, stock_count: 120 },
        { industry: '白酒', score: 61, avg_change_percent: -0.4, limit_up_count: 0, stock_count: 40 },
      ]);
    });

    it('仍必须标 available=true，且值与 DB 完全一致', async () => {
      const res = await request(buildApp()).get('/api/macro/overview');
      const core = res.body.data.core;
      const by = (l: string) => core.find((c: any) => c.label === l);

      expect(res.body.data.blockDataSource.coreBreadth).toBe('real');
      expect(by('上涨家数').available).toBe(true);
      expect(by('上涨家数').valueText).toBe('1622');
      expect(by('下跌家数').valueText).toBe('3448');
      // 成交额 1.64e12 → 1.64万亿
      expect(by('全市场成交额').valueText).toBe('1.64万亿');
      expect(res.body.dataSource).toBe('partial'); // rates/calendar 未接入
    });

    it('series 必须来自真实历史，且与逐日 DB 值逐一对应（不得是凭空斜坡）', async () => {
      const res = await request(buildApp()).get('/api/macro/overview');
      const core = res.body.data.core;
      const by = (l: string) => core.find((c: any) => c.label === l);

      // 真实历史：[1074, 2338, 1622]（升序）——恰好是 DB 里的三个值
      expect(by('上涨家数').series).toEqual([1074, 2338, 1622]);
      expect(by('下跌家数').series).toEqual([3983, 2691, 3448]);

      // 历史序列绝不能是「今天值减 200/100/50」那种凭空斜坡
      const riseSeries = by('上涨家数').series;
      expect(riseSeries).not.toContain(1622 - 200);
      expect(riseSeries).not.toContain(1622 - 100);
      expect(riseSeries).not.toContain(1622 - 50);
      // 最后一个点必须等于今天的真实值
      expect(riseSeries[riseSeries.length - 1]).toBe(1622);

      // historyDates 与序列等长，供前端标注横轴
      expect(res.body.data.historyDates).toHaveLength(riseSeries.length);
      expect(res.body.data.historyDates).toHaveLength(3);
    });

    it('historyDates 必须与传入 DB 的日期逐一日对应，且不被时区错位一天（回归锁定）', async () => {
      const res = await request(buildApp()).get('/api/macro/overview');
      const dates: string[] = res.body.data.historyDates;

      expect(dates).toHaveLength(3);
      // 升序
      expect([...dates].sort()).toEqual(dates);

      // 期望值 = [锚点前两天, 锚点前一天, 锚点当天]，全部由固定锚点推导（常量，不看墙钟）
      expect(dates).toEqual([
        dayNumStr(ANCHOR_DAY - 2),
        dayNumStr(ANCHOR_DAY - 1),
        dayNumStr(ANCHOR_DAY),
      ]);

      // 关键：本地午夜若被 toISOString() 折算，会整体少一天（UTC+8 实测如此）。
      // 因此这里直接拿 mock 收到的 Date 做交叉核对，而不是另算一遍「今天」：
      //   summaryCalls[0] = 卡片取值那次查询，其后 3 次 = rising 序列的 back=0/1/2
      const calledDays = summaryCalls.slice(0, 4).map(localDayStr);
      expect(calledDays[0], '卡片取值日应与序列末点同日').toBe(calledDays[1]);
      expect(dates, 'historyDates 必须与传入 DB 的日期逐一对应').toEqual(
        calledDays.slice(1).reverse(),
      );
      // 末项必须是锚点当天（即卡片值取自的那一天）
      expect(dates[dates.length - 1]).toBe(calledDays[0]);
    });

    it('板块历史不可回溯时 series 留空，绝不硬编码假曲线', async () => {
      const res = await request(buildApp()).get('/api/macro/overview');
      const core = res.body.data.core;
      const by = (l: string) => core.find((c: any) => c.label === l);

      // 原 bug：上涨板块占比 series 前两点是源码硬编码 [0.35, 0.42]
      expect(by('上涨板块占比').series).toEqual([]);
      expect(by('板块平均涨幅').series).toEqual([]);
      expect(by('涨停家数').series).toEqual([]);
      // 空数组而非全 0 数组
      expect(isAllZero(by('上涨板块占比').series)).toBe(false);
    });
  });

  // ==================== 分界用例：真实为 0 时才写 0 ====================
  describe('分界用例｜真实为 0（确实 0 只涨）必须照实写 0，不得被反向改成 null', () => {
    beforeEach(() => {
      // 非交易日/全平盘的真实场景：确实 0 只涨、0 只跌。此时 0 是**事实**
      dbMock.getMarketSummary.mockImplementation(async (d: Date) => {
        // 与场景 A 同源：回溯天数按固定锚点的日历日序号算，绝不读墙钟。
        // （旧写法用 new Date() 的本地日历日，CI 跑在 UTC 且时刻 >16:00 时
        //   锚点会落到「未来一天」，序列凭空多一个点 → [0,0,0] ≠ [0,0]）
        const back = ANCHOR_DAY - localDayNum(d);
        if (back < 0 || back > 1) return null;
        return {
          date: d,
          totalStocks: 5000,
          totalTurnover: 3e11,
          risingStocks: 0,
          fallingStocks: 0,
          unchangedStocks: 5000,
        };
      });
      dbMock.getSectorMomentumScore.mockResolvedValue([
        { industry: '银行', score: 50, avg_change_percent: 0, limit_up_count: 0, stock_count: 100 },
      ]);
    });

    it('确实为 0 → valueText 必须是 "0"，且 available=true', async () => {
      const res = await request(buildApp()).get('/api/macro/overview');
      const core = res.body.data.core;
      const by = (l: string) => core.find((c: any) => c.label === l);

      expect(by('上涨家数').available).toBe(true);
      expect(by('上涨家数').valueText).toBe('0');
      expect(by('下跌家数').valueText).toBe('0');
      // 0/5000 = 0% 是真实占比
      expect(by('上涨家数').deltaText).toBe('0%');
      // 涨停 0 家也是事实
      expect(by('涨停家数').valueText).toBe('0');
      expect(res.body.data.blockDataSource.coreBreadth).toBe('real');
    });

    it('确实为 0 → series 可以是真实的全 0 序列（那是事实，不是编造）', async () => {
      const res = await request(buildApp()).get('/api/macro/overview');
      const core = res.body.data.core;
      const by = (l: string) => core.find((c: any) => c.label === l);

      // 两天真实都是 0 只涨 → 序列 [0, 0] 是如实的
      expect(by('上涨家数').series).toEqual([0, 0]);
      // 但仍必须带 available=true 表明「这是查到了、答案就是 0」
      expect(by('上涨家数').available).toBe(true);
    });
  });

  // ==================== 源码级回归锁定 ====================
  describe('源码级回归：不得再退回「数组非空」判据', () => {
    async function readMacroSource(): Promise<string> {
      const { readFileSync } = await import('fs');
      const { fileURLToPath } = await import('url');
      const { dirname, join } = await import('path');
      const here = dirname(fileURLToPath(import.meta.url));
      //剥掉注释，只查真实代码（注释里会引用旧代码作对比说明）
      return readFileSync(join(here, '../api/macro.ts'), 'utf-8');
    }

    it('路由层不得再用 core.length > 0 推导 dataSource', async () => {
      const src = (await readMacroSource()).replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');

      const start = src.indexOf("router.get(");
      expect(start, '未找到 overview 路由').toBeGreaterThan(-1);
      const body = src.slice(start);

      // 曾经的 anyReal = core.length > 0
      expect(body).not.toMatch(/core\.length\s*>/);
      expect(body).toContain('hasBreadth');
      expect(body).toContain('hasSectors');
      expect(body).toMatch(/hasCore\s*\|\|\s*hasTrend/);
    });

    it('buildCoreCards 不得再用 ?? 0 吞掉可空的 getMarketSummary', async () => {
      const src = (await readMacroSource()).replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');

      const start = src.indexOf('async function buildCoreCards');
      expect(start, '未找到 buildCoreCards').toBeGreaterThan(-1);
      const fn = src.slice(start, src.indexOf('async function buildTrend24', start));

      // 曾经的 `summary?.risingStocks ?? 0` / `summary?.totalStocks ?? (...)`
      expect(fn).not.toMatch(/summary\?\./);
      expect(fn).toMatch(/hasBreadth\s*=/);
      expect(fn).toMatch(/hasSectors\s*=/);
    });

    it('不得再出现凭空造series 的斜坡字面量', async () => {
      const src = (await readMacroSource()).replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');

      // 曾经的 `[v-200, v-100, v-50, v]` / `[0.35, 0.42, ...]` / `[t*0.85, ...]`
      expect(src).not.toMatch(/-200|-100,-|-50/);
      expect(src).not.toContain('0.35');
      expect(src).not.toContain('0.42');
      expect(src).not.toMatch(/0\.85|0\.92|0\.97/);
    });
  });
});