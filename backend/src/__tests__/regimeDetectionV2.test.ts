import { describe, it, expect } from 'vitest';

// 市场状态检测引擎 v2
type MarketRegime = 'bull' | 'bear' | 'sideways' | 'volatile';

interface RegimeSignal {
  ma20AboveMa60: boolean;
  rsiAbove50: boolean;
  volumeTrend: 'increasing' | 'decreasing' | 'stable';
  volatilityLevel: 'low' | 'medium' | 'high';
  adxAbove25: boolean;
}

function detectRegime(signals: RegimeSignal): MarketRegime {
  let bullScore = 0, bearScore = 0;
  if (signals.ma20AboveMa60) bullScore += 2; else bearScore += 2;
  if (signals.rsiAbove50) bullScore += 1; else bearScore += 1;
  if (signals.volumeTrend === 'increasing') bullScore += 1;
  if (signals.volumeTrend === 'decreasing') bearScore += 1;
  if (signals.adxAbove25) bullScore += 1; else bearScore += 0.5;
  if (signals.volatilityLevel === 'high') return 'volatile';
  if (bullScore >= 4) return 'bull';
  if (bearScore >= 3) return 'bear';
  return 'sideways';
}

function calcRegimeTransitionProb(history: MarketRegime[]): Record<string, Record<string, number>> {
  const transitions: Record<string, Record<string, number>> = {};
  const counts: Record<string, number> = {};
  for (let i = 1; i < history.length; i++) {
    const from = history[i - 1], to = history[i];
    if (!transitions[from]) transitions[from] = {};
    transitions[from][to] = (transitions[from][to] || 0) + 1;
    counts[from] = (counts[from] || 0) + 1;
  }
  const probs: Record<string, Record<string, number>> = {};
  Object.keys(transitions).forEach(from => {
    probs[from] = {};
    Object.keys(transitions[from]).forEach(to => {
      probs[from][to] = transitions[from][to] / counts[from];
    });
  });
  return probs;
}

function calcRegimeDuration(history: MarketRegime[]): { regime: MarketRegime; duration: number }[] {
  if (history.length === 0) return [];
  const durations: { regime: MarketRegime; duration: number }[] = [];
  let current = history[0], count = 1;
  for (let i = 1; i < history.length; i++) {
    if (history[i] === current) count++;
    else { durations.push({ regime: current, duration: count }); current = history[i]; count = 1; }
  }
  durations.push({ regime: current, duration: count });
  return durations;
}

function calcMA(data: number[], period: number): number[] {
  return data.map((_, i) => {
    if (i < period - 1) return NaN;
    const slice = data.slice(i - period + 1, i + 1);
    return slice.reduce((a, b) => a + b, 0) / period;
  });
}

function calcRSI(prices: number[], period: number = 14): number[] {
  if (prices.length < period + 1) return [];
  const rsi: number[] = [];
  for (let i = period; i < prices.length; i++) {
    let gains = 0, losses = 0;
    for (let j = i - period + 1; j <= i; j++) {
      const diff = prices[j] - prices[j - 1];
      if (diff > 0) gains += diff; else losses -= diff;
    }
    const avgGain = gains / period, avgLoss = losses / period;
    if (avgLoss === 0) { rsi.push(100); continue; }
    const rs = avgGain / avgLoss;
    rsi.push(100 - 100 / (1 + rs));
  }
  return rsi;
}

function calcADX(highs: number[], lows: number[], closes: number[], period: number = 14): number[] {
  if (closes.length < period + 1) return [];
  const tr: number[] = [];
  const plusDM: number[] = [];
  const minusDM: number[] = [];
  for (let i = 1; i < closes.length; i++) {
    tr.push(Math.max(highs[i] - lows[i], Math.abs(highs[i] - closes[i-1]), Math.abs(lows[i] - closes[i-1])));
    const upMove = highs[i] - highs[i-1], downMove = lows[i-1] - lows[i];
    plusDM.push(upMove > downMove && upMove > 0 ? upMove : 0);
    minusDM.push(downMove > upMove && downMove > 0 ? downMove : 0);
  }
  if (tr.length < period) return [];
  const avgTR = tr.slice(0, period).reduce((a, b) => a + b, 0) / period;
  const avgPlus = plusDM.slice(0, period).reduce((a, b) => a + b, 0) / period;
  const avgMinus = minusDM.slice(0, period).reduce((a, b) => a + b, 0) / period;
  const plusDI = avgTR > 0 ? (avgPlus / avgTR) * 100 : 0;
  const minusDI = avgTR > 0 ? (avgMinus / avgTR) * 100 : 0;
  const dx = (plusDI + minusDI) > 0 ? Math.abs(plusDI - minusDI) / (plusDI + minusDI) * 100 : 0;
  return [dx];
}

describe('市场状态检测引擎 v2', () => {
  describe('状态检测', () => {
    it('牛市信号应检测为bull', () => {
      expect(detectRegime({
        ma20AboveMa60: true, rsiAbove50: true,
        volumeTrend: 'increasing', volatilityLevel: 'low', adxAbove25: true,
      })).toBe('bull');
    });

    it('熊市信号应检测为bear', () => {
      expect(detectRegime({
        ma20AboveMa60: false, rsiAbove50: false,
        volumeTrend: 'decreasing', volatilityLevel: 'low', adxAbove25: false,
      })).toBe('bear');
    });

    it('高波动应检测为volatile', () => {
      expect(detectRegime({
        ma20AboveMa60: true, rsiAbove50: true,
        volumeTrend: 'stable', volatilityLevel: 'high', adxAbove25: false,
      })).toBe('volatile');
    });

    it('混合信号应检测为sideways', () => {
      expect(detectRegime({
        ma20AboveMa60: true, rsiAbove50: false,
        volumeTrend: 'stable', volatilityLevel: 'low', adxAbove25: false,
      })).toBe('sideways');
    });
  });

  describe('状态转移概率', () => {
    it('应计算各状态转移概率', () => {
      const history: MarketRegime[] = ['bull', 'bull', 'sideways', 'bear', 'bear', 'sideways'];
      const probs = calcRegimeTransitionProb(history);
      expect(probs['bull']['bull']).toBeDefined();
      expect(probs['bull']['sideways']).toBeDefined();
    });

    it('概率之和应为1', () => {
      const history: MarketRegime[] = ['bull', 'bull', 'bear', 'bull', 'sideways', 'bull'];
      const probs = calcRegimeTransitionProb(history);
      Object.values(probs).forEach(trans => {
        const sum = Object.values(trans).reduce((a, b) => a + b, 0);
        expect(sum).toBeCloseTo(1, 5);
      });
    });
  });

  describe('状态持续期', () => {
    it('应正确计算各状态持续天数', () => {
      const history: MarketRegime[] = ['bull', 'bull', 'bull', 'bear', 'bear', 'sideways'];
      const durations = calcRegimeDuration(history);
      expect(durations[0]).toEqual({ regime: 'bull', duration: 3 });
      expect(durations[1]).toEqual({ regime: 'bear', duration: 2 });
    });

    it('空历史应返回空', () => {
      expect(calcRegimeDuration([])).toEqual([]);
    });
  });

  describe('技术指标', () => {
    it('MA应正确计算移动平均', () => {
      const data = [1, 2, 3, 4, 5];
      const ma3 = calcMA(data, 3);
      expect(ma3[2]).toBe(2);
      expect(ma3[4]).toBe(4);
    });

    it('RSI应在0-100之间', () => {
      const prices = [10, 10.5, 11, 10.8, 11.2, 11.5, 11.3, 12, 12.5, 12.2, 13, 13.5, 13.2, 14, 14.5, 15];
      const rsi = calcRSI(prices, 14);
      rsi.forEach(v => { expect(v).toBeGreaterThanOrEqual(0); expect(v).toBeLessThanOrEqual(100); });
    });

    it('ADX应返回正值', () => {
      const n = 20;
      const closes = Array.from({ length: n }, (_, i) => 100 + i);
      const highs = closes.map(c => c + 1);
      const lows = closes.map(c => c - 1);
      const adx = calcADX(highs, lows, closes, 14);
      expect(adx.length).toBeGreaterThan(0);
      adx.forEach(v => expect(v).toBeGreaterThanOrEqual(0));
    });
  });
});
