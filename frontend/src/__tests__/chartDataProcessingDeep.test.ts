/**
 * 图表数据处理深度测试 — 影子测试迁移（批次 30a）
 *
 * 已绑定生产实现（唯一真源）：
 * - K线涨跌幅 → backend/src/models/Stock.ts:225-229 calculateChange(close, prevClose)
 *   返回未取整的 { change, changePercent }（changePercent = change / prevClose * 100）。
 * - K线振幅 → backend/src/models/Stock.ts:231-234 calculateAmplitude(high, low, prevClose)
 *   （分母为昨收 prevClose，不是开盘价），展示层四舍五入见 frontend/src/utils/dataTransformUtils.ts:89。
 * - K线涨跌色 → frontend/src/utils/dataTransformUtils.ts:74-92 transformStock
 *   按 change 符号判色：>0 red / <0 green / =0 gray（:76-79）。
 * - K线重采样 → backend/src/services/chartDataEngine.ts:8-23 aggregateKlines(data, factor)
 *   （factor <= 1 时直接返回原数组引用，:9）。
 * - 数组归一化 → backend/src/services/chartDataEngine.ts:55-59 normalizeToRange(data, min, max)
 *   （常量序列返回 (min+max)/2，:57）。
 * - 标量归一化 → backend/src/utils/futureValueUtils.ts:11-14 normalize(value, min, max)
 *   （max===min 返回 0.5，:12；结果夹取到 [0,1]，:13）。
 * - Z-Score → backend/src/services/zScoreEngine.ts:6-8 zScore(value, mean, std)
 *   （std===0 返回 0），:10-16 zScoreSeries(data)（总体标准差 /n，每项保留 4 位小数，:15）。
 * - 热力图取色 → frontend/src/utils/heatmapEngine.ts:60-109 getColorForValue
 *   （blueRed 公式在 :87-92，t 夹取到 [0,1] 在 :66，range 兜底为 1 在 :65；
 *   rgbToHex 输出小写 6 位 hex 在 :111-113）。
 *
 * 旧断言订正（旧值 → 生产值 + 依据）：
 * 1. 振幅分母：旧自抄 processKLine 用 ((high-low)/open)*100 → 生产用 ((high-low)/prevClose)*100
 *    （frontend/src/utils/dataTransformUtils.ts:75；backend/src/models/Stock.ts:231-234）。
 *    同一夹具 open=100、preClose=125、high=110、low=90：旧断言 20 → 生产 16
 *    （transformStock 四舍五入 2 位：dataTransformUtils.ts:89）。
 * 2. 涨跌标记：旧自抄 isUp = close >= open → 生产按 change（收盘-昨收）符号判色
 *    （dataTransformUtils.ts:76-79）。isUp 仅存在于模块私有的 frontend/src/utils/workerManager.ts:90-101，
 *    不可导入，故用例改断言生产 color。
 * 3. change 取整：旧自抄 Math.round(change*100)/100 → 生产 calculateChange 不取整
 *    （backend/src/models/Stock.ts:225-229）；本用例 10% 两种实现相同，保留 toBeCloseTo(10, 5)。
 * 4. Z-Score 取整：旧自抄不取整 → 生产 zScoreSeries 每项 Math.round(z*10000)/10000
 *    （backend/src/services/zScoreEngine.ts:15）；均值/标准差用例在容差内一致，另新增精确值断言 1.2247。
 * 5. 热力图最小值：旧自抄 r=0,g=255,b=0（绿）→ 生产 blueRed 在 t=0 为 r=0,g=100,b=255
 *    → '#0064ff'（frontend/src/utils/heatmapEngine.ts:87-92）。
 * 6. 热力图中间值：旧自抄 r=128,g=128,b=0（黄）→ 生产 blueRed 在 t=0.5 为 r=128,g=50,b=128
 *    → '#803280'（heatmapEngine.ts:87-92）。
 * 7. 热力图 min=max：旧自抄 ratio=0.5（中间色）→ 生产 range = max-min || 1、t=(value-min)/range=0
 *    → 冷端 '#0064ff'（heatmapEngine.ts:65-66、87-92）。
 * 8. 热力图越界：旧自抄不夹取 → 生产 t 夹取到 [0,1]（heatmapEngine.ts:66），越界值分别落到冷端/热端。
 * 9. 重采样系数：旧自抄对 factor=1 仍按块重建数组 → 生产 aggregateKlines 在 factor<=1 时返回原数组引用
 *    （chartDataEngine.ts:9），新增断言绑定该契约。
 *
 * 未迁移（生产无对应导出，保留本地 helper）：
 * - linearInterpolate：frontend/src 与 backend/src 非测试源码均无「缺失值线性插值」导出
 *   （rg linearInterpolate 仅命中本测试；interpolat 仅命中 i18n 模板、volSurface 双线性等不同契约）。
 * - niceScale：frontend/src 与 backend/src 均无刻度美化导出（rg niceScale|niceTick 0 命中）。
 */
import { describe, it, expect } from 'vitest';
import { calculateAmplitude, calculateChange } from '../../../backend/src/models/Stock';
import {
  aggregateKlines,
  normalizeToRange,
  type OHLCV,
} from '../../../backend/src/services/chartDataEngine';
import { zScore as zScoreScalar, zScoreSeries } from '../../../backend/src/services/zScoreEngine';
import { normalize as normalizeScalar } from '../../../backend/src/utils/futureValueUtils';
import { transformBatch, transformStock, type RawStockData } from '../utils/dataTransformUtils';
import { getColorForValue } from '../utils/heatmapEngine';
import { parseHexColor } from '../utils/accessibility';

/**
 * 测试夹具：生产 RawStockData 的确定性默认值，仅用于补齐 transformStock 入参，不含任何业务计算。
 */
function makeRawStock(overrides: Partial<RawStockData> = {}): RawStockData {
  return {
    code: '000001.SZ',
    name: '平安银行',
    price: 10,
    change: 0,
    changePercent: 0,
    volume: 1000,
    amount: 10000000,
    high: 11,
    low: 9,
    open: 10,
    preClose: 10,
    turnover: 1,
    pe: 5,
    pb: 0.8,
    marketCap: 100000000000,
    ...overrides,
  };
}

/** 生产 parseHexColor 的断言适配：非法 hex 直接失败，避免静默回退。 */
function rgbOf(hex: string): [number, number, number] {
  const rgb = parseHexColor(hex);
  if (!rgb) throw new Error('非法 hex 颜色: ' + hex);
  return rgb;
}

// 图表数据处理深度测试 — 原 28 用例，迁移后 32 用例
describe('图表数据处理深度', () => {

  // K线数据处理
  describe('K线数据处理', () => {
    const trend: OHLCV[] = [
      { date: '2024-01-01', open: 10, high: 11, low: 9, close: 10, volume: 1000 },
      { date: '2024-01-02', open: 10, high: 12, low: 9, close: 11, volume: 2000 },
    ];

    it('涨跌标记正确', () => {
      // 生产真源：calculateChange 判涨跌幅，transformStock 按 change 符号判色
      // （Stock.ts:225-229、dataTransformUtils.ts:76-79）。
      const current = trend[1] as OHLCV;
      const previous = trend[0] as OHLCV;
      const { change, changePercent } = calculateChange(current.close, previous.close);
      const quote = transformStock(makeRawStock({
        price: current.close,
        change,
        changePercent,
        preClose: previous.close,
        open: current.open,
        high: current.high,
        low: current.low,
        volume: current.volume,
      }));
      expect(changePercent).toBeCloseTo(10, 5);
      expect(quote.color).toBe('red');
    });

    it('振幅计算正确', () => {
      // 旧自抄分母是 open，生产分母是 prevClose（Stock.ts:231-234、dataTransformUtils.ts:75）。
      const high = 110;
      const low = 90;
      const preClose = 125;
      expect(calculateAmplitude(high, low, preClose)).toBeCloseTo(16, 5);
      const quote = transformStock(makeRawStock({ high, low, preClose }));
      expect(quote.amplitude).toBeCloseTo(16, 5);
    });

    it('重采样数据量正确', () => {
      const data: OHLCV[] = Array.from({ length: 10 }, (_, i) => ({
        date: '2024-01-' + String(i + 1).padStart(2, '0'),
        open: 10,
        high: 11,
        low: 9,
        close: 10,
        volume: 100,
      }));
      expect(aggregateKlines(data, 3)).toHaveLength(4);
    });

    it('重采样OHLC正确', () => {
      const data: OHLCV[] = [
        { date: '1', open: 10, high: 12, low: 9, close: 11, volume: 100 },
        { date: '2', open: 11, high: 15, low: 10, close: 14, volume: 200 },
      ];
      const result = aggregateKlines(data, 2);
      expect(result[0]?.high).toBe(15);
      expect(result[0]?.low).toBe(9);
      expect(result[0]?.open).toBe(10);
      expect(result[0]?.close).toBe(14);
      expect(result[0]?.volume).toBe(300);
    });

    it('空数据处理应返回空', () => {
      expect(aggregateKlines([], 3)).toHaveLength(0);
      expect(transformBatch([])).toHaveLength(0);
    });

    it('第一根K线涨跌幅为0', () => {
      // 首根无昨收：零涨跌在生产的判定是 change=0 → gray（dataTransformUtils.ts:76-79）。
      expect(calculateChange(10, 10).changePercent).toBe(0);
      expect(transformStock(makeRawStock({ change: 0, changePercent: 0 })).color).toBe('gray');
    });

    it('聚合系数不大于1时原样返回', () => {
      // 生产契约：factor <= 1 直接返回原数组引用（chartDataEngine.ts:9）。
      expect(aggregateKlines(trend, 1)).toBe(trend);
      expect(aggregateKlines(trend, 0)).toBe(trend);
    });
  });

  // 数据归一化
  describe('数据归一化', () => {
    it('归一化范围应为[0,1]', () => {
      const result = normalizeToRange([10, 20, 30, 40, 50], 0, 1);
      expect(Math.min(...result)).toBeCloseTo(0, 5);
      expect(Math.max(...result)).toBeCloseTo(1, 5);
    });

    it('常量数据归一化应全为0.5', () => {
      expect(normalizeToRange([5, 5, 5], 0, 1)).toEqual([0.5, 0.5, 0.5]);
      expect(normalizeScalar(5, 5, 5)).toBe(0.5);
    });

    it('Z-score均值应为0', () => {
      const result = zScoreSeries([10, 20, 30]);
      const mean = result.reduce((a, b) => a + b, 0) / result.length;
      expect(mean).toBeCloseTo(0, 5);
    });

    it('Z-score标准差应为1', () => {
      const result = zScoreSeries([10, 20, 30, 40, 50]);
      const mean = result.reduce((a, b) => a + b, 0) / result.length;
      const std = Math.sqrt(result.reduce((s, v) => s + (v - mean) ** 2, 0) / result.length);
      expect(std).toBeCloseTo(1, 3);
    });

    it('常量数据Z-score应全为0', () => {
      expect(zScoreSeries([5, 5, 5])).toEqual([0, 0, 0]);
    });

    it('空数据应返回空', () => {
      expect(normalizeToRange([], 0, 1)).toHaveLength(0);
      expect(zScoreSeries([])).toHaveLength(0);
    });

    it('标量normalize越界时夹到[0,1]', () => {
      // 生产契约：标量 normalize 会把结果夹到 [0,1]（futureValueUtils.ts:13）。
      expect(normalizeScalar(150, 0, 100)).toBe(1);
      expect(normalizeScalar(-20, 0, 100)).toBe(0);
      expect(normalizeScalar(50, 0, 100)).toBe(0.5);
    });

    it('标量zScore与序列实现一致', () => {
      expect(zScoreScalar(60, 50, 10)).toBe(1);
      expect(zScoreScalar(5, 5, 0)).toBe(0);
      expect(zScoreSeries([10, 20, 30])).toEqual([-1.2247, 0, 1.2247]);
    });
  });

  // 数据插值
  describe('数据插值', () => {
    /**
     * 未迁移：生产无对应导出（frontend/src、backend/src 非测试源码均无缺失值线性插值导出），
     * 保留本地实现仅用于本组用例。
     */
    function linearInterpolate(data: (number | null)[], fillCount: number = 0) {
      const result = [...data];
      for (let i = 0; i < result.length; i++) {
        if (result[i] === null) {
          let prevIdx = -1, nextIdx = -1;
          for (let j = i - 1; j >= 0; j--) { if (result[j] !== null) { prevIdx = j; break; } }
          for (let j = i + 1; j < result.length; j++) { if (result[j] !== null) { nextIdx = j; break; } }
          if (prevIdx >= 0 && nextIdx >= 0) {
            const ratio = (i - prevIdx) / (nextIdx - prevIdx);
            result[i] = (result[prevIdx]! as number) + ratio * ((result[nextIdx]! as number) - (result[prevIdx]! as number));
          } else if (prevIdx >= 0) {
            result[i] = result[prevIdx];
          } else if (nextIdx >= 0) {
            result[i] = result[nextIdx];
          }
        }
      }
      return result as number[];
    }

    it('缺失值插值正确', () => {
      const result = linearInterpolate([1, null, 3]);
      expect(result[1]).toBeCloseTo(2, 5);
    });

    it('连续缺失值', () => {
      const result = linearInterpolate([0, null, null, 3]);
      expect(result[1]).toBeCloseTo(1, 5);
      expect(result[2]).toBeCloseTo(2, 5);
    });

    it('开头缺失用下一个值填充', () => {
      const result = linearInterpolate([null, null, 5]);
      expect(result[0]).toBe(5);
    });

    it('结尾缺失用上一个值填充', () => {
      const result = linearInterpolate([5, null, null]);
      expect(result[2]).toBe(5);
    });

    it('无缺失值应不变', () => {
      const result = linearInterpolate([1, 2, 3]);
      expect(result).toEqual([1, 2, 3]);
    });

    it('空数组返回空', () => {
      expect(linearInterpolate([])).toHaveLength(0);
    });
  });

  // 热力图颜色映射
  describe('热力图颜色映射', () => {
    const blueRed = { colorScheme: 'blueRed' as const, minValue: 0, maxValue: 100 };

    it('最小值应为绿色', () => {
      // 用例名沿用旧自抄测试（只增不减）；生产 blueRed 最小值是冷端蓝，不是绿。
      // 旧断言 r=0,g=255,b=0 → 生产 r=0,g=100,b=255（heatmapEngine.ts:87-92）。
      const color = getColorForValue(0, blueRed);
      const [r, g, b] = rgbOf(color);
      expect(color).toBe('#0064ff');
      expect(r).toBe(0);
      expect(g).toBe(100);
      expect(b).toBe(255);
    });

    it('最大值应为红色', () => {
      const color = getColorForValue(100, blueRed);
      const [r, g, b] = rgbOf(color);
      expect(color).toBe('#ff0000');
      expect(r).toBe(255);
      expect(g).toBe(0);
      expect(b).toBe(0);
    });

    it('中间值应为黄色', () => {
      // 用例名沿旧；生产 blueRed 中点是紫色，不是黄色。
      // 旧断言 r=128,g=128,b=0 → 生产 r=128,g=50,b=128（heatmapEngine.ts:87-92）。
      const color = getColorForValue(50, blueRed);
      const [r, g, b] = rgbOf(color);
      expect(color).toBe('#803280');
      expect(r).toBe(128);
      expect(g).toBe(50);
      expect(b).toBe(128);
    });

    it('hex格式正确', () => {
      const color = getColorForValue(37, blueRed);
      expect(color).toMatch(/^#[0-9a-f]{6}$/);
    });

    it('min=max应返回中间色', () => {
      // 用例名沿旧；生产在 min=max 时 range 兜底为 1、t=0，返回冷端色（heatmapEngine.ts:65-66）。
      // 旧断言 r≈128 → 生产 r=0,g=100,b=255。
      const color = getColorForValue(5, { colorScheme: 'blueRed', minValue: 5, maxValue: 5 });
      const [r, g, b] = rgbOf(color);
      expect(color).toBe('#0064ff');
      expect(r).toBe(0);
      expect(g).toBe(100);
      expect(b).toBe(255);
    });

    it('越界值夹到冷端或热端', () => {
      // 生产 t 会被夹取到 [0,1]（heatmapEngine.ts:66）。
      expect(getColorForValue(-50, blueRed)).toBe('#0064ff');
      expect(getColorForValue(150, blueRed)).toBe('#ff0000');
    });
  });

  // 图表坐标轴
  describe('图表坐标轴', () => {
    /**
     * 未迁移：生产无对应导出（rg niceScale|niceTick 在 frontend/src、backend/src 均 0 命中），
     * 保留本地实现仅用于本组用例。
     */
    function niceScale(min: number, max: number, ticks: number = 5) {
      const range = max - min;
      if (range === 0) {
        const step = Math.abs(min) || 1;
        return { min: min - step, max: max + step, step, values: [min - step, min, max + step] };
      }
      const step = range / ticks;
      const magnitude = Math.pow(10, Math.floor(Math.log10(step || 1)));
      const niceStep = Math.ceil(step / magnitude) * magnitude;
      const niceMin = Math.floor(min / niceStep) * niceStep;
      const niceMax = Math.ceil(max / niceStep) * niceStep;
      const values: number[] = [];
      for (let v = niceMin; v <= niceMax; v += niceStep) values.push(v);
      return { min: niceMin, max: niceMax, step: niceStep, values };
    }

    it('刻度值应递增', () => {
      const { values } = niceScale(0, 100, 5);
      for (let i = 1; i < values.length; i++) {
        expect(values[i]).toBeGreaterThan(values[i - 1]!);
      }
    });

    it('刻度应覆盖数据范围', () => {
      const { min, max, values } = niceScale(15, 87, 5);
      expect(values[0]).toBeLessThanOrEqual(min);
      expect(values[values.length - 1]!).toBeGreaterThanOrEqual(max);
    });

    it('刻度间隔应一致', () => {
      const { values, step } = niceScale(0, 100, 5);
      for (let i = 1; i < values.length; i++) {
        expect(values[i]! - values[i - 1]!).toBeCloseTo(step, 5);
      }
    });

    it('零范围应返回合理刻度', () => {
      const { values } = niceScale(10, 10, 5);
      expect(values.length).toBeGreaterThan(0);
    });

    it('负范围应正确处理', () => {
      const { min, max } = niceScale(-100, 100, 4);
      expect(min).toBeLessThanOrEqual(-100);
      expect(max).toBeGreaterThanOrEqual(100);
    });
  });
});
