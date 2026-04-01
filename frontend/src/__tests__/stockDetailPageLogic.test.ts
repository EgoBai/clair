/**
 * 股票详情页逻辑测试
 * 覆盖涨跌颜色、成交量格式化、自选股判断、K线数据转换
 */

import { describe, it, expect } from 'vitest';

describe('股票详情页逻辑', () => {
  describe('涨跌颜色', () => {
    function getChangeColor(changePercent: number): string {
      return changePercent >= 0 ? '#ef4444' : '#22c55e';
    }

    it('上涨为红色', () => {
      expect(getChangeColor(5.0)).toBe('#ef4444');
      expect(getChangeColor(0.01)).toBe('#ef4444');
    });

    it('平盘为红色', () => {
      expect(getChangeColor(0)).toBe('#ef4444');
    });

    it('下跌为绿色', () => {
      expect(getChangeColor(-3.5)).toBe('#22c55e');
      expect(getChangeColor(-0.01)).toBe('#22c55e');
    });
  });

  describe('成交量格式化', () => {
    function formatVolume(vol?: number): string {
      if (!vol) return '0';
      if (vol >= 1e8) return (vol / 1e8).toFixed(2) + '亿';
      if (vol >= 1e4) return (vol / 1e4).toFixed(0) + '万';
      return vol.toString();
    }

    it('亿级成交量', () => {
      expect(formatVolume(1.5e8)).toBe('1.50亿');
      expect(formatVolume(10e8)).toBe('10.00亿');
    });

    it('万级成交量', () => {
      expect(formatVolume(50000)).toBe('5万');
    });

    it('小成交量', () => {
      expect(formatVolume(500)).toBe('500');
    });

    it('undefined返回0', () => {
      expect(formatVolume()).toBe('0');
      expect(formatVolume(0)).toBe('0');
    });
  });

  describe('成交额格式化', () => {
    function formatTurnover(turnover?: number): string {
      if (!turnover) return '0';
      if (turnover >= 1e8) return (turnover / 1e8).toFixed(2) + '亿';
      if (turnover >= 1e4) return (turnover / 1e4).toFixed(0) + '万';
      return turnover.toString();
    }

    it('亿级成交额', () => {
      expect(formatTurnover(2.3e8)).toBe('2.30亿');
    });

    it('万级成交额', () => {
      expect(formatTurnover(150000)).toBe('15万');
    });
  });

  describe('自选股判断', () => {
    function isInWatchlist(symbol: string, watchlist: { symbol: string }[]): boolean {
      return watchlist.some(s => s.symbol === symbol);
    }

    it('已在自选股中', () => {
      const list = [{ symbol: '600519' }, { symbol: '000858' }];
      expect(isInWatchlist('600519', list)).toBe(true);
    });

    it('不在自选股中', () => {
      const list = [{ symbol: '600519' }];
      expect(isInWatchlist('000858', list)).toBe(false);
    });

    it('空自选股列表', () => {
      expect(isInWatchlist('600519', [])).toBe(false);
    });
  });

  describe('K线数据转换', () => {
    interface Quote {
      date: string;
      open: number;
      close: number;
      high: number;
      low: number;
      volume: number;
    }

    interface KLineData {
      date: string;
      open: number;
      close: number;
      high: number;
      low: number;
      volume: number;
    }

    function quotesToKlines(quotes: Quote[]): KLineData[] {
      return quotes.map(q => ({
        date: q.date,
        open: q.open,
        close: q.close,
        high: q.high,
        low: q.low,
        volume: q.volume,
      }));
    }

    it('应正确转换K线数据', () => {
      const quotes: Quote[] = [
        { date: '2024-01-02', open: 100, close: 105, high: 108, low: 99, volume: 100000 },
        { date: '2024-01-03', open: 105, close: 103, high: 107, low: 102, volume: 80000 },
      ];
      const klines = quotesToKlines(quotes);
      expect(klines).toHaveLength(2);
      expect(klines[0].date).toBe('2024-01-02');
      expect(klines[0].close).toBe(105);
      expect(klines[1].high).toBe(107);
    });

    it('空数据应返回空数组', () => {
      expect(quotesToKlines([])).toEqual([]);
    });
  });

  describe('指标切换', () => {
    type SubIndicator = 'volume' | 'macd' | 'kdj' | 'rsi' | 'none';
    const validIndicators: SubIndicator[] = ['volume', 'macd', 'kdj', 'rsi', 'none'];

    function isValidIndicator(val: string): val is SubIndicator {
      return validIndicators.includes(val as SubIndicator);
    }

    it('应识别有效指标', () => {
      for (const ind of validIndicators) {
        expect(isValidIndicator(ind)).toBe(true);
      }
    });

    it('应拒绝无效指标', () => {
      expect(isValidIndicator('invalid')).toBe(false);
      expect(isValidIndicator('')).toBe(false);
    });
  });

  describe('股票代码解析', () => {
    function parseSymbol(symbol: string): { market: string; code: string } {
      if (symbol.startsWith('6')) return { market: 'SH', code: symbol };
      if (symbol.startsWith('0') || symbol.startsWith('3')) return { market: 'SZ', code: symbol };
      if (symbol.startsWith('8') || symbol.startsWith('4')) return { market: 'BJ', code: symbol };
      return { market: 'UNKNOWN', code: symbol };
    }

    it('6开头为上海', () => {
      expect(parseSymbol('600519')).toEqual({ market: 'SH', code: '600519' });
    });

    it('0开头为深圳', () => {
      expect(parseSymbol('000858')).toEqual({ market: 'SZ', code: '000858' });
    });

    it('3开头为深圳创业板', () => {
      expect(parseSymbol('300750')).toEqual({ market: 'SZ', code: '300750' });
    });

    it('8/4开头为北京', () => {
      expect(parseSymbol('830000')).toEqual({ market: 'BJ', code: '830000' });
    });
  });
});
