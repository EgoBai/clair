import { describe, it, expect } from 'vitest';
import {
  analyzeETFHoldings,
  ETFHoldingSnapshot,
  ETFHolding,
} from '../utils/etfHoldingEngine';

describe('ETF持仓变动跟踪引擎', () => {
  const makeHolding = (code: string, name: string, shares: number, weight: number): ETFHolding => ({
    stockCode: code,
    stockName: name,
    shares,
    marketValue: shares * 10,
    weight,
    changeFromPrev: 0,
  });

  const current: ETFHoldingSnapshot = {
    etfCode: '510300',
    etfName: '沪深300ETF',
    date: '2024-03-15',
    totalValue: 1000000000,
    holdings: [
      makeHolding('600519', '贵州茅台', 100000, 0.08),
      makeHolding('000858', '五粮液', 80000, 0.05),
      makeHolding('601318', '中国平安', 60000, 0.04),
      makeHolding('000333', '美的集团', 50000, 0.03),
      makeHolding('600036', '招商银行', 45000, 0.025),
      makeHolding('002714', '牧原股份', 40000, 0.02),
      makeHolding('601012', '隆基绿能', 35000, 0.015),
      makeHolding('300750', '宁德时代', 30000, 0.01),
    ],
  };

  const previous: ETFHoldingSnapshot = {
    etfCode: '510300',
    etfName: '沪深300ETF',
    date: '2024-03-08',
    totalValue: 980000000,
    holdings: [
      makeHolding('600519', '贵州茅台', 95000, 0.075),
      makeHolding('000858', '五粮液', 82000, 0.052),
      makeHolding('601318', '中国平安', 60000, 0.04),
      makeHolding('000333', '美的集团', 50000, 0.03),
      makeHolding('600036', '招商银行', 45000, 0.025),
      makeHolding('002415', '海康威视', 30000, 0.02), // 被剔除
    ],
  };

  it('应该检测新增持仓', () => {
    const result = analyzeETFHoldings(current, previous);
    const newHoldings = result.changes.filter(c => c.changeType === 'new');
    expect(newHoldings.length).toBeGreaterThan(0);
    const codes = newHoldings.map(c => c.stockCode);
    expect(codes).toContain('002714');
    expect(codes).toContain('601012');
    expect(codes).toContain('300750');
  });

  it('应该检测剔除持仓', () => {
    const result = analyzeETFHoldings(current, previous);
    const removed = result.changes.filter(c => c.changeType === 'removed');
    expect(removed.length).toBe(1);
    expect(removed[0].stockCode).toBe('002415');
  });

  it('应该检测增持减持', () => {
    const result = analyzeETFHoldings(current, previous);
    const increase = result.changes.filter(c => c.changeType === 'increase');
    const decrease = result.changes.filter(c => c.changeType === 'decrease');
    expect(increase.some(c => c.stockCode === '600519')).toBe(true);
    expect(decrease.some(c => c.stockCode === '000858')).toBe(true);
  });

  it('应该计算集中度指标', () => {
    const result = analyzeETFHoldings(current, previous);
    expect(result.concentration.top5Weight).toBeGreaterThan(0);
    expect(result.concentration.top10Weight).toBeGreaterThanOrEqual(result.concentration.top5Weight);
    expect(result.concentration.hhiIndex).toBeGreaterThan(0);
    expect(result.concentration.effectiveN).toBeGreaterThan(0);
  });

  it('应该计算持仓偏离度', () => {
    const result = analyzeETFHoldings(current, previous);
    expect(result.drift.trackingError).toBeGreaterThanOrEqual(0);
    expect(result.drift.maxDeviation).toBeGreaterThanOrEqual(0);
    expect(result.drift.driftScore).toBeGreaterThanOrEqual(0);
  });

  it('应该返回TOP变动', () => {
    const result = analyzeETFHoldings(current, previous);
    expect(result.topMovers.length).toBeLessThanOrEqual(10);
    if (result.topMovers.length > 1) {
      expect(Math.abs(result.topMovers[0].weightChange))
        .toBeGreaterThanOrEqual(Math.abs(result.topMovers[1].weightChange));
    }
  });

  it('应该生成风险警报', () => {
    const concentrated: ETFHoldingSnapshot = {
      etfCode: 'TEST',
      etfName: '测试ETF',
      date: '2024-03-15',
      totalValue: 1000000,
      holdings: [makeHolding('A', 'A股', 100000, 0.6), makeHolding('B', 'B股', 50000, 0.4)],
    };
    const result = analyzeETFHoldings(concentrated, previous);
    expect(result.riskAlerts.length).toBeGreaterThan(0);
  });

  it('首次分析(无历史)应正常工作', () => {
    const result = analyzeETFHoldings(current);
    expect(result.changes.length).toBeGreaterThan(0);
    expect(result.drift.driftScore).toBe(0);
  });

  it('应该分析行业分布', () => {
    const sectorMap: Record<string, string> = {
      '600519': '白酒', '000858': '白酒',
      '601318': '金融', '600036': '金融',
      '000333': '家电', '002714': '农业',
      '601012': '新能源', '300750': '新能源',
    };
    const result = analyzeETFHoldings(current, previous, sectorMap);
    expect(result.sectorDist.length).toBeGreaterThan(0);
    expect(result.sectorDist.some(s => s.sector === '白酒')).toBe(true);
  });

  it('应该处理空持仓', () => {
    const empty: ETFHoldingSnapshot = {
      etfCode: 'EMPTY', etfName: '空', date: '2024-01-01', totalValue: 0, holdings: [],
    };
    const result = analyzeETFHoldings(empty);
    expect(result.concentration.top5Weight).toBe(0);
    expect(result.changes.length).toBe(0);
  });
});
