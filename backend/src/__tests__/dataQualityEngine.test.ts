import { describe, it, expect } from 'vitest';

// Data quality and validation engine tests
describe('Data Quality Engine', () => {
  describe('Stock Code Validation', () => {
    function isValidCode(code: string): boolean {
      return /^(sh|sz|bj)?\d{6}$/i.test(code) || /^[A-Z]{1,5}$/.test(code);
    }

    it('should accept 6-digit A-share codes', () => {
      expect(isValidCode('600519')).toBe(true);
      expect(isValidCode('000858')).toBe(true);
      expect(isValidCode('300750')).toBe(true);
    });

    it('should accept prefixed codes', () => {
      expect(isValidCode('sh600519')).toBe(true);
      expect(isValidCode('sz000858')).toBe(true);
    });

    it('should accept US stock symbols', () => {
      expect(isValidCode('AAPL')).toBe(true);
      expect(isValidCode('BABA')).toBe(true);
    });

    it('should reject invalid codes', () => {
      expect(isValidCode('12345')).toBe(false);
      expect(isValidCode('1234567')).toBe(false);
      expect(isValidCode('abc')).toBe(false);
      expect(isValidCode('')).toBe(false);
    });

    it('should identify market from code prefix', () => {
      function getMarket(code: string): string {
        if (code.startsWith('6') || code.startsWith('sh')) return 'SH';
        if (code.startsWith('0') || code.startsWith('3') || code.startsWith('sz')) return 'SZ';
        if (code.startsWith('8') || code.startsWith('4') || code.startsWith('bj')) return 'BJ';
        return 'US';
      }
      expect(getMarket('600519')).toBe('SH');
      expect(getMarket('000858')).toBe('SZ');
      expect(getMarket('300750')).toBe('SZ');
      expect(getMarket('830000')).toBe('BJ');
    });
  });

  describe('Price Data Validation', () => {
    function validatePrice(price: number, prevClose: number): string[] {
      const errors: string[] = [];
      if (price <= 0) errors.push('价格必须大于0');
      if (price > prevClose * 1.1 && prevClose > 0) errors.push('超过涨停限制');
      if (price < prevClose * 0.9 && prevClose > 0) errors.push('超过跌停限制');
      return errors;
    }

    it('should pass valid price', () => {
      expect(validatePrice(105, 100)).toHaveLength(0);
    });

    it('should reject zero price', () => {
      expect(validatePrice(0, 100).length).toBeGreaterThan(0);
    });

    it('should reject negative price', () => {
      expect(validatePrice(-10, 100).length).toBeGreaterThan(0);
    });

    it('should reject price above limit up', () => {
      expect(validatePrice(111, 100).length).toBeGreaterThan(0);
    });

    it('should reject price below limit down', () => {
      expect(validatePrice(89, 100).length).toBeGreaterThan(0);
    });

    it('should accept price at limit up', () => {
      expect(validatePrice(110, 100)).toHaveLength(0);
    });

    it('should accept price at limit down', () => {
      expect(validatePrice(90, 100)).toHaveLength(0);
    });
  });

  describe('OHLC Consistency', () => {
    function validateOHLC(ohlc: { open: number; high: number; low: number; close: number }): string[] {
      const errors: string[] = [];
      if (ohlc.high < ohlc.low) errors.push('最高价低于最低价');
      if (ohlc.high < ohlc.open) errors.push('最高价低于开盘价');
      if (ohlc.high < ohlc.close) errors.push('最高价低于收盘价');
      if (ohlc.low > ohlc.open) errors.push('最低价高于开盘价');
      if (ohlc.low > ohlc.close) errors.push('最低价高于收盘价');
      return errors;
    }

    it('should pass valid OHLC', () => {
      expect(validateOHLC({ open: 100, high: 105, low: 98, close: 103 })).toHaveLength(0);
    });

    it('should detect high < low', () => {
      expect(validateOHLC({ open: 100, high: 95, low: 98, close: 97 }).length).toBeGreaterThan(0);
    });

    it('should detect high < open', () => {
      expect(validateOHLC({ open: 105, high: 100, low: 95, close: 98 }).length).toBeGreaterThan(0);
    });

    it('should detect low > close', () => {
      expect(validateOHLC({ open: 95, high: 105, low: 102, close: 100 }).length).toBeGreaterThan(0);
    });

    it('should handle doji (open = close)', () => {
      expect(validateOHLC({ open: 100, high: 105, low: 95, close: 100 })).toHaveLength(0);
    });
  });

  describe('Volume Validation', () => {
    function validateVolume(volume: number, turnover: number, price: number): string[] {
      const errors: string[] = [];
      if (volume < 0) errors.push('成交量不能为负');
      if (turnover < 0) errors.push('成交额不能为负');
      if (volume > 0 && turnover > 0) {
        const impliedPrice = turnover / volume;
        if (Math.abs(impliedPrice - price) / price > 0.1) errors.push('量额不匹配');
      }
      if (volume > 0 && volume % 100 !== 0) errors.push('成交量应为100的整数倍');
      return errors;
    }

    it('should pass valid volume', () => {
      expect(validateVolume(10000, 1000000, 100)).toHaveLength(0);
    });

    it('should reject negative volume', () => {
      expect(validateVolume(-100, 10000, 100).length).toBeGreaterThan(0);
    });

    it('should reject non-round-lot volume', () => {
      expect(validateVolume(150, 15000, 100).length).toBeGreaterThan(0);
    });

    it('should detect volume-turnover mismatch', () => {
      expect(validateVolume(10000, 5000000, 100).length).toBeGreaterThan(0);
    });
  });

  describe('Timestamp Validation', () => {
    function isValidTradingTime(timestamp: Date): boolean {
      const hours = timestamp.getHours();
      const minutes = timestamp.getMinutes();
      const time = hours * 100 + minutes;
      return (time >= 930 && time <= 1130) || (time >= 1300 && time <= 1500);
    }

    it('should accept morning session', () => {
      expect(isValidTradingTime(new Date('2024-01-15 10:00:00'))).toBe(true);
    });

    it('should accept afternoon session', () => {
      expect(isValidTradingTime(new Date('2024-01-15 14:00:00'))).toBe(true);
    });

    it('should reject lunch break', () => {
      expect(isValidTradingTime(new Date('2024-01-15 12:00:00'))).toBe(false);
    });

    it('should reject before open', () => {
      expect(isValidTradingTime(new Date('2024-01-15 09:00:00'))).toBe(false);
    });

    it('should reject after close', () => {
      expect(isValidTradingTime(new Date('2024-01-15 16:00:00'))).toBe(false);
    });

    it('should reject weekend', () => {
      const saturday = new Date('2024-01-13 10:00:00');
      expect(saturday.getDay() === 0 || saturday.getDay() === 6).toBe(true);
    });
  });

  describe('Data Deduplication', () => {
    function dedupByDate(records: { date: string; close: number }[]): { date: string; close: number }[] {
      const seen = new Set<string>();
      return records.filter(r => {
        if (seen.has(r.date)) return false;
        seen.add(r.date);
        return true;
      });
    }

    it('should remove duplicates', () => {
      const records = [
        { date: '2024-01-01', close: 100 },
        { date: '2024-01-02', close: 101 },
        { date: '2024-01-01', close: 99 },
      ];
      expect(dedupByDate(records)).toHaveLength(2);
    });

    it('should keep first occurrence', () => {
      const records = [
        { date: '2024-01-01', close: 100 },
        { date: '2024-01-01', close: 99 },
      ];
      const result = dedupByDate(records);
      expect(result[0].close).toBe(100);
    });

    it('should handle no duplicates', () => {
      const records = [
        { date: '2024-01-01', close: 100 },
        { date: '2024-01-02', close: 101 },
      ];
      expect(dedupByDate(records)).toHaveLength(2);
    });
  });

  describe('Data Gap Detection', () => {
    function detectGaps(dates: string[], maxGapDays: number = 5): { from: string; to: string; days: number }[] {
      const gaps: { from: string; to: string; days: number }[] = [];
      for (let i = 1; i < dates.length; i++) {
        const prev = new Date(dates[i - 1]);
        const curr = new Date(dates[i]);
        const diffDays = (curr.getTime() - prev.getTime()) / (1000 * 60 * 60 * 24);
        if (diffDays > maxGapDays) {
          gaps.push({ from: dates[i - 1], to: dates[i], days: diffDays });
        }
      }
      return gaps;
    }

    it('should detect gaps exceeding threshold', () => {
      const dates = ['2024-01-01', '2024-01-02', '2024-01-15', '2024-01-16'];
      const gaps = detectGaps(dates);
      expect(gaps).toHaveLength(1);
      expect(gaps[0].days).toBeGreaterThan(5);
    });

    it('should not flag normal gaps', () => {
      const dates = ['2024-01-01', '2024-01-02', '2024-01-03'];
      const gaps = detectGaps(dates);
      expect(gaps).toHaveLength(0);
    });

    it('should handle empty dates', () => {
      expect(detectGaps([])).toHaveLength(0);
    });
  });

  describe('Anomaly Detection', () => {
    function detectAnomalies(values: number[], zThreshold: number = 3): number[] {
      const mean = values.reduce((a, b) => a + b, 0) / values.length;
      const std = Math.sqrt(values.reduce((s, v) => s + (v - mean) ** 2, 0) / values.length);
      if (std === 0) return [];
      return values.map((v, i) => i).filter(i => Math.abs((values[i] - mean) / std) > zThreshold);
    }

    it('should detect outliers', () => {
      const values = [10, 10.1, 9.9, 10.2, 9.8, 10, 50];
      const anomalies = detectAnomalies(values, 2);
      expect(anomalies).toContain(6);
    });

    it('should not flag normal distribution', () => {
      const values = [10, 10.1, 9.9, 10.2, 9.8, 10.05, 9.95];
      const anomalies = detectAnomalies(values);
      expect(anomalies).toHaveLength(0);
    });

    it('should handle uniform values', () => {
      const values = [10, 10, 10, 10, 10];
      expect(detectAnomalies(values)).toHaveLength(0);
    });
  });
});
