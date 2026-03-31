import { describe, it, expect } from 'vitest';
import { analyzeNorthbound, NorthboundFlow, StockHolding } from '../utils/northboundFundEngine';

describe('北向资金分析引擎', () => {
  const flows: NorthboundFlow[] = [
    { date: '2024-03-10', shNetBuy: 2e9, szNetBuy: 1.5e9, totalNetBuy: 3.5e9, shBuyAmount: 10e9, shSellAmount: 8e9, szBuyAmount: 8e9, szSellAmount: 6.5e9 },
    { date: '2024-03-11', shNetBuy: 3e9, szNetBuy: 2e9, totalNetBuy: 5e9, shBuyAmount: 12e9, shSellAmount: 9e9, szBuyAmount: 9e9, szSellAmount: 7e9 },
    { date: '2024-03-12', shNetBuy: 1e9, szNetBuy: 0.5e9, totalNetBuy: 1.5e9, shBuyAmount: 9e9, shSellAmount: 8e9, szBuyAmount: 7e9, szSellAmount: 6.5e9 },
    { date: '2024-03-13', shNetBuy: 4e9, szNetBuy: 3e9, totalNetBuy: 7e9, shBuyAmount: 14e9, shSellAmount: 10e9, szBuyAmount: 10e9, szSellAmount: 7e9 },
    { date: '2024-03-14', shNetBuy: 2.5e9, szNetBuy: 1.5e9, totalNetBuy: 4e9, shBuyAmount: 11e9, shSellAmount: 8.5e9, szBuyAmount: 8e9, szSellAmount: 6.5e9 },
  ];

  it('应该返回最新流量数据', () => {
    const result = analyzeNorthbound(flows);
    expect(result.latestFlow.date).toBe('2024-03-14');
  });

  it('应该计算累计净流入', () => {
    const result = analyzeNorthbound(flows);
    expect(result.totalNetInflow).toBe(21e9);
  });

  it('应该计算日均净流入', () => {
    const result = analyzeNorthbound(flows);
    expect(result.avgDailyNetInflow).toBeCloseTo(4.2e9, -8);
  });

  it('应该判断趋势', () => {
    const result = analyzeNorthbound(flows);
    expect(['inflow', 'outflow', 'stable']).toContain(result.flowTrend);
  });

  it('应该计算连续天数', () => {
    const result = analyzeNorthbound(flows);
    expect(result.consecutiveDays).toBe(5); // 全部流入
  });

  it('应该生成市场信号', () => {
    const result = analyzeNorthbound(flows);
    expect(['bullish', 'bearish', 'neutral']).toContain(result.marketSignal);
    expect(result.signalStrength).toBeGreaterThanOrEqual(0);
  });

  it('应该分析持仓', () => {
    const holdings: StockHolding[] = [
      { stockCode: '600519', stockName: '茅台', shares: 10000, marketValue: 18e6, changeFromPrev: 1000, holdingRatio: 0.05 },
      { stockCode: '000858', stockName: '五粮液', shares: 5000, marketValue: 7.5e5, changeFromPrev: -500, holdingRatio: 0.03 },
    ];
    const result = analyzeNorthbound(flows, holdings);
    expect(result.topBuyStocks.length).toBe(1);
    expect(result.topSellStocks.length).toBe(1);
  });

  it('空数据应抛出错误', () => {
    expect(() => analyzeNorthbound([])).toThrow();
  });
});
