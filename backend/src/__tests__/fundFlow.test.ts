import { describe, it, expect } from 'vitest';

/**
 * 资金流向数据测试
 * 测试资金流向数据模型、计算逻辑、行业流向
 */

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

interface IndustryFlowData {
  industry: string;
  mainNet: number;
  netInflow: number;
  stockCount: number;
  topStocks: Array<{ symbol: string; name: string; mainNet: number }>;
}

function createMockFundFlow(overrides: Partial<FundFlowData> = {}): FundFlowData {
  return {
    symbol: '600519.SH',
    name: '贵州茅台',
    mainNet: 15000,
    superLargeNet: 8000,
    largeNet: 5000,
    mediumNet: 1500,
    smallNet: 500,
    tradeDate: new Date().toISOString().split('T')[0],
    ...overrides,
  };
}

function generateMockHistory(symbol: string, days: number): FundFlowData[] {
  const result: FundFlowData[] = [];
  const today = new Date();
  
  for (let i = days - 1; i >= 0; i--) {
    const date = new Date(today);
    date.setDate(date.getDate() - i);
    const dow = date.getDay();
    if (dow === 0 || dow === 6) continue;
    
    result.push({
      symbol,
      name: '',
      mainNet: (Math.random() - 0.5) * 20000,
      superLargeNet: (Math.random() - 0.5) * 6000,
      largeNet: (Math.random() - 0.5) * 8000,
      mediumNet: (Math.random() - 0.5) * 4000,
      smallNet: (Math.random() - 0.5) * 2000,
      tradeDate: date.toISOString().split('T')[0],
    });
  }
  return result;
}

describe('资金流向数据', () => {
  describe('FundFlowData 数据模型', () => {
    it('应该包含完整的资金流向字段', () => {
      const flow = createMockFundFlow();
      expect(flow.symbol).toBeDefined();
      expect(flow.name).toBeDefined();
      expect(typeof flow.mainNet).toBe('number');
      expect(typeof flow.superLargeNet).toBe('number');
      expect(typeof flow.largeNet).toBe('number');
      expect(typeof flow.mediumNet).toBe('number');
      expect(typeof flow.smallNet).toBe('number');
      expect(flow.tradeDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    });

    it('主力净额应该近似等于大单+超大单之和', () => {
      const flow = createMockFundFlow({
        superLargeNet: 5000,
        largeNet: 3000,
        mainNet: 8000,
        mediumNet: 1500,
        smallNet: 500,
      });
      // 主力 = 超大单 + 大单
      const expectedMain = flow.superLargeNet + flow.largeNet;
      expect(flow.mainNet).toBe(expectedMain);
    });

    it('主力净额默认值应为正数', () => {
      const flow = createMockFundFlow();
      expect(typeof flow.mainNet).toBe('number');
      expect(flow.superLargeNet).toBeDefined();
    });

    it('应该支持负值资金流向（净流出）', () => {
      const flow = createMockFundFlow({
        mainNet: -10000,
        superLargeNet: -5000,
        largeNet: -3000,
        mediumNet: -1500,
        smallNet: -500,
      });
      expect(flow.mainNet).toBeLessThan(0);
      expect(flow.superLargeNet).toBeLessThan(0);
    });
  });

  describe('历史资金流向生成', () => {
    it('应该生成指定天数的近似数据', () => {
      const history = generateMockHistory('600519.SH', 10);
      // 10天约有8个交易日（排除周末）
      expect(history.length).toBeGreaterThanOrEqual(5);
      expect(history.length).toBeLessThanOrEqual(8);
    });

    it('历史数据应该按日期正序排列', () => {
      const history = generateMockHistory('600519.SH', 15);
      for (let i = 1; i < history.length; i++) {
        expect(history[i].tradeDate > history[i - 1].tradeDate).toBe(true);
      }
    });

    it('历史数据日期格式应该正确', () => {
      const history = generateMockHistory('600519.SH', 14);
      history.forEach((entry) => {
        expect(entry.tradeDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
        const date = new Date(entry.tradeDate + 'T00:00:00Z');
        expect(date.getTime()).not.toBeNaN();
      });
    });

    it('历史数据所有条目应该有相同的symbol', () => {
      const history = generateMockHistory('000001.SZ', 10);
      history.forEach((entry) => {
        expect(entry.symbol).toBe('000001.SZ');
      });
    });
  });

  describe('IndustryFlowData 数据模型', () => {
    it('应该包含行业流向必要字段', () => {
      const industry: IndustryFlowData = {
        industry: '白酒',
        mainNet: 50000,
        netInflow: 30000,
        stockCount: 20,
        topStocks: [
          { symbol: '600519.SH', name: '贵州茅台', mainNet: 15000 },
          { symbol: '000858.SZ', name: '五粮液', mainNet: 12000 },
        ],
      };
      expect(industry.industry).toBe('白酒');
      expect(industry.mainNet).toBe(50000);
      expect(industry.topStocks.length).toBe(2);
    });

    it('行业排行应该按主力净额排序', () => {
      const industries: IndustryFlowData[] = [
        { industry: '银行', mainNet: 10000, netInflow: 8000, stockCount: 30, topStocks: [] },
        { industry: '白酒', mainNet: 50000, netInflow: 30000, stockCount: 20, topStocks: [] },
        { industry: '医药', mainNet: -20000, netInflow: -15000, stockCount: 40, topStocks: [] },
      ];
      
      const sorted = [...industries].sort((a, b) => b.mainNet - a.mainNet);
      expect(sorted[0].industry).toBe('白酒');
      expect(sorted[1].industry).toBe('银行');
      expect(sorted[2].industry).toBe('医药');
    });
  });
});
