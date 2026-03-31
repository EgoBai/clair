import { describe, it, expect } from 'vitest';

/**
 * AI分析引擎测试
 */

interface MarketSentiment {
  score: number;        // -1 to 1
  label: '极度悲观' | '悲观' | '中性' | '乐观' | '极度乐观';
  confidence: number;
  factors: Array<{
    name: string;
    weight: number;
    value: number;
  }>;
}

interface StockSignal {
  code: string;
  action: '强烈买入' | '买入' | '持有' | '卖出' | '强烈卖出';
  confidence: number;
  reasons: string[];
  targetPrice?: number;
  stopLoss?: number;
  riskLevel: 'low' | 'medium' | 'high';
}

function analyzeSentiment(factors: Array<{ name: string; weight: number; value: number }>): MarketSentiment {
  const totalWeight = factors.reduce((s, f) => s + f.weight, 0);
  const score = totalWeight > 0
    ? factors.reduce((s, f) => s + f.value * f.weight, 0) / totalWeight
    : 0;

  let label: MarketSentiment['label'];
  if (score > 0.6) label = '极度乐观';
  else if (score > 0.2) label = '乐观';
  else if (score > -0.2) label = '中性';
  else if (score > -0.6) label = '悲观';
  else label = '极度悲观';

  const confidence = Math.min(1, Math.abs(score) + 0.3);
  return { score: Math.round(score * 100) / 100, label, confidence: Math.round(confidence * 100) / 100, factors };
}

function generateSignal(
  technicalScore: number,
  fundamentalScore: number,
  sentimentScore: number,
  currentPrice: number
): StockSignal {
  const composite = (technicalScore * 0.4 + fundamentalScore * 0.35 + sentimentScore * 0.25);

  let action: StockSignal['action'];
  if (composite > 0.6) action = '强烈买入';
  else if (composite > 0.2) action = '买入';
  else if (composite > -0.2) action = '持有';
  else if (composite > -0.6) action = '卖出';
  else action = '强烈卖出';

  const confidence = Math.min(1, Math.abs(composite) + 0.2);
  const reasons: string[] = [];
  if (technicalScore > 0.3) reasons.push('技术面强势');
  if (technicalScore < -0.3) reasons.push('技术面弱势');
  if (fundamentalScore > 0.3) reasons.push('基本面优良');
  if (fundamentalScore < -0.3) reasons.push('基本面堪忧');
  if (sentimentScore > 0.3) reasons.push('市场情绪乐观');
  if (sentimentScore < -0.3) reasons.push('市场情绪悲观');

  const riskLevel = Math.abs(composite) > 0.5 ? 'low' : composite > 0 ? 'medium' : 'high';

  return {
    code: '',
    action,
    confidence: Math.round(confidence * 100) / 100,
    reasons,
    targetPrice: action.includes('买入') ? Math.round(currentPrice * 1.1 * 100) / 100 : undefined,
    stopLoss: action.includes('买入') ? Math.round(currentPrice * 0.95 * 100) / 100 : undefined,
    riskLevel,
  };
}

function calcWinRate(signals: StockSignal[], outcomes: boolean[]): number {
  if (signals.length === 0 || outcomes.length === 0) return 0;
  const minLength = Math.min(signals.length, outcomes.length);
  const wins = outcomes.slice(0, minLength).filter((o, i) => {
    const signal = signals[i];
    return (signal.action.includes('买入') && o) || (signal.action.includes('卖出') && !o);
  }).length;
  return Math.round((wins / minLength) * 10000) / 100;
}

describe('AI Analysis Engine', () => {
  describe('情绪分析', () => {
    it('应该正确计算情绪得分', () => {
      const factors = [
        { name: '涨跌比', weight: 0.3, value: 0.8 },
        { name: '成交量', weight: 0.3, value: 0.6 },
        { name: '北向资金', weight: 0.4, value: 0.7 },
      ];
      const sentiment = analyzeSentiment(factors);
      expect(sentiment.score).toBeGreaterThan(0);
    });

    it('应该正确标注情绪标签', () => {
      expect(analyzeSentiment([{ name: 'test', weight: 1, value: 0.8 }]).label).toBe('极度乐观');
      expect(analyzeSentiment([{ name: 'test', weight: 1, value: 0 }]).label).toBe('中性');
      expect(analyzeSentiment([{ name: 'test', weight: 1, value: -0.8 }]).label).toBe('极度悲观');
    });

    it('空因素应该返回中性', () => {
      const sentiment = analyzeSentiment([]);
      expect(sentiment.score).toBe(0);
      expect(sentiment.label).toBe('中性');
    });
  });

  describe('信号生成', () => {
    it('全正面应该生成买入信号', () => {
      const signal = generateSignal(0.8, 0.7, 0.6, 100);
      expect(signal.action).toContain('买');
      expect(signal.targetPrice).toBeDefined();
      expect(signal.stopLoss).toBeDefined();
    });

    it('全负面应该生成卖出信号', () => {
      const signal = generateSignal(-0.8, -0.7, -0.6, 100);
      expect(signal.action).toContain('卖');
    });

    it('中性应该持有', () => {
      const signal = generateSignal(0, 0, 0, 100);
      expect(signal.action).toBe('持有');
    });

    it('应该包含原因', () => {
      const signal = generateSignal(0.5, -0.5, 0, 100);
      expect(signal.reasons.length).toBeGreaterThan(0);
    });

    it('应该有风险等级', () => {
      const signal = generateSignal(0.5, 0.5, 0.5, 100);
      expect(['low', 'medium', 'high']).toContain(signal.riskLevel);
    });
  });

  describe('胜率计算', () => {
    it('应该正确计算买入胜率', () => {
      const signals: StockSignal[] = [
        { code: '1', action: '买入', confidence: 0.8, reasons: [], riskLevel: 'low' },
        { code: '2', action: '买入', confidence: 0.7, reasons: [], riskLevel: 'low' },
        { code: '3', action: '卖出', confidence: 0.6, reasons: [], riskLevel: 'medium' },
      ];
      const outcomes = [true, false, false];
      const winRate = calcWinRate(signals, outcomes);
      expect(winRate).toBeCloseTo(66.67, 1);
    });

    it('空数据应该返回0', () => {
      expect(calcWinRate([], [])).toBe(0);
    });
  });
});
