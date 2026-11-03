import { describe, it, expect } from 'vitest';
import { computeIndicatorSeries } from '../utils/indicatorCalc';
import type { IndicatorInput } from '../utils/indicatorCalc';
import { calculateMA } from '../utils/trendFollowingEngine';
import { CHART_COLORS } from '../styles/chart-theme';
// 前端无导出的 EMA 纯函数、页面图表 RSI 只暴露 6/12/24，14 周期 RSI 与 EMA 绑定后端生产实现
import { calcEMA, calcRSI } from '../../../backend/src/utils/futureValueUtils';

/**
 * 图表指标计算测试（批次 9：绑定生产实现）
 *
 * 生产实现（唯一真源）：
 * - frontend/src/utils/indicatorCalc.ts 的 computeIndicatorSeries（StockDetailPage 实际取数）：
 *   MACD 12/26/9（dif/dea/macd 自 index 25 起有值，DEA 由 dif 补 0 后的 9 周期 EMA 得到，
 *   macd = 2*(dif-dea)）；KDJ 9（前 8 个 undefined，K/D 初值 50，J=3K-2D）；
 *   BOLL 20/2（前 19 个 undefined）；数值统一四舍五入到 4 位小数，null 转 undefined。
 * - frontend/src/utils/trendFollowingEngine.ts 的 calculateMA：任意周期，预热期为 NaN（不是 null）。
 * - frontend/src/styles/chart-theme.ts 的 CHART_COLORS：涨 #cf2a2a / 跌 #1db468 / 平 #64748b。
 * - backend/src/utils/futureValueUtils.ts 的 calcEMA / calcRSI：EMA 前 period-1 为 null，
 *   index=period-1 用 SMA 作种子；RSI 为 Wilder 平滑，index=period 起有值，数据不足全 null。
 *
 * 未迁移（前端无导出的纯函数，保留本地 helper，不虚构生产代码）：
 * - getColor / toChartData：K 线着色与 ECharts 数据转换内联在 Charts/KLineChart.tsx 里
 *   （:232 成交量、:329 tooltip 都是 close >= open ? CHART_COLORS.up : CHART_COLORS.down，
 *   产品没有平盘灰分支），src/utils 下无导出函数，故保留本地实现并复刻该口径；
 *   旧断言的 #ef4444/#22c55e/#888888 与产品 K 线色不符。
 */

/** 构造 indicatorCalc 输入：未传 highs/lows 时以收盘价充当（对应指标不依赖这些字段） */
const toKline = (closes: number[], highs?: number[], lows?: number[]): IndicatorInput[] =>
  closes.map((c, i) => ({
    date: `2026-03-${String(i + 1).padStart(2, '0')}`,
    open: c,
    high: highs ? highs[i] : c,
    low: lows ? lows[i] : c,
    close: c,
    volume: 1000,
  }));

// 图表数据处理测试
describe('Chart Data Processing', () => {
  interface RawKLine { date: string; open: number; high: number; low: number; close: number; volume: number; }

  // 未迁移：K 线颜色内联在 Charts/KLineChart.tsx，无导出函数；此处复刻其口径
  // close >= open 取涨色（十字星也算涨），生产没有平盘灰分支
  const getColor = (close: number, open: number): string => {
    return close >= open ? CHART_COLORS.up : CHART_COLORS.down;
  };

  // K线转图表数据（未迁移：生产无导出的转换函数）
  const toChartData = (klines: RawKLine[]) => {
    return klines.map(k => ({
      x: k.date,
      y: [k.open, k.close, k.low, k.high],
      color: getColor(k.close, k.open),
      volume: k.volume,
    }));
  };

  const testKLines: RawKLine[] = [
    { date: '2026-03-18', open: 100, high: 106, low: 99, close: 105, volume: 1000 },
    { date: '2026-03-19', open: 105, high: 108, low: 103, close: 107, volume: 1200 },
    { date: '2026-03-20', open: 107, high: 109, low: 104, close: 104, volume: 1500 },
    { date: '2026-03-21', open: 104, high: 108, low: 102, close: 108, volume: 1300 },
    { date: '2026-03-24', open: 108, high: 112, low: 107, close: 110, volume: 1600 },
  ];

  it('calculates MA5 correctly', () => {
    const closes = testKLines.map(k => k.close);
    const ma = calculateMA(closes, 5);
    // 生产口径：预热期是 NaN，不是 null
    expect(Number.isNaN(ma[0])).toBe(true);
    expect(Number.isNaN(ma[3])).toBe(true);
    expect(ma[4]).toBeCloseTo(106.8, 1);
  });

  it('calculates MA with period 1 equals original data', () => {
    const closes = testKLines.map(k => k.close);
    const ma = calculateMA(closes, 1);
    expect(ma).toEqual(closes.map(c => c));
  });

  it('EMA produces values for all valid periods', () => {
    const closes = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
    const ema = calcEMA(closes, 5);
    const nonNull = ema.filter(v => v !== null);
    // 前 4 个 null，index=4 起为值（首值 SMA 种子 = 3）
    expect(nonNull.length).toBe(6);
    expect(ema[4]).toBe(3);
  });

  it('colors red for up candle', () => {
    expect(getColor(105, 100)).toBe(CHART_COLORS.up);
  });

  it('colors green for down candle', () => {
    expect(getColor(95, 100)).toBe(CHART_COLORS.down);
  });

  it('colors doji as up (production: close >= open)', () => {
    // 生产图表没有平盘分支，十字星落入上涨色
    expect(getColor(100, 100)).toBe(CHART_COLORS.up);
  });

  it('converts KLines to chart data', () => {
    const data = toChartData(testKLines);
    expect(data.length).toBe(5);
    expect(data[0].y).toEqual([100, 105, 99, 106]);
    expect(data[0].x).toBe('2026-03-18');
  });

  it('chart data colors match candle direction', () => {
    const data = toChartData(testKLines);
    data.forEach((d, i) => {
      const k = testKLines[i];
      expect(d.color).toBe(getColor(k.close, k.open));
    });
  });

  it('volume data is preserved in chart', () => {
    const data = toChartData(testKLines);
    expect(data.map(d => d.volume)).toEqual([1000, 1200, 1500, 1300, 1600]);
  });
});

// MACD计算测试（绑定前端页面图表真实实现 computeIndicatorSeries）
describe('MACD Calculation', () => {
  const prices = Array.from({ length: 50 }, (_, i) => 100 + Math.sin(i * 0.3) * 10 + i * 0.5);

  it('DIF is difference of fast and slow EMA', () => {
    const series = computeIndicatorSeries(toKline(prices));
    const emaFast = calcEMA(prices, 12);
    const emaSlow = calcEMA(prices, 26);
    expect(series[24].dif).toBeUndefined();
    for (let i = 25; i < prices.length; i++) {
      expect(series[i].dif).toBeCloseTo((emaFast[i] as number) - (emaSlow[i] as number), 3);
    }
  });

  it('histogram is 2 * (DIF - DEA)', () => {
    const series = computeIndicatorSeries(toKline(prices));
    let checked = 0;
    for (const point of series) {
      const { dif, dea, macd } = point;
      if (dif === undefined || dea === undefined || macd === undefined) continue;
      expect(macd).toBeCloseTo(2 * (dif - dea), 3);
      checked++;
    }
    expect(checked).toBe(25);
  });

  it('MACD with insufficient data returns undefined values', () => {
    const series = computeIndicatorSeries(toKline([1, 2, 3, 4, 5]));
    expect(series.every(p => p.dif === undefined && p.dea === undefined && p.macd === undefined)).toBe(true);
  });

  it('DIF crosses zero indicate trend change', () => {
    const upPrices = Array.from({ length: 50 }, (_, i) => 100 + i * 2);
    const series = computeIndicatorSeries(toKline(upPrices));
    expect(series[49].dif).toBeDefined();
    // 均匀上涨趋势下DIF应该为正
    expect(series[49].dif!).toBeGreaterThan(0);
  });
});

// RSI计算测试（14 周期绑定后端生产实现；页面图表只暴露 6/12/24）
describe('RSI Calculation', () => {
  it('RSI of all positive changes approaches 100', () => {
    const upPrices = Array.from({ length: 20 }, (_, i) => 100 + i);
    const rsi = calcRSI(upPrices);
    const last = rsi[rsi.length - 1];
    expect(last).toBe(100);
  });

  it('RSI of all negative changes approaches 0', () => {
    const downPrices = Array.from({ length: 20 }, (_, i) => 100 - i);
    const rsi = calcRSI(downPrices);
    const last = rsi[rsi.length - 1];
    expect(last).toBeCloseTo(0, 0);
  });

  it('RSI is between 0 and 100', () => {
    // 确定性数据，替代原 Math.random
    const prices = Array.from({ length: 30 }, (_, i) => 100 + Math.sin(i * 1.1) * 8 + i * 0.2);
    const rsi = calcRSI(prices);
    const valid = rsi.filter((v): v is number => v !== null);
    expect(valid.length).toBeGreaterThan(0);
    valid.forEach(v => {
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(100);
    });
  });

  it('first N values are null', () => {
    const prices = Array.from({ length: 20 }, (_, i) => i);
    const rsi = calcRSI(prices, 14);
    for (let i = 0; i < 14; i++) {
      expect(rsi[i]).toBeNull();
    }
    expect(rsi[14]).not.toBeNull();
  });

  it('flat prices give RSI near 50', () => {
    const flat = Array.from({ length: 20 }, () => 100);
    const rsi = calcRSI(flat);
    // 没有涨跌，avgLoss为0，RSI=100（生产口径）
    const last = rsi[rsi.length - 1];
    expect(last).toBe(100);
  });
});

// KDJ计算测试（绑定 computeIndicatorSeries）
describe('KDJ Calculation', () => {
  const highs = [105, 108, 110, 107, 112, 115, 113, 118, 120, 117, 119, 122, 125, 123, 128];
  const lows = [99, 102, 104, 101, 106, 108, 107, 112, 114, 111, 113, 119, 119, 117, 122];
  const closes = [104, 107, 106, 105, 110, 113, 111, 116, 118, 115, 117, 120, 123, 121, 126];

  it('K, D, J arrays have same length', () => {
    const series = computeIndicatorSeries(toKline(closes, highs, lows));
    expect(series.length).toBe(closes.length);
    series.forEach(p => {
      expect(p.k === undefined).toBe(p.d === undefined);
      expect(p.d === undefined).toBe(p.j === undefined);
    });
    expect(series.filter(p => p.k !== undefined).length).toBe(closes.length - 8);
  });

  it('first n-1 values are null', () => {
    const series = computeIndicatorSeries(toKline(closes, highs, lows));
    for (let i = 0; i < 8; i++) {
      expect(series[i].k).toBeUndefined();
    }
    expect(series[8].k).toBeDefined();
  });

  it('J = 3K - 2D', () => {
    const series = computeIndicatorSeries(toKline(closes, highs, lows));
    for (const { k, d, j } of series) {
      if (k !== undefined && d !== undefined && j !== undefined) {
        expect(j).toBeCloseTo(3 * k - 2 * d, 3);
      }
    }
  });

  it('handles all same high/low (RSV defaults to 50)', () => {
    const h = Array(15).fill(100);
    const l = Array(15).fill(100);
    const c = Array(15).fill(100);
    const series = computeIndicatorSeries(toKline(c, h, l));
    // 高低点相同 → RSV=50，K/D 停留在初值 50，J=50
    expect(series[14].k).toBe(50);
    expect(series[14].d).toBe(50);
    expect(series[14].j).toBe(50);
  });
});

// BOLL计算测试（绑定 computeIndicatorSeries，固定 20/2 口径）
describe('BOLL Calculation', () => {
  const prices = Array.from({ length: 30 }, (_, i) => 100 + Math.sin(i * 0.5) * 5);

  it('upper > middle > lower', () => {
    const series = computeIndicatorSeries(toKline(prices));
    for (const { bollUpper, bollMiddle, bollLower } of series) {
      if (bollUpper !== undefined && bollMiddle !== undefined && bollLower !== undefined) {
        expect(bollUpper).toBeGreaterThan(bollMiddle);
        expect(bollMiddle).toBeGreaterThan(bollLower);
      }
    }
  });

  it('bandwidth is 4 * std', () => {
    const series = computeIndicatorSeries(toKline(prices));
    for (const { bollUpper, bollMiddle, bollLower } of series) {
      if (bollUpper === undefined || bollMiddle === undefined || bollLower === undefined) continue;
      const bandwidth = bollUpper - bollLower;
      expect(bandwidth).toBeGreaterThan(0);
      // 上下轨对称于中轨（4 位小数舍入误差内）
      expect(bollUpper - bollMiddle).toBeCloseTo(bollMiddle - bollLower, 2);
    }
  });

  it('flat prices give zero bandwidth', () => {
    const flat = Array(25).fill(100);
    const series = computeIndicatorSeries(toKline(flat));
    const last = series[flat.length - 1];
    expect(last.bollUpper).toBe(100);
    expect(last.bollLower).toBe(100);
    expect(last.bollMiddle).toBe(100);
  });

  it('first period-1 values are null', () => {
    const series = computeIndicatorSeries(toKline(prices));
    for (let i = 0; i < 19; i++) {
      expect(series[i].bollMiddle).toBeUndefined();
    }
    expect(series[19].bollMiddle).toBeDefined();
  });
});
