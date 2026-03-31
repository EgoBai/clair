import { describe, it, expect } from 'vitest';
import { analyzeIPOReturns, IPORecord } from '../utils/ipoReturnEngine';

describe('IPO收益分析引擎', () => {
  const records: IPORecord[] = [
    { stockCode: '001001', stockName: '新股A', industry: '科技', issuePrice: 10, firstDayOpen: 20, firstDayClose: 25, firstDayHigh: 30, firstDayLow: 18, firstDayVolume: 1000000, marketCap: 5e9, peRatio: 30, issueDate: '2024-03-01' },
    { stockCode: '001002', stockName: '新股B', industry: '医药', issuePrice: 20, firstDayOpen: 22, firstDayClose: 19, firstDayHigh: 24, firstDayLow: 17, firstDayVolume: 800000, marketCap: 3e9, peRatio: 25, issueDate: '2024-03-05' },
    { stockCode: '001003', stockName: '新股C', industry: '科技', issuePrice: 15, firstDayOpen: 28, firstDayClose: 32, firstDayHigh: 35, firstDayLow: 26, firstDayVolume: 1200000, marketCap: 8e9, peRatio: 40, issueDate: '2024-03-10' },
    { stockCode: '001004', stockName: '新股D', industry: '消费', issuePrice: 30, firstDayOpen: 32, firstDayClose: 31, firstDayHigh: 34, firstDayLow: 29, firstDayVolume: 600000, marketCap: 6e9, peRatio: 20, issueDate: '2024-03-12' },
    { stockCode: '001005', stockName: '新股E', industry: '医药', issuePrice: 25, firstDayOpen: 45, firstDayClose: 50, firstDayHigh: 55, firstDayLow: 42, firstDayVolume: 1500000, marketCap: 10e9, peRatio: 35, issueDate: '2024-03-15' },
  ];

  it('应该计算平均首日收益', () => {
    const result = analyzeIPOReturns(records);
    expect(result.avgFirstDayReturn).toBeGreaterThan(0);
  });

  it('应该计算破发率', () => {
    const result = analyzeIPOReturns(records);
    expect(result.breakRate).toBe(0.2); // 仅新股B破发
  });

  it('应该计算翻倍率', () => {
    const result = analyzeIPOReturns(records);
    expect(result.doubleRate).toBe(0.6); // 新股A/C/E翻倍
  });

  it('应该分析行业表现', () => {
    const result = analyzeIPOReturns(records);
    expect(result.industryPerformance.length).toBe(3);
    const tech = result.industryPerformance.find(i => i.industry === '科技');
    expect(tech).toBeDefined();
    expect(tech!.count).toBe(2);
  });

  it('应该识别热门和冷门IPO', () => {
    const result = analyzeIPOReturns(records);
    expect(result.hotIPOs.length).toBeLessThanOrEqual(5);
    expect(result.coldIPOs.length).toBeLessThanOrEqual(5);
  });

  it('应该判断市场热度', () => {
    const result = analyzeIPOReturns(records);
    expect(['hot', 'warm', 'cold']).toContain(result.marketHeat);
  });

  it('应该计算中位数收益', () => {
    const result = analyzeIPOReturns(records);
    expect(typeof result.medianFirstDayReturn).toBe('number');
  });

  it('空数据应抛出错误', () => {
    expect(() => analyzeIPOReturns([])).toThrow();
  });

  it('应该计算总IPO数量', () => {
    const result = analyzeIPOReturns(records);
    expect(result.totalIPOs).toBe(5);
  });
});
