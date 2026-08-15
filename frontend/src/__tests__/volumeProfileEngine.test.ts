import { describe, it, expect } from 'vitest';
import { buildVolumeProfile, type VolumeBar } from '../utils/volumeProfileEngine';

/**
 * 成交量分布引擎测试 (导入真实模块)
 */

function bar(price: number, volume: number, buy: number, sell: number, ts: number): VolumeBar {
  return { price, volume, buyVolume: buy, sellVolume: sell, timestamp: ts };
}

describe('buildVolumeProfile', () => {
  const sampleBars: VolumeBar[] = [
    bar(100, 10000, 6000, 4000, 1),
    bar(101, 15000, 9000, 6000, 2),
    bar(102, 20000, 12000, 8000, 3),
    bar(103, 8000, 3000, 5000, 4),
    bar(104, 5000, 2000, 3000, 5),
  ];

  it('应计算 POC / VAH / VAL 与总成交量', () => {
    const r = buildVolumeProfile(sampleBars);
    expect(r.totalVolume).toBe(58000);
    expect(r.poc).toBe(102); // 量最大
    expect(r.vah).toBeGreaterThanOrEqual(r.val);
    expect(r.valueAreaVolume).toBe(45000);
  });

  it('空数据应抛出异常', () => {
    expect(() => buildVolumeProfile([])).toThrow();
  });

  it('应识别高/低成交量节点', () => {
    const spike: VolumeBar[] = [
      bar(100, 1000, 600, 400, 1),
      bar(101, 50000, 30000, 20000, 2),
      bar(102, 1000, 600, 400, 3),
    ];
    const r = buildVolumeProfile(spike);
    expect(r.highNodes).toHaveLength(1);
    expect(r.highNodes[0].price).toBe(101);
    expect(r.lowNodes).toHaveLength(2);
  });

  it('应检测控制权转移', () => {
    const bars: VolumeBar[] = [
      ...Array.from({ length: 10 }, (_, i) => bar(100, 10000, 6000, 4000, i)),
      ...Array.from({ length: 10 }, (_, i) => bar(120, 10000, 4000, 6000, i + 10)),
    ];
    const r = buildVolumeProfile(bars);
    expect(r.controlShift).not.toBeNull();
    expect(r.controlShift!.to).toBe(120);
    expect(r.controlShift!.from).toBe(100);
  });

  it('应检测成交量缺口(低量节点)', () => {
    const bars: VolumeBar[] = [
      bar(100, 10000, 6000, 4000, 1),
      bar(101, 10000, 6000, 4000, 2),
      bar(102, 100, 60, 40, 3),
      bar(103, 10000, 6000, 4000, 4),
      bar(104, 10000, 6000, 4000, 5),
    ];
    const r = buildVolumeProfile(bars);
    expect(Array.isArray(r.volumeGaps)).toBe(true);
    expect(r.volumeGaps.length).toBeGreaterThanOrEqual(1);
  });

  it('应给出分布类型', () => {
    const r = buildVolumeProfile(sampleBars);
    expect(['normal', 'bimodal', 'uniform', 'skewed']).toContain(r.volumeDistribution);
  });
});
