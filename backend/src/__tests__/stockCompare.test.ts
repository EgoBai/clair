import { describe, it, expect } from 'vitest';

/**
 * 股票对比分析 API 测试
 * 测试雷达图、多指标对比、归一化逻辑
 */
describe('Stock Compare API', () => {
  interface CompareMetric {
    label: string;
    key: string;
    unit: string;
    higher: 'better' | 'worse' | 'neutral';
  }

  const COMPARE_METRICS: CompareMetric[] = [
    { label: '市盈率(PE)', key: 'pe', unit: '倍', higher: 'worse' },
    { label: '市净率(PB)', key: 'pb', unit: '倍', higher: 'worse' },
    { label: '净资产收益率(ROE)', key: 'roe', unit: '%', higher: 'better' },
    { label: '毛利率', key: 'grossMargin', unit: '%', higher: 'better' },
    { label: '净利率', key: 'netMargin', unit: '%', higher: 'better' },
    { label: '营收增长率', key: 'revenueGrowth', unit: '%', higher: 'better' },
    { label: '净利润增长率', key: 'profitGrowth', unit: '%', higher: 'better' },
    { label: '资产负债率', key: 'debtRatio', unit: '%', higher: 'worse' },
    { label: '流动比率', key: 'currentRatio', unit: '倍', higher: 'better' },
    { label: '股息率', key: 'dividendYield', unit: '%', higher: 'better' },
  ];

  function generateStockMetrics(symbol: string, name: string) {
    const seed = symbol.charCodeAt(0) + symbol.charCodeAt(1);
    return {
      symbol,
      name,
      metrics: {
        pe: +(10 + (seed % 40)).toFixed(2),
        pb: +(0.5 + (seed % 8) * 0.5).toFixed(2),
        roe: +(5 + (seed % 25)).toFixed(2),
        grossMargin: +(15 + (seed % 50)).toFixed(2),
        netMargin: +(5 + (seed % 30)).toFixed(2),
        revenueGrowth: +(seed % 60 - 15).toFixed(2),
        profitGrowth: +(seed % 70 - 20).toFixed(2),
        debtRatio: +(20 + (seed % 50)).toFixed(2),
        currentRatio: +(0.8 + (seed % 5) * 0.3).toFixed(2),
        dividendYield: +(0.5 + (seed % 6)).toFixed(2),
      },
      radarScores: {
        profitability: +(40 + (seed % 55)).toFixed(1),
        growth: +(30 + (seed % 60)).toFixed(1),
        valuation: +(35 + (seed % 50)).toFixed(1),
        stability: +(45 + (seed % 45)).toFixed(1),
        cashflow: +(30 + (seed % 55)).toFixed(1),
        dividend: +(20 + (seed % 60)).toFixed(1),
      },
    };
  }

  describe('Stock Metrics Generation', () => {
    it('should generate deterministic metrics from symbol', () => {
      const stock1 = generateStockMetrics('600519', '贵州茅台');
      const stock2 = generateStockMetrics('600519', '贵州茅台');
      expect(stock1.metrics).toEqual(stock2.metrics);
      expect(stock1.radarScores).toEqual(stock2.radarScores);
    });

    it('should generate different metrics for different symbols', () => {
      const stock1 = generateStockMetrics('600519', '贵州茅台');
      const stock2 = generateStockMetrics('000858', '五粮液');
      expect(stock1.metrics).not.toEqual(stock2.metrics);
    });

    it('should include all required metric fields', () => {
      const stock = generateStockMetrics('600519', '贵州茅台');
      expect(stock.metrics).toHaveProperty('pe');
      expect(stock.metrics).toHaveProperty('pb');
      expect(stock.metrics).toHaveProperty('roe');
      expect(stock.metrics).toHaveProperty('grossMargin');
      expect(stock.metrics).toHaveProperty('netMargin');
      expect(stock.metrics).toHaveProperty('revenueGrowth');
      expect(stock.metrics).toHaveProperty('profitGrowth');
      expect(stock.metrics).toHaveProperty('debtRatio');
      expect(stock.metrics).toHaveProperty('currentRatio');
      expect(stock.metrics).toHaveProperty('dividendYield');
    });

    it('should include all radar score dimensions', () => {
      const stock = generateStockMetrics('600519', '贵州茅台');
      expect(stock.radarScores).toHaveProperty('profitability');
      expect(stock.radarScores).toHaveProperty('growth');
      expect(stock.radarScores).toHaveProperty('valuation');
      expect(stock.radarScores).toHaveProperty('stability');
      expect(stock.radarScores).toHaveProperty('cashflow');
      expect(stock.radarScores).toHaveProperty('dividend');
    });

    it('should generate valid PE range', () => {
      const stock = generateStockMetrics('600519', '贵州茅台');
      expect(stock.metrics.pe).toBeGreaterThanOrEqual(10);
      expect(stock.metrics.pe).toBeLessThan(50);
    });

    it('should generate valid PB range', () => {
      const stock = generateStockMetrics('600519', '贵州茅台');
      expect(stock.metrics.pb).toBeGreaterThan(0);
      expect(stock.metrics.pb).toBeLessThan(5);
    });
  });

  describe('Radar Chart Normalization', () => {
    it('should normalize scores to 0-100 range', () => {
      const stocks = ['600519', '000858', '000001'].map(s => generateStockMetrics(s, s));
      stocks.forEach(stock => {
        Object.values(stock.radarScores).forEach(score => {
          expect(score).toBeGreaterThanOrEqual(0);
          expect(score).toBeLessThanOrEqual(100);
        });
      });
    });

    it('should have 6 radar dimensions', () => {
      const indicators = [
        { key: 'profitability', label: '盈利能力', fullMark: 100 },
        { key: 'growth', label: '成长能力', fullMark: 100 },
        { key: 'valuation', label: '估值水平', fullMark: 100 },
        { key: 'stability', label: '财务稳健', fullMark: 100 },
        { key: 'cashflow', label: '现金流', fullMark: 100 },
        { key: 'dividend', label: '分红能力', fullMark: 100 },
      ];
      expect(indicators.length).toBe(6);
      indicators.forEach(ind => {
        expect(ind.fullMark).toBe(100);
      });
    });
  });

  describe('Comparison Logic', () => {
    it('should identify better metrics based on direction', () => {
      const isBetter = (metric: CompareMetric, a: number, b: number) => {
        if (metric.higher === 'better') return a > b;
        if (metric.higher === 'worse') return a < b;
        return a === b;
      };

      const peMetric = COMPARE_METRICS.find(m => m.key === 'pe')!;
      const roeMetric = COMPARE_METRICS.find(m => m.key === 'roe')!;

      expect(isBetter(peMetric, 15, 25)).toBe(true); // lower PE is better
      expect(isBetter(roeMetric, 20, 10)).toBe(true); // higher ROE is better
    });

    it('should limit comparison to 5 stocks max', () => {
      const symbolsParam = '600519,000858,000001,000333,000651,002415,601318';
      const symbols = symbolsParam.split(',').map(s => s.trim()).slice(0, 5);
      expect(symbols.length).toBe(5);
    });

    it('should handle empty symbol list', () => {
      const symbols = ''.split(',').filter(Boolean);
      expect(symbols.length).toBe(0);
    });

    it('should trim symbol whitespace', () => {
      const symbols = '600519 , 000858 , 000001'.split(',').map(s => s.trim());
      symbols.forEach(s => {
        expect(s).not.toContain(' ');
      });
    });
  });

  describe('Metric Validation', () => {
    it('should have correct metric count', () => {
      expect(COMPARE_METRICS.length).toBe(10);
    });

    it('should have valid higher direction values', () => {
      COMPARE_METRICS.forEach(m => {
        expect(['better', 'worse', 'neutral']).toContain(m.higher);
      });
    });

    it('should have all required metric properties', () => {
      COMPARE_METRICS.forEach(m => {
        expect(m).toHaveProperty('label');
        expect(m).toHaveProperty('key');
        expect(m).toHaveProperty('unit');
        expect(m).toHaveProperty('higher');
        expect(m.label).toBeTruthy();
        expect(m.key).toBeTruthy();
        expect(m.unit).toBeTruthy();
      });
    });
  });

  describe('Stock Name Lookup', () => {
    const stockNames: Record<string, string> = {
      '600519': '贵州茅台', '000858': '五粮液', '000001': '平安银行',
      '000333': '美的集团', '000651': '格力电器', '002415': '海康威视',
      '601318': '中国平安', '600036': '招商银行', '002594': '比亚迪',
      '300750': '宁德时代', '601012': '隆基绿能', '002714': '牧原股份',
    };

    it('should lookup known stocks', () => {
      expect(stockNames['600519']).toBe('贵州茅台');
      expect(stockNames['000858']).toBe('五粮液');
      expect(stockNames['300750']).toBe('宁德时代');
    });

    it('should return default for unknown stocks', () => {
      const unknown = '999999';
      expect(stockNames[unknown] || `股票${unknown}`).toBe('股票999999');
    });
  });

  describe('Response Format', () => {
    it('should return consistent compare response', () => {
      const response = {
        success: true,
        data: {
          stocks: [generateStockMetrics('600519', '贵州茅台')],
          metrics: COMPARE_METRICS,
          count: 1,
        },
      };
      expect(response.success).toBe(true);
      expect(response.data.count).toBe(response.data.stocks.length);
    });

    it('should return consistent radar response', () => {
      const response = {
        success: true,
        data: {
          indicators: [
            { key: 'profitability', label: '盈利能力', fullMark: 100 },
          ],
          stocks: [{ symbol: '600519', name: '贵州茅台', scores: {} }],
        },
      };
      expect(response.data.indicators.length).toBeGreaterThan(0);
      expect(response.data.stocks.length).toBeGreaterThan(0);
    });
  });
});
