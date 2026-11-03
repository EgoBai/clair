import { describe, it, expect } from 'vitest';
import { calcRSI } from '../utils/futureValueUtils';

/**
 * 高级筛选器 - 技术指标筛选测试（影子测试迁移 · 批次 18）
 *
 * 生产真源：backend/src/utils/futureValueUtils.ts
 *   → calcRSI(L59-84)：Wilder 平滑，index=period 起才有值，数据不足返回等长全 null 数组；
 *     calcEMA(L89-104)：index=period-1 起有值（SMA 作种子）；
 *     calcMACD(L109-145)：dif 自 index 25 起、dea 自 index 33 起，histogram = 2*(dif-dea)（L140）。
 *
 * 迁移：旧内联 calcRSI（迁移前 L72-85，返回四舍五入标量）→ 生产 calcRSI（返回 (number|null)[]）。
 *
 * 旧断言修正（旧行号指迁移前版本）：
 *   1) 旧内联数据不足 period+1 条时返回 50（旧 L73）；生产返回等长全 null 数组（L59-61）。
 *   2) 旧内联返回两位小数标量；生产返回数组且不取整：本数据末值 77.77777777777777（旧值 77.78）。
 *   3) 旧断言直接比较标量；迁移后取数组末元素，并显式断言 [0, period-1] 为预热期 null。
 *
 * 已删除（原测试从未调用，无断言可迁移，不补造断言）：
 *   旧内联 calcMACD（迁移前 L87-93，递归实现、histogram=dif-dea）与 calcEMA（旧 L95-103）。
 *
 * 未迁移（生产无对应导出，保留本地 helper，不虚构生产代码）：
 *   filterByTechnical / TechnicalCriteria / StockTechnicalData：生产高级筛选在
 *   backend/src/api/advanced-screener.ts:468-517 通过 SQL 条件构造（applyConditions）实现，
 *   无内存版技术指标筛选函数，故该 helper 仅作筛选行为夹具保留。
 */

interface TechnicalCriteria {
  rsi?: { min?: number; max?: number };
  macd?: { signal: 'bullish' | 'bearish' | 'any' };
  bollinger?: { position: 'upper' | 'middle' | 'lower' | 'any' };
  ma?: { above?: number; below?: number }; // MA period
  volume?: { minRatio?: number }; // volume / avgVolume
  kdj?: { signal: 'golden' | 'death' | 'any' };
}

interface StockTechnicalData {
  code: string;
  rsi: number;
  macd: { value: number; signal: number; histogram: number };
  bollinger: { upper: number; middle: number; lower: number; price: number };
  ma: Record<number, number>;
  volume: number;
  avgVolume: number;
  kdj: { k: number; d: number; j: number };
  price: number;
}

// 未迁移：生产无内存版技术指标筛选函数（见文件头说明），保留为筛选行为夹具。
function filterByTechnical(data: StockTechnicalData[], criteria: TechnicalCriteria): StockTechnicalData[] {
  return data.filter(stock => {
    if (criteria.rsi) {
      if (criteria.rsi.min !== undefined && stock.rsi < criteria.rsi.min) return false;
      if (criteria.rsi.max !== undefined && stock.rsi > criteria.rsi.max) return false;
    }

    if (criteria.macd && criteria.macd.signal !== 'any') {
      if (criteria.macd.signal === 'bullish' && stock.macd.histogram <= 0) return false;
      if (criteria.macd.signal === 'bearish' && stock.macd.histogram >= 0) return false;
    }

    if (criteria.bollinger && criteria.bollinger.position !== 'any') {
      const { price, upper, middle, lower } = stock.bollinger;
      if (criteria.bollinger.position === 'upper' && price < middle) return false;
      if (criteria.bollinger.position === 'lower' && price > middle) return false;
      if (criteria.bollinger.position === 'middle' && (price < lower || price > upper)) return false;
    }

    if (criteria.ma) {
      if (criteria.ma.above !== undefined) {
        const maVal = stock.ma[criteria.ma.above];
        if (maVal !== undefined && stock.price <= maVal) return false;
      }
      if (criteria.ma.below !== undefined) {
        const maVal = stock.ma[criteria.ma.below];
        if (maVal !== undefined && stock.price >= maVal) return false;
      }
    }

    if (criteria.volume) {
      const ratio = stock.avgVolume > 0 ? stock.volume / stock.avgVolume : 0;
      if (criteria.volume.minRatio !== undefined && ratio < criteria.volume.minRatio) return false;
    }

    if (criteria.kdj && criteria.kdj.signal !== 'any') {
      if (criteria.kdj.signal === 'golden' && stock.kdj.k <= stock.kdj.d) return false;
      if (criteria.kdj.signal === 'death' && stock.kdj.k >= stock.kdj.d) return false;
    }

    return true;
  });
}

describe('Advanced Screener - Technical', () => {
  const stocks: StockTechnicalData[] = [
    {
      code: '000001', rsi: 70, price: 12.5,
      macd: { value: 0.5, signal: 0.3, histogram: 0.2 },
      bollinger: { upper: 13, middle: 12, lower: 11, price: 12.5 },
      ma: { 5: 12.3, 10: 12.0, 20: 11.5, 60: 10.0 },
      volume: 5000000, avgVolume: 3000000,
      kdj: { k: 80, d: 70, j: 90 },
    },
    {
      code: '600519', rsi: 30, price: 1800,
      macd: { value: -5, signal: -3, histogram: -2 },
      bollinger: { upper: 1850, middle: 1800, lower: 1750, price: 1780 },
      ma: { 5: 1810, 10: 1820, 20: 1830, 60: 1850 },
      volume: 800000, avgVolume: 1000000,
      kdj: { k: 20, d: 30, j: 10 },
    },
    {
      code: '300750', rsi: 50, price: 200,
      macd: { value: 2, signal: 2, histogram: 0 },
      bollinger: { upper: 210, middle: 200, lower: 190, price: 200 },
      ma: { 5: 200, 10: 198, 20: 195, 60: 190 },
      volume: 2000000, avgVolume: 2000000,
      kdj: { k: 50, d: 50, j: 50 },
    },
  ];

  describe('RSI筛选', () => {
    it('应该筛选超买股票', () => {
      const result = filterByTechnical(stocks, { rsi: { min: 70 } });
      expect(result.length).toBe(1);
      expect(result[0].code).toBe('000001');
    });

    it('应该筛选超卖股票', () => {
      const result = filterByTechnical(stocks, { rsi: { max: 30 } });
      expect(result.length).toBe(1);
      expect(result[0].code).toBe('600519');
    });

    it('应该筛选RSI区间', () => {
      const result = filterByTechnical(stocks, { rsi: { min: 25, max: 55 } });
      expect(result.length).toBe(2);
    });
  });

  describe('MACD筛选', () => {
    it('应该筛选金叉股票', () => {
      const result = filterByTechnical(stocks, { macd: { signal: 'bullish' } });
      expect(result.some(s => s.code === '000001')).toBe(true);
    });

    it('应该筛选死叉股票', () => {
      const result = filterByTechnical(stocks, { macd: { signal: 'bearish' } });
      expect(result.some(s => s.code === '600519')).toBe(true);
    });
  });

  describe('布林带筛选', () => {
    it('应该筛选上轨附近股票', () => {
      const result = filterByTechnical(stocks, { bollinger: { position: 'upper' } });
      expect(result.some(s => s.code === '000001')).toBe(true);
    });

    it('应该筛选下轨附近股票', () => {
      const result = filterByTechnical(stocks, { bollinger: { position: 'lower' } });
      expect(result.some(s => s.code === '600519')).toBe(true);
    });
  });

  describe('均线筛选', () => {
    it('应该筛选站上MA5的股票', () => {
      const result = filterByTechnical(stocks, { ma: { above: 5 } });
      expect(result.some(s => s.code === '000001')).toBe(true);
    });

    it('应该筛选跌破MA20的股票', () => {
      const result = filterByTechnical(stocks, { ma: { below: 20 } });
      expect(result.some(s => s.code === '600519')).toBe(true);
    });
  });

  describe('成交量筛选', () => {
    it('应该筛选放量股票', () => {
      const result = filterByTechnical(stocks, { volume: { minRatio: 1.5 } });
      expect(result.length).toBe(1);
      expect(result[0].code).toBe('000001');
    });
  });

  describe('KDJ筛选', () => {
    it('应该筛选金叉股票', () => {
      const result = filterByTechnical(stocks, { kdj: { signal: 'golden' } });
      expect(result.some(s => s.code === '000001')).toBe(true);
    });

    it('应该筛选死叉股票', () => {
      const result = filterByTechnical(stocks, { kdj: { signal: 'death' } });
      expect(result.some(s => s.code === '600519')).toBe(true);
    });
  });

  describe('RSI计算', () => {
    it('应该计算RSI值', () => {
      const prices = [10, 11, 12, 11, 13, 14, 13, 15, 16, 15, 17, 18, 17, 19, 20];
      const rsi = calcRSI(prices, 14);
      // 生产：长度与输入一致，前 period 个（index 0..13）为预热期 null
      expect(rsi).toHaveLength(prices.length);
      expect(rsi.slice(0, 14).every(v => v === null)).toBe(true);

      const latest = rsi[rsi.length - 1];
      expect(latest).not.toBeNull();
      const value = latest as number;
      // 旧内联四舍五入为 77.78；生产不取整
      expect(value).toBeCloseTo(77.77777777777777, 8);
      expect(value).toBeGreaterThan(0);
      expect(value).toBeLessThanOrEqual(100);
    });

    it('全部上涨应该RSI接近100', () => {
      const prices = Array.from({ length: 20 }, (_, i) => i + 1);
      const rsi = calcRSI(prices, 14);
      // 全为上涨、avgLoss=0 → 生产在 index=period 起返回 100
      expect(rsi[19]).toBe(100);
      expect(rsi.slice(0, 14).every(v => v === null)).toBe(true);
    });

    it('数据不足时应该返回全null（旧内联返回50）', () => {
      const prices = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
      const rsi = calcRSI(prices, 14);
      expect(rsi).toHaveLength(prices.length);
      expect(rsi.every(v => v === null)).toBe(true);
    });
  });
});
