import { describe, it, expect } from 'vitest';
import { analyzeShareholderChanges, ShareholderChange } from '../utils/shareholderTrackEngine';

describe('大股东增减持跟踪引擎', () => {
  const events: ShareholderChange[] = [
    { stockCode: '600519', stockName: '茅台', shareholderName: '张三', changeType: 'increase', changeShares: 1000000, changeRatio: 0.02, prevHolding: 5000000, currHolding: 6000000, avgPrice: 1800, totalAmount: 1800000000, date: '2024-03-10' },
    { stockCode: '600519', stockName: '茅台', shareholderName: '李四', changeType: 'decrease', changeShares: 500000, changeRatio: 0.01, prevHolding: 3000000, currHolding: 2500000, avgPrice: 1850, totalAmount: 925000000, date: '2024-03-11' },
    { stockCode: '000858', stockName: '五粮液', shareholderName: '张三', changeType: 'increase', changeShares: 2000000, changeRatio: 0.03, prevHolding: 4000000, currHolding: 6000000, avgPrice: 150, totalAmount: 300000000, date: '2024-03-12' },
    { stockCode: '000858', stockName: '五粮液', shareholderName: '王五', changeType: 'decrease', changeShares: 3000000, changeRatio: 0.06, prevHolding: 10000000, currHolding: 7000000, avgPrice: 148, totalAmount: 444000000, date: '2024-03-13' },
    { stockCode: '600519', stockName: '茅台', shareholderName: '张三', changeType: 'increase', changeShares: 800000, changeRatio: 0.015, prevHolding: 6000000, currHolding: 6800000, avgPrice: 1820, totalAmount: 1456000000, date: '2024-03-14' },
  ];

  it('应该返回所有事件', () => {
    const result = analyzeShareholderChanges(events);
    expect(result.events.length).toBe(5);
  });

  it('应该按日期排序', () => {
    const result = analyzeShareholderChanges(events);
    for (let i = 1; i < result.events.length; i++) {
      expect(result.events[i].date >= result.events[i - 1].date).toBe(true);
    }
  });

  it('应该分析股东行为', () => {
    const result = analyzeShareholderChanges(events);
    const zhangsan = result.behaviors.find(b => b.name === '张三');
    expect(zhangsan).toBeDefined();
    expect(zhangsan!.totalIncrease).toBeGreaterThan(0);
    expect(zhangsan!.eventCount).toBe(3);
  });

  it('应该计算净变动', () => {
    const result = analyzeShareholderChanges(events);
    expect(typeof result.totalNetChange).toBe('number');
  });

  it('应该判断市场情绪', () => {
    const result = analyzeShareholderChanges(events);
    expect(['bullish', 'bearish', 'neutral']).toContain(result.marketSentiment);
  });

  it('应该识别重大事件', () => {
    const result = analyzeShareholderChanges(events);
    expect(result.significantEvents.length).toBeGreaterThan(0);
  });

  it('应该处理空数据', () => {
    const result = analyzeShareholderChanges([]);
    expect(result.events.length).toBe(0);
    expect(result.behaviors.length).toBe(0);
    expect(result.totalNetChange).toBe(0);
  });

  it('应该生成风险警报', () => {
    const result = analyzeShareholderChanges(events);
    expect(Array.isArray(result.alerts)).toBe(true);
  });
});
