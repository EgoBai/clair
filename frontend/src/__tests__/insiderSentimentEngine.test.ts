import { describe, it, expect } from 'vitest';
import { analyzeInsiderSentiment, InsiderTrade } from '../utils/insiderSentimentEngine';

describe('内部人情绪引擎', () => {
  const trades: InsiderTrade[] = [
    { date: '2024-01-15', insider: '张总', role: 'ceo', type: 'buy', shares: 10000, price: 50, amount: 500000, isDirect: true },
    { date: '2024-01-20', insider: '李总', role: 'cfo', type: 'buy', shares: 5000, price: 52, amount: 260000, isDirect: true },
    { date: '2024-02-10', insider: '王董', role: 'director', type: 'sell', shares: 8000, price: 55, amount: 440000, isDirect: true },
    { date: '2024-02-15', insider: '赵总', role: 'executive', type: 'buy', shares: 3000, price: 53, amount: 159000, isDirect: false },
  ];

  it('应统计买入金额', () => {
    const r = analyzeInsiderSentiment(trades);
    expect(r.totalBuyAmount).toBeGreaterThan(0);
  });

  it('应统计卖出金额', () => {
    const r = analyzeInsiderSentiment(trades);
    expect(r.totalSellAmount).toBeGreaterThan(0);
  });

  it('应计算净额', () => {
    const r = analyzeInsiderSentiment(trades);
    expect(r.netAmount).toBe(r.totalBuyAmount - r.totalSellAmount);
  });

  it('应判断情绪', () => {
    const r = analyzeInsiderSentiment(trades);
    expect(['bullish', 'neutral', 'bearish']).toContain(r.sentiment);
  });

  it('应判断CEO信号', () => {
    const r = analyzeInsiderSentiment(trades);
    expect(['buy', 'sell', 'neutral']).toContain(r.ceoSignal);
  });

  it('应计算信号强度', () => {
    const r = analyzeInsiderSentiment(trades);
    expect(r.signalStrength).toBeGreaterThanOrEqual(0);
    expect(r.signalStrength).toBeLessThanOrEqual(100);
  });

  it('应输出买入内部人', () => {
    const r = analyzeInsiderSentiment(trades);
    expect(r.buyingInsiders.length).toBeGreaterThan(0);
  });

  it('应输出卖出内部人', () => {
    const r = analyzeInsiderSentiment(trades);
    expect(r.sellingInsiders.length).toBeGreaterThan(0);
  });

  it('应输出洞察', () => {
    const r = analyzeInsiderSentiment(trades);
    expect(Array.isArray(r.insights)).toBe(true);
  });

  it('空数据应抛出错误', () => {
    expect(() => analyzeInsiderSentiment([])).toThrow();
  });
});
