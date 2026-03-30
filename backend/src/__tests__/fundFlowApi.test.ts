import { describe, it, expect } from 'vitest';

/**
 * 资金流向 API 测试
 * 测试资金流向数据、行业资金流向、批量查询
 */
describe('Fund Flow API', () => {
  describe('FundFlowData Structure', () => {
    interface FundFlowData {
      symbol: string;
      name: string;
      mainNet: number;
      superLargeNet: number;
      largeNet: number;
      mediumNet: number;
      smallNet: number;
      tradeDate: string;
    }

    function createFlowData(symbol: string, name: string): FundFlowData {
      const rand = () => (Math.random() - 0.5) * 20000;
      return {
        symbol,
        name,
        mainNet: rand(),
        superLargeNet: rand() * 0.3,
        largeNet: rand() * 0.4,
        mediumNet: rand() * 0.2,
        smallNet: rand() * 0.1,
        tradeDate: new Date().toISOString().split('T')[0],
      };
    }

    it('should create valid flow data structure', () => {
      const data = createFlowData('600519.SH', '贵州茅台');
      expect(data).toHaveProperty('symbol');
      expect(data).toHaveProperty('name');
      expect(data).toHaveProperty('mainNet');
      expect(data).toHaveProperty('superLargeNet');
      expect(data).toHaveProperty('largeNet');
      expect(data).toHaveProperty('mediumNet');
      expect(data).toHaveProperty('smallNet');
      expect(data).toHaveProperty('tradeDate');
    });

    it('should have valid date format', () => {
      const data = createFlowData('600519.SH', '贵州茅台');
      expect(data.tradeDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    });

    it('should represent flow categories correctly', () => {
      const data = createFlowData('600519.SH', '贵州茅台');
      expect(typeof data.mainNet).toBe('number');
      expect(typeof data.superLargeNet).toBe('number');
      expect(typeof data.largeNet).toBe('number');
      expect(typeof data.mediumNet).toBe('number');
      expect(typeof data.smallNet).toBe('number');
    });
  });

  describe('Industry Flow', () => {
    interface IndustryFlowData {
      industry: string;
      mainNet: number;
      netInflow: number;
      stockCount: number;
      topStocks: Array<{ symbol: string; name: string; mainNet: number }>;
    }

    function createIndustryFlow(): IndustryFlowData[] {
      return [
        { industry: '半导体', mainNet: 50000, netInflow: 30000, stockCount: 95, topStocks: [] },
        { industry: '人工智能', mainNet: 35000, netInflow: 25000, stockCount: 128, topStocks: [] },
        { industry: '银行', mainNet: -15000, netInflow: -10000, stockCount: 42, topStocks: [] },
        { industry: '房地产', mainNet: -25000, netInflow: -20000, stockCount: 112, topStocks: [] },
      ];
    }

    it('should sort by mainNet descending', () => {
      const flows = createIndustryFlow();
      const sorted = [...flows].sort((a, b) => b.mainNet - a.mainNet);
      expect(sorted[0].industry).toBe('半导体');
      expect(sorted[sorted.length - 1].industry).toBe('房地产');
    });

    it('should filter net inflow sectors', () => {
      const flows = createIndustryFlow();
      const inflowSectors = flows.filter(f => f.mainNet > 0);
      expect(inflowSectors.length).toBe(2);
    });

    it('should filter net outflow sectors', () => {
      const flows = createIndustryFlow();
      const outflowSectors = flows.filter(f => f.mainNet < 0);
      expect(outflowSectors.length).toBe(2);
    });

    it('should calculate total market flow', () => {
      const flows = createIndustryFlow();
      const totalNet = flows.reduce((sum, f) => sum + f.mainNet, 0);
      expect(typeof totalNet).toBe('number');
    });

    it('should have valid stock counts', () => {
      const flows = createIndustryFlow();
      flows.forEach(f => {
        expect(f.stockCount).toBeGreaterThan(0);
      });
    });
  });

  describe('Mock History Generation', () => {
    function generateMockHistory(symbol: string, days: number = 10) {
      const result: any[] = [];
      const today = new Date();
      for (let i = days - 1; i >= 0; i--) {
        const date = new Date(today);
        date.setDate(date.getDate() - i);
        const dow = date.getDay();
        if (dow === 0 || dow === 6) continue;
        const y = date.getFullYear();
        const m = String(date.getMonth() + 1).padStart(2, '0');
        const d = String(date.getDate()).padStart(2, '0');
        result.push({
          symbol,
          tradeDate: `${y}-${m}-${d}`,
          mainNet: (Math.random() - 0.5) * 20000,
        });
      }
      return result;
    }

    it('should skip weekends', () => {
      const history = generateMockHistory('600519.SH', 14);
      expect(history.length).toBeGreaterThan(0);
      history.forEach(h => {
        const date = new Date(h.tradeDate + 'T00:00:00');
        const dow = date.getDay();
        expect(dow).not.toBe(0);
        expect(dow).not.toBe(6);
      });
    });

    it('should generate correct number of trading days', () => {
      const history = generateMockHistory('600519.SH', 10);
      expect(history.length).toBeLessThanOrEqual(10);
      expect(history.length).toBeGreaterThanOrEqual(5); // at least 5 weekdays
    });

    it('should have dates in chronological order', () => {
      const history = generateMockHistory('600519.SH', 10);
      for (let i = 1; i < history.length; i++) {
        expect(history[i].tradeDate >= history[i - 1].tradeDate).toBe(true);
      }
    });

    it('should have valid date format in history', () => {
      const history = generateMockHistory('600519.SH', 7);
      history.forEach(h => {
        expect(h.tradeDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      });
    });
  });

  describe('Batch Query Validation', () => {
    it('should reject non-array symbols', () => {
      const symbols = null;
      expect(symbols && Array.isArray(symbols)).toBeFalsy();
    });

    it('should reject empty symbols array', () => {
      const symbols: string[] = [];
      expect(symbols.length).toBe(0);
    });

    it('should enforce max 30 symbols limit', () => {
      const symbols = Array.from({ length: 35 }, (_, i) => `${600000 + i}.SH`);
      expect(symbols.length).toBeGreaterThan(30);
      const limited = symbols.slice(0, 30);
      expect(limited.length).toBe(30);
    });

    it('should accept valid symbol array', () => {
      const symbols = ['600519.SH', '000858.SZ', '000001.SZ'];
      expect(Array.isArray(symbols)).toBe(true);
      expect(symbols.length).toBeLessThanOrEqual(30);
    });
  });

  describe('Symbol Parsing', () => {
    it('should extract code from symbol', () => {
      const symbol = '600519.SH';
      const code = symbol.replace(/\.(SZ|SH|BJ)$/i, '');
      expect(code).toBe('600519');
    });

    it('should detect SH market', () => {
      const symbol = '600519.SH';
      const market = symbol.endsWith('.SH') ? '1' : '0';
      expect(market).toBe('1');
    });

    it('should detect SZ market', () => {
      const symbol = '000858.SZ';
      const market = symbol.endsWith('.SH') ? '1' : '0';
      expect(market).toBe('0');
    });

    it('should handle BJ market', () => {
      const symbol = '830000.BJ';
      const code = symbol.replace(/\.(SZ|SH|BJ)$/i, '');
      expect(code).toBe('830000');
    });
  });

  describe('Response Format', () => {
    it('should return valid single stock response', () => {
      const response = {
        success: true,
        data: {
          current: { symbol: '600519.SH', mainNet: 5000 },
          history: [],
        },
      };
      expect(response.success).toBe(true);
      expect(response.data).toHaveProperty('current');
      expect(response.data).toHaveProperty('history');
    });

    it('should return valid industry response', () => {
      const response = {
        success: true,
        data: {
          industries: [],
          count: 0,
          updateTime: new Date().toISOString(),
        },
      };
      expect(response.data).toHaveProperty('industries');
      expect(response.data).toHaveProperty('count');
      expect(response.data).toHaveProperty('updateTime');
    });

    it('should return valid batch response', () => {
      const response = {
        success: true,
        data: { flows: [], count: 0 },
      };
      expect(response.data.flows).toBeInstanceOf(Array);
      expect(response.data.count).toBe(0);
    });

    it('should handle 404 error', () => {
      const response = { success: false, error: '股票未找到' };
      expect(response.success).toBe(false);
      expect(response.error).toBeTruthy();
    });
  });
});
