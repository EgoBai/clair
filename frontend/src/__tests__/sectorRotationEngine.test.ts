import { describe, it, expect, beforeEach } from 'vitest';
import { SectorRotationEngine } from '../utils/sectorRotationEngine';
import type { SectorData } from '../utils/sectorRotationEngine';

describe('SectorRotationEngine', () => {
  let engine: SectorRotationEngine;

  const createSector = (overrides: Partial<SectorData> = {}): SectorData => ({
    name: '半导体',
    code: 'BK0536',
    change: 2.5,
    volume: 5000000,
    turnover: 800000,
    advancers: 35,
    decliners: 10,
    netInflow: 50000,
    avgPE: 45,
    timestamp: Date.now(),
    ...overrides,
  });

  beforeEach(() => {
    engine = new SectorRotationEngine();
  });

  describe('数据更新', () => {
    it('应该更新单个板块数据', () => {
      const sector = createSector();
      engine.updateData(sector);
      const rs = engine.calculateRelativeStrength('BK0536');
      expect(rs).toBeGreaterThanOrEqual(0);
      expect(rs).toBeLessThanOrEqual(100);
    });

    it('应该批量更新板块数据', () => {
      const sectors = [
        createSector({ code: 'BK0536', name: '半导体' }),
        createSector({ code: 'BK0437', name: '新能源' }),
      ];
      engine.batchUpdate(sectors);
      expect(engine.calculateRelativeStrength('BK0536')).toBeGreaterThanOrEqual(0);
      expect(engine.calculateRelativeStrength('BK0437')).toBeGreaterThanOrEqual(0);
    });

    it('应该限制历史数据长度', () => {
      for (let i = 0; i < 50; i++) {
        engine.updateData(createSector({ change: i, timestamp: Date.now() + i }));
      }
      // 不应抛出错误
      const rs = engine.calculateRelativeStrength('BK0536', 10);
      expect(typeof rs).toBe('number');
    });
  });

  describe('相对强度', () => {
    it('应该计算RS指标', () => {
      for (let i = 0; i < 10; i++) {
        engine.updateData(createSector({ change: Math.random() * 4 - 1 }));
      }
      const rs = engine.calculateRelativeStrength('BK0536', 5);
      expect(rs).toBeGreaterThanOrEqual(0);
      expect(rs).toBeLessThanOrEqual(100);
    });

    it('数据不足时应返回50', () => {
      engine.updateData(createSector());
      const rs = engine.calculateRelativeStrength('BK0536', 5);
      expect(rs).toBe(50);
    });

    it('不存在的板块应返回50', () => {
      const rs = engine.calculateRelativeStrength('NOTEXIST', 5);
      expect(rs).toBe(50);
    });
  });

  describe('动量计算', () => {
    it('应该计算正向动量', () => {
      for (let i = 0; i < 5; i++) {
        engine.updateData(createSector({ change: 3, netInflow: 30000 }));
      }
      const momentum = engine.calculateMomentum('BK0536');
      expect(momentum).toBeGreaterThan(0);
    });

    it('应该计算负向动量', () => {
      for (let i = 0; i < 5; i++) {
        engine.updateData(createSector({ change: -3, netInflow: -30000 }));
      }
      const momentum = engine.calculateMomentum('BK0536');
      expect(momentum).toBeLessThan(0);
    });
  });

  describe('轮动信号', () => {
    it('应该检测流入信号', () => {
      for (let i = 0; i < 10; i++) {
        engine.updateData(createSector({ change: 4, netInflow: 80000 }));
      }
      const signal = engine.detectRotation('BK0536');
      expect(signal.type).toBe('rotate_in');
      expect(signal.score).toBeGreaterThan(0);
      expect(signal.reason).toBeTruthy();
    });

    it('应该检测流出信号', () => {
      for (let i = 0; i < 10; i++) {
        engine.updateData(createSector({ change: -4, netInflow: -80000 }));
      }
      const signal = engine.detectRotation('BK0536');
      expect(signal.type).toBe('rotate_out');
    });

    it('数据不足时返回watch', () => {
      engine.updateData(createSector());
      const signal = engine.detectRotation('BK0536');
      expect(signal.type).toBe('watch');
      expect(signal.confidence).toBe(0);
    });

    it('应该包含持续天数', () => {
      for (let i = 0; i < 5; i++) {
        engine.updateData(createSector({ change: 2 }));
      }
      const signal = engine.detectRotation('BK0536');
      expect(signal.duration).toBe(5);
    });
  });

  describe('热度图', () => {
    it('应该生成板块热度排名', () => {
      engine.updateData(createSector({ code: 'BK0536', name: '半导体', change: 2 }));
      engine.updateData(createSector({ code: 'BK0536', name: '半导体', change: 3, netInflow: 50000 }));
      engine.updateData(createSector({ code: 'BK0437', name: '新能源', change: 1 }));
      engine.updateData(createSector({ code: 'BK0437', name: '新能源', change: -1, netInflow: -20000 }));

      const heatmap = engine.generateHeatmap();
      expect(heatmap.length).toBeGreaterThanOrEqual(2);
      expect(heatmap[0].rank).toBe(1);
      expect(heatmap[0].heat).toBeGreaterThanOrEqual(heatmap[1].heat);
    });

    it('应该包含趋势信息', () => {
      engine.updateData(createSector({ change: 2 }));
      engine.updateData(createSector({ change: 3, netInflow: 30000 }));

      const heatmap = engine.generateHeatmap();
      expect(['rising', 'falling', 'stable']).toContain(heatmap[0].trend);
    });
  });

  describe('轮动建议', () => {
    it('应该分类建议', () => {
      // 买入信号
      for (let i = 0; i < 10; i++) {
        engine.updateData(createSector({ code: 'BUY', change: 4, netInflow: 80000 }));
      }
      // 卖出信号
      for (let i = 0; i < 10; i++) {
        engine.updateData(createSector({ code: 'SELL', change: -4, netInflow: -80000 }));
      }

      const advice = engine.getRotationAdvice(['BUY', 'SELL']);
      expect(advice.buy).toContain('BUY');
      expect(advice.sell).toContain('SELL');
    });

    it('应该返回所有分类', () => {
      engine.updateData(createSector({ code: 'A', change: 0, netInflow: 0 }));
      const advice = engine.getRotationAdvice(['A']);
      expect(Array.isArray(advice.buy)).toBe(true);
      expect(Array.isArray(advice.hold)).toBe(true);
      expect(Array.isArray(advice.sell)).toBe(true);
      expect(Array.isArray(advice.watch)).toBe(true);
    });
  });

  describe('数据清理', () => {
    it('应该清除历史数据', () => {
      engine.updateData(createSector());
      engine.clearHistory();
      const rs = engine.calculateRelativeStrength('BK0536');
      expect(rs).toBe(50);
    });
  });
});
