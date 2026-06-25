/**
 * 未来价值发现 - 评分计算器
 * 各维度评分计算实现
 */

import {
  scorePE,
  scorePB,
  scoreROE,
  scoreGrowth,
  scoreRSI,
  scoreVolumeRatio,
  calcMA,
  calcRSI,
  calcMACD,
  volumeRatio,
} from '../utils/futureValueUtils';

// ==================== 类型定义 ====================

/** 基本面数据 */
export interface FundamentalData {
  pe: number;
  pb: number;
  revenueGrowth: number;
  profitGrowth: number;
  roe: number;
}

/** 技术面数据 */
export interface TechnicalData {
  closes: number[];
  volumes: number[];
  currentPrice: number;
}

/** 资金面数据 */
export interface CapitalFlowData {
  mainNetInflow: number;
  northboundNetBuy: number;
  marginNetBuy: number;
  totalMarketCap: number;
}

/** 行业前景原始数据 */
export interface IndustryData {
  industryGrowthRate: number;
  marketSize: number;
  policySupport: number;
  competitionIntensity: number;
  technologyTrend: number;
}

/** 公司竞争力原始数据 */
export interface CompetitivenessData {
  marketShare: number;
  roe: number;
  revenueGrowth: number;
  brandValue: number;
  innovationCapability: number;
}

/** 风险因素原始数据 */
export interface RiskData {
  debtRatio: number;
  volatility: number;
  regulatoryRisk: number;
  industryRisk: number;
  managementRisk: number;
}

/** AI分析数据 */
export interface AIAnalysisData {
  industryScore?: number;
  competitivenessScore?: number;
  riskScore?: number;
  industry?: IndustryData;
  competitiveness?: CompetitivenessData;
  risk?: RiskData;
}

/** 基本面评分结果 */
export interface FundamentalScore {
  peScore: number;
  pbScore: number;
  revenueGrowthScore: number;
  profitGrowthScore: number;
  roeScore: number;
  total: number;
}

/** 技术面评分结果 */
export interface TechnicalScore {
  maScore: number;
  rsiScore: number;
  macdScore: number;
  volumeScore: number;
  total: number;
}

/** 资金面评分结果 */
export interface CapitalFlowScore {
  mainInflowScore: number;
  northboundScore: number;
  marginScore: number;
  total: number;
}

/** AI分析评分结果 */
export interface AIAnalysisScore {
  industryScore: number;
  competitivenessScore: number;
  riskScore: number;
  total: number;
}

/** 综合评分结果 */
export interface CompositeScore {
  fundamental: FundamentalScore;
  technical: TechnicalScore;
  capitalFlow: CapitalFlowScore;
  aiAnalysis: AIAnalysisScore;
  total: number;
  rating: '强烈推荐' | '推荐' | '中性' | '谨慎' | '回避';
  timestamp: string;
}

// ==================== 基本面评分 ====================

/**
 * 计算基本面评分
 * 权重: PE 25%, PB 20%, 营收增长 20%, 利润增长 20%, ROE 15%
 */
export function calculateFundamentalScore(data: FundamentalData): FundamentalScore {
  const peScore = scorePE(data.pe);
  const pbScore = scorePB(data.pb);
  const revenueGrowthScore = scoreGrowth(data.revenueGrowth);
  const profitGrowthScore = scoreGrowth(data.profitGrowth);
  const roeScore = scoreROE(data.roe);

  const total =
    peScore * 0.25 +
    pbScore * 0.20 +
    revenueGrowthScore * 0.20 +
    profitGrowthScore * 0.20 +
    roeScore * 0.15;

  return {
    peScore,
    pbScore,
    revenueGrowthScore,
    profitGrowthScore,
    roeScore,
    total: Math.round(total * 100) / 100,
  };
}

// ==================== 技术面评分 ====================

/**
 * 计算技术面评分
 * 权重: MA趋势 30%, RSI 25%, MACD 25%, 成交量 20%
 */
export function calculateTechnicalScore(data: TechnicalData): TechnicalScore {
  const { closes, volumes, currentPrice } = data;

  // MA趋势评分
  const ma5 = calcMA(closes, 5);
  const ma20 = calcMA(closes, 20);
  const ma60 = calcMA(closes, 60);

  let maScore = 50;
  const lastIdx = closes.length - 1;

  if (ma5[lastIdx] !== null && ma20[lastIdx] !== null) {
    const ma5Val = ma5[lastIdx] as number;
    const ma20Val = ma20[lastIdx] as number;

    // 多头排列加分
    if (currentPrice > ma5Val && ma5Val > ma20Val) {
      maScore = 80;
    } else if (currentPrice > ma20Val) {
      maScore = 65;
    } else if (currentPrice < ma5Val && ma5Val < ma20Val) {
      maScore = 20;
    } else if (currentPrice < ma20Val) {
      maScore = 35;
    }

    // MA60长期趋势
    if (ma60[lastIdx] !== null) {
      const ma60Val = ma60[lastIdx] as number;
      if (ma20Val > ma60Val) maScore += 10;
      else maScore -= 10;
    }
  }

  // RSI评分
  const rsi = calcRSI(closes);
  const rsiVal = rsi[lastIdx] ?? 50;
  const rsiScore = scoreRSI(rsiVal);

  // MACD评分
  const macd = calcMACD(closes);
  let macdScore = 50;

  if (macd.histogram[lastIdx] !== null && macd.histogram[lastIdx - 1] !== null) {
    const histNow = macd.histogram[lastIdx] as number;
    const histPrev = macd.histogram[lastIdx - 1] as number;

    if (histNow > 0 && histPrev <= 0) {
      macdScore = 85; // 金叉
    } else if (histNow > 0 && histNow > histPrev) {
      macdScore = 75; // 红柱放大
    } else if (histNow > 0) {
      macdScore = 60;
    } else if (histNow < 0 && histPrev >= 0) {
      macdScore = 15; // 死叉
    } else if (histNow < 0 && histNow < histPrev) {
      macdScore = 25; // 绿柱放大
    } else {
      macdScore = 40;
    }
  }

  // 成交量评分
  const volRatio = volumeRatio(volumes);
  const volumeScore = scoreVolumeRatio(volRatio);

  const total =
    maScore * 0.30 +
    rsiScore * 0.25 +
    macdScore * 0.25 +
    volumeScore * 0.20;

  return {
    maScore,
    rsiScore,
    macdScore,
    volumeScore,
    total: Math.round(total * 100) / 100,
  };
}

// ==================== 资金面评分 ====================

/**
 * 计算资金面评分
 * 权重: 主力资金 40%, 北向资金 35%, 融资融券 25%
 */
export function calculateCapitalFlowScore(data: CapitalFlowData): CapitalFlowScore {
  const { mainNetInflow, northboundNetBuy, marginNetBuy, totalMarketCap } = data;

  // 主力资金评分 (占市值比例)
  const mainRatio = totalMarketCap > 0 ? (mainNetInflow / totalMarketCap) * 10000 : 0;
  const mainInflowScore = mainRatio > 5 ? 90
    : mainRatio > 2 ? 75
    : mainRatio > 0 ? 60
    : mainRatio > -2 ? 40
    : mainRatio > -5 ? 25
    : 10;

  // 北向资金评分
  const northboundScore = northboundNetBuy > 1e9 ? 90
    : northboundNetBuy > 5e8 ? 75
    : northboundNetBuy > 0 ? 60
    : northboundNetBuy > -5e8 ? 40
    : northboundNetBuy > -1e9 ? 25
    : 10;

  // 融资融券评分
  const marginScore = marginNetBuy > 1e8 ? 80
    : marginNetBuy > 0 ? 65
    : marginNetBuy > -1e8 ? 40
    : 25;

  const total =
    mainInflowScore * 0.40 +
    northboundScore * 0.35 +
    marginScore * 0.25;

  return {
    mainInflowScore,
    northboundScore,
    marginScore,
    total: Math.round(total * 100) / 100,
  };
}

// ==================== AI分析评分 ====================

/**
 * 计算行业前景评分 (0-100)
 * 权重: 增长率 30%, 市场规模 20%, 政策支持 25%, 竞争强度 15% (反转), 技术趋势 10%
 */
function scoreIndustryFromRaw(data: IndustryData): number {
  const growthScore = Math.max(0, Math.min(100, 50 + data.industryGrowthRate * 2));
  const marketScore = Math.max(0, Math.min(100, data.marketSize > 10000 ? 90 : data.marketSize > 5000 ? 75 : data.marketSize > 1000 ? 60 : data.marketSize > 100 ? 45 : 30));
  const policyScore = Math.max(0, Math.min(100, data.policySupport));
  const competitionScore = Math.max(0, Math.min(100, 100 - data.competitionIntensity));
  const techScore = Math.max(0, Math.min(100, data.technologyTrend));

  return Math.round((growthScore * 0.30 + marketScore * 0.20 + policyScore * 0.25 + competitionScore * 0.15 + techScore * 0.10) * 100) / 100;
}

/**
 * 计算公司竞争力评分 (0-100)
 * 权重: 市场份额 25%, ROE 20%, 营收增长 20%, 品牌价值 15%, 创新能力 20%
 */
function scoreCompetitivenessFromRaw(data: CompetitivenessData): number {
  const shareScore = Math.max(0, Math.min(100, data.marketShare > 30 ? 95 : data.marketShare > 15 ? 80 : data.marketShare > 5 ? 65 : data.marketShare > 1 ? 45 : 25));
  const roeScore = Math.max(0, Math.min(100, data.roe > 30 ? 100 : data.roe > 20 ? 85 : data.roe > 10 ? 70 : data.roe > 5 ? 50 : data.roe > 0 ? 30 : 0));
  const growthScore = Math.max(0, Math.min(100, 50 + data.revenueGrowth * 2));
  const brandScore = Math.max(0, Math.min(100, data.brandValue));
  const innovationScore = Math.max(0, Math.min(100, data.innovationCapability));

  return Math.round((shareScore * 0.25 + roeScore * 0.20 + growthScore * 0.20 + brandScore * 0.15 + innovationScore * 0.20) * 100) / 100;
}

/**
 * 计算风险评分 (0-100, 越低越好)
 * 权重: 资产负债率 25%, 波动率 20%, 监管风险 20%, 行业风险 20%, 管理层风险 15%
 */
function scoreRiskFromRaw(data: RiskData): number {
  const debtScore = Math.max(0, Math.min(100, data.debtRatio < 30 ? 90 : data.debtRatio < 50 ? 70 : data.debtRatio < 70 ? 50 : data.debtRatio < 85 ? 30 : 10));
  const volatilityScore = Math.max(0, Math.min(100, data.volatility < 15 ? 90 : data.volatility < 25 ? 70 : data.volatility < 35 ? 50 : data.volatility < 50 ? 30 : 10));
  const regulatoryScore = Math.max(0, Math.min(100, 100 - data.regulatoryRisk));
  const industryRiskScore = Math.max(0, Math.min(100, 100 - data.industryRisk));
  const managementScore = Math.max(0, Math.min(100, 100 - data.managementRisk));

  return Math.round((debtScore * 0.25 + volatilityScore * 0.20 + regulatoryScore * 0.20 + industryRiskScore * 0.20 + managementScore * 0.15) * 100) / 100;
}

/**
 * 计算AI分析评分
 * 权重: 行业前景 35%, 公司竞争力 40%, 风险因素 25%
 * 支持预评分数据或原始数据计算
 */
export function calculateAIAnalysisScore(data: AIAnalysisData): AIAnalysisScore {
  // 行业前景评分
  const industryScore = data.industry
    ? Math.max(0, Math.min(100, scoreIndustryFromRaw(data.industry)))
    : Math.max(0, Math.min(100, data.industryScore ?? 50));

  // 公司竞争力评分
  const competitivenessScore = data.competitiveness
    ? Math.max(0, Math.min(100, scoreCompetitivenessFromRaw(data.competitiveness)))
    : Math.max(0, Math.min(100, data.competitivenessScore ?? 50));

  // 风险评分 (反转: 低风险 = 高分)
  const riskScore = data.risk
    ? Math.max(0, Math.min(100, 100 - scoreRiskFromRaw(data.risk)))
    : Math.max(0, Math.min(100, data.riskScore !== undefined ? 100 - data.riskScore : 50));

  const total =
    industryScore * 0.35 +
    competitivenessScore * 0.40 +
    riskScore * 0.25;

  return {
    industryScore,
    competitivenessScore,
    riskScore,
    total: Math.round(total * 100) / 100,
  };
}

// ==================== 综合评分 ====================

/**
 * 计算综合评分
 * 权重: 基本面 40%, 技术面 30%, 资金面 20%, AI分析 10%
 */
export function calculateCompositeScore(
  fundamental: FundamentalScore,
  technical: TechnicalScore,
  capitalFlow: CapitalFlowScore,
  aiAnalysis: AIAnalysisScore
): CompositeScore {
  const total =
    fundamental.total * 0.40 +
    technical.total * 0.30 +
    capitalFlow.total * 0.20 +
    aiAnalysis.total * 0.10;

  const rating = getRating(total);

  return {
    fundamental,
    technical,
    capitalFlow,
    aiAnalysis,
    total: Math.round(total * 100) / 100,
    rating,
    timestamp: new Date().toISOString(),
  };
}

/**
 * 根据综合评分确定评级
 */
function getRating(score: number): CompositeScore['rating'] {
  if (score >= 80) return '强烈推荐';
  if (score >= 65) return '推荐';
  if (score >= 50) return '中性';
  if (score >= 35) return '谨慎';
  return '回避';
}

/**
 * 一键计算完整评分
 */
export function calculateFullScore(
  fundamental: FundamentalData,
  technical: TechnicalData,
  capitalFlow: CapitalFlowData,
  aiAnalysis: AIAnalysisData
): CompositeScore {
  const fundScore = calculateFundamentalScore(fundamental);
  const techScore = calculateTechnicalScore(technical);
  const capScore = calculateCapitalFlowScore(capitalFlow);
  const aiScore = calculateAIAnalysisScore(aiAnalysis);

  return calculateCompositeScore(fundScore, techScore, capScore, aiScore);
}
