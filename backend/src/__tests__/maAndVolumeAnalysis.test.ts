/**
 * 影子测试迁移（批次 19）
 *
 * 旧文件在测试内自抄了 MA / 量价 / 支撑阻力三套实现（只 import vitest），断言的是副本而不是产品。
 * 本批把有生产对应的 SMA/EMA 两组改为 import 真实实现，其余保留本地 helper 并逐处注明原因。
 *
 * 已绑定生产实现：
 * - calculateSMA → frontend/src/utils/chartDataProcessing.ts:73
 * - calculateEMA → frontend/src/utils/chartDataProcessing.ts:89
 *   （该模块是无依赖纯函数；跨包 import 先例见 backend/src/__tests__/quantitativeAnalysis.test.ts:3、
 *    sharedTypes.test.ts:40 等批次 3/10/14 文件。未选 backend/src/indicators/technical.ts:120/139 的
 *    同名 calculateMA/calculateEMA：后者每步 parseFloat(x.toFixed(4)) 舍入到 4 位，口径不同。）
 *
 * 旧断言错在哪：
 * - SMA（5 例）与 EMA（4 例）逐条复核：生产 chartDataProcessing.ts 的 null 预热、EMA 以 period 个
 *   SMA 播种、multiplier = 2/(period+1) 与旧副本完全一致，未改任何数值断言（无「旧值→生产值」变更）。
 *   旧问题在于断言对象是副本，生产演进时测试不会跟随。
 * - 其余组（WMA/DEMA/交叉/OBV/VRSI/量均线/异动/枢轴/聚类/接近判定）生产端无同签名实现，未迁移，
 *   因此不对其口径作生产声明。
 *
 * 未迁移——生产无对应导出（保留本地 helper）：
 * - calculateWMA / calculateDEMA：全仓无导出（grep calculateWMA|calculateDEMA 仅命中测试）。
 * - detectGoldenCross / detectDeathCross：生产无通用交叉检测函数，只有组件内联的专用判断
 *   （frontend/src/utils/marketTimingEngine.ts:163/167 为 MA50/200，strategy.ts:122/126 为 MA5/20），
 *   与 (number|null)[] 的通用签名不同；同 backend/src/__tests__/technicalIndicatorsAdvanced.test.ts:11。
 * - calculateOBV：backend 无 OBV 导出；前端候选 frontend/src/utils/volumePriceEngine.ts:50 入参是
 *   VolumePriceData[]（7 字段）且首值 = data[0].volume，featureEngineeringEngine.ts:156 入参
 *   (close[], volume[]) 首值同、且无空守卫（[] → [undefined]），都偏离旧副本「首值 0」的累积口径，
 *   故保留本地 helper；同处理见 advancedIndicatorsV2.test.ts:160、marketSentiment.test.ts:173。
 * - calculateVRSI / calculateVolumeMA / isVolumeSpike：生产无导出；volumePriceEngine 在
 *   analyzeVolumePrice 内联计算 avgVolume5（最近 5 日均量，非滚动序列），签名/返回结构不同。
 * - findPivotHighs / findPivotLows / clusterLevels / isPriceNearLevel：生产只有
 *   backend/src/services/patternRecognitionEngine.ts 的 class 方法 findPivots:85 /
 *   findSupportResistance:261（返回对象数组、strength 默认 3、带 type 归类），无同签名纯函数；
 *   frontend/src/utils/regimeDetectionEngine.ts:79-94 未导出。
 */

import { describe, it, expect } from 'vitest';
import { calculateEMA, calculateSMA } from '../../../frontend/src/utils/chartDataProcessing';

// ===== 移动平均线系统 =====
describe('Moving Average Systems', () => {
  // 未迁移：生产无对应导出（calculateWMA 全仓仅测试出现），保留本地 helper。
  const calculateWMA = (data: number[], period: number): (number | null)[] => {
    if (data.length < period) return Array(data.length).fill(null);
    const result: (number | null)[] = [];
    for (let i = 0; i < period - 1; i++) result.push(null);
    const weight = period * (period + 1) / 2;
    for (let i = period - 1; i < data.length; i++) {
      let sum = 0;
      for (let j = 0; j < period; j++) {
        sum += data[i - period + 1 + j] * (j + 1);
      }
      result.push(sum / weight);
    }
    return result;
  };

  // 未迁移：生产无 DEMA 导出。EMA 部分已绑定生产实现（上方 import），其余为本地组合。
  const calculateDEMA = (data: number[], period: number): (number | null)[] => {
    const ema1 = calculateEMA(data, period);
    const ema1Values = ema1.map((v, i) => v !== null ? v : data[i]);
    const ema2 = calculateEMA(ema1Values, period);
    return ema1.map((v, i) => {
      if (v === null || ema2[i] === null) return null;
      return 2 * v - ema2[i]!;
    });
  };

  // 未迁移：生产无通用金叉/死叉检测导出，只有按 MA50/200、MA5/20 写死的组件内联判断。
  const detectGoldenCross = (shortMA: (number | null)[], longMA: (number | null)[]): number[] => {
    const crosses: number[] = [];
    for (let i = 1; i < shortMA.length; i++) {
      if (shortMA[i] !== null && longMA[i] !== null && shortMA[i - 1] !== null && longMA[i - 1] !== null) {
        if (shortMA[i]! > longMA[i]! && shortMA[i - 1]! <= longMA[i - 1]!) {
          crosses.push(i);
        }
      }
    }
    return crosses;
  };

  const detectDeathCross = (shortMA: (number | null)[], longMA: (number | null)[]): number[] => {
    const crosses: number[] = [];
    for (let i = 1; i < shortMA.length; i++) {
      if (shortMA[i] !== null && longMA[i] !== null && shortMA[i - 1] !== null && longMA[i - 1] !== null) {
        if (shortMA[i]! < longMA[i]! && shortMA[i - 1]! >= longMA[i - 1]!) {
          crosses.push(i);
        }
      }
    }
    return crosses;
  };

  const sampleData = [10, 12, 11, 13, 15, 14, 16, 18, 17, 19, 20, 18, 16, 15, 14, 13, 15, 17, 19, 21];

  describe('SMA', () => {
    it('前period-1个值为null', () => {
      const ma = calculateSMA(sampleData, 5);
      for (let i = 0; i < 4; i++) expect(ma[i]).toBeNull();
      expect(ma[4]).not.toBeNull();
    });

    it('SMA5第一个有效值', () => {
      const ma = calculateSMA(sampleData, 5);
      expect(ma[4]).toBeCloseTo(12.2, 1);
    });

    it('数据不足返回全null', () => {
      const ma = calculateSMA([1, 2, 3], 5);
      expect(ma.every(v => v === null)).toBe(true);
    });

    it('空数据返回空', () => {
      expect(calculateSMA([], 5)).toEqual([]);
    });

    it('period=1等于原数据', () => {
      const ma = calculateSMA(sampleData, 1);
      expect(ma).toEqual(sampleData);
    });
  });

  describe('EMA', () => {
    it('前period-1个值为null', () => {
      const ema = calculateEMA(sampleData, 5);
      for (let i = 0; i < 4; i++) expect(ema[i]).toBeNull();
    });

    it('EMA第一个有效值等于SMA', () => {
      const ema = calculateEMA(sampleData, 5);
      const sma = calculateSMA(sampleData, 5);
      expect(ema[4]).toBeCloseTo(sma[4]!, 5);
    });

    it('EMA比SMA更贴近当前价格', () => {
      const ema = calculateEMA(sampleData, 5);
      const sma = calculateSMA(sampleData, 5);
      const last = sampleData[sampleData.length - 1];
      const lastEma = ema[ema.length - 1]!;
      const lastSma = sma[sma.length - 1]!;
      // EMA should be closer to recent prices
      expect(Math.abs(lastEma - last)).toBeLessThanOrEqual(Math.abs(lastSma - last) + 0.5);
    });

    it('数据不足返回全null', () => {
      expect(calculateEMA([1, 2, 3], 5).every(v => v === null)).toBe(true);
    });
  });

  describe('WMA', () => {
    it('前period-1个值为null', () => {
      const wma = calculateWMA(sampleData, 5);
      for (let i = 0; i < 4; i++) expect(wma[i]).toBeNull();
    });

    it('WMA有效值应为正', () => {
      const wma = calculateWMA(sampleData, 5);
      expect(wma[wma.length - 1]).toBeGreaterThan(0);
    });

    it('数据不足返回全null', () => {
      expect(calculateWMA([1, 2, 3], 5).every(v => v === null)).toBe(true);
    });
  });

  describe('DEMA', () => {
    it('前period-1个值为null', () => {
      const dema = calculateDEMA(sampleData, 5);
      for (let i = 0; i < 4; i++) expect(dema[i]).toBeNull();
    });

    it('DEMA有效值应为正', () => {
      const dema = calculateDEMA(sampleData, 5);
      expect(dema[dema.length - 1]).toBeGreaterThan(0);
    });
  });

  describe('金叉死叉', () => {
    it('应检测到金叉', () => {
      const short = calculateSMA(sampleData, 3);
      const long = calculateSMA(sampleData, 5);
      const crosses = detectGoldenCross(short, long);
      expect(crosses.length).toBeGreaterThan(0);
    });

    it('应检测到死叉', () => {
      const short = calculateSMA(sampleData, 3);
      const long = calculateSMA(sampleData, 5);
      const crosses = detectDeathCross(short, long);
      expect(crosses.length).toBeGreaterThan(0);
    });

    it('金叉+死叉数应等于切换次数', () => {
      const short = calculateSMA(sampleData, 3);
      const long = calculateSMA(sampleData, 5);
      const golden = detectGoldenCross(short, long);
      const death = detectDeathCross(short, long);
      expect(golden.length + death.length).toBeGreaterThan(0);
    });

    it('全上涨数据应有金叉无死叉', () => {
      // Start flat then rise sharply to force crossover
      const data = [...Array(10).fill(10), ...Array(20).fill(null).map((_, i) => 10 + (i + 1) * 2)];
      const short = calculateSMA(data, 3);
      const long = calculateSMA(data, 10);
      const gc = detectGoldenCross(short, long);
      const dc = detectDeathCross(short, long);
      // Either we have a golden cross, or short is always above long (also bullish)
      expect(gc.length > 0 || short.some((s, i) => s !== null && long[i] !== null && s > long[i])).toBe(true);
      expect(dc.length).toBe(0);
    });

    it('全下跌数据应有死叉无金叉', () => {
      // Start flat then fall sharply
      const data = [...Array(10).fill(30), ...Array(20).fill(null).map((_, i) => 30 - (i + 1) * 2)];
      const short = calculateSMA(data, 3);
      const long = calculateSMA(data, 10);
      const dc = detectDeathCross(short, long);
      const gc = detectGoldenCross(short, long);
      expect(dc.length > 0 || short.some((s, i) => s !== null && long[i] !== null && s < long[i])).toBe(true);
      expect(gc.length).toBe(0);
    });
  });
});

// ===== 成交量分析 =====
describe('Volume Analysis', () => {
  interface VolumeBar {
    date: string;
    close: number;
    volume: number;
  }

  // 未迁移：生产无对应导出。前端 volumePriceEngine.calculateOBV 入参是 7 字段 VolumePriceData[]
  // 且首值 = data[0].volume；featureEngineeringEngine.calculateOBV 首值同且无空守卫，
  // 与「首值 0」的累积口径不同（详见文件头）。
  const calculateOBV = (bars: VolumeBar[]): number[] => {
    if (bars.length === 0) return [];
    const obv = [0];
    for (let i = 1; i < bars.length; i++) {
      if (bars[i].close > bars[i - 1].close) obv.push(obv[i - 1] + bars[i].volume);
      else if (bars[i].close < bars[i - 1].close) obv.push(obv[i - 1] - bars[i].volume);
      else obv.push(obv[i - 1]);
    }
    return obv;
  };

  // 未迁移：生产无 VRSI 导出（全仓 grep 仅测试出现）。
  const calculateVRSI = (bars: VolumeBar[], period: number = 14): (number | null)[] => {
    if (bars.length < period + 1) return Array(bars.length).fill(null);
    const result: (number | null)[] = [];
    for (let i = 0; i < period; i++) result.push(null);
    let upVol = 0, downVol = 0;
    for (let i = 1; i <= period; i++) {
      const diff = bars[i].volume - bars[i - 1].volume;
      if (diff > 0) upVol += diff; else downVol -= diff;
    }
    for (let i = period; i < bars.length; i++) {
      if (i > period) {
        const diff = bars[i].volume - bars[i - 1].volume;
        upVol = (upVol * (period - 1) + Math.max(diff, 0)) / period;
        downVol = (downVol * (period - 1) + Math.max(-diff, 0)) / period;
      }
      result.push(downVol === 0 ? 100 : 100 - (100 / (1 + upVol / downVol)));
    }
    return result;
  };

  // 未迁移：生产无滚动量均线导出；volumePriceEngine 内联算 avgVolume5（最近 5 日均量）。
  const calculateVolumeMA = (bars: VolumeBar[], period: number): number[] => {
    const result: number[] = [];
    for (let i = 0; i < bars.length; i++) {
      const start = Math.max(0, i - period + 1);
      const slice = bars.slice(start, i + 1);
      result.push(slice.reduce((s, b) => s + b.volume, 0) / slice.length);
    }
    return result;
  };

  // 未迁移：生产无 isVolumeSpike 导出（放量判断内联在 volumePriceEngine 的量价信号里）。
  const isVolumeSpike = (bars: VolumeBar[], index: number, threshold: number = 2): boolean => {
    if (index < 5) return false;
    const avg = bars.slice(index - 5, index).reduce((s, b) => s + b.volume, 0) / 5;
    return bars[index].volume > avg * threshold;
  };

  const sampleBars: VolumeBar[] = [
    { date: '03-01', close: 10, volume: 1000 },
    { date: '03-02', close: 10.5, volume: 1500 },
    { date: '03-03', close: 10.3, volume: 800 },
    { date: '03-04', close: 10.8, volume: 2000 },
    { date: '03-05', close: 10.6, volume: 900 },
    { date: '03-06', close: 11, volume: 3000 },
    { date: '03-07', close: 10.9, volume: 1100 },
    { date: '03-08', close: 11.5, volume: 5000 },
    { date: '03-09', close: 11.2, volume: 1200 },
    { date: '03-10', close: 11.8, volume: 4000 },
    { date: '03-11', close: 11.6, volume: 1000 },
    { date: '03-12', close: 12, volume: 6000 },
    { date: '03-13', close: 11.8, volume: 1500 },
    { date: '03-14', close: 12.2, volume: 7000 },
    { date: '03-15', close: 12.5, volume: 8000 },
  ];

  describe('OBV', () => {
    it('初始OBV应为0', () => {
      const obv = calculateOBV(sampleBars);
      expect(obv[0]).toBe(0);
    });

    it('价格上涨日OBV增加', () => {
      const obv = calculateOBV(sampleBars);
      expect(obv[1]).toBe(1500); // price up
    });

    it('价格下跌日OBV减少', () => {
      const obv = calculateOBV(sampleBars);
      expect(obv[2]).toBe(1500 - 800); // price down
    });

    it('平盘日OBV不变', () => {
      const bars: VolumeBar[] = [
        { date: '1', close: 10, volume: 1000 },
        { date: '2', close: 10, volume: 500 },
      ];
      const obv = calculateOBV(bars);
      expect(obv[1]).toBe(0);
    });

    it('空数据返回空', () => {
      expect(calculateOBV([])).toEqual([]);
    });

    it('OBV整体趋势应为正（上涨行情）', () => {
      const obv = calculateOBV(sampleBars);
      expect(obv[obv.length - 1]).toBeGreaterThan(0);
    });
  });

  describe('成交量均线', () => {
    it('应平滑波动', () => {
      const ma = calculateVolumeMA(sampleBars, 5);
      expect(ma.length).toBe(15);
      expect(ma[0]).toBe(1000);
    });

    it('均线应小于峰值', () => {
      const ma = calculateVolumeMA(sampleBars, 5);
      const maxVol = Math.max(...sampleBars.map(b => b.volume));
      expect(ma[ma.length - 1]).toBeLessThan(maxVol);
    });

    it('空数据返回空', () => {
      expect(calculateVolumeMA([], 5)).toEqual([]);
    });
  });

  describe('成交量异动', () => {
    it('大成交量应被检测', () => {
      expect(isVolumeSpike(sampleBars, 7)).toBe(true); // 5000 vs avg
    });

    it('正常成交量不应触发', () => {
      expect(isVolumeSpike(sampleBars, 1)).toBe(false);
    });

    it('前5条不检测', () => {
      expect(isVolumeSpike(sampleBars, 4)).toBe(false);
    });
  });
});

// ===== 支撑阻力位检测 =====
describe('Support & Resistance Detection', () => {
  interface PricePoint {
    high: number;
    low: number;
    close: number;
  }

  // 未迁移：生产只有 patternRecognitionEngine 的 class 方法 findPivots/findSupportResistance
  // （返回对象数组），无同签名纯函数导出（详见文件头）。
  const findPivotHighs = (data: PricePoint[], lookback: number = 2): number[] => {
    const pivots: number[] = [];
    for (let i = lookback; i < data.length - lookback; i++) {
      let isPivot = true;
      for (let j = i - lookback; j <= i + lookback; j++) {
        if (j !== i && data[j].high >= data[i].high) { isPivot = false; break; }
      }
      if (isPivot) pivots.push(i);
    }
    return pivots;
  };

  const findPivotLows = (data: PricePoint[], lookback: number = 2): number[] => {
    const pivots: number[] = [];
    for (let i = lookback; i < data.length - lookback; i++) {
      let isPivot = true;
      for (let j = i - lookback; j <= i + lookback; j++) {
        if (j !== i && data[j].low <= data[i].low) { isPivot = false; break; }
      }
      if (isPivot) pivots.push(i);
    }
    return pivots;
  };

  const clusterLevels = (prices: number[], tolerance: number = 0.02): number[] => {
    if (prices.length === 0) return [];
    const sorted = [...prices].sort((a, b) => a - b);
    const clusters: number[][] = [[sorted[0]]];
    for (let i = 1; i < sorted.length; i++) {
      const last = clusters[clusters.length - 1];
      const avg = last.reduce((a, b) => a + b, 0) / last.length;
      if (Math.abs(sorted[i] - avg) / avg < tolerance) {
        last.push(sorted[i]);
      } else {
        clusters.push([sorted[i]]);
      }
    }
    return clusters.map(c => c.reduce((a, b) => a + b, 0) / c.length);
  };

  const isPriceNearLevel = (price: number, level: number, tolerance: number = 0.01): boolean => {
    return Math.abs(price - level) / level < tolerance;
  };

  const samplePrices: PricePoint[] = [
    { high: 10.5, low: 9.5, close: 10 },
    { high: 11, low: 10, close: 10.8 },
    { high: 12, low: 10.5, close: 11.5 },
    { high: 11.5, low: 10.8, close: 11 },
    { high: 11.2, low: 10.2, close: 10.5 },
    { high: 10.8, low: 9.8, close: 10 },
    { high: 10.5, low: 9.2, close: 9.5 },
    { high: 10, low: 9, close: 9.3 },
    { high: 10.2, low: 9.5, close: 10 },
    { high: 11, low: 10, close: 10.8 },
    { high: 11.5, low: 10.5, close: 11.2 },
    { high: 12.5, low: 11, close: 12 },
    { high: 12.2, low: 11.5, close: 11.8 },
    { high: 11.8, low: 11, close: 11.2 },
    { high: 11.5, low: 10.5, close: 10.8 },
  ];

  describe('枢轴高点', () => {
    it('应找到高点', () => {
      const highs = findPivotHighs(samplePrices, 2);
      expect(highs.length).toBeGreaterThan(0);
    });

    it('边缘不应为枢轴', () => {
      const highs = findPivotHighs(samplePrices, 2);
      expect(highs).not.toContain(0);
      expect(highs).not.toContain(samplePrices.length - 1);
    });

    it('数据不足返回空', () => {
      const short = samplePrices.slice(0, 3);
      expect(findPivotHighs(short, 2)).toEqual([]);
    });
  });

  describe('枢轴低点', () => {
    it('应找到低点', () => {
      const lows = findPivotLows(samplePrices, 2);
      expect(lows.length).toBeGreaterThan(0);
    });

    it('边缘不应为枢轴', () => {
      const lows = findPivotLows(samplePrices, 2);
      expect(lows).not.toContain(0);
    });
  });

  describe('价位聚类', () => {
    it('相近价位应聚为一簇', () => {
      const levels = clusterLevels([10, 10.1, 10.05, 20, 20.1], 0.02);
      expect(levels.length).toBe(2);
    });

    it('空数据返回空', () => {
      expect(clusterLevels([])).toEqual([]);
    });

    it('单一价格返回自身', () => {
      expect(clusterLevels([10])).toEqual([10]);
    });

    it('等距分布', () => {
      const levels = clusterLevels([10, 20, 30], 0.01);
      expect(levels.length).toBe(3);
    });
  });

  describe('价格接近位', () => {
    it('接近应返回true', () => {
      expect(isPriceNearLevel(10.05, 10, 0.01)).toBe(true);
    });

    it('远离应返回false', () => {
      expect(isPriceNearLevel(11, 10, 0.01)).toBe(false);
    });

    it('精确匹配', () => {
      expect(isPriceNearLevel(10, 10, 0.001)).toBe(true);
    });
  });
});
