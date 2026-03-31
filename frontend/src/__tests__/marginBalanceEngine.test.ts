import { describe, it, expect } from 'vitest';
import { analyzeMarginTrading, MarginData } from '../utils/marginBalanceEngine';

describe('融资融券余额分析引擎', () => {
  const data: MarginData[] = [
    { date: '2024-03-10', 融资余额: 1500000000000, 融券余额: 80000000000, 融资买入额: 50000000000, 融资偿还额: 45000000000, 融券卖出量: 10000000, 融券偿还量: 8000000 },
    { date: '2024-03-11', 融资余额: 1505000000000, 融券余额: 79000000000, 融资买入额: 52000000000, 融资偿还额: 47000000000, 融券卖出量: 11000000, 融券偿还量: 9000000 },
    { date: '2024-03-12', 融资余额: 1510000000000, 融券余额: 78000000000, 融资买入额: 55000000000, 融资偿还额: 50000000000, 融券卖出量: 12000000, 融券偿还量: 10000000 },
    { date: '2024-03-13', 融资余额: 1512000000000, 融券余额: 78500000000, 融资买入额: 48000000000, 融资偿还额: 46000000000, 融券卖出量: 10500000, 融券偿还量: 9500000 },
    { date: '2024-03-14', 融资余额: 1515000000000, 融券余额: 79000000000, 融资买入额: 53000000000, 融资偿还额: 50000000000, 融券卖出量: 11500000, 融券偿还量: 10000000 },
  ];

  it('应该计算融资余额变化率', () => {
    const result = analyzeMarginTrading(data);
    expect(result.融资余额变化率).toBeGreaterThan(0);
  });

  it('应该计算融资净买入', () => {
    const result = analyzeMarginTrading(data);
    expect(result.融资净买入).toBe(3000000000);
  });

  it('应该计算融资融券比', () => {
    const result = analyzeMarginTrading(data);
    expect(result.融资融券比).toBeGreaterThan(1);
  });

  it('应该计算杠杆率', () => {
    const result = analyzeMarginTrading(data, 80000000000000);
    expect(result.杠杆率).toBeGreaterThan(0);
    expect(result.杠杆率).toBeLessThan(1);
  });

  it('应该判断趋势', () => {
    const result = analyzeMarginTrading(data);
    expect(['rising', 'falling', 'stable']).toContain(result.融资余额趋势);
  });

  it('应该生成多空信号', () => {
    const result = analyzeMarginTrading(data);
    expect(['bullish', 'bearish', 'neutral']).toContain(result.多空信号);
    expect(result.signalStrength).toBeGreaterThanOrEqual(0);
    expect(result.signalStrength).toBeLessThanOrEqual(100);
  });

  it('应该处理单条数据', () => {
    const result = analyzeMarginTrading([data[0]]);
    expect(result.融资余额变化率).toBe(0);
    expect(result.融资余额趋势).toBe('stable');
  });

  it('空数据应抛出错误', () => {
    expect(() => analyzeMarginTrading([])).toThrow();
  });
});
