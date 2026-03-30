import { describe, it, expect } from 'vitest'

// 高级财务计算引擎测试
describe('Advanced Financial Calculations', () => {
  // 自由现金流折现 (DCF)
  function calculateDCF(cashFlows: number[], discountRate: number, terminalGrowthRate = 0.02) {
    if (cashFlows.length === 0 || discountRate <= 0) return 0
    let pv = 0
    for (let i = 0; i < cashFlows.length; i++) {
      pv += cashFlows[i] / Math.pow(1 + discountRate, i + 1)
    }
    const lastCF = cashFlows[cashFlows.length - 1]
    const terminalValue = (lastCF * (1 + terminalGrowthRate)) / (discountRate - terminalGrowthRate)
    pv += terminalValue / Math.pow(1 + discountRate, cashFlows.length)
    return pv
  }

  it('should calculate DCF correctly', () => {
    const dcf = calculateDCF([100, 110, 121], 0.10, 0.03)
    expect(dcf).toBeGreaterThan(1000)
  })

  it('should handle single year cash flow', () => {
    const dcf = calculateDCF([100], 0.10)
    expect(dcf).toBeGreaterThan(100)
  })

  it('should return 0 for empty cash flows', () => {
    expect(calculateDCF([], 0.10)).toBe(0)
  })

  it('should return 0 for zero discount rate', () => {
    expect(calculateDCF([100], 0)).toBe(0)
  })

  // WACC 计算
  function calculateWACC(equityWeight: number, debtWeight: number, costOfEquity: number, costOfDebt: number, taxRate: number) {
    return equityWeight * costOfEquity + debtWeight * costOfDebt * (1 - taxRate)
  }

  it('should calculate WACC', () => {
    const wacc = calculateWACC(0.7, 0.3, 0.10, 0.05, 0.25)
    expect(wacc).toBeCloseTo(0.08125, 4)
  })

  it('should handle pure equity', () => {
    expect(calculateWACC(1, 0, 0.10, 0.05, 0.25)).toBe(0.10)
  })

  it('should handle pure debt', () => {
    expect(calculateWACC(0, 1, 0.10, 0.05, 0.25)).toBeCloseTo(0.0375, 4)
  })

  // 杜邦分析
  function dupontAnalysis(netIncome: number, revenue: number, totalAssets: number, equity: number) {
    const profitMargin = netIncome / revenue
    const assetTurnover = revenue / totalAssets
    const equityMultiplier = totalAssets / equity
    const roe = profitMargin * assetTurnover * equityMultiplier
    return { profitMargin, assetTurnover, equityMultiplier, roe }
  }

  it('should decompose ROE', () => {
    const result = dupontAnalysis(100, 1000, 500, 200)
    expect(result.profitMargin).toBe(0.1)
    expect(result.assetTurnover).toBe(2)
    expect(result.equityMultiplier).toBe(2.5)
    expect(result.roe).toBe(0.5)
  })

  it('should verify ROE equals netIncome/equity', () => {
    const result = dupontAnalysis(50, 500, 300, 100)
    expect(result.roe).toBeCloseTo(0.5, 5)
  })

  // 隐含波动率 (简化计算)
  function impliedVolatility(optionPrice: number, spotPrice: number, strike: number, timeToExpiry: number, riskFreeRate: number) {
    // 简化的隐含波动率近似
    const moneyness = Math.log(spotPrice / strike)
    const intrinsicValue = Math.max(spotPrice - strike, 0)
    if (optionPrice <= intrinsicValue || timeToExpiry <= 0) return 0
    const timeValue = optionPrice - intrinsicValue
    const iv = (timeValue / spotPrice) / Math.sqrt(timeToExpiry)
    return Math.max(0, Math.min(iv, 5))
  }

  it('should estimate implied volatility', () => {
    const iv = impliedVolatility(5.5, 100, 100, 0.25, 0.05)
    expect(iv).toBeGreaterThan(0)
    expect(iv).toBeLessThan(5)
  })

  it('should return 0 for intrinsic value only', () => {
    expect(impliedVolatility(0, 100, 100, 0.25, 0.05)).toBe(0)
  })

  // 净资产收益率分解
  function roeDecomposition(items: { netIncome: number; avgEquity: number; avgAssets: number; revenue: number }[]) {
    return items.map(item => ({
      roe: item.netIncome / item.avgEquity,
      roa: item.netIncome / item.avgAssets,
      leverage: item.avgAssets / item.avgEquity,
      turnover: item.revenue / item.avgAssets,
    }))
  }

  it('should decompose metrics', () => {
    const results = roeDecomposition([
      { netIncome: 100, avgEquity: 500, avgAssets: 1000, revenue: 2000 },
    ])
    expect(results[0].roe).toBe(0.2)
    expect(results[0].roa).toBe(0.1)
    expect(results[0].leverage).toBe(2)
  })

  // 企业价值计算
  function calculateEnterpriseValue(marketCap: number, totalDebt: number, cash: number) {
    return marketCap + totalDebt - cash
  }

  it('should calculate EV', () => {
    expect(calculateEnterpriseValue(1000, 500, 200)).toBe(1300)
  })

  it('should handle negative net debt', () => {
    expect(calculateEnterpriseValue(1000, 100, 500)).toBe(600)
  })

  // EV/EBITDA
  function calculateEVEBITDA(ev: number, ebitda: number) {
    return ebitda > 0 ? ev / ebitda : Infinity
  }

  it('should calculate EV/EBITDA', () => {
    expect(calculateEVEBITDA(1000, 200)).toBe(5)
  })

  it('should return Infinity for negative EBITDA', () => {
    expect(calculateEVEBITDA(1000, -50)).toBe(Infinity)
  })

  // PEG 比率
  function calculatePEG(pe: number, growthRate: number) {
    return growthRate > 0 ? pe / (growthRate * 100) : Infinity
  }

  it('should calculate PEG', () => {
    expect(calculatePEG(20, 0.25)).toBe(0.8)
  })

  it('should handle zero growth', () => {
    expect(calculatePEG(20, 0)).toBe(Infinity)
  })

  // 贝塔系数计算 (简化)
  function calculateBeta(stockReturns: number[], marketReturns: number[]) {
    if (stockReturns.length !== marketReturns.length || stockReturns.length < 2) return 0
    const n = stockReturns.length
    const meanS = stockReturns.reduce((s, v) => s + v, 0) / n
    const meanM = marketReturns.reduce((s, v) => s + v, 0) / n
    let cov = 0, varM = 0
    for (let i = 0; i < n; i++) {
      cov += (stockReturns[i] - meanS) * (marketReturns[i] - meanM)
      varM += (marketReturns[i] - meanM) ** 2
    }
    return varM > 0 ? cov / varM : 0
  }

  it('should calculate beta', () => {
    const stock = [0.05, 0.03, -0.02, 0.04, -0.01]
    const market = [0.03, 0.02, -0.01, 0.02, 0.00]
    const beta = calculateBeta(stock, market)
    expect(beta).toBeGreaterThan(0)
  })

  it('should handle mismatched length', () => {
    expect(calculateBeta([1], [2])).toBe(0)
  })

  // 相关系数
  function correlation(x: number[], y: number[]) {
    if (x.length !== y.length || x.length < 2) return 0
    const n = x.length
    const mx = x.reduce((s, v) => s + v, 0) / n
    const my = y.reduce((s, v) => s + v, 0) / n
    let num = 0, dx = 0, dy = 0
    for (let i = 0; i < n; i++) {
      num += (x[i] - mx) * (y[i] - my)
      dx += (x[i] - mx) ** 2
      dy += (y[i] - my) ** 2
    }
    const denom = Math.sqrt(dx * dy)
    return denom > 0 ? num / denom : 0
  }

  it('should return 1 for identical series', () => {
    expect(correlation([1, 2, 3, 4, 5], [1, 2, 3, 4, 5])).toBeCloseTo(1, 5)
  })

  it('should return -1 for inverse series', () => {
    expect(correlation([1, 2, 3, 4, 5], [5, 4, 3, 2, 1])).toBeCloseTo(-1, 5)
  })

  it('should return 0 for length < 2', () => {
    expect(correlation([1], [2])).toBe(0)
  })

  // 投资组合优化 (均值方差)
  function portfolioReturn(weights: number[], returns: number[]) {
    if (weights.length !== returns.length) return 0
    return weights.reduce((sum, w, i) => sum + w * returns[i], 0)
  }

  it('should calculate portfolio return', () => {
    expect(portfolioReturn([0.5, 0.3, 0.2], [0.10, 0.15, 0.05])).toBeCloseTo(0.105, 5)
  })

  it('should handle empty', () => {
    expect(portfolioReturn([], [])).toBe(0)
  })
})
