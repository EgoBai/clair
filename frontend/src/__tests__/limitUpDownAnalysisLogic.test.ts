/**
 * 限价单/涨跌停分析逻辑测试
 * 覆盖涨跌停价计算、封单分析、开板预测
 */

import { describe, it, expect } from 'vitest';

describe('涨跌停分析', () => {
  describe('涨跌停价计算', () => {
    function calcLimitPrice(prevClose: number, isST: boolean = false): { limitUp: number; limitDown: number } {
      const ratio = isST ? 0.05 : 0.1;
      return {
        limitDown: Math.round(prevClose * (1 - ratio) * 100) / 100,
        limitUp: Math.round(prevClose * (1 + ratio) * 100) / 100,
      };
    }

    it('普通股票涨跌停为10%', () => {
      const result = calcLimitPrice(10);
      expect(result.limitUp).toBe(11);
      expect(result.limitDown).toBe(9);
    });

    it('ST股票涨跌停为5%', () => {
      const result = calcLimitPrice(10, true);
      expect(result.limitUp).toBe(10.5);
      expect(result.limitDown).toBe(9.5);
    });

    it('科创板/创业板为20%', () => {
      function calcLimitPrice20(prevClose: number): { limitUp: number; limitDown: number } {
        return {
          limitDown: Math.round(prevClose * 0.8 * 100) / 100,
          limitUp: Math.round(prevClose * 1.2 * 100) / 100,
        };
      }
      const result = calcLimitPrice20(100);
      expect(result.limitUp).toBe(120);
      expect(result.limitDown).toBe(80);
    });
  });

  describe('封单分析', () => {
    function analyzeSealOrder(sealAmount: number, dailyVolume: number): {
      sealRatio: number;
      strength: 'strong' | 'medium' | 'weak';
    } {
      const sealRatio = dailyVolume > 0 ? Math.round((sealAmount / dailyVolume) * 100) / 100 : 0;
      let strength: 'strong' | 'medium' | 'weak' = 'weak';
      if (sealRatio > 5) strength = 'strong';
      else if (sealRatio > 1) strength = 'medium';
      return { sealRatio, strength };
    }

    it('大封单应为强封', () => {
      expect(analyzeSealOrder(5e8, 1e7).strength).toBe('strong');
    });

    it('小封单应为弱封', () => {
      expect(analyzeSealOrder(1e6, 1e8).strength).toBe('weak');
    });
  });

  describe('连板统计', () => {
    function calcConsecutiveLimits(prices: { close: number; limitUp: number }[]): number {
      let count = 0;
      for (let i = prices.length - 1; i >= 0; i--) {
        if (prices[i].close >= prices[i].limitUp) count++;
        else break;
      }
      return count;
    }

    it('应正确计算连板数', () => {
      const prices = [
        { close: 10, limitUp: 11 },
        { close: 11, limitUp: 11 },
        { close: 12.1, limitUp: 12.1 },
        { close: 13.31, limitUp: 13.31 },
      ];
      expect(calcConsecutiveLimits(prices)).toBe(3);
    });

    it('无连板应返回0', () => {
      const prices = [{ close: 10, limitUp: 11 }];
      expect(calcConsecutiveLimits(prices)).toBe(0);
    });
  });

  describe('涨跌停数据汇总', () => {
    interface LimitData {
      symbol: string;
      isLimitUp: boolean;
      isLimitDown: boolean;
      sealAmount: number;
      openTimes: number;
    }

    function summarizeLimits(data: LimitData[]): {
      limitUpCount: number;
      limitDownCount: number;
      avgSealAmount: number;
      openRate: number;
    } {
      const limitUps = data.filter(d => d.isLimitUp);
      const limitDowns = data.filter(d => d.isLimitDown);
      const avgSealAmount = limitUps.length > 0
        ? limitUps.reduce((s, d) => s + d.sealAmount, 0) / limitUps.length
        : 0;
      const openedCount = limitUps.filter(d => d.openTimes > 0).length;
      const openRate = limitUps.length > 0 ? Math.round((openedCount / limitUps.length) * 100) : 0;
      return { limitUpCount: limitUps.length, limitDownCount: limitDowns.length, avgSealAmount, openRate };
    }

    it('应正确汇总涨跌停数据', () => {
      const data: LimitData[] = [
        { symbol: 'A', isLimitUp: true, isLimitDown: false, sealAmount: 1e8, openTimes: 0 },
        { symbol: 'B', isLimitUp: true, isLimitDown: false, sealAmount: 2e8, openTimes: 1 },
        { symbol: 'C', isLimitUp: false, isLimitDown: true, sealAmount: 0, openTimes: 0 },
      ];
      const result = summarizeLimits(data);
      expect(result.limitUpCount).toBe(2);
      expect(result.limitDownCount).toBe(1);
      expect(result.openRate).toBe(50);
    });
  });
});
