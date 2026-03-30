import { describe, it, expect } from 'vitest';

// ===== 除权除息计算引擎 =====
describe('Ex-Rights Calculation Engine', () => {
  interface DividendEvent {
    type: 'cash' | 'bonus' | 'rights';
    ratio: number; // 每股派息/送股比例
    cashDividend?: number; // 每股现金分红(元)
    bonusShares?: number; // 每10股送股数
    rightsShares?: number; // 每10股转增数
    rightsPrice?: number; // 配股价
    exDate: string;
  }

  const calcExRightPrice = (closePrice: number, event: DividendEvent): number => {
    if (event.type === 'cash' && event.cashDividend) {
      return closePrice - event.cashDividend;
    }
    if (event.type === 'bonus') {
      const bonus = (event.bonusShares || 0) / 10;
      const rights = (event.rightsShares || 0) / 10;
      const newShares = 1 + bonus + rights;
      const cash = (event.cashDividend || 0) * (1 - 0.1); // 扣10%红利税
      return (closePrice - cash) / newShares;
    }
    if (event.type === 'rights' && event.rightsShares && event.rightsPrice) {
      const rightsRatio = event.rightsShares / 10;
      return (closePrice + rightsRatio * event.rightsPrice) / (1 + rightsRatio);
    }
    return closePrice;
  };

  const calcForwardAdjustment = (prices: number[], events: DividendEvent[]): number[] => {
    if (events.length === 0) return [...prices];
    const adjusted = [...prices];
    // 简化：从后往前调整
    for (let i = events.length - 1; i >= 0; i--) {
      const factor = prices[prices.length - 1] / calcExRightPrice(prices[prices.length - 1], events[i]);
      for (let j = 0; j < adjusted.length; j++) {
        adjusted[j] *= factor;
      }
    }
    return adjusted;
  };

  const calcDividendYield = (cashDividend: number, price: number): number => {
    if (!price || price === 0) return 0;
    return (cashDividend / price) * 100;
  };

  const calcTaxRate = (holdingDays: number): number => {
    if (holdingDays <= 30) return 0.20;
    if (holdingDays <= 365) return 0.10;
    return 0;
  };

  it('应该计算纯现金分红除权价', () => {
    const event: DividendEvent = { type: 'cash', ratio: 0, cashDividend: 1, exDate: '2026-06-01' };
    expect(calcExRightPrice(100, event)).toBe(99);
  });

  it('应该计算送股除权价', () => {
    const event: DividendEvent = { type: 'bonus', ratio: 0, cashDividend: 0, bonusShares: 10, rightsShares: 0, exDate: '2026-06-01' };
    // (100 - 0) / (1 + 1) = 50
    expect(calcExRightPrice(100, event)).toBe(50);
  });

  it('应该计算转增除权价', () => {
    const event: DividendEvent = { type: 'bonus', ratio: 0, cashDividend: 0, bonusShares: 0, rightsShares: 10, exDate: '2026-06-01' };
    expect(calcExRightPrice(100, event)).toBe(50);
  });

  it('应该计算混合方案除权价', () => {
    const event: DividendEvent = { type: 'bonus', ratio: 0, cashDividend: 1, bonusShares: 5, rightsShares: 5, exDate: '2026-06-01' };
    // (100 - 1*0.9) / (1 + 0.5 + 0.5) = 99.1 / 2 = 49.55
    expect(calcExRightPrice(100, event)).toBeCloseTo(49.55, 2);
  });

  it('应该计算配股除权价', () => {
    const event: DividendEvent = { type: 'rights', ratio: 0, rightsShares: 3, rightsPrice: 80, exDate: '2026-06-01' };
    // (100 + 0.3 * 80) / 1.3 = 124 / 1.3 ≈ 95.38
    expect(calcExRightPrice(100, event)).toBeCloseTo(95.38, 1);
  });

  it('应该计算股息率', () => {
    expect(calcDividendYield(5, 100)).toBe(5);
    expect(calcDividendYield(2.5, 50)).toBe(5);
    expect(calcDividendYield(0, 100)).toBe(0);
    expect(calcDividendYield(5, 0)).toBe(0);
  });

  it('应该按持股时间计算红利税率', () => {
    expect(calcTaxRate(15)).toBe(0.20); // <1月
    expect(calcTaxRate(30)).toBe(0.20); // =1月
    expect(calcTaxRate(180)).toBe(0.10); // 1月~1年
    expect(calcTaxRate(365)).toBe(0.10); // =1年
    expect(calcTaxRate(400)).toBe(0); // >1年免税
  });
});

// ===== 均线系统 =====
describe('Moving Average System', () => {
  const calcSMA = (data: number[], period: number): (number | null)[] => {
    const result: (number | null)[] = [];
    for (let i = 0; i < data.length; i++) {
      if (i < period - 1) {
        result.push(null);
      } else {
        const sum = data.slice(i - period + 1, i + 1).reduce((a, b) => a + b, 0);
        result.push(sum / period);
      }
    }
    return result;
  };

  const calcEMA = (data: number[], period: number): (number | null)[] => {
    const result: (number | null)[] = [];
    const multiplier = 2 / (period + 1);
    for (let i = 0; i < data.length; i++) {
      if (i === 0) {
        result.push(data[i]);
      } else {
        const prev = result[i - 1] ?? data[i - 1];
        result.push((data[i] - prev) * multiplier + prev);
      }
    }
    return result;
  };

  const detectMACross = (short: (number | null)[], long: (number | null)[]): ('golden' | 'death' | 'none')[] => {
    const result: ('golden' | 'death' | 'none')[] = [];
    for (let i = 1; i < short.length; i++) {
      if (short[i] === null || long[i] === null || short[i - 1] === null || long[i - 1] === null) {
        result.push('none');
        continue;
      }
      if (short[i - 1]! <= long[i - 1]! && short[i]! > long[i]!) result.push('golden');
      else if (short[i - 1]! >= long[i - 1]! && short[i]! < long[i]!) result.push('death');
      else result.push('none');
    }
    return result;
  };

  const data = [10, 12, 11, 13, 14, 15, 14, 16, 17, 18, 16, 15, 14, 13, 12];

  it('应该正确计算SMA', () => {
    const sma5 = calcSMA(data, 5);
    expect(sma5[0]).toBeNull();
    expect(sma5[4]).toBeCloseTo(12); // (10+12+11+13+14)/5
    expect(sma5.length).toBe(data.length);
  });

  it('应该正确计算EMA', () => {
    const ema5 = calcEMA(data, 5);
    expect(ema5[0]).toBe(10);
    expect(ema5.length).toBe(data.length);
    // EMA应该比SMA更敏感
  });

  it('应该检测均线交叉', () => {
    const ma5 = calcSMA(data, 5);
    const ma10 = calcSMA(data, 10);
    const crosses = detectMACross(ma5, ma10);
    expect(crosses.length).toBe(data.length - 1);
    crosses.forEach(c => expect(['golden', 'death', 'none']).toContain(c));
  });

  it('应该处理周期等于数据长度', () => {
    const sma = calcSMA([1, 2, 3], 3);
    expect(sma[0]).toBeNull();
    expect(sma[1]).toBeNull();
    expect(sma[2]).toBe(2);
  });

  it('应该处理空数据', () => {
    expect(calcSMA([], 5)).toEqual([]);
    expect(calcEMA([], 5)).toEqual([]);
  });

  it('应该处理单一数据', () => {
    const sma = calcSMA([100], 1);
    expect(sma).toEqual([100]);
  });
});

// ===== 趋势分析 =====
describe('Trend Analysis', () => {
  const detectTrend = (prices: number[]): 'up' | 'down' | 'sideways' => {
    if (prices.length < 2) return 'sideways';
    let upCount = 0, downCount = 0;
    for (let i = 1; i < prices.length; i++) {
      if (prices[i] > prices[i - 1]) upCount++;
      else if (prices[i] < prices[i - 1]) downCount++;
    }
    const ratio = upCount / (upCount + downCount);
    if (ratio > 0.65) return 'up';
    if (ratio < 0.35) return 'down';
    return 'sideways';
  };

  const calcLinearRegression = (prices: number[]): { slope: number; intercept: number; r2: number } => {
    const n = prices.length;
    if (n < 2) return { slope: 0, intercept: prices[0] || 0, r2: 0 };
    const xs = prices.map((_, i) => i);
    const sumX = xs.reduce((a, b) => a + b, 0);
    const sumY = prices.reduce((a, b) => a + b, 0);
    const sumXY = xs.reduce((a, x, i) => a + x * prices[i], 0);
    const sumX2 = xs.reduce((a, x) => a + x * x, 0);
    const slope = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX);
    const intercept = (sumY - slope * sumX) / n;
    const meanY = sumY / n;
    const ssRes = prices.reduce((sum, y, i) => sum + Math.pow(y - (slope * i + intercept), 2), 0);
    const ssTot = prices.reduce((sum, y) => sum + Math.pow(y - meanY, 2), 0);
    const r2 = ssTot === 0 ? 1 : 1 - ssRes / ssTot;
    return { slope, intercept, r2 };
  };

  it('应该检测上升趋势', () => {
    expect(detectTrend([1, 2, 3, 4, 5, 6, 7, 8])).toBe('up');
  });

  it('应该检测下降趋势', () => {
    expect(detectTrend([8, 7, 6, 5, 4, 3, 2, 1])).toBe('down');
  });

  it('应该检测震荡趋势', () => {
    expect(detectTrend([1, 2, 1, 2, 1, 2, 1, 2])).toBe('sideways');
  });

  it('应该处理单元素', () => {
    expect(detectTrend([100])).toBe('sideways');
  });

  it('应该计算线性回归斜率', () => {
    const result = calcLinearRegression([1, 2, 3, 4, 5]);
    expect(result.slope).toBeCloseTo(1);
    expect(result.r2).toBeCloseTo(1);
  });

  it('应该计算线性回归截距', () => {
    const result = calcLinearRegression([10, 20, 30, 40, 50]);
    expect(result.intercept).toBeCloseTo(10);
    expect(result.slope).toBeCloseTo(10);
  });

  it('应该处理平坦数据', () => {
    const result = calcLinearRegression([5, 5, 5, 5, 5]);
    expect(result.slope).toBeCloseTo(0);
    expect(Number.isFinite(result.r2)).toBe(true); // R²在ssTot=0时可能为0或1
  });
});

// ===== 回撤分析 =====
describe('Drawdown Analysis', () => {
  interface DrawdownPeriod {
    start: number;
    trough: number;
    end: number;
    maxDrawdown: number;
    recoveryDays: number;
  }

  const analyzeDrawdowns = (equity: number[]): DrawdownPeriod[] => {
    const periods: DrawdownPeriod[] = [];
    let peak = equity[0];
    let peakIdx = 0;
    let inDrawdown = false;
    let trough = equity[0];
    let troughIdx = 0;

    for (let i = 1; i < equity.length; i++) {
      if (equity[i] > peak) {
        if (inDrawdown) {
          periods.push({
            start: peakIdx,
            trough: troughIdx,
            end: i,
            maxDrawdown: (peak - trough) / peak,
            recoveryDays: i - troughIdx,
          });
          inDrawdown = false;
        }
        peak = equity[i];
        peakIdx = i;
        trough = equity[i];
        troughIdx = i;
      } else {
        if (!inDrawdown) {
          inDrawdown = true;
        }
        if (equity[i] < trough) {
          trough = equity[i];
          troughIdx = i;
        }
      }
    }
    if (inDrawdown) {
      periods.push({
        start: peakIdx,
        trough: troughIdx,
        end: equity.length - 1,
        maxDrawdown: (peak - trough) / peak,
        recoveryDays: -1,
      });
    }
    return periods;
  };

  it('应该检测单次回撤', () => {
    const equity = [100, 110, 105, 95, 100, 115];
    const drawdowns = analyzeDrawdowns(equity);
    expect(drawdowns.length).toBeGreaterThanOrEqual(1);
    const dd = drawdowns.find(d => d.maxDrawdown > 0.05);
    expect(dd).toBeDefined();
    expect(dd!.maxDrawdown).toBeCloseTo(0.136, 1);
  });

  it('应该检测多次回撤', () => {
    const equity = [100, 110, 100, 120, 110, 130, 120];
    const drawdowns = analyzeDrawdowns(equity);
    expect(drawdowns.length).toBeGreaterThanOrEqual(2);
  });

  it('应该计算回撤恢复天数', () => {
    const equity = [100, 110, 90, 115, 120];
    const drawdowns = analyzeDrawdowns(equity);
    const recovered = drawdowns.filter(d => d.recoveryDays > 0);
    expect(recovered.length).toBeGreaterThanOrEqual(1);
  });

  it('应该处理持续回撤', () => {
    const equity = [100, 95, 90, 85, 80];
    const drawdowns = analyzeDrawdowns(equity);
    expect(drawdowns.length).toBe(1);
    expect(drawdowns[0].recoveryDays).toBe(-1);
  });

  it('应该处理持续上涨无回撤', () => {
    const equity = [100, 110, 120, 130];
    const drawdowns = analyzeDrawdowns(equity);
    expect(drawdowns.length).toBe(0);
  });
});

// ===== 相关性分析 =====
describe('Correlation Analysis', () => {
  const calcCorrelation = (x: number[], y: number[]): number => {
    if (x.length !== y.length || x.length < 2) return 0;
    const n = x.length;
    const meanX = x.reduce((a, b) => a + b, 0) / n;
    const meanY = y.reduce((a, b) => a + b, 0) / n;
    let num = 0, denX = 0, denY = 0;
    for (let i = 0; i < n; i++) {
      const dx = x[i] - meanX;
      const dy = y[i] - meanY;
      num += dx * dy;
      denX += dx * dx;
      denY += dy * dy;
    }
    const den = Math.sqrt(denX * denY);
    return den === 0 ? 0 : num / den;
  };

  const calcBeta = (stockReturns: number[], marketReturns: number[]): number => {
    if (stockReturns.length !== marketReturns.length || stockReturns.length < 2) return 0;
    const n = stockReturns.length;
    const meanS = stockReturns.reduce((a, b) => a + b, 0) / n;
    const meanM = marketReturns.reduce((a, b) => a + b, 0) / n;
    let cov = 0, varM = 0;
    for (let i = 0; i < n; i++) {
      cov += (stockReturns[i] - meanS) * (marketReturns[i] - meanM);
      varM += (marketReturns[i] - meanM) ** 2;
    }
    return varM === 0 ? 0 : cov / varM;
  };

  it('应该计算完全正相关', () => {
    expect(calcCorrelation([1, 2, 3, 4, 5], [2, 4, 6, 8, 10])).toBeCloseTo(1);
  });

  it('应该计算完全负相关', () => {
    expect(calcCorrelation([1, 2, 3, 4, 5], [10, 8, 6, 4, 2])).toBeCloseTo(-1);
  });

  it('应该计算无相关', () => {
    expect(calcCorrelation([1, 1, 1, 1, 1], [1, 2, 3, 4, 5])).toBe(0);
  });

  it('应该处理长度不等', () => {
    expect(calcCorrelation([1, 2], [1])).toBe(0);
  });

  it('应该计算Beta值', () => {
    const stock = [0.02, -0.01, 0.03, -0.02, 0.01];
    const market = [0.01, -0.005, 0.02, -0.01, 0.005];
    const beta = calcBeta(stock, market);
    expect(beta).toBeGreaterThan(0);
  });

  it('应该处理Beta空数据', () => {
    expect(calcBeta([], [])).toBe(0);
  });
});

// ===== 波动率计算 =====
describe('Volatility Calculations', () => {
  const calcHistoricalVolatility = (returns: number[], annualize: boolean = true): number => {
    if (returns.length < 2) return 0;
    const mean = returns.reduce((a, b) => a + b, 0) / returns.length;
    const variance = returns.reduce((sum, r) => sum + (r - mean) ** 2, 0) / (returns.length - 1);
    const dailyVol = Math.sqrt(variance);
    return annualize ? dailyVol * Math.sqrt(252) : dailyVol;
  };

  const calcParkinsonVolatility = (highs: number[], lows: number[]): number => {
    if (highs.length !== lows.length || highs.length < 2) return 0;
    const factor = 1 / (4 * Math.log(2));
    let sum = 0;
    for (let i = 0; i < highs.length; i++) {
      sum += Math.log(highs[i] / lows[i]) ** 2;
    }
    return Math.sqrt(factor * sum / highs.length) * Math.sqrt(252);
  };

  it('应该计算年化波动率', () => {
    const returns = [0.01, -0.02, 0.015, -0.01, 0.005, -0.015, 0.02, -0.005];
    const vol = calcHistoricalVolatility(returns, true);
    expect(vol).toBeGreaterThan(0);
    expect(vol).toBeLessThan(2); // 合理范围
  });

  it('应该计算日波动率', () => {
    const returns = [0.01, -0.02, 0.015, -0.01, 0.005];
    const daily = calcHistoricalVolatility(returns, false);
    const annual = calcHistoricalVolatility(returns, true);
    expect(annual).toBeGreaterThan(daily);
  });

  it('应该处理零波动率', () => {
    expect(calcHistoricalVolatility([0.01, 0.01, 0.01, 0.01], false)).toBe(0);
  });

  it('应该计算Parkinson波动率', () => {
    const highs = [105, 108, 112, 110, 115];
    const lows = [98, 100, 105, 102, 108];
    const vol = calcParkinsonVolatility(highs, lows);
    expect(vol).toBeGreaterThan(0);
  });

  it('应该处理Parkinson空数据', () => {
    expect(calcParkinsonVolatility([], [])).toBe(0);
  });
});
