import { describe, it, expect } from 'vitest';
import { analyzeCorporateActions, CorporateAction } from '../utils/corporateActionEngine';

describe('公司行为分析引擎', () => {
  const actions: CorporateAction[] = [
    { type: 'buyback', date: '2024-01-15', amount: 50000, details: '回购计划', participant: '公司', price: 50 },
    { type: 'increase_holding', date: '2024-02-10', amount: 5000, details: '董事长增持', participant: '董事长' },
    { type: 'bonus', date: '2024-03-15', amount: 10000, details: '每10股派5元', participant: '全体股东' },
    { type: 'incentive', date: '2024-04-01', amount: 3000, details: '股权激励', participant: '核心员工' },
  ];

  const stockPrice = 50;
  const totalShares = 100000;

  it('应统计回购金额', () => {
    const r = analyzeCorporateActions(actions, stockPrice, totalShares);
    expect(r.totalBuybackAmount).toBe(50000);
  });

  it('应判断回购信号', () => {
    const r = analyzeCorporateActions(actions, stockPrice, totalShares);
    expect(['bullish', 'neutral', 'bearish']).toContain(r.buybackSignal);
  });

  it('应分析高管增减持', () => {
    const r = analyzeCorporateActions(actions, stockPrice, totalShares);
    expect(['accumulation', 'neutral', 'distribution']).toContain(r.insiderActivity);
  });

  it('应计算分红收益率', () => {
    const r = analyzeCorporateActions(actions, stockPrice, totalShares);
    expect(r.dividendYield).toBeGreaterThan(0);
  });

  it('应输出行为评分', () => {
    const r = analyzeCorporateActions(actions, stockPrice, totalShares);
    expect(r.actionScore).toBeGreaterThanOrEqual(0);
    expect(r.actionScore).toBeLessThanOrEqual(100);
  });

  it('应输出信号列表', () => {
    const r = analyzeCorporateActions(actions, stockPrice, totalShares);
    expect(Array.isArray(r.signals)).toBe(true);
  });

  it('应输出行为汇总', () => {
    const r = analyzeCorporateActions(actions, stockPrice, totalShares);
    expect(r.actionSummary.length).toBeGreaterThan(0);
  });

  it('应评估股东友好度', () => {
    const r = analyzeCorporateActions(actions, stockPrice, totalShares);
    expect(['high', 'moderate', 'low']).toContain(r.shareholderFriendliness);
  });

  it('大额回购应为看涨信号', () => {
    const r = analyzeCorporateActions(actions, stockPrice, totalShares);
    expect(r.buybackSignal).toBe('bullish');
  });

  it('高管增持应为积累信号', () => {
    const r = analyzeCorporateActions(actions, stockPrice, totalShares);
    expect(r.insiderActivity).toBe('accumulation');
  });
});
