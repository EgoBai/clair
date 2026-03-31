/**
 * 情绪评分引擎
 * 综合: 技术面、资金流、市场广度、波动率情绪
 */

export interface SentimentInputs {
  // 技术面
  advancers: number; // 上涨家数
  decliners: number; // 下跌家数
  newHighs: number; // 新高家数
  newLows: number; // 新低家数
  
  // 成交量
  upVolume: number; // 上涨成交量
  downVolume: number; // 下跌成交量
  
  // 波动率
  vix: number; // VIX或类似波动率指标
  vixMA: number; // VIX移动平均
  
  // 资金流
  inflowAmount: number; // 资金流入
  outflowAmount: number; // 资金流出
  
  // 融资融券
  marginBuy: number; // 融资买入
  marginSell: number; // 融资偿还
  
  // 涨跌停
  limitUp: number; // 涨停家数
  limitDown: number; // 跌停家数
}

export interface SentimentScore {
  overall: number; // -100 to 100
  breadth: number; // 市场广度
  volume: number; // 量能情绪
  volatility: number; // 波动率情绪 (反向)
  moneyFlow: number; // 资金流情绪
  margin: number; // 杠杆情绪
  extremes: number; // 极端情绪
  level: SentimentLevel;
  signals: string[];
}

export type SentimentLevel = 
  | 'extreme_fear' 
  | 'fear' 
  | 'neutral' 
  | 'greed' 
  | 'extreme_greed';

/**
 * 计算综合情绪评分
 */
export function calculateSentimentScore(inputs: SentimentInputs): SentimentScore {
  const breadth = calculateBreadthScore(inputs);
  const volume = calculateVolumeScore(inputs);
  const volatility = calculateVolatilityScore(inputs);
  const moneyFlow = calculateMoneyFlowScore(inputs);
  const margin = calculateMarginScore(inputs);
  const extremes = calculateExtremesScore(inputs);

  // 加权综合
  const overall = 
    breadth * 0.25 +
    volume * 0.20 +
    volatility * 0.20 +
    moneyFlow * 0.15 +
    margin * 0.10 +
    extremes * 0.10;

  const level = classifySentimentLevel(overall);
  const signals = generateSentimentSignals(inputs, {
    breadth, volume, volatility, moneyFlow, margin, extremes, overall
  });

  return {
    overall,
    breadth,
    volume,
    volatility,
    moneyFlow,
    margin,
    extremes,
    level,
    signals
  };
}

/**
 * 恐惧贪婪指数 (类似CNN Fear & Greed)
 */
export function fearGreedIndex(inputs: SentimentInputs): {
  value: number; // 0-100
  label: string;
  components: { [key: string]: { value: number; rating: string } };
} {
  const advDec = normalizeScore(
    (inputs.advancers - inputs.decliners) / Math.max(inputs.advancers + inputs.decliners, 1) * 100,
    -100, 100, 0, 100
  );

  const highLow = normalizeScore(
    (inputs.newHighs - inputs.newLows) / Math.max(inputs.newHighs + inputs.newLows, 1) * 100,
    -100, 100, 0, 100
  );

  const volRatio = normalizeScore(
    inputs.upVolume / Math.max(inputs.upVolume + inputs.downVolume, 1) * 100,
    0, 100, 0, 100
  );

  // VIX: 低VIX=高情绪
  const vixScore = normalizeScore(inputs.vix, 10, 40, 100, 0);

  // 资金流
  const mfScore = normalizeScore(
    (inputs.inflowAmount - inputs.outflowAmount) / Math.max(inputs.inflowAmount + inputs.outflowAmount, 1) * 100,
    -100, 100, 0, 100
  );

  // 涨停比
  const limitScore = normalizeScore(
    (inputs.limitUp - inputs.limitDown) / Math.max(inputs.limitUp + inputs.limitDown, 1) * 100,
    -100, 100, 0, 100
  );

  const components: { [key: string]: { value: number; rating: string } } = {
    advanceDecline: { value: advDec, rating: rateScore(advDec) },
    newHighLow: { value: highLow, rating: rateScore(highLow) },
    volumeRatio: { value: volRatio, rating: rateScore(volRatio) },
    volatility: { value: vixScore, rating: rateScore(vixScore) },
    moneyFlow: { value: mfScore, rating: rateScore(mfScore) },
    limitRatio: { value: limitScore, rating: rateScore(limitScore) },
  };

  const value = (advDec + highLow + volRatio + vixScore + mfScore + limitScore) / 6;

  return {
    value,
    label: rateScore(value),
    components
  };
}

/**
 * 计算资金流量指标 (MFI)
 */
export function calculateMFI(
  highs: number[],
  lows: number[],
  closes: number[],
  volumes: number[],
  period: number = 14
): number[] {
  const n = closes.length;
  const mfi: number[] = [];

  for (let i = period; i < n; i++) {
    let posFlow = 0;
    let negFlow = 0;

    for (let j = i - period + 1; j <= i; j++) {
      const tp = (highs[j] + lows[j] + closes[j]) / 3;
      const prevTp = (highs[j - 1] + lows[j - 1] + closes[j - 1]) / 3;
      const rawMoneyFlow = tp * volumes[j];

      if (tp > prevTp) {
        posFlow += rawMoneyFlow;
      } else if (tp < prevTp) {
        negFlow += rawMoneyFlow;
      }
    }

    if (negFlow === 0) {
      mfi.push(100);
    } else {
      const ratio = posFlow / negFlow;
      mfi.push(100 - 100 / (1 + ratio));
    }
  }

  return mfi;
}

/**
 * OBV情绪 (On-Balance Volume趋势)
 */
export function calculateOBVSentiment(
  closes: number[],
  volumes: number[],
  period: number = 20
): number {
  const n = closes.length;
  if (n < 2) return 0;

  const obv: number[] = [0];
  for (let i = 1; i < n; i++) {
    if (closes[i] > closes[i - 1]) {
      obv.push(obv[i - 1] + volumes[i]);
    } else if (closes[i] < closes[i - 1]) {
      obv.push(obv[i - 1] - volumes[i]);
    } else {
      obv.push(obv[i - 1]);
    }
  }

  // OBV斜率
  const recent = obv.slice(-period);
  if (recent.length < 2) return 0;

  const x = recent.map((_, i) => i);
  const slope = linearSlope(x, recent);

  // 标准化到 -100 到 100
  const maxSlope = Math.max(...obv) - Math.min(...obv);
  return maxSlope > 0 ? Math.max(-100, Math.min(100, slope / maxSlope * 100 * period)) : 0;
}

// ===== Internal Functions =====

function calculateBreadthScore(inputs: SentimentInputs): number {
  const advDecRatio = inputs.advancers / Math.max(inputs.decliners, 1);
  const highLowRatio = inputs.newHighs / Math.max(inputs.newLows, 1);
  
  // 归一化到 -100 到 100
  const advDecScore = normalizeScore(advDecRatio, 0.2, 5, -100, 100);
  const highLowScore = normalizeScore(highLowRatio, 0.2, 5, -100, 100);
  
  return advDecScore * 0.6 + highLowScore * 0.4;
}

function calculateVolumeScore(inputs: SentimentInputs): number {
  const totalVol = inputs.upVolume + inputs.downVolume;
  if (totalVol === 0) return 0;
  
  const ratio = inputs.upVolume / totalVol;
  return normalizeScore(ratio, 0.2, 0.8, -100, 100);
}

function calculateVolatilityScore(inputs: SentimentInputs): number {
  // VIX > 均值 => 恐慌 => 低情绪
  // VIX < 均值 => 平静 => 高情绪
  if (inputs.vixMA === 0) return 0;
  
  const ratio = inputs.vix / inputs.vixMA;
  return normalizeScore(ratio, 1.5, 0.7, -100, 100);
}

function calculateMoneyFlowScore(inputs: SentimentInputs): number {
  const total = inputs.inflowAmount + inputs.outflowAmount;
  if (total === 0) return 0;
  
  const ratio = inputs.inflowAmount / total;
  return normalizeScore(ratio, 0.2, 0.8, -100, 100);
}

function calculateMarginScore(inputs: SentimentInputs): number {
  const total = inputs.marginBuy + inputs.marginSell;
  if (total === 0) return 0;
  
  const ratio = inputs.marginBuy / total;
  return normalizeScore(ratio, 0.2, 0.8, -100, 100);
}

function calculateExtremesScore(inputs: SentimentInputs): number {
  const total = inputs.limitUp + inputs.limitDown;
  if (total === 0) return 0;
  
  const ratio = inputs.limitUp / total;
  return normalizeScore(ratio, 0.1, 0.9, -100, 100);
}

function classifySentimentLevel(score: number): SentimentLevel {
  if (score <= -60) return 'extreme_fear';
  if (score <= -20) return 'fear';
  if (score <= 20) return 'neutral';
  if (score <= 60) return 'greed';
  return 'extreme_greed';
}

function generateSentimentSignals(
  inputs: SentimentInputs,
  scores: Record<string, number>
): string[] {
  const signals: string[] = [];
  
  if (scores.breadth < -50) signals.push('市场广度极差，多数股票下跌');
  if (scores.breadth > 50) signals.push('市场广度良好，多数股票上涨');
  if (inputs.vix > 30) signals.push('波动率偏高，市场恐慌');
  if (inputs.vix < 15) signals.push('波动率极低，市场过度自信');
  if (inputs.limitUp > inputs.limitDown * 3) signals.push('涨停远多于跌停，情绪亢奋');
  if (inputs.limitDown > inputs.limitUp * 3) signals.push('跌停远多于涨停，情绪恐慌');
  if (scores.overall < -60) signals.push('综合情绪极度悲观，可能存在超跌反弹机会');
  if (scores.overall > 60) signals.push('综合情绪极度乐观，注意回调风险');
  
  return signals;
}

function normalizeScore(
  value: number,
  minInput: number,
  maxInput: number,
  minOutput: number,
  maxOutput: number
): number {
  const clamped = Math.max(minInput, Math.min(maxInput, value));
  return minOutput + (clamped - minInput) / (maxInput - minInput) * (maxOutput - minOutput);
}

function rateScore(score: number): string {
  if (score <= 20) return 'Extreme Fear';
  if (score <= 40) return 'Fear';
  if (score <= 60) return 'Neutral';
  if (score <= 80) return 'Greed';
  return 'Extreme Greed';
}

function linearSlope(x: number[], y: number[]): number {
  const n = Math.min(x.length, y.length);
  if (n < 2) return 0;
  
  let sumX = 0, sumY = 0, sumXY = 0, sumX2 = 0;
  for (let i = 0; i < n; i++) {
    sumX += x[i];
    sumY += y[i];
    sumXY += x[i] * y[i];
    sumX2 += x[i] * x[i];
  }
  
  const denom = n * sumX2 - sumX * sumX;
  return Math.abs(denom) > 1e-10 ? (n * sumXY - sumX * sumY) / denom : 0;
}
