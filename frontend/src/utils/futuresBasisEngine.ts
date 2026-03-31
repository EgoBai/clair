/**
 * 期货基差分析引擎
 * 股指期货基差/升贴水/套保成本/交割日效应
 */

export interface FuturesData {
  ticker: string;
  name: string;
  type: 'IF' | 'IC' | 'IH' | 'IM';
  spot: number;
  futures: number;
  basis: number;           // 基差
  basisRatio: number;      // 基差率
  daysToExpiry: number;
  expiryDate: string;
  volume: number;
  openInterest: number;
}

export interface BasisAnalysis {
  ticker: string;
  basisState: 'premium' | 'discount' | 'par';
  annualizedBasis: number;
  hedgeCost: number;       // 套保成本(年化)
  arbitrageOpportunity: boolean;
  arbDirection?: 'cash_carry' | 'reverse_cash_carry';
  arbProfit?: number;
  expiryEffect: 'strong' | 'moderate' | 'weak';
  signal: string;
}

export interface TermStructure {
  type: string;
  contracts: { month: string; basis: number; annualized: number }[];
  structure: 'contango' | 'backwardation' | 'mixed';
  steepness: number;
  spreadSignal: string;
}

export interface DeliveryEffect {
  ticker: string;
  deliveryDate: string;
  daysBefore: number;
  expectedBasisConvergence: number;
  currentBasis: number;
  convergenceSpeed: 'fast' | 'normal' | 'slow';
  tradingAdvice: string;
}

/**
 * 基差分析
 */
export function analyzeBasis(futures: FuturesData): BasisAnalysis {
  const basis = futures.futures - futures.spot;
  const basisRatio = futures.spot > 0 ? basis / futures.spot : 0;

  let basisState: BasisAnalysis['basisState'];
  if (basisRatio > 0.001) basisState = 'premium';
  else if (basisRatio < -0.001) basisState = 'discount';
  else basisState = 'par';

  // 年化基差
  const daysFactor = futures.daysToExpiry > 0 ? 365 / futures.daysToExpiry : 365;
  const annualizedBasis = basisRatio * daysFactor;

  // 套保成本
  const hedgeCost = Math.abs(annualizedBasis);

  // 套利机会
  const riskFreeRate = 0.025;
  let arbitrageOpportunity = false;
  let arbDirection: BasisAnalysis['arbDirection'];
  let arbProfit = 0;

  if (annualizedBasis > riskFreeRate + 0.01) {
    arbitrageOpportunity = true;
    arbDirection = 'cash_carry';
    arbProfit = annualizedBasis - riskFreeRate;
  } else if (annualizedBasis < -riskFreeRate - 0.01) {
    arbitrageOpportunity = true;
    arbDirection = 'reverse_cash_carry';
    arbProfit = Math.abs(annualizedBasis) - riskFreeRate;
  }

  // 交割日效应
  let expiryEffect: BasisAnalysis['expiryEffect'];
  if (futures.daysToExpiry < 5) expiryEffect = 'strong';
  else if (futures.daysToExpiry < 15) expiryEffect = 'moderate';
  else expiryEffect = 'weak';

  // 信号
  let signal = '';
  if (basisState === 'discount' && Math.abs(basisRatio) > 0.02) {
    signal = '深度贴水，市场悲观，可考虑多期指';
  } else if (basisState === 'premium' && basisRatio > 0.02) {
    signal = '大幅升水，市场乐观，注意回归风险';
  } else if (arbitrageOpportunity) {
    signal = arbDirection === 'cash_carry' ? '正向套利机会' : '反向套利机会';
  } else {
    signal = '基差正常';
  }

  return {
    ticker: futures.ticker,
    basisState,
    annualizedBasis,
    hedgeCost,
    arbitrageOpportunity,
    arbDirection,
    arbProfit: arbProfit > 0 ? arbProfit : undefined,
    expiryEffect,
    signal,
  };
}

/**
 * 期限结构分析
 */
export function analyzeTermStructure(
  contracts: FuturesData[]
): TermStructure | null {
  if (contracts.length < 2) return null;

  const sorted = [...contracts].sort((a, b) => a.daysToExpiry - b.daysToExpiry);

  const contractList = sorted.map(c => {
    const basis = c.futures - c.spot;
    const annualized = c.spot > 0 && c.daysToExpiry > 0
      ? (basis / c.spot) * (365 / c.daysToExpiry)
      : 0;
    return {
      month: c.expiryDate.slice(0, 7),
      basis,
      annualized,
    };
  });

  // 期限结构形态
  let structure: TermStructure['structure'];
  const isAllContango = contractList.every((c, i) =>
    i === 0 || c.basis >= contractList[i - 1].basis
  );
  const isAllBackwardation = contractList.every((c, i) =>
    i === 0 || c.basis <= contractList[i - 1].basis
  );

  if (isAllContango) structure = 'contango';
  else if (isAllBackwardation) structure = 'backwardation';
  else structure = 'mixed';

  // 陡峭度
  const steepness = contractList.length > 1
    ? Math.abs(contractList[contractList.length - 1].basis - contractList[0].basis)
    : 0;

  return {
    type: sorted[0].type,
    contracts: contractList,
    structure,
    steepness,
    spreadSignal: structure === 'contango'
      ? '远月升水，市场看好长期'
      : structure === 'backwardation'
        ? '远月贴水，市场担心长期'
        : '期限结构复杂，注意跨期价差',
  };
}

/**
 * 交割日效应分析
 */
export function analyzeDeliveryEffect(futures: FuturesData): DeliveryEffect {
  const basis = futures.futures - futures.spot;
  const expectedConvergence = basis / Math.max(1, futures.daysToExpiry);

  let convergenceSpeed: DeliveryEffect['convergenceSpeed'];
  if (futures.daysToExpiry < 5) convergenceSpeed = 'fast';
  else if (futures.daysToExpiry < 15) convergenceSpeed = 'normal';
  else convergenceSpeed = 'slow';

  let tradingAdvice = '';
  if (futures.daysToExpiry < 3) {
    tradingAdvice = '临近交割，注意移仓换月';
  } else if (Math.abs(basis / futures.spot) > 0.01) {
    tradingAdvice = '基差较大，可考虑套利或对冲';
  } else {
    tradingAdvice = '基差正常';
  }

  return {
    ticker: futures.ticker,
    deliveryDate: futures.expiryDate,
    daysBefore: futures.daysToExpiry,
    expectedBasisConvergence: expectedConvergence,
    currentBasis: basis,
    convergenceSpeed,
    tradingAdvice,
  };
}

/**
 * 跨品种价差
 */
export function crossVarietySpread(
  futures1: FuturesData,
  futures2: FuturesData
): {
  spread: number;
  spreadRatio: number;
  historicalPercentile: number;
  signal: string;
} {
  const spread = futures1.futures - futures2.futures;
  const spreadRatio = futures2.futures > 0 ? spread / futures2.futures : 0;

  // 简化的历史百分位
  const historicalPercentile = spreadRatio > 0.05 ? 80 :
    spreadRatio > 0 ? 50 : 20;

  let signal = '';
  if (historicalPercentile > 80) signal = '价差处于高位，可做空价差';
  else if (historicalPercentile < 20) signal = '价差处于低位，可做多价差';
  else signal = '价差正常';

  return { spread, spreadRatio, historicalPercentile, signal };
}
