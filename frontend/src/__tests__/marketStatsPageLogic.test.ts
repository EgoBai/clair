/**
 * 市场统计页逻辑测试
 * 覆盖市场数据汇总、涨跌幅统计、板块对比
 */

import { describe, it, expect } from 'vitest';

describe('市场统计页逻辑', () => {
  describe('涨跌家数统计', () => {
    interface StockData {
      symbol: string;
      changePercent: number;
    }

    function calcRiseFall(stocks: StockData[]): { up: number; down: number; flat: number; limitUp: number; limitDown: number } {
      let up = 0, down = 0, flat = 0, limitUp = 0, limitDown = 0;
      for (const s of stocks) {
        if (s.changePercent > 0) up++;
        else if (s.changePercent < 0) down++;
        else flat++;
        if (s.changePercent >= 9.9) limitUp++;
        if (s.changePercent <= -9.9) limitDown++;
      }
      return { up, down, flat, limitUp, limitDown };
    }

    it('应正确统计涨跌家数', () => {
      const stocks: StockData[] = [
        { symbol: '001', changePercent: 5 },
        { symbol: '002', changePercent: -3 },
        { symbol: '003', changePercent: 10 },
        { symbol: '004', changePercent: 0 },
        { symbol: '005', changePercent: -10 },
      ];
      const result = calcRiseFall(stocks);
      expect(result.up).toBe(2);
      expect(result.down).toBe(2);
      expect(result.flat).toBe(1);
      expect(result.limitUp).toBe(1);
      expect(result.limitDown).toBe(1);
    });

    it('空数组应全部为0', () => {
      const result = calcRiseFall([]);
      expect(result.up).toBe(0);
      expect(result.down).toBe(0);
      expect(result.flat).toBe(0);
    });
  });

  describe('市场强度计算', () => {
    function calcMarketStrength(up: number, total: number): { strength: number; level: string } {
      const ratio = total > 0 ? up / total : 0.5;
      const strength = Math.round(ratio * 100);
      let level = 'neutral';
      if (strength >= 80) level = 'very_bullish';
      else if (strength >= 60) level = 'bullish';
      else if (strength <= 20) level = 'very_bearish';
      else if (strength <= 40) level = 'bearish';
      return { strength, level };
    }

    it('高上涨比例应为强多', () => {
      const result = calcMarketStrength(800, 1000);
      expect(result.strength).toBe(80);
      expect(result.level).toBe('very_bullish');
    });

    it('低上涨比例应为强空', () => {
      const result = calcMarketStrength(100, 1000);
      expect(result.strength).toBe(10);
      expect(result.level).toBe('very_bearish');
    });

    it('中间值应为中性', () => {
      const result = calcMarketStrength(500, 1000);
      expect(result.strength).toBe(50);
      expect(result.level).toBe('neutral');
    });
  });

  describe('板块涨跌幅排序', () => {
    interface SectorData {
      name: string;
      changePercent: number;
      stockCount: number;
      volume: number;
    }

    function sortSectors(sectors: SectorData[], by: 'changePercent' | 'volume' = 'changePercent', desc = true): SectorData[] {
      return [...sectors].sort((a, b) => desc ? b[by] - a[by] : a[by] - b[by]);
    }

    it('按涨幅排序', () => {
      const sectors: SectorData[] = [
        { name: '科技', changePercent: 3, stockCount: 100, volume: 1e8 },
        { name: '消费', changePercent: 1, stockCount: 80, volume: 2e8 },
        { name: '医药', changePercent: 5, stockCount: 60, volume: 5e7 },
      ];
      const sorted = sortSectors(sectors);
      expect(sorted[0].name).toBe('医药');
      expect(sorted[2].name).toBe('消费');
    });

    it('按成交量排序', () => {
      const sectors: SectorData[] = [
        { name: '科技', changePercent: 3, stockCount: 100, volume: 1e8 },
        { name: '消费', changePercent: 1, stockCount: 80, volume: 2e8 },
        { name: '医药', changePercent: 5, stockCount: 60, volume: 5e7 },
      ];
      const sorted = sortSectors(sectors, 'volume');
      expect(sorted[0].name).toBe('消费');
      expect(sorted[2].name).toBe('医药');
    });
  });

  describe('市场宽度指标', () => {
    function calcBreadth(stocks: { aboveMA20: boolean; aboveMA60: boolean }[]): { ma20Ratio: number; ma60Ratio: number } {
      const total = stocks.length;
      if (total === 0) return { ma20Ratio: 0, ma60Ratio: 0 };
      const above20 = stocks.filter(s => s.aboveMA20).length;
      const above60 = stocks.filter(s => s.aboveMA60).length;
      return {
        ma20Ratio: Math.round((above20 / total) * 100),
        ma60Ratio: Math.round((above60 / total) * 100),
      };
    }

    it('应正确计算均线之上比例', () => {
      const stocks = [
        { aboveMA20: true, aboveMA60: true },
        { aboveMA20: true, aboveMA60: false },
        { aboveMA20: false, aboveMA60: false },
        { aboveMA20: false, aboveMA60: false },
      ];
      const result = calcBreadth(stocks);
      expect(result.ma20Ratio).toBe(50);
      expect(result.ma60Ratio).toBe(25);
    });

    it('空数据应返回0', () => {
      expect(calcBreadth([])).toEqual({ ma20Ratio: 0, ma60Ratio: 0 });
    });
  });

  describe('行业轮动评分', () => {
    function calcRotationScore(sector: { momentum5d: number; momentum20d: number; volumeRatio: number }): number {
      return Math.round((sector.momentum5d * 0.4 + sector.momentum20d * 0.3 + (sector.volumeRatio - 1) * 30) * 100) / 100;
    }

    it('应综合短期动量和成交量', () => {
      const score = calcRotationScore({ momentum5d: 5, momentum20d: 3, volumeRatio: 1.5 });
      expect(score).toBe(17.9); // 5*0.4 + 3*0.3 + 0.5*30 = 2+0.9+15
    });

    it('负动量应得低分', () => {
      const score = calcRotationScore({ momentum5d: -3, momentum20d: -2, volumeRatio: 0.5 });
      expect(score).toBeLessThan(0);
    });
  });

  describe('涨跌幅分布', () => {
    function calcChangeDistribution(stocks: { changePercent: number }[]): Record<string, number> {
      const buckets: Record<string, number> = {
        '跌停~-7%': 0, '-7%~-5%': 0, '-5%~-3%': 0, '-3%~0%': 0,
        '0%~3%': 0, '3%~5%': 0, '5%~7%': 0, '7%~涨停': 0,
      };
      for (const s of stocks) {
        const c = s.changePercent;
        if (c <= -7) buckets['跌停~-7%']++;
        else if (c <= -5) buckets['-7%~-5%']++;
        else if (c <= -3) buckets['-5%~-3%']++;
        else if (c < 0) buckets['-3%~0%']++;
        else if (c < 3) buckets['0%~3%']++;
        else if (c < 5) buckets['3%~5%']++;
        else if (c < 7) buckets['5%~7%']++;
        else buckets['7%~涨停']++;
      }
      return buckets;
    }

    it('应正确分桶', () => {
      const stocks = [
        { changePercent: -8 }, { changePercent: -6 }, { changePercent: -4 },
        { changePercent: -1 }, { changePercent: 1 }, { changePercent: 4 },
        { changePercent: 6 }, { changePercent: 9 },
      ];
      const dist = calcChangeDistribution(stocks);
      expect(dist['跌停~-7%']).toBe(1);
      expect(dist['-7%~-5%']).toBe(1);
      expect(dist['0%~3%']).toBe(1);
      expect(dist['7%~涨停']).toBe(1);
    });
  });
});
