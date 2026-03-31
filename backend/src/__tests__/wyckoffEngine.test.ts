import { describe, it, expect } from 'vitest';

describe('威科夫方法分析引擎', () => {
  interface WyckoffPhase {
    phase: 'accumulation' | 'markup' | 'distribution' | 'markdown' | 'unknown';
    confidence: number;
    spring: boolean;
    upthrust: boolean;
    signOfStrength: boolean;
    signOfWeakness: boolean;
  }

  function volumeSpreadAnalysis(highs: number[], lows: number[], closes: number[], volumes: number[]) {
    return closes.map((c, i) => {
      const spread = highs[i] - lows[i];
      const closingPosition = spread === 0 ? 0.5 : (c - lows[i]) / spread;
      const volRatio = volumes[i] / (volumes.slice(Math.max(0, i - 9), i + 1).reduce((a, b) => a + b, 0) / Math.min(10, i + 1));
      let type: 'effort_up' | 'effort_down' | 'no_demand' | 'no_supply' | 'stopping_volume' | 'normal';
      if (volRatio > 1.5 && closingPosition > 0.7 && spread > 0) type = 'effort_up';
      else if (volRatio > 1.5 && closingPosition < 0.3) type = 'effort_down';
      else if (volRatio < 0.5 && closingPosition > 0.7) type = 'no_demand';
      else if (volRatio < 0.5 && closingPosition < 0.3) type = 'no_supply';
      else if (volRatio > 2 && spread > 0 && closingPosition > 0.3 && closingPosition < 0.7) type = 'stopping_volume';
      else type = 'normal';
      return { spread, closingPosition, volRatio, type };
    });
  }

  function detectWyckoffPhase(highs: number[], lows: number[], closes: number[], volumes: number[], window = 20): WyckoffPhase {
    if (closes.length < window) return { phase: 'unknown', confidence: 0, spring: false, upthrust: false, signOfStrength: false, signOfWeakness: false };
    const slice = { h: highs.slice(-window), l: lows.slice(-window), c: closes.slice(-window), v: volumes.slice(-window) };
    const range = Math.max(...slice.h) - Math.min(...slice.l);
    const avgRange = slice.h.map((h, i) => h - slice.l[i]).reduce((a, b) => a + b, 0) / window;
    const recentRange = slice.h.slice(-5).map((h, i) => h - slice.l[slice.l.length - 5 + i]).reduce((a, b) => a + b, 0) / 5;
    const avgVol = slice.v.reduce((a, b) => a + b, 0) / window;
    const recentVol = slice.v.slice(-5).reduce((a, b) => a + b, 0) / 5;
    const priceChange = (slice.c[window - 1] - slice.c[0]) / slice.c[0];
    const support = Math.min(...slice.l);
    const resistance = Math.max(...slice.h);
    // Spring: price breaks below support then recovers
    const springs = slice.l.map((l, i) => l < support * 1.01 && slice.c[i] > support).filter(Boolean);
    // Upthrust: price breaks above resistance then falls back
    const upthrusts = slice.h.map((h, i) => h > resistance * 0.99 && slice.c[i] < resistance).filter(Boolean);
    const sos = recentVol > avgVol * 1.2 && priceChange > 0.02;
    const sow = recentVol > avgVol * 1.2 && priceChange < -0.02;
    let phase: WyckoffPhase['phase'] = 'unknown';
    let confidence = 0;
    if (recentRange < avgRange * 0.6 && recentVol < avgVol * 0.8) {
      phase = 'accumulation'; confidence = 0.7;
    } else if (priceChange > 0.05 && recentVol > avgVol) {
      phase = 'markup'; confidence = 0.8;
    } else if (recentRange < avgRange * 0.6 && recentVol > avgVol * 0.8) {
      phase = 'distribution'; confidence = 0.6;
    } else if (priceChange < -0.05 && recentVol > avgVol) {
      phase = 'markdown'; confidence = 0.8;
    }
    return {
      phase, confidence,
      spring: springs.length > 0,
      upthrust: upthrusts.length > 0,
      signOfStrength: sos,
      signOfWeakness: sow,
    };
  }

  function compositeMan(highs: number[], lows: number[], closes: number[], volumes: number[]) {
    // Smart money activity detection
    const vsa = volumeSpreadAnalysis(highs, lows, closes, volumes);
    return closes.map((c, i) => {
      const activity = vsa[i];
      let action: 'accumulating' | 'distributing' | 'neutral' = 'neutral';
      if (activity.type === 'effort_up' && activity.closingPosition > 0.5) action = 'accumulating';
      else if (activity.type === 'effort_down' && activity.closingPosition < 0.5) action = 'distributing';
      else if (activity.type === 'no_demand') action = 'accumulating';
      else if (activity.type === 'no_supply') action = 'distributing';
      return { price: c, action, vsaType: activity.type };
    });
  }

  function wyckoffCauseEffect(prices: number[], volumes: number[], window: number) {
    if (prices.length < window * 2) return [];
    const results: { cause: number; effect: number; ratio: number }[] = [];
    for (let i = window; i < prices.length - window; i++) {
      const cause = volumes.slice(i - window, i).reduce((s, v) => s + v, 0) / window;
      const effect = Math.abs(prices[i + window - 1] - prices[i]);
      results.push({ cause, effect, ratio: cause > 0 ? effect / cause : 0 });
    }
    return results;
  }

  const n = 60;
  const testHighs = Array.from({ length: n }, (_, i) => 105 + Math.sin(i / 5) * 8 + Math.random() * 2);
  const testLows = testHighs.map(h => h - 2 - Math.random());
  const testCloses = testHighs.map((h, i) => (h + testLows[i]) / 2);
  const testVolumes = Array.from({ length: n }, () => 1000 + Math.random() * 5000);

  describe('量价分析 (VSA)', () => {
    it('返回正确长度', () => {
      const vsa = volumeSpreadAnalysis(testHighs, testLows, testCloses, testVolumes);
      expect(vsa.length).toBe(n);
    });

    it('价差非负', () => {
      const vsa = volumeSpreadAnalysis(testHighs, testLows, testCloses, testVolumes);
      vsa.forEach(v => expect(v.spread).toBeGreaterThanOrEqual(0));
    });

    it('收盘位置在0-1', () => {
      const vsa = volumeSpreadAnalysis(testHighs, testLows, testCloses, testVolumes);
      vsa.forEach(v => {
        expect(v.closingPosition).toBeGreaterThanOrEqual(0);
        expect(v.closingPosition).toBeLessThanOrEqual(1);
      });
    });

    it('类型有效', () => {
      const vsa = volumeSpreadAnalysis(testHighs, testLows, testCloses, testVolumes);
      const validTypes = ['effort_up', 'effort_down', 'no_demand', 'no_supply', 'stopping_volume', 'normal'];
      vsa.forEach(v => expect(validTypes).toContain(v.type));
    });
  });

  describe('威科夫阶段检测', () => {
    it('阶段检测有效', () => {
      const phase = detectWyckoffPhase(testHighs, testLows, testCloses, testVolumes);
      expect(['accumulation', 'markup', 'distribution', 'markdown', 'unknown']).toContain(phase.phase);
    });

    it('数据不足返回unknown', () => {
      const phase = detectWyckoffPhase([1, 2], [1, 2], [1, 2], [1, 2]);
      expect(phase.phase).toBe('unknown');
    });

    it('置信度在0-1', () => {
      const phase = detectWyckoffPhase(testHighs, testLows, testCloses, testVolumes);
      expect(phase.confidence).toBeGreaterThanOrEqual(0);
      expect(phase.confidence).toBeLessThanOrEqual(1);
    });

    it('布尔标志', () => {
      const phase = detectWyckoffPhase(testHighs, testLows, testCloses, testVolumes);
      expect(typeof phase.spring).toBe('boolean');
      expect(typeof phase.upthrust).toBe('boolean');
    });
  });

  describe('综合人分析', () => {
    it('返回数组', () => {
      const cm = compositeMan(testHighs, testLows, testCloses, testVolumes);
      expect(cm.length).toBe(n);
    });

    it('操作类型有效', () => {
      const cm = compositeMan(testHighs, testLows, testCloses, testVolumes);
      cm.forEach(c => expect(['accumulating', 'distributing', 'neutral']).toContain(c.action));
    });
  });

  describe('因果关系', () => {
    it('返回因果比', () => {
      const ce = wyckoffCauseEffect(testCloses, testVolumes, 10);
      ce.forEach(c => {
        expect(c.cause).toBeGreaterThanOrEqual(0);
        expect(c.effect).toBeGreaterThanOrEqual(0);
        expect(c.ratio).toBeGreaterThanOrEqual(0);
      });
    });
  });
});
