/**
 * 影子测试迁移（批次 31a）
 *
 * 本文件原来自抄生产实现（shadow test），现全部符号通过 import 绑定生产真源；
 * 用例数保持 25（5 + 4 + 3 + 6 + 4 + 3），只增不减。
 *
 * 一、绑定生产真源（文件:行号）
 * - zScore(values)         -> zScoreSeries        backend/src/services/zScoreEngine.ts:10
 * - normalize(values)      -> normalizeMinMax     frontend/src/utils/multiFactorEngine.ts:75
 * - rankPercentile(values) -> normalizePercentile frontend/src/utils/multiFactorEngine.ts:92
 * - multiFactorScore(...)  -> scoreStocks         frontend/src/utils/multiFactorEngine.ts:135
 * - factorIC(f, r)         -> pearson             backend/src/services/factorEngine.ts:153
 * - decayWeight(v, halfLife)-> analyzeFactorDecay backend/src/services/factorDecayEngine.ts:66
 *
 * 二、旧断言订正（旧值 → 生产值 + 生产文件:行号）
 * 1) zScore：旧实现不取舍；生产逐项 Math.round(z*10000)/10000（zScoreEngine.ts:15）。
 *    [10,20,30,40,50] 的 z 值标准差 旧 1 → 生产 0.99999041；「标准差接近1」精度 5 位 → 4 位
 *    （5 位容差 5e-6 < 差值 9.6e-6，会红）。
 * 2) normalize：旧等值返回 0.5；生产 range=max-min||1 → 等值全 0（multiFactorEngine.ts:81）。
 * 3) rankPercentile：旧 sorted.findIndex(s>=v)/(n-1)；生产按排序位置 rank/(len-1||1)（:97-99），
 *    并列值展开为不同 rank：[3,1,4,1,5] 旧 [0.5,0,0.75,0,1] → 生产 [0.5,0,0.75,0.25,1]。
 * 4) multiFactorScore：旧直接 val*weight（short 取负）；生产先横截面 z-score（:155）→
 *    lower_better 取负（:162-164）→ weight/totalWeight 归一化（:170-180）→ round 3（:185）。
 *    旧单股 short totalScore=-0.9 → 生产单股 z=0（需两支股票形成 ±1）；
 *    旧 weight 1 vs 0.5 = 0.8 vs 0.4（2 倍）→ 生产归一化后同为 ±1（相等）；
 *    旧 A/B/C 总分 0.755/0.535/0.5（A>C>B）→ 生产 0.729/-0.205/-0.524（A>B>C）。
 * 5) factorIC：旧 n<2→0、零方差→0；生产同（factorEngine.ts:155,168），4 条旧断言原样成立。
 * 6) decayWeight：旧把 0.5^((n-1-i)/halfLife) 直接乘到数值上，halfLife 是参数；生产无同签名导出，
 *    语义由 analyzeFactorDecay 的 decayWeights 承接：decayWeights[i]=exp(-0.693*i/halfLife)
 *    （factorDecayEngine.ts:92-94），halfLife 由因子值一阶自相关估计（:52-64），
 *    <10 条返回 null（:70），decaySpeed 按 5/15 分档（:109-111）。
 *    旧 [1,1,1,1,100]+halfLife 2 的「最近值权重最大」→ 生产 w[0]=1 且随滞后递减；
 *    旧 halfLife=1 vs 10 → 生产用 [1024..1] 11 点（halfLife=1, w[1]=0.5000736）
 *    对比常量 12 点（halfLife=12, w[1]=0.9438859）。
 *
 * 三、未迁移 / 生产缺口
 * - 未迁移 helper：无（6/6 符号均有生产导出；旧 decayWeight 签名无对应导出，语义由 decayWeights 承接）。
 * - 生产缺口：analyzeFactorDecay 对 <10 条因子收益返回 null（:70），旧实现无此守卫；
 *   本文件所有用例均 ≥11 条，不触发该分支。
 */

import { describe, it, expect } from 'vitest';
import { zScoreSeries } from '../services/zScoreEngine';
import {
  normalizeMinMax,
  normalizePercentile,
  scoreStocks,
  type ScoringConfig,
  type StockFactors,
} from '../../../frontend/src/utils/multiFactorEngine';
import { pearson } from '../services/factorEngine';
import { analyzeFactorDecay, type FactorReturn } from '../services/factorDecayEngine';

// 量化因子模型引擎测试
describe('量化因子模型引擎', () => {
  describe('Z-Score标准化', () => {
    it('标准正态序列均值接近0', () => {
      const vals = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
      const zs = zScoreSeries(vals);
      const mean = zs.reduce((a, b) => a + b, 0) / zs.length;
      expect(Math.abs(mean)).toBeLessThan(0.001);
    });

    it('相同值返回全零', () => {
      const vals = [5, 5, 5, 5, 5];
      zScoreSeries(vals).forEach(z => expect(z).toBe(0));
    });

    it('两元素对称', () => {
      const zs = zScoreSeries([10, 20]);
      expect(zs[0]).toBe(-1);
      expect(zs[1]).toBe(1);
    });

    it('最大值对应最大Z值', () => {
      const vals = [3, 1, 4, 1, 5, 9, 2, 6];
      const zs = zScoreSeries(vals);
      const maxIdx = vals.indexOf(9);
      expect(zs[maxIdx]).toBe(Math.max(...zs));
    });

    it('标准差接近1', () => {
      const vals = [10, 20, 30, 40, 50];
      const zs = zScoreSeries(vals);
      const mean = zs.reduce((a, b) => a + b, 0) / zs.length;
      const std = Math.sqrt(zs.reduce((s, z) => s + (z - mean) ** 2, 0) / zs.length);
      // 生产逐项舍入 4 位（zScoreEngine.ts:15）→ 0.99999041，按 4 位精度断言
      expect(std).toBeCloseTo(1, 4);
    });
  });

  describe('归一化', () => {
    it('范围映射到[0,1]', () => {
      const norm = normalizeMinMax([10, 20, 30, 40, 50]);
      expect(norm).toEqual([0, 0.25, 0.5, 0.75, 1]);
      expect(Math.min(...norm)).toBe(0);
      expect(Math.max(...norm)).toBe(1);
    });

    it('相同值返回0', () => {
      // 旧自抄返回 0.5；生产 range=max-min||1（multiFactorEngine.ts:81）→ 全 0
      const norm = normalizeMinMax([7, 7, 7, 7]);
      norm.forEach(n => expect(n).toBe(0));
    });

    it('保持顺序', () => {
      const vals = [5, 3, 8, 1, 9];
      const norm = normalizeMinMax(vals);
      for (let i = 0; i < vals.length - 1; i++) {
        for (let j = i + 1; j < vals.length; j++) {
          if (vals[i] < vals[j]) expect(norm[i]).toBeLessThanOrEqual(norm[j]);
          if (vals[i] > vals[j]) expect(norm[i]).toBeGreaterThanOrEqual(norm[j]);
        }
      }
    });

    it('负值也能归一化', () => {
      const norm = normalizeMinMax([-100, -50, 0, 50, 100]);
      expect(norm[0]).toBeCloseTo(0);
      expect(norm[4]).toBeCloseTo(1);
      expect(norm[2]).toBeCloseTo(0.5);
      expect(norm).toEqual([0, 0.25, 0.5, 0.75, 1]);
    });
  });

  describe('排名百分位', () => {
    it('返回值在[0,1]范围', () => {
      const rp = normalizePercentile([30, 10, 50, 20, 40]);
      rp.forEach(r => {
        expect(r).toBeGreaterThanOrEqual(0);
        expect(r).toBeLessThanOrEqual(1);
      });
      expect(rp).toEqual([0.5, 0, 1, 0.25, 0.75]);
    });

    it('最小值排名为0', () => {
      const vals = [3, 1, 4, 1, 5];
      const rp = normalizePercentile(vals);
      const minIdx = vals.indexOf(1);
      expect(rp[minIdx]).toBe(0);
      // 生产按排序位置展开并列值（旧 findIndex 会把两个 1 都给 0）
      expect(rp[3]).toBe(0.25);
    });

    it('最大值排名为1', () => {
      const vals = [3, 1, 4, 1, 5];
      const rp = normalizePercentile(vals);
      const maxIdx = vals.indexOf(5);
      expect(rp[maxIdx]).toBe(1);
    });
  });

  describe('多因子评分', () => {
    const makeStock = (symbol: string, factors: Record<string, number>): StockFactors => ({
      symbol,
      name: symbol,
      timestamp: 0,
      factors,
    });

    const stocks: StockFactors[] = [
      makeStock('A', { value: 0.8, momentum: 0.6, quality: 0.9 }),
      makeStock('B', { value: 0.3, momentum: 0.9, quality: 0.4 }),
      makeStock('C', { value: 0.5, momentum: 0.5, quality: 0.5 }),
    ];

    const scoringConfig: ScoringConfig = {
      factors: [
        { id: 'value', name: 'Value', category: 'value', weight: 0.4, direction: 'higher_better', minRange: 0, maxRange: 1 },
        { id: 'momentum', name: 'Momentum', category: 'momentum', weight: 0.35, direction: 'higher_better', minRange: 0, maxRange: 1 },
        { id: 'quality', name: 'Quality', category: 'quality', weight: 0.25, direction: 'higher_better', minRange: 0, maxRange: 1 },
      ],
      normalization: 'zscore',
      outlierHandling: 'ignore',
      minDataPoints: 1,
    };

    it('返回正确数量的评分', () => {
      expect(scoreStocks(stocks, scoringConfig).scores).toHaveLength(3);
    });

    it('排名从1开始', () => {
      scoreStocks(stocks, scoringConfig).scores.forEach(s => expect(s.rank).toBeGreaterThanOrEqual(1));
    });

    it('排名连续递增', () => {
      const scores = scoreStocks(stocks, scoringConfig).scores;
      for (let i = 1; i < scores.length; i++) {
        expect(scores[i].rank).toBe(scores[i - 1].rank + 1);
      }
    });

    it('总分递减排序', () => {
      const scores = scoreStocks(stocks, scoringConfig).scores;
      expect(scores.map(s => s.symbol)).toEqual(['A', 'B', 'C']);
      expect(scores.map(s => s.totalScore)).toEqual([0.729, -0.205, -0.524]);
      for (let i = 1; i < scores.length; i++) {
        expect(scores[i].totalScore).toBeLessThanOrEqual(scores[i - 1].totalScore);
      }
    });

    it('反向因子取负', () => {
      // 旧实现单股 short 直接取 -0.9；生产横截面 z-score 单股为 0 → 用两支股票形成 ±1
      const shortConfig: ScoringConfig = {
        factors: [{ id: 'value', name: 'Value', category: 'value', weight: 1, direction: 'lower_better', minRange: 0, maxRange: 1 }],
        normalization: 'zscore',
        outlierHandling: 'ignore',
        minDataPoints: 1,
      };
      const scores = scoreStocks([makeStock('X', { value: 0.9 }), makeStock('Y', { value: 0.1 })], shortConfig).scores;
      expect(scores.find(s => s.symbol === 'X')!.totalScore).toBe(-1);
      expect(scores.find(s => s.symbol === 'Y')!.totalScore).toBe(1);
    });

    it('权重归一化影响总分', () => {
      // 旧实现 weight 1 vs 0.5 得 0.8 vs 0.4（2 倍）；
      // 生产先除 totalWeight（multiFactorEngine.ts:170-180）→ 权重缩放不改变归一化总分
      const makeConfig = (weight: number): ScoringConfig => ({
        factors: [{ id: 'value', name: 'Value', category: 'value', weight, direction: 'higher_better', minRange: 0, maxRange: 1 }],
        normalization: 'zscore',
        outlierHandling: 'ignore',
        minDataPoints: 1,
      });
      const pair = [makeStock('S1', { value: 1 }), makeStock('S2', { value: 0 })];
      const s1 = scoreStocks(pair, makeConfig(1)).scores;
      const s2 = scoreStocks(pair, makeConfig(0.5)).scores;
      expect(s1.map(s => s.totalScore)).toEqual([1, -1]);
      expect(s2.map(s => s.totalScore)).toEqual([1, -1]);
      expect(s1.map(s => s.totalScore)).toEqual(s2.map(s => s.totalScore));
    });
  });

  describe('因子IC', () => {
    it('完全正相关返回1', () => {
      expect(pearson([1, 2, 3, 4, 5], [10, 20, 30, 40, 50])).toBeCloseTo(1, 5);
    });

    it('完全负相关返回-1', () => {
      expect(pearson([1, 2, 3, 4, 5], [50, 40, 30, 20, 10])).toBeCloseTo(-1, 5);
    });

    it('无相关返回0', () => {
      // 旧标题沿用；该夹具实为零方差因子，生产 pearson 对 va<=0 返回 0（factorEngine.ts:168）
      expect(pearson([1, 1, 1, 1, 1], [10, 20, 30, 40, 50])).toBe(0);
    });

    it('单元素返回0', () => {
      expect(pearson([5], [10])).toBe(0);
    });
  });

  describe('衰减加权', () => {
    // 确定性夹具：factorValue 指数衰减 → 自相关约 0.5 → 生产估出 halfLife=1
    const decayInput = (values: number[]): FactorReturn[] =>
      values.map((factorValue, i) => ({
        date: '2026-01-' + String(i + 1).padStart(2, '0'),
        factorValue,
        forwardReturn: i * 0.01,
      }));
    const decaying = decayInput([1024, 512, 256, 128, 64, 32, 16, 8, 4, 2, 1]);
    const flat = decayInput(Array(12).fill(100));

    it('最近值权重最大', () => {
      // 旧实现把权重乘到数值上；生产 analyzeFactorDecay 返回滞后权重数组，lag 0 为最近期
      const decay = analyzeFactorDecay(decaying)!;
      expect(decay.decayWeights).toHaveLength(20);
      expect(decay.decayWeights[0]).toBe(1);
      for (let i = 1; i < decay.decayWeights.length; i++) {
        expect(decay.decayWeights[i]).toBeLessThan(decay.decayWeights[i - 1]);
      }
    });

    it('halfLife=1时衰减最快', () => {
      const fast = analyzeFactorDecay(decaying)!;
      const slow = analyzeFactorDecay(flat)!;
      // 旧实现由参数直接给 halfLife；生产由因子值自相关估计（factorDecayEngine.ts:52-64）
      expect(fast.halfLife).toBe(1);
      expect(slow.halfLife).toBe(12);
      expect(fast.decaySpeed).toBe('fast');
      expect(slow.decaySpeed).toBe('medium');
      expect(fast.decayWeights[1]).toBeCloseTo(0.5, 3);
      expect(slow.decayWeights[1]).toBeCloseTo(0.9439, 4);
      expect(fast.decayWeights[1]).toBeLessThan(slow.decayWeights[1]);
    });

    it('所有值非负', () => {
      analyzeFactorDecay(decaying)!.decayWeights.forEach(w => expect(w).toBeGreaterThanOrEqual(0));
    });
  });
});
