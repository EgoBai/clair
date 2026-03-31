/**
 * 专利分析引擎
 * - 专利数量趋势
 * - 专利质量评估(引用/有效率)
 * - 技术领域分布
 * - 研发投入效率
 * - 技术竞争力评分
 */
export interface PatentData {
  totalPatents: number;
  validPatents: number;
  expiredPatents: number;
  applications: { year: number; count: number }[];
  citations: { patentId: string; citedBy: number }[];
  fields: { name: string; count: number }[];
  rdExpense: number; // 研发费用(万元)
  revenue: number; // 收入(万元)
  industryAvgPatentsPerBillion: number; // 行业每亿收入专利数
  competitorPatents: number[]; // 竞争对手专利数
}

export interface PatentResult {
  patentGrowthRate: number; // 年均增长率
  validityRate: number; // 有效率
  avgCitations: number; // 平均被引次数
  techDiversity: number; // 技术多样性(0-1)
  rdIntensity: number; // 研发强度
  patentsPerRevenue: number; // 每亿收入专利数
  relativeStrength: number; // 相对竞争力(0-100)
  innovationScore: number; // 创新评分(0-100)
  topField: string;
  innovationTier: 'leader' | 'follower' | 'laggard';
  keyInsights: string[];
}

export function analyzePatents(data: PatentData): PatentResult {
  const keyInsights: string[] = [];

  // 专利增长率
  const sorted = [...data.applications].sort((a, b) => a.year - b.year);
  let patentGrowthRate = 0;
  if (sorted.length >= 2) {
    const first = sorted[0].count || 1;
    const last = sorted[sorted.length - 1].count || 1;
    const years = sorted[sorted.length - 1].year - sorted[0].year || 1;
    patentGrowthRate = Math.pow(last / first, 1 / years) - 1;
  }

  // 有效率
  const validityRate = data.totalPatents > 0 ? data.validPatents / data.totalPatents : 0;
  if (validityRate < 0.5) keyInsights.push('专利有效率偏低，需关注维护');

  // 平均被引次数
  const avgCitations = data.citations.length > 0
    ? data.citations.reduce((s, c) => s + c.citedBy, 0) / data.citations.length
    : 0;
  if (avgCitations > 5) keyInsights.push('专利引用水平较高，技术影响力强');

  // 技术多样性
  const totalFieldCount = data.fields.reduce((s, f) => s + f.count, 0) || 1;
  const fieldHHI = data.fields.reduce((s, f) => {
    const share = f.count / totalFieldCount;
    return s + share * share;
  }, 0);
  const techDiversity = 1 - fieldHHI;

  // 研发强度
  const rdIntensity = data.rdExpense / Math.max(data.revenue, 1);
  if (rdIntensity > 0.1) keyInsights.push('研发投入强度较高');

  // 每亿收入专利数
  const patentsPerRevenue = data.totalPatents / Math.max(data.revenue / 10000, 0.01);

  // 相对竞争力
  const avgCompetitor = data.competitorPatents.length > 0
    ? data.competitorPatents.reduce((s, p) => s + p, 0) / data.competitorPatents.length
    : 1;
  const relativeStrength = Math.min(100, Math.round(data.totalPatents / Math.max(avgCompetitor, 1) * 50));

  // 创新评分
  let innovationScore = 50;
  innovationScore += Math.min(20, patentGrowthRate * 100);
  innovationScore += Math.min(15, validityRate * 20);
  innovationScore += Math.min(15, avgCitations * 3);
  innovationScore = Math.max(0, Math.min(100, Math.round(innovationScore)));

  // 创新层级
  let innovationTier: PatentResult['innovationTier'];
  if (innovationScore >= 75) innovationTier = 'leader';
  else if (innovationScore >= 50) innovationTier = 'follower';
  else innovationTier = 'laggard';

  // 最强技术领域
  const topField = data.fields.length > 0
    ? data.fields.reduce((a, b) => a.count > b.count ? a : b).name
    : '未知';

  return {
    patentGrowthRate: Math.round(patentGrowthRate * 10000) / 10000,
    validityRate: Math.round(validityRate * 100) / 100,
    avgCitations: Math.round(avgCitations * 10) / 10,
    techDiversity: Math.round(techDiversity * 100) / 100,
    rdIntensity: Math.round(rdIntensity * 10000) / 10000,
    patentsPerRevenue: Math.round(patentsPerRevenue * 100) / 100,
    relativeStrength,
    innovationScore,
    topField,
    innovationTier,
    keyInsights,
  };
}
