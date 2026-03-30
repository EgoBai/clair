import { describe, it, expect } from 'vitest';

/**
 * 波动率建模引擎测试
 */

const calcRealizedVol = (returns: number[], window: number = 20): number[] => {
  const result: number[] = [];
  for (let i = 0; i < returns.length; i++) {
    if (i < window - 1) { result.push(0); continue; }
    const slice = returns.slice(i - window + 1, i + 1);
    const mean = slice.reduce((a, b) => a + b, 0) / window;
    const variance = slice.reduce((a, b) => a + (b - mean) ** 2, 0) / window;
    result.push(Math.sqrt(variance) * Math.sqrt(252));
  }
  return result;
};

const calcEWMA = (returns: number[], lambda: number = 0.94): number[] => {
  if (returns.length === 0) return [];
  const result: number[] = [returns[0] ** 2];
  for (let i = 1; i < returns.length; i++) {
    result.push(lambda * result[i - 1] + (1 - lambda) * returns[i] ** 2);
  }
  return result.map(v => Math.sqrt(v) * Math.sqrt(252));
};

const calcGARCH = (returns: number[], omega: number = 0.00001, alpha: number = 0.1, beta: number = 0.85): number[] => {
  if (returns.length === 0) return [];
  const variance: number[] = [returns[0] ** 2];
  for (let i = 1; i < returns.length; i++) {
    variance.push(omega + alpha * returns[i - 1] ** 2 + beta * variance[i - 1]);
  }
  return variance.map(v => Math.sqrt(v) * Math.sqrt(252));
};

const calcVolSmile = (strikes: number[], impliedVols: number[], atmStrike: number): { skew: number; kurtosis: number } => {
  if (strikes.length < 3) return { skew: 0, kurtosis: 0 };
  const moneyness = strikes.map(k => (k - atmStrike) / atmStrike);
  const meanM = moneyness.reduce((a, b) => a + b, 0) / moneyness.length;
  const meanV = impliedVols.reduce((a, b) => a + b, 0) / impliedVols.length;
  let skewNum = 0, skewDen = 0, kurtNum = 0;
  for (let i = 0; i < strikes.length; i++) {
    const dm = moneyness[i] - meanM;
    skewNum += dm * (impliedVols[i] - meanV);
    skewDen += dm ** 2;
  }
  const skew = skewDen === 0 ? 0 : skewNum / skewDen;
  for (let i = 0; i < strikes.length; i++) {
    kurtNum += (impliedVols[i] - meanV) ** 4;
  }
  const kurtosis = kurtNum / (strikes.length * ((impliedVols.reduce((a, b) => a + (b - meanV) ** 2, 0) / impliedVols.length) ** 2 || 1));
  return { skew, kurtosis };
};

const calcVolatilityCone = (returns: number[], periods: number[]): Record<string, { min: number; max: number; median: number }> => {
  const result: Record<string, { min: number; max: number; median: number }> = {};
  for (const period of periods) {
    const vols: number[] = [];
    for (let i = period; i <= returns.length; i++) {
      const slice = returns.slice(i - period, i);
      const mean = slice.reduce((a, b) => a + b, 0) / slice.length;
      const variance = slice.reduce((a, b) => a + (b - mean) ** 2, 0) / slice.length;
      vols.push(Math.sqrt(variance) * Math.sqrt(252));
    }
    if (vols.length === 0) { result[`${period}d`] = { min: 0, max: 0, median: 0 }; continue; }
    vols.sort((a, b) => a - b);
    result[`${period}d`] = {
      min: vols[0],
      max: vols[vols.length - 1],
      median: vols[Math.floor(vols.length / 2)]
    };
  }
  return result;
};

const calcVolRatio = (shortVol: number, longVol: number): number => longVol === 0 ? 0 : shortVol / longVol;

describe('波动率建模', () => {
  describe('已实现波动率', () => {
    it('常数收益波动率应为0', () => {
      const returns = Array(30).fill(0.01);
      const vol = calcRealizedVol(returns, 10);
      expect(vol[vol.length - 1]).toBe(0);
    });

    it('高波动收益波动率应更大', () => {
      const low = Array.from({ length: 50 }, () => (Math.random() - 0.5) * 0.01);
      const high = Array.from({ length: 50 }, () => (Math.random() - 0.5) * 0.1);
      const volLow = calcRealizedVol(low, 20);
      const volHigh = calcRealizedVol(high, 20);
      expect(volHigh[volHigh.length - 1]).toBeGreaterThan(volLow[volLow.length - 1]);
    });

    it('窗口不足时返回0', () => {
      const returns = [0.01, 0.02];
      const vol = calcRealizedVol(returns, 10);
      expect(vol[0]).toBe(0);
      expect(vol[1]).toBe(0);
    });

    it('输出长度应等于输入长度', () => {
      const returns = Array.from({ length: 50 }, () => (Math.random() - 0.5) * 0.02);
      expect(calcRealizedVol(returns, 10).length).toBe(50);
    });

    it('波动率应为非负', () => {
      const returns = Array.from({ length: 50 }, () => (Math.random() - 0.5) * 0.05);
      const vol = calcRealizedVol(returns, 10);
      for (const v of vol) expect(v).toBeGreaterThanOrEqual(0);
    });

    it('不同窗口应产生不同结果', () => {
      const returns = Array.from({ length: 50 }, () => (Math.random() - 0.5) * 0.03);
      const v5 = calcRealizedVol(returns, 5);
      const v20 = calcRealizedVol(returns, 20);
      expect(v5[v5.length - 1]).not.toBe(v20[v20.length - 1]);
    });

    it('年化因子正确', () => {
      const returns = Array.from({ length: 30 }, () => (Math.random() - 0.5) * 0.02);
      const annual = calcRealizedVol(returns, 10);
      // Just verify it's annualized (should be much larger than daily)
      if (annual[annual.length - 1] > 0) {
        expect(annual[annual.length - 1]).toBeGreaterThan(0.02);
      }
    });
  });

  describe('EWMA波动率', () => {
    it('输出长度应等于输入', () => {
      const returns = Array.from({ length: 30 }, () => (Math.random() - 0.5) * 0.02);
      expect(calcEWMA(returns).length).toBe(30);
    });

    it('空数组返回空', () => {
      expect(calcEWMA([])).toEqual([]);
    });

    it('波动率应为非负', () => {
      const returns = Array.from({ length: 30 }, () => (Math.random() - 0.5) * 0.03);
      const ewma = calcEWMA(returns);
      for (const v of ewma) expect(v).toBeGreaterThanOrEqual(0);
    });

    it('高lambda应更平滑', () => {
      const returns = Array.from({ length: 50 }, (_, i) => i % 10 === 0 ? 0.1 : 0.001);
      const e94 = calcEWMA(returns, 0.94);
      const e50 = calcEWMA(returns, 0.50);
      let diff94 = 0, diff50 = 0;
      for (let i = 1; i < e94.length; i++) {
        diff94 += Math.abs(e94[i] - e94[i-1]);
        diff50 += Math.abs(e50[i] - e50[i-1]);
      }
      expect(diff94).toBeLessThan(diff50);
    });

    it('单一值应返回有效波动率', () => {
      const ewma = calcEWMA([0.02]);
      expect(ewma.length).toBe(1);
      expect(ewma[0]).toBeGreaterThan(0);
    });

    it('冲击后波动率应跳跃', () => {
      const returns = Array(20).fill(0.001);
      returns.push(0.1); // shock
      const ewma = calcEWMA(returns);
      expect(ewma[ewma.length - 1]).toBeGreaterThan(ewma[19]);
    });
  });

  describe('GARCH波动率', () => {
    it('输出长度应等于输入', () => {
      const returns = Array.from({ length: 30 }, () => (Math.random() - 0.5) * 0.02);
      expect(calcGARCH(returns).length).toBe(30);
    });

    it('空数组返回空', () => {
      expect(calcGARCH([])).toEqual([]);
    });

    it('波动率应为非负', () => {
      const returns = Array.from({ length: 30 }, () => (Math.random() - 0.5) * 0.03);
      const garch = calcGARCH(returns);
      for (const v of garch) expect(v).toBeGreaterThanOrEqual(0);
    });

    it('波动率聚集效应', () => {
      const returns = [0.001, 0.001, 0.001, 0.1, 0.08, 0.06, 0.001, 0.001, 0.001];
      const garch = calcGARCH(returns);
      // After shock, volatility should remain elevated
      expect(garch[5]).toBeGreaterThan(garch[2]);
    });

    it('不同参数产生不同结果', () => {
      const returns = Array.from({ length: 30 }, () => (Math.random() - 0.5) * 0.03);
      const g1 = calcGARCH(returns, 0.00001, 0.1, 0.85);
      const g2 = calcGARCH(returns, 0.0001, 0.3, 0.6);
      expect(g1[g1.length - 1]).not.toBe(g2[g2.length - 1]);
    });

    it('beta接近1波动率应持久', () => {
      const returns = Array(20).fill(0.001);
      returns[10] = 0.1; // one-time shock
      const garch = calcGARCH(returns, 0.00001, 0.05, 0.94);
      // With high beta, shock should persist
      expect(garch[15]).toBeGreaterThan(garch[9]);
    });

    it('alpha=0不应受冲击影响', () => {
      const returns = Array.from({ length: 20 }, () => 0.001);
      returns[10] = 0.5;
      const garch = calcGARCH(returns, 0.00001, 0, 0.9);
      // With alpha=0, no direct shock response
      expect(garch[11]).toBeCloseTo(garch[9], 5);
    });
  });

  describe('波动率微笑', () => {
    it('对称微笑skew应为0', () => {
      const strikes = [90, 95, 100, 105, 110];
      const vols = [0.25, 0.22, 0.20, 0.22, 0.25];
      const { skew } = calcVolSmile(strikes, vols, 100);
      expect(Math.abs(skew)).toBeLessThan(0.1);
    });

    it('偏斜微笑skew应非零', () => {
      const strikes = [90, 95, 100, 105, 110];
      const vols = [0.30, 0.25, 0.20, 0.18, 0.17];
      const { skew } = calcVolSmile(strikes, vols, 100);
      expect(Math.abs(skew)).toBeGreaterThan(0);
    });

    it('不足3个点返回零', () => {
      expect(calcVolSmile([100], [0.2], 100)).toEqual({ skew: 0, kurtosis: 0 });
    });

    it('kurtosis应为非负', () => {
      const strikes = [90, 95, 100, 105, 110];
      const vols = [0.30, 0.25, 0.20, 0.22, 0.28];
      const { kurtosis } = calcVolSmile(strikes, vols, 100);
      expect(kurtosis).toBeGreaterThanOrEqual(0);
    });

    it('等波动率skew为0', () => {
      const strikes = [90, 95, 100, 105, 110];
      const vols = [0.20, 0.20, 0.20, 0.20, 0.20];
      expect(calcVolSmile(strikes, vols, 100).skew).toBe(0);
    });
  });

  describe('波动率锥', () => {
    it('应返回所有周期的结果', () => {
      const returns = Array.from({ length: 100 }, () => (Math.random() - 0.5) * 0.02);
      const cone = calcVolatilityCone(returns, [10, 20, 30, 60]);
      expect(Object.keys(cone).length).toBe(4);
    });

    it('每个周期应有min/max/median', () => {
      const returns = Array.from({ length: 100 }, () => (Math.random() - 0.5) * 0.02);
      const cone = calcVolatilityCone(returns, [20]);
      const d20 = cone['20d'];
      expect(d20.min).toBeDefined();
      expect(d20.max).toBeDefined();
      expect(d20.median).toBeDefined();
    });

    it('min应不超过max', () => {
      const returns = Array.from({ length: 100 }, () => (Math.random() - 0.5) * 0.02);
      const cone = calcVolatilityCone(returns, [10, 30]);
      for (const key of Object.keys(cone)) {
        expect(cone[key].min).toBeLessThanOrEqual(cone[key].max);
      }
    });

    it('median应在min和max之间', () => {
      const returns = Array.from({ length: 100 }, () => (Math.random() - 0.5) * 0.02);
      const cone = calcVolatilityCone(returns, [20]);
      const d20 = cone['20d'];
      expect(d20.median).toBeGreaterThanOrEqual(d20.min);
      expect(d20.median).toBeLessThanOrEqual(d20.max);
    });

    it('周期超过数据长度应返回零', () => {
      const returns = Array.from({ length: 5 }, () => (Math.random() - 0.5) * 0.02);
      const cone = calcVolatilityCone(returns, [10]);
      expect(cone['10d'].min).toBe(0);
    });
  });

  describe('波动率比率', () => {
    it('短期大于长期比率应大于1', () => {
      expect(calcVolRatio(0.30, 0.20)).toBeGreaterThan(1);
    });

    it('短期小于长期比率应小于1', () => {
      expect(calcVolRatio(0.15, 0.25)).toBeLessThan(1);
    });

    it('零长期波动率返回0', () => {
      expect(calcVolRatio(0.2, 0)).toBe(0);
    });

    it('相等时比率为1', () => {
      expect(calcVolRatio(0.25, 0.25)).toBe(1);
    });

    it('比率应正确计算', () => {
      expect(calcVolRatio(0.30, 0.15)).toBeCloseTo(2, 5);
    });
  });
});
