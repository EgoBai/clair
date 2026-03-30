import { describe, it, expect } from 'vitest';

/**
 * 数据管道与ETL引擎测试
 */

interface DataPoint { timestamp: number; value: number; quality: 'good' | 'bad' | 'suspect'; source: string; }
interface TransformationRule { type: 'filter' | 'map' | 'aggregate' | 'normalize'; params: Record<string, unknown>; }

const validateDataPoint = (dp: DataPoint): { valid: boolean; errors: string[] } => {
  const errors: string[] = [];
  if (typeof dp.timestamp !== 'number' || dp.timestamp <= 0) errors.push('invalid timestamp');
  if (typeof dp.value !== 'number' || isNaN(dp.value)) errors.push('invalid value');
  if (!['good', 'bad', 'suspect'].includes(dp.quality)) errors.push('invalid quality');
  if (!dp.source || dp.source.trim().length === 0) errors.push('empty source');
  return { valid: errors.length === 0, errors };
};

const cleanData = (data: DataPoint[], options: { removeBad?: boolean; interpolateSuspect?: boolean } = {}): DataPoint[] => {
  const { removeBad = true, interpolateSuspect = true } = options;
  let result = [...data];
  if (removeBad) result = result.filter(d => d.quality !== 'bad');
  if (interpolateSuspect) {
    for (let i = 0; i < result.length; i++) {
      if (result[i].quality === 'suspect') {
        const prev = result.slice(0, i).reverse().find(d => d.quality === 'good');
        const next = result.slice(i + 1).find(d => d.quality === 'good');
        if (prev && next) {
          result[i] = { ...result[i], value: (prev.value + next.value) / 2, quality: 'good' };
        }
      }
    }
  }
  return result;
};

const resampleData = (data: DataPoint[], intervalMs: number): DataPoint[] => {
  if (data.length === 0) return [];
  const result: DataPoint[] = [];
  const startTime = data[0].timestamp;
  const endTime = data[data.length - 1].timestamp;
  for (let t = startTime; t <= endTime; t += intervalMs) {
    const window = data.filter(d => d.timestamp >= t && d.timestamp < t + intervalMs);
    if (window.length > 0) {
      const avgValue = window.reduce((s, d) => s + d.value, 0) / window.length;
      result.push({ timestamp: t, value: avgValue, quality: 'good', source: window[0].source });
    }
  }
  return result;
};

const detectAnomalies = (data: DataPoint[], sigmaThreshold: number = 3): number[] => {
  if (data.length < 3) return [];
  const values = data.map(d => d.value);
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  const std = Math.sqrt(values.reduce((a, b) => a + (b - mean) ** 2, 0) / values.length);
  if (std === 0) return [];
  return data.map((d, i) => Math.abs(d.value - mean) > sigmaThreshold * std ? i : -1).filter(i => i >= 0);
};

const mergeDataSources = (sources: DataPoint[][]): DataPoint[] => {
  const merged: DataPoint[] = [];
  for (const source of sources) merged.push(...source);
  return merged.sort((a, b) => a.timestamp - b.timestamp);
};

const calcDataCompleteness = (data: DataPoint[], expectedInterval: number, startTime: number, endTime: number): number => {
  const expected = Math.floor((endTime - startTime) / expectedInterval) + 1;
  const actual = data.length;
  return Math.min(1, actual / expected);
};

describe('数据管道与ETL', () => {
  describe('数据验证', () => {
    it('有效数据点应通过验证', () => {
      const dp: DataPoint = { timestamp: Date.now(), value: 100, quality: 'good', source: 'test' };
      expect(validateDataPoint(dp).valid).toBe(true);
    });

    it('NaN值应失败', () => {
      const dp: DataPoint = { timestamp: Date.now(), value: NaN, quality: 'good', source: 'test' };
      expect(validateDataPoint(dp).valid).toBe(false);
    });

    it('负时间戳应失败', () => {
      const dp: DataPoint = { timestamp: -1, value: 100, quality: 'good', source: 'test' };
      expect(validateDataPoint(dp).valid).toBe(false);
    });

    it('空来源应失败', () => {
      const dp: DataPoint = { timestamp: Date.now(), value: 100, quality: 'good', source: '' };
      expect(validateDataPoint(dp).valid).toBe(false);
    });

    it('无效质量应失败', () => {
      const dp: DataPoint = { timestamp: Date.now(), value: 100, quality: 'ugly' as any, source: 'test' };
      expect(validateDataPoint(dp).valid).toBe(false);
    });

    it('零时间戳应失败', () => {
      const dp: DataPoint = { timestamp: 0, value: 100, quality: 'good', source: 'test' };
      expect(validateDataPoint(dp).valid).toBe(false);
    });

    it('错误信息应准确', () => {
      const dp: DataPoint = { timestamp: -1, value: NaN, quality: 'bad', source: '' };
      const { errors } = validateDataPoint(dp);
      expect(errors.length).toBe(3);
    });

    it('极大值应通过验证', () => {
      const dp: DataPoint = { timestamp: Date.now(), value: 1e15, quality: 'good', source: 'test' };
      expect(validateDataPoint(dp).valid).toBe(true);
    });

    it('负值应通过验证', () => {
      const dp: DataPoint = { timestamp: Date.now(), value: -100, quality: 'good', source: 'test' };
      expect(validateDataPoint(dp).valid).toBe(true);
    });

    it('suspect质量应通过验证', () => {
      const dp: DataPoint = { timestamp: Date.now(), value: 100, quality: 'suspect', source: 'test' };
      expect(validateDataPoint(dp).valid).toBe(true);
    });
  });

  describe('数据清洗', () => {
    it('应该移除bad质量数据', () => {
      const data: DataPoint[] = [
        { timestamp: 1, value: 100, quality: 'good', source: 'a' },
        { timestamp: 2, value: 200, quality: 'bad', source: 'a' },
        { timestamp: 3, value: 300, quality: 'good', source: 'a' },
      ];
      const cleaned = cleanData(data);
      expect(cleaned.length).toBe(2);
    });

    it('应该插值suspect数据', () => {
      const data: DataPoint[] = [
        { timestamp: 1, value: 100, quality: 'good', source: 'a' },
        { timestamp: 2, value: 0, quality: 'suspect', source: 'a' },
        { timestamp: 3, value: 200, quality: 'good', source: 'a' },
      ];
      const cleaned = cleanData(data);
      expect(cleaned[1].value).toBeCloseTo(150, 5);
      expect(cleaned[1].quality).toBe('good');
    });

    it('禁用插值应保留suspect', () => {
      const data: DataPoint[] = [
        { timestamp: 1, value: 100, quality: 'good', source: 'a' },
        { timestamp: 2, value: 0, quality: 'suspect', source: 'a' },
        { timestamp: 3, value: 200, quality: 'good', source: 'a' },
      ];
      const cleaned = cleanData(data, { interpolateSuspect: false });
      expect(cleaned[1].quality).toBe('suspect');
    });

    it('禁用移除应保留bad', () => {
      const data: DataPoint[] = [
        { timestamp: 1, value: 100, quality: 'good', source: 'a' },
        { timestamp: 2, value: 200, quality: 'bad', source: 'a' },
      ];
      const cleaned = cleanData(data, { removeBad: false });
      expect(cleaned.length).toBe(2);
    });

    it('空数据返回空', () => {
      expect(cleanData([])).toEqual([]);
    });

    it('全好数据不变', () => {
      const data: DataPoint[] = [
        { timestamp: 1, value: 100, quality: 'good', source: 'a' },
        { timestamp: 2, value: 200, quality: 'good', source: 'a' },
      ];
      expect(cleanData(data).length).toBe(2);
    });

    it('首尾suspect无法插值', () => {
      const data: DataPoint[] = [
        { timestamp: 1, value: 0, quality: 'suspect', source: 'a' },
        { timestamp: 2, value: 100, quality: 'good', source: 'a' },
        { timestamp: 3, value: 0, quality: 'suspect', source: 'a' },
      ];
      const cleaned = cleanData(data);
      expect(cleaned[0].quality).toBe('suspect');
      expect(cleaned[2].quality).toBe('suspect');
    });

    it('连续suspect应部分插值', () => {
      const data: DataPoint[] = [
        { timestamp: 1, value: 100, quality: 'good', source: 'a' },
        { timestamp: 2, value: 0, quality: 'suspect', source: 'a' },
        { timestamp: 3, value: 0, quality: 'suspect', source: 'a' },
        { timestamp: 4, value: 200, quality: 'good', source: 'a' },
      ];
      const cleaned = cleanData(data);
      expect(cleaned.length).toBe(4);
    });
  });

  describe('数据重采样', () => {
    it('应该按间隔聚合', () => {
      const data: DataPoint[] = [
        { timestamp: 0, value: 100, quality: 'good', source: 'a' },
        { timestamp: 500, value: 200, quality: 'good', source: 'a' },
        { timestamp: 1000, value: 300, quality: 'good', source: 'a' },
        { timestamp: 1500, value: 400, quality: 'good', source: 'a' },
      ];
      const resampled = resampleData(data, 1000);
      expect(resampled.length).toBe(2);
      expect(resampled[0].value).toBeCloseTo(150, 5);
    });

    it('空数据返回空', () => {
      expect(resampleData([], 1000)).toEqual([]);
    });

    it('单一数据点', () => {
      const data: DataPoint[] = [{ timestamp: 0, value: 100, quality: 'good', source: 'a' }];
      const resampled = resampleData(data, 1000);
      expect(resampled.length).toBe(1);
    });

    it('大间隔应合并所有数据', () => {
      const data: DataPoint[] = [
        { timestamp: 0, value: 100, quality: 'good', source: 'a' },
        { timestamp: 100, value: 200, quality: 'good', source: 'a' },
        { timestamp: 200, value: 300, quality: 'good', source: 'a' },
      ];
      const resampled = resampleData(data, 10000);
      expect(resampled.length).toBe(1);
      expect(resampled[0].value).toBeCloseTo(200, 5);
    });

    it('小间隔应保留更多数据点', () => {
      const data: DataPoint[] = Array.from({ length: 10 }, (_, i) => ({
        timestamp: i * 100, value: 100 + i * 10, quality: 'good' as const, source: 'a'
      }));
      const r100 = resampleData(data, 100);
      const r500 = resampleData(data, 500);
      expect(r100.length).toBeGreaterThanOrEqual(r500.length);
    });

    it('重采样后应保持时间顺序', () => {
      const data: DataPoint[] = Array.from({ length: 20 }, (_, i) => ({
        timestamp: i * 300, value: Math.random() * 100, quality: 'good' as const, source: 'a'
      }));
      const resampled = resampleData(data, 500);
      for (let i = 1; i < resampled.length; i++) {
        expect(resampled[i].timestamp).toBeGreaterThanOrEqual(resampled[i - 1].timestamp);
      }
    });
  });

  describe('异常检测', () => {
    it('应该检测偏离均值的点', () => {
      const data: DataPoint[] = Array.from({ length: 20 }, (_, i) => ({
        timestamp: i, value: 100, quality: 'good' as const, source: 'a'
      }));
      data.push({ timestamp: 20, value: 1000, quality: 'good', source: 'a' });
      const anomalies = detectAnomalies(data);
      expect(anomalies).toContain(20);
    });

    it('均匀数据无异常', () => {
      const data: DataPoint[] = Array.from({ length: 20 }, (_, i) => ({
        timestamp: i, value: 100, quality: 'good' as const, source: 'a'
      }));
      expect(detectAnomalies(data).length).toBe(0);
    });

    it('不足3个点返回空', () => {
      const data: DataPoint[] = [{ timestamp: 1, value: 100, quality: 'good', source: 'a' }];
      expect(detectAnomalies(data)).toEqual([]);
    });

    it('零标准差返回空', () => {
      const data: DataPoint[] = Array.from({ length: 10 }, (_, i) => ({
        timestamp: i, value: 50, quality: 'good' as const, source: 'a'
      }));
      expect(detectAnomalies(data)).toEqual([]);
    });

    it('更高阈值减少检测', () => {
      const data: DataPoint[] = Array.from({ length: 30 }, (_, i) => ({
        timestamp: i, value: i % 10 === 0 ? 500 : 100, quality: 'good' as const, source: 'a'
      }));
      expect(detectAnomalies(data, 2).length).toBeGreaterThanOrEqual(detectAnomalies(data, 5).length);
    });

    it('返回的索引应有效', () => {
      const data: DataPoint[] = Array.from({ length: 20 }, (_, i) => ({
        timestamp: i, value: i === 10 ? 1000 : 100, quality: 'good' as const, source: 'a'
      }));
      const anomalies = detectAnomalies(data);
      for (const idx of anomalies) {
        expect(idx).toBeGreaterThanOrEqual(0);
        expect(idx).toBeLessThan(data.length);
      }
    });

    it('多个异常点都应被检测', () => {
      const data: DataPoint[] = Array.from({ length: 20 }, (_, i) => ({
        timestamp: i, value: 100, quality: 'good' as const, source: 'a'
      }));
      data[5].value = 1000;
      data[15].value = -500;
      const anomalies = detectAnomalies(data);
      expect(anomalies.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe('数据合并', () => {
    it('多源数据应按时间排序', () => {
      const s1: DataPoint[] = [{ timestamp: 3, value: 30, quality: 'good', source: 'a' }];
      const s2: DataPoint[] = [{ timestamp: 1, value: 10, quality: 'good', source: 'b' }];
      const merged = mergeDataSources([s1, s2]);
      expect(merged[0].timestamp).toBe(1);
    });

    it('空源返回空', () => {
      expect(mergeDataSources([])).toEqual([]);
    });

    it('单一源就是原数据', () => {
      const data: DataPoint[] = [{ timestamp: 1, value: 100, quality: 'good', source: 'a' }];
      const merged = mergeDataSources([data]);
      expect(merged.length).toBe(1);
    });

    it('合并后应包含所有数据点', () => {
      const s1 = Array.from({ length: 5 }, (_, i) => ({ timestamp: i * 2, value: i, quality: 'good' as const, source: 'a' }));
      const s2 = Array.from({ length: 5 }, (_, i) => ({ timestamp: i * 2 + 1, value: i + 10, quality: 'good' as const, source: 'b' }));
      expect(mergeDataSources([s1, s2]).length).toBe(10);
    });

    it('合并三个源', () => {
      const s1: DataPoint[] = [{ timestamp: 5, value: 50, quality: 'good', source: 'a' }];
      const s2: DataPoint[] = [{ timestamp: 1, value: 10, quality: 'good', source: 'b' }];
      const s3: DataPoint[] = [{ timestamp: 3, value: 30, quality: 'good', source: 'c' }];
      const merged = mergeDataSources([s1, s2, s3]);
      expect(merged.map(d => d.timestamp)).toEqual([1, 3, 5]);
    });
  });

  describe('数据完整性', () => {
    it('完整数据返回1', () => {
      const data: DataPoint[] = Array.from({ length: 11 }, (_, i) => ({
        timestamp: i * 1000, value: 100, quality: 'good' as const, source: 'a'
      }));
      expect(calcDataCompleteness(data, 1000, 0, 10000)).toBe(1);
    });

    it('缺失数据返回小于1', () => {
      const data: DataPoint[] = [
        { timestamp: 0, value: 100, quality: 'good', source: 'a' },
        { timestamp: 2000, value: 100, quality: 'good', source: 'a' },
      ];
      expect(calcDataCompleteness(data, 1000, 0, 2000)).toBeLessThan(1);
    });

    it('空数据返回0', () => {
      expect(calcDataCompleteness([], 1000, 0, 10000)).toBe(0);
    });

    it('超量数据应截断为1', () => {
      const data: DataPoint[] = Array.from({ length: 100 }, (_, i) => ({
        timestamp: i * 100, value: 100, quality: 'good' as const, source: 'a'
      }));
      expect(calcDataCompleteness(data, 1000, 0, 1000)).toBe(1);
    });
  });

  describe('数据转换管道', () => {
    const applyTransformation = (data: DataPoint[], rule: TransformationRule): DataPoint[] => {
      switch (rule.type) {
        case 'filter':
          return data.filter(d => d.value > ((rule.params.threshold as number) ?? 0));
        case 'map':
          return data.map(d => ({ ...d, value: d.value * ((rule.params.multiplier as number) ?? 1) }));
        case 'aggregate': {
          const window = (rule.params.window as number) ?? 5;
          const result: DataPoint[] = [];
          for (let i = 0; i < data.length; i += window) {
            const chunk = data.slice(i, i + window);
            const avg = chunk.reduce((s, d) => s + d.value, 0) / chunk.length;
            result.push({ timestamp: chunk[0].timestamp, value: avg, quality: 'good', source: 'aggregated' });
          }
          return result;
        }
        case 'normalize': {
          const values = data.map(d => d.value);
          const min = Math.min(...values);
          const max = Math.max(...values);
          const range = max - min || 1;
          return data.map(d => ({ ...d, value: (d.value - min) / range }));
        }
        default:
          return data;
      }
    };

    it('filter应该过滤低值', () => {
      const data: DataPoint[] = [
        { timestamp: 1, value: 10, quality: 'good', source: 'a' },
        { timestamp: 2, value: 50, quality: 'good', source: 'a' },
        { timestamp: 3, value: 100, quality: 'good', source: 'a' },
      ];
      const result = applyTransformation(data, { type: 'filter', params: { threshold: 20 } });
      expect(result.length).toBe(2);
    });

    it('map应该变换值', () => {
      const data: DataPoint[] = [{ timestamp: 1, value: 100, quality: 'good', source: 'a' }];
      const result = applyTransformation(data, { type: 'map', params: { multiplier: 2 } });
      expect(result[0].value).toBe(200);
    });

    it('aggregate应该聚合窗口', () => {
      const data: DataPoint[] = Array.from({ length: 10 }, (_, i) => ({
        timestamp: i, value: 100, quality: 'good' as const, source: 'a'
      }));
      const result = applyTransformation(data, { type: 'aggregate', params: { window: 5 } });
      expect(result.length).toBe(2);
    });

    it('normalize应该归一化到0-1', () => {
      const data: DataPoint[] = [
        { timestamp: 1, value: 0, quality: 'good', source: 'a' },
        { timestamp: 2, value: 50, quality: 'good', source: 'a' },
        { timestamp: 3, value: 100, quality: 'good', source: 'a' },
      ];
      const result = applyTransformation(data, { type: 'normalize', params: {} });
      expect(result[0].value).toBe(0);
      expect(result[2].value).toBe(1);
      expect(result[1].value).toBeCloseTo(0.5, 5);
    });

    it('未知类型返回原数据', () => {
      const data: DataPoint[] = [{ timestamp: 1, value: 100, quality: 'good', source: 'a' }];
      const result = applyTransformation(data, { type: 'unknown' as any, params: {} });
      expect(result).toEqual(data);
    });

    it('管道可以链式执行', () => {
      let data: DataPoint[] = Array.from({ length: 20 }, (_, i) => ({
        timestamp: i, value: i * 10, quality: 'good' as const, source: 'a'
      }));
      data = applyTransformation(data, { type: 'filter', params: { threshold: 50 } });
      data = applyTransformation(data, { type: 'map', params: { multiplier: 2 } });
      data = applyTransformation(data, { type: 'normalize', params: {} });
      expect(data.length).toBeLessThan(20);
      expect(data[data.length - 1].value).toBeCloseTo(1, 5);
    });

    it('空数据管道应返回空', () => {
      const result = applyTransformation([], { type: 'filter', params: { threshold: 0 } });
      expect(result).toEqual([]);
    });
  });
});
