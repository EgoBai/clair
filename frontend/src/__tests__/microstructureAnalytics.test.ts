/**
 * 微观结构分析测试
 * 影子测试迁移（批次 21a）：旧文件不 import 任何项目源码、内部自抄了一套微观结构实现，
 * 本版改为绑定生产实现；仅生产无对应导出的聚合口径保留本地 helper 并逐段标注「未迁移」。
 *
 * 绑定生产实现（唯一口径真源）：
 * - classifyTrade ← backend/src/services/orderFlowToxicityEngine.ts:60（tick rule：price >= prevPrice → BUY；不看 aggressor）
 * - calcVPIN ← backend/src/services/orderFlowToxicityEngine.ts:134（第二参是「累计成交量阈值」，不是桶数；返回每桶 |buy-sell|/total 的数组）
 * - calcKyleLambda ← backend/src/services/orderFlowToxicityEngine.ts:374（|Cov(Δp, signedVolume)/Var(signedVolume)|，signedVolume 由 tick rule 定号）
 * - calcAmihudIlliquidity ← backend/src/services/orderFlowToxicityEngine.ts:429（滚动数组，首元素固定 0，长度=笔数）
 * - tradeIntensity ← backend/src/services/orderFlowToxicityEngine.ts:331（每笔的 60s 滑动窗口笔数数组）
 * - generateOrderFlowSnapshot ← backend/src/services/orderFlowToxicityEngine.ts:557（生产聚合快照，替代旧的本地 analyzeMicrostructure）
 *
 * 未迁移（生产无同义导出，保留本地 helper，不虚构生产代码）：
 * - avgTradeSize / blockTradeRatio / buyPressure：生产没有「笔均成交量 / 大单笔数占比 / 0..1 买压占比」导出。
 *   orderBookAnalyzer.ts:41 的 buyPressure 是盘口挂单金额占比（非同域）；orderImbalance:293 是 -1..1 的
 *   净不平衡且从第 2 笔起算，不能冒充 0..1 买压。
 * - 旧 calcTradeIntensity 的「笔数/时长×窗口」时间归一化口径：生产 tradeIntensity 只数窗口内笔数，不除以时长。
 *
 * 旧断言错在哪（旧值→生产值）：
 * - calcVPIN(trades, 50)：旧把 50 当桶数并返回单一标量 0..1 → 生产返回 number[]，50 是累计成交量阈值，
 *   老 fixture 6 笔共 12000 股，阈值 50 时几乎每笔都单独落桶。
 * - calcAmihudIlliquidity(trades)：旧返回单一标量（均值）→ 生产返回滚动 number[]，首元素 0。
 * - calcKyleLambda：旧用 Σdp*signedVol/ΣsignedVol²、按 aggressor 定号、不取绝对值 → 生产按 tick rule 定号，
 *   用减均值后的 Cov/Var 并取绝对值，量纲 ~1e-5。
 * - 买卖方向：旧按 trade.aggressor 判断 → 生产 classifyTrade 只看价格与上一笔价格（aggressor 被忽略）。
 *
 * 生产缺陷候选（未改生产代码，仅记录真实行为）：
 * - classifyTrade:60 用 price >= prevPrice：价格持平一律判 BUY。标准 tick rule 要求「同价沿用上一方向」，
 *   下跌后的同价成交会被误判为主动买。
 * - calcVPIN:134 单桶只 push 一次且清零：当一笔成交量远超 bucketSize（如 300+10000 股对 1000 股阈值）时，
 *   超出的量不拆到后续桶，桶数被低估、桶内 VPIN 失真。
 */

import { describe, it, expect } from 'vitest';
import {
  classifyTrade,
  calcVPIN,
  calcKyleLambda,
  calcAmihudIlliquidity,
  tradeIntensity,
  generateOrderFlowSnapshot,
  type Trade,
} from '../../../backend/src/services/orderFlowToxicityEngine';

const trade = (price: number, volume: number, timestamp: number): Trade => ({ price, volume, timestamp });

// ==================== 买卖方向（生产 tick rule） ====================
describe('classifyTrade：tick rule 定方向', () => {
  it('价格上涨 → BUY', () => {
    expect(classifyTrade(trade(100.5, 100, 1), 100)).toBe('BUY');
  });

  it('价格下跌 → SELL', () => {
    expect(classifyTrade(trade(99.5, 100, 1), 100)).toBe('SELL');
  });

  it('价格持平 → BUY（记录生产当前实现；标准 tick rule 的「同价沿用」未实现）', () => {
    expect(classifyTrade(trade(100, 100, 1), 100)).toBe('BUY');
    // 即使上一笔是下跌（100 → 99），同价 99 仍判 BUY，见文件头「生产缺陷候选」
    expect(classifyTrade(trade(99, 100, 2), 99)).toBe('BUY');
  });

  it('忽略 aggressor 字段，只看价格方向', () => {
    const risingButMarkedSell: Trade = { ...trade(100.5, 100, 1), aggressor: 'SELL' };
    expect(classifyTrade(risingButMarkedSell, 100)).toBe('BUY');
    const fallingButMarkedBuy: Trade = { ...trade(99.5, 100, 1), aggressor: 'BUY' };
    expect(classifyTrade(fallingButMarkedBuy, 100)).toBe('SELL');
  });
});

// ==================== VPIN（成交量桶） ====================
describe('calcVPIN：累计成交量阈值 → 桶值数组', () => {
  // 逐笔方向（tick rule）：+600、-400、+1000；阈值 1000 股时前两笔合成 1 桶、第 3 笔再落 1 桶
  const vpinTrades: Trade[] = [
    trade(100, 1000, 1000),
    trade(100.1, 600, 2000),
    trade(99.9, 400, 3000),
    trade(100.2, 1000, 4000),
  ];

  it('少于 2 笔返回空数组', () => {
    expect(calcVPIN([], 1000)).toEqual([]);
    expect(calcVPIN([trade(100, 100, 1)], 1000)).toEqual([]);
  });

  it('第二参是累计成交量阈值，返回桶值数组（旧断言按桶数传参、期望标量）', () => {
    expect(calcVPIN(vpinTrades, 1000)).toEqual([0.2, 1]);
  });

  it('阈值大于累计成交量时不落桶（证明不是按桶数切分）', () => {
    expect(calcVPIN(vpinTrades, 10000)).toEqual([]);
  });

  it('单边全买时每桶 VPIN=1，方向由 tick rule 而非 aggressor 决定', () => {
    const allBuy: Trade[] = [
      trade(100, 500, 1),
      { ...trade(100, 500, 2), aggressor: 'SELL' },
      { ...trade(100, 500, 3), aggressor: 'SELL' },
    ];
    expect(calcVPIN(allBuy, 500)).toEqual([1, 1]);
  });
});

// ==================== Kyle Lambda（价格冲击） ====================
describe('calcKyleLambda：|Cov/Var| 口径', () => {
  // Δp=[0.5,-0.3,0.6]，signedVolume=[+40000,-30000,+50000]
  // Cov=43000，Var=3.8e9 → λ=43000/3.8e9=1.131578947368421e-5
  const kyleTrades: Trade[] = [
    trade(100, 99999, 1000), // 首笔成交量不参与
    trade(100.5, 40000, 2000),
    trade(100.2, 30000, 3000),
    trade(100.8, 50000, 4000),
  ];

  it('少于 3 笔返回 0', () => {
    expect(calcKyleLambda([])).toBe(0);
    expect(calcKyleLambda(kyleTrades.slice(0, 2))).toBe(0);
  });

  it('精确值为 |Cov/Var|，量纲约 1e-5（旧实现是未减均值的 Σ 比值）', () => {
    const lambda = calcKyleLambda(kyleTrades);
    expect(lambda).toBeCloseTo(43000 / 3.8e9, 12);
    expect(lambda).toBeGreaterThan(0);
    expect(lambda).toBeLessThan(1e-4);
  });

  it('signedVolume 零方差时返回 0', () => {
    // 三笔同量且价格递增 → tick rule 全 BUY，signedVolume 恒为 +100，Var=0
    expect(calcKyleLambda([trade(100, 100, 1), trade(100.1, 100, 2), trade(100.2, 100, 3)])).toBe(0);
  });

  it('signedVolume 方向按 tick rule，aggressor 不影响结果', () => {
    const withAggressor = kyleTrades.map(t => ({ ...t, aggressor: 'SELL' as const }));
    expect(calcKyleLambda(withAggressor)).toBe(calcKyleLambda(kyleTrades));
  });
});

// ==================== Amihud 非流动性（滚动数组） ====================
describe('calcAmihudIlliquidity：滚动数组', () => {
  const amihudTrades: Trade[] = [trade(100, 1000, 1), trade(101, 2000, 2), trade(102, 3000, 3)];

  it('少于 2 笔返回空数组', () => {
    expect(calcAmihudIlliquidity([])).toEqual([]);
    expect(calcAmihudIlliquidity([trade(100, 1000, 1)])).toEqual([]);
  });

  it('长度=笔数、首元素固定 0、其余非负（旧断言期望单一标量）', () => {
    const result = calcAmihudIlliquidity(amihudTrades);
    expect(result).toHaveLength(3);
    expect(result[0]).toBe(0);
    expect(result.slice(1).every(v => v >= 0)).toBe(true);
  });

  it('单笔窗口精确值 = |Δp|/prevPrice/(price*volume)', () => {
    const result = calcAmihudIlliquidity(amihudTrades, 1);
    expect(result[1]).toBeCloseTo(0.01 / 202000, 15); // 1/100 / (101*2000)
    expect(result[2]).toBeCloseTo((1 / 101) / 306000, 15); // 1/101 / (102*3000)
  });

  it('window 控制滚动回看：window=2 时取最近两笔均值', () => {
    const result = calcAmihudIlliquidity(amihudTrades, 2);
    expect(result[1]).toBeCloseTo(0.01 / 202000, 15);
    expect(result[2]).toBeCloseTo((0.01 / 202000 + (1 / 101) / 306000) / 2, 15);
  });

  it('成交额为 0 的笔不计入均值，返回 0 而非 NaN', () => {
    expect(calcAmihudIlliquidity([trade(100, 1000, 1), trade(101, 0, 2)])).toEqual([0, 0]);
  });
});

// ==================== 交易强度 ====================
describe('tradeIntensity：滑动窗口笔数', () => {
  it('返回每笔 60s 窗口内的成交笔数数组', () => {
    const trades: Trade[] = [trade(100, 1, 0), trade(100, 1, 10_000), trade(100, 1, 70_000)];
    // 第 3 笔距第 2 笔 60000ms（含边界）、距第 1 笔 70000ms（超出）
    expect(tradeIntensity(trades, 60_000)).toEqual([1, 2, 2]);
  });
});

// ==================== 生产聚合快照 ====================
describe('generateOrderFlowSnapshot：生产聚合快照', () => {
  const snapshotTrades: Trade[] = [
    trade(100, 1000, 1000),
    trade(100.1, 600, 2000),
    trade(99.9, 400, 3000),
    trade(100.2, 1000, 4000),
  ];

  it('少于 2 笔返回 null', () => {
    expect(generateOrderFlowSnapshot([])).toBeNull();
    expect(generateOrderFlowSnapshot([trade(100, 100, 1)])).toBeNull();
  });

  it('聚合字段与生产单项实现一致', () => {
    const snap = generateOrderFlowSnapshot(snapshotTrades, 1000);
    expect(snap).not.toBeNull();
    expect(snap!.timestamp).toBe(4000);
    expect(snap!.vpin).toBe(1); // 最后一个桶 1000/1000
    expect(snap!.vpinSmoothed).toBeCloseTo(0.32, 12); // 0.15*1 + 0.85*0.2
    expect(snap!.toxicityLevel).toBe('MODERATE'); // 0.2 <= 0.32 < 0.4
    expect(snap!.kyleLambda).toBe(calcKyleLambda(snapshotTrades));
    expect(snap!.amihudIlliquidity).toBe(calcAmihudIlliquidity(snapshotTrades).slice(-1)[0]);
    expect(snap!.tradeIntensity).toBe(tradeIntensity(snapshotTrades, 60_000).slice(-1)[0]);
  });
});

// ==================== 未迁移：生产无同义导出的本地口径 ====================
// 说明：以下 helper 与断言保留旧测试口径，仅因生产中不存在同义导出；不作为生产实现真源。
interface ShadowTrade {
  price: number;
  volume: number;
  timestamp: number;
  aggressor: 'buy' | 'sell';
  isBlock: boolean;
}

const shadowTrades: ShadowTrade[] = [
  { price: 100, volume: 500, timestamp: 1000, aggressor: 'buy', isBlock: false },
  { price: 100.1, volume: 300, timestamp: 2000, aggressor: 'buy', isBlock: false },
  { price: 100.05, volume: 10000, timestamp: 3000, aggressor: 'sell', isBlock: true },
  { price: 99.9, volume: 400, timestamp: 4000, aggressor: 'sell', isBlock: false },
  { price: 100.2, volume: 600, timestamp: 5000, aggressor: 'buy', isBlock: false },
  { price: 100.3, volume: 200, timestamp: 6000, aggressor: 'buy', isBlock: false },
];

function calcAvgTradeSize(trades: ShadowTrade[]): number {
  if (trades.length === 0) return 0;
  return trades.reduce((sum, t) => sum + t.volume, 0) / trades.length;
}

function calcBlockTradeRatio(trades: ShadowTrade[]): number {
  if (trades.length === 0) return 0;
  return trades.filter(t => t.isBlock).length / trades.length;
}

function calcBuyPressure(trades: ShadowTrade[]): number {
  if (trades.length === 0) return 0.5;
  const total = trades.reduce((sum, t) => sum + t.volume, 0);
  if (total === 0) return 0.5;
  const buyVolume = trades.filter(t => t.aggressor === 'buy').reduce((sum, t) => sum + t.volume, 0);
  return buyVolume / total;
}

describe('未迁移：平均交易规模（生产无导出）', () => {
  it('平均交易规模应大于 0', () => {
    expect(calcAvgTradeSize(shadowTrades)).toBeGreaterThan(0);
  });

  it('空列表平均交易规模为 0', () => {
    expect(calcAvgTradeSize([])).toBe(0);
  });
});

describe('未迁移：大单比例（生产 detectLargeOrders 是事件列表口径，非比例）', () => {
  it('大单比例应大于 0 且不超过 1', () => {
    const ratio = calcBlockTradeRatio(shadowTrades);
    expect(ratio).toBeGreaterThan(0);
    expect(ratio).toBeLessThanOrEqual(1);
  });
});

describe('未迁移：买压占比（生产 orderImbalance 是 -1..1 净不平衡，口径不同）', () => {
  it('买压应大于 0 且不超过 1', () => {
    const pressure = calcBuyPressure(shadowTrades);
    expect(pressure).toBeGreaterThan(0);
    expect(pressure).toBeLessThanOrEqual(1);
  });

  it('空列表买压返回中性值 0.5', () => {
    expect(calcBuyPressure([])).toBe(0.5);
  });

  it('全买买压为 1，全卖买压为 0', () => {
    const allBuy: ShadowTrade[] = shadowTrades.map(t => ({ ...t, aggressor: 'buy' }));
    const allSell: ShadowTrade[] = shadowTrades.map(t => ({ ...t, aggressor: 'sell' }));
    expect(calcBuyPressure(allBuy)).toBe(1);
    expect(calcBuyPressure(allSell)).toBe(0);
  });
});
