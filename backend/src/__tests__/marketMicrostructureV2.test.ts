import { describe, it, expect } from 'vitest';
import {
  calcAmihudIlliquidity,
  calcKyleLambda,
  calcVPIN,
} from '../services/orderFlowToxicityEngine';

/**
 * 市场微观结构测试（影子测试迁移 · 批次 11）
 *
 * 生产真源：backend/src/services/orderFlowToxicityEngine.ts
 *   → calcKyleLambda(L374-397) / calcAmihudIlliquidity(L429-446) / calcVPIN(L134-150)
 * 数据契约：生产用 Trade{price,volume,timestamp,aggressor?}，方向由 tick rule
 *   classifyTrade(L60-62)（price >= 前价 → BUY）判定，不使用 side/aggressor 字段。
 *
 * 旧断言修正（旧行号指迁移前版本）：
 *   1) Kyle Lambda：旧 L6-16 为 Σ(Δp·v)/Σv²（未去均值）；生产 L374-397 为
 *      |Cov(Δp,signedVol)/Var(signedVol)|，且 <3 笔返回 0（旧 <2 笔）。
 *      本数据旧值 2.7258790199e-5 → 生产 2.6060341058e-5。
 *   2) Amihud：旧 L17-28 返回全样本均值标量、空数据 0；生产 L429-446 返回滚动窗口数组
 *      （首元素 0，长度 = trades.length），空/单笔返回 []。故取末元素断言并补长度，空数据改断言 []。
 *   3) VPIN：旧 L29-38 返回单一 |Σbuy-Σsell|/Σtotal（按 side 字段）；生产 L134-150 按成交量桶
 *      输出 number[]，方向由 tick rule 判定，且从第 2 笔开始累计。本数据 bucketSize=1000 → [700/1300, 1]；
 *      旧标量 (2300-1350)/3650 ≈ 0.2603。全买入/平衡用例相应改用 tick-rule 可判定的价格序列
 *      （生产规则下等价会被判 BUY，故「平衡」需一涨一跌各等量成交）。
 *
 * 未迁移（生产无对应实现，保留本地 helper）：
 *   - calcTradeSign：生产 classifyTrade 返回 'BUY'/'SELL' 且需前价，无 ±1 序列 API；
 *     backend/src/services/tradeClassificationEngine.ts L24-29 的 tradeSign 是 Tick{bid,ask} 价差内归一化值，契约不同。
 *   - calcAutocorrelation / calcRollSpread / calcHasbrouckLambda：orderFlowToxicityEngine 无对应导出。
 */
describe('市场微观结构分析', () => {
  interface Tick { price: number; volume: number; timestamp: number; side: 'buy' | 'sell'; }

  // 未迁移：生产无 ±1 交易符号序列 API（见文件头未迁移说明）
  function calcTradeSign(ticks: Tick[]): number[] {
    return ticks.map((t, i) => {
      if (i === 0) return t.side === 'buy' ? 1 : -1;
      return t.side === 'buy' ? 1 : -1;
    });
  }
  // 未迁移：生产无自相关函数
  function calcAutocorrelation(signs: number[], lag: number): number {
    if (signs.length <= lag) return 0;
    const mean = signs.reduce((a, b) => a + b, 0) / signs.length;
    let num = 0, den = 0;
    for (let i = lag; i < signs.length; i++) {
      num += (signs[i] - mean) * (signs[i - lag] - mean);
    }
    for (const s of signs) den += (s - mean) ** 2;
    return den === 0 ? 0 : num / den;
  }
  // 未迁移：生产无 Roll 价差估计
  function calcRollSpread(ticks: Tick[]): number {
    if (ticks.length < 2) return 0;
    const diffs: number[] = [];
    for (let i = 1; i < ticks.length; i++) {
      diffs.push(ticks[i].price - ticks[i - 1].price);
    }
    let sumProd = 0;
    for (let i = 1; i < diffs.length; i++) {
      sumProd += diffs[i] * diffs[i - 1];
    }
    const cov = sumProd / diffs.length;
    return cov < 0 ? 2 * Math.sqrt(-cov) : 0;
  }
  // 未迁移：生产无 Hasbrouck lambda
  function calcHasbrouckLambda(ticks: Tick[]): number {
    const midPrices = ticks.map(t => t.price);
    let sumSq = 0;
    for (let i = 1; i < midPrices.length; i++) {
      sumSq += (midPrices[i] - midPrices[i - 1]) ** 2;
    }
    const avgVol = ticks.reduce((s, t) => s + t.volume, 0) / ticks.length;
    return avgVol === 0 ? 0 : Math.sqrt(sumSq / ticks.length) / avgVol;
  }

  const ticks: Tick[] = [
    { price: 10.00, volume: 500, timestamp: 1000, side: 'buy' },
    { price: 10.01, volume: 300, timestamp: 1001, side: 'buy' },
    { price: 10.00, volume: 400, timestamp: 1002, side: 'sell' },
    { price: 9.99, volume: 600, timestamp: 1003, side: 'sell' },
    { price: 10.00, volume: 200, timestamp: 1004, side: 'buy' },
    { price: 10.02, volume: 800, timestamp: 1005, side: 'buy' },
    { price: 10.01, volume: 350, timestamp: 1006, side: 'sell' },
    { price: 10.03, volume: 500, timestamp: 1007, side: 'buy' },
  ];

  it('Kyle Lambda', () => {
    const lambda = calcKyleLambda(ticks);
    expect(Number.isFinite(lambda)).toBe(true);
    expect(lambda).toBeGreaterThanOrEqual(0);
    // 生产为去均值协方差/方差，且取绝对值；旧自抄未去均值，值为 2.7258790199e-5
    expect(lambda).toBeCloseTo(2.6060341058154227e-5, 12);
  });

  it('Kyle Lambda不足数据', () => {
    // 生产要求至少 3 笔（旧自抄为 <2 笔），单笔仍返回 0
    expect(calcKyleLambda([ticks[0]])).toBe(0);
  });

  it('Amihud非流动性指标', () => {
    // 生产返回滚动窗口数组，首元素为 0，末元素为窗口内均值
    const illiq = calcAmihudIlliquidity(ticks);
    expect(illiq).toHaveLength(ticks.length);
    expect(illiq[0]).toBe(0);
    const latest = illiq[illiq.length - 1];
    expect(latest).toBeGreaterThanOrEqual(0);
    expect(latest).toBeCloseTo(3.118357005786264e-7, 15);
  });

  it('VPIN计算', () => {
    // 生产按成交量桶输出数组：前 3 笔累计 1300 ≥ 1000 出桶，第 5 笔再满 1000 出桶
    const vpin = calcVPIN(ticks, 1000);
    expect(vpin).toHaveLength(2);
    expect(vpin[0]).toBeCloseTo(700 / 1300, 12);
    expect(vpin[1]).toBe(1);
    for (const v of vpin) {
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(1);
    }
  });

  it('VPIN全买入', () => {
    // 生产按 tick rule 判定方向：价格单调上行 → 每桶全为 BUY
    const allBuy: Tick[] = [10.00, 10.01, 10.02, 10.03, 10.04, 10.05, 10.06, 10.07].map(
      (price, i) => ({ price, volume: 500, timestamp: 1000 + i, side: 'buy' as const })
    );
    const vpin = calcVPIN(allBuy, 1000);
    expect(vpin.length).toBeGreaterThan(0);
    expect(vpin.every(v => v === 1)).toBe(true);
  });

  it('VPIN平衡买卖', () => {
    // 一涨一跌、各 100 量、桶 200 → 桶内买卖各 100，VPIN=0
    const balanced: Tick[] = [
      { price: 10.00, volume: 100, timestamp: 1, side: 'buy' },
      { price: 10.01, volume: 100, timestamp: 2, side: 'buy' },
      { price: 10.00, volume: 100, timestamp: 3, side: 'sell' },
      { price: 10.01, volume: 100, timestamp: 4, side: 'buy' },
    ];
    expect(calcVPIN(balanced, 200)).toEqual([0]);
  });

  it('交易符号序列', () => {
    const signs = calcTradeSign(ticks);
    expect(signs).toHaveLength(ticks.length);
    expect(signs[0]).toBe(1); // buy
    expect(signs[2]).toBe(-1); // sell
  });

  it('自相关系数', () => {
    const signs = calcTradeSign(ticks);
    const ac = calcAutocorrelation(signs, 1);
    expect(ac).toBeGreaterThanOrEqual(-1);
    expect(ac).toBeLessThanOrEqual(1);
  });

  it('Roll价差估计', () => {
    const spread = calcRollSpread(ticks);
    expect(spread).toBeGreaterThanOrEqual(0);
  });

  it('Roll价差不足数据', () => {
    expect(calcRollSpread([ticks[0]])).toBe(0);
  });

  it('Hasbrouck Lambda', () => {
    const hl = calcHasbrouckLambda(ticks);
    expect(Number.isFinite(hl)).toBe(true);
    expect(hl).toBeGreaterThanOrEqual(0);
  });

  it('Amihud空数据', () => {
    // 旧自抄空数据返回 0；生产返回空数组
    expect(calcAmihudIlliquidity([])).toEqual([]);
  });

  it('自相关lag超长度', () => {
    expect(calcAutocorrelation([1, -1], 5)).toBe(0);
  });

  it('tick时间递增', () => {
    for (let i = 1; i < ticks.length; i++) {
      expect(ticks[i].timestamp).toBeGreaterThan(ticks[i - 1].timestamp);
    }
  });

  it('tick价格正数', () => {
    for (const t of ticks) {
      expect(t.price).toBeGreaterThan(0);
      expect(t.volume).toBeGreaterThan(0);
    }
  });
});
