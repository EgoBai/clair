import { describe, it, expect } from 'vitest';
import { buildVolumeProfile, VolumeBar } from '../utils/volumeProfileEngine';

describe('成交量分布引擎', () => {
  const bars: VolumeBar[] = Array.from({ length: 100 }, (_, i) => ({
    price: 10 + Math.random() * 2,
    volume: Math.floor(100 + Math.random() * 900),
    buyVolume: Math.floor(50 + Math.random() * 400),
    sellVolume: Math.floor(50 + Math.random() * 400),
    timestamp: 1710000000000 + i * 60000,
  }));

  it('应该计算POC', () => {
    const result = buildVolumeProfile(bars);
    expect(result.poc).toBeGreaterThan(0);
  });

  it('应该计算VAH/VAL', () => {
    const result = buildVolumeProfile(bars);
    expect(result.vah).toBeGreaterThan(result.val);
  });

  it('POC应在VAH和VAL之间', () => {
    const result = buildVolumeProfile(bars);
    expect(result.poc).toBeLessThanOrEqual(result.vah);
    expect(result.poc).toBeGreaterThanOrEqual(result.val);
  });

  it('应该识别高成交量节点', () => {
    const result = buildVolumeProfile(bars);
    expect(Array.isArray(result.highNodes)).toBe(true);
  });

  it('应该识别低成交量节点', () => {
    const result = buildVolumeProfile(bars);
    expect(Array.isArray(result.lowNodes)).toBe(true);
  });

  it('应该检测成交量缺口', () => {
    const result = buildVolumeProfile(bars);
    expect(Array.isArray(result.volumeGaps)).toBe(true);
  });

  it('应该计算价值区域成交量', () => {
    const result = buildVolumeProfile(bars);
    expect(result.valueAreaVolume).toBeGreaterThan(0);
    expect(result.valueAreaVolume).toBeLessThanOrEqual(result.totalVolume);
  });

  it('应该判断成交量分布类型', () => {
    const result = buildVolumeProfile(bars);
    expect(['normal', 'bimodal', 'uniform', 'skewed']).toContain(result.volumeDistribution);
  });

  it('应该检测控制权转移', () => {
    const result = buildVolumeProfile(bars);
    expect(result.controlShift === null || typeof result.controlShift === 'object').toBe(true);
  });

  it('空数据应抛出错误', () => {
    expect(() => buildVolumeProfile([])).toThrow();
  });

  it('应该计算总成交量', () => {
    const result = buildVolumeProfile(bars);
    const expected = bars.reduce((s, b) => s + b.volume, 0);
    expect(result.totalVolume).toBe(expected);
  });

  it('自定义价格步长应工作', () => {
    const result = buildVolumeProfile(bars, 0.1);
    expect(result.poc).toBeGreaterThan(0);
  });
});
