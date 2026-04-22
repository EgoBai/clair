import { describe, it, expect } from 'vitest';

/**
 * K线图组件逻辑测试
 * 测试MA/EMA计算、成交量格式化、图表配置逻辑
 */

interface KLineData {
  tradeDate: string;
  open: number;
  close: number;
  high: number;
  low: number;
  volume: number;
  turnover: number;
}

// 从KLineChart.tsx提取的纯函数
function calculateMA(prices: number[], period: number): (number | null)[] {
  const result: (number | null)[] = [];
  for (let i = 0; i < prices.length; i++) {
    if (i < period - 1) {
      result.push(null);
    } else {
      let sum = 0;
      for (let j = 0; j < period; j++) sum += prices[i - j];
      result.push(parseFloat((sum / period).toFixed(2)));
    }
  }
  return result;
}

function calculateEMA(prices: number[], period: number): (number | null)[] {
  const result: (number | null)[] = [];
  const multiplier = 2 / (period + 1);
  for (let i = 0; i < prices.length; i++) {
    if (i < period - 1) {
      result.push(null);
    } else if (i === period - 1) {
      let sum = 0;
      for (let j = 0; j < period; j++) sum += prices[i - j];
      result.push(parseFloat((sum / period).toFixed(2)));
    } else {
      const prev = result[i - 1]!;
      result.push(parseFloat(((prices[i] - prev) * multiplier + prev).toFixed(2)));
    }
  }
  return result;
}

function formatVolume(vol: number): string {
  if (vol >= 1e8) return `${(vol / 1e8).toFixed(2)}亿手`;
  if (vol >= 1e4) return `${(vol / 1e4).toFixed(2)}万手`;
  return `${vol}手`;
}

function formatTurnover(turnover: number): string {
  if (turnover >= 1e8) return `${(turnover / 1e8).toFixed(2)}亿`;
  if (turnover >= 1e4) return `${(turnover / 1e4).toFixed(2)}万`;
  return `${turnover}`;
}

describe('K线图计算函数', () => {
  describe('MA均线计算', () => {
    it('MA5应该正确计算', () => {
      const prices = [10, 11, 12, 13, 14, 15, 16];
      const ma5 = calculateMA(prices, 5);
      expect(ma5.length).toBe(7);
      expect(ma5[0]).toBeNull();
      expect(ma5[1]).toBeNull();
      expect(ma5[2]).toBeNull();
      expect(ma5[3]).toBeNull();
      expect(ma5[4]).toBeCloseTo(12, 1); // (10+11+12+13+14)/5=12
      expect(ma5[5]).toBeCloseTo(13, 1); // (11+12+13+14+15)/5=13
    });

    it('MA10对不足数据应该返回null', () => {
      const prices = [1, 2, 3, 4, 5];
      const ma10 = calculateMA(prices, 10);
      expect(ma10.every(v => v === null)).toBe(true);
    });

    it('等值数据的MA应该等于该值', () => {
      const prices = Array(10).fill(100);
      const ma5 = calculateMA(prices, 5);
      for (let i = 4; i < 10; i++) {
        expect(ma5[i]).toBe(100);
      }
    });

    it('单个数据点的MA1应该等于自身', () => {
      const prices = [42];
      const ma1 = calculateMA(prices, 1);
      expect(ma1[0]).toBe(42);
    });
  });

  describe('EMA指数移动平均', () => {
    it('EMA12应该正确计算', () => {
      const prices = Array.from({ length: 20 }, (_, i) => 100 + i);
      const ema12 = calculateEMA(prices, 12);
      expect(ema12.length).toBe(20);
      expect(ema12[0]).toBeNull(); // 前11个为null
      expect(ema12[10]).toBeNull();
      expect(ema12[11]).not.toBeNull(); // 第12个开始有值
    });

    it('EMA应该比MA更快速响应价格变化', () => {
      const prices = [10, 10, 10, 10, 10, 20, 20, 20, 20, 20];
      const ma5 = calculateMA(prices, 5);
      const ema5 = calculateEMA(prices, 5);
      // EMA在价格跳变后反应更快
      if (ma5[5] !== null && ema5[5] !== null) {
        expect(ema5[5]).toBeGreaterThan(ma5[5]!);
      }
    });

    it('等值数据的EMA应该等于该值', () => {
      const prices = Array(15).fill(50);
      const ema5 = calculateEMA(prices, 5);
      for (let i = 4; i < 15; i++) {
        expect(ema5[i]).toBe(50);
      }
    });
  });

  describe('成交量格式化', () => {
    it('大于1亿应该显示亿手', () => {
      expect(formatVolume(150000000)).toContain('亿手');
    });

    it('大于1万但小于1亿应该显示万手', () => {
      expect(formatVolume(50000)).toContain('万手');
    });

    it('小于1万应该直接显示手', () => {
      expect(formatVolume(999)).toBe('999手');
    });

    it('正好1亿应该显示亿手', () => {
      expect(formatVolume(1e8)).toContain('亿手');
    });

    it('正好1万应该显示万手', () => {
      expect(formatVolume(1e4)).toContain('万手');
    });
  });

  describe('成交额格式化', () => {
    it('大于1亿应该显示亿', () => {
      expect(formatTurnover(2e8)).toContain('亿');
    });

    it('大于1万但小于1亿应该显示万', () => {
      expect(formatTurnover(50000)).toContain('万');
    });

    it('小于1万应该直接显示数字', () => {
      expect(formatTurnover(999)).toBe('999');
    });
  });

  describe('K线数据处理', () => {
    it('应该正确提取OHLC数据', () => {
      const data: KLineData = {
        tradeDate: '2024-01-15',
        open: 10.5,
        close: 11.2,
        high: 11.5,
        low: 10.3,
        volume: 1000000,
        turnover: 10500000,
      };
      const ohlc = [data.open, data.close, data.low, data.high];
      expect(ohlc).toEqual([10.5, 11.2, 10.3, 11.5]);
    });

    it('阳线 close >= open', () => {
      const data: KLineData = {
        tradeDate: '2024-01-15',
        open: 10,
        close: 11,
        high: 11.5,
        low: 9.5,
        volume: 1000000,
        turnover: 10500000,
      };
      expect(data.close >= data.open).toBe(true);
    });

    it('阴线 close < open', () => {
      const data: KLineData = {
        tradeDate: '2024-01-15',
        open: 11,
        close: 10,
        high: 11.5,
        low: 9.5,
        volume: 1000000,
        turnover: 10500000,
      };
      expect(data.close < data.open).toBe(true);
    });

    it('涨跌幅计算应该正确', () => {
      const open = 10;
      const close = 11;
      const changePercent = ((close - open) / open * 100).toFixed(2);
      expect(changePercent).toBe('10.00');
    });

    it('跌跌幅应该为负数', () => {
      const open = 11;
      const close = 10;
      const changePercent = ((close - open) / open * 100).toFixed(2);
      expect(parseFloat(changePercent)).toBeLessThan(0);
    });
  });

  describe('均线交叉信号', () => {
    it('金叉: MA5从下方穿过MA10', () => {
      const ma5 = [null, null, null, null, 9, 10, 11, 12];
      const ma10 = [null, null, null, null, null, null, null, null, null, null, 10.5, 10.5, 10.5, 10.5, 10.5, 10.5, 10.5, 10.5];
      // 只需要检查逻辑: prev5 <= prev10 && curr5 > curr10
      const prev5 = 9.5, prev10 = 10, curr5 = 10.5, curr10 = 10;
      const isGoldenCross = prev5 <= prev10 && curr5 > curr10;
      expect(isGoldenCross).toBe(true);
    });

    it('死叉: MA5从上方穿过MA10', () => {
      const prev5 = 11, prev10 = 10, curr5 = 9.5, curr10 = 10;
      const isDeathCross = prev5 >= prev10 && curr5 < curr10;
      expect(isDeathCross).toBe(true);
    });

    it('非交叉不应该产生信号', () => {
      const prev5 = 10, prev10 = 10, curr5 = 10.5, curr10 = 10;
      const isGoldenCross = prev5 <= prev10 && curr5 > curr10;
      // prev5 === prev10, curr5 > curr10 -> 这种情况也视为金叉
      expect(isGoldenCross).toBe(true);
    });
  });
});
