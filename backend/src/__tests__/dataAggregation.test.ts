import { describe, it, expect } from 'vitest';

// 数据聚合逻辑测试
describe('Data Aggregation Logic', () => {
  interface DailyData {
    date: string;
    close: number;
    volume: number;
    amount: number;
    change_percent: number;
  }

  const dailyData: DailyData[] = [
    { date: '2026-03-17', close: 100, volume: 1000000, amount: 100000000, change_percent: 1.5 },
    { date: '2026-03-18', close: 102, volume: 1200000, amount: 122400000, change_percent: 2.0 },
    { date: '2026-03-19', close: 101, volume: 800000, amount: 80800000, change_percent: -0.98 },
    { date: '2026-03-20', close: 103, volume: 1500000, amount: 154500000, change_percent: 1.98 },
    { date: '2026-03-21', close: 105, volume: 2000000, amount: 210000000, change_percent: 1.94 },
  ];

  // 周聚合
  describe('Weekly Aggregation', () => {
    it('should aggregate weekly close (last)', () => {
      const weekClose = dailyData[dailyData.length - 1].close;
      expect(weekClose).toBe(105);
    });

    it('should aggregate weekly high', () => {
      const weekHigh = Math.max(...dailyData.map(d => d.close));
      expect(weekHigh).toBe(105);
    });

    it('should aggregate weekly low', () => {
      const weekLow = Math.min(...dailyData.map(d => d.close));
      expect(weekLow).toBe(100);
    });

    it('should aggregate weekly volume', () => {
      const weekVolume = dailyData.reduce((sum, d) => sum + d.volume, 0);
      expect(weekVolume).toBe(6500000);
    });

    it('should aggregate weekly amount', () => {
      const weekAmount = dailyData.reduce((sum, d) => sum + d.amount, 0);
      expect(weekAmount).toBe(667700000);
    });

    it('should calculate weekly return', () => {
      const first = dailyData[0].close;
      const last = dailyData[dailyData.length - 1].close;
      const weeklyReturn = ((last - first) / first) * 100;
      expect(weeklyReturn).toBeCloseTo(5, 0);
    });
  });

  // 均值计算
  describe('Average Calculation', () => {
    it('should calculate average close', () => {
      const avg = dailyData.reduce((sum, d) => sum + d.close, 0) / dailyData.length;
      expect(avg).toBeCloseTo(102.2, 0);
    });

    it('should calculate average volume', () => {
      const avg = dailyData.reduce((sum, d) => sum + d.volume, 0) / dailyData.length;
      expect(avg).toBe(1300000);
    });

    it('should calculate VWAP', () => {
      const totalAmount = dailyData.reduce((sum, d) => sum + d.amount, 0);
      const totalVolume = dailyData.reduce((sum, d) => sum + d.volume, 0);
      const vwap = totalAmount / totalVolume;
      expect(vwap).toBeGreaterThan(100);
      expect(vwap).toBeLessThan(110);
    });
  });

  // 标准差
  describe('Standard Deviation', () => {
    const calcStdDev = (values: number[]): number => {
      const avg = values.reduce((a, b) => a + b, 0) / values.length;
      const sqDiffs = values.map(v => Math.pow(v - avg, 2));
      return Math.sqrt(sqDiffs.reduce((a, b) => a + b, 0) / values.length);
    };

    it('should calculate std dev for prices', () => {
      const prices = dailyData.map(d => d.close);
      const std = calcStdDev(prices);
      expect(std).toBeGreaterThan(0);
    });

    it('should return 0 for identical values', () => {
      expect(calcStdDev([100, 100, 100, 100, 100])).toBe(0);
    });

    it('should return higher std for more spread data', () => {
      const low = calcStdDev([100, 101, 102]);
      const high = calcStdDev([90, 100, 110]);
      expect(high).toBeGreaterThan(low);
    });
  });

  // 累计收益
  describe('Cumulative Returns', () => {
    it('should calculate cumulative return', () => {
      const returns = dailyData.map(d => d.change_percent / 100);
      let cumulative = 1;
      returns.forEach(r => { cumulative *= (1 + r); });
      const totalReturn = (cumulative - 1) * 100;
      expect(totalReturn).toBeGreaterThan(0);
    });

    it('should calculate daily cumulative returns', () => {
      const returns = dailyData.map(d => d.change_percent / 100);
      const cumulative: number[] = [];
      let cum = 1;
      returns.forEach(r => {
        cum *= (1 + r);
        cumulative.push((cum - 1) * 100);
      });
      expect(cumulative).toHaveLength(5);
    });
  });

  // 分组聚合
  describe('Group Aggregation', () => {
    const records = [
      { sector: '白酒', change: 2.5, volume: 1000 },
      { sector: '白酒', change: 1.5, volume: 2000 },
      { sector: '医药', change: -1.0, volume: 1500 },
      { sector: '医药', change: 0.5, volume: 2500 },
      { sector: '新能源', change: 3.0, volume: 3000 },
    ];

    it('should group by sector', () => {
      const groups = new Map<string, typeof records>();
      records.forEach(r => {
        if (!groups.has(r.sector)) groups.set(r.sector, []);
        groups.get(r.sector)!.push(r);
      });
      expect(groups.size).toBe(3);
    });

    it('should aggregate by sector', () => {
      const agg = new Map<string, { totalChange: number; totalVolume: number; count: number }>();
      records.forEach(r => {
        if (!agg.has(r.sector)) agg.set(r.sector, { totalChange: 0, totalVolume: 0, count: 0 });
        const g = agg.get(r.sector)!;
        g.totalChange += r.change;
        g.totalVolume += r.volume;
        g.count++;
      });
      expect(agg.get('白酒')!.count).toBe(2);
      expect(agg.get('白酒')!.totalVolume).toBe(3000);
    });

    it('should calculate sector average change', () => {
      const baijiu = records.filter(r => r.sector === '白酒');
      const avg = baijiu.reduce((s, r) => s + r.change, 0) / baijiu.length;
      expect(avg).toBe(2.0);
    });
  });

  // 时间窗口聚合
  describe('Time Window Aggregation', () => {
    it('should aggregate last N days', () => {
      const last3 = dailyData.slice(-3);
      expect(last3).toHaveLength(3);
      expect(last3[0].date).toBe('2026-03-19');
    });

    it('should aggregate rolling average', () => {
      const windowSize = 3;
      const rolling: number[] = [];
      for (let i = windowSize - 1; i < dailyData.length; i++) {
        const slice = dailyData.slice(i - windowSize + 1, i + 1);
        const avg = slice.reduce((s, d) => s + d.close, 0) / windowSize;
        rolling.push(avg);
      }
      expect(rolling).toHaveLength(3);
    });

    it('should aggregate rolling sum', () => {
      const windowSize = 3;
      const rolling: number[] = [];
      for (let i = windowSize - 1; i < dailyData.length; i++) {
        const slice = dailyData.slice(i - windowSize + 1, i + 1);
        const sum = slice.reduce((s, d) => s + d.volume, 0);
        rolling.push(sum);
      }
      expect(rolling[0]).toBe(3000000); // 1M + 1.2M + 0.8M
    });
  });

  // 数据插值
  describe('Data Interpolation', () => {
    const linearInterpolate = (x: number, x1: number, y1: number, x2: number, y2: number) => {
      return y1 + ((y2 - y1) / (x2 - x1)) * (x - x1);
    };

    it('should interpolate mid point', () => {
      expect(linearInterpolate(50, 0, 100, 100, 200)).toBe(150);
    });

    it('should return start value at start', () => {
      expect(linearInterpolate(0, 0, 100, 100, 200)).toBe(100);
    });

    it('should return end value at end', () => {
      expect(linearInterpolate(100, 0, 100, 100, 200)).toBe(200);
    });
  });
});
