import { describe, it, expect } from 'vitest';

// 金融计算工具库测试
describe('金融计算工具库', () => {

  // 年化收益率
  describe('年化收益率', () => {
    function annualizedReturn(startValue: number, endValue: number, days: number): number {
      if (days <= 0 || startValue <= 0) return 0;
      return (Math.pow(endValue / startValue, 365 / days) - 1) * 100;
    }

    it('1年翻倍应为100%', () => {
      expect(annualizedReturn(100, 200, 365)).toBeCloseTo(100, 0);
    });

    it('半年涨10%年化应约21%', () => {
      const result = annualizedReturn(100, 110, 182);
      expect(result).toBeCloseTo(21, 0);
    });

    it('零天返回零', () => {
      expect(annualizedReturn(100, 110, 0)).toBe(0);
    });

    it('零本金返回零', () => {
      expect(annualizedReturn(0, 110, 30)).toBe(0);
    });

    it('亏损应为负值', () => {
      expect(annualizedReturn(100, 80, 180)).toBeLessThan(0);
    });

    it('1天收益率应极大', () => {
      expect(annualizedReturn(100, 110, 1)).toBeGreaterThan(1000);
    });
  });

  // 复合增长率CAGR
  describe('CAGR', () => {
    function calcCAGR(beginValue: number, endValue: number, years: number): number {
      if (years <= 0 || beginValue <= 0) return 0;
      return (Math.pow(endValue / beginValue, 1 / years) - 1) * 100;
    }

    it('3年翻倍CAGR约26%', () => {
      expect(calcCAGR(100, 200, 3)).toBeCloseTo(25.99, 0);
    });

    it('1年不变CAGR为零', () => {
      expect(calcCAGR(100, 100, 1)).toBeCloseTo(0, 5);
    });

    it('零年返回零', () => {
      expect(calcCAGR(100, 200, 0)).toBe(0);
    });

    it('负增长CAGR为负', () => {
      expect(calcCAGR(200, 100, 2)).toBeLessThan(0);
    });
  });

  // 波动率
  describe('波动率', () => {
    function calcVolatility(returns: number[]): number {
      if (returns.length < 2) return 0;
      const mean = returns.reduce((a, b) => a + b, 0) / returns.length;
      const variance = returns.reduce((s, r) => s + (r - mean) ** 2, 0) / (returns.length - 1);
      return Math.sqrt(variance);
    }

    it('恒定收益波动率为零', () => {
      expect(calcVolatility([0.01, 0.01, 0.01, 0.01])).toBeCloseTo(0, 10);
    });

    it('波动越大值越大', () => {
      const low = calcVolatility([0.01, 0.01, 0.01]);
      const high = calcVolatility([-0.1, 0.1, -0.1, 0.1]);
      expect(high).toBeGreaterThan(low);
    });

    it('单值返回零', () => {
      expect(calcVolatility([0.05])).toBe(0);
    });

    it('空数组返回零', () => {
      expect(calcVolatility([])).toBe(0);
    });

    it('波动率非负', () => {
      expect(calcVolatility([-0.05, 0.03, -0.02, 0.04])).toBeGreaterThanOrEqual(0);
    });
  });

  // Beta系数
  describe('Beta系数', () => {
    function calcBeta(stockReturns: number[], marketReturns: number[]): number {
      if (stockReturns.length !== marketReturns.length || stockReturns.length < 2) return 0;
      const n = stockReturns.length;
      const sMean = stockReturns.reduce((a, b) => a + b, 0) / n;
      const mMean = marketReturns.reduce((a, b) => a + b, 0) / n;
      let cov = 0, mVar = 0;
      for (let i = 0; i < n; i++) {
        cov += (stockReturns[i] - sMean) * (marketReturns[i] - mMean);
        mVar += (marketReturns[i] - mMean) ** 2;
      }
      return mVar === 0 ? 0 : cov / mVar;
    }

    it('完全同步Beta为1', () => {
      const r = [0.01, 0.02, -0.01, 0.03, 0.01];
      expect(calcBeta(r, r)).toBeCloseTo(1, 5);
    });

    it('放大波动Beta>1', () => {
      const market = [0.01, -0.01, 0.02, -0.02];
      const stock = market.map(r => r * 2);
      expect(calcBeta(stock, market)).toBeCloseTo(2, 5);
    });

    it('零方差市场返回零', () => {
      expect(calcBeta([0.01, 0.02], [0.01, 0.01])).toBe(0);
    });

    it('长度不匹配返回零', () => {
      expect(calcBeta([0.01], [0.01, 0.02])).toBe(0);
    });
  });

  // 收益分布统计
  describe('收益分布统计', () => {
    function returnStats(returns: number[]): { mean: number; median: number; skewness: number; kurtosis: number; min: number; max: number } {
      if (returns.length === 0) return { mean: 0, median: 0, skewness: 0, kurtosis: 0, min: 0, max: 0 };
      const sorted = [...returns].sort((a, b) => a - b);
      const n = returns.length;
      const mean = returns.reduce((a, b) => a + b, 0) / n;
      const median = n % 2 === 0 ? (sorted[n / 2 - 1] + sorted[n / 2]) / 2 : sorted[Math.floor(n / 2)];
      const variance = returns.reduce((s, r) => s + (r - mean) ** 2, 0) / n;
      const std = Math.sqrt(variance);
      const skewness = std === 0 ? 0 : returns.reduce((s, r) => s + ((r - mean) / std) ** 3, 0) / n;
      const kurtosis = std === 0 ? 0 : returns.reduce((s, r) => s + ((r - mean) / std) ** 4, 0) / n - 3;
      return { mean, median, skewness, kurtosis, min: sorted[0], max: sorted[n - 1] };
    }

    it('均值应正确', () => {
      expect(returnStats([1, 2, 3, 4, 5]).mean).toBe(3);
    });

    it('中位数应正确', () => {
      expect(returnStats([1, 2, 3, 4, 5]).median).toBe(3);
    });

    it('对称分布偏度接近零', () => {
      const stats = returnStats([-2, -1, 0, 1, 2]);
      expect(Math.abs(stats.skewness)).toBeLessThan(0.5);
    });

    it('min/max应正确', () => {
      const stats = returnStats([5, 1, 3, 2, 4]);
      expect(stats.min).toBe(1);
      expect(stats.max).toBe(5);
    });

    it('空数组返回零', () => {
      const stats = returnStats([]);
      expect(stats.mean).toBe(0);
      expect(stats.median).toBe(0);
    });

    it('单值min等于max', () => {
      const stats = returnStats([42]);
      expect(stats.min).toBe(stats.max);
    });
  });

  // 蒙特卡洛模拟简化
  describe('蒙特卡洛模拟', () => {
    function monteCarloSim(initialValue: number, annualReturn: number, annualVol: number, years: number, simulations: number): number[] {
      const results: number[] = [];
      const dt = 1 / 252;
      const drift = (annualReturn - 0.5 * annualVol ** 2) * dt;
      const diffusion = annualVol * Math.sqrt(dt);
      for (let sim = 0; sim < simulations; sim++) {
        let value = initialValue;
        for (let day = 0; day < years * 252; day++) {
          const shock = (Math.random() * 2 - 1 + Math.random() * 2 - 1 + Math.random() * 2 - 1) / 3;
          value *= Math.exp(drift + diffusion * shock);
        }
        results.push(value);
      }
      return results;
    }

    it('应返回正确数量的模拟', () => {
      expect(monteCarloSim(100, 0.1, 0.2, 1, 100)).toHaveLength(100);
    });

    it('所有结果应为正数', () => {
      const results = monteCarloSim(100, 0.1, 0.2, 1, 50);
      results.forEach(r => expect(r).toBeGreaterThan(0));
    });

    it('结果应在合理范围', () => {
      const results = monteCarloSim(100, 0.1, 0.2, 1, 50);
      results.forEach(r => {
        expect(r).toBeGreaterThan(0);
        expect(r).toBeLessThan(10000);
      });
    });

    it('零波动应接近确定性增长', () => {
      const results = monteCarloSim(100, 0.1, 0, 1, 10);
      const expected = 100 * Math.exp(0.1);
      results.forEach(r => expect(r).toBeCloseTo(expected, 0));
    });
  });
});

// 数据聚合管道
describe('数据聚合管道', () => {

  // 时间序列重采样
  describe('时间序列重采样', () => {
    interface DataPoint { time: number; value: number; }

    function resample(data: DataPoint[], intervalMs: number, method: 'last' | 'avg' | 'max' | 'min'): DataPoint[] {
      const buckets = new Map<number, number[]>();
      for (const d of data) {
        const key = Math.floor(d.time / intervalMs) * intervalMs;
        if (!buckets.has(key)) buckets.set(key, []);
        buckets.get(key)!.push(d.value);
      }
      return Array.from(buckets.entries()).sort((a, b) => a[0] - b[0]).map(([time, values]) => ({
        time,
        value: method === 'last' ? values[values.length - 1] :
               method === 'avg' ? values.reduce((a, b) => a + b, 0) / values.length :
               method === 'max' ? Math.max(...values) :
               Math.min(...values),
      }));
    }

    it('last应取最后值', () => {
      const data: DataPoint[] = [{ time: 0, value: 1 }, { time: 500, value: 2 }, { time: 1000, value: 3 }];
      expect(resample(data, 1000, 'last')[0].value).toBe(2);
    });

    it('avg应计算平均', () => {
      const data: DataPoint[] = [{ time: 0, value: 10 }, { time: 500, value: 20 }];
      expect(resample(data, 1000, 'avg')[0].value).toBe(15);
    });

    it('max应取最大值', () => {
      const data: DataPoint[] = [{ time: 0, value: 10 }, { time: 500, value: 30 }, { time: 700, value: 20 }];
      expect(resample(data, 1000, 'max')[0].value).toBe(30);
    });

    it('min应取最小值', () => {
      const data: DataPoint[] = [{ time: 0, value: 10 }, { time: 500, value: 5 }, { time: 700, value: 20 }];
      expect(resample(data, 1000, 'min')[0].value).toBe(5);
    });

    it('空数据返回空', () => {
      expect(resample([], 1000, 'avg')).toHaveLength(0);
    });

    it('应按时排序', () => {
      const data: DataPoint[] = [{ time: 5000, value: 1 }, { time: 1000, value: 2 }];
      const result = resample(data, 2000, 'last');
      expect(result[0].time).toBeLessThan(result[1].time);
    });

    it('单点不聚合', () => {
      const data: DataPoint[] = [{ time: 0, value: 42 }];
      const result = resample(data, 1000, 'avg');
      expect(result[0].value).toBe(42);
    });
  });

  // 数据交叉验证
  describe('数据交叉验证', () => {
    function crossValidate(dataA: { symbol: string; value: number }[], dataB: { symbol: string; value: number }[], tolerance: number): { matched: number; mismatched: number; missing: number } {
      const mapB = new Map(dataB.map(d => [d.symbol, d.value]));
      let matched = 0, mismatched = 0, missing = 0;
      for (const a of dataA) {
        if (!mapB.has(a.symbol)) { missing++; continue; }
        if (Math.abs(a.value - mapB.get(a.symbol)!) <= tolerance) matched++;
        else mismatched++;
      }
      return { matched, mismatched, missing };
    }

    it('完全匹配应全matched', () => {
      const a = [{ symbol: 'A', value: 100 }, { symbol: 'B', value: 200 }];
      const b = [{ symbol: 'A', value: 100 }, { symbol: 'B', value: 200 }];
      expect(crossValidate(a, b, 0.01)).toEqual({ matched: 2, mismatched: 0, missing: 0 });
    });

    it('容差内应matched', () => {
      const a = [{ symbol: 'A', value: 100.005 }];
      const b = [{ symbol: 'A', value: 100 }];
      expect(crossValidate(a, b, 0.01).matched).toBe(1);
    });

    it('容差外应mismatched', () => {
      const a = [{ symbol: 'A', value: 110 }];
      const b = [{ symbol: 'A', value: 100 }];
      expect(crossValidate(a, b, 0.01).mismatched).toBe(1);
    });

    it('缺失数据应counted', () => {
      const a = [{ symbol: 'A', value: 100 }, { symbol: 'B', value: 200 }];
      const b = [{ symbol: 'A', value: 100 }];
      expect(crossValidate(a, b, 0.01).missing).toBe(1);
    });

    it('空数据返回全零', () => {
      expect(crossValidate([], [], 1)).toEqual({ matched: 0, mismatched: 0, missing: 0 });
    });
  });

  // 数据采样策略
  describe('数据采样策略', () => {
    function stratifiedSample<T>(data: T[], keyFn: (item: T) => string, samplePerStratum: number): T[] {
      const strata = new Map<string, T[]>();
      for (const item of data) {
        const key = keyFn(item);
        if (!strata.has(key)) strata.set(key, []);
        strata.get(key)!.push(item);
      }
      const result: T[] = [];
      for (const items of strata.values()) {
        const shuffled = [...items].sort(() => Math.random() - 0.5);
        result.push(...shuffled.slice(0, samplePerStratum));
      }
      return result;
    }

    it('每层不超过指定数量', () => {
      const data = Array.from({ length: 100 }, (_, i) => ({ category: i % 5 === 0 ? 'A' : 'B', value: i }));
      const sample = stratifiedSample(data, d => d.category, 5);
      const aCount = sample.filter(s => s.category === 'A').length;
      const bCount = sample.filter(s => s.category === 'B').length;
      expect(aCount).toBeLessThanOrEqual(5);
      expect(bCount).toBeLessThanOrEqual(5);
    });

    it('空数据返回空', () => {
      expect(stratifiedSample([], (x: unknown) => String(x), 5)).toHaveLength(0);
    });

    it('单层应返回至多指定数量', () => {
      const data = Array.from({ length: 10 }, (_, i) => ({ cat: 'A', v: i }));
      expect(stratifiedSample(data, d => d.cat, 3).length).toBeLessThanOrEqual(3);
    });

    it('采样不改变原始数据', () => {
      const data = [{ cat: 'A', v: 1 }, { cat: 'A', v: 2 }];
      const original = JSON.stringify(data);
      stratifiedSample(data, d => d.cat, 1);
      expect(JSON.stringify(data)).toBe(original);
    });
  });
});
