import { describe, it, expect } from 'vitest';
import {
  waveRandom,
  waveRange,
  waveInt,
  deterministicShuffle,
  waveNormal,
} from '../utils/deterministic';

/**
 * 确定性随机工具契约测试
 * 底层被 industryRotationPredictEngine 等核心引擎依赖，此前无专属测试（§7.2 记 17.6%）。
 * 契约以「不变量 + 确定性」为准，不硬编具体浮点值，避免公式演进时误判。
 */

describe('deterministic 确定性随机工具', () => {
  describe('waveRandom', () => {
    it('始终落在 [0, 1) 区间内', () => {
      for (let i = 0; i < 200; i++) {
        const v = waveRandom(i, i % 3);
        expect(v).toBeGreaterThanOrEqual(0);
        expect(v).toBeLessThan(1);
      }
    });

    it('相同输入产生相同输出（决定性）', () => {
      const a = waveRandom(42, 0.3);
      const b = waveRandom(42, 0.3);
      expect(a).toBe(b);
    });

    it('不同 index 通常产生不同输出（非恒定）', () => {
      const set = new Set<number>();
      for (let i = 0; i < 20; i++) set.add(waveRandom(i, 0.7));
      expect(set.size).toBeGreaterThan(15);
    });

    it('offset 改变相位（同一 index 不同 offset 结果不同）', () => {
      expect(waveRandom(5, 0)).not.toBe(waveRandom( 5, 0.5));
    });
  });

  describe('waveRange', () => {
    it('结果落在 [min, max) 区间内', () => {
      for (let i = 0; i < 200; i++) {
        const v = waveRange(i, -10, 10, 0.5);
        expect(v).toBeGreaterThanOrEqual(-10);
        expect(v).toBeLessThan(10);
      }
    });

    it('端点退化：min === max 时恒为 min', () => {
      expect(waveRange(99, 5, 5)).toBe(5);
    });

    it('确定性复述', () => {
      const a = waveRange(7, 0, 100, 0.9);
      const b = waveRange(7, 0, 100, 0.9);
      expect(a).toBe(b);
    });
  });

  describe('waveInt', () => {
    it('返回闭区间 [min, max] 内的整数', () => {
      for (let i = 0; i < 200; i++) {
        const v = waveInt(i, 1, 6);
        expect(Number.isInteger(v)).toBe(true);
        expect(v).toBeGreaterThanOrEqual(1);
        expect(v).toBeLessThanOrEqual(6);
      }
    });

    it('min === max 时恒为 min', () => {
      expect(waveInt(3, 8, 8)).toBe(8);
    });

    it('确定性复述', () => {
      const a = waveInt(15, 0, 100);
      const b = waveInt(15, 0, 100);
      expect(a).toBe(b);
    });
  });

  describe('deterministicShuffle', () => {
    it('空数组返回空数组', () => {
      expect(deterministicShuffle([])).toEqual([]);
    });

    it('单元素数组不变', () => {
      expect(deterministicShuffle([42])).toEqual([42]);
    });

    it('保持元素多重集不变（置换）', () => {
      const input = [1, 2, 3, 4, 5, 6, 7, 8];
      const out = deterministicShuffle(input);
      expect(out).toHaveLength(input.length);
      expect([...out].sort((a, b) => a - b)).toEqual([...input].sort((a, b) => a - b));
    });

    it('相同输入产生相同输出（决定性）', () => {
      const input = ['a', 'b', 'c', 'd', 'e'];
      expect(deterministicShuffle(input)).toEqual(deterministicShuffle(input));
    });

    it('不改变原数组（纯函数）', () => {
      const input = [9, 8, 7, 6];
      const copy = [...input];
      deterministicShuffle(input);
      expect(input).toEqual(copy);
    });
  });

  describe('waveNormal', () => {
    it('默认参数下为有限实数', () => {
      for (let i = 0; i < 50; i++) {
        const v = waveNormal(i);
        expect(Number.isFinite(v)).toBe(true);
      }
    });

    it('应用 mean 与 stdDev 缩放/平移', () => {
      const v = waveNormal(12, 100, 5);
      // 由确定性公式推导：z 为无量纲，结果 = mean + z*stdDev
      const u1 = waveRandom(12, 0.1);
      const u2 = waveRandom(12, 0.9);
      const z = Math.sqrt(-2 * Math.log(Math.max(u1, 0.0001))) * Math.cos(2 * Math.PI * u2);
      expect(v).toBeCloseTo(100 + z * 5, 10);
    });

    it('确定性复述', () => {
      expect(waveNormal(30, 0, 1)).toBe(waveNormal(30, 0, 1));
    });
  });
});
