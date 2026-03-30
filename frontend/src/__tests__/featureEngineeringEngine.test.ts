import { describe, it, expect } from 'vitest';
import {
  calculateSMA,
  calculateEMA,
  calculateRSI,
  calculateMACD,
  calculateBollingerBands,
  calculateATR,
  calculateOBV,
  calculateVWAP,
  calculateStochastic,
  calculateWilliamsR,
  calculateCCI,
  calculateMomentum,
  calculateROC,
  calculateADX,
  standardize,
  minMaxScale,
  calculateFeatureIC,
  generateFeatureMatrix,
} from '../utils/featureEngineeringEngine';

const prices = Array.from({ length: 50 }, (_, i) => 100 + Math.sin(i * 0.2) * 5 + i * 0.1);
const high = prices.map(p => p + Math.random());
const low = prices.map(p => p - Math.random());
const close = prices;
const volume = Array.from({ length: 50 }, () => Math.floor(Math.random() * 100000 + 50000));

describe('calculateSMA', () => {
  it('should calculate simple moving average', () => {
    const sma = calculateSMA(prices, 5);
    expect(sma.length).toBe(prices.length);
    expect(isNaN(sma[0])).toBe(true);
    expect(isNaN(sma[4])).toBe(false);
    expect(sma[4]).toBeCloseTo(prices.slice(0, 5).reduce((a, b) => a + b, 0) / 5, 5);
  });
});

describe('calculateEMA', () => {
  it('should calculate exponential moving average', () => {
    const ema = calculateEMA(prices, 5);
    expect(ema.length).toBe(prices.length);
    expect(ema[0]).toBe(prices[0]);
  });
});

describe('calculateRSI', () => {
  it('should calculate RSI', () => {
    const rsi = calculateRSI(prices, 14);
    expect(rsi.length).toBe(prices.length);
    // RSI should be between 0 and 100
    rsi.filter(v => !isNaN(v)).forEach(v => {
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(100);
    });
  });
});

describe('calculateMACD', () => {
  it('should calculate MACD', () => {
    const macd = calculateMACD(prices);
    expect(macd.macd.length).toBe(prices.length);
    expect(macd.signal.length).toBe(prices.length);
    expect(macd.histogram.length).toBe(prices.length);
  });

  it('histogram should be macd minus signal', () => {
    const macd = calculateMACD(prices);
    for (let i = 15; i < prices.length; i++) {
      expect(macd.histogram[i]).toBeCloseTo(macd.macd[i] - macd.signal[i], 5);
    }
  });
});

describe('calculateBollingerBands', () => {
  it('should calculate Bollinger Bands', () => {
    const bb = calculateBollingerBands(prices);
    expect(bb.upper.length).toBe(prices.length);
    expect(bb.middle.length).toBe(prices.length);
    expect(bb.lower.length).toBe(prices.length);
    // Upper > Middle > Lower for valid points
    for (let i = 19; i < prices.length; i++) {
      expect(bb.upper[i]).toBeGreaterThan(bb.middle[i]);
      expect(bb.lower[i]).toBeLessThan(bb.middle[i]);
    }
  });
});

describe('calculateATR', () => {
  it('should calculate Average True Range', () => {
    const atr = calculateATR(high, low, close);
    expect(atr.length).toBe(close.length);
    atr.filter(v => !isNaN(v)).forEach(v => expect(v).toBeGreaterThanOrEqual(0));
  });
});

describe('calculateOBV', () => {
  it('should calculate On-Balance Volume', () => {
    const obv = calculateOBV(close, volume);
    expect(obv.length).toBe(close.length);
    expect(obv[0]).toBe(volume[0]);
  });
});

describe('calculateVWAP', () => {
  it('should calculate VWAP', () => {
    const vwap = calculateVWAP(high, low, close, volume);
    expect(vwap.length).toBe(close.length);
    expect(vwap[0]).toBeGreaterThan(0);
  });
});

describe('calculateStochastic', () => {
  it('should calculate stochastic oscillator', () => {
    const stoch = calculateStochastic(high, low, close);
    expect(stoch.k.length).toBe(close.length);
    expect(stoch.d.length).toBe(close.length);
    stoch.k.filter(v => !isNaN(v)).forEach(v => {
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(100);
    });
  });
});

describe('calculateWilliamsR', () => {
  it('should calculate Williams %R', () => {
    const wr = calculateWilliamsR(high, low, close);
    expect(wr.length).toBe(close.length);
    wr.filter(v => !isNaN(v)).forEach(v => {
      expect(v).toBeGreaterThanOrEqual(-100);
      expect(v).toBeLessThanOrEqual(0);
    });
  });
});

describe('calculateCCI', () => {
  it('should calculate CCI', () => {
    const cci = calculateCCI(high, low, close);
    expect(cci.length).toBe(close.length);
  });
});

describe('calculateMomentum', () => {
  it('should calculate momentum', () => {
    const mom = calculateMomentum(prices);
    expect(mom.length).toBe(prices.length);
    expect(isNaN(mom[0])).toBe(true);
    expect(mom[10]).toBeCloseTo(prices[10] - prices[0], 5);
  });
});

describe('calculateROC', () => {
  it('should calculate rate of change', () => {
    const roc = calculateROC(prices);
    expect(roc.length).toBe(prices.length);
  });
});

describe('calculateADX', () => {
  it('should calculate ADX', () => {
    const adx = calculateADX(high, low, close);
    expect(adx.length).toBe(close.length);
  });
});

describe('standardize', () => {
  it('should standardize values to mean 0 std 1', () => {
    const values = [1, 2, 3, 4, 5];
    const result = standardize(values);
    const mean = result.reduce((a, b) => a + b, 0) / result.length;
    expect(mean).toBeCloseTo(0, 5);
  });

  it('should handle NaN values', () => {
    const result = standardize([1, NaN, 3]);
    expect(isNaN(result[1])).toBe(true);
  });
});

describe('minMaxScale', () => {
  it('should scale to [0, 1]', () => {
    const result = minMaxScale([1, 2, 3, 4, 5]);
    expect(result[0]).toBe(0);
    expect(result[4]).toBe(1);
  });

  it('should handle NaN values', () => {
    const result = minMaxScale([1, NaN, 3]);
    expect(isNaN(result[1])).toBe(true);
  });
});

describe('calculateFeatureIC', () => {
  it('should calculate information coefficient', () => {
    const features = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
    const labels = [1.1, 2.2, 2.8, 4.1, 5.3, 5.8, 7.2, 7.9, 9.1, 10.2];
    const ic = calculateFeatureIC(features, labels);
    expect(ic).toBeGreaterThan(0.9);
  });

  it('should return 0 for insufficient data', () => {
    expect(calculateFeatureIC([1], [2])).toBe(0);
  });
});

describe('generateFeatureMatrix', () => {
  it('should generate feature vectors', () => {
    const features = generateFeatureMatrix(prices, high, low, close, volume);
    expect(features.length).toBe(prices.length);
    expect(features[25].features.sma5_ratio).toBeDefined();
    expect(features[25].features.rsi).toBeDefined();
    expect(features[25].features.macd).toBeDefined();
  });
});
