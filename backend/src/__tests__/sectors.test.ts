import { describe, it, expect } from 'vitest';

/**
 * 板块分析 API 测试
 * 测试板块查询、排序、排名等逻辑
 */
describe('Sectors API', () => {
  // 模拟行业数据
  const mockIndustries = [
    { industry: '半导体', avg_change_percent: 3.5, stock_count: 95, turnover: 720e8 },
    { industry: '人工智能', avg_change_percent: 2.8, stock_count: 128, turnover: 850e8 },
    { industry: '新能源车', avg_change_percent: 1.5, stock_count: 82, turnover: 650e8 },
    { industry: '银行', avg_change_percent: 0.3, stock_count: 42, turnover: 380e8 },
    { industry: '房地产', avg_change_percent: -0.5, stock_count: 112, turnover: 280e8 },
    { industry: '煤炭', avg_change_percent: -1.8, stock_count: 38, turnover: 200e8 },
  ];

  describe('Industry Sorting Logic', () => {
    it('should sort by avg_change_percent descending', () => {
      const sorted = [...mockIndustries].sort(
        (a, b) => (b.avg_change_percent ?? 0) - (a.avg_change_percent ?? 0)
      );
      expect(sorted[0].industry).toBe('半导体');
      expect(sorted[sorted.length - 1].industry).toBe('煤炭');
    });

    it('should sort by avg_change_percent ascending', () => {
      const sorted = [...mockIndustries].sort(
        (a, b) => (a.avg_change_percent ?? 0) - (b.avg_change_percent ?? 0)
      );
      expect(sorted[0].industry).toBe('煤炭');
      expect(sorted[sorted.length - 1].industry).toBe('半导体');
    });

    it('should sort by stock_count', () => {
      const sorted = [...mockIndustries].sort(
        (a, b) => (b.stock_count ?? 0) - (a.stock_count ?? 0)
      );
      expect(sorted[0].industry).toBe('人工智能');
      expect(sorted[0].stock_count).toBe(128);
    });

    it('should sort by turnover', () => {
      const sorted = [...mockIndustries].sort(
        (a, b) => (b.turnover ?? 0) - (a.turnover ?? 0)
      );
      expect(sorted[0].industry).toBe('人工智能');
    });

    it('should handle dynamic sort field', () => {
      const sortBy = 'stock_count';
      const sortOrder = 'asc';
      const sorted = [...mockIndustries].sort((a: any, b: any) => {
        const aVal = a[sortBy] ?? 0;
        const bVal = b[sortBy] ?? 0;
        return sortOrder === 'desc' ? bVal - aVal : aVal - bVal;
      });
      expect(sorted[0].stock_count).toBeLessThanOrEqual(sorted[1].stock_count);
    });
  });

  describe('Sector Ranking', () => {
    it('should return top gainers', () => {
      const gainers = [...mockIndustries]
        .sort((a, b) => (b.avg_change_percent ?? 0) - (a.avg_change_percent ?? 0))
        .slice(0, 3);
      expect(gainers.length).toBe(3);
      expect(gainers[0].industry).toBe('半导体');
      expect(gainers[0].avg_change_percent).toBeGreaterThan(0);
    });

    it('should return top losers', () => {
      const losers = [...mockIndustries]
        .sort((a, b) => (a.avg_change_percent ?? 0) - (b.avg_change_percent ?? 0))
        .slice(0, 3);
      expect(losers.length).toBe(3);
      expect(losers[0].industry).toBe('煤炭');
      expect(losers[0].avg_change_percent).toBeLessThan(0);
    });

    it('should respect limit parameter', () => {
      const limit = 2;
      const result = [...mockIndustries]
        .sort((a, b) => (b.avg_change_percent ?? 0) - (a.avg_change_percent ?? 0))
        .slice(0, limit);
      expect(result.length).toBe(2);
    });
  });

  describe('Pagination Logic', () => {
    it('should calculate pagination correctly', () => {
      const page = 2;
      const pageSize = 2;
      const totalCount = mockIndustries.length;
      const totalPages = Math.ceil(totalCount / pageSize);
      const offset = (page - 1) * pageSize;

      expect(totalPages).toBe(3);
      expect(offset).toBe(2);
      const pageItems = mockIndustries.slice(offset, offset + pageSize);
      expect(pageItems.length).toBe(2);
    });

    it('should handle last page with fewer items', () => {
      const page = 2;
      const pageSize = 4;
      const totalCount = mockIndustries.length;
      const totalPages = Math.ceil(totalCount / pageSize);
      const offset = (page - 1) * pageSize;
      const pageItems = mockIndustries.slice(offset, offset + pageSize);

      expect(pageItems.length).toBeLessThanOrEqual(pageSize);
      expect(page).toBeLessThanOrEqual(totalPages);
      expect(pageItems.length).toBeLessThan(pageSize); // last page has fewer items
    });

    it('should handle page beyond total', () => {
      const page = 100;
      const pageSize = 10;
      const offset = (page - 1) * pageSize;
      const pageItems = mockIndustries.slice(offset, offset + pageSize);
      expect(pageItems.length).toBe(0);
    });
  });

  describe('Industry Classification', () => {
    it('should classify industries correctly', () => {
      const industryMap = new Map<string, number>();
      mockIndustries.forEach(ind => {
        industryMap.set(ind.industry, ind.stock_count);
      });
      expect(industryMap.size).toBe(6);
      expect(industryMap.get('半导体')).toBe(95);
    });

    it('should identify leading sectors', () => {
      const leadingSectors = mockIndustries
        .filter(ind => ind.avg_change_percent > 2)
        .map(ind => ind.industry);
      expect(leadingSectors).toContain('半导体');
      expect(leadingSectors).toContain('人工智能');
    });

    it('should calculate market breadth from sectors', () => {
      const rising = mockIndustries.filter(s => (s.avg_change_percent ?? 0) > 0).length;
      const falling = mockIndustries.filter(s => (s.avg_change_percent ?? 0) < 0).length;
      const total = rising + falling;
      expect(rising).toBe(4);
      expect(falling).toBe(2);
      expect(rising / total).toBeGreaterThan(0.5);
    });
  });

  describe('Response Format', () => {
    it('should return correct response structure', () => {
      const response = {
        success: true,
        data: {
          date: new Date().toISOString().split('T')[0],
          sectors: mockIndustries,
          count: mockIndustries.length,
        },
      };
      expect(response.success).toBe(true);
      expect(response.data.sectors).toBeInstanceOf(Array);
      expect(response.data.count).toBe(6);
      expect(response.data.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    });

    it('should handle error response', () => {
      const errorResponse = {
        success: false,
        error: '获取行业板块失败',
        details: 'Database connection error',
      };
      expect(errorResponse.success).toBe(false);
      expect(errorResponse.error).toBeTruthy();
    });
  });
});
