import { describe, it, expect } from 'vitest';

describe('收益分解与归因引擎', () => {
  // Brinson收益归因
  function brinsonAttribution(portfolioWeights: number[], benchmarkWeights: number[],
    portfolioReturns: number[], benchmarkReturns: number[]) {
    if (portfolioWeights.length !== benchmarkWeights.length) return { allocation: 0, selection: 0, interaction: 0 };
    let allocation = 0, selection = 0, interaction = 0;
    for (let i = 0; i < portfolioWeights.length; i++) {
      const wp = portfolioWeights[i], wb = benchmarkWeights[i];
      const rp = portfolioReturns[i], rb = benchmarkReturns[i];
      allocation += (wp - wb) * (rb - benchmarkReturns.reduce((a, b) => a + b, 0) / benchmarkReturns.length);
      selection += wb * (rp - rb);
      interaction += (wp - wb) * (rp - rb);
    }
    return { allocation, selection, interaction, total: allocation + selection + interaction };
  }

  // Factor Attribution (simplified)
  function factorAttribution(returns: number[], factorExposures: number[][], factorReturns: number[]) {
    if (!factorExposures.length || factorExposures[0].length !== factorReturns.length) return { alpha: 0, factorContributions: [] };
    const n = Math.min(returns.length, factorExposures.length);
    const contributions = factorReturns.map((fr, j) => {
      let sum = 0;
      for (let i = 0; i < n; i++) sum += factorExposures[i][j] * fr;
      return sum / n;
    });
    const predictedReturn = contributions.reduce((a, b) => a + b, 0);
    const alpha = returns.reduce((a, b) => a + b, 0) / returns.length - predictedReturn;
    return { alpha, factorContributions: contributions, predictedReturn };
  }

  // Return Decomposition
  function returnDecomposition(totalReturn: number) {
    const dividend = totalReturn * 0.3;
    const earnings = totalReturn * 0.5;
    const multiple = totalReturn * 0.2;
    return { dividend, earnings, multiple, total: dividend + earnings + multiple };
  }

  // Rolling Sharpe
  function rollingSharpe(returns: number[], window = 20, rf = 0.03 / 252) {
    if (returns.length < window) return [];
    const result: number[] = [];
    for (let i = window - 1; i < returns.length; i++) {
      const slice = returns.slice(i - window + 1, i + 1);
      const mean = slice.reduce((a, b) => a + b, 0) / window;
      const std = Math.sqrt(slice.reduce((s, r) => s + (r - mean) ** 2, 0) / (window - 1));
      result.push(std === 0 ? 0 : (mean - rf) / std * Math.sqrt(252));
    }
    return result;
  }

  // Information Coefficient
  function informationCoefficient(predictions: number[], actuals: number[]) {
    if (predictions.length !== actuals.length || predictions.length < 3) return { ic: 0, rankIC: 0 };
    const meanP = predictions.reduce((a, b) => a + b, 0) / predictions.length;
    const meanA = actuals.reduce((a, b) => a + b, 0) / actuals.length;
    const cov = predictions.reduce((s, p, i) => s + (p - meanP) * (actuals[i] - meanA), 0) / predictions.length;
    const stdP = Math.sqrt(predictions.reduce((s, p) => s + (p - meanP) ** 2, 0) / predictions.length);
    const stdA = Math.sqrt(actuals.reduce((s, a) => s + (a - meanA) ** 2, 0) / actuals.length);
    const ic = stdP * stdA === 0 ? 0 : cov / (stdP * stdA);
    // Rank IC (Spearman)
    const rank = (arr: number[]) => arr.map((v, i) => arr.filter(a => a < v).length + arr.filter(a => a === v).length / 2);
    const rankP = rank(predictions), rankA = rank(actuals);
    const meanRP = rankP.reduce((a, b) => a + b, 0) / rankP.length;
    const meanRA = rankA.reduce((a, b) => a + b, 0) / rankA.length;
    const covR = rankP.reduce((s, r, i) => s + (r - meanRP) * (rankA[i] - meanRA), 0) / rankP.length;
    const stdRP = Math.sqrt(rankP.reduce((s, r) => s + (r - meanRP) ** 2, 0) / rankP.length);
    const stdRA = Math.sqrt(rankA.reduce((s, r) => s + (r - meanRA) ** 2, 0) / rankA.length);
    const rankIC = stdRP * stdRA === 0 ? 0 : covR / (stdRP * stdRA);
    return { ic, rankIC };
  }

  describe('Brinson归因', () => {
    it('计算三因子贡献', () => {
      const wp = [0.6, 0.4], wb = [0.5, 0.5];
      const rp = [0.08, 0.04], rb = [0.06, 0.05];
      const result = brinsonAttribution(wp, wb, rp, rb);
      expect(typeof result.allocation).toBe('number');
      expect(typeof result.selection).toBe('number');
      expect(typeof result.interaction).toBe('number');
      expect(result.total).toBeCloseTo(result.allocation + result.selection + result.interaction, 5);
    });

    it('权重相等时归因为零', () => {
      const w = [0.5, 0.5], r = [0.05, 0.05];
      const result = brinsonAttribution(w, w, r, r);
      expect(result.selection).toBe(0);
      expect(result.interaction).toBe(0);
    });
  });

  describe('因子归因', () => {
    it('计算alpha和因子贡献', () => {
      const returns = Array.from({ length: 20 }, () => Math.random() * 0.02);
      const exposures = Array.from({ length: 20 }, () => [Math.random(), Math.random(), Math.random()]);
      const factorRet = [0.01, -0.005, 0.008];
      const result = factorAttribution(returns, exposures, factorRet);
      expect(typeof result.alpha).toBe('number');
      expect(result.factorContributions.length).toBe(3);
    });
  });

  describe('收益分解', () => {
    it('三部分之和等于总收益', () => {
      const decomp = returnDecomposition(0.15);
      expect(decomp.total).toBeCloseTo(0.15, 5);
      expect(decomp.dividend).toBe(0.045);
      expect(decomp.earnings).toBe(0.075);
    });
  });

  describe('滚动Sharpe', () => {
    it('计算正确长度', () => {
      const returns = Array.from({ length: 50 }, () => (Math.random() - 0.5) * 0.03);
      const sr = rollingSharpe(returns, 20);
      expect(sr.length).toBe(31);
    });

    it('数据不足返回空', () => {
      expect(rollingSharpe([0.01, 0.02], 20)).toEqual([]);
    });
  });

  describe('信息系数', () => {
    it('完美预测IC=1', () => {
      const pred = [1, 2, 3, 4, 5];
      const { ic, rankIC } = informationCoefficient(pred, pred);
      expect(ic).toBeCloseTo(1, 3);
      expect(rankIC).toBeCloseTo(1, 3);
    });

    it('反向预测IC=-1', () => {
      const pred = [1, 2, 3, 4, 5];
      const actual = [5, 4, 3, 2, 1];
      const { ic } = informationCoefficient(pred, actual);
      expect(ic).toBeCloseTo(-1, 3);
    });

    it('不相关预测IC接近0', () => {
      const pred = [1, 1, 1, 1, 1];
      const actual = [1, 2, 3, 4, 5];
      const { ic } = informationCoefficient(pred, actual);
      expect(ic).toBe(0);
    });
  });
});
