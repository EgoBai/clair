/**
 * ESG影响力引擎
 * - E评分(环境)
 * - S评分(社会)
 * - G评分(治理)
 * - 综合ESG评分
 * - ESG趋势分析
 * - ESG-收益关联度
 * - ESG风险评估
 */

export interface ESGComponent {
  score: number; // 0-100
  trend: 'improving' | 'stable' | 'deteriorating';
  keyFactors: string[];
}

export interface ESGScore {
  environmental: ESGComponent;
  social: ESGComponent;
  governance: ESGComponent;
  overall: number;
  rating: 'AAA' | 'AA' | 'A' | 'BBB' | 'BB' | 'B' | 'CCC';
  percentile: number;
}

export interface ESGReturnRelation {
  correlation: number;
  alphaFromESG: number;
  esgPremium: number; // ESG溢价(bp)
  outperformance: number; // ESG高分组跑赢低分组(%)
}

export interface ESGRisk {
  carbonRisk: number; // 0-100
  socialRisk: number;
  governanceRisk: number;
  overallRisk: 'low' | 'medium' | 'high' | 'severe';
  keyRisks: string[];
}

export class ESGImpactEngine {
  /**
   * 计算ESG评分
   */
  calcESGScore(
    envData: { emissions: number; renewablePct: number; wasteRecyclePct: number },
    socialData: { employeeSatisfaction: number; diversityPct: number; communitySpend: number },
    govData: { boardIndependence: number; auditQuality: number; transparency: number },
  ): ESGScore {
    // E评分
    const envScore = Math.min(100, Math.max(0,
      (1 - Math.min(1, envData.emissions / 1000)) * 40 +
      envData.renewablePct * 0.3 +
      envData.wasteRecyclePct * 0.3
    ));

    // S评分
    const socScore = Math.min(100, Math.max(0,
      envData.renewablePct * 0 + // placeholder
      socialData.employeeSatisfaction * 0.4 +
      socialData.diversityPct * 0.3 +
      Math.min(100, socialData.communitySpend * 10) * 0.3
    ));

    // G评分
    const govScore = Math.min(100, Math.max(0,
      govData.boardIndependence * 0.4 +
      govData.auditQuality * 0.3 +
      govData.transparency * 0.3
    ));

    const overall = envScore * 0.35 + socScore * 0.3 + govScore * 0.35;

    let rating: ESGScore['rating'];
    if (overall > 85) rating = 'AAA';
    else if (overall > 75) rating = 'AA';
    else if (overall > 65) rating = 'A';
    else if (overall > 50) rating = 'BBB';
    else if (overall > 35) rating = 'BB';
    else if (overall > 20) rating = 'B';
    else rating = 'CCC';

    const envFactors = [];
    if (envData.emissions > 500) envFactors.push('高碳排放');
    if (envData.renewablePct > 50) envFactors.push('高可再生能源占比');

    const socFactors = [];
    if (socialData.employeeSatisfaction > 80) socFactors.push('高员工满意度');
    if (socialData.diversityPct > 40) socFactors.push('高多元化');

    const govFactors = [];
    if (govData.boardIndependence > 60) govFactors.push('高独立董事比例');

    return {
      environmental: { score: Math.round(envScore * 10) / 10, trend: 'stable', keyFactors: envFactors },
      social: { score: Math.round(socScore * 10) / 10, trend: 'stable', keyFactors: socFactors },
      governance: { score: Math.round(govScore * 10) / 10, trend: 'stable', keyFactors: govFactors },
      overall: Math.round(overall * 10) / 10,
      rating,
      percentile: Math.round(overall),
    };
  }

  /**
   * ESG与收益关系分析
   */
  analyzeESGReturnRelation(
    esgScores: number[],
    returns: number[],
  ): ESGReturnRelation {
    const n = Math.min(esgScores.length, returns.length);
    if (n < 10) {
      return { correlation: 0, alphaFromESG: 0, esgPremium: 0, outperformance: 0 };
    }

    // 相关性
    const meanE = esgScores.slice(0, n).reduce((a, b) => a + b, 0) / n;
    const meanR = returns.slice(0, n).reduce((a, b) => a + b, 0) / n;
    let num = 0, denE = 0, denR = 0;
    for (let i = 0; i < n; i++) {
      num += (esgScores[i] - meanE) * (returns[i] - meanR);
      denE += (esgScores[i] - meanE) ** 2;
      denR += (returns[i] - meanR) ** 2;
    }
    const correlation = denE > 0 && denR > 0 ? num / Math.sqrt(denE * denR) : 0;

    // ESG Alpha
    const beta = denE > 0 ? num / denE : 0;
    const alphaFromESG = meanR - beta * meanE;

    // ESG溢价
    const esgPremium = correlation * 100;

    // 高分组 vs 低分组
    const median = [...esgScores].sort((a, b) => a - b)[Math.floor(n / 2)];
    const highGroup = returns.filter((_, i) => esgScores[i] >= median);
    const lowGroup = returns.filter((_, i) => esgScores[i] < median);
    const highAvg = highGroup.length > 0 ? highGroup.reduce((a, b) => a + b, 0) / highGroup.length : 0;
    const lowAvg = lowGroup.length > 0 ? lowGroup.reduce((a, b) => a + b, 0) / lowGroup.length : 0;
    const outperformance = (highAvg - lowAvg) * 100;

    return {
      correlation: Math.round(correlation * 10000) / 10000,
      alphaFromESG: Math.round(alphaFromESG * 10000) / 10000,
      esgPremium: Math.round(esgPremium * 100) / 100,
      outperformance: Math.round(outperformance * 100) / 100,
    };
  }

  /**
   * ESG风险评估
   */
  assessESGRisk(
    esgScore: ESGScore,
    industryAvg: number,
  ): ESGRisk {
    const carbonRisk = Math.max(0, 100 - esgScore.environmental.score);
    const socialRisk = Math.max(0, 100 - esgScore.social.score);
    const governanceRisk = Math.max(0, 100 - esgScore.governance.score);

    const overallScore = (carbonRisk + socialRisk + governanceRisk) / 3;
    let overallRisk: ESGRisk['overallRisk'];
    if (overallScore > 70) overallRisk = 'severe';
    else if (overallScore > 50) overallRisk = 'high';
    else if (overallScore > 30) overallRisk = 'medium';
    else overallRisk = 'low';

    const keyRisks: string[] = [];
    if (carbonRisk > 60) keyRisks.push('高碳转型风险');
    if (socialRisk > 60) keyRisks.push('社会声誉风险');
    if (governanceRisk > 60) keyRisks.push('公司治理风险');
    if (esgScore.overall < industryAvg) keyRisks.push('ESG低于行业平均');

    return {
      carbonRisk: Math.round(carbonRisk * 10) / 10,
      socialRisk: Math.round(socialRisk * 10) / 10,
      governanceRisk: Math.round(governanceRisk * 10) / 10,
      overallRisk,
      keyRisks,
    };
  }
}

export default new ESGImpactEngine();
