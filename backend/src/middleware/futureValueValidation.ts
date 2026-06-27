/**
 * 未来价值发现 - 输入验证中间件
 */

import { Request, Response, NextFunction } from 'express';
import Joi from 'joi';

// ==================== Schema 定义 ====================

/** 单只股票评分输入 */
const stockScoreInputSchema = Joi.object({
  symbol: Joi.string().max(20).pattern(/^[a-zA-Z0-9.]+$/).required(),
  name: Joi.string().max(100).optional().allow(''),
  fundamental: Joi.object({
    pe: Joi.number().min(-1000).max(10000).required(),
    pb: Joi.number().min(-100).max(1000).required(),
    revenueGrowth: Joi.number().min(-100).max(10000).required(),
    profitGrowth: Joi.number().min(-100).max(10000).required(),
    roe: Joi.number().min(-100).max(100).required(),
  }).required(),
  technical: Joi.object({
    closes: Joi.array().items(Joi.number().min(0)).min(1).max(500).required(),
    volumes: Joi.array().items(Joi.number().min(0)).min(1).max(500).required(),
    currentPrice: Joi.number().min(0).required(),
  }).required(),
  capitalFlow: Joi.object({
    mainNetInflow: Joi.number().required(),
    northboundNetBuy: Joi.number().required(),
    marginNetBuy: Joi.number().required(),
    totalMarketCap: Joi.number().min(0).required(),
  }).required(),
  aiAnalysis: Joi.object({
    industryScore: Joi.number().min(0).max(100).optional(),
    competitivenessScore: Joi.number().min(0).max(100).optional(),
    riskScore: Joi.number().min(0).max(100).optional(),
  }).optional().default({}),
});

/** 批量评分请求体 */
const scoreBatchSchema = Joi.object({
  stocks: Joi.array().items(stockScoreInputSchema).min(1).max(50).required(),
});

/** 发现列表查询参数 */
const discoverQuerySchema = Joi.object({
  page: Joi.number().integer().min(1).max(10000).default(1),
  pageSize: Joi.number().integer().min(1).max(100).default(20),
  minScore: Joi.number().min(0).max(100).default(0),
  maxScore: Joi.number().min(0).max(100).default(100),
  sortBy: Joi.string().valid('total', 'fundamental', 'technical', 'capitalFlow', 'aiAnalysis').default('total'),
  sortOrder: Joi.string().valid('asc', 'desc').default('desc'),
  rating: Joi.string().valid('强烈推荐', '推荐', '中性', '谨慎', '回避').optional(),
});

/** 评分详情路径参数 */
const detailParamsSchema = Joi.object({
  symbol: Joi.string().max(20).pattern(/^[a-zA-Z0-9.]+$/).required(),
});

/** 个性化配置请求体 */
const configSchema = Joi.object({
  weights: Joi.object({
    fundamental: Joi.number().min(0).max(1).precision(2).optional(),
    technical: Joi.number().min(0).max(1).precision(2).optional(),
    capitalFlow: Joi.number().min(0).max(1).precision(2).optional(),
    aiAnalysis: Joi.number().min(0).max(1).precision(2).optional(),
  }).optional(),
  minScore: Joi.number().min(0).max(100).optional(),
  preferredSectors: Joi.array().items(Joi.string().max(50)).max(20).optional(),
  riskTolerance: Joi.string().valid('conservative', 'moderate', 'aggressive').optional(),
}).min(1);

// ==================== 验证中间件工厂 ====================

function validate(schema: Joi.ObjectSchema, source: 'body' | 'query' | 'params') {
  return (req: Request, res: Response, next: NextFunction) => {
    const { error, value } = schema.validate(req[source], {
      abortEarly: false,
      stripUnknown: true,
    });

    if (error) {
      const details = error.details.map((d) => d.message).join('; ');
      return res.status(400).json({
        success: false,
        error: '请求参数验证失败',
        details,
      });
    }

    (req as any)[source] = value;
    next();
  };
}

// ==================== 导出验证中间件 ====================

export const validateScoreBatch = validate(scoreBatchSchema, 'body');
export const validateDiscoverQuery = validate(discoverQuerySchema, 'query');
export const validateDetailParams = validate(detailParamsSchema, 'params');
export const validateConfig = validate(configSchema, 'body');

// 导出 schemas 供测试使用
export const futureValueSchemas = {
  scoreBatch: scoreBatchSchema,
  discoverQuery: discoverQuerySchema,
  detailParams: detailParamsSchema,
  config: configSchema,
};
