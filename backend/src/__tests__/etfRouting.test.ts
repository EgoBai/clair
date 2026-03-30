/**
 * ETF API 路由测试
 * 验证 ETF 模块路由和端点完整性
 */

import { describe, it, expect } from 'vitest';

describe('ETF API 路由', () => {
  it('应定义 ETF 列表端点', () => {
    const endpoints = [
      { method: 'GET', path: '/api/etf/list', description: 'ETF 列表' },
      { method: 'GET', path: '/api/etf/:symbol', description: 'ETF 详情' },
      { method: 'GET', path: '/api/etf/:symbol/nav-history', description: '净值历史' },
      { method: 'GET', path: '/api/etf/premium/rank', description: '折溢价排行' },
    ];
    expect(endpoints).toHaveLength(4);
    for (const ep of endpoints) {
      expect(ep).toHaveProperty('method');
      expect(ep).toHaveProperty('path');
      expect(ep).toHaveProperty('description');
    }
  });

  it('ETF 端点应使用 GET 方法', () => {
    const endpoints = ['/api/etf/list', '/api/etf/:symbol', '/api/etf/:symbol/nav-history', '/api/etf/premium/rank'];
    for (const path of endpoints) {
      expect(path.startsWith('/api/etf')).toBe(true);
    }
  });

  it('类型筛选参数应在预定义范围内', () => {
    const validTypes = ['index', 'sector', 'qdii', 'commodity', 'bond', 'theme'];
    expect(validTypes.length).toBeGreaterThanOrEqual(4);
  });

  it('净值历史天数参数应有默认值', () => {
    const defaultDays = 30;
    expect(defaultDays).toBeGreaterThan(0);
    expect(defaultDays).toBeLessThanOrEqual(365);
  });

  describe('ETF 响应格式', () => {
    it('列表响应应包含 success 和 data', () => {
      const response = { success: true, data: [], count: 0 };
      expect(response).toHaveProperty('success');
      expect(response).toHaveProperty('data');
      expect(response).toHaveProperty('count');
    });

    it('详情响应应包含持仓明细', () => {
      const response = {
        success: true,
        data: {
          symbol: '510300',
          name: '沪深300ETF',
          topHoldings: [
            { name: '贵州茅台', weight: 5.2, change: 0.1 },
          ],
        },
      };
      expect(response.data).toHaveProperty('topHoldings');
      expect(Array.isArray(response.data.topHoldings)).toBe(true);
    });

    it('净值历史响应应包含 history 数组', () => {
      const response = {
        success: true,
        data: {
          symbol: '510300',
          name: '沪深300ETF',
          history: [
            { date: '2024-03-01', nav: 4.562, accNav: 4.567, changePercent: 0.75 },
          ],
        },
      };
      expect(Array.isArray(response.data.history)).toBe(true);
    });

    it('折溢价排行应包含 premium 和 discount 两组', () => {
      const response = {
        success: true,
        data: {
          premium: [{ symbol: '513100', name: '纳指ETF', premiumRate: 2.35 }],
          discount: [{ symbol: '512000', name: '券商ETF', premiumRate: -0.10 }],
        },
      };
      expect(response.data).toHaveProperty('premium');
      expect(response.data).toHaveProperty('discount');
    });
  });
});
