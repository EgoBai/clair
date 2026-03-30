import { describe, it, expect } from 'vitest';

// 数据质量评分测试
describe('Data Quality Scoring', () => {
  interface StockData {
    symbol: string;
    name: string;
    price: number;
    change: number;
    changePercent: number;
    volume: number;
    turnover: number;
    high: number;
    low: number;
    open: number;
    pe?: number;
    pb?: number;
    marketCap?: number;
    timestamp: number;
  }

  const scoreDataQuality = (data: StockData): { score: number; issues: string[] } => {
    const issues: string[] = [];
    let score = 100;

    if (!data.symbol || data.symbol.length < 6) { issues.push('代码格式异常'); score -= 20; }
    if (!data.name) { issues.push('名称缺失'); score -= 10; }
    if (data.price <= 0) { issues.push('价格无效'); score -= 25; }
    if (data.high < data.low) { issues.push('最高价<最低价'); score -= 25; }
    if (data.price > data.high || data.price < data.low) { issues.push('收盘价超出范围'); score -= 15; }
    if (data.open > data.high || data.open < data.low) { issues.push('开盘价超出范围'); score -= 10; }
    if (data.volume < 0) { issues.push('成交量为负'); score -= 20; }
    if (data.turnover < 0) { issues.push('成交额为负'); score -= 15; }
    if (data.volume > 0 && data.turnover > 0) {
      const impliedPrice = data.turnover / data.volume;
      if (Math.abs(impliedPrice - data.price) / data.price > 0.5) {
        issues.push('量额不匹配'); score -= 10;
      }
    }
    if (data.pe !== undefined && (data.pe < -1000 || data.pe > 1000)) { issues.push('PE异常'); score -= 5; }
    if (data.pb !== undefined && (data.pb < -100 || data.pb > 100)) { issues.push('PB异常'); score -= 5; }
    if (data.timestamp <= 0) { issues.push('时间戳无效'); score -= 10; }

    return { score: Math.max(0, score), issues };
  };

  const validData: StockData = {
    symbol: '600519', name: '贵州茅台', price: 1850, change: 15, changePercent: 0.82,
    volume: 1500000, turnover: 2775000000, high: 1860, low: 1840, open: 1845,
    pe: 35, pb: 10, marketCap: 2300000000000, timestamp: Date.now(),
  };

  describe('Valid Data', () => {
    it('should score 100 for valid data', () => {
      const result = scoreDataQuality(validData);
      expect(result.score).toBe(100);
      expect(result.issues).toHaveLength(0);
    });

    it('should handle missing optional fields', () => {
      const data = { ...validData, pe: undefined, pb: undefined, marketCap: undefined };
      const result = scoreDataQuality(data);
      expect(result.score).toBe(100);
    });
  });

  describe('Price Validation', () => {
    it('should penalize negative price', () => {
      const result = scoreDataQuality({ ...validData, price: -10 });
      expect(result.score).toBeLessThan(100);
      expect(result.issues).toContain('价格无效');
    });

    it('should penalize inverted high/low', () => {
      const result = scoreDataQuality({ ...validData, high: 1840, low: 1860 });
      expect(result.score).toBeLessThan(100);
      expect(result.issues).toContain('最高价<最低价');
    });

    it('should penalize price out of range', () => {
      const result = scoreDataQuality({ ...validData, price: 1900 });
      expect(result.issues).toContain('收盘价超出范围');
    });

    it('should penalize open out of range', () => {
      const result = scoreDataQuality({ ...validData, open: 1900 });
      expect(result.issues).toContain('开盘价超出范围');
    });
  });

  describe('Volume Validation', () => {
    it('should penalize negative volume', () => {
      const result = scoreDataQuality({ ...validData, volume: -100 });
      expect(result.issues).toContain('成交量为负');
    });

    it('should penalize negative turnover', () => {
      const result = scoreDataQuality({ ...validData, turnover: -100 });
      expect(result.issues).toContain('成交额为负');
    });

    it('should detect volume/turnover mismatch', () => {
      const result = scoreDataQuality({ ...validData, volume: 1000, turnover: 1000000000 });
      expect(result.issues).toContain('量额不匹配');
    });
  });

  describe('Financial Ratios Validation', () => {
    it('should flag extreme PE', () => {
      const result = scoreDataQuality({ ...validData, pe: 2000 });
      expect(result.issues).toContain('PE异常');
    });

    it('should flag extreme PB', () => {
      const result = scoreDataQuality({ ...validData, pb: -200 });
      expect(result.issues).toContain('PB异常');
    });

    it('should accept reasonable PE/PB', () => {
      const result = scoreDataQuality({ ...validData, pe: 25, pb: 3 });
      expect(result.score).toBe(100);
    });
  });

  describe('Multiple Issues', () => {
    it('should accumulate penalties', () => {
      const bad: StockData = {
        ...validData, symbol: '', name: '', price: -1, volume: -1, high: 1, low: 2,
      };
      const result = scoreDataQuality(bad);
      expect(result.score).toBeLessThan(50);
      expect(result.issues.length).toBeGreaterThan(3);
    });

    it('should not go below 0', () => {
      const terrible: StockData = {
        symbol: '', name: '', price: -100, change: 0, changePercent: 0,
        volume: -1, turnover: -1, high: 1, low: 2, open: -1, timestamp: -1,
      };
      const result = scoreDataQuality(terrible);
      expect(result.score).toBeGreaterThanOrEqual(0);
    });
  });

  describe('Batch Scoring', () => {
    const scoreBatch = (items: StockData[]) => {
      const scores = items.map(item => scoreDataQuality(item));
      const avgScore = scores.reduce((s, r) => s + r.score, 0) / scores.length;
      const passRate = scores.filter(r => r.score >= 80).length / scores.length;
      return { scores, avgScore, passRate };
    };

    it('should calculate average score for batch', () => {
      const result = scoreBatch([validData, validData, validData]);
      expect(result.avgScore).toBe(100);
      expect(result.passRate).toBe(1);
    });

    it('should detect failing items in batch', () => {
      const bad = { ...validData, price: -1 };
      const result = scoreBatch([validData, bad, validData]);
      expect(result.avgScore).toBeLessThan(100);
      expect(result.passRate).toBeCloseTo(0.667, 1);
    });
  });
});
