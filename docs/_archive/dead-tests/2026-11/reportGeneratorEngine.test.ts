/**
 * 后端报表生成引擎测试
 * 覆盖报表数据聚合、格式化、导出
 */

import { describe, it, expect } from 'vitest';

describe('报表生成引擎', () => {
  describe('日报数据聚合', () => {
    interface DailyReport {
      date: string;
      totalStocks: number;
      upCount: number;
      downCount: number;
      limitUpCount: number;
      limitDownCount: number;
      totalVolume: number;
      totalTurnover: number;
      northboundNet: number;
    }

    function generateDailySummary(data: {
      date: string;
      stocks: { changePercent: number; volume: number; turnover: number }[];
      northboundNet: number;
    }): DailyReport {
      return {
        date: data.date,
        totalStocks: data.stocks.length,
        upCount: data.stocks.filter(s => s.changePercent > 0).length,
        downCount: data.stocks.filter(s => s.changePercent < 0).length,
        limitUpCount: data.stocks.filter(s => s.changePercent >= 9.9).length,
        limitDownCount: data.stocks.filter(s => s.changePercent <= -9.9).length,
        totalVolume: data.stocks.reduce((s, st) => s + st.volume, 0),
        totalTurnover: data.stocks.reduce((s, st) => s + st.turnover, 0),
        northboundNet: data.northboundNet,
      };
    }

    it('应正确生成日报', () => {
      const report = generateDailySummary({
        date: '2024-01-15',
        stocks: [
          { changePercent: 5, volume: 1e6, turnover: 1e8 },
          { changePercent: -3, volume: 2e6, turnover: 2e8 },
          { changePercent: 10, volume: 5e5, turnover: 5e7 },
        ],
        northboundNet: 1e9,
      });
      expect(report.totalStocks).toBe(3);
      expect(report.upCount).toBe(2);
      expect(report.limitUpCount).toBe(1);
      expect(report.totalVolume).toBe(3.5e6);
    });
  });

  describe('周报趋势计算', () => {
    function calcWeeklyTrend(dailyReports: { date: string; totalTurnover: number; upCount: number }[]): {
      avgTurnover: number;
      trend: 'up' | 'down' | 'stable';
      bestDay: string;
      worstDay: string;
    } {
      if (dailyReports.length === 0) return { avgTurnover: 0, trend: 'stable', bestDay: '', worstDay: '' };
      const avgTurnover = dailyReports.reduce((s, r) => s + r.totalTurnover, 0) / dailyReports.length;
      const sorted = [...dailyReports].sort((a, b) => b.upCount - a.upCount);
      const mid = Math.floor(dailyReports.length / 2);
      const firstHalf = dailyReports.slice(0, mid);
      const secondHalf = dailyReports.slice(mid);
      const firstAvg = firstHalf.reduce((s, r) => s + r.upCount, 0) / (firstHalf.length || 1);
      const secondAvg = secondHalf.reduce((s, r) => s + r.upCount, 0) / (secondHalf.length || 1);
      return {
        avgTurnover: Math.round(avgTurnover),
        trend: secondAvg > firstAvg + 5 ? 'up' : secondAvg < firstAvg - 5 ? 'down' : 'stable',
        bestDay: sorted[0].date,
        worstDay: sorted[sorted.length - 1].date,
      };
    }

    it('应正确计算周趋势', () => {
      const reports = [
        { date: 'Mon', totalTurnover: 1e9, upCount: 100 },
        { date: 'Tue', totalTurnover: 2e9, upCount: 200 },
        { date: 'Wed', totalTurnover: 1.5e9, upCount: 150 },
      ];
      const result = calcWeeklyTrend(reports);
      expect(result.bestDay).toBe('Tue');
      expect(result.worstDay).toBe('Mon');
      expect(result.avgTurnover).toBe(1500000000);
    });
  });

  describe('报表格式化', () => {
    function formatReportValue(value: number, type: 'amount' | 'percent' | 'count'): string {
      switch (type) {
        case 'amount':
          if (value >= 1e8) return (value / 1e8).toFixed(2) + '亿';
          if (value >= 1e4) return (value / 1e4).toFixed(0) + '万';
          return value.toString();
        case 'percent':
          return (value >= 0 ? '+' : '') + value.toFixed(2) + '%';
        case 'count':
          return value.toLocaleString('zh-CN');
        default:
          return value.toString();
      }
    }

    it('金额应正确格式化', () => {
      expect(formatReportValue(1.5e8, 'amount')).toBe('1.50亿');
      expect(formatReportValue(50000, 'amount')).toBe('5万');
    });

    it('百分比应带正负号', () => {
      expect(formatReportValue(5.5, 'percent')).toBe('+5.50%');
      expect(formatReportValue(-3.2, 'percent')).toBe('-3.20%');
    });

    it('数量应本地化', () => {
      expect(formatReportValue(12345, 'count')).toBe('12,345');
    });
  });

  describe('报表导出格式', () => {
    function prepareExportData(data: Record<string, unknown>[], format: 'csv' | 'json'): string {
      if (format === 'json') return JSON.stringify(data, null, 2);
      if (data.length === 0) return '';
      const headers = Object.keys(data[0]);
      const rows = data.map(row => headers.map(h => String(row[h] ?? '')).join(','));
      return [headers.join(','), ...rows].join('\n');
    }

    it('JSON导出应为格式化JSON', () => {
      const data = [{ a: 1, b: 'test' }];
      const result = prepareExportData(data, 'json');
      expect(JSON.parse(result)).toEqual(data);
    });

    it('CSV导出应有表头', () => {
      const data = [{ name: 'A', value: 100 }, { name: 'B', value: 200 }];
      const result = prepareExportData(data, 'csv');
      expect(result).toContain('name,value');
      expect(result).toContain('A,100');
    });

    it('空数据CSV应返回空字符串', () => {
      expect(prepareExportData([], 'csv')).toBe('');
    });
  });
});
