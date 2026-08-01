/**
 * 行业板块景气度服务 (F14-B)
 *
 * 背景：
 *   原 /api/sectors/momentum 纯读 db.getSectorMomentumScore()，
 *   数据库未同步时返回 []，前端 DiscoverPage 用 buildDemoScores() 造一批
 *   假的行业评分顶上去 —— 违反「诚实数据红线」，用户看到的是模板数据。
 *
 * 修复策略（用户拍板：后端直连实时接口）：
 *   DB 有数据            → source='live'   (dataOrigin='db')
 *   DB 空 + 腾讯行业板可用 → source='live'   (dataOrigin='tencent-live')
 *   两者都拿不到          → source='unavailable'，sectors=[]，前端展示空态
 *   **任何情况下都不再生成演示/模板数据。**
 *
 * 数据源：腾讯财经板块排行 board_type=hy（与概念板 gn 同一接口，已沙箱实测可用）
 */

import { db } from '../db/dbFactory';
import {
  fetchIndustryBoardsWithMeta,
  scoreConceptBoards,
  type ConceptScore,
} from './conceptBoardService';
import type { ResponseMeta } from '@shared/types';

/** 对外统一的板块评分形态（ConceptScore 是 DB 版 SectorScore 的超集） */
export type SectorMomentumRow = Partial<ConceptScore> & {
  industry: string;
  score: number;
  changeScore: number;
  volumeScore: number;
  breadthScore: number;
  stock_count: number;
  avg_change_percent: number;
  total_turnover: number;
  limit_up_count: number;
};

/** 数据来源标识：便于前端/AI 提示词声明口径，也便于排障 */
export type SectorDataOrigin = 'db' | 'tencent-live' | 'none';

export interface SectorMomentumResult {
  sectors: SectorMomentumRow[];
  meta: ResponseMeta;
  dataOrigin: SectorDataOrigin;
}

/**
 * 获取行业板块景气度：DB 优先，DB 空则直连腾讯行业板实时排行。
 * 绝不返回演示数据 —— 拿不到就诚实返回空数组 + unavailable。
 */
export async function getSectorMomentum(): Promise<SectorMomentumResult> {
  // ---- 1) 数据库（同步任务写入的日线聚合，字段最全，含真实涨停家数） ----
  let dbError: string | null = null;
  try {
    const rows = await db.getSectorMomentumScore();
    if (Array.isArray(rows) && rows.length > 0) {
      return {
        sectors: rows as SectorMomentumRow[],
        meta: { source: 'live', updatedAt: new Date().toISOString() },
        dataOrigin: 'db',
      };
    }
  } catch (err) {
    dbError = (err as Error).message;
  }

  // ---- 2) 腾讯行业板实时排行兜底 ----
  try {
    const { boards, meta } = await fetchIndustryBoardsWithMeta();
    if (boards.length > 0) {
      const scored = scoreConceptBoards(boards);
      return {
        sectors: scored,
        // 注意：limit_up_count 在该数据源缺失，scoreConceptBoards 已诚实置 0，
        // 消费方（前端徽标 / AI 提示词）不得把 0 解读为"今日无涨停"。
        meta: { source: meta.source, updatedAt: meta.updatedAt },
        dataOrigin: 'tencent-live',
      };
    }
  } catch (err) {
    return {
      sectors: [],
      meta: {
        source: 'unavailable',
        updatedAt: null,
        error:
          `数据库无板块聚合数据${dbError ? `（${dbError}）` : ''}，` +
          `腾讯行业板实时接口亦不可用：${(err as Error).message}`,
      },
      dataOrigin: 'none',
    };
  }

  return {
    sectors: [],
    meta: {
      source: 'unavailable',
      updatedAt: null,
      error:
        `数据库无板块景气度数据${dbError ? `（${dbError}）` : '（stocks/daily_quotes 未同步）'}，` +
        `腾讯行业板实时接口返回空数据`,
    },
    dataOrigin: 'none',
  };
}

/** 给 AI 提示词用的数据口径声明，避免模型把缺失字段当成真实的 0 */
export function describeSectorDataOrigin(origin: SectorDataOrigin): string {
  switch (origin) {
    case 'db':
      return '行业板块数据来自本地同步的日线聚合（含真实涨停家数）。';
    case 'tencent-live':
      return '行业板块数据来自腾讯财经行业板实时排行；该数据源不提供涨停家数，涨停相关字段为缺失（非 0），分析时不得提及涨停数量。';
    default:
      return '行业板块数据当前不可用，请勿臆测板块表现。';
  }
}
