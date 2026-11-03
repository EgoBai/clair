/**
 * 影子测试迁移（批次 30b）
 *
 * 迁移前：本文件只 import vitest，10 组数据处理实现全部自抄；迁移后：能对上生产导出的符号一律 import 真源，
 * 生产没有对应实现（或契约不同）的 helper 保留本地并逐条注明「未迁移：生产无对应导出」。
 * 用例数：45 → 48（原有 describe/it 名称全部保留，另新增 3 条标量 / 对照口径用例，只增不减）。
 *
 * 已绑定生产实现：
 * - 去重 → frontend/src/utils/dataFlowEngine.ts:52 pipeline().distinct(keyFn)（保留首次出现）
 * - 滑动窗口 → dataFlowEngine.ts:71 pipeline().window({ size, slide })（返回 T[][]）
 * - 分组 → dataFlowEngine.ts:62 pipeline().groupBy(keyFn)（返回 Map<K, T[]>）
 * - 异常检测 → backend/src/services/zScoreEngine.ts:18 detectOutliers（总体标准差 n，默认阈值 2，
 *   返回 { indices, values }；z 值按 :15 四舍五入到 4 位）
 * - 归一化（序列）→ dataFlowEngine.ts:220 minMaxNormalize（4 位舍入；range=0 时全 0，:225）
 * - Z-Score（序列）→ dataFlowEngine.ts:209 zScoreNormalize（总体标准差，4 位舍入，:209-215）
 * - 标量 normalize → backend/src/utils/futureValueUtils.ts:11（max===min 返回 0.5 :12，clamp 到 [0,1] :13）
 * - 标量 zScore → backend/src/services/zScoreEngine.ts:6 与 futureValueUtils.ts:19（std=0 返回 0）
 * - 异常检测对照口径 → frontend/src/utils/dataQualityEngine.ts:164（样本标准差 n-1 :51、默认阈值 3 :166、
 *   返回 AnomalyRecord[] :26-33）
 * 跨包 import 先例：backend/src/__tests__/movingAverageSystem.test.ts:38。
 *
 * 旧断言错在哪（旧值 → 生产值 + 依据行号）：
 * - 归一化（序列）全相同：[5,5,5] 旧每项 0.5 → 生产 minMaxNormalize 全 0（dataFlowEngine.ts:225 range=0 分支）；
 *   注意标量口径不同：normalize(5,5,5) 才返回 0.5（futureValueUtils.ts:12）。
 * - 归一化（序列）单元素：[42] 旧 [0.5] → 生产 minMaxNormalize([42]) 为 [0]（同上 range=0 分支）。
 * - 异常检测返回结构：旧 number[] → 生产 detectOutliers 返回 { indices, values }（zScoreEngine.ts:18-23），
 *   .length 断言改为 .values.length，并补 .indices 定位（旧用例只数个数，不验证位置）。
 * - 分组返回结构：旧 Record<string, T[]>（g['A']）→ 生产 groupBy 返回 Map<K, T[]>（dataFlowEngine.ts:62-70），
 *   改用 .get('A') / .size。
 * - 去重/滑动窗口：旧本地 filter+Set / for 循环 → 生产 pipeline().distinct / window，语义一致
 *   （distinct 保留首次出现 :52-60；window i<=len-size, i+=slide :73）。
 * - 缺失值填充 / 重采样 / 透视 / 校验四组：生产无同契约导出（见下），断言值与旧文件保持一致。
 *
 * 未迁移（生产无对应导出 / 契约不同，保留本地 helper）：
 * - fillMissing：全仓无「缺失值填充」导出（rg fillMissing/fillForward/impute 均只命中测试）；
 *   本地实现 zero / mean / prev 三种填充，行为与旧断言一致。
 * - downsample：生产只有 frontend/src/utils/chartDataProcessing.ts:53 downsampleData(data, maxPoints)，
 *   语义是「按目标点数抽点」，不是本文件「按因子 factor 做 mean/max/min/sum 聚合」，契约不同，保留本地实现。
 * - pivot：生产无透视表导出（rg pivot 只命中 patternRecognitionEngine 的 PivotPoint/转折点，语义无关），保留本地实现。
 * - validateSchema：生产校验走 shared/schemas.ts:7-35 的 Zod schema（validateResponse :29）与
 *   frontend/src/utils/validation.ts:17 的规则数组校验，没有「字段→类型/必填」通用校验器，
 *   也不产出 Missing: x / Type mismatch: x 文案，保留本地实现。
 *
 * 新增用例（45 → 48）：
 * - 归一化 › 标量 normalize 边界（futureValueUtils 口径）
 * - Z-Score › 标量 zScore 与序列首值一致（zScoreEngine / futureValueUtils 口径）
 * - 异常检测 › dataQualityEngine 对照口径（样本标准差 + 默认阈值 3）
 */

import { describe, it, expect } from 'vitest';
import {
  pipeline,
  minMaxNormalize,
  zScoreNormalize,
} from '../../../frontend/src/utils/dataFlowEngine';
import { detectOutliers, zScore } from '../services/zScoreEngine';
import { normalize as normalizeScalar, zScore as zScoreScalar } from '../utils/futureValueUtils';
import { detectOutliers as detectOutliersDataQuality } from '../../../frontend/src/utils/dataQualityEngine';

describe('Data Pipeline Engine', () => {
  // 未迁移：生产无对应导出（全仓无缺失值填充导出），保留旧实现供缺失值填充用例使用。
  const fillMissing = (data: (number | null)[], method: 'zero' | 'mean' | 'prev' = 'mean'): number[] => {
    if (method === 'zero') return data.map(d => d ?? 0);
    if (method === 'prev') {
      const result: number[] = [];
      let last = 0;
      for (const d of data) { if (d !== null) { last = d; result.push(d); } else result.push(last); }
      return result;
    }
    const valid = data.filter((d): d is number => d !== null);
    const mean = valid.reduce((a, b) => a + b, 0) / valid.length;
    return data.map(d => d ?? mean);
  };

  // 未迁移：生产无对应导出（chartDataProcessing.downsampleData 是「按目标点数抽点」，非按因子聚合）。
  const downsample = (data: number[], factor: number, method: 'mean' | 'max' | 'min' | 'sum' = 'mean'): number[] => {
    const result: number[] = [];
    for (let i = 0; i < data.length; i += factor) {
      const slice = data.slice(i, i + factor);
      switch (method) {
        case 'max': result.push(Math.max(...slice)); break;
        case 'min': result.push(Math.min(...slice)); break;
        case 'sum': result.push(slice.reduce((a, b) => a + b, 0)); break;
        default: result.push(slice.reduce((a, b) => a + b, 0) / slice.length);
      }
    }
    return result;
  };

  // 未迁移：生产无对应导出（生产仅 patternRecognitionEngine 的 PivotPoint 转折点，语义无关）。
  const pivot = <T>(data: T[], rowKey: (item: T) => string, colKey: (item: T) => string, valKey: (item: T) => number): Record<string, Record<string, number>> => {
    const result: Record<string, Record<string, number>> = {};
    for (const item of data) {
      const r = rowKey(item);
      const c = colKey(item);
      (result[r] ??= {})[c] = valKey(item);
    }
    return result;
  };

  // 未迁移：生产无对应导出（生产校验走 Zod schema / 规则数组，无字段→类型校验器，也不产出 Missing:/Type mismatch: 文案）。
  const validateSchema = (data: Record<string, any>, schema: Record<string, { type: string; required?: boolean }>): string[] => {
    const errors: string[] = [];
    for (const [field, rule] of Object.entries(schema)) {
      if (rule.required && !(field in data)) { errors.push(`Missing: ${field}`); continue; }
      if (field in data && typeof data[field] !== rule.type) errors.push(`Type mismatch: ${field}`);
    }
    return errors;
  };

  describe('数据清洗', () => {
    it('去重', () => {
      const data = [{ id: '1' }, { id: '2' }, { id: '1' }];
      expect(pipeline(data).distinct(d => d.id).toArray().length).toBe(2);
    });
    it('无重复', () => {
      const data = [{ id: '1' }, { id: '2' }];
      expect(pipeline(data).distinct(d => d.id).toArray().length).toBe(2);
    });
    it('全重复', () => {
      const data = [{ id: '1' }, { id: '1' }];
      expect(pipeline(data).distinct(d => d.id).toArray().length).toBe(1);
    });
    it('空数组', () => expect(pipeline<{ id: string }>([]).distinct(d => d.id).toArray().length).toBe(0));
    it('数字去重', () => {
      const data = [{ v: 1 }, { v: 2 }, { v: 1 }, { v: 3 }, { v: 2 }];
      expect(pipeline(data).distinct(d => String(d.v)).toArray().length).toBe(3);
    });
  });

  describe('缺失值填充', () => {
    it('零填充', () => {
      expect(fillMissing([1, null, 3], 'zero')).toEqual([1, 0, 3]);
    });
    it('均值填充', () => {
      const result = fillMissing([1, null, 3], 'mean');
      expect(result[1]).toBeCloseTo(2);
    });
    it('前值填充', () => {
      expect(fillMissing([1, null, null, 4], 'prev')).toEqual([1, 1, 1, 4]);
    });
    it('无缺失', () => {
      expect(fillMissing([1, 2, 3], 'zero')).toEqual([1, 2, 3]);
    });
    it('全缺失零填充', () => {
      expect(fillMissing([null, null], 'zero')).toEqual([0, 0]);
    });
    it('首值缺失前值填充', () => {
      expect(fillMissing([null, 2, 3], 'prev')).toEqual([0, 2, 3]);
    });
    it('单值缺失', () => {
      const r = fillMissing([10, null, 20, 30], 'mean');
      expect(r[1]).toBeCloseTo(20);
    });
  });

  describe('异常检测', () => {
    it('检测异常值', () => {
      const normal = Array(20).fill(5);
      const outliers = detectOutliers([...normal, 500]);
      expect(outliers.values.length).toBe(1);
      expect(outliers.indices).toEqual([20]);
    });
    it('无异常', () => {
      expect(detectOutliers([1, 2, 3, 4, 5]).values.length).toBe(0);
    });
    it('双端异常', () => {
      const normal = Array(20).fill(5);
      const outliers = detectOutliers([...normal, 500, 600]);
      expect(outliers.values.length).toBe(2);
      expect(outliers.indices).toEqual([20, 21]);
    });
    it('阈值宽松', () => {
      expect(detectOutliers([1, 2, 3, 4, 5, 10], 3).values.length).toBe(0);
    });
    it('全相同', () => {
      expect(detectOutliers([5, 5, 5, 5]).values.length).toBe(0);
    });
    it('dataQualityEngine 对照口径（样本标准差 + 默认阈值3）', () => {
      // 与上方 zScoreEngine（总体标准差、默认阈值 2）口径不同：这里 n-1 样本标准差、默认阈值 3，返回 AnomalyRecord[]。
      const normal = Array(20).fill(5);
      const anomalies = detectOutliersDataQuality([...normal, 500]);
      expect(anomalies).toHaveLength(1);
      expect(anomalies[0]).toMatchObject({ index: 20, value: 500, type: 'outlier' });
    });
  });

  describe('归一化', () => {
    it('范围0-1', () => {
      expect(minMaxNormalize([0, 50, 100])).toEqual([0, 0.5, 1]);
    });
    it('全相同', () => {
      // 旧值 0.5 → 生产值 0（dataFlowEngine.ts:225 range=0 分支）。
      const r = minMaxNormalize([5, 5, 5]);
      expect(r.every(v => v === 0)).toBe(true);
    });
    it('负值', () => {
      const r = minMaxNormalize([-10, 0, 10]);
      expect(r[0]).toBe(0);
      expect(r[2]).toBe(1);
    });
    it('单元素', () => {
      // 旧值 [0.5] → 生产值 [0]（同上 range=0 分支）。
      expect(minMaxNormalize([42])).toEqual([0]);
    });
    it('标量 normalize 边界', () => {
      // futureValueUtils.ts:11 口径：max===min 返回 0.5（:12），越界 clamp 到 [0,1]（:13）。
      expect(normalizeScalar(50, 0, 100)).toBe(0.5);
      expect(normalizeScalar(5, 5, 5)).toBe(0.5);
      expect(normalizeScalar(-10, 0, 100)).toBe(0);
      expect(normalizeScalar(110, 0, 100)).toBe(1);
    });
  });

  describe('Z-Score', () => {
    it('均值为零', () => {
      const r = zScoreNormalize([1, 2, 3, 4, 5]);
      const mean = r.reduce((a, b) => a + b, 0) / r.length;
      expect(mean).toBeCloseTo(0);
    });
    it('全相同为零', () => {
      expect(zScoreNormalize([5, 5, 5]).every(v => v === 0)).toBe(true);
    });
    it('对称分布', () => {
      const r = zScoreNormalize([1, 2, 3, 4, 5]);
      expect(r[0]).toBeCloseTo(-r[4]);
    });
    it('标量 zScore 与序列首值一致', () => {
      // zScoreEngine.ts:6 与 futureValueUtils.ts:19 均为 (value-mean)/std，std<=0 返回 0；
      // 序列版额外按 :15 四舍五入到 4 位，因此用 toBeCloseTo 比较。
      expect(zScore(15, 10, 5)).toBe(1);
      expect(zScore(5, 5, 0)).toBe(0);
      expect(zScoreScalar(5, 5, 0)).toBe(0);
      const series = zScoreNormalize([1, 2, 3, 4, 5]);
      expect(zScore(1, 3, Math.sqrt(2))).toBeCloseTo(series[0], 3);
    });
  });

  describe('重采样', () => {
    it('降采样均值', () => {
      expect(downsample([1, 2, 3, 4], 2)).toEqual([1.5, 3.5]);
    });
    it('降采样最大', () => {
      expect(downsample([1, 5, 3, 2], 2, 'max')).toEqual([5, 3]);
    });
    it('降采样最小', () => {
      expect(downsample([1, 5, 3, 2], 2, 'min')).toEqual([1, 2]);
    });
    it('降采样求和', () => {
      expect(downsample([1, 2, 3, 4], 2, 'sum')).toEqual([3, 7]);
    });
    it('因子为1不变化', () => {
      expect(downsample([1, 2, 3], 1)).toEqual([1, 2, 3]);
    });
    it('不整除', () => {
      expect(downsample([1, 2, 3, 4, 5], 2).length).toBe(3);
    });
  });

  describe('滑动窗口', () => {
    it('基本窗口', () => {
      expect(pipeline([1, 2, 3, 4, 5]).window({ size: 3, slide: 1 }).toArray().length).toBe(3);
    });
    it('步长2', () => {
      expect(pipeline([1, 2, 3, 4, 5, 6]).window({ size: 3, slide: 2 }).toArray().length).toBe(2);
    });
    it('窗口等于数据', () => {
      expect(pipeline([1, 2, 3]).window({ size: 3, slide: 1 }).toArray().length).toBe(1);
    });
    it('窗口大于数据', () => {
      expect(pipeline([1, 2]).window({ size: 3, slide: 1 }).toArray().length).toBe(0);
    });
    it('步长等于窗口', () => {
      expect(pipeline([1, 2, 3, 4]).window({ size: 2, slide: 2 }).toArray().length).toBe(2);
    });
    it('内容正确', () => {
      expect(pipeline([1, 2, 3, 4]).window({ size: 2, slide: 1 }).toArray()).toEqual([[1, 2], [2, 3], [3, 4]]);
    });
  });

  describe('数据聚合', () => {
    it('分组', () => {
      const data = [{ cat: 'A', v: 1 }, { cat: 'B', v: 2 }, { cat: 'A', v: 3 }];
      const g = pipeline(data).groupBy(d => d.cat);
      expect(g.get('A')!.length).toBe(2);
      expect(g.get('B')!.length).toBe(1);
    });
    it('空数据', () => {
      expect(pipeline<{ cat: string }>([]).groupBy(d => d.cat).size).toBe(0);
    });
    it('透视表', () => {
      const data = [
        { r: 'a', c: 'x', v: 1 }, { r: 'a', c: 'y', v: 2 },
        { r: 'b', c: 'x', v: 3 }, { r: 'b', c: 'y', v: 4 },
      ];
      const p = pivot(data, d => d.r, d => d.c, d => d.v);
      expect(p['a']['x']).toBe(1);
      expect(p['b']['y']).toBe(4);
    });
    it('单组', () => {
      const g = pipeline([{ k: 'a', v: 1 }]).groupBy(d => d.k);
      expect(g.get('a')!.length).toBe(1);
    });
  });

  describe('数据校验', () => {
    it('有效数据', () => {
      expect(validateSchema({ name: 'test', age: 10 }, { name: { type: 'string', required: true }, age: { type: 'number' } }).length).toBe(0);
    });
    it('缺失必填', () => {
      expect(validateSchema({}, { name: { type: 'string', required: true } })).toContain('Missing: name');
    });
    it('类型不匹配', () => {
      expect(validateSchema({ age: 'ten' }, { age: { type: 'number' } })).toContain('Type mismatch: age');
    });
    it('可选字段', () => {
      expect(validateSchema({}, { extra: { type: 'string' } }).length).toBe(0);
    });
    it('多余字段不报错', () => {
      expect(validateSchema({ a: 1, b: 2 }, { a: { type: 'number' } }).length).toBe(0);
    });
  });
});
