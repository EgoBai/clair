/**
 * 策略绩效归因引擎
 * 策略回测绩效多维归因/风险调整收益/因子暴露归因/交易归因
 */

export interface Trade {
  ticker: string;
  side: 'buy' | 'sell';
  price: number;
  quantity: number;
  date: string;
  sector: string;
  fees: number;
}

export interface DailyReturn {
  date: string;
  strategyReturn: number;
  benchmarkReturn: number;
  positions: { ticker: string; weight: number; return: number }[];
}

export interface PerformanceMetrics {
  totalReturn: number;
  annualizedReturn: number;
  volatility: number;
  sharpeRatio: number;
  sortinoRatio: number;
  maxDrawdown: number;
  maxDrawdownDuration: number; // 天
  calmarRatio: number;
  winRate: number;
  profitFactor: number;
  avgWin: number;
  avgLoss: number;
  avgHoldingDays: number;
  turnoverRate: number;
  informationRatio: number;
  trackingError: number;
  beta: number;
  alpha: number;
  treynorRatio: number;
}

export interface SectorAttribution {
  sector: string;
  weight: number;
  contribution: number;
  selection: number;    // 选股贡献
  allocation: number;   // 配置贡献
  interaction: number;  // 交叉效应
}

export interface FactorAttribution {
  factor: string;
  exposure: number;
  return: number;
  contribution: number;
  significance: number; // t统计量
}

export interface TradeAttribution {
  totalTrades: number;
  winningTrades: number;
  losingTrades: number;
  avgWinAmount: number;
  avgLossAmount: number;
  largestWin: number;
  largestLoss: number;
  avgHoldingPeriod: number;
  bySector: { sector: string; trades: number; pnl: number }[];
  bestTrade: { ticker: string; pnl: number };
  worstTrade: { ticker: string; pnl: number };
}

export interface DrawdownAnalysis {
  drawdowns: {
    start: string;
    end: string;
    trough: string;
    maxDrawdown: number;
    recoveryDays: number;
    duration: number;
  }[];
  currentDrawdown: number;
  avgDrawdown: number;
  maxDrawdown: number;
  avgRecoveryDays: number;
}

/**
 * 计算绩效指标
 */
export function calculatePerformance(
  returns: DailyReturn[],
  riskFreeRate: number = 0.02
): PerformanceMetrics {
  if (returns.length === 0) {
    return {
      totalReturn: 0, annualizedReturn: 0, volatility: 0, sharpeRatio: 0,
      sortinoRatio: 0, maxDrawdown: 0, maxDrawdownDuration: 0, calmarRatio: 0,
      winRate: 0, profitFactor: 0, avgWin: 0, avgLoss: 0, avgHoldingDays: 0,
      turnoverRate: 0, informationRatio: 0, trackingError: 0, beta: 0,
      alpha: 0, treynorRatio: 0,
    };
  }

  const stratReturns = returns.map(r => r.strategyReturn);
  const benchReturns = returns.map(r => r.benchmarkReturn);

  // 累计收益
  const totalReturn = stratReturns.reduce((cum, r) => cum * (1 + r), 1) - 1;
  const annualizedReturn = Math.pow(1 + totalReturn, 252 / returns.length) - 1;

  // 波动率
  const mean = stratReturns.reduce((s, r) => s + r, 0) / stratReturns.length;
  const variance = stratReturns.reduce((s, r) => s + (r - mean) ** 2, 0) / stratReturns.length;
  const volatility = Math.sqrt(variance * 252);

  // Sharpe
  const dailyRf = riskFreeRate / 252;
  const excessReturns = stratReturns.map(r => r - dailyRf);
  const excessMean = excessReturns.reduce((s, r) => s + r, 0) / excessReturns.length;
  const sharpeRatio = volatility > 0 ? (excessMean * 252) / volatility : 0;

  // Sortino
  const downsideReturns = excessReturns.filter(r => r < 0);
  const downsideVariance = downsideReturns.length > 0
    ? downsideReturns.reduce((s, r) => s + r ** 2, 0) / downsideReturns.length
    : 0;
  const downsideDev = Math.sqrt(downsideVariance * 252);
  const sortinoRatio = downsideDev > 0 ? (excessMean * 252) / downsideDev : 0;

  // 最大回撤
  let peak = 0;
  let cumReturn = 0;
  let maxDD = 0;
  let ddStart = '';
  let ddDuration = 0;
  let maxDDDuration = 0;

  for (let i = 0; i < returns.length; i++) {
    cumReturn = (1 + cumReturn) * (1 + stratReturns[i]) - 1;
    if (cumReturn > peak) {
      peak = cumReturn;
      ddDuration = 0;
    } else {
      ddDuration++;
      const dd = peak - cumReturn;
      if (dd > maxDD) {
        maxDD = dd;
        ddStart = returns[i].date;
      }
      maxDDDuration = Math.max(maxDDDuration, ddDuration);
    }
  }

  const calmarRatio = maxDD > 0 ? annualizedReturn / maxDD : 0;

  // 胜率
  const wins = stratReturns.filter(r => r > 0);
  const losses = stratReturns.filter(r => r < 0);
  const winRate = stratReturns.length > 0 ? wins.length / stratReturns.length : 0;

  const avgWin = wins.length > 0 ? wins.reduce((s, r) => s + r, 0) / wins.length : 0;
  const avgLoss = losses.length > 0 ? Math.abs(losses.reduce((s, r) => s + r, 0) / losses.length) : 0;
  const profitFactor = avgLoss > 0 ? (avgWin * wins.length) / (avgLoss * losses.length) : 0;

  // 信息比率
  const excessVsBench = stratReturns.map((r, i) => r - benchReturns[i]);
  const trackingError = Math.sqrt(
    excessVsBench.reduce((s, e) => s + e ** 2, 0) / excessVsBench.length * 252
  );
  const ir = trackingError > 0
    ? (excessVsBench.reduce((s, e) => s + e, 0) / excessVsBench.length * 252) / trackingError
    : 0;

  // Beta & Alpha
  const benchMean = benchReturns.reduce((s, r) => s + r, 0) / benchReturns.length;
  const covariance = stratReturns.reduce((s, r, i) =>
    s + (r - mean) * (benchReturns[i] - benchMean), 0) / stratReturns.length;
  const benchVariance = benchReturns.reduce((s, r) => s + (r - benchMean) ** 2, 0) / benchReturns.length;
  const beta = benchVariance > 0 ? covariance / benchVariance : 1;
  const alpha = annualizedReturn - riskFreeRate - beta * (
    Math.pow(1 + benchReturns.reduce((s, r) => s + r, 0) / benchReturns.length, 252) - 1 - riskFreeRate
  );

  const benchVol = Math.sqrt(benchVariance * 252);
  const treynorRatio = beta !== 0 ? (annualizedReturn - riskFreeRate) / beta : 0;

  // 换手率
  const avgWeights = returns.map(r =>
    r.positions.reduce((s, p) => s + Math.abs(p.weight), 0)
  );
  const turnoverRate = avgWeights.length > 1
    ? avgWeights.slice(1).reduce((s, w, i) => s + Math.abs(w - avgWeights[i]), 0) / (avgWeights.length - 1)
    : 0;

  return {
    totalReturn,
    annualizedReturn,
    volatility,
    sharpeRatio,
    sortinoRatio,
    maxDrawdown: maxDD,
    maxDrawdownDuration: maxDDDuration,
    calmarRatio,
    winRate,
    profitFactor,
    avgWin,
    avgLoss,
    avgHoldingDays: returns.length > 0 ? 252 / Math.max(1, turnoverRate) : 0,
    turnoverRate,
    informationRatio: ir,
    trackingError,
    beta,
    alpha,
    treynorRatio,
  };
}

/**
 * 行业归因分析
 */
export function sectorAttribution(
  returns: DailyReturn[],
  benchWeights: Map<string, number>
): SectorAttribution[] {
  const sectorReturns = new Map<string, { stratRets: number[]; weights: number[] }>();

  for (const ret of returns) {
    for (const pos of ret.positions) {
      const existing = sectorReturns.get(pos.ticker) ?? { stratRets: [], weights: [] };
      existing.stratRets.push(pos.return);
      existing.weights.push(pos.weight);
      sectorReturns.set(pos.ticker, existing);
    }
  }

  const results: SectorAttribution[] = [];

  sectorReturns.forEach((data, sector) => {
    const avgWeight = data.weights.reduce((s, w) => s + w, 0) / data.weights.length;
    const avgReturn = data.stratRets.reduce((s, r) => s + r, 0) / data.stratRets.length;
    const benchWeight = benchWeights.get(sector) ?? 0;

    const allocation = (avgWeight - benchWeight) * avgReturn;
    const selection = benchWeight * (avgReturn - 0.0003); // 假设基准收益
    const interaction = (avgWeight - benchWeight) * (avgReturn - 0.0003);

    results.push({
      sector,
      weight: avgWeight,
      contribution: avgWeight * avgReturn,
      selection,
      allocation,
      interaction,
    });
  });

  return results.sort((a, b) => Math.abs(b.contribution) - Math.abs(a.contribution));
}

/**
 * 回撤分析
 */
export function analyzeDrawdowns(returns: DailyReturn[]): DrawdownAnalysis {
  const drawdowns: DrawdownAnalysis['drawdowns'] = [];
  let peak = 0;
  let cumReturn = 0;
  let ddStart = '';
  let trough = '';
  let maxDD = 0;
  let inDrawdown = false;

  for (let i = 0; i < returns.length; i++) {
    cumReturn = (1 + cumReturn) * (1 + returns[i].strategyReturn) - 1;

    if (cumReturn >= peak) {
      if (inDrawdown) {
        drawdowns.push({
          start: ddStart,
          end: returns[i].date,
          trough,
          maxDrawdown: maxDD,
          recoveryDays: 0,
          duration: 0,
        });
        inDrawdown = false;
      }
      peak = cumReturn;
    } else {
      if (!inDrawdown) {
        ddStart = returns[i > 0 ? i - 1 : 0].date;
        inDrawdown = true;
        maxDD = 0;
      }
      const dd = peak - cumReturn;
      if (dd > maxDD) {
        maxDD = dd;
        trough = returns[i].date;
      }
    }
  }

  if (inDrawdown) {
    drawdowns.push({
      start: ddStart,
      end: returns[returns.length - 1].date,
      trough,
      maxDrawdown: maxDD,
      recoveryDays: -1, // 未恢复
      duration: 0,
    });
  }

  const currentDrawdown = drawdowns.length > 0 && drawdowns[drawdowns.length - 1].recoveryDays === -1
    ? drawdowns[drawdowns.length - 1].maxDrawdown : 0;

  return {
    drawdowns,
    currentDrawdown,
    avgDrawdown: drawdowns.length > 0
      ? drawdowns.reduce((s, d) => s + d.maxDrawdown, 0) / drawdowns.length
      : 0,
    maxDrawdown: drawdowns.length > 0
      ? Math.max(...drawdowns.map(d => d.maxDrawdown))
      : 0,
    avgRecoveryDays: drawdowns.filter(d => d.recoveryDays > 0).length > 0
      ? drawdowns.filter(d => d.recoveryDays > 0).reduce((s, d) => s + d.recoveryDays, 0) /
        drawdowns.filter(d => d.recoveryDays > 0).length
      : 0,
  };
}

/**
 * 交易归因
 */
export function tradeAttribution(trades: Trade[]): TradeAttribution {
  // 配对买卖
  const positions = new Map<string, Trade[]>();
  trades.forEach(t => {
    const list = positions.get(t.ticker) ?? [];
    list.push(t);
    positions.set(t.ticker, list);
  });

  let winningTrades = 0;
  let losingTrades = 0;
  let totalWin = 0;
  let totalLoss = 0;
  let largestWin = 0;
  let largestLoss = 0;
  let bestTicker = '';
  let worstTicker = '';

  const bySector = new Map<string, { trades: number; pnl: number }>();

  positions.forEach((posTrades, ticker) => {
    // 简化: buy - sell = pnl
    let pnl = 0;
    posTrades.forEach(t => {
      pnl += t.side === 'sell' ? t.price * t.quantity : -t.price * t.quantity;
      pnl -= t.fees;

      const sector = t.sector;
      const existing = bySector.get(sector) ?? { trades: 0, pnl: 0 };
      existing.trades++;
      bySector.set(sector, existing);
    });

    const sector = posTrades[0].sector;
    const sectorData = bySector.get(sector)!;
    sectorData.pnl += pnl;

    if (pnl > 0) {
      winningTrades++;
      totalWin += pnl;
      if (pnl > largestWin) { largestWin = pnl; bestTicker = ticker; }
    } else {
      losingTrades++;
      totalLoss += Math.abs(pnl);
      if (Math.abs(pnl) > largestLoss) { largestLoss = Math.abs(pnl); worstTicker = ticker; }
    }
  });

  const totalTrades = winningTrades + losingTrades;

  return {
    totalTrades,
    winningTrades,
    losingTrades,
    avgWinAmount: winningTrades > 0 ? totalWin / winningTrades : 0,
    avgLossAmount: losingTrades > 0 ? totalLoss / losingTrades : 0,
    largestWin,
    largestLoss,
    avgHoldingPeriod: 10, // 简化
    bySector: Array.from(bySector.entries()).map(([sector, d]) => ({ sector, ...d })),
    bestTrade: { ticker: bestTicker, pnl: largestWin },
    worstTrade: { ticker: worstTicker, pnl: -largestLoss },
  };
}
