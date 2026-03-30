import { describe, it, expect } from 'vitest';

// 行业轮动动量计算
function calcSectorMomentum(prices: number[]): { momentum: number; trend: string; volatility: number } {
  if (prices.length < 2) return { momentum: 0, trend: 'flat', volatility: 0 };
  const returns: number[] = [];
  for (let i = 1; i < prices.length; i++) {
    returns.push((prices[i] - prices[i - 1]) / prices[i - 1]);
  }
  const avgReturn = returns.reduce((a, b) => a + b, 0) / returns.length;
  const variance = returns.reduce((sum, r) => sum + (r - avgReturn) ** 2, 0) / returns.length;
  const volatility = Math.sqrt(variance);
  const momentum = avgReturn * 100;
  const trend = momentum > 2 ? 'up' : momentum < -2 ? 'down' : 'flat';
  return { momentum: +momentum.toFixed(4), trend, volatility: +volatility.toFixed(4) };
}

// 板块相对强弱
function calcRelativeStrength(sectorReturns: number[], marketReturns: number[]): number {
  if (sectorReturns.length !== marketReturns.length || sectorReturns.length === 0) return 0;
  const rsValues = sectorReturns.map((sr, i) => {
    const mr = marketReturns[i] || 0.001;
    return sr / mr;
  });
  return +(rsValues.reduce((a, b) => a + b, 0) / rsValues.length).toFixed(4);
}

// 资金流向聚合
function aggregateFundFlows(flows: { buy: number; sell: number; date: string }[]) {
  const totalBuy = flows.reduce((s, f) => s + f.buy, 0);
  const totalSell = flows.reduce((s, f) => s + f.sell, 0);
  const netFlow = totalBuy - totalSell;
  const avgDaily = flows.length > 0 ? netFlow / flows.length : 0;
  return { totalBuy, totalSell, netFlow, avgDaily: +avgDaily.toFixed(2), days: flows.length };
}

// 均线交叉检测
function detectMACross(shortMA: number[], longMA: number[]): { cross: string; index: number }[] {
  const crosses: { cross: string; index: number }[] = [];
  for (let i = 1; i < Math.min(shortMA.length, longMA.length); i++) {
    if (shortMA[i] > longMA[i] && shortMA[i - 1] <= longMA[i - 1]) {
      crosses.push({ cross: 'golden', index: i });
    } else if (shortMA[i] < longMA[i] && shortMA[i - 1] >= longMA[i - 1]) {
      crosses.push({ cross: 'death', index: i });
    }
  }
  return crosses;
}

// 量价关系分析
function analyzeVolumePrice(prices: number[], volumes: number[]): { divergence: boolean; trend: string } {
  if (prices.length < 2 || volumes.length < 2) return { divergence: false, trend: 'unknown' };
  let priceUp = 0, priceDown = 0, volUpOnPriceUp = 0, volDownOnPriceUp = 0;
  for (let i = 1; i < Math.min(prices.length, volumes.length); i++) {
    const priceRise = prices[i] > prices[i - 1];
    const volRise = volumes[i] > volumes[i - 1];
    if (priceRise) {
      priceUp++;
      if (volRise) volUpOnPriceUp++;
      else volDownOnPriceUp++;
    } else {
      priceDown++;
    }
  }
  const healthyRatio = priceUp > 0 ? volUpOnPriceUp / priceUp : 0;
  const divergence = healthyRatio < 0.3 && priceUp > priceDown;
  return { divergence, trend: priceUp > priceDown ? 'up' : 'down' };
}

describe('行业轮动分析', () => {
  describe('动量计算', () => {
    it('上涨趋势动量为正', () => {
      const r = calcSectorMomentum([100, 103, 106, 109, 112]);
      expect(r.momentum).toBeGreaterThan(0);
      expect(r.trend).toBe('up');
    });

    it('下跌趋势动量为负', () => {
      const r = calcSectorMomentum([100, 98, 96, 94, 92]);
      expect(r.momentum).toBeLessThan(0);
      expect(r.trend).toBe('down');
    });

    it('横盘趋势动量接近0', () => {
      const r = calcSectorMomentum([100, 100.1, 99.9, 100.05, 99.95]);
      expect(Math.abs(r.momentum)).toBeLessThan(1);
    });

    it('单个价格返回平趋势', () => {
      const r = calcSectorMomentum([100]);
      expect(r.trend).toBe('flat');
    });

    it('空数组返回零', () => {
      const r = calcSectorMomentum([]);
      expect(r.momentum).toBe(0);
    });

    it('波动率正确计算', () => {
      const r = calcSectorMomentum([100, 110, 90, 120, 80]);
      expect(r.volatility).toBeGreaterThan(0);
    });

    it('稳定价格波动率低', () => {
      const r = calcSectorMomentum([100, 100, 100, 100]);
      expect(r.volatility).toBe(0);
    });
  });

  describe('相对强弱', () => {
    it('强势板块RS>1', () => {
      const rs = calcRelativeStrength([0.02, 0.03], [0.01, 0.01]);
      expect(rs).toBeGreaterThan(1);
    });

    it('弱势板块RS<1', () => {
      const rs = calcRelativeStrength([0.01, 0.01], [0.02, 0.03]);
      expect(rs).toBeLessThan(1);
    });

    it('空数组返回0', () => {
      expect(calcRelativeStrength([], [])).toBe(0);
    });

    it('长度不匹配返回0', () => {
      expect(calcRelativeStrength([1], [1, 2])).toBe(0);
    });

    it('同步板块RS≈1', () => {
      const rs = calcRelativeStrength([0.02, 0.02], [0.02, 0.02]);
      expect(rs).toBe(1);
    });
  });

  describe('资金流向聚合', () => {
    it('正确聚合买入卖出', () => {
      const r = aggregateFundFlows([
        { buy: 100, sell: 80, date: '2024-01-01' },
        { buy: 120, sell: 90, date: '2024-01-02' },
      ]);
      expect(r.totalBuy).toBe(220);
      expect(r.totalSell).toBe(170);
      expect(r.netFlow).toBe(50);
      expect(r.days).toBe(2);
    });

    it('净流出为负值', () => {
      const r = aggregateFundFlows([{ buy: 50, sell: 100, date: '2024-01-01' }]);
      expect(r.netFlow).toBe(-50);
    });

    it('空数据返回零', () => {
      const r = aggregateFundFlows([]);
      expect(r.totalBuy).toBe(0);
      expect(r.netFlow).toBe(0);
      expect(r.days).toBe(0);
    });

    it('日均正确计算', () => {
      const r = aggregateFundFlows([
        { buy: 100, sell: 0, date: 'd1' },
        { buy: 100, sell: 0, date: 'd2' },
      ]);
      expect(r.avgDaily).toBe(100);
    });

    it('大量数据聚合正确', () => {
      const flows = Array.from({ length: 100 }, (_, i) => ({
        buy: 100 + i, sell: 50, date: `d${i}`,
      }));
      const r = aggregateFundFlows(flows);
      expect(r.days).toBe(100);
      expect(r.netFlow).toBeGreaterThan(0);
    });
  });

  describe('均线交叉检测', () => {
    it('检测金叉', () => {
      const crosses = detectMACross([5, 5, 11, 12], [10, 10, 10, 10]);
      expect(crosses.some(c => c.cross === 'golden')).toBe(true);
    });

    it('检测死叉', () => {
      const crosses = detectMACross([15, 15, 9, 8], [10, 10, 10, 10]);
      expect(crosses.some(c => c.cross === 'death')).toBe(true);
    });

    it('无交叉返回空', () => {
      const crosses = detectMACross([5, 5, 5], [10, 10, 10]);
      expect(crosses).toHaveLength(0);
    });

    it('交叉位置正确', () => {
      const crosses = detectMACross([5, 15], [10, 10]);
      expect(crosses[0].index).toBe(1);
    });

    it('空数组返回空', () => {
      expect(detectMACross([], [])).toHaveLength(0);
    });
  });

  describe('量价关系', () => {
    it('价涨量增为健康', () => {
      const r = analyzeVolumePrice([10, 11, 12], [100, 110, 120]);
      expect(r.divergence).toBe(false);
      expect(r.trend).toBe('up');
    });

    it('价涨量缩为背离', () => {
      const prices = [10, 11, 12, 13, 14, 15];
      const volumes = [100, 90, 80, 70, 60, 50];
      const r = analyzeVolumePrice(prices, volumes);
      expect(r.divergence).toBe(true);
      expect(r.trend).toBe('up');
    });

    it('空数据返回unknown', () => {
      const r = analyzeVolumePrice([], []);
      expect(r.trend).toBe('unknown');
    });

    it('下跌趋势检测', () => {
      const r = analyzeVolumePrice([10, 9, 8, 7], [100, 110, 120, 130]);
      expect(r.trend).toBe('down');
    });

    it('单一数据返回unknown', () => {
      expect(analyzeVolumePrice([10], [100]).trend).toBe('unknown');
    });
  });
});
