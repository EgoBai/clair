import { describe, it, expect } from 'vitest';
import { normalizeDataSource, buildDataAvailabilityClause } from '../utils/aiDataAvailability';

describe('normalizeDataSource', () => {
  it('识别真实数据', () => {
    expect(normalizeDataSource('real')).toBe('real');
    expect(normalizeDataSource('LIVE')).toBe('real');
  });

  it('识别不可用与占位数据', () => {
    expect(normalizeDataSource('unavailable')).toBe('unavailable');
    expect(normalizeDataSource('mock')).toBe('unavailable');
  });

  it('识别部分可用', () => {
    expect(normalizeDataSource('partial')).toBe('partial');
  });

  it('未声明一律 unknown', () => {
    expect(normalizeDataSource(null)).toBe('unknown');
    expect(normalizeDataSource(undefined)).toBe('unknown');
    expect(normalizeDataSource('')).toBe('unknown');
    expect(normalizeDataSource(123)).toBe('unknown');
  });
});

describe('buildDataAvailabilityClause', () => {
  it('real 不注入边界声明', () => {
    expect(buildDataAvailabilityClause('real')).toBe('');
  });

  it('unavailable 必须要求承认无法判断', () => {
    const clause = buildDataAvailabilityClause('unavailable');
    expect(clause).toContain('无法基于本页数据判断');
    expect(clause).toContain('禁止');
  });

  it('partial 要求说明缺失，禁止补零', () => {
    const clause = buildDataAvailabilityClause('partial');
    expect(clause).toContain('部分');
    expect(clause).toContain('禁止推测或补零');
  });

  it('unknown 要求先确认来源', () => {
    const clause = buildDataAvailabilityClause(undefined);
    expect(clause).toContain('未声明数据来源');
  });
});
