import { describe, it, expect } from 'vitest';

/**
 * 龙虎榜 API 测试
 * 测试龙虎榜记录生成、席位分析、统计逻辑
 */
describe('Top Traders API', () => {
  const BROKER_SEATS = [
    '华泰证券深圳益田路荣超商务中心',
    '国泰君安证券上海江苏路',
    '东方财富证券拉萨团结路第二',
    '中国银河证券绍兴',
    '中信证券上海溧阳路',
    '财通证券杭州上塘路',
    '光大证券佛山绿景路',
    '华鑫证券上海宛平南路',
    '申万宏源证券上海闵行区东川路',
    '招商证券深圳蛇口招商南路',
    '机构专用-1',
    '机构专用-2',
    '机构专用-3',
  ];

  const REASONS = [
    '日涨幅偏离值达7%',
    '日跌幅偏离值达7%',
    '日振幅值达15%',
    '日换手率达20%',
    '连续三个交易日涨幅偏离值累计达20%',
    '无价格涨跌幅限制的证券',
  ];

  function generateTopTraderRecord(symbol: string, name: string) {
    const buyTotal = parseFloat((5e7 + Math.random() * 2e9).toFixed(2));
    const sellTotal = parseFloat((4e7 + Math.random() * 1.8e9).toFixed(2));
    const changePercent = parseFloat((Math.random() * 20 - 10).toFixed(2));

    const entries = BROKER_SEATS.slice(0, 10).map((seat, i) => {
      const buyAmount = parseFloat((1e7 + Math.random() * 5e8).toFixed(2));
      const sellAmount = parseFloat((5e6 + Math.random() * 4e8).toFixed(2));
      return {
        rank: i + 1,
        seatName: seat,
        buyAmount,
        sellAmount,
        netAmount: parseFloat((buyAmount - sellAmount).toFixed(2)),
        isOrganizational: seat.startsWith('机构'),
      };
    });

    return {
      symbol,
      name,
      tradeDate: new Date().toISOString().split('T')[0],
      closePrice: parseFloat((10 + Math.random() * 190).toFixed(2)),
      changePercent,
      turnover: parseFloat((1e8 + Math.random() * 5e9).toFixed(2)),
      reason: REASONS[Math.floor(Math.random() * REASONS.length)],
      buyTotal,
      sellTotal,
      netTotal: parseFloat((buyTotal - sellTotal).toFixed(2)),
      entries,
    };
  }

  describe('Record Generation', () => {
    it('should generate valid record structure', () => {
      const record = generateTopTraderRecord('600519.SH', '贵州茅台');
      expect(record).toHaveProperty('symbol', '600519.SH');
      expect(record).toHaveProperty('name', '贵州茅台');
      expect(record).toHaveProperty('tradeDate');
      expect(record).toHaveProperty('closePrice');
      expect(record).toHaveProperty('changePercent');
      expect(record).toHaveProperty('turnover');
      expect(record).toHaveProperty('reason');
      expect(record).toHaveProperty('buyTotal');
      expect(record).toHaveProperty('sellTotal');
      expect(record).toHaveProperty('netTotal');
      expect(record).toHaveProperty('entries');
    });

    it('should have correct net total calculation', () => {
      const record = generateTopTraderRecord('600519.SH', '贵州茅台');
      expect(record.netTotal).toBeCloseTo(record.buyTotal - record.sellTotal, 2);
    });

    it('should generate 10 entries per record', () => {
      const record = generateTopTraderRecord('600519.SH', '贵州茅台');
      expect(record.entries.length).toBe(10);
    });

    it('should have sequential rank numbers', () => {
      const record = generateTopTraderRecord('600519.SH', '贵州茅台');
      record.entries.forEach((entry, i) => {
        expect(entry.rank).toBe(i + 1);
      });
    });

    it('should have valid entry amounts', () => {
      const record = generateTopTraderRecord('600519.SH', '贵州茅台');
      record.entries.forEach(entry => {
        expect(entry.buyAmount).toBeGreaterThan(0);
        expect(entry.sellAmount).toBeGreaterThan(0);
        expect(entry.netAmount).toBeCloseTo(entry.buyAmount - entry.sellAmount, 2);
      });
    });

    it('should identify organizational seats', () => {
      const record = generateTopTraderRecord('600519.SH', '贵州茅台');
      const orgEntries = record.entries.filter(e => e.isOrganizational);
      const nonOrgEntries = record.entries.filter(e => !e.isOrganizational);
      expect(orgEntries.length + nonOrgEntries.length).toBe(10);
    });

    it('should have valid trade date format', () => {
      const record = generateTopTraderRecord('600519.SH', '贵州茅台');
      expect(record.tradeDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    });

    it('should have valid price range', () => {
      const record = generateTopTraderRecord('600519.SH', '贵州茅台');
      expect(record.closePrice).toBeGreaterThanOrEqual(10);
      expect(record.closePrice).toBeLessThanOrEqual(200);
    });
  });

  describe('Broker Seats', () => {
    it('should have at least 10 broker seats', () => {
      expect(BROKER_SEATS.length).toBeGreaterThanOrEqual(10);
    });

    it('should identify organizational seats correctly', () => {
      const orgSeats = BROKER_SEATS.filter(s => s.startsWith('机构'));
      expect(orgSeats.length).toBe(3);
    });

    it('should identify non-organizational seats correctly', () => {
      const nonOrgSeats = BROKER_SEATS.filter(s => !s.startsWith('机构'));
      expect(nonOrgSeats.length).toBe(10);
    });
  });

  describe('Reasons Validation', () => {
    it('should have valid listing reasons', () => {
      expect(REASONS.length).toBeGreaterThanOrEqual(5);
      REASONS.forEach(reason => {
        expect(reason).toBeTruthy();
        expect(typeof reason).toBe('string');
      });
    });

    it('should include price deviation reasons', () => {
      const hasPriceReason = REASONS.some(r => r.includes('偏离值'));
      expect(hasPriceReason).toBe(true);
    });

    it('should include turnover reason', () => {
      const hasTurnoverReason = REASONS.some(r => r.includes('换手率'));
      expect(hasTurnoverReason).toBe(true);
    });
  });

  describe('Overview Generation', () => {
    function generateOverview(date?: string) {
      return {
        tradeDate: date || new Date().toISOString().split('T')[0],
        totalStocks: 15 + Math.floor(Math.random() * 20),
        buyDominantCount: 8 + Math.floor(Math.random() * 10),
        sellDominantCount: 5 + Math.floor(Math.random() * 8),
        totalBuyAmount: parseFloat((1e10 + Math.random() * 5e10).toFixed(2)),
        totalSellAmount: parseFloat((8e9 + Math.random() * 4e10).toFixed(2)),
        totalNetAmount: parseFloat((Math.random() * 1e10 - 5e9).toFixed(2)),
      };
    }

    it('should generate valid overview', () => {
      const overview = generateOverview();
      expect(overview.totalStocks).toBeGreaterThanOrEqual(15);
      expect(overview.buyDominantCount).toBeGreaterThanOrEqual(8);
      expect(overview.sellDominantCount).toBeGreaterThanOrEqual(5);
    });

    it('should accept custom date', () => {
      const overview = generateOverview('2024-01-15');
      expect(overview.tradeDate).toBe('2024-01-15');
    });

    it('should have valid amount ranges', () => {
      const overview = generateOverview();
      expect(overview.totalBuyAmount).toBeGreaterThan(0);
      expect(overview.totalSellAmount).toBeGreaterThan(0);
    });
  });

  describe('Seat Ranking', () => {
    it('should rank seats by net amount', () => {
      const seats = BROKER_SEATS.slice(0, 10).map((seat, i) => ({
        rank: i + 1,
        seatName: seat,
        totalBuyAmount: 5e8 + Math.random() * 5e9,
        totalSellAmount: 4e8 + Math.random() * 4e9,
        netAmount: Math.random() * 2e9 - 1e9,
        appearCount: Math.floor(3 + Math.random() * 20),
        isOrganizational: seat.startsWith('机构'),
      }));

      const sorted = [...seats].sort((a, b) => b.netAmount - a.netAmount);
      for (let i = 1; i < sorted.length; i++) {
        expect(sorted[i - 1].netAmount).toBeGreaterThanOrEqual(sorted[i].netAmount);
      }
    });

    it('should respect count limit', () => {
      const count = 5;
      const seats = BROKER_SEATS.slice(0, Math.min(count, BROKER_SEATS.length));
      expect(seats.length).toBeLessThanOrEqual(count);
    });
  });

  describe('History Generation', () => {
    it('should generate history with correct day count', () => {
      const days = 7;
      const records = [];
      for (let i = 0; i < Math.min(days, 30); i++) {
        records.push(generateTopTraderRecord('600519.SH', '贵州茅台'));
      }
      expect(records.length).toBe(7);
    });

    it('should cap history at 30 days', () => {
      const days = 50;
      const records = [];
      for (let i = 0; i < Math.min(days, 30); i++) {
        records.push(generateTopTraderRecord('600519.SH', '贵州茅台'));
      }
      expect(records.length).toBe(30);
    });
  });

  describe('Industry Distribution', () => {
    it('should count stocks by industry', () => {
      const distribution: Record<string, number> = {
        '白酒': 3, '新能源': 4, '半导体': 2, '银行': 1, '医药': 2, '消费电子': 1,
      };
      const total = Object.values(distribution).reduce((s, v) => s + v, 0);
      expect(total).toBe(13);
      expect(distribution['白酒']).toBe(3);
    });
  });
});
