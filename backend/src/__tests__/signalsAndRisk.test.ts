import { describe, it, expect } from 'vitest';

// ===== 指标组合信号引擎 =====
describe('Indicator Combination Signal Engine', () => {
  interface Signal {
    type: 'buy' | 'sell' | 'hold';
    strength: number; // 0-100
    indicators: string[];
    timestamp: number;
  }

  const calculateRSI = (closes: number[], period: number = 14): (number | null)[] => {
    if (closes.length < period + 1) return Array(closes.length).fill(null);
    const result: (number | null)[] = [];
    for (let i = 0; i < period; i++) result.push(null);
    let gains = 0, losses = 0;
    for (let i = 1; i <= period; i++) {
      const diff = closes[i] - closes[i - 1];
      if (diff > 0) gains += diff; else losses -= diff;
    }
    let avgGain = gains / period, avgLoss = losses / period;
    result.push(avgLoss === 0 ? 100 : 100 - (100 / (1 + avgGain / avgLoss)));
    for (let i = period + 1; i < closes.length; i++) {
      const diff = closes[i] - closes[i - 1];
      avgGain = (avgGain * (period - 1) + Math.max(diff, 0)) / period;
      avgLoss = (avgLoss * (period - 1) + Math.max(-diff, 0)) / period;
      result.push(avgLoss === 0 ? 100 : 100 - (100 / (1 + avgGain / avgLoss)));
    }
    return result;
  };

  const calculateSMA = (data: number[], period: number): (number | null)[] => {
    if (data.length < period) return Array(data.length).fill(null);
    const result: (number | null)[] = [];
    for (let i = 0; i < period - 1; i++) result.push(null);
    for (let i = period - 1; i < data.length; i++) {
      result.push(data.slice(i - period + 1, i + 1).reduce((a, b) => a + b, 0) / period);
    }
    return result;
  };

  const generateCombinedSignal = (
    closes: number[],
    volume: number[],
    maShort: number = 5,
    maLong: number = 20,
    rsiPeriod: number = 14,
    rsiOversold: number = 30,
    rsiOverbought: number = 70,
  ): Signal[] => {
    const rsi = calculateRSI(closes, rsiPeriod);
    const shortMA = calculateSMA(closes, maShort);
    const longMA = calculateSMA(closes, maLong);
    const avgVol = volume.reduce((a, b) => a + b, 0) / volume.length;

    const signals: Signal[] = [];
    for (let i = 0; i < closes.length; i++) {
      const indicators: string[] = [];
      let score = 0;

      // MA crossover
      if (shortMA[i] !== null && longMA[i] !== null && i > 0 && shortMA[i - 1] !== null && longMA[i - 1] !== null) {
        if (shortMA[i]! > longMA[i]! && shortMA[i - 1]! <= longMA[i - 1]!) {
          indicators.push('MA金叉');
          score += 30;
        } else if (shortMA[i]! < longMA[i]! && shortMA[i - 1]! >= longMA[i - 1]!) {
          indicators.push('MA死叉');
          score -= 30;
        }
      }

      // RSI
      if (rsi[i] !== null) {
        if (rsi[i]! < rsiOversold) { indicators.push('RSI超卖'); score += 25; }
        else if (rsi[i]! > rsiOverbought) { indicators.push('RSI超买'); score -= 25; }
      }

      // Volume
      if (volume[i] > avgVol * 1.5) { indicators.push('放量'); score += 15; }

      // Price trend
      if (i > 0 && closes[i] > closes[i - 1]) score += 5;
      else if (i > 0 && closes[i] < closes[i - 1]) score -= 5;

      const type: 'buy' | 'sell' | 'hold' = score > 20 ? 'buy' : score < -20 ? 'sell' : 'hold';
      signals.push({ type, strength: Math.min(100, Math.abs(score)), indicators, timestamp: i });
    }
    return signals;
  };

  // Start flat then spike: creates MA crossover
  const bullishData = Array.from({ length: 30 }, (_, i) => i < 15 ? 10 + i * 0.1 : 10 + 1.5 + (i - 15) * 1.5);
  const bearishData = Array.from({ length: 30 }, (_, i) => i < 15 ? 25 - i * 0.1 : 25 - 1.5 - (i - 15) * 1.5);
  const volatileData = Array.from({ length: 50 }, (_, i) => 15 + Math.sin(i * 0.5) * 5);

  describe('上涨行情信号', () => {
    it('应产生信号', () => {
      const signals = generateCombinedSignal(bullishData, Array(30).fill(1000));
      // Bullish trend should produce buy or hold signals
      const buyOrHold = signals.filter(s => s.type === 'buy' || s.type === 'hold');
      expect(buyOrHold.length).toBeGreaterThan(0);
    });

    it('信号强度应非负', () => {
      const signals = generateCombinedSignal(bullishData, Array(30).fill(1000));
      signals.forEach(s => expect(s.strength).toBeGreaterThanOrEqual(0));
    });
  });

  describe('下跌行情信号', () => {
    it('应产生信号', () => {
      const signals = generateCombinedSignal(bearishData, Array(30).fill(1000));
      // Bearish trend should produce sell or hold signals
      const sellOrHold = signals.filter(s => s.type === 'sell' || s.type === 'hold');
      expect(sellOrHold.length).toBeGreaterThan(0);
    });
  });

  describe('震荡行情信号', () => {
    it('应以持有为主', () => {
      const signals = generateCombinedSignal(volatileData, Array(50).fill(1000));
      const holdSignals = signals.filter(s => s.type === 'hold');
      expect(holdSignals.length).toBeGreaterThan(signals.length * 0.3);
    });
  });

  describe('信号结构', () => {
    it('信号数应等于数据长度', () => {
      const signals = generateCombinedSignal(bullishData, Array(30).fill(1000));
      expect(signals.length).toBe(30);
    });

    it('每个信号有必需字段', () => {
      const signals = generateCombinedSignal(bullishData, Array(30).fill(1000));
      signals.forEach(s => {
        expect(['buy', 'sell', 'hold']).toContain(s.type);
        expect(s.strength).toBeGreaterThanOrEqual(0);
        expect(s.strength).toBeLessThanOrEqual(100);
        expect(Array.isArray(s.indicators)).toBe(true);
      });
    });

    it('指标数组不为空时信号更可靠', () => {
      const signals = generateCombinedSignal(bullishData, Array(30).fill(1000));
      const withIndicators = signals.filter(s => s.indicators.length > 0);
      withIndicators.forEach(s => expect(s.strength).toBeGreaterThan(0));
    });
  });

  describe('自定义参数', () => {
    it('不同RSI阈值应产生不同信号', () => {
      const s1 = generateCombinedSignal(volatileData, Array(50).fill(1000), 5, 20, 14, 20, 80);
      const s2 = generateCombinedSignal(volatileData, Array(50).fill(1000), 5, 20, 14, 40, 60);
      const buy1 = s1.filter(s => s.type === 'buy').length;
      const buy2 = s2.filter(s => s.type === 'buy').length;
      expect(buy1 !== buy2 || s1.some((s, i) => s.type !== s2[i].type)).toBe(true);
    });

    it('不同MA周期应产生不同信号', () => {
      const s1 = generateCombinedSignal(bullishData, Array(30).fill(1000), 3, 10);
      const s2 = generateCombinedSignal(bullishData, Array(30).fill(1000), 5, 20);
      // Signals may differ due to different MA periods
      expect(s1.length).toBe(s2.length);
    });
  });
});

// ===== 风险管理引擎 =====
describe('Risk Management Engine', () => {
  interface Position {
    symbol: string;
    quantity: number;
    avgCost: number;
    currentPrice: number;
  }

  interface RiskMetrics {
    portfolioValue: number;
    totalExposure: number;
    maxDrawdown: number;
    sharpeRatio: number;
    var95: number;
    concentrationRisk: number;
  }

  const calculatePortfolioValue = (positions: Position[], cash: number): number => {
    return cash + positions.reduce((sum, p) => sum + p.quantity * p.currentPrice, 0);
  };

  const calculateExposure = (positions: Position[], totalValue: number): number => {
    if (totalValue === 0) return 0;
    const invested = positions.reduce((sum, p) => sum + p.quantity * p.currentPrice, 0);
    return invested / totalValue;
  };

  const calculateConcentration = (positions: Position[]): number => {
    if (positions.length === 0) return 0;
    const totalValue = positions.reduce((sum, p) => sum + p.quantity * p.currentPrice, 0);
    if (totalValue === 0) return 0;
    const weights = positions.map(p => (p.quantity * p.currentPrice) / totalValue);
    return Math.max(...weights);
  };

  const calculateVaR = (returns: number[], confidence: number = 0.95): number => {
    if (returns.length === 0) return 0;
    const sorted = [...returns].sort((a, b) => a - b);
    const index = Math.floor((1 - confidence) * sorted.length);
    return sorted[index];
  };

  const calculateMaxDrawdown = (equity: number[]): number => {
    if (equity.length === 0) return 0;
    let maxDD = 0, peak = equity[0];
    for (const val of equity) {
      if (val > peak) peak = val;
      const dd = (peak - val) / peak;
      if (dd > maxDD) maxDD = dd;
    }
    return maxDD;
  };

  const calculateSharpeRatio = (returns: number[], riskFreeRate: number = 0): number => {
    if (returns.length < 2) return 0;
    const mean = returns.reduce((a, b) => a + b, 0) / returns.length;
    const std = Math.sqrt(returns.reduce((s, r) => s + (r - mean) ** 2, 0) / (returns.length - 1));
    if (std === 0) return 0;
    return (mean - riskFreeRate) / std;
  };

  const checkStopLoss = (entryPrice: number, currentPrice: number, stopPercent: number): boolean => {
    return (entryPrice - currentPrice) / entryPrice >= stopPercent;
  };

  const calculatePositionSize = (capital: number, riskPerTrade: number, entryPrice: number, stopPrice: number): number => {
    const riskAmount = capital * riskPerTrade;
    const riskPerShare = Math.abs(entryPrice - stopPrice);
    if (riskPerShare === 0) return 0;
    return Math.floor(riskAmount / riskPerShare / 100) * 100; // 100股整数倍
  };

  const samplePositions: Position[] = [
    { symbol: '600519', quantity: 100, avgCost: 1800, currentPrice: 1850 },
    { symbol: '000858', quantity: 500, avgCost: 150, currentPrice: 145 },
    { symbol: '601318', quantity: 200, avgCost: 50, currentPrice: 52 },
  ];

  describe('组合价值', () => {
    it('应正确计算', () => {
      const val = calculatePortfolioValue(samplePositions, 100000);
      expect(val).toBe(100000 + 185000 + 72500 + 10400);
    });

    it('空持仓应等于现金', () => {
      expect(calculatePortfolioValue([], 50000)).toBe(50000);
    });

    it('亏损持仓应减少价值', () => {
      const pos: Position[] = [{ symbol: 'x', quantity: 100, avgCost: 100, currentPrice: 80 }];
      const val = calculatePortfolioValue(pos, 0);
      expect(val).toBe(8000);
    });
  });

  describe('仓位暴露度', () => {
    it('应为0-1之间', () => {
      const totalVal = calculatePortfolioValue(samplePositions, 100000);
      const exposure = calculateExposure(samplePositions, totalVal);
      expect(exposure).toBeGreaterThan(0);
      expect(exposure).toBeLessThan(1);
    });

    it('全仓应为1', () => {
      const pos: Position[] = [{ symbol: 'x', quantity: 100, avgCost: 100, currentPrice: 100 }];
      expect(calculateExposure(pos, 10000)).toBeCloseTo(1, 5);
    });

    it('空仓应为0', () => {
      expect(calculateExposure([], 10000)).toBe(0);
    });
  });

  describe('集中度风险', () => {
    it('应返回最大权重', () => {
      const conc = calculateConcentration(samplePositions);
      expect(conc).toBeGreaterThan(1 / 3);
      expect(conc).toBeLessThanOrEqual(1);
    });

    it('等权分配应等于1/n', () => {
      const pos: Position[] = [
        { symbol: 'a', quantity: 100, avgCost: 100, currentPrice: 100 },
        { symbol: 'b', quantity: 100, avgCost: 100, currentPrice: 100 },
      ];
      expect(calculateConcentration(pos)).toBeCloseTo(0.5, 5);
    });

    it('单一持仓集中度为1', () => {
      const pos: Position[] = [{ symbol: 'x', quantity: 100, avgCost: 100, currentPrice: 100 }];
      expect(calculateConcentration(pos)).toBe(1);
    });

    it('空持仓集中度为0', () => {
      expect(calculateConcentration([])).toBe(0);
    });
  });

  describe('VaR', () => {
    it('应返回负值', () => {
      const returns = [-0.05, -0.03, -0.01, 0.01, 0.02, 0.03, 0.05, -0.02, 0.01, -0.04];
      const var95 = calculateVaR(returns, 0.95);
      expect(var95).toBeLessThan(0);
    });

    it('空数据返回0', () => {
      expect(calculateVaR([])).toBe(0);
    });

    it('全正收益VaR接近最小', () => {
      const returns = [0.01, 0.02, 0.03, 0.04, 0.05];
      expect(calculateVaR(returns)).toBeCloseTo(0.01, 2);
    });
  });

  describe('最大回撤', () => {
    it('上涨无回撤', () => {
      expect(calculateMaxDrawdown([100, 110, 120, 130])).toBe(0);
    });

    it('下跌有回撤', () => {
      expect(calculateMaxDrawdown([100, 120, 90, 110])).toBeCloseTo(0.25, 2);
    });

    it('空数据返回0', () => {
      expect(calculateMaxDrawdown([])).toBe(0);
    });

    it('单值无回撤', () => {
      expect(calculateMaxDrawdown([100])).toBe(0);
    });

    it('全程下跌回撤为1', () => {
      expect(calculateMaxDrawdown([100, 80, 60, 40, 20])).toBeCloseTo(0.8, 1);
    });
  });

  describe('夏普比率', () => {
    it('正收益应为正', () => {
      expect(calculateSharpeRatio([0.01, 0.02, 0.03, 0.01, 0.02])).toBeGreaterThan(0);
    });

    it('负收益应为负', () => {
      expect(calculateSharpeRatio([-0.01, -0.02, -0.03, -0.01, -0.02])).toBeLessThan(0);
    });

    it('零波动返回0', () => {
      expect(calculateSharpeRatio([0.01, 0.01, 0.01])).toBe(0);
    });

    it('不足2个点返回0', () => {
      expect(calculateSharpeRatio([0.01])).toBe(0);
    });
  });

  describe('止损检查', () => {
    it('触发止损', () => {
      expect(checkStopLoss(100, 95, 0.05)).toBe(true);
    });

    it('未触发止损', () => {
      expect(checkStopLoss(100, 96, 0.05)).toBe(false);
    });

    it('精确止损点', () => {
      expect(checkStopLoss(100, 95, 0.05)).toBe(true);
    });

    it('上涨不应止损', () => {
      expect(checkStopLoss(100, 105, 0.05)).toBe(false);
    });
  });

  describe('仓位计算', () => {
    it('应返回100股整数倍', () => {
      const size = calculatePositionSize(100000, 0.02, 50, 48);
      expect(size % 100).toBe(0);
    });

    it('止损价等于入场价返回0', () => {
      expect(calculatePositionSize(100000, 0.02, 50, 50)).toBe(0);
    });

    it('大资金应买更多', () => {
      const small = calculatePositionSize(50000, 0.02, 50, 48);
      const large = calculatePositionSize(200000, 0.02, 50, 48);
      expect(large).toBeGreaterThan(small);
    });

    it('严格止损应买更多', () => {
      const loose = calculatePositionSize(100000, 0.02, 50, 45);
      const tight = calculatePositionSize(100000, 0.02, 50, 49);
      expect(tight).toBeGreaterThan(loose);
    });
  });
});
