/**
 * conceptBoardService 单元测试 (P0-1 / F01 / F03)
 * 数据源: 腾讯财经板块排行接口（proxy.finance.qq.com/cgi/cgi-bin/rank/pt/getRank）
 * 覆盖: 分页拉取 / 字段映射 / 带符号评分模型 / 缓存 / 重试 / stale回退 / 落盘可观测性
 *
 * 团队约定：评分逻辑抽成纯函数单测（vitest 沙箱历史上有 OOM 问题，避免重型集成）
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockFetch } = vi.hoisted(() => ({ mockFetch: vi.fn() }));

/** 构造腾讯 rank 接口响应 */
function tencentResp(rankList: Record<string, unknown>[]): Response {
  const body = JSON.stringify({ code: 0, msg: 'ok', data: { rank_list: rankList } });
  return new Response(body, { status: 200, headers: { 'content-type': 'application/json' } });
}

vi.stubGlobal(
  'fetch',
  vi.fn(async (_url: string, _opts?: unknown) => mockFetch())
);

import {
  fetchAllConceptBoards,
  fetchConceptBoardsWithMeta,
  scoreConceptBoards,
  computeChangeScore,
  computeVolatilityScore,
  computeVolumeScore,
  computeBreadthScore,
  persistConcepts,
  loadConceptsFromDb,
  getConceptServiceCounters,
  __resetConceptCache,
  type ConceptBoardRaw,
} from '../services/conceptBoardService';

// 腾讯接口字段: name/zdf(涨跌幅%)/turnover(成交额万元)/zgb("up/total")/hsl/lzg{name,code}
const BOARD_A = { code: 'pt02BK0892', name: '乳业', zdf: '5.4', turnover: '1200000000', hsl: '2.41', zgb: '29/31', lzg: { name: '一鸣食品', code: '605179' } };
const BOARD_B = { code: 'pt02BK1082', name: '噪声防治', zdf: '-1.2', turnover: '300000000', hsl: '5.24', zgb: '3/9', lzg: { name: '天晟新材', code: '300169' } };

describe('conceptBoardService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    __resetConceptCache();
  });

  describe('fetchAllConceptBoards', () => {
    it('单页数据: 正确映射腾讯字段', async () => {
      mockFetch.mockResolvedValueOnce(tencentResp([BOARD_A]));
      const boards = await fetchAllConceptBoards();
      expect(boards).toHaveLength(1);
      expect(boards[0]).toMatchObject({
        code: 'pt02BK0892',
        name: '乳业',
        changePercent: 5.4,
        turnover: 1_200_000_000,
        upCount: 29,
        downCount: 2,
        stockCount: 31,
        leaderName: '一鸣食品',
        leaderSymbol: '605179',
      });
    });

    it('多页数据: 首页满 200 时翻页补齐', async () => {
      const page1 = Array.from({ length: 200 }, (_, i) => ({ ...BOARD_A, code: `pt${1000 + i}`, name: `概念${i}`, zgb: '10/20' }));
      const page2 = Array.from({ length: 50 }, (_, i) => ({ ...BOARD_B, code: `pt${2000 + i}`, name: `概念B${i}` }));
      mockFetch.mockResolvedValueOnce(tencentResp(page1)).mockResolvedValueOnce(tencentResp(page2));
      const boards = await fetchAllConceptBoards();
      expect(mockFetch).toHaveBeenCalledTimes(2);
      expect(boards).toHaveLength(250);
    });

    it('5分钟内二次调用命中缓存, 不再发请求', async () => {
      mockFetch.mockResolvedValueOnce(tencentResp([BOARD_A]));
      await fetchAllConceptBoards();
      const again = await fetchAllConceptBoards();
      expect(mockFetch).toHaveBeenCalledTimes(1);
      expect(again).toHaveLength(1);
    });

    it('腾讯返回坏结构时不重试(确定性坏载荷), 返回空且不缓存', async () => {
      mockFetch.mockResolvedValueOnce(new Response(JSON.stringify({ code: 0, data: {} }), { status: 200 }));
      const boards = await fetchAllConceptBoards();
      expect(boards).toEqual([]);
      expect(mockFetch).toHaveBeenCalledTimes(1); // 不可重试 → 只尝试一次
      // 不缓存空结果 → 下次仍会请求
      mockFetch.mockResolvedValueOnce(tencentResp([BOARD_A]));
      const retry = await fetchAllConceptBoards();
      expect(retry).toHaveLength(1);
    });

    it('缺失字段归零, 不产生 NaN', async () => {
      mockFetch.mockResolvedValueOnce(tencentResp([{ name: 'X', zdf: '-', turnover: '-', zgb: 'xx' }]));
      const boards = await fetchAllConceptBoards();
      expect(boards[0].changePercent).toBe(0);
      expect(boards[0].turnover).toBe(0);
      expect(boards[0].stockCount).toBe(0);
    });
  });

  // ============ F01: 重试 / meta 契约 / stale 回退 ============
  describe('F01 上游可观测性', () => {
    it('网络异常按指数退避重试到上限(共 3 次尝试)后失败', async () => {
      mockFetch.mockRejectedValue(new Error('ECONNRESET'));
      const { boards, meta } = await fetchConceptBoardsWithMeta(null);
      expect(boards).toEqual([]);
      expect(mockFetch).toHaveBeenCalledTimes(3);
      expect(meta.source).toBe('unavailable');
      expect(meta.updatedAt).toBeNull();
      expect(meta.error).toMatch(/ECONNRESET|拉取失败/);
      expect(getConceptServiceCounters().fetchPageFailures).toBe(3);
    });

    it('5xx 可重试；重试中途成功则返回 live', async () => {
      mockFetch
        .mockResolvedValueOnce(new Response('boom', { status: 503 }))
        .mockResolvedValueOnce(tencentResp([BOARD_A]));
      const { boards, meta } = await fetchConceptBoardsWithMeta(null);
      expect(mockFetch).toHaveBeenCalledTimes(2);
      expect(boards).toHaveLength(1);
      expect(meta.source).toBe('live');
      expect(meta.updatedAt).not.toBeNull();
    });

    it('4xx 不重试(契约问题, 重试无意义)', async () => {
      mockFetch.mockResolvedValue(new Response('bad', { status: 404 }));
      await fetchConceptBoardsWithMeta(null);
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });

    it('上游全挂 + DB 有历史缓存 → 回退 stale 并给出缓存时间', async () => {
      mockFetch.mockRejectedValue(new Error('upstream down'));
      const updatedAt = '2026-07-30T07:00:00.000Z';
      const raw = vi.fn(async (sql: string) => {
        if (sql.includes('ALTER TABLE')) return undefined;
        return {
          rows: [
            { name: '乳业', code: 'pt02BK0892', stock_count: 31, avg_change: '5.4', turnover: '1200', turnover_rate: '2.41', up_count: 29, leader_name: '一鸣食品', leader_symbol: '605179', updated_at: updatedAt },
          ],
        };
      });
      const { boards, meta } = await fetchConceptBoardsWithMeta({ raw });
      expect(boards).toHaveLength(1);
      expect(boards[0].name).toBe('乳业');
      expect(meta.source).toBe('stale');
      expect(meta.updatedAt).toBe(updatedAt);
      expect(meta.error).toBeTruthy();
      expect(getConceptServiceCounters().staleFallbacks).toBe(1);
    });

    it('上游全挂 + DB 也没数据 → unavailable 且 error 可读', async () => {
      mockFetch.mockRejectedValue(new Error('upstream down'));
      const raw = vi.fn(async () => ({ rows: [] }));
      const { boards, meta } = await fetchConceptBoardsWithMeta({ raw });
      expect(boards).toEqual([]);
      expect(meta.source).toBe('unavailable');
      expect(meta.error).toContain('upstream down');
    });

    it('loadConceptsFromDb: DB 抛错时降级为空, 不冒充数据', async () => {
      const raw = vi.fn().mockRejectedValue(new Error('relation concepts missing'));
      const r = await loadConceptsFromDb({ raw });
      expect(r.boards).toEqual([]);
      expect(r.updatedAt).toBeNull();
    });
  });

  // ============ F03: 带符号评分（纯函数） ============
  describe('F03 纯函数: computeChangeScore', () => {
    it('最大涨幅=满分50, 持平=25, 最大跌幅=0', () => {
      expect(computeChangeScore(5, 5)).toBe(50);
      expect(computeChangeScore(0, 5)).toBe(25);
      expect(computeChangeScore(-5, 5)).toBe(0);
    });

    it('单调递增: 涨得越多分越高, 跌得越多分越低', () => {
      const xs = [-8, -3, -0.5, 0, 0.5, 3, 8];
      const ys = xs.map((x) => computeChangeScore(x, 8));
      for (let i = 1; i < ys.length; i++) expect(ys[i]).toBeGreaterThan(ys[i - 1]);
    });

    it('永远落在 [0, 50], 超出区间被夹紧', () => {
      expect(computeChangeScore(999, 5)).toBe(50);
      expect(computeChangeScore(-999, 5)).toBe(0);
    });

    it('maxAbs<=0 时不产生 NaN/除零', () => {
      expect(Number.isFinite(computeChangeScore(0, 0))).toBe(true);
      expect(computeChangeScore(0, 0)).toBe(25);
    });

    it('回归: 同幅度涨跌不再同分（修复 Math.abs 的核心 bug）', () => {
      expect(computeChangeScore(4, 4)).not.toBe(computeChangeScore(-4, 4));
    });
  });

  describe('F03 纯函数: computeVolatilityScore / volume / breadth', () => {
    it('波动强度是绝对值口径: 同幅度涨跌同分, 区间 0~100', () => {
      expect(computeVolatilityScore(4, 4)).toBe(100);
      expect(computeVolatilityScore(-4, 4)).toBe(100);
      expect(computeVolatilityScore(0, 4)).toBe(0);
    });
    it('volumeScore 区间 0~30', () => {
      expect(computeVolumeScore(100, 100)).toBe(30);
      expect(computeVolumeScore(0, 100)).toBe(0);
      expect(computeVolumeScore(500, 100)).toBe(30);
    });
    it('breadthScore 区间 0~20, 成分股为 0 时返回 0', () => {
      expect(computeBreadthScore(10, 10)).toBe(20);
      expect(computeBreadthScore(0, 10)).toBe(0);
      expect(computeBreadthScore(5, 0)).toBe(0);
    });
  });

  describe('scoreConceptBoards', () => {
    const mk = (over: Partial<ConceptBoardRaw>): ConceptBoardRaw => ({
      code: 'pt0001', name: 'X', changePercent: 0, turnoverRate: 0, turnover: 0,
      stockCount: 10, upCount: 5, downCount: 5, leaderName: '', leaderSymbol: '', ...over,
    });

    it('评分模型区间: change≤50 volume≤30 breadth≤20, 总分≤100', () => {
      const scores = scoreConceptBoards([
        mk({ name: '强势', changePercent: 5, turnover: 1000, upCount: 10, downCount: 0, stockCount: 10 }),
        mk({ name: '弱势', changePercent: -1, turnover: 100, upCount: 0, downCount: 10, stockCount: 10 }),
      ]);
      const strong = scores.find((s) => s.industry === '强势')!;
      expect(strong.changeScore).toBe(50);
      expect(strong.volumeScore).toBe(30);
      expect(strong.breadthScore).toBe(20);
      expect(strong.score).toBe(100);
      expect(scores[0].industry).toBe('强势'); // 降序
    });

    it('回归 F03: 大跌概念不得进入「高景气」(前端阈值 score>=70)', () => {
      const scores = scoreConceptBoards([
        // 暴跌但成交额巨大的板块：修复前 |−9| 拿满 changeScore 50 + volume 30 → 80 分 = 高景气
        mk({ name: '暴跌高量', changePercent: -9, turnover: 1_000_000, upCount: 0, downCount: 50, stockCount: 50 }),
        mk({ name: '温和上涨', changePercent: 3, turnover: 200_000, upCount: 40, downCount: 10, stockCount: 50 }),
      ]);
      const crash = scores.find((s) => s.industry === '暴跌高量')!;
      const up = scores.find((s) => s.industry === '温和上涨')!;
      expect(crash.changeScore).toBe(0);
      expect(crash.score).toBeLessThan(70);        // 不再是「高景气」
      expect(up.score).toBeGreaterThan(crash.score); // 上涨板块排在暴跌板块之前
      expect(scores[0].industry).toBe('温和上涨');
    });

    it('波动强度作为独立维度返回, 不计入 score', () => {
      const s = scoreConceptBoards([
        mk({ name: '暴跌', changePercent: -6, turnover: 0, upCount: 0, stockCount: 10 }),
      ])[0];
      expect(s.volatilityScore).toBe(100);          // 波动很剧烈
      expect(s.score).toBe(s.changeScore + s.volumeScore + s.breadthScore);
      expect(s.score).toBe(0);                      // 但景气度垫底
    });

    it('limit_up_count 诚实返回 0(数据源无涨停字段)', () => {
      const scores = scoreConceptBoards([mk({})]);
      expect(scores[0].limit_up_count).toBe(0);
    });

    it('空输入返回空数组', () => {
      expect(scoreConceptBoards([])).toEqual([]);
    });

    it('输出结构对齐前端 SectorScore(industry/score/stock_count等)', () => {
      const s = scoreConceptBoards([mk({ name: '半导体', changePercent: 2.5, stockCount: 40, upCount: 30, downCount: 10 })])[0];
      expect(s).toHaveProperty('industry', '半导体');
      expect(s).toHaveProperty('avg_change_percent', 2.5);
      expect(s).toHaveProperty('total_turnover');
      expect(s).toHaveProperty('stock_count', 40);
      expect(s).toHaveProperty('up_count', 30);
      expect(s).toHaveProperty('volatilityScore');
    });
  });

  describe('persistConcepts', () => {
    const mk = (name: string): ConceptBoardRaw => ({
      code: 'pt0001', name, changePercent: 1, turnoverRate: 1, turnover: 1,
      stockCount: 10, upCount: 5, downCount: 5, leaderName: '', leaderSymbol: '',
    });

    it('knex 为 null 时静默跳过', async () => {
      const r = await persistConcepts(null, [mk('A')]);
      expect(r).toEqual({ attempted: 1, succeeded: 0, failed: 0 });
    });

    it('逐条 upsert 到 concepts 表(先幂等补列)', async () => {
      const raw = vi.fn().mockResolvedValue(undefined);
      const r = await persistConcepts({ raw }, [mk('A'), mk('B')]);
      expect(raw.mock.calls[0][0]).toContain('ALTER TABLE concepts');
      expect(raw.mock.calls[1][0]).toContain('ON CONFLICT (name)');
      expect(r.succeeded).toBe(2);
      expect(r.failed).toBe(0);
    });

    it('DB 异常不抛出, 但必须可观测(计数+error级日志)', async () => {
      const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      const raw = vi.fn(async (sql: string) => {
        if (sql.includes('ALTER TABLE')) return undefined;
        throw new Error('db down');
      });
      const r = await persistConcepts({ raw }, [mk('A'), mk('B')]);
      expect(r).toEqual({ attempted: 2, succeeded: 0, failed: 2 });
      expect(getConceptServiceCounters().persistRowFailures).toBe(2);
      expect(getConceptServiceCounters().persistFailures).toBe(1);
      expect(errSpy).toHaveBeenCalled();
      errSpy.mockRestore();
    });
  });
});
