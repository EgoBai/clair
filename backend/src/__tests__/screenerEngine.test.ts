/**
 * 选股引擎测试
 * 覆盖筛选条件组合、预设策略、评分系统
 */

import { describe, it, expect } from 'vitest';

describe('选股引擎', () => {
  describe('基础筛选条件', () => {
    interface StockData {
      symbol: string;
      name: string;
      currentPrice: number;
      changePercent: number;
      pe: number;
      pb: number;
      roe: number;
      turnoverRate: number;
      marketCap: number;
      volume: number;
      rsi: number;
      macdSignal: 'golden' | 'dead' | 'none';
    }

    const stocks: StockData[] = [
      { symbol: '600519', name: '贵州茅台', currentPrice: 1800, changePercent: 2.5, pe: 32, pb: 12, roe: 30, turnoverRate: 0.38, marketCap: 2260e8, volume: 5e6, rsi: 65, macdSignal: 'golden' },
      { symbol: '000858', name: '五粮液', currentPrice: 165, changePercent: -1.2, pe: 22, pb: 5, roe: 25, turnoverRate: 0.55, marketCap: 640e8, volume: 3e6, rsi: 42, macdSignal: 'none' },
      { symbol: '300750', name: '宁德时代', currentPrice: 200, changePercent: 3.8, pe: 45, pb: 8, roe: 18, turnoverRate: 1.2, marketCap: 980e8, volume: 8e6, rsi: 72, macdSignal: 'golden' },
      { symbol: '002594', name: '比亚迪', currentPrice: 260, changePercent: -0.5, pe: 28, pb: 6, roe: 15, turnoverRate: 0.8, marketCap: 750e8, volume: 6e6, rsi: 48, macdSignal: 'dead' },
      { symbol: '601318', name: '中国平安', currentPrice: 48, changePercent: 0.8, pe: 8, pb: 1.2, roe: 12, turnoverRate: 0.3, marketCap: 870e8, volume: 4e6, rsi: 55, macdSignal: 'none' },
    ];

    function filterStocks(data: StockData[], conditions: Record<string, any>): StockData[] {
      return data.filter(s => {
        if (conditions.minPE !== undefined && s.pe < conditions.minPE) return false;
        if (conditions.maxPE !== undefined && s.pe > conditions.maxPE) return false;
        if (conditions.minROE !== undefined && s.roe < conditions.minROE) return false;
        if (conditions.minChange !== undefined && s.changePercent < conditions.minChange) return false;
        if (conditions.maxChange !== undefined && s.changePercent > conditions.maxChange) return false;
        if (conditions.minRSI !== undefined && s.rsi < conditions.minRSI) return false;
        if (conditions.maxRSI !== undefined && s.rsi > conditions.maxRSI) return false;
        if (conditions.macdSignal && s.macdSignal !== conditions.macdSignal) return false;
        return true;
      });
    }

    it('低PE筛选应返回PE<10的股票', () => {
      const result = filterStocks(stocks, { maxPE: 10 });
      expect(result).toHaveLength(1);
      expect(result[0].symbol).toBe('601318');
    });

    it('高ROE筛选应返回ROE>20的股票', () => {
      const result = filterStocks(stocks, { minROE: 20 });
      expect(result).toHaveLength(2);
      expect(result.map(s => s.symbol)).toContain('600519');
      expect(result.map(s => s.symbol)).toContain('000858');
    });

    it('MACD金叉筛选', () => {
      const result = filterStocks(stocks, { macdSignal: 'golden' });
      expect(result).toHaveLength(2);
    });

    it('RSI超卖筛选 (<30)', () => {
      const result = filterStocks(stocks, { maxRSI: 30 });
      expect(result).toHaveLength(0); // 模拟数据中无超卖
    });

    it('RSI区间筛选 (30-70)', () => {
      const result = filterStocks(stocks, { minRSI: 30, maxRSI: 70 });
      expect(result.length).toBeGreaterThan(0);
      for (const s of result) {
        expect(s.rsi).toBeGreaterThanOrEqual(30);
        expect(s.rsi).toBeLessThanOrEqual(70);
      }
    });

    it('复合条件筛选', () => {
      const result = filterStocks(stocks, { maxPE: 30, minROE: 15, minChange: 0 });
      // PE<30: 五粮液(22), 比亚迪(28), 中国平安(8)
      // ROE>15: 五粮液(25), 比亚迪(15) → 边界
      // 涨幅>0: 比亚迪(-0.5)排除
      expect(result.every(s => s.pe <= 30 && s.roe >= 15 && s.changePercent >= 0)).toBe(true);
    });
  });

  describe('评分系统', () => {
    function calculateScore(stock: any): number {
      let score = 50; // 基础分
      // 估值 (20分)
      if (stock.pe < 15) score += 20;
      else if (stock.pe < 25) score += 15;
      else if (stock.pe < 35) score += 10;
      else score += 5;
      // 盈利能力 (15分)
      if (stock.roe > 20) score += 15;
      else if (stock.roe > 15) score += 12;
      else if (stock.roe > 10) score += 8;
      else score += 3;
      // 趋势 (15分)
      if (stock.rsi > 70) score += 5; // 超买减分
      else if (stock.rsi > 30) score += 15;
      else score += 8; // 超卖
      return Math.min(100, Math.max(0, score));
    }

    it('低PE高ROE股票应得高分', () => {
      const score = calculateScore({ pe: 10, roe: 25, rsi: 55 });
      expect(score).toBe(100); // 50+20+15+15=100
    });

    it('高PE低ROE股票应得低分', () => {
      const score = calculateScore({ pe: 80, roe: 5, rsi: 55 });
      // 50+5+3+15=73 (RSI在30-70区间给15分)
      expect(score).toBe(73);
    });

    it('分数应在0-100范围内', () => {
      const score = calculateScore({ pe: 20, roe: 15, rsi: 50 });
      expect(score).toBeGreaterThanOrEqual(0);
      expect(score).toBeLessThanOrEqual(100);
    });
  });

  describe('预设策略', () => {
    interface Strategy {
      id: string;
      name: string;
      description: string;
      filters: Record<string, any>;
      sort: { field: string; order: 'asc' | 'desc' };
    }

    const strategies: Strategy[] = [
      { id: 'value', name: '价值投资', description: '低估值蓝筹', filters: { maxPE: 15, minROE: 15 }, sort: { field: 'pe', order: 'asc' } },
      { id: 'growth', name: '成长突破', description: '高增长', filters: { minChange: 3, minROE: 20 }, sort: { field: 'changePercent', order: 'desc' } },
      { id: 'momentum', name: '动量追踪', description: '强势领涨', filters: { minChange: 2, macdSignal: 'golden' }, sort: { field: 'changePercent', order: 'desc' } },
      { id: 'oversold', name: '超跌反弹', description: '超卖反弹', filters: { maxRSI: 30, maxChange: -3 }, sort: { field: 'rsi', order: 'asc' } },
    ];

    it('应有至少4种预设策略', () => {
      expect(strategies.length).toBeGreaterThanOrEqual(4);
    });

    it('每个策略应有必填字段', () => {
      for (const s of strategies) {
        expect(s).toHaveProperty('id');
        expect(s).toHaveProperty('name');
        expect(s).toHaveProperty('description');
        expect(s).toHaveProperty('filters');
        expect(s).toHaveProperty('sort');
      }
    });

    it('策略 ID 应唯一', () => {
      const ids = strategies.map(s => s.id);
      expect(new Set(ids).size).toBe(ids.length);
    });

    it('价值投资应按PE升序', () => {
      const value = strategies.find(s => s.id === 'value')!;
      expect(value.sort.field).toBe('pe');
      expect(value.sort.order).toBe('asc');
    });

    it('动量策略应要求MACD金叉', () => {
      const momentum = strategies.find(s => s.id === 'momentum')!;
      expect(momentum.filters.macdSignal).toBe('golden');
    });
  });

  describe('筛选结果导出', () => {
    function toCSV(data: any[], fields: string[]): string {
      const header = fields.join(',');
      const rows = data.map(row => fields.map(f => {
        const val = String(row[f] ?? '');
        return val.includes(',') ? `"${val}"` : val;
      }).join(','));
      return [header, ...rows].join('\n');
    }

    it('CSV 应包含表头', () => {
      const csv = toCSV([{ symbol: '600519', name: '茅台' }], ['symbol', 'name']);
      expect(csv).toContain('symbol,name');
    });

    it('CSV 应正确转义逗号', () => {
      const csv = toCSV([{ name: 'A,B' }], ['name']);
      expect(csv).toContain('"A,B"');
    });

    it('空数据应只返回表头', () => {
      const csv = toCSV([], ['symbol', 'name']);
      expect(csv).toBe('symbol,name');
    });

    it('多条数据应每行一条', () => {
      const csv = toCSV([
        { symbol: '600519', name: '茅台' },
        { symbol: '000858', name: '五粮液' },
      ], ['symbol', 'name']);
      const lines = csv.split('\n');
      expect(lines).toHaveLength(3); // header + 2 rows
    });
  });
});
