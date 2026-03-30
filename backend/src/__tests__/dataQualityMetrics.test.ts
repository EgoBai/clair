import { describe, it, expect } from 'vitest';

describe('数据质量指标系统', () => {
  interface DataRecord { [key: string]: any; }

  function checkCompleteness(record: DataRecord, requiredFields: string[]): { score: number; missing: string[] } {
    const missing = requiredFields.filter(f => record[f] === undefined || record[f] === null);
    return { score: (requiredFields.length - missing.length) / requiredFields.length * 100, missing };
  }
  function checkAccuracy(value: any, type: 'number' | 'string' | 'date'): boolean {
    if (value === null || value === undefined) return false;
    switch (type) {
      case 'number': return typeof value === 'number' && Number.isFinite(value);
      case 'string': return typeof value === 'string' && value.length > 0;
      case 'date': return !isNaN(Date.parse(value));
    }
  }
  function checkConsistency(records: DataRecord[], field: string): boolean {
    const types = new Set(records.map(r => typeof r[field]));
    return types.size <= 1;
  }
  function checkTimeliness(timestamp: number, maxAgeMs: number): boolean {
    return Date.now() - timestamp <= maxAgeMs;
  }
  function detectDuplicates(records: DataRecord[], key: string): number[] {
    const seen = new Map<any, number>();
    const dupes: number[] = [];
    records.forEach((r, i) => {
      const v = r[key];
      if (seen.has(v)) dupes.push(i);
      else seen.set(v, i);
    });
    return dupes;
  }
  function calcQualityScore(scores: { completeness: number; accuracy: number; consistency: number; timeliness: number }): number {
    return scores.completeness * 0.3 + scores.accuracy * 0.3 + scores.consistency * 0.2 + scores.timeliness * 0.2;
  }
  function validateRange(value: number, min: number, max: number): boolean {
    return value >= min && value <= max;
  }
  function detectOutliers(values: number[], threshold = 2): number[] {
    const mean = values.reduce((a, b) => a + b, 0) / values.length;
    const std = Math.sqrt(values.reduce((s, v) => s + (v - mean) ** 2, 0) / values.length);
    if (std === 0) return [];
    return values.map((v, i) => Math.abs(v - mean) / std > threshold ? i : -1).filter(i => i >= 0);
  }

  it('完整性检查 - 全部存在', () => {
    const r = checkCompleteness({ a: 1, b: 2, c: 3 }, ['a', 'b', 'c']);
    expect(r.score).toBe(100);
    expect(r.missing).toHaveLength(0);
  });

  it('完整性检查 - 部分缺失', () => {
    const r = checkCompleteness({ a: 1, b: null }, ['a', 'b', 'c']);
    expect(r.score).toBeCloseTo(33.3, 1);
    expect(r.missing).toHaveLength(2);
  });

  it('完整性检查 - 全部缺失', () => {
    const r = checkCompleteness({}, ['a', 'b']);
    expect(r.score).toBe(0);
  });

  it('准确性 - 数字', () => {
    expect(checkAccuracy(42, 'number')).toBe(true);
    expect(checkAccuracy(NaN, 'number')).toBe(false);
    expect(checkAccuracy('42', 'number')).toBe(false);
  });

  it('准确性 - 字符串', () => {
    expect(checkAccuracy('hello', 'string')).toBe(true);
    expect(checkAccuracy('', 'string')).toBe(false);
  });

  it('准确性 - 日期', () => {
    expect(checkAccuracy('2024-01-01', 'date')).toBe(true);
    expect(checkAccuracy('invalid', 'date')).toBe(false);
  });

  it('准确性 - null', () => {
    expect(checkAccuracy(null, 'number')).toBe(false);
  });

  it('一致性检查', () => {
    expect(checkConsistency([{ v: 1 }, { v: 2 }], 'v')).toBe(true);
    expect(checkConsistency([{ v: 1 }, { v: 'a' }], 'v')).toBe(false);
  });

  it('时效性检查', () => {
    expect(checkTimeliness(Date.now(), 60000)).toBe(true);
    expect(checkTimeliness(Date.now() - 120000, 60000)).toBe(false);
  });

  it('重复检测', () => {
    const records = [{ id: 1 }, { id: 2 }, { id: 1 }, { id: 3 }, { id: 2 }];
    const dupes = detectDuplicates(records, 'id');
    expect(dupes).toEqual([2, 4]);
  });

  it('无重复', () => {
    expect(detectDuplicates([{ id: 1 }, { id: 2 }], 'id')).toHaveLength(0);
  });

  it('综合质量评分', () => {
    const score = calcQualityScore({ completeness: 100, accuracy: 90, consistency: 80, timeliness: 70 });
    expect(score).toBeCloseTo(87, 0); // 100*0.3 + 90*0.3 + 80*0.2 + 70*0.2 = 87
  });

  it('质量评分权重', () => {
    const score = calcQualityScore({ completeness: 0, accuracy: 0, consistency: 0, timeliness: 0 });
    expect(score).toBe(0);
  });

  it('范围验证', () => {
    expect(validateRange(50, 0, 100)).toBe(true);
    expect(validateRange(-1, 0, 100)).toBe(false);
    expect(validateRange(101, 0, 100)).toBe(false);
  });

  it('异常值检测', () => {
    const values = [1, 1, 1, 1, 100, 1, 1];
    const outliers = detectOutliers(values, 2);
    expect(outliers).toContain(4);
  });

  it('无异常值', () => {
    const values = [10, 11, 12, 13, 14];
    expect(detectOutliers(values, 2)).toHaveLength(0);
  });

  it('恒定值无异常', () => {
    expect(detectOutliers([5, 5, 5, 5])).toEqual([]);
  });

  it('空数组异常值', () => {
    expect(detectOutliers([])).toEqual([]);
  });
});
