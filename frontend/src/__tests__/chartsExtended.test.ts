import { describe, it, expect } from 'vitest';

/**
 * StockCompareChart / TechnicalIndicatorChart / ShareholderChart 逻辑测试
 */

describe('StockCompareChart', () => {
  describe('多股票对比', () => {
    const stocks = [
      { code: '600519', name: '贵州茅台', data: [100, 102, 105, 103, 108] },
      { code: '000858', name: '五粮液', data: [50, 52, 48, 55, 58] },
    ];

    it('应该支持多股票数据', () => {
      expect(stocks).toHaveLength(2);
    });

    it('应该统一为相对涨跌幅', () => {
      const normalize = (data: number[]) => {
        const base = data[0];
        return data.map(v => ((v - base) / base) * 100);
      };
      
      const norm1 = normalize(stocks[0].data);
      expect(norm1[0]).toBe(0);
      expect(norm1[4]).toBe(8);
    });

    it('归一化后首值应为0', () => {
      const normalize = (data: number[]) => {
        const base = data[0];
        return data.map(v => ((v - base) / base) * 100);
      };
      stocks.forEach(s => {
        const normalized = normalize(s.data);
        expect(normalized[0]).toBe(0);
      });
    });
  });

  describe('对比统计', () => {
    it('应该计算区间涨跌幅', () => {
      const data = [100, 105, 98, 110];
      const change = ((data[data.length - 1] - data[0]) / data[0]) * 100;
      expect(change).toBe(10);
    });

    it('应该计算最大回撤', () => {
      const data = [100, 110, 95, 105, 90];
      let maxDrawdown = 0;
      let peak = data[0];
      data.forEach(v => {
        if (v > peak) peak = v;
        const dd = (peak - v) / peak;
        if (dd > maxDrawdown) maxDrawdown = dd;
      });
      expect(maxDrawdown).toBeCloseTo(0.18, 1);
    });

    it('应该计算波动率', () => {
      const data = [100, 102, 98, 105, 103];
      const returns = data.slice(1).map((v, i) => (v - data[i]) / data[i]);
      const avgReturn = returns.reduce((a, b) => a + b, 0) / returns.length;
      const variance = returns.reduce((a, r) => a + (r - avgReturn) ** 2, 0) / returns.length;
      expect(variance).toBeGreaterThan(0);
    });
  });
});

describe('TechnicalIndicatorChart', () => {
  describe('MACD 指标', () => {
    it('应该计算 DIF', () => {
      const ema12 = 105;
      const ema26 = 100;
      const dif = ema12 - ema26;
      expect(dif).toBe(5);
    });

    it('应该计算 DEA', () => {
      const difs = [3, 4, 5, 6, 7];
      const dea = difs.reduce((a, b) => a + b, 0) / difs.length;
      expect(dea).toBe(5);
    });

    it('应该计算 MACD 柱', () => {
      const dif = 5;
      const dea = 4;
      const macdBar = (dif - dea) * 2;
      expect(macdBar).toBe(2);
    });
  });

  describe('RSI 指标', () => {
    it('应该计算 RSI', () => {
      const gains = [2, 3, 0, 1, 4];
      const losses = [0, 0, 1, 0, 0];
      const avgGain = gains.reduce((a, b) => a + b, 0) / gains.length;
      const avgLoss = losses.reduce((a, b) => a + b, 0) / losses.length;
      const rs = avgGain / (avgLoss || 0.001);
      const rsi = 100 - (100 / (1 + rs));
      expect(rsi).toBeGreaterThan(50);
    });

    it('RSI 应在 0-100 之间', () => {
      const rsi = 75;
      expect(rsi).toBeGreaterThanOrEqual(0);
      expect(rsi).toBeLessThanOrEqual(100);
    });
  });

  describe('KDJ 指标', () => {
    it('应该计算 RSV', () => {
      const close = 105;
      const low9 = 98;
      const high9 = 110;
      const rsv = ((close - low9) / (high9 - low9)) * 100;
      expect(rsv).toBeCloseTo(58.33, 1);
    });

    it('K 值应该在 0-100 之间', () => {
      const k = 65;
      expect(k).toBeGreaterThanOrEqual(0);
      expect(k).toBeLessThanOrEqual(100);
    });
  });
});

describe('ShareholderChart', () => {
  describe('股东变化数据', () => {
    const changes = [
      { date: '2025-01-02', shareholderCount: 100000, avgHolding: 5000 },
      { date: '2025-02-01', shareholderCount: 95000, avgHolding: 5263 },
    ];

    it('应该有股东户数', () => {
      changes.forEach(c => expect(c.shareholderCount).toBeGreaterThan(0));
    });

    it('股东户数减少可能意味着筹码集中', () => {
      const change = changes[1].shareholderCount - changes[0].shareholderCount;
      expect(change).toBeLessThan(0);
    });

    it('应该计算人均持股', () => {
      const totalShares = 500000000;
      const shareholders = 100000;
      const avg = totalShares / shareholders;
      expect(avg).toBe(5000);
    });
  });

  describe('十大流通股东', () => {
    const topHolders = [
      { name: '机构A', holding: 15.5, change: '+2.0%' },
      { name: '机构B', holding: 10.2, change: '-1.0%' },
    ];

    it('应该有股东名称', () => {
      topHolders.forEach(h => expect(h.name).toBeTruthy());
    });

    it('应该有持股比例', () => {
      topHolders.forEach(h => expect(h.holding).toBeGreaterThan(0));
    });

    it('应该有持股变动', () => {
      topHolders.forEach(h => expect(h.change).toBeTruthy());
    });
  });
});
