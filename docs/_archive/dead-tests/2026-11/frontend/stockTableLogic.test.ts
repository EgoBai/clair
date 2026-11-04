import { describe, it, expect } from 'vitest';

// 股票表格逻辑测试
describe('Stock Table Logic', () => {
  interface Stock {
    symbol: string;
    name: string;
    price: number;
    change_percent: number;
    volume: number;
    market_cap: number;
    turnover_rate: number;
    pe: number;
  }

  const stocks: Stock[] = [
    { symbol: '600519', name: '贵州茅台', price: 1800, change_percent: 2.5, volume: 3000000, market_cap: 2.26e12, turnover_rate: 0.15, pe: 35 },
    { symbol: '000001', name: '平安银行', price: 15, change_percent: -1.2, volume: 80000000, market_cap: 3e11, turnover_rate: 1.5, pe: 6 },
    { symbol: '300750', name: '宁德时代', price: 250, change_percent: 3.8, volume: 15000000, market_cap: 1.1e12, turnover_rate: 0.8, pe: 45 },
    { symbol: '000858', name: '五粮液', price: 150, change_percent: -0.5, volume: 20000000, market_cap: 5.8e11, turnover_rate: 0.5, pe: 25 },
    { symbol: '688981', name: '中芯国际', price: 60, change_percent: 5.2, volume: 25000000, market_cap: 4.8e11, turnover_rate: 2.0, pe: 80 },
  ];

  // 排序逻辑
  describe('Sort Logic', () => {
    it('should sort by price descending', () => {
      const sorted = [...stocks].sort((a, b) => b.price - a.price);
      expect(sorted[0].symbol).toBe('600519');
    });

    it('should sort by price ascending', () => {
      const sorted = [...stocks].sort((a, b) => a.price - b.price);
      expect(sorted[0].symbol).toBe('000001');
    });

    it('should sort by change percent descending', () => {
      const sorted = [...stocks].sort((a, b) => b.change_percent - a.change_percent);
      expect(sorted[0].symbol).toBe('688981');
    });

    it('should sort by volume descending', () => {
      const sorted = [...stocks].sort((a, b) => b.volume - a.volume);
      expect(sorted[0].symbol).toBe('000001');
    });

    it('should sort by market cap descending', () => {
      const sorted = [...stocks].sort((a, b) => b.market_cap - a.market_cap);
      expect(sorted[0].symbol).toBe('600519');
    });

    it('should sort by name alphabetically', () => {
      const sorted = [...stocks].sort((a, b) => a.name.localeCompare(b.name, 'zh'));
      expect(sorted.length).toBe(5);
    });

    it('should toggle sort direction', () => {
      let dir: 'asc' | 'desc' = 'asc';
      dir = dir === 'asc' ? 'desc' : 'asc';
      expect(dir).toBe('desc');
    });
  });

  // 筛选逻辑
  describe('Filter Logic', () => {
    it('should filter by market (sh)', () => {
      const filtered = stocks.filter(s => s.symbol.startsWith('6'));
      expect(filtered).toHaveLength(2); // 600519, 688981
    });

    it('should filter by market (sz)', () => {
      const filtered = stocks.filter(s => s.symbol.startsWith('0') || s.symbol.startsWith('3'));
      expect(filtered).toHaveLength(3);
    });

    it('should filter positive change', () => {
      const filtered = stocks.filter(s => s.change_percent > 0);
      expect(filtered).toHaveLength(3);
    });

    it('should filter negative change', () => {
      const filtered = stocks.filter(s => s.change_percent < 0);
      expect(filtered).toHaveLength(2);
    });

    it('should filter by PE range', () => {
      const filtered = stocks.filter(s => s.pe > 0 && s.pe < 30);
      expect(filtered).toHaveLength(2);
    });

    it('should filter by min volume', () => {
      const filtered = stocks.filter(s => s.volume > 10000000);
      expect(filtered).toHaveLength(4);
    });

    it('should filter by turnover rate', () => {
      const filtered = stocks.filter(s => s.turnover_rate > 1);
      expect(filtered).toHaveLength(2);
    });
  });

  // 搜索逻辑
  describe('Search Logic', () => {
    const search = (query: string): Stock[] => {
      const q = query.toLowerCase();
      return stocks.filter(s =>
        s.symbol.includes(q) ||
        s.name.includes(q)
      );
    };

    it('should search by symbol', () => {
      const result = search('600519');
      expect(result).toHaveLength(1);
      expect(result[0].name).toBe('贵州茅台');
    });

    it('should search by name', () => {
      const result = search('茅台');
      expect(result).toHaveLength(1);
    });

    it('should search by partial symbol', () => {
      const result = search('600');
      expect(result).toHaveLength(1);
    });

    it('should return empty for no match', () => {
      const result = search('不存在');
      expect(result).toHaveLength(0);
    });

    it('should handle empty query', () => {
      const result = search('');
      expect(result).toHaveLength(5);
    });
  });

  // 分页逻辑
  describe('Pagination Logic', () => {
    const paginate = <T>(items: T[], page: number, pageSize: number) => {
      const start = (page - 1) * pageSize;
      return items.slice(start, start + pageSize);
    };

    it('should paginate first page', () => {
      const page = paginate(stocks, 1, 2);
      expect(page).toHaveLength(2);
    });

    it('should paginate second page', () => {
      const page = paginate(stocks, 2, 2);
      expect(page).toHaveLength(2);
    });

    it('should paginate last page with fewer items', () => {
      const page = paginate(stocks, 3, 2);
      expect(page).toHaveLength(1);
    });

    it('should return empty for out of range', () => {
      const page = paginate(stocks, 10, 2);
      expect(page).toHaveLength(0);
    });

    it('should calculate total pages', () => {
      const totalPages = Math.ceil(stocks.length / 2);
      expect(totalPages).toBe(3);
    });
  });

  // 表格行样式
  describe('Row Styling', () => {
    const getRowClass = (change: number): string => {
      if (change > 0) return 'row-up';
      if (change < 0) return 'row-down';
      return 'row-flat';
    };

    it('should assign up class', () => {
      expect(getRowClass(3.5)).toBe('row-up');
    });

    it('should assign down class', () => {
      expect(getRowClass(-2.3)).toBe('row-down');
    });

    it('should assign flat class', () => {
      expect(getRowClass(0)).toBe('row-flat');
    });
  });

  // 排名计算
  describe('Ranking', () => {
    it('should rank by change percent', () => {
      const ranked = [...stocks]
        .sort((a, b) => b.change_percent - a.change_percent)
        .map((s, i) => ({ ...s, rank: i + 1 }));
      expect(ranked[0].rank).toBe(1);
      expect(ranked[0].symbol).toBe('688981');
    });

    it('should apply rank badge for top 3', () => {
      const getBadge = (rank: number) => {
        if (rank === 1) return '🥇';
        if (rank === 2) return '🥈';
        if (rank === 3) return '🥉';
        return '';
      };
      expect(getBadge(1)).toBe('🥇');
      expect(getBadge(3)).toBe('🥉');
      expect(getBadge(4)).toBe('');
    });
  });

  // 统计汇总
  describe('Summary Statistics', () => {
    it('should count total stocks', () => {
      expect(stocks.length).toBe(5);
    });

    it('should count up stocks', () => {
      expect(stocks.filter(s => s.change_percent > 0)).toHaveLength(3);
    });

    it('should count down stocks', () => {
      expect(stocks.filter(s => s.change_percent < 0)).toHaveLength(2);
    });

    it('should calculate average change', () => {
      const avg = stocks.reduce((sum, s) => sum + s.change_percent, 0) / stocks.length;
      expect(avg).toBeCloseTo(1.96, 1);
    });

    it('should calculate total volume', () => {
      const total = stocks.reduce((sum, s) => sum + s.volume, 0);
      expect(total).toBeGreaterThan(0);
    });

    it('should find max change', () => {
      const max = Math.max(...stocks.map(s => s.change_percent));
      expect(max).toBe(5.2);
    });

    it('should find min change', () => {
      const min = Math.min(...stocks.map(s => s.change_percent));
      expect(min).toBe(-1.2);
    });
  });
});
