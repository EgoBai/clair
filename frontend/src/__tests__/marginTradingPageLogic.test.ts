/**
 * 融资融券页面逻辑测试
 * 覆盖融资余额、融券余额、杠杆分析
 */

import { describe, it, expect } from 'vitest';

describe('融资融券页面逻辑', () => {
  describe('两融数据分析', () => {
    interface MarginData {
      date: string;
      marginBuy: number;   // 融资买入
      marginRepay: number; // 融资偿还
      shortSell: number;   // 融券卖出
      shortRepay: number;  // 融券偿还
      marginBalance: number; // 融资余额
      shortBalance: number;  // 融券余额
    }

    function calcMarginNetFlow(data: MarginData[]): { totalNetBuy: number; totalNetShort: number } {
      let totalNetBuy = 0, totalNetShort = 0;
      for (const d of data) {
        totalNetBuy += d.marginBuy - d.marginRepay;
        totalNetShort += d.shortSell - d.shortRepay;
      }
      return { totalNetBuy, totalNetShort };
    }

    it('应正确计算融资净买入', () => {
      const data: MarginData[] = [
        { date: '2024-01-02', marginBuy: 1000, marginRepay: 500, shortSell: 100, shortRepay: 50, marginBalance: 500, shortBalance: 50 },
        { date: '2024-01-03', marginBuy: 800, marginRepay: 600, shortSell: 80, shortRepay: 100, marginBalance: 700, shortBalance: 30 },
      ];
      const result = calcMarginNetFlow(data);
      expect(result.totalNetBuy).toBe(700);
      expect(result.totalNetShort).toBe(30);
    });
  });

  describe('融资余额趋势', () => {
    function calcBalanceTrend(balances: number[]): { trend: 'up' | 'down' | 'stable'; change: number; changePercent: number } {
      if (balances.length < 2) return { trend: 'stable', change: 0, changePercent: 0 };
      const latest = balances[balances.length - 1];
      const prev = balances[balances.length - 2];
      const change = latest - prev;
      const changePercent = prev > 0 ? Math.round((change / prev) * 10000) / 100 : 0;
      return {
        trend: change > 0 ? 'up' : change < 0 ? 'down' : 'stable',
        change,
        changePercent,
      };
    }

    it('上升趋势应标记up', () => {
      const result = calcBalanceTrend([100, 110, 120]);
      expect(result.trend).toBe('up');
      expect(result.changePercent).toBeCloseTo(9.09, 0);
    });

    it('下降趋势应标记down', () => {
      const result = calcBalanceTrend([120, 110, 100]);
      expect(result.trend).toBe('down');
    });
  });

  describe('两融占比分析', () => {
    function calcMarginRatio(marginBalance: number, totalMarketCap: number): {
      ratio: number;
      level: 'high' | 'normal' | 'low';
    } {
      const ratio = totalMarketCap > 0 ? Math.round((marginBalance / totalMarketCap) * 10000) / 100 : 0;
      let level: 'high' | 'normal' | 'low' = 'normal';
      if (ratio > 3) level = 'high';
      else if (ratio < 1) level = 'low';
      return { ratio, level };
    }

    it('高占比应标记为high', () => {
      expect(calcMarginRatio(5e9, 1e11).level).toBe('high');
    });

    it('低占比应标记为low', () => {
      expect(calcMarginRatio(5e7, 1e11).level).toBe('low');
    });
  });

  describe('个股两融排名', () => {
    interface StockMargin {
      symbol: string;
      name: string;
      marginBalance: number;
      marginNetBuy: number;
      shortBalance: number;
    }

    function rankByMargin(stocks: StockMargin[], by: 'marginBalance' | 'marginNetBuy'): StockMargin[] {
      return [...stocks].sort((a, b) => b[by] - a[by]);
    }

    it('应按融资余额排名', () => {
      const stocks: StockMargin[] = [
        { symbol: 'A', name: '股票A', marginBalance: 1e9, marginNetBuy: 1e7, shortBalance: 1e6 },
        { symbol: 'B', name: '股票B', marginBalance: 2e9, marginNetBuy: 5e6, shortBalance: 2e6 },
      ];
      const result = rankByMargin(stocks, 'marginBalance');
      expect(result[0].symbol).toBe('B');
    });
  });

  describe('两融预警', () => {
    function checkMarginAlert(data: {
      marginBalance: number;
      maintenanceRatio: number;
      liquidationLine: number;
    }): { alert: boolean; level: string; message: string } {
      if (data.maintenanceRatio <= data.liquidationLine) {
        return { alert: true, level: 'danger', message: '已触及平仓线' };
      }
      if (data.maintenanceRatio <= data.liquidationLine + 10) {
        return { alert: true, level: 'warning', message: '接近平仓线' };
      }
      return { alert: false, level: 'safe', message: '维持担保比例正常' };
    }

    it('触及平仓线应触发危险警报', () => {
      const result = checkMarginAlert({ marginBalance: 1e6, maintenanceRatio: 110, liquidationLine: 130 });
      expect(result.alert).toBe(true);
      expect(result.level).toBe('danger');
    });

    it('正常比例不应触发警报', () => {
      const result = checkMarginAlert({ marginBalance: 1e6, maintenanceRatio: 300, liquidationLine: 130 });
      expect(result.alert).toBe(false);
    });
  });
});
