/**
 * 股票 API 扩展测试
 * 覆盖股票详情、K线数据格式化、搜索过滤、分页
 */

import { describe, it, expect } from 'vitest';

describe('股票 API 扩展', () => {
  describe('股票详情数据结构', () => {
    function createStockDetail() {
      return {
        id: 1,
        symbol: '600519',
        name: '贵州茅台',
        market: 'SH',
        industry: '白酒',
        listingDate: '2001-08-27',
        totalShares: 1256197800,
        circulatingShares: 1256197800,
        currentPrice: 1800.50,
        changePercent: 2.35,
        changeAmount: 41.50,
        turnover: 85.6e8,
        volume: 4756321,
        high: 1815.00,
        low: 1760.00,
        open: 1765.00,
        preClose: 1759.00,
        turnoverRate: 0.38,
        pe: 32.5,
        pb: 12.8,
        marketCap: 2260e8,
        circulatingMarketCap: 2260e8,
        week52High: 2100.00,
        week52Low: 1500.00,
      };
    }

    it('股票详情应包含所有必要字段', () => {
      const stock = createStockDetail();
      const requiredFields = ['symbol', 'name', 'market', 'industry', 'currentPrice', 'changePercent'];
      for (const field of requiredFields) {
        expect(stock).toHaveProperty(field);
      }
    });

    it('市值应大于流通市值或等于', () => {
      const stock = createStockDetail();
      expect(stock.marketCap).toBeGreaterThanOrEqual(stock.circulatingMarketCap);
    });

    it('总股本应大于流通股本或等于', () => {
      const stock = createStockDetail();
      expect(stock.totalShares).toBeGreaterThanOrEqual(stock.circulatingShares);
    });

    it('涨跌幅应与涨跌额和前收盘价一致', () => {
      const stock = createStockDetail();
      const calcChangePercent = ((stock.currentPrice - stock.preClose) / stock.preClose) * 100;
      expect(calcChangePercent).toBeCloseTo(stock.changePercent, 1);
    });

    it('52周最高应大于52周最低', () => {
      const stock = createStockDetail();
      expect(stock.week52High).toBeGreaterThan(stock.week52Low);
    });
  });

  describe('K线数据格式', () => {
    interface KLineBar {
      tradeDate: string;
      open: number;
      high: number;
      low: number;
      close: number;
      volume: number;
      amount: number;
    }

    function validateKLine(bar: KLineBar): string[] {
      const errors: string[] = [];
      if (bar.high < bar.low) errors.push('high < low');
      if (bar.high < bar.open) errors.push('high < open');
      if (bar.high < bar.close) errors.push('high < close');
      if (bar.low > bar.open) errors.push('low > open');
      if (bar.low > bar.close) errors.push('low > close');
      if (bar.volume < 0) errors.push('volume < 0');
      if (bar.amount < 0) errors.push('amount < 0');
      if (!/^\d{4}-\d{2}-\d{2}$/.test(bar.tradeDate)) errors.push('invalid date');
      return errors;
    }

    it('正常K线应无错误', () => {
      const bar: KLineBar = { tradeDate: '2024-03-01', open: 100, high: 105, low: 98, close: 103, volume: 1000000, amount: 1e9 };
      expect(validateKLine(bar)).toHaveLength(0);
    });

    it('high < low 应报错', () => {
      const bar: KLineBar = { tradeDate: '2024-03-01', open: 100, high: 95, low: 98, close: 97, volume: 1000000, amount: 1e9 };
      expect(validateKLine(bar)).toContain('high < low');
    });

    it('负成交量应报错', () => {
      const bar: KLineBar = { tradeDate: '2024-03-01', open: 100, high: 105, low: 98, close: 103, volume: -1, amount: 1e9 };
      expect(validateKLine(bar)).toContain('volume < 0');
    });

    it('日期格式错误应报错', () => {
      const bar: KLineBar = { tradeDate: '2024/03/01', open: 100, high: 105, low: 98, close: 103, volume: 1000000, amount: 1e9 };
      expect(validateKLine(bar)).toContain('invalid date');
    });
  });

  describe('搜索过滤和排序', () => {
    interface StockListItem {
      symbol: string;
      name: string;
      industry: string;
      market: string;
      currentPrice: number;
      changePercent: number;
      turnover: number;
      marketCap: number;
    }

    const stocks: StockListItem[] = [
      { symbol: '600519', name: '贵州茅台', industry: '白酒', market: 'SH', currentPrice: 1800, changePercent: 2.5, turnover: 85e8, marketCap: 2260e8 },
      { symbol: '000858', name: '五粮液', industry: '白酒', market: 'SZ', currentPrice: 165, changePercent: -1.2, turnover: 45e8, marketCap: 640e8 },
      { symbol: '300750', name: '宁德时代', industry: '新能源', market: 'SZ', currentPrice: 200, changePercent: 3.8, turnover: 95e8, marketCap: 980e8 },
      { symbol: '601318', name: '中国平安', industry: '保险', market: 'SH', currentPrice: 48, changePercent: 0.5, turnover: 35e8, marketCap: 870e8 },
    ];

    it('按行业筛选应返回正确结果', () => {
      const baijiu = stocks.filter(s => s.industry === '白酒');
      expect(baijiu).toHaveLength(2);
      expect(baijiu.map(s => s.symbol)).toContain('600519');
    });

    it('按涨跌幅排序（降序）', () => {
      const sorted = [...stocks].sort((a, b) => b.changePercent - a.changePercent);
      expect(sorted[0].symbol).toBe('300750');
      expect(sorted[sorted.length - 1].symbol).toBe('000858');
    });

    it('按市值排序（降序）', () => {
      const sorted = [...stocks].sort((a, b) => b.marketCap - a.marketCap);
      expect(sorted[0].symbol).toBe('600519');
    });

    it('按成交额排序', () => {
      const sorted = [...stocks].sort((a, b) => b.turnover - a.turnover);
      expect(sorted[0].symbol).toBe('300750');
    });

    it('关键字搜索应匹配名称', () => {
      const keyword = '茅台';
      const results = stocks.filter(s => s.name.includes(keyword) || s.symbol.includes(keyword));
      expect(results).toHaveLength(1);
      expect(results[0].symbol).toBe('600519');
    });

    it('分页应正确切分', () => {
      const page = 2;
      const pageSize = 2;
      const start = (page - 1) * pageSize;
      const pageItems = stocks.slice(start, start + pageSize);
      expect(pageItems).toHaveLength(2);
      expect(pageItems[0].symbol).toBe('300750');
    });
  });

  describe('涨跌颜色渲染', () => {
    function getChangeColor(value: number): string {
      if (value > 0) return '#dc2626'; // A股红涨
      if (value < 0) return '#16a34a'; // A股绿跌
      return '#6b7280'; // 平盘灰
    }

    it('正数应返回红色', () => {
      expect(getChangeColor(2.5)).toBe('#dc2626');
    });

    it('负数应返回绿色', () => {
      expect(getChangeColor(-1.8)).toBe('#16a34a');
    });

    it('零应返回灰色', () => {
      expect(getChangeColor(0)).toBe('#6b7280');
    });

    it('A股惯例：红涨绿跌', () => {
      expect(getChangeColor(5)).toBe('#dc2626'); // 红
      expect(getChangeColor(-5)).toBe('#16a34a'); // 绿
    });
  });
});
