/**
 * 输入验证中间件
 * 使用 Joi 验证请求参数，防止注入攻击和非法数据
 */

import { Request, Response, NextFunction } from 'express';
import Joi from 'joi';

// ==================== Schema 定义 ====================

const stockSearchSchema = Joi.object({
  symbol: Joi.string().max(20).pattern(/^[a-zA-Z0-9.]*$/).optional(),
  name: Joi.string().max(100).optional(),
  market: Joi.string().valid('SH', 'SZ', 'BJ').optional(),
  industry: Joi.string().max(100).optional(),
  isActive: Joi.string().valid('true', 'false').optional(),
  page: Joi.number().integer().min(1).max(10000).default(1),
  pageSize: Joi.number().integer().min(1).max(100).default(20),
  sortBy: Joi.string().valid('symbol', 'name', 'market', 'industry', 'created_at').default('symbol'),
  sortOrder: Joi.string().valid('asc', 'desc').default('asc'),
});

const stockSymbolSchema = Joi.object({
  symbol: Joi.string().max(20).pattern(/^[a-zA-Z0-9.]+$/).required(),
});

const quoteQuerySchema = Joi.object({
  startDate: Joi.date().iso().optional(),
  endDate: Joi.date().iso().optional(),
  limit: Joi.number().integer().min(1).max(1000).default(120),
});

const batchQuotesSchema = Joi.object({
  symbols: Joi.array().items(Joi.string().max(20)).min(1).max(100).required(),
});

const marketQuerySchema = Joi.object({
  date: Joi.date().iso().optional(),
  limit: Joi.number().integer().min(1).max(100).default(10),
});

const sectorQuerySchema = Joi.object({
  date: Joi.date().iso().optional(),
  sortBy: Joi.string().valid('industry', 'avgChangePercent', 'totalMarketCap', 'stockCount').default('avgChangePercent'),
  sortOrder: Joi.string().valid('asc', 'desc').default('desc'),
});

// ==================== 验证中间件工厂 ====================

/**
 * 验证查询参数
 */
export function validateQuery(schema: Joi.ObjectSchema) {
  return (req: Request, res: Response, next: NextFunction) => {
    const { error, value } = schema.validate(req.query, {
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

    req.query = value;
    next();
  };
}

/**
 * 验证请求体
 */
export function validateBody(schema: Joi.ObjectSchema) {
  return (req: Request, res: Response, next: NextFunction) => {
    const { error, value } = schema.validate(req.body, {
      abortEarly: false,
      stripUnknown: true,
    });

    if (error) {
      const details = error.details.map((d) => d.message).join('; ');
      return res.status(400).json({
        success: false,
        error: '请求体验证失败',
        details,
      });
    }

    req.body = value;
    next();
  };
}

/**
 * 验证路径参数
 */
export function validateParams(schema: Joi.ObjectSchema) {
  return (req: Request, res: Response, next: NextFunction) => {
    const { error, value } = schema.validate(req.params, {
      abortEarly: false,
      stripUnknown: true,
    });

    if (error) {
      const details = error.details.map((d) => d.message).join('; ');
      return res.status(400).json({
        success: false,
        error: '路径参数验证失败',
        details,
      });
    }

    req.params = value;
    next();
  };
}

// ==================== 导出 Schema ====================

export const schemas = {
  stockSearch: stockSearchSchema,
  stockSymbol: stockSymbolSchema,
  quoteQuery: quoteQuerySchema,
  batchQuotes: batchQuotesSchema,
  marketQuery: marketQuerySchema,
  sectorQuery: sectorQuerySchema,
};
