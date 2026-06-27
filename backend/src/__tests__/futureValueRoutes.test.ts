/**
 * 未来价值发现 API 路由测试
 */
import { describe, it, expect, beforeEach } from 'vitest';
import Joi from 'joi';
import { futureValueSchemas } from '../middleware/futureValueValidation';

describe('未来价值发现 API', () => {
  describe('验证 schemas', () => {
    describe('scoreBatch', () => {
      const schema = futureValueSchemas.scoreBatch;

      it('应通过有效的批量评分请求', () => {
        const { error } = schema.validate({
          stocks: [
            {
              symbol: '600519',
              name: '贵州茅台',
              fundamental: { pe: 25, pb: 8, revenueGrowth: 15, profitGrowth: 20, roe: 30 },
              technical: { closes: [100, 101, 102], volumes: [1000, 1100, 1200], currentPrice: 102 },
              capitalFlow: { mainNetInflow: 5000000, northboundNetBuy: 2000000, marginNetBuy: 1000000, totalMarketCap: 20000000000 },
            },
          ],
        });
        expect(error).toBeUndefined();
      });

      it('空 stocks 数组应拒绝', () => {
        const { error } = schema.validate({ stocks: [] });
        expect(error).toBeDefined();
      });

      it('缺少 symbol 应拒绝', () => {
        const { error } = schema.validate({
          stocks: [
            {
              fundamental: { pe: 25, pb: 8, revenueGrowth: 15, profitGrowth: 20, roe: 30 },
              technical: { closes: [100], volumes: [1000], currentPrice: 100 },
              capitalFlow: { mainNetInflow: 0, northboundNetBuy: 0, marginNetBuy: 0, totalMarketCap: 10000 },
            },
          ],
        });
        expect(error).toBeDefined();
      });

      it('超过50只股票应拒绝', () => {
        const stocks = Array.from({ length: 51 }, (_, i) => ({
          symbol: `${600000 + i}`,
          fundamental: { pe: 20, pb: 3, revenueGrowth: 10, profitGrowth: 10, roe: 15 },
          technical: { closes: [100], volumes: [1000], currentPrice: 100 },
          capitalFlow: { mainNetInflow: 0, northboundNetBuy: 0, marginNetBuy: 0, totalMarketCap: 10000 },
        }));
        const { error } = schema.validate({ stocks });
        expect(error).toBeDefined();
      });

      it('注入字符在 symbol 中应拒绝', () => {
        const { error } = schema.validate({
          stocks: [
            {
              symbol: "600519'; DROP TABLE--",
              fundamental: { pe: 25, pb: 8, revenueGrowth: 15, profitGrowth: 20, roe: 30 },
              technical: { closes: [100], volumes: [1000], currentPrice: 100 },
              capitalFlow: { mainNetInflow: 0, northboundNetBuy: 0, marginNetBuy: 0, totalMarketCap: 10000 },
            },
          ],
        });
        expect(error).toBeDefined();
      });
    });

    describe('discoverQuery', () => {
      const schema = futureValueSchemas.discoverQuery;

      it('空参数应使用默认值', () => {
        const { error, value } = schema.validate({});
        expect(error).toBeUndefined();
        expect(value.page).toBe(1);
        expect(value.pageSize).toBe(20);
        expect(value.sortBy).toBe('total');
        expect(value.sortOrder).toBe('desc');
      });

      it('有效参数应通过', () => {
        const { error } = schema.validate({
          page: 2,
          pageSize: 50,
          minScore: 60,
          maxScore: 90,
          sortBy: 'fundamental',
          sortOrder: 'asc',
          rating: '推荐',
        });
        expect(error).toBeUndefined();
      });

      it('无效 sortBy 应拒绝', () => {
        const { error } = schema.validate({ sortBy: 'invalid' });
        expect(error).toBeDefined();
      });

      it('无效 rating 应拒绝', () => {
        const { error } = schema.validate({ rating: '优秀' });
        expect(error).toBeDefined();
      });

      it('minScore 超出范围应拒绝', () => {
        const { error } = schema.validate({ minScore: -1 });
        expect(error).toBeDefined();
      });
    });

    describe('detailParams', () => {
      const schema = futureValueSchemas.detailParams;

      it('有效 symbol 应通过', () => {
        const { error } = schema.validate({ symbol: '600519' });
        expect(error).toBeUndefined();
      });

      it('空 symbol 应拒绝', () => {
        const { error } = schema.validate({ symbol: '' });
        expect(error).toBeDefined();
      });

      it('注入字符应拒绝', () => {
        const { error } = schema.validate({ symbol: "600519' OR 1=1" });
        expect(error).toBeDefined();
      });
    });

    describe('config', () => {
      const schema = futureValueSchemas.config;

      it('有效配置应通过', () => {
        const { error } = schema.validate({
          weights: { fundamental: 0.5, technical: 0.3, capitalFlow: 0.1, aiAnalysis: 0.1 },
          minScore: 70,
          riskTolerance: 'aggressive',
        });
        expect(error).toBeUndefined();
      });

      it('空对象应拒绝', () => {
        const { error } = schema.validate({});
        expect(error).toBeDefined();
      });

      it('无效 riskTolerance 应拒绝', () => {
        const { error } = schema.validate({ riskTolerance: 'extreme' });
        expect(error).toBeDefined();
      });

      it('权重超出范围应拒绝', () => {
        const { error } = schema.validate({
          weights: { fundamental: 1.5, technical: 0.3, capitalFlow: 0.1, aiAnalysis: 0.1 },
        });
        expect(error).toBeDefined();
      });
    });
  });
});
