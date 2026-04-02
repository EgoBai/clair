/**
 * 市场情绪评分引擎测试
 */
import { describe, it, expect } from 'vitest';
import {
  calculateSentiment,
  getSentimentHistory,
  detectSentimentDivergence,
  SentimentInput,
  SentimentResult,
} from '../services/sentimentScoreEngine';

const defaultInput: SentimentInput = {
  advanceDeclineRatio: 0.5,
  turnoverRate: 3,
  marginChangeRate: 0,
  northboundFlow: 0,
  volatilityIndex: 30,
  ipoLimitUpRatio: 0.5,
  consecutiveLimitUpCount: 5,
  limitUpCount: 50,
  limitDownCount: 50,
};

describe('sentimentScoreEngine', () => {
  describe('calculateSentiment', () => {
    it('应返回总分在0-100范围内', () => {
      const result = calculateSentiment(defaultInput);
      expect(result.totalScore).toBeGreaterThanOrEqual(0);
      expect(result.totalScore).toBeLessThanOrEqual(100);
    });

    it('应返回正确的维度结构', () => {
      const result = calculateSentiment(defaultInput);
      expect(result.dimensions).toHaveProperty('breadth');
      expect(result.dimensions).toHaveProperty('activity');
      expect(result.dimensions).toHaveProperty('leverage');
      expect(result.dimensions).toHaveProperty('foreignFlow');
      expect(result.dimensions).toHaveProperty('volatility');
      expect(result.dimensions).toHaveProperty('speculation');
    });

    it('极度恐慌场景 - 低涨跌比高波动率', () => {
      const input: SentimentInput = {
        ...defaultInput,
        advanceDeclineRatio: 0.05,
        volatilityIndex: 75,
        limitUpCount: 5,
        limitDownCount: 300,
        northboundFlow: -180,
        turnoverRate: 1,
        marginChangeRate: -0.09,
      };
      const result = calculateSentiment(input);
      expect(result.totalScore).toBeLessThan(25);
      expect(['极度恐慌', '恐慌']).toContain(result.level);
    });

    it('极度贪婪场景 - 高涨跌比低波动率', () => {
      const input: SentimentInput = {
        ...defaultInput,
        advanceDeclineRatio: 0.95,
        volatilityIndex: 12,
        limitUpCount: 300,
        limitDownCount: 5,
        northboundFlow: 180,
        turnoverRate: 8,
        marginChangeRate: 0.09,
        ipoLimitUpRatio: 0.9,
        consecutiveLimitUpCount: 15,
      };
      const result = calculateSentiment(input);
      expect(result.totalScore).toBeGreaterThan(75);
      expect(['贪婪', '极度贪婪']).toContain(result.level);
    });

    it('中性场景应返回约50分', () => {
      const result = calculateSentiment(defaultInput);
      expect(result.totalScore).toBeGreaterThan(30);
      expect(result.totalScore).toBeLessThan(70);
    });

    it('涨停家数多于跌停应提升情绪分', () => {
      const bullish = calculateSentiment({ ...defaultInput, limitUpCount: 200, limitDownCount: 20 });
      const bearish = calculateSentiment({ ...defaultInput, limitUpCount: 20, limitDownCount: 200 });
      expect(bullish.totalScore).toBeGreaterThan(bearish.totalScore);
    });

    it('北向资金净流入应提升情绪分', () => {
      const inflow = calculateSentiment({ ...defaultInput, northboundFlow: 100 });
      const outflow = calculateSentiment({ ...defaultInput, northboundFlow: -100 });
      expect(inflow.totalScore).toBeGreaterThan(outflow.totalScore);
    });

    it('信号应与情绪等级一致', () => {
      // 极度恐慌 -> 强烈买入
      const panic: SentimentInput = {
        advanceDeclineRatio: 0.02,
        turnoverRate: 0.5,
        marginChangeRate: -0.08,
        northboundFlow: -150,
        volatilityIndex: 70,
        ipoLimitUpRatio: 0,
        consecutiveLimitUpCount: 0,
        limitUpCount: 5,
        limitDownCount: 400,
      };
      const panicResult = calculateSentiment(panic);
      expect(panicResult.signal).toMatch(/买入/);

      // 极度贪婪 -> 强烈卖出
      const greed: SentimentInput = {
        advanceDeclineRatio: 0.98,
        turnoverRate: 9,
        marginChangeRate: 0.09,
        northboundFlow: 180,
        volatilityIndex: 11,
        ipoLimitUpRatio: 0.95,
        consecutiveLimitUpCount: 20,
        limitUpCount: 500,
        limitDownCount: 3,
      };
      const greedResult = calculateSentiment(greed);
      expect(greedResult.signal).toMatch(/卖出/);
    });
  });

  describe('getSentimentHistory', () => {
    it('应为每个输入返回结果', () => {
      const inputs = Array(5).fill(defaultInput);
      const results = getSentimentHistory(inputs);
      expect(results).toHaveLength(5);
      results.forEach(r => {
        expect(r).toHaveProperty('totalScore');
        expect(r).toHaveProperty('level');
        expect(r).toHaveProperty('signal');
      });
    });

    it('空数组应返回空数组', () => {
      expect(getSentimentHistory([])).toEqual([]);
    });
  });

  describe('detectSentimentDivergence', () => {
    it('应检测到底背离 - 价格下跌但情绪改善', () => {
      const results: SentimentResult[] = [
        { totalScore: 30, level: '恐慌', dimensions: {} as any, signal: '买入' },
        { totalScore: 50, level: '中性', dimensions: {} as any, signal: '观望' },
      ];
      const priceChanges = [100, 90];
      const div = detectSentimentDivergence(results, priceChanges);
      expect(div.bullish).toBe(true);
      expect(div.bearish).toBe(false);
    });

    it('应检测到顶背离 - 价格上涨但情绪恶化', () => {
      const results: SentimentResult[] = [
        { totalScore: 70, level: '偏多', dimensions: {} as any, signal: '观望' },
        { totalScore: 50, level: '中性', dimensions: {} as any, signal: '观望' },
      ];
      const priceChanges = [100, 110];
      const div = detectSentimentDivergence(results, priceChanges);
      expect(div.bearish).toBe(true);
      expect(div.bullish).toBe(false);
    });

    it('数据不足应返回无背离', () => {
      const results: SentimentResult[] = [
        { totalScore: 50, level: '中性', dimensions: {} as any, signal: '观望' },
      ];
      const div = detectSentimentDivergence(results, [100]);
      expect(div.bullish).toBe(false);
      expect(div.bearish).toBe(false);
      expect(div.strength).toBe(0);
    });

    it('应计算背离强度', () => {
      const results: SentimentResult[] = [
        { totalScore: 30, level: '恐慌', dimensions: {} as any, signal: '买入' },
        { totalScore: 80, level: '贪婪', dimensions: {} as any, signal: '卖出' },
      ];
      const priceChanges = [100, 90];
      const div = detectSentimentDivergence(results, priceChanges);
      expect(div.strength).toBeGreaterThan(0);
    });
  });

  describe('边界值测试', () => {
    it('所有值为0应不报错', () => {
      const input: SentimentInput = {
        advanceDeclineRatio: 0,
        turnoverRate: 0,
        marginChangeRate: 0,
        northboundFlow: 0,
        volatilityIndex: 0,
        ipoLimitUpRatio: 0,
        consecutiveLimitUpCount: 0,
        limitUpCount: 0,
        limitDownCount: 0,
      };
      expect(() => calculateSentiment(input)).not.toThrow();
    });

    it('所有值为最大应不报错', () => {
      const input: SentimentInput = {
        advanceDeclineRatio: 1,
        turnoverRate: 100,
        marginChangeRate: 1,
        northboundFlow: 10000,
        volatilityIndex: 100,
        ipoLimitUpRatio: 1,
        consecutiveLimitUpCount: 100,
        limitUpCount: 5000,
        limitDownCount: 0,
      };
      const result = calculateSentiment(input);
      expect(result.totalScore).toBeGreaterThan(0);
    });
  });
});
