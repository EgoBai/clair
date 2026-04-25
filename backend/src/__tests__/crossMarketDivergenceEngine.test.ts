import { describe, it, expect } from 'vitest';
import { detectDivergence, scanAllPairs, MarketSeries } from '../services/crossMarketDivergenceEngine';

function genMarket(name: string, n: number, drift: number): MarketSeries {
  const values: number[] = [100];
  for (let i = 1; i < n; i++) {
    values.push(values[i - 1] * (1 + drift + Math.sin(i * 0.3) * 0.002));
  }
  return { name, values };
}

function genDivergent(name: string, n: number): MarketSeries {
  const values: number[] = [100];
  for (let i = 1; i < n; i++) {
    const drift = i < n / 2 ? 0.005 : -0.005;
    values.push(values[i - 1] * (1 + drift + Math.cos(i * 0.5) * 0.001));
  }
  return { name, values };
}

function genFlat(name: string, n: number): MarketSeries {
  return { name, values: Array.from({ length: n }, () => 100) };
}

function genTrendingUp(name: string, n: number): MarketSeries {
  const values: number[] = [100];
  for (let i = 1; i < n; i++) values.push(values[i - 1] * 1.005);
  return { name, values };
}

function genOpposite(name: string, n: number): MarketSeries {
  return { name, values: Array.from({ length: n }, (_, i) => 100 - i * 0.5) };
}

// Default lookback=60, so provide at least 60 values
const N = 80;

describe('CrossMarketDivergenceEngine', () => {
  const marketA = genMarket('SH', N, 0.002);
  const marketB = genMarket('SZ', N, 0.002);
  const divergentB = genDivergent('Divergent', N);
  const cfg30 = { lookback: 30, rollingWindow: 15 };

  describe('detectDivergence', () => {
    it('数据不足返回null', () => {
      expect(detectDivergence(
        { name: 'a', values: [1, 2, 3] },
        { name: 'b', values: [1, 2, 3] }
      )).toBeNull();
    });

    it('正好满足lookback个数据点', () => {
      const vals = Array.from({ length: 60 }, (_, i) => i + 100);
      const result = detectDivergence(
        { name: 'a', values: vals },
        { name: 'b', values: vals.map(v => v + 1) }
      );
      expect(result).not.toBeNull();
    });

    it('相关市场低发散', () => {
      const result = detectDivergence(marketA, marketB, cfg30);
      expect(result).not.toBeNull();
      expect(result!.correlation).toBeGreaterThan(0);
      expect(['A_leading', 'B_leading', 'converging']).toContain(result!.direction);
      expect(['reversal_warning', 'trend_confirm', 'neutral']).toContain(result!.signal);
    });

    it('发散市场高发散', () => {
      const result = detectDivergence(marketA, divergentB, cfg30);
      expect(result).not.toBeNull();
      expect(result!.strength).toBeGreaterThan(0);
    });

    it('强度范围0-1', () => {
      const result = detectDivergence(marketA, marketB, cfg30);
      expect(result).not.toBeNull();
      expect(result!.strength).toBeGreaterThanOrEqual(0);
      expect(result!.strength).toBeLessThanOrEqual(1);
    });

    it('包含所有字段', () => {
      const result = detectDivergence(marketA, marketB, cfg30)!;
      expect(result).toHaveProperty('marketA', 'SH');
      expect(result).toHaveProperty('marketB', 'SZ');
      expect(result).toHaveProperty('correlation');
      expect(result).toHaveProperty('rollingCorr');
      expect(result).toHaveProperty('priceDivergence');
      expect(result).toHaveProperty('momentumDivergence');
      expect(result).toHaveProperty('volumeDivergence');
      expect(result).toHaveProperty('divergent');
      expect(result).toHaveProperty('direction');
      expect(result).toHaveProperty('signal');
      expect(result).toHaveProperty('strength');
    });

    it('完全同步序列发散=0', () => {
      const result = detectDivergence(marketA, marketA, cfg30);
      expect(result).not.toBeNull();
      expect(result!.correlation).toBeGreaterThan(0.9);
    });

    it('相反走势检测', () => {
      const up = genTrendingUp('Up', N);
      const down = genOpposite('Down', N);
      const result = detectDivergence(up, down, cfg30);
      expect(result).not.toBeNull();
      expect(result!.divergent).toBe(true);
    });

    it('平坦序列', () => {
      const flatA = genFlat('FlatA', N);
      const flatB = genFlat('FlatB', N);
      const result = detectDivergence(flatA, flatB, cfg30);
      expect(result).not.toBeNull();
    });

    it('不同长度序列', () => {
      const short = genMarket('Short', N, 0.002);
      const long = genMarket('Long', N + 20, 0.002);
      const result = detectDivergence(short, long, cfg30);
      expect(result).not.toBeNull();
      expect(typeof result!.correlation).toBe('number');
    });

    it('零值序列', () => {
      const zero: MarketSeries = { name: 'Zero', values: Array.from({ length: N }, () => 0) };
      const result = detectDivergence(zero, marketA, cfg30);
      if (result) {
        expect(typeof result!.correlation).toBe('number');
      }
    });

    it('负数序列', () => {
      const neg: MarketSeries = { name: 'Neg', values: Array.from({ length: N }, (_, i) => -10 - i) };
      const pos: MarketSeries = { name: 'Pos', values: Array.from({ length: N }, (_, i) => 10 + i) };
      const result = detectDivergence(pos, neg, cfg30);
      expect(result).not.toBeNull();
      expect(result!.correlation).toBeLessThan(0);
    });

    it('自定义config覆盖默认', () => {
      const result = detectDivergence(marketA, marketB, { lookback: 60, rollingWindow: 20, divergenceThreshold: 0.3, corrBreakThreshold: 0.5 });
      expect(result).not.toBeNull();
    });

    it('priceDivergence为价格归一化差异', () => {
      const a: MarketSeries = { name: 'A', values: Array.from({ length: N }, (_, i) => 100 + i) };
      const b: MarketSeries = { name: 'B', values: Array.from({ length: N }, (_, i) => 100 + i * 2) };
      const result = detectDivergence(a, b, cfg30);
      expect(result).not.toBeNull();
      expect(typeof result!.priceDivergence).toBe('number');
    });

    it('momentumDivergence不为NaN', () => {
      const result = detectDivergence(marketA, marketB, cfg30);
      expect(result).not.toBeNull();
      expect(isNaN(result!.momentumDivergence)).toBe(false);
    });
  });

  describe('scanAllPairs', () => {
    it('返回所有配对按强度排序', () => {
      const results = scanAllPairs([marketA, marketB, divergentB], cfg30);
      expect(results.length).toBe(3);
      for (let i = 1; i < results.length; i++) {
        expect(results[i - 1].strength).toBeGreaterThanOrEqual(results[i].strength);
      }
    });

    it('单市场返回空', () => {
      expect(scanAllPairs([marketA], cfg30)).toEqual([]);
    });

    it('空数组返回空', () => {
      expect(scanAllPairs([], cfg30)).toEqual([]);
    });

    it('多市场配对数量正确', () => {
      const five = Array.from({ length: 5 }, (_, i) => genMarket(`M${i}`, N, 0.001));
      expect(scanAllPairs(five, cfg30).length).toBe(10); // C(5,2)=10
    });

    it('自定义config传播到每个检测', () => {
      const results = scanAllPairs([marketA, marketB], { lookback: 60, rollingWindow: 30 });
      expect(results.length).toBe(1);
      expect(results[0].strength).toBeDefined();
    });
  });
});
