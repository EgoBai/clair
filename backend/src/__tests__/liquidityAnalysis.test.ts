/**
 * 影子测试迁移（批次 22a）
 *
 * 旧文件在测试内自抄了 Amihud / Kyle / 评分 / 量分布 / 换手率五套实现（只 import vitest），断言副本。
 * 本批把 Amihud、Kyle 两组改为 import 真实生产实现，其余三组保留本地 helper 并逐处注明原因。
 *
 * 已绑定生产实现：
 * - calcAmihudIlliquidity → backend/src/services/orderFlowToxicityEngine.ts:429-446
 * - calcKyleLambda → backend/src/services/orderFlowToxicityEngine.ts:374-397
 * - 入参契约：orderFlowToxicityEngine.ts:14-19 的 Trade { price; volume; timestamp; aggressor? }。
 *   买卖方向由 tick rule classifyTrade:60-62 推导（price >= 前价 → BUY，否则 SELL），aggressor 不参与。
 *
 * 旧断言错在哪（旧值 → 生产值）：
 * - Amihud「应正确计算」：旧副本返回全样本平均标量 |r|/volume；生产返回滚动窗口数组（长度 = trades.length，
 *   首元素固定 0），单点口径为 |Δp|/(prevPrice × price × volume)（量纲 1/元）。旧标量
 *   7.0833333333333337e-10（1/股）→ 生产末元素 7.0767705490826146e-12（1/元）。
 * - Amihud「空数组」：旧 0 → 生产 []（L430 少于 2 笔即返回空数组）。
 * - Amihud「长度不匹配应返回 0」：生产入参是 Trade[]，不存在平行数组长度不匹配；等价的数据不足边界改为
 *   单笔交易 → []（旧 0）。
 * - Amihud「零成交量」：旧实现跳过 volume=0 的样本再对剩余样本求均值；生产逐点跳过 price*volume<=0 的样本
 *   后取窗口均值。旧数据映射为 [t(100,0), t(101,0), t(98.98,2e7)] → 生产 [0, 0, 1.0103051121438655e-11]
 *   （旧断言为 1e-9 量级的「>0」，只声明存在有效样本）。
 * - Amihud「所有成交量为零」：旧标量 0 → 生产逐元素 [0, 0, 0]。
 * - Kyle「应正确计算」：旧副本是 Σ(Δp·signedVol)/ΣsignedVol²（未去均值，signedVol 可外部指定任意符号）；
 *   生产是 |Cov(Δp, signedVol)/Var(signedVol)|（L374-397，先去均值再取绝对值，少于 3 笔返回 0），
 *   signedVol 由 tick rule 从相邻价差推导。旧值 8.7702573879885610e-5 → 生产 8.1268104280654107e-5。
 * - Kyle「空数据 / 单点」：旧 0 → 生产 0（L375 少于 3 笔直接返回 0），断言不变，只改入参。
 *
 * 未迁移——生产无同契约导出（保留本地 helper，其数值断言不对生产作声明）：
 * - calcLiquidityScore：backend 无导出；前端候选 frontend/src/utils/liquidityRiskEngine.ts:236 的 class
 *   方法入参为 (spreadPct, avgVolume, turnover, volatility)、返回 { overallScore, grade, ... }，无
 *   marketDepth 且权重/量纲不同；frontend/src/utils/liquidityScoreEngine.ts:45 亦为另一套多因子口径。
 * - calcVolumeProfile：backend 候选 backend/src/services/volumeProfileEngine.ts:33 computeVolumeProfile
 *   入参 VolumeBar[]、按固定价格宽度 binSize 分桶、返回 VolumeProfileResult | null（< 2 条为 null），
 *   与旧 helper「按数量等分 bins + 返回数组 + poc 标记」不兼容（生产为高成交量区 VAH/VAL 口径）。
 * - calcTurnoverRate：生产无「成交量/流通股本」函数；backend/src/utils/performanceAnalyzer.ts:389 的
 *   turnoverRate 是「交易笔数/快照天数」，契约不同。
 *
 * 生产缺陷候选：无。口径观察（未改生产）：
 * 1) Amihud 首元素固定 0，且前段用扩张窗口（start = max(1, i - window + 1)），早期样本窗口内数量少于
 *    window，与后段固定窗口均值可比性弱；属口径特征而非断言错误。
 * 2) Kyle 结果取 Math.abs（L396），丢弃价格冲击方向；常见 λ 约定为正，暂记观察。
 */

import { describe, it, expect } from 'vitest';
import { calcAmihudIlliquidity, calcKyleLambda } from '../services/orderFlowToxicityEngine';
import type { Trade } from '../services/orderFlowToxicityEngine';

// 流动性分析引擎
interface LiquidityMetrics {
  avgDailyVolume: number;
  volumeStdDev: number;
  bidAskSpread: number;
  marketDepth: number;
  turnoverRate: number;
  liquidityScore: number;
  amihudIlliquidity: number;
  kyleLambda: number;
}

// 未迁移：backend 无同契约导出（见文件头），保留本地 helper。
function calcLiquidityScore(metrics: Partial<LiquidityMetrics>): number {
  const weights = { volume: 0.3, spread: 0.25, depth: 0.25, turnover: 0.2 };
  let score = 0;
  if (metrics.avgDailyVolume) score += Math.min(metrics.avgDailyVolume / 1e8, 1) * weights.volume * 100;
  if (metrics.bidAskSpread !== undefined) score += Math.max(0, 1 - metrics.bidAskSpread / 0.05) * weights.spread * 100;
  if (metrics.marketDepth) score += Math.min(metrics.marketDepth / 1e6, 1) * weights.depth * 100;
  if (metrics.turnoverRate) score += Math.min(metrics.turnoverRate / 10, 1) * weights.turnover * 100;
  return Math.round(score);
}

// 未迁移：生产 computeVolumeProfile 契约不同（见文件头），保留本地 helper。
function calcVolumeProfile(prices: number[], volumes: number[], bins: number = 10): { price: number; volume: number; poc: boolean }[] {
  if (prices.length === 0) return [];
  const min = Math.min(...prices);
  const max = Math.max(...prices);
  const binSize = (max - min) / bins || 1;
  const profile: Map<number, number> = new Map();

  for (let i = 0; i < prices.length; i++) {
    const bin = Math.floor((prices[i] - min) / binSize);
    const key = Math.min(bin, bins - 1);
    profile.set(key, (profile.get(key) || 0) + volumes[i]);
  }

  const result = Array.from(profile.entries()).map(([bin, vol]) => ({
    price: min + (bin + 0.5) * binSize,
    volume: vol,
    poc: false,
  }));

  const maxVol = Math.max(...result.map(r => r.volume));
  result.forEach(r => { if (r.volume === maxVol) r.poc = true; });
  return result.sort((a, b) => a.price - b.price);
}

// 未迁移：生产无「成交量/流通股本」口径（见文件头），保留本地 helper。
function calcTurnoverRate(volume: number, freeFloatShares: number): number {
  if (freeFloatShares <= 0) return 0;
  return (volume / freeFloatShares) * 100;
}

const trade = (price: number, volume: number, timestamp: number): Trade => ({ price, volume, timestamp });

describe('流动性分析引擎', () => {
  describe('Amihud非流动性指标', () => {
    it('应正确计算Amihud指标（滚动数组）', () => {
      // 旧 (returns, volumes) 平行数组映射为价格路径 + 成交量：p0 = 100，按 return 逐日递推
      const prices = [100, 101, 98.98, 99.4749, 100.9670235];
      const volumes = [1e7, 1e7, 2e7, 1.5e7, 3e7];
      const trades = prices.map((price, i) => trade(price, volumes[i], i));
      const result = calcAmihudIlliquidity(trades);
      expect(result.length).toBe(trades.length); // 旧副本返回标量；生产返回滚动数组
      expect(result[0]).toBe(0); // 生产首元素固定 0（无前一日收益）
      expect(result[4]).toBeCloseTo(7.0767705490826146e-12, 16); // 旧标量 7.08e-10（量纲 1/股）
    });

    it('应处理零成交量', () => {
      // 旧 returns [0.01, -0.02]、volumes [0, 2e7] → 第二日量为 0，第三日恢复有效量
      const trades = [trade(100, 0, 0), trade(101, 0, 1), trade(98.98, 2e7, 2)];
      const result = calcAmihudIlliquidity(trades);
      expect(result[1]).toBe(0); // price*volume = 0 的样本被跳过，窗口内无有效样本
      expect(result[2]).toBeCloseTo(1.0103051121438655e-11, 14);
    });

    it('空数组应返回空数组', () => {
      expect(calcAmihudIlliquidity([])).toEqual([]); // 旧副本返回 0
    });

    it('单笔交易应返回空数组', () => {
      // 旧标题「长度不匹配应返回0」；生产入参是 Trade[]，等价边界为数据不足（< 2 笔）
      expect(calcAmihudIlliquidity([trade(100, 1e7, 0)])).toEqual([]); // 旧 0
    });

    it('所有成交量为零应返回全0数组', () => {
      // 旧 returns [0.01, 0.02]、volumes [0, 0]
      const trades = [trade(100, 0, 0), trade(101, 0, 1), trade(102, 0, 2)];
      expect(calcAmihudIlliquidity(trades)).toEqual([0, 0, 0]); // 旧标量 0
    });
  });

  describe('Kyle Lambda', () => {
    it('应正确计算价格冲击系数', () => {
      // tick rule 判向：相邻价差 [+0.1, +0.2, -0.1, +0.15] → signedVol [+1000, +2000, -1500, +1800]
      const trades = [
        trade(100, 1000, 0),
        trade(100.1, 1000, 1),
        trade(100.3, 2000, 2),
        trade(100.2, 1500, 3),
        trade(100.35, 1800, 4),
      ];
      const result = calcKyleLambda(trades);
      // 旧副本 Σ(Δp·signedVol)/ΣsignedVol² = 8.7702573879885610e-5（未去均值）
      expect(result).toBeCloseTo(8.1268104280654107e-5, 12);
    });

    it('空数据应返回0', () => {
      expect(calcKyleLambda([])).toBe(0);
    });

    it('单点数据应返回0', () => {
      expect(calcKyleLambda([trade(100, 1000, 0)])).toBe(0);
    });
  });

  describe('流动性评分', () => {
    it('高流动性应得高分', () => {
      const score = calcLiquidityScore({
        avgDailyVolume: 5e8,
        bidAskSpread: 0.001,
        marketDepth: 5e6,
        turnoverRate: 8,
      });
      expect(score).toBeGreaterThan(70);
    });

    it('低流动性应得低分', () => {
      const score = calcLiquidityScore({
        avgDailyVolume: 1e5,
        bidAskSpread: 0.1,
        marketDepth: 1000,
        turnoverRate: 0.1,
      });
      expect(score).toBeLessThan(30);
    });

    it('空指标应返回0', () => {
      expect(calcLiquidityScore({})).toBe(0);
    });
  });

  describe('成交量分布', () => {
    it('应正确生成成交量分布图', () => {
      const prices = [10, 10.5, 11, 11.5, 12, 10, 11, 12, 11.5, 10.5];
      const volumes = [1000, 2000, 3000, 1500, 500, 1200, 2800, 700, 1600, 2100];
      const profile = calcVolumeProfile(prices, volumes, 5);
      expect(profile.length).toBeGreaterThan(0);
      expect(profile.some(p => p.poc)).toBe(true);
    });

    it('空数据应返回空数组', () => {
      expect(calcVolumeProfile([], [], 5)).toEqual([]);
    });

    it('所有价格相同应正常处理', () => {
      const profile = calcVolumeProfile([10, 10, 10], [100, 200, 300]);
      expect(profile.length).toBeGreaterThan(0);
    });
  });

  describe('换手率', () => {
    it('应正确计算换手率', () => {
      expect(calcTurnoverRate(1e7, 1e8)).toBe(10);
    });

    it('流通股本为零应返回0', () => {
      expect(calcTurnoverRate(1e7, 0)).toBe(0);
    });

    it('负值流通股本应返回0', () => {
      expect(calcTurnoverRate(1e7, -1)).toBe(0);
    });
  });
});
