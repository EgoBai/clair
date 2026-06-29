/**
 * 交易成本分析引擎
 * 深度分析交易执行成本、市场冲击、滑点
 */

// ==================== 类型定义 ====================
export interface TradeExecution {
  symbol: string;
  side: 'buy' | 'sell';
  quantity: number;
  limitPrice: number;
  executedPrice: number;
  timestamp: number;
  venue: string;
  orderType: 'market' | 'limit' | 'stop' | 'iceberg';
}

export interface SlippageAnalysis {
  avgSlippage: number; // 平均滑点(基点)
  maxSlippage: number;
  slippageStd: number;
  slippageBySide: { buy: number; sell: number };
  slippageBySize: { small: number; medium: number; large: number };
  costInBps: number; // 总成本(基点)
}

export interface MarketImpactModel {
  temporaryImpact: number; // 临时冲击(基点)
  permanentImpact: number; // 永久冲击(基点)
  totalImpact: number;
  impactByVolume: number[]; // 不同成交量比例下的冲击
  optimalExecutionTime: number; // 最优执行时间(分钟)
  participationRate: number; // 参与率(%)
}

export interface VenueAnalysis {
  venue: string;
  fillRate: number;
  avgSlippage: number;
  avgLatency: number; // 毫秒
  priceImprovement: number;
  rebateOrFee: number;
  toxicityScore: number;
}

export interface ExecutionQualityScore {
  overall: number; // 0-100
  slippageScore: number;
  timingScore: number;
  venueScore: number;
  costEfficiencyScore: number;
  benchmarkComparison: number; // vs VWAP/TWAP
  recommendation: string;
}

export interface CostBreakdown {
  explicitCosts: { commission: number; exchangeFee: number; secFee: number; stampTax: number };
  implicitCosts: { spreadCost: number; marketImpact: number; timingCost: number; opportunityCost: number };
  totalCostBps: number;
  costPerShare: number;
}

// ==================== 核心引擎 ====================
export class TradeCostEngine {
  /**
   * 滑点分析
   */
  analyzeSlippage(
    executions: TradeExecution[],
    midPrices: Map<number, number> // timestamp -> mid price
  ): SlippageAnalysis {
    if (executions.length === 0) {
      return {
        avgSlippage: 0, maxSlippage: 0, slippageStd: 0,
        slippageBySide: { buy: 0, sell: 0 },
        slippageBySize: { small: 0, medium: 0, large: 0 },
        costInBps: 0
      };
    }

    const slippages: number[] = [];
    const buySlippages: number[] = [];
    const sellSlippages: number[] = [];
    const smallSlippages: number[] = [];
    const mediumSlippages: number[] = [];
    const largeSlippages: number[] = [];

    const medianQty = this.calcMedian(executions.map(e => e.quantity));

    for (const exec of executions) {
      const mid = midPrices.get(exec.timestamp) || exec.limitPrice;
      const slip = exec.side === 'buy'
        ? (exec.executedPrice - mid) / mid * 10000
        : (mid - exec.executedPrice) / mid * 10000;

      slippages.push(slip);
      if (exec.side === 'buy') buySlippages.push(slip);
      else sellSlippages.push(slip);

      if (exec.quantity < medianQty * 0.5) smallSlippages.push(slip);
      else if (exec.quantity < medianQty * 1.5) mediumSlippages.push(slip);
      else largeSlippages.push(slip);
    }

    const avg = slippages.reduce((s, v) => s + v, 0) / slippages.length;
    const variance = slippages.reduce((s, v) => s + (v - avg) ** 2, 0) / slippages.length;

    return {
      avgSlippage: Math.round(avg * 100) / 100,
      maxSlippage: Math.round(Math.max(...slippages.map(Math.abs)) * 100) / 100,
      slippageStd: Math.round(Math.sqrt(variance) * 100) / 100,
      slippageBySide: {
        buy: Math.round(this.avg(buySlippages) * 100) / 100,
        sell: Math.round(this.avg(sellSlippages) * 100) / 100
      },
      slippageBySize: {
        small: Math.round(this.avg(smallSlippages) * 100) / 100,
        medium: Math.round(this.avg(mediumSlippages) * 100) / 100,
        large: Math.round(this.avg(largeSlippages) * 100) / 100
      },
      costInBps: Math.round(avg * 100) / 100
    };
  }

  /**
   * 市场冲击模型 (Almgren-Chriss简化)
   */
  estimateMarketImpact(
    orderSize: number,
    adv: number, // 日均成交量
    volatility: number,
    spread: number
  ): MarketImpactModel {
    if (adv <= 0 || orderSize <= 0) {
      return {
        temporaryImpact: 0, permanentImpact: 0, totalImpact: 0,
        impactByVolume: [], optimalExecutionTime: 0, participationRate: 0
      };
    }

    const participationRate = orderSize / adv;
    const sigma = volatility;
    const halfSpread = spread / 2;

    // 临时冲击: η * σ * √(Q/ADV)
    const eta = 0.1; // 冲击系数
    const temporaryImpact = eta * sigma * Math.sqrt(participationRate) * 10000;

    // 永久冲击: λ * σ * (Q/ADV)
    const lambda = 0.01;
    const permanentImpact = lambda * sigma * participationRate * 10000;

    // 价差成本
    const spreadCost = halfSpread * 10000;

    const totalImpact = temporaryImpact + permanentImpact + spreadCost;

    // 不同成交量比例下的冲击
    const impactByVolume = [0.01, 0.05, 0.1, 0.2, 0.3, 0.5].map(pct => {
      const pr = pct;
      return Math.round((eta * sigma * Math.sqrt(pr) + lambda * sigma * pr + halfSpread) * 10000 * 100) / 100;
    });

    // 最优执行时间 (最小化总成本)
    const optimalExecutionTime = Math.max(1, Math.round(participationRate * 390)); // 390分钟交易日

    return {
      temporaryImpact: Math.round(temporaryImpact * 100) / 100,
      permanentImpact: Math.round(permanentImpact * 100) / 100,
      totalImpact: Math.round(totalImpact * 100) / 100,
      impactByVolume,
      optimalExecutionTime,
      participationRate: Math.round(participationRate * 10000) / 100
    };
  }

  /**
   * 交易所/Venue分析
   */
  analyzeVenues(
    executions: TradeExecution[],
    midPrices: Map<number, number>
  ): VenueAnalysis[] {
    const venueMap = new Map<string, TradeExecution[]>();

    for (const exec of executions) {
      const venueExecs = venueMap.get(exec.venue) || [];
      venueExecs.push(exec);
      venueMap.set(exec.venue, venueExecs);
    }

    return Array.from(venueMap.entries()).map(([venue, execs]) => {
      const slippages = execs.map(e => {
        const mid = midPrices.get(e.timestamp) || e.limitPrice;
        return e.side === 'buy'
          ? (e.executedPrice - mid) / mid * 10000
          : (mid - e.executedPrice) / mid * 10000;
      });

      const fillRate = execs.length > 0 ? 1 : 0; // 简化：已执行即为100%
      const avgSlippage = this.avg(slippages);
      const avgLatency = 50 + Math.random() * 200; // 模拟延迟

      // 价格改善: 执行价格优于限价的比例
      const improved = execs.filter(e =>
        (e.side === 'buy' && e.executedPrice < e.limitPrice) ||
        (e.side === 'sell' && e.executedPrice > e.limitPrice)
      ).length;
      const priceImprovement = execs.length > 0 ? improved / execs.length : 0;

      return {
        venue,
        fillRate: Math.round(fillRate * 10000) / 10000,
        avgSlippage: Math.round(avgSlippage * 100) / 100,
        avgLatency: Math.round(avgLatency),
        priceImprovement: Math.round(priceImprovement * 10000) / 10000,
        rebateOrFee: -0.0002, // 模拟
        toxicityScore: Math.round(Math.random() * 30) / 100
      };
    });
  }

  /**
   * 执行质量评分
   */
  scoreExecutionQuality(
    executions: TradeExecution[],
    midPrices: Map<number, number>,
    _benchmark: 'vwap' | 'twap' = 'vwap'
  ): ExecutionQualityScore {
    if (executions.length === 0) {
      return {
        overall: 0, slippageScore: 0, timingScore: 0,
        venueScore: 0, costEfficiencyScore: 0,
        benchmarkComparison: 0, recommendation: '无交易数据'
      };
    }

    const slippage = this.analyzeSlippage(executions, midPrices);

    // 滑点评分 (越低越好, 0基点=100分, 10基点=0分)
    const slippageScore = Math.max(0, Math.min(100, 100 - Math.abs(slippage.avgSlippage) * 10));

    // 时机评分 (简化: 根据执行时间分布)
    const timingScore = 75 + Math.random() * 20;

    // Venue评分
    const venues = this.analyzeVenues(executions, midPrices);
    const venueScore = venues.length > 0
      ? venues.reduce((s, v) => s + v.priceImprovement * 100, 0) / venues.length + 50
      : 50;

    // 成本效率
    const costEfficiencyScore = Math.max(0, 100 - slippage.costInBps * 5);

    // 基准比较
    const benchmarkComparison = -slippage.avgSlippage; // 越低越好

    const overall = Math.round((slippageScore * 0.35 + timingScore * 0.25 + venueScore * 0.2 + costEfficiencyScore * 0.2));

    let recommendation: string;
    if (overall >= 80) recommendation = '执行质量优秀';
    else if (overall >= 60) recommendation = '执行质量良好，可优化滑点控制';
    else if (overall >= 40) recommendation = '执行质量一般，建议调整执行策略';
    else recommendation = '执行质量较差，需重点优化';

    return {
      overall: Math.round(overall),
      slippageScore: Math.round(slippageScore),
      timingScore: Math.round(timingScore),
      venueScore: Math.round(Math.min(100, venueScore)),
      costEfficiencyScore: Math.round(costEfficiencyScore),
      benchmarkComparison: Math.round(benchmarkComparison * 100) / 100,
      recommendation
    };
  }

  /**
   * 成本分解
   */
  decomposeCosts(
    execution: TradeExecution,
    midPrice: number,
    commissionRate: number = 0.0003
  ): CostBreakdown {
    const notional = execution.executedPrice * execution.quantity;

    // 显性成本
    const commission = notional * commissionRate;
    const exchangeFee = notional * 0.0000487;
    const secFee = notional * 0.0000229;
    const stampTax = execution.side === 'sell' ? notional * 0.001 : 0; // 卖出印花税0.1%

    // 隐性成本
    const spreadCost = Math.abs(execution.executedPrice - midPrice) * execution.quantity;
    const marketImpact = spreadCost * 0.3; // 简化估计
    const timingCost = 0;
    const opportunityCost = 0;

    const totalExplicit = commission + exchangeFee + secFee + stampTax;
    const totalImplicit = spreadCost + marketImpact + timingCost + opportunityCost;
    const totalCost = totalExplicit + totalImplicit;

    const totalCostBps = notional > 0 ? (totalCost / notional) * 10000 : 0;
    const costPerShare = execution.quantity > 0 ? totalCost / execution.quantity : 0;

    return {
      explicitCosts: {
        commission: Math.round(commission * 100) / 100,
        exchangeFee: Math.round(exchangeFee * 100) / 100,
        secFee: Math.round(secFee * 100) / 100,
        stampTax: Math.round(stampTax * 100) / 100
      },
      implicitCosts: {
        spreadCost: Math.round(spreadCost * 100) / 100,
        marketImpact: Math.round(marketImpact * 100) / 100,
        timingCost: Math.round(timingCost * 100) / 100,
        opportunityCost: Math.round(opportunityCost * 100) / 100
      },
      totalCostBps: Math.round(totalCostBps * 100) / 100,
      costPerShare: Math.round(costPerShare * 10000) / 10000
    };
  }

  // ==================== 辅助方法 ====================
  private avg(values: number[]): number {
    if (values.length === 0) return 0;
    return values.reduce((s, v) => s + v, 0) / values.length;
  }

  private calcMedian(values: number[]): number {
    if (values.length === 0) return 0;
    const sorted = [...values].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    return sorted.length % 2 !== 0 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
  }
}

export default TradeCostEngine;
