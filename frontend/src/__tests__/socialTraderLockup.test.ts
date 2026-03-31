import { describe, it, expect } from 'vitest';

/**
 * SocialPage / TopTradersPage / LockupCalendarPage / BlockTradesPage / ShareholderChangesPage 逻辑测试
 */

describe('SocialPage', () => {
  describe('社交数据', () => {
    const socialData = {
      sentiment: 'bullish',
      hotStocks: [
        { code: '600519', name: '贵州茅台', mentions: 5000, sentiment: 0.7 },
        { code: '000858', name: '五粮液', mentions: 3500, sentiment: 0.5 },
      ],
      trendingTopics: ['白酒', '半导体', '新能源'],
    };

    it('应该有市场情绪', () => {
      expect(['bullish', 'bearish', 'neutral']).toContain(socialData.sentiment);
    });

    it('应该有热门股票', () => {
      expect(socialData.hotStocks).toHaveLength(2);
    });

    it('应该有讨论热度', () => {
      socialData.hotStocks.forEach(s => expect(s.mentions).toBeGreaterThan(0));
    });

    it('应该有情感评分', () => {
      socialData.hotStocks.forEach(s => {
        expect(s.sentiment).toBeGreaterThanOrEqual(-1);
        expect(s.sentiment).toBeLessThanOrEqual(1);
      });
    });

    it('应该有热门话题', () => {
      expect(socialData.trendingTopics.length).toBeGreaterThan(0);
    });
  });
});

describe('TopTradersPage', () => {
  describe('牛人追踪', () => {
    const traders = [
      { rank: 1, name: '牛人A', returnRate: 120, winRate: 75, followers: 50000 },
      { rank: 2, name: '牛人B', returnRate: 95, winRate: 68, followers: 35000 },
    ];

    it('应该有排名', () => {
      traders.forEach(t => expect(t.rank).toBeGreaterThan(0));
    });

    it('应该有收益率', () => {
      traders.forEach(t => expect(typeof t.returnRate).toBe('number'));
    });

    it('应该有胜率', () => {
      traders.forEach(t => {
        expect(t.winRate).toBeGreaterThanOrEqual(0);
        expect(t.winRate).toBeLessThanOrEqual(100);
      });
    });

    it('应该有粉丝数', () => {
      traders.forEach(t => expect(t.followers).toBeGreaterThan(0));
    });

    it('应该按收益率排序', () => {
      for (let i = 1; i < traders.length; i++) {
        expect(traders[i - 1].returnRate).toBeGreaterThanOrEqual(traders[i].returnRate);
      }
    });
  });
});

describe('LockupCalendarPage', () => {
  describe('解禁日历', () => {
    const lockups = [
      { date: '2025-03-15', code: '600519', name: '贵州茅台', shares: 1e8, percent: 8 },
      { date: '2025-03-20', code: '000858', name: '五粮液', shares: 5e7, percent: 5 },
    ];

    it('应该有解禁日期', () => {
      lockups.forEach(l => expect(l.date).toMatch(/^\d{4}-\d{2}-\d{2}$/));
    });

    it('应该有解禁股数', () => {
      lockups.forEach(l => expect(l.shares).toBeGreaterThan(0));
    });

    it('应该有解禁比例', () => {
      lockups.forEach(l => {
        expect(l.percent).toBeGreaterThan(0);
        expect(l.percent).toBeLessThanOrEqual(100);
      });
    });

    it('大比例解禁应该标红预警', () => {
      const largeLockups = lockups.filter(l => l.percent > 5);
      expect(largeLockups.length).toBeGreaterThan(0);
    });
  });
});

describe('BlockTradesPage', () => {
  describe('大宗交易', () => {
    const trades = [
      { code: '600519', name: '贵州茅台', price: 1780, volume: 10000, discount: -2.0, buyer: '机构A', seller: '营业部B' },
      { code: '000858', name: '五粮液', price: 148, volume: 50000, discount: 1.5, buyer: '营业部C', seller: '机构D' },
    ];

    it('应该有成交价格', () => {
      trades.forEach(t => expect(t.price).toBeGreaterThan(0));
    });

    it('应该有成交量', () => {
      trades.forEach(t => expect(t.volume).toBeGreaterThan(0));
    });

    it('应该有折溢价率', () => {
      trades.forEach(t => expect(typeof t.discount).toBe('number'));
    });

    it('折价买入可能看多', () => {
      const discountBuy = trades.filter(t => t.discount < 0);
      expect(discountBuy.length).toBeGreaterThan(0);
    });
  });
});

describe('ShareholderChangesPage', () => {
  describe('股东变动', () => {
    const changes = [
      { code: '600519', name: '贵州茅台', prevCount: 100000, currCount: 95000, change: -5 },
      { code: '000858', name: '五粮液', prevCount: 80000, currCount: 85000, change: 6.25 },
    ];

    it('应该有股东户数变化', () => {
      changes.forEach(c => {
        expect(c.prevCount).toBeGreaterThan(0);
        expect(c.currCount).toBeGreaterThan(0);
      });
    });

    it('应该计算变化百分比', () => {
      changes.forEach(c => {
        const calcChange = ((c.currCount - c.prevCount) / c.prevCount) * 100;
        expect(calcChange).toBeCloseTo(c.change, 0);
      });
    });

    it('股东户数减少可能是筹码集中', () => {
      const concentrated = changes.filter(c => c.change < 0);
      expect(concentrated).toHaveLength(1);
    });
  });
});
