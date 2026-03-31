import { describe, it, expect } from 'vitest';
import { runEventBacktest, EventTrade, BacktestConfig } from '../utils/eventDrivenBacktestEngine';

describe('事件驱动回测引擎', () => {
  const trades: EventTrade[] = [
    { eventDate: '2024-01-15', eventType: 'earnings', entryPrice: 100, exitPrice: 110, entryDate: '2024-01-16', exitDate: '2024-01-26', holdingDays: 10, returnPct: 0.1, maxDrawdownDuringHolding: -0.02, maxGainDuringHolding: 0.12 },
    { eventDate: '2024-02-15', eventType: 'earnings', entryPrice: 100, exitPrice: 95, entryDate: '2024-02-16', exitDate: '2024-02-26', holdingDays: 10, returnPct: -0.05, maxDrawdownDuringHolding: -0.08, maxGainDuringHolding: 0.03 },
    { eventDate: '2024-03-15', eventType: 'dividend', entryPrice: 100, exitPrice: 108, entryDate: '2024-03-16', exitDate: '2024-03-26', holdingDays: 10, returnPct: 0.08, maxDrawdownDuringHolding: -0.01, maxGainDuringHolding: 0.09 },
    { eventDate: '2024-04-15', eventType: 'dividend', entryPrice: 100, exitPrice: 103, entryDate: '2024-04-16', exitDate: '2024-04-26', holdingDays: 10, returnPct: 0.03, maxDrawdownDuringHolding: -0.01, maxGainDuringHolding: 0.05 },
    { eventDate: '2024-05-15', eventType: 'policy', entryPrice: 100, exitPrice: 97, entryDate: '2024-05-16', exitDate: '2024-05-26', holdingDays: 10, returnPct: -0.03, maxDrawdownDuringHolding: -0.06, maxGainDuringHolding: 0.01 },
  ];

  const config: BacktestConfig = {
    holdingDays: 10,
    stopLoss: -0.05,
    takeProfit: 0.10,
    maxPositionSize: 0.2,
  };

  it('应统计总交易数', () => {
    const r = runEventBacktest(trades, config);
    expect(r.totalTrades).toBe(5);
  });

  it('应计算胜率', () => {
    const r = runEventBacktest(trades, config);
    expect(r.winRate).toBe(0.6);
  });

  it('应计算平均盈利', () => {
    const r = runEventBacktest(trades, config);
    expect(r.avgWin).toBeGreaterThan(0);
  });

  it('应计算平均亏损', () => {
    const r = runEventBacktest(trades, config);
    expect(r.avgLoss).toBeGreaterThan(0);
  });

  it('应计算盈亏比', () => {
    const r = runEventBacktest(trades, config);
    expect(r.profitFactor).toBeGreaterThan(0);
  });

  it('应计算最大回撤', () => {
    const r = runEventBacktest(trades, config);
    expect(r.maxDrawdown).toBeLessThanOrEqual(0);
  });

  it('应计算Sharpe比率', () => {
    const r = runEventBacktest(trades, config);
    expect(typeof r.sharpeRatio).toBe('number');
  });

  it('应计算年化收益率', () => {
    const r = runEventBacktest(trades, config);
    expect(typeof r.annualizedReturn).toBe('number');
  });

  it('应按事件类型统计', () => {
    const r = runEventBacktest(trades, config);
    expect(r.byEventType.length).toBeGreaterThan(0);
  });

  it('空数据应抛出错误', () => {
    expect(() => runEventBacktest([], config)).toThrow();
  });
});
