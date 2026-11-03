import { describe, it, expect } from 'vitest';
import {
  detectPatterns,
  findSupportResistance,
  type OHLCV,
} from '../utils/chartPatternEngine';
import { createViewport, dataToScreen } from '../utils/chartInteractionEngine';
import { formatDate, formatVolume } from '../utils/formatters';

/**
 * 图表计算引擎逻辑测试（影子测试迁移版）
 *
 * 已删除测试内自抄的形态/坐标/格式化实现，绑定产品仓真实实现：
 * - 形态识别：frontend/src/utils/chartPatternEngine.ts detectPatterns (L136)
 * - 支撑阻力：frontend/src/utils/chartPatternEngine.ts findSupportResistance (L151)
 * - 坐标转换：frontend/src/utils/chartInteractionEngine.ts dataToScreen (L617)
 * - 日期格式化：frontend/src/utils/formatters.ts formatDate (L70)
 * - 成交量格式化：frontend/src/utils/formatters.ts formatVolume (L37)
 *
 * 夹具全部为确定性字面量，无随机数；日期用本地时区 Date 构造，避免 UTC 解析漂移。
 */

const candle = (
  open: number,
  high: number,
  low: number,
  close: number,
  date = '2025-01-15',
): OHLCV => ({ date, open, high, low, close, volume: 1000 });

const flat = candle(101, 102, 100, 100.5);

const patternNames = (candles: OHLCV[]): string[] =>
  detectPatterns(candles).map((p) => p.name);

const candlesFromHighLow = (highs: number[], lows: number[]): OHLCV[] =>
  highs.map((high, i) => {
    const low = lows[i];
    const mid = (high + low) / 2;
    return candle(mid, high, low, mid);
  });

describe('AdvancedChartCalcEngine', () => {
  describe('K线形态识别', () => {
    describe('锤子线识别', () => {
      it('应该识别锤子线', () => {
        // 生产 detectHammer 要求 upperShadow < body*0.5（严格小于）；
        // 旧夹具 high=103 时 upperShadow 恰好等于边界，生产口径下不算锤子线，故 high 取 102.5。
        const candles = [flat, flat, candle(100, 102.5, 90, 102)];
        expect(patternNames(candles)).toContain('锤子线');
      });

      it('非锤子线应该返回 false', () => {
        const candles = [flat, flat, candle(100, 110, 98, 102)];
        const names = patternNames(candles);
        expect(names).not.toContain('锤子线');
        expect(names).not.toContain('上吊线');
      });
    });

    describe('十字星识别', () => {
      it('应该识别十字星', () => {
        const candles = [flat, flat, candle(100, 110, 90, 101)];
        expect(patternNames(candles)).toContain('十字星');
      });

      it('大实体不应识别为十字星', () => {
        const candles = [flat, flat, candle(100, 110, 90, 108)];
        expect(patternNames(candles)).not.toContain('十字星');
      });
    });

    describe('吞没形态', () => {
      it('应该识别看涨吞没', () => {
        const candles = [
          candle(102, 103, 100, 101),
          candle(105, 106, 99, 100),
          candle(99, 107, 98, 106),
        ];
        expect(patternNames(candles)).toContain('看涨吞没');
      });

      it('非吞没形态应该返回 false', () => {
        const candles = [
          candle(102, 103, 100, 101),
          candle(100, 106, 99, 105),
          candle(106, 111, 105, 110),
        ];
        const names = patternNames(candles);
        expect(names).not.toContain('看涨吞没');
        expect(names).not.toContain('看跌吞没');
      });
    });
  });

  describe('支撑阻力计算', () => {
    it('应该识别阻力位', () => {
      const candles = candlesFromHighLow(
        [10, 12, 15, 12, 10, 11, 14, 11, 9],
        [5, 7, 10, 7, 5, 6, 9, 6, 4],
      );
      const levels = findSupportResistance(candles, 2);
      expect(levels.filter((l) => l.type === 'resistance').length).toBeGreaterThan(0);
    });

    it('应该识别支撑位', () => {
      const candles = candlesFromHighLow(
        [15, 14, 12, 14, 15, 13, 11, 13, 15],
        [10, 9, 5, 9, 10, 8, 3, 8, 10],
      );
      const levels = findSupportResistance(candles, 2);
      expect(levels.filter((l) => l.type === 'support').length).toBeGreaterThan(0);
    });
  });
});

describe('AdvancedChartUtils', () => {
  describe('坐标转换', () => {
    // dataToScreen 与旧 priceToY 同口径：y = ((yMax - price) / (yMax - yMin)) * height
    const viewport = createViewport(0, 100, 100, 110);

    it('最高价应该在顶部 (y=0)', () => {
      expect(dataToScreen(0, 110, viewport, 300, 300).y).toBe(0);
    });

    it('最低价应该在底部 (y=height)', () => {
      expect(dataToScreen(0, 100, viewport, 300, 300).y).toBe(300);
    });

    it('中间价应该在中间', () => {
      expect(dataToScreen(0, 105, viewport, 300, 300).y).toBe(150);
    });
  });

  describe('日期格式化', () => {
    // 生产 formatDate 的小写 token：yyyy / MM / dd / HH / mm / ss（无 YYYY / DD）
    const sampleDate = new Date(2025, 0, 15);

    it('应该格式化为 yyyy-MM-dd', () => {
      expect(formatDate(sampleDate, 'yyyy-MM-dd')).toBe('2025-01-15');
    });

    it('应该格式化为 yyyy/MM/dd', () => {
      expect(formatDate(sampleDate, 'yyyy/MM/dd')).toBe('2025/01/15');
    });
  });

  describe('数值格式化', () => {
    it('应该格式化亿级成交量', () => {
      expect(formatVolume(5e8)).toBe('5.00亿手');
    });

    it('应该格式化万级成交量', () => {
      expect(formatVolume(50000)).toBe('5.00万手');
    });

    it('小数字直接返回', () => {
      expect(formatVolume(999)).toBe('999手');
    });
  });
});
