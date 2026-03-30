/**
 * 数据校验测试
 * 测试异常检测引擎和数据一致性校验
 */

import { describe, it, expect } from 'vitest';
import {
  DataAnomalyDetector,
  FinancialDataPrecision,
  DataConsistencyChecker,
} from '../utils/dataValidation';
import { KLineData } from '../../shared/types';

// ==================== 测试数据 ====================

function makeKLine(overrides: Partial<KLineData> = {}): KLineData {
  return {
    tradeDate: '2024-01-15',
    open: 10.00,
    close: 10.50,
    high: 10.80,
    low: 9.80,
    volume: 1000000,
    turnover: 10500000,
    ...overrides,
  };
}

function makeSeries(count: number, startPrice = 10): KLineData[] {
  const data: KLineData[] = [];
  let price = startPrice;
  for (let i = 0; i < count; i++) {
    const change = (Math.random() - 0.5) * 0.4;
    const open = price;
    const close = price + change;
    const high = Math.max(open, close) + Math.random() * 0.1;
    const low = Math.min(open, close) - Math.random() * 0.1;
    data.push({
      tradeDate: `2024-01-${String(i + 1).padStart(2, '0')}`,
      open: Math.round(open * 100) / 100,
      close: Math.round(close * 100) / 100,
      high: Math.round(high * 100) / 100,
      low: Math.round(low * 100) / 100,
      volume: Math.round(1000000 + Math.random() * 500000),
      turnover: Math.round((open + close) / 2 * 1000000),
    });
    price = close;
  }
  return data;
}

// ==================== DataAnomalyDetector ====================

describe('DataAnomalyDetector', () => {
  const detector = new DataAnomalyDetector();

  describe('正常数据', () => {
    it('正常K线数据应该无异常', () => {
      const data = makeSeries(10);
      const report = detector.detect('000001.SZ', data);
      expect(report.anomalyCount).toBe(0);
      expect(report.qualityScore).toBe(100);
    });

    it('空数据应该返回满分', () => {
      const report = detector.detect('000001.SZ', []);
      expect(report.qualityScore).toBe(100);
      expect(report.anomalyCount).toBe(0);
    });
  });

  describe('价格跳变检测', () => {
    it('应该检测到大幅价格跳变', () => {
      const data = [
        makeKLine({ tradeDate: '2024-01-01', close: 10.00 }),
        makeKLine({ tradeDate: '2024-01-02', close: 12.00 }), // 20% 跳变
      ];
      const report = detector.detect('000001.SZ', data);
      const priceJumps = report.anomalies.filter(a => a.type === 'price_jump');
      expect(priceJumps.length).toBeGreaterThan(0);
      expect(priceJumps[0].severity).toBe('high');
    });

    it('小幅波动不应该触发警报', () => {
      const data = [
        makeKLine({ tradeDate: '2024-01-01', close: 10.00 }),
        makeKLine({ tradeDate: '2024-01-02', close: 10.50 }), // 5% 波动
      ];
      const report = detector.detect('000001.SZ', data);
      const priceJumps = report.anomalies.filter(a => a.type === 'price_jump');
      expect(priceJumps.length).toBe(0);
    });
  });

  describe('价格逻辑校验', () => {
    it('应该检测最高价低于收盘价', () => {
      const data = [
        makeKLine({ high: 9.00, close: 10.00 }), // 最高价 < 收盘价
      ];
      const report = detector.detect('000001.SZ', data);
      const inversions = report.anomalies.filter(a => a.type === 'price_inversion');
      expect(inversions.length).toBeGreaterThan(0);
      expect(inversions[0].severity).toBe('critical');
    });

    it('应该检测最低价高于开盘价', () => {
      const data = [
        makeKLine({ low: 11.00, open: 10.00 }), // 最低价 > 开盘价
      ];
      const report = detector.detect('000001.SZ', data);
      const inversions = report.anomalies.filter(a => a.type === 'price_inversion');
      expect(inversions.length).toBeGreaterThan(0);
    });

    it('应该检测最高价低于最低价', () => {
      const data = [
        makeKLine({ high: 9.00, low: 11.00 }), // 高 < 低
      ];
      const report = detector.detect('000001.SZ', data);
      const inversions = report.anomalies.filter(a => a.type === 'price_inversion');
      expect(inversions.length).toBeGreaterThan(0);
    });
  });

  describe('负价格检测', () => {
    it('应该检测负价格', () => {
      const data = [
        makeKLine({ close: -5.00 }),
      ];
      const report = detector.detect('000001.SZ', data);
      const negPrices = report.anomalies.filter(a => a.type === 'negative_price');
      expect(negPrices.length).toBeGreaterThan(0);
      expect(negPrices[0].severity).toBe('critical');
    });
  });

  describe('零成交量检测', () => {
    it('应该检测成交量为0但成交额非0', () => {
      const data = [
        makeKLine({ volume: 0, turnover: 1000000 }),
      ];
      const report = detector.detect('000001.SZ', data);
      const zeroVol = report.anomalies.filter(a => a.type === 'zero_volume');
      expect(zeroVol.length).toBeGreaterThan(0);
    });
  });

  describe('涨跌幅校验', () => {
    it('应该检测超过涨跌停限制', () => {
      const data = [
        makeKLine({ tradeDate: '2024-01-01', close: 10.00 }),
        makeKLine({ tradeDate: '2024-01-02', close: 12.50 }), // 25% 涨幅超过 20% 涨停
      ];
      const report = detector.detect('000001.SZ', data);
      const exceeded = report.anomalies.filter(a => a.type === 'amplitude_exceeded');
      expect(exceeded.length).toBeGreaterThan(0);
    });
  });

  describe('数据质量评分', () => {
    it('应该根据异常严重程度扣分', () => {
      const data = [
        makeKLine({ tradeDate: '2024-01-01', close: 10.00 }),
        makeKLine({ tradeDate: '2024-01-02', close: 13.00 }), // 价格跳变
        makeKLine({ tradeDate: '2024-01-03', close: 10.50 }),
        makeKLine({ tradeDate: '2024-01-04', close: 10.60 }),
        makeKLine({ tradeDate: '2024-01-05', close: 10.70 }),
      ];
      const report = detector.detect('000001.SZ', data);
      expect(report.qualityScore).toBeLessThanOrEqual(100);
      expect(report.qualityScore).toBeGreaterThanOrEqual(0);
      expect(report.anomalies.length).toBeGreaterThan(0);
    });
  });
});

// ==================== FinancialDataPrecision ====================

describe('FinancialDataPrecision', () => {
  describe('normalizePE', () => {
    it('应该保留2位小数', () => {
      expect(FinancialDataPrecision.normalizePE(15.678)).toBe(15.68);
    });

    it('应该拒绝异常PE值', () => {
      expect(FinancialDataPrecision.normalizePE(9999)).toBeNull();
      expect(FinancialDataPrecision.normalizePE(-600)).toBeNull();
    });

    it('应该处理null/undefined', () => {
      expect(FinancialDataPrecision.normalizePE(null)).toBeNull();
      expect(FinancialDataPrecision.normalizePE(undefined)).toBeNull();
    });

    it('应该处理Infinity', () => {
      expect(FinancialDataPrecision.normalizePE(Infinity)).toBeNull();
      expect(FinancialDataPrecision.normalizePE(NaN)).toBeNull();
    });
  });

  describe('normalizePB', () => {
    it('应该正常处理', () => {
      expect(FinancialDataPrecision.normalizePB(2.567)).toBe(2.57);
    });

    it('应该拒绝异常值', () => {
      expect(FinancialDataPrecision.normalizePB(150)).toBeNull();
    });
  });

  describe('normalizeROE', () => {
    it('应该正常处理', () => {
      expect(FinancialDataPrecision.normalizeROE(15.67)).toBe(15.67);
    });

    it('应该拒绝超范围值', () => {
      expect(FinancialDataPrecision.normalizeROE(150)).toBeNull();
    });
  });

  describe('normalizeVolume', () => {
    it('应该取整', () => {
      expect(FinancialDataPrecision.normalizeVolume(1234567.8)).toBe(1234568);
    });

    it('应该拒绝负值', () => {
      expect(FinancialDataPrecision.normalizeVolume(-100)).toBeNull();
    });
  });

  describe('normalizeChangePercent', () => {
    it('应该保留2位小数', () => {
      expect(FinancialDataPrecision.normalizeChangePercent(3.567)).toBe(3.57);
      expect(FinancialDataPrecision.normalizeChangePercent(-2.345)).toBe(-2.35);
    });
  });
});

// ==================== DataConsistencyChecker ====================

describe('DataConsistencyChecker', () => {
  describe('validateQuoteRecord', () => {
    it('应该通过有效数据', () => {
      const record = {
        trade_date: '2024-01-15',
        open_price: 10.00,
        close_price: 10.50,
        high_price: 10.80,
        low_price: 9.80,
        volume: 1000000,
        turnover: 10500000,
      };
      const result = DataConsistencyChecker.validateQuoteRecord(record);
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('应该检测缺少必填字段', () => {
      const record = {
        trade_date: '2024-01-15',
        open_price: 10.00,
        // 缺少 close_price 等
      };
      const result = DataConsistencyChecker.validateQuoteRecord(record);
      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
    });

    it('应该检测负成交量', () => {
      const record = {
        trade_date: '2024-01-15',
        open_price: 10.00,
        close_price: 10.50,
        high_price: 10.80,
        low_price: 9.80,
        volume: -100,
      };
      const result = DataConsistencyChecker.validateQuoteRecord(record);
      expect(result.valid).toBe(false);
    });

    it('应该检测价格倒挂', () => {
      const record = {
        trade_date: '2024-01-15',
        open_price: 10.00,
        close_price: 10.50,
        high_price: 9.00, // < low
        low_price: 9.80,
        volume: 1000000,
      };
      const result = DataConsistencyChecker.validateQuoteRecord(record);
      expect(result.valid).toBe(false);
    });
  });

  describe('compareData', () => {
    it('相同数据应该匹配', () => {
      const frontend = { price: 10.50, volume: 1000000, name: '平安银行' };
      const backend = { price: 10.50, volume: 1000000, name: '平安银行' };
      const result = DataConsistencyChecker.compareData(frontend, backend, ['price', 'volume', 'name']);
      expect(result.match).toBe(true);
    });

    it('数值微小误差应该匹配', () => {
      const frontend = { price: 10.50 };
      const backend = { price: 10.505 }; // 0.005 误差
      const result = DataConsistencyChecker.compareData(frontend, backend, ['price']);
      expect(result.match).toBe(true);
    });

    it('数值较大误差应该不匹配', () => {
      const frontend = { price: 10.50 };
      const backend = { price: 10.60 }; // 0.10 误差
      const result = DataConsistencyChecker.compareData(frontend, backend, ['price']);
      expect(result.match).toBe(false);
      expect(result.mismatches[0].field).toBe('price');
    });

    it('字符串不同应该不匹配', () => {
      const frontend = { name: '平安银行' };
      const backend = { name: '浦发银行' };
      const result = DataConsistencyChecker.compareData(frontend, backend, ['name']);
      expect(result.match).toBe(false);
    });
  });
});
