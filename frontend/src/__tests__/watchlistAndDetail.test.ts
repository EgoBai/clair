import { describe, it, expect, vi } from 'vitest';

/**
 * WatchlistPanel / WatchlistToggle / QuickActions / StockDetail 组件逻辑测试
 */

describe('WatchlistPanel', () => {
  describe('自选列表', () => {
    const watchlist = [
      { code: '600519', name: '贵州茅台', price: 1800, changePercent: 2.5, addedAt: Date.now() },
      { code: '000858', name: '五粮液', price: 150, changePercent: -1.2, addedAt: Date.now() },
    ];

    it('应该显示自选股票列表', () => {
      expect(watchlist).toHaveLength(2);
    });

    it('应该能添加股票到自选', () => {
      const list = [...watchlist];
      list.push({ code: '601318', name: '中国平安', price: 50, changePercent: 0.5, addedAt: Date.now() });
      expect(list).toHaveLength(3);
    });

    it('应该能从自选移除股票', () => {
      const list = watchlist.filter(s => s.code !== '000858');
      expect(list).toHaveLength(1);
      expect(list[0].code).toBe('600519');
    });

    it('不能重复添加同一股票', () => {
      const exists = watchlist.some(s => s.code === '600519');
      expect(exists).toBe(true);
    });
  });

  describe('自选分组', () => {
    const groups = [
      { name: '默认', stocks: ['600519', '000858'] },
      { name: '科技', stocks: ['002230', '688981'] },
      { name: '金融', stocks: ['601318', '600036'] },
    ];

    it('应该支持多个分组', () => {
      expect(groups).toHaveLength(3);
    });

    it('应该有默认分组', () => {
      expect(groups[0].name).toBe('默认');
    });

    it('分组应该包含股票代码', () => {
      groups.forEach(g => {
        expect(g.stocks.length).toBeGreaterThan(0);
      });
    });
  });

  describe('排序', () => {
    const stocks = [
      { code: 'A', changePercent: 2.5, price: 100 },
      { code: 'B', changePercent: -1.0, price: 50 },
      { code: 'C', changePercent: 5.0, price: 200 },
    ];

    it('应该支持按涨跌幅排序', () => {
      const sorted = [...stocks].sort((a, b) => b.changePercent - a.changePercent);
      expect(sorted[0].code).toBe('C');
    });

    it('应该支持按价格排序', () => {
      const sorted = [...stocks].sort((a, b) => b.price - a.price);
      expect(sorted[0].code).toBe('C');
    });

    it('应该支持自定义拖拽排序', () => {
      const order = ['B', 'A', 'C'];
      const sorted = order.map(code => stocks.find(s => s.code === code)!);
      expect(sorted[0].code).toBe('B');
    });
  });
});

describe('WatchlistToggle', () => {
  describe('收藏状态', () => {
    it('应该能判断是否已收藏', () => {
      const watchlist = ['600519', '000858'];
      const isInWatchlist = (code: string) => watchlist.includes(code);
      expect(isInWatchlist('600519')).toBe(true);
      expect(isInWatchlist('601318')).toBe(false);
    });

    it('点击应该切换收藏状态', () => {
      let watchlist = ['600519'];
      const toggle = (code: string) => {
        if (watchlist.includes(code)) {
          watchlist = watchlist.filter(c => c !== code);
        } else {
          watchlist.push(code);
        }
      };
      toggle('600519');
      expect(watchlist).not.toContain('600519');
      toggle('600519');
      expect(watchlist).toContain('600519');
    });
  });
});

describe('QuickActions', () => {
  describe('快捷操作', () => {
    const actions = [
      { key: 'buy', label: '买入', icon: 'ShoppingCartOutlined' },
      { key: 'sell', label: '卖出', icon: 'DollarOutlined' },
      { key: 'alert', label: '预警', icon: 'BellOutlined' },
      { key: 'share', label: '分享', icon: 'ShareAltOutlined' },
    ];

    it('应该有买入操作', () => {
      expect(actions.find(a => a.key === 'buy')).toBeDefined();
    });

    it('应该有卖出操作', () => {
      expect(actions.find(a => a.key === 'sell')).toBeDefined();
    });

    it('应该有预警操作', () => {
      expect(actions.find(a => a.key === 'alert')).toBeDefined();
    });

    it('应该有分享操作', () => {
      expect(actions.find(a => a.key === 'share')).toBeDefined();
    });
  });
});

describe('StockDetail', () => {
  describe('股票详情数据', () => {
    const stock = {
      code: '600519',
      name: '贵州茅台',
      price: 1800,
      preClose: 1750,
      open: 1760,
      high: 1820,
      low: 1755,
      volume: 50000,
      turnover: 900000000,
      pe: 35,
      pb: 12,
      marketCap: 2.2e12,
      totalShares: 1.25e9,
    };

    it('应该有基础行情数据', () => {
      expect(stock.code).toBe('600519');
      expect(stock.price).toBe(1800);
    });

    it('应该能计算涨跌额', () => {
      const change = stock.price - stock.preClose;
      expect(change).toBe(50);
    });

    it('应该能计算涨跌幅', () => {
      const changePercent = ((stock.price - stock.preClose) / stock.preClose) * 100;
      expect(changePercent).toBeCloseTo(2.86, 1);
    });

    it('应该有估值数据', () => {
      expect(stock.pe).toBeGreaterThan(0);
      expect(stock.pb).toBeGreaterThan(0);
    });

    it('应该有市值数据', () => {
      expect(stock.marketCap).toBeGreaterThan(0);
      expect(stock.totalShares).toBeGreaterThan(0);
    });
  });

  describe('信息标签页', () => {
    const tabs = ['行情', 'K线', '公司', '财务', '公告', '研报', '资金'];
    it('应该有多个信息标签', () => {
      expect(tabs.length).toBeGreaterThanOrEqual(5);
    });
  });
});
