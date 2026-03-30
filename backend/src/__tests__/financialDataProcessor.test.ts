import { describe, it, expect } from 'vitest';

describe('金融数据处理器', () => {
  // 复权计算
  const calcExRightPrice = (price: number, dividend: number, bonusShares: number, transferShares: number): number => {
    // 除权价 = (前收盘价 - 每股派息 + 每股送股数 × 面值) / (1 + 送股比例 + 转增比例)
    const faceValue = 1;
    return (price - dividend + bonusShares * faceValue) / (1 + bonusShares + transferShares);
  };

  describe('除权计算', () => {
    it('纯派息', () => {
      expect(calcExRightPrice(10, 0.5, 0, 0)).toBe(9.5);
    });
    it('纯送股', () => {
      const result = calcExRightPrice(10, 0, 0.5, 0);
      expect(result).toBeCloseTo((10 + 0.5) / 1.5);
    });
    it('纯转增', () => {
      const result = calcExRightPrice(10, 0, 0, 0.3);
      expect(result).toBeCloseTo(10 / 1.3);
    });
    it('混合方案', () => {
      const result = calcExRightPrice(20, 1, 0.2, 0.3);
      expect(result).toBeCloseTo((20 - 1 + 0.2) / 1.5);
    });
    it('无除权', () => {
      expect(calcExRightPrice(10, 0, 0, 0)).toBe(10);
    });
  });

  // 复权因子
  const calcAdjustFactor = (events: { date: string; price: number; dividend: number; bonus: number; transfer: number }[]) => {
    const factors: number[] = [1];
    for (let i = 1; i < events.length; i++) {
      const exPrice = calcExRightPrice(events[i - 1].price, events[i].dividend, events[i].bonus, events[i].transfer);
      const factor = factors[i - 1] * (exPrice / events[i - 1].price);
      factors.push(factor);
    }
    return factors;
  };

  describe('复权因子', () => {
    it('无事件因子为1', () => {
      const factors = calcAdjustFactor([{ date: '2024-01-01', price: 10, dividend: 0, bonus: 0, transfer: 0 }]);
      expect(factors).toEqual([1]);
    });
    it('纯派息因子递减', () => {
      const factors = calcAdjustFactor([
        { date: '2024-01-01', price: 10, dividend: 0, bonus: 0, transfer: 0 },
        { date: '2024-06-01', price: 10, dividend: 1, bonus: 0, transfer: 0 },
      ]);
      expect(factors[1]).toBeLessThan(1);
    });
    it('首因子为1', () => {
      const factors = calcAdjustFactor([
        { date: '2024-01-01', price: 10, dividend: 0, bonus: 0, transfer: 0 },
        { date: '2024-06-01', price: 10, dividend: 0.5, bonus: 0, transfer: 0 },
      ]);
      expect(factors[0]).toBe(1);
    });
  });

  // 红利税计算
  const calcDividendTax = (dividend: number, holdingDays: number): number => {
    // 持股<1月：20%，1月~1年：10%，>1年：免税
    if (holdingDays > 365) return 0;
    if (holdingDays >= 30) return dividend * 0.1;
    return dividend * 0.2;
  };

  describe('红利税', () => {
    it('短期持有20%', () => {
      expect(calcDividendTax(1, 15)).toBe(0.2);
    });
    it('中期持有10%', () => {
      expect(calcDividendTax(1, 180)).toBe(0.1);
    });
    it('长期持有免税', () => {
      expect(calcDividendTax(1, 400)).toBe(0);
    });
    it('边界-30天', () => {
      expect(calcDividendTax(1, 30)).toBe(0.1);
    });
    it('边界-365天', () => {
      expect(calcDividendTax(1, 365)).toBe(0.1);
    });
    it('边界-366天', () => {
      expect(calcDividendTax(1, 366)).toBe(0);
    });
    it('零分红', () => {
      expect(calcDividendTax(0, 10)).toBe(0);
    });
  });

  // 市盈率计算
  const calcPE = (price: number, eps: number): number | null => {
    if (eps <= 0) return null; // 亏损股不计算PE
    return price / eps;
  };

  const calcPB = (price: number, bvps: number): number | null => {
    if (bvps <= 0) return null;
    return price / bvps;
  };

  const calcPS = (price: number, sps: number): number | null => {
    if (sps <= 0) return null;
    return price / sps;
  };

  const calcDividendYield = (dividend: number, price: number): number => {
    if (price <= 0) return 0;
    return (dividend / price) * 100;
  };

  describe('估值指标', () => {
    it('PE计算', () => expect(calcPE(100, 5)).toBe(20));
    it('亏损股PE为null', () => expect(calcPE(100, -1)).toBeNull());
    it('零收益PE为null', () => expect(calcPE(100, 0)).toBeNull());
    it('PB计算', () => expect(calcPB(100, 20)).toBe(5));
    it('负净资产PB为null', () => expect(calcPB(100, -5)).toBeNull());
    it('PS计算', () => expect(calcPS(100, 25)).toBe(4));
    it('股息率', () => expect(calcDividendYield(5, 100)).toBe(5));
    it('零价格股息率', () => expect(calcDividendYield(5, 0)).toBe(0));
    it('零分红股息率', () => expect(calcDividendYield(0, 100)).toBe(0));
  });

  // 波动率计算
  const calcVolatility = (prices: number[]): number => {
    if (prices.length < 2) return 0;
    const returns = [];
    for (let i = 1; i < prices.length; i++) {
      returns.push(Math.log(prices[i] / prices[i - 1]));
    }
    const mean = returns.reduce((a, b) => a + b, 0) / returns.length;
    const variance = returns.reduce((a, b) => a + (b - mean) ** 2, 0) / returns.length;
    return Math.sqrt(variance);
  };

  const annualizeVolatility = (dailyVol: number, tradingDays: number = 252): number => {
    return dailyVol * Math.sqrt(tradingDays);
  };

  describe('波动率', () => {
    it('常数价格零波动', () => {
      expect(calcVolatility([100, 100, 100, 100])).toBe(0);
    });
    it('上涨波动率', () => {
      const vol = calcVolatility([100, 105, 110, 115, 120]);
      expect(vol).toBeGreaterThan(0);
    });
    it('波动率非负', () => {
      const vol = calcVolatility([100, 95, 105, 90, 110]);
      expect(vol).toBeGreaterThanOrEqual(0);
    });
    it('单数据零波动', () => {
      expect(calcVolatility([100])).toBe(0);
    });
    it('空数据零波动', () => {
      expect(calcVolatility([])).toBe(0);
    });
    it('年化波动率', () => {
      const annual = annualizeVolatility(0.01);
      expect(annual).toBeCloseTo(0.01 * Math.sqrt(252));
    });
    it('年化放大', () => {
      expect(annualizeVolatility(0.01)).toBeGreaterThan(0.01);
    });
  });

  // Beta系数
  const calcBeta = (stockReturns: number[], marketReturns: number[]): number => {
    if (stockReturns.length !== marketReturns.length || stockReturns.length === 0) return 0;
    const meanS = stockReturns.reduce((a, b) => a + b, 0) / stockReturns.length;
    const meanM = marketReturns.reduce((a, b) => a + b, 0) / marketReturns.length;
    let cov = 0, varM = 0;
    for (let i = 0; i < stockReturns.length; i++) {
      cov += (stockReturns[i] - meanS) * (marketReturns[i] - meanM);
      varM += (marketReturns[i] - meanM) ** 2;
    }
    return varM === 0 ? 0 : cov / varM;
  };

  describe('Beta系数', () => {
    it('同步涨跌Beta=1', () => {
      expect(calcBeta([0.01, 0.02, -0.01], [0.01, 0.02, -0.01])).toBeCloseTo(1);
    });
    it('放大波动Beta>1', () => {
      const beta = calcBeta([0.02, 0.04, -0.02], [0.01, 0.02, -0.01]);
      expect(beta).toBeCloseTo(2);
    });
    it('反向波动Beta<0', () => {
      const beta = calcBeta([-0.01, -0.02, 0.01], [0.01, 0.02, -0.01]);
      expect(beta).toBeCloseTo(-1);
    });
    it('空数据', () => {
      expect(calcBeta([], [])).toBe(0);
    });
    it('长度不一致', () => {
      expect(calcBeta([1, 2], [1])).toBe(0);
    });
    it('市场零波动', () => {
      expect(calcBeta([1, 2, 3], [5, 5, 5])).toBe(0);
    });
  });

  // 市值分类
  const classifyMarketCap = (marketCap: number): string => {
    if (marketCap >= 2000) return 'mega'; // 超大盘
    if (marketCap >= 500) return 'large'; // 大盘
    if (marketCap >= 100) return 'mid'; // 中盘
    if (marketCap >= 30) return 'small'; // 小盘
    return 'micro'; // 微盘
  };

  describe('市值分类', () => {
    it('超大盘', () => expect(classifyMarketCap(3000)).toBe('mega'));
    it('大盘', () => expect(classifyMarketCap(1000)).toBe('large'));
    it('中盘', () => expect(classifyMarketCap(200)).toBe('mid'));
    it('小盘', () => expect(classifyMarketCap(50)).toBe('small'));
    it('微盘', () => expect(classifyMarketCap(10)).toBe('micro'));
    it('边界值', () => {
      expect(classifyMarketCap(2000)).toBe('mega');
      expect(classifyMarketCap(500)).toBe('large');
      expect(classifyMarketCap(100)).toBe('mid');
      expect(classifyMarketCap(30)).toBe('small');
    });
    it('零市值', () => expect(classifyMarketCap(0)).toBe('micro'));
  });
});
