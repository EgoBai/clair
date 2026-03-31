/**
 * 尾部风险对冲引擎
 * - 极端事件概率估计
 * - CVaR/Expected Shortfall
 * - 对冲策略推荐
 * - 保护性Put成本估算
 * - 组合保险策略
 * - 黑天鹅指标
 */

export interface TailRiskMetrics {
  var95: number; // 95% VaR
  var99: number; // 99% VaR
  cvar95: number; // 95% CVaR
  cvar99: number; // 99% CVaR
  maxExpectedLoss: number;
  tailIndex: number; // 尾部厚度
}

export interface ExtremeEventProbability {
  oneDayProb: number; // 单日极端事件概率
  oneWeekProb: number;
  oneMonthProb: number;
  eventType: 'crash' | 'melt_up' | 'vol_spike' | 'liquidity_crisis';
  historicalFrequency: number;
}

export interface HedgingStrategy {
  strategy: string;
  costBp: number; // 成本(bp)
  protectionLevel: number; // 保护水平(%)
  maxDrawdownReduction: number; // 最大回撤减少(%)
  costEfficiency: number; // 保护/成本比
  recommendation: 'implement' | 'consider' | 'monitor' | 'pass';
}

export interface BlackSwanIndicator {
  score: number; // 0-100
  factors: string[];
  level: 'calm' | 'elevated' | 'warning' | 'danger';
  historicalAccuracy: number;
}

export class TailRiskHedgingEngine {
  /**
   * 计算尾部风险指标
   */
  calcTailRiskMetrics(returns: number[]): TailRiskMetrics {
    if (returns.length < 30) {
      return { var95: 0, var99: 0, cvar95: 0, cvar99: 0, maxExpectedLoss: 0, tailIndex: 0 };
    }

    const sorted = [...returns].sort((a, b) => a - b);
    const n = sorted.length;

    // VaR
    const var95 = -sorted[Math.floor(n * 0.05)];
    const var99 = -sorted[Math.floor(n * 0.01)];

    // CVaR (Expected Shortfall)
    const tail5pct = sorted.slice(0, Math.floor(n * 0.05));
    const cvar95 = tail5pct.length > 0 ? -tail5pct.reduce((a, b) => a + b, 0) / tail5pct.length : 0;

    const tail1pct = sorted.slice(0, Math.floor(n * 0.01));
    const cvar99 = tail1pct.length > 0 ? -tail1pct.reduce((a, b) => a + b, 0) / tail1pct.length : 0;

    // 最大预期损失
    const maxExpectedLoss = sorted[0];

    // 尾部指数(Hill估计)
    const threshold = sorted[Math.floor(n * 0.1)];
    const exceedances = sorted.filter(r => r < threshold).map(r => Math.log(Math.abs(r / threshold)));
    const tailIndex = exceedances.length > 0
      ? 1 / (exceedances.reduce((a, b) => a + b, 0) / exceedances.length)
      : 0;

    return {
      var95: Math.round(var95 * 10000) / 10000,
      var99: Math.round(var99 * 10000) / 10000,
      cvar95: Math.round(cvar95 * 10000) / 10000,
      cvar99: Math.round(cvar99 * 10000) / 10000,
      maxExpectedLoss: Math.round(maxExpectedLoss * 10000) / 10000,
      tailIndex: Math.round(tailIndex * 1000) / 1000,
    };
  }

  /**
   * 极端事件概率估计
   */
  estimateExtremeEventProb(
    returns: number[],
    currentVol: number,
    historicalVol: number,
  ): ExtremeEventProbability {
    if (returns.length < 60) {
      return { oneDayProb: 0, oneWeekProb: 0, oneMonthProb: 0, eventType: 'crash', historicalFrequency: 0 };
    }

    const std = Math.sqrt(returns.reduce((s, r) => s + r * r, 0) / returns.length);
    const volRatio = historicalVol > 0 ? currentVol / historicalVol : 1;

    // 极端事件定义: 收益率超过3个标准差
    const extremeDays = returns.filter(r => Math.abs(r) > 3 * std).length;
    const oneDayProb = extremeDays / returns.length;

    // 时间扩展
    const oneWeekProb = 1 - Math.pow(1 - oneDayProb, 5);
    const oneMonthProb = 1 - Math.pow(1 - oneDayProb, 22);

    // 事件类型判断
    let eventType: ExtremeEventProbability['eventType'];
    const negExtremes = returns.filter(r => r < -3 * std).length;
    const posExtremes = returns.filter(r => r > 3 * std).length;

    if (negExtremes > posExtremes * 2) eventType = 'crash';
    else if (posExtremes > negExtremes * 2) eventType = 'melt_up';
    else if (volRatio > 2) eventType = 'vol_spike';
    else eventType = 'liquidity_crisis';

    return {
      oneDayProb: Math.round(oneDayProb * 10000) / 10000,
      oneWeekProb: Math.round(oneWeekProb * 10000) / 10000,
      oneMonthProb: Math.round(oneMonthProb * 10000) / 10000,
      eventType,
      historicalFrequency: Math.round(extremeDays / returns.length * 10000) / 10000,
    };
  }

  /**
   * 推荐对冲策略
   */
  recommendHedging(
    tailMetrics: TailRiskMetrics,
    portfolioVol: number,
    portfolioValue: number,
  ): HedgingStrategy[] {
    const strategies: HedgingStrategy[] = [];

    // 保护性Put
    const putCost = tailMetrics.var95 * 0.15 * 10000; // 近似成本
    strategies.push({
      strategy: '保护性Put (OTM 5%)',
      costBp: Math.round(putCost),
      protectionLevel: 95,
      maxDrawdownReduction: 70,
      costEfficiency: putCost > 0 ? Math.round(95 / putCost * 100) / 100 : 0,
      recommendation: tailMetrics.var99 > 0.03 ? 'implement' : 'consider',
    });

    // Collar策略
    strategies.push({
      strategy: 'Collar (买Put + 卖Call)',
      costBp: Math.round(putCost * 0.3),
      protectionLevel: 90,
      maxDrawdownReduction: 60,
      costEfficiency: putCost > 0 ? Math.round(90 / (putCost * 0.3) * 100) / 100 : 0,
      recommendation: 'consider',
    });

    // VIX对冲
    strategies.push({
      strategy: 'VIX期货对冲',
      costBp: Math.round(portfolioVol * 100 * 50),
      protectionLevel: 80,
      maxDrawdownReduction: 50,
      costEfficiency: portfolioVol > 0 ? Math.round(80 / (portfolioVol * 100 * 50) * 100) / 100 : 0,
      recommendation: portfolioVol > 0.025 ? 'implement' : 'monitor',
    });

    // 分散化
    strategies.push({
      strategy: '资产分散化',
      costBp: 10,
      protectionLevel: 60,
      maxDrawdownReduction: 30,
      costEfficiency: 6,
      recommendation: 'implement',
    });

    // 现金缓冲
    strategies.push({
      strategy: '现金缓冲 (10-20%)',
      costBp: 0,
      protectionLevel: 50,
      maxDrawdownReduction: 20,
      costEfficiency: Infinity,
      recommendation: tailMetrics.cvar99 > 0.05 ? 'implement' : 'monitor',
    });

    return strategies.sort((a, b) => b.costEfficiency - a.costEfficiency);
  }

  /**
   * 黑天鹅指标
   */
  calcBlackSwanIndicator(
    returns: number[],
    currentVol: number,
    correlationBreakdown: boolean,
    liquidityStress: boolean,
  ): BlackSwanIndicator {
    let score = 0;
    const factors: string[] = [];

    // 高波动率
    if (currentVol > 0.03) { score += 25; factors.push('波动率异常升高'); }
    else if (currentVol > 0.02) { score += 10; factors.push('波动率偏高'); }

    // 尾部风险
    const metrics = this.calcTailRiskMetrics(returns);
    if (metrics.cvar99 > 0.05) { score += 25; factors.push('CVaR99超过5%'); }

    // 相关性崩溃
    if (correlationBreakdown) { score += 25; factors.push('资产相关性崩溃'); }

    // 流动性压力
    if (liquidityStress) { score += 25; factors.push('流动性紧张'); }

    // 历史极端事件频率
    const extremeCount = returns.filter(r => Math.abs(r) > 0.03).length;
    if (extremeCount > returns.length * 0.05) { score += 15; factors.push('极端事件频发'); }

    let level: BlackSwanIndicator['level'];
    if (score > 70) level = 'danger';
    else if (score > 50) level = 'warning';
    else if (score > 25) level = 'elevated';
    else level = 'calm';

    return {
      score: Math.min(100, score),
      factors,
      level,
      historicalAccuracy: 0.65,
    };
  }
}

export default new TailRiskHedgingEngine();
