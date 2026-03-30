import { describe, it, expect } from 'vitest';

// ===== 市场数据处理引擎 =====
describe('Market Data Processing Engine', () => {
  // K线数据验证
  const validateOHLCV = (bar: any): boolean => {
    if (!bar || typeof bar !== 'object') return false;
    const { open, high, low, close, volume } = bar;
    if ([open, high, low, close, volume].some(v => typeof v !== 'number' || isNaN(v))) return false;
    if (high < low) return false;
    if (open < low || open > high) return false;
    if (close < low || close > high) return false;
    if (volume < 0) return false;
    return true;
  };

  // 计算涨跌幅
  const calcChange = (current: number, previous: number): { change: number; changePercent: number } => {
    const change = current - previous;
    const changePercent = previous !== 0 ? change / previous : 0;
    return { change, changePercent };
  };

  // 前复权
  const adjustForward = (prices: number[], dividends: { date: number; amount: number }[]): number[] => {
    const result = [...prices];
    for (const div of dividends) {
      if (div.date >= 0 && div.date < result.length) {
        const ratio = (result[div.date] - div.amount) / result[div.date];
        for (let i = 0; i < div.date; i++) {
          result[i] *= ratio;
        }
      }
    }
    return result;
  };

  // 等权指数
  const equalWeightIndex = (stockReturns: number[][]): number[] => {
    if (stockReturns.length === 0) return [];
    const len = Math.min(...stockReturns.map(r => r.length));
    const index: number[] = [1000];
    for (let i = 0; i < len; i++) {
      const avgReturn = stockReturns.reduce((s, r) => s + r[i], 0) / stockReturns.length;
      index.push(index[index.length - 1] * (1 + avgReturn));
    }
    return index;
  };

  // 成交量加权价格
  const vwap = (prices: number[], volumes: number[]): number => {
    if (prices.length === 0 || prices.length !== volumes.length) return 0;
    const totalVol = volumes.reduce((a, b) => a + b, 0);
    if (totalVol === 0) return 0;
    return prices.reduce((s, p, i) => s + p * volumes[i], 0) / totalVol;
  };

  // 资金流向
  const moneyFlow = (close: number, high: number, low: number, volume: number): { typicalPrice: number; moneyFlow: number } => {
    const typicalPrice = (high + low + close) / 3;
    return { typicalPrice, moneyFlow: typicalPrice * volume };
  };

  // 量价趋势
  const volumePriceTrend = (closes: number[], volumes: number[]): number[] => {
    const vpt: number[] = [0];
    for (let i = 1; i < closes.length; i++) {
      const change = closes[i - 1] !== 0 ? (closes[i] - closes[i - 1]) / closes[i - 1] : 0;
      vpt.push(vpt[vpt.length - 1] + volumes[i] * change);
    }
    return vpt;
  };

  // 涨跌家数统计
  const advanceDecline = (changes: number[]): { advance: number; decline: number; unchanged: number; ratio: number } => {
    let advance = 0, decline = 0, unchanged = 0;
    for (const c of changes) {
      if (c > 0) advance++;
      else if (c < 0) decline++;
      else unchanged++;
    }
    return { advance, decline, unchanged, ratio: decline > 0 ? advance / decline : Infinity };
  };

  // 换手率
  const turnoverRate = (volume: number, totalShares: number): number => {
    return totalShares > 0 ? volume / totalShares : 0;
  };

  // 市盈率计算
  const calcPE = (price: number, eps: number): number => {
    if (eps <= 0 || !isFinite(eps)) return Infinity;
    return price / eps;
  };

  // 市净率
  const calcPB = (price: number, bookValue: number): number => {
    if (bookValue <= 0 || !isFinite(bookValue)) return Infinity;
    return price / bookValue;
  };

  // ROE
  const calcROE = (netIncome: number, equity: number): number => {
    return equity > 0 ? netIncome / equity : 0;
  };

  // 股息率
  const dividendYield = (dividend: number, price: number): number => {
    return price > 0 ? dividend / price : 0;
  };

  // 贝塔系数
  const calcBeta = (assetReturns: number[], marketReturns: number[]): number => {
    if (assetReturns.length !== marketReturns.length || assetReturns.length < 2) return 1;
    const n = assetReturns.length;
    const meanA = assetReturns.reduce((a, b) => a + b, 0) / n;
    const meanM = marketReturns.reduce((a, b) => a + b, 0) / n;
    let cov = 0, varM = 0;
    for (let i = 0; i < n; i++) {
      cov += (assetReturns[i] - meanA) * (marketReturns[i] - meanM);
      varM += (marketReturns[i] - meanM) ** 2;
    }
    return varM > 0 ? cov / varM : 1;
  };

  describe('K线验证', () => {
    it('有效K线', () => {
      expect(validateOHLCV({ open: 10, high: 12, low: 9, close: 11, volume: 1000 })).toBe(true);
    });

    it('high < low', () => {
      expect(validateOHLCV({ open: 10, high: 8, low: 9, close: 10, volume: 100 })).toBe(false);
    });

    it('open超出范围', () => {
      expect(validateOHLCV({ open: 15, high: 12, low: 9, close: 11, volume: 100 })).toBe(false);
    });

    it('负成交量', () => {
      expect(validateOHLCV({ open: 10, high: 12, low: 9, close: 11, volume: -1 })).toBe(false);
    });

    it('NaN值', () => {
      expect(validateOHLCV({ open: NaN, high: 12, low: 9, close: 11, volume: 100 })).toBe(false);
    });

    it('null', () => {
      expect(validateOHLCV(null)).toBe(false);
    });

    it('十字星(开=收)', () => {
      expect(validateOHLCV({ open: 10, high: 11, low: 9, close: 10, volume: 100 })).toBe(true);
    });
  });

  describe('涨跌幅计算', () => {
    it('上涨', () => {
      const { change, changePercent } = calcChange(110, 100);
      expect(change).toBe(10);
      expect(changePercent).toBeCloseTo(0.1);
    });

    it('下跌', () => {
      const { change, changePercent } = calcChange(90, 100);
      expect(change).toBe(-10);
      expect(changePercent).toBeCloseTo(-0.1);
    });

    it('不变', () => {
      const { change, changePercent } = calcChange(100, 100);
      expect(change).toBe(0);
      expect(changePercent).toBe(0);
    });

    it('前值为零', () => {
      const { changePercent } = calcChange(100, 0);
      expect(changePercent).toBe(0);
    });
  });

  describe('等权指数', () => {
    it('两资产', () => {
      const idx = equalWeightIndex([[0.01, 0.02], [0.02, -0.01]]);
      expect(idx.length).toBe(3);
      expect(idx[0]).toBe(1000);
    });

    it('空数据', () => {
      expect(equalWeightIndex([])).toEqual([]);
    });

    it('单资产', () => {
      const idx = equalWeightIndex([[0.01, 0.02]]);
      expect(idx[1]).toBeCloseTo(1010);
    });
  });

  describe('VWAP', () => {
    it('等量等价', () => {
      expect(vwap([10, 10], [100, 100])).toBeCloseTo(10);
    });

    it('加权', () => {
      expect(vwap([10, 20], [100, 100])).toBeCloseTo(15);
    });

    it('零成交量', () => {
      expect(vwap([10], [0])).toBe(0);
    });

    it('空数组', () => {
      expect(vwap([], [])).toBe(0);
    });
  });

  describe('资金流向', () => {
    it('计算正确', () => {
      const { typicalPrice, moneyFlow: mf } = moneyFlow(10, 11, 9, 100);
      expect(typicalPrice).toBeCloseTo(10);
      expect(mf).toBeCloseTo(1000);
    });
  });

  describe('量价趋势', () => {
    it('上涨累积', () => {
      const vpt = volumePriceTrend([100, 101, 102], [1000, 1000, 1000]);
      expect(vpt[vpt.length - 1]).toBeGreaterThan(0);
    });

    it('首值为零', () => {
      const vpt = volumePriceTrend([100, 100], [100, 100]);
      expect(vpt[0]).toBe(0);
    });
  });

  describe('涨跌家数', () => {
    it('基本统计', () => {
      const { advance, decline, unchanged, ratio } = advanceDecline([1, -1, 0, 2, -0.5]);
      expect(advance).toBe(2);
      expect(decline).toBe(2);
      expect(unchanged).toBe(1);
      expect(ratio).toBeCloseTo(1);
    });

    it('全涨', () => {
      const { ratio } = advanceDecline([1, 2, 3]);
      expect(ratio).toBe(Infinity);
    });

    it('全跌', () => {
      const { advance } = advanceDecline([-1, -2, -3]);
      expect(advance).toBe(0);
    });
  });

  describe('换手率', () => {
    it('基本计算', () => {
      expect(turnoverRate(1000, 10000)).toBeCloseTo(0.1);
    });

    it('零总股本', () => {
      expect(turnoverRate(1000, 0)).toBe(0);
    });
  });

  describe('估值指标', () => {
    it('PE计算', () => {
      expect(calcPE(100, 5)).toBe(20);
    });

    it('负EPS返回Infinity', () => {
      expect(calcPE(100, -1)).toBe(Infinity);
    });

    it('PB计算', () => {
      expect(calcPB(10, 5)).toBe(2);
    });

    it('ROE计算', () => {
      expect(calcROE(100, 1000)).toBeCloseTo(0.1);
    });

    it('股息率', () => {
      expect(dividendYield(2, 100)).toBeCloseTo(0.02);
    });
  });

  describe('贝塔系数', () => {
    it('正相关', () => {
      const asset = [0.02, 0.04, -0.01, 0.03, -0.02];
      const market = [0.01, 0.02, -0.005, 0.015, -0.01];
      expect(calcBeta(asset, market)).toBeGreaterThan(0);
    });

    it('数据不足返回1', () => {
      expect(calcBeta([0.01], [0.01])).toBe(1);
    });

    it('零方差返回1', () => {
      expect(calcBeta([0.01, 0.02], [0.01, 0.01])).toBe(1);
    });
  });
});
