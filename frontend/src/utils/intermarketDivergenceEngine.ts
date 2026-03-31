/**
 * 跨市场背离引擎
 * 检测跨资产/跨市场的背离信号: 股债背离、汇市背离、商品-股市背离等
 */

export interface MarketSeries {
  name: string;
  date: string;
  close: number;
}

export interface DivergenceSignal {
  date: string;
  market1: string;
  market2: string;
  type: 'positive' | 'negative' | 'converging';
  correlation: number;
  zScore: number; // 背离程度
  duration: number; // 背离持续天数
  strength: number; // 0-100
  description: string;
}

export interface CorrelationRegime {
  date: string;
  rollingCorrelation: number;
  regime: 'high_correlation' | 'low_correlation' | 'negative_correlation' | 'transition';
  stability: number; // 0-100
}

export interface LeadLagRelationship {
  leader: string;
  follower: string;
  optimalLag: number; // 天数
  leadCorrelation: number;
  grangerCausal: boolean;
  predictivePower: number; // 0-100
}

export interface CrossAssetSignal {
  date: string;
  signal: 'risk_on' | 'risk_off' | 'mixed';
  confidence: number;
  components: {
    equityBond: number; // 股债信号
    dollarCommodity: number; // 美元-商品信号
    creditEquity: number; // 信用-股票信号
    volatilitySignal: number; // 波动率信号
  };
}

/**
 * 计算滚动相关系数
 */
export function rollingCorrelation(
  series1: number[],
  series2: number[],
  window: number = 20
): number[] {
  const result: number[] = [];

  for (let i = 0; i < series1.length; i++) {
    if (i < window - 1) {
      result.push(NaN);
      continue;
    }

    const s1 = series1.slice(i - window + 1, i + 1);
    const s2 = series2.slice(i - window + 1, i + 1);

    const mean1 = s1.reduce((a, b) => a + b, 0) / window;
    const mean2 = s2.reduce((a, b) => a + b, 0) / window;

    let cov = 0;
    let var1 = 0;
    let var2 = 0;
    for (let j = 0; j < window; j++) {
      const d1 = s1[j] - mean1;
      const d2 = s2[j] - mean2;
      cov += d1 * d2;
      var1 += d1 * d1;
      var2 += d2 * d2;
    }

    const corr = (var1 > 0 && var2 > 0) ? cov / Math.sqrt(var1 * var2) : 0;
    result.push(Math.round(corr * 10000) / 10000);
  }

  return result;
}

/**
 * 检测背离信号
 */
export function detectDivergences(
  series1: MarketSeries[],
  series2: MarketSeries[],
  config: {
    window?: number;
    zThreshold?: number;
    minDuration?: number;
  } = {}
): DivergenceSignal[] {
  const { window = 20, zThreshold = 1.5, minDuration = 3 } = config;

  // 对齐日期
  const dateMap1 = new Map(series1.map(s => [s.date, s.close]));
  const dateMap2 = new Map(series2.map(s => [s.date, s.close]));
  const commonDates = [...dateMap1.keys()].filter(d => dateMap2.has(d)).sort();

  if (commonDates.length < window) return [];

  const prices1 = commonDates.map(d => dateMap1.get(d)!);
  const prices2 = commonDates.map(d => dateMap2.get(d)!);

  // 标准化价格
  const normalize = (arr: number[]) => {
    const min = Math.min(...arr);
    const max = Math.max(...arr);
    const range = max - min;
    return range > 0 ? arr.map(v => (v - min) / range) : arr.map(() => 0.5);
  };

  const norm1 = normalize(prices1);
  const norm2 = normalize(prices2);

  // 计算差值（标准化后）
  const spread: number[] = norm1.map((v, i) => v - norm2[i]);

  // 滚动统计
  const rollingMean: number[] = [];
  const rollingStd: number[] = [];
  for (let i = 0; i < spread.length; i++) {
    if (i < window - 1) {
      rollingMean.push(NaN);
      rollingStd.push(NaN);
      continue;
    }
    const slice = spread.slice(i - window + 1, i + 1);
    const mean = slice.reduce((a, b) => a + b, 0) / window;
    const std = Math.sqrt(slice.reduce((a, b) => a + (b - mean) ** 2, 0) / window);
    rollingMean.push(mean);
    rollingStd.push(std);
  }

  // 检测背离
  const signals: DivergenceSignal[] = [];
  let currentDivergence: { start: number; type: 'positive' | 'negative' } | null = null;

  for (let i = window; i < spread.length; i++) {
    if (isNaN(rollingMean[i]) || rollingStd[i] === 0) continue;

    const zScore = (spread[i] - rollingMean[i]) / rollingStd[i];

    if (Math.abs(zScore) >= zThreshold) {
      const type: 'positive' | 'negative' = zScore > 0 ? 'positive' : 'negative';

      if (!currentDivergence || currentDivergence.type !== type) {
        // 结束之前的背离
        if (currentDivergence) {
          const duration = i - currentDivergence.start;
          if (duration >= minDuration) {
            const endIdx = i - 1;
            const maxZ = Math.max(
              ...spread.slice(currentDivergence.start, endIdx + 1)
                .map((s, j) => rollingStd[currentDivergence!.start + j] > 0
                  ? Math.abs((s - rollingMean[currentDivergence!.start + j]) / rollingStd[currentDivergence!.start + j])
                  : 0
                )
            );
            signals.push({
              date: commonDates[endIdx],
              market1: series1[0]?.name || 'Market1',
              market2: series2[0]?.name || 'Market2',
              type: currentDivergence.type,
              correlation: rollingCorrelation(prices1, prices2, window)[endIdx] || 0,
              zScore: Math.round(maxZ * 100) / 100,
              duration,
              strength: Math.min(100, Math.round(maxZ * 30)),
              description: currentDivergence.type === 'positive'
                ? `${series1[0]?.name} 相对 ${series2[0]?.name} 超涨`
                : `${series1[0]?.name} 相对 ${series2[0]?.name} 超跌`,
            });
          }
        }
        currentDivergence = { start: i, type };
      }
    } else {
      // 结束背离
      if (currentDivergence) {
        const duration = i - currentDivergence.start;
        if (duration >= minDuration) {
          const maxZ = Math.max(
            ...spread.slice(currentDivergence.start, i)
              .map((s, j) => rollingStd[currentDivergence!.start + j] > 0
                ? Math.abs((s - rollingMean[currentDivergence!.start + j]) / rollingStd[currentDivergence!.start + j])
                : 0
              )
          );
          signals.push({
            date: commonDates[i - 1],
            market1: series1[0]?.name || 'Market1',
            market2: series2[0]?.name || 'Market2',
            type: currentDivergence.type,
            correlation: rollingCorrelation(prices1, prices2, window)[i - 1] || 0,
            zScore: Math.round(maxZ * 100) / 100,
            duration,
            strength: Math.min(100, Math.round(maxZ * 30)),
            description: currentDivergence.type === 'positive'
              ? `${series1[0]?.name} 相对 ${series2[0]?.name} 超涨（已收敛）`
              : `${series1[0]?.name} 相对 ${series2[0]?.name} 超跌（已收敛）`,
          });
        }
        currentDivergence = null;
      }
    }
  }

  return signals;
}

/**
 * 分析相关性体制切换
 */
export function analyzeCorrelationRegime(
  series1: number[],
  series2: number[],
  window: number = 20
): CorrelationRegime[] {
  const correlations = rollingCorrelation(series1, series2, window);
  const result: CorrelationRegime[] = [];

  for (let i = 0; i < correlations.length; i++) {
    if (isNaN(correlations[i])) continue;

    const corr = correlations[i];
    let regime: CorrelationRegime['regime'];
    if (corr > 0.6) regime = 'high_correlation';
    else if (corr < -0.3) regime = 'negative_correlation';
    else if (Math.abs(corr) < 0.3) regime = 'low_correlation';
    else regime = 'transition';

    // 稳定性: 近期相关系数的方差
    const recentCorrs = correlations.slice(Math.max(0, i - 10), i + 1).filter(c => !isNaN(c));
    const meanCorr = recentCorrs.reduce((a, b) => a + b, 0) / recentCorrs.length;
    const variance = recentCorrs.reduce((a, b) => a + (b - meanCorr) ** 2, 0) / recentCorrs.length;
    const stability = Math.max(0, 100 - variance * 500);

    result.push({
      date: `day_${i}`,
      rollingCorrelation: corr,
      regime,
      stability: Math.round(stability * 10) / 10,
    });
  }

  return result;
}

/**
 * 检测领涨-滞后关系
 */
export function detectLeadLag(
  series1: number[],
  series2: number[],
  maxLag: number = 10
): LeadLagRelationship {
  if (series1.length < maxLag * 2 || series2.length < maxLag * 2) {
    return {
      leader: 'unknown', follower: 'unknown',
      optimalLag: 0, leadCorrelation: 0,
      grangerCausal: false, predictivePower: 0,
    };
  }

  // 计算收益率
  const returns1 = series1.slice(1).map((p, i) => Math.log(p / series1[i]));
  const returns2 = series2.slice(1).map((p, i) => Math.log(p / series2[i]));

  // 检测不同滞后期的相关性
  let bestLag1Leads = 0;
  let bestCorr1Leads = 0;
  let bestLag2Leads = 0;
  let bestCorr2Leads = 0;

  for (let lag = 1; lag <= maxLag; lag++) {
    // series1 领先 series2
    const corr1 = pearsonCorrelation(returns1.slice(0, -lag), returns2.slice(lag));
    if (Math.abs(corr1) > Math.abs(bestCorr1Leads)) {
      bestCorr1Leads = corr1;
      bestLag1Leads = lag;
    }

    // series2 领先 series1
    const corr2 = pearsonCorrelation(returns2.slice(0, -lag), returns1.slice(lag));
    if (Math.abs(corr2) > Math.abs(bestCorr2Leads)) {
      bestCorr2Leads = corr2;
      bestLag2Leads = lag;
    }
  }

  const leader = Math.abs(bestCorr1Leads) >= Math.abs(bestCorr2Leads) ? 'series1' : 'series2';
  const optimalLag = leader === 'series1' ? bestLag1Leads : bestLag2Leads;
  const leadCorrelation = leader === 'series1' ? bestCorr1Leads : bestCorr2Leads;

  // Granger 因果检验简化版
  const grangerCausal = Math.abs(leadCorrelation) > 0.15 && optimalLag > 0;

  // 预测能力
  const predictivePower = Math.min(100, Math.abs(leadCorrelation) * 200 * (optimalLag / maxLag));

  return {
    leader,
    follower: leader === 'series1' ? 'series2' : 'series1',
    optimalLag,
    leadCorrelation: Math.round(leadCorrelation * 10000) / 10000,
    grangerCausal,
    predictivePower: Math.round(predictivePower),
  };
}

/**
 * 计算皮尔逊相关系数
 */
function pearsonCorrelation(x: number[], y: number[]): number {
  const n = Math.min(x.length, y.length);
  if (n < 3) return 0;

  const meanX = x.slice(0, n).reduce((a, b) => a + b, 0) / n;
  const meanY = y.slice(0, n).reduce((a, b) => a + b, 0) / n;

  let cov = 0;
  let varX = 0;
  let varY = 0;
  for (let i = 0; i < n; i++) {
    const dx = x[i] - meanX;
    const dy = y[i] - meanY;
    cov += dx * dy;
    varX += dx * dx;
    varY += dy * dy;
  }

  return (varX > 0 && varY > 0) ? cov / Math.sqrt(varX * varY) : 0;
}

/**
 * 跨资产信号合成
 */
export function synthesizeCrossAssetSignal(
  equityPrices: number[],
  bondPrices: number[],
  dollarIndex: number[],
  commodityPrices: number[],
  creditSpread: number[],
  vix: number[],
  window: number = 20
): CrossAssetSignal[] {
  const minLen = Math.min(
    equityPrices.length, bondPrices.length, dollarIndex.length,
    commodityPrices.length, creditSpread.length, vix.length
  );

  if (minLen < window) return [];

  const eqReturns = equityPrices.slice(0, minLen).slice(1).map((p, i) => p / equityPrices[i] - 1);
  const bondReturns = bondPrices.slice(0, minLen).slice(1).map((p, i) => p / bondPrices[i] - 1);
  const dxyReturns = dollarIndex.slice(0, minLen).slice(1).map((p, i) => p / dollarIndex[i] - 1);
  const cmdReturns = commodityPrices.slice(0, minLen).slice(1).map((p, i) => p / commodityPrices[i] - 1);
  const creditReturns = creditSpread.slice(0, minLen).slice(1).map((p, i) => creditSpread[i] > 0 ? (p / creditSpread[i] - 1) : 0);

  const signals: CrossAssetSignal[] = [];

  for (let i = window; i < eqReturns.length; i++) {
    // 股债信号: 股涨债跌 = risk on
    const eqTrend = eqReturns.slice(i - window, i).reduce((a, b) => a + b, 0);
    const bondTrend = bondReturns.slice(i - window, i).reduce((a, b) => a + b, 0);
    const equityBond = Math.max(-100, Math.min(100, (eqTrend - bondTrend) * 1000));

    // 美元-商品: 美元跌商品涨 = risk on
    const dxyTrend = dxyReturns.slice(i - window, i).reduce((a, b) => a + b, 0);
    const cmdTrend = cmdReturns.slice(i - window, i).reduce((a, b) => a + b, 0);
    const dollarCommodity = Math.max(-100, Math.min(100, (-dxyTrend + cmdTrend) * 1000));

    // 信用-股票: 信用利差收窄 = risk on
    const creditTrend = creditReturns.slice(i - window, i).reduce((a, b) => a + b, 0);
    const creditEquity = Math.max(-100, Math.min(100, (-creditTrend + eqTrend) * 1000));

    // 波动率: VIX 下降 = risk on
    const vixSlice = vix.slice(i - window, i + 1);
    const vixTrend = vixSlice.length > 1 ? vixSlice[vixSlice.length - 1] - vixSlice[0] : 0;
    const volatilitySignal = Math.max(-100, Math.min(100, -vixTrend * 10));

    // 综合信号
    const composite = (equityBond + dollarCommodity + creditEquity + volatilitySignal) / 4;

    let signal: CrossAssetSignal['signal'];
    if (composite > 20) signal = 'risk_on';
    else if (composite < -20) signal = 'risk_off';
    else signal = 'mixed';

    const confidence = Math.min(100, Math.abs(composite));

    signals.push({
      date: `day_${i}`,
      signal,
      confidence: Math.round(confidence),
      components: {
        equityBond: Math.round(equityBond),
        dollarCommodity: Math.round(dollarCommodity),
        creditEquity: Math.round(creditEquity),
        volatilitySignal: Math.round(volatilitySignal),
      },
    });
  }

  return signals;
}

/**
 * 计算市场间领先指标
 */
export function calculateIntermarketLeadership(
  markets: { name: string; returns: number[] }[],
  window: number = 20
): { leader: string; followers: string[]; leadershipScore: Record<string, number> } {
  if (markets.length < 2) {
    return { leader: 'unknown', followers: [], leadershipScore: {} };
  }

  const leadershipScore: Record<string, number> = {};
  for (const m of markets) leadershipScore[m.name] = 0;

  // 两两比较，找出谁在领先
  for (let i = 0; i < markets.length; i++) {
    for (let j = i + 1; j < markets.length; j++) {
      const relationship = detectLeadLag(markets[i].returns, markets[j].returns, Math.min(window, 10));
      if (relationship.grangerCausal) {
        const leaderName = relationship.leader === 'series1' ? markets[i].name : markets[j].name;
        leadershipScore[leaderName] += relationship.predictivePower;
      }
    }
  }

  const sorted = Object.entries(leadershipScore).sort((a, b) => b[1] - a[1]);
  const leader = sorted[0]?.[0] || 'unknown';
  const followers = sorted.slice(1).map(s => s[0]);

  return { leader, followers, leadershipScore };
}
