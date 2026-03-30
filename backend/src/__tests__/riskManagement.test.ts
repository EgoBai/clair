import { describe, it, expect } from 'vitest'

// 风险管理引擎测试
describe('Risk Management Engine', () => {
  // Value at Risk (VaR) 计算
  function calculateVaR(returns: number[], confidence = 0.95) {
    if (returns.length === 0) return 0
    const sorted = [...returns].sort((a, b) => a - b)
    const index = Math.floor((1 - confidence) * sorted.length)
    return -sorted[Math.max(0, index)]
  }

  it('should calculate VaR at 95% confidence', () => {
    const returns = [-0.05, -0.03, -0.01, 0.01, 0.02, 0.03, 0.04, 0.05]
    const var95 = calculateVaR(returns, 0.95)
    expect(var95).toBeGreaterThan(0)
  })

  it('should handle all positive returns', () => {
    const returns = [0.01, 0.02, 0.03]
    expect(calculateVaR(returns, 0.95)).toBeLessThanOrEqual(0.01)
  })

  it('should return 0 for empty array', () => {
    expect(calculateVaR([], 0.95)).toBe(0)
  })

  // Conditional VaR (CVaR / Expected Shortfall)
  function calculateCVaR(returns: number[], confidence = 0.95) {
    if (returns.length === 0) return 0
    const sorted = [...returns].sort((a, b) => a - b)
    const cutoff = Math.floor((1 - confidence) * sorted.length)
    const tail = sorted.slice(0, Math.max(1, cutoff + 1))
    return -tail.reduce((s, v) => s + v, 0) / tail.length
  }

  it('should calculate CVaR', () => {
    const returns = [-0.1, -0.05, -0.03, 0.01, 0.02]
    const cvar = calculateCVaR(returns, 0.95)
    expect(cvar).toBeGreaterThan(0)
  })

  // 最大回撤
  function maxDrawdown(equity: number[]) {
    if (equity.length === 0) return 0
    let peak = equity[0]
    let maxDD = 0
    for (const val of equity) {
      if (val > peak) peak = val
      const dd = (peak - val) / peak
      if (dd > maxDD) maxDD = dd
    }
    return maxDD
  }

  it('should calculate max drawdown', () => {
    expect(maxDrawdown([100, 120, 110, 90, 95, 130])).toBeCloseTo(0.25)
  })

  it('should return 0 for always rising', () => {
    expect(maxDrawdown([100, 110, 120, 130])).toBe(0)
  })

  it('should return 1 for drop to zero', () => {
    expect(maxDrawdown([100, 50, 0])).toBe(1)
  })

  // Calmar Ratio
  function calmarRatio(annualReturn: number, maxDD: number) {
    return maxDD > 0 ? annualReturn / maxDD : 0
  }

  it('should calculate Calmar ratio', () => {
    expect(calmarRatio(0.20, 0.10)).toBe(2)
  })

  it('should return 0 for zero drawdown', () => {
    expect(calmarRatio(0.20, 0)).toBe(0)
  })

  // 仓位管理 (凯利公式)
  function kellyCriterion(winRate: number, winLossRatio: number) {
    if (winLossRatio <= 0) return 0
    const kelly = winRate - (1 - winRate) / winLossRatio
    return Math.max(0, Math.min(kelly, 1))  // 限制0-1
  }

  it('should calculate Kelly fraction', () => {
    expect(kellyCriterion(0.6, 2)).toBeCloseTo(0.4)
  })

  it('should return 0 for unfavorable odds', () => {
    expect(kellyCriterion(0.3, 1)).toBe(0)
  })

  // 止损计算
  function calculateStopLoss(entryPrice: number, atr: number, multiplier = 2) {
    return entryPrice - atr * multiplier
  }

  it('should calculate stop loss', () => {
    expect(calculateStopLoss(100, 5, 2)).toBe(90)
  })

  // 止盈计算
  function calculateTakeProfit(entryPrice: number, stopLoss: number, riskRewardRatio = 3) {
    const risk = entryPrice - stopLoss
    return entryPrice + risk * riskRewardRatio
  }

  it('should calculate take profit', () => {
    expect(calculateTakeProfit(100, 90, 3)).toBe(130)
  })

  // 仓位大小
  function positionSize(capital: number, riskPercent: number, entryPrice: number, stopLoss: number) {
    const riskAmount = capital * riskPercent / 100
    const riskPerShare = entryPrice - stopLoss
    if (riskPerShare <= 0) return 0
    const shares = Math.floor(riskAmount / riskPerShare / 100) * 100  // A股100股整数倍
    return Math.max(0, shares)
  }

  it('should calculate position size', () => {
    expect(positionSize(100000, 2, 50, 45)).toBeGreaterThan(0)
  })

  it('should round to 100 share lots', () => {
    const shares = positionSize(100000, 1, 50, 49)
    expect(shares % 100).toBe(0)
  })

  it('should return 0 for zero risk per share', () => {
    expect(positionSize(100000, 1, 50, 50)).toBe(0)
  })

  // 组合波动率
  function portfolioVolatility(weights: number[], vols: number[], correlations: number[][]) {
    let variance = 0
    for (let i = 0; i < weights.length; i++) {
      for (let j = 0; j < weights.length; j++) {
        const corr = correlations[i]?.[j] ?? (i === j ? 1 : 0)
        variance += weights[i] * weights[j] * vols[i] * vols[j] * corr
      }
    }
    return Math.sqrt(Math.max(0, variance))
  }

  it('should calculate portfolio volatility', () => {
    const vol = portfolioVolatility([0.5, 0.5], [0.2, 0.3], [[1, 0.3], [0.3, 1]])
    expect(vol).toBeGreaterThan(0)
  })

  it('should equal single asset volatility when fully invested in one', () => {
    expect(portfolioVolatility([1, 0], [0.2, 0.3], [[1, 0], [0, 1]])).toBeCloseTo(0.2)
  })

  // 压力测试
  function stressTest(portfolio: Record<string, number>, scenarios: Record<string, Record<string, number>>) {
    return Object.entries(scenarios).map(([name, shocks]) => {
      let totalLoss = 0
      for (const [asset, value] of Object.entries(portfolio)) {
        const shock = shocks[asset] || 0
        totalLoss += value * shock
      }
      return { scenario: name, loss: totalLoss, lossPercent: totalLoss / Object.values(portfolio).reduce((s, v) => s + v, 0) }
    })
  }

  it('should run stress test scenarios', () => {
    const result = stressTest(
      { stock1: 50000, stock2: 50000 },
      { crash: { stock1: -0.3, stock2: -0.2 }, recovery: { stock1: 0.1, stock2: 0.05 } }
    )
    expect(result[0].loss).toBe(-25000)
    expect(result[1].loss).toBeGreaterThan(0)
  })

  // 风险预算
  function riskBudget(weights: number[], vols: number[]) {
    const contribs = weights.map((w, i) => w * vols[i])
    const total = contribs.reduce((s, v) => s + v, 0)
    return total > 0 ? contribs.map(c => c / total) : weights.map(() => 0)
  }

  it('should calculate risk contribution', () => {
    const budget = riskBudget([0.5, 0.5], [0.2, 0.3])
    expect(budget.reduce((s, v) => s + v, 0)).toBeCloseTo(1)
    expect(budget[1]).toBeGreaterThan(budget[0])
  })

  // 蒙特卡洛模拟 (简化)
  function monteCarloReturns(initialValue: number, annualReturn: number, annualVol: number, years: number, simulations = 100) {
    const results: number[] = []
    for (let s = 0; s < simulations; s++) {
      let value = initialValue
      for (let y = 0; y < years; y++) {
        const randomReturn = annualReturn + annualVol * (Math.random() * 2 - 1) * Math.sqrt(3)
        value *= (1 + randomReturn)
      }
      results.push(value)
    }
    return results.sort((a, b) => a - b)
  }

  it('should generate simulation results', () => {
    const results = monteCarloReturns(100000, 0.10, 0.20, 5, 100)
    expect(results).toHaveLength(100)
    expect(results[0]).toBeLessThanOrEqual(results[results.length - 1])
  })
})
