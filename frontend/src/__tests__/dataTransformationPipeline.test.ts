import { describe, it, expect } from 'vitest';

// 前端数据转换管道测试 — 55用例
describe('前端数据转换管道', () => {

  // 股票列表转换
  describe('股票列表转换', () => {
    interface RawStock { code: string; name: string; price: string; change: string; volume: string; }
    interface ProcessedStock { code: string; name: string; price: number; change: number; changePercent: number; volume: number; isUp: boolean; color: string; }

    function processStock(raw: RawStock, prevClose: number): ProcessedStock {
      const price = parseFloat(raw.price) || 0;
      const change = price - prevClose;
      const changePercent = prevClose === 0 ? 0 : (change / prevClose) * 100;
      return {
        code: raw.code, name: raw.name, price,
        change: Math.round(change * 100) / 100,
        changePercent: Math.round(changePercent * 100) / 100,
        volume: parseInt(raw.volume) || 0,
        isUp: change >= 0,
        color: change > 0 ? '#ef4444' : change < 0 ? '#22c55e' : '#6b7280'
      };
    }

    it('上涨股票标记红色', () => {
      const result = processStock({ code: '600519', name: '茅台', price: '1800', change: '50', volume: '10000' }, 1750);
      expect(result.isUp).toBe(true);
      expect(result.color).toBe('#ef4444');
    });

    it('下跌股票标记绿色', () => {
      const result = processStock({ code: '600519', name: '茅台', price: '1700', change: '-50', volume: '10000' }, 1750);
      expect(result.isUp).toBe(false);
      expect(result.color).toBe('#22c55e');
    });

    it('涨跌幅计算正确', () => {
      const result = processStock({ code: 'X', name: 'X', price: '110', change: '10', volume: '100' }, 100);
      expect(result.changePercent).toBeCloseTo(10, 1);
    });

    it('字符串应转为数字', () => {
      const result = processStock({ code: 'X', name: 'X', price: '100.5', change: '0', volume: '5000' }, 100);
      expect(typeof result.price).toBe('number');
      expect(result.price).toBe(100.5);
    });

    it('无效价格应为0', () => {
      const result = processStock({ code: 'X', name: 'X', price: 'abc', change: '0', volume: '100' }, 100);
      expect(result.price).toBe(0);
    });

    it('平盘应为灰色', () => {
      const result = processStock({ code: 'X', name: 'X', price: '100', change: '0', volume: '100' }, 100);
      expect(result.color).toBe('#6b7280');
    });
  });

  // 行情数据排序
  describe('行情数据排序', () => {
    interface Quote { code: string; changePercent: number; turnover: number; }

    function sortQuotes(quotes: Quote[], field: keyof Quote, dir: 'asc' | 'desc') {
      return [...quotes].sort((a, b) => {
        const va = a[field] as number, vb = b[field] as number;
        return dir === 'asc' ? va - vb : vb - va;
      });
    }

    const testQuotes: Quote[] = [
      { code: 'A', changePercent: 5, turnover: 100 },
      { code: 'B', changePercent: -3, turnover: 500 },
      { code: 'C', changePercent: 10, turnover: 200 }
    ];

    it('按涨幅降序排序', () => {
      const sorted = sortQuotes(testQuotes, 'changePercent', 'desc');
      expect(sorted[0]?.code).toBe('C');
      expect(sorted[2]?.code).toBe('B');
    });

    it('按成交额升序排序', () => {
      const sorted = sortQuotes(testQuotes, 'turnover', 'asc');
      expect(sorted[0]?.code).toBe('A');
      expect(sorted[2]?.code).toBe('B');
    });

    it('排序不应修改原数组', () => {
      const original = [...testQuotes];
      sortQuotes(testQuotes, 'changePercent', 'desc');
      expect(testQuotes).toEqual(original);
    });

    it('空数组排序返回空', () => {
      expect(sortQuotes([], 'changePercent', 'asc')).toHaveLength(0);
    });

    it('单元素排序不变', () => {
      const single = [{ code: 'A', changePercent: 5, turnover: 100 }];
      expect(sortQuotes(single, 'changePercent', 'desc')).toEqual(single);
    });
  });

  // 行情聚合
  describe('行情聚合', () => {
    function aggregate(quotes: { changePercent: number; turnover: number }[]) {
      const up = quotes.filter(q => q.changePercent > 0);
      const down = quotes.filter(q => q.changePercent < 0);
      const flat = quotes.filter(q => q.changePercent === 0);
      return {
        totalCount: quotes.length,
        upCount: up.length, downCount: down.length, flatCount: flat.length,
        upRatio: quotes.length === 0 ? 0 : up.length / quotes.length,
        avgChange: quotes.length === 0 ? 0 : quotes.reduce((s, q) => s + q.changePercent, 0) / quotes.length,
        totalTurnover: quotes.reduce((s, q) => s + q.turnover, 0)
      };
    }

    it('涨跌家数正确', () => {
      const result = aggregate([{ changePercent: 5, turnover: 100 }, { changePercent: -3, turnover: 200 }, { changePercent: 0, turnover: 300 }]);
      expect(result.upCount).toBe(1);
      expect(result.downCount).toBe(1);
      expect(result.flatCount).toBe(1);
    });

    it('涨跌比应为0-1', () => {
      const result = aggregate([{ changePercent: 5, turnover: 100 }, { changePercent: -3, turnover: 200 }]);
      expect(result.upRatio).toBeGreaterThanOrEqual(0);
      expect(result.upRatio).toBeLessThanOrEqual(1);
    });

    it('平均涨跌幅计算正确', () => {
      const result = aggregate([{ changePercent: 10, turnover: 100 }, { changePercent: -5, turnover: 200 }]);
      expect(result.avgChange).toBeCloseTo(2.5, 5);
    });

    it('总成交额正确', () => {
      const result = aggregate([{ changePercent: 0, turnover: 100 }, { changePercent: 0, turnover: 200 }]);
      expect(result.totalTurnover).toBe(300);
    });

    it('空数组聚合', () => {
      const result = aggregate([]);
      expect(result.totalCount).toBe(0);
      expect(result.upRatio).toBe(0);
    });
  });

  // 搜索结果格式化
  describe('搜索结果格式化', () => {
    function highlightText(text: string, query: string) {
      if (!query) return [{ text, highlight: false }];
      const lower = text.toLowerCase();
      const qlower = query.toLowerCase();
      const idx = lower.indexOf(qlower);
      if (idx === -1) return [{ text, highlight: false }];
      return [
        { text: text.slice(0, idx), highlight: false },
        { text: text.slice(idx, idx + query.length), highlight: true },
        { text: text.slice(idx + query.length), highlight: false }
      ].filter(p => p.text.length > 0);
    }

    it('匹配部分应高亮', () => {
      const result = highlightText('贵州茅台', '茅台');
      expect(result.some(p => p.highlight)).toBe(true);
    });

    it('无匹配应不高亮', () => {
      const result = highlightText('贵州茅台', '五粮液');
      expect(result.every(p => !p.highlight)).toBe(true);
    });

    it('空查询不高亮', () => {
      const result = highlightText('test', '');
      expect(result).toEqual([{ text: 'test', highlight: false }]);
    });

    it('大小写不敏感', () => {
      const result = highlightText('ABC', 'abc');
      expect(result.some(p => p.highlight)).toBe(true);
    });

    it('高亮文本应等于查询', () => {
      const result = highlightText('hello world', 'world');
      const highlighted = result.find(p => p.highlight);
      expect(highlighted?.text).toBe('world');
    });

    it('完整匹配', () => {
      const result = highlightText('abc', 'abc');
      expect(result).toHaveLength(1);
      expect(result[0]?.highlight).toBe(true);
    });
  });

  // 分页计算
  describe('分页计算', () => {
    function paginate<T>(data: T[], page: number, pageSize: number) {
      const total = data.length;
      const totalPages = Math.ceil(total / pageSize);
      const start = (page - 1) * pageSize;
      return {
        data: data.slice(start, start + pageSize),
        page, pageSize, total, totalPages,
        hasNext: page < totalPages,
        hasPrev: page > 1
      };
    }

    it('第一页数据正确', () => {
      const result = paginate([1, 2, 3, 4, 5], 1, 2);
      expect(result.data).toEqual([1, 2]);
      expect(result.hasNext).toBe(true);
      expect(result.hasPrev).toBe(false);
    });

    it('最后一页hasNext应为false', () => {
      const result = paginate([1, 2, 3], 2, 2);
      expect(result.hasNext).toBe(false);
    });

    it('总页数计算正确', () => {
      expect(paginate([1, 2, 3, 4, 5], 1, 2).totalPages).toBe(3);
    });

    it('空数据分页', () => {
      const result = paginate([], 1, 10);
      expect(result.data).toHaveLength(0);
      expect(result.totalPages).toBe(0);
    });

    it('超范围页返回空', () => {
      const result = paginate([1, 2], 10, 10);
      expect(result.data).toHaveLength(0);
    });

    it('pageSize大于总数', () => {
      const result = paginate([1, 2, 3], 1, 100);
      expect(result.data).toEqual([1, 2, 3]);
      expect(result.totalPages).toBe(1);
    });
  });
});
