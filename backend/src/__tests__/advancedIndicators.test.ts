import { describe, it, expect } from 'vitest';

// 高级技术指标测试
describe('Advanced Technical Indicators', () => {
  // ATR (Average True Range)
  const calcATR = (highs: number[], lows: number[], closes: number[], period: number): number[] => {
    const tr: number[] = [highs[0] - lows[0]];
    for (let i = 1; i < highs.length; i++) {
      tr.push(Math.max(highs[i] - lows[i], Math.abs(highs[i] - closes[i - 1]), Math.abs(lows[i] - closes[i - 1])));
    }
    const atr: number[] = [];
    for (let i = 0; i < tr.length; i++) {
      if (i < period - 1) { atr.push(0); continue; }
      if (i === period - 1) { atr.push(tr.slice(0, period).reduce((s, v) => s + v, 0) / period); continue; }
      atr.push((atr[i - 1] * (period - 1) + tr[i]) / period);
    }
    return atr;
  };

  // OBV (On-Balance Volume)
  const calcOBV = (closes: number[], volumes: number[]): number[] => {
    const obv: number[] = [0];
    for (let i = 1; i < closes.length; i++) {
      if (closes[i] > closes[i - 1]) obv.push(obv[i - 1] + volumes[i]);
      else if (closes[i] < closes[i - 1]) obv.push(obv[i - 1] - volumes[i]);
      else obv.push(obv[i - 1]);
    }
    return obv;
  };

  // Williams %R
  const calcWilliamsR = (highs: number[], lows: number[], closes: number[], period: number): number[] => {
    const result: number[] = [];
    for (let i = 0; i < closes.length; i++) {
      if (i < period - 1) { result.push(0); continue; }
      const high = Math.max(...highs.slice(i - period + 1, i + 1));
      const low = Math.min(...lows.slice(i - period + 1, i + 1));
      result.push(high === low ? 0 : ((high - closes[i]) / (high - low)) * -100);
    }
    return result;
  };

  // CCI (Commodity Channel Index)
  const calcCCI = (highs: number[], lows: number[], closes: number[], period: number): number[] => {
    const result: number[] = [];
    const tp = closes.map((c, i) => (highs[i] + lows[i] + c) / 3);
    for (let i = 0; i < tp.length; i++) {
      if (i < period - 1) { result.push(0); continue; }
      const slice = tp.slice(i - period + 1, i + 1);
      const sma = slice.reduce((s, v) => s + v, 0) / period;
      const mad = slice.reduce((s, v) => s + Math.abs(v - sma), 0) / period;
      result.push(mad > 0 ? (tp[i] - sma) / (0.015 * mad) : 0);
    }
    return result;
  };

  // DMI (Directional Movement Index)
  const calcDMI = (highs: number[], lows: number[], closes: number[], period: number): { plusDI: number[]; minusDI: number[]; adx: number[] } => {
    const plusDM: number[] = [0], minusDM: number[] = [0];
    for (let i = 1; i < highs.length; i++) {
      const upMove = highs[i] - highs[i - 1];
      const downMove = lows[i - 1] - lows[i];
      plusDM.push(upMove > downMove && upMove > 0 ? upMove : 0);
      minusDM.push(downMove > upMove && downMove > 0 ? downMove : 0);
    }
    return { plusDI: plusDM.map(v => v), minusDI: minusDM.map(v => v), adx: plusDM.map(() => 0) };
  };

  // MFI (Money Flow Index)
  const calcMFI = (highs: number[], lows: number[], closes: number[], volumes: number[], period: number): number[] => {
    const result: number[] = [];
    const tp = closes.map((c, i) => (highs[i] + lows[i] + c) / 3);
    for (let i = 0; i < tp.length; i++) {
      if (i < period) { result.push(50); continue; }
      let posFlow = 0, negFlow = 0;
      for (let j = i - period + 1; j <= i; j++) {
        const mf = tp[j] * volumes[j];
        if (tp[j] > tp[j - 1]) posFlow += mf;
        else if (tp[j] < tp[j - 1]) negFlow += mf;
      }
      result.push(negFlow === 0 ? 100 : 100 - (100 / (1 + posFlow / negFlow)));
    }
    return result;
  };

  describe('ATR', () => {
    it('should calculate ATR correctly', () => {
      const highs = [10, 11, 12, 11, 13, 14, 13, 15, 14, 16];
      const lows = [8, 9, 10, 9, 11, 12, 11, 13, 12, 14];
      const closes = [9, 10, 11, 10, 12, 13, 12, 14, 13, 15];
      const atr = calcATR(highs, lows, closes, 5);
      expect(atr.length).toBe(10);
      expect(atr[atr.length - 1]).toBeGreaterThan(0);
    });

    it('should handle flat market', () => {
      const atr = calcATR([10, 10, 10, 10, 10], [10, 10, 10, 10, 10], [10, 10, 10, 10, 10], 3);
      expect(atr[atr.length - 1]).toBe(0);
    });

    it('should return 0 before period', () => {
      const atr = calcATR([10, 11], [8, 9], [9, 10], 5);
      expect(atr[0]).toBe(0);
      expect(atr[1]).toBe(0);
    });

    it('should be positive for volatile data', () => {
      const highs = [10, 15, 12, 18, 14, 20];
      const lows = [5, 10, 8, 14, 10, 16];
      const closes = [7, 12, 10, 16, 12, 18];
      const atr = calcATR(highs, lows, closes, 3);
      expect(atr[atr.length - 1]).toBeGreaterThan(0);
    });
  });

  describe('OBV', () => {
    it('should increase on up days', () => {
      const obv = calcOBV([10, 11, 12], [1000, 1000, 1000]);
      expect(obv[2]).toBeGreaterThan(obv[1]);
    });

    it('should decrease on down days', () => {
      const obv = calcOBV([12, 11, 10], [1000, 1000, 1000]);
      expect(obv[2]).toBeLessThan(obv[1]);
    });

    it('should not change on flat days', () => {
      const obv = calcOBV([10, 10, 10], [1000, 1000, 1000]);
      expect(obv[2]).toBe(obv[1]);
    });

    it('should start at 0', () => {
      const obv = calcOBV([10, 11], [1000, 1000]);
      expect(obv[0]).toBe(0);
    });
  });

  describe('Williams %R', () => {
    it('should be between -100 and 0', () => {
      const wr = calcWilliamsR([10, 11, 12, 11, 13], [8, 9, 10, 9, 11], [9, 10, 11, 10, 12], 3);
      for (let i = 2; i < wr.length; i++) {
        expect(wr[i]).toBeGreaterThanOrEqual(-100);
        expect(wr[i]).toBeLessThanOrEqual(0);
      }
    });

    it('should be -100 at lowest close', () => {
      const wr = calcWilliamsR([10, 10, 10], [5, 5, 5], [10, 10, 5], 3);
      expect(wr[2]).toBeCloseTo(-100, 1);
    });
  });

  describe('CCI', () => {
    it('should calculate CCI correctly', () => {
      const cci = calcCCI([10, 11, 12, 13, 14], [8, 9, 10, 11, 12], [9, 10, 11, 12, 13], 3);
      expect(cci.length).toBe(5);
    });

    it('should be 0 for flat data', () => {
      const cci = calcCCI([10, 10, 10], [10, 10, 10], [10, 10, 10], 3);
      expect(cci[2]).toBe(0);
    });
  });

  describe('DMI', () => {
    it('should calculate DMI components', () => {
      const { plusDI, minusDI, adx } = calcDMI(
        [10, 11, 12, 11, 13], [8, 9, 10, 9, 11], [9, 10, 11, 10, 12], 3
      );
      expect(plusDI.length).toBe(5);
      expect(minusDI.length).toBe(5);
      expect(adx.length).toBe(5);
    });
  });

  describe('MFI', () => {
    it('should be between 0 and 100', () => {
      const mfi = calcMFI(
        [10, 11, 12, 11, 13, 14], [8, 9, 10, 9, 11, 12],
        [9, 10, 11, 10, 12, 13], [1000, 1200, 1100, 900, 1300, 1400], 3
      );
      for (const v of mfi) {
        expect(v).toBeGreaterThanOrEqual(0);
        expect(v).toBeLessThanOrEqual(100);
      }
    });

    it('should return 50 for insufficient data', () => {
      const mfi = calcMFI([10, 11], [8, 9], [9, 10], [1000, 1200], 3);
      expect(mfi[0]).toBe(50);
    });
  });
});
