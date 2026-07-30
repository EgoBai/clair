/**
 * conceptBoardService 单元测试 (P0-1)
 * 数据源: 腾讯财经板块排行接口（proxy.finance.qq.com/cgi/cgi-bin/rank/pt/getRank）
 * 覆盖: 分页拉取/字段映射/评分模型/缓存/异常兜底/落盘
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
  scoreConceptBoards,
  persistConcepts,
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

    it('腾讯返回空/异常结构时返回空数组且不缓存', async () => {
      mockFetch.mockResolvedValueOnce(new Response(JSON.stringify({ code: 0, data: {} }), { status: 200 }));
      const boards = await fetchAllConceptBoards();
      expect(boards).toEqual([]);
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

  describe('scoreConceptBoards', () => {
    const mk = (over: Partial<ConceptBoardRaw>): ConceptBoardRaw => ({
      code: 'pt0001', name: 'X', changePercent: 0, turnoverRate: 0, turnover: 0,
      stockCount: 10, upCount: 5, downCount: 5, leaderName: '', leaderSymbol: '', ...over,
    });

    it('评分模型与行业momentum同标准: change≤50 volume≤30 breadth≤20', () => {
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
    });
  });

  describe('persistConcepts', () => {
    const mk = (name: string): ConceptBoardRaw => ({
      code: 'pt0001', name, changePercent: 1, turnoverRate: 1, turnover: 1,
      stockCount: 10, upCount: 5, downCount: 5, leaderName: '', leaderSymbol: '',
    });

    it('knex 为 null 时静默跳过', async () => {
      await expect(persistConcepts(null, [mk('A')])).resolves.toBeUndefined();
    });

    it('逐条 upsert 到 concepts 表', async () => {
      const raw = vi.fn().mockResolvedValue(undefined);
      await persistConcepts({ raw }, [mk('A'), mk('B')]);
      expect(raw).toHaveBeenCalledTimes(2);
      expect(raw.mock.calls[0][0]).toContain('ON CONFLICT (name)');
    });

    it('DB 异常不抛出(尽力而为)', async () => {
      const raw = vi.fn().mockRejectedValue(new Error('db down'));
      await expect(persistConcepts({ raw }, [mk('A')])).resolves.toBeUndefined();
    });
  });
});
