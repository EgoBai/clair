import { describe, it, expect } from 'vitest';
import { StockConnectEngine, type AHStock } from '../utils/stockConnectDeepEngine';

/**
 * 沪深港通深度分析引擎测试 (导入真实模块)
 */

const engine = new StockConnectEngine();

function makeAH(over: Partial<AHStock> = {}): AHStock {
  return {
    codeA: '600519',
    codeH: '00001',
    name: '测试',
    priceA: 10,
    priceH: 8,
    exchangeRate: 0.9,
    industry: '白酒',
    ...over,
  };
}

describe('StockConnectEngine.calculateAHPremium', () => {
  it('中位溢价为正且正确计算', () => {
    const p = engine.calculateAHPremium(makeAH());
    // priceHInRMB = 8 / 0.9 ≈ 8.8889, premium = (10 - 8.8889) / 8.8889 * 100 ≈ 12.5
    expect(p.priceHInRMB).toBeCloseTo(8.8889, 3);
    expect(p.premium).toBeCloseTo(12.5, 1);
    expect(p.signal).toBe('neutral');
  });

  it('A 显著便宜时给出 buy_A 信号', () => {
    const p = engine.calculateAHPremium(makeAH({ priceA: 6 }));
    expect(p.premium).toBeLessThan(0);
    expect(p.signal).toBe('buy_A');
  });

  it('A 显著贵时给出 buy_H 信号', () => {
    const p = engine.calculateAHPremium(makeAH({ priceA: 16 }));
    expect(p.premium).toBeGreaterThan(60);
    expect(p.signal).toBe('buy_H');
  });
});

describe('StockConnectEngine.rankAHPremiums', () => {
  it('应按溢价降序排列', () => {
    const stocks: AHStock[] = [
      makeAH({ codeA: 'A', priceA: 10 }),
      makeAH({ codeA: 'B', priceA: 6 }),
      makeAH({ codeA: 'C', priceA: 16 }),
    ];
    const ranked = engine.rankAHPremiums(stocks, new Map());
    expect(ranked).toHaveLength(3);
    expect(ranked[0].codeA).toBe('C'); // 最高溢价
    expect(ranked[2].codeA).toBe('B'); // 最低溢价
  });
});

describe('StockConnectEngine.summarizeStockConnect', () => {
  it('应汇总并判定市场情绪', () => {
    const north = [{ date: '2024-01-01', netBuy: 100, volume: 1000 }];
    const south = [{ date: '2024-01-01', netBuy: -30, volume: 500 }];
    const summaries = engine.summarizeStockConnect(north, south);
    expect(summaries).toHaveLength(1);
    const s = summaries[0];
    expect(s.totalConnect).toBe(1500); // 1000 + 500
    expect(s.northBound.netBuy).toBe(100);
    expect(s.southBound.netBuy).toBe(-30);
    expect(s.marketSentiment).toBe('risk_on'); // totalNet = 70 > 50
  });

  it('净流出时应为 risk_off', () => {
    const north = [{ date: '2024-01-01', netBuy: -100, volume: 1000 }];
    const south = [{ date: '2024-01-01', netBuy: -30, volume: 500 }];
    const summaries = engine.summarizeStockConnect(north, south);
    expect(summaries[0].marketSentiment).toBe('risk_off');
  });
});

describe('StockConnectEngine.analyzeCrossBorderFlow', () => {
  it('应判定累积趋势', () => {
    const holdings = [
      { stockCode: '600519', date: '2024-01-01', shares: 100, channel: 'north' as const },
      { stockCode: '600519', date: '2024-01-02', shares: 150, channel: 'north' as const },
      { stockCode: '600519', date: '2024-01-03', shares: 200, channel: 'north' as const },
    ];
    const flows = engine.analyzeCrossBorderFlow(holdings);
    expect(flows).toHaveLength(1);
    const f = flows[0];
    expect(f.stockCode).toBe('600519');
    expect(f.trend).toBe('accumulating');
    expect(f.netBuy).toBe(50); // 200 - 150
  });

  it('应区分不同通道', () => {
    const holdings = [
      { stockCode: '600519', date: '2024-01-01', shares: 100, channel: 'north' as const },
      { stockCode: '600519', date: '2024-01-01', shares: 50, channel: 'south' as const },
    ];
    const flows = engine.analyzeCrossBorderFlow(holdings);
    expect(flows).toHaveLength(2);
    const channels = flows.map(f => f.channel).sort();
    expect(channels).toEqual(['north', 'south']);
  });
});

describe('StockConnectEngine.analyzePremiumMeanReversion', () => {
  it('空数据返回稳定', () => {
    const r = engine.analyzePremiumMeanReversion([]);
    expect(r.signal).toBe('stable');
    expect(r.currentPremium).toBe(0);
  });

  it('高溢价给出回归信号', () => {
    const premiums = Array.from({ length: 10 }, (_, i) => ({ date: `d${i}`, premium: 30 }));
    premiums.push({ date: 'd10', premium: 90 });
    const r = engine.analyzePremiumMeanReversion(premiums);
    expect(r.avgPremium).toBeCloseTo(35.45, 1);
    expect(r.zScore).toBeGreaterThan(1.5);
    expect(r.signal).toBe('revert_high');
  });
});
