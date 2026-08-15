/**
 * 仓位管理引擎测试 —— 直接驱动真实模块
 * 说明: 原测试内联重实现了 kelly/fixed/atr/riskBudget/calculatePosition, 逻辑与真实模块基本一致,
 *       但 atrSize 真实签名是 atrSize(params, atrMultiplier) 而非拆分参数, 已修正调用方式。
 *       改用真实 PositionSizingEngine 类。
 */
import { describe, it, expect } from 'vitest';
import { PositionSizingEngine, type PositionParams } from '../utils/positionSizingEngine';

const engine = new PositionSizingEngine();

const baseParams: PositionParams = {
  capital: 1000000,
  entryPrice: 50,
  stopLoss: 48,
  winRate: 0.6,
  avgWin: 5,
  avgLoss: 3,
  atr: 1.5,
  maxRiskPct: 2,
};

describe('kellySize', () => {
  it('有利赔率应输出正仓位', () => {
    const r = engine.kellySize(baseParams);
    expect(r.shares).toBeGreaterThan(0);
    expect(r.pct).toBeGreaterThan(0);
  });

  it('不利赔率应返回 0', () => {
    const r = engine.kellySize({ ...baseParams, winRate: 0.3, avgWin: 2, avgLoss: 5 });
    expect(r.shares).toBe(0);
  });

  it('avgLoss 为 0 时应返回 0', () => {
    expect(engine.kellySize({ ...baseParams, avgLoss: 0 }).shares).toBe(0);
  });

  it('应使用半 Kelly(占比不超过 50%)', () => {
    expect(engine.kellySize(baseParams).pct).toBeLessThanOrEqual(50);
  });

  it('应取整到整手(100 股)', () => {
    expect(engine.kellySize(baseParams).shares % 100).toBe(0);
  });
});

describe('fixedPctSize', () => {
  it('应计算固定比例仓位', () => {
    // 1000000 * 0.02 / 50 = 400 股
    expect(engine.fixedPctSize(1000000, 50, 2)).toBe(400);
  });

  it('价格过高应返回 0', () => {
    expect(engine.fixedPctSize(1000, 100000, 2)).toBe(0);
  });
});

describe('atrSize', () => {
  it('应基于 ATR 计算仓位(整手)', () => {
    // riskAmount = 1000000*1% = 10000, perShareRisk = 1.5*2 = 3, floor(10000/3/100)*100 = 3300
    const shares = engine.atrSize(baseParams, 2);
    expect(shares).toBeGreaterThan(0);
    expect(shares % 100).toBe(0);
  });

  it('ATR 为 0 应返回 0', () => {
    expect(engine.atrSize({ ...baseParams, atr: 0 }, 2)).toBe(0);
  });

  it('更大的 ATR 乘数应减小仓位', () => {
    const small = engine.atrSize(baseParams, 4);
    const large = engine.atrSize(baseParams, 2);
    expect(small).toBeLessThanOrEqual(large);
  });
});

describe('riskBudgetSize', () => {
  it('应基于止损风险预算计算仓位', () => {
    // riskAmount = 20000, riskPerShare = 2, floor(20000/2/100)*100 = 10000
    expect(engine.riskBudgetSize(1000000, 50, 48, 2)).toBe(10000);
  });

  it('止损价不低于入场价应返回 0', () => {
    expect(engine.riskBudgetSize(1000000, 50, 50, 2)).toBe(0);
    expect(engine.riskBudgetSize(1000000, 50, 52, 2)).toBe(0);
  });
});

describe('calculatePosition', () => {
  it('应返回各方法仓位及推荐值(取最保守)', () => {
    const r = engine.calculatePosition(baseParams);
    expect(r.kellyShares).toBeGreaterThanOrEqual(0);
    expect(r.fixedPctShares).toBeGreaterThanOrEqual(0);
    expect(r.atrShares).toBeGreaterThanOrEqual(0);
    expect(r.riskBudgetShares).toBeGreaterThanOrEqual(0);
    expect(r.recommendedShares).toBeLessThanOrEqual(r.kellyShares);
    expect(r.recommendedShares).toBeLessThanOrEqual(r.fixedPctShares);
    expect(r.recommendedShares).toBeLessThanOrEqual(r.atrShares);
    expect(r.recommendedShares).toBeLessThanOrEqual(r.riskBudgetShares);
  });

  it('应计算风险金额与期望值', () => {
    const r = engine.calculatePosition(baseParams);
    expect(r.riskAmount).toBeGreaterThanOrEqual(0);
    expect(typeof r.expectedValue).toBe('number');
  });
});
