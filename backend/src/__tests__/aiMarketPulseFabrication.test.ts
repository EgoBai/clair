/**
 * P0-PULSE：/api/ai/market-pulse 不得在无数据时编造市场解读并声称 dataSource:'real'
 *
 * 缺陷（已用**真实空库**取证坐实，非推演）：
 *   取证方式：pg_dump --schema-only clair | psql clair_pulse_empty（14 表齐全、0 行数据），
 *   DATABASE_URL 指向它起服务，打 `/api/ai/market-pulse` 实测。
 *
 *   ① `api/ai-market-pulse.ts` 写 `summary.risingStocks`（**裸访问**），而
 *      `db.getMarketSummary()` 在当日无行情时返回 **null**
 *      （Database.ts:483 `if (dailyQuotes.length === 0) return null`；
 *       InMemoryDatabase.getMarketSummaryInternal 同契约）。
 *      → 空库时抛 TypeError，被 :235 的 catch兜成 200 + dataSource:'unavailable'。
 *      也就是说修复前的 `unavailable` 是**崩溃的副产品**，不是诚实判据：
 *      每次请求白跑一趟 + log.error 刷屏，且走的是降级分支而非正常路径。
 *
 *   ② `dataSource: 'real'` 硬编码。
 *
 *   ③ 最严重的一条——空库时 `risingRatio` 因 `rising + falling || 1` 变成 0，
 *      `0 < 0.4` 成立 → **凭空生成**「普跌/恐慌：上涨个股占比仅 0.0%」。
 *      空库不是「市场极弱」，它是**查不到**。
 *
 *   ④ 该信号被拼进 LLM prompt（:213），LLM 照着编出一篇市场解读，
 *      再由 ② 的 `dataSource:'real'` 背书交给用户。
 *
 * 本测试锁定的契约：
 *   1. 广度不可得 → dataSource 绝不为 'real'，数值字段必须是 null（=查不到）不是 0；
 *   2. 广度不可得 → 响应中**不得**出现由 0 反推的结论（「普跌」/「恐慌」/「仅 0.0%」），
 *      且不得出现「未见显著风险信号」这种**需要证据支撑的否定结论**；
 *   3. 广度不可得 → 绝不调用 LLM（否则等于喂编造数值让模型编解读）；
 *   4. **分界用例**：真的是 0% 上涨（rising=0 但 falling>0）→ 必须仍生成「普跌」信号。
 *      这是防反向修复的关键：不能为了"保险"把真实信号也一起删掉；
 *   5. 0/0（rising=falling=0，当日全平盘）→ 不可计算，不得当成「0% 上涨」；
 *   6. 真实数据 → 仍必须 'real'，且数值与 DB 一致（防过度修复）。
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import express from 'express';
import request from 'supertest';

// mock 上游：LLM 本测试要断言「不被调用」，故需可观测。
// vi.mock 工厂会被提升到文件顶部，故用 vi.hoisted 提前声明 chatMock。
const { chatMock } = vi.hoisted(() => ({ chatMock: vi.fn() }));
vi.mock('../services/aiService', () => ({
  default: {
    chat: chatMock,
    chatStream: vi.fn(),
    analyzeMarket: vi.fn(),
    diagnoseStock: vi.fn(),
    generateStrategy: vi.fn(),
    healthCheck: vi.fn(),
    chatWithAI: vi.fn(),
  },
}));

vi.mock('../middleware/aiTiming', () => ({
  aiTiming: (_req: any, _res: any, next: any) => next(),
}));

// 稳定单例：各用例需替换其方法
const dbMock = {
  getMarketSummary: vi.fn(),
  getSectorMomentumScore: vi.fn(),
  connection: vi.fn(),
};
vi.mock('../db/dbFactory', () => ({ getDb: vi.fn(() => dbMock) }));

import marketPulseRouter from '../api/ai-market-pulse';

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use('/api/ai', marketPulseRouter);
  return app;
}

function allText(res: { body: any }): string {
  return JSON.stringify(res.body);
}

/** 一条真实的板块行（形状对齐 Database.getSectorMomentumScore 返回值） */
function sector(industry: string, score: number, avg: number) {
  return {
    industry,
    score,
    changeScore: score,
    volumeScore: 0,
    breadthScore: 0,
    stock_count: 20,
    avg_change_percent: avg,
    total_turnover: 1e9,
    limit_up_count: 1,
  };
}

/**
 * knex 链式查询桩：候选股查询（fetchCandidatesByIndustry / fetchCandidateCards）
 * 在本用例组不参与断言，统一 resolve 空行集即可。
 * 关键：原实现 `await (db.connection(..) as any).join().join().where()...limit()`，
 * 所以桩必须**可then** 且 resolve 成 []，否则 for...of 会炸。
 */
function knexChain(): any {
  const target: any = function () { return target; }; // 可调用：db.connection('...')
  for (const m of ['join', 'where', 'whereNotNull', 'whereIn', 'select',
                   'orderBy', 'limit', 'offset', 'groupBy', 'having']) {
    target[m] = () => target;
  }
  target.raw = () => ({});
  target.then = (res: any) => Promise.resolve(res([]));
  return target;
}

describe('P0-PULSE · /api/ai/market-pulse：不得编造市场解读 + 不得硬编码 real', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    chatMock.mockResolvedValue({ content: '（不应被调用）' });
    dbMock.connection.mockImplementation(() => knexChain());
  });

  // ============ 场景 B：广度不可得（缺陷①③④ 的真实空库形态） ============
  describe('场景 B｜getMarketSummary() 返回 null（真实空库已实测）', () => {
    beforeEach(() => {
      dbMock.getMarketSummary.mockResolvedValue(null);
      dbMock.getSectorMomentumScore.mockResolvedValue([]);
    });

    it('不得抛 TypeError 走降级分支：正常路径返回且带 availability', async () => {
      const res = await request(buildApp()).get('/api/ai/market-pulse');

      expect(res.status).toBe(200);
      // 修复前这里是 catch 兜底的形状（data 下直接是 payload、无 availability）
      // 修复后必须走 sendSuccess 正常路径
      const d = res.body.data.data;
      expect(d).toBeDefined();
      expect(d.availability).toEqual({ breadth: false, sectors: false });
      // 正常路径必然带 generatedAt（catch 分支没有）
      expect(typeof d.generatedAt).toBe('string');
    });

    it('dataSource 必须由可用性推导，不得硬编码 real', async () => {
      const res = await request(buildApp()).get('/api/ai/market-pulse');

      expect(res.body.data.data.dataSource).toBe('unavailable');
    });

    it('核心断言：不得出现由 0 反推出来的风险信号', async () => {
      const res = await request(buildApp()).get('/api/ai/market-pulse');
      const text = allText(res);

      // 缺陷③的直接产物：risingRatio 被 `|| 1` 变成 0，0 < 0.4 成立
      expect(text).not.toContain('普跌');
      expect(text).not.toContain('恐慌');
      expect(text).not.toContain('0.0%');
      // breadth 整块为 null，绝不能出现 risingStocks:0 这种假 0
      expect(res.body.data.data.breadth).toBeNull();
      expect(text).not.toMatch(/"rising"\s*:\s*0/);
    });

    it('不得用「未见显著风险信号」冒充查过了（否定结论也需证据）', async () => {
      const res = await request(buildApp()).get('/api/ai/market-pulse');

      expect(allText(res)).not.toContain('结构平稳');
      const labels = res.body.data.data.risks.map((r: any) => r.label);
      expect(labels).toEqual(['数据暂不可用']);
    });

    it('数值字段必须是 null（查不到），绝不能是 0（真的是 0）', async () => {
      const res = await request(buildApp()).get('/api/ai/market-pulse');
      const d = res.body.data.data;

      expect(d.breadth).toBeNull();
      expect(d.limitUp).toBeNull();
      expect(d.temperature.score).toBeNull();
      // 0 分在 computeTemperature 里对应 label「弱势」——是真实但完全错误的结论
      expect(d.temperature.score).not.toBe(0);
    });

    it('缺陷④：广度不可得时绝不调用 LLM（否则等于喂编造数值让模型编解读）', async () => {
      const res = await request(buildApp()).get('/api/ai/market-pulse');

      expect(chatMock).not.toHaveBeenCalled();
      // 必须走规则结论，且规则结论本身不含编造数值
      expect(res.body.data.data.llmUsed).toBe(false);
      expect(res.body.data.data.narrative).toContain('板块数据不可用');
    });
  });

  // ============ 场景 B2：广度缺失但板块有数据（组合场景） ============
  describe('场景 B2｜广度 null 但板块数据可用', () => {
    beforeEach(() => {
      dbMock.getMarketSummary.mockResolvedValue(null);
      dbMock.getSectorMomentumScore.mockResolvedValue([
        sector('半导体', 70, 3.2),
        sector('钢铁', 20, -3.5),
      ]);
    });

    it('仍不得声称 real，也不得由缺失的广度造出普跌信号', async () => {
      const res = await request(buildApp()).get('/api/ai/market-pulse');
      const d = res.body.data.data;
      const text = allText(res);

      expect(d.dataSource).toBe('unavailable');
      expect(text).not.toContain('普跌');
      expect(text).not.toContain('0.0%');
      expect(chatMock).not.toHaveBeenCalled();
    });

    it('真实的板块数据必须保留（不因广度缺失而丢弃）', async () => {
      const res = await request(buildApp()).get('/api/ai/market-pulse');
      const d = res.body.data.data;

      expect(d.availability).toEqual({ breadth: false, sectors: true });
      expect(d.themes.map((t: any) => t.industry)).toEqual(['半导体', '钢铁']);
      // 钢铁 -3.5% <= -2 → 真实的弱势板块信号必须仍在
      expect(d.risks.map((r: any) => r.label)).toContain('弱势板块拖累');
    });
  });

  // ============ 分界用例：真的是 0% 上涨 → 必须仍生成普跌（防反向修复） ============
  describe('分界用例｜真的是 0% 上涨（rising=0 但 falling>0）', () => {
    beforeEach(() => {
      // 全市场只有跌的、没有涨的：0.0% 是**真实结论**，不是查不到
      dbMock.getMarketSummary.mockResolvedValue({
        totalStocks: 5000,
        risingStocks: 0,
        fallingStocks: 4800,
        unchangedStocks: 200,
        limitUpCount: 0,
      });
      dbMock.getSectorMomentumScore.mockResolvedValue([sector('银行', 30, -0.2)]);
    });

    it('必须仍生成「普跌/恐慌」——0.0% 在此是事实，不是编造', async () => {
      const res = await request(buildApp()).get('/api/ai/market-pulse');
      const d = res.body.data.data;

      expect(d.dataSource).toBe('real');
      expect(d.breadth.rising).toBe(0);      // 真的是 0，必须保留 0
      expect(d.breadth.falling).toBe(4800);
      expect(d.breadth.risingRatio).toBe(0);
      const labels = d.risks.map((r: any) => r.label);
      expect(labels).toContain('普跌/恐慌');
      expect(d.risks[0].detail).toContain('0.0%');
    });

    it('temperature 必须真的算出来（分母 4800 > 0，不是 0/0）', async () => {
      const res = await request(buildApp()).get('/api/ai/market-pulse');
      const d = res.body.data.data;

      // 0*60 + min(30,100)*0.4 = 12→ 「弱势」
      expect(d.temperature.score).toBe(12);
      expect(d.temperature.label).toBe('弱势');
      expect(chatMock).toHaveBeenCalledTimes(1);
    });
  });

  // ============ 分界用例：0/0（当日全平盘）→ 不可计算 ============
  describe('分界用例｜rising=0 且 falling=0（0/0 不可计算）', () => {
    beforeEach(() => {
      dbMock.getMarketSummary.mockResolvedValue({
        totalStocks: 5000,
        risingStocks: 0,
        fallingStocks: 0,
        unchangedStocks: 5000,
        limitUpCount: 0,
      });
      dbMock.getSectorMomentumScore.mockResolvedValue([sector('银行', 30, -0.2)]);
    });

    it('0/0 必须判为不可得，不得当成「0% 上涨」→ 不得生成普跌信号', async () => {
      const res = await request(buildApp()).get('/api/ai/market-pulse');
      const d = res.body.data.data;
      const text = allText(res);

      // 广度「真的拿到了」→ 仍算real
      expect(d.dataSource).toBe('real');
      // 但占比不可计算
      expect(d.breadth).toBeNull();
      expect(d.availability.breadth).toBe(false);
      expect(text).not.toContain('普跌');
      expect(text).not.toContain('0.0%');
      // 分母为 0 → 温度不可得
      expect(d.temperature.score).toBeNull();
      // 广度数据本身是**真实的**（真的 0 涨 0 跌 5000 平盘），故允许喂 LLM；
      // 但 prompt 里绝不能出现由 0/0 反推出来的占比
      expect(chatMock).toHaveBeenCalledTimes(1);
      const prompt = chatMock.mock.calls[0][0].messages[0].content;
      expect(prompt).toContain('占比 不可用');
      expect(prompt).not.toContain('0.0%');
      expect(prompt).not.toContain('普跌');
    });

    it('全平盘时 limitUp 仍是真实值 0，不得因 breadth 不可算而丢弃', async () => {
      const res = await request(buildApp()).get('/api/ai/market-pulse');

      expect(res.body.data.data.limitUp).toBe(0);
    });
  });

  // ============ 场景 A：真实数据（防过度修复） ============
  describe('场景 A｜返回真实数据', () => {
    beforeEach(() => {
      dbMock.getMarketSummary.mockResolvedValue({
        totalStocks: 5541,
        risingStocks: 1622,
        fallingStocks: 3448,
        unchangedStocks: 471,
        limitUpCount: 55,
      });
      dbMock.getSectorMomentumScore.mockResolvedValue([
        sector('计算机', 46, -1.57),
        sector('公用事业', 43, 1.26),
      ]);
    });

    it('dataSource 必须 real，且数值与 DB 完全一致', async () => {
      const res = await request(buildApp()).get('/api/ai/market-pulse');
      const d = res.body.data.data;

      expect(d.dataSource).toBe('real');
      expect(d.availability).toEqual({ breadth: true, sectors: true });
      expect(d.breadth).toEqual({ rising: 1622, falling: 3448, risingRatio: 32 });
      expect(d.limitUp).toBe(55);
      // 1622/(1622+3448) = 32.0% < 40% → 真实普跌，必须保留
      expect(d.risks[0].label).toBe('普跌/恐慌');
      expect(d.risks[0].detail).toContain('32.0%');
    });

    it('LLM 被正常调用，prompt 里数值必须是真实值而非编造', async () => {
      await request(buildApp()).get('/api/ai/market-pulse');

      expect(chatMock).toHaveBeenCalledTimes(1);
      const prompt = chatMock.mock.calls[0][0].messages[0].content;
      expect(prompt).toContain('1622/3448');
      expect(prompt).toContain('32.0%');
      expect(prompt).toContain('涨停：55 只');
      expect(prompt).not.toContain('不可用');
    });

    it('涨跌均衡（40%~50%）才生成「分化加剧」', async () => {
      dbMock.getMarketSummary.mockResolvedValue({
        totalStocks: 5000, risingStocks: 2200, fallingStocks: 2400,
        unchangedStocks: 400, limitUpCount: 10,
      });

      const res = await request(buildApp()).get('/api/ai/market-pulse');
      const labels = res.body.data.data.risks.map((r: any) => r.label);

      expect(labels).toContain('分化加剧');
      expect(labels).not.toContain('普跌/恐慌');
    });
  });

  // ============ 源码级回归锁定 ============
  describe('源码级回归：不得再出现裸访问与硬编码 real', () => {
    async function readSrc(): Promise<string> {
      const { readFileSync } = await import('fs');
      const { fileURLToPath } = await import('url');
      const { dirname, join } = await import('path');
      const here = dirname(fileURLToPath(import.meta.url));
      return readFileSync(join(here, '../api/ai-market-pulse.ts'), 'utf-8');
    }

    /** 剥掉注释，避免「注释里引用旧代码作对比说明」污染扫描 */
    function stripComments(code: string): string {
      return code.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
    }

    it('不得有裸访问 summary.xxx（旧代码 `Number(summary.risingStocks ?? 0)` 会在 null 时抛 TypeError）', async () => {
      const code = stripComments(await readSrc());
      const lines = code.split('\n');
      // 凡出现 summary.<字段> 的行，其守卫必须在**本行或前2 行内**
      // （多行三元 `const x = summary\n ? ...` 的守卫在上一行）。
      // 只看"有没有出现"是不够的——修复后的代码仍有受保护的访问。
      const accesses = lines
        .map((l, i) => ({ l, i }))
        .filter(({ l }) => /summary\.(risingStocks|fallingStocks|limitUpCount|totalStocks|unchangedStocks)/.test(l));

      expect(accesses.length, '应存在对 summary 的取值').toBeGreaterThan(0);
      for (const { l, i } of accesses) {
        const ctx = lines.slice(Math.max(0, i - 2), i + 1).join('\n');
        const guarded = /summary\s*\?/.test(ctx) || /!!summary/.test(ctx) || /hasMarketData\s*\?/.test(ctx);
        expect(guarded, `第 ${i + 1}行 summary 裸访问（缺守卫）：${l.trim()}`).toBe(true);
      }
      // 并且不得再出现把可空值吞成 0 的 ?? 0 写法
      expect(code).not.toMatch(/summary\.\w+\s*\?\?\s*0/);
    });

    it('不得再有 rising + falling || 1 这种把0/0 变成 0 的兜底', async () => {
      const code = stripComments(await readSrc());

      expect(code).not.toMatch(/\|\|\s*1\s*;/);
    });

    it('dataSource 必须由可用性推导，无字面量硬编码', async () => {
      const code = stripComments(await readSrc());
      const start = code.indexOf("router.get('/market-pulse'");
      expect(start).toBeGreaterThan(-1);
      const body = code.slice(start, code.indexOf('\nrouter.', start + 10));

      expect(body).toContain('hasMarketData ?');
      // 旧代码：dataSource: 'real',
      expect(body).not.toMatch(/dataSource:\s*'real'/);
    });

    it('computeTemperature 入参允许 null（不可得时不得伪造 0 分）', async () => {
      const src = await readSrc();

      expect(src).toMatch(/function computeTemperature\(\s*risingRatio: number \| null/);
      expect(src).toContain("return { score: null, label: '未知' }");
    });
  });
});