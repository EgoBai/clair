import { describe, it, expect } from 'vitest';

/**
 * 数据管道 / ETL / 数据清洗逻辑测试
 */

describe('DataPipeline', () => {
  describe('数据清洗', () => {
    const cleanOHLC = (data: {open: number, high: number, low: number, close: number}[]) => {
      return data.filter(d => {
        if (d.high < d.low) return false;
        if (d.high < d.open || d.high < d.close) return false;
        if (d.low > d.open || d.low > d.close) return false;
        if (d.open <= 0 || d.close <= 0) return false;
        return true;
      });
    };

    it('应该过滤无效 OHLC 数据', () => {
      const data = [
        { open: 100, high: 110, low: 90, close: 105 },
        { open: 100, high: 90, low: 110, close: 105 }, // high < low
        { open: 100, high: 110, low: 90, close: 120 }, // close > high
      ];
      const cleaned = cleanOHLC(data);
      expect(cleaned).toHaveLength(1);
    });

    it('应该过滤零/负价格', () => {
      const data = [
        { open: 100, high: 110, low: 90, close: 105 },
        { open: 0, high: 10, low: 5, close: 8 },
        { open: -1, high: 10, low: 5, close: 8 },
      ];
      const cleaned = cleanOHLC(data);
      expect(cleaned).toHaveLength(1);
    });
  });

  describe('缺失值处理', () => {
    const fillForward = (data: (number | null)[]) => {
      const result = [...data];
      for (let i = 1; i < result.length; i++) {
        if (result[i] === null) {
          result[i] = result[i - 1];
        }
      }
      return result;
    };

    it('应该前值填充缺失数据', () => {
      const data = [1, 2, null, 4, null, 6];
      const filled = fillForward(data);
      expect(filled).toEqual([1, 2, 2, 4, 4, 6]);
    });

    it('连续缺失应该都填为前值', () => {
      const data = [1, null, null, 4];
      const filled = fillForward(data);
      expect(filled).toEqual([1, 1, 1, 4]);
    });
  });

  describe('异常值检测', () => {
    const detectOutliers = (data: number[], threshold: number = 3) => {
      const mean = data.reduce((a, b) => a + b) / data.length;
      const std = Math.sqrt(data.reduce((s, v) => s + (v - mean) ** 2, 0) / data.length);
      return data.map((v, i) => ({
        index: i,
        value: v,
        isOutlier: Math.abs(v - mean) > threshold * std,
      })).filter(d => d.isOutlier);
    };

    it('应该检测异常值', () => {
      const data = [1, 2, 3, 2, 1, 100, 2, 3];
      const outliers = detectOutliers(data, 2);
      expect(outliers.length).toBeGreaterThan(0);
      expect(outliers[0].value).toBe(100);
    });

    it('正常数据不应该有异常值', () => {
      const data = [1, 2, 3, 2, 1, 3, 2, 3];
      const outliers = detectOutliers(data, 2);
      expect(outliers).toHaveLength(0);
    });
  });

  describe('数据对齐', () => {
    const alignByDate = (series1: {date: string, value: number}[], series2: {date: string, value: number}[]) => {
      const map2 = new Map(series2.map(s => [s.date, s.value]));
      return series1
        .filter(s => map2.has(s.date))
        .map(s => ({ date: s.date, v1: s.value, v2: map2.get(s.date)! }));
    };

    it('应该按日期对齐两个序列', () => {
      const s1 = [
        { date: '2025-01-01', value: 100 },
        { date: '2025-01-02', value: 101 },
        { date: '2025-01-03', value: 102 },
      ];
      const s2 = [
        { date: '2025-01-02', value: 200 },
        { date: '2025-01-03', value: 201 },
        { date: '2025-01-04', value: 202 },
      ];
      const aligned = alignByDate(s1, s2);
      expect(aligned).toHaveLength(2);
      expect(aligned[0].date).toBe('2025-01-02');
    });

    it('无交集应该返回空', () => {
      const s1 = [{ date: '2025-01-01', value: 100 }];
      const s2 = [{ date: '2025-01-02', value: 200 }];
      expect(alignByDate(s1, s2)).toHaveLength(0);
    });
  });

  describe('数据重采样', () => {
    const resample = (data: {date: string, value: number}[], frequency: 'W' | 'M') => {
      const getKey = (date: string) => {
        const d = new Date(date);
        if (frequency === 'W') {
          const week = Math.ceil(d.getDate() / 7);
          return `${d.getFullYear()}-${d.getMonth() + 1}-W${week}`;
        }
        return `${d.getFullYear()}-${d.getMonth() + 1}`;
      };
      
      const groups = new Map<string, number[]>();
      data.forEach(d => {
        const key = getKey(d.date);
        if (!groups.has(key)) groups.set(key, []);
        groups.get(key)!.push(d.value);
      });
      
      return Array.from(groups.entries()).map(([key, values]) => ({
        period: key,
        avg: values.reduce((a, b) => a + b) / values.length,
        count: values.length,
      }));
    };

    it('应该按月重采样', () => {
      const data = [
        { date: '2025-01-01', value: 100 },
        { date: '2025-01-15', value: 110 },
        { date: '2025-02-01', value: 120 },
      ];
      const monthly = resample(data, 'M');
      expect(monthly).toHaveLength(2);
    });
  });
});
