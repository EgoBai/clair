import { describe, it, expect } from 'vitest';

describe('量化指标计算引擎', () => {
  function calcReturns(prices: number[]): number[] {
    const r: number[] = [];
    for (let i = 1; i < prices.length; i++) {
      r.push((prices[i] - prices[i - 1]) / prices[i - 1]);
    }
    return r;
  }
  function calcVolatility(returns: number[]): number {
    if (returns.length < 2) return 0;
    const mean = returns.reduce((s, r) => s + r, 0) / returns.length;
    const variance = returns.reduce((s, r) => s + (r - mean) ** 2, 0) / (returns.length - 1);
    return Math.sqrt(variance);
  }
  function calcAnnualizedReturn(totalReturn: number, days: number): number {
    if (days <= 0) return 0;
    return (1 + totalReturn) ** (252 / days) - 1;
  }
  function calcSharpe(returns: number[], riskFreeRate = 0.03): number {
    const avg = returns.reduce((s, r) => s + r, 0) / returns.length;
    const annualizedReturn = avg * 252;
    const vol = calcVolatility(returns) * Math.sqrt(252);
    if (vol === 0) return 0;
    return (annualizedReturn - riskFreeRate) / vol;
  }
  function calcSortino(returns: number[], riskFreeRate = 0.03): number {
    const avg = returns.reduce((s, r) => s + r, 0) / returns.length;
    const annualizedReturn = avg * 252;
    const downside = returns.filter(r => r < 0);
    if (downside.length === 0) return annualizedReturn > riskFreeRate ? 10 : 0;
    const downVar = downside.reduce((s, r) => s + r ** 2, 0) / downside.length;
    const downVol = Math.sqrt(downVar) * Math.sqrt(252);
    if (downVol === 0) return 0;
    return (annualizedReturn - riskFreeRate) / downVol;
  }
  function calcMaxDrawdown(equity: number[]): number {
    let peak = equity[0], maxDD = 0;
    for (const v of equity) {
      if (v > peak) peak = v;
      const dd = (peak - v) / peak;
      if (dd > maxDD) maxDD = dd;
    }
    return maxDD;
  }
  function calcCalmar(equity: number[], days: number): number {
    const totalReturn = (equity[equity.length - 1] - equity[0]) / equity[0];
    const annReturn = calcAnnualizedReturn(totalReturn, days);
    const mdd = calcMaxDrawdown(equity);
    if (mdd === 0) return annReturn > 0 ? 10 : 0;
    return annReturn / mdd;
  }
  function calcBeta(stockReturns: number[], marketReturns: number[]): number {
    if (stockReturns.length !== marketReturns.length || stockReturns.length < 2) return 0;
    const sMean = stockReturns.reduce((a, b) => a + b, 0) / stockReturns.length;
    const mMean = marketReturns.reduce((a, b) => a + b, 0) / marketReturns.length;
    let cov = 0, varM = 0;
    for (let i = 0; i < stockReturns.length; i++) {
      cov += (stockReturns[i] - sMean) * (marketReturns[i] - mMean);
      varM += (marketReturns[i] - mMean) ** 2;
    }
    if (varM === 0) return 0;
    return cov / varM;
  }
  function calcAlpha(stockReturns: number[], marketReturns: number[], rf = 0.03): number {
    const sr = stockReturns.reduce((a, b) => a + b, 0) / stockReturns.length * 252;
    const mr = marketReturns.reduce((a, b) => a + b, 0) / marketReturns.length * 252;
    const beta = calcBeta(stockReturns, marketReturns);
    return sr - (rf + beta * (mr - rf));
  }
  function calcInformationRatio(stockReturns: number[], benchmarkReturns: number[]): number {
    const excessReturns = stockReturns.map((r, i) => r - benchmarkReturns[i]);
    const mean = excessReturns.reduce((a, b) => a + b, 0) / excessReturns.length;
    const trackingError = calcVolatility(excessReturns) * Math.sqrt(252);
    if (trackingError === 0) return 0;
    return (mean * 252) / trackingError;
  }

  it('计算日收益率', () => {
    const prices = [100, 105, 110, 108];
    const r = calcReturns(prices);
    expect(r).toHaveLength(3);
    expect(r[0]).toBeCloseTo(0.05, 4);
  });

  it('计算波动率', () => {
    const returns = [0.01, -0.02, 0.015, -0.005, 0.02];
    const vol = calcVolatility(returns);
    expect(vol).toBeGreaterThan(0);
  });

  it('波动率全相同返回0', () => {
    expect(calcVolatility([0.01, 0.01, 0.01])).toBe(0);
  });

  it('波动率不足数据', () => {
    expect(calcVolatility([0.01])).toBe(0);
  });

  it('计算年化收益率', () => {
    const ann = calcAnnualizedReturn(0.1, 252);
    expect(ann).toBeCloseTo(0.1, 2);
  });

  it('年化收益0天', () => {
    expect(calcAnnualizedReturn(0.1, 0)).toBe(0);
  });

  it('计算夏普比率', () => {
    const returns = [0.01, -0.005, 0.02, -0.01, 0.015];
    const sharpe = calcSharpe(returns);
    expect(typeof sharpe).toBe('number');
    expect(Number.isFinite(sharpe)).toBe(true);
  });

  it('夏普比率零波动', () => {
    const returns = [0.001, 0.001, 0.001];
    expect(calcSharpe(returns)).toBe(0);
  });

  it('计算索提诺比率', () => {
    const returns = [0.02, -0.01, 0.015, -0.005, 0.01];
    const sortino = calcSortino(returns);
    expect(Number.isFinite(sortino)).toBe(true);
  });

  it('索提诺无下跌', () => {
    const sortino = calcSortino([0.01, 0.02, 0.015]);
    expect(sortino).toBeGreaterThan(0);
  });

  it('最大回撤 - 标准', () => {
    const equity = [100, 110, 105, 115, 100, 90, 95];
    const mdd = calcMaxDrawdown(equity);
    expect(mdd).toBeCloseTo(0.217, 2); // (115-90)/115
  });

  it('最大回撤 - 持续上涨', () => {
    expect(calcMaxDrawdown([100, 110, 120, 130])).toBe(0);
  });

  it('最大回撤 - 持续下跌', () => {
    const mdd = calcMaxDrawdown([100, 90, 80, 70]);
    expect(mdd).toBeCloseTo(0.3, 1);
  });

  it('计算Calmar比率', () => {
    const equity = [100, 110, 105, 120, 115, 125];
    const calmar = calcCalmar(equity, 252);
    expect(Number.isFinite(calmar)).toBe(true);
  });

  it('计算Beta', () => {
    const stock = [0.02, -0.01, 0.03, -0.02, 0.01];
    const market = [0.01, -0.005, 0.02, -0.01, 0.005];
    const beta = calcBeta(stock, market);
    expect(Number.isFinite(beta)).toBe(true);
  });

  it('Beta完全相关', () => {
    const r = [0.01, 0.02, -0.01, 0.015];
    expect(calcBeta(r, r)).toBeCloseTo(1, 2);
  });

  it('Beta长度不匹配', () => {
    expect(calcBeta([0.01], [0.01, 0.02])).toBe(0);
  });

  it('计算Alpha', () => {
    const stock = [0.02, -0.01, 0.03, -0.02, 0.01];
    const market = [0.01, -0.005, 0.02, -0.01, 0.005];
    const alpha = calcAlpha(stock, market);
    expect(Number.isFinite(alpha)).toBe(true);
  });

  it('计算信息比率', () => {
    const stock = [0.01, -0.005, 0.02, -0.01, 0.015];
    const bench = [0.005, -0.003, 0.015, -0.008, 0.01];
    const ir = calcInformationRatio(stock, bench);
    expect(Number.isFinite(ir)).toBe(true);
  });

  it('信息比率完全跟踪', () => {
    const r = [0.01, 0.02, -0.01, 0.015];
    expect(calcInformationRatio(r, r)).toBe(0);
  });

  it('收益率序列长度', () => {
    expect(calcReturns([100, 105, 110])).toHaveLength(2);
  });

  it('波动率正数', () => {
    const vol = calcVolatility([0.01, -0.02, 0.015, -0.005]);
    expect(vol).toBeGreaterThan(0);
  });
});
