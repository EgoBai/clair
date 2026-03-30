import { describe, it, expect } from 'vitest';

// 金融数据转换引擎测试
describe('Financial Data Transformation Engine', () => {
  // 数据标准化
  describe('Data Normalization', () => {
    const normalizeStockData = (raw: any) => ({
      symbol: String(raw.symbol || '').trim(),
      name: String(raw.name || '').trim(),
      price: Number(raw.price) || 0,
      change: Number(raw.change) || 0,
      changePercent: Number(raw.changePercent) || 0,
      volume: Math.max(0, Math.floor(Number(raw.volume) || 0)),
      amount: Math.max(0, Number(raw.amount) || 0),
      high: Number(raw.high) || 0,
      low: Number(raw.low) || 0,
      open: Number(raw.open) || 0,
      prevClose: Number(raw.prevClose) || 0,
      turnover: Math.min(100, Math.max(0, Number(raw.turnover) || 0)),
      pe: raw.pe !== null && raw.pe !== undefined ? Number(raw.pe) : null,
      pb: raw.pb !== null && raw.pb !== undefined ? Number(raw.pb) : null,
      marketCap: Math.max(0, Number(raw.marketCap) || 0),
    });

    it('should normalize valid data', () => {
      const raw = { symbol: '600519', name: '贵州茅台', price: 1800, change: 50, changePercent: 2.86, volume: 50000, amount: 90000000 };
      const norm = normalizeStockData(raw);
      expect(norm.symbol).toBe('600519');
      expect(norm.price).toBe(1800);
    });

    it('should handle missing fields with defaults', () => {
      const norm = normalizeStockData({});
      expect(norm.symbol).toBe('');
      expect(norm.price).toBe(0);
      expect(norm.volume).toBe(0);
    });

    it('should floor volume to integer', () => {
      const norm = normalizeStockData({ volume: 12345.7 });
      expect(norm.volume).toBe(12345);
    });

    it('should clamp turnover to 0-100', () => {
      expect(normalizeStockData({ turnover: -5 }).turnover).toBe(0);
      expect(normalizeStockData({ turnover: 150 }).turnover).toBe(100);
    });

    it('should handle null PE/PB', () => {
      expect(normalizeStockData({ pe: null }).pe).toBeNull();
      expect(normalizeStockData({ pb: undefined }).pb).toBeNull();
    });

    it('should handle string numbers', () => {
      const norm = normalizeStockData({ price: '1800.5', volume: '50000' });
      expect(norm.price).toBe(1800.5);
      expect(norm.volume).toBe(50000);
    });

    it('should trim whitespace from strings', () => {
      const norm = normalizeStockData({ symbol: '  600519  ', name: ' 贵州茅台 ' });
      expect(norm.symbol).toBe('600519');
      expect(norm.name).toBe('贵州茅台');
    });
  });

  // K线数据处理
  describe('K-Line Data Processing', () => {
    interface KLine {
      date: string;
      open: number;
      high: number;
      low: number;
      close: number;
      volume: number;
    }

    const resampleKLine = (data: KLine[], period: number): KLine[] => {
      const result: KLine[] = [];
      for (let i = 0; i < data.length; i += period) {
        const chunk = data.slice(i, i + period);
        result.push({
          date: chunk[0].date,
          open: chunk[0].open,
          high: Math.max(...chunk.map(k => k.high)),
          low: Math.min(...chunk.map(k => k.low)),
          close: chunk[chunk.length - 1].close,
          volume: chunk.reduce((s, k) => s + k.volume, 0),
        });
      }
      return result;
    };

    const calcVWAP = (data: KLine[]): number => {
      let totalTPV = 0;
      let totalVol = 0;
      for (const k of data) {
        const tp = (k.high + k.low + k.close) / 3;
        totalTPV += tp * k.volume;
        totalVol += k.volume;
      }
      return totalVol === 0 ? 0 : totalTPV / totalVol;
    };

    const detectCandlePattern = (prev: KLine, curr: KLine): string => {
      const body = Math.abs(curr.close - curr.open);
      const range = curr.high - curr.low;
      const prevBody = Math.abs(prev.close - prev.open);

      if (range === 0) return 'doji';
      if (body / range < 0.1) return 'doji';

      const isBullish = curr.close > curr.open;
      const isPrevBullish = prev.close > prev.open;

      if (isBullish !== isPrevBullish && body > prevBody * 1.5) {
        return isBullish ? 'bullish_engulfing' : 'bearish_engulfing';
      }

      const upperShadow = curr.high - Math.max(curr.open, curr.close);
      const lowerShadow = Math.min(curr.open, curr.close) - curr.low;

      if (lowerShadow > body * 2 && upperShadow < body * 0.5) return 'hammer';
      if (upperShadow > body * 2 && lowerShadow < body * 0.5) return 'shooting_star';

      return 'normal';
    };

    it('resample should reduce data points', () => {
      const data: KLine[] = Array.from({ length: 10 }, (_, i) => ({
        date: `2024-01-${String(i + 1).padStart(2, '0')}`,
        open: 100 + i, high: 105 + i, low: 95 + i, close: 102 + i, volume: 1000 + i * 100,
      }));
      const resampled = resampleKLine(data, 3);
      expect(resampled.length).toBe(4);
    });

    it('resampled OHLC should be correct', () => {
      const data: KLine[] = [
        { date: '2024-01-01', open: 100, high: 110, low: 90, close: 105, volume: 1000 },
        { date: '2024-01-02', open: 105, high: 115, low: 95, close: 110, volume: 2000 },
      ];
      const resampled = resampleKLine(data, 2);
      expect(resampled[0].open).toBe(100);
      expect(resampled[0].high).toBe(115);
      expect(resampled[0].low).toBe(90);
      expect(resampled[0].close).toBe(110);
      expect(resampled[0].volume).toBe(3000);
    });

    it('VWAP should be within high-low range', () => {
      const data: KLine[] = [
        { date: '2024-01-01', open: 100, high: 110, low: 90, close: 105, volume: 1000 },
        { date: '2024-01-02', open: 105, high: 115, low: 95, close: 110, volume: 2000 },
      ];
      const vwap = calcVWAP(data);
      expect(vwap).toBeGreaterThan(90);
      expect(vwap).toBeLessThan(115);
    });

    it('VWAP with zero volume', () => {
      const data: KLine[] = [
        { date: '2024-01-01', open: 100, high: 110, low: 90, close: 105, volume: 0 },
      ];
      expect(calcVWAP(data)).toBe(0);
    });

    it('doji detection', () => {
      const prev: KLine = { date: 'd1', open: 100, high: 110, low: 90, close: 105, volume: 1000 };
      const curr: KLine = { date: 'd2', open: 105, high: 115, low: 95, close: 105, volume: 1000 };
      expect(detectCandlePattern(prev, curr)).toBe('doji');
    });

    it('bullish engulfing detection', () => {
      const prev: KLine = { date: 'd1', open: 110, high: 112, low: 105, close: 106, volume: 1000 };
      const curr: KLine = { date: 'd2', open: 104, high: 115, low: 103, close: 114, volume: 2000 };
      expect(detectCandlePattern(prev, curr)).toBe('bullish_engulfing');
    });

    it('hammer detection', () => {
      const prev: KLine = { date: 'd1', open: 100, high: 110, low: 90, close: 105, volume: 1000 };
      const curr: KLine = { date: 'd2', open: 100, high: 104, low: 85, close: 103, volume: 1000 };
      expect(detectCandlePattern(prev, curr)).toBe('hammer');
    });
  });

  // 金额格式化
  describe('Amount Formatting', () => {
    const formatAmount = (amount: number): string => {
      if (amount >= 1e12) return (amount / 1e12).toFixed(2) + '万亿';
      if (amount >= 1e8) return (amount / 1e8).toFixed(2) + '亿';
      if (amount >= 1e4) return (amount / 1e4).toFixed(2) + '万';
      return amount.toFixed(2);
    };

    const formatVolume = (vol: number): string => {
      if (vol >= 1e8) return (vol / 1e8).toFixed(2) + '亿股';
      if (vol >= 1e4) return (vol / 1e4).toFixed(2) + '万股';
      return vol + '股';
    };

    it('万亿 format', () => {
      expect(formatAmount(2.5e12)).toBe('2.50万亿');
    });

    it('亿 format', () => {
      expect(formatAmount(5e8)).toBe('5.00亿');
    });

    it('万 format', () => {
      expect(formatAmount(15000)).toBe('1.50万');
    });

    it('small amount', () => {
      expect(formatAmount(500)).toBe('500.00');
    });

    it('亿股 format', () => {
      expect(formatVolume(3e8)).toBe('3.00亿股');
    });

    it('万股 format', () => {
      expect(formatVolume(50000)).toBe('5.00万股');
    });

    it('small volume', () => {
      expect(formatVolume(500)).toBe('500股');
    });
  });

  // 行业指数计算
  describe('Sector Index Calculation', () => {
    const calcSectorIndex = (stocks: Array<{ weight: number; changePercent: number }>): number => {
      if (stocks.length === 0) return 0;
      const totalWeight = stocks.reduce((s, st) => s + st.weight, 0);
      if (totalWeight === 0) return 0;
      return stocks.reduce((s, st) => s + (st.weight / totalWeight) * st.changePercent, 0);
    };

    const calcEqualWeightIndex = (stocks: Array<{ changePercent: number }>): number => {
      if (stocks.length === 0) return 0;
      return stocks.reduce((s, st) => s + st.changePercent, 0) / stocks.length;
    };

    it('weighted sector index', () => {
      const stocks = [
        { weight: 0.5, changePercent: 2 },
        { weight: 0.3, changePercent: -1 },
        { weight: 0.2, changePercent: 3 },
      ];
      const idx = calcSectorIndex(stocks);
      expect(idx).toBeCloseTo(1.3, 1);
    });

    it('equal weight index', () => {
      const stocks = [{ changePercent: 2 }, { changePercent: 4 }];
      expect(calcEqualWeightIndex(stocks)).toBe(3);
    });

    it('empty sector should return 0', () => {
      expect(calcSectorIndex([])).toBe(0);
      expect(calcEqualWeightIndex([])).toBe(0);
    });

    it('single stock sector', () => {
      const stocks = [{ weight: 1, changePercent: 5 }];
      expect(calcSectorIndex(stocks)).toBe(5);
    });

    it('zero weight should return 0', () => {
      const stocks = [{ weight: 0, changePercent: 5 }];
      expect(calcSectorIndex(stocks)).toBe(0);
    });
  });

  // 技术信号检测
  describe('Technical Signal Detection', () => {
    const detectGoldenCross = (short: number[], long: number[]): number[] => {
      const signals: number[] = [];
      for (let i = 1; i < Math.min(short.length, long.length); i++) {
        if (short[i] > long[i] && short[i - 1] <= long[i - 1]) signals.push(i);
      }
      return signals;
    };

    const detectDivergence = (prices: number[], indicator: number[]): 'bullish' | 'bearish' | null => {
      if (prices.length < 3 || indicator.length < 3) return null;
      const pTrend = prices[prices.length - 1] - prices[prices.length - 3];
      const iTrend = indicator[indicator.length - 1] - indicator[indicator.length - 3];
      if (pTrend < 0 && iTrend > 0) return 'bullish';
      if (pTrend > 0 && iTrend < 0) return 'bearish';
      return null;
    };

    const detectSupportResistance = (prices: number[], lookback: number = 20): { support: number; resistance: number } => {
      const recent = prices.slice(-lookback);
      return {
        support: Math.min(...recent),
        resistance: Math.max(...recent),
      };
    };

    it('golden cross detection', () => {
      const short = [10, 11, 12, 13, 14];
      const long = [12, 12, 12, 12, 12];
      const signals = detectGoldenCross(short, long);
      expect(signals.length).toBeGreaterThan(0);
    });

    it('no golden cross in downtrend', () => {
      const short = [20, 18, 16, 14, 12];
      const long = [15, 14, 13, 12, 11];
      const signals = detectGoldenCross(short, long);
      expect(signals.length).toBe(0);
    });

    it('bullish divergence', () => {
      const prices = [100, 95, 90];
      const indicator = [30, 35, 40];
      expect(detectDivergence(prices, indicator)).toBe('bullish');
    });

    it('bearish divergence', () => {
      const prices = [90, 95, 100];
      const indicator = [70, 65, 60];
      expect(detectDivergence(prices, indicator)).toBe('bearish');
    });

    it('no divergence', () => {
      const prices = [90, 95, 100];
      const indicator = [30, 35, 40];
      expect(detectDivergence(prices, indicator)).toBeNull();
    });

    it('support and resistance', () => {
      const prices = [100, 105, 95, 110, 92, 108];
      const sr = detectSupportResistance(prices, 6);
      expect(sr.support).toBe(92);
      expect(sr.resistance).toBe(110);
    });

    it('insufficient data for divergence', () => {
      expect(detectDivergence([1], [1])).toBeNull();
    });
  });

  // 收益计算
  describe('Return Calculations', () => {
    const calcCompoundReturn = (returns: number[]): number => {
      return returns.reduce((acc, r) => acc * (1 + r), 1) - 1;
    };

    const calcAnnualizedReturn = (totalReturn: number, days: number): number => {
      if (days <= 0) return 0;
      return Math.pow(1 + totalReturn, 365 / days) - 1;
    };

    const calcMaxDrawdownSeries = (equity: number[]): { maxDd: number; peak: number; trough: number } => {
      let peak = equity[0], trough = equity[0], maxDd = 0, currentPeak = equity[0];
      for (const v of equity) {
        if (v > currentPeak) currentPeak = v;
        const dd = (currentPeak - v) / currentPeak;
        if (dd > maxDd) {
          maxDd = dd;
          peak = currentPeak;
          trough = v;
        }
      }
      return { maxDd, peak, trough };
    };

    it('compound return calculation', () => {
      expect(calcCompoundReturn([0.1, 0.1])).toBeCloseTo(0.21, 2);
      expect(calcCompoundReturn([0, 0, 0])).toBe(0);
    });

    it('negative compound return', () => {
      expect(calcCompoundReturn([-0.1, -0.1])).toBeCloseTo(-0.19, 2);
    });

    it('annualized return 1 year', () => {
      expect(calcAnnualizedReturn(0.1, 365)).toBeCloseTo(0.1, 3);
    });

    it('annualized return half year', () => {
      const ar = calcAnnualizedReturn(0.05, 182);
      expect(ar).toBeGreaterThan(0.05);
    });

    it('max drawdown calculation', () => {
      const equity = [100, 110, 105, 120, 90, 95, 130];
      const { maxDd, peak, trough } = calcMaxDrawdownSeries(equity);
      expect(maxDd).toBeCloseTo(0.25, 2);
      expect(peak).toBe(120);
      expect(trough).toBe(90);
    });

    it('rising equity should have zero drawdown', () => {
      const equity = [100, 110, 120, 130, 140];
      expect(calcMaxDrawdownSeries(equity).maxDd).toBe(0);
    });

    it('zero days annualized should be 0', () => {
      expect(calcAnnualizedReturn(0.1, 0)).toBe(0);
    });
  });
});
