/**
 * 债股联动分析引擎 - 可转债/信用利差/利率敏感度分析
 */

export interface BondData {
  ticker: string;
  name: string;
  type: 'treasury' | 'corporate' | 'convertible' | 'local_gov';
  faceValue: number;
  couponRate: number;
  maturity: string; // YYYY-MM-DD
  yield: number;
  price: number;
  creditRating: string;
  duration: number; // 久期
}

export interface StockBondCorrelation {
  stockTicker: string;
  bondTicker: string;
  correlation30d: number;
  correlation90d: number;
  spread: number; // 股债利差(%)
  spreadPercentile: number; // 历史分位数
  signal: 'stocks_cheap' | 'bonds_cheap' | 'neutral' | 'extreme_stocks' | 'extreme_bonds';
  recommendation: string;
}

export interface CreditSpreadAnalysis {
  sector: string;
  avgSpread: number;
  spreadChange: number; // 近期变化(bp)
  riskLevel: 'low' | 'moderate' | 'elevated' | 'high';
  defaultProbability: number; // 违约概率(%)
  tightening: boolean; // 是否收窄
}

export interface ConvertibleBondAnalysis {
  bondTicker: string;
  stockTicker: string;
  conversionPrice: number;
  conversionRatio: number;
  conversionValue: number;
  premium: number; // 转股溢价率(%)
  bondFloor: number; // 债底
  optionValue: number; // 期权价值
  strategy: 'convert' | 'hold_bond' | 'sell' | 'arbitrage';
  ytm: number; // 到期收益率
  breakevenDays: number; // 回本天数
}

export interface InterestRateSensitivity {
  portfolioDuration: number;
  rateShock100bp: number; // 利率+100bp冲击
  rateShock50bp: number;
  rateShockMinus50bp: number;
  convexity: number;
  immunizationGap: number; // 免疫缺口(年)
}

/**
 * 计算股债相关性
 */
export function analyzeStockBondCorrelation(
  stockReturns: number[],
  bondYields: number[],
  stockPrice: number,
  bondYield: number,
  earningsYield: number,
): StockBondCorrelation {
  const n = Math.min(stockReturns.length, bondYields.length);
  if (n < 5) {
    return {
      stockTicker: '',
      bondTicker: '',
      correlation30d: 0,
      correlation90d: 0,
      spread: 0,
      spreadPercentile: 50,
      signal: 'neutral',
      recommendation: '数据不足',
    };
  }

  // 计算相关性
  const corr30 = calculateCorrelation(stockReturns.slice(-30), bondYields.slice(-30));
  const corr90 = calculateCorrelation(stockReturns.slice(-90), bondYields.slice(-90));

  // 股债利差 = 盈利收益率 - 债券收益率
  const spread = earningsYield - bondYield;

  // 历史分位数估算
  const spreads = stockReturns.map((_, i) => {
    const ey = i < bondYields.length ? 1 / stockPrice * (1 + stockReturns[i] / 100) * 100 : earningsYield;
    return ey - (bondYields[i] || bondYield);
  });
  const sorted = [...spreads].sort((a, b) => a - b);
  const percentile = (sorted.filter(s => s <= spread).length / sorted.length) * 100;

  // 信号判断
  let signal: StockBondCorrelation['signal'];
  let recommendation: string;

  if (percentile > 90) {
    signal = 'extreme_stocks';
    recommendation = '股债利差处于极高位，股票极具吸引力';
  } else if (percentile > 70) {
    signal = 'stocks_cheap';
    recommendation = '股债利差较高，股票相对便宜';
  } else if (percentile < 10) {
    signal = 'extreme_bonds';
    recommendation = '股债利差处于极低位，债券更具吸引力';
  } else if (percentile < 30) {
    signal = 'bonds_cheap';
    recommendation = '股债利差较低，可考虑增配债券';
  } else {
    signal = 'neutral';
    recommendation = '股债利差处于正常区间';
  }

  return {
    stockTicker: '',
    bondTicker: '',
    correlation30d: Math.round(corr30 * 100) / 100,
    correlation90d: Math.round(corr90 * 100) / 100,
    spread: Math.round(spread * 100) / 100,
    spreadPercentile: Math.round(percentile),
    signal,
    recommendation,
  };
}

/**
 * 分析信用利差
 */
export function analyzeCreditSpreads(
  bonds: BondData[],
  treasuryYield: number,
): CreditSpreadAnalysis[] {
  const sectorMap: Record<string, BondData[]> = {};
  bonds.filter(b => b.type !== 'treasury').forEach(b => {
    const sector = b.creditRating.charAt(0);
    if (!sectorMap[sector]) sectorMap[sector] = [];
    sectorMap[sector].push(b);
  });

  return Object.entries(sectorMap).map(([sector, sectorBonds]) => {
    const avgYield = sectorBonds.reduce((s, b) => s + b.yield, 0) / sectorBonds.length;
    const avgSpread = avgYield - treasuryYield;

    // 近期变化 (简化: 用久期加权估算)
    const avgDuration = sectorBonds.reduce((s, b) => s + b.duration, 0) / sectorBonds.length;
    const spreadChange = avgDuration * 10; // 近似变化(bp)

    let riskLevel: CreditSpreadAnalysis['riskLevel'];
    if (avgSpread < 0.5) riskLevel = 'low';
    else if (avgSpread < 1.5) riskLevel = 'moderate';
    else if (avgSpread < 3) riskLevel = 'elevated';
    else riskLevel = 'high';

    // 违约概率估算 (简化模型)
    const ratingMultiplier: Record<string, number> = { A: 0.01, B: 0.05, C: 0.15, D: 0.5 };
    const rating = sector.charAt(0);
    const defaultProbability = (ratingMultiplier[rating] || 0.03) * avgSpread;

    return {
      sector: `信用等级${sector}`,
      avgSpread: Math.round(avgSpread * 10000) / 10000,
      spreadChange: Math.round(spreadChange),
      riskLevel,
      defaultProbability: Math.round(defaultProbability * 1000) / 1000,
      tightening: spreadChange < 0,
    };
  });
}

/**
 * 分析可转债
 */
export function analyzeConvertibleBond(
  bond: BondData,
  stockPrice: number,
  conversionPrice: number,
): ConvertibleBondAnalysis {
  const conversionRatio = bond.faceValue / conversionPrice;
  const conversionValue = conversionRatio * stockPrice;
  const premium = ((bond.price - conversionValue) / conversionValue) * 100;

  // 债底 = 面值 + 剩余利息折现
  const yearsToMaturity = Math.max(0.1, (new Date(bond.maturity).getTime() - Date.now()) / (365.25 * 24 * 3600 * 1000));
  const bondFloor = bond.faceValue / Math.pow(1 + bond.yield / 100, yearsToMaturity)
    + bond.couponRate * bond.faceValue * yearsToMaturity / 100;

  const optionValue = Math.max(0, bond.price - bondFloor);

  // YTM
  const ytm = ((bond.faceValue + bond.couponRate * yearsToMaturity * bond.faceValue / 100) / bond.price - 1) / yearsToMaturity * 100;

  // 策略
  let strategy: ConvertibleBondAnalysis['strategy'];
  if (premium < 0) {
    strategy = 'arbitrage'; // 负溢价套利
  } else if (premium < 10 && ytm > 2) {
    strategy = 'convert'; // 低溢价转股
  } else if (bondFloor > bond.price * 0.95) {
    strategy = 'hold_bond'; // 接近债底持有
  } else {
    strategy = 'sell';
  }

  // 回本天数
  const dailyYield = Math.pow(1 + bond.couponRate / 100, 1 / 365) - 1;
  const discount = bond.price - bond.faceValue;
  const breakevenDays = discount < 0 ? Math.round(Math.abs(discount) / (bond.faceValue * dailyYield)) : 0;

  return {
    bondTicker: bond.ticker,
    stockTicker: '',
    conversionPrice,
    conversionRatio: Math.round(conversionRatio * 100) / 100,
    conversionValue: Math.round(conversionValue * 100) / 100,
    premium: Math.round(premium * 100) / 100,
    bondFloor: Math.round(bondFloor * 100) / 100,
    optionValue: Math.round(optionValue * 100) / 100,
    strategy,
    ytm: Math.round(ytm * 100) / 100,
    breakevenDays,
  };
}

/**
 * 利率敏感度分析
 */
export function analyzeInterestRateSensitivity(
  bonds: BondData[],
  targetDuration: number = 5,
): InterestRateSensitivity {
  const totalValue = bonds.reduce((s, b) => s + b.price, 0);
  const portfolioDuration = bonds.reduce((s, b) => s + b.duration * (b.price / totalValue), 0);
  const portfolioConvexity = bonds.reduce((s, b) => {
    const w = b.price / totalValue;
    return s + w * b.duration * b.duration;
  }, 0);

  // 利率冲击
  const rateShock100bp = -portfolioDuration * 1;
  const rateShock50bp = -portfolioDuration * 0.5;
  const rateShockMinus50bp = portfolioDuration * 0.5 + 0.5 * portfolioConvexity * 0.0025;

  return {
    portfolioDuration: Math.round(portfolioDuration * 100) / 100,
    rateShock100bp: Math.round(rateShock100bp * 100) / 100,
    rateShock50bp: Math.round(rateShock50bp * 100) / 100,
    rateShockMinus50bp: Math.round(rateShockMinus50bp * 100) / 100,
    convexity: Math.round(portfolioConvexity * 100) / 100,
    immunizationGap: Math.round((targetDuration - portfolioDuration) * 100) / 100,
  };
}

function calculateCorrelation(x: number[], y: number[]): number {
  const n = Math.min(x.length, y.length);
  if (n < 2) return 0;
  const mx = x.slice(0, n).reduce((a, b) => a + b, 0) / n;
  const my = y.slice(0, n).reduce((a, b) => a + b, 0) / n;
  let num = 0, dx = 0, dy = 0;
  for (let i = 0; i < n; i++) {
    const px = x[i] - mx, py = y[i] - my;
    num += px * py; dx += px * px; dy += py * py;
  }
  const d = Math.sqrt(dx * dy);
  return d > 0 ? num / d : 0;
}
