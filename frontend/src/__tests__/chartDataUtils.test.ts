import { describe, it, expect } from 'vitest';
import {
  calculateSMA,
  calculateBollingerBands,
  downsampleData,
} from '../utils/chartDataProcessing';
import { calculateCorrelation } from '../utils/correlationMatrix';
import { getColorForValue } from '../utils/heatmapEngine';
import { normalizeToRange } from '../../../backend/src/services/chartDataEngine';

/**
 * 图表数据处理工具测试（影子测试迁移，批次 26b）
 *
 * 已绑定生产实现（唯一真源）：
 * - 原 normalizeData → backend/src/services/chartDataEngine.ts:55 normalizeToRange(data, min, max)
 *   契约：min/max 是「输出区间」，常量序列返回 (min+max)/2（:57）；原实现把 min/max 当输入域覆盖。
 * - 原 calculateMovingAverage → frontend/src/utils/chartDataProcessing.ts:73 calculateSMA
 *   契约：null 预热，sum/period，不舍入。
 * - 原 calculateBollingerBands → frontend/src/utils/chartDataProcessing.ts:145
 *   契约：等长数组，前 period-1 位 null，总体方差/period，返回 {upper,middle,lower}。
 * - 原 calculateCorrelation → frontend/src/utils/correlationMatrix.ts:78
 *   契约：协方差按 min(长度) 截断（:66），std 用整段数组（:59），结果 clamp 到 [-1,1]。
 * - 原 generateHeatmapData → frontend/src/utils/heatmapEngine.ts:60 getColorForValue
 *   契约：blueRed 方案返回 hex：rgb(round(t*255), round((1-t)*100), round((1-t)*255))（:87-92）。
 * - 原 downsampleData → frontend/src/utils/chartDataProcessing.ts:53
 *   契约：长度<=maxPoints 返回原数组引用（:57），否则 Math.round(i*step) 点抽样（:59-65）。
 *
 * 旧断言错在哪（旧值 → 生产值）：
 * 1) normalizeData 自定义 min/max：旧 normalizeData([5],0,10)=0.5（min/max 当输入域）
 *    → 生产 normalizeToRange([5],0,10)=5（min/max 当输出区间，常量取 (min+max)/2，chartDataEngine.ts:57）。
 * 2) calculateBollingerBands 预热：旧 NaN → 生产 null（chartDataProcessing.ts:153-154）；
 *    返回值：旧 {upper:[],middle:[],lower:[]} → 生产 Array<{upper,middle,lower}|null>（:145-149）。
 * 3) calculateCorrelation 长度不等：旧直接 0 → 生产按 min 截断后计算（correlationMatrix.ts:66-84）。
 *    注意生产 std 用整段数组、协方差用截断段：calculateCorrelation([1,2,3,4,5],[2,4,6,8]) ≈ 0.8165（既有口径，只记录不修）。
 * 4) generateHeatmapData 颜色格式：旧 rgb(r,g,b) 字符串 → 生产 hex；blueRed 最低值 '#0064ff'（非 rgb(0,...)），
 *    最高值 '#ff0000'（heatmapEngine.ts:87-92）。
 * 5) downsampleData：旧滑块均值 + 返回副本 → 生产等距点抽样，且长度<=maxPoints 返回原数组引用（chartDataProcessing.ts:57-65）。
 *
 * 未迁移（生产无对应导出，保留本地 helper）：
 * - interpolateData（线性/前向填充序列空档）：生产仓无序列补空档导出；grep fillGap/fillMissing/forwardFill/
 *   linearInterpolation 仅命中 websocket 补包、曲面插值、动画 lerp 与 i18n 插值，契约均不同。
 */

/**
 * 未迁移：生产仓没有序列空档插值函数（见文件头「未迁移」说明），保留内联实现。
 */
function interpolateData(data: (number | null)[], method: 'linear' | 'forward' = 'linear'): number[] {
  const result: number[] = [];
  let lastValidIdx = -1;

  for (let i = 0; i < data.length; i++) {
    if (data[i] !== null) {
      result.push(data[i]!);
      lastValidIdx = i;
    } else if (method === 'forward' && lastValidIdx >= 0) {
      result.push(result[lastValidIdx]);
    } else if (method === 'linear') {
      let nextValidIdx = -1;
      for (let j = i + 1; j < data.length; j++) {
        if (data[j] !== null) { nextValidIdx = j; break; }
      }
      if (lastValidIdx >= 0 && nextValidIdx >= 0) {
        const ratio = (i - lastValidIdx) / (nextValidIdx - lastValidIdx);
        result.push(result[lastValidIdx] + (data[nextValidIdx]! - result[lastValidIdx]) * ratio);
      } else if (lastValidIdx >= 0) {
        result.push(result[lastValidIdx]);
      } else if (nextValidIdx >= 0) {
        result.push(data[nextValidIdx]!);
      } else {
        result.push(0);
      }
    } else {
      result.push(0);
    }
  }

  return result;
}

describe('图表数据处理工具', () => {
  describe('normalizeToRange（原 normalizeData）', () => {
    it('应该将数据归一化到0-1', () => {
      const result = normalizeToRange([10, 20, 30, 40, 50], 0, 1);
      expect(result[0]).toBe(0);
      expect(result[4]).toBe(1);
      expect(result[2]).toBeCloseTo(0.5);
    });

    it('所有相同值应该返回区间中点', () => {
      const result = normalizeToRange([5, 5, 5], 0, 1);
      result.forEach(v => expect(v).toBe(0.5));
    });

    it('应该支持自定义输出区间', () => {
      // 旧实现把 min/max 当输入域；生产 min/max 是输出区间（chartDataEngine.ts:58）
      expect(normalizeToRange([10, 20, 30], 0, 100)).toEqual([0, 50, 100]);
      expect(normalizeToRange([10, 20, 30], -1, 1)).toEqual([-1, 0, 1]);
    });

    it('单个元素数组', () => {
      expect(normalizeToRange([42], 0, 1)).toEqual([0.5]);
    });

    it('负数应该正确处理', () => {
      const result = normalizeToRange([-100, 0, 100], 0, 1);
      expect(result[0]).toBe(0);
      expect(result[1]).toBeCloseTo(0.5);
      expect(result[2]).toBe(1);
    });
  });

  describe('calculateSMA（原 calculateMovingAverage）', () => {
    it('应该计算正确移动平均', () => {
      const result = calculateSMA([1, 2, 3, 4, 5], 3);
      expect(result).toEqual([null, null, 2, 3, 4]);
    });

    it('period=1应该返回原值', () => {
      const result = calculateSMA([10, 20, 30], 1);
      expect(result).toEqual([10, 20, 30]);
    });

    it('空数组应该返回空', () => {
      expect(calculateSMA([], 3)).toEqual([]);
    });

    it('数据量等于period', () => {
      const result = calculateSMA([1, 2, 3], 3);
      expect(result).toHaveLength(3);
      expect(result[2]).toBe(2);
    });

    it('不应该四舍五入（区别于 backend/indicators/technical.ts 的 toFixed(4)）', () => {
      const result = calculateSMA([1, 2, 4], 3);
      expect(result[2]).toBe(7 / 3);
      expect(result[2]).not.toBe(2.3333);
    });
  });

  describe('calculateBollingerBands（原 calculateBollingerBands）', () => {
    it('应该计算布林带', () => {
      const data = Array.from({ length: 30 }, (_, i) => 100 + Math.sin(i / 3) * 10);
      const bands = calculateBollingerBands(data, 20, 2);
      expect(bands).toHaveLength(30);
      expect(bands[0]).toBeNull();

      // 上轨 > 中轨 > 下轨
      for (let i = 19; i < 30; i++) {
        const band = bands[i]!;
        expect(band.upper).toBeGreaterThan(band.middle);
        expect(band.middle).toBeGreaterThan(band.lower);
      }
    });

    it('数据不足时应该是null', () => {
      const data = [1, 2, 3];
      const bands = calculateBollingerBands(data, 20, 2);
      expect(bands).toHaveLength(3);
      expect(bands[0]).toBeNull();
      expect(bands[2]).toBeNull();
    });

    it('第period-1位开始才有值', () => {
      const data = Array(30).fill(100);
      const bands = calculateBollingerBands(data, 20, 2);
      expect(bands[18]).toBeNull();
      expect(bands[19]).not.toBeNull();
      expect(bands[19]!.middle).toBe(100);
    });

    it('恒定值的布林带宽度应该为0', () => {
      const data = Array(30).fill(100);
      const bands = calculateBollingerBands(data, 20, 2);
      expect(bands[29]!.upper).toBe(bands[29]!.lower);
      expect(bands[29]!.upper).toBe(100);
    });
  });

  describe('interpolateData（未迁移，生产无导出）', () => {
    it('应该线性插值', () => {
      const result = interpolateData([1, null, null, 4], 'linear');
      expect(result[0]).toBe(1);
      expect(result[3]).toBe(4);
      expect(result[1]).toBeCloseTo(2);
      expect(result[2]).toBeCloseTo(3);
    });

    it('应该前向填充', () => {
      const result = interpolateData([1, null, null, 4], 'forward');
      expect(result[0]).toBe(1);
      expect(result[1]).toBe(1);
      expect(result[2]).toBe(1);
      expect(result[3]).toBe(4);
    });

    it('全null应该返回0', () => {
      const result = interpolateData([null, null], 'linear');
      expect(result).toEqual([0, 0]);
    });

    it('没有null应该原样返回', () => {
      const result = interpolateData([1, 2, 3], 'linear');
      expect(result).toEqual([1, 2, 3]);
    });

    it('开头null应该用后续值填充', () => {
      const result = interpolateData([null, null, 5], 'linear');
      expect(result[0]).toBe(5);
    });

    it('末尾null应该用前值填充', () => {
      const result = interpolateData([5, null, null], 'linear');
      expect(result[1]).toBe(5);
      expect(result[2]).toBe(5);
    });
  });

  describe('calculateCorrelation（原 calculateCorrelation）', () => {
    it('完全正相关应该返回1', () => {
      const result = calculateCorrelation([1, 2, 3, 4, 5], [2, 4, 6, 8, 10]);
      expect(result).toBeCloseTo(1, 5);
    });

    it('完全负相关应该返回-1', () => {
      const result = calculateCorrelation([1, 2, 3, 4, 5], [10, 8, 6, 4, 2]);
      expect(result).toBeCloseTo(-1, 5);
    });

    it('方差为0应该返回0', () => {
      const result = calculateCorrelation([1, 1, 1, 1], [2, 3, 4, 5]);
      expect(result).toBe(0);
    });

    it('空数组应该返回0', () => {
      expect(calculateCorrelation([], [])).toBe(0);
    });

    it('长度不同应该按较短序列截断计算（旧实现直接返回0）', () => {
      // correlationMatrix.ts:66-84：协方差用 min 长度，std 用整段数组，故为 sqrt(2/3) 而非 1
      const result = calculateCorrelation([1, 2, 3, 4, 5], [2, 4, 6, 8]);
      expect(result).toBeCloseTo(Math.sqrt(2 / 3), 10);
    });
  });

  describe('getColorForValue（原 generateHeatmapData）', () => {
    it('应该生成颜色矩阵', () => {
      const data = [[1, 2], [3, 4]];
      const colors = data.map(row =>
        row.map(v => getColorForValue(v, { colorScheme: 'blueRed', minValue: 1, maxValue: 4 }))
      );
      expect(colors).toHaveLength(2);
      expect(colors[0]).toHaveLength(2);
      colors.forEach(row => row.forEach(c => {
        expect(c).toMatch(/^#[0-9a-f]{6}$/);
      }));
      expect(colors[0][0]).toBe('#0064ff');
      expect(colors[1][1]).toBe('#ff0000');
    });

    it('最低值应该接近冷色', () => {
      // blueRed: t=0 → r=0, g=round(100), b=255（heatmapEngine.ts:87-92）
      expect(getColorForValue(0, { colorScheme: 'blueRed', minValue: 0, maxValue: 100 })).toBe('#0064ff');
      expect(getColorForValue(50, { colorScheme: 'blueRed', minValue: 0, maxValue: 100 })).toBe('#803280');
    });

    it('最高值应该接近暖色', () => {
      expect(getColorForValue(100, { colorScheme: 'blueRed', minValue: 0, maxValue: 100 })).toBe('#ff0000');
    });

    it('越界值应该被钳制到两端颜色', () => {
      expect(getColorForValue(-10, { colorScheme: 'blueRed', minValue: 0, maxValue: 100 })).toBe('#0064ff');
      expect(getColorForValue(150, { colorScheme: 'blueRed', minValue: 0, maxValue: 100 })).toBe('#ff0000');
    });
  });

  describe('downsampleData（原 downsampleData）', () => {
    it('应该减少数据点数量', () => {
      const data = Array.from({ length: 1000 }, (_, i) => ({ timestamp: i }));
      const result = downsampleData(data, 100);
      expect(result).toHaveLength(100);
      expect(result[0]).toBe(data[0]);
      expect(result[1]).toBe(data[10]);
      expect(result[99]).toBe(data[990]);
    });

    it('数据量小于目标应该返回原数组引用', () => {
      const data = [{ timestamp: 1 }, { timestamp: 2 }, { timestamp: 3 }];
      const result = downsampleData(data, 10);
      expect(result).toBe(data);
    });

    it('应该按等距下标抽样并保持递增趋势', () => {
      const data = Array.from({ length: 100 }, (_, i) => ({ timestamp: i }));
      const result = downsampleData(data, 10);
      expect(result.map(d => d.timestamp)).toEqual([0, 10, 20, 30, 40, 50, 60, 70, 80, 90]);
    });
  });
});
