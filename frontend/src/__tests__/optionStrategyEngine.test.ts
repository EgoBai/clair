import { describe, it, expect } from 'vitest';
import {
  buildBullCallSpread,
  buildIronCondor,
  buildStraddle,
  type OptionStrategy,
} from '../utils/advancedOptionsEngine';

/**
 * 期权组合策略引擎测试（影子测试迁移版）
 *
 * 已删除测试内自抄的牛市价差/铁鹰/跨式构建实现，绑定产品仓真实实现：
 * - 牛市看涨价差：frontend/src/utils/advancedOptionsEngine.ts buildBullCallSpread (L180)
 * - 跨式：frontend/src/utils/advancedOptionsEngine.ts buildStraddle (L226)
 * - 铁鹰：frontend/src/utils/advancedOptionsEngine.ts buildIronCondor (L240)
 *
 * 未迁移（生产无对应导出，保留内联 helper，见下方注释）：
 * - 到期收益 calcPayoff：advancedOptionsEngine 未导出到期 payoff；optionsPricingEngine.priceStrategy
 *   是 Black-Scholes 定价（含时间价值），不是到期收益口径，不能顶替。
 * - 备兑看涨 buildCoveredCall：生产仓无 covered call 构建器。
 */

// 未迁移：生产仓无到期收益函数与带 premium 的 leg 契约，内联 helper 仅服务备兑看涨与空 legs 用例。
interface LegacyLeg {
  type: 'call' | 'put';
  strike: number;
  premium: number;
  quantity: number;
  side: 'long' | 'short';
  expiry: number;
}

interface LegacyStrategy {
  name: string;
  legs: LegacyLeg[];
  maxProfit: number;
  maxLoss: number;
  breakeven: number[];
  margin: number;
}

function calcPayoff(legs: LegacyLeg[], spotPrice: number): number {
  return legs.reduce((total, leg) => {
    const intrinsic = leg.type === 'call'
      ? Math.max(spotPrice - leg.strike, 0)
      : Math.max(leg.strike - spotPrice, 0);
    const payoff = leg.side === 'long'
      ? (intrinsic - leg.premium) * leg.quantity
      : (leg.premium - intrinsic) * leg.quantity;
    return total + payoff;
  }, 0);
}

// 未迁移：生产仓无备兑看涨（covered call）策略构建器。
function buildCoveredCall(stockPrice: number, callStrike: number, callPremium: number): LegacyStrategy {
  const maxProfit = (callStrike - stockPrice) + callPremium;
  const maxLoss = stockPrice - callPremium;
  return {
    name: '备兑看涨',
    legs: [
      { type: 'call', strike: callStrike, premium: callPremium, quantity: 100, side: 'short', expiry: 30 },
    ],
    maxProfit,
    maxLoss: -maxLoss,
    breakeven: [stockPrice - callPremium],
    margin: stockPrice * 100,
  };
}

/**
 * 未迁移：生产无到期收益导出。按生产 OptionStrategy.legs 的 type/strike/action/quantity
 * 计算到期内在价值，再扣除净支付权利金（生产以每股口径给出：买方为正、卖方为负）。
 */
function expiryPayoff(
  legs: OptionStrategy['legs'],
  spotPrice: number,
  netPremiumPaid: number,
): number {
  return legs.reduce((total, leg) => {
    const intrinsic = leg.type === 'call'
      ? Math.max(spotPrice - leg.strike, 0)
      : Math.max(leg.strike - spotPrice, 0);
    const direction = leg.action === 'buy' ? 1 : -1;
    return total + intrinsic * leg.quantity * direction;
  }, 0) - netPremiumPaid;
}

describe('期权组合策略引擎', () => {
  it('应计算到期收益', () => {
    // 未迁移：生产无 payoff 导出，保留内联 calcPayoff 的旧口径断言。
    const legs: LegacyLeg[] = [
      { type: 'call', strike: 100, premium: 5, quantity: 100, side: 'long', expiry: 30 },
    ];
    expect(calcPayoff(legs, 110)).toBe(500); // (110-100-5)*100
    expect(calcPayoff(legs, 95)).toBe(-500); // (0-5)*100
    expect(calcPayoff(legs, 105)).toBe(0);
  });

  it('应构建备兑看涨', () => {
    // 未迁移：生产无备兑看涨构建器。
    const strategy = buildCoveredCall(100, 110, 3);
    expect(strategy.name).toBe('备兑看涨');
    expect(strategy.maxProfit).toBe(13);
    expect(strategy.breakeven).toContain(97);
  });

  it('应构建牛市价差', () => {
    const strategy = buildBullCallSpread(100, 100, 110, 5);
    expect(strategy.name).toBe('牛市看涨价差');
    expect(strategy.maxProfit).toBe(5); // 旧值 500：生产按每股口径，不乘合约乘数 100
    expect(strategy.maxLoss).toBe(5); // 旧值 -500：生产以正数表示净权利金成本
    expect(strategy.legs.length).toBe(2);
  });

  it('应构建铁鹰策略', () => {
    const strategy = buildIronCondor(100, 90, 95, 105, 110, 4);
    expect(strategy.name).toBe('铁鹰策略'); // 旧值 '铁鹰'
    expect(strategy.legs.length).toBe(4);
    expect(strategy.maxProfit).toBe(4); // 旧值 400：生产按每股净权利金
    expect(strategy.maxLoss).toBe(1); // 翼宽 95-90=5 减净权利金 4
    expect(strategy.breakeven).toEqual([94, 101]);
  });

  it('应构建跨式策略', () => {
    const strategy = buildStraddle(100, 100, 9);
    expect(strategy.name).toBe('跨式策略'); // 旧值 '跨式'
    expect(strategy.maxProfit).toBe(Infinity);
    expect(strategy.maxLoss).toBe(9); // 旧值 -900：生产为买入的总权利金（每股）
    expect(strategy.breakeven).toEqual([91, 109]);
  });

  it('备兑看涨最大收益有限', () => {
    // 未迁移：生产无备兑看涨构建器 / payoff 导出。
    const strategy = buildCoveredCall(100, 110, 3);
    expect(calcPayoff(strategy.legs, 150)).toBeLessThanOrEqual(strategy.maxProfit * 100 + 1);
  });

  it('跨式双向突破盈利', () => {
    const strategy = buildStraddle(100, 100, 9);
    const highPayoff = expiryPayoff(strategy.legs, 120, strategy.maxLoss);
    const lowPayoff = expiryPayoff(strategy.legs, 80, strategy.maxLoss);
    expect(highPayoff).toBeGreaterThan(0); // 20 - 9 = 11（旧内联口径 1100，含 ×100）
    expect(lowPayoff).toBeGreaterThan(0); // 20 - 9 = 11（旧内联口径 1100，含 ×100）
  });

  it('铁鹰中间区间盈利', () => {
    const strategy = buildIronCondor(100, 90, 95, 105, 110, 4);
    const middlePayoff = expiryPayoff(strategy.legs, 100, -strategy.maxProfit);
    expect(middlePayoff).toBeGreaterThan(0); // 净权利金 4（旧内联口径 400，含 ×100）
  });

  it('策略应有legs', () => {
    const strategies = [
      buildBullCallSpread(100, 100, 110, 5),
      buildIronCondor(100, 90, 95, 105, 110, 4),
      buildStraddle(100, 100, 9),
    ];
    strategies.forEach((s) => {
      expect(s.legs.length).toBeGreaterThan(0);
      expect(s.name).toBeTruthy();
    });
  });

  it('空legs收益应为零', () => {
    // 未迁移：生产无 payoff 导出；空 legs 在各口径下收益均为 0。
    expect(calcPayoff([], 100)).toBe(0);
  });
});
