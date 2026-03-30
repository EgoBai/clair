/**
 * 融资融券测试
 */

import { describe, it, expect } from 'vitest';
import { generateMarginData, generateMarginOverview } from '../api/margin';

describe('融资融券', () => {
  describe('个股融资融券数据', () => {
    it('应生成指定天数的数据', () => {
      const data = generateMarginData('600519.SH', '贵州茅台', 30);
      expect(data).toHaveLength(30);
    });

    it('默认应生成30天数据', () => {
      const data = generateMarginData('000858.SZ', '五粮液');
      expect(data).toHaveLength(30);
    });

    it('每条记录应包含完整字段', () => {
      const data = generateMarginData('601318.SH', '中国平安', 5);

      for (const record of data) {
        expect(record).toHaveProperty('symbol');
        expect(record).toHaveProperty('name');
        expect(record).toHaveProperty('tradeDate');
        expect(record).toHaveProperty('financingBalance');
        expect(record).toHaveProperty('financingBuyAmount');
        expect(record).toHaveProperty('financingRepayAmount');
        expect(record).toHaveProperty('financingNetBuy');
        expect(record).toHaveProperty('securitiesBalance');
        expect(record).toHaveProperty('securitiesSellAmount');
        expect(record).toHaveProperty('securitiesRepayAmount');
        expect(record).toHaveProperty('securitiesNetSell');
        expect(record).toHaveProperty('totalBalance');
      }
    });

    it('融资余额应为正数', () => {
      const data = generateMarginData('300750.SZ', '宁德时代', 10);

      for (const record of data) {
        expect(record.financingBalance).toBeGreaterThan(0);
      }
    });

    it('融资净买入应接近 买入额 - 偿还额', () => {
      const data = generateMarginData('002594.SZ', '比亚迪', 5);

      for (const record of data) {
        const diff = Math.abs(record.financingNetBuy - (record.financingBuyAmount - record.financingRepayAmount));
        expect(diff).toBeLessThan(0.02);
      }
    });

    it('日期应按时间正序排列', () => {
      const data = generateMarginData('600036.SH', '招商银行', 10);

      for (let i = 1; i < data.length; i++) {
        expect(data[i].tradeDate >= data[i - 1].tradeDate).toBe(true);
      }
    });

    it('请求天数超过120时仍应生成数据', () => {
      const data = generateMarginData('600519.SH', '茅台', 200);
      expect(data.length).toBe(200);
    });
  });

  describe('融资融券概览', () => {
    it('应包含必要字段', () => {
      const overview = generateMarginOverview();

      expect(overview).toHaveProperty('totalFinancingBalance');
      expect(overview).toHaveProperty('totalSecuritiesBalance');
      expect(overview).toHaveProperty('financingStockCount');
      expect(overview).toHaveProperty('securitiesStockCount');
      expect(overview).toHaveProperty('topFinancingIncrease');
      expect(overview).toHaveProperty('topSecuritiesIncrease');
    });

    it('融资余额应大于零', () => {
      const overview = generateMarginOverview();
      expect(overview.totalFinancingBalance).toBeGreaterThan(0);
    });

    it('融资标的数应大于融券标的数', () => {
      const overview = generateMarginOverview();
      expect(overview.financingStockCount).toBeGreaterThan(overview.securitiesStockCount);
    });

    it('TOP榜应包含股票信息', () => {
      const overview = generateMarginOverview();

      for (const stock of overview.topFinancingIncrease) {
        expect(stock).toHaveProperty('symbol');
        expect(stock).toHaveProperty('name');
        expect(stock).toHaveProperty('change');
        expect(stock.change).toBeGreaterThan(0);
      }
    });
  });
});
