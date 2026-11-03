/**
 * 数据聚合与转换测试
 *
 * 影子测试治理批次 21b：本文件原先内联了 aggregateTicksToKline / resampleKlines / calculateReturns /
 * calculateLogReturns / normalizeData / zScoreNormalize / calculateRollingAverage / calculateRollingStdDev /
 * detectOutliers / interpolateMissing / calculateCorrelationMatrix / calculateCorrelation 的自抄实现。
 * 现改为 import 生产实现（生产为口径真源）：
 *
 * - frontend/src/utils/chartDataProcessing.ts:20-48 aggregateTicksToCandle（tick → K 线分桶）
 * - frontend/src/utils/chartDataProcessing.ts:73-84 calculateSMA（滚动均值，前 period-1 为 null）
 * - frontend/src/utils/chartDataProcessing.ts:145-168 calculateBollingerBands（滚动标准差体现为带宽）
 * - frontend/src/utils/dataFlowEngine.ts:209-215 zScoreNormalize（总体标准差，4 位小数）
 * - frontend/src/utils/dataFlowEngine.ts:220-227 minMaxNormalize（4 位小数）
 * - frontend/src/utils/globalCorrelationEngine.ts:98-112 calculateReturns / calculateLogReturns（无预热 0）
 * - frontend/src/utils/globalCorrelationEngine.ts:114-138 pearsonCorrelation
 * - frontend/src/utils/globalCorrelationEngine.ts:268-290 calculateCorrelationMatrix（Record 入参）
 * - frontend/src/utils/correlationMatrix.ts:46-52 calculateReturns（零前值保护版）
 * - frontend/src/utils/correlationMatrix.ts:59-84 calculateStdDev / calculateCorrelation（样本 n-1）
 * - frontend/src/utils/correlationMatrix.ts:92-112 buildCorrelationMatrix
 * - frontend/src/utils/dataQualityEngine.ts:164-188 detectOutliers（AnomalyRecord[]，样本 n-1，默认阈值 3）
 *
 * 未迁移（生产无对应实现，内联副本保留在对应 describe 内并注明原因）：
 * 1) resampleKlines：生产只有 downsampleData（点抽样，不是 OHLC 周期合并），没有 K 线重采样函数。
 * 2) interpolateMissing：生产没有缺失值线性插值工具（indicatorOverlayEngine.interpolateAtTimestamp
 *    是时间轴插值，语义不同），故保留内联实现。
 *
 * 口径差异（旧断言 → 生产值）：
 * - calculateReturns / calculateLogReturns 不再补首元素 0；空数组或单元素返回 []。
 * - detectOutliers 默认阈值由 2 改为 3，返回 AnomalyRecord[] 而非索引数组。
 * - normalizeData 旧值为未取整的 0-1；生产 minMaxNormalize/zScoreNormalize 四舍五入到 4 位小数。
 * - 相关性矩阵入参由 number[][] 改为 Record<string, number[]>，对角线 1、非对角用 pearson。
 */

import { describe, it, expect } from 'vitest';

import {
  aggregateTicksToCandle,
  calculateSMA,
  calculateBollingerBands,
} from '../utils/chartDataProcessing';
import { zScoreNormalize, minMaxNormalize } from '../utils/dataFlowEngine';
import {
  calculateReturns as calculateGlobalReturns,
  calculateLogReturns,
  pearsonCorrelation,
  calculateCorrelationMatrix,
} from '../utils/globalCorrelationEngine';
import {
  calculateReturns as calculateMatrixReturns,
  calculateStdDev,
  calculateCorrelation,
  buildCorrelationMatrix,
} from '../utils/correlationMatrix';
import type { PriceSeries } from '../utils/correlationMatrix';
import { detectOutliers } from '../utils/dataQualityEngine';

// Data aggregation and transformation utilities

interface TickData {
  timestamp: number;
  price: number;
  volume: number;
  side: 'buy' | 'sell';
}

// ==================== 未迁移实现（生产无对应函数） ====================

interface ResampledCandle {
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  turnover: number;
}

/**
 * 未迁移：生产无 K 线周期重采样函数（chartDataProcessing.downsampleData 是点抽样，
 * 不合并 OHLC），旧自抄实现按原样保留，仅用于验证这段需求语义。
 */
function resampleKlines(klines: ResampledCandle[], factor: number): ResampledCandle[] {
  const result: ResampledCandle[] = [];
  for (let i = 0; i < klines.length; i += factor) {
    const chunk = klines.slice(i, i + factor);
    if (chunk.length > 0) {
      result.push({
        open: chunk[0].open,
        high: Math.max(...chunk.map(k => k.high)),
        low: Math.min(...chunk.map(k => k.low)),
        close: chunk[chunk.length - 1].close,
        volume: chunk.reduce((s, k) => s + k.volume, 0),
        turnover: chunk.reduce((s, k) => s + k.turnover, 0),
      });
    }
  }
  return result;
}

/**
 * 未迁移：生产无缺失值线性插值工具，旧自抄实现按原样保留。
 */
function interpolateMissing(data: (number | null)[]): number[] {
  const result = [...data] as (number | null)[];
  for (let i = 0; i < result.length; i++) {
    if (result[i] === null) {
      let prevIdx = i - 1;
      let nextIdx = i + 1;
      while (prevIdx >= 0 && result[prevIdx] === null) prevIdx--;
      while (nextIdx < result.length && result[nextIdx] === null) nextIdx++;
      if (prevIdx >= 0 && nextIdx < result.length) {
        result[i] = (result[prevIdx]! + result[nextIdx]!) / 2;
      } else if (prevIdx >= 0) {
        result[i] = result[prevIdx];
      } else if (nextIdx < result.length) {
        result[i] = result[nextIdx];
      } else {
        result[i] = 0;
      }
    }
  }
  return result as number[];
}

// ==================== 测试 ====================

describe('数据聚合与转换', () => {
  const ticks: TickData[] = [
    { timestamp: 1, price: 100, volume: 100, side: 'buy' },
    { timestamp: 2, price: 102, volume: 200, side: 'buy' },
    { timestamp: 3, price: 99, volume: 150, side: 'sell' },
    { timestamp: 4, price: 101, volume: 300, side: 'buy' },
  ];

  describe('Tick 聚合为 K 线（生产 aggregateTicksToCandle）', () => {
    it('应该正确聚合 OHLCV', () => {
      const candles = aggregateTicksToCandle(ticks, 1000);
      expect(candles).toHaveLength(1);
      const kline = candles[0];
      expect(kline.timestamp).toBe(0);
      expect(kline.open).toBe(100);
      expect(kline.high).toBe(102);
      expect(kline.low).toBe(99);
      expect(kline.close).toBe(101);
      expect(kline.volume).toBe(750);
    });

    it('应该按 intervalMs 分桶并按时间升序', () => {
      const multi = aggregateTicksToCandle(
        [
          { timestamp: 1, price: 100, volume: 100 },
          { timestamp: 1500, price: 110, volume: 50 },
          { timestamp: 1600, price: 108, volume: 70 },
        ],
        1000
      );
      expect(multi).toHaveLength(2);
      expect(multi[0].timestamp).toBe(0);
      expect(multi[0].open).toBe(100);
      expect(multi[1].timestamp).toBe(1000);
      expect(multi[1].open).toBe(110);
      expect(multi[1].close).toBe(108);
      expect(multi[1].volume).toBe(120);
    });

    it('空数据应该返回空数组', () => {
      // 旧自抄返回全 0 对象；生产返回 []，由调用方决定空态
      expect(aggregateTicksToCandle([], 1000)).toEqual([]);
    });

    it('单条 Tick OHLC 应该都等于该价格', () => {
      const candles = aggregateTicksToCandle([ticks[0]], 1000);
      expect(candles).toHaveLength(1);
      expect(candles[0].open).toBe(candles[0].close);
      expect(candles[0].high).toBe(candles[0].low);
    });

    it('open/close 取决于输入顺序而非 timestamp（生产行为记录）', () => {
      // 生产用桶内首次/末次出现的 tick 作为 open/close，不按 timestamp 排序。
      // 乱序输入会得到与时间顺序相反的开收盘 → 已列为「生产缺陷候选」。
      const candles = aggregateTicksToCandle(
        [
          { timestamp: 4, price: 101, volume: 1 },
          { timestamp: 1, price: 100, volume: 1 },
        ],
        1000
      );
      expect(candles).toHaveLength(1);
      expect(candles[0].open).toBe(101);
      expect(candles[0].close).toBe(100);
    });
  });

  describe('K 线重采样（未迁移：生产无周期重采样）', () => {
    it('应该正确合并', () => {
      const klines: ResampledCandle[] = [
        { open: 100, high: 105, low: 98, close: 103, volume: 1000, turnover: 102000 },
        { open: 103, high: 108, low: 101, close: 106, volume: 1500, turnover: 160000 },
        { open: 106, high: 110, low: 104, close: 108, volume: 1200, turnover: 130000 },
      ];
      const resampled = resampleKlines(klines, 2);
      expect(resampled.length).toBe(2);
      expect(resampled[0].open).toBe(100);
      expect(resampled[0].high).toBe(108);
      expect(resampled[0].low).toBe(98);
      expect(resampled[0].close).toBe(106);
    });

    it('空数据应该返回空', () => {
      expect(resampleKlines([], 2)).toEqual([]);
    });
  });

  describe('收益率计算（生产两套实现）', () => {
    it('globalCorrelationEngine.calculateReturns 不补首元素 0', () => {
      const returns = calculateGlobalReturns([100, 110, 105]);
      expect(returns).toHaveLength(2);
      expect(returns[0]).toBeCloseTo(0.1, 10);
      expect(returns[1]).toBeCloseTo(-0.0454545454, 8);
    });

    it('globalCorrelationEngine.calculateLogReturns 不补首元素 0', () => {
      const returns = calculateLogReturns([100, 110]);
      expect(returns).toHaveLength(1);
      expect(returns[0]).toBeCloseTo(Math.log(1.1), 10);
    });

    it('价格不足两个时返回空数组', () => {
      // 旧自抄断言 calculateReturns([100]) === [0]；生产返回 []
      expect(calculateGlobalReturns([])).toEqual([]);
      expect(calculateGlobalReturns([100])).toEqual([]);
      expect(calculateLogReturns([100])).toEqual([]);
    });

    it('前值为 0 时 global 版未保护会得到 Infinity', () => {
      // 生产 calculateReturns 直接除以前值（globalCorrelationEngine.ts:101），
      // 前值 0 会产出 Infinity → 已列为「生产缺陷候选」，此处记录当前真实行为。
      expect(calculateGlobalReturns([0, 10])).toEqual([Infinity]);
    });

    it('correlationMatrix.calculateReturns 对零前值返回 0（与 global 版口径不同）', () => {
      expect(calculateMatrixReturns([0, 10])).toEqual([0]);
      expect(calculateMatrixReturns([100])).toEqual([]);
    });
  });

  describe('数据归一化（生产 minMaxNormalize）', () => {
    it('应该归一化到 0-1 且保留 4 位小数', () => {
      expect(minMaxNormalize([10, 20, 30, 40, 50])).toEqual([0, 0.25, 0.5, 0.75, 1]);
    });

    it('空数组应该返回空数组', () => {
      expect(minMaxNormalize([])).toEqual([]);
    });

    it('相同值应该都为 0', () => {
      expect(minMaxNormalize([5, 5, 5])).toEqual([0, 0, 0]);
    });
  });

  describe('Z-Score 归一化（生产 zScoreNormalize）', () => {
    it('应该按总体标准差标准化并四舍五入到 4 位小数', () => {
      const normalized = zScoreNormalize([1, 2, 3, 4, 5]);
      expect(normalized).toEqual([-1.4142, -0.7071, 0, 0.7071, 1.4142]);
      const mean = normalized.reduce((a, b) => a + b, 0) / normalized.length;
      expect(mean).toBeCloseTo(0, 10);
    });

    it('相同值应该都为 0', () => {
      expect(zScoreNormalize([5, 5, 5])).toEqual([0, 0, 0]);
    });

    it('空数组应该返回空数组', () => {
      expect(zScoreNormalize([])).toEqual([]);
    });
  });

  describe('滚动均值（生产 calculateSMA）', () => {
    it('应该正确计算滚动均值且预热为 null', () => {
      // 旧自抄用 NaN 预热；生产 calculateSMA 前 period-1 个值为 null
      const avg = calculateSMA([1, 2, 3, 4, 5], 3);
      expect(avg[0]).toBeNull();
      expect(avg[1]).toBeNull();
      expect(avg[2]).toBe(2);
      expect(avg[4]).toBe(4);
    });

    it('滚动窗口为 1 应该等于原值', () => {
      expect(calculateSMA([1, 2, 3], 1)).toEqual([1, 2, 3]);
    });
  });

  describe('滚动标准差（生产 calculateBollingerBands 带宽）', () => {
    it('常量序列的滚动标准差为 0', () => {
      const bands = calculateBollingerBands([1, 1, 1, 1, 1], 3);
      expect(bands[0]).toBeNull();
      const band = bands[2]!;
      expect(band.middle).toBe(1);
      expect(band.upper - band.lower).toBe(0);
    });

    it('带宽等于 2*stdMultiplier*总体标准差', () => {
      const bands = calculateBollingerBands([1, 2, 3], 3);
      const band = bands[2]!;
      expect(band.middle).toBe(2);
      // 生产用窗口总体标准差（÷period），不是样本 n-1
      expect((band.upper - band.lower) / 2).toBeCloseTo(2 * Math.sqrt(2 / 3), 10);
    });
  });

  describe('异常值检测（生产 dataQualityEngine.detectOutliers）', () => {
    it('threshold=2 时检测到离群点并返回 AnomalyRecord', () => {
      const anomalies = detectOutliers([1, 2, 3, 100, 2, 3, 1], 2);
      expect(anomalies).toHaveLength(1);
      // 生产返回 AnomalyRecord[] 而不是索引数组；默认阈值是 3 而非旧自抄的 2
      expect(anomalies[0]).toMatchObject({
        index: 3,
        field: 'value',
        value: 100,
        type: 'outlier',
        expected: 16,
      });
      expect(anomalies[0].deviation).toBeCloseTo(84 / Math.sqrt(8236 / 6), 10);
    });

    it('默认阈值 3 时同一数据不再是异常', () => {
      expect(detectOutliers([1, 2, 3, 100, 2, 3, 1])).toEqual([]);
    });

    it('无异常值应该返回空', () => {
      expect(detectOutliers([1, 2, 3, 4, 5])).toEqual([]);
    });

    it('相同值应该返回空', () => {
      expect(detectOutliers([5, 5, 5])).toEqual([]);
    });
  });

  describe('缺失值插值（未迁移：生产无对应工具）', () => {
    it('应该线性插值', () => {
      const result = interpolateMissing([1, null, 3, null, 5]);
      expect(result[1]).toBe(2);
      expect(result[3]).toBe(4);
    });

    it('开头缺失应该用下一个值', () => {
      const result = interpolateMissing([null, null, 3]);
      expect(result[0]).toBe(3);
    });

    it('结尾缺失应该用上一个值', () => {
      const result = interpolateMissing([1, null, null]);
      expect(result[2]).toBe(1);
    });

    it('全部缺失应该返回全 0', () => {
      const result = interpolateMissing([null, null, null]);
      expect(result.every(v => v === 0)).toBe(true);
    });
  });

  describe('相关性矩阵（生产 globalCorrelationEngine.calculateCorrelationMatrix）', () => {
    it('应该返回以 ticker 为键的对称矩阵且对角为 1', () => {
      const matrix = calculateCorrelationMatrix({ A: [1, 2, 3], B: [2, 4, 6] });
      expect(matrix.A.A).toBe(1);
      expect(matrix.B.B).toBe(1);
      expect(matrix.A.B).toBeCloseTo(1, 10);
      expect(matrix.B.A).toBeCloseTo(matrix.A.B, 12);
    });

    it('完全正相关的序列相关系数为 1', () => {
      const matrix = calculateCorrelationMatrix({ A: [1, 2, 3], B: [1, 2, 3] });
      expect(matrix.A.B).toBeCloseTo(1, 12);
    });

    it('非完全相关时给出精确相关系数', () => {
      const matrix = calculateCorrelationMatrix({ A: [1, 2, 3], B: [1, 3, 2] });
      expect(matrix.A.B).toBeCloseTo(0.5, 12);
    });

    it('传入 window 时使用滚动相关的最后一个值', () => {
      const matrix = calculateCorrelationMatrix({ A: [1, 2, 3, 4], B: [2, 4, 6, 8] }, 3);
      expect(matrix.A.B).toBeCloseTo(1, 10);
    });

    it('pearsonCorrelation 对长度不足返回 0', () => {
      expect(pearsonCorrelation([1], [2])).toBe(0);
      expect(pearsonCorrelation([1, 2, 3], [3, 2, 1])).toBeCloseTo(-1, 12);
    });
  });

  describe('correlationMatrix 工具（样本口径）', () => {
    it('calculateCorrelation 完全正相关为 1', () => {
      expect(calculateCorrelation([1, 2, 3], [2, 4, 6])).toBeCloseTo(1, 12);
    });

    it('长度不等时 covariance 用较短长度而 std 用全长（混用口径）', () => {
      // 旧自抄断言返回 0；生产 calculateCovariance 取 min 长度（correlationMatrix.ts:66-76），
      // 但 calculateStdDev 用各自全长（:59-64），两者混用得到 0.7071 而不是截断后的 1
      // → 已列「生产缺陷候选」，此处记录当前真实输出。
      expect(calculateCorrelation([1, 2, 3], [1, 2])).toBeCloseTo(0.7071067811865475, 12);
    });

    it('常数序列方差为 0 时相关系数为 0', () => {
      expect(calculateCorrelation([1, 1, 1], [1, 2, 3])).toBe(0);
    });

    it('calculateStdDev 使用样本标准差 n-1', () => {
      expect(calculateStdDev([1, 2, 3, 4, 5])).toBeCloseTo(Math.sqrt(2.5), 10);
      expect(calculateStdDev([1])).toBe(0);
    });

    it('buildCorrelationMatrix 返回 tickers/matrix/period 契约', () => {
      const series: PriceSeries[] = [
        { ticker: 'AAA', name: 'A', sector: 'tech', prices: [100, 110, 132], returns: [0.1, 0.2] },
        { ticker: 'BBB', name: 'B', sector: 'tech', prices: [50, 60, 84], returns: [0.2, 0.4] },
      ];
      const result = buildCorrelationMatrix(series);
      expect(result.tickers).toEqual(['AAA', 'BBB']);
      expect(result.period).toBe(2);
      expect(result.matrix[0][0]).toBe(1);
      expect(result.matrix[1][1]).toBe(1);
      expect(result.matrix[0][1]).toBeCloseTo(result.matrix[1][0], 12);
      expect(result.matrix[0][1]).toBeCloseTo(1, 6);
      expect(result.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    });
  });
});
