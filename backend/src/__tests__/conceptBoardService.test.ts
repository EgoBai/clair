/**
 * conceptBoardService 单元测试 (P0-1)
 * 覆盖: 分页拉取/字段映射/评分模型/缓存/异常兜底/落盘
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockGet } = vi.hoisted(() => ({ mockGet: vi.fn() }));
vi.mock('axios', () => ({ default: { get: mockGet } }));

import {
  fetchAllConceptBoards,
  scoreConceptBoards,
  persistConcepts,
  __resetConceptCache,
  type ConceptBoardRaw,
} from '../services/conceptBoardService';

function emResp(diff: Record<string, unknown>[], total: number) {
  return { data: { data: { total, diff } } };
}

const BOARD_A = { f12: 'BK0892', f14: '乳业', f3: 5.4, f6: 1_200_000_000, f8: 2.41, f104: 29, f105: 2, f128: '一鸣食品', f140: '605179' };
const BOARD_B = { f12: 'BK1082', f14: '噪声防治', f3: -1.2, f6: 300_000_000, f8: 5.24, f104: 3, f105: 6, f128: '天晟新材', f140: '300169' };

describe('conceptBoardService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    __resetConceptCache();
  });

  describe('fetchAllConceptBoards', () => {
    it('单页数据: 正确映射东财字段', async () => {
      mockGet.mockResolvedValueOnce(emResp([BOARD_A], 1));
      const boards = await fetchAllConceptBoards();
      expect(boards).toHaveLength(1);
      expect(boards[0]).toMatchObject({
        code: 'BK0892',
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

    it('多页数据: total=150 时拉取 2 页并合并', async () => {
      const page1 = Array.from({ length: 100 }, (_, i) => ({ ...BOARD_A, f12: `BK${1000 + i}`, f14: `概念${i}` }));
      const page2 = Array.from({ length: 50 }, (_, i) => ({ ...BOARD_B, f12: `BK${2000 + i}`, f14: `概念B${i}` }));
      mockGet.mockResolvedValueOnce(emResp(page1, 150)).mockResolvedValueOnce(emResp(page2, 150));
      const boards = await fetchAllConceptBoards();
      expect(mockGet).toHaveBeenCalledTimes(2);
      expect(boards).toHaveLength(150);
    });

    it('5分钟内二次调用命中缓存, 不再发请求', async () => {
      mockGet.mockResolvedValueOnce(emResp([BOARD_A], 1));
      await fetchAllConceptBoards();
      const again = await fetchAllConceptBoards();
      expect(mockGet).toHaveBeenCalledTimes(1);
      expect(again).toHaveLength(1);
    });

    it('东财返回空/异常结构时返回空数组且不缓存', async () => {
      mockGet.mockResolvedValueOnce({ data: { rc: 1 } });
      const boards = await fetchAllConceptBoards();
      expect(boards).toEqual([]);
      // 不缓存空结果 → 下次仍会请求
      mockGet.mockResolvedValueOnce(emResp([BOARD_A], 1));
      const retry = await fetchAllConceptBoards();
      expect(retry).toHaveLength(1);
    });

    it('空值字段("-")归零, 不产生 NaN', async () => {
      mockGet.mockResolvedValueOnce(emResp([{ ...BOARD_A, f3: '-', f6: '-' }], 1));
      const boards = await fetchAllConceptBoards();
      expect(boards[0].changePercent).toBe(0);
      expect(boards[0].turnover).toBe(0);
    });
  });

  describe('scoreConceptBoards', () => {
    const mk = (over: Partial<ConceptBoardRaw>): ConceptBoardRaw => ({
      code: 'BK0001', name: 'X', changePercent: 0, turnoverRate: 0, turnover: 0,
      stockCount: 10, upCount: 5, downCount: 5, leaderName: '', leaderSymbol: '', ...over,
    });

    it('评分模型与行业momentum同标准: change≤50 volume≤30 breadth≤20', () => {
      const scores = scoreConceptBoards([
        mk({ name: '强势', changePercent: 5, turnover: 1000, upCount: 10, downCount: 0 }),
        mk({ name: '弱势', changePercent: -1, turnover: 100, upCount: 0, downCount: 10 }),
      ]);
      const strong = scores.find(s => s.industry === '强势')!;
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
      const s = scoreConceptBoards([mk({ name: '半导体', changePercent: 2.5 })])[0];
      expect(s).toHaveProperty('industry', '半导体');
      expect(s).toHaveProperty('avg_change_percent', 2.5);
      expect(s).toHaveProperty('total_turnover');
      expect(s).toHaveProperty('stock_count');
    });
  });

  describe('persistConcepts', () => {
    const mk = (name: string): ConceptBoardRaw => ({
      code: 'BK0001', name, changePercent: 1, turnoverRate: 1, turnover: 1,
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
