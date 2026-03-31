import { describe, it, expect } from 'vitest';
import { analyzeBehavioralFinance, BehavioralData } from '../utils/behavioralFinanceEngine';

describe('行为金融分析引擎', () => {
  const normalData: BehavioralData = {
    turnoverRate: 0.03, marginBalance: 8000, marginChange: 100,
    shortBalance: 500, newAccountCount: 200000, fundFlow: 10,
    sentimentIndex: 50, volatility: 0.2, priceChange: 0.01,
    volumeChange: 0.1, limitUpCount: 30, limitDownCount: 20,
    averageHoldingPeriod: 30,
  };

  const extremeGreed: BehavioralData = {
    ...normalData, sentimentIndex: 90, newAccountCount: 800000,
    turnoverRate: 0.08, fundFlow: 100,
  };

  it('应判断投资者情绪', () => {
    const r = analyzeBehavioralFinance(normalData);
    expect(['extreme_fear', 'fear', 'neutral', 'greed', 'extreme_greed']).toContain(r.investorSentiment);
  });

  it('过度贪婪应被识别', () => {
    const r = analyzeBehavioralFinance(extremeGreed);
    expect(r.investorSentiment).toBe('extreme_greed');
  });

  it('应计算过度反应评分', () => {
    const r = analyzeBehavioralFinance(normalData);
    expect(r.overreactionScore).toBeGreaterThanOrEqual(0);
    expect(r.overreactionScore).toBeLessThanOrEqual(100);
  });

  it('应计算羊群效应评分', () => {
    const r = analyzeBehavioralFinance(normalData);
    expect(r.herdBehaviorScore).toBeGreaterThanOrEqual(0);
  });

  it('应评估损失厌恶', () => {
    const r = analyzeBehavioralFinance(normalData);
    expect(['low', 'moderate', 'high']).toContain(r.lossAversionLevel);
  });

  it('应判断逆向信号', () => {
    const r = analyzeBehavioralFinance(normalData);
    expect(['buy', 'hold', 'sell']).toContain(r.contrarianSignal);
  });

  it('应计算行为风险', () => {
    const r = analyzeBehavioralFinance(normalData);
    expect(r.behaviorRisk).toBeGreaterThanOrEqual(0);
    expect(r.behaviorRisk).toBeLessThanOrEqual(100);
  });

  it('应判断群体动能', () => {
    const r = analyzeBehavioralFinance(normalData);
    expect(['accelerating', 'steady', 'decelerating']).toContain(r.crowdMomentum);
  });

  it('应输出洞察', () => {
    const r = analyzeBehavioralFinance(extremeGreed);
    expect(r.insights.length).toBeGreaterThan(0);
  });

  it('应检测锚定效应', () => {
    const r = analyzeBehavioralFinance(normalData);
    expect(typeof r.anchoringEffect).toBe('boolean');
  });
});
