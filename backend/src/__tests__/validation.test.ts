/**
 * 输入验证中间件测试
 */
import { describe, it, expect } from 'vitest';
import Joi from 'joi';

// 复制验证 schemas 进行独立测试
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

describe('输入验证', () => {
  describe('股票搜索验证', () => {
    it('空参数应使用默认值', () => {
      const { error, value } = stockSearchSchema.validate({});
      expect(error).toBeUndefined();
      expect(value.page).toBe(1);
      expect(value.pageSize).toBe(20);
      expect(value.sortBy).toBe('symbol');
      expect(value.sortOrder).toBe('asc');
    });

    it('有效参数应通过', () => {
      const { error } = stockSearchSchema.validate({
        symbol: '600519',
        market: 'SH',
        page: 2,
        pageSize: 50,
      });
      expect(error).toBeUndefined();
    });

    it('无效 market 应拒绝', () => {
      const { error } = stockSearchSchema.validate({ market: 'HK' });
      expect(error).toBeDefined();
    });

    it('page 超出范围应拒绝', () => {
      const { error } = stockSearchSchema.validate({ page: 0 });
      expect(error).toBeDefined();
    });

    it('pageSize 超出上限应拒绝', () => {
      const { error } = stockSearchSchema.validate({ pageSize: 200 });
      expect(error).toBeDefined();
    });

    it('无效 sortBy 应拒绝', () => {
      const { error } = stockSearchSchema.validate({ sortBy: 'DROP TABLE' });
      expect(error).toBeDefined();
    });

    it('symbol 注入字符应拒绝', () => {
      const { error } = stockSearchSchema.validate({ symbol: "600519'; DROP TABLE--" });
      expect(error).toBeDefined();
    });

    it('超长 name 应拒绝', () => {
      const { error } = stockSearchSchema.validate({ name: 'a'.repeat(200) });
      expect(error).toBeDefined();
    });

    it('带点号的股票代码应通过', () => {
      const { error } = stockSearchSchema.validate({ symbol: '600519.SH' });
      expect(error).toBeUndefined();
    });

    it('isActive 只接受 true/false', () => {
      expect(stockSearchSchema.validate({ isActive: 'true' }).error).toBeUndefined();
      expect(stockSearchSchema.validate({ isActive: 'false' }).error).toBeUndefined();
      expect(stockSearchSchema.validate({ isActive: 'yes' }).error).toBeDefined();
    });
  });

  describe('股票代码验证', () => {
    it('有效代码应通过', () => {
      const { error } = stockSymbolSchema.validate({ symbol: '600519.SH' });
      expect(error).toBeUndefined();
    });

    it('空代码应拒绝', () => {
      const { error } = stockSymbolSchema.validate({ symbol: '' });
      expect(error).toBeDefined();
    });

    it('缺少 symbol 应拒绝', () => {
      const { error } = stockSymbolSchema.validate({});
      expect(error).toBeDefined();
    });

    it('特殊字符应拒绝', () => {
      const { error } = stockSymbolSchema.validate({ symbol: '600519<script>' });
      expect(error).toBeDefined();
    });
  });

  describe('行情查询验证', () => {
    it('默认 limit 应为 120', () => {
      const { value } = quoteQuerySchema.validate({});
      expect(value.limit).toBe(120);
    });

    it('limit 上限 1000', () => {
      const { error } = quoteQuerySchema.validate({ limit: 2000 });
      expect(error).toBeDefined();
    });

    it('有效日期应通过', () => {
      const { error } = quoteQuerySchema.validate({
        startDate: '2024-01-01',
        endDate: '2024-12-31',
      });
      expect(error).toBeUndefined();
    });

    it('无效日期格式应拒绝', () => {
      const { error } = quoteQuerySchema.validate({ startDate: 'not-a-date' });
      expect(error).toBeDefined();
    });
  });

  describe('批量查询验证', () => {
    it('有效数组应通过', () => {
      const { error } = batchQuotesSchema.validate({ symbols: ['600519', '000858'] });
      expect(error).toBeUndefined();
    });

    it('空数组应拒绝', () => {
      const { error } = batchQuotesSchema.validate({ symbols: [] });
      expect(error).toBeDefined();
    });

    it('超过100只应拒绝', () => {
      const symbols = Array.from({ length: 101 }, (_, i) => `000${i}`.slice(-6));
      const { error } = batchQuotesSchema.validate({ symbols });
      expect(error).toBeDefined();
    });

    it('缺少 symbols 应拒绝', () => {
      const { error } = batchQuotesSchema.validate({});
      expect(error).toBeDefined();
    });

    it('超长代码项应拒绝', () => {
      const { error } = batchQuotesSchema.validate({ symbols: ['a'.repeat(30)] });
      expect(error).toBeDefined();
    });
  });
});
