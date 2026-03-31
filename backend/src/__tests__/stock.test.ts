import { describe, it, expect } from 'vitest';

/**
 * 股票数据验证和操作测试
 */

interface StockInfo {
  code: string;
  name: string;
  market: 'SH' | 'SZ' | 'BJ';
  sector: string;
  industry: string;
  listDate: string;
  status: 'active' | 'suspended' | 'delisted';
}

interface StockPrice {
  code: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  amount: number;
  change: number;
  changePercent: number;
  timestamp: string;
}

function validateStockCode(code: string): boolean {
  return /^[0-9]{6}$/.test(code);
}

function getMarket(code: string): 'SH' | 'SZ' | 'BJ' | 'UNKNOWN' {
  if (code.startsWith('6') || code.startsWith('9')) return 'SH';
  if (code.startsWith('0') || code.startsWith('3') || code.startsWith('2')) return 'SZ';
  if (code.startsWith('8') || code.startsWith('4')) return 'BJ';
  return 'UNKNOWN';
}

function isKLineValid(kline: StockPrice): boolean {
  if (kline.high < kline.low) return false;
  if (kline.high < kline.open || kline.high < kline.close) return false;
  if (kline.low > kline.open || kline.low > kline.close) return false;
  if (kline.volume < 0 || kline.amount < 0) return false;
  return true;
}

function calcTurnoverRate(volume: number, totalShares: number): number {
  return totalShares > 0 ? (volume / totalShares) * 100 : 0;
}

function calcAmplitude(high: number, low: number, preClose: number): number {
  return preClose > 0 ? ((high - low) / preClose) * 100 : 0;
}

function isST(name: string): boolean {
  return name.includes('ST') || name.includes('*ST');
}

function isLimitUp(price: StockPrice, isST: boolean = false): boolean {
  const limitPercent = isST ? 5 : 10;
  return price.changePercent >= limitPercent - 0.1;
}

function isLimitDown(price: StockPrice, isST: boolean = false): boolean {
  const limitPercent = isST ? 5 : 10;
  return price.changePercent <= -limitPercent + 0.1;
}

describe('Stock Data', () => {
  describe('股票代码验证', () => {
    it('应该验证6位数字代码', () => {
      expect(validateStockCode('000001')).toBe(true);
      expect(validateStockCode('600519')).toBe(true);
      expect(validateStockCode('300750')).toBe(true);
    });

    it('应该拒绝无效代码', () => {
      expect(validateStockCode('0001')).toBe(false);
      expect(validateStockCode('0000001')).toBe(false);
      expect(validateStockCode('ABCDEF')).toBe(false);
      expect(validateStockCode('')).toBe(false);
    });
  });

  describe('交易所判断', () => {
    it('6开头应该是上海', () => {
      expect(getMarket('600519')).toBe('SH');
      expect(getMarket('601318')).toBe('SH');
    });

    it('9开头应该是上海', () => {
      expect(getMarket('900901')).toBe('SH');
    });

    it('0/3/2开头应该是深圳', () => {
      expect(getMarket('000001')).toBe('SZ');
      expect(getMarket('300750')).toBe('SZ');
      expect(getMarket('200001')).toBe('SZ');
    });

    it('8/4开头应该是北京', () => {
      expect(getMarket('830001')).toBe('BJ');
      expect(getMarket('430001')).toBe('BJ');
    });
  });

  describe('K线验证', () => {
    it('有效K线应该通过', () => {
      const kline: StockPrice = {
        code: '000001', open: 10, high: 11, low: 9, close: 10.5,
        volume: 1000000, amount: 10500000, change: 0.5, changePercent: 5,
        timestamp: '2024-01-01',
      };
      expect(isKLineValid(kline)).toBe(true);
    });

    it('最高价低于最低价应该失败', () => {
      const kline: StockPrice = {
        code: '000001', open: 10, high: 9, low: 11, close: 10,
        volume: 1000000, amount: 10000000, change: 0, changePercent: 0,
        timestamp: '2024-01-01',
      };
      expect(isKLineValid(kline)).toBe(false);
    });

    it('收盘价高于最高价应该失败', () => {
      const kline: StockPrice = {
        code: '000001', open: 10, high: 11, low: 9, close: 12,
        volume: 1000000, amount: 11000000, change: 2, changePercent: 20,
        timestamp: '2024-01-01',
      };
      expect(isKLineValid(kline)).toBe(false);
    });
  });

  describe('换手率', () => {
    it('应该正确计算换手率', () => {
      expect(calcTurnoverRate(1000000, 100000000)).toBe(1);
      expect(calcTurnoverRate(5000000, 100000000)).toBe(5);
    });

    it('总股本为0应该返回0', () => {
      expect(calcTurnoverRate(1000, 0)).toBe(0);
    });
  });

  describe('振幅', () => {
    it('应该正确计算振幅', () => {
      expect(calcAmplitude(11, 9, 10)).toBe(20);
    });

    it('前收为0应该返回0', () => {
      expect(calcAmplitude(11, 9, 0)).toBe(0);
    });
  });

  describe('ST判断', () => {
    it('应该识别ST股票', () => {
      expect(isST('ST中安')).toBe(true);
      expect(isST('*ST凯迪')).toBe(true);
    });

    it('非ST应该返回false', () => {
      expect(isST('贵州茅台')).toBe(false);
      expect(isST('平安银行')).toBe(false);
    });
  });

  describe('涨跌停', () => {
    it('应该检测涨停', () => {
      const price: StockPrice = {
        code: '000001', open: 10, high: 11, low: 10, close: 11,
        volume: 1000000, amount: 10500000, change: 1, changePercent: 10,
        timestamp: '2024-01-01',
      };
      expect(isLimitUp(price)).toBe(true);
    });

    it('应该检测跌停', () => {
      const price: StockPrice = {
        code: '000001', open: 10, high: 10, low: 9, close: 9,
        volume: 1000000, amount: 9500000, change: -1, changePercent: -10,
        timestamp: '2024-01-01',
      };
      expect(isLimitDown(price)).toBe(true);
    });

    it('ST涨跌停应该是5%', () => {
      const price: StockPrice = {
        code: '000001', open: 10, high: 10.5, low: 10, close: 10.5,
        volume: 1000000, amount: 10250000, change: 0.5, changePercent: 5,
        timestamp: '2024-01-01',
      };
      expect(isLimitUp(price, true)).toBe(true);
    });
  });
});
