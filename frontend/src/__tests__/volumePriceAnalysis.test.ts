import { describe, it, expect } from 'vitest';

// 量价关系分析引擎
describe('量价关系分析引擎', () => {
  interface DailyData { date: string; close: number; volume: number; high: number; low: number }

  function volumePriceCorrelation(data: DailyData[]): number {
    if (data.length < 2) return 0;
    const prices = data.map(d => d.close);
    const volumes = data.map(d => d.volume);
    const n = prices.length;
    const avgP = prices.reduce((s, v) => s + v, 0) / n;
    const avgV = volumes.reduce((s, v) => s + v, 0) / n;
    let cov = 0, varP = 0, varV = 0;
    for (let i = 0; i < n; i++) {
      const dp = prices[i]! - avgP;
      const dv = volumes[i]! - avgV;
      cov += dp * dv;
      varP += dp * dp;
      varV += dv * dv;
    }
    const denom = Math.sqrt(varP * varV);
    return denom === 0 ? 0 : cov / denom;
  }

  function averageVolume(data: DailyData[], period: number): number[] {
    const result: number[] = [];
    for (let i = 0; i < data.length; i++) {
      const start = Math.max(0, i - period + 1);
      const slice = data.slice(start, i + 1);
      result.push(slice.reduce((s, d) => s + d.volume, 0) / slice.length);
    }
    return result;
  }

  function volumeRatio(data: DailyData[], period: number): number[] {
    const avg = averageVolume(data, period);
    return data.map((d, i) => avg[i]! > 0 ? d.volume / avg[i]! : 0);
  }

  function detectVolumeSpike(data: DailyData[], multiplier: number): number[] {
    const avg20 = averageVolume(data, 20);
    const spikes: number[] = [];
    for (let i = 0; i < data.length; i++) {
      if (avg20[i]! > 0 && data[i]!.volume > avg20[i]! * multiplier) {
        spikes.push(i);
      }
    }
    return spikes;
  }

  function priceVolumeBreakout(data: DailyData[], priceThreshold: number, volumeMultiplier: number): number[] {
    const avgVol = averageVolume(data, 20);
    const breakouts: number[] = [];
    for (let i = 1; i < data.length; i++) {
      const priceChange = Math.abs(data[i]!.close - data[i - 1]!.close) / data[i - 1]!.close;
      if (priceChange > priceThreshold && avgVol[i]! > 0 && data[i]!.volume > avgVol[i]! * volumeMultiplier) {
        breakouts.push(i);
      }
    }
    return breakouts;
  }

  it('量价正相关时应返回正数', () => {
    const data: DailyData[] = Array.from({ length: 10 }, (_, i) => ({
      date: `${i}`, close: 10 + i, volume: 1000 + i * 100, high: 11 + i, low: 9 + i,
    }));
    expect(volumePriceCorrelation(data)).toBeGreaterThan(0.9);
  });

  it('量价负相关时应返回负数', () => {
    const data: DailyData[] = Array.from({ length: 10 }, (_, i) => ({
      date: `${i}`, close: 20 - i, volume: 1000 + i * 100, high: 21 - i, low: 19 - i,
    }));
    expect(volumePriceCorrelation(data)).toBeLessThan(-0.9);
  });

  it('单条数据相关性应为0', () => {
    const data: DailyData[] = [{ date: '1', close: 10, volume: 100, high: 11, low: 9 }];
    expect(volumePriceCorrelation(data)).toBe(0);
  });

  it('应计算移动平均成交量', () => {
    const data: DailyData[] = [
      { date: '1', close: 10, volume: 100, high: 10, low: 10 },
      { date: '2', close: 11, volume: 200, high: 11, low: 11 },
      { date: '3', close: 12, volume: 300, high: 12, low: 12 },
    ];
    const avg = averageVolume(data, 2);
    expect(avg[2]).toBe(250);
  });

  it('成交量比率应正确', () => {
    const data: DailyData[] = [
      { date: '1', close: 10, volume: 100, high: 10, low: 10 },
      { date: '2', close: 11, volume: 200, high: 11, low: 11 },
      { date: '3', close: 12, volume: 300, high: 12, low: 12 },
    ];
    const ratio = volumeRatio(data, 2);
    expect(ratio[2]).toBe(300 / 250);
  });

  it('应检测放量', () => {
    const data: DailyData[] = Array.from({ length: 25 }, (_, i) => ({
      date: `${i}`, close: 10, volume: 100, high: 10, low: 10,
    }));
    data.push({ date: '25', close: 12, volume: 500, high: 12, low: 12 });
    const spikes = detectVolumeSpike(data, 3);
    expect(spikes).toContain(25);
  });

  it('应检测量价突破', () => {
    const data: DailyData[] = Array.from({ length: 25 }, (_, i) => ({
      date: `${i}`, close: 10, volume: 100, high: 10, low: 10,
    }));
    data.push({ date: '25', close: 12, volume: 500, high: 12, low: 12 });
    const breakouts = priceVolumeBreakout(data, 0.05, 2);
    expect(breakouts.length).toBeGreaterThan(0);
  });

  it('恒定成交量平均应恒定', () => {
    const data: DailyData[] = Array.from({ length: 10 }, (_, i) => ({
      date: `${i}`, close: 10, volume: 500, high: 10, low: 10,
    }));
    const avg = averageVolume(data, 5);
    expect(avg.every(v => v === 500)).toBe(true);
  });
});

// 财务指标计算引擎
describe('财务指标计算引擎', () => {
  interface FinancialData {
    revenue: number; netProfit: number; totalAssets: number; totalEquity: number;
    totalDebt: number; totalLiabilities: number; operatingCashFlow: number;
    currentAssets: number; currentLiabilities: number; inventory: number;
    sharesOutstanding: number; dividend: number; marketPrice: number;
  }

  function pe(data: FinancialData): number {
    const eps = data.netProfit / data.sharesOutstanding;
    return eps > 0 ? data.marketPrice / eps : Infinity;
  }

  function pb(data: FinancialData): number {
    const bvps = data.totalEquity / data.sharesOutstanding;
    return bvps > 0 ? data.marketPrice / bvps : Infinity;
  }

  function roe(data: FinancialData): number {
    return data.totalEquity > 0 ? data.netProfit / data.totalEquity : 0;
  }

  function roa(data: FinancialData): number {
    return data.totalAssets > 0 ? data.netProfit / data.totalAssets : 0;
  }

  function debtRatio(data: FinancialData): number {
    return data.totalAssets > 0 ? data.totalLiabilities / data.totalAssets : 0;
  }

  function currentRatio(data: FinancialData): number {
    return data.currentLiabilities > 0 ? data.currentAssets / data.currentLiabilities : 0;
  }

  function quickRatio(data: FinancialData): number {
    return data.currentLiabilities > 0
      ? (data.currentAssets - data.inventory) / data.currentLiabilities
      : 0;
  }

  function grossMargin(revenue: number, cost: number): number {
    return revenue > 0 ? (revenue - cost) / revenue : 0;
  }

  function dividendYield(data: FinancialData): number {
    const dps = data.sharesOutstanding > 0 ? data.dividend / data.sharesOutstanding : 0;
    return data.marketPrice > 0 ? dps / data.marketPrice : 0;
  }

  function evToEbitda(data: FinancialData, ebitda: number): number {
    const ev = data.marketPrice * data.sharesOutstanding + data.totalDebt;
    return ebitda > 0 ? ev / ebitda : Infinity;
  }

  const sample: FinancialData = {
    revenue: 1000, netProfit: 200, totalAssets: 2000, totalEquity: 1200,
    totalDebt: 800, totalLiabilities: 800, operatingCashFlow: 300,
    currentAssets: 600, currentLiabilities: 400, inventory: 100,
    sharesOutstanding: 100, dividend: 50, marketPrice: 20,
  };

  it('PE应正确', () => {
    expect(pe(sample)).toBe(10);
  });

  it('PB应正确', () => {
    expect(pb(sample)).toBeCloseTo(20 / 12);
  });

  it('ROE应正确', () => {
    expect(roe(sample)).toBeCloseTo(200 / 1200);
  });

  it('ROA应正确', () => {
    expect(roa(sample)).toBe(0.1);
  });

  it('资产负债率应正确', () => {
    expect(debtRatio(sample)).toBe(0.4);
  });

  it('流动比率应正确', () => {
    expect(currentRatio(sample)).toBe(1.5);
  });

  it('速动比率应正确', () => {
    expect(quickRatio(sample)).toBeCloseTo(1.25);
  });

  it('毛利率应正确', () => {
    expect(grossMargin(1000, 600)).toBe(0.4);
  });

  it('股息率应正确', () => {
    expect(dividendYield(sample)).toBe(0.025);
  });

  it('EV/EBITDA应正确', () => {
    const ev = 20 * 100 + 800;
    expect(evToEbitda(sample, 400)).toBe(ev / 400);
  });

  it('亏损公司PE应为Infinity', () => {
    const loss = { ...sample, netProfit: -100 };
    expect(pe(loss)).toBe(Infinity);
  });

  it('零收入毛利率应为0', () => {
    expect(grossMargin(0, 0)).toBe(0);
  });

  it('零负债比率应为0', () => {
    const noLiab = { ...sample, totalLiabilities: 0 };
    expect(debtRatio(noLiab)).toBe(0);
  });

  it('零市价股息率应为0', () => {
    const zeroPrice = { ...sample, marketPrice: 0 };
    expect(dividendYield(zeroPrice)).toBe(0);
  });

  it('多重指标组合应一致', () => {
    const d = sample;
    expect(roe(d)).toBeGreaterThan(0);
    expect(debtRatio(d)).toBeLessThan(1);
    expect(currentRatio(d)).toBeGreaterThan(1);
  });
});

// K线形态识别增强
describe('K线形态识别增强', () => {
  interface Bar { open: number; close: number; high: number; low: number; volume: number }

  function isMorningStar(bars: Bar[]): boolean {
    if (bars.length !== 3) return false;
    const [b1, b2, b3] = bars;
    if (!b1 || !b2 || !b3) return false;
    const body1 = b1.close - b1.open;
    const body2 = Math.abs(b2.close - b2.open);
    const body3 = b3.close - b3.open;
    return body1 < 0 && body2 < Math.abs(body1) * 0.3 && body3 > 0 && b3.close > (b1.open + b1.close) / 2;
  }

  function isEveningStar(bars: Bar[]): boolean {
    if (bars.length !== 3) return false;
    const [b1, b2, b3] = bars;
    if (!b1 || !b2 || !b3) return false;
    const body1 = b1.close - b1.open;
    const body2 = Math.abs(b2.close - b2.open);
    const body3 = b3.close - b3.open;
    return body1 > 0 && body2 < body1 * 0.3 && body3 < 0 && b3.close < (b1.open + b1.close) / 2;
  }

  function isThreeWhiteSoldiers(bars: Bar[]): boolean {
    if (bars.length !== 3) return false;
    for (let i = 0; i < 3; i++) {
      const b = bars[i]!;
      if (b.close <= b.open) return false;
      if (i > 0 && b.close <= bars[i - 1]!.close) return false;
    }
    return true;
  }

  function isThreeBlackCrows(bars: Bar[]): boolean {
    if (bars.length !== 3) return false;
    for (let i = 0; i < 3; i++) {
      const b = bars[i]!;
      if (b.close >= b.open) return false;
      if (i > 0 && b.close >= bars[i - 1]!.close) return false;
    }
    return true;
  }

  function bodySize(bar: Bar): number {
    return Math.abs(bar.close - bar.open);
  }

  function shadowRatio(bar: Bar): { upper: number; lower: number } {
    const body = bodySize(bar);
    const upperShadow = bar.high - Math.max(bar.open, bar.close);
    const lowerShadow = Math.min(bar.open, bar.close) - bar.low;
    return {
      upper: body > 0 ? upperShadow / body : 0,
      lower: body > 0 ? lowerShadow / body : 0,
    };
  }

  function isSpinTop(bar: Bar): boolean {
    const body = bodySize(bar);
    const range = bar.high - bar.low;
    return range > 0 && body / range < 0.3 && body / range > 0.05;
  }

  it('应识别早晨之星', () => {
    const bars: Bar[] = [
      { open: 10, close: 8, high: 10.5, low: 7.5, volume: 100 },
      { open: 8, close: 8.1, high: 8.5, low: 7.8, volume: 50 },
      { open: 8.2, close: 10.5, high: 11, low: 8, volume: 150 },
    ];
    expect(isMorningStar(bars)).toBe(true);
  });

  it('应识别黄昏之星', () => {
    const bars: Bar[] = [
      { open: 8, close: 10, high: 10.5, low: 7.5, volume: 100 },
      { open: 10, close: 10.1, high: 10.5, low: 9.8, volume: 50 },
      { open: 10, close: 8, high: 10.5, low: 7.5, volume: 150 },
    ];
    expect(isEveningStar(bars)).toBe(true);
  });

  it('非三星K线不应识别为早晨之星', () => {
    expect(isMorningStar([{ open: 10, close: 8, high: 11, low: 7, volume: 0 }])).toBe(false);
  });

  it('应识别三白兵', () => {
    const bars: Bar[] = [
      { open: 10, close: 11, high: 11.5, low: 9.5, volume: 100 },
      { open: 11, close: 12, high: 12.5, low: 10.5, volume: 120 },
      { open: 12, close: 13, high: 13.5, low: 11.5, volume: 140 },
    ];
    expect(isThreeWhiteSoldiers(bars)).toBe(true);
  });

  it('应识别三黑鸦', () => {
    const bars: Bar[] = [
      { open: 13, close: 12, high: 13.5, low: 11.5, volume: 100 },
      { open: 12, close: 11, high: 12.5, low: 10.5, volume: 120 },
      { open: 11, close: 10, high: 11.5, low: 9.5, volume: 140 },
    ];
    expect(isThreeBlackCrows(bars)).toBe(true);
  });

  it('不连续上涨不应识别为三白兵', () => {
    const bars: Bar[] = [
      { open: 10, close: 11, high: 12, low: 9, volume: 0 },
      { open: 11, close: 10.5, high: 12, low: 10, volume: 0 },
    ];
    expect(isThreeWhiteSoldiers(bars)).toBe(false);
  });

  it('应计算实体大小', () => {
    expect(bodySize({ open: 10, close: 12, high: 13, low: 9, volume: 0 })).toBe(2);
    expect(bodySize({ open: 12, close: 10, high: 13, low: 9, volume: 0 })).toBe(2);
  });

  it('应计算上下影线比', () => {
    const bar: Bar = { open: 10, close: 12, high: 14, low: 8, volume: 0 };
    const ratio = shadowRatio(bar);
    expect(ratio.upper).toBe(1);
    expect(ratio.lower).toBe(1);
  });

  it('十字星影线比应为0', () => {
    const bar: Bar = { open: 10, close: 10, high: 11, low: 9, volume: 0 };
    const ratio = shadowRatio(bar);
    expect(ratio.upper).toBe(0);
    expect(ratio.lower).toBe(0);
  });

  it('应识别纺锤线', () => {
    expect(isSpinTop({ open: 10, close: 10.5, high: 11, low: 9, volume: 0 })).toBe(true);
  });

  it('大实体不应识别为纺锤线', () => {
    expect(isSpinTop({ open: 10, close: 12, high: 12.5, low: 9.5, volume: 0 })).toBe(false);
  });

  it('大量K线应正确处理', () => {
    const bars: Bar[] = Array.from({ length: 100 }, (_, i) => ({
      open: 10 + i * 0.1, close: 10 + i * 0.1 + 0.05,
      high: 10 + i * 0.1 + 0.2, low: 10 + i * 0.1 - 0.1, volume: 1000,
    }));
    expect(bars.every(b => bodySize(b) >= 0)).toBe(true);
  });
});
