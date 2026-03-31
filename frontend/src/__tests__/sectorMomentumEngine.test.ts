import { describe, it, expect } from 'vitest';
import { analyzeSectorMomentum, SectorData } from '../utils/sectorMomentumEngine';

describe('板块动量引擎', () => {
  const sectors: SectorData[] = [
    { name: '半导体', returns1d: 0.03, returns5d: 0.08, returns20d: 0.15, returns60d: 0.25, volume: 5000, avgVolume: 3000, fundFlow: 50, limitUpCount: 5, limitDownCount: 1, advanceDeclineRatio: 3.5, newHighCount: 10, newLowCount: 1 },
    { name: '银行', returns1d: 0.01, returns5d: 0.02, returns20d: 0.05, returns60d: 0.08, volume: 2000, avgVolume: 2500, fundFlow: 10, limitUpCount: 1, limitDownCount: 0, advanceDeclineRatio: 2.0, newHighCount: 5, newLowCount: 2 },
    { name: '消费', returns1d: -0.01, returns5d: -0.02, returns20d: 0.02, returns60d: 0.05, volume: 3000, avgVolume: 3000, fundFlow: -5, limitUpCount: 0, limitDownCount: 2, advanceDeclineRatio: 0.8, newHighCount: 3, newLowCount: 3 },
    { name: '地产', returns1d: -0.03, returns5d: -0.08, returns20d: -0.12, returns60d: -0.15, volume: 4000, avgVolume: 3500, fundFlow: -30, limitUpCount: 0, limitDownCount: 5, advanceDeclineRatio: 0.3, newHighCount: 1, newLowCount: 8 },
  ];

  it('应返回排名', () => {
    const r = analyzeSectorMomentum(sectors);
    expect(r.rankings.length).toBe(4);
  });

  it('应按动量排序', () => {
    const r = analyzeSectorMomentum(sectors);
    for (let i = 1; i < r.rankings.length; i++) {
      expect(r.rankings[i - 1].momentumScore).toBeGreaterThanOrEqual(r.rankings[i].momentumScore);
    }
  });

  it('应判断趋势', () => {
    const r = analyzeSectorMomentum(sectors);
    r.rankings.forEach(rank => {
      expect(['strong_up', 'up', 'sideways', 'down', 'strong_down']).toContain(rank.trend);
    });
  });

  it('应输出热门板块', () => {
    const r = analyzeSectorMomentum(sectors);
    expect(r.hotSectors.length).toBeGreaterThan(0);
  });

  it('应输出冷门板块', () => {
    const r = analyzeSectorMomentum(sectors);
    expect(r.coldSectors.length).toBeGreaterThan(0);
  });

  it('应判断轮动方向', () => {
    const r = analyzeSectorMomentum(sectors);
    expect(['rotate_to_growth', 'rotate_to_value', 'rotate_to_defensive', 'rotate_to_cyclical']).toContain(r.rotationDirection);
  });

  it('应判断市场广度', () => {
    const r = analyzeSectorMomentum(sectors);
    expect(['broad_advance', 'narrow_advance', 'broad_decline', 'narrow_decline']).toContain(r.marketBreadth);
  });

  it('应计算动量离散度', () => {
    const r = analyzeSectorMomentum(sectors);
    expect(r.momentumDispersion).toBeGreaterThan(0);
  });

  it('数据不足应抛出错误', () => {
    expect(() => analyzeSectorMomentum(sectors.slice(0, 1))).toThrow();
  });

  it('应检测成交量确认', () => {
    const r = analyzeSectorMomentum(sectors);
    const semiconductor = r.rankings.find(rank => rank.sector === '半导体');
    expect(semiconductor?.volumeConfirmation).toBe(true);
  });
});
