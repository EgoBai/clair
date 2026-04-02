/**
 * 滑点估算引擎 (Slippage Estimation Engine)
 * - 基于成交量的滑点模型
 * - 基于波动率的滑点模型
 * - 市场冲击模型 (Kyle Lambda)
 * - 执行成本估算
 */

export interface OrderRequest {
  symbol: string;
  side: 'buy' | 'sell';
  quantity: number;
  price: number;
  orderType: 'market' | 'limit';
}

export interface MarketSnapshot {
  bid: number;
  ask: number;
  volume: number;
  avgVolume20d: number;
  volatility: number;
  spread: number;
}

export interface SlippageEstimate {
  expectedSlippageBps: number;
  expectedSlippageAmount: number;
  worstCaseBps: number;
  worstCaseAmount: number;
  confidence: number;
  components: {
    spreadCost: number;
    marketImpact: number;
    timingRisk: number;
  };
}

export interface MarketImpactModel {
  lambda: number;
  beta: number;
  temporaryImpact: number;
  permanentImpact: number;
}

export class SlippageEstimationEngine {
  /**
   * 综合滑点估算
   */
  estimateSlippage(order: OrderRequest, market: MarketSnapshot): SlippageEstimate {
    const spreadCost = this.calculateSpreadCost(order, market);
    const marketImpact = this.calculateMarketImpact(order, market);
    const timingRisk = this.calculateTimingRisk(order, market);
    
    const totalSlippageBps = spreadCost + marketImpact + timingRisk;
    const totalSlippageAmount = (totalSlippageBps / 10000) * order.price * order.quantity;
    const worstCaseMultiplier = 1.5 + market.volatility * 10;
    
    const participationRate = market.volume > 0 
      ? order.quantity / market.volume 
      : 0.01;
    const confidence = Math.max(0.1, Math.min(0.95, 1 - participationRate * 5));

    return {
      expectedSlippageBps: Math.round(totalSlippageBps * 100) / 100,
      expectedSlippageAmount: Math.round(totalSlippageAmount * 100) / 100,
      worstCaseBps: Math.round(totalSlippageBps * worstCaseMultiplier * 100) / 100,
      worstCaseAmount: Math.round(totalSlippageAmount * worstCaseMultiplier * 100) / 100,
      confidence: Math.round(confidence * 100) / 100,
      components: {
        spreadCost: Math.round(spreadCost * 100) / 100,
        marketImpact: Math.round(marketImpact * 100) / 100,
        timingRisk: Math.round(timingRisk * 100) / 100,
      },
    };
  }

  /**
   * 买卖价差成本 (half-spread)
   */
  calculateSpreadCost(order: OrderRequest, market: MarketSnapshot): number {
    if (market.ask <= 0 || market.bid <= 0) return 0;
    const midPrice = (market.bid + market.ask) / 2;
    const halfSpread = (market.ask - market.bid) / 2;
    return (halfSpread / midPrice) * 10000;
  }

  /**
   * Kyle Lambda 市场冲击模型
   * Impact = lambda * sign(Q) * |Q|^beta
   */
  calculateMarketImpact(order: OrderRequest, market: MarketSnapshot): number {
    if (market.avgVolume20d <= 0) return 0;
    const participationRate = order.quantity / market.avgVolume20d;
    const lambda = market.volatility * Math.sqrt(252) * 0.1;
    const beta = 0.5; // square-root market impact model
    const sign = order.side === 'buy' ? 1 : -1;
    const impact = lambda * sign * Math.pow(Math.abs(participationRate), beta);
    return Math.abs(impact) * 10000;
  }

  /**
   * 时序风险 (等待执行期间的价格漂移)
   */
  calculateTimingRisk(order: OrderRequest, market: MarketSnapshot): number {
    const executionTimeFraction = order.orderType === 'market' ? 0.001 : 0.01;
    return market.volatility * Math.sqrt(executionTimeFraction * 252) * 10000 * 0.5;
  }

  /**
   * Kyle Lambda 模型参数计算
   */
  calibrateKyleModel(
    historicalTrades: Array<{ volume: number; priceChange: number; volatility: number }>
  ): MarketImpactModel {
    if (historicalTrades.length < 10) {
      return { lambda: 0.1, beta: 0.5, temporaryImpact: 0, permanentImpact: 0 };
    }
    // OLS regression: |priceChange| = lambda * volume^beta
    const logVol = historicalTrades.map(t => Math.log(Math.max(t.volume, 1)));
    const logImpact = historicalTrades.map(t => Math.log(Math.max(Math.abs(t.priceChange), 0.0001)));
    const n = logVol.length;
    const meanX = logVol.reduce((s, v) => s + v, 0) / n;
    const meanY = logImpact.reduce((s, v) => s + v, 0) / n;
    let num = 0, den = 0;
    for (let i = 0; i < n; i++) {
      num += (logVol[i] - meanX) * (logImpact[i] - meanY);
      den += (logVol[i] - meanX) ** 2;
    }
    const beta = den !== 0 ? num / den : 0.5;
    const logLambda = meanY - beta * meanX;
    const lambda = Math.exp(logLambda);
    const avgVol = historicalTrades.reduce((s, t) => s + t.volatility, 0) / n;
    return {
      lambda: Math.round(lambda * 10000) / 10000,
      beta: Math.round(beta * 10000) / 10000,
      temporaryImpact: Math.round(lambda * 0.7 * 10000) / 10000,
      permanentImpact: Math.round(lambda * 0.3 * 10000) / 10000,
    };
  }

  /**
   * 最优执行切片 (TWAP/VWAP)
   */
  optimalExecutionSlices(
    totalQuantity: number,
    timeHorizonMinutes: number,
    numSlices: number,
    urgency: 'low' | 'medium' | 'high' = 'medium'
  ): Array<{ slice: number; quantity: number; timeOffset: number; weight: number }> {
    const slices: Array<{ slice: number; quantity: number; timeOffset: number; weight: number }> = [];
    const intervalMinutes = timeHorizonMinutes / numSlices;
    
    // VWAP-style weights (U-shaped: more at open/close)
    const weights: number[] = [];
    for (let i = 0; i < numSlices; i++) {
      const position = i / (numSlices - 1 || 1);
      const uShape = 0.5 + 0.5 * Math.cos(2 * Math.PI * (position - 0.25));
      weights.push(uShape);
    }
    
    // Urgency adjustment
    const urgencyMultiplier = urgency === 'high' ? 1.5 : urgency === 'low' ? 0.7 : 1.0;
    const totalWeight = weights.reduce((s, w) => s + w, 0);
    
    let remaining = totalQuantity;
    for (let i = 0; i < numSlices; i++) {
      const proportion = weights[i] / totalWeight;
      let qty = Math.round(totalQuantity * proportion * urgencyMultiplier);
      qty = Math.min(qty, remaining);
      if (i === numSlices - 1) qty = remaining;
      remaining -= qty;
      slices.push({
        slice: i + 1,
        quantity: Math.max(0, qty),
        timeOffset: Math.round(i * intervalMinutes),
        weight: Math.round(proportion * 10000) / 10000,
      });
    }
    return slices;
  }

  /**
   * 估算总执行成本
   */
  estimateTotalExecutionCost(
    order: OrderRequest,
    market: MarketSnapshot,
    numSlices: number = 10
  ): { totalCostBps: number; slippage: SlippageEstimate; slices: ReturnType<SlippageEstimationEngine['optimalExecutionSlices']> } {
    const slippage = this.estimateSlippage(order, market);
    const slices = this.optimalExecutionSlices(order.quantity, 30, numSlices);
    // 分片执行减少冲击
    const impactReduction = Math.min(0.5, numSlices * 0.03);
    const adjustedBps = slippage.expectedSlippageBps * (1 - impactReduction);
    return {
      totalCostBps: Math.round(adjustedBps * 100) / 100,
      slippage,
      slices,
    };
  }
}

export default new SlippageEstimationEngine();
