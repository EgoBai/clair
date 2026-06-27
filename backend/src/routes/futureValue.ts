/**
 * 未来价值发现 API
 * 提供股票评分、发现列表、评分详情、个性化配置
 */

import { Request, Response, Router } from 'express';
import { asyncHandler, sendSuccess, sendNotFound, sendInternalError } from '../utils/apiResponse';
import {
  validateScoreBatch,
  validateDiscoverQuery,
  validateDetailParams,
  validateConfig,
} from '../middleware/futureValueValidation';
import {
  batchCalculateScores,
  sortByScore,
  filterRecommended,
  analyzeDimensions,
  findStrengthsAndWeaknesses,
  type StockScoreInput,
  type StockScoreResult,
  type ScoreWeights,
} from '../services/futureValueEngine';

const router = Router();

// ==================== 内存存储 ====================

/** 评分结果缓存 (symbol -> StockScoreResult) */
const scoreCache: Map<string, StockScoreResult> = new Map();

/** 用户个性化配置 (userId -> config) */
const userConfigs: Map<number, UserConfig> = new Map();

interface UserConfig {
  weights: ScoreWeights;
  minScore: number;
  preferredSectors: string[];
  riskTolerance: 'conservative' | 'moderate' | 'aggressive';
}

const DEFAULT_USER_CONFIG: UserConfig = {
  weights: { fundamental: 0.40, technical: 0.30, capitalFlow: 0.20, aiAnalysis: 0.10 },
  minScore: 65,
  preferredSectors: [],
  riskTolerance: 'moderate',
};

// ==================== POST /api/future-value/score ====================

/**
 * 批量评分
 * 接收多只股票的原始数据，计算综合评分
 */
router.post('/future-value/score', validateScoreBatch, asyncHandler(async (req: Request, res: Response) => {
  const { stocks } = req.body;

  const inputs: StockScoreInput[] = stocks.map((s: any) => ({
    symbol: s.symbol,
    name: s.name || '',
    fundamental: s.fundamental,
    technical: s.technical,
    capitalFlow: s.capitalFlow,
    aiAnalysis: s.aiAnalysis || {},
  }));

  const results = batchCalculateScores(inputs);

  // 缓存评分结果
  for (const result of results) {
    scoreCache.set(result.symbol, result);
  }

  sendSuccess(res, {
    results,
    total: results.length,
    summary: {
      avgScore: results.reduce((sum, r) => sum + r.score.total, 0) / results.length,
      maxScore: Math.max(...results.map(r => r.score.total)),
      minScore: Math.min(...results.map(r => r.score.total)),
    },
  });
}));

// ==================== GET /api/future-value/discover ====================

/**
 * 发现列表
 * 从缓存的评分结果中筛选、排序、分页返回
 */
router.get('/future-value/discover', validateDiscoverQuery, asyncHandler(async (req: Request, res: Response) => {
  const { page, pageSize, minScore, maxScore, sortBy, sortOrder, rating } = req.query as any;

  let results = Array.from(scoreCache.values());

  // 按评分范围筛选
  results = results.filter(r => r.score.total >= minScore && r.score.total <= maxScore);

  // 按评级筛选
  if (rating) {
    results = results.filter(r => r.score.rating === rating);
  }

  // 排序
  const getScoreValue = (r: StockScoreResult): number => {
    switch (sortBy) {
      case 'fundamental': return r.score.fundamental.total;
      case 'technical': return r.score.technical.total;
      case 'capitalFlow': return r.score.capitalFlow.total;
      case 'aiAnalysis': return r.score.aiAnalysis.total;
      default: return r.score.total;
    }
  };
  results.sort((a, b) => sortOrder === 'asc' ? getScoreValue(a) - getScoreValue(b) : getScoreValue(b) - getScoreValue(a));

  // 分页
  const totalCount = results.length;
  const start = (page - 1) * pageSize;
  const paged = results.slice(start, start + pageSize);

  sendSuccess(res, {
    items: paged.map(r => ({
      symbol: r.symbol,
      name: r.name,
      totalScore: r.score.total,
      rating: r.score.rating,
      fundamental: r.score.fundamental.total,
      technical: r.score.technical.total,
      capitalFlow: r.score.capitalFlow.total,
      aiAnalysis: r.score.aiAnalysis.total,
    })),
    pagination: {
      page,
      pageSize,
      totalCount,
      totalPages: Math.ceil(totalCount / pageSize),
    },
  });
}));

// ==================== GET /api/future-value/detail/:symbol ====================

/**
 * 评分详情
 * 返回单只股票的完整评分数据和维度分析
 */
router.get('/future-value/detail/:symbol', validateDetailParams, asyncHandler(async (req: Request, res: Response) => {
  const { symbol } = req.params;

  const cached = scoreCache.get(symbol);
  if (!cached) {
    sendNotFound(res, `股票 ${symbol} 的评分数据`);
    return;
  }

  const dimensions = analyzeDimensions(cached.score);
  const { strengths, weaknesses } = findStrengthsAndWeaknesses(cached.score);

  sendSuccess(res, {
    symbol: cached.symbol,
    name: cached.name,
    score: cached.score,
    dimensions,
    strengths,
    weaknesses,
  });
}));

// ==================== POST /api/future-value/config ====================

/**
 * 个性化配置
 * 保存用户的评分权重和筛选偏好
 */
router.post('/future-value/config', validateConfig, asyncHandler(async (req: Request, res: Response) => {
  const userId = parseInt(req.body.userId as string) || 1;
  const { weights, minScore, preferredSectors, riskTolerance } = req.body;

  const existing = userConfigs.get(userId) || { ...DEFAULT_USER_CONFIG };

  const updated: UserConfig = {
    ...existing,
    ...(weights && { weights: { ...existing.weights, ...weights } }),
    ...(minScore !== undefined && { minScore }),
    ...(preferredSectors && { preferredSectors }),
    ...(riskTolerance && { riskTolerance }),
  };

  // 验证权重之和
  const weightSum = Object.values(updated.weights).reduce((a, b) => a + b, 0);
  if (Math.abs(weightSum - 1) > 0.01) {
    res.status(400).json({
      success: false,
      error: '权重之和必须为1',
      details: `当前权重之和为 ${weightSum.toFixed(2)}`,
    });
    return;
  }

  userConfigs.set(userId, updated);

  sendSuccess(res, {
    userId,
    config: updated,
  });
}));

// ==================== 导出 ====================

export { scoreCache, userConfigs };
export default router;
