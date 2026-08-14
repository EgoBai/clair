/**
 * sectorMomentumService 行业板块景气度服务测试（诚实数据版）
 *
 * 修复策略（诚实红线）：
 * - DB 有数据 → source='live', dataOrigin='db'
 * - DB 空 + 腾讯行业板可用 → source='live', dataOrigin='tencent-live'
 * - 两者都拿不到 → source='unavailable', sectors=[], dataOrigin='none'
 * - 任何情况下都不返回演示/模板数据。
 *
 * 策略：mock dbFactory 与 conceptBoardService 模块（确定性，无真实 DB / 外网）。
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('../db/dbFactory', () => ({
  db: { getSectorMomentumScore: vi.fn() },
}));

vi.mock('../services/conceptBoardService', () => ({
  fetchIndustryBoardsWithMeta: vi.fn(),
  scoreConceptBoards: vi.fn(),
}));

import { db } from '../db/dbFactory';
import {
  fetchIndustryBoardsWithMeta,
  scoreConceptBoards,
} from '../services/conceptBoardService';
import {
  getSectorMomentum,
  describeSectorDataOrigin,
} from '../services/sectorMomentumService';

const mockDb = db.getSectorMomentumScore as ReturnType<typeof vi.fn>;
const mockFetchBoards = fetchIndustryBoardsWithMeta as ReturnType<typeof vi.fn>;
const mockScore = scoreConceptBoards as ReturnType<typeof vi.fn>;

const DB_ROWS = [
  {
    industry: '白酒',
    score: 85,
    changeScore: 80,
    volumeScore: 90,
    breadthScore: 85,
    stock_count: 20,
    avg_change_percent: 2.3,
    total_turnover: 5e10,
    limit_up_count: 3,
  },
];

const TENCENT_BOARDS = [
  { name: '半导体', changePercent: 3.1, turnover: 8e10 },
  { name: '医药', changePercent: -1.2, turnover: 4e10 },
];

const SCORED_ROWS = [
  {
    industry: '半导体',
    score: 78,
    changeScore: 75,
    volumeScore: 82,
    breadthScore: 70,
    stock_count: 0,
    avg_change_percent: 3.1,
    total_turnover: 8e10,
    limit_up_count: 0, // 该数据源缺失，诚实置 0
  },
];

describe('sectorMomentumService (honest-data)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('DB 优先路径', () => {
    it('DB 有数据 → dataOrigin=db，source=live，不触碰腾讯源', async () => {
      mockDb.mockResolvedValue(DB_ROWS);
      const result = await getSectorMomentum();

      expect(result.dataOrigin).toBe('db');
      expect(result.meta.source).toBe('live');
      expect(result.meta.updatedAt).toBeTruthy();
      expect(result.sectors).toEqual(DB_ROWS);
      expect(mockFetchBoards).not.toHaveBeenCalled();
    });

    it('DB 抛错但腾讯源可用 → 降级 tencent-live', async () => {
      mockDb.mockRejectedValue(new Error('db connection lost'));
      mockFetchBoards.mockResolvedValue({
        boards: TENCENT_BOARDS,
        meta: { source: 'live', updatedAt: '2026-08-14T01:00:00.000Z' },
      });
      mockScore.mockReturnValue(SCORED_ROWS);

      const result = await getSectorMomentum();
      expect(result.dataOrigin).toBe('tencent-live');
      expect(result.meta.source).toBe('live');
      expect(result.sectors).toEqual(SCORED_ROWS);
      expect(mockScore).toHaveBeenCalledWith(TENCENT_BOARDS);
    });
  });

  describe('腾讯兜底路径', () => {
    it('DB 空 + 腾讯行业板可用 → dataOrigin=tencent-live', async () => {
      mockDb.mockResolvedValue([]);
      mockFetchBoards.mockResolvedValue({
        boards: TENCENT_BOARDS,
        meta: { source: 'live', updatedAt: '2026-08-14T01:00:00.000Z' },
      });
      mockScore.mockReturnValue(SCORED_ROWS);

      const result = await getSectorMomentum();
      expect(result.dataOrigin).toBe('tencent-live');
      expect(result.meta.source).toBe('live');
      expect(result.meta.updatedAt).toBe('2026-08-14T01:00:00.000Z');
      expect(result.sectors).toHaveLength(1);
    });
  });

  describe('双源不可用 → 诚实空（绝不返回演示数据）', () => {
    it('DB 空 + 腾讯源抛错 → source=unavailable，sectors=[]，error 含双侧原因', async () => {
      mockDb.mockResolvedValue([]);
      mockFetchBoards.mockRejectedValue(new Error('tencent unreachable'));

      const result = await getSectorMomentum();
      expect(result.dataOrigin).toBe('none');
      expect(result.meta.source).toBe('unavailable');
      expect(result.meta.updatedAt).toBeNull();
      expect(result.sectors).toEqual([]);
      expect(result.meta.error).toContain('tencent unreachable');
    });

    it('DB 抛错 + 腾讯源抛错 → error 同时包含 DB 与腾讯原因', async () => {
      mockDb.mockRejectedValue(new Error('db connection lost'));
      mockFetchBoards.mockRejectedValue(new Error('HTTP 500'));

      const result = await getSectorMomentum();
      expect(result.dataOrigin).toBe('none');
      expect(result.sectors).toEqual([]);
      expect(result.meta.error).toContain('db connection lost');
      expect(result.meta.error).toContain('HTTP 500');
    });

    it('DB 空 + 腾讯返回空 boards → source=unavailable（空数据）', async () => {
      mockDb.mockResolvedValue([]);
      mockFetchBoards.mockResolvedValue({
        boards: [],
        meta: { source: 'live', updatedAt: '2026-08-14T01:00:00.000Z' },
      });

      const result = await getSectorMomentum();
      expect(result.dataOrigin).toBe('none');
      expect(result.meta.source).toBe('unavailable');
      expect(result.sectors).toEqual([]);
      expect(result.meta.error).toContain('空数据');
    });
  });

  describe('describeSectorDataOrigin 口径声明', () => {
    it('db → 声明含真实涨停家数', () => {
      expect(describeSectorDataOrigin('db')).toContain('日线聚合');
    });

    it('tencent-live → 声明涨停字段缺失，不得提及涨停数量', () => {
      const s = describeSectorDataOrigin('tencent-live');
      expect(s).toContain('腾讯财经');
      expect(s).toContain('不得提及涨停数量');
    });

    it('none → 声明数据不可用，禁止臆测', () => {
      expect(describeSectorDataOrigin('none')).toContain('不可用');
    });
  });
});
